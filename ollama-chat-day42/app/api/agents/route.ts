import { apiJsonSuccess } from "@/lib/api/api-envelope"; /* 引入统一成功响应包装器。 */
import { executeAgent, executeSupervisorAgentCollaboration, routeAgentByCapability } from "@/lib/agents/agent-executor"; /* 引入智能体执行器、Supervisor 协作执行器与能力路由函数。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂。 */

export async function GET() { /* 定义 GET /api/agents 接口。 */
  const registry = createDefaultAgentRegistry(); /* 创建包含 Supervisor 与业务智能体的默认注册表。 */
  const superviseRoute = routeAgentByCapability("supervise"); /* 验证 supervise 能力会路由到监督智能体。 */
  const researchRoute = routeAgentByCapability("research"); /* 验证 research 能力会路由到研究智能体。 */
  const planRoute = routeAgentByCapability("plan"); /* 验证 plan 能力会路由到规划智能体。 */
  const demoResult = await executeAgent("supervisor", { id: "day42-demo-task", goal: "演示第42天 Agent Memory + Shared Workspace 执行入口", assignedAgentId: "supervisor" }); /* 第42天：执行一个轻量 Supervisor 示例任务。 */
  const collaboration = await executeSupervisorAgentCollaboration("研究 LangGraph，总结核心概念，制定三天学习路线，并把研究发现、草稿、决策和最终报告写入共享工作空间"); /* 第42天：执行带共享工作空间的 Supervisor DAG 多智能体协作链。 */
  return apiJsonSuccess({ agents: registry.list(), metrics: registry.getMetrics(collaboration.metrics), routes: { supervise: superviseRoute?.name ?? null, research: researchRoute?.name ?? null, plan: planRoute?.name ?? null }, demoResult, collaboration }); /* 返回智能体、指标、路由结果、执行示例和协作快照。 */
} /* 结束 GET 接口。 */
