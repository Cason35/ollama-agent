/** 第30天：知识库 API，返回 Knowledge Explorer、Vector Explorer、指标、导入与重建结果。 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 引入统一 API Envelope
import { getLastRetrievalDebug, knowledgeStore } from "@/lib/knowledge/knowledge-store"; // 引入知识库门面与最近检索快照

/** GET：返回文档摘要、向量摘要、指标、最近检索和最近索引统计。 */
export async function GET() {
  const documents = await knowledgeStore.listDocumentSummaries(); // 读取 Knowledge Explorer 数据
  const vectors = await knowledgeStore.listVectorSummaries(); // 第30天：读取 Vector Explorer 数据
  const metrics = await knowledgeStore.getMetrics(); // 读取知识库与向量库指标
  const lastRetrieval = getLastRetrievalDebug(); // 读取最近一次检索快照
  const lastIndexStats = knowledgeStore.getLastIndexStats(); // 读取最近一次索引统计
  return apiJsonSuccess({ documents, vectors, metrics, lastRetrieval, lastIndexStats }); // 返回统一成功响应
} // GET 结束

/** POST：导入知识 body { title?, content }，或重建索引 body { action: "reindex" }。 */
export async function POST(req: Request) {
  try { // 捕获业务异常
    const body = (await req.json()) as { action?: string; title?: string; content?: string }; // 解析请求体
    if (body.action === "reindex") { // 判断是否重建索引
      const stats = await knowledgeStore.reindex(); // 执行强制重建
      const metrics = await knowledgeStore.getMetrics(); // 重建后刷新指标
      const vectors = await knowledgeStore.listVectorSummaries(); // 重建后刷新向量摘要
      return apiJsonSuccess({ action: "reindex", stats, metrics, vectors }); // 返回重建结果
    } // if 结束
    const content = typeof body.content === "string" ? body.content.trim() : ""; // 读取正文
    if (!content) { // 校验正文
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "content 不能为空"); // 返回参数错误
    } // if 结束
    const title = typeof body.title === "string" ? body.title : ""; // 读取可选标题
    const doc = await knowledgeStore.importDocument(title, content); // 增量导入并写入 VectorStore
    const metrics = await knowledgeStore.getMetrics(); // 导入后刷新指标
    const vectors = await knowledgeStore.listVectorSummaries(); // 导入后刷新向量摘要
    const lastIndexStats = knowledgeStore.getLastIndexStats(); // 读取最近索引统计
    return apiJsonSuccess({ // 返回导入结果
      document: { // 文档轻量摘要
        id: doc.id, // 文档 id
        title: doc.title, // 标题
        version: doc.version, // 版本
        contentHash: doc.contentHash.slice(0, 12), // 短正文 hash
        chunkCount: doc.chunks.length, // 片段数
        createdAt: doc.createdAt, // 创建时间
        updatedAt: doc.updatedAt, // 更新时间
      }, // document 结束
      indexStats: lastIndexStats, // 最近索引统计
      metrics, // 指标
      vectors, // 第30天：向量摘要
    }); // apiJsonSuccess 结束
  } catch (err) { // 捕获异常
    const msg = err instanceof Error ? err.message : "知识库操作失败"; // 生成错误消息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 返回 500 Envelope
  } // catch 结束
} // POST 结束
