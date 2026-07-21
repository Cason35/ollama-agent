import { RedisClient } from "@/lib/redis/redis-client"; // 第68天：引入统一 Redis 客户端以持久化高频会话记忆。
import type { MemoryProvider, MemorySearchInput, MemorySearchResult, ProductionMemoryItem, ProductionMemoryScope } from "@/lib/memory/production-memory-types"; // 第68天：引入记忆 Provider 协议、检索和条目类型。
import { cloneProductionMemory, isExpiredMemory, scoreMemory } from "@/lib/memory/production-memory-utils"; // 第68天：引入记忆复制、过期判断和统一评分工具。
type SessionMemoryBackend = { // 第68天：定义 Redis 与测试内存适配器共享的最小键值协议。
  readonly kind: "redis" | "memory-fallback"; // 第68天：标记当前实际使用的存储后端。
  get(key: string): Promise<string | null>; // 第68天：声明读取 JSON 字符串的能力。
  set(key: string, value: string, ttlSeconds: number): Promise<void>; // 第68天：声明带 TTL 写入 JSON 字符串的能力。
  del(key: string): Promise<void>; // 第68天：声明删除会话键的能力。
  expire(key: string, ttlSeconds: number): Promise<void>; // 第68天：声明访问时刷新 TTL 的能力。
  keys(pattern: string): Promise<string[]>; // 第68天：声明治理台扫描当前命名空间键的能力。
}; // 第68天：结束会话记忆后端协议定义。
class RedisSessionBackend implements SessionMemoryBackend { // 第68天：实现调用真实 RedisClient 的会话记忆后端。
  readonly kind = "redis" as const; // 第68天：声明该适配器代表真实 Redis 后端。
  constructor(private readonly redis: RedisClient) {} // 第68天：通过构造函数注入统一 Redis 客户端。
  async get(key: string): Promise<string | null> { return await this.redis.get(key); } // 第68天：委托 RedisClient 读取逻辑键。
  async set(key: string, value: string, ttlSeconds: number): Promise<void> { await this.redis.set(key, value, ttlSeconds); } // 第68天：委托 RedisClient 写入并设置秒级 TTL。
  async del(key: string): Promise<void> { await this.redis.del(key); } // 第68天：委托 RedisClient 删除逻辑键。
  async expire(key: string, ttlSeconds: number): Promise<void> { await this.redis.expire(key, ttlSeconds); } // 第68天：委托 RedisClient 刷新逻辑键 TTL。
  async keys(pattern: string): Promise<string[]> { return await this.redis.keys(pattern); } // 第68天：委托 RedisClient 扫描 Day68 命名空间下的键。
} // 第68天：结束真实 Redis 会话后端实现。
export class InMemorySessionMemoryBackend implements SessionMemoryBackend { // 第68天：实现无 Redis 环境和自动化测试使用的 TTL 内存降级后端。
  readonly kind = "memory-fallback" as const; // 第68天：声明该适配器代表内存降级后端。
  private readonly values = new Map<string, { value: string; expiresAt: number }>(); // 第68天：按键保存 JSON 字符串与过期时间。
  constructor(private readonly now: () => number = () => Date.now()) {} // 第68天：允许测试注入时间函数验证 TTL 清理。
  async get(key: string): Promise<string | null> { // 第68天：实现带惰性过期清理的键读取。
    const entry = this.values.get(key); // 第68天：从 Map 读取目标键。
    if (!entry) return null; // 第68天：键不存在时返回空值。
    if (entry.expiresAt <= this.now()) { this.values.delete(key); return null; } // 第68天：键已过期时删除并返回空值。
    return entry.value; // 第68天：返回尚未过期的 JSON 字符串。
  } // 第68天：结束内存键读取方法。
  async set(key: string, value: string, ttlSeconds: number): Promise<void> { this.values.set(key, { value, expiresAt: this.now() + Math.max(1, ttlSeconds) * 1000 }); } // 第68天：写入值并根据 TTL 计算过期时间。
  async del(key: string): Promise<void> { this.values.delete(key); } // 第68天：从 Map 删除指定逻辑键。
  async expire(key: string, ttlSeconds: number): Promise<void> { const entry = this.values.get(key); if (entry) entry.expiresAt = this.now() + Math.max(1, ttlSeconds) * 1000; } // 第68天：键存在时刷新其过期时间。
  async keys(pattern: string): Promise<string[]> { // 第68天：实现治理台需要的简单星号模式扫描。
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern; // 第68天：把尾部星号模式转换为前缀匹配。
    const keys: string[] = []; // 第68天：初始化尚未过期的匹配键列表。
    for (const key of this.values.keys()) if ((await this.get(key)) !== null && key.startsWith(prefix)) keys.push(key); // 第68天：惰性清理过期键并收集匹配键。
    return keys.sort(); // 第68天：返回稳定排序后的逻辑键列表。
  } // 第68天：结束内存键扫描方法。
} // 第68天：结束 TTL 内存降级后端实现。
export type RedisSessionMemoryProviderOptions = { // 第68天：定义 Redis 会话记忆 Provider 可注入配置。
  backend?: SessionMemoryBackend; // 第68天：允许测试或调用方显式注入键值后端。
  fallbackBackend?: SessionMemoryBackend; // 第68天：允许覆盖 Redis 失败时使用的内存后端。
  ttlSeconds?: number; // 第68天：允许配置会话记忆 TTL，默认七天。
  maxItems?: number; // 第68天：允许配置每个会话最多保留的最近记忆数量。
  refreshTtlOnRead?: boolean; // 第68天：允许控制读取时是否刷新三个会话键的 TTL。
  now?: () => number; // 第68天：允许测试注入时间函数。
  onProviderError?: () => void; // 第68天：允许平台在 Redis 降级时累计 Provider 错误指标。
  onExpired?: (count: number) => void; // 第68天：允许平台累计清理的过期记忆数量。
}; // 第68天：结束 Redis 会话记忆 Provider 配置定义。
export class RedisSessionMemoryProvider implements MemoryProvider { // 第68天：实现使用 items、summary 和 meta 三类 Redis 键的会话记忆 Provider。
  readonly name = "RedisSessionMemoryProvider（Redis 会话记忆提供者）"; // 第68天：定义注册中心和治理台使用的 Provider 名称。
  readonly ttlSeconds: number; // 第68天：保存会话记忆秒级 TTL。
  private backend: SessionMemoryBackend; // 第68天：保存当前实际使用的 Redis 或内存后端。
  private readonly fallbackBackend: SessionMemoryBackend; // 第68天：保存 Redis 不可用时的内存降级后端。
  private readonly maxItems: number; // 第68天：保存每个会话最近记忆保留上限。
  private readonly refreshTtlOnRead: boolean; // 第68天：保存是否在读取时刷新 TTL。
  private readonly now: () => number; // 第68天：保存当前时间读取函数。
  private readonly onProviderError: () => void; // 第68天：保存 Provider 错误指标回调。
  private readonly onExpired: (count: number) => void; // 第68天：保存过期记忆指标回调。
  constructor(options: RedisSessionMemoryProviderOptions = {}) { // 第68天：构造真实 Redis 优先且支持内存降级的会话记忆 Provider。
    this.backend = options.backend ?? new RedisSessionBackend(new RedisClient({ keyPrefix: "ollama:day68:" })); // 第68天：默认使用隔离的 Day68 Redis 命名空间。
    this.fallbackBackend = options.fallbackBackend ?? new InMemorySessionMemoryBackend(options.now); // 第68天：默认创建带相同测试时钟的 TTL 内存后端。
    this.ttlSeconds = Math.max(1, Math.floor(options.ttlSeconds ?? 7 * 24 * 60 * 60)); // 第68天：把 TTL 规整为至少一秒并默认七天。
    this.maxItems = Math.max(1, Math.floor(options.maxItems ?? 50)); // 第68天：把会话最近记忆上限规整为至少一条。
    this.refreshTtlOnRead = options.refreshTtlOnRead ?? true; // 第68天：默认每次读取会话时刷新 TTL。
    this.now = options.now ?? (() => Date.now()); // 第68天：初始化当前时间函数。
    this.onProviderError = options.onProviderError ?? (() => undefined); // 第68天：初始化可选 Provider 错误指标回调。
    this.onExpired = options.onExpired ?? (() => undefined); // 第68天：初始化可选过期记忆指标回调。
  } // 第68天：结束 Redis 会话记忆 Provider 构造函数。
  getBackendKind(): "redis" | "memory-fallback" { return this.backend.kind; } // 第68天：向治理台返回当前实际使用的会话存储后端。
  getKeyPattern(): string { return "memory:session:{sessionId}:{items|summary|meta}"; } // 第68天：向治理台返回任务文档规定的 Redis 键约定。
  async add(item: ProductionMemoryItem): Promise<void> { // 第68天：新增一条会话记忆并维护三个 Redis 键。
    if (item.scope !== "session") throw new Error("RedisSessionMemoryProvider 只接受 session 作用域记忆"); // 第68天：阻止长期记忆误写入会话 Redis。
    const items = await this.readItems(item.scopeId); // 第68天：读取当前会话尚未过期的记忆列表。
    if (items.some((current) => current.id === item.id)) throw new Error(`会话记忆已存在：${item.id}`); // 第68天：阻止重复标识覆盖已有会话记忆。
    items.push(cloneProductionMemory(item)); // 第68天：把记忆副本追加到会话列表。
    await this.saveItems(item.scopeId, items); // 第68天：按最近更新时间截断并保存 items、summary 和 meta 键。
  } // 第68天：结束会话记忆新增方法。
  async get(id: string): Promise<ProductionMemoryItem | null> { // 第68天：按标识扫描全部会话记忆。
    const item = (await this.listAll()).find((current) => current.id === id); // 第68天：从治理快照中查找目标记忆。
    return item ? cloneProductionMemory(item) : null; // 第68天：命中时返回副本，未命中时返回空值。
  } // 第68天：结束会话记忆读取方法。
  async update(id: string, patch: Partial<ProductionMemoryItem>, expectedVersion?: number): Promise<ProductionMemoryItem> { // 第68天：更新会话记忆并执行乐观并发控制。
    const item = await this.get(id); // 第68天：查找目标会话记忆。
    if (!item) throw new Error(`会话记忆不存在：${id}`); // 第68天：目标不存在时抛出明确错误。
    if (expectedVersion !== undefined && item.version !== expectedVersion) throw new Error(`会话记忆版本冲突：期望 ${expectedVersion}，实际 ${item.version}`); // 第68天：拒绝过期版本覆盖新数据。
    const next: ProductionMemoryItem = { ...item, ...patch, id: item.id, scope: "session", scopeId: item.scopeId, source: patch.source ? { ...patch.source } : { ...item.source }, tags: patch.tags ? [...patch.tags] : [...item.tags], consolidatedFrom: patch.consolidatedFrom ? [...patch.consolidatedFrom] : [...item.consolidatedFrom], updatedAt: this.now(), version: item.version + 1 }; // 第68天：合并补丁并强制保留标识、作用域与递增版本。
    const items = await this.readItems(item.scopeId); // 第68天：读取目标会话完整列表。
    await this.saveItems(item.scopeId, items.map((current) => current.id === id ? next : current)); // 第68天：替换目标条目并更新三个 Redis 键。
    return cloneProductionMemory(next); // 第68天：返回更新后的记忆副本。
  } // 第68天：结束会话记忆更新方法。
  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> { // 第68天：执行会话记忆检索并应用统一五分量评分。
    const candidates = input.sessionId ? await this.listByScope("session", input.sessionId) : await this.listAll(); // 第68天：优先只读取当前会话，未提供会话时供治理测试扫描全部。
    const active = candidates.filter((item) => item.status === "active" && (!input.types || input.types.includes(item.type))); // 第68天：只让活动状态和指定类型记忆参与检索。
    const maxAccessCount = Math.max(1, ...active.map((item) => item.accessCount)); // 第68天：读取候选最大访问次数用于访问价值归一化。
    const now = this.now(); // 第68天：读取统一检索时间。
    const minScore = input.minScore ?? 0.2; // 第68天：读取统一评分最低阈值并默认零点二。
    const topK = Math.max(1, input.topK ?? 5); // 第68天：读取返回上限并保证至少一条。
    const results = active.map((item) => ({ item, ...scoreMemory(item, input.query, now, maxAccessCount), provider: "redis-session" as const })).filter((result) => result.finalScore >= minScore).sort((left, right) => right.finalScore - left.finalScore || right.item.updatedAt - left.item.updatedAt).slice(0, topK); // 第68天：计算、过滤、排序并截取最终会话记忆命中。
    for (const result of results) result.item = await this.update(result.item.id, { accessCount: result.item.accessCount + 1, lastAccessedAt: now }); // 第68天：对真正命中的记忆递增访问次数并刷新最近访问时间。
    return results; // 第68天：返回带 Provider 来源和评分明细的检索结果。
  } // 第68天：结束会话记忆检索方法。
  async archive(id: string): Promise<void> { await this.update(id, { status: "archived" }); } // 第68天：把目标会话记忆软归档并保留审计数据。
  async delete(id: string): Promise<void> { await this.update(id, { status: "deleted" }); } // 第68天：把目标会话记忆标记为软删除。
  async listByScope(scope: ProductionMemoryScope, scopeId: string): Promise<ProductionMemoryItem[]> { // 第68天：读取指定会话作用域下的全部非过期记忆。
    if (scope !== "session") return []; // 第68天：非会话作用域不属于该 Provider，直接返回空列表。
    return (await this.readItems(scopeId)).map(cloneProductionMemory); // 第68天：返回经过过期清理和防御性复制的会话记忆列表。
  } // 第68天：结束指定会话记忆列表方法。
  async listAll(): Promise<ProductionMemoryItem[]> { // 第68天：扫描全部 items 键生成治理台会话记忆快照。
    const keys = await this.run((backend) => backend.keys("memory:session:*")); // 第68天：扫描当前命名空间下所有会话键。
    const sessionIds = Array.from(new Set(keys.filter((key) => key.endsWith(":items")).map((key) => key.slice("memory:session:".length, -":items".length)))); // 第68天：从 items 键中提取并去重会话标识。
    const groups = await Promise.all(sessionIds.map(async (sessionId) => await this.readItems(sessionId))); // 第68天：并行读取每个会话尚未过期的记忆列表。
    return groups.flat().map(cloneProductionMemory).sort((left, right) => right.updatedAt - left.updatedAt); // 第68天：合并、复制并按更新时间倒序返回全部会话记忆。
  } // 第68天：结束全部会话记忆列表方法。
  private itemsKey(sessionId: string): string { return `memory:session:${sessionId}:items`; } // 第68天：生成任务文档规定的会话 items 键。
  private summaryKey(sessionId: string): string { return `memory:session:${sessionId}:summary`; } // 第68天：生成任务文档规定的会话 summary 键。
  private metaKey(sessionId: string): string { return `memory:session:${sessionId}:meta`; } // 第68天：生成任务文档规定的会话 meta 键。
  private async readItems(sessionId: string): Promise<ProductionMemoryItem[]> { // 第68天：读取、校验、清理并按需刷新会话 TTL。
    const raw = await this.run((backend) => backend.get(this.itemsKey(sessionId))); // 第68天：从当前后端读取会话 items JSON。
    const parsed = raw ? JSON.parse(raw) as ProductionMemoryItem[] : []; // 第68天：把不存在的键视为空列表并解析存在的 JSON。
    const now = this.now(); // 第68天：读取统一过期判断时间。
    const active = parsed.filter((item) => !isExpiredMemory(item, now)); // 第68天：过滤条目级 expiresAt 已到期的会话记忆。
    const expired = parsed.length - active.length; // 第68天：计算本次惰性清理的过期条目数。
    if (expired > 0) { this.onExpired(expired); await this.saveItems(sessionId, active); } // 第68天：累计过期指标并回写清理后的列表。
    else if (this.refreshTtlOnRead && raw) await this.refreshSessionTtl(sessionId); // 第68天：没有条目过期时按配置刷新三个会话键 TTL。
    return active.map(cloneProductionMemory); // 第68天：返回会话记忆副本列表。
  } // 第68天：结束会话记忆读取和过期清理方法。
  private async saveItems(sessionId: string, items: ProductionMemoryItem[]): Promise<void> { // 第68天：统一维护会话 items、summary 和 meta 三类键。
    const retained = [...items].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, this.maxItems); // 第68天：只保留最近更新的有限条会话记忆防止无限增长。
    const summary = retained.find((item) => item.type === "summary" && item.status === "active")?.content ?? ""; // 第68天：提取最新活动摘要作为独立 summary 键内容。
    const meta = { sessionId, itemCount: retained.length, updatedAt: this.now(), ttlSeconds: this.ttlSeconds }; // 第68天：构造便于治理和排障的会话元数据。
    await this.run(async (backend) => { await backend.set(this.itemsKey(sessionId), JSON.stringify(retained), this.ttlSeconds); await backend.set(this.summaryKey(sessionId), summary, this.ttlSeconds); await backend.set(this.metaKey(sessionId), JSON.stringify(meta), this.ttlSeconds); }); // 第68天：在同一后端依次写入三个带 TTL 的会话键。
  } // 第68天：结束会话三个键统一保存方法。
  private async refreshSessionTtl(sessionId: string): Promise<void> { // 第68天：定义访问时刷新会话三个键 TTL 的方法。
    await this.run(async (backend) => { await backend.expire(this.itemsKey(sessionId), this.ttlSeconds); await backend.expire(this.summaryKey(sessionId), this.ttlSeconds); await backend.expire(this.metaKey(sessionId), this.ttlSeconds); }); // 第68天：依次刷新 items、summary 和 meta 键的 TTL。
  } // 第68天：结束会话 TTL 刷新方法。
  private async run<T>(operation: (backend: SessionMemoryBackend) => Promise<T>): Promise<T> { // 第68天：定义真实 Redis 失败后自动切换到内存后端的执行包装器。
    try { return await operation(this.backend); } catch (error) { if (this.backend.kind === "memory-fallback") throw error; this.onProviderError(); this.backend = this.fallbackBackend; return await operation(this.backend); } // 第68天：真实 Redis 异常时累计指标、切换后端并重试同一操作。
  } // 第68天：结束会话后端自动降级执行包装器。
} // 第68天：结束 RedisSessionMemoryProvider 实现。
