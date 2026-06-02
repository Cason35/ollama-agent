/**
 * 第27天：Query Rewrite —— 规则兜底 + LLM 改写，给 Multi-Query Retrieval 扩大召回入口。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime"; // 引入模型调用函数与运行时类型

/** Query Rewrite 工具输出结构。 */
export type QueryRewriteResult = {
  originalQuery: string; // 原始用户问题
  queries: string[]; // 改写后的检索查询列表
  strategy: "rule" | "llm" | "llm-fallback-rule"; // 本次使用的改写策略
}; // QueryRewriteResult 结束

/** 默认最多生成的检索查询数量。 */
export const DEFAULT_MAX_REWRITE_QUERIES = 5; // 默认保留 5 条 query

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

/** 第27天：LLM 版 query rewrite，失败时由调用方回退到规则版。 */
export async function rewriteQueryWithLlm(
  query: string,
  rt: ModelRuntime,
  maxQueries = DEFAULT_MAX_REWRITE_QUERIES
): Promise<string[]> {
  const prompt = `
你是一个检索查询改写器。

请把用户问题改写成 3-5 个适合知识库检索的查询。

要求：
1. 保留原始问题含义
2. 包含中英文关键词
3. 包含可能的专业术语
4. 只返回 JSON

格式：
{
  "queries": ["...", "..."]
}

用户问题：
${query.trim()}
`.trim(); // 组装严格 JSON 提示词
  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用 LLM
  if (!ok) return []; // 模型不可用时返回空数组
  return normalizeQueries([query, ...parseLlmQueries(text)], maxQueries); // 合并原问题并去重
}

/** 第27天：优先 LLM，失败或结果不足时回退到规则版。 */
export async function rewriteQueryWithFallback(
  query: string,
  rt: ModelRuntime,
  maxQueries = DEFAULT_MAX_REWRITE_QUERIES
): Promise<QueryRewriteResult> {
  const q = query.trim(); // 规整原始问题
  const llmQueries = await rewriteQueryWithLlm(q, rt, maxQueries); // 尝试 LLM 改写
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
