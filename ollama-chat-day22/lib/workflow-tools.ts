/**
 * 第22天：注册 Workflow 运行时工具（weather / summary / todo / judge / chat）。
 */
import { formatMemoryForPlanner } from "@/lib/chat-memory";
import {
  extractWeatherCity,
  generateTodosWithModel,
  getLatestUserText,
  realWeather,
  summarizeWithModel,
} from "@/lib/chat-tools";
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime";
import type { Memory, WorkflowStepAction } from "@/lib/workflow-types";
import {
  ToolRegistry,
  type Tool,
  type WorkflowToolExecuteInput,
} from "@/lib/tool-registry";
import { runWorkflowChat, runWorkflowChatDirect } from "@/lib/workflow-chat";

async function runWorkflowJudge(args: {
  stepInput: string;
  chainSnapshot: string | undefined;
  memory: Memory;
  rt: ModelRuntime;
  depTextRaw: string;
  hasExplicitDeps: boolean;
}): Promise<{ result: string; reason: string }> {
  const memText = formatMemoryForPlanner(args.memory);
  const inputBlock =
    args.hasExplicitDeps && args.depTextRaw.trim()
      ? `【依赖步骤结果】\n${args.depTextRaw}\n\n【待判断输入】\n${args.stepInput}`
      : [args.chainSnapshot ? `【前置步骤输出】\n${args.chainSnapshot}` : "", `【待判断输入】\n${args.stepInput}`]
          .filter(Boolean)
          .join("\n\n");
  const judgePrompt = `
你是一个任务判断器。

请根据输入判断状态，只返回 JSON：

{
  "result": "complete" | "incomplete",
  "reason": "简短原因"
}

判断标准：
1. 是否有明确完成内容
2. 是否有遇到的问题
3. 是否有当前系统能力
4. 是否有下一步方向

输入：
${inputBlock}

长期记忆（仅供参考）：
${memText}
`.trim();
  const { ok, text } = await invokeChatModel(args.rt, [{ role: "user", content: judgePrompt }]);
  if (!ok) return { result: "incomplete", reason: "模型暂不可用，判定失败" };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || text) as { result?: unknown; reason?: unknown };
    const result = typeof parsed.result === "string" ? parsed.result.trim() : "incomplete";
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    return { result: result || "incomplete", reason: reason || "" };
  } catch {
    return { result: "incomplete", reason: "输出不是合法 JSON，判定降级" };
  }
}

const weatherTool: Tool = {
  name: "weather",
  description: "查询天气（当前支持北京、上海）",
  inputSchema: { city: { type: "string", required: true, description: "城市名" } },
  outputSchema: { text: "string" },
  async execute(input) {
    const latestUser = getLatestUserText(input.memory.shortTerm);
    const stepText =
      input.step.input && input.step.input !== "[object Object]" ? input.step.input : "";
    const keyword = extractWeatherCity(stepText || latestUser);
    return realWeather(keyword);
  },
};

const summaryTool: Tool = {
  name: "summary",
  description: "总结对话或材料要点",
  inputSchema: { input: { type: "string", required: false } },
  outputSchema: { text: "string" },
  async execute(input) {
    return summarizeWithModel(
      input.memory.shortTerm,
      input.step.input,
      input.memory,
      input.rt,
      input.hasExplicitDeps ? input.depTextRaw || undefined : input.linearChainPrefix
    );
  },
};

const todoTool: Tool = {
  name: "todo",
  description: "生成个性化待办列表",
  inputSchema: { input: { type: "string", required: false } },
  outputSchema: { items: "array" },
  async execute(input) {
    return generateTodosWithModel({
      userInput: input.step.input,
      memory: input.memory,
      rt: input.rt,
      chainPrefix: input.linearChainPrefix,
      dependencyContext:
        input.dependencyTodoContext && input.dependencyTodoContext.trim().length > 0
          ? input.dependencyTodoContext
          : undefined,
    });
  },
};

const judgeTool: Tool = {
  name: "judge",
  description: "结构化判断（输出 result/reason JSON，用于条件分支）",
  inputSchema: { input: { type: "string", required: false } },
  outputSchema: { result: "string", reason: "string" },
  async execute(input) {
    return runWorkflowJudge({
      stepInput: input.step.input,
      chainSnapshot: input.chainSnapshot,
      memory: input.memory,
      rt: input.rt,
      depTextRaw: input.depTextRaw,
      hasExplicitDeps: input.hasExplicitDeps,
    });
  },
};

const chatTool: Tool = {
  name: "chat",
  description: "普通中文对话回答",
  inputSchema: { input: { type: "string", required: false } },
  outputSchema: { text: "string" },
  async execute(input) {
    if (input.hasExplicitDeps && input.depTextRaw.trim()) {
      return runWorkflowChatDirect(
        `【依赖步骤结果】\n${input.depTextRaw}\n\n【当前任务】\n${input.step.input}`,
        input.memory,
        input.rt
      );
    }
    return runWorkflowChat(
      input.step.input,
      input.chainSnapshot || undefined,
      input.memory,
      input.rt
    );
  },
};

function createWorkflowToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(weatherTool);
  registry.register(summaryTool);
  registry.register(todoTool);
  registry.register(judgeTool);
  registry.register(chatTool);
  return registry;
}

/** 全局 Workflow 工具注册表（单例）。 */
export const workflowToolRegistry = createWorkflowToolRegistry();

/** 与 validateWorkflow 对齐的 action 白名单（由 Registry 动态生成）。 */
export const WORKFLOW_ALLOWED_ACTIONS: ReadonlySet<WorkflowStepAction> = new Set(
  workflowToolRegistry.listNames() as WorkflowStepAction[]
);
