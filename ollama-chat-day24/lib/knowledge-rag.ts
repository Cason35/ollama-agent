/**
 * 第24天：RAG Prompt 注入 — 将检索片段拼入 LLM 上下文。
 */
import type { RetrievedChunkHit } from "@/lib/knowledge-types"; // 检索命中类型

/**
 * 将 TopK 知识片段格式化为 Prompt 中的「知识片段」区块。
 * @param hits 检索结果
 */
export function formatChunksForPrompt(hits: RetrievedChunkHit[]): string {
  if (hits.length === 0) return "（知识库未命中相关片段）"; // 无命中提示
  return hits
    .map((h, i) => {
      const header = `${i + 1}. [${h.documentTitle}] (score: ${h.score}, doc: ${h.documentId})`; // 带来源与分数
      return `${header}\n${h.text}`; // 拼接块正文
    })
    .join("\n\n"); // 块之间空行分隔
}

/**
 * 构建 RAG 增强 Prompt：知识片段 + 用户问题（动态上下文注入）。
 * @param question 用户问题
 * @param hits 检索到的 chunks
 */
export function buildRagPrompt(question: string, hits: RetrievedChunkHit[]): string {
  const chunksBlock = formatChunksForPrompt(hits); // 格式化片段
  return `
请基于以下知识回答用户问题。若知识片段不足以回答，请明确说明并给出你能推断的部分。

【知识片段】
${chunksBlock}

【用户问题】
${question.trim()}
`.trim(); // 去掉首尾空白
}
