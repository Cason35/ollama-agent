/**
 * 第25天：文本切块 — overlap 滑动窗口 + chunk metadata。
 */
import type { KnowledgeChunk } from "@/lib/knowledge/knowledge-types"; // 块类型
import crypto from "crypto"; // 第29天：用于生成 chunkHash

/** 默认切块字符长度（与学习计划一致）。 */
export const DEFAULT_CHUNK_SIZE = 500; // 每块最多 500 字符

/** 默认相邻块重叠字符数（避免关键信息被切断）。 */
export const DEFAULT_CHUNK_OVERLAP = 100; // 重叠 100 字符

/**
 * 第25天：将长文本按 size + overlap 切分为字符串数组（相邻块有重叠）。
 * @param text 原始全文
 * @param size 每块最大字符数
 * @param overlap 块与块之间的重叠长度（须小于 size）
 */
export function chunkText(
  text: string,
  size: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): string[] {
  const normalized = text.trim(); // 去掉首尾空白
  if (!normalized) return []; // 空文返回空数组
  const safeOverlap = Math.max(0, Math.min(overlap, size - 1)); // 重叠不能 >= size
  const step = Math.max(1, size - safeOverlap); // 每次窗口前进步长
  const chunks: string[] = []; // 结果列表
  let start = 0; // 当前窗口起点
  while (start < normalized.length) {
    const end = Math.min(start + size, normalized.length); // 当前窗口终点
    chunks.push(normalized.slice(start, end)); // 截取一块
    if (end >= normalized.length) break; // 已到文末则结束
    start += step; // 下一窗口：前进 size - overlap
  }
  return chunks; // 返回全部块文本
}

/** 粗略估计 token 数（中文场景用字符/4 近似）。 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4)); // 至少 1
}

/** 第29天：生成片段 SHA256 指纹。 */
function generateChunkHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex"); // 返回十六进制哈希
}

/**
 * 为文档生成带 id 与位置元数据的 KnowledgeChunk 列表（尚未写入 embedding）。
 * @param documentId 所属文档 id
 * @param text 待切块全文
 * @param size 块大小
 * @param overlap 重叠长度
 */
export function buildChunksForDocument(
  documentId: string,
  text: string,
  size: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): KnowledgeChunk[] {
  const normalized = text.trim(); // 规范化全文
  const parts = chunkText(normalized, size, overlap); // overlap 切块
  let cursor = 0; // 在 normalized 中搜索块起始位置的游标
  return parts.map((part, index) => {
    const foundAt = normalized.indexOf(part, cursor); // 定位块在原文中的偏移
    const startOffset = foundAt >= 0 ? foundAt : cursor; // 找不到则用游标
    const endOffset = startOffset + part.length; // 结束偏移
    cursor = Math.max(cursor, startOffset + 1); // 下次从当前块后继续搜
    return {
      id: `${documentId}-chunk-${index + 1}`, // 稳定块 id
      documentId, // 关联文档
      chunkHash: generateChunkHash(part), // 第29天：片段指纹
      text: part, // 块正文
      embedding: undefined, // 导入流程中再填充
      index, // 块序号
      startOffset, // 起始偏移
      endOffset, // 结束偏移
      tokenEstimate: estimateTokens(part), // token 粗估
    }; // 单块对象
  }); // 映射为 KnowledgeChunk[]
}

