import type { Agent } from "@/lib/agents/agent-types"; /* 引入智能体基础类型。 */
import { AgentRegistry } from "@/lib/agents/agent-registry"; /* 引入智能体注册表类。 */

export const defaultAgents: Agent[] = [ /* 定义第40天内置智能体列表。 */
  { /* 定义 Supervisor Agent。 */
    id: "supervisor", /* 设置监督智能体 id。 */
    name: "Supervisor Agent", /* 设置监督智能体名称。 */
    description: "负责分析用户任务并选择合适的 Agent 协作链。", /* 设置监督智能体职责说明。 */
    capabilities: ["supervise", "agent-routing", "task-decomposition"], /* 设置监督智能体能力标签。 */
    systemPrompt: "你是一个多智能体调度器，负责根据用户目标选择必要 Agent、生成步骤和校验依赖。", /* 设置监督智能体系统提示词。 */
    tools: [], /* 设置监督智能体不直接调用业务工具。 */
  }, /* 结束 Supervisor Agent。 */
  { /* 定义 Research Agent。 */
    id: "research", /* 设置研究智能体 id。 */
    name: "Research Agent", /* 设置研究智能体名称。 */
    description: "负责检索、RAG 和资料整理。", /* 设置研究智能体职责说明。 */
    capabilities: ["research", "search", "rag"], /* 设置研究智能体能力标签。 */
    systemPrompt: "你是一个研究型 Agent，负责收集、检索和整理资料。", /* 设置研究智能体系统提示词。 */
    tools: ["retrieval", "ragAnswer", "summary"], /* 设置研究智能体可用工具。 */
  }, /* 结束 Research Agent。 */
  { /* 定义 Planner Agent。 */
    id: "planner", /* 设置规划智能体 id。 */
    name: "Planner Agent", /* 设置规划智能体名称。 */
    description: "负责计划拆解和 Workflow 设计。", /* 设置规划智能体职责说明。 */
    capabilities: ["plan", "planning", "workflow"], /* 设置规划智能体能力标签。 */
    systemPrompt: "你是一个规划型 Agent，负责把目标拆解为清晰步骤和工作流。", /* 设置规划智能体系统提示词。 */
    tools: ["workflowPlanner", "topologicalSort", "validateWorkflow"], /* 设置规划智能体可用工具。 */
  }, /* 结束 Planner Agent。 */
  { /* 定义 Critic Agent。 */
    id: "critic", /* 设置审查智能体 id。 */
    name: "Critic Agent", /* 设置审查智能体名称。 */
    description: "负责审查方案、发现问题和提出风险。", /* 设置审查智能体职责说明。 */
    capabilities: ["critic", "review", "risk"], /* 设置审查智能体能力标签。 */
    systemPrompt: "你是一个审查型 Agent，负责检查计划漏洞、风险和遗漏。", /* 设置审查智能体系统提示词。 */
    tools: ["validateWorkflow", "qualityCheck", "riskReview"], /* 设置审查智能体可用工具。 */
  }, /* 结束 Critic Agent。 */
  { /* 定义 Writer Agent。 */
    id: "writer", /* 设置写作智能体 id。 */
    name: "Writer Agent", /* 设置写作智能体名称。 */
    description: "负责输出、总结和面向用户的表达。", /* 设置写作智能体职责说明。 */
    capabilities: ["write", "summary", "output"], /* 设置写作智能体能力标签。 */
    systemPrompt: "你是一个写作型 Agent，负责把过程结果组织成清晰、可读的最终输出。", /* 设置写作智能体系统提示词。 */
    tools: ["summary", "formatAnswer", "todo"], /* 设置写作智能体可用工具。 */
  }, /* 结束 Writer Agent。 */
]; /* 结束默认智能体数组。 */

export function createDefaultAgentRegistry(): AgentRegistry { /* 定义创建默认注册表的工厂函数。 */
  const registry = new AgentRegistry(); /* 创建新的智能体注册表实例。 */
  defaultAgents.forEach((agent) => registry.register(agent)); /* 将默认智能体逐个注册。 */
  return registry; /* 返回已经初始化完成的注册表。 */
} /* 结束 createDefaultAgentRegistry 函数。 */
