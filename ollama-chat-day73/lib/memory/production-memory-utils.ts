import { computeQueryEmbedding, cosineSimilarity } from "@/lib/cache/query-embedding"; // 第68天：复用确定性向量计算以支持离线稳定的语义检索与测试。
import type { MemoryScoreBreakdown, ProductionMemoryDraft, ProductionMemoryItem } from "@/lib/memory/production-memory-types"; // 第68天：引入生产记忆草稿、条目和评分分量类型。
const RECENCY_TAU_MS = 7 * 24 * 60 * 60 * 1000; // 第68天：定义七天时效性指数衰减常数。
export function clamp01(value: number): number { // 第68天：定义把重要性、置信度和评分限制在零到一之间的工具函数。
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); // 第68天：返回经过有限数校验和边界裁剪的分数。
} // 第68天：结束零到一裁剪工具函数。
export function cloneProductionMemory(item: ProductionMemoryItem): ProductionMemoryItem { // 第68天：定义防止外部修改 Provider 内部状态的记忆复制函数。
  return { ...item, source: { ...item.source }, tags: [...item.tags], consolidatedFrom: [...item.consolidatedFrom] }; // 第68天：复制顶层字段、来源、标签和合并来源列表。
} // 第68天：结束生产记忆复制函数。
export function createProductionMemoryItem(draft: ProductionMemoryDraft, now = Date.now()): ProductionMemoryItem { // 第68天：定义把业务草稿补齐为完整生产记忆条目的工厂函数。
  const createdAt = draft.createdAt ?? now; // 第68天：优先保留调用方时间，否则使用当前时间。
  return { id: draft.id?.trim() || `pmem_${crypto.randomUUID()}`, scope: draft.scope, scopeId: draft.scopeId.trim(), type: draft.type, content: draft.content.trim(), importance: clamp01(draft.importance), confidence: clamp01(draft.confidence), source: { ...draft.source }, tags: Array.from(new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))), status: draft.status, createdAt, updatedAt: draft.updatedAt ?? createdAt, expiresAt: draft.expiresAt, lastAccessedAt: draft.lastAccessedAt, accessCount: Math.max(0, Math.floor(draft.accessCount ?? 0)), version: Math.max(1, Math.floor(draft.version ?? 1)), pinned: draft.pinned ?? false, consolidatedFrom: [...(draft.consolidatedFrom ?? [])] }; // 第68天：一次性补齐唯一标识、治理字段、时间戳、访问统计和乐观锁版本。
} // 第68天：结束生产记忆条目工厂函数。
export function normalizeMemoryContent(content: string): string { // 第68天：定义去重和冲突检测共用的正文标准化函数。
  return content.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "").trim(); // 第68天：移除空白、标点和符号并统一小写。
} // 第68天：结束记忆正文标准化函数。
export function semanticScore(query: string, content: string): number { // 第68天：定义查询与记忆正文的确定性语义相似度计算函数。
  if (normalizeMemoryContent(query) === normalizeMemoryContent(content)) return 1; // 第68天：标准化正文完全一致时直接返回满分。
  return clamp01(cosineSimilarity(computeQueryEmbedding(query), computeQueryEmbedding(content))); // 第68天：否则使用确定性向量余弦相似度并裁剪分数。
} // 第68天：结束语义相似度计算函数。
export function scoreMemory(item: ProductionMemoryItem, query: string, now: number, maxAccessCount: number): MemoryScoreBreakdown & { finalScore: number } { // 第68天：定义统一记忆检索的五分量加权评分函数。
  const semantic = semanticScore(query, item.content); // 第68天：计算当前查询与记忆正文的语义相关度。
  const importance = clamp01(item.importance); // 第68天：读取并规整记忆重要性分数。
  const recency = clamp01(Math.exp(-Math.max(0, now - item.updatedAt) / RECENCY_TAU_MS)); // 第68天：按更新时间计算指数衰减后的时效性分数。
  const confidence = clamp01(item.confidence); // 第68天：读取并规整记忆置信度分数。
  const access = clamp01(item.accessCount / Math.max(1, maxAccessCount)); // 第68天：把历史访问次数按本次候选最大值归一化。
  const finalScore = clamp01(semantic * 0.45 + importance * 0.2 + recency * 0.15 + confidence * 0.1 + access * 0.1); // 第68天：严格应用文档规定的统一加权评分公式。
  return { semanticScore: Number(semantic.toFixed(4)), importanceScore: Number(importance.toFixed(4)), recencyScore: Number(recency.toFixed(4)), confidenceScore: Number(confidence.toFixed(4)), accessScore: Number(access.toFixed(4)), finalScore: Number(finalScore.toFixed(4)) }; // 第68天：返回保留四位小数的可观察评分明细。
} // 第68天：结束统一记忆评分函数。
export function isExpiredMemory(item: ProductionMemoryItem, now = Date.now()): boolean { // 第68天：定义统一判断记忆 TTL 是否到期的工具函数。
  return typeof item.expiresAt === "number" && item.expiresAt <= now; // 第68天：存在且不晚于当前时间的过期时间视为已到期。
} // 第68天：结束记忆过期判断函数。
