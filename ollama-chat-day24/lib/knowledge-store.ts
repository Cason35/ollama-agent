/**
 * 第24天：本地知识库 Store — 内存 + 可选 JSON 持久化；导入 / 检索 / 指标。
 */
import { promises as fs } from "fs"; // 异步文件 IO
import path from "path"; // 路径拼接
import { buildChunksForDocument } from "@/lib/knowledge-chunking"; // 切块
import { embedTexts } from "@/lib/knowledge-embedding"; // 批量嵌入
import { retrieveTopChunks, DEFAULT_RETRIEVAL_TOP_K } from "@/lib/knowledge-retrieval"; // 语义检索
import type {
  KnowledgeDocument,
  KnowledgeMetricsSnapshot,
  RetrievedChunkHit,
} from "@/lib/knowledge-types"; // 类型

/** 进程内单例文档表。 */
const documents = new Map<string, KnowledgeDocument>(); // id → 文档

/** 检索调用计数（Knowledge Metrics）。 */
let retrievalCount = 0; // 累计检索次数

/** 最近一次检索结果（供 RAG Debug UI 展示）。 */
let lastRetrieval: {
  query: string; // 查询词
  topK: number; // TopK 参数
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

/** 从磁盘加载（启动时调用，失败则忽略）。 */
async function loadFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8"); // 读 JSON
    const parsed = JSON.parse(raw) as { documents?: KnowledgeDocument[]; retrievalCount?: number }; // 解析
    documents.clear(); // 清空内存
    for (const doc of parsed.documents ?? []) {
      documents.set(doc.id, doc); // 恢复每条
    }
    retrievalCount = parsed.retrievalCount ?? 0; // 恢复计数
  } catch {
    // 文件不存在或损坏：保持空库
  }
}

/** 将当前内存状态写入磁盘（导入后调用）。 */
async function saveToDisk(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true }); // 确保目录存在
  const payload = {
    documents: Array.from(documents.values()), // 序列化全部文档
    retrievalCount, // 持久化检索计数
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
 * 导入一篇知识：切块 → embedding → 存入 Store。
 * @param title 文档标题
 * @param content 正文
 */
export async function importKnowledgeDocument(
  title: string,
  content: string
): Promise<KnowledgeDocument> {
  await ensureLoaded(); // 等待磁盘加载
  const docId = newId("doc"); // 新文档 id
  const chunks = buildChunksForDocument(docId, content); // 固定窗口切块
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

/** 列出全部知识文档（不含 embedding 细节时可由 API 裁剪）。 */
export async function listKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  await ensureLoaded(); // 确保已加载
  return Array.from(documents.values()).sort((a, b) => b.createdAt - a.createdAt); // 按时间倒序
}

/**
 * 语义检索并更新 metrics / lastRetrieval。
 * @param query 查询文本
 * @param topK TopK
 */
export async function searchKnowledge(
  query: string,
  topK: number = DEFAULT_RETRIEVAL_TOP_K
): Promise<RetrievedChunkHit[]> {
  await ensureLoaded(); // 确保已加载
  const docs = Array.from(documents.values()); // 全库文档
  const hits = await retrieveTopChunks(query, docs, topK); // 向量检索
  retrievalCount += 1; // 指标 +1
  lastRetrieval = { query, topK, hits, at: Date.now() }; // 记录最近检索供 UI
  await saveToDisk(); // 持久化 retrievalCount
  return hits; // 返回命中
}

/** 读取知识库指标快照。 */
export async function getKnowledgeMetrics(): Promise<KnowledgeMetricsSnapshot> {
  await ensureLoaded(); // 确保已加载
  const docs = Array.from(documents.values()); // 全部文档
  const allChunks = docs.flatMap((d) => d.chunks); // 扁平化块
  const totalChars = allChunks.reduce((sum, c) => sum + c.text.length, 0); // 总字符
  const avgChunkSize =
    allChunks.length > 0 ? Math.round(totalChars / allChunks.length) : 0; // 平均块大小
  return {
    documents: docs.length,
    chunks: allChunks.length,
    avgChunkSize,
    retrievalCount,
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
