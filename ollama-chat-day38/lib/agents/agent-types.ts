export type Agent = { /* 定义第38天智能体基础结构 */
  id: string; /* 定义智能体唯一标识 */
  name: string; /* 定义智能体展示名称 */
  description: string; /* 定义智能体职责说明 */
  capabilities: string[]; /* 定义智能体能力标签列表 */
  systemPrompt: string; /* 定义智能体执行任务时使用的系统提示词 */
  tools: string[]; /* 定义智能体可以调用或代表的工具名称列表 */
}; /* 结束 Agent 类型定义 */

export type AgentMetrics = { /* 定义第38天智能体注册表指标 */
  totalAgents: number; /* 记录当前注册表中的智能体总数 */
  capabilityCount: number; /* 记录去重后的能力数量 */
  toolCoverage: number; /* 记录去重后的工具覆盖数量 */
}; /* 结束 AgentMetrics 类型定义 */

export type AgentContext = { /* 定义第38天智能体执行上下文 */
  memory: unknown; /* 保存执行任务时可读取的记忆上下文 */
  workflow: unknown; /* 保存执行任务时可读取的工作流上下文 */
  tools: unknown; /* 保存执行任务时可读取的工具上下文 */
}; /* 结束 AgentContext 类型定义 */

export type AgentTask = { /* 定义第39天协作前需要准备的智能体任务结构 */
  id: string; /* 定义任务唯一标识 */
  goal: string; /* 定义要交给智能体处理的目标 */
}; /* 结束 AgentTask 类型定义 */

export type AgentResult = { /* 定义智能体执行结果结构 */
  output: string; /* 保存智能体处理任务后的文本输出 */
}; /* 结束 AgentResult 类型定义 */
