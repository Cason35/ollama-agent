/**
 * Workflow 内 chat 步骤执行（供 Tool Registry 与 Planner 复用，避免循环依赖）。
 * 每行带中文行尾注释。
 */
import { formatMemoryForPlanner } from "@/lib/chat-memory"; // 长期记忆格式化
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime"; // 模型调用封装
import type { Memory } from "@/lib/workflow-types"; // 记忆类型

export async function runWorkflowChat(
  stepInput: string, // 当前步骤任务文本
  chainPrefix: string | undefined, // 前置步骤输出前缀（线性链）
  memory: Memory, // 会话记忆
  rt: ModelRuntime // 模型运行时
): Promise<string> {
  const userContent = [chainPrefix ? `前置步骤输出：\n${chainPrefix}` : "", `当前任务：\n${stepInput}`]
    .filter(Boolean) // 去掉空段
    .join("\n\n"); // 拼接用户消息
  const memText = formatMemoryForPlanner(memory); // 长期记忆文本
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system", // 系统角色
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`,
    },
    { role: "user", content: userContent }, // 用户消息
  ]);
  if (!ok) return "该步骤失败：模型暂不可用。"; // 模型失败降级
  return text || "（无输出）"; // 空输出占位
}

export async function runWorkflowChatDirect(
  fullUserBody: string, // 已拼好的完整用户正文（含依赖块）
  memory: Memory, // 记忆
  rt: ModelRuntime // 模型运行时
): Promise<string> {
  const memText = formatMemoryForPlanner(memory); // 长期记忆
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system",
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`,
    },
    { role: "user", content: fullUserBody }, // 直接传入完整 body
  ]);
  if (!ok) return "该步骤失败：模型暂不可用。"; // 降级
  return text || "（无输出）"; // 返回文本
}
