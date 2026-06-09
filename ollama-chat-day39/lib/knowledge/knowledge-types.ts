/** 第30天：RAG Runtime V7 的知识库与向量库共享类型。 */

/** 第30天：向量存储服务提供方枚举，为以后切换 Pinecone / Weaviate / Milvus 预留。 */
export type VectorStoreProvider = "local" | "pinecone" | "weaviate" | "milvus"; // 当前只实现 local

/** 第30天：向量记录中的元数据，负责把向量映射回知识片段。 */
export type VectorRecordMetadata = {
  chunkId: string; // 片段 id
  documentId: string; // 文档 id
}; // VectorRecordMetadata 结束

/** 第30天：写入 VectorStore 的单条向量记录。 */
export type VectorRecord = {
  id: string; // 向量记录 id，当前与 chunkId 保持一致
  embedding: number[]; // embedding 向量
  metadata: VectorRecordMetadata; // 回查 KnowledgeStore 所需元数据
  createdAt: number; // 创建时间戳
  updatedAt: number; // 更新时间戳
}; // VectorRecord 结束

/** 第30天：VectorStore 查询过滤条件。 */
export type VectorQueryFilter = {
  documentId?: string; // 只检索指定文档
}; // VectorQueryFilter 结束

/** 第30天：VectorStore 查询命中结构。 */
export type VectorMatch = {
  id: string; // 命中的向量记录 id
  score: number; // 余弦相似度分数
  metadata: VectorRecordMetadata; // 回查知识片段所需元数据
}; // VectorMatch 结束

/** 第30天：VectorStore 运行指标。 */
export type VectorStats = {
  provider: VectorStoreProvider; // 当前向量库 provider
  vectorCount: number; // 向量总数
  avgEmbeddingDimension: number; // 平均向量维度
  queryCount: number; // 查询次数
  avgQueryDuration: number; // 平均查询耗时，单位毫秒
}; // VectorStats 结束

/** 第30天：Vector Explorer 展示用摘要。 */
export type VectorRecordSummary = {
  id: string; // 向量记录 id
  chunkId: string; // 片段 id
  documentId: string; // 文档 id
  dimension: number; // 向量维度
  createdAt: number; // 创建时间戳
  updatedAt: number; // 更新时间戳
}; // VectorRecordSummary 结束

/** 第30天：VectorStore 标准接口。 */
export type VectorStore = {
  upsert(vectors: VectorRecord[]): Promise<void>; // 插入或更新向量
  query(embedding: number[], topK: number, filter?: VectorQueryFilter): Promise<VectorMatch[]>; // 查询近邻向量
  delete(ids: string[]): Promise<void>; // 删除向量
  stats(): Promise<VectorStats>; // 读取向量指标
}; // VectorStore 结束

/** 第30天：知识库中的单个文本片段，embedding 已迁移到 VectorStore。 */
export type KnowledgeChunk = {
  id: string; // 片段唯一 id
  documentId: string; // 所属文档 id
  chunkHash: string; // 片段内容 hash，用于增量索引复用
  text: string; // 片段正文
  index: number; // 片段在文档中的顺序
  startOffset: number; // 片段在原文中的起始偏移
  endOffset: number; // 片段在原文中的结束偏移
  tokenEstimate?: number; // 粗略 token 估算
}; // KnowledgeChunk 结束

/** 用户导入的一篇知识文档。 */
export type KnowledgeDocument = {
  id: string; // 文档唯一 id
  title: string; // 文档标题
  content: string; // 原始全文
  contentHash: string; // 正文 hash
  version: number; // 文档版本
  chunks: KnowledgeChunk[]; // 文本片段列表
  createdAt: number; // 创建时间戳
  updatedAt: number; // 更新时间戳
}; // KnowledgeDocument 结束

/** 第29-30天：增量导入统计结果。 */
export type IncrementalIndexStats = {
  documentId: string; // 文档 id
  title: string; // 文档标题
  version: number; // 导入后的版本号
  unchangedDocument: boolean; // 文档正文是否完全未变
  totalChunks: number; // 当前片段总数
  addedChunks: number; // 新增片段数
  updatedChunks: number; // 更新片段数
  reusedChunks: number; // 复用片段数
  removedChunks: number; // 删除片段数
  cachedEmbeddings: number; // 从缓存复用的 embedding 数
  generatedEmbeddings: number; // 新生成的 embedding 数
  upsertedVectors: number; // 第30天：写入 VectorStore 的向量数
  deletedVectors: number; // 第30天：从 VectorStore 删除的向量数
  cacheHitRate: number; // 缓存命中率
  forcedReindex: boolean; // 是否强制重建
}; // IncrementalIndexStats 结束

/** 检索模式。 */
export type RetrievalMode = "vector" | "keyword" | "hybrid"; // 三种检索模式

/** 检索可用的长期记忆条目。 */
export type RetrievalMemoryItem = {
  content: string; // 记忆正文
  importance?: "high" | "low"; // 重要程度
}; // RetrievalMemoryItem 结束

/** 检索可用的最近对话消息。 */
export type RetrievalRecentMessage = {
  role: string; // 消息角色
  content: string; // 消息正文
}; // RetrievalRecentMessage 结束

/** 检索参数。 */
export type RetrieveOptions = {
  recallK: number; // 第一阶段召回数
  topK: number; // 最终返回数
  minScore: number; // 最低最终分
  mode: RetrievalMode; // 检索模式
  documentId?: string; // 第30天：限定检索某篇文档
  enableQueryRewrite?: boolean; // 是否启用 query rewrite
  maxQueries?: number; // 最多保留多少条改写 query
  memory?: RetrievalMemoryItem[]; // 长期记忆上下文
  recentMessages?: RetrievalRecentMessage[]; // 最近对话上下文
  knowledgeTopics?: string[]; // 知识库主题上下文
}; // RetrieveOptions 结束

/** Query Rewrite 调试信息。 */
export type QueryRewriteDebug = {
  originalQuery: string; // 原始问题
  rewrittenQueries: string[]; // 实际检索 queries
  rewriteCount: number; // query 数量
  ambiguous?: boolean; // 是否模糊
  rewriteMode?: "rule" | "llm" | "fallback-llm" | "disabled"; // 改写模式
  usedMemory?: boolean; // 是否使用长期记忆
  usedRecentMessages?: boolean; // 是否使用最近对话
  knowledgeTopicsUsed?: string[]; // 使用过的知识库主题
}; // QueryRewriteDebug 结束

/** 检索命中结构。 */
export type RetrievedChunkHit = {
  chunkId: string; // 片段 id
  documentId: string; // 文档 id
  documentTitle: string; // 文档标题
  text: string; // 片段正文
  score: number; // 最终分
  vectorScore: number; // 向量分
  keywordScore: number; // 关键词分
  hybridScore: number; // 混合分
  rerankScore: number; // 重排分
  finalRank: number; // 最终排名
  retrievalMode: RetrievalMode; // 检索模式
  matchedQueries?: string[]; // 命中过该片段的 query 列表
  chunkIndex: number; // 片段序号
  startOffset: number; // 原文起始偏移
  endOffset: number; // 原文结束偏移
}; // RetrievedChunkHit 结束

/** RAG 检索运行时指标。 */
export type RetrievalMetrics = {
  queryCount: number; // 检索请求次数
  avgTopScore: number; // 平均最高分
  noResultCount: number; // 无结果次数
  avgRetrievedChunks: number; // 平均返回片段数
}; // RetrievalMetrics 结束

/** Retrieval Pipeline 单次运行指标。 */
export type PipelineMetrics = {
  totalQueries: number; // 本次实际 query 数
  rewriteMode: string; // 本次改写模式
  usedMemory: boolean; // 是否使用记忆
  usedRecentMessages: boolean; // 是否使用最近消息
  fallbackTriggered: boolean; // 是否触发 fallback
  retrievalDurationMs: number; // 本次检索耗时
}; // PipelineMetrics 结束

/** Query Rewrite 累计指标。 */
export type QueryRewriteMetrics = {
  rewriteCount: number; // 累计 rewrite 次数
  avgGeneratedQueries: number; // 平均生成 query 数
  multiQueryHitRate: number; // 多 query 命中率
  improvedTop1Count: number; // Top1 改善次数
  fallbackTriggeredCount?: number; // fallback 次数
  avgRetrievalDurationMs?: number; // 平均检索耗时
}; // QueryRewriteMetrics 结束

/** 第29-30天：知识库索引指标。 */
export type KnowledgeIndexMetrics = {
  documentsCount: number; // 文档数量
  chunksCount: number; // 片段数量
  cachedEmbeddings: number; // 缓存复用 embedding 数
  generatedEmbeddings: number; // 新生成 embedding 数
  cacheHitRate: number; // 缓存命中率
  avgChunksPerDoc: number; // 平均每篇文档片段数
  lastIndexStats?: IncrementalIndexStats | null; // 最近一次索引统计
}; // KnowledgeIndexMetrics 结束

/** 知识库运行指标快照。 */
export type KnowledgeMetricsSnapshot = {
  documents: number; // 文档总数
  chunks: number; // 片段总数
  avgChunkSize: number; // 平均片段字符数
  retrievalCount: number; // 检索次数
  retrieval: RetrievalMetrics; // 检索质量指标
  queryRewrite: QueryRewriteMetrics; // 改写质量指标
  index: KnowledgeIndexMetrics; // 索引指标
  vector: VectorStats; // 第30天：向量库指标
}; // KnowledgeMetricsSnapshot 结束

/** Knowledge Explorer 的片段摘要。 */
export type KnowledgeChunkSummary = {
  id: string; // 片段 id
  index: number; // 片段序号
  chunkHash: string; // 短 hash
  hasVector: boolean; // 第30天：是否存在向量记录
  hasEmbedding: boolean; // 兼容旧 UI 字段
  startOffset: number; // 起始偏移
  endOffset: number; // 结束偏移
  preview: string; // 文本预览
}; // KnowledgeChunkSummary 结束

/** Knowledge Explorer 的文档摘要。 */
export type KnowledgeDocumentSummary = {
  id: string; // 文档 id
  title: string; // 标题
  version: number; // 版本
  contentHash: string; // 短正文 hash
  chunkCount: number; // 片段数
  createdAt: number; // 创建时间
  updatedAt: number; // 更新时间
  preview: string; // 正文预览
  chunks: KnowledgeChunkSummary[]; // 片段摘要
}; // KnowledgeDocumentSummary 结束

/** RAG 问答结果。 */
export type RagAnswerResult = {
  answer: string; // 模型回答或 fallback 文案
  hits: RetrievedChunkHit[]; // 注入 Prompt 的片段
  usedFallback: boolean; // 是否使用 fallback
}; // RagAnswerResult 结束
