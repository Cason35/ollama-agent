/**
 * Next.js App Router：`POST /api/chat` —— 带记忆与工具路由的聊天接口。
 *
 * 整体流程：
 * 1. 解析请求中的 messages 与可选 memory，调用 buildMemory 组装「短期窗口 + 长期条目」并生成喂给模型的 messages；
 * 2. 用专用 system 提示词走一轮聊天模型（本地 Ollama 或小米 MiMo OpenAI 兼容接口），让模型输出 JSON 形式的 action（路由）；
 * 3. 结合「延续上一轮」等启发规则修正 action，再分支执行：天气 / 总结 / 待办 / 普通回复；
 * 4. 响应体始终带上最新的 memory，供前端下一轮原样回传，形成闭环。
 *
 * 外部依赖：本地 Ollama HTTP API，或小米 MiMo（`XIAOMI_MIMO_*` 环境变量）；天气分支使用 Open-Meteo（无需 key）。
 */

import { MIMO_MODEL_IDS, type MimoModelId } from "@/lib/mimo-models";

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
  id: string; // 步骤唯一 id（前端列表 key、日志关联）
  name: string; // 人类可读的步骤标题
  action: WorkflowStepAction; // 本步要调用的工具类型
  input: string; // 传给该工具的自然语言或关键词入参
  status: "pending" | "running" | "success" | "failed"; // 步骤生命周期状态
  output?: unknown; // 成功时工具返回（字符串或 JSON 可序列化结构）
  error?: string; // 失败时的错误信息摘要
  durationMs?: number; // 本步执行耗时（毫秒）
};

/** 一次多步骤任务的容器。 */
type Workflow = {
  id: string; // 工作流实例 id
  goal: string; // 用户本轮目标（通常取最新 user 文本）
  steps: WorkflowStep[]; // Planner 产出并由执行器顺序跑完的步骤列表
  status: "pending" | "running" | "success" | "failed"; // 整体工作流状态
};

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
    const res = await fetch(rt.ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: rt.ollamaModel,
        messages,
        stream: false,
      }),
    });
    const rawText = await res.text();
    let text = "";
    if (res.ok) {
      try {
        const data = JSON.parse(rawText) as { message?: { content?: string } };
        text = data.message?.content?.trim() || "";
      } catch {
        text = "";
      }
    } else {
      try {
        const data = JSON.parse(rawText) as { error?: string };
        text = (typeof data.error === "string" ? data.error : "") || rawText.slice(0, 800);
      } catch {
        text = rawText.slice(0, 800);
      }
    }
    return { ok: res.ok, status: res.status, text };
  }

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
    }),
  });
  const rawText = await res.text(); // 原始响应文本（成功/失败统一先读字符串）
  let text = ""; // 解析出的助手正文或错误摘要
  if (res.ok) {
    try {
      const data = JSON.parse(rawText) as {
        choices?: Array<{ message?: { content?: string } }>; // OpenAI 风格 choices
      };
      text = data.choices?.[0]?.message?.content?.trim() || ""; // 取首条 choice 的 message.content
    } catch {
      text = ""; // JSON 异常则视为无正文
    }
  } else {
    try {
      const data = JSON.parse(rawText) as {
        error?: { message?: string } | string; // 兼容对象或字符串 error
      };
      if (typeof data.error === "object" && data.error?.message) {
        text = data.error.message; // 读出 OpenAI 式 error.message
      } else if (typeof data.error === "string") {
        text = data.error; // 简单字符串错误
      } else {
        text = rawText.slice(0, 800); // 无法结构化则截取原始片段避免日志爆炸
      }
    } catch {
      text = rawText.slice(0, 800); // 解析失败同样截取正文
    }
  }
  return { ok: res.ok, status: res.status, text }; // 与 local 分支统一返回形状
}

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
  chainPrefix?: string;
}): Promise<TodoItem[]> {
  const { userInput, memory, chainPrefix, rt } = args; // 解构参数
  const highBlock = formatMemoryBlock(memory.items, "high"); // 高优先级记忆块
  const lowBlock = formatMemoryBlock(memory.items, "low"); // 其他记忆块

  const prompt = `
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
${chainPrefix ? `\n【前置步骤输出】\n${chainPrefix}\n` : ""}
用户输入：
${userInput}
`; // 待办生成提示词；若有 chainPrefix 则上文已附带「前置步骤输出」段落供串联
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

/** Planner 输出的单步草案（无 id/status，由执行器补全）。 */
type PlannerPlanItem = {
  name: string; // 步骤展示名
  action: WorkflowStepAction; // 工具枚举
  input: string; // 送入工具的字符串（已由 normalizePlannerStepInput 规范）
};

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
      const name = String((row as { name?: unknown }).name || "").trim() || "步骤"; // 步骤名
      const input = normalizePlannerStepInput((row as { input?: unknown }).input); // 步骤输入（兼容对象）
      const action = normalizeWorkflowAction((row as { action?: unknown }).action); // 动作
      out.push({ name, action, input: input || name }); // 缺 input 时用 name 占位
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

/** Workflow Planner：把用户复杂需求拆成 1-4 个可执行步骤。 */
async function planWorkflowSteps(
  userInput: string,
  memory: Memory,
  rt: ModelRuntime
): Promise<PlannerPlanItem[]> {
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
2. 每个步骤包含 name、action、input；input 必须是字符串（天气步骤写城市名或含城市名的短句，如「北京」），不要嵌套 JSON 对象
3. 不要输出解释

用户需求：
${userInput}

长期记忆：
${memText}
`.trim(); // 去掉提示词首尾空白，减少模型多余输出

  const { ok, text: raw } = await invokeChatModel(rt, [{ role: "user", content: plannerPrompt }]); // 调用模型生成步骤 JSON
  if (!ok) {
    return [{ name: "理解与回应", action: "chat", input: userInput }]; // 模型不可用：单步 chat 兜底
  }
  const trimmedRaw = raw.trim(); // 去掉模型输出首尾空白
  const steps = parsePlannerPlanOutput(trimmedRaw); // 解析为 PlannerPlanItem 列表
  if (steps.length === 0) {
    return [{ name: "理解与回应", action: "chat", input: userInput }]; // 解析不到步骤则同样单步兜底
  }
  return steps; // 返回规划结果供执行器消费
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

/** 汇总各步成功结果，生成面向用户的最终答复。 */
async function summarizeWorkflowResult(
  goal: string,
  workflow: Workflow,
  rt: ModelRuntime
): Promise<string> {
  const lines = workflow.steps
    .filter((s) => s.status === "success") // 只汇总成功的步骤，忽略失败或未跑到的
    .map((s) => {
      const out =
        typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""); // 序列化输出
      return `【${s.name}】\n${out}`; // 步骤标题 + 该步正文
    })
    .join("\n\n"); // 多块之间空一行

  const prompt = `
你是汇总助手。用户目标：
${goal}

各步骤结果：
${lines || "(无成功步骤)"}

请用简洁中文给出一段最终答复（含结论与可执行建议），不要输出 JSON。
`.trim(); // trim 汇总提示词

  const { ok, text } = await invokeChatModel(rt, [{ role: "user", content: prompt }]); // 让模型产出面向用户的整合答复
  if (!ok) {
    return lines || "工作流已完成。"; // 模型不可用时退回步骤拼接或固定句
  }
  return text || lines || "工作流已完成。"; // 优先模型汇总，否则步骤拼接，再否则固定句
}

/**
 * 顺序执行 workflow.steps，复用 summary / todo / weather / chat 工具；
 * 失败则中断并标记 workflow.status = failed。
 */
async function executeWorkflow(
  workflow: Workflow,
  memory: Memory,
  rt: ModelRuntime
): Promise<Workflow> {
  let priorOutputText = ""; // 前置步骤串联文本（供 summary/todo/chat 等后续步引用）

  for (const step of workflow.steps) {
    const stepStart = Date.now(); // 单步计时起点（计算 durationMs）
    step.status = "running"; // 进入执行中状态

    logWorkflow("step", {
      goal: workflow.goal, // 工作流目标上下文
      step: step.name, // 当前步骤名
      action: step.action, // 当前工具类型
      status: step.status, // 应为 running
    }); // 步骤开始日志

    try {
      let out: unknown; // 本步工具产出的原始结果
      if (step.action === "summary") {
        out = await summarizeWithModel(
          memory.shortTerm, // 用短期窗口作总结上下文
          step.input, // Planner 给的总结焦点/兜底文本
          memory, // 携带长期记忆条目
          rt, // 模型运行时
          priorOutputText || undefined // 把工作流前文拼进总结输入（若有）
        ); // 调用总结分支
      } else if (step.action === "todo") {
        out = await generateTodosWithModel({
          userInput: step.input, // 本步的用户向任务描述
          memory, // 长期记忆对齐身份与目标
          rt, // 模型运行时
          chainPrefix: priorOutputText || undefined, // 前置步骤输出并入待办提示
        }); // 生成待办列表
      } else if (step.action === "weather") {
        const latestUser = getLatestUserText(memory.shortTerm); // 最近一条用户话（兜底城市线索）
        const stepText =
          step.input && step.input !== "[object Object]" ? step.input : ""; // 规避历史 String(object) 污染
        const keyword = extractWeatherCity(stepText || latestUser); // 城市解析（对象 input 已在上游规范化）
        out = await realWeather(keyword); // 走 Open-Meteo 返回可读天气文案
      } else {
        out = await runWorkflowChat(step.input, priorOutputText || undefined, memory, rt); // 默认 chat 步骤
      }

      step.output = out; // 写入本步结构化/文本输出
      step.status = "success"; // 标记本步完成
      step.durationMs = Date.now() - stepStart; // 记录本步 wall-clock 耗时
      priorOutputText = [priorOutputText, `[${step.name}]\n${typeof out === "string" ? out : JSON.stringify(out)}`]
        .filter(Boolean) // 首步无前缀时不留空段
        .join("\n\n"); // 多步结果用空行隔开，形成链式前缀

      console.log("[Workflow] output:", step.output); // 与文档示例对齐的原始输出日志

      logWorkflow("step", {
        goal: workflow.goal, // 目标上下文
        step: step.name, // 步骤名
        action: step.action, // 工具类型
        status: step.status, // 此时为 success
        durationMs: step.durationMs, // 本步耗时
        output: step.output, // 本步产出（日志可截断由控制台决定）
      }); // 步骤成功收尾日志
    } catch (err) {
      step.status = "failed"; // 本步标记失败
      step.error = err instanceof Error ? err.message : String(err); // 统一收成字符串错误摘要
      step.durationMs = Date.now() - stepStart; // 失败也记录已消耗时间
      workflow.status = "failed"; // 整体流程进入失败（后续步不再执行）

      logWorkflow("error", {
        goal: workflow.goal, // 目标上下文
        step: step.name, // 失败发生在哪一步
        action: step.action, // 哪类工具出错
        status: step.status, // failed
        error: step.error, // 错误文案
        durationMs: step.durationMs, // 失败前耗时
      }); // 错误日志
      break; // 中断 for，不再执行后续步骤
    }
  }

  if (workflow.status !== "failed") {
    workflow.status = "success"; // 所有已执行步骤均未抛错则认为整体成功
  }
  return workflow; // 返回可能被就地修改过的 workflow（含每步 status/output）
}

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
    };
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
      const workflow: Workflow = {
        id: wfId, // 唯一标识本次多步任务
        goal, // 用户目标描述
        status: "pending", // 初始为待执行（随后会改为 running/success/failed）
        steps: planItems.map((p, i) => ({
          id: `step-${i}-${globalThis.crypto.randomUUID()}`, // 每步稳定且唯一的 key
          name: p.name, // 步骤标题
          action: p.action, // 映射后的工具枚举
          input: p.input, // 已规范化的字符串入参
          status: "pending" as const, // 执行前均为 pending
        })),
      };

      workflow.status = "running"; // 开始顺序执行前先标为进行中
      const wfDone = await executeWorkflow(workflow, memory, rt); // Executor：逐步跑工具并回填状态
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
          ? await summarizeWorkflowResult(goal, wfDone, rt) // 成功则再调模型压缩成一段话
          : `工作流中断：${failedStep?.error || "未知错误"}`; // 失败则用首错信息拼接说明

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
