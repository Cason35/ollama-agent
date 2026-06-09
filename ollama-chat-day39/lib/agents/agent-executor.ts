import type { AgentContext, AgentResult, AgentTask } from "@/lib/agents/agent-types"; /* 引入智能体上下文、结果和任务类型 */
import { AgentRuntime } from "@/lib/agents/agent-runtime"; /* 引入第39天智能体协作运行时 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂 */

export function routeAgentByCapability(capability: string) { /* 定义按能力路由智能体的函数 */
  const registry = createDefaultAgentRegistry(); /* 创建包含四个默认智能体的注册表 */
  return registry.findByCapability(capability)[0]; /* 返回第一个匹配能力的智能体 */
} /* 结束 routeAgentByCapability 函数 */

export function executeAgent(agentId: string, task: AgentTask, context?: AgentContext): AgentResult { /* 定义第39天单智能体执行器兼容入口 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于查找智能体 */
  const runtime = new AgentRuntime(registry); /* 创建第39天运行时用于统一执行入口 */
  return runtime.executeAgent(agentId, task, context); /* 通过运行时执行单智能体任务 */
} /* 结束 executeAgent 函数 */

export function executeFixedAgentCollaboration(goal: string, context?: AgentContext) { /* 定义第39天固定多智能体协作入口 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于协作链执行 */
  const runtime = new AgentRuntime(registry); /* 创建第39天智能体运行时 */
  return runtime.runFixedCollaboration(goal, context); /* 执行 Research 到 Planner 到 Critic 到 Writer 的固定链路 */
} /* 结束 executeFixedAgentCollaboration 函数 */
