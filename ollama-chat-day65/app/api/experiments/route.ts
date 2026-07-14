import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; /* 第53天：引入统一 API 响应工具。 */
import { getPromptExperimentDashboardSnapshot, promoteExperimentWinner } from "@/lib/prompts/prompt-experiment-runtime"; /* 第53天：引入实验仪表盘读取和一键 Promote 能力。 */

type ExperimentAction = "run" | "promote"; /* 第53天：定义实验 API 支持的动作。 */

type ExperimentActionBody = { /* 第53天：定义实验动作请求体。 */
  action?: ExperimentAction; /* 第53天：保存本次请求动作。 */
  experimentId?: string; /* 第53天：保存目标实验 ID。 */
}; /* 第53天：结束实验动作请求体类型。 */

function isExperimentAction(value: unknown): value is ExperimentAction { /* 第53天：定义实验动作类型守卫。 */
  return value === "run" || value === "promote"; /* 第53天：只允许重新运行和一键 Promote 两种动作。 */
} /* 第53天：结束实验动作类型守卫。 */

export async function GET() { /* 第53天：定义 GET /api/experiments 读取实验仪表盘快照接口。 */
  try { /* 第53天：捕获快照生成异常。 */
    return apiJsonSuccess(await getPromptExperimentDashboardSnapshot()); /* 第53天：返回实验定义、批量评估结果、Winner 和质量门禁。 */
  } catch (error) { /* 第53天：处理快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt experiment snapshot failed"); /* 第53天：返回统一内部错误。 */
  } /* 第53天：结束 GET 异常处理。 */
} /* 第53天：结束 GET /api/experiments 接口。 */

export async function POST(request: Request) { /* 第53天：定义 POST /api/experiments 执行实验动作接口。 */
  try { /* 第53天：捕获请求解析和实验动作异常。 */
    const body = await request.json() as ExperimentActionBody; /* 第53天：读取 JSON 请求体。 */
    if (!isExperimentAction(body.action)) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要 action=run 或 action=promote"); /* 第53天：校验动作字段。 */
    if (body.action === "run") return apiJsonSuccess(await getPromptExperimentDashboardSnapshot(true), "prompt experiment rerun completed"); /* 第53天：强制重新运行默认实验并返回快照。 */
    if (!body.experimentId) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "Promote 需要 experimentId"); /* 第53天：Promote 必须明确目标实验。 */
    return apiJsonSuccess(await promoteExperimentWinner(body.experimentId), "prompt experiment winner promoted"); /* 第53天：执行一键 Promote 并返回最新快照。 */
  } catch (error) { /* 第53天：处理实验动作失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt experiment action failed"); /* 第53天：返回统一内部错误。 */
  } /* 第53天：结束 POST 异常处理。 */
} /* 第53天：结束 POST /api/experiments 接口。 */

