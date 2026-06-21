import type { WorkflowStep } from "@/app/types/chat-ui"; // 引入工作流步骤类型

export function findDownstreamSteps(all: WorkflowStep[], stepId: string): WorkflowStep[] {
  return all.filter((step) => step.dependsOn?.includes(stepId) ?? false); // 查找依赖当前步骤的后继步骤
}

export function stepIdToName(all: WorkflowStep[], id: string): string {
  return all.find((step) => step.id === id)?.name ?? id; // 把步骤 id 映射成可读名称
}

export function workflowStepStatusGlyph(status: WorkflowStep["status"]): string {
  if (status === "success") return "✓"; // 成功
  if (status === "failed") return "✕"; // 失败
  if (status === "running") return "..."; // 运行中
  if (status === "queued") return "▷"; // 已排队
  if (status === "blocked") return "!"; // 阻塞
  if (status === "skipped") return "↷"; // 跳过
  if (status === "waiting_confirmation") return "Ⅱ"; // 等待确认
  return "○"; // 默认待执行
}

export function formatZhHhMmSs(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour12: false, // 使用 24 小时制
    hour: "2-digit", // 两位小时
    minute: "2-digit", // 两位分钟
    second: "2-digit", // 两位秒
  }); // 返回本地时间
}
