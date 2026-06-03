/**
 * 第29天：本地 Knowledge Store V2，支持文档版本、内容哈希、片段指纹、增量索引和向量缓存。
 */
import crypto from "crypto"; // Node.js 哈希模块
import { promises as fs } from "fs"; // 异步文件 IO
import path from "path"; // 路径拼接
import { buildChunksForDocument } from "@/lib/knowledge/knowledge-chunking"; // overlap 切块
import { embedText } from "@/lib/knowledge/knowledge-embedding"; // 单条嵌入
import {
  retrieveTopChunks,
  DEFAULT_RETRIEVAL_TOP_K,
  DEFAULT_MIN_SCORE,
  DEFAULT_RECALL_K,
  DEFAULT_RETRIEVAL_MODE,
} from "@/lib/knowledge/knowledge-retrieval"; // 语义检索
import { runRetrievalPipeline } from "@/lib/knowledge/retrieval-pipeline"; // Memory-aware 检索流水线
import type { ModelRuntime } from "@/lib/model/model-runtime"; // 可选 LLM rewrite 运行时
import type {
  IncrementalIndexStats,
  KnowledgeDocument,
  KnowledgeDocumentSummary,
  KnowledgeMetricsSnapshot,
  PipelineMetrics,
  QueryRewriteDebug,
  RetrievalMode,
  RetrieveOptions,
  RetrievedChunkHit,
} from "@/lib/knowledge/knowledge-types"; // 类型

/** 进程内单例文档表。 */
const documents = new Map<string, KnowledgeDocument>(); // id 到文档

/** 第29天：进程内 embedding 缓存，key 是 chunkHash。 */
const embeddingCache = new Map<string, number[]>(); // chunkHash 到向量

/** 第25天：RAG 检索指标累计。 */
const retrievalMetrics = {
  queryCount: 0, // 检索次数
  topScoreSum: 0, // 各次最高分之和
  noResultCount: 0, // 过滤后 0 条次数
  retrievedChunksSum: 0, // 返回块数累计
}; // 指标对象

/** 第27天：Query Rewrite 与 Multi-Query 指标累计。 */
const queryRewriteMetrics = {
  rewriteCount: 0, // 触发改写的累计次数
  generatedQueriesSum: 0, // 所有改写 query 数量之和
  multiQueryHitCount: 0, // multi-query 有命中的次数
  improvedTop1Count: 0, // Top1 来自非原始 query 命中的次数
  fallbackTriggeredCount: 0, // fallback LLM 重试次数
  retrievalDurationSumMs: 0, // Pipeline 总耗时
}; // Query Rewrite 指标对象

/** 第29天：增量索引与缓存指标累计。 */
const indexMetrics = {
  cachedEmbeddings: 0, // 累计缓存命中向量数
  generatedEmbeddings: 0, // 累计新生成向量数
}; // 索引指标对象

/** 第29天：最近一次索引统计，供 UI 和测试观察。 */
let lastIndexStats: IncrementalIndexStats | null = null; // 初始无导入记录

/** 最近一次检索结果，供 RAG Debug UI 展示。 */
let lastRetrieval: {
  query: string; // 查询词
  recallK: number; // 第一阶段召回数量
  topK: number; // TopK 参数
  minScore: number; // 相似度阈值
  mode: RetrievalMode; // 检索模式
  rewrite: QueryRewriteDebug; // Query Rewrite 调试信息
  pipeline: PipelineMetrics; // Pipeline 单次指标
  hits: RetrievedChunkHit[]; // 命中列表
  at: number; // 时间戳
} | null = null; // 无检索时为 null

/** 数据目录，位于项目根下 .data。 */
const DATA_DIR = path.join(process.cwd(), ".data"); // Next 运行时 cwd 为项目根

/** 知识库 JSON 持久化路径。 */
const STORE_FILE = path.join(DATA_DIR, "knowledge-store.json"); // 单文件存储

/** 生成简单唯一 id。 */
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // 时间戳 + 随机
}

/** 第29天：生成 SHA256 内容哈希。 */
export function generateHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex"); // 返回十六进制摘要
}

/** 第29天：把长哈希压成 UI 友好的短字符串。 */
function shortHash(hash: string): string {
  return hash.slice(0, 12); // 展示前 12 位即可定位
}

/** 第29天：从现有文档恢复 embeddingCache。 */
function rebuildEmbeddingCacheFromDocuments(): void {
  embeddingCache.clear(); // 先清空旧缓存
  for (const doc of documents.values()) {
    for (const chunk of doc.chunks) {
      if (chunk.embedding?.length) {
        embeddingCache.set(chunk.chunkHash, chunk.embedding); // 片段有向量则写入缓存
      }
    }
  }
}

/** 为旧版 chunk 补全 metadata 与 chunkHash。 */
function normalizeChunkMetadata(doc: KnowledgeDocument): KnowledgeDocument {
  let cursor = 0; // 偏移游标
  const content = doc.content?.trim() ?? ""; // 规范化正文
  const chunks = (doc.chunks ?? []).map((c, index) => {
    const startOffset = typeof c.startOffset === "number" ? c.startOffset : cursor; // 起始偏移
    const endOffset = typeof c.endOffset === "number" ? c.endOffset : startOffset + c.text.length; // 结束偏移
    cursor = endOffset; // 推进游标
    return {
      ...c,
      id: c.id || `${doc.id}-chunk-${index + 1}`, // 兼容缺失 id
      documentId: c.documentId || doc.id, // 兼容缺失 documentId
      chunkHash: c.chunkHash || generateHash(c.text), // 第29天：补片段哈希
      index: typeof c.index === "number" ? c.index : index, // 兼容缺失序号
      startOffset, // 起始偏移
      endOffset, // 结束偏移
      tokenEstimate: c.tokenEstimate ?? Math.max(1, Math.ceil(c.text.length / 4)), // token 粗估
    }; // 规范化片段
  }); // 遍历片段
  return {
    ...doc,
    content, // 规范化正文
    contentHash: doc.contentHash || generateHash(content), // 第29天：补正文哈希
    version: doc.version || 1, // 第29天：旧文档默认版本 1
    chunks, // 规范化片段
    updatedAt: doc.updatedAt || doc.createdAt || Date.now(), // 兼容缺失更新时间
  }; // 返回文档
}

/** 从磁盘加载，失败则保持空库。 */
async function loadFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8"); // 读 JSON
    const parsed = JSON.parse(raw) as {
      documents?: KnowledgeDocument[]; // 持久化文档
      retrievalMetrics?: typeof retrievalMetrics; // RAG 指标
      queryRewriteMetrics?: typeof queryRewriteMetrics; // Query Rewrite 指标
      indexMetrics?: typeof indexMetrics; // 第29天索引指标
      lastIndexStats?: IncrementalIndexStats | null; // 最近索引统计
      retrievalCount?: number; // 旧版兼容字段
    }; // 解析结构
    documents.clear(); // 清空内存文档
    for (const doc of parsed.documents ?? []) {
      const normalized = normalizeChunkMetadata(doc); // 兼容旧字段
      documents.set(normalized.id, normalized); // 恢复文档
    }
    if (parsed.retrievalMetrics) Object.assign(retrievalMetrics, parsed.retrievalMetrics); // 恢复检索指标
    if (!parsed.retrievalMetrics && typeof parsed.retrievalCount === "number") retrievalMetrics.queryCount = parsed.retrievalCount; // 兼容旧计数
    if (parsed.queryRewriteMetrics) Object.assign(queryRewriteMetrics, parsed.queryRewriteMetrics); // 恢复改写指标
    if (parsed.indexMetrics) Object.assign(indexMetrics, parsed.indexMetrics); // 恢复索引指标
    lastIndexStats = parsed.lastIndexStats ?? null; // 恢复最近索引统计
    rebuildEmbeddingCacheFromDocuments(); // 从文档向量重建缓存
  } catch {
    // 文件不存在或损坏时保持空库
  }
}

/** 将当前内存状态写入磁盘。 */
async function saveToDisk(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true }); // 确保目录存在
  const payload = {
    documents: Array.from(documents.values()), // 序列化全部文档
    retrievalMetrics, // RAG 指标
    queryRewriteMetrics, // Query Rewrite 指标
    indexMetrics, // 第29天索引指标
    lastIndexStats, // 最近索引统计
    retrievalCount: retrievalMetrics.queryCount, // 兼容旧字段
  }; // 持久化结构
  await fs.writeFile(STORE_FILE, JSON.stringify(payload, null, 2), "utf8"); // 写入 JSON
}

/** 启动时尝试加载一次。 */
const loadPromise = loadFromDisk(); // API 内 await ensureLoaded

/** 确保加载完成后再读写。 */
async function ensureLoaded(): Promise<void> {
  await loadPromise; // 等待首次 load
}

/** 第29天：负责把文档导入变成可增量更新的索引器。 */
export class IncrementalIndexer {
  async indexDocument(title: string, content: string, forceReindex = false): Promise<KnowledgeDocument> {
    const normalizedTitle = title.trim() || `未命名笔记 ${new Date().toLocaleString("zh-CN")}`; // 标题兜底
    const normalizedContent = content.trim(); // 正文去空白
    const contentHash = generateHash(normalizedContent); // 计算正文哈希
    const existing = Array.from(documents.values()).find((doc) => doc.title === normalizedTitle); // 同标题视为同一文档
    const docId = existing?.id ?? newId("doc"); // 旧文档复用 id，新文档生成 id
    const now = Date.now(); // 当前时间戳
    if (existing && existing.contentHash === contentHash && !forceReindex) {
      lastIndexStats = this.buildUnchangedStats(existing); // 未变化时记录统计
      return existing; // 正文完全相同则不重建
    }
    const oldChunksByIndex = new Map((existing?.chunks ?? []).map((chunk) => [chunk.index, chunk])); // 旧片段索引表
    const rawChunks = buildChunksForDocument(docId, normalizedContent); // 根据新正文切块
    let addedChunks = 0; // 新增片段计数
    let updatedChunks = 0; // 更新片段计数
    let reusedChunks = 0; // 复用片段计数
    let cachedEmbeddings = 0; // 本次缓存命中数
    let generatedEmbeddings = 0; // 本次生成向量数
    const chunks = []; // 新片段列表
    for (const rawChunk of rawChunks) {
      const chunkHash = generateHash(rawChunk.text); // 第29天：计算片段指纹
      const oldChunk = oldChunksByIndex.get(rawChunk.index); // 找同序号旧片段
      const isSameChunk = !forceReindex && oldChunk?.chunkHash === chunkHash && oldChunk.embedding?.length; // 判断片段是否完全可复用
      let embedding = isSameChunk ? oldChunk.embedding : embeddingCache.get(chunkHash); // 先复用旧片段，再查缓存
      if (embedding?.length) {
        cachedEmbeddings += 1; // 缓存或旧片段命中
      } else {
        embedding = await embedText(rawChunk.text); // 只为变化片段生成 embedding
        generatedEmbeddings += 1; // 记录新生成
      }
      embeddingCache.set(chunkHash, embedding); // 写回缓存
      if (isSameChunk) {
        reusedChunks += 1; // 旧片段直接复用
      } else if (oldChunk) {
        updatedChunks += 1; // 同位置片段变化
      } else {
        addedChunks += 1; // 新增片段
      }
      chunks.push({
        ...rawChunk,
        chunkHash, // 写入片段哈希
        embedding, // 写入向量
      }); // 收集新片段
    }
    const removedChunks = Math.max(0, (existing?.chunks.length ?? 0) - rawChunks.length); // 粗略记录移除数量
    const doc: KnowledgeDocument = {
      id: docId, // 文档 id
      title: normalizedTitle, // 文档标题
      content: normalizedContent, // 正文
      contentHash, // 正文哈希
      version: existing ? existing.version + 1 : 1, // 内容变化后版本递增
      chunks, // 新片段
      createdAt: existing?.createdAt ?? now, // 保留创建时间
      updatedAt: now, // 更新时间
    }; // 新文档对象
    documents.set(doc.id, doc); // 写入文档表
    indexMetrics.cachedEmbeddings += cachedEmbeddings; // 累计缓存命中
    indexMetrics.generatedEmbeddings += generatedEmbeddings; // 累计新向量
    lastIndexStats = {
      documentId: doc.id, // 文档 id
      title: doc.title, // 标题
      version: doc.version, // 版本
      unchangedDocument: false, // 已发生变化
      totalChunks: chunks.length, // 总片段
      addedChunks, // 新增片段
      updatedChunks, // 更新片段
      reusedChunks, // 复用片段
      removedChunks, // 移除片段
      cachedEmbeddings, // 本次缓存命中
      generatedEmbeddings, // 本次新生成
      cacheHitRate: chunks.length > 0 ? Math.round((cachedEmbeddings / chunks.length) * 1000) / 1000 : 0, // 本次命中率
      forcedReindex: forceReindex, // 是否强制
    }; // 记录最近统计
    return doc; // 返回导入后的文档
  }

  private buildUnchangedStats(doc: KnowledgeDocument): IncrementalIndexStats {
    return {
      documentId: doc.id, // 文档 id
      title: doc.title, // 标题
      version: doc.version, // 版本不变
      unchangedDocument: true, // 正文完全未变化
      totalChunks: doc.chunks.length, // 总片段
      addedChunks: 0, // 无新增
      updatedChunks: 0, // 无更新
      reusedChunks: doc.chunks.length, // 全部复用
      removedChunks: 0, // 无移除
      cachedEmbeddings: doc.chunks.length, // 视为全部缓存命中
      generatedEmbeddings: 0, // 无新向量
      cacheHitRate: doc.chunks.length > 0 ? 1 : 0, // 全命中
      forcedReindex: false, // 非强制
    }; // 未变化统计
  }
}

/** 第29天：全局增量索引器实例。 */
const incrementalIndexer = new IncrementalIndexer(); // 单例索引器

/** 导入或增量更新一篇知识文档。 */
export async function importKnowledgeDocument(title: string, content: string): Promise<KnowledgeDocument> {
  await ensureLoaded(); // 等待磁盘加载
  const doc = await incrementalIndexer.indexDocument(title, content, false); // 增量索引
  await saveToDisk(); // 持久化
  return doc; // 返回文档
}

/** 按 id 更新一篇文档。 */
export async function updateKnowledgeDocument(id: string, title: string, content: string): Promise<KnowledgeDocument | null> {
  await ensureLoaded(); // 等待加载
  const existing = documents.get(id); // 读取旧文档
  if (!existing) return null; // 不存在返回 null
  documents.delete(id); // 临时删除，避免同标题查到旧对象
  const doc = await incrementalIndexer.indexDocument(title || existing.title, content, false); // 重新增量索引
  const fixedChunks = doc.chunks.map((chunk) => ({ ...chunk, id: `${id}-chunk-${chunk.index + 1}`, documentId: id })); // 修正 chunk 归属
  const fixedDoc = { ...doc, id, chunks: fixedChunks, createdAt: existing.createdAt }; // 保持原 id 与创建时间
  documents.delete(doc.id); // 删除临时 id
  documents.set(id, fixedDoc); // 写入修正后的文档
  await saveToDisk(); // 持久化
  return fixedDoc; // 返回更新文档
}

/** 删除一篇文档。 */
export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  await ensureLoaded(); // 等待加载
  const deleted = documents.delete(id); // 删除文档
  if (deleted) await saveToDisk(); // 有变化才写盘
  return deleted; // 返回是否删除
}

/** 第29天：强制重建全部知识库索引。 */
export async function reindexKnowledgeStore(): Promise<IncrementalIndexStats[]> {
  await ensureLoaded(); // 等待加载
  const originals = Array.from(documents.values()); // 拷贝旧文档列表
  const stats: IncrementalIndexStats[] = []; // 重建统计列表
  embeddingCache.clear(); // 强制重建时清空缓存
  documents.clear(); // 清空文档后逐篇重建
  for (const doc of originals) {
    const indexed = await incrementalIndexer.indexDocument(doc.title, doc.content, true); // 强制重建单文档
    const fixedChunks = indexed.chunks.map((chunk) => ({ ...chunk, id: `${doc.id}-chunk-${chunk.index + 1}`, documentId: doc.id })); // 修正 chunk 归属
    documents.delete(indexed.id); // 删除临时新 id
    documents.set(doc.id, { ...indexed, id: doc.id, version: doc.version, chunks: fixedChunks, createdAt: doc.createdAt }); // 保持原文档 id 与内容版本
    if (lastIndexStats) stats.push({ ...lastIndexStats, documentId: doc.id, version: doc.version }); // 收集统计
  }
  lastIndexStats = stats.length > 0 ? stats[stats.length - 1] : null; // UI 展示最后一篇重建统计
  await saveToDisk(); // 持久化
  return stats; // 返回每篇重建结果
}

/** 列出全部知识文档。 */
export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  await ensureLoaded(); // 确保已加载
  return Array.from(documents.values()).sort((a, b) => b.updatedAt - a.updatedAt); // 按更新时间倒序
}

/** 第29天：生成 Knowledge Explorer 需要的轻量摘要。 */
export async function listKnowledgeDocumentSummaries(): Promise<KnowledgeDocumentSummary[]> {
  const docs = await listKnowledgeDocuments(); // 读取文档
  return docs.map((doc) => ({
    id: doc.id, // 文档 id
    title: doc.title, // 标题
    version: doc.version, // 版本
    contentHash: shortHash(doc.contentHash), // 短正文哈希
    chunkCount: doc.chunks.length, // 片段数量
    createdAt: doc.createdAt, // 创建时间
    updatedAt: doc.updatedAt, // 更新时间
    preview: doc.content.slice(0, 120), // 正文预览
    chunks: doc.chunks.map((chunk) => ({
      id: chunk.id, // 片段 id
      index: chunk.index, // 片段序号
      chunkHash: shortHash(chunk.chunkHash), // 短片段哈希
      hasEmbedding: Boolean(chunk.embedding?.length), // 是否有向量
      startOffset: chunk.startOffset, // 起始偏移
      endOffset: chunk.endOffset, // 结束偏移
      preview: chunk.text.slice(0, 90), // 片段预览
    })), // 片段摘要
  })); // 文档摘要
}

/** Memory-aware Pipeline 检索并更新 RAG metrics / Query Rewrite metrics / lastRetrieval。 */
export async function searchKnowledge(
  query: string,
  options: Partial<RetrieveOptions> = {},
  rt?: ModelRuntime
): Promise<RetrievedChunkHit[]> {
  await ensureLoaded(); // 确保已加载
  const recallK = options.recallK ?? DEFAULT_RECALL_K; // 默认召回数量
  const topK = options.topK ?? DEFAULT_RETRIEVAL_TOP_K; // 默认 TopK
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE; // 默认阈值
  const mode = options.mode ?? DEFAULT_RETRIEVAL_MODE; // 默认检索模式
  const docs = Array.from(documents.values()); // 全库文档
  const singleHits = await retrieveTopChunks(query, docs, { recallK, topK, minScore, mode }); // single query 对照
  const result = await runRetrievalPipeline({ query, documents: docs, options: { ...options, recallK, topK, minScore, mode }, rt }); // Pipeline
  const hits = result.retrievedChunks; // 最终命中列表
  retrievalMetrics.queryCount += 1; // 检索次数 +1
  const topScore = hits.length > 0 ? hits[0].score : 0; // 本次最高分
  retrievalMetrics.topScoreSum += topScore; // 累加最高分
  if (hits.length === 0) retrievalMetrics.noResultCount += 1; // 无结果计数
  retrievalMetrics.retrievedChunksSum += hits.length; // 返回块数累加
  queryRewriteMetrics.rewriteCount += 1; // 改写次数 +1
  queryRewriteMetrics.generatedQueriesSum += result.rewrittenQueries.length; // 累加生成 query 数
  if (hits.length > 0) queryRewriteMetrics.multiQueryHitCount += 1; // multi-query 有命中
  if (hits[0]?.chunkId && hits[0].chunkId !== singleHits[0]?.chunkId && (hits[0].matchedQueries?.length ?? 0) > 0) {
    queryRewriteMetrics.improvedTop1Count += 1; // Top1 改善计数
  }
  if (result.fallbackTriggered) queryRewriteMetrics.fallbackTriggeredCount += 1; // fallback 次数 +1
  queryRewriteMetrics.retrievalDurationSumMs += result.metrics.retrievalDurationMs; // 累加耗时
  lastRetrieval = {
    query, // 原始查询
    recallK, // 召回数量
    topK, // 返回数量
    minScore, // 最低分
    mode, // 检索模式
    rewrite: {
      originalQuery: result.originalQuery, // 原始问题
      rewrittenQueries: result.rewrittenQueries, // 实际 queries
      rewriteCount: result.rewrittenQueries.length, // query 数量
      ambiguous: result.ambiguous, // 是否模糊
      rewriteMode: result.mode === "hybrid" ? "rule" : result.mode, // UI 展示模式
      usedMemory: result.memoryUsed, // 是否使用记忆
      usedRecentMessages: result.recentMessagesUsed, // 是否使用最近对话
      knowledgeTopicsUsed: result.knowledgeTopicsUsed, // 使用的主题
    }, // rewrite 调试对象
    pipeline: result.metrics, // Pipeline 单次指标
    hits, // 命中列表
    at: Date.now(), // 时间戳
  }; // 记录最近检索
  await saveToDisk(); // 持久化指标
  return hits; // 返回命中
}

/** 读取知识库指标快照。 */
export async function getKnowledgeMetrics(): Promise<KnowledgeMetricsSnapshot> {
  await ensureLoaded(); // 确保已加载
  const docs = Array.from(documents.values()); // 全部文档
  const allChunks = docs.flatMap((d) => d.chunks); // 扁平化块
  const totalChars = allChunks.reduce((sum, c) => sum + c.text.length, 0); // 总字符
  const avgChunkSize = allChunks.length > 0 ? Math.round(totalChars / allChunks.length) : 0; // 平均块大小
  const q = retrievalMetrics.queryCount || 0; // 检索次数
  const totalEmbeddingEvents = indexMetrics.cachedEmbeddings + indexMetrics.generatedEmbeddings; // 向量事件总数
  return {
    documents: docs.length, // 兼容旧 UI
    chunks: allChunks.length, // 兼容旧 UI
    avgChunkSize, // 平均片段大小
    retrievalCount: q, // 兼容旧字段
    retrieval: {
      queryCount: q, // 查询次数
      avgTopScore: q > 0 ? Math.round((retrievalMetrics.topScoreSum / q) * 1000) / 1000 : 0, // 平均最高分
      noResultCount: retrievalMetrics.noResultCount, // 无结果次数
      avgRetrievedChunks: q > 0 ? Math.round((retrievalMetrics.retrievedChunksSum / q) * 100) / 100 : 0, // 平均返回块数
    },
    queryRewrite: {
      rewriteCount: queryRewriteMetrics.rewriteCount, // 改写次数
      avgGeneratedQueries:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round((queryRewriteMetrics.generatedQueriesSum / queryRewriteMetrics.rewriteCount) * 100) / 100
          : 0, // 平均 query 数
      multiQueryHitRate:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round((queryRewriteMetrics.multiQueryHitCount / queryRewriteMetrics.rewriteCount) * 1000) / 1000
          : 0, // 命中率
      improvedTop1Count: queryRewriteMetrics.improvedTop1Count, // Top1 改善
      fallbackTriggeredCount: queryRewriteMetrics.fallbackTriggeredCount, // fallback 次数
      avgRetrievalDurationMs:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round(queryRewriteMetrics.retrievalDurationSumMs / queryRewriteMetrics.rewriteCount)
          : 0, // 平均耗时
    },
    index: {
      documentsCount: docs.length, // 文档数量
      chunksCount: allChunks.length, // 片段数量
      cachedEmbeddings: indexMetrics.cachedEmbeddings, // 缓存命中向量
      generatedEmbeddings: indexMetrics.generatedEmbeddings, // 新生成向量
      cacheHitRate: totalEmbeddingEvents > 0 ? Math.round((indexMetrics.cachedEmbeddings / totalEmbeddingEvents) * 1000) / 1000 : 0, // 累计命中率
      avgChunksPerDoc: docs.length > 0 ? Math.round((allChunks.length / docs.length) * 100) / 100 : 0, // 平均片段数
      lastIndexStats, // 最近导入统计
    },
  }; // 指标对象
}

/** 获取最近一次检索观测数据。 */
export function getLastRetrievalDebug(): typeof lastRetrieval {
  return lastRetrieval; // 可能为 null
}

/** 获取最近一次索引统计。 */
export function getLastIndexStats(): IncrementalIndexStats | null {
  return lastIndexStats; // 可能为 null
}

/** 全局知识库 Store 门面。 */
export const knowledgeStore = {
  importDocument: importKnowledgeDocument, // 导入或增量更新文档
  updateDocument: updateKnowledgeDocument, // 更新文档
  deleteDocument: deleteKnowledgeDocument, // 删除文档
  listDocuments: listKnowledgeDocuments, // 列出完整文档
  listDocumentSummaries: listKnowledgeDocumentSummaries, // Knowledge Explorer 摘要
  search: searchKnowledge, // 检索
  reindex: reindexKnowledgeStore, // 第29天：强制重建索引
  getMetrics: getKnowledgeMetrics, // 指标
  getLastRetrieval: getLastRetrievalDebug, // 最近检索
  getLastIndexStats, // 最近索引统计
};
