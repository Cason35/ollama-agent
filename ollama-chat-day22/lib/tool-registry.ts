/**
 * 第22天：Tool Registry — 可插拔工具注册、Schema 校验与调试日志。
 */
import { extractWeatherCity, getLatestUserText } from "@/lib/chat-tools";
import type { ModelRuntime } from "@/lib/model-runtime";
import type { Memory, WorkflowStep } from "@/lib/workflow-types";

/** Schema 字段类型（简化 JSON-Schema 风格，供 Planner / Validator / UI 复用）。 */
export type ToolSchemaFieldType = "string" | "number" | "boolean" | "object" | "array";

/** 单字段描述；也允许简写为类型字符串，如 `{ city: "string" }`。 */
export type ToolSchemaField =
  | ToolSchemaFieldType
  | { type: ToolSchemaFieldType; required?: boolean; description?: string };

export type ToolSchema = Record<string, ToolSchemaField>;

/** Executor 调用工具时注入的运行时上下文（由 buildWorkflowToolInput 组装）。 */
export type WorkflowToolExecuteInput = {
  step: WorkflowStep;
  memory: Memory;
  rt: ModelRuntime;
  chainSnapshot: string;
  depTextRaw: string;
  hasExplicitDeps: boolean;
  linearChainPrefix?: string;
  dependencyTodoContext?: string;
};

/** 统一工具接口：Tool = Runtime Plugin。 */
export type Tool = {
  name: string;
  description: string;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  execute(input: WorkflowToolExecuteInput): Promise<unknown>;
};

/** 校验失败时抛出的错误（含工具名与字段）。 */
export class ToolValidationError extends Error {
  constructor(
    readonly toolName: string,
    message: string
  ) {
    super(message);
    this.name = "ToolValidationError";
  }
}

function fieldType(field: ToolSchemaField): ToolSchemaFieldType {
  return typeof field === "string" ? field : field.type;
}

function fieldRequired(field: ToolSchemaField): boolean {
  return typeof field === "object" && field.required === true;
}

/** 从 step.input 与 memory 抽取用于 schema 校验的扁平参数。 */
export function extractToolParams(
  tool: Tool,
  input: WorkflowToolExecuteInput
): Record<string, unknown> {
  const stepText = input.step.input?.trim() ?? "";
  if (tool.name === "weather") {
    const latestUser = getLatestUserText(input.memory.shortTerm);
    const city = extractWeatherCity(stepText || latestUser);
    return { city };
  }
  return { input: stepText };
}

/** 执行前校验：按 inputSchema 检查必填字段与非空字符串。 */
export function validateToolInput(tool: Tool, input: WorkflowToolExecuteInput): void {
  const schema = tool.inputSchema;
  if (!schema || Object.keys(schema).length === 0) return;

  const params = extractToolParams(tool, input);
  const missing: string[] = [];

  for (const [key, field] of Object.entries(schema)) {
    const required = fieldRequired(field);
    const type = fieldType(field);
    const value = params[key];

    if (value == null || value === "") {
      if (required || tool.name === "weather") {
        missing.push(key);
      }
      continue;
    }

    if (type === "string" && typeof value !== "string") {
      throw new ToolValidationError(tool.name, `字段 ${key} 应为 string`);
    }
    if (type === "number" && typeof value !== "number") {
      throw new ToolValidationError(tool.name, `字段 ${key} 应为 number`);
    }
  }

  if (missing.length > 0) {
    throw new ToolValidationError(
      tool.name,
      `缺少必填字段：${missing.join(", ")}（Planner 请为 action=${tool.name} 的 input 提供有效值）`
    );
  }
}

/** 将 WorkflowStep + 执行上下文组装为工具入参。 */
export function buildWorkflowToolInput(args: {
  step: WorkflowStep;
  memory: Memory;
  rt: ModelRuntime;
  chainSnapshot: string;
  depTextRaw: string;
  hasExplicitDeps: boolean;
  linearChainPrefix?: string;
  dependencyTodoContext?: string;
}): WorkflowToolExecuteInput {
  return { ...args };
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    console.log("[ToolRegistry] register", tool.name);
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return this.list().map((t) => t.name);
  }

  async execute(name: string, input: WorkflowToolExecuteInput): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    console.log("[ToolRegistry] execute", { tool: tool.name, stepId: input.step.id });
    validateToolInput(tool, input);
    return tool.execute(input);
  }
}

/** 供 Planner Prompt 动态生成「可用工具」列表。 */
export function formatToolsForPlanner(registry: ToolRegistry): string {
  return registry
    .list()
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
}

/** 供 API / Tool Explorer 返回的轻量描述。 */
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
};

export function toolToDescriptor(tool: Tool): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  };
}
