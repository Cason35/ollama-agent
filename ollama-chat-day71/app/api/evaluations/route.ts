import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第71天：引入统一 API 成功和错误响应封装。
import { productionEvaluationPlatform } from "@/lib/evaluation/production-evaluation-platform"; // 第71天：引入进程级生产评估平台单例。

type JsonBody = Record<string, unknown>; // 第71天：定义 Evaluation API 接收的通用 JSON 对象类型。
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; } // 第71天：把未知字段安全标准化为去首尾空白字符串。
function rating(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 3; } // 第71天：把未知评分安全收敛到一到五分。

export async function GET() { // 第71天：定义读取 Evaluation Explorer V2 完整快照的 Route Handler。
  try { return apiJsonSuccess(await productionEvaluationPlatform.getSnapshot(), "production evaluation platform snapshot"); } // 第71天：返回数据集、运行、案例、回归、门禁、反馈、事件、注册和指标完整快照。
  catch (error) { return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Production Evaluation GET failed"); } // 第71天：把未知服务端异常转换为统一内部错误响应。
} // 第71天：结束生产评估平台快照 GET Route Handler。

export async function POST(request: Request) { // 第71天：定义提交点赞、点踩、评分和评论的反馈闭环 Route Handler。
  try { // 第71天：隔离请求解析、参数校验和反馈闭环运行异常。
    const body = await request.json() as JsonBody; // 第71天：解析客户端提交的 JSON 请求体。
    const action = text(body.action); // 第71天：读取并标准化评估平台动作名称。
    const resultId = text(body.resultId); // 第71天：读取反馈关联的单案例评估结果标识。
    const sentiment = body.sentiment === "negative" ? "negative" : body.sentiment === "positive" ? "positive" : undefined; // 第71天：把未知情感字段安全收窄为正向或负向反馈。
    if (action === "submit_feedback" && resultId && sentiment) return apiJsonSuccess(await productionEvaluationPlatform.submitFeedback({ resultId, sentiment, rating: rating(body.rating), comment: text(body.comment) }), "evaluation feedback submitted"); // 第71天：保存用户反馈并返回更新后的坏案例和数据集闭环快照。
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "第71天 Evaluation API action、resultId 或 sentiment 不完整"); // 第71天：参数不完整时返回统一四百错误响应。
  } catch (error) { return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Evaluation POST failed"); } // 第71天：把 JSON 或反馈闭环异常转换为统一参数错误响应。
} // 第71天：结束生产评估平台反馈 POST Route Handler。
