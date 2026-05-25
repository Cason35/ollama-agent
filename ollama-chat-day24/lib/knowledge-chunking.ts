/**
 * 第24天：文本切块 — 固定窗口切片（后续可扩展 overlap / semantic）。
 */
import type { KnowledgeChunk } from "@/lib/knowledge-types"; // 块类型

/** 默认切块字符长度（与学习计划一致）。 */
export const DEFAULT_CHUNK_SIZE = 500; // 每块最多 500 字符

/**
 * 将长文本按固定 size 切分为字符串数组。
 * @param text 原始全文
 * @param size 每块最大字符数
 */
export function chunkText(text: string, size: number = DEFAULT_CHUNK_SIZE): string[] {
  const normalized = text.trim(); // 去掉首尾空白
  if (!normalized) return []; // 空文返回空数组
  const chunks: string[] = []; // 结果列表
  for (let i = 0; i < normalized.length; i += size) {
    chunks.push(normalized.slice(i, i + size)); // 滑动窗口切片
  }
  return chunks; // 返回全部块文本
}

/**
 * 为文档生成带 id 的 KnowledgeChunk 列表（尚未写入 embedding）。
 * @param documentId 所属文档 id
 * @param text 待切块全文
 */
export function buildChunksForDocument(documentId: string, text: string): KnowledgeChunk[] {
  const parts = chunkText(text); // 先得到字符串块
  return parts.map((part, index) => ({
    id: `${documentId}-chunk-${index + 1}`, // 稳定块 id
    documentId, // 关联文档
    text: part, // 块正文
    embedding: undefined, // 导入流程中再填充
  })); // 映射为 KnowledgeChunk
}
