import { computeQueryEmbedding, cosineSimilarity } from "@/lib/cache/query-embedding"; /* 第49天：复用第48天的确定性向量与余弦相似度，作为记忆语义检索底层。 */
import type { MemoryAddInput, MemoryConsolidationResult, MemoryItemSummary, MemoryItemType, MemoryItemV2, MemoryMetrics, MemoryRetrievalHit, MemoryRetrievalOptions, MemoryUpdateInput } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入长期记忆相关类型。 */

const DEFAULT_TOP_K = 5; /* 第49天：定义检索默认返回条数。 */
const DEFAULT_MIN_SCORE = 0.2; /* 第49天：定义判定检索命中的综合分阈值。 */
const CONSOLIDATION_SIMILARITY = 0.9; /* 第49天：定义判定两条记忆重复的相似度阈值。 */
const RECENCY_TAU_MS = 7 * 24 * 60 * 60 * 1000; /* 第49天：定义新近度衰减时间常数（7 天），用于计算 recency 分量。 */
const DECAY_STEP = 0.1; /* 第49天：定义每次衰减的基础重要性下降幅度。 */
const IMPORTANCE_FLOOR = 0.05; /* 第49天：定义重要性衰减的下限，避免衰减到零后无法检索。 */

const TYPE_IMPORTANCE: Record<MemoryItemType, number> = { /* 第49天：定义不同类型记忆的默认重要性。 */
  lesson: 0.85, /* 第49天：教训类记忆默认重要性最高，因为它直接指导后续决策。 */
  decision: 0.75, /* 第49天：决策类记忆默认重要性较高。 */
  experience: 0.7, /* 第49天：经验类记忆默认重要性中上。 */
  fact: 0.6, /* 第49天：事实类记忆默认重要性中等。 */
  preference: 0.5, /* 第49天：偏好类记忆默认重要性偏低。 */
}; /* 第49天：结束类型默认重要性表。 */

const TYPE_CONFIDENCE: Record<MemoryItemType, number> = { /* 第49天：定义不同类型记忆的默认置信度。 */
  lesson: 0.8, /* 第49天：教训类默认置信度较高。 */
  decision: 0.78, /* 第49天：决策类默认置信度较高。 */
  experience: 0.72, /* 第49天：经验类默认置信度中上。 */
  fact: 0.85, /* 第49天：事实类默认置信度最高。 */
  preference: 0.65, /* 第49天：偏好类默认置信度偏低。 */
}; /* 第49天：结束类型默认置信度表。 */

export type LongTermMemoryOptions = { /* 第49天：定义构造长期记忆存储的可选配置。 */
  now?: () => number; /* 第49天：可注入时间函数，便于测试衰减与新近度逻辑。 */
  consolidationSimilarity?: number; /* 第49天：可覆盖整合相似度阈值。 */
}; /* 第49天：结束长期记忆配置定义。 */

function clamp01(value: number): number { /* 第49天：定义把数值裁剪到 0 到 1 区间的工具函数。 */
  return Math.max(0, Math.min(1, value)); /* 第49天：返回限制后的数值。 */
} /* 第49天：结束 clamp01 工具函数。 */

export class LongTermMemoryStore { /* 第49天：定义长期记忆存储核心类，让系统跨任务积累经验。 */
  private readonly items = new Map<string, MemoryItemV2>(); /* 第49天：用 Map 作为内存向量存储保存全部记忆条目。 */
  private readonly now: () => number; /* 第49天：保存可注入的时间函数。 */
  private readonly consolidationSimilarity: number; /* 第49天：保存整合相似度阈值。 */
  private sequence = 0; /* 第49天：保存递增序号，保证记忆条目 ID 唯一。 */
  private totalRetrievals = 0; /* 第49天：累计检索次数，用于计算检索命中率。 */
  private retrievalHits = 0; /* 第49天：累计返回有效结果的检索次数。 */
  private decayCount = 0; /* 第49天：累计发生重要性衰减的条目次数。 */
  private lastConsolidationRatio = 0; /* 第49天：保存最近一次整合压缩比。 */

  constructor(options: LongTermMemoryOptions = {}) { /* 第49天：使用可选配置构造长期记忆存储。 */
    this.now = options.now ?? (() => Date.now()); /* 第49天：初始化时间函数，缺省使用真实时钟。 */
    this.consolidationSimilarity = options.consolidationSimilarity ?? CONSOLIDATION_SIMILARITY; /* 第49天：初始化整合相似度阈值。 */
  } /* 第49天：结束构造函数。 */

  add(input: MemoryAddInput): MemoryItemV2 { /* 第49天：定义新增一条长期记忆的方法。 */
    const createdAt = this.now(); /* 第49天：读取写入时间作为创建时间。 */
    const item: MemoryItemV2 = { /* 第49天：构造完整记忆条目。 */
      id: this.nextId(), /* 第49天：分配唯一标识。 */
      type: input.type, /* 第49天：保存记忆类型。 */
      content: input.content.trim(), /* 第49天：保存去除首尾空白的记忆正文。 */
      embedding: computeQueryEmbedding(input.content), /* 第49天：计算记忆向量供语义检索。 */
      importance: clamp01(input.importance ?? TYPE_IMPORTANCE[input.type]), /* 第49天：初始化重要性，缺省按类型推导。 */
      confidence: clamp01(input.confidence ?? TYPE_CONFIDENCE[input.type]), /* 第49天：初始化置信度，缺省按类型推导。 */
      source: input.source ?? {}, /* 第49天：保存记忆来源。 */
      createdAt, /* 第49天：保存创建时间。 */
      lastAccessedAt: createdAt, /* 第49天：把创建时间作为初始访问时间。 */
      accessCount: 0, /* 第49天：初始化访问次数为零。 */
      pinned: input.pinned ?? false, /* 第49天：初始化置顶状态。 */
      consolidatedFrom: 1, /* 第49天：初始化整合来源条数为一。 */
    }; /* 第49天：结束记忆条目构造。 */
    if (item.pinned) item.importance = 1; /* 第49天：置顶记忆的重要性直接拉满。 */
    this.items.set(item.id, item); /* 第49天：把记忆条目写入内存向量存储。 */
    return item; /* 第49天：返回新建记忆条目。 */
  } /* 第49天：结束 add 方法。 */

  retrieve(query: string, options: MemoryRetrievalOptions = {}): MemoryRetrievalHit[] { /* 第49天：定义记忆检索第 2 版，综合语义、重要性与新近度打分。 */
    this.totalRetrievals += 1; /* 第49天：累计一次检索。 */
    const topK = Math.max(1, options.topK ?? DEFAULT_TOP_K); /* 第49天：确定返回条数并保证至少为一。 */
    const minScore = options.minScore ?? DEFAULT_MIN_SCORE; /* 第49天：确定综合分阈值。 */
    const queryEmbedding = computeQueryEmbedding(query); /* 第49天：计算查询向量。 */
    const current = this.now(); /* 第49天：读取当前时间用于新近度计算。 */
    const maxAccessCount = Math.max(1, ...Array.from(this.items.values()).map((item) => item.accessCount)); /* 第49天：取最大访问次数用于归一化访问频率分量。 */
    const hits: MemoryRetrievalHit[] = []; /* 第49天：初始化命中列表。 */
    for (const item of this.items.values()) { /* 第49天：遍历全部记忆条目。 */
      if (options.type && item.type !== options.type) continue; /* 第49天：启用类型筛选时跳过不匹配类型。 */
      const semantic = cosineSimilarity(queryEmbedding, item.embedding); /* 第49天：计算语义相似度分量。 */
      const importance = clamp01(item.importance); /* 第49天：读取重要性分量。 */
      const recency = Math.exp(-(current - item.lastAccessedAt) / RECENCY_TAU_MS); /* 第49天：按时间指数衰减计算新近度分量。 */
      const accessFrequency = item.accessCount / maxAccessCount; /* 第49天：计算归一化访问频率分量。 */
      const score = Number((0.5 * semantic + 0.3 * importance + 0.2 * recency).toFixed(4)); /* 第49天：按综合公式计算记忆分。 */
      hits.push({ item, semantic: Number(semantic.toFixed(4)), importance: Number(importance.toFixed(4)), recency: Number(recency.toFixed(4)), accessFrequency: Number(accessFrequency.toFixed(4)), score }); /* 第49天：写入命中明细。 */
    } /* 第49天：结束记忆遍历。 */
    hits.sort((a, b) => (b.score - a.score) || (b.accessFrequency - a.accessFrequency)); /* 第49天：按综合分降序排序，访问频率作为同分时的辅助排序。 */
    const selected = hits.filter((hit) => hit.score >= minScore).slice(0, topK); /* 第49天：过滤低于阈值的结果并截取前若干条。 */
    if (selected.length > 0) this.retrievalHits += 1; /* 第49天：返回有效结果时累计一次命中检索。 */
    for (const hit of selected) { /* 第49天：遍历被选中的记忆。 */
      hit.item.accessCount += 1; /* 第49天：命中记忆访问次数加一，访问越多后续衰减越慢。 */
      hit.item.lastAccessedAt = current; /* 第49天：更新最近访问时间用于新近度计算。 */
    } /* 第49天：结束命中更新循环。 */
    return selected; /* 第49天：返回综合排序后的检索结果。 */
  } /* 第49天：结束 retrieve 方法。 */

  update(id: string, patch: MemoryUpdateInput): MemoryItemV2 | null { /* 第49天：定义更新单条记忆的方法。 */
    const item = this.items.get(id); /* 第49天：读取目标记忆条目。 */
    if (!item) return null; /* 第49天：不存在时返回空值。 */
    if (typeof patch.content === "string") { item.content = patch.content.trim(); item.embedding = computeQueryEmbedding(patch.content); } /* 第49天：更新正文时同步重算向量。 */
    if (patch.type) item.type = patch.type; /* 第49天：按需更新类型。 */
    if (typeof patch.importance === "number") item.importance = clamp01(patch.importance); /* 第49天：按需更新重要性。 */
    if (typeof patch.confidence === "number") item.confidence = clamp01(patch.confidence); /* 第49天：按需更新置信度。 */
    if (typeof patch.pinned === "boolean") { item.pinned = patch.pinned; if (patch.pinned) item.importance = 1; } /* 第49天：按需更新置顶状态并在置顶时拉满重要性。 */
    return item; /* 第49天：返回更新后的记忆条目。 */
  } /* 第49天：结束 update 方法。 */

  delete(id: string): boolean { /* 第49天：定义删除单条记忆的方法。 */
    return this.items.delete(id); /* 第49天：从内存存储删除指定记忆并返回是否成功。 */
  } /* 第49天：结束 delete 方法。 */

  clear(): void { /* 第49天：定义清空全部记忆与统计的方法。 */
    this.items.clear(); /* 第49天：清空全部记忆条目。 */
    this.totalRetrievals = 0; /* 第49天：重置检索次数。 */
    this.retrievalHits = 0; /* 第49天：重置命中检索次数。 */
    this.decayCount = 0; /* 第49天：重置衰减计数。 */
    this.lastConsolidationRatio = 0; /* 第49天：重置整合压缩比。 */
  } /* 第49天：结束 clear 方法。 */

  list(): MemoryItemV2[] { /* 第49天：定义读取全部记忆条目的方法。 */
    return Array.from(this.items.values()).sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.importance - a.importance) || (b.lastAccessedAt - a.lastAccessedAt)); /* 第49天：置顶优先、再按重要性与最近访问时间倒序返回。 */
  } /* 第49天：结束 list 方法。 */

  consolidateMemories(): MemoryConsolidationResult { /* 第49天：定义记忆整合方法，压缩语义重复的经验。 */
    const before = this.items.size; /* 第49天：记录整合前记忆总数。 */
    const all = Array.from(this.items.values()); /* 第49天：展开当前全部记忆。 */
    const removedIds = new Set<string>(); /* 第49天：保存将被合并删除的记忆 ID。 */
    let mergedGroups = 0; /* 第49天：累计被合并的重复组数。 */
    for (let i = 0; i < all.length; i += 1) { /* 第49天：遍历每条记忆作为合并基准。 */
      const base = all[i]; /* 第49天：取当前基准记忆。 */
      if (removedIds.has(base.id)) continue; /* 第49天：已被合并的记忆不再作为基准。 */
      let mergedAny = false; /* 第49天：标记本基准是否合并了其他记忆。 */
      for (let j = i + 1; j < all.length; j += 1) { /* 第49天：遍历后续记忆寻找重复项。 */
        const other = all[j]; /* 第49天：取候选重复记忆。 */
        if (removedIds.has(other.id) || other.type !== base.type) continue; /* 第49天：跳过已合并或类型不同的记忆。 */
        if (cosineSimilarity(base.embedding, other.embedding) < this.consolidationSimilarity) continue; /* 第49天：相似度不足阈值的不视为重复。 */
        base.importance = clamp01(Math.max(base.importance, other.importance)); /* 第49天：合并后取较高的重要性。 */
        base.confidence = clamp01(Math.max(base.confidence, other.confidence)); /* 第49天：合并后取较高的置信度。 */
        base.accessCount += other.accessCount; /* 第49天：合并访问次数。 */
        base.consolidatedFrom += other.consolidatedFrom; /* 第49天：累计整合来源条数。 */
        base.createdAt = Math.min(base.createdAt, other.createdAt); /* 第49天：保留最早创建时间。 */
        base.lastAccessedAt = Math.max(base.lastAccessedAt, other.lastAccessedAt); /* 第49天：保留最近访问时间。 */
        base.pinned = base.pinned || other.pinned; /* 第49天：任一置顶则合并后置顶。 */
        if (other.content.length > base.content.length) { base.content = other.content; base.embedding = other.embedding; } /* 第49天：保留信息量更大的正文与向量。 */
        removedIds.add(other.id); /* 第49天：标记被合并记忆待删除。 */
        mergedAny = true; /* 第49天：标记本基准发生了合并。 */
      } /* 第49天：结束候选重复遍历。 */
      if (mergedAny) mergedGroups += 1; /* 第49天：本基准合并过其他记忆则记一组。 */
    } /* 第49天：结束基准遍历。 */
    for (const id of removedIds) this.items.delete(id); /* 第49天：删除全部被合并的重复记忆。 */
    const after = this.items.size; /* 第49天：记录整合后记忆总数。 */
    this.lastConsolidationRatio = before > 0 ? Number(((before - after) / before).toFixed(4)) : 0; /* 第49天：计算整合压缩比。 */
    return { before, after, mergedGroups, removed: removedIds.size }; /* 第49天：返回整合结果摘要。 */
  } /* 第49天：结束 consolidateMemories 方法。 */

  importanceDecay(): number { /* 第49天：定义重要性衰减方法，随时间降低重要性但访问越多衰减越慢。 */
    let decayed = 0; /* 第49天：累计本次发生衰减的条目数。 */
    for (const item of this.items.values()) { /* 第49天：遍历全部记忆条目。 */
      if (item.pinned) continue; /* 第49天：置顶记忆不参与衰减。 */
      const resistance = 1 + Math.log10(1 + item.accessCount); /* 第49天：访问次数越多衰减阻力越大。 */
      const next = clamp01(item.importance - DECAY_STEP / resistance); /* 第49天：按阻力降低重要性并裁剪到合法区间。 */
      const floored = Math.max(IMPORTANCE_FLOOR, next); /* 第49天：保证重要性不低于下限。 */
      if (floored < item.importance) { item.importance = floored; decayed += 1; } /* 第49天：重要性确实下降时更新并计数。 */
    } /* 第49天：结束衰减遍历。 */
    this.decayCount += decayed; /* 第49天：累计衰减条目次数。 */
    return decayed; /* 第49天：返回本次衰减条目数。 */
  } /* 第49天：结束 importanceDecay 方法。 */

  stats(): MemoryMetrics { /* 第49天：定义读取长期记忆指标的方法。 */
    const all = Array.from(this.items.values()); /* 第49天：展开全部记忆。 */
    const total = all.length; /* 第49天：记忆总数。 */
    const avgImportance = total > 0 ? Number((all.reduce((sum, item) => sum + item.importance, 0) / total).toFixed(4)) : 0; /* 第49天：计算平均重要性。 */
    const avgAccessCount = total > 0 ? Number((all.reduce((sum, item) => sum + item.accessCount, 0) / total).toFixed(4)) : 0; /* 第49天：计算平均访问次数。 */
    const retrievalHitRate = this.totalRetrievals > 0 ? Number((this.retrievalHits / this.totalRetrievals).toFixed(4)) : 0; /* 第49天：计算检索命中率。 */
    const typeDistribution: Record<MemoryItemType, number> = { fact: 0, preference: 0, experience: 0, decision: 0, lesson: 0 }; /* 第49天：初始化类型分布。 */
    for (const item of all) typeDistribution[item.type] += 1; /* 第49天：累计各类型记忆数量。 */
    return { totalMemories: total, avgImportance, avgAccessCount, retrievalHitRate, consolidationRatio: this.lastConsolidationRatio, decayCount: this.decayCount, typeDistribution }; /* 第49天：返回完整记忆指标。 */
  } /* 第49天：结束 stats 方法。 */

  summaries(): MemoryItemSummary[] { /* 第49天：定义生成记忆浏览器展示摘要的方法。 */
    return this.list().map((item) => ({ /* 第49天：把每条记忆映射为前端摘要。 */
      id: item.id, /* 第49天：写入记忆标识。 */
      type: item.type, /* 第49天：写入记忆类型。 */
      content: item.content, /* 第49天：写入记忆正文。 */
      importance: Number(item.importance.toFixed(4)), /* 第49天：写入重要性。 */
      confidence: Number(item.confidence.toFixed(4)), /* 第49天：写入置信度。 */
      accessCount: item.accessCount, /* 第49天：写入访问次数。 */
      lastAccessedAt: item.lastAccessedAt, /* 第49天：写入最近访问时间。 */
      createdAt: item.createdAt, /* 第49天：写入创建时间。 */
      pinned: item.pinned, /* 第49天：写入置顶状态。 */
      consolidatedFrom: item.consolidatedFrom, /* 第49天：写入整合来源条数。 */
      sourceAgentId: item.source.agentId, /* 第49天：写入贡献该记忆的智能体标识。 */
    })); /* 第49天：结束摘要映射。 */
  } /* 第49天：结束 summaries 方法。 */

  private nextId(): string { /* 第49天：定义生成唯一记忆条目 ID 的方法。 */
    this.sequence += 1; /* 第49天：递增内部序号。 */
    return `mem-${this.now()}-${this.sequence}`; /* 第49天：组合前缀、时间戳与序号作为 ID。 */
  } /* 第49天：结束 nextId 方法。 */
} /* 第49天：结束 LongTermMemoryStore 类定义。 */

export const longTermMemory = new LongTermMemoryStore(); /* 第49天：导出进程内共享长期记忆单例，供运行时与接口复用。 */
