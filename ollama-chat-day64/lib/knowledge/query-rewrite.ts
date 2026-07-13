/**
 * 第28天：Memory-aware Query Rewrite —— 规则兜底 + LLM 上下文改写。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime"; // 引入模型调用函数与运行时类型
import type { RetrievalMemoryItem, RetrievalRecentMessage } from "@/lib/knowledge/knowledge-types"; // 引入检索上下文类型
import { promptRegistry } from "@/lib/prompts/default-prompts"; // 第52天：引入共享 PromptRegistry（提示词注册表）
import { safeRenderPrompt } from "@/lib/prompts/prompt-renderer"; // 第52天：引入安全 Prompt Renderer（提示词渲染器）

/** Query Rewrite 工具输出结构。 */
export type QueryRewriteResult = {
  originalQuery: string; // 原始用户问题
  queries: string[]; // 改写后的检索查询列表
  strategy: "rule" | "llm" | "llm-fallback-rule"; // 本次使用的改写策略
}; // QueryRewriteResult 结束

/** 第28天：Query Rewrite 输入结构，允许携带记忆和知识库主题。 */
export type QueryRewriteInput = {
  query: string; // 当前用户问题
  memory?: RetrievalMemoryItem[]; // 长期记忆条目
  recentMessages?: RetrievalRecentMessage[]; // 最近对话消息
  knowledgeTopics?: string[]; // 知识库文档主题
  maxQueries?: number; // 最多生成 query 数量
}; // QueryRewriteInput 结束

/** 默认最多生成的检索查询数量。 */
export const DEFAULT_MAX_REWRITE_QUERIES = 5; // 默认保留 5 条 query

/** 第28天：上下文依赖 / 省略表达关键词。 */
const AMBIGUOUS_WORDS = ["它", "这个", "那个", "之前", "刚刚", "区别", "继续", "上面", "前面"]; // 模糊查询触发词

/** 第28天：判断 query 是否需要借助 Memory / 最近对话补全指代。 */
export function isAmbiguousQuery(query: string): boolean {
  const q = query.trim(); // 规整输入
  if (!q) return false; // 空 query 不判定为模糊
  return q.length < 20 || AMBIGUOUS_WORDS.some((word) => q.includes(word)); // 短问题或含指代词即视为模糊
}

/** 清理 query 并去重。 */
function normalizeQueries(queries: string[], maxQueries: number): string[] {
  const seen = new Set<string>(); // 用 Set 保持去重后的插入顺序
  for (const query of queries) {
    const trimmed = query.trim(); // 去掉首尾空白
    if (!trimmed) continue; // 空 query 跳过
    const key = trimmed.toLowerCase(); // 小写作为去重键
    if (seen.has(key)) continue; // 已出现则跳过
    seen.add(key); // 记录去重键
  }
  return Array.from(seen).slice(0, Math.max(1, maxQueries)); // 返回最多 maxQueries 条
}

/** 第27天：规则版 query rewrite，优先覆盖学习项目里的常见概念。 */
export function rewriteQueryByRules(query: string, maxQueries = DEFAULT_MAX_REWRITE_QUERIES): string[] {
  const q = query.trim(); // 规整原始问题
  const lowered = q.toLowerCase(); // 小写文本用于英文关键词匹配
  const queries: string[] = [q]; // 始终保留原始 query
  if (q.includes("人工确认") || lowered.includes("hitl") || q.includes("确认节点")) {
    queries.push("HITL human in the loop 人工确认"); // 命中人工确认概念时补充英文缩写
    queries.push("waiting_confirmation 用户确认 工作流"); // 补充状态机关键词
    queries.push("Agent 关键步骤 暂停 等待用户确认"); // 补充机制描述
  }
  if (q.includes("工作流") || lowered.includes("workflow")) {
    queries.push("Workflow Runtime DAG 执行 依赖"); // 补充工作流运行时关键词
    queries.push("工作流 状态机 执行步骤 dependsOn"); // 补充依赖字段与状态机
  }
  if (q.includes("工具") || lowered.includes("tool")) {
    queries.push("Tool Registry Capability Routing"); // 补充工具注册英文术语
    queries.push("工具注册 工具能力 路由"); // 补充中文检索表达
  }
  if (q.includes("记忆") || lowered.includes("memory")) {
    queries.push("Memory longTerm shortTerm Summary Memory"); // 补充记忆相关英文术语
    queries.push("长期记忆 短期记忆 摘要记忆"); // 补充中文同义表达
  }
  if (q.includes("知识") || q.includes("检索") || lowered.includes("rag")) {
    queries.push("RAG Retrieval chunk embedding recall rerank"); // 补充 RAG 检索术语
    queries.push("知识库 检索增强 片段 向量 召回 重排"); // 补充中文检索链路
  }
  return normalizeQueries(queries, maxQueries); // 返回去重后的规则改写结果
}

/** 从 LLM 输出中解析 JSON queries 字段。 */
function parseLlmQueries(raw: string): string[] {
  try {
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw; // 优先提取 JSON 对象
    const parsed = JSON.parse(jsonText) as { queries?: unknown }; // 解析模型输出
    if (!Array.isArray(parsed.queries)) return []; // queries 不是数组则失败
    return parsed.queries.filter((item): item is string => typeof item === "string"); // 仅保留字符串
  } catch {
    return []; // 解析失败返回空数组
  }
}

/** 第28天：把长期记忆压缩成适合 Prompt 的文本。 */
function formatMemoryForRewrite(memory: RetrievalMemoryItem[] = []): string {
  return memory
    .slice(-8) // 只取最近 8 条，避免 Prompt 过长
    .map((item, index) => `${index + 1}. ${item.importance ?? "low"}：${item.content}`) // 标记重要程度
    .join("\n") || "（无长期记忆）"; // 无记忆时给明确占位
}

/** 第28天：把最近消息压缩成适合 Prompt 的文本。 */
function formatRecentMessagesForRewrite(messages: RetrievalRecentMessage[] = []): string {
  return messages
    .slice(-8) // 只取最近 8 条消息
    .map((message, index) => `${index + 1}. ${message.role}：${message.content}`) // 保留角色和正文
    .join("\n") || "（无最近对话）"; // 无消息时给明确占位
}

/** 第28天：把知识库主题压缩成适合 Prompt 的文本。 */
function formatKnowledgeTopicsForRewrite(topics: string[] = []): string {
  return topics
    .map((topic) => topic.trim()) // 清理标题空白
    .filter(Boolean) // 移除空标题
    .slice(0, 12) // 限制主题数量
    .join("；") || "（无知识库主题）"; // 无主题时给明确占位
}

/** 第27天：LLM 版 query rewrite，失败时由调用方回退到规则版。 */
export async function rewriteQueryWithLlm(
  query: string,
  rt: ModelRuntime,
  maxQueries = DEFAULT_MAX_REWRITE_QUERIES,
  context: Omit<QueryRewriteInput, "query" | "maxQueries"> = {}
): Promise<string[]> {
  const memoryText = formatMemoryForRewrite(context.memory); // 第28天：格式化长期记忆
  const recentText = formatRecentMessagesForRewrite(context.recentMessages); // 第28天：格式化最近对话
  const topicsText = formatKnowledgeTopicsForRewrite(context.knowledgeTopics); // 第28天：格式化知识主题
  const fallbackPrompt = `
你是一个 RAG 检索查询改写器。

请根据用户当前问题、长期记忆、最近对话和知识库主题，生成 3-5 个适合知识库检索的 query。

要求：
1. 解决代词、指代、省略和上下文依赖表达
2. 保留原始问题意图
3. 包含中英文关键词和可能的专业术语
4. 只返回 JSON

格式：
{
  "queries": ["...", "..."]
}

用户问题：
${query.trim()}

长期记忆：
${memoryText}

最近对话：
${recentText}

知识库主题：
${topicsText}
`.trim(); // 组装严格 JSON 提示词
  const promptTemplate = promptRegistry.getActive("queryRewrite"); // 第52天：读取 queryRewrite 工具当前 active 提示词模板
  const prompt = safeRenderPrompt(promptTemplate, { task: query.trim(), memory: `${memoryText}\n\n最近对话：\n${recentText}`, workspace: topicsText }, fallbackPrompt); // 第52天：使用注册表提示词渲染查询改写 Prompt，失败时回退旧模板
  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用 LLM
  if (!ok) return []; // 模型不可用时返回空数组
  return normalizeQueries([query, ...parseLlmQueries(text)], maxQueries); // 合并原问题并去重
}

/** 第27天：优先 LLM，失败或结果不足时回退到规则版。 */
export async function rewriteQueryWithFallback(
  query: string,
  rt: ModelRuntime,
  maxQueries = DEFAULT_MAX_REWRITE_QUERIES,
  context: Omit<QueryRewriteInput, "query" | "maxQueries"> = {}
): Promise<QueryRewriteResult> {
  const q = query.trim(); // 规整原始问题
  const llmQueries = await rewriteQueryWithLlm(q, rt, maxQueries, context); // 尝试 LLM 改写
  if (llmQueries.length > 1) {
    return { originalQuery: q, queries: llmQueries, strategy: "llm" }; // LLM 成功时返回
  }
  const ruleQueries = rewriteQueryByRules(q, maxQueries); // 生成规则兜底查询
  return {
    originalQuery: q, // 原始问题
    queries: ruleQueries, // 规则结果
    strategy: llmQueries.length === 1 ? "llm-fallback-rule" : "rule", // 标记回退原因
  }; // 返回兜底结果
}

