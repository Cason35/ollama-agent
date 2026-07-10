export type CacheTTLPolicy = "24h" | "7d" | "never"; /* 第48天：定义缓存条目支持的三种 TTL（存活时间）策略。 */

export const CACHE_TTL_PRESET_MS: Record<Exclude<CacheTTLPolicy, "never">, number> = { /* 第48天：定义可过期 TTL 策略对应的毫秒时长。 */
  "24h": 24 * 60 * 60 * 1000, /* 第48天：24 小时换算为毫秒。 */
  "7d": 7 * 24 * 60 * 60 * 1000, /* 第48天：7 天换算为毫秒。 */
}; /* 第48天：结束 TTL 预设时长定义。 */

export type CacheEntryMetadata = { /* 第48天：定义缓存条目的元数据结构。 */
  traceId?: string; /* 第48天：保存生成该答案时的 Trace（追踪记录）标识，便于回查成本来源。 */
  score: number; /* 第48天：保存生成答案的质量分数，用于评估缓存价值。 */
  createdAt: number; /* 第48天：保存缓存条目创建时间戳。 */
}; /* 第48天：结束缓存条目元数据定义。 */

export type CacheEntry = { /* 第48天：定义语义缓存中的单条缓存条目。 */
  id: string; /* 第48天：保存缓存条目唯一标识。 */
  query: string; /* 第48天：保存首次未命中时的原始用户查询。 */
  embedding: number[]; /* 第48天：保存查询向量，用于后续相似度检索。 */
  answer: string; /* 第48天：保存可复用的最终答案。 */
  metadata: CacheEntryMetadata; /* 第48天：保存 Trace、质量分与创建时间等元数据。 */
  hitCount: number; /* 第48天：保存该条目被命中复用的次数。 */
  lastAccessedAt: number; /* 第48天：保存最近一次访问时间，用于 LRU（最近最少使用）淘汰。 */
  ttlPolicy: CacheTTLPolicy; /* 第48天：保存该条目使用的 TTL 策略。 */
  ttlMs: number | null; /* 第48天：保存存活毫秒数，never 策略下为 null 表示永不过期。 */
  expiresAt: number | null; /* 第48天：保存绝对过期时间戳，null 表示永不过期。 */
  savedTokens: number; /* 第48天：保存命中时可节省的估算词元数。 */
  savedCost: number; /* 第48天：保存命中时可节省的估算费用。 */
  genDurationMs: number; /* 第48天：保存首次真实生成耗时，用于估算延迟降低。 */
}; /* 第48天：结束缓存条目类型定义。 */

export type CacheAddInput = { /* 第48天：定义向语义缓存写入新答案所需的入参。 */
  query: string; /* 第48天：写入未命中查询的原始文本。 */
  answer: string; /* 第48天：写入对应的最终答案。 */
  traceId?: string; /* 第48天：可选写入生成时的 Trace 标识。 */
  score?: number; /* 第48天：可选写入答案质量分数。 */
  ttlPolicy?: CacheTTLPolicy; /* 第48天：可选指定 TTL 策略，缺省使用缓存默认策略。 */
  genDurationMs?: number; /* 第48天：可选写入首次生成耗时用于延迟节省统计。 */
}; /* 第48天：结束缓存写入入参定义。 */

export type CacheSearchResult = { /* 第48天：定义一次缓存检索的返回结构。 */
  hit: boolean; /* 第48天：标记是否命中缓存。 */
  similarity: number; /* 第48天：保存与最相似历史查询的余弦相似度。 */
  entry: CacheEntry | null; /* 第48天：命中时返回对应缓存条目，未命中为 null。 */
  reason: string; /* 第48天：保存命中或未命中的可读原因。 */
  backend?: string; /* 第58天：保存本次检索使用的缓存后端，例如 redis 或 memory，便于 Trace 与 Explorer 观察。 */
}; /* 第48天：结束缓存检索结果定义。 */

export type CacheMetrics = { /* 第48天：定义语义缓存的统计指标。 */
  totalQueries: number; /* 第48天：保存累计检索次数。 */
  hitCount: number; /* 第48天：保存累计命中次数。 */
  missCount: number; /* 第48天：保存累计未命中次数。 */
  hitRate: number; /* 第48天：保存命中率（命中次数除以总检索次数）。 */
  savedTokens: number; /* 第48天：保存因命中累计节省的估算词元数。 */
  savedCost: number; /* 第48天：保存因命中累计节省的估算费用。 */
  avgLatencyReduction: number; /* 第48天：保存平均每次命中降低的延迟毫秒数。 */
}; /* 第48天：结束缓存指标定义。 */

export type CacheEntrySummary = { /* 第48天：定义 Cache Explorer（缓存浏览器）展示用的条目摘要。 */
  id: string; /* 第48天：保存缓存条目标识。 */
  query: string; /* 第48天：保存原始查询文本。 */
  answerPreview: string; /* 第48天：保存答案预览片段，避免前端渲染过长内容。 */
  score: number; /* 第48天：保存答案质量分数。 */
  hitCount: number; /* 第48天：保存命中复用次数。 */
  savedCost: number; /* 第48天：保存单条命中可节省的费用。 */
  ttlPolicy: CacheTTLPolicy; /* 第48天：保存 TTL 策略。 */
  createdAt: number; /* 第48天：保存创建时间。 */
  lastAccessedAt: number; /* 第48天：保存最近访问时间。 */
  expiresAt: number | null; /* 第48天：保存绝对过期时间。 */
  expired: boolean; /* 第48天：标记该条目当前是否已过期。 */
}; /* 第48天：结束缓存条目摘要定义。 */

export type CacheEventStatus = "hit" | "miss"; /* 第48天：定义缓存事件状态，对应 Trace（追踪记录）中的 cache span 状态。 */

export type CacheEvent = { /* 第48天：定义缓存演示链路中的单次查询事件。 */
  query: string; /* 第48天：保存触发本次事件的查询文本。 */
  status: CacheEventStatus; /* 第48天：保存命中或未命中状态。 */
  similarity: number; /* 第48天：保存与历史查询的相似度。 */
  traceId: string; /* 第48天：保存本次查询对应的 Trace 标识。 */
  durationMs: number; /* 第48天：保存本次查询的总耗时。 */
  savedCost: number; /* 第48天：保存本次事件因命中而节省的费用。 */
}; /* 第48天：结束缓存事件定义。 */

export type CacheAwareAnswer = { /* 第48天：定义 Agent Runtime 接入缓存后返回的统一结果。 */
  query: string; /* 第48天：保存本次用户查询。 */
  answer: string; /* 第48天：保存返回给用户的答案，命中时来自缓存。 */
  cacheStatus: CacheEventStatus; /* 第48天：标记本次为命中还是未命中。 */
  similarity: number; /* 第48天：保存与历史查询的相似度。 */
  traceId: string; /* 第48天：保存本次查询的 Trace 标识。 */
  durationMs: number; /* 第48天：保存本次查询总耗时，体现缓存带来的延迟差异。 */
  savedFromCache: boolean; /* 第48天：标记答案是否直接来自缓存复用。 */
}; /* 第48天：结束缓存感知答案类型定义。 */

export type CacheSnapshot = { /* 第48天：定义 Cache Explorer 一次完整快照。 */
  entries: CacheEntrySummary[]; /* 第48天：保存全部缓存条目摘要。 */
  metrics: CacheMetrics; /* 第48天：保存缓存指标。 */
  events: CacheEvent[]; /* 第48天：保存最近一次演示的查询事件序列。 */
  threshold: number; /* 第48天：保存判定缓存命中的相似度阈值。 */
  backend: string; /* 第58天：保存当前 Semantic Cache（语义缓存）实际使用的 Store 后端。 */
  generatedAt: number; /* 第48天：保存快照生成时间。 */
}; /* 第48天：结束缓存快照定义。 */
