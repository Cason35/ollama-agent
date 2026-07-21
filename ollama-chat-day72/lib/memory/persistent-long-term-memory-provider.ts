import type { ResultSetHeader, RowDataPacket } from "mysql2"; // 第68天：引入 MySQL 查询结果类型以安全映射生产记忆表。
import { pool } from "@/lib/db/mysql"; // 第68天：复用项目服务端 MySQL 连接池保存长期记忆正文与元数据。
import { computeQueryEmbedding } from "@/lib/cache/query-embedding"; // 第68天：引入确定性 Embedding 生成器作为本地 VectorStore 索引输入。
import type { MemoryProvider, MemorySearchInput, MemorySearchResult, ProductionMemoryItem, ProductionMemoryScope } from "@/lib/memory/production-memory-types"; // 第68天：引入记忆 Provider、检索和生产记忆条目类型。
import { cloneProductionMemory, isExpiredMemory, scoreMemory } from "@/lib/memory/production-memory-utils"; // 第68天：引入记忆复制、过期判断和统一评分工具。
type ProductionMemoryRow = RowDataPacket & { id: string; scope: ProductionMemoryScope; scope_id: string; type: ProductionMemoryItem["type"]; content: string; importance: number; confidence: number; status: ProductionMemoryItem["status"]; source_json: string; tags_json: string; version: number; created_at: number; updated_at: number; expires_at: number | null; last_accessed_at: number | null; access_count: number; pinned: number; consolidated_from_json: string }; // 第68天：定义 MySQL 行到生产记忆对象所需的全部列。
export type ProductionMemoryMetadataStore = { // 第68天：定义 MySQL 与内存降级实现共享的元数据存储协议。
  readonly kind: "mysql" | "memory-fallback"; // 第68天：标记当前元数据存储后端类型。
  upsert(item: ProductionMemoryItem): Promise<void>; // 第68天：声明新增或覆盖生产记忆行的能力。
  get(id: string): Promise<ProductionMemoryItem | null>; // 第68天：声明按标识读取生产记忆行的能力。
  list(): Promise<ProductionMemoryItem[]>; // 第68天：声明列出全部生产记忆行的能力。
}; // 第68天：结束生产记忆元数据存储协议定义。
export class InMemoryProductionMemoryMetadataStore implements ProductionMemoryMetadataStore { // 第68天：实现测试和 MySQL 故障降级使用的内存元数据存储。
  readonly kind = "memory-fallback" as const; // 第68天：声明该实现代表内存降级后端。
  private readonly items = new Map<string, ProductionMemoryItem>(); // 第68天：按唯一标识保存生产记忆条目。
  async upsert(item: ProductionMemoryItem): Promise<void> { this.items.set(item.id, cloneProductionMemory(item)); } // 第68天：写入生产记忆防御性副本。
  async get(id: string): Promise<ProductionMemoryItem | null> { const item = this.items.get(id); return item ? cloneProductionMemory(item) : null; } // 第68天：命中时返回记忆副本，未命中时返回空值。
  async list(): Promise<ProductionMemoryItem[]> { return Array.from(this.items.values()).map(cloneProductionMemory).sort((left, right) => right.updatedAt - left.updatedAt); } // 第68天：复制并按更新时间倒序返回全部记忆。
} // 第68天：结束内存元数据存储实现。
export class MysqlProductionMemoryMetadataStore implements ProductionMemoryMetadataStore { // 第68天：实现使用 MySQL 可靠保存生产记忆正文、治理状态和审计字段的存储。
  readonly kind = "mysql" as const; // 第68天：声明该实现代表真实 MySQL 后端。
  private initialized = false; // 第68天：记录生产记忆表是否已经完成惰性创建。
  private readonly configured = Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER); // 第68天：在没有 MySQL 基础配置时快速触发内存降级而不等待网络超时。
  async upsert(item: ProductionMemoryItem): Promise<void> { // 第68天：新增或更新一条生产记忆 MySQL 记录。
    await this.ensureTable(); // 第68天：首次写入前确保生产记忆表存在。
    await pool.execute<ResultSetHeader>("INSERT INTO production_memories (id, scope, scope_id, type, content, importance, confidence, status, source_json, tags_json, version, created_at, updated_at, expires_at, last_accessed_at, access_count, pinned, consolidated_from_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE scope = VALUES(scope), scope_id = VALUES(scope_id), type = VALUES(type), content = VALUES(content), importance = VALUES(importance), confidence = VALUES(confidence), status = VALUES(status), source_json = VALUES(source_json), tags_json = VALUES(tags_json), version = VALUES(version), updated_at = VALUES(updated_at), expires_at = VALUES(expires_at), last_accessed_at = VALUES(last_accessed_at), access_count = VALUES(access_count), pinned = VALUES(pinned), consolidated_from_json = VALUES(consolidated_from_json)", [item.id, item.scope, item.scopeId, item.type, item.content, item.importance, item.confidence, item.status, JSON.stringify(item.source), JSON.stringify(item.tags), item.version, item.createdAt, item.updatedAt, item.expiresAt ?? null, item.lastAccessedAt ?? null, item.accessCount, item.pinned ? 1 : 0, JSON.stringify(item.consolidatedFrom)]); // 第68天：使用参数化 Upsert 保存正文、JSON 来源标签、生命周期和乐观锁字段。
  } // 第68天：结束 MySQL 生产记忆写入方法。
  async get(id: string): Promise<ProductionMemoryItem | null> { // 第68天：按唯一标识读取一条 MySQL 生产记忆。
    await this.ensureTable(); // 第68天：首次读取前确保生产记忆表存在。
    const [rows] = await pool.query<ProductionMemoryRow[]>("SELECT * FROM production_memories WHERE id = ? LIMIT 1", [id]); // 第68天：使用参数化查询读取目标记忆行。
    return rows[0] ? this.fromRow(rows[0]) : null; // 第68天：命中时映射为领域对象，否则返回空值。
  } // 第68天：结束 MySQL 单条生产记忆读取方法。
  async list(): Promise<ProductionMemoryItem[]> { // 第68天：列出 MySQL 中全部生产记忆供检索和治理使用。
    await this.ensureTable(); // 第68天：首次列表读取前确保生产记忆表存在。
    const [rows] = await pool.query<ProductionMemoryRow[]>("SELECT * FROM production_memories ORDER BY updated_at DESC"); // 第68天：按更新时间倒序读取全部生产记忆行。
    return rows.map((row) => this.fromRow(row)); // 第68天：把数据库行映射为生产记忆领域对象列表。
  } // 第68天：结束 MySQL 全部生产记忆读取方法。
  private async ensureTable(): Promise<void> { // 第68天：惰性创建符合任务字段要求的生产记忆表。
    if (this.initialized) return; // 第68天：已经初始化时跳过重复建表语句。
    if (!this.configured) throw new Error("未配置 MYSQL_HOST 或 MYSQL_USER，长期记忆切换到内存降级存储"); // 第68天：缺少连接配置时立即报告可解释降级原因。
    await pool.execute("CREATE TABLE IF NOT EXISTS production_memories (id VARCHAR(191) PRIMARY KEY, scope VARCHAR(32) NOT NULL, scope_id VARCHAR(191) NOT NULL, type VARCHAR(32) NOT NULL, content LONGTEXT NOT NULL, importance DOUBLE NOT NULL, confidence DOUBLE NOT NULL, status VARCHAR(32) NOT NULL, source_json LONGTEXT NOT NULL, tags_json LONGTEXT NOT NULL, version INT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, expires_at BIGINT NULL, last_accessed_at BIGINT NULL, access_count INT NOT NULL DEFAULT 0, pinned TINYINT(1) NOT NULL DEFAULT 0, consolidated_from_json LONGTEXT NOT NULL, INDEX idx_memory_scope (scope, scope_id), INDEX idx_memory_status (status), INDEX idx_memory_updated (updated_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); // 第68天：创建正文、作用域、生命周期、来源、标签、访问和并发版本字段及常用索引。
    this.initialized = true; // 第68天：标记建表完成以复用连接池并减少重复查询。
  } // 第68天：结束生产记忆表惰性初始化方法。
  private fromRow(row: ProductionMemoryRow): ProductionMemoryItem { // 第68天：把 MySQL 行转换为完整生产记忆领域对象。
    return { id: row.id, scope: row.scope, scopeId: row.scope_id, type: row.type, content: row.content, importance: Number(row.importance), confidence: Number(row.confidence), source: JSON.parse(row.source_json || "{}") as ProductionMemoryItem["source"], tags: JSON.parse(row.tags_json || "[]") as string[], status: row.status, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at), expiresAt: row.expires_at === null ? undefined : Number(row.expires_at), lastAccessedAt: row.last_accessed_at === null ? undefined : Number(row.last_accessed_at), accessCount: Number(row.access_count), version: Number(row.version), pinned: Boolean(row.pinned), consolidatedFrom: JSON.parse(row.consolidated_from_json || "[]") as string[] }; // 第68天：恢复正文、JSON 字段、时间戳、访问统计、固定状态和版本号。
  } // 第68天：结束 MySQL 行映射方法。
} // 第68天：结束 MySQL 生产记忆元数据存储实现。
type ProductionMemoryVectorRecord = { id: string; embedding: number[]; metadata: { memoryId: string; scope: ProductionMemoryScope; scopeId: string; type: ProductionMemoryItem["type"]; status: ProductionMemoryItem["status"] }; updatedAt: number }; // 第68天：定义 VectorStore 保存的 Embedding 与最小过滤元数据结构。
export class ProductionMemoryVectorStore { // 第68天：实现生产长期记忆使用的本地可替换 VectorStore。
  private readonly records = new Map<string, ProductionMemoryVectorRecord>(); // 第68天：按记忆标识保存向量记录和过滤元数据。
  private queryCount = 0; // 第68天：累计向量检索次数供可观察性使用。
  async upsert(item: ProductionMemoryItem): Promise<void> { this.records.set(item.id, { id: item.id, embedding: computeQueryEmbedding(item.content), metadata: { memoryId: item.id, scope: item.scope, scopeId: item.scopeId, type: item.type, status: item.status }, updatedAt: item.updatedAt }); } // 第68天：生成 Embedding 并同步保存作用域、类型和状态元数据。
  async delete(id: string): Promise<void> { this.records.delete(id); } // 第68天：从向量索引删除指定生产记忆记录。
  async query(query: string, topK: number): Promise<Array<{ id: string; score: number }>> { // 第68天：执行生产记忆向量近邻查询。
    this.queryCount += 1; // 第68天：累计一次向量检索调用。
    const queryEmbedding = computeQueryEmbedding(query); // 第68天：把检索文本转换为确定性查询向量。
    const { cosineSimilarity } = await import("@/lib/cache/query-embedding"); // 第68天：按需引入余弦相似度函数避免重复实现向量数学。
    return Array.from(this.records.values()).map((record) => ({ id: record.id, score: cosineSimilarity(queryEmbedding, record.embedding) })).sort((left, right) => right.score - left.score).slice(0, Math.max(1, topK)); // 第68天：计算、排序并返回指定数量的向量命中。
  } // 第68天：结束生产记忆向量查询方法。
  count(): number { return this.records.size; } // 第68天：返回当前 VectorStore 中的生产记忆向量数量。
  getQueryCount(): number { return this.queryCount; } // 第68天：返回当前 VectorStore 累计查询次数。
} // 第68天：结束生产记忆 VectorStore 实现。
export type PersistentLongTermMemoryProviderOptions = { // 第68天：定义持久化长期记忆 Provider 可注入配置。
  metadataStore?: ProductionMemoryMetadataStore; // 第68天：允许测试注入内存元数据存储或替换 MySQL 实现。
  fallbackStore?: ProductionMemoryMetadataStore; // 第68天：允许覆盖 MySQL 失败时的降级存储。
  vectorStore?: ProductionMemoryVectorStore; // 第68天：允许替换生产记忆 VectorStore 实现。
  now?: () => number; // 第68天：允许测试注入时间函数。
  onProviderError?: () => void; // 第68天：允许平台累计 MySQL 失败降级次数。
  onExpired?: (count: number) => void; // 第68天：允许平台累计过期长期记忆数量。
}; // 第68天：结束持久化长期记忆 Provider 配置定义。
export class PersistentLongTermMemoryProvider implements MemoryProvider { // 第68天：实现 MySQL 保存原始记录且 VectorStore 负责语义召回的长期记忆 Provider。
  readonly name = "PersistentLongTermMemoryProvider（持久化长期记忆提供者）"; // 第68天：定义注册中心和治理台使用的 Provider 名称。
  readonly vectorStore: ProductionMemoryVectorStore; // 第68天：公开只读 VectorStore 供治理指标读取。
  private metadataStore: ProductionMemoryMetadataStore; // 第68天：保存当前实际使用的 MySQL 或内存元数据存储。
  private readonly fallbackStore: ProductionMemoryMetadataStore; // 第68天：保存 MySQL 不可用时的内存降级存储。
  private readonly now: () => number; // 第68天：保存当前时间读取函数。
  private readonly onProviderError: () => void; // 第68天：保存 Provider 错误指标回调。
  private readonly onExpired: (count: number) => void; // 第68天：保存过期记忆指标回调。
  constructor(options: PersistentLongTermMemoryProviderOptions = {}) { // 第68天：构造 MySQL 与 VectorStore 协同的长期记忆 Provider。
    this.metadataStore = options.metadataStore ?? new MysqlProductionMemoryMetadataStore(); // 第68天：默认使用真实 MySQL 元数据存储。
    this.fallbackStore = options.fallbackStore ?? new InMemoryProductionMemoryMetadataStore(); // 第68天：默认创建内存降级元数据存储。
    this.vectorStore = options.vectorStore ?? new ProductionMemoryVectorStore(); // 第68天：默认创建本地生产记忆 VectorStore。
    this.now = options.now ?? (() => Date.now()); // 第68天：初始化当前时间函数。
    this.onProviderError = options.onProviderError ?? (() => undefined); // 第68天：初始化可选 Provider 错误指标回调。
    this.onExpired = options.onExpired ?? (() => undefined); // 第68天：初始化可选过期记忆指标回调。
  } // 第68天：结束持久化长期记忆 Provider 构造函数。
  getMetadataBackendKind(): "mysql" | "memory-fallback" { return this.metadataStore.kind; } // 第68天：向治理台返回当前实际使用的长期元数据后端。
  async add(item: ProductionMemoryItem): Promise<void> { // 第68天：把长期记忆同时写入 MySQL 元数据存储和 VectorStore。
    if (item.scope === "session") throw new Error("PersistentLongTermMemoryProvider 不接受 session 作用域记忆"); // 第68天：阻止短期会话快照重复写入长期存储。
    if (await this.get(item.id)) throw new Error(`长期记忆已存在：${item.id}`); // 第68天：阻止重复标识覆盖已有长期记忆。
    await this.run((store) => store.upsert(item)); // 第68天：把完整原始记录写入 MySQL 或降级元数据存储。
    await this.vectorStore.upsert(item); // 第68天：把正文 Embedding 和过滤元数据写入 VectorStore。
  } // 第68天：结束长期记忆新增方法。
  async get(id: string): Promise<ProductionMemoryItem | null> { const item = await this.run((store) => store.get(id)); return item ? cloneProductionMemory(item) : null; } // 第68天：按标识读取并复制长期记忆。
  async update(id: string, patch: Partial<ProductionMemoryItem>, expectedVersion?: number): Promise<ProductionMemoryItem> { // 第68天：更新长期记忆并同步 MySQL 与 VectorStore。
    const item = await this.get(id); // 第68天：读取目标长期记忆。
    if (!item) throw new Error(`长期记忆不存在：${id}`); // 第68天：目标不存在时抛出明确错误。
    if (expectedVersion !== undefined && item.version !== expectedVersion) throw new Error(`长期记忆版本冲突：期望 ${expectedVersion}，实际 ${item.version}`); // 第68天：拒绝旧版本并发覆盖新数据。
    const next: ProductionMemoryItem = { ...item, ...patch, id: item.id, scope: item.scope, scopeId: item.scopeId, source: patch.source ? { ...patch.source } : { ...item.source }, tags: patch.tags ? [...patch.tags] : [...item.tags], consolidatedFrom: patch.consolidatedFrom ? [...patch.consolidatedFrom] : [...item.consolidatedFrom], updatedAt: this.now(), version: item.version + 1 }; // 第68天：合并补丁、保留归属并递增乐观锁版本。
    await this.run((store) => store.upsert(next)); // 第68天：把更新后的原始记录写回 MySQL 或降级存储。
    if (next.status === "deleted") await this.vectorStore.delete(next.id); else await this.vectorStore.upsert(next); // 第68天：软删除时移除向量，其余状态同步更新向量元数据。
    return cloneProductionMemory(next); // 第68天：返回更新后的长期记忆副本。
  } // 第68天：结束长期记忆更新方法。
  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> { // 第68天：先使用 VectorStore 召回，再用统一公式重排长期与工作空间记忆。
    const all = await this.listAll(); // 第68天：读取 MySQL 原始记录供向量命中回查和作用域过滤。
    const now = this.now(); // 第68天：读取统一检索时间。
    const expired = all.filter((item) => isExpiredMemory(item, now) && item.status !== "deleted"); // 第68天：识别已到期但尚未软删除的长期记忆。
    for (const item of expired) await this.update(item.id, { status: "deleted" }); // 第68天：把过期长期记忆软删除并移除对应向量。
    if (expired.length > 0) this.onExpired(expired.length); // 第68天：累计本次清理的过期长期记忆数量。
    const candidates = all.filter((item) => !isExpiredMemory(item, now) && item.status === "active" && item.scope !== "session" && (!input.types || input.types.includes(item.type)) && this.matchesScope(item, input)); // 第68天：按生命周期、类型和用户会话工作空间智能体作用域过滤候选。
    for (const candidate of candidates) await this.vectorStore.upsert(candidate); // 第68天：进程重启后按 MySQL 原始记录惰性恢复本地 VectorStore 语义索引。
    const vectorMatches = await this.vectorStore.query(input.query, Math.max(candidates.length, input.topK ?? 5, 1)); // 第68天：通过 VectorStore 召回足够多的语义候选标识。
    const vectorIds = new Set(vectorMatches.map((match) => match.id)); // 第68天：把向量召回标识转换为快速查找集合。
    const recalled = candidates.filter((item) => vectorIds.has(item.id)); // 第68天：只保留同时满足作用域过滤和向量召回的候选记忆。
    const maxAccessCount = Math.max(1, ...recalled.map((item) => item.accessCount)); // 第68天：读取候选最大访问次数用于访问价值归一化。
    const minScore = input.minScore ?? 0.2; // 第68天：读取统一评分最低阈值并默认零点二。
    const topK = Math.max(1, input.topK ?? 5); // 第68天：读取最终返回上限并保证至少一条。
    const results = recalled.map((item) => ({ item, ...scoreMemory(item, input.query, now, maxAccessCount), provider: "persistent-long-term" as const })).filter((result) => result.finalScore >= minScore).sort((left, right) => right.finalScore - left.finalScore || right.item.updatedAt - left.item.updatedAt).slice(0, topK); // 第68天：应用统一五分量公式完成过滤、重排与截断。
    for (const result of results) result.item = await this.update(result.item.id, { accessCount: result.item.accessCount + 1, lastAccessedAt: now }); // 第68天：对真正命中的长期记忆递增访问统计并同步元数据。
    return results; // 第68天：返回带 Provider 来源和完整评分明细的长期记忆命中。
  } // 第68天：结束长期记忆统一检索方法。
  async archive(id: string): Promise<void> { await this.update(id, { status: "archived" }); } // 第68天：把目标长期记忆软归档并保留 MySQL 审计记录。
  async delete(id: string): Promise<void> { await this.update(id, { status: "deleted" }); } // 第68天：把目标长期记忆软删除并移除向量索引。
  async listByScope(scope: ProductionMemoryScope, scopeId: string): Promise<ProductionMemoryItem[]> { return (await this.listAll()).filter((item) => item.scope === scope && item.scopeId === scopeId); } // 第68天：列出指定长期或工作空间作用域的全部记忆。
  async listAll(): Promise<ProductionMemoryItem[]> { return (await this.run((store) => store.list())).map(cloneProductionMemory).sort((left, right) => right.updatedAt - left.updatedAt); } // 第68天：复制并按更新时间倒序返回全部长期记忆。
  private matchesScope(item: ProductionMemoryItem, input: MemorySearchInput): boolean { // 第68天：定义统一检索输入与生产记忆作用域的匹配规则。
    if (item.scope === "global") return true; // 第68天：全局记忆对所有运行时查询可见。
    if (item.scope === "user") return Boolean(input.userId && item.scopeId === input.userId); // 第68天：用户记忆只对同一用户查询可见。
    if (item.scope === "workspace") return Boolean(input.workspaceId && item.scopeId === input.workspaceId); // 第68天：工作空间记忆只对当前工作空间查询可见。
    if (item.scope === "agent") return Boolean(input.agentId && item.scopeId === input.agentId); // 第68天：智能体记忆只对同一智能体查询可见。
    return false; // 第68天：其他作用域不属于长期 Provider 检索范围。
  } // 第68天：结束生产记忆作用域匹配方法。
  private async run<T>(operation: (store: ProductionMemoryMetadataStore) => Promise<T>): Promise<T> { // 第68天：定义 MySQL 失败后自动切换到内存元数据存储的执行包装器。
    try { return await operation(this.metadataStore); } catch (error) { if (this.metadataStore.kind === "memory-fallback") throw error; this.onProviderError(); this.metadataStore = this.fallbackStore; return await operation(this.metadataStore); } // 第68天：MySQL 异常时累计指标、切换存储并重试同一操作。
  } // 第68天：结束长期元数据存储自动降级执行包装器。
} // 第68天：结束 PersistentLongTermMemoryProvider 实现。
