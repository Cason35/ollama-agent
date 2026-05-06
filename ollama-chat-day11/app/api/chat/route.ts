// 与前端约定的消息格式：
// - role: 区分说话方，决定在模型上下文里的语义位置。
// - content: 原始文本内容，后端所有路由/工具都以它为输入来源。
type ChatMessage = {
  role: "user" | "assistant"; // 说话者角色：用户或助手
  content: string; // 本条消息的文本载荷
};

// 记忆结构：
// - shortTerm: 最近若干轮对话，直接送进模型，保证当前任务连续性。
// - longTerm: 压缩后的长期事实（身份/目标/偏好等），用于跨轮记忆。
// 该结构会在每次请求中回传给前端，由前端在下一轮再带回后端，实现“无数据库”记忆闭环。
type Memory = {
  shortTerm: ChatMessage[]; // 短期窗口内的对话列表
  longTerm: string; // 跨轮压缩后的长期记忆文本
};

type Action = "chat" | "weather" | "summary" | "todo"; // 路由模型判定的四类意图

type ParsedOutput = {
  action: Action; // 归一化后的动作枚举
  content: string; // 路由层抽取的主要内容（可为空）
  keyword: string; // 路由层抽取的关键词（如城市名，可为空）
};

type TodoItem = {
  task: string; // 待办描述
  done: boolean; // 是否完成
};

type ChatResponseBody =
  | { type: "chat"; content: string; memory: Memory } // 普通聊天响应体
  | { type: "weather"; keyword: string; result: string; memory: Memory } // 天气响应体
  | { type: "summary"; text: string; memory: Memory } // 总结响应体
  | { type: "todo"; items: TodoItem[]; memory: Memory }; // 待办响应体

const MAX_CONTEXT_MESSAGES = 10; // 触发“旧对话压缩进长期记忆”的消息条数阈值
const SHORT_TERM_SIZE = 6; // 短期记忆保留的最近消息条数
const MAX_LONG_TERM_CHARS = 2000; // 长期记忆字符串最大字符数上限
const OLLAMA_API_URL = "http://localhost:11434/api/chat"; // 本地 Ollama HTTP 聊天接口地址
const OLLAMA_MODEL = "qwen2.5:14b"; // 默认使用的 Ollama 模型名称

// 基于规则抓取长期记忆的关键词，优先保留身份/目标/偏好类信息。
// 这是一个“轻量兜底层”：即使模型总结失败，也能保住关键用户事实不丢失。
const LONG_TERM_RULE_PATTERN = /(我叫|我的名字是|叫我|我是|我想|我的目标|我希望|偏好|习惯)/; // 匹配值得写入长期记忆的句式

// 当前天气查询支持的城市映射（示例只接入北京/上海）。
// 这里采用显式白名单，避免自由文本直接拼接成外部 API 参数导致不可控请求。
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 }, // 北京经纬度
  上海: { lat: 31.2304, lon: 121.4737 }, // 上海经纬度
};

const systemPrompt = `
你是一个AI助手，必须严格输出 JSON，不允许输出任何解释或 Markdown。
任务（按意图选择 action）：
1) 用户问天气、气温、某城市天气 -> action 为 "weather"
2) 用户要总结、概括、归纳某段话或内容 -> action 为 "summary"
3) 用户要做计划、列待办、任务清单、安排步骤 -> action 为 "todo"
4) 普通闲聊、问候、一般问答 -> action 为 "chat"
输出格式（仅一行 JSON）：
{"action":"chat|weather|summary|todo","content":"","keyword":""}
`; // 路由专用系统提示：约束模型只输出单行 JSON

// 统一日志入口，方便后续接入观测平台（如按 event 聚合耗时/成功率）。
function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[Agent] ${event}`, payload); // 结构化打印事件名与负载
}

// 统一封装 Ollama 调用，避免各处重复写 fetch 配置。
// 设计上固定 stream=false，确保当前 API 路由走“请求-响应”一次性返回模式。
async function callOllama(messages: Array<{ role: string; content: string }>) {
  return fetch(OLLAMA_API_URL, {
    method: "POST", // POST JSON 到 Ollama
    headers: { "Content-Type": "application/json" }, // 声明 JSON 请求体
    body: JSON.stringify({
      model: OLLAMA_MODEL, // 指定模型
      messages, // 传入对话消息数组
      stream: false, // 关闭流式，便于一次性解析响应
    }), // 序列化请求体对象
  }); // 返回 fetch Promise
}

// 将模型的 action 输出标准化，兼容同义字段。
// 例如部分模型可能输出 search，但业务语义仍是天气检索，统一映射到 weather。
function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather"; // 天气或搜索类意图统一为 weather
  if (raw === "summary") return "summary"; // 总结意图
  if (raw === "todo") return "todo"; // 待办意图
  return "chat"; // 其余一律当作普通聊天，保证总有合法分支
}

// 对模型输出做结构兜底，保证后续流程始终有 action/content/keyword。
// 关键目标：哪怕模型返回“半结构化”或字段缺失，也不让后续 switch 分发崩掉。
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  if (!input || typeof input !== "object") {
    return { action: "chat", content: rawText, keyword: "" }; // 非对象时退化为整段原文聊天
  }
  const candidate = input as Partial<ParsedOutput>; // 宽松断言以便读取可选字段
  return {
    action: normalizeAction(candidate.action), // 归一化动作字段
    content:
      typeof candidate.content === "string" && candidate.content.trim()
        ? candidate.content.trim() // 有非空字符串则用修剪后的 content
        : "", // 否则置空，后续由 toolInput 兜底
    keyword: typeof candidate.keyword === "string" ? candidate.keyword.trim() : "", // keyword 仅接受字符串
  }; // 返回规范化的 ParsedOutput
}

// 解析路由模型输出（分层容错）：
// 1) 先尝试整段 JSON；
// 2) 失败后尝试提取文本中的 JSON 子串；
// 3) 最终兜底为 chat。
// 这样可应对模型偶发输出“解释 + JSON”的污染场景，尽量维持业务可用。
function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    return normalizeParsedOutput(JSON.parse(modelOutput), modelOutput); // 优先整段解析为 JSON
  } catch {
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/); // 用正则抓取第一段花括号 JSON 片段
    if (jsonMatch) {
      try {
        return normalizeParsedOutput(JSON.parse(jsonMatch[0]), modelOutput); // 对子串再次 JSON.parse
      } catch {
        // ignore // 子串仍非法则继续走最终兜底
      }
    }
    return { action: "chat", content: modelOutput, keyword: "" }; // 完全失败时当作普通回复全文
  }
}

// 限制长期记忆长度，防止提示词无限膨胀。
// 采用“保留末尾”策略：最近沉淀的信息通常对当前轮次更有价值。
function trimLongTerm(text: string): string {
  const cleaned = text.trim(); // 去掉首尾空白
  if (cleaned.length <= MAX_LONG_TERM_CHARS) return cleaned; // 未超长则原样返回
  return cleaned.slice(-MAX_LONG_TERM_CHARS); // 超长则只保留末尾一段
}

// 将长期记忆按行切分并去空行，便于合并与去重。
// 约定每行一个事实，后续可直接基于 Set 做去重。
function splitMemoryLines(longTerm: string): string[] {
  return longTerm
    .split("\n") // 按换行拆分
    .map((line) => line.trim()) // 每行去空白
    .filter(Boolean); // 去掉空行
}

// 追加长期记忆并按行去重，避免事实重复写入。
// 先合并旧+新，再去重，最后统一走长度裁剪，保证顺序与体积都可控。
function appendMemoryLines(longTerm: string, lines: string[]): string {
  if (lines.length === 0) return trimLongTerm(longTerm); // 无新行则只做裁剪
  const merged = [...splitMemoryLines(longTerm), ...lines]; // 旧行与新行合并为数组
  const deduped = Array.from(new Set(merged)); // Set 去重保持插入顺序去重语义（实际顺序由 merged 决定）
  return trimLongTerm(deduped.join("\n")); // 拼接回字符串并裁剪长度
}

// 规则抽取：从用户语句中提炼适合长期保留的事实。
// 只看 user 消息，避免把助手生成内容“反写”进长期记忆造成污染。
function extractRuleBasedMemory(messages: ChatMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user" && LONG_TERM_RULE_PATTERN.test(m.content)) // 只保留命中规则的用户句
    .map((m) => `- ${m.content.trim()}`) // 转成 markdown 列表样式行
    .filter((line) => line.length > 2); // 过滤过短行
}

// 使用模型压缩旧对话为长期记忆摘要（bullet 事实）。
// 输入是“超出 shortTerm 窗口的旧消息”，输出是可去重的事实行。
// 这一层是记忆压缩核心，目的是把 token 占用从“原对话”降到“关键信息”。
async function summarizeForMemory(
  oldMessages: ChatMessage[],
  existingLongTerm: string
): Promise<string> {
  const dialogue = oldMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 将每条消息格式化为中文角色前缀
    .join("\n"); // 拼成一段对话文本

  const prompt = `
请总结对话，用于长期记忆：

要求：
1. 只保留关键信息（身份 / 目标 / 偏好 / 约束）
2. 删除闲聊内容
3. 输出简洁事实，每行以"- "开头
4. 不要出现“用户说”“助手说”
5. 不要重复已有事实

已有长期记忆：
${existingLongTerm || "(空)"}

待压缩对话：
${dialogue}
`; // 构造送给模型的压缩提示词

  const res = await callOllama([{ role: "user", content: prompt }]); // 单条 user 消息调用 Ollama
  if (!res.ok) return ""; // 请求失败则返回空串，上层可忽略本次摘要
  const data = (await res.json()) as { message?: { content?: string } }; // 解析 Ollama 返回结构
  return data.message?.content?.trim() || ""; // 取出模型正文并修剪
}

// 构建 memory 与模型输入上下文（本路由最关键的编排函数）：
// - 超过窗口阈值时，把旧对话压缩进 longTerm；
// - shortTerm 固定保留最近 N 条；
// - 最终拼装 system(longTerm) + shortTerm 供后续路由/回答。
// 返回双结果：
// - memory: 给前端持有并回传；
// - modelMessages: 当前轮给模型实际使用的上下文。
async function buildMemory(
  incomingMessages: ChatMessage[],
  prevMemory?: Partial<Memory>
): Promise<{ memory: Memory; modelMessages: Array<{ role: string; content: string }> }> {
  const baseLongTerm = typeof prevMemory?.longTerm === "string" ? prevMemory.longTerm : ""; // 读取上轮传入的长期记忆或空串
  const shouldSummarize = incomingMessages.length > MAX_CONTEXT_MESSAGES; // 是否超过上下文条数阈值
  const shortTerm = incomingMessages.slice(-SHORT_TERM_SIZE); // 始终保留尾部 SHORT_TERM_SIZE 条作为短期
  const oldMessages = shouldSummarize ? incomingMessages.slice(0, -SHORT_TERM_SIZE) : []; // 超出部分作为待压缩旧消息

  let longTerm = baseLongTerm; // 工作副本，逐步追加摘要与规则事实
  if (oldMessages.length > 0) {
    const summary = await summarizeForMemory(oldMessages, longTerm); // 异步生成摘要文本
    longTerm = appendMemoryLines(longTerm, splitMemoryLines(summary)); // 将摘要行并入长期记忆
  }

  const ruleFacts = extractRuleBasedMemory(incomingMessages); // 从本轮全部消息做规则抽取
  longTerm = appendMemoryLines(longTerm, ruleFacts); // 合并规则事实并裁剪

  const memory: Memory = {
    shortTerm, // 写入短期字段
    longTerm, // 写入长期字段
  }; // 组装 Memory 对象

  const modelMessages: Array<{ role: string; content: string }> = []; // 准备发给模型的消息数组
  if (memory.longTerm) {
    modelMessages.push({
      role: "system", // 用 system 注入长期记忆，优先级靠前
      content: `以下是历史对话摘要（长期记忆）：\n${memory.longTerm}`, // 明示摘要用途，避免模型混淆
    }); // 压入 system 消息
  }
  modelMessages.push(...memory.shortTerm); // 展开短期对话紧跟其后
  return { memory, modelMessages }; // 同时返回记忆快照与模型输入
}

// 从自然语言里尽量提取城市名，支持常见助词/标点清洗。
// 先原文匹配，再清洗后匹配，最后返回清洗字符串供上层兜底提示。
function extractWeatherCity(text: string): string {
  const trimmed = text.trim(); // 去掉首尾空白
  if (!trimmed) return ""; // 空串直接返回空城市
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) return city; // 原文包含城市名则命中
  }
  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "") // 去掉中英文标点
    .replace(/\s+/g, "") // 去掉空白
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "") // 去掉常见语气与查询动词
    .replace(/天气预报|天气情况|天气|温度|气温/g, "") // 去掉天气相关名词
    .replace(/的/g, ""); // 去掉助词“的”便于匹配
  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) return city; // 清洗后再匹配城市名
  }
  return cleaned; // 仍未命中则返回清洗后的字符串供错误提示使用
}

// 查询实时天气，失败时返回用户可读错误文案。
// 外部依赖失败（城市不支持/API 不可用/字段缺失）都转成稳定中文提示，前端可直接展示。
async function realWeather(city: string): Promise<string> {
  const location = cityMap[city]; // 查白名单经纬度
  if (!location) return "暂不支持该城市（当前仅支持：北京、上海）"; // 未配置城市则短路返回
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`, // Open-Meteo 当前天气接口
    { cache: "no-store" } // 禁用缓存保证实时性
  ); // 发起 GET 请求
  if (!res.ok) return "天气服务暂时不可用，请稍后再试"; // HTTP 失败提示
  const data = (await res.json()) as {
    current_weather?: { temperature?: number; windspeed?: number }; // 声明响应体形状
  }; // 断言 JSON 结构
  const temperature = data.current_weather?.temperature; // 读取摄氏温度
  const windspeed = data.current_weather?.windspeed; // 读取风速（可选）
  if (typeof temperature !== "number") return "未获取到实时天气数据，请稍后重试"; // 温度缺失视为失败
  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : ""; // 有风速则拼接文案
  return `当前温度：${temperature}°C${windText}`; // 组装最终展示字符串
}

// 获取最近一条用户消息，作为工具输入兜底来源。
// 当路由层 content/keyword 缺失时，仍可基于最后用户输入继续执行。
function getLatestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || ""; // 逆序查找第一条 user
}

// chat 分支兜底：当路由内容不可用时，走普通聊天生成。
// 该函数只在默认聊天分支触发，避免“路由能判定、回答却为空”的空白回复。
async function generateFallbackChat(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const fallbackRes = await callOllama([
    {
      role: "system", // 简洁助手人设
      content: "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。", // 禁止再次输出路由 JSON
    },
    ...messages, // 接上完整上下文
  ]); // 第二次调用 Ollama 生成自然语言
  if (!fallbackRes.ok) return "抱歉，我现在暂时无法正常回答，请稍后再试。"; // HTTP 失败友好提示
  const fallbackData = (await fallbackRes.json()) as { message?: { content?: string } }; // 解析响应
  return (
    fallbackData.message?.content?.trim() || "抱歉，我现在暂时无法正常回答，请稍后再试。" // 正文为空也兜底
  ); // 返回字符串
}

// 总结任务的上下文选择：优先最近 6 条消息，缺失则回退到 fallback 文本。
// 这里限制窗口是为了控制总结 prompt 长度，降低模型波动和成本。
function pickSummaryContext(messages: ChatMessage[], fallbackText: string): string {
  const recent = messages.slice(-6); // 取短期尾部最多 6 条
  const context = recent
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`) // 格式化角色前缀
    .join("\n"); // 拼成多行上下文
  return context || fallbackText; // 若为空则用 fallback 填充
}

// 让模型生成结构化总结文本。
// 输出要求是“纯文本 bullet + 结论/下一步”，便于前端直接渲染为总结卡片。
async function summarizeWithModel(messages: ChatMessage[], fallbackText: string) {
  const content = pickSummaryContext(messages, fallbackText); // 先选定总结输入文本
  const prompt = `
请总结以下对话，要求：
1. 提取关键信息
2. 用 3-5 条要点表达
3. 输出格式为纯文本项目符号，每行以"- "开头
4. 最后一行给出"结论："和"下一步："

对话：
${content}
`; // 构造总结专用提示词
  const res = await callOllama([{ role: "user", content: prompt }]); // 调用模型生成总结
  if (!res.ok) {
    return "总结失败：模型暂时不可用，请稍后重试。"; // 模型不可用提示
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 解析响应 JSON
  const text = data.message?.content?.trim(); // 取出正文
  return text || "总结失败：未获取到有效结果。"; // 空正文兜底
}

// 解析 todo JSON 数组，并清洗 task/done 字段。
// 任何一项不合法都会被过滤，确保最终返回给 UI 的 items 可直接展示。
function parseTodoItemsFromText(raw: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(raw); // 尝试解析为 JSON 值
    if (!Array.isArray(parsed)) return null; // 非数组则失败
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null; // 跳过非对象元素
        const task =
          typeof (item as { task?: unknown }).task === "string"
            ? (item as { task: string }).task.trim() // task 字符串修剪
            : ""; // 非字符串视为空任务
        const done = Boolean((item as { done?: unknown }).done); // done 转布尔
        if (!task) return null; // 无任务文本则丢弃
        return { task, done }; // 返回合法 TodoItem
      })
      .filter((v): v is TodoItem => Boolean(v)); // 类型收窄过滤 null
    return todos.length > 0 ? todos : null; // 无有效项则返回 null
  } catch {
    return null; // JSON 解析异常返回 null
  }
}

// 生成待办项：优先模型 JSON，失败时多级兜底到默认模板。
// 解析策略分三层：直接 JSON -> 抽取中括号片段 -> 静态模板，保证始终有可用输出。
async function generateTodosWithModel(userInput: string): Promise<TodoItem[]> {
  const prompt = `
请根据用户输入生成待办事项。
要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 至少返回 3 项
5. 不要输出任何解释

用户输入：
${userInput}
`; // 待办生成提示词
  const res = await callOllama([{ role: "user", content: prompt }]); // 请求模型输出 JSON 数组文本
  if (!res.ok) {
    return [
      { task: "明确目标并拆分范围", done: false }, // 默认模板项 1
      { task: "先完成核心功能实现", done: false }, // 默认模板项 2
      { task: "执行自测并修复问题", done: false }, // 默认模板项 3
    ]; // 模型不可用时的静态列表
  }
  const data = (await res.json()) as { message?: { content?: string } }; // 解析成功响应
  const raw = data.message?.content?.trim() || ""; // 取出模型输出字符串
  const fromDirect = parseTodoItemsFromText(raw); // 尝试整体解析 JSON
  if (fromDirect) return fromDirect; // 成功则直接返回

  const wrapped = raw.match(/\[[\s\S]*\]/)?.[0]; // 尝试截取第一个方括号数组片段
  const fromWrapped = wrapped ? parseTodoItemsFromText(wrapped) : null; // 对片段再解析
  if (fromWrapped) return fromWrapped; // 片段解析成功则返回

  return [
    { task: "分析需求并确认输入上下文", done: false }, // 二级兜底模板 1
    { task: "按优先级生成待办并细化步骤", done: false }, // 二级兜底模板 2
    { task: "执行任务后复盘结果", done: false }, // 二级兜底模板 3
  ]; // 最终静态兜底
}

export async function POST(req: Request) {
  // 记录请求总耗时，便于追踪慢请求。
  // 该时间覆盖“解析请求 + 记忆构建 + 路由 + 分发执行 + 响应”全链路。
  const requestStart = Date.now(); // 请求开始时间戳（毫秒）
  try {
    const { messages, memory: incomingMemory } = (await req.json()) as {
      messages?: ChatMessage[]; // 可选消息数组
      memory?: Partial<Memory>; // 可选上轮记忆
    }; // 解构并断言请求体
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 }); // 参数校验失败返回 400
    }

    // 先统一构建记忆，再生成本轮模型上下文。
    // 这样每个 action 分支都复用同一套上下文，不会出现分支之间记忆不一致。
    const { memory, modelMessages } = await buildMemory(messages, incomingMemory); // 编排记忆与模型消息
    // 用 systemPrompt 做意图路由，决定进入哪个业务分支。
    // 本次调用只负责“分类+抽取参数”，不负责最终业务回答。
    const routeRes = await callOllama([{ role: "system", content: systemPrompt }, ...modelMessages]); // 路由调用：system + 上下文
    if (!routeRes.ok) {
      const data = await routeRes.json().catch(() => ({})); // 尝试读取错误体，失败则用空对象
      return Response.json(
        { error: (data as { error?: string }).error || "Ollama request failed" }, // 返回 Ollama 错误或通用文案
        { status: 500 } // 服务器内部错误
      ); // Response.json 返回
    }

    const routeData = (await routeRes.json()) as { message?: { content?: string } }; // 解析路由成功响应
    const modelOutput = (routeData.message?.content || "").trim(); // 取出路由模型输出文本
    // 规范化路由输出，尽量抵抗模型格式漂移。
    // toolInput 的优先级：parsed.content > latestUser，确保工具总能拿到输入。
    const parsed = parseModelOutput(modelOutput); // 解析并兜底为 ParsedOutput
    const latestUser = getLatestUserText(memory.shortTerm); // 从短期记忆取最后用户句
    const toolInput = parsed.content || latestUser; // 工具输入优先路由 content
    const actionStart = Date.now(); // 记录动作阶段起始时间用于耗时日志

    logAgent("route", {
      action: parsed.action, // 记录判定动作
      input: toolInput, // 记录工具输入摘要
      shortTerm: memory.shortTerm.length, // 短期条数
      longTermChars: memory.longTerm.length, // 长期字符数
    }); // 路由阶段日志

    // 每个业务响应都自动附带 memory，保证前后端状态一致。
    // 前端拿到后直接覆盖本地 memory，下一轮请求再携带回来形成闭环。
    const withMemory = <T extends Omit<ChatResponseBody, "memory">>(body: T): T & { memory: Memory } => ({
      ...body, // 展开业务字段
      memory, // 注入当前 Memory 快照
    }); // 高阶辅助：统一附加 memory

    // 根据 action 分发到具体能力：weather / summary / todo / chat。
    // 每个分支都记录耗时日志，方便后续比较不同能力调用性能。
    switch (parsed.action) {
      case "weather": {
        const keyword = extractWeatherCity(parsed.keyword || parsed.content || latestUser); // 城市关键词多级兜底
        const result = await realWeather(keyword); // 异步查询天气 API
        logAgent("result", {
          action: parsed.action, // 记录动作名
          durationMs: Date.now() - actionStart, // 记录耗时毫秒
          success: true, // 标记成功
        }); // 天气分支结果日志
        return Response.json(withMemory({ type: "weather", keyword: keyword || "未知", result })); // JSON 响应附记忆
      }
      case "summary": {
        const text = await summarizeWithModel(memory.shortTerm, toolInput); // 基于短期记忆与工具输入总结
        logAgent("result", {
          action: parsed.action, // 动作名
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功标记
        }); // 总结分支日志
        return Response.json(withMemory({ type: "summary", text })); // 返回总结文本与记忆
      }
      case "todo": {
        const items = await generateTodosWithModel(toolInput); // 生成待办列表
        logAgent("result", {
          action: parsed.action, // 动作名
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 待办分支日志
        return Response.json(withMemory({ type: "todo", items })); // 返回 items 与记忆
      }
      default: {
        // chat 分支优先使用路由内容；空内容时才触发兜底聊天生成。
        // 这样可以减少一次模型调用，降低延迟；只有必要时才走 fallback。
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content // 非空则直接用路由给出的正文
            : await generateFallbackChat(modelMessages); // 否则第二次调用生成回答
        logAgent("result", {
          action: parsed.action, // 通常为 chat
          durationMs: Date.now() - actionStart, // 耗时
          success: true, // 成功
        }); // 聊天分支日志
        return Response.json(withMemory({ type: "chat", content: chatContent })); // 返回聊天正文与记忆
      }
    }
  } catch (error) {
    // 总兜底异常：统一返回 500，避免暴露内部细节。
    // 日志会保留真实错误信息用于排查，但接口仅返回通用错误文案。
    logAgent("error", {
      success: false, // 标记失败
      durationMs: Date.now() - requestStart, // 总耗时
      error: error instanceof Error ? error.message : String(error), // 序列化错误信息
    }); // 异常日志
    return Response.json({ error: "Internal server error" }, { status: 500 }); // 对外统一 500 文案
  }
}
