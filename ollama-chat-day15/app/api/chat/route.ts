/**
 * Next.js App Router：`POST /api/chat` —— 带记忆与工具路由的聊天接口。
 *
 * 注释约定：可执行代码行尽量带行尾「//」中文说明；多处多行模板字符串内为模型提示词正文，无法在字符串内部写行尾注释，含义以构造该模板的变量名与邻近注释为准。
 *
 * 整体流程：
 * 1. 解析请求中的 messages 与可选 memory，调用 buildMemory 组装「短期窗口 + 长期条目」并生成喂给模型的 messages；
 * 2. 用专用 system 提示词走一轮聊天模型（本地 Ollama 或小米 MiMo OpenAI 兼容接口），让模型输出 JSON 形式的 action（路由）；
 * 3. 结合「延续上一轮」等启发规则修正 action，再分支执行：天气 / 总结 / 待办 / 普通回复；
 * 4. 响应体始终带上最新的 memory，供前端下一轮原样回传，形成闭环。
 *
 * 外部依赖：本地 Ollama HTTP API，或小米 MiMo（`XIAOMI_MIMO_*` 环境变量）；天气分支使用 Open-Meteo（无需 key）。
 */

import { MIMO_MODEL_IDS, type MimoModelId } from "@/lib/mimo-models"; // 小米 MiMo 模型 id 白名单与联合类型，供校验与默认模型

/** 与前端约定的单条对话消息（仅 user / assistant 文本）。 */
type ChatMessage = {
  role: "user" | "assistant"; // 说话方
  content: string; // 文本载荷
};

/** 长期记忆条目的重要程度：路由与压缩时优先保留 high。 */
type MemoryImportance = "high" | "low"; // 二值重要性枚举

/** 单条长期记忆：内容 + 重要性，替代早期单一的 longTerm 长字符串。 */
type MemoryItem = {
  content: string; // 事实或摘要正文
  importance: MemoryImportance; // high 优先保留与路由参考
};

/**
 * 服务端持有的完整记忆结构。
 * - shortTerm：保留最近若干轮，供路由与最终回复感知当下语境；
 * - items：带权重的长期事实列表（可由模型总结或规则抽取得到）。
 */
type Memory = {
  shortTerm: ChatMessage[]; // 短期对话窗口
  items: MemoryItem[]; // 长期结构化条目
};

/** 路由模型输出中的意图枚举（与前端展示类型一一对应）。 */
type Action = "chat" | "weather" | "summary" | "todo"; // 四类业务动作

/** 路由模型应输出的 JSON 形状（经 parseModelOutput 规范化）。 */
type ParsedOutput = {
  action: Action; // 归一化后的动作
  /** 部分场景下作为工具输入的摘要文本（如聊天兜底）。 */
  content: string; // 路由给出的正文或工具输入
  /** 天气意图下的城市/地区关键词。 */
  keyword: string; // 天气关键词
};

/** 待办卡片中单条任务。 */
type TodoItem = {
  task: string; // 任务描述
  done: boolean; // 是否完成
};

/** 返回给前端的联合类型（含 memory）。 */
/** 工作流单步可执行动作（与 Planner 约定一致）。 */
type WorkflowStepAction = "chat" | "summary" | "todo" | "weather";

/** 工作流中的单步：含状态、输出与可观测耗时。 */
type WorkflowStep = {
  id: string; // 步骤唯一 id（前端列表 key、日志关联、dependsOn 指向此 id）
  name: string; // 人类可读的步骤标题
  action: WorkflowStepAction; // 本步要调用的工具类型
  input: string; // 传给该工具的自然语言或关键词入参
  /** 若后续步骤需要本步输出，则将依赖方的 id 写在 dependsOn 指向这些 id。 */
  dependsOn?: string[];
  status: "pending" | "running" | "success" | "failed"; // 步骤生命周期状态
  output?: unknown; // 成功时工具返回（字符串或 JSON 可序列化结构）
  error?: string; // 失败时的错误信息摘要
  durationMs?: number; // 本步执行耗时（毫秒）
  /** 本步执行前注入到工具提示中的上下文（依赖输出或线性前置）；供前端链式调试展示。 */
  injectedContextPreview?: string;
  /** 第15天：步骤级额外重试次数（不含首次执行）；缺省则由执行器全局 WORKFLOW_DEFAULT_STEP_RETRIES 决定。 */
  retry?: number; // undefined 表示走全局默认；0 表示仅尝试一次不重试；正整数表示失败后可再尝试的次数上限
};

/** 第15天：工作流校验/执行/trace 单条打点（供前端 Timeline 与日志对齐）。 */
type WorkflowTimelineEvent = {
  ts: number; // 事件发生对应的 Unix 毫秒时间戳（由 Date.now 取得）
  stepId?: string; // 与该事件强相关的步骤 id（全局级事件可不填）
  message: string; // 面向人类阅读的中文简述（校验、重试、开始、成功、失败等均写清语义）
}; // WorkflowTimelineEvent 类型结束

/** 一次多步骤任务的容器。 */
type Workflow = {
  id: string; // 工作流实例 id
  goal: string; // 用户本轮目标（通常取最新 user 文本）
  steps: WorkflowStep[]; // Planner 产出并由执行器顺序跑完的步骤列表
  status: "pending" | "running" | "success" | "failed"; // 整体工作流状态
  /** 第15天：全链路观测时间线（含 validate/repair/execute/retry）；最终随 JSON 一并返回前端。 */
  executionTimeline?: WorkflowTimelineEvent[]; // 可选：仅在 workflow 模式且触发了打点逻辑时出现
}; // Workflow 类型结束（第15天扩展 executionTimeline）

type ChatResponseBody =
  | { type: "chat"; content: string; memory: Memory } // 聊天
  | { type: "weather"; keyword: string; result: string; memory: Memory } // 天气
  | { type: "summary"; text: string; memory: Memory } // 总结
  | { type: "todo"; items: TodoItem[]; memory: Memory } // 待办
  | { type: "workflow"; workflow: Workflow; finalSummary: string; memory: Memory }; // 多步骤工作流

/**
 * 不含 memory 的响应负载。
 * 单独拆出用于 withMemory 组装最终体，避免 TS 对 Omit<联合类型> 的收窄问题。
 */
type ChatResponsePayload =
  | { type: "chat"; content: string } // 仅聊天字段
  | { type: "weather"; keyword: string; result: string } // 仅天气字段
  | { type: "summary"; text: string } // 仅总结字段
  | { type: "todo"; items: TodoItem[] } // 仅待办字段
  | { type: "workflow"; workflow: Workflow; finalSummary: string }; // 工作流结果

/**
 * 请求体中的 memory 字段：兼容 Day11 的 longTerm 字符串，也支持新结构的 items。
 */
type IncomingMemoryPayload = Partial<Memory> & { longTerm?: string }; // 可选旧 longTerm

// ---------- 上下文与记忆体积限制 ----------

/** 当 incoming messages 超过该条数时，较早部分会先被总结进长期记忆再丢弃出窗口。 */
const MAX_CONTEXT_MESSAGES = 10; // 超过则压缩旧消息
/** 短期窗口保留的最近消息条数（与 MAX_CONTEXT_MESSAGES 配合控制总量）。 */
const SHORT_TERM_SIZE = 6; // 尾部保留条数
/** 长期记忆条目序列化后的字符上限，超出时按重要性裁剪。 */
const MAX_LONG_TERM_CHARS = 2000; // 长期字符上限
/** 总字符数或条数超阈时触发二次「模型压缩」长期记忆。 */
const SECONDARY_COMPRESS_THRESHOLD_CHARS = 500; // 触发二次压缩的字符阈值
/** 二次压缩后最多保留的条目数。 */
const MAX_COMPRESSED_ITEMS = 5; // 压缩输出条数上限

// ---------- 模型后端：本地 Ollama / 小米 MiMo（OpenAI 兼容）----------

const DEFAULT_OLLAMA_API_URL = "http://localhost:11434/api/chat"; // 默认 Ollama 聊天端点
const DEFAULT_OLLAMA_MODEL = "qwen2.5:14b"; // 默认本地模型名
/** 小米 MiMo OpenAI 兼容网关默认 origin（勿带末尾斜杠以外的多余路径，拼接 /chat/completions）。 */
const DEFAULT_MIMO_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

/** 请求体选的提供商：local=Ollama，mimo=小米兼容接口。 */
type ModelProvider = "local" | "mimo";

/**
 * 单次请求内的模型运行时配置（由 env + 前端 provider / mimoModel 组装）。
 * Key 仅来自服务端环境变量，绝不从前端传入。
 */
type ModelRuntime = {
  provider: ModelProvider; // 当前走 Ollama 还是 MiMo
  ollamaUrl: string; // 本地聊天 API 完整 URL
  ollamaModel: string; // 本地模型名
  mimoBaseUrl: string; // 小米网关 origin（不带路径尾巴）
  mimoApiKey: string; // 小米 Bearer 密钥
  mimoModel: string; // 小米模型 id
};

function isMimoModelId(id: string): id is MimoModelId {
  return (MIMO_MODEL_IDS as readonly string[]).includes(id); // 判断 id 是否在白名单模型列表中
}

function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, ""); // 去掉末尾多余斜杠，便于拼接 /chat/completions
}

/**
 * 统一聊天补全：Ollama `/api/chat` 或 OpenAI 兼容 `POST /chat/completions`。
 * 成功时 text 为助手正文；失败时 text 尽量携带上游错误文案。
 */
async function invokeChatModel(
  rt: ModelRuntime,
  messages: Array<{ role: string; content: string }>
): Promise<{ ok: boolean; status: number; text: string }> {
  if (rt.provider === "local") {
    // 走本地 Ollama：请求体为 Ollama 原生 /api/chat 格式
    const res = await fetch(rt.ollamaUrl, {
      method: "POST", // HTTP 方法：POST JSON
      headers: { "Content-Type": "application/json" }, // 声明 JSON 请求体
      body: JSON.stringify({
        model: rt.ollamaModel, // 本地要调用的模型名（如 qwen2.5:14b）
        messages, // 与 OpenAI 风格兼容的消息数组（role + content）
        stream: false, // 本路由统一非流式，便于一次性解析完整 JSON/文本
      }), // 序列化请求体
    }); // 发起 fetch 并等待响应
    const rawText = await res.text(); // 无论成功失败先读整段文本，便于分支解析
    let text = ""; // 最终抽取的助手正文或错误摘要
    if (res.ok) {
      // HTTP 2xx：按 Ollama 成功响应结构取 message.content
      try {
        const data = JSON.parse(rawText) as { message?: { content?: string } }; // Ollama 典型：{ message: { content } }
        text = data.message?.content?.trim() || ""; // 安全链式读取并去掉首尾空白
      } catch {
        text = ""; // JSON 非法或结构不符时视为无正文
      } // try/catch 结束
    } else {
      // HTTP 非 2xx：尽量从 Ollama error 字段取可读原因，否则截断原始响应
      try {
        const data = JSON.parse(rawText) as { error?: string }; // Ollama 错误常见为 { error: string }
        text = (typeof data.error === "string" ? data.error : "") || rawText.slice(0, 800); // 优先 error，否则截断防日志过长
      } catch {
        text = rawText.slice(0, 800); // 非 JSON 错误页时直接截断原文
      } // try/catch 结束
    } // if (res.ok) 分支结束
    return { ok: res.ok, status: res.status, text }; // 与 MiMo 分支统一返回三元组
  } // local 分支结束

  const base = normalizeApiBase(rt.mimoBaseUrl); // 规范化小米网关基址
  const res = await fetch(`${base}/chat/completions`, {
    // OpenAI 兼容聊天补全端点
    method: "POST", // POST JSON
    headers: {
      "Content-Type": "application/json", // 声明 JSON 请求体
      Authorization: `Bearer ${rt.mimoApiKey}`, // Bearer 鉴权头
    },
    body: JSON.stringify({
      model: rt.mimoModel, // 前端选择的具体 MiMo 模型 id
      messages, // 与 Ollama 侧相同的消息数组
      stream: false, // 本接口走非流式一次性返回
    }), // MiMo 请求体序列化结束
  }); // fetch chat/completions 结束
  const rawText = await res.text(); // 原始响应文本（成功/失败统一先读字符串）
  let text = ""; // 解析出的助手正文或错误摘要
  if (res.ok) {
    // MiMo/OpenAI 成功：choices[0].message.content 为主文案
    try {
      const data = JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: string } }>; // OpenAI 风格 choices
      }; // 解析成功响应 JSON
      text = data.choices?.[0]?.message?.content?.trim() || ""; // 取首条 choice 的 message.content
    } catch {
      text = ""; // JSON 异常则视为无正文
    } // try/catch（成功分支）
  } else {
    // MiMo/OpenAI 错误：兼容 error 为对象或字符串
    try {
      const data = JSON.parse(rawText) as {
        error?: { message?: string } | string; // 兼容对象或字符串 error
      }; // 解析错误响应 JSON
      if (typeof data.error === "object" && data.error?.message) {
        text = data.error.message; // 读出 OpenAI 式 error.message
      } else if (typeof data.error === "string") {
        text = data.error; // 简单字符串错误
      } else {
        text = rawText.slice(0, 800); // 无法结构化则截取原始片段避免日志爆炸
      } // if/else error 形态
    } catch {
      text = rawText.slice(0, 800); // 解析失败同样截取正文
    } // try/catch（错误分支）
  } // if (res.ok) MiMo
  return { ok: res.ok, status: res.status, text }; // 与 local 分支统一返回形状
} // invokeChatModel 函数结束

// ---------- 规则抽取 / 重要性推断用的正则 ----------

/** 匹配用户话术中「值得写入长期记忆」的自我介绍、目标等句式。 */
const LONG_TERM_RULE_PATTERN = /(我叫|我的名字是|叫我|我是|我想|我的目标|我希望|偏好|习惯)/; // 规则记忆触发
/** 用于推断 importance=high 的关键词（身份、规划类）。 */
const HIGH_IMPORTANCE_PATTERN =
  /(我叫|我的名字|我是|我想|我的目标|我希望|长期|计划|转型|职业|岗位)/; // 高重要线索
/** 闲聊语气词：倾向于标为 low 或在压缩时丢弃。 */
const LOW_CHITCHAT_PATTERN = /(哈哈|呵呵|谢谢|好的|嗯嗯|随便聊聊|今天天气不错)/; // 低重要闲聊

/** 演示用城市 → 经纬度，供 Open-Meteo 查询；未列入的城市会提示不支持。 */
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 }, // 北京坐标
  上海: { lat: 31.2304, lon: 121.4737 }, // 上海坐标
};

/** 结构化日志，便于在服务端排查路由与耗时。 */
function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[Agent] ${event}`, payload); // 打印事件名与负载
}

/** Workflow 专用日志（含每步耗时）。 */
function logWorkflow(
  event: "start" | "step" | "done" | "error",
  payload: Record<string, unknown>
) {
  console.log(`[Workflow] ${event}`, payload); // 打印工作流阶段与结构化负载
}

/** 将模型输出的 action 字符串收敛到本服务支持的四种之一（含 search→weather 别名）。 */
function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather"; // 天气别名统一
  if (raw === "summary") return "summary"; // 总结
  if (raw === "todo") return "todo"; // 待办
  return "chat"; // 默认聊天
}

/** Planner 输出的 action 仅含四类工具，不含 workflow。 */
function normalizeWorkflowAction(raw: unknown): WorkflowStepAction {
  if (raw === "weather" || raw === "search") return "weather"; // 天气与 search 别名统一为 weather
  if (raw === "summary") return "summary"; // 总结步骤
  if (raw === "todo") return "todo"; // 待办生成步骤
  return "chat"; // 默认走普通对话
}

/**
 * 将任意 JSON 对象规范为 ParsedOutput；字段缺失或类型不对时使用安全默认值。
 * rawText 用于在完全无法解析时把原始文本塞进 content（便于走 chat 兜底）。
 */
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  if (!input || typeof input !== "object") {
    return { action: "chat", content: rawText, keyword: "" }; // 非对象则全文当聊天
  }
  const candidate = input as Partial<ParsedOutput>; // 宽松读取字段
  return {
    action: normalizeAction(candidate.action), // 归一化 action
    content:
      typeof candidate.content === "string" && candidate.content.trim()
        ? candidate.content.trim() // 有正文则修剪
        : "", // 否则空串
    keyword: typeof candidate.keyword === "string" ? candidate.keyword.trim() : "", // keyword 仅字符串
  }; // 返回 ParsedOutput
}

/**
 * 解析路由模型的文本输出：优先整段 JSON.parse；失败则尝试提取首个 {...} 子串再解析；
 * 仍失败则视为普通文本，action 固定为 chat。
 */
function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    return normalizeParsedOutput(JSON.parse(modelOutput), modelOutput); // 整段 JSON
  } catch {
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/); // 提取花括号片段
    if (jsonMatch) {
      try {
        return normalizeParsedOutput(JSON.parse(jsonMatch[0]), modelOutput); // 子串解析
      } catch {
        // ignore // 子串仍非法则继续兜底
      }
    }
    return { action: "chat", content: modelOutput, keyword: "" }; // 全文当聊天内容
  }
}

/** 去掉 Markdown 列表前缀「- 」并 trim，便于把多行字符串拆成记忆条目。 */
function normalizeContentLine(line: string): string {
  return line.replace(/^\s*-\s*/, "").trim(); // 去项目符号与空白
}

/** 无结构化 importance 时，用启发式正则猜测 high / low。 */
function inferImportanceFromText(text: string): MemoryImportance {
  const t = text.trim(); // 修剪输入
  if (HIGH_IMPORTANCE_PATTERN.test(t)) return "high"; // 命中高重要模式
  if (LOW_CHITCHAT_PATTERN.test(t)) return "low"; // 命中闲聊模式
  return "low"; // 默认低重要
}

/** 将旧版「单字符串 longTerm」按行拆成多条干净文本。 */
function splitMemoryLines(longTerm: string): string[] {
  return longTerm
    .split("\n") // 按行拆
    .map((line) => normalizeContentLine(line)) // 每行规范化
    .filter(Boolean); // 去空行
}

/** 估算当前长期条目占用的总字符数（用于判断是否触发压缩）。 */
function memoryItemsCharLength(items: MemoryItem[]): number {
  return items.reduce((sum, i) => sum + i.content.length, 0); // 累加每条 content 长度
}

/**
 * 在不超过 MAX_LONG_TERM_CHARS 的前提下尽量保留更多条目：
 * 先保留全部 high，再按顺序尝试加入 low；仍超长则粗暴截取末尾若干条。
 */
function trimMemoryItems(items: MemoryItem[]): MemoryItem[] {
  let joined = items.map((i) => `- ${i.content}`).join("\n"); // 序列化估算长度
  if (joined.length <= MAX_LONG_TERM_CHARS) return items; // 未超限直接返回
  const high = items.filter((i) => i.importance === "high"); // 高重要子集
  const low = items.filter((i) => i.importance === "low"); // 低重要子集
  let kept = [...high]; // 先放入全部 high
  for (const item of low) {
    const trial = [...kept, item]; // 尝试追加一条 low
    const s = trial.map((i) => `- ${i.content}`).join("\n"); // 试算长度
    if (s.length <= MAX_LONG_TERM_CHARS) kept = trial; // 未超限则接受
    else break; // 否则停止尝试更多 low
  }
  joined = kept.map((i) => `- ${i.content}`).join("\n"); // 重新序列化 kept
  if (joined.length <= MAX_LONG_TERM_CHARS) return kept; // 若已在限额内则返回
  return kept.slice(-Math.ceil(MAX_LONG_TERM_CHARS / 40)); // 否则粗暴保留尾部若干条
}

/**
 * 按内容（忽略大小写）去重；若同一内容既有 low 又有 high，保留 high。
 */
function dedupeMemoryItems(items: MemoryItem[]): MemoryItem[] {
  const map = new Map<string, MemoryItem>(); // 小写内容 -> 条目
  for (const item of items) {
    const key = item.content.trim().toLowerCase(); // 去重键
    const prev = map.get(key); // 已存在条目
    if (!prev || (prev.importance === "low" && item.importance === "high")) {
      map.set(key, item); // 覆盖或首次写入
    }
  }
  return Array.from(map.values()); // Map 转数组
}

/** 合并新旧长期条目后去重并按体积裁剪。 */
function appendMemoryItems(base: MemoryItem[], additions: MemoryItem[]): MemoryItem[] {
  return trimMemoryItems(dedupeMemoryItems([...base, ...additions])); // 合并→去重→裁剪
}

/**
 * 统一入口：优先读请求里的 items 数组；否则把 longTerm 字符串拆行并推断每条 importance。
 */
function normalizeIncomingMemoryPayload(payload?: IncomingMemoryPayload): MemoryItem[] {
  if (payload?.items && Array.isArray(payload.items)) {
    return payload.items
      .filter((i) => i && typeof i.content === "string" && i.content.trim()) // 过滤无效项
      .map((i) => ({
        content: i.content.trim(), // 修剪正文
        importance: i.importance === "high" ? "high" : "low", // 归一 importance
      })); // 映射为 MemoryItem
  }
  if (payload?.longTerm && typeof payload.longTerm === "string") {
    return splitMemoryLines(payload.longTerm).map((line) => ({
      content: line, // 每行一条
      importance: inferImportanceFromText(line), // 启发式重要度
    })); // 旧 longTerm 兼容
  }
  return []; // 无 payload 则空数组
}

/**
 * 将多条 MemoryItem 格式化为「- 内容」拼接块；可指定只输出某一 importance。
 */
function formatMemoryBlock(items: MemoryItem[], importance?: MemoryImportance): string {
  const filtered =
    importance !== undefined ? items.filter((i) => i.importance === importance) : items; // 可选过滤
  if (filtered.length === 0) return ""; // 无内容返回空串
  return filtered.map((i) => `- ${i.content}`).join("\n"); // 拼接 markdown 行块
}

/** 为 Planner 注入长期记忆（用 items 替代文档中的 longTerm 字段）。 */
function formatMemoryForPlanner(memory: Memory): string {
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆块（身份/目标等）
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 低优先级记忆块
  if (!highBlock && !lowBlock) return "(空)"; // 无任何长期记忆时返回占位说明
  return [
    highBlock ? `【高优先级记忆】\n${highBlock}` : "", // 有则注入高优区块
    lowBlock ? `【其他记忆】\n${lowBlock}` : "", // 有则注入其他区块
  ]
    .filter(Boolean) // 去掉空串避免多余换行
    .join("\n\n"); // 两段之间空一行拼接
}

/**
 * 构造「只做路由、不直接闲聊」的 system 提示词：要求模型仅输出一行 JSON。
 * 其中注入高/低优先级记忆块，便于识别省略语与「继续上次」类指令。
 */
function buildRoutingSystemPrompt(memory: Memory): string {
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆文本块
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 低优先级记忆文本块
  return `
你是一个路由助手，必须严格输出 JSON，不允许输出解释或 Markdown。
你必须结合「用户最新一轮输入」与下列「长期记忆」判断意图；省略语（如继续刚才的任务）必须依赖记忆补全语义。

【高优先级记忆】（身份/目标/偏好，路由时优先参考）
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}

任务（按意图选择 action）：
1) 用户问天气、气温、某城市天气 -> "weather"
2) 用户要总结、概括、归纳 -> "summary"
3) 用户要做计划、列待办、任务清单、或表达「继续刚才的待办/按上次计划」且记忆中存在目标/任务语境 -> "todo"
4) 普通闲聊 -> "chat"

特殊规则：
- 若用户说「继续/刚才/上次/那个任务/按计划/接着」且需要延续计划或任务拆解 -> 优先 "todo"
- 若用户明确要延续上文归纳、要点汇总 -> 优先 "summary"
- keyword：weather 时填城市或地区关键词；其它可为空

输出格式（仅一行 JSON）：
{"action":"chat|weather|summary|todo","content":"","keyword":""}
`.trim(); // 去掉首尾空白
}

/** 判断用户是否在用语境衔接词，需要结合记忆猜测真实意图。 */
const CONTINUATION_PATTERN = /继续|刚才|刚刚|上次|那个任务|按计划|接着|再来|跟上文|刚才那个/; // 延续话术

function isContinuationQuery(text: string): boolean {
  return CONTINUATION_PATTERN.test(text); // 是否命中延续模式
}

/**
 * 当路由模型仍返回 chat，但用户话术像「继续」且记忆中存在总结/待办语境时，
 * 强制升级为 summary 或 todo，减少误路由为闲聊。
 */
function resolveContinuationAction(latestUser: string, parsed: ParsedOutput, memory: Memory): Action {
  if (parsed.action !== "chat") return parsed.action; // 已非 chat 则不覆盖
  if (!isContinuationQuery(latestUser)) return parsed.action; // 非延续询问则不覆盖

  const memAll = memory.items.map((i) => i.content).join("\n"); // 全部记忆拼串
  const high = formatMemoryBlock(memory.items, "high"); // 高优先级记忆文本，用于检测任务/目标语境

  if (/总结|归纳|要点|摘要|上文/.test(latestUser)) return "summary"; // 用户明确总结词
  if (/待办|任务清单|清单|计划|todo/i.test(latestUser)) return "todo"; // 用户明确待办词

  if (/总结|归纳|要点/.test(memAll) && !/待办|任务|清单/.test(memAll)) return "summary"; // 记忆偏总结
  if (/待办|任务|清单|计划|目标/.test(high) || /待办|任务/.test(memAll)) return "todo"; // 记忆偏任务

  return "todo"; // 默认偏向待办延续
}

/**
 * 长期记忆过多时，用单独一轮模型调用把多条事实压缩成少量核心条目（仍带 importance）。
 * 请求失败则退化为去重 + trim 后截断。
 */
async function secondaryCompressItems(
  items: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  if (items.length === 0) return items; // 空则直接返回
  const existingHigh = formatMemoryBlock(items, "high"); // 原文高优先级块供模型保留语义
  const prompt = `
你是记忆压缩器。将下列记忆合并压缩为最多 ${MAX_COMPRESSED_ITEMS} 条核心事实。
要求：
1. 仅保留身份/目标/偏好/长期约束/关键任务方向
2. 去除重复与闲聊
3. 输出 JSON 数组，每项格式 {"content":"...","importance":"high"|"low"}
4. importance：身份/目标/长期计划为 high，其余为 low
5. 不要输出其它文字

高优先级原文（含义必须尽量保留）：
${existingHigh || "(无)"}

全部记忆条目：
${items.map((i) => `- ${i.content} [${i.importance}]`).join("\n")}
`; // 压缩提示词
  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用模型压缩
  if (!ok) return trimMemoryItems(dedupeMemoryItems(items)).slice(0, MAX_COMPRESSED_ITEMS); // 失败则退化截断
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw) as unknown; // 抽取数组 JSON
    if (!Array.isArray(parsed)) throw new Error("invalid"); // 非数组则失败
    const out: MemoryItem[] = []; // 输出缓冲
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法行
      const content = String((row as { content?: unknown }).content || "").trim(); // 读 content
      const importance =
        (row as { importance?: unknown }).importance === "high" ? "high" : "low"; // 读 importance
      if (content) out.push({ content, importance }); // 非空则收集
    }
    const deduped = dedupeMemoryItems(out); // 去重
    return deduped.slice(0, MAX_COMPRESSED_ITEMS); // 限制条数
  } catch {
    const lines = splitMemoryLines(raw).slice(0, MAX_COMPRESSED_ITEMS); // 解析失败则按行拆
    return lines.map((line) => ({
      content: line, // 行内容
      importance: inferImportanceFromText(line), // 推断重要度
    })); // 转为 MemoryItem
  }
}

/** 根据体积阈值决定是否触发 secondaryCompressItems，并最终 trim。 */
async function maybeEvolveMemoryItems(
  items: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  let next = dedupeMemoryItems(items); // 先去重
  const charLen = memoryItemsCharLength(next); // 当前字符总长
  if (charLen >= SECONDARY_COMPRESS_THRESHOLD_CHARS || next.length > 12) {
    next = await secondaryCompressItems(next, rt); // 超阈则二次压缩
  }
  return trimMemoryItems(next); // 最后裁剪体积
}

/**
 * 将被移出短期窗口的旧对话压缩成若干 MemoryItem，合并进长期记忆。
 * 用于在消息很长时把关键信息「沉淀」下来而不是直接丢弃。
 */
async function summarizeForMemory(
  oldMessages: ChatMessage[],
  existingItems: MemoryItem[],
  rt: ModelRuntime
): Promise<MemoryItem[]> {
  const dialogue = oldMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 格式化每轮
    .join("\n"); // 拼成对话文本

  const existingText = formatMemoryBlock(existingItems); // 已有长期条目文本块

  const prompt = `
请总结对话，用于长期记忆：

要求：
1. 只保留关键信息（身份 / 目标 / 偏好 / 约束）
2. 删除闲聊内容
3. 输出 JSON 数组，每项 {"content":"...","importance":"high"|"low"}
4. importance：身份/目标/偏好/长期约束为 high，否则 low
5. 不要重复已有事实

已有长期记忆：
${existingText || "(空)"}

待压缩对话：
${dialogue}
`; // 压缩旧对话的提示词

  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 请求模型输出 JSON 数组
  if (!ok) return []; // 失败返回空，由上层忽略
  try {
    const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw) as unknown; // 尝试解析数组
    if (!Array.isArray(parsed)) return []; // 非数组则空
    const out: MemoryItem[] = []; // 收集结果
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法项
      const content = String((row as { content?: unknown }).content || "").trim(); // content
      const importance =
        (row as { importance?: unknown }).importance === "high" ? "high" : "low"; // importance
      if (content) out.push({ content, importance }); // 收集
    }
    return out; // 返回结构化条目
  } catch {
    const lines = splitMemoryLines(raw); // JSON 失败则按行拆
    return lines.map((line) => ({
      content: line, // 行文本
      importance: inferImportanceFromText(line), // 推断重要度
    })); // 降级为行级 MemoryItem
  }
}

/**
 * 不调用模型：仅用正则从用户话术中抓取「自我介绍/目标」类句子，标记为 high。
 */
function extractRuleBasedMemory(messages: ChatMessage[]): MemoryItem[] {
  return messages
    .filter((m) => m.role === "user" && LONG_TERM_RULE_PATTERN.test(m.content)) // 仅用户且命中规则
    .map((m) => ({
      content: m.content.trim(), // 原文trim
      importance: "high" as MemoryImportance, // 规则命中视为高重要
    })); // 映射为条目
}

/**
 * 核心记忆管线：归一化入参 → 可选总结旧消息 → 规则抽取 → 可能二次压缩 →
 * 产出 Memory 与喂给后续聊天/路由用的 modelMessages（system 记忆块 + shortTerm）。
 */
async function buildMemory(
  incomingMessages: ChatMessage[],
  incomingMemory: IncomingMemoryPayload | undefined,
  rt: ModelRuntime
): Promise<{ memory: Memory; modelMessages: Array<{ role: string; content: string }> }> {
  let items = normalizeIncomingMemoryPayload(incomingMemory); // 解析入参记忆

  const shouldSummarize = incomingMessages.length > MAX_CONTEXT_MESSAGES; // 是否需压缩旧段
  const shortTerm = incomingMessages.slice(-SHORT_TERM_SIZE); // 保留尾部短期
  const oldMessages = shouldSummarize ? incomingMessages.slice(0, -SHORT_TERM_SIZE) : []; // 旧段待总结

  if (oldMessages.length > 0) {
    const summarized = await summarizeForMemory(oldMessages, items, rt); // 异步总结旧消息为条目
    items = appendMemoryItems(items, summarized); // 合并进长期
  }

  items = appendMemoryItems(items, extractRuleBasedMemory(incomingMessages)); // 合并规则抽取
  items = await maybeEvolveMemoryItems(items, rt); // 可能二次压缩并裁剪

  const memory: Memory = { shortTerm, items }; // 组装 Memory

  const highText = formatMemoryBlock(memory.items, "high"); // 高优先级块字符串
  const lowText = formatMemoryBlock(memory.items, "low"); // 低优先级块字符串
  const modelMessages: Array<{ role: string; content: string }> = []; // 模型消息数组
  if (highText || lowText) {
    modelMessages.push({
      role: "system", // system 注入长期记忆
      content: [
        highText ? `【高优先级长期记忆】\n${highText}` : "", // 高块
        lowText ? `【其他长期记忆】\n${lowText}` : "", // 低块
      ]
        .filter(Boolean) // 去掉空串
        .join("\n\n"), // 合并为一条 system
    }); // push system
  }
  modelMessages.push(...memory.shortTerm); // 追加短期对话
  return { memory, modelMessages }; // 返回记忆与模型输入
}

/**
 * 从用户或 keyword 字段里解析城市名：先完整匹配 cityMap 键，再对清理后的串做子串匹配。
 */
function extractWeatherCity(text: string): string {
  const trimmed = text.trim(); // 修剪
  if (!trimmed) return ""; // 空则空城市
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) return city; // 原文包含城市名
  }
  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "") // 去标点
    .replace(/\s+/g, "") // 去空白
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "") // 去查询动词
    .replace(/天气预报|天气情况|天气|温度|气温/g, "") // 去天气关键词
    .replace(/的/g, ""); // 去「的」
  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) return city; // 清洗后再匹配
  }
  return cleaned; // 返回清洗串供错误提示
}

/** 取最近一条 user 消息的文本，供路由与工具缺省输入使用。 */
function getLatestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || ""; // 逆序找 user
}

/**
 * 当路由把 action 判为 chat 但 content 为空时，用完整 modelMessages 再走一轮普通对话。
 */
async function generateFallbackChat(
  messages: Array<{ role: string; content: string }>,
  rt: ModelRuntime
): Promise<string> {
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system", // 第二轮聊天人设
      content: "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。", // 禁止 JSON
    },
    ...messages, // 带上完整上下文（含 system 记忆块）
  ]); // 调用模型
  if (!ok) return "抱歉，我现在暂时无法正常回答，请稍后再试。"; // HTTP 失败
  return text || "抱歉，我现在暂时无法正常回答，请稍后再试。"; // 空内容兜底
}

/** 总结工具：取最近若干轮对话拼成文本；若无则退回路由给出的 fallback。 */
function pickSummaryContext(messages: ChatMessage[], fallbackText: string): string {
  const recent = messages.slice(-6); // 最近 6 条
  const context = recent
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 角色前缀
    .join("\n"); // 多行文本
  return context || fallbackText; // 空则用 fallback
}

/** summary 分支：按固定格式生成要点列表，并注入高优先级记忆作为目标参考。 */
async function summarizeWithModel(
  messages: ChatMessage[],
  fallbackText: string,
  memory: Memory,
  rt: ModelRuntime,
  chainPrefix?: string
) {
  let content = pickSummaryContext(messages, fallbackText); // 选定总结输入
  if (chainPrefix) {
    content = `${chainPrefix}\n\n${content}`; // 工作流场景：把前置步骤输出拼在对话上下文前
  }
  const memHint = formatMemoryBlock(memory.items, "high"); // 高优先级记忆提示
  const prompt = `
请总结以下对话，要求：
1. 提取关键信息
2. 用 3-5 条要点表达
3. 输出格式为纯文本项目符号，每行以"- "开头
4. 最后一行给出"结论："和"下一步："
5. 可参考用户长期目标（若有）：
${memHint || "(无)"}

对话：
${content}
`; // 总结提示词
  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 调用模型
  if (!ok) {
    return "总结失败：模型暂时不可用，请稍后重试。"; // 模型不可用
  }
  return text || "总结失败：未获取到有效结果。"; // 空正文兜底
}

/** 尝试把模型输出解析为 TodoItem[]（严格 JSON 数组）；失败返回 null。 */
function parseTodoItemsFromText(raw: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(raw); // 解析 JSON
    if (!Array.isArray(parsed)) return null; // 非数组失败
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null; // 跳过非对象
        const task =
          typeof (item as { task?: unknown }).task === "string"
            ? (item as { task: string }).task.trim() // task 字符串
            : ""; // 否则空
        const done = Boolean((item as { done?: unknown }).done); // done 布尔化
        if (!task) return null; // 无 task 丢弃
        return { task, done }; // 合法 TodoItem
      })
      .filter((v): v is TodoItem => Boolean(v)); // 过滤 null
    return todos.length > 0 ? todos : null; // 无有效项则 null
  } catch {
    return null; // 解析异常
  }
}

/**
 * todo 分支：结合用户当前输入与长期记忆生成个性化任务列表；
 * 解析失败时使用内置占位任务，保证前端总能渲染出列表。
 */
async function generateTodosWithModel(args: {
  userInput: string;
  memory: Memory;
  rt: ModelRuntime;
  /** 非依赖模式下的线性前置输出（无前述 dependsOn 时使用）。 */
  chainPrefix?: string;
  /** 显式 dependsOn：与 chainPrefix 二选一优先；prompt 采用「依赖结果 + 当前任务」结构。 */
  dependencyContext?: string;
}): Promise<TodoItem[]> {
  const { userInput, memory, chainPrefix, dependencyContext, rt } = args; // 解构参数
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆块
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 其他记忆块

  const dep = dependencyContext?.trim(); // 显式依赖链上下文：来自 dependsOn 步骤的成功输出拼接
  const linear = !dep && chainPrefix?.trim() ? chainPrefix.trim() : ""; // 无依赖时：用线性前置步骤输出作弱上下文

  const workflowBlock =
    dep
      ? `请基于以下内容生成待办（必须结合依赖步骤结果）：\n\n【依赖步骤结果】\n${dep}\n\n【当前任务】\n${userInput}\n` // 依赖模式：把依赖结果与用户本步任务一并写进提示
      : linear
        ? `\n【前置步骤输出】\n${linear}\n\n` // 线性模式：仅追加「前置输出」段，结构较松
        : ""; // 既无依赖也无前置：不注入额外工作流块

  const prompt = dep
    ? `
${workflowBlock}
要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 至少返回 3 项；待办须紧密承接「依赖步骤结果」与「当前任务」，避免与上文无关的通用模板
5. 不要输出任何解释

【高优先级记忆】
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}
`.trim()
    : `
请根据用户输入与长期记忆生成个性化待办事项。
要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 至少返回 3 项；内容须体现用户的身份/目标（若有），避免通用空话模板
5. 不要输出任何解释

【高优先级记忆】
${highBlock || "(空)"}

【其他记忆】
${lowBlock || "(空)"}
${workflowBlock}用户输入：
${userInput}
`; // 待办生成提示词；依赖模式用独立结构，否则沿用线性前置段
  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 请求模型
  if (!ok) {
    return [
      { task: "对照记忆澄清本周目标与交付物", done: false }, // 占位 1
      { task: "拆解关键任务并设定验收标准", done: false }, // 占位 2
      { task: "执行并复盘，更新进度", done: false }, // 占位 3
    ]; // 失败静态列表
  }
  const fromDirect = parseTodoItemsFromText(raw); // 整体 JSON 解析
  if (fromDirect) return fromDirect; // 成功则返回

  const wrapped = raw.match(/\[[\s\S]*\]/)?.[0]; // 抽取数组子串
  const fromWrapped = wrapped ? parseTodoItemsFromText(wrapped) : null; // 子串解析
  if (fromWrapped) return fromWrapped; // 成功则返回

  return [
    { task: "结合记忆细化当前优先事项", done: false }, // 二级兜底 1
    { task: "推进主线任务并记录阻塞点", done: false }, // 二级兜底 2
    { task: "阶段性复盘并调整后续步骤", done: false }, // 二级兜底 3
  ]; // 最终静态兜底
}

/** 第15天：工作流 action 白名单集合（必须与 executeWorkflow switch 四分支持平）。 */
const WORKFLOW_ALLOWED_ACTIONS: ReadonlySet<WorkflowStepAction> = new Set([
  "chat", // 普通对话分支
  "summary", // 归纳总结分支
  "todo", // 待办生成分支
  "weather", // 固定城市天气查询分支
]); // WORKFLOW_ALLOWED_ACTIONS 常量结束

/** 第15天：当步骤本体未给出 retry 字段时采用的默认「失败后可追加尝试次数」（不含首轮）。 */
const WORKFLOW_DEFAULT_STEP_RETRIES = 2; // 等价于首轮 + 最多 2 次重试，共 3 次机会

/** Planner 输出的单步草案（可为每步提供稳定 id 与依赖 id 列表）。 */
type PlannerPlanItem = {
  /** Planner 可选输出；缺省时由服务端分配 step-1 / step-2… */
  id?: string;
  name: string; // 步骤展示名
  action: WorkflowStepAction; // 工具枚举
  input: string; // 送入工具的字符串（已由 normalizePlannerStepInput 规范）
  /** 需要其输出的前置步骤 id（与 WorkflowStep.id 对齐）。 */
  dependsOn?: string[];
};

/** finalizePlannerPlanItems 之后每条步骤均有稳定 id（用于 dependsOn）。 */
type FinalizedPlannerPlanItem = Omit<PlannerPlanItem, "id"> & { id: string };

/**
 * Planner 有时会把 input 写成对象（如 { city: "北京" }）；直接 String(obj) 会得到 "[object Object]"。
 * 这里优先抽取常见字段，否则 JSON 序列化，保证下游天气解析与前端展示可读。
 */
function normalizePlannerStepInput(raw: unknown): string {
  if (raw == null) return ""; // null/undefined 视为无输入
  if (typeof raw === "string") return raw.trim(); // 字符串直接裁剪空白
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw); // 标量转成可读字符串
  if (Array.isArray(raw)) {
    try {
      return JSON.stringify(raw); // 数组整体 JSON 化，避免 [object Object]
    } catch {
      return ""; // 序列化失败则空串
    }
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>; // 断言为字典便于按键取值
    const preferKeys = [
      // 常见「自然语言入口」字段名，优先抽到可展示/可传给工具的字符串
      "city",
      "location",
      "place",
      "keyword",
      "query",
      "content",
      "text",
      "prompt",
      "input",
      "description",
    ];
    for (const key of preferKeys) {
      const v = o[key]; // 读取候选键对应的值
      if (typeof v === "string" && v.trim()) return v.trim(); // 首个非空字符串即作为步骤 input
    }
    try {
      return JSON.stringify(o); // 无常见键则整体 JSON（仍优于 [object Object]）
    } catch {
      return ""; // stringify 异常则退回空
    }
  }
  return String(raw).trim(); // 其余类型统一 toString 再 trim
}

/** 解析 Planner 返回的 JSON 数组（允许多级容错）。 */
function parsePlannerPlanOutput(modelOutput: string): PlannerPlanItem[] {
  try {
    const parsed = JSON.parse(modelOutput) as unknown; // 尝试整段解析为 JSON
    if (!Array.isArray(parsed)) return []; // 非数组失败
    const out: PlannerPlanItem[] = []; // 累积合法步骤
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue; // 跳过非法元素
      const idRaw = (row as { id?: unknown }).id; // Planner 可选提供的步骤 id（原始未知类型）
      const idCandidate = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : undefined; // 仅非空字符串才采纳，否则留 undefined 待 finalize 补全
      const depRaw = (row as { dependsOn?: unknown }).dependsOn; // 依赖 id 列表的原始值
      const dependsOn = Array.isArray(depRaw)
        ? depRaw
            .filter((d): d is string => typeof d === "string" && d.trim().length > 0) // 过滤掉非字符串与空串
            .map((d) => d.trim()) // 统一去掉首尾空白，避免依赖匹配失败
        : []; // 非数组则视为无依赖
      const name = String((row as { name?: unknown }).name || "").trim() || "步骤"; // 步骤名
      const input = normalizePlannerStepInput((row as { input?: unknown }).input); // 步骤输入（兼容对象）
      const action = normalizeWorkflowAction((row as { action?: unknown }).action); // 动作
      out.push({
        id: idCandidate,
        name,
        action,
        input: input || name,
        dependsOn: dependsOn.length ? dependsOn : undefined,
      }); // 缺 input 时用 name 占位
    }
    return out; // 返回解析结果
  } catch {
    const jsonMatch = modelOutput.match(/\[[\s\S]*\]/); // 抽取首个数组片段
    if (jsonMatch) {
      return parsePlannerPlanOutput(jsonMatch[0]); // 递归解析子串
    }
    return []; // 完全失败
  }
}

/** 补全 Planner 步骤的稳定 id，并裁剪 dependsOn 中不存在的引用。 */
function finalizePlannerPlanItems(items: PlannerPlanItem[]): FinalizedPlannerPlanItem[] {
  const withIds: FinalizedPlannerPlanItem[] = items.map((it, i) => ({
    ...it, // 保留 name/action/input/dependsOn 等字段
    id: it.id ?? `step-${i + 1}`, // Planner 未给 id 时用 1-based 稳定缺省名
  })); // 第一轮：保证每条都有字符串 id
  const used = new Set<string>(); // 记录已占用的 id，用于检测冲突
  for (let i = 0; i < withIds.length; i++) {
    let id = withIds[i].id; // 当前步骤 id（可能被改写）
    if (used.has(id)) {
      id = `step-${i + 1}-${globalThis.crypto.randomUUID().slice(0, 8)}`; // 冲突则追加短随机后缀，保证全局唯一
      withIds[i] = { ...withIds[i], id }; // 写回修正后的 id
    } // 冲突处理结束
    used.add(id); // 登记当前 id 为已使用
  } // for 遍历所有步骤
  const idSet = new Set(withIds.map((x) => x.id)); // 合法 id 集合，用于裁剪无效 dependsOn
  return withIds.map((it) => ({
    ...it, // 展开步骤其它字段
    dependsOn: it.dependsOn?.filter((d) => idSet.has(d)), // 去掉指向不存在步骤的依赖边，避免执行器找不到 dep
  })); // 返回最终可执行的计划项
}

/** 按 dependsOn 拓扑排序步骤（同一 DAG 仍保持深度优先相对稳定）。 */
function topologicalSortWorkflowSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map((s) => [s.id, s])); // id -> 步骤对象，便于 O(1) 查依赖
  const visiting = new Set<string>(); // DFS 栈上的节点：用于环检测
  const done = new Set<string>(); // 已完成访问并入序的节点
  const ordered: WorkflowStep[] = []; // 拓扑序结果（依赖在前）

  function visit(step: WorkflowStep): void {
    if (done.has(step.id)) return; // 已排序过则跳过
    if (visiting.has(step.id)) {
      console.warn("[Workflow] dependency cycle at step:", step.id); // 环：依赖指向了正在访问的祖先
      return; // 环上节点不再深入，避免无限递归
    } // 环检测分支结束
    visiting.add(step.id); // 标记进入当前子 DAG
    for (const depId of step.dependsOn ?? []) {
      const dep = byId.get(depId); // 解析依赖 id 到步骤；非法 id 则 dep 为 undefined
      if (dep) visit(dep); // 先递归访问所有依赖
    } // 依赖循环结束
    visiting.delete(step.id); // 回溯：离开当前节点子树
    done.add(step.id); // 标记本节点已完成
    ordered.push(step); // 后序追加：保证依赖先于当前步出现在 ordered 中
  } // visit 定义结束

  for (const s of steps) visit(s); // 对每个根/孤立节点启动 DFS，覆盖全图

  if (ordered.length < steps.length) {
    for (const s of steps) {
      if (!done.has(s.id)) ordered.push(s); // 环或脏依赖导致未入序的步骤，按原列表顺序追加兜底
    } // 补全循环结束
  } // 长度不一致时的修复
  return ordered; // 返回可能含「末尾兜底块」的执行顺序
}

/** 第15天：Kahn 拓扑思想检测 dependsOn 图是否无环，并产出一个可行的 id 拓扑序（仅用于 validate，不替代执行器排序实现）。 */
function kahnWorkflowTopology(steps: WorkflowStep[]): {
  acyclic: boolean; // true 表示所有节点都能被 Kahn 弹出（即无环）
  topoOrder: string[]; // Kahn 过程中弹出的 id 顺序（可作为合法执行序参考）
  errors: string[]; // 若发现环则返回包含中文说明的错误列表（通常仅一条）
} {
  const idSet = new Set(steps.map((s) => s.id)); // 当前所有步骤 id 的快照集合，用于过滤非法依赖边
  const inDegree = new Map<string, number>(); // 每个节点入度：有多少条来自有效 dependsOn 的入边
  const adj = new Map<string, string[]>(); // 邻接表：fromId -> [toId,...]，语义为 to 依赖 from，必须先完成 from
  for (const s of steps) {
    inDegree.set(s.id, 0); // 初始化入度为 0，后续仅对有效边累加
    adj.set(s.id, []); // 初始化空邻接表桶，避免 get 时 undefined
  } // 初始化 for 结束
  for (const s of steps) {
    for (const depId of s.dependsOn ?? []) {
      if (!idSet.has(depId)) continue; // 指向不存在 id 的边在这里忽略（其它校验会单独报「引用不存在」）
      inDegree.set(s.id, (inDegree.get(s.id) ?? 0) + 1); // s 依赖 depId：depId 完成后 s 入度应记一条来自 dep 的约束
      const bucket = adj.get(depId)!; // depId 出发的后继列表（必然存在，因 depId 必为某步 id）
      bucket.push(s.id); // 记录边 depId -> s.id
    } // 依赖循环结束
  } // 构图 for 结束
  const queue: string[] = []; // 入度为 0 的节点队列（可立即执行的步骤 id）
  for (const s of steps) {
    if ((inDegree.get(s.id) ?? 0) === 0) queue.push(s.id); // 没有任何有效入边的节点先入队
  } // 初始队列构建结束
  const topoOrder: string[] = []; // 记录被弹出顺序，用于与 steps.length 对比判断是否全部处理
  while (queue.length > 0) {
    const cur = queue.shift()!; // 取出一个当前可执行节点 id
    topoOrder.push(cur); // 写入拓扑序输出
    for (const nxt of adj.get(cur) ?? []) {
      const nextDeg = (inDegree.get(nxt) ?? 0) - 1; // 去掉 cur->nxt 这条约束后 nxt 入度减一
      inDegree.set(nxt, nextDeg); // 写回更新后的入度
      if (nextDeg === 0) queue.push(nxt); // 新变成可执行的节点入队
    } // 扩展后继循环结束
  } // Kahn 主循环结束
  const acyclic = topoOrder.length === steps.length; // 若弹出数量不足说明剩余子图入度均非 0（典型为有环）
  const errors: string[] = []; // 错误收集器
  if (!acyclic) errors.push("检测到步骤 dependsOn 存在循环依赖（DAG 不成立，拒绝执行）"); // 环的中文解释
  return { acyclic, topoOrder, errors }; // 返回三元组供 validateWorkflow 消费
} // kahnWorkflowTopology 函数结束

/** 第15天：将 Planner/中间态工作流在进入 execute 前做静态校验，输出可展示的分条错误列表。 */
function validateWorkflow(workflow: Workflow): { ok: boolean; errors: string[] } {
  const errors: string[] = []; // 累积全部问题，最终一次性返回给调用方
  const steps = workflow.steps; // 局部别名减少重复属性访问
  if (steps.length === 0) errors.push("工作流 steps 为空：至少需要一个可执行步骤"); // 空工作流直接非法
  const seenIds = new Set<string>(); // 用于判断是否出现重复 id
  for (const s of steps) {
    const idOk = typeof s.id === "string" && s.id.trim().length > 0; // id 必须是 Trim 后仍非空的字符串
    if (!idOk) errors.push("存在步骤 id 为空或缺失：必须为稳定非空字符串"); // 指明 id 必要条件
    else if (seenIds.has(s.id)) errors.push(`步骤 id 重复：${s.id}`); // 重复 id 会导致 dependsOn 二义性
    else seenIds.add(s.id); // 记录首次出现的 id
  } // id 遍历结束
  const idSet = new Set(steps.map((x) => x.id)); // 重新基于当前 steps 构造 id 集合用于依赖存在性校验
  for (const s of steps) {
    if (!WORKFLOW_ALLOWED_ACTIONS.has(s.action)) errors.push(`步骤 ${s.id} 的 action 不在白名单内：${String(s.action)}`); // 与 Executor 支持动作对齐
  } // action 遍历结束
  for (const s of steps) {
    for (const depId of s.dependsOn ?? []) {
      if (!idSet.has(depId)) errors.push(`步骤 ${s.id} 的 dependsOn 引用不存在的步骤 id：${depId}`); // 非法引用必须显性报错
    } // 每条依赖扫描结束
  } // dependsOn 外层循环结束
  const cycle = kahnWorkflowTopology(steps); // 计算 DAG 合法性（与 dependsOn 边方向一致）
  if (!cycle.acyclic) errors.push(...cycle.errors); // 将判环阶段的错误并入总表
  const ok = errors.length === 0; // 仅当无任何分条问题时认为 ok
  return { ok, errors }; // 返回摘要供 POST 决定是否短路
} // validateWorkflow 函数结束

/** 第15天：将漂移的 action 字符串尽可能映射回 Executor 识别的四类工具枚举值。 */
function repairWorkflowActionAlias(raw: WorkflowStepAction): WorkflowStepAction {
  const key = String(raw).trim().toLowerCase(); // 统一成小写字符串，弱化大小写噪声
  const table: Record<string, WorkflowStepAction> = {
    summarize: "summary", // 常见动词变体
    summarise: "summary", // 英式拼写兼容
    summaries: "summary", // 复数误识别
    todos: "todo", // Planner 可能的复数形式
    tasks: "todo", // 「任务清单」漂移成 tasks
    task: "todo", // 「任务」漂移成 task
    forecast: "weather", // 预报语义映射到固定天气工具链
    meteo: "weather", // meteorology 缩写式漂移
    climate: "weather", // 「气候天气」漂移
    search: "weather", // 与单步路由一致：search≈weather
  }; // 别名表字面量结束
  if (table[key]) return table[key]!; // 命中表项则立即返回映射后的枚举
  return normalizeWorkflowAction(raw); // 未命中再走第14天的归一入口，保证至少落在四象限动作里
} // repairWorkflowActionAlias 函数结束

/** 第15天：过滤 dependsOn 中引用不存在步骤 id 的边，避免出现悬挂依赖指针。 */
function repairWorkflowFilterDependsOn(step: WorkflowStep, all: WorkflowStep[]): string[] | undefined {
  const ids = new Set(all.map((x) => x.id)); // 有效 id 全集
  const raw = step.dependsOn ?? []; // 原始依赖数组；undefined 等价于无依赖
  const next = raw.filter((x) => ids.has(x)); // 仅保留指回真实存在的步骤 id
  return next.length > 0 ? next : undefined; // 若无任何有效依赖边则删掉整个字段语义（返回 undefined）
} // repairWorkflowFilterDependsOn 函数结束

/** 第15天：若出现重复步骤 id，则保留首次出现并逐步为后续同名 id 重写为带随机后缀的稳定值，尽量不破坏 dependsOn（仍指向「首次 id」语义）。 */
function repairWorkflowDuplicateStepIds(steps: WorkflowStep[]): WorkflowStep[] {
  const used = new Set<string>(); // 记录已经出现过的字符串 id，用于检测碰撞
  return steps.map((s, idx) => {
    let nextId = s.id; // 默认沿用原 id
    if (!nextId.trim() || used.has(nextId)) {
      nextId = `step-${idx + 1}-${globalThis.crypto.randomUUID().slice(0, 8)}`; // 空或碰撞则重写为可读前缀加随机尾
    } // 碰撞分支结束
    used.add(nextId); // 登记新的最终 id
    return { ...s, id: nextId }; // 返回带新 id 的步骤浅拷贝
  }); // map 结束
} // repairWorkflowDuplicateStepIds 函数结束

/** 第15天：按 Planner 原始数组顺序做启发式：若 todo 未写 dependsOn 且前面出现过 summary，则把它链接到最近 summary。 */
function repairWorkflowHeuristicTodoDependsOnSummary(steps: WorkflowStep[]): WorkflowStep[] {
  const out: WorkflowStep[] = steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 同样避免「dependsOn: undefined」键污染推断
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 有依赖才保留 dependsOn
  }); // clone 映射结束
  let lastSummaryId: string | undefined = undefined; // 维护「最近一次 summary 步骤 id」指针
  for (let i = 0; i < out.length; i++) {
    const cur = out[i]!; // 当前遍历到的步骤别名，非空断言因 i 合法
    if (cur.action === "summary") lastSummaryId = cur.id; // summary：更新最近一次总结指针
    if (cur.action !== "todo") continue; // 非 todo 步骤跳过本题启发式
    const hasDeps = (cur.dependsOn?.length ?? 0) > 0; // 若已存在依赖则不强行覆盖 Planner 语义
    if (hasDeps) continue; // 尊重显式 DAG
    if (!lastSummaryId) continue; // 若没有前置 summary，本启发式不适用
    cur.dependsOn = [lastSummaryId]; // 显式补上「todo 依赖最近一次 summary」的边（常见业务链）
  } // for i 扫描结束
  return out; // 返回可能已经补依赖的数组
} // repairWorkflowHeuristicTodoDependsOnSummary 函数结束

/** 第15天：贪心删边消解环——每次判环失败后从末尾往前挑仍带 dependsOn 的步骤清空其 dependsOn，直到 Kahn 通过。 */
function repairWorkflowBreakCyclesIfNeeded(steps: WorkflowStep[]): WorkflowStep[] {
  const draft: WorkflowStep[] = steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 解构剥离 dependsOn，后续选择性加回
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 仅复制真实存在的依赖数组
  }); // clone 结束
  while (true) {
    const { acyclic } = kahnWorkflowTopology(draft); // 重新评估是否已成为 DAG
    if (acyclic) break; // 已 DAG 则结束修复
    const victim = [...draft].reverse().find((x) => (x.dependsOn?.length ?? 0) > 0); // 末尾优先挑仍带依赖的牺牲步
    if (!victim) break; // 理论不应发生：全员无依赖仍判环则可能数据异常；直接停下避免死循环
    const { dependsOn: _rm, ...restVictim } = victim; // 通过解构删除依赖字段：比写 undefined 更符合可选键语义
    Object.assign(victim, { ...restVictim }); // 就地写回无 dependsOn 的 victim 对象（保持数组引用稳定）
  } // while true 修复结束
  return draft; // 返回可能变薄依赖图的新步骤数组
} // repairWorkflowBreakCyclesIfNeeded 函数结束

/** 第15天：AUTO REPAIR：在规则允许的范围内重写 steps，使常见 Planner 漂移转为可校验结构。 */
function repairWorkflow(workflow: Workflow): Workflow {
  let steps: WorkflowStep[] = workflow.steps.map((s) => {
    const { dependsOn: _oldDeps, ...rest } = s; // 解构去掉旧 dependsOn，避免写出「显式 undefined 键」触发 TS 奇怪推断
    return s.dependsOn?.length ? { ...rest, dependsOn: [...s.dependsOn] } : { ...rest }; // 有依赖才挂 dependsOn 字段，保持可选键语义
  }); // map 拷贝结束
  steps = repairWorkflowDuplicateStepIds(steps); // 先解决 id 碰撞与空白 id（保证后续校验可定位）
  steps = steps.map((s) => ({
    ...s, // 展开旧字段
    action: repairWorkflowActionAlias(s.action), // 归一 action 拼写/别名
  })); // action 修复 map 结束
  steps = steps.map((s) => {
    const nextDeps = repairWorkflowFilterDependsOn(s, steps); // 计算过滤后的依赖数组或 undefined
    const { dependsOn: _drop, ...rest } = s; // 丢掉旧依赖键，准备按「有则写入无则省略」重建对象
    return nextDeps?.length ? { ...rest, dependsOn: nextDeps } : { ...rest }; // 仅非空依赖才展开 dependsOn 属性
  }); // 依赖过滤 map 结束
  steps = repairWorkflowHeuristicTodoDependsOnSummary(steps); // 尝试自动补「summary→todo」链
  steps = repairWorkflowBreakCyclesIfNeeded(steps); // 若仍因环非法，则删边直到无环
  return { ...workflow, steps }; // 返回带新 steps 的工作流对象（status 等其它字段保持原样）
} // repairWorkflow 函数结束

/** 第15天：与文档命名对齐的 topologicalSort API，内部直接复用第14天 DFS 版实现，避免两套排序不一致。 */
function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  return topologicalSortWorkflowSteps(steps); // 委托：仍使用依赖图 + 环兜底策略
} // topologicalSort 包装结束

/** 聚合依赖步骤的成功输出为一段注入文本（供下游工具 prompt 使用）。 */
function formatDependencyOutputsForStep(
  step: WorkflowStep,
  byId: Map<string, WorkflowStep>
): string {
  const ids = step.dependsOn ?? []; // 本步骤声明依赖的步骤 id 列表
  if (ids.length === 0) return ""; // 无依赖：下游工具不需要注入其它步输出
  const parts: string[] = []; // 收集每段「步骤名 + 输出正文」
  for (const depId of ids) {
    const dep = byId.get(depId); // 按 id 取依赖步骤运行时对象
    if (!dep || dep.status !== "success") continue; // 未执行或失败：不参与拼接，避免把错误混进 prompt
    const body = typeof dep.output === "string" ? dep.output : JSON.stringify(dep.output ?? ""); // 统一成可嵌入提示的字符串
    parts.push(`【${dep.name}】（id: ${depId}）\n${body}`); // 带可读标题与 id，便于模型区分来源
  } // 遍历依赖 id
  return parts.join("\n\n"); // 多段之间空行分隔，结构更清晰
}

/** Workflow Planner：把用户复杂需求拆成 1-4 个可执行步骤。 */
async function planWorkflowSteps(
  userInput: string,
  memory: Memory,
  rt: ModelRuntime
): Promise<FinalizedPlannerPlanItem[]> {
  const memText = formatMemoryForPlanner(memory); // 长期记忆文本（供 Planner 结合语境拆步）
  const plannerPrompt = `
你是一个 Workflow Planner。

请把用户需求拆解成 2-4 个可执行步骤（若需求很简单则只返回 1 个步骤）。

可用 action：
- chat：普通回答
- summary：总结内容
- todo：生成待办
- weather：查询天气

要求：
1. 只返回 JSON 数组
2. 每个步骤必须包含：id（稳定唯一，如 "step-1" / "step-2"）、name、action、input；input 必须是字符串（天气步骤写城市名或含城市名的短句，如「北京」），不要嵌套 JSON 对象
3. 若某一步需要「直接使用」前面某一步的产出，请在该步骤上增加 dependsOn 数组，值为依赖步骤的 id 列表。例如先总结再基于总结生成待办：summary 的 id 为 step-1，todo 写 "dependsOn": ["step-1"]
4. 不要输出解释

用户需求：
${userInput}

长期记忆：
${memText}
`.trim(); // 去掉提示词首尾空白，减少模型多余输出

  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: plannerPrompt }]); // 调用模型生成步骤 JSON
  if (!ok) {
    return finalizePlannerPlanItems([{ name: "理解与回应", action: "chat", input: userInput }]); // 模型不可用：单步 chat 兜底
  }
  const trimmedRaw = raw.trim(); // 去掉模型输出首尾空白
  const steps = parsePlannerPlanOutput(trimmedRaw); // 解析为 PlannerPlanItem 列表
  if (steps.length === 0) {
    return finalizePlannerPlanItems([{ name: "理解与回应", action: "chat", input: userInput }]); // 解析不到步骤则同样单步兜底
  }
  return finalizePlannerPlanItems(steps); // 返回规划结果供执行器消费
}

/** workflow 中的 chat 步骤：可串联前置步骤文本。 */
async function runWorkflowChat(
  stepInput: string,
  chainPrefix: string | undefined,
  memory: Memory,
  rt: ModelRuntime
): Promise<string> {
  const userContent = [chainPrefix ? `前置步骤输出：\n${chainPrefix}` : "", `当前任务：\n${stepInput}`]
    .filter(Boolean) // 无前缀时只保留「当前任务」段
    .join("\n\n"); // 拼接成单条 user 消息正文
  const memText = formatMemoryForPlanner(memory); // 记忆参考（注入 system）
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system", // 系统人设 + 长期记忆约束
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`, // 禁止 JSON，附带记忆块
    },
    { role: "user", content: userContent }, // 用户侧：前置输出 + 本步任务描述
  ]); // 单轮补全完成该 chat 步骤
  if (!ok) return "该步骤失败：模型暂不可用。"; // HTTP/业务失败时的固定中文提示
  return text || "（无输出）"; // 成功但空正文则占位
}

/** 将整个 user 正文一次性交给模型（依赖链场景下已内含【依赖步骤结果】等结构化段落）。 */
async function runWorkflowChatDirect(
  fullUserBody: string,
  memory: Memory,
  rt: ModelRuntime
): Promise<string> {
  const memText = formatMemoryForPlanner(memory); // 与 runWorkflowChat 一致：把高/低记忆格式化为 Planner 可读块
  const { ok, text } = await invokeChatModel(rt, [
    {
      role: "system", // 系统层：人设 + 长期记忆约束
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`, // 禁止 JSON，降低被上游路由提示污染的概率
    }, // system 消息结束
    { role: "user", content: fullUserBody }, // 用户层：整段已含「依赖结果 + 当前任务」结构化正文
  ]); // 单轮补全
  if (!ok) return "该步骤失败：模型暂不可用。"; // 与 runWorkflowChat 对齐的固定失败文案
  return text || "（无输出）"; // 成功但空串则给占位，避免 undefined 泄漏到前端
}

/** 将各步成功产出整理为单一、自然的中文最终答复（Workflow Final Synthesizer）。 */
async function synthesizeWorkflowResult(workflow: Workflow, rt: ModelRuntime): Promise<string> {
  const ordered = topologicalSort(workflow.steps); // 第15天：与 Executor 一致走同名 topologicalSort 封装（仍基于 DAG）
  const lines = ordered
    .filter((s) => s.status === "success") // 只汇总成功的步骤
    .map((s) => {
      const out =
        typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""); // 序列化输出：对象则 JSON，字符串原样
      return `【步骤 ${s.name}】（${s.action}，id=${s.id}）\n${out}`; // 含 id 便于排障（模型可忽略括号内信息）
    }) // map 结束
    .join("\n\n"); // 步骤块之间双换行

  const prompt = `
你是 Workflow 最终汇总助手。

请把以下 workflow 的执行结果整合成一篇「自然、连贯、完整」的中文最终回答给用户。
不要使用「第一步 / 第二步」式的机械分段标题；让读者感觉是一个助手的一次性答复。
若结果是待办或要点，可适当保留可读列表，但整体语气要统一。

以下为各步骤产出。

${lines || "(无成功步骤产出)"}

请直接输出正文，不要 JSON。
`.trim(); // 与文档“自然完整最终回答”一致

  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 仅 user 提示：由模型复读并润色为多步合一答复
  if (!ok) return lines || "工作流已完成。"; // 汇总模型失败：退回结构化步骤拼接文本或短句占位
  return text?.trim() || lines || "工作流已完成。"; // 优先模型润色正文，否则仍为步骤罗列或保底句
}

/**
 * 第15天增强顺序执行 workflow：拓扑序仍为 DAG-first；注入与线性前缀策略与 Day14 相同；
 * 另增加步骤级 retry 与 Timeline 打点，面向「Runtime 工程化」可观测性与恢复能力。
 */
async function executeWorkflow(
  workflow: Workflow, // 当前要执行并可被就地回填状态的工作流对象引用
  memory: Memory, // 本轮记忆快照：供 summary/todo/chat 读取 shortTerm/items
  rt: ModelRuntime, // Ollama 或 MiMo 的运行时密钥与模型路由信息
  execOpts: { timeline: WorkflowTimelineEvent[]; defaultStepRetries: number } // 第15天时间线缓冲与全局默认额外重试次数
): Promise<Workflow> {
  let linearPriorOutputs = ""; // 已执行步骤的线性串联文本（Planner 漏写 dependsOn 时的容错上下文）
  const byId = new Map(workflow.steps.map((s) => [s.id, s])); // id→可变步骤指针，写入 output/status/duration/error
  const ordered = topologicalSort(workflow.steps); // 严禁按 Planner 数组盲跑：统一走 topologicalSort DAG 排序
  const appendTimeline = (message: string, stepId?: string) => {
    execOpts.timeline.push({ ts: Date.now(), message, stepId }); // 与时间线数组共享引用，向外累计事件
  }; // appendTimeline 闭包结束

  outer: for (const step of ordered) {
    const retryField = step.retry; // Planner/调试可覆写的步骤级额外重试次数（不含首轮）
    const extraRetries =
      typeof retryField === "number" && Number.isFinite(retryField) && retryField >= 0
        ? Math.floor(retryField) // 合法数字：向下取整，避免小数污染 for 上限
        : execOpts.defaultStepRetries; // 未声明则继承全局默认值（通常为 2 次追加尝试）
    const maxAttempts = 1 + extraRetries; // 总尝试次数=首轮 + extraRetries（文档约定语义）
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const stepStart = Date.now(); // 单次尝试起点：duration 覆盖整条「含重试」区间更利于排障
      step.status = "running"; // 进入执行态（重试亦然：保持对用户可见的一致性）
      step.error = undefined; // 新一轮尝试前清空历史错误摘要，避免成功仍残留陈旧文案

      if (attempt === 0) {
        appendTimeline(`${step.name}（${step.id}）started`, step.id); // 第一次开始：打点 started
      } else {
        appendTimeline(`步骤 ${step.id} retry #${attempt}`, step.id); // 重试语义：对齐 trace 范本里的 retry #n 文案风格
        console.log("[Workflow] step retry", { stepId: step.id, attempt, maxAttempts }); // 服务端 stderr 并排输出结构化重试计数
      } // attempt 分支结束

      const depTextRaw = formatDependencyOutputsForStep(step, byId); // 显示式 dependsOn：拼已成功依赖的输出
      const hasExplicitDeps = Boolean(step.dependsOn?.length); // 是否与 Day14 「显式依赖链」语义一致（非仅用线性前缀）
      const injectedPreview = hasExplicitDeps ? depTextRaw : linearPriorOutputs || ""; // 注入预览：两套上下文二选一镜像执行器投喂
      step.injectedContextPreview = injectedPreview || undefined; // 继续把注入快照暴露给前端 details 调试区

      const linearChainPrefix = !hasExplicitDeps ? linearPriorOutputs || undefined : undefined; // summary/todo/chat 的线性前缀参数
      const dependencyTodoContext = hasExplicitDeps ? depTextRaw || undefined : undefined; // todo.generateTodosWithModel dependencyContext

      logWorkflow("step", {
        goal: workflow.goal, // 目标回顾：跨多请求的关联键之一
        stepId: step.id, // id：与 Timeline 打点一致
        step: step.name, // 可读名称便于肉眼扫日志
        action: step.action, // 工具枚举：定位 switch 分支
        status: step.status, // 预期 running（即使重试仍为 running）
        dependsOn: step.dependsOn ?? [], // Planner 给定依赖快照
        hasExplicitDeps, // 布尔：区分 depText vs linearPriorOutputs
        attempt, // 第15天：附加当前尝试序号，便于排查偶发抖动
      }); // step 起始日志对象结束

      try {
        let out: unknown; // 占位：由各 action 分支写入真实工具产物
        if (step.action === "summary") {
          out = await summarizeWithModel(
            memory.shortTerm, // 短期对话：总结上下文主材料
            step.input, // Planner 的焦点补充或材料提示字符串
            memory, // 长期 items：为高优先级语境提供「目标锚点」
            rt, // 模型调用参数：baseUrl/model/key
            hasExplicitDeps ? depTextRaw || undefined : linearChainPrefix // dependency-first vs linear-prefix
          ); // await summarizeWithModel
        } else if (step.action === "todo") {
          out = await generateTodosWithModel({
            userInput: step.input, // todo 这一步的自然语言指令
            memory, // 记忆：延续个性化待办
            rt, // 模型运行时
            chainPrefix: linearChainPrefix, // 无 dependsOn 时链路兜底文本
            dependencyContext:
              dependencyTodoContext && dependencyTodoContext.trim().length > 0
                ? dependencyTodoContext // 非空则用显式 dependency prompt 构造
                : undefined, // 空串视为无依赖语义，不传参
          }); // generateTodosWithModel 结束
        } else if (step.action === "weather") {
          const latestUser = getLatestUserText(memory.shortTerm); // 兜底：城市名往往在最新 user utterance
          const stepText =
            step.input && step.input !== "[object Object]" ? step.input : ""; // Planner 与城市抽取的安全 input
          const keyword = extractWeatherCity(stepText || latestUser); // 规整到支持的 cityMap 关键字
          out = await realWeather(keyword); // Open-Meteo：可能因网络抖动抛错触发 retry
        } else if (hasExplicitDeps && depTextRaw.trim()) {
          out = await runWorkflowChatDirect(
            `【依赖步骤结果】\n${depTextRaw}\n\n【当前任务】\n${step.input}`, // 依赖型 chat/direct 合二为一提示结构
            memory, // 记忆 system 注入保持不变
            rt // 运行时
          ); // runWorkflowChatDirect 结束
        } else {
          out = await runWorkflowChat(step.input, linearPriorOutputs || undefined, memory, rt); // 默认前置链 + 本步指令
        } // action dispatch 分支结束

        step.output = out; // 成功：回填 output 供 summarize + 前端 excerpts
        step.status = "success"; // lifecycle：success
        step.durationMs = Date.now() - stepStart; // 记录最近一次成功尝试耗时（毫秒）
        linearPriorOutputs = [linearPriorOutputs, `[${step.name}]\n${typeof out === "string" ? out : JSON.stringify(out)}`]
          .filter(Boolean) // 去掉首段为空时的多余分隔
          .join("\n\n"); // 串联成「可读线性链」兜底上下文

        console.log("[Workflow] output:", step.output); // stderr 原始打印：快速对照 Timeline

        appendTimeline(`${step.name}（${step.id}）success`, step.id); // trace：成功打点（对齐 Day15 范本）

        logWorkflow("step", {
          goal: workflow.goal, // 冗余 goal：便于分布式 grep
          stepId: step.id, // id：二次确认
          step: step.name, // name：人类友好
          action: step.action, // action：回看工具
          status: step.status, // success
          durationMs: step.durationMs, // ms 统计
          dependsOn: step.dependsOn ?? [], // deps
          injectedContextPreview: step.injectedContextPreview, // 预览串
          attempt, // 成功发生在第几次尝试也能被日志捕获
        }); // step 成功结构化日志结束
        continue outer; // 本 step 全流程完成：跳到 DAG 拓扑序下一个 step
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err); // 统一 stringify 捕获到的异常摘要
        step.durationMs = Date.now() - stepStart; // 失败也把本轮 wall-clock 记到字段里，方便 UI 徽章
        if (attempt < maxAttempts - 1) {
          appendTimeline(`步骤 ${step.id} 失败（将进入重试）：${msg}`, step.id); // 仍为可恢复的失败：打点但不终结 workflow
          console.warn("[Workflow] step attempt failed", { stepId: step.id, attempt, msg }); // warn：避免与 error 混级
          continue; // for attempt：下一轮重试
        } // 还可重试分支结束
        step.status = "failed"; // 用尽次数仍失败：该 step lifecycle 设为 failed
        step.error = msg; // UI 可读错误摘录
        workflow.status = "failed"; // 全局 workflow 设为 failed（与 Day14 「遇错即停」对齐）
        appendTimeline(`步骤 ${step.id} 失败（已用尽重试）：${msg}`, step.id); // trace：终结性失败说明
        logWorkflow("error", {
          goal: workflow.goal, // goal：保留上下文锚
          stepId: step.id, // 失败 id
          step: step.name, // 步骤名：快速定位 Planner 条目
          action: step.action, // 工具枚举，辅助判断重试价值
          status: step.status, // failed
          error: step.error, // 错误串
          durationMs: step.durationMs, // 最后尝试耗时
          attempts: maxAttempts, // 第15天：一眼可见总尝试次数
        }); // error 日志结束
        break outer; // 停止执行后续拓扑节点，保留 partial trace
      } // try/catch 结束
    } // attempt for 结束
  } // outer: ordered for 结束

  if (workflow.status !== "failed") workflow.status = "success"; // 所有 step 未触发 break outer 则整体成功
  return workflow; // 就地变异后的同一引用：调用方继续把它当作 wfDone 使用
} // executeWorkflow 函数结束（第15天增强版）

/**
 * POST 处理器：校验入参 → buildMemory → 路由 → 按 action 分发。
 * 所有成功路径均返回 JSON 且包含更新后的 memory。
 */
export async function POST(req: Request) {
  const requestStart = Date.now(); // 请求开始时间
  try {
    const body = (await req.json()) as {
      messages?: ChatMessage[]; // 对话历史（user/assistant 文本）
      memory?: IncomingMemoryPayload; // 上轮回传的记忆载荷
      useWorkflow?: boolean; // 是否走多步工作流而非单步路由
      /** 前端：`local` | `mimo`，缺省为本地 Ollama */
      provider?: string; // 模型提供商开关
      /** 小米 MiMo 模型 id，仅在 provider=mimo 时生效 */
      mimoModel?: string; // MiMo 具体模型 id
    }; // 请求 JSON 体的 TypeScript 形状断言（运行时不校验，需下方逻辑兜底）
    const { messages, memory: incomingMemory, useWorkflow, provider: providerRaw, mimoModel: mimoModelRaw } =
      body; // 解构常用字段便于后续校验
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 }); // 参数非法
    }

    const provider: ModelProvider = providerRaw === "mimo" ? "mimo" : "local"; // 仅在显式 mimo 时走云端，否则 Ollama
    const mimoModel =
      typeof mimoModelRaw === "string" && mimoModelRaw.trim()
        ? mimoModelRaw.trim() // 使用前端传来的有效模型 id
        : MIMO_MODEL_IDS[0]; // 缺省时取白名单首个默认模型

    if (provider === "mimo") {
      if (!isMimoModelId(mimoModel)) {
        return Response.json(
          {
            error: `无效的 mimo 模型「${mimoModel}」。可选：${MIMO_MODEL_IDS.join("、")}`, // 明确列出可选模型
          },
          { status: 400 } // 客户端传参错误
        );
      }
      const key = process.env.XIAOMI_MIMO_API_KEY?.trim(); // 服务端密钥，绝不来自前端
      if (!key) {
        return Response.json(
          {
            error:
              "未配置环境变量 XIAOMI_MIMO_API_KEY：请在项目根目录复制 .env.example 为 .env.local 并填入密钥", // 引导本地配置
          },
          { status: 503 } // 服务未就绪
        );
      }
    }

    const rt: ModelRuntime = {
      provider, // 当前请求选用的提供商
      ollamaUrl: process.env.OLLAMA_API_URL?.trim() || DEFAULT_OLLAMA_API_URL, // Ollama 聊天 API 完整 URL
      ollamaModel: process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL, // 本地默认模型名
      mimoBaseUrl: process.env.XIAOMI_MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL, // 小米兼容网关 origin
      mimoApiKey: process.env.XIAOMI_MIMO_API_KEY?.trim() || "", // 小米 API Key（local 时可为空）
      mimoModel, // 当前 MiMo 模型（local 时亦携带但不使用）
    };

    const { memory, modelMessages } = await buildMemory(messages, incomingMemory, rt); // 构建记忆与模型上下文

    /** 统一把本轮计算好的 memory 附加到任意业务负载上返回前端。 */
    function withMemory(body: ChatResponsePayload): ChatResponseBody {
      return { ...body, memory }; // 展开业务体并附加 memory
    }

    if (useWorkflow) {
      const wfT0 = Date.now(); // 工作流总耗时起点
      const goal = getLatestUserText(memory.shortTerm); // 以最新用户句为 workflow 目标
      console.log("[Workflow] start:", goal); // 文档要求：可见 workflow goal
      logWorkflow("start", { goal }); // 结构化开始日志

      const planItems = await planWorkflowSteps(goal, memory, rt); // Planner：模型产出步骤草案
      const wfId = globalThis.crypto.randomUUID(); // 工作流 id
      let workflow: Workflow = {
        id: wfId, // 唯一标识本次多步任务
        goal, // 用户目标描述
        status: "pending", // 初始为 pending；validate/repair 后可能直接 failed short-circuit
        steps: planItems.map((p) => ({
          id: p.id, // 稳定步骤 id（可能含随机后缀防冲突）
          name: p.name, // Planner 可读标题
          action: p.action, // chat | summary | todo | weather
          input: p.input, // 已规范化的字符串入参
          ...(p.dependsOn?.length ? { dependsOn: p.dependsOn } : {}), // 有依赖则展开写入，否则不写该字段
          status: "pending" as const, // 初始未执行；executeWorkflow 会改为 running/success/failed
        })), // FinalizedPlannerPlanItem → WorkflowStep 雏形
      };

      const timeline: WorkflowTimelineEvent[] = []; // 第15天 Runtime trace：贯穿 validate→repair→DAG execute→retry
      const pushTimeline = (message: string, stepId?: string) => {
        timeline.push({ ts: Date.now(), message, stepId }); // ISO 时刻由前端格式化为本地化时间文案
      }; // pushTimeline 结束
      pushTimeline("工作流管道：前置静态校验 validateWorkflow 开始"); // Timeline：阶段分界线
      let validation = validateWorkflow(workflow); // 第一轮：尽量在零副作用前拦住非法 DAG/非法 action/非法引用
      if (!validation.ok) {
        pushTimeline(`校验失败，进入 repairWorkflow：${validation.errors.join("；")}`, undefined); // Timeline：复述错误原因摘要
        workflow = repairWorkflow(workflow); // AUTO REPAIR：别名归一、补 dependsOn、削环等（按优先级）
        pushTimeline("repairWorkflow 已运行，正在进行二次校验", undefined); // Timeline：repair 打点
        validation = validateWorkflow(workflow); // 第二轮：只允许「可执行的合法 workflow」继续向下
      } else {
        pushTimeline("首轮校验通过（跳过 repairWorkflow）", undefined); // 快路径：避免误报修复噪音
      } // validate 分支结束
      if (!validation.ok) {
        pushTimeline(`校验仍失败，拒绝执行（不进入模型工具链）：${validation.errors.join("；")}`, undefined); // 明确说明 short-circuit
        workflow.status = "failed"; // 状态机：failed（无步骤进入 running 以上成功态）
        workflow.executionTimeline = timeline; // 把截至目前的 trace 直接回传前端排错
        const finalSummary = `工作流校验失败（未执行任何步骤）：\n${validation.errors.map((e) => `- ${e}`).join("\n")}`; // 用户可见：分条错误
        logWorkflow("error", {
          goal: workflow.goal, // 结构化日志：目标
          workflowId: workflow.id, // 结构化日志：实例 id
          validationErrors: validation.errors, // 结构化日志：错误数组便于聚合统计
        }); // 校验失败也走 Workflow 级别 error 事件
        return Response.json(withMemory({ type: "workflow", workflow, finalSummary })); // 早返回：避免 executeWorkflow 侧扰动
      } // 校验短路返回结束
      const topoPreview = topologicalSort(workflow.steps) // DAG 可读预览：不参与执行逻辑，仅占位 Timeline
        .map((x) => x.id) // 映射为紧凑 id 列表
        .join("→"); // 箭头串联：对齐教材式示意
      pushTimeline(`校验通过：topologicalSort 预览序 ${topoPreview}`, undefined); // Timeline：写明真实执行将采用 DAG 序而非 Planner 数组序
      workflow.status = "running"; // 与 Day14 一致：真正进入执行前先标 running
      pushTimeline("执行器 executeWorkflow 启动（DAG 拓扑序 + 步骤级 retry + Timeline 打点）", undefined); // Timeline：executor 边界
      await executeWorkflow(workflow, memory, rt, {
        timeline, // 传入共享数组：execute 内向同一缓冲 append
        defaultStepRetries: WORKFLOW_DEFAULT_STEP_RETRIES, // 注入本轮全局默认额外重试次数
      }); // executeWorkflow(await)：直至 success 或较早 failed break
      workflow.executionTimeline = timeline; // 执行后把完整 Timeline 挂载到 Workflow（JSON 一并下发）
      const wfDone = workflow; // 保持后续变量命名兼容：wfDone 与 workflow 同源
      const wfElapsed = Date.now() - wfT0; // 总耗时

      logWorkflow("done", {
        goal: wfDone.goal, // 目标回顾
        workflowId: wfDone.id, // 关联 id
        status: wfDone.status, // 最终状态
        durationMs: wfElapsed, // wall-clock 总耗时
        steps: wfDone.steps.map((s) => ({ name: s.name, action: s.action, ms: s.durationMs })), // 每步摘要耗时
      }); // 工作流收尾日志

      const failedStep = wfDone.steps.find((s) => s.status === "failed"); // 首个失败步
      const finalSummary =
        wfDone.status === "success"
          ? await synthesizeWorkflowResult(wfDone, rt) // 全成功：再问模型揉成一段自然语言总答复
          : `工作流中断：${failedStep?.error || "未知错误"}`; // 有失败步：直接向用户交代错误原因

      logAgent("result", {
        action: "workflow", // Agent 顶层动作为 workflow
        durationMs: wfElapsed, // 与 done 日志一致的总耗时
        success: wfDone.status === "success", // 是否完整跑通
      }); // Agent 结果日志

      return Response.json(withMemory({ type: "workflow", workflow: wfDone, finalSummary })); // JSON：含 workflow 详情、总结与 memory
    }

    // 路由阶段不附带 buildMemory 里为「最终聊天」准备的 system 记忆块，只喂路由 system + 近期 shortTerm，
    // 避免同一段长记忆在提示里出现两次、干扰 JSON 格式输出。
    const routeResult = await invokeChatModel(rt, [
      { role: "system", content: buildRoutingSystemPrompt(memory) }, // 路由专用 system（含记忆块）
      ...memory.shortTerm.map((m) => ({ role: m.role, content: m.content })), // 仅短期对话作为路由上下文
    ]); // 路由模型调用
    if (!routeResult.ok) {
      const errStatus =
        routeResult.status >= 400 && routeResult.status < 600 ? routeResult.status : 502;
      return Response.json(
        { error: routeResult.text || "模型请求失败" }, // 上游错误或网关错误
        { status: errStatus }
      ); // Response
    }

    const modelOutput = routeResult.text.trim(); // 路由模型输出文本
    let parsed = parseModelOutput(modelOutput); // 解析 JSON 路由结果
    const latestUser = getLatestUserText(memory.shortTerm); // 最新用户句
    parsed = {
      ...parsed, // 保留 content/keyword
      action: resolveContinuationAction(latestUser, parsed, memory), // 延续语义修正 action
    }; // 覆盖后的 parsed
    // 各工具分支的「主输入」：优先用路由 JSON 的 content，空则回退到用户原话。
    const toolInput = parsed.content || latestUser; // 工具主输入
    const actionStart = Date.now(); // 动作阶段起始时间

    logAgent("route", {
      action: parsed.action, // 动作
      input: toolInput, // 输入摘要
      shortTerm: memory.shortTerm.length, // 短期条数
      memoryItems: memory.items.length, // 长期条数
      memoryChars: memoryItemsCharLength(memory.items), // 长期字符规模
    }); // 路由日志

    switch (parsed.action) {
      // 天气：keyword/content/最新用户话术中解析城市 → Open-Meteo
      case "weather": {
        const keyword = extractWeatherCity(parsed.keyword || parsed.content || latestUser); // 解析城市
        const result = await realWeather(keyword); // 调用天气 API（文件后部定义，运行时可用）
        logAgent("result", {
          action: parsed.action, // 记录动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功标记
        }); // 结果日志
        return Response.json(withMemory({ type: "weather", keyword: keyword || "未知", result })); // JSON 响应
      }
      // 总结：基于短期窗口 + 高优先级记忆做要点归纳
      case "summary": {
        const text = await summarizeWithModel(memory.shortTerm, toolInput, memory, rt); // 生成总结
        logAgent("result", {
          action: parsed.action, // 动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return Response.json(withMemory({ type: "summary", text })); // 响应
      }
      // 待办：模型生成 JSON 任务列表，失败时用内置占位项
      case "todo": {
        const items = await generateTodosWithModel({ userInput: toolInput, memory, rt }); // 生成待办
        logAgent("result", {
          action: parsed.action, // 动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return Response.json(withMemory({ type: "todo", items })); // 响应
      }
      // 默认闲聊：若路由给了 content 则直接使用，否则用 modelMessages 走第二轮生成
      default: {
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content // 非空直接用路由正文
            : await generateFallbackChat(modelMessages, rt); // 否则二次生成
        logAgent("result", {
          action: parsed.action, // 通常为 chat
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return Response.json(withMemory({ type: "chat", content: chatContent })); // 响应
      }
    }
  } catch (error) {
    logAgent("error", {
      success: false, // 失败
      durationMs: Date.now() - requestStart, // 总耗时
      error: error instanceof Error ? error.message : String(error), // 错误信息
    }); // 异常日志
    return Response.json({ error: "Internal server error" }, { status: 500 }); // 对外统一 500
  }
}

/**
 * 调用 Open-Meteo 公开接口获取当前天气；仅支持 cityMap 中已配置的城市。
 */
async function realWeather(city: string): Promise<string> {
  const location = cityMap[city]; // 查表得坐标
  if (!location) return "暂不支持该城市（当前仅支持：北京、上海）"; // 未支持城市
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`, // 当前天气 API
    { cache: "no-store" } // 禁用缓存
  ); // fetch
  if (!res.ok) return "天气服务暂时不可用，请稍后再试"; // HTTP 错误
  const data = (await res.json()) as {
    current_weather?: { temperature?: number; windspeed?: number }; // 响应形状
  }; // 断言 JSON
  const temperature = data.current_weather?.temperature; // 温度
  const windspeed = data.current_weather?.windspeed; // 风速
  if (typeof temperature !== "number") return "未获取到实时天气数据，请稍后重试"; // 缺字段
  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : ""; // 可选风速文案
  return `当前温度：${temperature}°C${windText}`; // 最终展示字符串
}
