/**
 * 第24–25天：RAG 知识库核心类型 — Document / Chunk / 检索结果 / RAG V2 指标。
 */

/** 知识库中的单个文本块（RAG 检索粒度，含位置元数据）。 */
export type KnowledgeChunk = {
  id: string; // 块唯一 id
  documentId: string; // 所属文档 id
  text: string; // 块正文
  embedding?: number[]; // Ollama 生成的向量（可选，导入后填充）
  index: number; // 第25天：块在文档中的序号（从 0 起）
  startOffset: number; // 第25天：在原文中的起始字符偏移
  endOffset: number; // 第25天：在原文中的结束字符偏移（不含）
  tokenEstimate?: number; // 第25天：粗略 token 估计（字符数 / 4）
};

/** 用户导入的一篇知识文档（含切块列表）。 */
export type KnowledgeDocument = {
  id: string; // 文档唯一 id
  title: string; // 展示标题
  content: string; // 原始全文
  chunks: KnowledgeChunk[]; // 切块 + embedding + metadata
  createdAt: number; // 创建时间戳（毫秒）
};

/** 第25天：检索调用参数（TopK + 相似度阈值）。 */
export type RetrieveOptions = {
  topK: number; // 返回的最大条数
  minScore?: number; // 最低余弦相似度（默认 0.3），低于则过滤
};

/** 向量检索命中的一条结果（供 Tool / UI 展示）。 */
export type RetrievedChunkHit = {
  chunkId: string; // 块 id
  documentId: string; // 文档 id
  documentTitle: string; // 文档标题
  text: string; // 块文本
  score: number; // 余弦相似度 0–1
  chunkIndex: number; // 第25天：块序号
  startOffset: number; // 第25天：原文起始偏移
  endOffset: number; // 第25天：原文结束偏移
};

/** 第25天：RAG 检索运行时指标（可观测性）。 */
export type RetrievalMetrics = {
  queryCount: number; // 检索请求累计次数
  avgTopScore: number; // 历次检索最高分的平均值
  noResultCount: number; // 过滤后无合格命中的次数
  avgRetrievedChunks: number; // 每次检索平均返回块数
};

/** 知识库运行时指标快照（含第25天 RAG 指标）。 */
export type KnowledgeMetricsSnapshot = {
  documents: number; // 文档总数
  chunks: number; // 切块总数
  avgChunkSize: number; // 平均块字符数（取整）
  retrievalCount: number; // 兼容第24天：同 queryCount
  retrieval: RetrievalMetrics; // 第25天：RAG 质量指标
};

/** 第25天：RAG 问答结果（含无知识 fallback）。 */
export type RagAnswerResult = {
  answer: string; // 模型回答或 fallback 文案
  hits: RetrievedChunkHit[]; // 实际注入 Prompt 的片段（可能为空）
  usedFallback: boolean; // 是否因无合格 chunk 而走 fallback
};
