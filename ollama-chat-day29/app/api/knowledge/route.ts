/**
 * 第29天：知识库 API，负责返回 Explorer 数据、V2 指标、增量导入和强制重建索引。
 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 统一响应
import { getLastRetrievalDebug, knowledgeStore } from "@/lib/knowledge/knowledge-store"; // 知识库门面 + 最近检索

/** GET — 返回文档摘要、指标、最近一次检索和 Knowledge Explorer 数据。 */
export async function GET() {
  const documents = await knowledgeStore.listDocumentSummaries(); // 第29天：轻量文档与 chunk 摘要
  const metrics = await knowledgeStore.getMetrics(); // 知识指标
  const lastRetrieval = getLastRetrievalDebug(); // 最近检索观测
  const lastIndexStats = knowledgeStore.getLastIndexStats(); // 最近一次增量索引统计
  return apiJsonSuccess({ documents, metrics, lastRetrieval, lastIndexStats }); // 成功 Envelope
}

/** POST — 导入知识 body { title?, content }，或重建索引 body { action: "reindex" }。 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; title?: string; content?: string }; // 解析 JSON
    if (body.action === "reindex") {
      const stats = await knowledgeStore.reindex(); // 第29天：强制重建全部索引
      const metrics = await knowledgeStore.getMetrics(); // 重建后刷新指标
      return apiJsonSuccess({ action: "reindex", stats, metrics }); // 返回重建结果
    }
    const content = typeof body.content === "string" ? body.content.trim() : ""; // 正文
    if (!content) {
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "content 不能为空"); // 校验失败
    }
    const title = typeof body.title === "string" ? body.title : ""; // 可选标题
    const doc = await knowledgeStore.importDocument(title, content); // 增量切块 + 缓存嵌入 + 保存
    const metrics = await knowledgeStore.getMetrics(); // 导入后刷新指标
    const lastIndexStats = knowledgeStore.getLastIndexStats(); // 最近一次导入统计
    return apiJsonSuccess({
      document: {
        id: doc.id, // 文档 id
        title: doc.title, // 标题
        version: doc.version, // 第29天：版本号
        contentHash: doc.contentHash.slice(0, 12), // 第29天：短正文哈希
        chunkCount: doc.chunks.length, // 块数
        createdAt: doc.createdAt, // 创建时间
        updatedAt: doc.updatedAt, // 更新时间
      },
      indexStats: lastIndexStats, // 第29天：增量导入统计
      metrics, // 指标
    }); // 返回新文档摘要
  } catch (err) {
    const msg = err instanceof Error ? err.message : "知识库操作失败"; // 错误消息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 服务端错误
  }
}
