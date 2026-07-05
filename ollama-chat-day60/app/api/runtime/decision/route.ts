import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第57天：引入统一 API 成功与错误响应包装器。 */
import { getRuntimeDashboardSnapshot } from "@/lib/runtime/runtime-dashboard-runtime"; /* 第57天：引入 Runtime Explorer 看板快照生成函数。 */
import { runtimeDecisionEngine } from "@/lib/runtime/runtime-decision-engine"; /* 第57天：引入共享运行时决策引擎。 */
import { runtimeDecisionStore } from "@/lib/runtime/runtime-decision-store"; /* 第57天：引入共享运行时决策仓库。 */
import type { RuntimeBudgetLevel, RuntimeComplexity, RuntimeContext, RuntimeLatencyPreference, RuntimeTaskType } from "@/lib/runtime/runtime-types"; /* 第57天：引入 RuntimeContext 相关枚举类型。 */

const TASK_TYPES: RuntimeTaskType[] = ["chat", "research", "planning", "evaluation"]; /* 第57天：定义 API 允许的任务类型。 */
const COMPLEXITIES: RuntimeComplexity[] = ["low", "medium", "high"]; /* 第57天：定义 API 允许的复杂度。 */
const LATENCIES: RuntimeLatencyPreference[] = ["fast", "balanced", "quality"]; /* 第57天：定义 API 允许的延迟偏好。 */
const BUDGETS: RuntimeBudgetLevel[] = ["low", "medium", "high"]; /* 第57天：定义 API 允许的预算等级。 */

export async function GET() { /* 第57天：定义 GET /api/runtime/decision 获取运行时决策看板接口。 */
  try { /* 第57天：捕获看板生成异常。 */
    return apiJsonSuccess(getRuntimeDashboardSnapshot()); /* 第57天：返回典型决策、历史回放和指标。 */
  } catch (error) { /* 第57天：处理看板生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Runtime decision snapshot failed"); /* 第57天：返回统一内部错误。 */
  } /* 第57天：结束 GET 异常处理。 */
} /* 第57天：结束 GET 接口。 */

export async function POST(request: Request) { /* 第57天：定义 POST /api/runtime/decision 执行一次在线决策接口。 */
  try { /* 第57天：捕获请求解析和决策异常。 */
    const body = (await request.json()) as Partial<RuntimeContext>; /* 第57天：读取请求体并按部分 RuntimeContext 处理。 */
    const context = normalizeRuntimeContext(body); /* 第57天：规范化并校验运行时上下文。 */
    const decision = runtimeDecisionEngine.decide(context); /* 第57天：调用决策引擎生成运行时决策。 */
    const record = runtimeDecisionStore.record({ context, decision, source: "api-runtime-decision" }); /* 第57天：把本次在线决策写入回放仓库。 */
    return apiJsonSuccess({ context, decision, record, metrics: runtimeDecisionStore.getMetrics() }, "runtime decision created"); /* 第57天：返回上下文、决策、回放记录和最新指标。 */
  } catch (error) { /* 第57天：处理在线决策失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Runtime decision failed"); /* 第57天：返回统一内部错误。 */
  } /* 第57天：结束 POST 异常处理。 */
} /* 第57天：结束 POST 接口。 */

function normalizeRuntimeContext(input: Partial<RuntimeContext>): RuntimeContext { /* 第57天：定义请求体规范化函数。 */
  return { taskType: pick(input.taskType, TASK_TYPES, "chat"), complexity: pick(input.complexity, COMPLEXITIES, "low"), latencyPreference: pick(input.latencyPreference, LATENCIES, "balanced"), budgetLevel: pick(input.budgetLevel, BUDGETS, "medium"), hasKnowledge: input.hasKnowledge === true, hasWorkspace: input.hasWorkspace === true, hasMemory: input.hasMemory === true, requiresJson: input.requiresJson === true }; /* 第57天：返回带默认值的 RuntimeContext。 */
} /* 第57天：结束规范化函数。 */

function pick<T extends string>(value: unknown, candidates: T[], fallback: T): T { /* 第57天：定义枚举值安全选择工具。 */
  return candidates.includes(value as T) ? value as T : fallback; /* 第57天：命中候选则返回原值，否则返回默认值。 */
} /* 第57天：结束枚举值安全选择工具。 */
