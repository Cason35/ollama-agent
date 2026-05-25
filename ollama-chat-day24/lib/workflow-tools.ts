/**
 * 第22–23天：注册 Workflow 运行时工具（含组合 research 与扩展工具）。
 */
import { formatMemoryForPlanner } from "@/lib/chat-memory"; // Planner 记忆格式化
import {
  extractWeatherCity, // 天气城市解析
  generateTodosWithModel, // 待办生成
  getLatestUserText, // 最近用户文本
  realWeather, // 模拟天气 API
  summarizeWithModel, // 总结生成
} from "@/lib/chat-tools";
import { invokeChatModel, type ModelRuntime } from "@/lib/model-runtime"; // 模型调用
import type { Memory, WorkflowStepAction } from "@/lib/workflow-types"; // 工作流类型
import {
  ToolRegistry, // 注册表类
  type CompositeTool, // 组合工具类型
  type Tool, // 工具接口
  type WorkflowToolExecuteInput, // 执行入参
} from "@/lib/tool-registry";
import { runWorkflowChat, runWorkflowChatDirect } from "@/lib/workflow-chat"; // chat 实现（打破循环依赖）
import { buildRagPrompt } from "@/lib/knowledge-rag"; // 第24天：RAG Prompt 注入
import { knowledgeStore } from "@/lib/knowledge-store"; // 第24天：本地知识库
import { DEFAULT_RETRIEVAL_TOP_K } from "@/lib/knowledge-retrieval"; // 默认 TopK
import { createWorkflowStore } from "@/lib/workflow-store"; // 历史 workflow 搜索

/** 第22天：Workflow 内 judge 步骤逻辑（结构化 JSON 输出）。 */
async function runWorkflowJudge(args: {
  stepInput: string; // 待判断输入
  chainSnapshot: string | undefined; // 链前缀
  memory: Memory; // 记忆
  rt: ModelRuntime; // 模型
  depTextRaw: string; // 依赖文本
  hasExplicitDeps: boolean; // 是否显式依赖
}): Promise<{ result: string; reason: string }> {
  const memText = formatMemoryForPlanner(args.memory); // 长期记忆文本
  const inputBlock =
    args.hasExplicitDeps && args.depTextRaw.trim()
      ? `【依赖步骤结果】\n${args.depTextRaw}\n\n【待判断输入】\n${args.stepInput}` // 显式依赖块
      : [
          args.chainSnapshot ? `【前置步骤输出】\n${args.chainSnapshot}` : "", // 链前缀
          `【待判断输入】\n${args.stepInput}`, // 当前输入
        ]
          .filter(Boolean) // 去空
          .join("\n\n"); // 拼接
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
`.trim(); // 判断 Prompt
  const { ok, text } = await invokeChatModel(args.rt, [{ role: "user", content: judgePrompt }]); // 调模型
  if (!ok) return { result: "incomplete", reason: "模型暂不可用，判定失败" }; // 降级
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/); // 抽取 JSON
    const parsed = JSON.parse(jsonMatch?.[0] || text) as { result?: unknown; reason?: unknown }; // 解析
    const result = typeof parsed.result === "string" ? parsed.result.trim() : "incomplete"; // result 字段
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : ""; // reason 字段
    return { result: result || "incomplete", reason: reason || "" }; // 规范化返回
  } catch {
    return { result: "incomplete", reason: "输出不是合法 JSON，判定降级" }; // 解析失败
  }
}

/** 将子工具输出规范为可写入 step.input 的字符串。 */
function coerceToolOutputText(out: unknown): string {
  if (typeof out === "string") return out.trim(); // 已是字符串
  if (out == null) return ""; // 空
  try {
    return JSON.stringify(out); // 对象序列化
  } catch {
    return String(out); // 兜底
  }
}

/** 克隆 WorkflowToolExecuteInput 并替换 step.input（组合工具传参）。 */
function withStepInput(
  input: WorkflowToolExecuteInput, // 原入参
  nextInput: string // 新 input 文本
): WorkflowToolExecuteInput {
  return {
    ...input, // 浅拷贝
    step: { ...input.step, input: nextInput }, // 替换步骤 input
  };
}

const weatherTool: Tool = {
  name: "weather", // 工具名
  description: "查询天气（当前支持北京、上海）", // 描述
  capabilities: ["weather-query"], // 第23天：能力标签
  inputSchema: { city: { type: "string", required: true, description: "城市名" } }, // 入参 Schema
  outputSchema: { text: "string" }, // 出参 Schema
  async execute(input) {
    const latestUser = getLatestUserText(input.memory.shortTerm); // 最近用户消息
    const stepText =
      input.step.input && input.step.input !== "[object Object]" ? input.step.input : ""; // 步骤 input
    const keyword = extractWeatherCity(stepText || latestUser); // 城市关键字
    return realWeather(keyword); // 调用天气
  },
};

const summaryTool: Tool = {
  name: "summary", // 工具名
  description: "总结对话或材料要点", // 描述
  capabilities: ["text-summary"], // 能力：文本总结
  inputSchema: { input: { type: "string", required: false } }, // 可选 input
  outputSchema: { text: "string" }, // 文本输出
  async execute(input) {
    return summarizeWithModel(
      input.memory.shortTerm, // 短期记忆
      input.step.input, // 步骤 input
      input.memory, // 完整记忆
      input.rt, // 模型
      input.hasExplicitDeps ? input.depTextRaw || undefined : input.linearChainPrefix // 依赖或链前缀
    );
  },
};

const todoTool: Tool = {
  name: "todo", // 工具名
  description: "生成个性化待办列表", // 描述
  capabilities: ["task-generation"], // 能力：任务生成
  inputSchema: { input: { type: "string", required: false } }, // 可选 input
  outputSchema: { items: "array" }, // 待办数组
  async execute(input) {
    return generateTodosWithModel({
      userInput: input.step.input, // 用户/步骤输入
      memory: input.memory, // 记忆
      rt: input.rt, // 模型
      chainPrefix: input.linearChainPrefix, // 链前缀
      dependencyContext:
        input.dependencyTodoContext && input.dependencyTodoContext.trim().length > 0
          ? input.dependencyTodoContext // 显式依赖上下文
          : undefined,
    });
  },
};

const judgeTool: Tool = {
  name: "judge", // 工具名
  description: "结构化判断（输出 result/reason JSON，用于条件分支）", // 描述
  capabilities: ["structured-judge"], // 能力：结构化判断
  inputSchema: { input: { type: "string", required: false } }, // 可选 input
  outputSchema: { result: "string", reason: "string" }, // JSON 字段
  async execute(input) {
    return runWorkflowJudge({
      stepInput: input.step.input, // 待判断文本
      chainSnapshot: input.chainSnapshot, // 链快照
      memory: input.memory, // 记忆
      rt: input.rt, // 模型
      depTextRaw: input.depTextRaw, // 依赖文本
      hasExplicitDeps: input.hasExplicitDeps, // 是否显式依赖
    });
  },
};

const chatTool: Tool = {
  name: "chat", // 工具名
  description: "普通中文对话回答", // 描述
  capabilities: ["conversation"], // 能力：对话
  inputSchema: { input: { type: "string", required: false } }, // 可选 input
  outputSchema: { text: "string" }, // 文本
  async execute(input) {
    if (input.hasExplicitDeps && input.depTextRaw.trim()) {
      return runWorkflowChatDirect(
        `【依赖步骤结果】\n${input.depTextRaw}\n\n【当前任务】\n${input.step.input}`, // 带依赖的对话
        input.memory,
        input.rt
      );
    }
    return runWorkflowChat(
      input.step.input, // 步骤 input
      input.chainSnapshot || undefined, // 链前缀
      input.memory,
      input.rt
    );
  },
};

/** 第23天：组合工具 research — 内部调用 summary → todo（Tool Composition）。 */
const researchTool: CompositeTool = {
  name: "research", // 组合工具名
  description: "研究任务：先总结再生成待办（组合 summary + todo）", // 描述
  capabilities: ["text-summary", "task-generation", "research"], // 多能力
  dependencies: ["summary", "todo"], // Tool Graph 边
  subTools: ["summary", "todo"], // Explorer 树形展示
  inputSchema: { input: { type: "string", required: false } }, // 与 summary 类似
  outputSchema: { summary: "string", todos: "array" }, // 组合输出
  async execute(input, context) {
    const childCtx = { ...context, depth: context.depth + 1 }; // 子调用加深深度
    const summary = await context.toolRegistry.execute("summary", input, {
      workflowId: context.workflowId,
      stepOutputs: context.stepOutputs,
      depth: childCtx.depth,
    }); // 第一步：总结
    const summaryText = coerceToolOutputText(summary); // 规范为字符串
    const todoInput = withStepInput(input, summaryText); // 将总结作为 todo 输入
    const todos = await context.toolRegistry.execute("todo", todoInput, {
      workflowId: context.workflowId,
      stepOutputs: context.stepOutputs,
      depth: childCtx.depth + 1,
    }); // 第二步：待办
    return { summary, todos }; // 组合结果
  },
};

/** 第23天：note — 将要点写入长期记忆（笔记能力）。 */
const noteTool: Tool = {
  name: "note", // 工具名
  description: "保存笔记到长期记忆", // 描述
  capabilities: ["note-save"], // 能力
  inputSchema: { input: { type: "string", required: true, description: "笔记正文" } }, // 必填
  outputSchema: { saved: "boolean", preview: "string" }, // 保存结果
  async execute(input) {
    const text = input.step.input?.trim() || ""; // 笔记正文
    if (!text) return { saved: false, preview: "" }; // 空则未保存
    input.memory.items.push({ content: `[笔记] ${text}`, importance: "high" }); // 写入长期记忆 items
    return { saved: true, preview: text.slice(0, 120) }; // 返回摘要预览
  },
};

/** 第23天：searchHistory — 按关键词搜索已持久化 Workflow（backend Store）。 */
const searchHistoryTool: Tool = {
  name: "searchHistory", // 工具名
  description: "搜索历史 Workflow 记录（goal / id 关键词）", // 描述
  capabilities: ["history-search"], // 能力
  inputSchema: { input: { type: "string", required: false, description: "搜索关键词" } }, // 关键词
  outputSchema: { query: "string", hits: "array" }, // 命中列表
  async execute(input) {
    const query = (input.step.input?.trim() || getLatestUserText(input.memory.shortTerm)).slice(0, 80); // 查询词
    const store = createWorkflowStore("backend"); // 服务端 MySQL 列表（local 模式可改偏好）
    const all = await store.list(); // 全量列表
    const q = query.toLowerCase(); // 小写匹配
    const hits = all
      .filter(
        (w) =>
          w.goal.toLowerCase().includes(q) || // goal 命中
          w.workflowId.toLowerCase().includes(q) // id 命中
      )
      .slice(0, 8) // 最多 8 条
      .map((w) => ({
        workflowId: w.workflowId, // id
        goal: w.goal, // 目标
        status: w.status, // 状态
        updatedAt: w.updatedAt, // 更新时间
      }));
    return { query, hits }; // 返回搜索结果
  },
};

/** 第23天：generatePlan — 根据目标生成学习计划。 */
const generatePlanTool: Tool = {
  name: "generatePlan", // 工具名
  description: "根据学习目标生成分阶段学习计划", // 描述
  capabilities: ["plan-generation"], // 能力
  inputSchema: { input: { type: "string", required: true, description: "学习目标" } }, // 目标
  outputSchema: { plan: "string" }, // 计划文本
  async execute(input) {
    const goal = input.step.input?.trim() || "通用学习目标"; // 默认目标
    const memText = formatMemoryForPlanner(input.memory); // 记忆上下文
    const prompt = `
你是学习规划助手。根据用户目标输出 JSON：
{ "plan": "分阶段学习计划（中文，含阶段名与要点）" }

目标：${goal}
长期记忆：${memText}
只返回 JSON，不要其它说明。
`.trim();
    const { ok, text } = await invokeChatModel(input.rt, [{ role: "user", content: prompt }]); // 调模型
    if (!ok) return { plan: "模型暂不可用，无法生成学习计划。" }; // 降级
    try {
      const m = text.match(/\{[\s\S]*\}/); // 抽 JSON
      const parsed = JSON.parse(m?.[0] || text) as { plan?: unknown }; // 解析
      const plan = typeof parsed.plan === "string" ? parsed.plan : text; // plan 字段
      return { plan }; // 返回
    } catch {
      return { plan: text.trim() || "（无计划输出）" }; // 原文兜底
    }
  },
};

/** 第24天：retrieval — 从本地知识库语义检索 TopK chunks。 */
const retrievalTool: Tool = {
  name: "retrieval", // 工具名
  description: "从知识库检索与问题最相关的文本块（向量相似度 TopK）", // 描述
  capabilities: ["knowledge-retrieval"], // 能力：知识检索
  inputSchema: { input: { type: "string", required: true, description: "检索查询" } }, // 查询必填
  outputSchema: { query: "string", hits: "array", topK: "number" }, // 命中列表
  async execute(input) {
    const query =
      input.step.input?.trim() || getLatestUserText(input.memory.shortTerm) || ""; // 步骤 input 或最近用户话
    const topK = DEFAULT_RETRIEVAL_TOP_K; // 默认取 3 条
    const hits = await knowledgeStore.search(query, topK); // 向量检索
    return { query, hits, topK }; // 返回可观测结构
  },
};

/** 第24天：ragAnswer — 检索 + RAG Prompt 注入 + LLM 生成回答。 */
const ragAnswerTool: Tool = {
  name: "ragAnswer", // 工具名
  description: "基于知识库 RAG：先检索相关片段，再注入 Prompt 后由模型回答", // 描述
  capabilities: ["knowledge-answer", "knowledge-retrieval"], // 检索 + 问答
  dependencies: ["retrieval"], // Tool Graph：逻辑依赖检索能力
  inputSchema: { input: { type: "string", required: true, description: "用户问题" } }, // 问题必填
  outputSchema: { answer: "string", hits: "array" }, // 回答与引用片段
  async execute(input) {
    const question =
      input.step.input?.trim() || getLatestUserText(input.memory.shortTerm) || ""; // 问题文本
    const hits = await knowledgeStore.search(question, DEFAULT_RETRIEVAL_TOP_K); // 先检索
    const ragPrompt = buildRagPrompt(question, hits); // RAG 动态上下文注入
    const { ok, text } = await invokeChatModel(input.rt, [{ role: "user", content: ragPrompt }]); // 调 LLM
    if (!ok) {
      return {
        answer: "模型暂不可用，无法基于知识库回答。",
        hits,
      }; // 降级仍返回 hits 便于 UI
    }
    return { answer: text.trim(), hits }; // 成功返回答案与引用
  },
};

/** 第23天：critic — 自评当前工作流已成功步骤的输出质量。 */
const criticTool: Tool = {
  name: "critic", // 工具名
  description: "评估 workflow 已成功步骤的输出质量（Self-evaluation）", // 描述
  capabilities: ["self-evaluation"], // 能力
  inputSchema: { input: { type: "string", required: false } }, // 可选评价焦点
  outputSchema: { score: "number", feedback: "string" }, // 评分与反馈
  async execute(input, context) {
    const focus = input.step.input?.trim() || "整体工作流结果"; // 评价焦点
    const outputs = context.stepOutputs ?? {}; // 已成功步骤输出
    const serialized = JSON.stringify(outputs, null, 2).slice(0, 6000); // 截断防 Prompt 过长
    const prompt = `
你是质量评审 Agent。根据已成功步骤输出，返回 JSON：
{ "score": 1-10 的整数, "feedback": "中文改进建议" }

评价焦点：${focus}
已成功步骤输出：
${serialized || "（暂无成功步骤输出）"}
只返回 JSON。
`.trim();
    const { ok, text } = await invokeChatModel(input.rt, [{ role: "user", content: prompt }]); // 调模型
    if (!ok) return { score: 0, feedback: "模型暂不可用，无法评审。" }; // 降级
    try {
      const m = text.match(/\{[\s\S]*\}/); // 抽 JSON
      const parsed = JSON.parse(m?.[0] || text) as { score?: unknown; feedback?: unknown }; // 解析
      const scoreRaw = typeof parsed.score === "number" ? parsed.score : Number(parsed.score); // 分数
      const score = Number.isFinite(scoreRaw) ? Math.min(10, Math.max(0, Math.round(scoreRaw))) : 5; // 钳制 0–10
      const feedback = typeof parsed.feedback === "string" ? parsed.feedback : text; // 反馈文本
      return { score, feedback }; // 返回
    } catch {
      return { score: 5, feedback: text.trim() || "无法解析评审 JSON" }; // 兜底
    }
  },
};

/** 创建并注册全部 Workflow 工具的 Registry 实例。 */
function createWorkflowToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry(); // 新建注册表
  registry.register(weatherTool); // 天气
  registry.register(summaryTool); // 总结
  registry.register(todoTool); // 待办
  registry.register(judgeTool); // 判断
  registry.register(chatTool); // 对话
  registry.register(researchTool); // 第23天：组合
  registry.register(noteTool); // 第23天：笔记
  registry.register(searchHistoryTool); // 第23天：历史搜索
  registry.register(generatePlanTool); // 第23天：学习计划
  registry.register(criticTool); // 第23天：自评
  registry.register(retrievalTool); // 第24天：知识检索
  registry.register(ragAnswerTool); // 第24天：RAG 问答
  return registry; // 返回单例工厂结果
}

/** 全局 Workflow 工具注册表（单例）。 */
export const workflowToolRegistry = createWorkflowToolRegistry(); // 模块加载时注册

/** 与 validateWorkflow 对齐的 action 白名单（由 Registry 动态生成）。 */
export const WORKFLOW_ALLOWED_ACTIONS: ReadonlySet<WorkflowStepAction> = new Set(
  workflowToolRegistry.listNames() as WorkflowStepAction[] // 全部已注册 name
);
