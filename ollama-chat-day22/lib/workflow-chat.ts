/**
 * Workflow 内 chat 步骤执行（供 Tool Registry 与 Planner 复用，避免循环依赖）。
 */
import { formatMemoryForPlanner } from "@/lib/chat-memory";
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type { Memory } from "@/lib/workflow-types";

export async function runWorkflowChat(
  stepInput: string,
  chainPrefix: string | undefined,
  memory: Memory,
  rt: ModelRuntime
): Promise<string> {
  const userContent = [chainPrefix ? `前置步骤输出：\n${chainPrefix}` : "", `当前任务：\n${stepInput}`]
    .filter(Boolean)
    .join("\n\n");
  const memText = formatMemoryForPlanner(memory);
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system",
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`,
    },
    { role: "user", content: userContent },
  ]);
  if (!ok) return "该步骤失败：模型暂不可用。";
  return text || "（无输出）";
}

export async function runWorkflowChatDirect(
  fullUserBody: string,
  memory: Memory,
  rt: ModelRuntime
): Promise<string> {
  const memText = formatMemoryForPlanner(memory);
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system",
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`,
    },
    { role: "user", content: fullUserBody },
  ]);
  if (!ok) return "该步骤失败：模型暂不可用。";
  return text || "（无输出）";
}
