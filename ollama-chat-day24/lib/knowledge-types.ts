/**
 * 第24天：RAG 知识库核心类型 — Document / Chunk / 检索结果。
 */

/** 知识库中的单个文本块（RAG 检索粒度）。 */
export type KnowledgeChunk = {
  id: string; // 块唯一 id
  documentId: string; // 所属文档 id
  text: string; // 块正文
  embedding?: number[]; // Ollama 生成的向量（可选，导入后填充）
};

/** 用户导入的一篇知识文档（含切块列表）。 */
export type KnowledgeDocument = {
  id: string; // 文档唯一 id
  title: string; // 展示标题
  content: string; // 原始全文
  chunks: KnowledgeChunk[]; // 切块 + embedding
  createdAt: number; // 创建时间戳（毫秒）
};

/** 向量检索命中的一条结果（供 Tool / UI 展示）。 */
export type RetrievedChunkHit = {
  chunkId: string; // 块 id
  documentId: string; // 文档 id
  documentTitle: string; // 文档标题
  text: string; // 块文本
  score: number; // 余弦相似度 0–1
};

/** 知识库运行时指标快照。 */
export type KnowledgeMetricsSnapshot = {
  documents: number; // 文档总数
  chunks: number; // 切块总数
  avgChunkSize: number; // 平均块字符数（取整）
  retrievalCount: number; // 检索调用累计次数
};
