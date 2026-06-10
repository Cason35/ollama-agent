import type { AssistantBubble, ChatApiResult } from "@/app/types/chat-ui"; // 引入聊天 UI 类型

export function apiToAssistant(data: ChatApiResult): AssistantBubble {
  if (data.type === "chat") return { role: "assistant", variant: "chat", content: data.content }; // 普通聊天
  if (data.type === "weather") return { role: "assistant", variant: "weather", keyword: data.keyword, result: data.result }; // 天气卡片
  if (data.type === "summary") return { role: "assistant", variant: "summary", text: data.text }; // 总结卡片
  if (data.type === "workflow") {
    return {
      role: "assistant", // 助手角色
      variant: "workflow", // 工作流卡片
      workflow: data.workflow, // 工作流对象
      finalSummary: data.finalSummary, // 最终摘要
      paused: data.paused, // 暂停标记
      waitingStepId: data.waitingStepId, // 等待确认步骤
    }; // 返回工作流气泡
  }
  return { role: "assistant", variant: "todo", items: data.items }; // 待办卡片
}
