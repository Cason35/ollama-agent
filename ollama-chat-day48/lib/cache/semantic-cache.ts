import { computeQueryEmbedding, cosineSimilarity } from "@/lib/cache/query-embedding"; /* 第48天：引入查询向量计算与余弦相似度函数。 */
import { estimateTokenCount, estimateUsageCost } from "@/lib/usage/token-accounting"; /* 第48天：复用第47天的词元估算与费用估算，量化缓存节省。 */
import { CACHE_TTL_PRESET_MS, type CacheAddInput, type CacheEntry, type CacheEntrySummary, type CacheMetrics, type CacheSearchResult, type CacheTTLPolicy } from "@/lib/cache/cache-types"; /* 第48天：引入缓存条目、检索结果、指标与 TTL 类型。 */

const DEFAULT_THRESHOLD = 0.9; /* 第48天：定义判定缓存命中的默认相似度阈值，对应任务要求的 0.9。 */
const DEFAULT_MAX_ENTRIES = 50; /* 第48天：定义触发 LRU（最近最少使用）淘汰的默认容量上限。 */
const DEFAULT_TTL_POLICY: CacheTTLPolicy = "24h"; /* 第48天：定义新条目缺省使用的 TTL（存活时间）策略。 */

export type SemanticCacheOptions = { /* 第48天：定义构造语义缓存的可选配置。 */
  threshold?: number; /* 第48天：可覆盖命中阈值。 */
  maxEntries?: number; /* 第48天：可覆盖容量上限。 */
  defaultTtlPolicy?: CacheTTLPolicy; /* 第48天：可覆盖默认 TTL 策略。 */
  now?: () => number; /* 第48天：可注入时间函数，便于测试 TTL 过期逻辑。 */
}; /* 第48天：结束语义缓存配置定义。 */

export class SemanticCache { /* 第48天：定义语义缓存核心类，让系统避免重复思考同一问题。 */
  private readonly entries = new Map<string, CacheEntry>(); /* 第48天：用 Map 作为内存向量存储保存全部缓存条目。 */
  private readonly threshold: number; /* 第48天：保存命中阈值。 */
  private readonly maxEntries: number; /* 第48天：保存容量上限。 */
  private readonly defaultTtlPolicy: CacheTTLPolicy; /* 第48天：保存默认 TTL 策略。 */
  private readonly now: () => number; /* 第48天：保存可注入的时间函数。 */
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
  } /* 第48天：结束构造函数。 */

  getThreshold(): number { /* 第48天：定义读取命中阈值的方法，供前端展示。 */
    return this.threshold; /* 第48天：返回当前阈值。 */
  } /* 第48天：结束阈值读取方法。 */

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
      return { hit: true, similarity, entry: best, reason: `相似度 ${similarity} ≥ 阈值 ${this.threshold}，命中缓存` }; /* 第48天：返回命中结果。 */
    } /* 第48天：结束命中判定。 */
    this.missCount += 1; /* 第48天：累计未命中次数。 */
    return { hit: false, similarity, entry: null, reason: best ? `相似度 ${similarity} < 阈值 ${this.threshold}，未命中` : "缓存为空，未命中" }; /* 第48天：返回未命中结果。 */
  } /* 第48天：结束 search 方法。 */

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
} /* 第48天：结束 SemanticCache 类定义。 */

export const semanticCache = new SemanticCache(); /* 第48天：导出进程内共享语义缓存单例，供运行时与接口复用。 */
