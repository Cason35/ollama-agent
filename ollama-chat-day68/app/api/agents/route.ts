import { apiJsonSuccess } from "@/lib/api/api-envelope"; /* 引入统一成功响应包装器。 */
import { executeAgent, executeSupervisorAgentCollaboration, routeAgentByCapability } from "@/lib/agents/agent-executor"; /* 引入智能体执行器、Supervisor 协作执行器与能力路由函数。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂。 */

export async function GET() { /* 定义 GET /api/agents 接口。 */
  const registry = createDefaultAgentRegistry(); /* 创建包含 Supervisor 与业务智能体的默认注册表。 */
  const superviseRoute = routeAgentByCapability("supervise"); /* 验证 supervise 能力会路由到监督智能体。 */
  const researchRoute = routeAgentByCapability("research"); /* 验证 research 能力会路由到研究智能体。 */
  const planRoute = routeAgentByCapability("plan"); /* 验证 plan 能力会路由到规划智能体。 */
  const evaluationRoute = routeAgentByCapability("evaluation"); /* 第45天：验证 evaluation 能力会路由到评估智能体。 */
  const demoResult = await executeAgent("supervisor", { id: "day47-demo-task", goal: "演示第47天 Usage & Cost Observability 的兼容执行入口", assignedAgentId: "supervisor" }); /* 第47天：执行轻量 Supervisor 示例并写入 Agent、Reflection 与 Evaluation 用量。 */
  const collaboration = await executeSupervisorAgentCollaboration("研究 LangGraph，并展示 Reflection、Evaluation、Trace、Token Accounting、Cost Tracking 和 Prompt ROI 在第47天协同工作"); /* 第47天：执行带完整用量记录的 Supervisor DAG 多智能体链。 */
  return apiJsonSuccess({ agents: registry.list(), metrics: registry.getMetrics(collaboration.metrics), routes: { supervise: superviseRoute?.name ?? null, research: researchRoute?.name ?? null, plan: planRoute?.name ?? null, evaluation: evaluationRoute?.name ?? null }, demoResult, collaboration }); /* 第47天：返回兼容智能体能力与新增用量记录会关联的协作快照。 */
} /* 结束 GET 接口。 */

