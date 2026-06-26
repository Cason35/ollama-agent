/** 第30天：RAG Runtime V7 检索层，向量召回改为通过 VectorStore 查询。 */
import { embedText } from "@/lib/knowledge/knowledge-embedding"; // 引入查询文本向量化函数
import { rewriteQueryByRules } from "@/lib/knowledge/query-rewrite"; // 引入规则版 query rewrite
import { localVectorStore } from "@/lib/knowledge/vector-store"; // 引入本地向量库单例
import type { KnowledgeChunk, KnowledgeDocument, QueryRewriteDebug, RetrievalMode, RetrieveOptions, RetrievedChunkHit } from "@/lib/knowledge/knowledge-types"; // 引入知识库检索类型

/** 默认第一阶段召回数量。 */
export const DEFAULT_RECALL_K = 20; // 默认召回 20 个候选片段

/** 默认最终返回数量。 */
export const DEFAULT_RETRIEVAL_TOP_K = 5; // 默认返回 5 个片段

/** 默认最低最终分数阈值。 */
export const DEFAULT_MIN_SCORE = 0.3; // 默认过滤低于 0.3 的候选

/** 默认检索模式。 */
export const DEFAULT_RETRIEVAL_MODE: RetrievalMode = "hybrid"; // 默认混合检索

/** Multi-Query 检索返回结构。 */
export type MultiQueryRetrieveResult = {
  hits: RetrievedChunkHit[]; // 最终命中片段
  rewrite: QueryRewriteDebug; // Query Rewrite 调试信息
}; // MultiQueryRetrieveResult 结束

/** 内部候选片段结构。 */
export type ScoredChunkRow = {
  chunk: KnowledgeChunk; // 命中的知识片段
  document: KnowledgeDocument; // 片段所属文档
  vectorScore: number; // 向量相似度分数
  keywordScore: number; // 关键词匹配分数
  hybridScore: number; // 混合分数
  rerankScore: number; // 重排分数
  matchedQueries: string[]; // 命中过该片段的 query 列表
}; // ScoredChunkRow 结束

/** 将分数保留三位小数。 */
function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000; // UI 展示避免过长小数
} // roundScore 结束

/** 将检索模式规整为合法枚举。 */
export function normalizeRetrievalMode(mode?: string): RetrievalMode {
  if (mode === "vector" || mode === "keyword" || mode === "hybrid") return mode; // 合法值直接返回
  return DEFAULT_RETRIEVAL_MODE; // 非法值回退到 hybrid
} // normalizeRetrievalMode 结束

/** 将查询拆成轻量关键词。 */
export function tokenizeQuery(query: string): string[] {
  return query // 返回链式处理结果
    .toLowerCase() // 统一小写
    .split(/[\s,.;:!?，。！？；：、（）()【】\[\]"'`]+/) // 按中英文标点切词
    .map((term) => term.trim()) // 去掉空白
    .filter(Boolean); // 移除空字符串
} // tokenizeQuery 结束

/** 计算简化版关键词分数。 */
export function keywordScore(query: string, text: string): number {
  const terms = tokenizeQuery(query); // 得到查询关键词
  if (terms.length === 0) return 0; // 无关键词时返回 0
  const loweredText = text.toLowerCase(); // 正文统一小写
  let matched = 0; // 命中词数量
  for (const term of terms) { // 遍历关键词
    if (loweredText.includes(term)) matched += 1; // 包含则计数
  } // for 结束
  return matched / Math.max(terms.length, 1); // 命中比例归一化
} // keywordScore 结束

/** 根据模式选择基础排序分数。 */
function modeScore(row: ScoredChunkRow, mode: RetrievalMode): number {
  if (mode === "vector") return row.vectorScore; // vector 模式按向量分
  if (mode === "keyword") return row.keywordScore; // keyword 模式按关键词分
  return row.hybridScore; // hybrid 模式按混合分
} // modeScore 结束

/** 根据 chunkId 建立 KnowledgeStore 回查索引。 */
function buildChunkLookup(documents: KnowledgeDocument[]): Map<string, { chunk: KnowledgeChunk; document: KnowledgeDocument }> {
  const lookup = new Map<string, { chunk: KnowledgeChunk; document: KnowledgeDocument }>(); // chunkId 到 chunk + doc
  for (const document of documents) { // 遍历文档
    for (const chunk of document.chunks) { // 遍历片段
      lookup.set(chunk.id, { chunk, document }); // 写入回查表
    } // chunk 循环结束
  } // document 循环结束
  return lookup; // 返回回查表
} // buildChunkLookup 结束

/** 规则重排：关键词命中给少量奖励。 */
export function rerank(query: string, rows: ScoredChunkRow[], mode: RetrievalMode): ScoredChunkRow[] {
  const terms = tokenizeQuery(query); // 查询词用于奖励
  return rows // 返回新数组
    .map((row) => { // 为每个候选加分
      const loweredText = row.chunk.text.toLowerCase(); // 片段正文小写
      let bonus = 0; // 初始奖励
      for (const term of terms) { // 遍历查询词
        if (loweredText.includes(term)) bonus += 0.05; // 命中词给奖励
      } // for 结束
      return { ...row, rerankScore: Math.min(1, modeScore(row, mode) + bonus) }; // 最终分钳制到 1
    }) // map 结束
    .sort((a, b) => b.rerankScore - a.rerankScore); // 降序排序
} // rerank 结束

/** 将内部候选转换为 API/UI 命中结构。 */
function toRetrievedHit(row: ScoredChunkRow, finalRank: number, mode: RetrievalMode): RetrievedChunkHit {
  return { // 返回命中对象
    chunkId: row.chunk.id, // 片段 id
    documentId: row.document.id, // 文档 id
    documentTitle: row.document.title, // 文档标题
    text: row.chunk.text, // 片段正文
    score: roundScore(row.rerankScore), // 最终分
    vectorScore: roundScore(row.vectorScore), // 向量分
    keywordScore: roundScore(row.keywordScore), // 关键词分
    hybridScore: roundScore(row.hybridScore), // 混合分
    rerankScore: roundScore(row.rerankScore), // 重排分
    finalRank, // 最终排名
    retrievalMode: mode, // 检索模式
    matchedQueries: row.matchedQueries, // 命中过的 queries
    chunkIndex: row.chunk.index ?? 0, // 片段序号
    startOffset: row.chunk.startOffset ?? 0, // 原文起始偏移
    endOffset: row.chunk.endOffset ?? row.chunk.text.length, // 原文结束偏移
  }; // return 结束
} // toRetrievedHit 结束

/** 第30天：对单个 query 通过 VectorStore 召回候选并回查 KnowledgeStore。 */
async function scoreChunksForQuery(query: string, documents: KnowledgeDocument[], options: Partial<RetrieveOptions>): Promise<ScoredChunkRow[]> {
  const recallK = Math.max(1, Math.min(50, Math.floor(options.recallK ?? DEFAULT_RECALL_K))); // 规整召回数
  const queryEmbedding = await embedText(query); // 只为查询生成一次向量
  const lookup = buildChunkLookup(documents); // 建立 chunk 回查表
  const vectorMatches = await localVectorStore.query(queryEmbedding, recallK, { documentId: options.documentId }); // 查询 VectorStore
  const rows: ScoredChunkRow[] = []; // 保存候选
  for (const match of vectorMatches) { // 遍历向量命中
    const found = lookup.get(match.metadata.chunkId); // 回查 KnowledgeStore
    if (!found) continue; // 找不到片段则跳过
    const literalScore = keywordScore(query, found.chunk.text); // 计算关键词分
    const hybridScore = match.score * 0.7 + literalScore * 0.3; // 计算混合分
    rows.push({ // 写入候选
      chunk: found.chunk, // 片段
      document: found.document, // 文档
      vectorScore: match.score, // 向量分
      keywordScore: literalScore, // 关键词分
      hybridScore, // 混合分
      rerankScore: 0, // 初始重排分
      matchedQueries: [query], // 当前 query 命中
    }); // push 结束
  } // for 结束
  return rows; // 返回候选
} // scoreChunksForQuery 结束

/** 单 query 检索：VectorStore 召回、重排、过滤、返回。 */
export async function retrieveTopChunks(query: string, documents: KnowledgeDocument[], options: Partial<RetrieveOptions> = {}): Promise<RetrievedChunkHit[]> {
  const q = query.trim(); // 规整查询文本
  if (!q) return []; // 空查询直接返回
  const topK = Math.max(1, Math.min(20, Math.floor(options.topK ?? DEFAULT_RETRIEVAL_TOP_K))); // 限制 TopK
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE; // 读取阈值
  const mode = normalizeRetrievalMode(options.mode); // 规整模式
  const rows = await scoreChunksForQuery(q, documents, options); // 通过 VectorStore 获取候选
  rows.sort((a, b) => modeScore(b, mode) - modeScore(a, mode)); // 第一阶段排序
  const reranked = rerank(q, rows, mode); // 规则重排
  const filtered = reranked.filter((row) => row.rerankScore >= minScore); // 分数过滤
  return filtered.slice(0, topK).map((row, index) => toRetrievedHit(row, index + 1, mode)); // 返回 TopK
} // retrieveTopChunks 结束

/** 合并重复 chunk：保留最高分，同时累计 matchedQueries。 */
function mergeDuplicateRows(rows: ScoredChunkRow[]): ScoredChunkRow[] {
  const map = new Map<string, ScoredChunkRow>(); // chunkId 到合并候选
  for (const row of rows) { // 遍历候选
    const existing = map.get(row.chunk.id); // 查找旧记录
    if (!existing) { // 首次出现
      map.set(row.chunk.id, { ...row, matchedQueries: [...row.matchedQueries] }); // 写入副本
      continue; // 继续下一项
    } // if 结束
    existing.vectorScore = Math.max(existing.vectorScore, row.vectorScore); // 向量分取最高
    existing.keywordScore = Math.max(existing.keywordScore, row.keywordScore); // 关键词分取最高
    existing.hybridScore = Math.max(existing.hybridScore, row.hybridScore); // 混合分取最高
    existing.rerankScore = Math.max(existing.rerankScore, row.rerankScore); // 重排分取最高
    for (const item of row.matchedQueries) { // 合并命中 query
      if (!existing.matchedQueries.includes(item)) existing.matchedQueries.push(item); // 去重追加
    } // for 结束
  } // for 结束
  return Array.from(map.values()); // 返回去重结果
} // mergeDuplicateRows 结束

/** 按给定 queries 执行 Multi-Query Retrieval。 */
export async function retrieveWithQueries(query: string, rewrittenQueries: string[], documents: KnowledgeDocument[], options: Partial<RetrieveOptions> = {}): Promise<MultiQueryRetrieveResult> {
  const q = query.trim(); // 规整原始 query
  if (!q) return { hits: [], rewrite: { originalQuery: "", rewrittenQueries: [], rewriteCount: 0 } }; // 空查询返回空结构
  const topK = Math.max(1, Math.min(20, Math.floor(options.topK ?? DEFAULT_RETRIEVAL_TOP_K))); // 限制最终 TopK
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE; // 读取最低分
  const mode = normalizeRetrievalMode(options.mode); // 规整模式
  const normalizedQueries = rewrittenQueries.length > 0 ? rewrittenQueries : [q]; // 防御性兜底
  const recalledRows: ScoredChunkRow[] = []; // 汇总候选
  for (const rewrittenQuery of normalizedQueries) { // 遍历每条改写 query
    const rows = await scoreChunksForQuery(rewrittenQuery, documents, options); // 向量库召回
    rows.sort((a, b) => modeScore(b, mode) - modeScore(a, mode)); // 按当前模式排序
    recalledRows.push(...rows); // 追加候选
  } // for 结束
  const mergedRows = mergeDuplicateRows(recalledRows); // 合并重复片段
  const reranked = rerank(q, mergedRows, mode); // 用原问题重排
  const filtered = reranked.filter((row) => row.rerankScore >= minScore); // 过滤低分
  const hits = filtered.slice(0, topK).map((row, index) => toRetrievedHit(row, index + 1, mode)); // 输出 TopK
  return { hits, rewrite: { originalQuery: q, rewrittenQueries: normalizedQueries, rewriteCount: normalizedQueries.length } }; // 返回结果
} // retrieveWithQueries 结束

/** 规则 Query Rewrite + Multi-Query Retrieval 主入口。 */
export async function multiQueryRetrieve(query: string, documents: KnowledgeDocument[], options: Partial<RetrieveOptions> = {}): Promise<MultiQueryRetrieveResult> {
  const q = query.trim(); // 规整查询文本
  if (!q) return { hits: [], rewrite: { originalQuery: "", rewrittenQueries: [], rewriteCount: 0 } }; // 空查询返回空结构
  const maxQueries = Math.max(1, Math.min(8, Math.floor(options.maxQueries ?? 5))); // 限制 query 数
  const rewrittenQueries = options.enableQueryRewrite === false ? [q] : rewriteQueryByRules(q, maxQueries); // 规则改写
  return retrieveWithQueries(q, rewrittenQueries, documents, options); // 执行多查询检索
} // multiQueryRetrieve 结束
