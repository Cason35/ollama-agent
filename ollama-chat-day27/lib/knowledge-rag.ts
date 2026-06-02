/**
 * 第27天：RAG Prompt V4 — 严谨低幻觉 Prompt + Multi-Query matchedQueries + fallback。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime"; // LLM 调用
import type { RagAnswerResult, RetrievedChunkHit } from "@/lib/knowledge-types"; // 类型

/** 无合格知识片段时的固定 fallback 回答（不硬塞低相关 chunk）。 */
export const RAG_NO_KNOWLEDGE_FALLBACK =
  "知识库中没有找到足够相关的信息，我只能基于当前对话回答。"; // 第25天 fallback 文案

/**
 * 将 TopK 知识片段格式化为 Prompt 中的「知识片段」区块（含多种 score / 来源 / 块序号）。
 * @param hits 检索结果
 */
export function formatChunksForPrompt(hits: RetrievedChunkHit[]): string {
  if (hits.length === 0) return "（无达到相似度阈值的知识片段）"; // 无命中提示
  return hits
    .map((h, i) => {
      const header = `[Chunk ${i + 1}]
score: ${h.score}
vectorScore: ${h.vectorScore}
keywordScore: ${h.keywordScore}
hybridScore: ${h.hybridScore}
rerankScore: ${h.rerankScore}
finalRank: ${h.finalRank}
matchedQueries: ${(h.matchedQueries ?? []).join(" | ") || "无"}
source: ${h.documentTitle} (chunk #${h.chunkIndex}, offset ${h.startOffset}-${h.endOffset})`; // 带来源元数据
      return `${header}\n${h.text}`; // 拼接块正文
    })
    .join("\n\n"); // 块之间空行分隔
}

/**
 * 第25天：构建严谨 RAG Prompt（规则 + 知识片段 + 用户问题）。
 * @param question 用户问题
 * @param hits 检索到的 chunks
 */
export function buildRagPrompt(question: string, hits: RetrievedChunkHit[]): string {
  const chunksBlock = formatChunksForPrompt(hits); // 格式化片段
  const usedChunkIds = hits.map((h, i) => `Chunk ${i + 1} (${h.chunkId}, rerank ${h.rerankScore})`).join("; "); // 引用列表
  return `
你是一个严谨的知识库问答助手。

【回答规则】
1. 优先基于知识片段回答
2. 如果知识片段不足，请明确说明「知识不足」
3. 不要编造知识片段中不存在的信息
4. 回答要简洁清晰
5. 回答末尾用一行列出你实际参考的片段编号（格式：参考片段：...）

【知识片段】
${chunksBlock}

【用户问题】
${question.trim()}

【系统提示】以下片段已注入，请在回答末尾标注参考：${usedChunkIds || "无"}
`.trim(); // 去掉首尾空白
}

/**
 * 第25天：执行 RAG 问答 — 无合格 chunk 时直接 fallback，不调用 LLM 硬编。
 * @param question 用户问题
 * @param hits 经 minScore 过滤后的命中列表
 * @param rt 模型运行时
 */
export async function executeRagAnswer(
  question: string,
  hits: RetrievedChunkHit[],
  rt: ModelRuntime
): Promise<RagAnswerResult> {
  if (hits.length === 0) {
    return {
      answer: RAG_NO_KNOWLEDGE_FALLBACK, // 无结果 fallback
      hits: [], // 空引用
      usedFallback: true, // 标记走了 fallback
    }; // 早返回，避免污染 Prompt
  }
  const ragPrompt = buildRagPrompt(question, hits); // RAG 动态上下文注入
  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: ragPrompt }]); // 调 LLM
  if (!ok) {
    return {
      answer: "模型暂不可用，无法基于知识库回答。", // 模型降级
      hits, // 仍返回 hits 供 UI
      usedFallback: false, // 非知识库 fallback
    }; // 降级对象
  }
  return {
    answer: text.trim(), // 成功回答
    hits, // 引用片段
    usedFallback: false, // 正常 RAG
  }; // 成功对象
}
