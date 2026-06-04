import type { WorkflowStepAction } from "@/lib/workflow/workflow-types"; // 引入工作流步骤动作类型

export type ChatProvider = "local" | "mimo"; // 本地 Ollama 或云端 MiMo

export type ChatMessage = {
  role: "user" | "assistant"; // 消息角色
  content: string; // 消息正文
}; // ChatMessage 结束

export type MemoryImportance = "high" | "low"; // 长期记忆重要程度

export type MemoryItem = {
  content: string; // 记忆正文
  importance: MemoryImportance; // 重要程度
}; // MemoryItem 结束

export type Memory = {
  shortTerm: ChatMessage[]; // 最近对话窗口
  items: MemoryItem[]; // 长期记忆条目
}; // Memory 结束

export type TodoItem = {
  task: string; // 待办内容
  done: boolean; // 是否完成
}; // TodoItem 结束

export type WorkflowStep = {
  id: string; // 步骤唯一 id
  name: string; // 步骤名称
  action: WorkflowStepAction; // 工具动作
  input: string; // 步骤输入
  dependsOn?: string[]; // 依赖步骤
  condition?: {
    fromStepId: string; // 条件来源步骤
    operator: "equals" | "includes" | "truthy"; // 条件算子
    value: string; // 条件目标值
  }; // condition 结束
  retry?: number; // 重试次数
  status:
    | "pending"
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "blocked"
    | "skipped"
    | "waiting_confirmation"; // 步骤状态
  output?: unknown; // 步骤输出
  error?: string; // 错误信息
  durationMs?: number; // 耗时
  injectedContextPreview?: string; // 注入上下文预览
  skipReason?: string; // 跳过原因
  requiresConfirmation?: boolean; // 是否需要人工确认
  confirmationMessage?: string; // 人工确认文案
  confirmed?: boolean; // 是否已确认
}; // WorkflowStep 结束

export type WorkflowTimelineEvent = {
  ts: number; // 时间戳
  stepId?: string; // 关联步骤 id
  message: string; // 事件文案
}; // WorkflowTimelineEvent 结束

export type WorkflowExecutionBatch = {
  batchIndex: number; // 批次编号
  stepIds: string[]; // 批次内步骤 id
  ts: number; // 批次开始时间
}; // WorkflowExecutionBatch 结束

export type Workflow = {
  id: string; // 工作流 id
  goal: string; // 工作流目标
  steps: WorkflowStep[]; // 步骤列表
  status: "pending" | "running" | "success" | "failed" | "cancelled"; // 整体状态
  executionTimeline?: WorkflowTimelineEvent[]; // 执行时间线
  executionBatches?: WorkflowExecutionBatch[]; // 执行批次
}; // Workflow 结束

export type ChatApiResult =
  | { type: "chat"; content: string; memory: Memory }
  | { type: "weather"; keyword: string; result: string; memory: Memory }
  | { type: "summary"; text: string; memory: Memory }
  | { type: "todo"; items: TodoItem[]; memory: Memory }
  | {
      type: "workflow"; // 工作流响应类型
      workflow: Workflow; // 工作流数据
      finalSummary: string; // 最终摘要
      memory: Memory; // 更新后的记忆
      paused?: boolean; // 是否暂停
      waitingStepId?: string; // 等待确认步骤
    }; // ChatApiResult 结束

export type UserBubble = { role: "user"; content: string }; // 用户气泡

export type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string }
  | { role: "assistant"; variant: "weather"; keyword: string; result: string }
  | { role: "assistant"; variant: "summary"; text: string }
  | { role: "assistant"; variant: "todo"; items: TodoItem[] }
  | {
      role: "assistant"; // 助手角色
      variant: "workflow"; // 工作流气泡
      workflow: Workflow; // 工作流数据
      finalSummary: string; // 最终摘要
      paused?: boolean; // 是否暂停
      waitingStepId?: string; // 等待确认步骤
    }; // AssistantBubble 结束

export type Bubble = UserBubble | AssistantBubble; // 对话气泡联合类型
