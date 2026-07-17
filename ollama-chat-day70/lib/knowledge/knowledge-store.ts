/** 第30天：KnowledgeStore V3，文档存储与 VectorStore 向量存储分离。 */
import crypto from "crypto"; // Node.js hash 模块
import { promises as fs } from "fs"; // 异步文件 IO
import path from "path"; // 路径拼接工具
import { buildChunksForDocument } from "@/lib/knowledge/knowledge-chunking"; // 文档切块函数
import { embedText } from "@/lib/knowledge/knowledge-embedding"; // 文本 embedding 函数
import { DEFAULT_RETRIEVAL_MODE, getDefaultMinScore, getDefaultRecallK, getDefaultRetrievalTopK, retrieveTopChunks } from "@/lib/knowledge/knowledge-retrieval"; // 第62天：引入配置中心驱动的检索默认值与单 query 对照。
import { runRetrievalPipeline } from "@/lib/knowledge/retrieval-pipeline"; // Memory-aware 检索流水线
import { localVectorStore } from "@/lib/knowledge/vector-store"; // 第30天本地向量库
import { uploadKnowledgeSource } from "@/lib/storage/storage-runtime"; // 第61天：引入知识源文件上传到 Object Storage 的能力。
import type { ModelRuntime } from "@/lib/model/model-runtime"; // 模型运行时类型
import type { IncrementalIndexStats, KnowledgeDocument, KnowledgeDocumentSummary, KnowledgeMetricsSnapshot, PipelineMetrics, QueryRewriteDebug, RetrievalMode, RetrieveOptions, RetrievedChunkHit, VectorRecord, VectorRecordSummary } from "@/lib/knowledge/knowledge-types"; // 知识库类型

/** 进程内文档表。 */
const documents = new Map<string, KnowledgeDocument>(); // documentId 到文档对象

/** 第30天：embedding 缓存仍按 chunkHash 复用，但 embedding 不再写回 chunk。 */
const embeddingCache = new Map<string, number[]>(); // chunkHash 到 embedding

/** RAG 检索累计指标。 */
const retrievalMetrics = { queryCount: 0, topScoreSum: 0, noResultCount: 0, retrievedChunksSum: 0 }; // 检索指标累加器

/** Query Rewrite 累计指标。 */
const queryRewriteMetrics = { rewriteCount: 0, generatedQueriesSum: 0, multiQueryHitCount: 0, improvedTop1Count: 0, fallbackTriggeredCount: 0, retrievalDurationSumMs: 0 }; // 改写指标累加器

/** 索引层累计指标。 */
const indexMetrics = { cachedEmbeddings: 0, generatedEmbeddings: 0 }; // embedding 复用与生成次数

/** 最近一次索引统计。 */
let lastIndexStats: IncrementalIndexStats | null = null; // 初始没有索引记录

/** 最近一次检索调试快照。 */
let lastRetrieval: { query: string; recallK: number; topK: number; minScore: number; mode: RetrievalMode; rewrite: QueryRewriteDebug; pipeline: PipelineMetrics; hits: RetrievedChunkHit[]; at: number } | null = null; // 初始无检索

/** 数据目录。 */
const DATA_DIR = path.join(process.cwd(), ".data"); // 项目根目录下的 .data

/** 持久化文件路径。 */
const STORE_FILE = path.join(DATA_DIR, "knowledge-store-v7.json"); // 第30天使用新的持久化文件

/** 生成简单唯一 id。 */
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // 时间戳 + 随机片段
} // newId 结束

/** 生成 SHA256 hash。 */
export function generateHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex"); // 返回十六进制摘要
} // generateHash 结束

/** 生成短 hash 供 UI 展示。 */
function shortHash(hash: string): string {
  return hash.slice(0, 12); // 展示前 12 位
} // shortHash 结束

/** 为旧数据补齐 chunk 元数据，并丢弃旧 chunk.embedding 字段。 */
function normalizeDocument(doc: KnowledgeDocument): KnowledgeDocument {
  const content = doc.content?.trim() ?? ""; // 规整正文
  const chunks = (doc.chunks ?? []).map((chunk, index) => { // 遍历旧片段
    const text = chunk.text ?? ""; // 读取片段文本
    return { // 返回新片段
      id: chunk.id || `${doc.id}-chunk-${index + 1}`, // 补齐片段 id
      documentId: chunk.documentId || doc.id, // 补齐文档 id
      chunkHash: chunk.chunkHash || generateHash(text), // 补齐片段 hash
      text, // 保留正文
      index: typeof chunk.index === "number" ? chunk.index : index, // 补齐序号
      startOffset: typeof chunk.startOffset === "number" ? chunk.startOffset : 0, // 补齐起始偏移
      endOffset: typeof chunk.endOffset === "number" ? chunk.endOffset : text.length, // 补齐结束偏移
      tokenEstimate: chunk.tokenEstimate ?? Math.max(1, Math.ceil(text.length / 4)), // 补齐 token 估算
    }; // return 结束
  }); // map 结束
  return { // 返回规范化文档
    ...doc, // 保留其它字段
    content, // 规范化正文
    contentHash: doc.contentHash || generateHash(content), // 补齐正文 hash
    version: doc.version || 1, // 补齐版本
    chunks, // 写入规范化片段
    createdAt: doc.createdAt || Date.now(), // 补齐创建时间
    updatedAt: doc.updatedAt || doc.createdAt || Date.now(), // 补齐更新时间
  }; // return 结束
} // normalizeDocument 结束

/** 从磁盘加载知识库与向量库。 */
async function loadFromDisk(): Promise<void> {
  try { // 捕获文件不存在或 JSON 损坏
    const raw = await fs.readFile(STORE_FILE, "utf8"); // 读取持久化文件
    const parsed = JSON.parse(raw) as { documents?: KnowledgeDocument[]; vectors?: VectorRecord[]; retrievalMetrics?: typeof retrievalMetrics; queryRewriteMetrics?: typeof queryRewriteMetrics; indexMetrics?: typeof indexMetrics; lastIndexStats?: IncrementalIndexStats | null }; // 解析结构
    documents.clear(); // 清空内存文档
    for (const doc of parsed.documents ?? []) { // 恢复文档
      const normalized = normalizeDocument(doc); // 规范化旧数据
      documents.set(normalized.id, normalized); // 写入 Map
    } // for 结束
    localVectorStore.restoreRecords(parsed.vectors ?? []); // 恢复向量库
    embeddingCache.clear(); // 清空 embedding 缓存
    for (const record of parsed.vectors ?? []) { // 从向量记录恢复缓存
      const chunk = Array.from(documents.values()).flatMap((doc) => doc.chunks).find((item) => item.id === record.metadata.chunkId); // 查找对应片段
      if (chunk) embeddingCache.set(chunk.chunkHash, record.embedding); // 用 chunkHash 缓存 embedding
    } // for 结束
    if (parsed.retrievalMetrics) Object.assign(retrievalMetrics, parsed.retrievalMetrics); // 恢复检索指标
    if (parsed.queryRewriteMetrics) Object.assign(queryRewriteMetrics, parsed.queryRewriteMetrics); // 恢复改写指标
    if (parsed.indexMetrics) Object.assign(indexMetrics, parsed.indexMetrics); // 恢复索引指标
    lastIndexStats = parsed.lastIndexStats ?? null; // 恢复最近索引统计
  } catch { // 加载失败时保持空库
  } // catch 结束
} // loadFromDisk 结束

/** 将当前知识库与向量库写入磁盘。 */
async function saveToDisk(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true }); // 确保数据目录存在
  const payload = { documents: Array.from(documents.values()), vectors: localVectorStore.dumpRecords(), retrievalMetrics, queryRewriteMetrics, indexMetrics, lastIndexStats }; // 组装持久化数据
  await fs.writeFile(STORE_FILE, JSON.stringify(payload, null, 2), "utf8"); // 写入 JSON
} // saveToDisk 结束

/** 启动时加载一次。 */
const loadPromise = loadFromDisk(); // 首次加载 Promise

/** 确保首轮加载完成。 */
async function ensureLoaded(): Promise<void> {
  await loadPromise; // 等待初始化
} // ensureLoaded 结束

/** 构建向量记录。 */
function buildVectorRecord(chunkId: string, documentId: string, embedding: number[], old?: VectorRecord): VectorRecord {
  const now = Date.now(); // 当前时间
  return { id: chunkId, embedding, metadata: { chunkId, documentId }, createdAt: old?.createdAt ?? now, updatedAt: now }; // 返回向量记录
} // buildVectorRecord 结束

/** 第30天：增量索引器，写入文档片段并 upsert VectorStore。 */
export class IncrementalIndexer {
  /** 导入或更新一篇文档。 */
  async indexDocument(title: string, content: string, forceReindex = false): Promise<KnowledgeDocument> {
    const normalizedTitle = title.trim() || `未命名笔记 ${new Date().toLocaleString("zh-CN")}`; // 标题兜底
    const normalizedContent = content.trim(); // 正文去空白
    const contentHash = generateHash(normalizedContent); // 计算正文 hash
    const existing = Array.from(documents.values()).find((doc) => doc.title === normalizedTitle); // 同标题视作同文档
    const docId = existing?.id ?? newId("doc"); // 复用旧 id 或生成新 id
    const now = Date.now(); // 当前时间
    if (existing && existing.contentHash === contentHash && !forceReindex) { // 文档未变
      if (!existing.storage) existing.storage = await uploadKnowledgeSource(normalizedTitle, normalizedContent); // 第61天：旧文档缺少对象存储引用时补传源文件。
      lastIndexStats = this.buildUnchangedStats(existing); // 记录未变统计
      return existing; // 直接返回旧文档
    } // if 结束
    const oldChunksByIndex = new Map((existing?.chunks ?? []).map((chunk) => [chunk.index, chunk])); // 按 index 查旧片段
    const oldVectors = new Map(localVectorStore.dumpRecords().map((record) => [record.id, record])); // 旧向量记录表
    const rawChunks = buildChunksForDocument(docId, normalizedContent); // 重新切块
    const chunks = []; // 新片段列表
    const vectors: VectorRecord[] = []; // 待写入向量列表
    let addedChunks = 0; // 新增片段数
    let updatedChunks = 0; // 更新片段数
    let reusedChunks = 0; // 复用片段数
    let cachedEmbeddings = 0; // 缓存命中数
    let generatedEmbeddings = 0; // 新生成数
    for (const rawChunk of rawChunks) { // 遍历新片段
      const chunkHash = generateHash(rawChunk.text); // 计算片段 hash
      const oldChunk = oldChunksByIndex.get(rawChunk.index); // 找同序号旧片段
      const isSameChunk = !forceReindex && oldChunk?.chunkHash === chunkHash; // 判断内容是否未变
      let embedding = isSameChunk ? oldVectors.get(oldChunk.id)?.embedding : embeddingCache.get(chunkHash); // 先复用旧向量，再查缓存
      if (embedding?.length) { // 有可用 embedding
        cachedEmbeddings += 1; // 缓存命中 +1
      } else { // 没有可用 embedding
        embedding = await embedText(rawChunk.text); // 生成新 embedding
        generatedEmbeddings += 1; // 新生成 +1
      } // if 结束
      const chunk = { ...rawChunk, chunkHash }; // chunk 不再保存 embedding
      chunks.push(chunk); // 写入新 chunk 列表
      embeddingCache.set(chunkHash, embedding); // 写入 embedding 缓存
      vectors.push(buildVectorRecord(chunk.id, docId, embedding, oldVectors.get(chunk.id))); // 写入待 upsert 向量
      if (isSameChunk) reusedChunks += 1; // 未变片段计复用
      else if (oldChunk) updatedChunks += 1; // 同位置片段计更新
      else addedChunks += 1; // 否则计新增
    } // for 结束
    const oldIds = new Set((existing?.chunks ?? []).map((chunk) => chunk.id)); // 旧片段 id 集合
    const newIds = new Set(chunks.map((chunk) => chunk.id)); // 新片段 id 集合
    const deletedVectorIds = Array.from(oldIds).filter((id) => !newIds.has(id)); // 找出被删除的旧向量
    await localVectorStore.delete(deletedVectorIds); // 删除不再存在的向量
    await localVectorStore.upsert(vectors); // 写入新增或更新向量
    const storage = await uploadKnowledgeSource(normalizedTitle, normalizedContent); // 第61天：把原始知识文档上传到 Object Storage，只在文档元数据中保存引用。
    const doc: KnowledgeDocument = { id: docId, title: normalizedTitle, content: normalizedContent, storage, contentHash, version: existing ? existing.version + 1 : 1, chunks, createdAt: existing?.createdAt ?? now, updatedAt: now }; // 组装文档
    documents.set(doc.id, doc); // 写入文档表
    indexMetrics.cachedEmbeddings += cachedEmbeddings; // 累加缓存命中
    indexMetrics.generatedEmbeddings += generatedEmbeddings; // 累加新生成
    lastIndexStats = { documentId: doc.id, title: doc.title, version: doc.version, unchangedDocument: false, totalChunks: chunks.length, addedChunks, updatedChunks, reusedChunks, removedChunks: deletedVectorIds.length, cachedEmbeddings, generatedEmbeddings, upsertedVectors: vectors.length, deletedVectors: deletedVectorIds.length, cacheHitRate: chunks.length > 0 ? Math.round((cachedEmbeddings / chunks.length) * 1000) / 1000 : 0, forcedReindex: forceReindex }; // 记录索引统计
    return doc; // 返回文档
  } // indexDocument 结束

  /** 构建文档未变化时的统计。 */
  private buildUnchangedStats(doc: KnowledgeDocument): IncrementalIndexStats {
    return { documentId: doc.id, title: doc.title, version: doc.version, unchangedDocument: true, totalChunks: doc.chunks.length, addedChunks: 0, updatedChunks: 0, reusedChunks: doc.chunks.length, removedChunks: 0, cachedEmbeddings: doc.chunks.length, generatedEmbeddings: 0, upsertedVectors: 0, deletedVectors: 0, cacheHitRate: doc.chunks.length > 0 ? 1 : 0, forcedReindex: false }; // 返回未变统计
  } // buildUnchangedStats 结束
} // IncrementalIndexer 结束

/** 全局增量索引器。 */
const incrementalIndexer = new IncrementalIndexer(); // 单例索引器

/** 导入一篇知识文档。 */
export async function importKnowledgeDocument(title: string, content: string): Promise<KnowledgeDocument> {
  await ensureLoaded(); // 等待加载
  const doc = await incrementalIndexer.indexDocument(title, content, false); // 增量索引
  await saveToDisk(); // 持久化
  return doc; // 返回文档
} // importKnowledgeDocument 结束

/** 更新一篇知识文档。 */
export async function updateKnowledgeDocument(id: string, title: string, content: string): Promise<KnowledgeDocument | null> {
  await ensureLoaded(); // 等待加载
  const existing = documents.get(id); // 读取旧文档
  if (!existing) return null; // 不存在返回 null
  documents.delete(id); // 临时删除避免同标题冲突
  await localVectorStore.delete(localVectorStore.idsByDocument(id)); // 删除旧文档向量
  const doc = await incrementalIndexer.indexDocument(title || existing.title, content, false); // 重新索引
  const fixedChunks = doc.chunks.map((chunk) => ({ ...chunk, id: `${id}-chunk-${chunk.index + 1}`, documentId: id })); // 修正文档 id
  const fixedDoc = { ...doc, id, chunks: fixedChunks, createdAt: existing.createdAt }; // 保持原文档 id
  const oldVectors = localVectorStore.dumpRecords().filter((record) => record.metadata.documentId === doc.id); // 找临时向量
  await localVectorStore.delete(oldVectors.map((record) => record.id)); // 删除临时向量
  await localVectorStore.upsert(oldVectors.map((record, index) => buildVectorRecord(fixedChunks[index]?.id ?? record.id, id, record.embedding))); // 写入修正向量
  documents.delete(doc.id); // 删除临时文档
  documents.set(id, fixedDoc); // 写入修正文档
  await saveToDisk(); // 持久化
  return fixedDoc; // 返回修正文档
} // updateKnowledgeDocument 结束

/** 删除一篇知识文档。 */
export async function deleteKnowledgeDocument(id: string): Promise<boolean> {
  await ensureLoaded(); // 等待加载
  const deleted = documents.delete(id); // 删除文档
  if (deleted) { // 删除成功
    await localVectorStore.delete(localVectorStore.idsByDocument(id)); // 同步删除向量
    await saveToDisk(); // 持久化
  } // if 结束
  return deleted; // 返回是否删除
} // deleteKnowledgeDocument 结束

/** 强制重建整个知识库索引与向量库。 */
export async function reindexKnowledgeStore(): Promise<IncrementalIndexStats[]> {
  await ensureLoaded(); // 等待加载
  const originals = Array.from(documents.values()); // 拷贝旧文档
  const stats: IncrementalIndexStats[] = []; // 重建统计列表
  embeddingCache.clear(); // 清空 embedding 缓存
  localVectorStore.restoreRecords([]); // 清空向量库
  documents.clear(); // 清空文档表
  for (const doc of originals) { // 逐篇重建
    const indexed = await incrementalIndexer.indexDocument(doc.title, doc.content, true); // 强制索引
    const fixed = { ...indexed, id: doc.id, version: doc.version, createdAt: doc.createdAt, chunks: indexed.chunks.map((chunk) => ({ ...chunk, id: `${doc.id}-chunk-${chunk.index + 1}`, documentId: doc.id })) }; // 保持原 id 与版本
    const tempVectors = localVectorStore.dumpRecords().filter((record) => record.metadata.documentId === indexed.id); // 找临时向量
    await localVectorStore.delete(tempVectors.map((record) => record.id)); // 删除临时向量
    await localVectorStore.upsert(tempVectors.map((record, index) => buildVectorRecord(fixed.chunks[index]?.id ?? record.id, doc.id, record.embedding))); // 写入修正向量
    documents.delete(indexed.id); // 删除临时文档
    documents.set(doc.id, fixed); // 写回原文档 id
    if (lastIndexStats) stats.push({ ...lastIndexStats, documentId: doc.id, version: doc.version }); // 收集统计
  } // for 结束
  lastIndexStats = stats.length > 0 ? stats[stats.length - 1] : null; // 最近统计取最后一篇
  await saveToDisk(); // 持久化
  return stats; // 返回统计列表
} // reindexKnowledgeStore 结束

/** 列出全部知识文档。 */
export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  await ensureLoaded(); // 确保加载
  return Array.from(documents.values()).sort((a, b) => b.updatedAt - a.updatedAt); // 按更新时间倒序
} // listKnowledgeDocuments 结束

/** 生成 Knowledge Explorer 摘要。 */
export async function listKnowledgeDocumentSummaries(): Promise<KnowledgeDocumentSummary[]> {
  const docs = await listKnowledgeDocuments(); // 读取文档
  return docs.map((doc) => ({ // 转换文档摘要
    id: doc.id, // 文档 id
    title: doc.title, // 标题
    version: doc.version, // 版本
    storage: doc.storage, // 第61天：返回 Object Storage 元数据，供 Storage Explorer 和知识库面板展示。
    contentHash: shortHash(doc.contentHash), // 短正文 hash
    chunkCount: doc.chunks.length, // 片段数
    createdAt: doc.createdAt, // 创建时间
    updatedAt: doc.updatedAt, // 更新时间
    preview: doc.content.slice(0, 120), // 正文预览
    chunks: doc.chunks.map((chunk) => { // 转换片段摘要
      const hasVector = localVectorStore.has(chunk.id); // 判断向量是否存在
      return { id: chunk.id, index: chunk.index, chunkHash: shortHash(chunk.chunkHash), hasVector, hasEmbedding: hasVector, startOffset: chunk.startOffset, endOffset: chunk.endOffset, preview: chunk.text.slice(0, 90) }; // 返回片段摘要
    }), // chunks 结束
  })); // map 结束
} // listKnowledgeDocumentSummaries 结束

/** 列出 Vector Explorer 摘要。 */
export async function listVectorSummaries(): Promise<VectorRecordSummary[]> {
  await ensureLoaded(); // 确保加载
  return localVectorStore.summaries(); // 返回向量摘要
} // listVectorSummaries 结束

/** Memory-aware Pipeline 检索并更新指标。 */
export async function searchKnowledge(query: string, options: Partial<RetrieveOptions> = {}, rt?: ModelRuntime): Promise<RetrievedChunkHit[]> {
  await ensureLoaded(); // 确保加载
  const recallK = options.recallK ?? getDefaultRecallK(); // 第62天：从配置中心读取召回数。
  const topK = options.topK ?? getDefaultRetrievalTopK(); // 第62天：从配置中心读取 TopK。
  const minScore = options.minScore ?? getDefaultMinScore(); // 第62天：从配置中心读取最低分。
  const mode = options.mode ?? DEFAULT_RETRIEVAL_MODE; // 读取模式
  const docs = Array.from(documents.values()); // 展开文档
  const singleHits = await retrieveTopChunks(query, docs, { ...options, recallK, topK, minScore, mode }); // 单 query 对照
  const result = await runRetrievalPipeline({ query, documents: docs, options: { ...options, recallK, topK, minScore, mode }, rt }); // 执行 Pipeline
  const hits = result.retrievedChunks; // 最终命中
  retrievalMetrics.queryCount += 1; // 检索次数 +1
  retrievalMetrics.topScoreSum += hits.length > 0 ? hits[0].score : 0; // 累计最高分
  if (hits.length === 0) retrievalMetrics.noResultCount += 1; // 无结果计数
  retrievalMetrics.retrievedChunksSum += hits.length; // 累计返回片段数
  queryRewriteMetrics.rewriteCount += 1; // rewrite 次数 +1
  queryRewriteMetrics.generatedQueriesSum += result.rewrittenQueries.length; // 累计 query 数
  if (hits.length > 0) queryRewriteMetrics.multiQueryHitCount += 1; // 有命中计数
  if (hits[0]?.chunkId && hits[0].chunkId !== singleHits[0]?.chunkId && (hits[0].matchedQueries?.length ?? 0) > 0) queryRewriteMetrics.improvedTop1Count += 1; // Top1 改善计数
  if (result.fallbackTriggered) queryRewriteMetrics.fallbackTriggeredCount += 1; // fallback 计数
  queryRewriteMetrics.retrievalDurationSumMs += result.metrics.retrievalDurationMs; // 累计耗时
  lastRetrieval = { query, recallK, topK, minScore, mode, rewrite: { originalQuery: result.originalQuery, rewrittenQueries: result.rewrittenQueries, rewriteCount: result.rewrittenQueries.length, ambiguous: result.ambiguous, rewriteMode: result.mode === "hybrid" ? "rule" : result.mode, usedMemory: result.memoryUsed, usedRecentMessages: result.recentMessagesUsed, knowledgeTopicsUsed: result.knowledgeTopicsUsed }, pipeline: result.metrics, hits, at: Date.now() }; // 写入调试快照
  await saveToDisk(); // 持久化指标
  return hits; // 返回命中
} // searchKnowledge 结束

/** 读取知识库指标快照。 */
export async function getKnowledgeMetrics(): Promise<KnowledgeMetricsSnapshot> {
  await ensureLoaded(); // 确保加载
  const docs = Array.from(documents.values()); // 展开文档
  const allChunks = docs.flatMap((doc) => doc.chunks); // 展开片段
  const totalChars = allChunks.reduce((sum, chunk) => sum + chunk.text.length, 0); // 累计字符数
  const avgChunkSize = allChunks.length > 0 ? Math.round(totalChars / allChunks.length) : 0; // 平均片段大小
  const q = retrievalMetrics.queryCount || 0; // 检索次数
  const totalEmbeddingEvents = indexMetrics.cachedEmbeddings + indexMetrics.generatedEmbeddings; // embedding 事件总数
  const vector = await localVectorStore.stats(); // 读取向量指标
  return { documents: docs.length, chunks: allChunks.length, avgChunkSize, retrievalCount: q, retrieval: { queryCount: q, avgTopScore: q > 0 ? Math.round((retrievalMetrics.topScoreSum / q) * 1000) / 1000 : 0, noResultCount: retrievalMetrics.noResultCount, avgRetrievedChunks: q > 0 ? Math.round((retrievalMetrics.retrievedChunksSum / q) * 100) / 100 : 0 }, queryRewrite: { rewriteCount: queryRewriteMetrics.rewriteCount, avgGeneratedQueries: queryRewriteMetrics.rewriteCount > 0 ? Math.round((queryRewriteMetrics.generatedQueriesSum / queryRewriteMetrics.rewriteCount) * 100) / 100 : 0, multiQueryHitRate: queryRewriteMetrics.rewriteCount > 0 ? Math.round((queryRewriteMetrics.multiQueryHitCount / queryRewriteMetrics.rewriteCount) * 1000) / 1000 : 0, improvedTop1Count: queryRewriteMetrics.improvedTop1Count, fallbackTriggeredCount: queryRewriteMetrics.fallbackTriggeredCount, avgRetrievalDurationMs: queryRewriteMetrics.rewriteCount > 0 ? Math.round(queryRewriteMetrics.retrievalDurationSumMs / queryRewriteMetrics.rewriteCount) : 0 }, index: { documentsCount: docs.length, chunksCount: allChunks.length, cachedEmbeddings: indexMetrics.cachedEmbeddings, generatedEmbeddings: indexMetrics.generatedEmbeddings, cacheHitRate: totalEmbeddingEvents > 0 ? Math.round((indexMetrics.cachedEmbeddings / totalEmbeddingEvents) * 1000) / 1000 : 0, avgChunksPerDoc: docs.length > 0 ? Math.round((allChunks.length / docs.length) * 100) / 100 : 0, lastIndexStats }, vector }; // 返回完整指标
} // getKnowledgeMetrics 结束

/** 获取最近一次检索调试数据。 */
export function getLastRetrievalDebug(): typeof lastRetrieval {
  return lastRetrieval; // 返回可能为 null 的快照
} // getLastRetrievalDebug 结束

/** 获取最近一次索引统计。 */
export function getLastIndexStats(): IncrementalIndexStats | null {
  return lastIndexStats; // 返回可能为 null 的统计
} // getLastIndexStats 结束

/** 全局知识库门面。 */
export const knowledgeStore = {
  importDocument: importKnowledgeDocument, // 导入文档
  updateDocument: updateKnowledgeDocument, // 更新文档
  deleteDocument: deleteKnowledgeDocument, // 删除文档
  listDocuments: listKnowledgeDocuments, // 列出完整文档
  listDocumentSummaries: listKnowledgeDocumentSummaries, // Knowledge Explorer
  listVectorSummaries, // 第30天：Vector Explorer
  search: searchKnowledge, // 检索
  reindex: reindexKnowledgeStore, // 重建索引
  getMetrics: getKnowledgeMetrics, // 指标
  getLastRetrieval: getLastRetrievalDebug, // 最近检索
  getLastIndexStats, // 最近索引
}; // knowledgeStore 结束
