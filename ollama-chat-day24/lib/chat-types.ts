/**
 * 聊天 API 专用类型（Memory 与 workflow-types 共享）。
 */

import type { Memory } from "@/lib/workflow-types";

export type { Memory };

/** 与前端约定的单条对话消息（仅 user / assistant 文本）。 */
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MemoryImportance = "high" | "low";

export type MemoryItem = {
  content: string;
  importance: MemoryImportance;
};

export type Action = "chat" | "weather" | "summary" | "todo";

export type ParsedOutput = {
  action: Action;
  content: string;
  keyword: string;
};

export type TodoItem = {
  task: string;
  done: boolean;
};

export type ChatResponseBody =
  | { type: "chat"; content: string; memory: Memory }
  | { type: "weather"; keyword: string; result: string; memory: Memory }
  | { type: "summary"; text: string; memory: Memory }
  | { type: "todo"; items: TodoItem[]; memory: Memory }
  | {
      type: "workflow";
      workflow: import("@/lib/workflow-types").Workflow;
      finalSummary: string;
      memory: Memory;
      paused?: boolean;
      waitingStepId?: string;
    };

export type ChatResponsePayload =
  | { type: "chat"; content: string }
  | { type: "weather"; keyword: string; result: string }
  | { type: "summary"; text: string }
  | { type: "todo"; items: TodoItem[] }
  | {
      type: "workflow";
      workflow: import("@/lib/workflow-types").Workflow;
      finalSummary: string;
      paused?: boolean;
      waitingStepId?: string;
    };

export type IncomingMemoryPayload = Partial<Memory> & { longTerm?: string };
