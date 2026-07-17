import { createHash, randomUUID } from "node:crypto"; // 第69天：引入哈希与 UUID 工具用于内容指纹、对象元数据和任务标识。
import { RedisLockProvider } from "@/lib/lock/redis-lock-provider"; // 第69天：引入真实 Redis 分布式锁实现保护文档级索引。
import type { AcquireLockInput, ExtendLockInput, LockExplorerSnapshot, LockInfo, LockProvider, LockToken } from "@/lib/lock/lock-types"; // 第69天：引入统一锁协议与治理快照类型。
import { RedisClient } from "@/lib/redis/redis-client"; // 第69天：引入统一 Redis 客户端实现知识索引等待队列。
import { ObjectStorageClient } from "@/lib/storage/object-storage-client"; // 第69天：引入统一对象存储客户端保存和读取原始文档。
import type { StorageObjectMetadata } from "@/lib/storage/storage-types"; // 第69天：引入对象存储元数据类型连接知识文档与原始文件。
import type { IndexManifest, KnowledgeDeleteJobPayload, KnowledgeIndexJobPayload, KnowledgeJob, KnowledgeJobType, ProductionKnowledgeBase, ProductionKnowledgeChunk, ProductionKnowledgeDocument, ProductionKnowledgeVector } from "@/lib/knowledge/production-knowledge-types"; // 第69天：引入生产知识仓储、队列与索引所需领域类型。
function clone<T>(value: T): T { return structuredClone(value); } // 第69天：使用结构化复制保护仓储内部状态不被调用方直接修改。
function storageEtag(content: string): string { return createHash("sha256").update(content).digest("hex"); } // 第69天：生成对象存储教学实现使用的稳定 SHA256 ETag。
export interface KnowledgeObjectStorage { // 第69天：定义生产知识服务依赖的最小对象存储协议。
  readonly backend: string; // 第69天：暴露当前对象存储后端说明供治理台展示。
  uploadDocument(objectKey: string, content: string, mimeType: string): Promise<StorageObjectMetadata>; // 第69天：上传原始知识文档并返回稳定元数据引用。
  downloadText(metadata: StorageObjectMetadata): Promise<string>; // 第69天：按元数据下载原始知识文档正文。
  delete(metadata: StorageObjectMetadata): Promise<boolean>; // 第69天：删除两阶段删除流程中的原始对象。
  exists(metadata: StorageObjectMetadata): Promise<boolean>; // 第69天：检查一致性扫描中的原始对象是否存在。
} // 第69天：结束生产知识对象存储协议定义。
export class ObjectStorageKnowledgeAdapter implements KnowledgeObjectStorage { // 第69天：把既有 ObjectStorageClient 适配为生产知识对象存储协议。
  readonly backend: string; // 第69天：保存对象存储提供方说明。
  constructor(private readonly client: ObjectStorageClient) { this.backend = client.kind; } // 第69天：注入统一对象存储客户端并记录当前 Provider 类型。
  async uploadDocument(objectKey: string, content: string, mimeType: string): Promise<StorageObjectMetadata> { return await this.client.upload({ objectKey, body: content, contentType: mimeType, type: "knowledge" }); } // 第69天：使用业务提供的稳定对象键上传知识文档。
  async downloadText(metadata: StorageObjectMetadata): Promise<string> { return await this.client.downloadText(metadata.bucket, metadata.objectKey); } // 第69天：按 Bucket 和 Object Key 下载 UTF-8 正文。
  async delete(metadata: StorageObjectMetadata): Promise<boolean> { return await this.client.delete(metadata.bucket, metadata.objectKey); } // 第69天：删除对象文件及其元数据旁路记录。
  async exists(metadata: StorageObjectMetadata): Promise<boolean> { return await this.client.exists(metadata.bucket, metadata.objectKey); } // 第69天：检查对象文件是否仍然存在。
} // 第69天：结束统一对象存储适配器实现。
export class InMemoryKnowledgeObjectStorage implements KnowledgeObjectStorage { // 第69天：实现端到端测试使用的内存对象存储隔离外部文件系统。
  readonly backend = "memory-object-storage"; // 第69天：标记当前对象存储后端为内存教学实现。
  private readonly objects = new Map<string, { content: string; metadata: StorageObjectMetadata }>(); // 第69天：按 Bucket 和 Object Key 保存正文与元数据。
  constructor(private readonly bucket = "day69-test") {} // 第69天：允许测试覆盖默认 Bucket 名称。
  async uploadDocument(objectKey: string, content: string, mimeType: string): Promise<StorageObjectMetadata> { const now = Date.now(); const metadata: StorageObjectMetadata = { bucket: this.bucket, objectKey, size: Buffer.byteLength(content), etag: storageEtag(content), contentType: mimeType, type: "knowledge", lastModified: now }; this.objects.set(`${this.bucket}/${objectKey}`, { content, metadata }); return clone(metadata); } // 第69天：在内存中保存正文并返回符合对象存储协议的元数据。
  async downloadText(metadata: StorageObjectMetadata): Promise<string> { const item = this.objects.get(`${metadata.bucket}/${metadata.objectKey}`); if (!item) throw new Error(`对象不存在：${metadata.objectKey}`); return item.content; } // 第69天：读取内存对象正文并在缺失时抛出明确错误。
  async delete(metadata: StorageObjectMetadata): Promise<boolean> { return this.objects.delete(`${metadata.bucket}/${metadata.objectKey}`); } // 第69天：从内存对象表删除目标文件。
  async exists(metadata: StorageObjectMetadata): Promise<boolean> { return this.objects.has(`${metadata.bucket}/${metadata.objectKey}`); } // 第69天：检查内存对象表是否包含目标文件。
} // 第69天：结束内存对象存储实现。
export class ProductionKnowledgeRepository { // 第69天：实现生产知识平台元数据、片段、向量与索引清单统一仓储。
  private readonly knowledgeBases = new Map<string, ProductionKnowledgeBase>(); // 第69天：按标识保存生产知识库。
  private readonly documents = new Map<string, ProductionKnowledgeDocument>(); // 第69天：按标识保存生产知识文档。
  private readonly manifests = new Map<string, IndexManifest>(); // 第69天：按文档和版本复合键保存索引清单。
  private readonly chunks = new Map<string, ProductionKnowledgeChunk>(); // 第69天：按标识保存全部版本的知识片段。
  private readonly vectors = new Map<string, ProductionKnowledgeVector>(); // 第69天：按标识保存全部版本的向量记录。
  saveKnowledgeBase(item: ProductionKnowledgeBase): ProductionKnowledgeBase { this.knowledgeBases.set(item.id, clone(item)); return clone(item); } // 第69天：新增或更新生产知识库并返回防御性副本。
  getKnowledgeBase(id: string): ProductionKnowledgeBase | undefined { const item = this.knowledgeBases.get(id); return item ? clone(item) : undefined; } // 第69天：按标识读取生产知识库。
  listKnowledgeBases(): ProductionKnowledgeBase[] { return [...this.knowledgeBases.values()].map(clone).sort((left, right) => right.updatedAt - left.updatedAt); } // 第69天：按更新时间倒序列出全部生产知识库。
  saveDocument(item: ProductionKnowledgeDocument): ProductionKnowledgeDocument { this.documents.set(item.id, clone(item)); return clone(item); } // 第69天：新增或更新生产知识文档并返回副本。
  getDocument(id: string): ProductionKnowledgeDocument | undefined { const item = this.documents.get(id); return item ? clone(item) : undefined; } // 第69天：按标识读取生产知识文档。
  listDocuments(knowledgeBaseId?: string): ProductionKnowledgeDocument[] { return [...this.documents.values()].filter((item) => !knowledgeBaseId || item.knowledgeBaseId === knowledgeBaseId).map(clone).sort((left, right) => right.updatedAt - left.updatedAt); } // 第69天：按可选知识库过滤并倒序列出文档。
  manifestKey(documentId: string, version: number): string { return `${documentId}:${version}`; } // 第69天：生成文档和索引版本唯一复合键。
  saveManifest(item: IndexManifest): IndexManifest { this.manifests.set(this.manifestKey(item.documentId, item.version), clone(item)); return clone(item); } // 第69天：新增或更新索引清单。
  getManifest(documentId: string, version: number): IndexManifest | undefined { const item = this.manifests.get(this.manifestKey(documentId, version)); return item ? clone(item) : undefined; } // 第69天：按文档和版本读取索引清单。
  listManifests(documentId?: string): IndexManifest[] { return [...this.manifests.values()].filter((item) => !documentId || item.documentId === documentId).map(clone).sort((left, right) => right.startedAt - left.startedAt); } // 第69天：按可选文档过滤并倒序列出索引清单。
  deleteManifests(documentId: string): string[] { const removed: string[] = []; for (const [key, item] of this.manifests) if (item.documentId === documentId) { this.manifests.delete(key); removed.push(item.id); } return removed; } // 第69天：删除文档全部索引清单并返回已删除标识。
  saveChunks(items: ProductionKnowledgeChunk[]): ProductionKnowledgeChunk[] { for (const item of items) this.chunks.set(item.id, clone(item)); return items.map(clone); } // 第69天：批量写入一个索引版本的知识片段。
  listChunks(filter: { knowledgeBaseId?: string; documentId?: string; indexVersion?: number; status?: ProductionKnowledgeChunk["status"] } = {}): ProductionKnowledgeChunk[] { return [...this.chunks.values()].filter((item) => (!filter.knowledgeBaseId || item.knowledgeBaseId === filter.knowledgeBaseId) && (!filter.documentId || item.documentId === filter.documentId) && (filter.indexVersion === undefined || item.indexVersion === filter.indexVersion) && (!filter.status || item.status === filter.status)).map(clone); } // 第69天：按知识库、文档、版本和状态组合过滤片段。
  updateChunkStatus(documentId: string, indexVersion: number, status: ProductionKnowledgeChunk["status"]): void { for (const [id, item] of this.chunks) if (item.documentId === documentId && item.indexVersion === indexVersion) this.chunks.set(id, { ...item, status }); } // 第69天：批量更新指定文档索引版本片段状态。
  deleteChunks(documentId: string): string[] { const removed: string[] = []; for (const [id, item] of this.chunks) if (item.documentId === documentId) { this.chunks.delete(id); removed.push(id); } return removed; } // 第69天：删除文档全部片段并返回已删除标识。
  deleteChunkIds(ids: string[]): string[] { const removed: string[] = []; for (const id of ids) if (this.chunks.delete(id)) removed.push(id); return removed; } // 第69天：按片段标识删除一致性检查确认安全的孤儿片段。
  saveVectors(items: ProductionKnowledgeVector[]): ProductionKnowledgeVector[] { for (const item of items) this.vectors.set(item.id, clone(item)); return items.map(clone); } // 第69天：批量写入一个索引版本的向量记录。
  listVectors(filter: { knowledgeBaseId?: string; documentId?: string; indexVersion?: number; status?: ProductionKnowledgeVector["status"] } = {}): ProductionKnowledgeVector[] { return [...this.vectors.values()].filter((item) => (!filter.knowledgeBaseId || item.knowledgeBaseId === filter.knowledgeBaseId) && (!filter.documentId || item.documentId === filter.documentId) && (filter.indexVersion === undefined || item.indexVersion === filter.indexVersion) && (!filter.status || item.status === filter.status)).map(clone); } // 第69天：按知识库、文档、版本和状态组合过滤向量。
  updateVectorStatus(documentId: string, indexVersion: number, status: ProductionKnowledgeVector["status"]): void { for (const [id, item] of this.vectors) if (item.documentId === documentId && item.indexVersion === indexVersion) this.vectors.set(id, { ...item, status }); } // 第69天：批量更新指定文档索引版本向量状态。
  deleteVectors(documentId: string): string[] { const removed: string[] = []; for (const [id, item] of this.vectors) if (item.documentId === documentId) { this.vectors.delete(id); removed.push(id); } return removed; } // 第69天：删除文档全部向量并返回已删除标识。
  deleteVectorIds(ids: string[]): string[] { const removed: string[] = []; for (const id of ids) if (this.vectors.delete(id)) removed.push(id); return removed; } // 第69天：按向量标识删除一致性检查确认安全的孤儿向量。
} // 第69天：结束生产知识统一仓储实现。
export interface KnowledgeJobQueue { // 第69天：定义生产知识服务依赖的异步任务队列协议。
  readonly backend: string; // 第69天：暴露 Redis Queue 或内存降级后端说明。
  enqueue(type: KnowledgeJobType, payload: KnowledgeIndexJobPayload | KnowledgeDeleteJobPayload, idempotencyKey: string): Promise<KnowledgeJob>; // 第69天：把索引或删除任务异步写入等待队列。
  claimNext(): Promise<KnowledgeJob | undefined>; // 第69天：由 Indexer Worker 或 Delete Worker 认领下一任务。
  save(job: KnowledgeJob): Promise<KnowledgeJob>; // 第69天：持久化任务运行状态和结果摘要。
  list(): Promise<KnowledgeJob[]>; // 第69天：列出治理台需要展示的全部知识任务。
} // 第69天：结束知识异步任务队列协议定义。
export class InMemoryKnowledgeJobQueue implements KnowledgeJobQueue { // 第69天：实现测试和 Redis 故障降级使用的内存异步队列。
  readonly backend: string = "memory-queue"; // 第69天：标记当前队列后端为内存实现并允许 Redis 子类覆盖说明。
  protected readonly jobs = new Map<string, KnowledgeJob>(); // 第69天：按任务标识保存全部任务状态。
  async enqueue(type: KnowledgeJobType, payload: KnowledgeIndexJobPayload | KnowledgeDeleteJobPayload, idempotencyKey: string): Promise<KnowledgeJob> { const now = Date.now(); const job: KnowledgeJob = { id: `knowledge-job-${randomUUID()}`, type, status: "queued", payload: clone(payload), idempotencyKey, attempts: 0, createdAt: now, updatedAt: now }; this.jobs.set(job.id, job); return clone(job); } // 第69天：创建等待任务并保存到内存任务表。
  async claimNext(): Promise<KnowledgeJob | undefined> { const current = [...this.jobs.values()].filter((item) => item.status === "queued").sort((left, right) => left.createdAt - right.createdAt)[0]; if (!current) return undefined; const now = Date.now(); const running: KnowledgeJob = { ...current, status: "running", attempts: current.attempts + 1, startedAt: now, updatedAt: now }; this.jobs.set(running.id, running); return clone(running); } // 第69天：按先进先出顺序认领一个等待任务并标记运行中。
  async save(job: KnowledgeJob): Promise<KnowledgeJob> { this.jobs.set(job.id, clone(job)); return clone(job); } // 第69天：保存 Worker 更新后的任务状态。
  async list(): Promise<KnowledgeJob[]> { return [...this.jobs.values()].map(clone).sort((left, right) => right.createdAt - left.createdAt); } // 第69天：按创建时间倒序返回任务快照。
} // 第69天：结束内存知识任务队列实现。
export class RedisKnowledgeJobQueue extends InMemoryKnowledgeJobQueue { // 第69天：实现 Redis List 优先且故障自动降级的知识任务队列。
  readonly backend = "redis-list-with-memory-fallback"; // 第69天：说明队列优先使用 Redis List 并保留内存降级能力。
  private readonly waitingKey = "queue:knowledge:waiting"; // 第69天：定义知识任务 Redis 等待队列 Key。
  constructor(private readonly client = new RedisClient({ keyPrefix: "ollama:day69:", operationTimeoutMs: 300 })) { super(); } // 第69天：创建独立 Day69 命名空间和短超时 Redis 客户端。
  override async enqueue(type: KnowledgeJobType, payload: KnowledgeIndexJobPayload | KnowledgeDeleteJobPayload, idempotencyKey: string): Promise<KnowledgeJob> { const job = await super.enqueue(type, payload, idempotencyKey); await this.client.rpush(this.waitingKey, JSON.stringify(job)).catch(() => 0); return job; } // 第69天：先确保内存降级可用，再尽力把任务写入 Redis List。
  override async claimNext(): Promise<KnowledgeJob | undefined> { const memoryJob = await super.claimNext(); if (memoryJob) { const serialized = JSON.stringify({ ...memoryJob, status: "queued", attempts: memoryJob.attempts - 1, startedAt: undefined, updatedAt: memoryJob.createdAt }); const waiting = await this.client.lrange(this.waitingKey, 0, -1).catch(() => []); const match = waiting.find((item) => { try { return (JSON.parse(item) as KnowledgeJob).id === memoryJob.id; } catch { return false; } }); if (match) await this.client.lrem(this.waitingKey, 1, match).catch(() => 0); void serialized; return memoryJob; } const waiting = await this.client.lrange(this.waitingKey, 0, 0).catch(() => []); if (!waiting[0]) return undefined; try { const parsed = JSON.parse(waiting[0]) as KnowledgeJob; this.jobs.set(parsed.id, parsed); await this.client.lrem(this.waitingKey, 1, waiting[0]).catch(() => 0); return await super.claimNext(); } catch { await this.client.lrem(this.waitingKey, 1, waiting[0]).catch(() => 0); return undefined; } } // 第69天：优先认领进程内任务，必要时从 Redis 恢复等待任务并去除损坏载荷。
} // 第69天：结束 Redis 知识任务队列实现。
export class InMemoryKnowledgeLockProvider implements LockProvider { // 第69天：实现端到端测试与 Redis 故障降级使用的内存锁提供者。
  private readonly locks = new Map<string, LockToken & { createdAt: number; renewCount: number }>(); // 第69天：按逻辑 Key 保存锁令牌、创建时间与续期次数。
  async acquire(input: AcquireLockInput): Promise<LockToken | null> { const now = Date.now(); const existing = this.locks.get(input.key); if (existing && existing.expiresAt > now) return null; const token = { key: input.key, owner: input.owner, expiresAt: now + (input.ttlMs ?? 30_000) }; this.locks.set(input.key, { ...token, createdAt: now, renewCount: 0 }); return clone(token); } // 第69天：在锁未被有效持有时创建带 TTL 的内存锁。
  async release(token: LockToken): Promise<boolean> { const existing = this.locks.get(token.key); if (!existing || existing.owner !== token.owner) return false; return this.locks.delete(token.key); } // 第69天：仅允许锁持有者释放内存锁。
  async extend(token: LockToken, input: ExtendLockInput = {}): Promise<LockToken | null> { const existing = this.locks.get(token.key); if (!existing || existing.owner !== token.owner) return null; const next = { ...existing, expiresAt: Date.now() + (input.ttlMs ?? 30_000), renewCount: existing.renewCount + 1 }; this.locks.set(token.key, next); return { key: next.key, owner: next.owner, expiresAt: next.expiresAt }; } // 第69天：仅允许锁持有者刷新 TTL 并累计续期次数。
  async isLocked(key: string): Promise<boolean> { const existing = this.locks.get(key); if (!existing) return false; if (existing.expiresAt <= Date.now()) { this.locks.delete(key); return false; } return true; } // 第69天：检查内存锁是否存在且未过期。
  async forceUnlock(key: string): Promise<boolean> { return this.locks.delete(key); } // 第69天：为治理工具提供谨慎使用的强制解锁能力。
  async snapshot(): Promise<LockExplorerSnapshot> { const now = Date.now(); const locks: LockInfo[] = [...this.locks.values()].filter((item) => item.expiresAt > now).map((item) => ({ key: item.key, owner: item.owner, ttlMs: item.expiresAt - now, createdAt: item.createdAt, expiresAt: item.expiresAt, renewCount: item.renewCount })); return { backend: "redis-string", namespace: "day69-memory-lock-fallback", locks, metrics: { totalLocks: locks.length, acquireSuccess: locks.length, acquireFailure: 0, avgWaitTime: 0, renewCount: locks.reduce((sum, item) => sum + item.renewCount, 0), expiredLocks: 0 }, operations: [], generatedAt: now }; } // 第69天：返回与 Redis Lock Explorer 兼容的内存锁快照。
} // 第69天：结束内存知识锁提供者实现。
export class ResilientKnowledgeLockProvider implements LockProvider { // 第69天：实现 Redis 分布式锁优先且连接失败自动降级的锁提供者。
  private readonly fallback = new InMemoryKnowledgeLockProvider(); // 第69天：创建 Redis 不可用时使用的内存锁降级实现。
  private readonly fallbackOwners = new Set<string>(); // 第69天：记录由降级实现签发的锁持有者便于正确释放。
  constructor(private readonly primary = new RedisLockProvider()) {} // 第69天：允许注入真实 Redis 锁实现或测试替身。
  async acquire(input: AcquireLockInput): Promise<LockToken | null> { try { return await this.primary.acquire(input); } catch { const token = await this.fallback.acquire(input); if (token) this.fallbackOwners.add(token.owner); return token; } } // 第69天：Redis 异常时才降级，正常的锁竞争失败不会被绕过。
  async release(token: LockToken): Promise<boolean> { if (this.fallbackOwners.has(token.owner)) { this.fallbackOwners.delete(token.owner); return await this.fallback.release(token); } try { return await this.primary.release(token); } catch { return false; } } // 第69天：根据签发来源释放锁并避免跨后端误删。
  async extend(token: LockToken, input?: ExtendLockInput): Promise<LockToken | null> { if (this.fallbackOwners.has(token.owner)) return await this.fallback.extend(token, input); try { return await this.primary.extend(token, input); } catch { return null; } } // 第69天：在原锁后端执行续期并安全处理 Redis 故障。
  async isLocked(key: string): Promise<boolean> { try { return await this.primary.isLocked(key); } catch { return await this.fallback.isLocked(key); } } // 第69天：Redis 不可用时读取内存降级锁状态。
  async forceUnlock(key: string): Promise<boolean> { try { return await this.primary.forceUnlock(key); } catch { return await this.fallback.forceUnlock(key); } } // 第69天：Redis 不可用时允许治理台清理降级锁。
  async snapshot(): Promise<LockExplorerSnapshot> { try { return await this.primary.snapshot(); } catch { return await this.fallback.snapshot(); } } // 第69天：优先展示真实 Redis 锁快照并在故障时展示降级状态。
} // 第69天：结束弹性知识锁提供者实现。
export function deterministicEmbedding(text: string, dimension = 24): number[] { const vector = Array.from({ length: dimension }, () => 0); for (const [index, character] of [...text.toLowerCase()].entries()) { const codePoint = character.codePointAt(0) ?? 0; vector[(codePoint + index) % dimension] += 1 + (codePoint % 7) / 10; } const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1; return vector.map((value) => value / norm); } // 第69天：生成无需外部模型即可重复验证权限、版本和检索流程的确定性向量。
export function cosineSimilarity(left: number[], right: number[]): number { const length = Math.min(left.length, right.length); let dot = 0; let leftNorm = 0; let rightNorm = 0; for (let index = 0; index < length; index += 1) { dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2; } return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0; } // 第69天：计算生产检索教学实现使用的余弦相似度。
export function contentHash(content: string): string { return createHash("sha256").update(content.trim()).digest("hex"); } // 第69天：生成文档或片段的稳定正文哈希。
export function safeObjectName(title: string): string { return title.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, "-").replace(/-+/g, "-") || "knowledge.txt"; } // 第69天：把文档标题转换为对象存储可安全使用的文件名。
