/**
 * 第24天：POST /api/knowledge/retrieve — 独立检索接口（供 RAG Debug UI 与测试）。
 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api-envelope"; // Envelope
import { knowledgeStore } from "@/lib/knowledge-store"; // 知识库
import { DEFAULT_RETRIEVAL_TOP_K } from "@/lib/knowledge-retrieval"; // 默认 TopK

/** POST body: { query: string, topK?: number } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string; topK?: number }; // 请求体
    const query = typeof body.query === "string" ? body.query.trim() : ""; // 查询词
    if (!query) {
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "query 不能为空"); // 校验
    }
    const topK =
      typeof body.topK === "number" && body.topK > 0
        ? Math.min(20, Math.floor(body.topK))
        : DEFAULT_RETRIEVAL_TOP_K; // 限制最大 20
    const hits = await knowledgeStore.search(query, topK); // 语义检索
    const metrics = await knowledgeStore.getMetrics(); // 刷新指标（含 retrievalCount）
    const lastRetrieval = knowledgeStore.getLastRetrieval(); // 最近检索快照
    return apiJsonSuccess({ query, topK, hits, metrics, lastRetrieval }); // 返回可观测数据
  } catch (err) {
    const msg = err instanceof Error ? err.message : "检索失败"; // 错误信息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 500
  }
}
