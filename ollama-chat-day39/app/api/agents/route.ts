import { apiJsonSuccess } from "@/lib/api/api-envelope"; /* 引入统一成功响应包装器 */
import { executeAgent, executeFixedAgentCollaboration, routeAgentByCapability } from "@/lib/agents/agent-executor"; /* 引入智能体执行器、协作执行器与能力路由函数 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂 */

export async function GET() { /* 定义 GET /api/agents 接口 */
  const registry = createDefaultAgentRegistry(); /* 创建包含四个默认智能体的注册表 */
  const researchRoute = routeAgentByCapability("research"); /* 验证 research 能力会路由到研究智能体 */
  const planRoute = routeAgentByCapability("plan"); /* 验证 plan 能力会路由到规划智能体 */
  const demoResult = executeAgent("research", { id: "day39-demo-task", goal: "演示第39天单 Agent 执行入口", assignedAgentId: "research" }); /* 执行一个轻量示例任务 */
  const collaboration = executeFixedAgentCollaboration("学习 LangGraph"); /* 执行第39天固定多智能体协作链 */
  return apiJsonSuccess({ agents: registry.list(), metrics: registry.getMetrics(collaboration.metrics), routes: { research: researchRoute?.name ?? null, plan: planRoute?.name ?? null }, demoResult, collaboration }); /* 返回智能体、指标、路由结果、执行示例和协作快照 */
} /* 结束 GET 接口 */
