import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, "lib", `_extract_${name}.txt`), "utf8");

function exportFns(code, names) {
  let out = code;
  for (const n of names) {
    out = out.replace(new RegExp(`^async function ${n}\\(`, "m"), `export async function ${n}(`);
    out = out.replace(new RegExp(`^function ${n}\\(`, "m"), `export function ${n}(`);
  }
  return out;
}

fs.writeFileSync(
  path.join(root, "lib", "chat", "chat-memory.ts"),
  `/**
 * 记忆管线：短期窗口、长期条目、压缩与 buildMemory。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime";
import type {
  ChatMessage,
  IncomingMemoryPayload,
  Memory,
  MemoryImportance,
  MemoryItem,
} from "@/lib/chat/chat-types";

${exportFns(read("memory") + "\n" + read("memory2") + "\n" + read("memory3"), [
  "buildMemory",
  "formatMemoryBlock",
  "formatMemoryForPlanner",
  "memoryItemsCharLength",
])}
`
);

fs.writeFileSync(
  path.join(root, "lib", "chat", "chat-routing.ts"),
  `/**
 * 意图路由：解析模型 JSON、延续语义修正、路由 system 提示词。
 */
import type { Action, Memory, ParsedOutput } from "@/lib/chat/chat-types";
import { formatMemoryBlock } from "@/lib/chat/chat-memory";

export function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(\`[Agent] \${event}\`, payload);
}

${exportFns(read("routing"), [
  "normalizeAction",
  "parseModelOutput",
  "buildRoutingSystemPrompt",
  "resolveContinuationAction",
])}
`
);

// workflow-log.ts 为手写模块，不在此脚本中生成

fs.writeFileSync(
  path.join(root, "lib", "chat", "chat-tools.ts"),
  `/**
 * 单步工具：天气、总结、待办、闲聊兜底。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime";
import type { ChatMessage, Memory, TodoItem } from "@/lib/chat/chat-types";
import { formatMemoryBlock } from "@/lib/chat/chat-memory";

${exportFns(read("tools") + "\n" + read("tools2") + "\n" + read("weather"), [
  "extractWeatherCity",
  "getLatestUserText",
  "generateFallbackChat",
  "summarizeWithModel",
  "generateTodosWithModel",
  "realWeather",
])}
`
);

let plannerRaw = read("planner2");
plannerRaw = plannerRaw.replace(
  /^function normalizeWorkflowAction/m,
  "export function normalizeWorkflowAction"
);
plannerRaw = plannerRaw.replace(
  /^const WORKFLOW_ALLOWED_ACTIONS/,
  "export const WORKFLOW_ALLOWED_ACTIONS"
);
const plannerBody = exportFns(plannerRaw, [
  "planWorkflowSteps",
  "topologicalSortWorkflowSteps",
  "runWorkflowChat",
  "runWorkflowChatDirect",
]);
fs.writeFileSync(
  path.join(root, "lib", "workflow", "workflow-planner.ts"),
  `/**
 * Workflow Planner：拆步、解析与步骤内 chat 执行。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime";
import type { Memory } from "@/lib/workflow/workflow-types";
import { formatMemoryForPlanner } from "@/lib/chat/chat-memory";
import type {
  WorkflowStep,
  WorkflowStepAction,
  WorkflowStepCondition,
} from "@/lib/workflow/workflow-types";

${plannerBody}
`
);

const validateBody = exportFns(read("validate"), [
  "validateWorkflow",
  "repairWorkflow",
  "topologicalSort",
]);
fs.writeFileSync(
  path.join(root, "lib", "workflow", "workflow-validate.ts"),
  `/**
 * Workflow 静态校验与自动修复。
 */
import type { Workflow, WorkflowStep, WorkflowStepAction } from "@/lib/workflow/workflow-types";
import {
  topologicalSortWorkflowSteps,
  normalizeWorkflowAction,
  WORKFLOW_ALLOWED_ACTIONS,
} from "@/lib/workflow/workflow-planner";

${validateBody}
`
);

const execBody = exportFns(read("executor"), [
  "synthesizeWorkflowResult",
  "executeWorkflow",
  "applyWorkflowUserCancel",
]);
fs.writeFileSync(
  path.join(root, "lib", "workflow", "workflow-executor.ts"),
  `/**
 * Workflow 并行 DAG 执行器（含条件分支与 HITL）。
 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime";
import type { Memory } from "@/lib/workflow/workflow-types";
import type {
  ExecuteWorkflowResult,
  Workflow,
  WorkflowStep,
  WorkflowTimelineEvent,
} from "@/lib/workflow/workflow-types";
import { formatMemoryForPlanner } from "@/lib/chat/chat-memory";
import {
  getLatestUserText,
  extractWeatherCity,
  realWeather,
  summarizeWithModel,
  generateTodosWithModel,
} from "@/lib/chat/chat-tools";
import { runWorkflowChat, runWorkflowChatDirect } from "@/lib/workflow/workflow-planner";
import { topologicalSort } from "@/lib/workflow/workflow-validate";
import { logWorkflow } from "@/lib/workflow/workflow-log";

export const WORKFLOW_DEFAULT_STEP_RETRIES = 2;

${execBody}
`
);

console.log("assembled");

