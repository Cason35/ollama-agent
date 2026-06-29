export type MemoryItemType = "fact" | "preference" | "experience" | "decision" | "lesson"; /* 第49天：定义长期记忆条目的五种类型，区分事实、偏好、经验、决策与教训。 */

export type MemoryItemSource = { /* 第49天：定义记忆来源，便于回溯记忆从哪条链路提炼而来。 */
  traceId?: string; /* 第49天：保存提炼该记忆时的 Trace（追踪记录）标识。 */
  workspaceId?: string; /* 第49天：保存提炼该记忆时的 Workspace（工作空间）标识。 */
  agentId?: string; /* 第49天：保存贡献该记忆的智能体标识。 */
}; /* 第49天：结束记忆来源类型定义。 */

export type MemoryItemV2 = { /* 第49天：定义长期记忆第 2 版的单条记忆结构。 */
  id: string; /* 第49天：保存记忆条目的唯一标识。 */
  type: MemoryItemType; /* 第49天：保存记忆类型，用于类型筛选与经验整合。 */
  content: string; /* 第49天：保存记忆正文内容。 */
  embedding: number[]; /* 第49天：保存记忆向量，用于语义检索。 */
  importance: number; /* 第49天：保存重要性分数（0 到 1），随时间衰减。 */
  confidence: number; /* 第49天：保存置信度分数（0 到 1），表示该记忆可信程度。 */
  source: MemoryItemSource; /* 第49天：保存记忆来源信息。 */
  createdAt: number; /* 第49天：保存记忆创建时间戳。 */
  lastAccessedAt: number; /* 第49天：保存最近一次被检索访问的时间戳。 */
  accessCount: number; /* 第49天：保存被检索命中的累计次数，访问越多衰减越慢。 */
  pinned: boolean; /* 第49天：标记是否被人工置顶，置顶后不参与衰减且重要性拉满。 */
  consolidatedFrom: number; /* 第49天：保存该记忆由多少条重复记忆整合而来，初始为 1。 */
}; /* 第49天：结束长期记忆条目类型定义。 */

export type MemoryAddInput = { /* 第49天：定义向长期记忆写入新条目所需的入参。 */
  type: MemoryItemType; /* 第49天：指定写入记忆的类型。 */
  content: string; /* 第49天：指定写入记忆的正文。 */
  importance?: number; /* 第49天：可选指定重要性，缺省按类型推导。 */
  confidence?: number; /* 第49天：可选指定置信度，缺省按类型推导。 */
  source?: MemoryItemSource; /* 第49天：可选指定记忆来源。 */
  pinned?: boolean; /* 第49天：可选指定是否置顶。 */
}; /* 第49天：结束记忆写入入参定义。 */

export type MemoryUpdateInput = { /* 第49天：定义更新单条记忆的可选字段。 */
  content?: string; /* 第49天：可选更新记忆正文，更新后会重新计算向量。 */
  type?: MemoryItemType; /* 第49天：可选更新记忆类型。 */
  importance?: number; /* 第49天：可选更新重要性。 */
  confidence?: number; /* 第49天：可选更新置信度。 */
  pinned?: boolean; /* 第49天：可选更新置顶状态。 */
}; /* 第49天：结束记忆更新入参定义。 */

export type MemoryRetrievalOptions = { /* 第49天：定义记忆检索第 2 版的可选参数。 */
  topK?: number; /* 第49天：指定返回前若干条记忆，缺省为 5。 */
  type?: MemoryItemType; /* 第49天：指定只检索某一类型记忆。 */
  minScore?: number; /* 第49天：指定综合分阈值，低于该分视为不相关。 */
}; /* 第49天：结束记忆检索参数定义。 */

export type MemoryRetrievalHit = { /* 第49天：定义一次记忆检索命中的打分明细。 */
  item: MemoryItemV2; /* 第49天：保存命中的记忆条目。 */
  semantic: number; /* 第49天：保存语义相似度分量。 */
  importance: number; /* 第49天：保存重要性分量。 */
  recency: number; /* 第49天：保存新近度分量。 */
  accessFrequency: number; /* 第49天：保存访问频率分量，用于辅助排序。 */
  score: number; /* 第49天：保存综合记忆分（0.5 语义 + 0.3 重要性 + 0.2 新近度）。 */
}; /* 第49天：结束记忆检索命中类型定义。 */

export type MemoryMetrics = { /* 第49天：定义长期记忆的统计指标。 */
  totalMemories: number; /* 第49天：保存记忆总数。 */
  avgImportance: number; /* 第49天：保存平均重要性。 */
  avgAccessCount: number; /* 第49天：保存平均访问次数。 */
  retrievalHitRate: number; /* 第49天：保存检索命中率（返回有效结果的检索占比）。 */
  consolidationRatio: number; /* 第49天：保存整合压缩比（被合并删除的记忆占比）。 */
  decayCount: number; /* 第49天：保存累计发生重要性衰减的条目次数。 */
  typeDistribution: Record<MemoryItemType, number>; /* 第49天：保存各类型记忆数量分布。 */
}; /* 第49天：结束记忆指标定义。 */

export type MemoryConsolidationResult = { /* 第49天：定义一次记忆整合的结果摘要。 */
  before: number; /* 第49天：保存整合前的记忆总数。 */
  after: number; /* 第49天：保存整合后的记忆总数。 */
  mergedGroups: number; /* 第49天：保存被合并的重复记忆组数量。 */
  removed: number; /* 第49天：保存被删除的重复记忆条数。 */
}; /* 第49天：结束记忆整合结果定义。 */

export type MemoryItemSummary = { /* 第49天：定义 Memory Explorer V2（记忆浏览器第 2 版）展示用的条目摘要。 */
  id: string; /* 第49天：保存记忆标识。 */
  type: MemoryItemType; /* 第49天：保存记忆类型。 */
  content: string; /* 第49天：保存记忆正文。 */
  importance: number; /* 第49天：保存重要性。 */
  confidence: number; /* 第49天：保存置信度。 */
  accessCount: number; /* 第49天：保存访问次数。 */
  lastAccessedAt: number; /* 第49天：保存最近访问时间。 */
  createdAt: number; /* 第49天：保存创建时间。 */
  pinned: boolean; /* 第49天：保存是否置顶。 */
  consolidatedFrom: number; /* 第49天：保存整合来源条数。 */
  sourceAgentId?: string; /* 第49天：保存贡献该记忆的智能体标识。 */
}; /* 第49天：结束记忆条目摘要定义。 */

export type MemoryRetrievalPreview = { /* 第49天：定义记忆浏览器展示的一次检索预览。 */
  query: string; /* 第49天：保存触发检索的查询文本。 */
  hits: Array<{ id: string; type: MemoryItemType; content: string; score: number; semantic: number; importance: number; recency: number }>; /* 第49天：保存检索命中的打分明细。 */
}; /* 第49天：结束记忆检索预览定义。 */

export type MemoryAugmentedAnswer = { /* 第49天：定义 Agent Runtime 接入长期记忆后返回的统一结果。 */
  query: string; /* 第49天：保存本次用户查询。 */
  answer: string; /* 第49天：保存最终答案，已结合长期经验生成。 */
  traceId: string; /* 第49天：保存本次查询的 Trace 标识。 */
  durationMs: number; /* 第49天：保存本次查询总耗时。 */
  retrievedExperiences: Array<{ id: string; type: MemoryItemType; content: string; score: number }>; /* 第49天：保存执行前检索并注入提示词的历史经验。 */
  newExperienceCount: number; /* 第49天：保存本次执行后新写回的经验记忆数量。 */
}; /* 第49天：结束记忆增强答案类型定义。 */

export type MemorySnapshot = { /* 第49天：定义 Memory Explorer V2 的一次完整快照。 */
  items: MemoryItemSummary[]; /* 第49天：保存全部记忆条目摘要。 */
  metrics: MemoryMetrics; /* 第49天：保存记忆指标。 */
  retrieval: MemoryRetrievalPreview | null; /* 第49天：保存演示查询的检索预览。 */
  consolidation: MemoryConsolidationResult | null; /* 第49天：保存最近一次整合结果。 */
  generatedAt: number; /* 第49天：保存快照生成时间。 */
}; /* 第49天：结束记忆快照定义。 */
