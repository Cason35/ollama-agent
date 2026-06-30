import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第56天：引入统一 API 成功与错误响应包装器。 */
import { getModelCollaborationDashboardSnapshot } from "@/lib/model/model-collaboration-dashboard-runtime"; /* 第56天：引入模型协作看板快照生成能力。 */
import { modelCollaborationExecutor } from "@/lib/model/model-collaboration-executor"; /* 第56天：引入共享模型协作执行器，用于 POST 在线执行协作计划。 */
import { modelCollaborationPlanner } from "@/lib/model/model-collaboration-planner"; /* 第56天：引入共享模型协作规划器，用于 POST 生成协作计划。 */
import type { CollaborationTask } from "@/lib/model/model-collaboration-types"; /* 第56天：引入协作任务输入类型。 */
import type { ModelTaskType } from "@/lib/model/model-profile-types"; /* 第56天：引入任务类型用于请求校验。 */

const VALID_TASK_TYPES: ModelTaskType[] = ["chat", "summary", "research", "planning", "reflection", "evaluation", "embedding", "json"]; /* 第56天：定义协作接口允许的任务类型集合。 */

export async function GET() { /* 第56天：定义 GET /api/model/collaboration 读取多模型协作看板快照接口。 */
  try { /* 第56天：捕获快照生成可能出现的异常。 */
    return apiJsonSuccess(await getModelCollaborationDashboardSnapshot()); /* 第56天：返回模型团队、协作计划预览、演示执行结果与指标。 */
  } catch (error) { /* 第56天：处理协作快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Model collaboration snapshot failed"); /* 第56天：返回统一内部错误响应。 */
  } /* 第56天：结束 GET 异常处理。 */
} /* 第56天：结束 GET /api/model/collaboration 接口。 */

export async function POST(request: Request) { /* 第56天：定义 POST /api/model/collaboration 在线规划并执行一次多模型协作任务接口。 */
  try { /* 第56天：捕获请求体解析、规划和执行阶段可能出现的异常。 */
    const body = (await request.json()) as Partial<CollaborationTask>; /* 第56天：读取协作任务请求体。 */
    if (!body.taskType || !VALID_TASK_TYPES.includes(body.taskType)) return apiJsonReasonError(API_REASON.MESSAGES_REQUIRED, `缺少或非法的 taskType，可选：${VALID_TASK_TYPES.join("、")}`); /* 第56天：校验任务类型必填且合法。 */
    if (!body.prompt || !body.prompt.trim()) return apiJsonReasonError(API_REASON.MESSAGES_REQUIRED, "缺少 prompt，无法执行模型协作任务。"); /* 第56天：校验协作任务必须有原始提示词。 */
    const task: CollaborationTask = { taskId: body.taskId || `collaboration-${Date.now()}`, taskType: body.taskType, prompt: body.prompt, complexity: body.complexity, requiresJson: body.requiresJson, allowParallel: body.allowParallel, targetFormat: body.targetFormat }; /* 第56天：组装规范化协作任务输入。 */
    const plan = modelCollaborationPlanner.planModels(task); /* 第56天：为当前任务生成协作计划。 */
    const execution = await modelCollaborationExecutor.executePlan(plan, task); /* 第56天：按计划执行多模型协作并合并结果。 */
    return apiJsonSuccess({ task, plan, execution }, "model collaboration executed"); /* 第56天：返回任务、计划和执行结果。 */
  } catch (error) { /* 第56天：处理在线模型协作执行失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Model collaboration execution failed"); /* 第56天：返回统一内部错误响应。 */
  } /* 第56天：结束 POST 异常处理。 */
} /* 第56天：结束 POST /api/model/collaboration 接口。 */
