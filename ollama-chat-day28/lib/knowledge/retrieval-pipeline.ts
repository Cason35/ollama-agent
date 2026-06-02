/**
 * 第28天：Retrieval Pipeline —— Memory-aware Query Rewrite + Multi-Query Retrieval。
 */
import type { ModelRuntime } from "@/lib/model/model-runtime"; // 引入模型运行时类型
import { retrieveWithQueries } from "@/lib/knowledge/knowledge-retrieval"; // 引入可控 queries 的多查询检索入口
import { isAmbiguousQuery, rewriteQueryByRules, rewriteQueryWithFallback, rewriteQueryWithLlm } from "@/lib/knowledge/query-rewrite"; // 引入改写策略
import type { KnowledgeDocument, PipelineMetrics, RetrievalMemoryItem, RetrievalRecentMessage, RetrieveOptions, RetrievedChunkHit } from "@/lib/knowledge/knowledge-types"; // 引入检索相关类型

/** 第28天：Pipeline 输入结构。 */
export type RetrievalPipelineInput = {
  query: string; // 用户原始问题
  documents: KnowledgeDocument[]; // 当前知识库文档
  memory?: RetrievalMemoryItem[]; // 长期记忆
  recentMessages?: RetrievalRecentMessage[]; // 最近对话
  knowledgeTopics?: string[]; // 知识库主题
  options?: Partial<RetrieveOptions>; // 检索参数
  rt?: ModelRuntime; // 可选模型运行时，用于 LLM rewrite
}; // RetrievalPipelineInput 结束

/** 第28天：Pipeline 输出结构。 */
export type RetrievalPipelineResult = {
  originalQuery: string; // 原始用户问题
  rewrittenQueries: string[]; // 实际用于检索的 queries
  retrievedChunks: RetrievedChunkHit[]; // 检索到的最终 chunks
  mode: "rule" | "llm" | "hybrid" | "fallback-llm" | "disabled"; // 本次改写 / 检索模式
  ambiguous: boolean; // 是否模糊查询
  memoryUsed: boolean; // 是否使用长期记忆
  recentMessagesUsed: boolean; // 是否使用最近对话
  knowledgeTopicsUsed: string[]; // 实际使用的知识主题
  fallbackTriggered: boolean; // 是否触发 fallback LLM 重查
  metrics: PipelineMetrics; // 单次 pipeline 指标
}; // RetrievalPipelineResult 结束

/** 第28天：从文档标题中提取知识库主题。 */
export function getKnowledgeTopicsFromDocuments(documents: KnowledgeDocument[]): string[] {
  return documents.map((doc) => doc.title.trim()).filter(Boolean).slice(0, 12); // 取最多 12 个非空标题
}

/** 第28天：清理 query 列表并去重。 */
function normalizePipelineQueries(query: string, queries: string[], maxQueries: number): string[] {
  const seen = new Set<string>(); // 用 Set 去重并保留顺序
  for (const item of [query, ...queries]) { // 原始问题始终排在最前
    const trimmed = item.trim(); // 清理空白
    if (!trimmed) continue; // 跳过空字符串
    const key = trimmed.toLowerCase(); // 小写作为去重键
    if (seen.has(key)) continue; // 已存在则跳过
    seen.add(key); // 记录当前 query
  }
  return Array.from(seen).slice(0, Math.max(1, maxQueries)); // 限制最大 query 数
}

/** 第28天：决定初始 rewrite 策略并生成 queries。 */
async function buildInitialQueries(input: RetrievalPipelineInput, ambiguous: boolean, maxQueries: number) {
  const query = input.query.trim(); // 规整原始 query
  const context = { memory: input.memory, recentMessages: input.recentMessages, knowledgeTopics: input.knowledgeTopics }; // 汇总上下文
  if (input.options?.enableQueryRewrite === false) { // 用户显式关闭 rewrite
    return { queries: [query], mode: "disabled" as const }; // 只用原始 query
  }
  if (ambiguous && input.rt) { // 模糊问题且有模型时优先 LLM
    const result = await rewriteQueryWithFallback(query, input.rt, maxQueries, context); // LLM 优先并规则兜底
    return { queries: result.queries, mode: result.strategy === "llm" ? ("llm" as const) : ("rule" as const) }; // 映射策略
  }
  return { queries: rewriteQueryByRules(query, maxQueries), mode: "rule" as const }; // 明确问题优先规则改写
}

/** 第28天：执行 Memory-aware Retrieval Pipeline。 */
export async function runRetrievalPipeline(input: RetrievalPipelineInput): Promise<RetrievalPipelineResult> {
  const startedAt = Date.now(); // 记录开始时间
  const query = input.query.trim(); // 规整原始问题
  const maxQueries = Math.max(1, Math.min(8, Math.floor(input.options?.maxQueries ?? 5))); // 限制 query 数
  const ambiguous = isAmbiguousQuery(query); // 检测是否模糊查询
  const memory = input.memory ?? input.options?.memory ?? []; // 读取长期记忆
  const recentMessages = input.recentMessages ?? input.options?.recentMessages ?? []; // 读取最近对话
  const knowledgeTopics = (input.knowledgeTopics ?? input.options?.knowledgeTopics ?? getKnowledgeTopicsFromDocuments(input.documents)).slice(0, 12); // 读取或提取主题
  const enrichedInput = { ...input, memory, recentMessages, knowledgeTopics }; // 合并上下文后的输入
  const initial = await buildInitialQueries(enrichedInput, ambiguous, maxQueries); // 生成初始查询
  const initialQueries = normalizePipelineQueries(query, initial.queries, maxQueries); // 清理初始查询
  const firstPass = await retrieveWithQueries(query, initialQueries, input.documents, input.options); // 执行第一轮检索
  let hits = firstPass.hits; // 保存第一轮命中
  let rewrittenQueries = initialQueries; // 保存实际 query 列表
  let mode: RetrievalPipelineResult["mode"] = initial.mode; // 保存改写模式
  let fallbackTriggered = false; // 初始化 fallback 标记
  if (hits.length === 0 && input.rt && input.options?.enableQueryRewrite !== false && initial.mode !== "llm") { // 无命中且可用模型时重试 LLM
    const llmQueries = await rewriteQueryWithLlm(query, input.rt, maxQueries, { memory, recentMessages, knowledgeTopics }); // 生成 LLM 查询
    const fallbackQueries = normalizePipelineQueries(query, llmQueries, maxQueries); // 清理 fallback 查询
    if (fallbackQueries.length > 1) { // LLM 给出有效扩展才重查
      const retry = await retrieveWithQueries(query, fallbackQueries, input.documents, input.options); // 执行 fallback 检索
      hits = retry.hits; // 使用 fallback 命中
      rewrittenQueries = fallbackQueries; // 使用 fallback queries
      mode = "fallback-llm"; // 标记 fallback 模式
      fallbackTriggered = true; // 标记已触发 fallback
    }
  }
  const retrievalDurationMs = Date.now() - startedAt; // 计算耗时
  return {
    originalQuery: query, // 返回原始问题
    rewrittenQueries, // 返回实际 queries
    retrievedChunks: hits, // 返回命中 chunks
    mode, // 返回模式
    ambiguous, // 返回模糊标记
    memoryUsed: memory.length > 0, // 返回是否使用记忆
    recentMessagesUsed: recentMessages.length > 0, // 返回是否使用最近消息
    knowledgeTopicsUsed: knowledgeTopics, // 返回主题列表
    fallbackTriggered, // 返回 fallback 标记
    metrics: {
      totalQueries: rewrittenQueries.length, // query 数量
      rewriteMode: mode, // 改写模式
      usedMemory: memory.length > 0, // 是否使用记忆
      usedRecentMessages: recentMessages.length > 0, // 是否使用最近消息
      fallbackTriggered, // 是否 fallback
      retrievalDurationMs, // 检索耗时
    },
  }; // 返回完整 pipeline 结果
}

