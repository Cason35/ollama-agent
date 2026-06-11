export type Agent = { /* 定义第40天智能体基础结构。 */
  id: string; /* 定义智能体唯一标识。 */
  name: string; /* 定义智能体展示名称。 */
  description: string; /* 定义智能体职责说明。 */
  capabilities: string[]; /* 定义智能体能力标签列表。 */
  systemPrompt: string; /* 定义智能体执行任务时使用的系统提示词。 */
  tools: string[]; /* 定义智能体可以调用或代表的工具名称列表。 */
}; /* 结束 Agent 类型定义。 */

export type AgentMetrics = { /* 定义第40天智能体注册表与计划运行时指标。 */
  totalAgents: number; /* 记录当前注册表中的智能体总数。 */
  capabilityCount: number; /* 记录去重后的能力数量。 */
  toolCoverage: number; /* 记录去重后的工具覆盖数量。 */
  executedTasks: number; /* 记录本次计划执行中已经执行的任务数量。 */
  delegatedTasks: number; /* 记录本次计划执行中已经委派的任务数量。 */
  avgTaskDuration: number; /* 记录本次计划执行的平均任务耗时毫秒数。 */
  successRate: number; /* 记录本次计划执行的任务成功率。 */
}; /* 结束 AgentMetrics 类型定义。 */

export type AgentContext = { /* 定义第40天智能体执行上下文。 */
  memory: unknown; /* 保存执行任务时可读取的记忆上下文。 */
  workflow: unknown; /* 保存执行任务时可读取的工作流上下文。 */
  tools: unknown; /* 保存执行任务时可读取的工具上下文。 */
}; /* 结束 AgentContext 类型定义。 */

export type AgentTask = { /* 定义第40天支持委派和计划执行的智能体任务结构。 */
  id: string; /* 定义任务唯一标识。 */
  goal: string; /* 定义要交给智能体处理的目标。 */
  context?: unknown; /* 保存从上游智能体传给当前智能体的任务上下文。 */
  parentTaskId?: string; /* 保存父任务 ID，用于追踪子任务来源。 */
  assignedAgentId?: string; /* 保存被分配执行该任务的智能体 ID。 */
}; /* 结束 AgentTask 类型定义。 */

export type AgentResult = { /* 定义第40天支持嵌套聚合的智能体执行结果结构。 */
  taskId: string; /* 保存结果对应的任务 ID。 */
  agentId: string; /* 保存执行该任务的智能体 ID。 */
  output: string; /* 保存智能体处理任务后的文本输出。 */
  metadata?: Record<string, unknown>; /* 保存额外运行元数据。 */
  childResults?: AgentResult[]; /* 保存下游智能体返回的嵌套结果。 */
}; /* 结束 AgentResult 类型定义。 */

export type AgentCallEdge = { /* 定义第40天智能体调用图边结构。 */
  fromAgentId: string; /* 保存发起委派的上游智能体 ID。 */
  toAgentId: string; /* 保存接收委派的下游智能体 ID。 */
  taskId: string; /* 保存触发本次委派的任务 ID。 */
}; /* 结束 AgentCallEdge 类型定义。 */

export type AgentTimelineEvent = { /* 定义第40天智能体计划时间线事件结构。 */
  id: string; /* 保存时间线事件唯一标识。 */
  agentId: string; /* 保存事件所属智能体 ID。 */
  taskId: string; /* 保存事件关联任务 ID。 */
  label: string; /* 保存事件展示文案。 */
  timestamp: string; /* 保存事件发生时间。 */
}; /* 结束 AgentTimelineEvent 类型定义。 */

export type AgentPlanStep = { /* 定义第40天智能体计划中的单个执行步骤。 */
  id: string; /* 保存计划步骤唯一标识。 */
  agentId: string; /* 保存该步骤要调用的智能体 ID。 */
  task: string; /* 保存该步骤要执行的具体任务。 */
  dependsOn?: string[]; /* 保存当前步骤依赖的前置步骤 ID 列表。 */
}; /* 结束 AgentPlanStep 类型定义。 */

export type AgentPlan = { /* 定义第40天 Supervisor Agent 产出的智能体计划。 */
  goal: string; /* 保存用户原始目标。 */
  selectedAgents: string[]; /* 保存 Supervisor 已选择的智能体 ID 列表。 */
  reason: string; /* 保存 Supervisor 做出该调度决策的原因。 */
  steps: AgentPlanStep[]; /* 保存按执行顺序排列的计划步骤。 */
}; /* 结束 AgentPlan 类型定义。 */

export type AgentPlanValidation = { /* 定义第40天智能体计划校验结果。 */
  ok: boolean; /* 表示计划是否通过校验。 */
  errors: string[]; /* 保存所有校验错误信息。 */
}; /* 结束 AgentPlanValidation 类型定义。 */

export type AgentDAGMetrics = { /* 定义第41天 Agent DAG 指标结构，用于观察图式计划的复杂度。 */
  totalSteps: number; /* 记录 DAG 计划中的总步骤数量。 */
  parallelSteps: number; /* 记录可以与同层其他步骤并行执行的步骤数量。 */
  maxDepth: number; /* 记录从入口节点到最深节点的最大层数。 */
  criticalPathLength: number; /* 记录决定整体耗时的最长依赖链长度。 */
}; /* 结束 AgentDAGMetrics 类型定义。 */

export type AgentCollaborationSnapshot = { /* 定义第40天 Supervisor 计划运行快照结构。 */
  result: AgentResult; /* 保存按计划执行并聚合后的最终结果。 */
  callGraph: AgentCallEdge[]; /* 保存智能体之间的委派调用图。 */
  timeline: AgentTimelineEvent[]; /* 保存包含 Supervisor 决策阶段的计划时间线。 */
  metrics: Pick<AgentMetrics, "executedTasks" | "delegatedTasks" | "avgTaskDuration" | "successRate">; /* 保存计划运行时指标。 */
  dagMetrics: AgentDAGMetrics; /* 保存第41天 DAG 总步数、并行步数、最大深度和关键路径指标。 */
  resultStore: Record<string, AgentResult>; /* 保存按 stepId 索引的 Agent Result Store，便于前端和测试查看依赖结果。 */
  plan: AgentPlan; /* 保存 Supervisor 产出的智能体计划。 */
  validation: AgentPlanValidation; /* 保存 AgentPlan Validator 的校验结果。 */
}; /* 结束 AgentCollaborationSnapshot 类型定义。 */
