import { apiJsonSuccess } from "@/lib/api/api-envelope"; /* 引入统一成功响应包装器。 */
import { executeAgent, executeSupervisorAgentCollaboration, routeAgentByCapability } from "@/lib/agents/agent-executor"; /* 引入智能体执行器、Supervisor 协作执行器与能力路由函数。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂。 */

export async function GET() { /* 定义 GET /api/agents 接口。 */
  const registry = createDefaultAgentRegistry(); /* 创建包含 Supervisor 与业务智能体的默认注册表。 */
  const superviseRoute = routeAgentByCapability("supervise"); /* 验证 supervise 能力会路由到监督智能体。 */
  const researchRoute = routeAgentByCapability("research"); /* 验证 research 能力会路由到研究智能体。 */
  const planRoute = routeAgentByCapability("plan"); /* 验证 plan 能力会路由到规划智能体。 */
  const demoResult = await executeAgent("supervisor", { id: "day43-demo-task", goal: "演示第43天 Reflection & Self-Correction 执行入口", assignedAgentId: "supervisor" }); /* 第43天：执行一个轻量 Supervisor 示例任务。 */
  const collaboration = await executeSupervisorAgentCollaboration("研究 LangGraph，先生成初稿，再通过 Reflection Agent 检查完整性、准确性、逻辑性和覆盖度；如果评分不足则重试，并把反思结论写入共享工作空间"); /* 第43天：执行带 Reflection（反思）与 Retry Loop（重试循环）的 Supervisor DAG 多智能体协作链。 */
  return apiJsonSuccess({ agents: registry.list(), metrics: registry.getMetrics(collaboration.metrics), routes: { supervise: superviseRoute?.name ?? null, research: researchRoute?.name ?? null, plan: planRoute?.name ?? null }, demoResult, collaboration }); /* 返回智能体、指标、路由结果、执行示例和协作快照。 */
} /* 结束 GET 接口。 */
