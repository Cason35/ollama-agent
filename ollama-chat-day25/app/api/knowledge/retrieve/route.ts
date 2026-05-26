/**
 * 第25天：POST /api/knowledge/retrieve — TopK + minScore 检索（RAG Debug UI）。
 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api-envelope"; // Envelope
import { knowledgeStore } from "@/lib/knowledge-store"; // 知识库
import { DEFAULT_RETRIEVAL_TOP_K, DEFAULT_MIN_SCORE } from "@/lib/knowledge-retrieval"; // 默认值

/** POST body: { query: string, topK?: number, minScore?: number } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string; topK?: number; minScore?: number }; // 请求体
    const query = typeof body.query === "string" ? body.query.trim() : ""; // 查询词
    if (!query) {
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "query 不能为空"); // 校验
    }
    const topK =
      typeof body.topK === "number" && body.topK > 0
        ? Math.min(20, Math.floor(body.topK))
        : DEFAULT_RETRIEVAL_TOP_K; // 限制最大 20
    const minScore =
      typeof body.minScore === "number" && body.minScore >= 0 && body.minScore <= 1
        ? body.minScore
        : DEFAULT_MIN_SCORE; // 0–1 阈值
    const hits = await knowledgeStore.search(query, { topK, minScore }); // 语义检索
    const metrics = await knowledgeStore.getMetrics(); // 刷新指标
    const lastRetrieval = knowledgeStore.getLastRetrieval(); // 最近检索快照
    return apiJsonSuccess({ query, topK, minScore, hits, metrics, lastRetrieval }); // 返回可观测数据
  } catch (err) {
    const msg = err instanceof Error ? err.message : "检索失败"; // 错误信息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 500
  }
}
