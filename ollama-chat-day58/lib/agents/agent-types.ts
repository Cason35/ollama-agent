import type { RuntimeContext, RuntimeDecision } from "@/lib/runtime/runtime-types"; /* 第57天：引入 RuntimeContext 与 RuntimeDecision，用于把自适应运行时决策接入 Agent Runtime。 */

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
  workspace?: Workspace; /* 第43天：注入当前共享工作空间，让每个 Agent 都能读取团队协作现场。 */
  trace?: { traceId: string; parentSpanId?: string }; /* 第44天：注入当前 Trace（追踪记录）和父 Span（父跨度），让子步骤能挂到同一条链路下。 */
  runtimeContext?: RuntimeContext; /* 第57天：注入当前运行时上下文，供 Agent Runtime 解释本轮策略来源。 */
  runtimeDecision?: RuntimeDecision; /* 第57天：注入当前运行时决策，供 Agent Runtime 和 Trace 复用同一次策略选择。 */
}; /* 结束 AgentContext 类型定义。 */

export type WorkspaceEntryType = "note" | "finding" | "draft" | "decision" | "question" | "final"; /* 第43天：继续复用工作空间条目类型，并把 Reflection（反思）结果记录为 decision（决策）条目。 */

export type ReflectionResult = { /* 第43天：定义 ReflectionResult（反思结果），描述一次输出自检后的质量判断。 */
  score: number; /* 第43天：记录当前 Agent 输出的质量分数，范围约定为 0 到 100。 */
  issues: string[]; /* 第43天：记录 Reflection Agent（反思智能体）发现的问题列表。 */
  suggestions: string[]; /* 第43天：记录下一轮重试时应该采纳的改进建议。 */
  shouldRetry: boolean; /* 第43天：记录当前输出是否应该触发 Retry Loop（重试循环）。 */
  promptId?: string; /* 第52天：记录本次 Reflection（反思）使用的提示词 ID。 */
  promptVersion?: string; /* 第52天：记录本次 Reflection（反思）使用的提示词版本。 */
}; /* 第43天：结束 ReflectionResult（反思结果）类型定义。 */

export type ReflectionAttempt = { /* 第43天：定义一次 Agent 输出和反思评审的完整尝试记录。 */
  attempt: number; /* 第43天：记录这是第几次生成尝试，从 1 开始计数。 */
  agentId: string; /* 第43天：记录被反思评审的业务 Agent ID。 */
  taskId: string; /* 第43天：记录被反思评审的任务 ID。 */
  output: string; /* 第43天：保存该轮 Agent 生成的原始输出。 */
  reflection: ReflectionResult; /* 第43天：保存该轮输出对应的反思结果。 */
  retried: boolean; /* 第43天：记录该轮之后是否真的触发了重试。 */
  createdAt: number; /* 第43天：保存该轮反思发生的时间戳。 */
}; /* 第43天：结束 ReflectionAttempt（反思尝试）类型定义。 */

export type ReflectionMetrics = { /* 第43天：定义 Reflection Metrics（反思指标），用于观察自我修正闭环。 */
  averageScore: number; /* 第43天：记录所有反思评分的平均值。 */
  retryCount: number; /* 第43天：记录因为反思未通过而触发的重试次数。 */
  passRate: number; /* 第43天：记录达到阈值的反思结果占比。 */
  improvementRate: number; /* 第43天：记录重试后相对首次评分的平均提升幅度。 */
}; /* 第43天：结束 ReflectionMetrics（反思指标）类型定义。 */

export type EvaluationResult = { /* 第45天：定义 EvaluationResult（评估结果），用于量化最终输出质量。 */
  score: number; /* 第45天：保存 0 到 100 的综合评估分数。 */
  dimensions: { /* 第45天：保存多维度评分结构。 */
    completeness: number; /* 第45天：保存 Completeness（完整性）评分。 */
    correctness: number; /* 第45天：保存 Correctness（正确性）评分。 */
    relevance: number; /* 第45天：保存 Relevance（相关性）评分。 */
    coverage: number; /* 第45天：保存 Coverage（覆盖度）评分。 */
  }; /* 第45天：结束多维度评分结构。 */
  strengths: string[]; /* 第45天：记录输出做得好的地方。 */
  weaknesses: string[]; /* 第45天：记录输出仍然不足的地方。 */
  suggestions: string[]; /* 第45天：记录下一轮优化建议。 */
  promptId?: string; /* 第52天：记录本次 Evaluation（评估）使用的提示词 ID。 */
  promptVersion?: string; /* 第52天：记录本次 Evaluation（评估）使用的提示词版本。 */
}; /* 第45天：结束 EvaluationResult（评估结果）类型定义。 */

export type EvaluationRecord = { /* 第45天：定义一次 Evaluation（评估）历史记录。 */
  id: string; /* 第45天：保存评估记录唯一标识。 */
  agentId: string; /* 第45天：保存被评估的 Agent ID。 */
  taskId: string; /* 第45天：保存被评估的任务 ID。 */
  output: string; /* 第45天：保存被评估的输出文本快照。 */
  evaluation: EvaluationResult; /* 第45天：保存本次输出对应的评估结果。 */
  createdAt: number; /* 第45天：保存评估发生时间戳。 */
}; /* 第45天：结束 EvaluationRecord（评估记录）类型定义。 */

export type EvaluationMetrics = { /* 第45天：定义 Evaluation Metrics（评估指标），用于观察输出质量趋势。 */
  averageScore: number; /* 第45天：记录全部评估记录的平均综合分。 */
  scoreDistribution: Record<string, number>; /* 第45天：记录评分分布桶，例如 90-100 或 70-79。 */
  topAgents: string[]; /* 第45天：记录平均分最高的 Agent 列表。 */
  lowScoreTasks: string[]; /* 第45天：记录低分任务列表，便于后续优化。 */
  improvementTrend: number[]; /* 第45天：记录最近评估分数趋势。 */
}; /* 第45天：结束 EvaluationMetrics（评估指标）类型定义。 */

export type PromptABTestResult = { /* 第45天：定义 Prompt A/B Test（提示词 A/B 测试）结果。 */
  taskId: string; /* 第45天：保存用于 A/B 测试的任务 ID。 */
  promptVersionA: string; /* 第45天：保存 A 版提示词策略描述。 */
  promptVersionB: string; /* 第45天：保存 B 版提示词策略描述。 */
  scoreA: number; /* 第45天：保存 A 版输出评估分。 */
  scoreB: number; /* 第45天：保存 B 版输出评估分。 */
  winner: "A" | "B" | "tie"; /* 第45天：保存胜出的提示词版本。 */
  evaluationA: EvaluationResult; /* 第45天：保存 A 版完整评估结果。 */
  evaluationB: EvaluationResult; /* 第45天：保存 B 版完整评估结果。 */
}; /* 第45天：结束 PromptABTestResult（提示词 A/B 测试结果）类型定义。 */

export type TraceSpanType = "agent" | "tool" | "workflow" | "queue" | "reflection" | "retrieval" | "evaluation" | "cache" | "memory" | "collaboration" | "decision"; /* 第57天：扩展 decision（运行时决策）跨度类型，用于追踪 Adaptive Runtime Decision Engine。 */

export type TraceSpanStatus = "running" | "success" | "failed"; /* 第44天：定义 TraceSpan（追踪跨度）的运行状态。 */

export type TraceSpan = { /* 第44天：定义一次 Trace（追踪记录）中的单个 Span（跨度）。 */
  spanId: string; /* 第44天：保存 Span（跨度）唯一标识。 */
  parentSpanId?: string; /* 第44天：保存父 Span（父跨度）ID，用于构建执行树。 */
  name: string; /* 第44天：保存执行片段名称，例如 supervisor、research 或 retrieval。 */
  type: TraceSpanType; /* 第44天：保存执行片段类型，例如 agent、tool、reflection 或 retrieval。 */
  startedAt: number; /* 第44天：保存 Span（跨度）开始时间戳。 */
  endedAt?: number; /* 第44天：保存 Span（跨度）结束时间戳。 */
  status: TraceSpanStatus; /* 第44天：保存 Span（跨度）当前状态。 */
  metadata?: Record<string, unknown>; /* 第44天：保存任务 ID、Agent ID、评分、工具名等额外可观测信息。 */
}; /* 第44天：结束 TraceSpan（追踪跨度）类型定义。 */

export type Trace = { /* 第44天：定义一次完整用户请求的 Trace（追踪记录）。 */
  traceId: string; /* 第44天：保存 Trace（追踪记录）唯一标识。 */
  rootOperation: string; /* 第44天：保存根操作名称，例如一次用户请求或一次 Supervisor 协作。 */
  startedAt: number; /* 第44天：保存 Trace（追踪记录）开始时间戳。 */
  endedAt?: number; /* 第44天：保存 Trace（追踪记录）结束时间戳。 */
  spans: TraceSpan[]; /* 第44天：保存该 Trace（追踪记录）下的所有 Span（跨度）。 */
}; /* 第44天：结束 Trace（追踪记录）类型定义。 */

export type TraceMetrics = { /* 第44天：定义 Trace Metrics（追踪指标），用于观察生产运行时耗时分布。 */
  totalTraces: number; /* 第44天：记录当前 TraceManager（追踪管理器）中完整追踪记录总数。 */
  avgTraceDuration: number; /* 第44天：记录完整 Trace（追踪记录）的平均耗时。 */
  avgAgentDuration: number; /* 第44天：记录 Agent Span（智能体跨度）的平均耗时。 */
  avgToolDuration: number; /* 第44天：记录 Tool Span（工具跨度）与 Retrieval Span（检索跨度）的平均耗时。 */
  avgReflectionDuration: number; /* 第44天：记录 Reflection Span（反思跨度）的平均耗时。 */
  avgDecisionDuration: number; /* 第57天：记录 Decision Span（决策跨度）的平均耗时。 */
}; /* 第44天：结束 TraceMetrics（追踪指标）类型定义。 */

export type WorkspaceEntry = { /* 第43天：定义单个 Agent 写入共享工作空间的结构。 */
  id: string; /* 第43天：保存工作空间条目的唯一标识。 */
  type: WorkspaceEntryType; /* 第43天：保存条目类型，用于前端分组和过滤。 */
  agentId: string; /* 第43天：保存写入该条目的 Agent ID。 */
  content: string; /* 第43天：保存 Agent 写入共享工作空间的正文内容。 */
  tags?: string[]; /* 第43天：保存可选标签，用于按主题筛选协作记录。 */
  createdAt: number; /* 第43天：保存条目创建时间戳。 */
}; /* 第43天：结束 WorkspaceEntry 类型定义。 */

export type Workspace = { /* 第43天：定义一次多 Agent 协作共享工作空间。 */
  id: string; /* 第43天：保存工作空间唯一标识。 */
  goal: string; /* 第43天：保存本次协作的用户目标。 */
  entries: WorkspaceEntry[]; /* 第43天：保存所有 Agent 写入的协作条目。 */
  createdAt: number; /* 第43天：保存工作空间创建时间戳。 */
  updatedAt: number; /* 第43天：保存工作空间最近更新时间戳。 */
}; /* 第43天：结束 Workspace 类型定义。 */

export type WorkspaceMetrics = { /* 第43天：定义工作空间可观测指标。 */
  entryCount: number; /* 第43天：记录当前工作空间条目总数。 */
  entriesByType: Record<string, number>; /* 第43天：记录不同条目类型的数量。 */
  entriesByAgent: Record<string, number>; /* 第43天：记录不同 Agent 写入的数量。 */
  lastUpdatedAt: number; /* 第43天：记录工作空间最后更新时间。 */
}; /* 第43天：结束 WorkspaceMetrics 类型定义。 */

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

export type AgentDAGMetrics = { /* 第43天：继续定义 Agent DAG 指标结构，用于观察图式计划的复杂度。 */
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
  dagMetrics: AgentDAGMetrics; /* 第43天：保存 DAG 总步数、并行步数、最大深度和关键路径指标。 */
  resultStore: Record<string, AgentResult>; /* 保存按 stepId 索引的 Agent Result Store，便于前端和测试查看依赖结果。 */
  workspace: Workspace; /* 第43天：保存本次协作产生的共享工作空间快照。 */
  workspaceMetrics: WorkspaceMetrics; /* 第43天：保存共享工作空间的条目数量和分布指标。 */
  reflectionAttempts: ReflectionAttempt[]; /* 第43天：保存每个 Agent 输出经过 Reflection（反思）评审和重试的尝试记录。 */
  reflectionMetrics: ReflectionMetrics; /* 第43天：保存 Reflection（反思）评分、通过率、重试次数和改进率。 */
  evaluations: EvaluationRecord[]; /* 第45天：保存每个 Agent 最终输出经过 Evaluation（评估）的历史记录。 */
  evaluationMetrics: EvaluationMetrics; /* 第45天：保存 Evaluation Metrics（评估指标），用于展示质量趋势和低分任务。 */
  promptABTest: PromptABTestResult; /* 第45天：保存 Prompt A/B Test（提示词 A/B 测试）结果。 */
  trace: Trace; /* 第44天：保存本次协作请求对应的完整 Trace（追踪记录）。 */
  traces: Trace[]; /* 第44天：保存当前运行时内全部 Trace（追踪记录），便于前端扩展为历史追踪列表。 */
  traceMetrics: TraceMetrics; /* 第44天：保存 Trace Metrics（追踪指标），用于展示平均链路耗时。 */
  plan: AgentPlan; /* 保存 Supervisor 产出的智能体计划。 */
  validation: AgentPlanValidation; /* 保存 AgentPlan Validator 的校验结果。 */
  runtimeContext?: RuntimeContext; /* 第57天：保存本次 Agent 协作对应的运行时上下文。 */
  runtimeDecision?: RuntimeDecision; /* 第57天：保存本次 Agent 协作使用的运行时决策。 */
}; /* 结束 AgentCollaborationSnapshot 类型定义。 */
