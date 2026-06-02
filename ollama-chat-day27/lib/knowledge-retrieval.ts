/**
 * 第27天：RAG Runtime V4 检索层 —— Query Rewrite + Multi-Query Retrieval + Hybrid + Rerank。
 */
import { embedText } from "@/lib/knowledge-embedding"; // 引入查询文本向量化函数
import { rewriteQueryByRules } from "@/lib/query-rewrite"; // 引入规则版 query rewrite
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  QueryRewriteDebug,
  RetrievalMode,
  RetrieveOptions,
  RetrievedChunkHit,
} from "@/lib/knowledge-types"; // 引入知识库检索相关类型

/** 默认第一阶段召回数量。 */
export const DEFAULT_RECALL_K = 20; // 默认先召回 20 个候选片段

/** 默认最终返回数量。 */
export const DEFAULT_RETRIEVAL_TOP_K = 5; // 默认最终返回 5 个片段

/** 默认最低最终分数阈值。 */
export const DEFAULT_MIN_SCORE = 0.3; // 默认过滤低于 0.3 的片段

/** 默认检索模式。 */
export const DEFAULT_RETRIEVAL_MODE: RetrievalMode = "hybrid"; // 默认使用混合检索

/** 第27天：Multi-Query 检索返回结构。 */
export type MultiQueryRetrieveResult = {
  hits: RetrievedChunkHit[]; // 最终返回的命中片段
  rewrite: QueryRewriteDebug; // Query Rewrite 调试信息
}; // MultiQueryRetrieveResult 结束

/** 内部候选片段结构。 */
export type ScoredChunkRow = {
  chunk: KnowledgeChunk; // 命中的知识片段
  document: KnowledgeDocument; // 片段所属文档
  vectorScore: number; // 向量相似度分数
  keywordScore: number; // 关键词匹配分数
  hybridScore: number; // 混合检索分数
  rerankScore: number; // 重排后的最终分数
  matchedQueries: string[]; // 第27天：命中过该片段的 query 列表
};

/** 将分数保留三位小数。 */
function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000; // UI 展示时避免过长小数
}

/** 将检索模式规整到合法枚举。 */
export function normalizeRetrievalMode(mode?: string): RetrievalMode {
  if (mode === "vector" || mode === "keyword" || mode === "hybrid") return mode; // 合法值直接返回
  return DEFAULT_RETRIEVAL_MODE; // 非法或缺省时回退到 hybrid
}

/** 计算两个向量的余弦相似度并映射到 0–1。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0; // 空向量或维度不一致时返回 0
  let dot = 0; // 点积累计值
  let normA = 0; // a 的 L2 范数平方
  let normB = 0; // b 的 L2 范数平方
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]; // 累加点积项
    normA += a[i] * a[i]; // 累加 a 的平方项
    normB += b[i] * b[i]; // 累加 b 的平方项
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB); // 计算余弦分母
  if (denom === 0) return 0; // 零向量无法比较
  const sim = dot / denom; // 原始余弦值范围为 -1 到 1
  return Math.max(0, Math.min(1, (sim + 1) / 2)); // 映射并钳制到 0–1
}

/** 将查询拆成轻量关键词。 */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase() // 统一转小写便于匹配
    .split(/[\s,.;:!?，。！？；：、（）()【】\[\]"'`]+/) // 按中英文常见分隔符切词
    .map((term) => term.trim()) // 去掉每个词两端空白
    .filter(Boolean); // 移除空字符串
}

/** 计算简化版 BM25 风格关键词分数。 */
export function keywordScore(query: string, text: string): number {
  const terms = tokenizeQuery(query); // 得到查询关键词
  if (terms.length === 0) return 0; // 无关键词时返回 0
  const loweredText = text.toLowerCase(); // 片段文本统一转小写
  let matched = 0; // 命中的关键词数量
  for (const term of terms) {
    if (loweredText.includes(term)) matched += 1; // 字面包含时增加命中数
  }
  return matched / Math.max(terms.length, 1); // 用命中比例归一化到 0–1
}

/** 根据模式选择基础排序分数。 */
function modeScore(row: ScoredChunkRow, mode: RetrievalMode): number {
  if (mode === "vector") return row.vectorScore; // vector 模式按向量分排序
  if (mode === "keyword") return row.keywordScore; // keyword 模式按关键词分排序
  return row.hybridScore; // hybrid 模式按混合分排序
}

/** 使用规则版 reranker 给候选片段加奖励并重新排序。 */
export function rerank(query: string, rows: ScoredChunkRow[], mode: RetrievalMode): ScoredChunkRow[] {
  const terms = tokenizeQuery(query); // 查询词用于规则奖励
  return rows
    .map((row) => {
      const loweredText = row.chunk.text.toLowerCase(); // 片段文本统一小写
      let bonus = 0; // 初始化重排奖励
      for (const term of terms) {
        if (loweredText.includes(term)) bonus += 0.05; // 每个命中词给 0.05 奖励
      }
      return { ...row, rerankScore: Math.min(1, modeScore(row, mode) + bonus) }; // 最终分数钳制到 1
    })
    .sort((a, b) => b.rerankScore - a.rerankScore); // 按重排分降序
}

/** 将内部候选转换为 API/UI 命中结构。 */
function toRetrievedHit(row: ScoredChunkRow, finalRank: number, mode: RetrievalMode): RetrievedChunkHit {
  return {
    chunkId: row.chunk.id, // 片段 id
    documentId: row.document.id, // 文档 id
    documentTitle: row.document.title, // 文档标题
    text: row.chunk.text, // 片段正文
    score: roundScore(row.rerankScore), // 兼容旧字段的最终分
    vectorScore: roundScore(row.vectorScore), // 向量分
    keywordScore: roundScore(row.keywordScore), // 关键词分
    hybridScore: roundScore(row.hybridScore), // 混合分
    rerankScore: roundScore(row.rerankScore), // 重排分
    finalRank, // 最终排名
    retrievalMode: mode, // 本次检索模式
    matchedQueries: row.matchedQueries, // 第27天：展示该 chunk 被哪些 query 命中
    chunkIndex: row.chunk.index ?? 0, // 片段序号
    startOffset: row.chunk.startOffset ?? 0, // 原文起始偏移
    endOffset: row.chunk.endOffset ?? row.chunk.text.length, // 原文结束偏移
  };
}

/** 对单个 query 生成全部候选分数。 */
async function scoreChunksForQuery(query: string, documents: KnowledgeDocument[]): Promise<ScoredChunkRow[]> {
  const queryEmbedding = await embedText(query); // 生成查询向量
  const rows: ScoredChunkRow[] = []; // 保存全部可评分片段
  for (const doc of documents) {
    for (const chunk of doc.chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue; // 跳过未向量化片段
      const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding); // 计算向量分
      const literalScore = keywordScore(query, chunk.text); // 计算关键词分
      const hybridScore = vectorScore * 0.7 + literalScore * 0.3; // 计算混合分
      rows.push({
        chunk, // 命中的知识片段
        document: doc, // 片段所属文档
        vectorScore, // 向量分
        keywordScore: literalScore, // 关键词分
        hybridScore, // 混合分
        rerankScore: 0, // 初始重排分
        matchedQueries: [query], // 当前 query 命中过该片段
      }); // 收集候选
    }
  }
  return rows; // 返回该 query 的全部候选
}

/** 在文档集合中执行单 query 四阶段检索：召回、重排、过滤、返回。 */
export async function retrieveTopChunks(
  query: string,
  documents: KnowledgeDocument[],
  options: Partial<RetrieveOptions> = {}
): Promise<RetrievedChunkHit[]> {
  const q = query.trim(); // 规整查询文本
  if (!q) return []; // 空查询直接返回空结果
  const recallK = Math.max(1, Math.min(50, Math.floor(options.recallK ?? DEFAULT_RECALL_K))); // 限制召回数量
  const topK = Math.max(1, Math.min(20, Math.floor(options.topK ?? DEFAULT_RETRIEVAL_TOP_K))); // 限制最终返回数量
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE; // 读取最低分阈值
  const mode = normalizeRetrievalMode(options.mode); // 规整检索模式
  const rows = await scoreChunksForQuery(q, documents); // 第27天：复用单 query 打分函数
  rows.sort((a, b) => modeScore(b, mode) - modeScore(a, mode)); // 第一阶段按模式分召回
  const recalled = rows.slice(0, recallK); // 取 recallK 个候选
  const reranked = rerank(q, recalled, mode); // 第二阶段规则重排
  const filtered = reranked.filter((row) => row.rerankScore >= minScore); // 第三阶段按最终分过滤
  return filtered.slice(0, topK).map((row, index) => toRetrievedHit(row, index + 1, mode)); // 第四阶段返回 TopK
}

/** 合并重复 chunk：保留最高分，同时累计 matchedQueries。 */
function mergeDuplicateRows(rows: ScoredChunkRow[]): ScoredChunkRow[] {
  const map = new Map<string, ScoredChunkRow>(); // chunkId → 合并后的候选
  for (const row of rows) {
    const existing = map.get(row.chunk.id); // 查找同 chunk 旧记录
    if (!existing) {
      map.set(row.chunk.id, { ...row, matchedQueries: [...row.matchedQueries] }); // 首次命中直接写入
      continue; // 继续下一个候选
    }
    existing.vectorScore = Math.max(existing.vectorScore, row.vectorScore); // 向量分取最大
    existing.keywordScore = Math.max(existing.keywordScore, row.keywordScore); // 关键词分取最大
    existing.hybridScore = Math.max(existing.hybridScore, row.hybridScore); // 混合分取最大
    existing.rerankScore = Math.max(existing.rerankScore, row.rerankScore); // 重排分取最大
    for (const query of row.matchedQueries) {
      if (!existing.matchedQueries.includes(query)) existing.matchedQueries.push(query); // 累加命中过的 query
    }
  }
  return Array.from(map.values()); // 返回去重后的候选
}

/** 第27天：Multi-Query Retrieval 主流程。 */
export async function multiQueryRetrieve(
  query: string,
  documents: KnowledgeDocument[],
  options: Partial<RetrieveOptions> = {}
): Promise<MultiQueryRetrieveResult> {
  const q = query.trim(); // 规整查询文本
  if (!q) {
    return { hits: [], rewrite: { originalQuery: "", rewrittenQueries: [], rewriteCount: 0 } }; // 空 query 返回空结构
  }
  const recallK = Math.max(1, Math.min(50, Math.floor(options.recallK ?? DEFAULT_RECALL_K))); // 限制召回数量
  const topK = Math.max(1, Math.min(20, Math.floor(options.topK ?? DEFAULT_RETRIEVAL_TOP_K))); // 限制最终返回数量
  const minScore = typeof options.minScore === "number" ? options.minScore : DEFAULT_MIN_SCORE; // 读取最低分阈值
  const mode = normalizeRetrievalMode(options.mode); // 规整检索模式
  const maxQueries = Math.max(1, Math.min(8, Math.floor(options.maxQueries ?? 5))); // 限制改写 query 数量
  const rewrittenQueries = options.enableQueryRewrite === false ? [q] : rewriteQueryByRules(q, maxQueries); // 规则改写
  const recalledRows: ScoredChunkRow[] = []; // 汇总所有 query 的第一阶段候选
  for (const rewrittenQuery of rewrittenQueries) {
    const rows = await scoreChunksForQuery(rewrittenQuery, documents); // 对每条 query 独立打分
    rows.sort((a, b) => modeScore(b, mode) - modeScore(a, mode)); // 按当前模式召回
    recalledRows.push(...rows.slice(0, recallK)); // 只保留该 query 的 recallK
  }
  const mergedRows = mergeDuplicateRows(recalledRows); // 合并并去重
  const reranked = rerank(q, mergedRows, mode); // 用原始问题做最终重排
  const filtered = reranked.filter((row) => row.rerankScore >= minScore); // 按最终分过滤
  const hits = filtered.slice(0, topK).map((row, index) => toRetrievedHit(row, index + 1, mode)); // 输出 TopK
  return {
    hits, // 最终命中
    rewrite: {
      originalQuery: q, // 原始问题
      rewrittenQueries, // 实际检索 query
      rewriteCount: rewrittenQueries.length, // query 数量
    },
  }; // 返回结果与调试信息
}
