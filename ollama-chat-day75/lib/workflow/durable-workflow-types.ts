export const WORKFLOW_DEFINITION_STATUSES = ["draft", "testing", "active", "deprecated"] as const; // 第70天：声明工作流定义允许使用的四种版本状态。
export type WorkflowDefinitionStatusV2 = (typeof WORKFLOW_DEFINITION_STATUSES)[number]; // 第70天：从状态常量推导工作流定义状态联合类型。
export const WORKFLOW_EXECUTION_STATUSES = ["created", "running", "paused", "waiting", "completed", "failed", "cancelled"] as const; // 第70天：声明持久化执行实例完整生命周期状态。
export type WorkflowExecutionStatusV2 = (typeof WORKFLOW_EXECUTION_STATUSES)[number]; // 第70天：从执行状态常量推导执行实例状态联合类型。
export const WORKFLOW_LIFECYCLE_EVENT_TYPES = ["workflow.created", "workflow.started", "workflow.step_started", "workflow.step_completed", "workflow.step_failed", "workflow.paused", "workflow.resumed", "workflow.completed", "workflow.cancelled"] as const; // 第70天：声明任务清单要求的工作流生命周期事件类型。
export type WorkflowLifecycleEventType = (typeof WORKFLOW_LIFECYCLE_EVENT_TYPES)[number]; // 第70天：从生命周期事件常量推导事件类型联合。
export type DurableWorkflowStep = { // 第70天：定义可版本化、可恢复执行的工作流步骤结构。
  id: string; // 第70天：保存定义版本内唯一的步骤标识。
  name: string; // 第70天：保存 Workflow Explorer 展示的步骤名称。
  description?: string; // 第70天：保存步骤职责与审计说明。
  handler: string; // 第70天：保存执行器在 UnifiedRegistry 中发现的处理器键。
  dependsOn?: string[]; // 第70天：保存步骤依赖并用于恢复后的可运行性判断。
  input?: unknown; // 第70天：保存定义级静态输入并与执行实例输入组合。
  requiresConfirmation?: boolean; // 第70天：标记步骤是否需要 HITL 人工确认。
  retryLimit?: number; // 第70天：保存允许的步骤重试上限供治理与审计使用。
}; // 第70天：结束持久化工作流步骤结构定义。
export type WorkflowDefinitionV2 = { // 第70天：定义任务要求的正式版本化工作流资源。
  id: string; // 第70天：保存跨版本稳定的工作流标识。
  name: string; // 第70天：保存工作流可读名称。
  version: number; // 第70天：保存不可覆盖的正整数工作流版本。
  description?: string; // 第70天：保存工作流目标与升级说明。
  steps: DurableWorkflowStep[]; // 第70天：保存该版本冻结的步骤定义快照。
  status: WorkflowDefinitionStatusV2; // 第70天：保存草稿、测试、活动或弃用状态。
  owner: string; // 第70天：保存 Workflow Catalog 展示的负责人。
  createdAt: number; // 第70天：保存该版本创建时间戳。
  updatedAt: number; // 第70天：保存该版本最近更新时间戳。
}; // 第70天：结束工作流定义第二版结构定义。
export type WorkflowContextV1 = { // 第70天：定义写入统一运行时上下文的工作流专用字段。
  workflowId: string; // 第70天：关联稳定工作流定义标识。
  executionId: string; // 第70天：关联本次具体执行实例。
  version: number; // 第70天：冻结本次执行使用的定义版本。
  checkpointId?: string; // 第70天：关联最近一个可靠恢复检查点。
}; // 第70天：结束运行时工作流上下文结构定义。
export type WorkflowExecutionV2 = { // 第70天：定义一次具体持久化工作流执行实例。
  id: string; // 第70天：保存全局唯一执行实例标识。
  workflowId: string; // 第70天：关联稳定工作流定义标识。
  workflowVersion: number; // 第70天：冻结执行开始时采用的工作流版本。
  status: WorkflowExecutionStatusV2; // 第70天：保存执行实例当前生命周期状态。
  runtimeContextId: string; // 第70天：关联统一运行时上下文请求标识。
  traceId: string; // 第70天：关联 EventBus 与事件溯源时间线。
  input: Record<string, unknown>; // 第70天：保存本次执行级输入快照。
  currentStepId?: string; // 第70天：保存正在执行或等待确认的步骤标识。
  approvedStepIds: string[]; // 第70天：保存已经人工确认的 HITL 步骤标识。
  retryCount: number; // 第70天：累计失败后重新执行次数。
  resumeCount: number; // 第70天：累计暂停、中断或等待后的恢复次数。
  replayCount: number; // 第70天：累计不重新调用处理器的历史回放次数。
  startedAt: number; // 第70天：保存执行创建与启动时间戳。
  updatedAt: number; // 第70天：保存执行最近状态变化时间戳。
  completedAt?: number; // 第70天：保存完成、失败或取消的终态时间戳。
  error?: string; // 第70天：保存安全且可展示的最近失败摘要。
}; // 第70天：结束工作流执行实例结构定义。
export type WorkflowCheckpoint = { // 第70天：定义步骤完成、失败或等待时保存的可靠检查点。
  id: string; // 第70天：保存全局唯一检查点标识。
  executionId: string; // 第70天：关联所属工作流执行实例。
  workflowId: string; // 第70天：关联稳定工作流定义标识。
  workflowVersion: number; // 第70天：记录检查点对应的冻结定义版本。
  stepId: string; // 第70天：记录产生检查点的步骤标识。
  status: "completed" | "failed" | "waiting"; // 第70天：区分可靠成功点、失败点与人工等待点。
  output?: unknown; // 第70天：保存步骤输出快照以支持恢复和无副作用回放。
  error?: string; // 第70天：保存失败检查点的安全错误摘要。
  timestamp: number; // 第70天：保存检查点创建时间戳。
  stateVersion: number; // 第70天：保存写入检查点时的状态版本号。
}; // 第70天：结束工作流检查点结构定义。
export type WorkflowStateV2 = { // 第70天：定义任务要求的完整工作流状态存储第二版。
  executionId: string; // 第70天：关联本状态所属的执行实例。
  currentSteps: string[]; // 第70天：保存当前正在执行或等待的步骤标识。
  completedSteps: string[]; // 第70天：保存已经完成且恢复时禁止重跑的步骤标识。
  failedSteps: string[]; // 第70天：保存最近失败且允许恢复重试的步骤标识。
  outputs: Record<string, unknown>; // 第70天：按步骤标识保存全部成功输出快照。
  checkpoints: WorkflowCheckpoint[]; // 第70天：保存按时间排序的检查点列表。
  version: number; // 第70天：保存乐观递增的状态版本号。
  updatedAt: number; // 第70天：保存状态最近持久化时间戳。
}; // 第70天：结束工作流状态第二版结构定义。
export type WorkflowLifecycleEvent = { // 第70天：定义 Event Sourcing 使用的工作流事件记录。
  id: string; // 第70天：保存全局唯一事件标识。
  executionId: string; // 第70天：关联具体执行实例。
  workflowId: string; // 第70天：关联稳定工作流定义标识。
  workflowVersion: number; // 第70天：关联冻结工作流定义版本。
  type: WorkflowLifecycleEventType; // 第70天：保存任务清单声明的生命周期事件类型。
  sequence: number; // 第70天：保存执行实例内严格递增的事件序号。
  stepId?: string; // 第70天：按需关联具体工作流步骤。
  payload: Record<string, unknown>; // 第70天：保存重建执行过程所需的安全业务载荷。
  timestamp: number; // 第70天：保存事件发生时间戳。
  traceId: string; // 第70天：关联统一 EventBus 链路追踪标识。
  runtimeContextId: string; // 第70天：关联统一运行时上下文请求标识。
}; // 第70天：结束工作流事件溯源记录结构定义。
export type WorkflowReplayResult = { // 第70天：定义无模型调用历史回放结果。
  executionId: string; // 第70天：保存被回放的执行实例标识。
  workflowId: string; // 第70天：保存被回放的工作流定义标识。
  workflowVersion: number; // 第70天：保存被回放的冻结工作流版本。
  reconstructedStatus: WorkflowExecutionStatusV2; // 第70天：保存根据事件时间线重建出的最终状态。
  recoveryCheckpointId?: string; // 第70天：保存最近成功检查点作为推荐恢复点。
  timeline: WorkflowLifecycleEvent[]; // 第70天：保存完整有序事件时间线。
  checkpoints: WorkflowCheckpoint[]; // 第70天：保存回放可见的全部检查点。
  outputs: Record<string, unknown>; // 第70天：保存回放直接复用的历史步骤输出。
  replayedAt: number; // 第70天：保存本次回放发生时间戳。
}; // 第70天：结束工作流历史回放结果结构定义。
export type WorkflowMetricsV2 = { // 第70天：定义任务要求的工作流指标第二版。
  totalExecutions: number; // 第70天：记录执行实例总数。
  successRate: number; // 第70天：记录已完成执行占全部执行的比例。
  failureRate: number; // 第70天：记录失败执行占全部执行的比例。
  averageDuration: number; // 第70天：记录终态执行平均持续毫秒数。
  retryCount: number; // 第70天：记录失败后重新执行总次数。
  resumeCount: number; // 第70天：记录中断、暂停和 HITL 恢复总次数。
  replayCount: number; // 第70天：记录历史执行回放总次数。
  checkpointCount: number; // 第70天：记录全部执行生成的检查点数量。
  activeExecutions: number; // 第70天：记录 created、running、paused 与 waiting 执行数量。
}; // 第70天：结束工作流指标第二版结构定义。
export type DurableWorkflowPlatformSnapshot = { // 第70天：定义 Workflow Explorer V2 与 API 共用的平台快照。
  definitions: WorkflowDefinitionV2[]; // 第70天：保存 Workflow Catalog 展示的全部版本定义。
  executions: WorkflowExecutionV2[]; // 第70天：保存 Execution Explorer 展示的执行实例。
  states: WorkflowStateV2[]; // 第70天：保存执行步骤、输出和恢复点完整状态。
  events: WorkflowLifecycleEvent[]; // 第70天：保存 Event Sourcing 形成的跨执行时间线。
  runtimeContexts: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2[]; // 第70天：保存已接入 workflowContext 的统一运行时上下文。
  registryItems: import("@/lib/registry/registry-types").RegistryItem[]; // 第70天：保存工作流定义、执行器、检查点与回放能力注册项。
  metrics: WorkflowMetricsV2; // 第70天：保存工作流平台第二版治理指标。
  lastReplay?: WorkflowReplayResult; // 第70天：保存 Replay Debug 最近一次回放结果。
  generatedAt: number; // 第70天：保存平台快照生成时间戳。
}; // 第70天：结束持久化工作流平台快照结构定义。
