/**
 * 第28天：本地知识库 Store — Memory-aware Retrieval Pipeline / Pipeline Metrics。
 */
import { promises as fs } from "fs"; // 异步文件 IO
import path from "path"; // 路径拼接
import { buildChunksForDocument } from "@/lib/knowledge/knowledge-chunking"; // overlap 切块
import { embedTexts } from "@/lib/knowledge/knowledge-embedding"; // 批量嵌入
import {
  retrieveTopChunks,
  DEFAULT_RETRIEVAL_TOP_K,
  DEFAULT_MIN_SCORE,
  DEFAULT_RECALL_K,
  DEFAULT_RETRIEVAL_MODE,
} from "@/lib/knowledge/knowledge-retrieval"; // 语义检索
import { runRetrievalPipeline } from "@/lib/knowledge/retrieval-pipeline"; // 第28天：Memory-aware 检索流水线
import type { ModelRuntime } from "@/lib/model/model-runtime"; // 第28天：可选 LLM rewrite 运行时
import type {
  KnowledgeDocument,
  KnowledgeMetricsSnapshot,
  PipelineMetrics,
  QueryRewriteDebug,
  RetrievalMode,
  RetrieveOptions,
  RetrievedChunkHit,
} from "@/lib/knowledge/knowledge-types"; // 类型

/** 进程内单例文档表。 */
const documents = new Map<string, KnowledgeDocument>(); // id → 文档

/** 第25天：RAG 检索指标累计（内存 + 持久化）。 */
const retrievalMetrics = {
  queryCount: 0, // 检索次数
  topScoreSum: 0, // 各次最高分之和（用于算 avgTopScore）
  noResultCount: 0, // 过滤后 0 条次数
  retrievedChunksSum: 0, // 返回块数累计（用于算平均）
}; // 指标对象

/** 第27天：Query Rewrite 与 Multi-Query 指标累计。 */
const queryRewriteMetrics = {
  rewriteCount: 0, // 触发改写的累计次数
  generatedQueriesSum: 0, // 所有改写 query 数量之和
  multiQueryHitCount: 0, // multi-query 有命中的次数
  improvedTop1Count: 0, // Top1 来自非原始 query 命中的次数
  fallbackTriggeredCount: 0, // 第28天：fallback LLM 重试次数
  retrievalDurationSumMs: 0, // 第28天：Pipeline 总耗时
}; // Query Rewrite 指标对象

/** 最近一次检索结果（供 RAG Debug UI 展示）。 */
let lastRetrieval: {
  query: string; // 查询词
  recallK: number; // 第27天：第一阶段召回数量
  topK: number; // TopK 参数
  minScore: number; // 相似度阈值
  mode: RetrievalMode; // 第27天：检索模式
  rewrite: QueryRewriteDebug; // 第27天：Query Rewrite 调试信息
  pipeline: PipelineMetrics; // 第28天：Pipeline 单次指标
  hits: RetrievedChunkHit[]; // 命中列表
  at: number; // 时间戳
} | null = null; // 无检索时为 null

/** 数据目录（项目根下 .data）。 */
const DATA_DIR = path.join(process.cwd(), ".data"); // Next 运行时 cwd 为项目根

/** 知识库 JSON 持久化路径。 */
const STORE_FILE = path.join(DATA_DIR, "knowledge-store.json"); // 单文件存储

/** 生成简单唯一 id。 */
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; // 时间戳 + 随机
}

/** 为旧版 chunk 补全 metadata（兼容第24天数据）。 */
function normalizeChunkMetadata(doc: KnowledgeDocument): KnowledgeDocument {
  let cursor = 0; // 偏移游标
  const chunks = doc.chunks.map((c, index) => {
    const hasMeta =
      typeof c.index === "number" &&
      typeof c.startOffset === "number" &&
      typeof c.endOffset === "number"; // 是否已有元数据
    if (hasMeta) return c; // 已有则跳过
    const startOffset = cursor; // 按顺序估算偏移
    const endOffset = startOffset + c.text.length; // 结束
    cursor = endOffset; // 推进游标
    return {
      ...c,
      index: typeof c.index === "number" ? c.index : index, // 序号
      startOffset, // 起始
      endOffset, // 结束
      tokenEstimate: c.tokenEstimate ?? Math.max(1, Math.ceil(c.text.length / 4)), // token 估
    }; // 补全后的块
  }); // 遍历
  return { ...doc, chunks }; // 返回文档
}

/** 从磁盘加载（启动时调用，失败则忽略）。 */
async function loadFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8"); // 读 JSON
    const parsed = JSON.parse(raw) as {
      documents?: KnowledgeDocument[];
      retrievalMetrics?: typeof retrievalMetrics;
      queryRewriteMetrics?: typeof queryRewriteMetrics;
      retrievalCount?: number; // 第24天兼容字段
    }; // 解析
    documents.clear(); // 清空内存
    for (const doc of parsed.documents ?? []) {
      documents.set(doc.id, normalizeChunkMetadata(doc)); // 恢复并规范化
    }
    if (parsed.retrievalMetrics) {
      Object.assign(retrievalMetrics, parsed.retrievalMetrics); // 恢复 RAG 指标
    } else if (typeof parsed.retrievalCount === "number") {
      retrievalMetrics.queryCount = parsed.retrievalCount; // 兼容旧字段
    }
    if (parsed.queryRewriteMetrics) {
      Object.assign(queryRewriteMetrics, parsed.queryRewriteMetrics); // 恢复 Query Rewrite 指标
    }
  } catch {
    // 文件不存在或损坏：保持空库
  }
}

/** 将当前内存状态写入磁盘（导入/检索后调用）。 */
async function saveToDisk(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true }); // 确保目录存在
  const payload = {
    documents: Array.from(documents.values()), // 序列化全部文档
    retrievalMetrics, // 第25天指标
    queryRewriteMetrics, // 第27天 Query Rewrite 指标
    retrievalCount: retrievalMetrics.queryCount, // 兼容第24天字段名
  };
  await fs.writeFile(STORE_FILE, JSON.stringify(payload, null, 2), "utf8"); // 写入 JSON
}

/** 启动时尝试加载一次（模块初始化）。 */
const loadPromise = loadFromDisk(); // 不阻塞 import，API 内 await ensureLoaded

/** 确保加载完成后再读写。 */
async function ensureLoaded(): Promise<void> {
  await loadPromise; // 等待首次 load
}

/**
 * 导入一篇知识：overlap 切块 → embedding → 存入 Store。
 * @param title 文档标题
 * @param content 正文
 */
export async function importKnowledgeDocument(
  title: string,
  content: string
): Promise<KnowledgeDocument> {
  await ensureLoaded(); // 等待磁盘加载
  const docId = newId("doc"); // 新文档 id
  const chunks = buildChunksForDocument(docId, content); // 第25天 overlap + metadata
  const vectors = await embedTexts(chunks.map((c) => c.text)); // 为每块生成向量
  const chunksWithEmb = chunks.map((c, i) => ({
    ...c,
    embedding: vectors[i], // 写入 embedding
  })); // 合并向量
  const doc: KnowledgeDocument = {
    id: docId,
    title: title.trim() || `未命名笔记 ${new Date().toLocaleString("zh-CN")}`, // 默认标题
    content: content.trim(),
    chunks: chunksWithEmb,
    createdAt: Date.now(),
  };
  documents.set(doc.id, doc); // 写入内存
  await saveToDisk(); // 持久化
  return doc; // 返回完整文档
}

/** 列出全部知识文档。 */
export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  await ensureLoaded(); // 确保已加载
  return Array.from(documents.values()).sort((a, b) => b.createdAt - a.createdAt); // 按时间倒序
}

/**
 * 第28天：Memory-aware Pipeline 检索并更新 RAG metrics / Query Rewrite metrics / lastRetrieval。
 * @param query 查询文本
 * @param options recallK / TopK / minScore / mode
 */
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
  const singleHits = await retrieveTopChunks(query, docs, { recallK, topK, minScore, mode }); // 保留 single query 对照
  const result = await runRetrievalPipeline({ query, documents: docs, options: { ...options, recallK, topK, minScore, mode }, rt }); // 第28天：Memory-aware pipeline
  const hits = result.retrievedChunks; // 取最终命中列表
  retrievalMetrics.queryCount += 1; // 检索次数 +1
  const topScore = hits.length > 0 ? hits[0].score : 0; // 本次最高分
  retrievalMetrics.topScoreSum += topScore; // 累加用于平均
  if (hits.length === 0) retrievalMetrics.noResultCount += 1; // 无结果计数
  retrievalMetrics.retrievedChunksSum += hits.length; // 返回块数累加
  queryRewriteMetrics.rewriteCount += 1; // 改写次数 +1
  queryRewriteMetrics.generatedQueriesSum += result.rewrittenQueries.length; // 累加生成 query 数
  if (hits.length > 0) queryRewriteMetrics.multiQueryHitCount += 1; // multi-query 有命中则计数
  if (hits[0]?.chunkId && hits[0].chunkId !== singleHits[0]?.chunkId && (hits[0].matchedQueries?.length ?? 0) > 0) {
    queryRewriteMetrics.improvedTop1Count += 1; // Top1 与 single query 不同则记录一次改善
  }
  if (result.fallbackTriggered) queryRewriteMetrics.fallbackTriggeredCount += 1; // fallback 次数 +1
  queryRewriteMetrics.retrievalDurationSumMs += result.metrics.retrievalDurationMs; // 累加 pipeline 耗时
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
      rewriteMode: result.mode === "hybrid" ? "rule" : result.mode, // UI 展示改写模式
      usedMemory: result.memoryUsed, // 是否使用记忆
      usedRecentMessages: result.recentMessagesUsed, // 是否使用最近对话
      knowledgeTopicsUsed: result.knowledgeTopicsUsed, // 使用的主题
    }, // rewrite 调试对象
    pipeline: result.metrics, // Pipeline 单次指标
    hits, // 命中列表
    at: Date.now(), // 时间戳
  }; // 记录最近检索供 UI
  await saveToDisk(); // 持久化指标
  return hits; // 返回命中
}

/** 读取知识库指标快照（含 RAG 质量指标）。 */
export async function getKnowledgeMetrics(): Promise<KnowledgeMetricsSnapshot> {
  await ensureLoaded(); // 确保已加载
  const docs = Array.from(documents.values()); // 全部文档
  const allChunks = docs.flatMap((d) => d.chunks); // 扁平化块
  const totalChars = allChunks.reduce((sum, c) => sum + c.text.length, 0); // 总字符
  const avgChunkSize =
    allChunks.length > 0 ? Math.round(totalChars / allChunks.length) : 0; // 平均块大小
  const q = retrievalMetrics.queryCount || 0; // 检索次数
  return {
    documents: docs.length,
    chunks: allChunks.length,
    avgChunkSize,
    retrievalCount: q, // 兼容第24天 UI
    retrieval: {
      queryCount: q,
      avgTopScore: q > 0 ? Math.round((retrievalMetrics.topScoreSum / q) * 1000) / 1000 : 0,
      noResultCount: retrievalMetrics.noResultCount,
      avgRetrievedChunks:
        q > 0 ? Math.round((retrievalMetrics.retrievedChunksSum / q) * 100) / 100 : 0,
    },
    queryRewrite: {
      rewriteCount: queryRewriteMetrics.rewriteCount,
      avgGeneratedQueries:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round((queryRewriteMetrics.generatedQueriesSum / queryRewriteMetrics.rewriteCount) * 100) / 100
          : 0,
      multiQueryHitRate:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round((queryRewriteMetrics.multiQueryHitCount / queryRewriteMetrics.rewriteCount) * 1000) / 1000
          : 0,
      improvedTop1Count: queryRewriteMetrics.improvedTop1Count,
      fallbackTriggeredCount: queryRewriteMetrics.fallbackTriggeredCount,
      avgRetrievalDurationMs:
        queryRewriteMetrics.rewriteCount > 0
          ? Math.round(queryRewriteMetrics.retrievalDurationSumMs / queryRewriteMetrics.rewriteCount)
          : 0,
    },
  }; // 指标对象
}

/** 获取最近一次检索观测数据（RAG Debug UI）。 */
export function getLastRetrievalDebug(): typeof lastRetrieval {
  return lastRetrieval; // 可能为 null
}

/** 全局知识库 Store 门面（与 workflow Tool 解耦）。 */
export const knowledgeStore = {
  importDocument: importKnowledgeDocument,
  listDocuments: listKnowledgeDocuments,
  search: searchKnowledge,
  getMetrics: getKnowledgeMetrics,
  getLastRetrieval: getLastRetrievalDebug,
};

