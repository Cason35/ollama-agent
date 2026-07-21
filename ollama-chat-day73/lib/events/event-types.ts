export const EVENT_TYPES = [ // 第65天：集中声明统一事件系统允许发布的全部事件类型。
  "runtime.started", // 第65天：表示统一运行时开始执行。
  "runtime.completed", // 第65天：表示统一运行时完成执行。
  "agent.started", // 第65天：表示智能体开始执行任务。
  "agent.completed", // 第65天：表示智能体完成任务。
  "tool.called", // 第65天：表示工具开始被调用。
  "tool.completed", // 第65天：表示工具调用完成。
  "model.called", // 第65天：表示模型开始被调用。
  "model.completed", // 第65天：表示模型调用完成。
  "prompt.rendered", // 第65天：表示提示词渲染完成。
  "memory.read", // 第65天：表示记忆读取完成。
  "memory.write", // 第65天：表示记忆写入完成。
  "memory.consolidated", // 第68天：表示生产记忆去重与整合完成。
  "memory.conflict_detected", // 第68天：表示生产记忆检测到重复、矛盾或替代冲突。
  "memory.archived", // 第68天：表示生产记忆或工作空间记忆完成归档。
  "memory.deleted", // 第68天：表示生产记忆完成软删除。
  "knowledge.document_uploaded", // 第69天：表示生产知识文档原始文件已经上传。
  "knowledge.index_queued", // 第69天：表示知识索引任务已经进入 Redis Queue。
  "knowledge.index_started", // 第69天：表示 Indexer Worker 已经开始处理索引任务。
  "knowledge.index_completed", // 第69天：表示知识索引构建已经完成。
  "knowledge.index_failed", // 第69天：表示知识索引构建失败并保存错误信息。
  "knowledge.index_published", // 第69天：表示新活动索引版本已经原子发布。
  "knowledge.document_updated", // 第69天：表示生产知识文档已经上传新版本。
  "knowledge.document_deleting", // 第69天：表示生产知识文档进入两阶段删除第一阶段。
  "knowledge.document_deleted", // 第69天：表示生产知识文档全部关联资源已经清理。
  "workflow.created", // 第70天：表示持久化工作流执行实例已经创建。
  "workflow.started", // 第70天：表示持久化工作流执行器已经开始运行。
  "workflow.step_started", // 第70天：表示一个尚未完成的工作流步骤开始执行。
  "workflow.step_completed", // 第70天：表示工作流步骤完成并保存可靠检查点。
  "workflow.step_failed", // 第70天：表示工作流步骤失败并保存错误与失败检查点。
  "workflow.paused", // 第70天：表示工作流因服务中断模拟或 HITL 等待而暂停。
  "workflow.resumed", // 第70天：表示工作流从状态与检查点恢复执行。
  "workflow.completed", // 第70天：表示持久化工作流全部步骤完成。
  "workflow.cancelled", // 第70天：表示工作流执行实例已被用户取消。
  "retrieval.started", // 第69天：表示生产检索管线第二版开始执行。
  "retrieval.completed", // 第65天：表示检索流程完成。
  "retrieval.no_result", // 第69天：表示生产检索经过权限和版本过滤后没有结果。
  "retrieval.permission_denied", // 第69天：表示请求中的知识库被权限过滤器拒绝。
  "evaluation.started", // 第71天：表示 EvaluationRun 已创建并开始执行。
  "evaluation.case_completed", // 第71天：表示单个 Evaluation Case 已完成多维度评分。
  "evaluation.completed", // 第71天：表示评估运行完成并已关联 RuntimeContext 与 Trace。
  "quality_gate.failed", // 第71天：表示候选版本未通过 Quality Gate V2。
  "quality_gate.passed", // 第71天：表示候选版本通过 Quality Gate V2。
  "bad_case.created", // 第71天：表示低分或负向反馈已经沉淀为回归坏案例。
  "metric.recorded", // 第72天：表示统一指标聚合器已经记录一条结构化指标。
  "log.created", // 第72天：表示日志管理器已经创建一条结构化日志。
  "alert.triggered", // 第72天：表示告警引擎已经触发一条新的活动告警。
  "trace.completed", // 第72天：表示分布式链路追踪第二版已经完成并按采样策略保存链路。
  "user.created", // 第73天：表示治理平台已经创建统一用户身份。
  "tenant.created", // 第73天：表示治理平台已经创建组织或租户。
  "permission.denied", // 第73天：表示生产网关拒绝了权限不足的请求。
  "quota.exceeded", // 第73天：表示租户请求超过令牌、成本、工作流或知识容量配额。
  "audit.created", // 第73天：表示一条不可变更的治理审计记录已经创建。
  "error.occurred", // 第65天：表示运行链路发生错误。
] as const; // 第65天：把事件类型数组收窄为只读字面量元组。

export type EventType = (typeof EVENT_TYPES)[number]; // 第65天：从事件类型元组推导统一事件联合类型。
export type EventSource = "runtime" | "agent" | "tool" | "model" | "prompt" | "memory" | "knowledge" | "retrieval" | "workflow" | "evaluation" | "observability" | "governance" | "system"; // 第73天：扩展事件来源模块以支持身份、权限、配额和审计治理平台。
export type EventDeliveryStatus = "published" | "processed" | "failed"; // 第65天：定义事件在内存总线中的分发状态。

export type RuntimeEvent = { // 第65天：定义所有运行时模块共享的统一事件结构。
  id: string; // 第65天：保存全局唯一的事件标识。
  type: EventType; // 第65天：保存本次发生的事件类型。
  timestamp: number; // 第65天：保存事件发生时的毫秒时间戳。
  traceId: string; // 第65天：关联 Day64 统一上下文中的链路追踪标识。
  runtimeContextId: string; // 第65天：关联 Day64 统一上下文，本项目使用 Request ID 作为上下文标识。
  payload: unknown; // 第65天：保存经过脱敏的事件业务载荷。
  metadata?: Record<string, unknown>; // 第65天：保存来源、状态和版本等安全扩展信息。
}; // 第65天：结束统一运行时事件类型定义。

export type EventHandler = (event: RuntimeEvent) => Promise<void> | void; // 第65天：定义同步或异步事件处理函数签名。
export type Unsubscribe = () => void; // 第65天：定义订阅函数返回的取消订阅函数签名。

export interface EventBus { // 第65天：定义与具体消息中间件无关的统一事件总线协议。
  publish(event: RuntimeEvent): Promise<void> | void; // 第65天：约束事件发布能力。
  subscribe(type: EventType, handler: EventHandler): Unsubscribe; // 第65天：约束按事件类型订阅的能力。
  unsubscribe(type: EventType, handler: EventHandler): void; // 第65天：约束显式取消指定订阅的能力。
} // 第65天：结束统一事件总线接口定义。

export type RuntimeEventRecord = RuntimeEvent & { // 第65天：扩展事件结构以保存 Event Explorer 所需的投递结果。
  deliveryStatus: EventDeliveryStatus; // 第65天：保存事件当前投递状态。
  handlerCount: number; // 第65天：保存本次事件匹配到的订阅者数量。
  processedAt?: number; // 第65天：保存事件完成全部订阅处理的时间。
  errors: string[]; // 第65天：保存订阅处理失败时的安全错误摘要。
}; // 第65天：结束事件历史记录类型定义。

export type TraceTimelineItem = { // 第65天：定义 Trace Subscriber 生成的链路时间线条目。
  eventId: string; // 第65天：关联原始事件标识。
  type: EventType; // 第65天：保存时间线事件类型。
  source: string; // 第65天：保存事件来源模块。
  timestamp: number; // 第65天：保存时间线发生时间。
  traceId: string; // 第65天：保存关联的链路追踪标识。
  runtimeContextId: string; // 第65天：保存关联的统一上下文标识。
  status: string; // 第65天：保存业务事件状态。
}; // 第65天：结束链路时间线条目类型定义。

export type EventUsageSnapshot = { // 第65天：定义 Usage Subscriber 聚合的模型用量快照。
  modelEvents: number; // 第65天：保存已处理的模型完成事件数量。
  promptTokens: number; // 第65天：保存累计输入令牌数量。
  completionTokens: number; // 第65天：保存累计输出令牌数量。
  totalTokens: number; // 第65天：保存累计总令牌数量。
  cost: number; // 第65天：保存累计估算成本。
  latencyMs: number; // 第65天：保存累计模型延迟。
  provider?: string; // 第65天：保存最近一次模型提供方。
  model?: string; // 第65天：保存最近一次模型名称。
  traceId?: string; // 第65天：保存最近一次模型事件的链路标识。
}; // 第65天：结束事件用量快照类型定义。

export type EvaluationTask = { // 第65天：定义由 Agent 完成事件自动创建的评估任务。
  id: string; // 第65天：保存评估任务唯一标识。
  runtimeContextId: string; // 第65天：关联统一运行时上下文标识。
  traceId: string; // 第65天：关联完整链路追踪标识。
  promptVersion: string; // 第65天：保存被评估输出使用的提示词版本。
  model: string; // 第65天：保存被评估输出使用的模型。
  usage: EventUsageSnapshot; // 第65天：保存评估触发时已经由事件聚合的用量快照。
  agentOutput: string; // 第65天：保存经过摘要后的智能体输出。
  score: number; // 第65天：保存教学演示使用的评估分数。
  status: "passed" | "failed"; // 第65天：保存评估是否通过。
  createdAt: number; // 第65天：保存评估任务创建时间。
}; // 第65天：结束评估任务类型定义。

export type UnifiedEventSnapshot = { // 第65天：定义 Event Explorer 和测试脚本共享的统一事件快照。
  context: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2; // 第65天：保存本次事件链路关联的 Day64 统一上下文。
  events: RuntimeEventRecord[]; // 第65天：保存按发布时间排序的事件历史。
  traceTimeline: TraceTimelineItem[]; // 第65天：保存 Trace Subscriber 生成的时间线。
  usage: EventUsageSnapshot; // 第65天：保存 Usage Subscriber 自动聚合的用量。
  evaluations: EvaluationTask[]; // 第65天：保存 Evaluation Subscriber 自动创建的评估任务。
  consistent: boolean; // 第65天：保存所有事件是否共享同一上下文与追踪标识。
  generatedAt: number; // 第65天：保存快照生成时间。
}; // 第65天：结束统一事件系统快照类型定义。
