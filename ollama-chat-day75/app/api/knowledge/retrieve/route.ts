/**
 * 第27天：POST /api/knowledge/retrieve — Query Rewrite + Multi-Query Retrieval（RAG Debug UI）。
 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // Envelope
import { knowledgeStore } from "@/lib/knowledge/knowledge-store"; // 知识库
import {
  getDefaultMinScore,
  getDefaultRecallK,
  getDefaultRetrievalTopK,
  normalizeRetrievalMode,
} from "@/lib/knowledge/knowledge-retrieval"; // 默认值与模式规整

/** POST body: { query: string, recallK?: number, topK?: number, minScore?: number, mode?: string } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      query?: string; // 查询文本
      recallK?: number; // 第一阶段召回数量
      topK?: number; // 最终返回数量
      minScore?: number; // 最低最终分
      mode?: string; // 检索模式
    }; // 请求体
    const query = typeof body.query === "string" ? body.query.trim() : ""; // 查询词
    if (!query) {
      return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "query 不能为空"); // 校验
    }
    const recallK =
      typeof body.recallK === "number" && body.recallK > 0
        ? Math.min(50, Math.floor(body.recallK))
        : getDefaultRecallK(); // 第62天：从配置中心读取默认召回数。
    const topK =
      typeof body.topK === "number" && body.topK > 0
        ? Math.min(20, Math.floor(body.topK))
        : getDefaultRetrievalTopK(); // 第62天：从配置中心读取默认 TopK。
    const minScore =
      typeof body.minScore === "number" && body.minScore >= 0 && body.minScore <= 1
        ? body.minScore
        : getDefaultMinScore(); // 第62天：从配置中心读取默认最低分。
    const mode = normalizeRetrievalMode(body.mode); // 规整检索模式
    const hits = await knowledgeStore.search(query, { recallK, topK, minScore, mode }); // Multi-Query 检索
    const metrics = await knowledgeStore.getMetrics(); // 刷新指标
    const lastRetrieval = knowledgeStore.getLastRetrieval(); // 最近检索快照
    return apiJsonSuccess({ query, recallK, topK, minScore, mode, rewrite: lastRetrieval?.rewrite, hits, metrics, lastRetrieval }); // 返回可观测数据
  } catch (err) {
    const msg = err instanceof Error ? err.message : "检索失败"; // 错误信息
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 500
  }
}


