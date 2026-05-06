/**
 * Next.js App Router：`POST /api/chat` —— 带记忆与工具路由的聊天接口。
 *
 * 整体流程：
 * 1. 解析请求中的 messages 与可选 memory，调用 buildMemory 组装「短期窗口 + 长期条目」并生成喂给模型的 messages；
 * 2. 用专用 system 提示词走一轮 Ollama，让模型输出 JSON 形式的 action（路由）；
 * 3. 结合「延续上一轮」等启发规则修正 action，再分支执行：天气 / 总结 / 待办 / 普通回复；
 * 4. 响应体始终带上最新的 memory，供前端下一轮原样回传，形成闭环。
 *
 * 外部依赖：本地 Ollama HTTP API；天气分支使用 Open-Meteo（无需 key）。
 */

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
  id: string;
  name: string;
  action: WorkflowStepAction;
  input: string;
  status: "pending" | "running" | "success" | "failed";
  output?: unknown;
  error?: string;
  durationMs?: number;
};

/** 一次多步骤任务的容器。 */
type Workflow = {
  id: string;
  goal: string;
  steps: WorkflowStep[];
  status: "pending" | "running" | "success" | "failed";
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

// ---------- Ollama ----------

const OLLAMA_API_URL = "http://localhost:11434/api/chat"; // 本地 Ollama 聊天端点
const OLLAMA_MODEL = "qwen2.5:14b"; // 默认模型名

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
  console.log(`[Workflow] ${event}`, payload);
}

/** 调用本地 Ollama /api/chat，非流式，返回完整 message.content。 */
async function callOllama(messages: Array<{ role: string; content: string }>) {
  return fetch(OLLAMA_API_URL, {
    method: "POST", // POST
    headers: { "Content-Type": "application/json" }, // JSON 请求头
    body: JSON.stringify({
      model: OLLAMA_MODEL, // 模型
      messages, // 消息数组
      stream: false, // 非流式
    }), // body
  }); // fetch
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
  if (raw === "weather" || raw === "search") return "weather";
  if (raw === "summary") return "summary";
  if (raw === "todo") return "todo";
  return "chat";
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
  const highBlock = formatMemoryBlock(memory.items, "high");
  const lowBlock = formatMemoryBlock(memory.items, "low");
  if (!highBlock && !lowBlock) return "(空)";
  return [
    highBlock ? `【高优先级记忆】\n${highBlock}` : "",
    lowBlock ? `【其他记忆】\n${lowBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
async function secondaryCompressItems(items: MemoryItem[]): Promise<MemoryItem[]> {
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
  const res = await callOllama([{ role: "user", content: prompt }]); // 调用模型压缩
  if (!res.ok) return trimMemoryItems(dedupeMemoryItems(items)).slice(0, MAX_COMPRESSED_ITEMS); // 失败则退化截断
  const data = (await res.json()) as { message?: { content?: string } }; // 解析响应
  const raw = data.message?.content?.trim() || ""; // 模型输出字符串
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
async function maybeEvolveMemoryItems(items: MemoryItem[]): Promise<MemoryItem[]> {
  let next = dedupeMemoryItems(items); // 先去重
  const charLen = memoryItemsCharLength(next); // 当前字符总长
  if (charLen >= SECONDARY_COMPRESS_THRESHOLD_CHARS || next.length > 12) {
    next = await secondaryCompressItems(next); // 超阈则二次压缩
  }
  return trimMemoryItems(next); // 最后裁剪体积
}

/**
 * 将被移出短期窗口的旧对话压缩成若干 MemoryItem，合并进长期记忆。
 * 用于在消息很长时把关键信息「沉淀」下来而不是直接丢弃。
 */
async function summarizeForMemory(
  oldMessages: ChatMessage[],
  existingItems: MemoryItem[]
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

  const res = await callOllama([{ role: "user", content: prompt }]); // 请求模型输出 JSON 数组
  if (!res.ok) return []; // 失败返回空，由上层忽略
  const data = (await res.json()) as { message?: { content?: string } }; // 解析 Ollama JSON
  const raw = data.message?.content?.trim() || ""; // 模型原始文本
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
  incomingMemory?: IncomingMemoryPayload
): Promise<{ memory: Memory; modelMessages: Array<{ role: string; content: string }> }> {
  let items = normalizeIncomingMemoryPayload(incomingMemory); // 解析入参记忆

  const shouldSummarize = incomingMessages.length > MAX_CONTEXT_MESSAGES; // 是否需压缩旧段
  const shortTerm = incomingMessages.slice(-SHORT_TERM_SIZE); // 保留尾部短期
  const oldMessages = shouldSummarize ? incomingMessages.slice(0, -SHORT_TERM_SIZE) : []; // 旧段待总结

  if (oldMessages.length > 0) {
    const summarized = await summarizeForMemory(oldMessages, items); // 异步总结旧消息为条目
    items = appendMemoryItems(items, summarized); // 合并进长期
  }

  items = appendMemoryItems(items, extractRuleBasedMemory(incomingMessages)); // 合并规则抽取
  items = await maybeEvolveMemoryItems(items); // 可能二次压缩并裁剪

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
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const fallbackRes = await callOllama([
    {
      role: "system", // 第二轮聊天人设
      content: "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。", // 禁止 JSON
    },
    ...messages, // 带上完整上下文（含 system 记忆块）
  ]); // 调用 Ollama
  if (!fallbackRes.ok) return "抱歉，我现在暂时无法正常回答，请稍后再试。"; // HTTP 失败
  const fallbackData = (await fallbackRes.json()) as { message?: { content?: string } }; // 解析
  return (
    fallbackData.message?.content?.trim() || "抱歉，我现在暂时无法正常回答，请稍后再试。" // 空内容兜底
  ); // 返回字符串
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
  chainPrefix?: string
) {
  let content = pickSummaryContext(messages, fallbackText); // 选定总结输入
  if (chainPrefix) {
    content = `${chainPrefix}\n\n${content}`;
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
  const res = await callOllama([{ role: "user", content: prompt }]); // 调用模型
  if (!res.ok) {
    return "总结失败：模型暂时不可用，请稍后重试。"; // 模型不可用
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 解析响应
  const text = data.message?.content?.trim(); // 正文
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
  chainPrefix?: string;
}): Promise<TodoItem[]> {
  const { userInput, memory, chainPrefix } = args; // 解构参数
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
`; // 待办生成提示词
  const res = await callOllama([{ role: "user", content: prompt }]); // 请求模型
  if (!res.ok) {
    return [
      { task: "对照记忆澄清本周目标与交付物", done: false }, // 占位 1
      { task: "拆解关键任务并设定验收标准", done: false }, // 占位 2
      { task: "执行并复盘，更新进度", done: false }, // 占位 3
    ]; // 失败静态列表
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 解析响应
  const raw = data.message?.content?.trim() || ""; // 模型输出
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
type PlannerPlanItem = { name: string; action: WorkflowStepAction; input: string };

/**
 * Planner 有时会把 input 写成对象（如 { city: "北京" }）；直接 String(obj) 会得到 "[object Object]"。
 * 这里优先抽取常见字段，否则 JSON 序列化，保证下游天气解析与前端展示可读。
 */
function normalizePlannerStepInput(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    try {
      return JSON.stringify(raw);
    } catch {
      return "";
    }
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const preferKeys = [
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
      const v = o[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    try {
      return JSON.stringify(o);
    } catch {
      return "";
    }
  }
  return String(raw).trim();
}

/** 解析 Planner 返回的 JSON 数组（允许多级容错）。 */
function parsePlannerPlanOutput(modelOutput: string): PlannerPlanItem[] {
  try {
    const parsed = JSON.parse(modelOutput) as unknown;
    if (!Array.isArray(parsed)) return []; // 非数组失败
    const out: PlannerPlanItem[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
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
async function planWorkflowSteps(userInput: string, memory: Memory): Promise<PlannerPlanItem[]> {
  const memText = formatMemoryForPlanner(memory); // 长期记忆文本
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
`.trim();

  const res = await callOllama([{ role: "user", content: plannerPrompt }]); // 规划调用
  if (!res.ok) {
    return [{ name: "理解与回应", action: "chat", input: userInput }]; // 降级单步
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 解析响应
  const raw = (data.message?.content || "").trim(); // 模型正文
  const steps = parsePlannerPlanOutput(raw); // 解析步骤
  if (steps.length === 0) {
    return [{ name: "理解与回应", action: "chat", input: userInput }]; // 解析失败兜底
  }
  return steps; // 正常规划
}

/** workflow 中的 chat 步骤：可串联前置步骤文本。 */
async function runWorkflowChat(
  stepInput: string,
  chainPrefix: string | undefined,
  memory: Memory
): Promise<string> {
  const userContent = [chainPrefix ? `前置步骤输出：\n${chainPrefix}` : "", `当前任务：\n${stepInput}`]
    .filter(Boolean)
    .join("\n\n"); // 用户载荷
  const memText = formatMemoryForPlanner(memory); // 记忆参考
  const res = await callOllama([
    {
      role: "system",
      content: `你是简洁的中文助手。结合用户长期记忆完成任务，不要输出 JSON。\n\n长期记忆：\n${memText}`,
    },
    { role: "user", content: userContent },
  ]); // 单轮调用
  if (!res.ok) return "该步骤失败：模型暂不可用。";
  const data = (await res.json()) as { message?: { content?: string } }; // 解析正文
  return data.message?.content?.trim() || "（无输出）";
}

/** 汇总各步成功结果，生成面向用户的最终答复。 */
async function summarizeWorkflowResult(goal: string, workflow: Workflow): Promise<string> {
  const lines = workflow.steps
    .filter((s) => s.status === "success")
    .map((s) => {
      const out =
        typeof s.output === "string" ? s.output : JSON.stringify(s.output ?? ""); // 序列化输出
      return `【${s.name}】\n${out}`; // 步骤块
    })
    .join("\n\n"); // 拼接

  const prompt = `
你是汇总助手。用户目标：
${goal}

各步骤结果：
${lines || "(无成功步骤)"}

请用简洁中文给出一段最终答复（含结论与可执行建议），不要输出 JSON。
`.trim();

  const res = await callOllama([{ role: "user", content: prompt }]); // 汇总调用
  if (!res.ok) {
    return lines || "工作流已完成。"; // 失败则用步骤拼接文本
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 正文
  return data.message?.content?.trim() || lines || "工作流已完成。";
}

/**
 * 顺序执行 workflow.steps，复用 summary / todo / weather / chat 工具；
 * 失败则中断并标记 workflow.status = failed。
 */
async function executeWorkflow(workflow: Workflow, memory: Memory): Promise<Workflow> {
  let priorOutputText = ""; // 前置步骤串联文本

  for (const step of workflow.steps) {
    const stepStart = Date.now(); // 单步计时起点
    step.status = "running";

    logWorkflow("step", {
      goal: workflow.goal,
      step: step.name,
      action: step.action,
      status: step.status,
    });

    try {
      let out: unknown;
      if (step.action === "summary") {
        out = await summarizeWithModel(memory.shortTerm, step.input, memory, priorOutputText || undefined); // 总结
      } else if (step.action === "todo") {
        out = await generateTodosWithModel({
          userInput: step.input,
          memory,
          chainPrefix: priorOutputText || undefined,
        }); // 待办
      } else if (step.action === "weather") {
        const latestUser = getLatestUserText(memory.shortTerm); // 最近用户话
        const stepText =
          step.input && step.input !== "[object Object]" ? step.input : ""; // 规避历史 String(object) 污染
        const keyword = extractWeatherCity(stepText || latestUser); // 城市解析（对象 input 已在上游规范化）
        out = await realWeather(keyword); // 天气（声明在后，运行时已初始化）
      } else {
        out = await runWorkflowChat(step.input, priorOutputText || undefined, memory); // 聊天
      }

      step.output = out; // 记录输出
      step.status = "success"; // 标记成功
      step.durationMs = Date.now() - stepStart; // 耗时
      priorOutputText = [priorOutputText, `[${step.name}]\n${typeof out === "string" ? out : JSON.stringify(out)}`]
        .filter(Boolean)
        .join("\n\n"); // 串联供后续步引用

      console.log("[Workflow] output:", step.output); // 与文档示例对齐的原始输出日志

      logWorkflow("step", {
        goal: workflow.goal,
        step: step.name,
        action: step.action,
        status: step.status,
        durationMs: step.durationMs,
        output: step.output,
      });
    } catch (err) {
      step.status = "failed"; // 标记失败
      step.error = err instanceof Error ? err.message : String(err); // 错误信息
      step.durationMs = Date.now() - stepStart; // 耗时
      workflow.status = "failed"; // 整体失败

      logWorkflow("error", {
        goal: workflow.goal,
        step: step.name,
        action: step.action,
        status: step.status,
        error: step.error,
        durationMs: step.durationMs,
      });
      break; // 中断后续步骤
    }
  }

  if (workflow.status !== "failed") {
    workflow.status = "success"; // 全部成功
  }
  return workflow;
}

/**
 * POST 处理器：校验入参 → buildMemory → 路由 → 按 action 分发。
 * 所有成功路径均返回 JSON 且包含更新后的 memory。
 */
export async function POST(req: Request) {
  const requestStart = Date.now(); // 请求开始时间
  try {
    const { messages, memory: incomingMemory, useWorkflow } = (await req.json()) as {
      messages?: ChatMessage[]; // 可选消息数组
      memory?: IncomingMemoryPayload; // 可选记忆负载（含兼容 longTerm）
      useWorkflow?: boolean; // 是否走 Planner + Executor 多步工作流
    }; // 解析 JSON body
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 }); // 参数非法
    }

    const { memory, modelMessages } = await buildMemory(messages, incomingMemory); // 构建记忆与模型上下文

    /** 统一把本轮计算好的 memory 附加到任意业务负载上返回前端。 */
    function withMemory(body: ChatResponsePayload): ChatResponseBody {
      return { ...body, memory }; // 展开业务体并附加 memory
    }

    if (useWorkflow) {
      const wfT0 = Date.now(); // 工作流总耗时起点
      const goal = getLatestUserText(memory.shortTerm); // 以最新用户句为 workflow 目标
      console.log("[Workflow] start:", goal); // 文档要求：可见 workflow goal
      logWorkflow("start", { goal }); // 结构化开始日志

      const planItems = await planWorkflowSteps(goal, memory); // Planner
      const wfId = globalThis.crypto.randomUUID(); // 工作流 id
      const workflow: Workflow = {
        id: wfId,
        goal,
        status: "pending",
        steps: planItems.map((p, i) => ({
          id: `step-${i}-${globalThis.crypto.randomUUID()}`,
          name: p.name,
          action: p.action,
          input: p.input,
          status: "pending" as const,
        })),
      };

      workflow.status = "running";
      const wfDone = await executeWorkflow(workflow, memory); // Executor
      const wfElapsed = Date.now() - wfT0; // 总耗时

      logWorkflow("done", {
        goal: wfDone.goal,
        workflowId: wfDone.id,
        status: wfDone.status,
        durationMs: wfElapsed,
        steps: wfDone.steps.map((s) => ({ name: s.name, action: s.action, ms: s.durationMs })),
      });

      const failedStep = wfDone.steps.find((s) => s.status === "failed"); // 首个失败步
      const finalSummary =
        wfDone.status === "success"
          ? await summarizeWorkflowResult(goal, wfDone) // 成功则模型汇总
          : `工作流中断：${failedStep?.error || "未知错误"}`; // 失败则说明原因

      logAgent("result", {
        action: "workflow",
        durationMs: wfElapsed,
        success: wfDone.status === "success",
      });

      return Response.json(withMemory({ type: "workflow", workflow: wfDone, finalSummary })); // 携带 workflow 的响应
    }

    // 路由阶段不附带 buildMemory 里为「最终聊天」准备的 system 记忆块，只喂路由 system + 近期 shortTerm，
    // 避免同一段长记忆在提示里出现两次、干扰 JSON 格式输出。
    const routeRes = await callOllama([
      { role: "system", content: buildRoutingSystemPrompt(memory) }, // 路由专用 system（含记忆块）
      ...memory.shortTerm.map((m) => ({ role: m.role, content: m.content })), // 仅短期对话作为路由上下文
    ]); // 路由 Ollama 调用
    if (!routeRes.ok) {
      const data = await routeRes.json().catch(() => ({})); // 读取错误体
      return Response.json(
        { error: (data as { error?: string }).error || "Ollama request failed" }, // 返回错误信息
        { status: 500 } // 服务器错误
      ); // Response
    }

    const routeData = (await routeRes.json()) as { message?: { content?: string } }; // 路由响应
    const modelOutput = (routeData.message?.content || "").trim(); // 路由模型输出文本
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
        const text = await summarizeWithModel(memory.shortTerm, toolInput, memory); // 生成总结
        logAgent("result", {
          action: parsed.action, // 动作
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 日志
        return Response.json(withMemory({ type: "summary", text })); // 响应
      }
      // 待办：模型生成 JSON 任务列表，失败时用内置占位项
      case "todo": {
        const items = await generateTodosWithModel({ userInput: toolInput, memory }); // 生成待办
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
            : await generateFallbackChat(modelMessages); // 否则二次生成
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
