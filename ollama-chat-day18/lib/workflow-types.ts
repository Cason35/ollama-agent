/**
 * 第18天：工作流相关类型（从 route 抽出，供 pause-store 与 confirm API 共享，避免循环依赖）。
 * 每行带中文行尾注释。
 */

/** 工作流单步可执行动作。 */
export type WorkflowStepAction = "chat" | "summary" | "todo" | "weather" | "judge"; // 与 Executor 白名单一致

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
