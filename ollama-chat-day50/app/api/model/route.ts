import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第50天：引入统一 API 成功与错误响应包装器。 */
import { getModelDashboardSnapshot } from "@/lib/model/model-dashboard-runtime"; /* 第50天：引入 Model Explorer（模型浏览器）快照生成能力。 */
import { modelRouter } from "@/lib/model/model-router"; /* 第50天：引入共享模型路由器用于在线试路由。 */
import type { ModelRoutingInput, ModelTaskType } from "@/lib/model/model-profile-types"; /* 第50天：引入模型路由输入与任务类型。 */

const VALID_TASK_TYPES: ModelTaskType[] = ["chat", "summary", "planning", "reflection", "evaluation", "embedding", "json"]; /* 第50天：定义合法的任务类型集合用于校验。 */

export async function GET() { /* 第50天：定义 GET /api/model 读取模型注册表与路由预览快照接口。 */
  try { /* 第50天：捕获快照生成阶段可能出现的异常。 */
    return apiJsonSuccess(getModelDashboardSnapshot()); /* 第50天：返回模型档案、注册表指标与路由预览快照。 */
  } catch (error) { /* 第50天：处理模型快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Model snapshot failed"); /* 第50天：返回统一内部错误响应。 */
  } /* 第50天：结束 GET 异常处理。 */
} /* 第50天：结束 GET /api/model 接口。 */

export async function POST(request: Request) { /* 第50天：定义 POST /api/model 在线试路由接口，输入任务诉求返回选中的模型。 */
  try { /* 第50天：捕获请求体解析与路由阶段可能出现的异常。 */
    const body = (await request.json()) as Partial<ModelRoutingInput>; /* 第50天：读取模型路由输入请求体。 */
    if (!body.taskType || !VALID_TASK_TYPES.includes(body.taskType)) return apiJsonReasonError(API_REASON.MESSAGES_REQUIRED, `缺少或非法的 taskType，可选：${VALID_TASK_TYPES.join("、")}`); /* 第50天：校验任务类型必填且合法。 */
    const input: ModelRoutingInput = { taskType: body.taskType, complexity: body.complexity, requiresJson: body.requiresJson, maxCost: body.maxCost, latencyPreference: body.latencyPreference }; /* 第50天：组装规范化的模型路由输入。 */
    return apiJsonSuccess(modelRouter.routeWithReason(input), "model routed"); /* 第50天：返回带规则与理由的完整路由决策。 */
  } catch (error) { /* 第50天：处理在线试路由失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Model route failed"); /* 第50天：返回统一内部错误响应。 */
  } /* 第50天：结束 POST 异常处理。 */
} /* 第50天：结束 POST /api/model 接口。 */
