import { computeQueryEmbedding, cosineSimilarity } from "@/lib/cache/query-embedding"; /* 第48天：引入查询向量计算与余弦相似度函数。 */
import { estimateTokenCount, estimateUsageCost } from "@/lib/usage/token-accounting"; /* 第48天：复用第47天的词元估算与费用估算，量化缓存节省。 */
import { createDefaultCacheStore, type CacheStore } from "@/lib/cache/cache-store"; /* 第58天：引入 CacheStore 抽象，让语义缓存可切换 MemoryCache 或 RedisCache。 */
import { CACHE_TTL_PRESET_MS, type CacheAddInput, type CacheEntry, type CacheEntrySummary, type CacheMetrics, type CacheSearchResult, type CacheTTLPolicy } from "@/lib/cache/cache-types"; /* 第48天：引入缓存条目、检索结果、指标与 TTL 类型。 */

const DEFAULT_THRESHOLD = 0.9; /* 第48天：定义判定缓存命中的默认相似度阈值，对应任务要求的 0.9。 */
const DEFAULT_MAX_ENTRIES = 50; /* 第48天：定义触发 LRU（最近最少使用）淘汰的默认容量上限。 */
const DEFAULT_TTL_POLICY: CacheTTLPolicy = "24h"; /* 第48天：定义新条目缺省使用的 TTL（存活时间）策略。 */

export type SemanticCacheOptions = { /* 第48天：定义构造语义缓存的可选配置。 */
  threshold?: number; /* 第48天：可覆盖命中阈值。 */
  maxEntries?: number; /* 第48天：可覆盖容量上限。 */
  defaultTtlPolicy?: CacheTTLPolicy; /* 第48天：可覆盖默认 TTL 策略。 */
  now?: () => number; /* 第48天：可注入时间函数，便于测试 TTL 过期逻辑。 */
  store?: CacheStore<CacheEntry>; /* 第58天：可注入 CacheStore（缓存存储），用于 Redis 持久化或测试内存隔离。 */
}; /* 第48天：结束语义缓存配置定义。 */

export class SemanticCache { /* 第48天：定义语义缓存核心类，让系统避免重复思考同一问题。 */
  private readonly entries = new Map<string, CacheEntry>(); /* 第48天：用 Map 作为内存向量存储保存全部缓存条目。 */
  private readonly threshold: number; /* 第48天：保存命中阈值。 */
  private readonly maxEntries: number; /* 第48天：保存容量上限。 */
  private readonly defaultTtlPolicy: CacheTTLPolicy; /* 第48天：保存默认 TTL 策略。 */
  private readonly now: () => number; /* 第48天：保存可注入的时间函数。 */
  private readonly store?: CacheStore<CacheEntry>; /* 第58天：保存可选 CacheStore（缓存存储），用于把 Semantic Cache 迁移到 Redis。 */
  private hydratedFromStore = false; /* 第58天：标记是否已经从外部 Store 水合过内存向量索引。 */
  private sequence = 0; /* 第48天：保存递增序号，保证缓存条目 ID 唯一。 */
  private totalQueries = 0; /* 第48天：累计检索次数。 */
  private hitCount = 0; /* 第48天：累计命中次数。 */
  private missCount = 0; /* 第48天：累计未命中次数。 */
  private savedTokens = 0; /* 第48天：累计因命中节省的词元数。 */
  private savedCost = 0; /* 第48天：累计因命中节省的费用。 */
  private savedLatencyTotal = 0; /* 第48天：累计因命中降低的延迟毫秒数。 */

  constructor(options: SemanticCacheOptions = {}) { /* 第48天：使用可选配置构造语义缓存。 */
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD; /* 第48天：初始化命中阈值。 */
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES); /* 第48天：初始化容量上限并保证至少为一。 */
    this.defaultTtlPolicy = options.defaultTtlPolicy ?? DEFAULT_TTL_POLICY; /* 第48天：初始化默认 TTL 策略。 */
    this.now = options.now ?? (() => Date.now()); /* 第48天：初始化时间函数，缺省使用真实时钟。 */
    this.store = options.store; /* 第58天：保存外部缓存存储实现，缺省保持纯内存同步行为。 */
  } /* 第48天：结束构造函数。 */

  getThreshold(): number { /* 第48天：定义读取命中阈值的方法，供前端展示。 */
    return this.threshold; /* 第48天：返回当前阈值。 */
  } /* 第48天：结束阈值读取方法。 */

  getBackendName(): string { /* 第58天：定义读取语义缓存后端名称的方法，供 Trace 和 Explorer 展示。 */
    return this.store?.backend ?? "memory"; /* 第58天：有外部 Store 时返回 Store 后端，否则返回进程内 memory。 */
  } /* 第58天：结束缓存后端名称读取方法。 */

  add(input: CacheAddInput): CacheEntry { /* 第48天：定义把未命中查询及其答案写入缓存的方法。 */
    const createdAt = this.now(); /* 第48天：读取写入时间作为创建时间。 */
    const ttlPolicy = input.ttlPolicy ?? this.defaultTtlPolicy; /* 第48天：确定条目使用的 TTL 策略。 */
    const ttlMs = ttlPolicy === "never" ? null : CACHE_TTL_PRESET_MS[ttlPolicy]; /* 第48天：根据策略换算存活毫秒数，never 表示永不过期。 */
    const expiresAt = ttlMs === null ? null : createdAt + ttlMs; /* 第48天：计算绝对过期时间。 */
    const inputTokens = estimateTokenCount(input.query); /* 第48天：估算查询输入词元数。 */
    const outputTokens = estimateTokenCount(input.answer); /* 第48天：估算答案输出词元数。 */
    const entry: CacheEntry = { /* 第48天：构造完整缓存条目。 */
      id: this.nextId(), /* 第48天：分配唯一标识。 */
      query: input.query.trim(), /* 第48天：保存归一化后的原始查询。 */
      embedding: computeQueryEmbedding(input.query), /* 第48天：保存查询向量供后续相似度检索。 */
      answer: input.answer, /* 第48天：保存可复用答案。 */
      metadata: { traceId: input.traceId, score: input.score ?? 0, createdAt }, /* 第48天：保存 Trace、质量分与创建时间元数据。 */
      hitCount: 0, /* 第48天：初始化命中次数为零。 */
      lastAccessedAt: createdAt, /* 第48天：把创建时间作为初始访问时间。 */
      ttlPolicy, /* 第48天：保存 TTL 策略。 */
      ttlMs, /* 第48天：保存存活毫秒数。 */
      expiresAt, /* 第48天：保存绝对过期时间。 */
      savedTokens: inputTokens + outputTokens, /* 第48天：预存命中可节省的总词元数。 */
      savedCost: estimateUsageCost("agent", inputTokens, outputTokens), /* 第48天：按智能体价格预存命中可节省的费用。 */
      genDurationMs: Math.max(1, Math.round(input.genDurationMs ?? 0)), /* 第48天：保存首次生成耗时用于估算延迟节省。 */
    }; /* 第48天：结束缓存条目构造。 */
    this.entries.set(entry.id, entry); /* 第48天：把条目写入内存向量存储。 */
    this.evictIfNeeded(); /* 第48天：写入后按需执行 LRU 淘汰。 */
    return entry; /* 第48天：返回新建条目。 */
  } /* 第48天：结束 add 方法。 */

  search(query: string): CacheSearchResult { /* 第48天：定义对查询执行相似度检索的方法。 */
    this.totalQueries += 1; /* 第48天：累计一次检索。 */
    this.purgeExpired(); /* 第48天：检索前清理过期条目，保证不会命中失效缓存。 */
    const queryEmbedding = computeQueryEmbedding(query); /* 第48天：计算当前查询向量。 */
    let best: CacheEntry | null = null; /* 第48天：保存当前最相似条目。 */
    let bestScore = 0; /* 第48天：保存当前最高相似度。 */
    for (const entry of this.entries.values()) { /* 第48天：遍历全部缓存条目。 */
      const score = cosineSimilarity(queryEmbedding, entry.embedding); /* 第48天：计算与历史查询的余弦相似度。 */
      if (score > bestScore) { bestScore = score; best = entry; } /* 第48天：保留相似度最高的条目。 */
    } /* 第48天：结束相似度遍历。 */
    const similarity = Number(bestScore.toFixed(4)); /* 第48天：把相似度保留四位小数。 */
    if (best && bestScore >= this.threshold) { /* 第48天：相似度达到阈值则判定缓存命中。 */
      best.hitCount += 1; /* 第48天：命中条目命中次数加一。 */
      best.lastAccessedAt = this.now(); /* 第48天：更新最近访问时间用于 LRU。 */
      this.hitCount += 1; /* 第48天：累计命中次数。 */
      this.savedTokens += best.savedTokens; /* 第48天：累计节省词元。 */
      this.savedCost += best.savedCost; /* 第48天：累计节省费用。 */
      this.savedLatencyTotal += Math.max(0, best.genDurationMs - 1); /* 第48天：累计降低的延迟（按缓存返回约 1 毫秒估算）。 */
      return { hit: true, similarity, entry: best, reason: `相似度 ${similarity} ≥ 阈值 ${this.threshold}，命中缓存`, backend: this.getBackendName() }; /* 第58天：返回命中结果并带上缓存后端。 */
    } /* 第48天：结束命中判定。 */
    this.missCount += 1; /* 第48天：累计未命中次数。 */
    return { hit: false, similarity, entry: null, reason: best ? `相似度 ${similarity} < 阈值 ${this.threshold}，未命中` : "缓存为空，未命中", backend: this.getBackendName() }; /* 第58天：返回未命中结果并带上缓存后端。 */
  } /* 第48天：结束 search 方法。 */

  async addAsync(input: CacheAddInput): Promise<CacheEntry> { /* 第58天：定义异步写入语义缓存的方法，会同步写入 RedisCacheStore。 */
    const entry = this.add(input); /* 第58天：先写入内存向量索引，保证本进程立即可检索。 */
    await this.writeEntryToStore(entry).catch(() => undefined); /* 第58天：再尝试写入外部 Store，失败时降级为内存缓存。 */
    return entry; /* 第58天：返回新写入的缓存条目。 */
  } /* 第58天：结束异步写入方法。 */

  async searchAsync(query: string): Promise<CacheSearchResult> { /* 第58天：定义异步语义检索方法，会先从 RedisCacheStore 水合缓存。 */
    await this.hydrateFromStore().catch(() => undefined); /* 第58天：尝试从外部 Store 加载共享缓存，失败时继续使用内存索引。 */
    const result = this.search(query); /* 第58天：复用本地向量检索逻辑计算相似度和命中状态。 */
    if (result.hit && result.entry) await this.writeEntryToStore(result.entry).catch(() => undefined); /* 第58天：命中后把 hitCount 与 lastAccessedAt 写回外部 Store。 */
    return result; /* 第58天：返回带后端标记的检索结果。 */
  } /* 第58天：结束异步语义检索方法。 */

  async invalidateAsync(id: string): Promise<boolean> { /* 第58天：定义异步失效单条缓存的方法。 */
    const deletedFromMemory = this.invalidate(id); /* 第58天：先删除本进程内存索引中的条目。 */
    const deletedFromStore = await this.store?.delete(id).catch(() => false) ?? false; /* 第58天：再尝试删除外部 Store 中的条目。 */
    return deletedFromMemory || deletedFromStore; /* 第58天：任一后端删除成功都视为失效成功。 */
  } /* 第58天：结束异步失效方法。 */

  async clearAsync(): Promise<void> { /* 第58天：定义异步清空缓存的方法。 */
    this.clear(); /* 第58天：清空本进程内存索引和指标。 */
    await this.store?.clear().catch(() => undefined); /* 第58天：尝试清空外部 Store，失败时保持内存清空结果。 */
    this.hydratedFromStore = true; /* 第58天：清空后标记已水合，避免立刻从旧外部状态重复加载。 */
  } /* 第58天：结束异步清空方法。 */

  async listAsync(): Promise<CacheEntry[]> { /* 第58天：定义异步读取全部缓存条目的方法。 */
    await this.hydrateFromStore().catch(() => undefined); /* 第58天：读取前尝试从 RedisCacheStore 水合共享条目。 */
    return this.list(); /* 第58天：返回清理过期并按最近访问排序后的条目列表。 */
  } /* 第58天：结束异步列表方法。 */

  async summariesAsync(): Promise<CacheEntrySummary[]> { /* 第58天：定义异步读取前端摘要的方法。 */
    await this.hydrateFromStore().catch(() => undefined); /* 第58天：摘要生成前先尝试水合外部 Store。 */
    return this.summaries(); /* 第58天：复用同步摘要生成逻辑。 */
  } /* 第58天：结束异步摘要方法。 */

  invalidate(id: string): boolean { /* 第48天：定义按 ID 手动失效单条缓存的方法。 */
    return this.entries.delete(id); /* 第48天：从内存存储删除指定条目并返回是否成功。 */
  } /* 第48天：结束 invalidate 方法。 */

  clear(): void { /* 第48天：定义清空全部缓存与指标的方法。 */
    this.entries.clear(); /* 第48天：清空全部缓存条目。 */
    this.totalQueries = 0; /* 第48天：重置检索次数。 */
    this.hitCount = 0; /* 第48天：重置命中次数。 */
    this.missCount = 0; /* 第48天：重置未命中次数。 */
    this.savedTokens = 0; /* 第48天：重置节省词元。 */
    this.savedCost = 0; /* 第48天：重置节省费用。 */
    this.savedLatencyTotal = 0; /* 第48天：重置降低延迟累计。 */
  } /* 第48天：结束 clear 方法。 */

  list(): CacheEntry[] { /* 第48天：定义读取全部缓存条目的方法。 */
    this.purgeExpired(); /* 第48天：读取前清理过期条目。 */
    return Array.from(this.entries.values()).sort((a, b) => b.lastAccessedAt - a.lastAccessedAt); /* 第48天：按最近访问时间倒序返回。 */
  } /* 第48天：结束 list 方法。 */

  summaries(): CacheEntrySummary[] { /* 第48天：定义生成 Cache Explorer 展示摘要的方法。 */
    const current = this.now(); /* 第48天：读取当前时间用于过期判断。 */
    return this.list().map((entry) => ({ /* 第48天：把每条缓存映射为前端摘要。 */
      id: entry.id, /* 第48天：写入条目标识。 */
      query: entry.query, /* 第48天：写入原始查询。 */
      answerPreview: entry.answer.length > 80 ? `${entry.answer.slice(0, 80)}…` : entry.answer, /* 第48天：截断答案生成预览。 */
      score: entry.metadata.score, /* 第48天：写入质量分。 */
      hitCount: entry.hitCount, /* 第48天：写入命中次数。 */
      savedCost: entry.savedCost, /* 第48天：写入单条节省费用。 */
      ttlPolicy: entry.ttlPolicy, /* 第48天：写入 TTL 策略。 */
      createdAt: entry.metadata.createdAt, /* 第48天：写入创建时间。 */
      lastAccessedAt: entry.lastAccessedAt, /* 第48天：写入最近访问时间。 */
      expiresAt: entry.expiresAt, /* 第48天：写入绝对过期时间。 */
      expired: entry.expiresAt !== null && current >= entry.expiresAt, /* 第48天：计算当前是否已过期。 */
    })); /* 第48天：结束摘要映射。 */
  } /* 第48天：结束 summaries 方法。 */

  getMetrics(): CacheMetrics { /* 第48天：定义读取缓存指标的方法。 */
    const hitRate = this.totalQueries > 0 ? Number((this.hitCount / this.totalQueries).toFixed(4)) : 0; /* 第48天：计算命中率并防御除零。 */
    const avgLatencyReduction = this.hitCount > 0 ? Number((this.savedLatencyTotal / this.hitCount).toFixed(2)) : 0; /* 第48天：计算平均延迟降低并防御除零。 */
    return { totalQueries: this.totalQueries, hitCount: this.hitCount, missCount: this.missCount, hitRate, savedTokens: this.savedTokens, savedCost: Number(this.savedCost.toFixed(8)), avgLatencyReduction }; /* 第48天：返回完整缓存指标快照。 */
  } /* 第48天：结束 getMetrics 方法。 */

  private purgeExpired(): void { /* 第48天：定义清理已过期缓存条目的方法。 */
    const current = this.now(); /* 第48天：读取当前时间。 */
    for (const [id, entry] of this.entries) { /* 第48天：遍历全部缓存条目。 */
      if (entry.expiresAt !== null && current >= entry.expiresAt) this.entries.delete(id); /* 第48天：删除已超过过期时间的条目。 */
    } /* 第48天：结束过期清理遍历。 */
  } /* 第48天：结束 purgeExpired 方法。 */

  private evictIfNeeded(): void { /* 第48天：定义在超出容量时执行 LRU 淘汰的方法。 */
    while (this.entries.size > this.maxEntries) { /* 第48天：当条目数量超过上限时循环淘汰。 */
      let oldestId = ""; /* 第48天：保存最久未访问条目的 ID。 */
      let oldestAccessedAt = Infinity; /* 第48天：保存最早访问时间。 */
      for (const entry of this.entries.values()) { /* 第48天：遍历查找最近最少使用条目。 */
        if (entry.lastAccessedAt < oldestAccessedAt) { oldestAccessedAt = entry.lastAccessedAt; oldestId = entry.id; } /* 第48天：保留访问时间最早的条目。 */
      } /* 第48天：结束 LRU 查找遍历。 */
      if (!oldestId) break; /* 第48天：找不到可淘汰条目时退出，避免死循环。 */
      this.entries.delete(oldestId); /* 第48天：删除最近最少使用条目。 */
    } /* 第48天：结束 LRU 淘汰循环。 */
  } /* 第48天：结束 evictIfNeeded 方法。 */

  private nextId(): string { /* 第48天：定义生成唯一缓存条目 ID 的方法。 */
    this.sequence += 1; /* 第48天：递增内部序号。 */
    return `cache-${this.now()}-${this.sequence}`; /* 第48天：组合前缀、时间戳与序号作为 ID。 */
  } /* 第48天：结束 nextId 方法。 */

  private async hydrateFromStore(): Promise<void> { /* 第58天：定义从外部 CacheStore 水合内存向量索引的方法。 */
    if (!this.store || this.hydratedFromStore) return; /* 第58天：没有外部 Store 或已经水合时直接返回。 */
    const keys = await this.store.keys(); /* 第58天：读取外部 Store 中的全部缓存 Key。 */
    for (const key of keys) { /* 第58天：遍历外部 Store 中的每个缓存 Key。 */
      const entry = await this.store.get(key); /* 第58天：读取缓存条目完整内容。 */
      if (entry) this.entries.set(entry.id, entry); /* 第58天：存在时写入本进程向量索引。 */
    } /* 第58天：结束外部缓存条目遍历。 */
    this.hydratedFromStore = true; /* 第58天：标记本进程已经完成一次外部 Store 水合。 */
  } /* 第58天：结束外部 Store 水合方法。 */

  private async writeEntryToStore(entry: CacheEntry): Promise<void> { /* 第58天：定义把单条缓存写回外部 Store 的方法。 */
    if (!this.store) return; /* 第58天：没有外部 Store 时保持纯内存缓存行为。 */
    const ttlSeconds = entry.expiresAt === null ? undefined : Math.max(1, Math.ceil((entry.expiresAt - this.now()) / 1000)); /* 第58天：根据剩余过期时间换算 Redis TTL 秒数。 */
    await this.store.set(entry.id, entry, ttlSeconds); /* 第58天：通过 CacheStore 抽象写入外部缓存存储。 */
  } /* 第58天：结束单条缓存写回外部 Store 方法。 */
} /* 第48天：结束 SemanticCache 类定义。 */

export const semanticCache = new SemanticCache({ store: createDefaultCacheStore<CacheEntry>("semantic-cache") }); /* 第58天：导出默认接入 RedisCacheStore 的共享语义缓存单例，Redis 不可用时异步方法会降级为内存索引。 */
