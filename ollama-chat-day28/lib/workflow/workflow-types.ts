/**
 * 第19–20天：工作流相关类型（含 WorkflowState，供 WorkflowStore 与 confirm 续跑共享）。
 * 每行带中文行尾注释。
 */

/** 工作流单步可执行动作（第23天扩展组合与生态工具）。 */
export type WorkflowStepAction =
  | "chat" // 对话
  | "summary" // 总结
  | "todo" // 待办
  | "weather" // 天气
  | "judge" // 结构化判断
  | "research" // 第23天：组合 summary + todo
  | "note" // 第23天：笔记
  | "searchHistory" // 第23天：历史搜索
  | "generatePlan" // 第23天：学习计划
  | "critic" // 第23天：自评
  | "queryRewrite" // 第27天：查询改写
  | "retrieval" // 第24天：知识库检索
  | "ragAnswer"; // 第24天：RAG 问答

/** 条件运算符。 */
export type WorkflowConditionOperator = "equals" | "includes" | "truthy"; // 第17天条件分支

/** 单步可选条件。 */
export type WorkflowStepCondition = {
  fromStepId: string; // 判定来源步骤 id
  operator: WorkflowConditionOperator; // 算子
  value: string; // 期望值
}; // WorkflowStepCondition 结束

/** 步骤生命周期（第18天含 waiting_confirmation）。 */
export type WorkflowStepStatus =
  | "pending" // 待调度
  | "queued" // 已入选并行批次
  | "running" // 执行中
  | "success" // 成功
  | "failed" // 失败
  | "blocked" // 依赖失败短路
  | "skipped" // 条件未命中或用户取消（策略 B 时）
  | "waiting_confirmation"; // 第18天：等待用户确认，非 failed/skipped

/** 工作流单步。 */
export type WorkflowStep = {
  id: string; // 唯一 id
  name: string; // 展示名
  action: WorkflowStepAction; // 工具类型
  input: string; // 入参
  dependsOn?: string[]; // 依赖 id 列表
  condition?: WorkflowStepCondition; // 第17天条件
  requiresConfirmation?: boolean; // 第18天：执行前需用户确认
  confirmationMessage?: string; // 第18天：展示给用户的确认文案
  confirmed?: boolean; // 第18天：用户已点击确认后为 true
  status: WorkflowStepStatus; // 状态机
  output?: unknown; // 成功输出
  error?: string; // 失败信息
  durationMs?: number; // 耗时毫秒
  injectedContextPreview?: string; // 注入上下文预览
  retry?: number; // 步骤级重试
  skipReason?: string; // skipped 原因
}; // WorkflowStep 结束

/** Timeline 单条事件。 */
export type WorkflowTimelineEvent = {
  ts: number; // Unix 毫秒
  stepId?: string; // 关联步骤
  message: string; // 中文描述
}; // WorkflowTimelineEvent 结束

/** 并行调度批次摘要。 */
export type WorkflowExecutionBatch = {
  batchIndex: number; // 批次号
  stepIds: string[]; // 本批 step id
  ts: number; // 开始时间
}; // WorkflowExecutionBatch 结束

/** 工作流容器（第18天 status 含 cancelled）。 */
export type Workflow = {
  id: string; // 实例 id
  goal: string; // 用户目标
  steps: WorkflowStep[]; // 步骤列表
  status: "pending" | "running" | "success" | "failed" | "cancelled"; // 整单状态；cancelled 为用户取消关键步
  executionTimeline?: WorkflowTimelineEvent[]; // 可观测时间线
  executionBatches?: WorkflowExecutionBatch[]; // 并行批次
}; // Workflow 结束

/** 与前端 Memory 对齐（confirm 续跑需原样带回）。 */
export type MemoryItem = {
  content: string; // 记忆正文
  importance: "high" | "low"; // 重要性
}; // MemoryItem 结束

export type Memory = {
  shortTerm: { role: "user" | "assistant"; content: string }[]; // 短期窗口
  items: MemoryItem[]; // 长期条目
}; // Memory 结束

/** executeWorkflow 返回值（第18天支持暂停）。 */
export type ExecuteWorkflowResult = {
  workflow: Workflow; // 就地更新后的工作流
  paused?: boolean; // true 表示因 HITL 暂停
  waitingStepId?: string; // 等待确认的步骤 id
}; // ExecuteWorkflowResult 结束

/** 第19天：持久化状态机顶层 status（含 paused，与 HITL 对齐）。 */
export type WorkflowPersistedStatus =
  | "pending" // 已创建未跑
  | "running" // 执行中
  | "paused" // HITL 暂停（整单语义）
  | "success" // 全部成功
  | "failed" // 失败终止
  | "cancelled"; // 用户取消

/** 第19天：localStorage 完整快照（version 用于迁移）。 */
export type WorkflowState = {
  version: 1; // 结构版本号，读取时校验
  workflowId: string; // 与 Workflow.id 一致
  status: WorkflowPersistedStatus; // 整单持久化状态
  goal: string; // 用户目标
  steps: WorkflowStep[]; // 各步状态与输出
  memorySnapshot?: MemoryItem[]; // 长期记忆条目快照
  stepOutputs: Record<string, unknown>; // 已成功步骤 id→output
  timeline: WorkflowTimelineEvent[]; // 执行时间线
  createdAt: number; // 首次创建 Unix 毫秒
  updatedAt: number; // 最近更新 Unix 毫秒
  finalSummary?: string; // 卡片底部展示文案
  paused?: boolean; // 是否仍等待 HITL
  waitingStepId?: string; // 待确认步骤 id
  memory?: Memory; // 完整 Memory（confirm 续跑闭环）
  executionBatches?: WorkflowExecutionBatch[]; // 并行批次（可选）
}; // WorkflowState 结束

/** 历史列表摘要（侧栏展示，不含完整 steps）。 */
export type WorkflowStateListItem = {
  workflowId: string; // 实例 id
  goal: string; // 目标简述
  status: WorkflowPersistedStatus; // 状态徽章
  updatedAt: number; // 最近更新时间
  waitingStepName?: string; // 若有 HITL 暂停则展示步骤名
}; // WorkflowStateListItem 结束
