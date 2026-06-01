/**
 * 第24天：知识库 API — GET 列表/指标；POST 导入笔记。
 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api-envelope"; // 统一响应
import { getLastRetrievalDebug, knowledgeStore } from "@/lib/knowledge-store"; // 知识库门面 + 最近检索

/** GET — 返回文档摘要、指标、最近一次检索（RAG Debug）。 */
export async function GET() {
  const documents = await knowledgeStore.listDocuments(); // 全量文档
  const metrics = await knowledgeStore.getMetrics(); // 知识指标
  const lastRetrieval = getLastRetrievalDebug(); // 最近检索观测
  const summaries = documents.map((d) => ({
    id: d.id, // 文档 id
    title: d.title, // 标题
    chunkCount: d.chunks.length, // 块数
    createdAt: d.createdAt, // 创建时间
    preview: d.content.slice(0, 120), // 正文预览
  })); // 轻量列表
  return apiJsonSuccess({ documents: summaries, metrics, lastRetrieval }); // 成功 Envelope
}

/** POST — 导入知识：body { title?, content }。 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; content?: string }; // 解析 JSON
    const content = typeof body.content === "string" ? body.content.trim() : ""; // 正文
    if (!content) {
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "content 不能为空"); // 校验失败
    }
    const title = typeof body.title === "string" ? body.title : ""; // 可选标题
    const doc = await knowledgeStore.importDocument(title, content); // 切块 + 嵌入 + 保存
    const metrics = await knowledgeStore.getMetrics(); // 导入后刷新指标
    return apiJsonSuccess({
      document: {
        id: doc.id,
        title: doc.title,
        chunkCount: doc.chunks.length,
        createdAt: doc.createdAt,
      },
      metrics,
    }); // 返回新文档摘要
  } catch (err) {
    const msg = err instanceof Error ? err.message : "导入失败"; // 错误消息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 服务端错误（如 Ollama 未启动）
  }
}
