/**
 * 第29天：RAG Runtime V6 的知识库核心类型。
 */

/** 知识库中的单个文本片段，负责承载检索粒度和增量索引指纹。 */
export type KnowledgeChunk = {
  id: string; // 片段唯一 id
  documentId: string; // 所属文档 id
  chunkHash: string; // 第29天：片段内容哈希，用于判断是否可复用 embedding
  text: string; // 片段正文
  embedding?: number[]; // Ollama 生成的向量，导入或缓存命中后写入
  index: number; // 片段在文档中的序号，从 0 开始
  startOffset: number; // 片段在原文中的起始字符偏移
  endOffset: number; // 片段在原文中的结束字符偏移，不含该位置
  tokenEstimate?: number; // 粗略 token 估算，便于观察 chunk 大小
};

/** 用户导入的一篇知识文档，包含版本、正文哈希和片段列表。 */
export type KnowledgeDocument = {
  id: string; // 文档唯一 id
  title: string; // 展示标题
  content: string; // 原始全文
  contentHash: string; // 第29天：正文 SHA256 哈希，用于判断文档是否变化
  version: number; // 第29天：同名文档每次内容变化后递增
  chunks: KnowledgeChunk[]; // 切块 + embedding + metadata
  createdAt: number; // 创建时间戳，毫秒
  updatedAt: number; // 更新时间戳，毫秒
};

/** 第29天：增量导入的统计结果。 */
export type IncrementalIndexStats = {
  documentId: string; // 被导入或更新的文档 id
  title: string; // 文档标题
  version: number; // 导入后的文档版本
  unchangedDocument: boolean; // 正文是否完全未变化
  totalChunks: number; // 导入后文档总片段数
  addedChunks: number; // 新增片段数量
  updatedChunks: number; // 变化片段数量
  reusedChunks: number; // 复用旧片段数量
  removedChunks: number; // 被移除的旧片段数量
  cachedEmbeddings: number; // 从 embeddingCache 复用的向量数
  generatedEmbeddings: number; // 新生成的向量数
  cacheHitRate: number; // 本次导入缓存命中率，0 到 1
  forcedReindex: boolean; // 是否为强制重建索引
};

/** 第27天：检索模式，支持向量、关键词、混合三种排序方式。 */
export type RetrievalMode = "vector" | "keyword" | "hybrid"; // 检索模式枚举

/** 第28天：检索链路可用的轻量记忆条目。 */
export type RetrievalMemoryItem = {
  content: string; // 记忆正文
  importance?: "high" | "low"; // 记忆重要程度，可选兼容旧数据
};

/** 第28天：检索链路可用的最近对话消息。 */
export type RetrievalRecentMessage = {
  role: string; // 消息角色
  content: string; // 消息正文
};

/** 第28天：检索调用参数。 */
export type RetrieveOptions = {
  recallK: number; // 第一阶段召回的候选数量
  topK: number; // 最终返回的最大条数
  minScore: number; // 最低最终得分阈值
  mode: RetrievalMode; // 检索排序模式
  enableQueryRewrite?: boolean; // 是否启用 query rewrite + multi-query
  maxQueries?: number; // 最多保留多少条改写 query
  memory?: RetrievalMemoryItem[]; // 长期记忆上下文
  recentMessages?: RetrievalRecentMessage[]; // 最近对话上下文
  knowledgeTopics?: string[]; // 知识库主题上下文
};

/** 第28天：Query Rewrite 调试信息。 */
export type QueryRewriteDebug = {
  originalQuery: string; // 原始用户问题
  rewrittenQueries: string[]; // 实际用于检索的 query 列表
  rewriteCount: number; // 改写 query 数量
  ambiguous?: boolean; // 是否判定为模糊或上下文依赖查询
  rewriteMode?: "rule" | "llm" | "fallback-llm" | "disabled"; // 本次改写模式
  usedMemory?: boolean; // 是否使用长期记忆
  usedRecentMessages?: boolean; // 是否使用最近对话
  knowledgeTopicsUsed?: string[]; // 实际参与改写的知识库主题
};

/** 第27天：内部和外部共用的多分数检索结果。 */
export type RetrievedChunkHit = {
  chunkId: string; // 片段 id
  documentId: string; // 文档 id
  documentTitle: string; // 文档标题
  text: string; // 片段文本
  score: number; // 最终兼容分数
  vectorScore: number; // 向量相似度分数
  keywordScore: number; // 关键词命中分数
  hybridScore: number; // 混合分数
  rerankScore: number; // 重排后最终分数
  finalRank: number; // 最终排名，从 1 开始
  retrievalMode: RetrievalMode; // 本次使用的检索模式
  matchedQueries?: string[]; // 命中过该片段的 query 列表
  chunkIndex: number; // 片段序号
  startOffset: number; // 原文起始偏移
  endOffset: number; // 原文结束偏移
};

/** 第25天：RAG 检索运行时指标。 */
export type RetrievalMetrics = {
  queryCount: number; // 检索请求累计次数
  avgTopScore: number; // 历次检索最高分的平均值
  noResultCount: number; // 过滤后无合格命中的次数
  avgRetrievedChunks: number; // 每次检索平均返回片段数
};

/** 第28天：Retrieval Pipeline 单次运行指标。 */
export type PipelineMetrics = {
  totalQueries: number; // 本次实际检索 query 数量
  rewriteMode: string; // 本次改写模式
  usedMemory: boolean; // 本次是否使用长期记忆
  usedRecentMessages: boolean; // 本次是否使用最近对话
  fallbackTriggered: boolean; // 本次是否触发 LLM fallback
  retrievalDurationMs: number; // 本次检索总耗时
};

/** 第27天：Multi-Query Retrieval 指标。 */
export type QueryRewriteMetrics = {
  rewriteCount: number; // 累计触发 query rewrite 的次数
  avgGeneratedQueries: number; // 平均每次生成的 query 数量
  multiQueryHitRate: number; // 多 query 检索命中率
  improvedTop1Count: number; // Top1 被改写查询改善的次数
  fallbackTriggeredCount?: number; // 触发 LLM fallback 的累计次数
  avgRetrievalDurationMs?: number; // Pipeline 平均耗时
};

/** 第29天：Knowledge Store V2 指标。 */
export type KnowledgeIndexMetrics = {
  documentsCount: number; // 文档数量
  chunksCount: number; // 文本片段数量
  cachedEmbeddings: number; // 累计从缓存复用的向量数
  generatedEmbeddings: number; // 累计新生成的向量数
  cacheHitRate: number; // 累计缓存命中率，0 到 1
  avgChunksPerDoc: number; // 平均每篇文档片段数
  lastIndexStats?: IncrementalIndexStats | null; // 最近一次导入或重建的增量统计
};

/** 知识库运行时指标快照。 */
export type KnowledgeMetricsSnapshot = {
  documents: number; // 兼容旧 UI：文档总数
  chunks: number; // 兼容旧 UI：片段总数
  avgChunkSize: number; // 平均片段字符数
  retrievalCount: number; // 兼容旧 UI：检索次数
  retrieval: RetrievalMetrics; // RAG 质量指标
  queryRewrite: QueryRewriteMetrics; // Query Rewrite 质量指标
  index: KnowledgeIndexMetrics; // 第29天：索引与缓存指标
};

/** 第29天：Knowledge Explorer 的轻量片段摘要。 */
export type KnowledgeChunkSummary = {
  id: string; // 片段 id
  index: number; // 片段序号
  chunkHash: string; // 片段哈希
  hasEmbedding: boolean; // 是否已有向量
  startOffset: number; // 原文起始偏移
  endOffset: number; // 原文结束偏移
  preview: string; // 片段预览
};

/** 第29天：Knowledge Explorer 的文档摘要。 */
export type KnowledgeDocumentSummary = {
  id: string; // 文档 id
  title: string; // 标题
  version: number; // 文档版本
  contentHash: string; // 正文哈希
  chunkCount: number; // 片段数量
  createdAt: number; // 创建时间
  updatedAt: number; // 更新时间
  preview: string; // 正文预览
  chunks: KnowledgeChunkSummary[]; // 片段摘要列表
};

/** 第25天：RAG 问答结果。 */
export type RagAnswerResult = {
  answer: string; // 模型回答或 fallback 文案
  hits: RetrievedChunkHit[]; // 实际注入 Prompt 的片段
  usedFallback: boolean; // 是否因无合格片段而走 fallback
};
