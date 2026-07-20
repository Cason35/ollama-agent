/** 第30天：Local Vector Store，本地内存版向量存储实现。 */
import type { VectorMatch, VectorQueryFilter, VectorRecord, VectorRecordSummary, VectorStats, VectorStore } from "@/lib/knowledge/knowledge-types"; // 引入向量库类型

/** 将分数保留三位小数，方便 UI 展示。 */
function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000; // 四舍五入到三位小数
} // roundScore 结束

/** 计算两个向量的余弦相似度，并映射到 0 到 1。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0; // 空向量或维度不一致直接返回 0
  let dot = 0; // 点积累计
  let normA = 0; // 向量 a 的模长平方
  let normB = 0; // 向量 b 的模长平方
  for (let i = 0; i < a.length; i += 1) { // 逐维计算
    dot += a[i] * b[i]; // 累加点积
    normA += a[i] * a[i]; // 累加 a 的平方
    normB += b[i] * b[i]; // 累加 b 的平方
  } // for 结束
  const denom = Math.sqrt(normA) * Math.sqrt(normB); // 计算分母
  if (denom === 0) return 0; // 零向量无法比较
  const raw = dot / denom; // 原始余弦值
  return Math.max(0, Math.min(1, (raw + 1) / 2)); // 映射到 0 到 1
} // cosineSimilarity 结束

/** 第30天：本地 Map 版 VectorStore。 */
export class LocalVectorStore implements VectorStore {
  private records = new Map<string, VectorRecord>(); // id 到向量记录的映射
  private queryCount = 0; // 累计查询次数
  private queryDurationSum = 0; // 累计查询耗时

  /** 插入或更新向量记录。 */
  async upsert(vectors: VectorRecord[]): Promise<void> {
    for (const vector of vectors) { // 遍历所有待写入向量
      this.records.set(vector.id, vector); // Map 写入会自动覆盖同 id 旧记录
    } // for 结束
  } // upsert 结束

  /** 根据 query embedding 查询 TopK 近邻。 */
  async query(embedding: number[], topK: number, filter: VectorQueryFilter = {}): Promise<VectorMatch[]> {
    const startedAt = Date.now(); // 记录开始时间
    const limit = Math.max(1, Math.floor(topK)); // 防御性规整 TopK
    const matches: VectorMatch[] = []; // 保存候选命中
    for (const record of this.records.values()) { // 遍历本地向量记录
      if (filter.documentId && record.metadata.documentId !== filter.documentId) continue; // 支持按文档过滤
      matches.push({ // 写入候选
        id: record.id, // 向量记录 id
        score: roundScore(cosineSimilarity(embedding, record.embedding)), // 计算向量分
        metadata: record.metadata, // 保留回查元数据
      }); // push 结束
    } // for 结束
    matches.sort((a, b) => b.score - a.score); // 按相似度降序
    this.queryCount += 1; // 查询次数 +1
    this.queryDurationSum += Date.now() - startedAt; // 累计耗时
    return matches.slice(0, limit); // 返回 TopK
  } // query 结束

  /** 删除指定 id 的向量记录。 */
  async delete(ids: string[]): Promise<void> {
    for (const id of ids) { // 遍历待删除 id
      this.records.delete(id); // 从 Map 删除
    } // for 结束
  } // delete 结束

  /** 读取向量库指标。 */
  async stats(): Promise<VectorStats> {
    const records = Array.from(this.records.values()); // 展开全部记录
    const dimensionSum = records.reduce((sum, record) => sum + record.embedding.length, 0); // 累计维度
    return { // 返回指标快照
      provider: "local", // 当前 provider 固定为 local
      vectorCount: records.length, // 向量总数
      avgEmbeddingDimension: records.length > 0 ? Math.round(dimensionSum / records.length) : 0, // 平均维度
      queryCount: this.queryCount, // 查询次数
      avgQueryDuration: this.queryCount > 0 ? Math.round(this.queryDurationSum / this.queryCount) : 0, // 平均耗时
    }; // return 结束
  } // stats 结束

  /** 导出全部向量记录，用于 KnowledgeStore 持久化。 */
  dumpRecords(): VectorRecord[] {
    return Array.from(this.records.values()); // 返回记录数组
  } // dumpRecords 结束

  /** 用持久化记录恢复本地向量库。 */
  restoreRecords(records: VectorRecord[]): void {
    this.records.clear(); // 先清空旧记录
    for (const record of records) { // 遍历持久化记录
      this.records.set(record.id, record); // 写回 Map
    } // for 结束
  } // restoreRecords 结束

  /** 判断某个向量记录是否存在。 */
  has(id: string): boolean {
    return this.records.has(id); // 直接查询 Map
  } // has 结束

  /** 按文档 id 找出向量记录 id。 */
  idsByDocument(documentId: string): string[] {
    return Array.from(this.records.values()) // 展开记录
      .filter((record) => record.metadata.documentId === documentId) // 过滤同文档
      .map((record) => record.id); // 映射为 id
  } // idsByDocument 结束

  /** 生成 Vector Explorer 所需摘要。 */
  summaries(): VectorRecordSummary[] {
    return Array.from(this.records.values()) // 展开记录
      .map((record) => ({ // 转为摘要
        id: record.id, // 向量记录 id
        chunkId: record.metadata.chunkId, // 片段 id
        documentId: record.metadata.documentId, // 文档 id
        dimension: record.embedding.length, // 向量维度
        createdAt: record.createdAt, // 创建时间
        updatedAt: record.updatedAt, // 更新时间
      })) // map 结束
      .sort((a, b) => b.updatedAt - a.updatedAt); // 按更新时间倒序
  } // summaries 结束
} // LocalVectorStore 结束

/** 全局本地向量库单例。 */
export const localVectorStore = new LocalVectorStore(); // 供知识库与检索层共享
