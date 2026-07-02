/**
 * 第22–23天：Tool Registry — 可插拔工具、Schema 校验、组合执行、沙箱与指标。
 */
import { extractWeatherCity, getLatestUserText } from "@/lib/chat/chat-tools"; // 天气城市抽取与最近用户消息
import type { TraceSpanType } from "@/lib/agents/agent-types"; // 第44天：引入 TraceSpanType（追踪跨度类型）用于工具追踪分类
import type { TraceManager } from "@/lib/agents/trace-manager"; // 第44天：引入 TraceManager（追踪管理器）类型用于可选链路追踪
import type { ModelRuntime } from "@/lib/model/model-runtime"; // 模型运行时类型
import type { Memory, WorkflowStep } from "@/lib/workflow/workflow-types"; // 工作流步骤与记忆类型

/** Schema 字段类型（简化 JSON-Schema 风格，供 Planner / Validator / UI 复用）。 */
export type ToolSchemaFieldType = "string" | "number" | "boolean" | "object" | "array"; // 支持的字段类型枚举

/** 单字段描述；也允许简写为类型字符串，如 `{ city: "string" }`。 */
export type ToolSchemaField =
  | ToolSchemaFieldType // 简写：仅类型名
  | { type: ToolSchemaFieldType; required?: boolean; description?: string }; // 完整字段描述对象

export type ToolSchema = Record<string, ToolSchemaField>; // 工具入参/出参 Schema 字典

/** Executor 调用工具时注入的运行时上下文（由 buildWorkflowToolInput 组装）。 */
export type WorkflowToolExecuteInput = {
  step: WorkflowStep; // 当前工作流步骤
  memory: Memory; // 会话记忆（短/长期）
  rt: ModelRuntime; // 模型调用入口
  chainSnapshot: string; // 线性链前缀快照
  depTextRaw: string; // 显式依赖步骤拼接文本
  hasExplicitDeps: boolean; // 是否使用 dependsOn 显式依赖
  linearChainPrefix?: string; // 线性前缀（summary/todo 等）
  dependencyTodoContext?: string; // todo 专用依赖上下文
};

/** 第23天：运行时日志接口（可扩展接入 workflow-log）。 */
export type RuntimeLogger = {
  info: (msg: string, meta?: Record<string, unknown>) => void; // 信息级日志
  warn: (msg: string, meta?: Record<string, unknown>) => void; // 警告级日志
};

/** 第23天：工具执行上下文 — 使 Tool 可调用 Registry 内其它 Tool（组合能力）。 */
export type ToolExecutionContext = {
  workflowId: string; // 当前工作流实例 id
  toolRegistry: ToolRegistry; // 注册表引用，供 composite 递归 execute
  stepOutputs?: Record<string, unknown>; // 已成功步骤 id → output
  depth: number; // 当前组合调用深度（沙箱递归守卫）
  logger?: RuntimeLogger; // 可选结构化日志
  traceManager?: TraceManager; // 第44天：可选 TraceManager（追踪管理器），用于真实 Tool Runtime 写入 Span
  traceId?: string; // 第44天：可选 Trace ID（追踪记录 ID），用于把工具调用挂到同一条链路下
  parentSpanId?: string; // 第44天：可选父 Span ID（父跨度 ID），用于把工具调用挂到 Agent 或 Workflow 节点下
};

/** 第23天：组合工具可声明的子工具名列表（文档/Explorer 展示用）。 */
export type CompositeTool = Tool & {
  subTools?: string[]; // 组合工具内部调用的子工具 name
};

/** 统一工具接口：Tool = Runtime Plugin（第23天增加 capabilities / dependencies）。 */
export type Tool = {
  name: string; // 工具唯一名，与 WorkflowStep.action 对齐
  description: string; // 人类可读说明，供 Planner 与 UI
  capabilities?: string[]; // 能力标签，供 Capability Routing
  dependencies?: string[]; // 依赖的其它工具名（Tool Graph）
  inputSchema?: ToolSchema; // 入参 Schema
  outputSchema?: ToolSchema; // 出参 Schema
  execute(input: WorkflowToolExecuteInput, context: ToolExecutionContext): Promise<unknown>; // 执行入口
};

/** 校验失败时抛出的错误（含工具名与字段）。 */
export class ToolValidationError extends Error {
  constructor(
    readonly toolName: string, // 触发校验的工具名
    message: string // 中文错误说明
  ) {
    super(message); // 调用 Error 构造
    this.name = "ToolValidationError"; // 固定错误类名
  }
}

/** 第23天：工具递归过深时抛出。 */
export class ToolRecursionError extends Error {
  constructor(readonly depth: number) {
    super(`Tool recursion limit exceeded (depth > ${MAX_TOOL_RECURSION_DEPTH})`); // 英文消息便于 grep
    this.name = "ToolRecursionError"; // 错误类名
  }
}

/** 第23天：工具执行超时时抛出。 */
export class ToolTimeoutError extends Error {
  constructor(readonly toolName: string, readonly timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`); // 超时说明
    this.name = "ToolTimeoutError"; // 错误类名
  }
}

/** 沙箱：默认单次工具执行超时（毫秒）。 */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000; // 第37天：本地大模型执行 summary/research 可能超过 10 秒，放宽到 30 秒避免误判失败。

/** 沙箱：组合调用最大递归深度（含 Registry 外层 execute）。 */
export const MAX_TOOL_RECURSION_DEPTH = 3; // 超过则 ToolRecursionError

/** 单工具调用统计快照（供 API / Tool Explorer）。 */
export type ToolMetricsSnapshot = {
  totalCalls: number; // 总调用次数
  successCalls: number; // 成功次数
  failedCalls: number; // 失败次数
  avgDurationMs: number; // 平均耗时（毫秒，取整）
};

/** 内部可变指标累加器。 */
type ToolMetricsAccumulator = {
  totalCalls: number; // 总次数
  successCalls: number; // 成功次数
  failedCalls: number; // 失败次数
  totalDurationMs: number; // 累计耗时，用于算均值
};

function fieldType(field: ToolSchemaField): ToolSchemaFieldType {
  return typeof field === "string" ? field : field.type; // 简写或对象取 type
}

function fieldRequired(field: ToolSchemaField): boolean {
  return typeof field === "object" && field.required === true; // 仅对象形式可标 required
}

/** 从 step.input 与 memory 抽取用于 schema 校验的扁平参数。 */
export function extractToolParams(
  tool: Tool, // 目标工具
  input: WorkflowToolExecuteInput // 执行入参
): Record<string, unknown> {
  const stepText = input.step.input?.trim() ?? ""; // 步骤 input 文本
  if (tool.name === "weather") {
    const latestUser = getLatestUserText(input.memory.shortTerm); // 最近用户消息
    const city = extractWeatherCity(stepText || latestUser); // 解析城市
    return { city }; // weather 专用扁平参数
  }
  return { input: stepText }; // 默认以 input 键承载步骤文本
}

/** 执行前校验：按 inputSchema 检查必填字段与非空字符串。 */
export function validateToolInput(tool: Tool, input: WorkflowToolExecuteInput): void {
  const schema = tool.inputSchema; // 取入参 Schema
  if (!schema || Object.keys(schema).length === 0) return; // 无 Schema 则跳过

  const params = extractToolParams(tool, input); // 扁平化参数
  const missing: string[] = []; // 缺失必填字段名

  for (const [key, field] of Object.entries(schema)) {
    const required = fieldRequired(field); // 是否必填
    const type = fieldType(field); // 字段类型
    const value = params[key]; // 实际值

    if (value == null || value === "") {
      if (required || tool.name === "weather") {
        missing.push(key); // weather 的 city 始终视为必填
      }
      continue; // 空值且非必填则继续下一字段
    }

    if (type === "string" && typeof value !== "string") {
      throw new ToolValidationError(tool.name, `字段 ${key} 应为 string`); // 类型不匹配
    }
    if (type === "number" && typeof value !== "number") {
      throw new ToolValidationError(tool.name, `字段 ${key} 应为 number`); // 类型不匹配
    }
  }

  if (missing.length > 0) {
    throw new ToolValidationError(
      tool.name,
      `缺少必填字段：${missing.join(", ")}（Planner 请为 action=${tool.name} 的 input 提供有效值）`
    ); // 汇总缺失字段
  }
}

/** 将 WorkflowStep + 执行上下文组装为工具入参。 */
export function buildWorkflowToolInput(args: {
  step: WorkflowStep; // 当前步骤
  memory: Memory; // 记忆
  rt: ModelRuntime; // 模型运行时
  chainSnapshot: string; // 链快照
  depTextRaw: string; // 依赖文本
  hasExplicitDeps: boolean; // 是否显式依赖
  linearChainPrefix?: string; // 线性前缀
  dependencyTodoContext?: string; // todo 依赖上下文
}): WorkflowToolExecuteInput {
  return { ...args }; // 浅拷贝展开为 WorkflowToolExecuteInput
}

/** 沙箱：超时 Promise（与 execute 竞态）。 */
function timeoutPromise(ms: number, toolName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new ToolTimeoutError(toolName, ms)), ms); // 到期拒绝
  });
}

/** 第23天：按能力标签查找提供该能力的工具（Planner 路由辅助）。 */
export function findToolsByCapability(registry: ToolRegistry, capability: string): Tool[] {
  return registry.list().filter((t) => t.capabilities?.includes(capability)); // 包含即命中
}

function getToolTraceSpanType(toolName: string): TraceSpanType { // 第44天：根据工具名称推导 Tool Span（工具跨度）类型
  return /retrieval|rag/i.test(toolName) ? "retrieval" : "tool"; // 第44天：检索和 RAG 工具归入 retrieval，其余归入 tool
} // 第44天：getToolTraceSpanType 结束

/**
 * 第23天：将 Planner 声明的能力列表映射为首选 action。
 * 多能力组合时优先 composite（如 research = summary + todo）。
 */
export function resolveActionFromCapabilities(capabilities: string[]): string | undefined {
  const set = new Set(capabilities.map((c) => c.trim()).filter(Boolean)); // 规范化能力集合
  if (set.size === 0) return undefined; // 无能力则无法映射

  if (set.has("text-summary") && set.has("task-generation")) return "research"; // 组合研究工具
  if (set.has("research")) return "research"; // 显式 research 能力
  if (set.has("weather-query")) return "weather"; // 天气
  if (set.has("text-summary")) return "summary"; // 仅总结
  if (set.has("task-generation")) return "todo"; // 仅待办
  if (set.has("structured-judge")) return "judge"; // 结构化判断
  if (set.has("note-save")) return "note"; // 笔记
  if (set.has("history-search")) return "searchHistory"; // 历史搜索
  if (set.has("plan-generation")) return "generatePlan"; // 学习计划
  if (set.has("self-evaluation")) return "critic"; // 自评
  if (set.has("conversation")) return "chat"; // 对话
  if (set.has("query-rewrite") || set.has("retrieval-optimization")) return "queryRewrite"; // 第27天：查询改写
  if (set.has("knowledge-retrieval")) return "retrieval"; // 第24天：知识检索
  if (set.has("knowledge-answer")) return "ragAnswer"; // 第24天：RAG 问答
  return undefined; // 未识别组合
}

export class ToolRegistry {
  private tools = new Map<string, Tool>(); // name → Tool
  private metrics = new Map<string, ToolMetricsAccumulator>(); // name → 指标累加

  register(tool: Tool): void {
    console.log("[ToolRegistry] register", tool.name); // 第22天调试日志
    this.tools.set(tool.name, tool); // 写入 Map
    if (!this.metrics.has(tool.name)) {
      this.metrics.set(tool.name, {
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        totalDurationMs: 0,
      }); // 初始化指标桶
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name); // O(1) 查找
  }

  list(): Tool[] {
    return Array.from(this.tools.values()); // 全部已注册工具
  }

  listNames(): string[] {
    return this.list().map((t) => t.name); // 仅名称列表
  }

  /** 第23天：读取单工具指标快照。 */
  getMetrics(name: string): ToolMetricsSnapshot | undefined {
    const acc = this.metrics.get(name); // 累加器
    if (!acc || acc.totalCalls === 0) {
      return {
        totalCalls: acc?.totalCalls ?? 0,
        successCalls: acc?.successCalls ?? 0,
        failedCalls: acc?.failedCalls ?? 0,
        avgDurationMs: 0,
      }; // 无调用时均值为 0
    }
    return {
      totalCalls: acc.totalCalls,
      successCalls: acc.successCalls,
      failedCalls: acc.failedCalls,
      avgDurationMs: Math.round(acc.totalDurationMs / acc.totalCalls), // 整数毫秒均值
    };
  }

  /** 第23天：全部工具指标（Explorer / 调试）。 */
  getAllMetrics(): Record<string, ToolMetricsSnapshot> {
    const out: Record<string, ToolMetricsSnapshot> = {}; // 结果字典
    for (const name of this.listNames()) {
      const snap = this.getMetrics(name); // 单工具快照
      if (snap) out[name] = snap; // 写入
    }
    return out; // 返回全量
  }

  private recordMetric(name: string, success: boolean, durationMs: number): void {
    let acc = this.metrics.get(name); // 取累加器
    if (!acc) {
      acc = { totalCalls: 0, successCalls: 0, failedCalls: 0, totalDurationMs: 0 }; // 兜底新建
      this.metrics.set(name, acc);
    }
    acc.totalCalls += 1; // 总次数 +1
    if (success) acc.successCalls += 1;
    else acc.failedCalls += 1;
    acc.totalDurationMs += durationMs; // 累加耗时
  }

  /**
   * 执行工具：校验 → 沙箱（超时 + 递归深度）→ 记录指标。
   * @param execContext 第23天执行上下文；缺省时由 options 拼装最小上下文。
   */
  async execute(
    name: string, // 工具名
    input: WorkflowToolExecuteInput, // 工作流入参
    execContext?: Partial<ToolExecutionContext> & { workflowId?: string; stepOutputs?: Record<string, unknown> }
  ): Promise<unknown> {
    const tool = this.get(name); // 查找工具
    if (!tool) throw new Error(`Tool not found: ${name}`); // 未注册

    const depth = execContext?.depth ?? 0; // 当前递归深度
    if (depth > MAX_TOOL_RECURSION_DEPTH) {
      throw new ToolRecursionError(depth); // 递归守卫
    }

    const context: ToolExecutionContext = {
      workflowId: execContext?.workflowId ?? "unknown", // 工作流 id
      toolRegistry: this, // 自身引用供组合调用
      stepOutputs: execContext?.stepOutputs, // 步骤输出字典
      depth, // 传入深度
      logger: execContext?.logger, // 可选日志
      traceManager: execContext?.traceManager, // 第44天：向工具实现透传 TraceManager（追踪管理器）
      traceId: execContext?.traceId, // 第44天：向工具实现透传 Trace ID（追踪记录 ID）
      parentSpanId: execContext?.parentSpanId, // 第44天：向工具实现透传父 Span ID（父跨度 ID）
    };

    console.log("[ToolRegistry] execute", { tool: tool.name, stepId: input.step.id, depth }); // 调试日志

    const started = Date.now(); // 计时起点
    const traceSpanId = context.traceManager && context.traceId ? context.traceManager.startSpan(context.traceId, { parentSpanId: context.parentSpanId, name: tool.name, type: getToolTraceSpanType(tool.name), metadata: { workflowId: context.workflowId, stepId: input.step.id, depth } }) : ""; // 第44天：真实工具调用开始时写入 tool/retrieval span
    let success = false; // 是否成功
    try {
      validateToolInput(tool, input); // 第22天：执行前校验
      const resultPromise = tool.execute(input, context); // 实际执行
      const out = await Promise.race([
        resultPromise, // 工具逻辑
        timeoutPromise(DEFAULT_TOOL_TIMEOUT_MS, tool.name), // 超时竞态
      ]);
      success = true; // 标记成功
      return out; // 返回工具输出
    } catch (err) {
      if (err instanceof ToolValidationError) {
        console.warn("[ToolRegistry] validation failed", tool.name, err.message); // 校验失败日志
      }
      throw err; // 向上抛出
    } finally {
      const durationMs = Date.now() - started; // 第44天：计算工具执行耗时
      context.traceManager?.endSpan(context.traceId ?? "", traceSpanId, success ? "success" : "failed", { durationMs }); // 第44天：工具结束时同步结束 Trace Span（追踪跨度）
      this.recordMetric(name, success, durationMs); // 无论成败记录指标
    }
  }
}

/** 供 Planner Prompt 动态生成「可用工具」列表（含能力与依赖）。 */
export function formatToolsForPlanner(registry: ToolRegistry): string {
  return registry
    .list()
    .map((tool) => {
      const caps = tool.capabilities?.length ? ` [能力: ${tool.capabilities.join(", ")}]` : ""; // 能力后缀
      const deps = tool.dependencies?.length ? ` (依赖工具: ${tool.dependencies.join(", ")})` : ""; // 依赖后缀
      return `- ${tool.name}: ${tool.description}${caps}${deps}`; // 单行描述
    })
    .join("\n"); // 多行拼接
}

/** 第23天：供 Planner 按 Capability 选能力的说明块。 */
export function formatCapabilitiesForPlanner(registry: ToolRegistry): string {
  const capMap = new Map<string, string[]>(); // capability → tool names
  for (const tool of registry.list()) {
    for (const cap of tool.capabilities ?? []) {
      const list = capMap.get(cap) ?? []; // 取或建列表
      list.push(tool.name); // 登记提供方
      capMap.set(cap, list); // 写回
    }
  }
  const lines: string[] = []; // 输出行
  for (const [cap, tools] of capMap.entries()) {
    lines.push(`- ${cap} → 可用工具: ${tools.join(" | ")}`); // 能力到工具映射
  }
  lines.push(
    "- 组合提示: 若同时需要 text-summary + task-generation，优先 action=research（内部调用 summary 与 todo）"
  ); // 组合路由提示
  return lines.join("\n"); // 返回文本块
}

/** 供 API / Tool Explorer 返回的轻量描述（第23天扩展 capabilities / dependencies / metrics）。 */
export type ToolDescriptor = {
  name: string; // 工具名
  description: string; // 说明
  capabilities?: string[]; // 能力标签
  dependencies?: string[]; // 依赖图边
  subTools?: string[]; // 组合工具子工具列表
  inputSchema?: ToolSchema; // 入参 Schema
  outputSchema?: ToolSchema; // 出参 Schema
  metrics?: ToolMetricsSnapshot; // 运行时指标
};

export function toolToDescriptor(tool: Tool, registry?: ToolRegistry): ToolDescriptor {
  const composite = tool as CompositeTool; // 尝试读取 subTools
  return {
    name: tool.name,
    description: tool.description,
    capabilities: tool.capabilities,
    dependencies: tool.dependencies,
    subTools: composite.subTools,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    metrics: registry?.getMetrics(tool.name), // 附带指标
  };
}

