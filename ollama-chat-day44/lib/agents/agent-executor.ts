import type { AgentContext, AgentPlan, AgentResult, AgentTask } from "@/lib/agents/agent-types"; /* 引入智能体上下文、计划、结果和任务类型。 */
import { AgentRuntime } from "@/lib/agents/agent-runtime"; /* 引入第40天 Supervisor 智能体运行时。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 引入默认智能体注册表工厂。 */
import type { ModelRuntime } from "@/lib/model/model-runtime"; /* 引入模型运行时类型。 */

export function routeAgentByCapability(capability: string) { /* 定义按能力路由智能体的函数。 */
  const registry = createDefaultAgentRegistry(); /* 创建包含 Supervisor 与业务智能体的注册表。 */
  return registry.findByCapability(capability)[0]; /* 返回第一个匹配能力的智能体。 */
} /* 结束 routeAgentByCapability 函数。 */

export async function executeAgent(agentId: string, task: AgentTask, context?: AgentContext, rt?: ModelRuntime): Promise<AgentResult> { /* 定义单智能体执行器兼容入口。 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于查找智能体。 */
  const runtime = new AgentRuntime(registry); /* 创建第40天运行时用于统一执行入口。 */
  return runtime.executeAgent(agentId, task, context, rt); /* 通过运行时执行单智能体任务。 */
} /* 结束 executeAgent 函数。 */

export async function planAgents(goal: string, rt?: ModelRuntime): Promise<AgentPlan> { /* 定义 Supervisor 规划入口。 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于提供可选智能体。 */
  const runtime = new AgentRuntime(registry); /* 创建第40天 Supervisor 运行时。 */
  return runtime.planAgents(goal, rt); /* 返回 Supervisor 产出的智能体计划。 */
} /* 结束 planAgents 函数。 */

export async function executeAgentPlan(plan: AgentPlan, context?: AgentContext, rt?: ModelRuntime) { /* 定义执行 AgentPlan 的入口。 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于计划执行。 */
  const runtime = new AgentRuntime(registry); /* 创建第40天 Supervisor 运行时。 */
  return runtime.executeAgentPlan(plan, context, rt); /* 执行智能体计划并返回快照。 */
} /* 结束 executeAgentPlan 函数。 */

export async function executeSupervisorAgentCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime) { /* 定义第40天 Supervisor 多智能体协作入口。 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于协作链执行。 */
  const runtime = new AgentRuntime(registry); /* 创建第40天智能体运行时。 */
  return runtime.runSupervisorCollaboration(goal, context, rt); /* 执行 Supervisor 规划和动态协作链。 */
} /* 结束 executeSupervisorAgentCollaboration 函数。 */

export async function executeFixedAgentCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime) { /* 定义兼容 Day39 的固定多智能体协作入口。 */
  const registry = createDefaultAgentRegistry(); /* 创建默认注册表用于固定协作链执行。 */
  const runtime = new AgentRuntime(registry); /* 创建第40天智能体运行时。 */
  return runtime.runFixedCollaboration(goal, context, rt); /* 执行 Research 到 Planner 到 Critic 到 Writer 的固定链路。 */
} /* 结束 executeFixedAgentCollaboration 函数。 */
