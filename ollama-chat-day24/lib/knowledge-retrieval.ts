/**
 * 第24天：向量检索 — 余弦相似度 + TopK。
 */
import { embedText } from "@/lib/knowledge-embedding"; // 查询向量
import type { KnowledgeChunk, KnowledgeDocument, RetrievedChunkHit } from "@/lib/knowledge-types"; // 类型

/** 默认检索返回条数。 */
export const DEFAULT_RETRIEVAL_TOP_K = 3; // Top 3 chunks

/**
 * 计算两向量的余弦相似度（0–1，越大越相似）。
 * @param a 向量 a
 * @param b 向量 b
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0; // 维度不一致返回 0
  let dot = 0; // 点积累加
  let normA = 0; // a 的 L2 范数平方
  let normB = 0; // b 的 L2 范数平方
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]; // 点积项
    normA += a[i] * a[i]; // a 平方和
    normB += b[i] * b[i]; // b 平方和
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB); // 分母
  if (denom === 0) return 0; // 零向量无法比较
  const sim = dot / denom; // 原始余弦值 -1~1
  return Math.max(0, Math.min(1, (sim + 1) / 2)); // 映射到 0–1 便于 UI 展示
}

/** 内部：带文档元信息的可评分块。 */
type ScoredChunkRow = {
  chunk: KnowledgeChunk; // 块实体
  document: KnowledgeDocument; // 所属文档
  score: number; // 相似度
};

/**
 * 在文档集合中按 query 文本做语义检索，返回 TopK 命中。
 * @param query 用户问题
 * @param documents 知识库全文档
 * @param topK 返回条数
 */
export async function retrieveTopChunks(
  query: string,
  documents: KnowledgeDocument[],
  topK: number = DEFAULT_RETRIEVAL_TOP_K
): Promise<RetrievedChunkHit[]> {
  const q = query.trim(); // 规范化查询
  if (!q) return []; // 空查询无结果
  const queryEmbedding = await embedText(q); // 查询向量
  const rows: ScoredChunkRow[] = []; // 全部可评分行
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue; // 跳过未嵌入块
      const score = cosineSimilarity(queryEmbedding, chunk.embedding); // 算相似度
      rows.push({ chunk, document: doc, score }); // 收集
    }
  }
  rows.sort((a, b) => b.score - a.score); // 按分数降序
  return rows.slice(0, topK).map((row) => ({
    chunkId: row.chunk.id, // 块 id
    documentId: row.document.id, // 文档 id
    documentTitle: row.document.title, // 标题
    text: row.chunk.text, // 块文本
    score: Math.round(row.score * 1000) / 1000, // 保留三位小数
  })); // 转为对外命中结构
}
