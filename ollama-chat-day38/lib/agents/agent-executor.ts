import type { AgentContext, AgentResult, AgentTask } from "@/lib/agents/agent-types"; /* 引入智能体上下文、结果和任务类型 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂 */

export function routeAgentByCapability(capability: string) { /* 定义按能力路由智能体的函数 */
  const registry = createDefaultAgentRegistry(); /* 创建包含四个默认智能体的注册表 */
  return registry.findByCapability(capability)[0]; /* 返回第一个匹配能力的智能体 */
} /* 结束 routeAgentByCapability 函数 */

export function executeAgent(agentId: string, task: AgentTask, context?: AgentContext): AgentResult { /* 定义第38天单智能体执行器 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于查找智能体 */
  const agent = registry.get(agentId); /* 根据 agentId 查找目标智能体 */
  if (!agent) return { output: `未找到 Agent：${agentId}` }; /* 找不到智能体时返回明确结果 */
  const memoryReady = context?.memory ? "已接收记忆上下文" : "暂无记忆上下文"; /* 生成记忆上下文状态描述 */
  const workflowReady = context?.workflow ? "已接收工作流上下文" : "暂无工作流上下文"; /* 生成工作流上下文状态描述 */
  const toolsReady = context?.tools ? "已接收工具上下文" : "暂无工具上下文"; /* 生成工具上下文状态描述 */
  return { output: `${agent.name} 已接收任务 ${task.id}：${task.goal}。能力：${agent.capabilities.join(", ")}。工具：${agent.tools.join(", ")}。上下文：${memoryReady}，${workflowReady}，${toolsReady}。` }; /* 返回单智能体模拟执行结果 */
} /* 结束 executeAgent 函数 */
