// 与前端约定的消息格式：
// - role: 区分说话方，决定在模型上下文里的语义位置。
// - content: 原始文本内容，后端所有路由/工具都以它为输入来源。
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// 记忆结构：
// - shortTerm: 最近若干轮对话，直接送进模型，保证当前任务连续性。
// - longTerm: 压缩后的长期事实（身份/目标/偏好等），用于跨轮记忆。
// 该结构会在每次请求中回传给前端，由前端在下一轮再带回后端，实现“无数据库”记忆闭环。
type Memory = {
  shortTerm: ChatMessage[];
  longTerm: string;
};

type Action = "chat" | "weather" | "summary" | "todo";

type ParsedOutput = {
  action: Action;
  content: string;
  keyword: string;
};

type TodoItem = {
  task: string;
  done: boolean;
};

type ChatResponseBody =
  | { type: "chat"; content: string; memory: Memory }
  | { type: "weather"; keyword: string; result: string; memory: Memory }
  | { type: "summary"; text: string; memory: Memory }
  | { type: "todo"; items: TodoItem[]; memory: Memory };

const MAX_CONTEXT_MESSAGES = 10;
const SHORT_TERM_SIZE = 6;
const MAX_LONG_TERM_CHARS = 2000;
const OLLAMA_API_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "qwen2.5:14b";

// 基于规则抓取长期记忆的关键词，优先保留身份/目标/偏好类信息。
// 这是一个“轻量兜底层”：即使模型总结失败，也能保住关键用户事实不丢失。
const LONG_TERM_RULE_PATTERN = /(我叫|我的名字是|叫我|我是|我想|我的目标|我希望|偏好|习惯)/;

// 当前天气查询支持的城市映射（示例只接入北京/上海）。
// 这里采用显式白名单，避免自由文本直接拼接成外部 API 参数导致不可控请求。
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
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
`;

// 统一日志入口，方便后续接入观测平台（如按 event 聚合耗时/成功率）。
function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[Agent] ${event}`, payload);
}

// 统一封装 Ollama 调用，避免各处重复写 fetch 配置。
// 设计上固定 stream=false，确保当前 API 路由走“请求-响应”一次性返回模式。
async function callOllama(messages: Array<{ role: string; content: string }>) {
  return fetch(OLLAMA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });
}

// 将模型的 action 输出标准化，兼容同义字段。
// 例如部分模型可能输出 search，但业务语义仍是天气检索，统一映射到 weather。
function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather";
  if (raw === "summary") return "summary";
  if (raw === "todo") return "todo";
  return "chat";
}

// 对模型输出做结构兜底，保证后续流程始终有 action/content/keyword。
// 关键目标：哪怕模型返回“半结构化”或字段缺失，也不让后续 switch 分发崩掉。
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  if (!input || typeof input !== "object") {
    return { action: "chat", content: rawText, keyword: "" };
  }
  const candidate = input as Partial<ParsedOutput>;
  return {
    action: normalizeAction(candidate.action),
    content:
      typeof candidate.content === "string" && candidate.content.trim()
        ? candidate.content.trim()
        : "",
    keyword: typeof candidate.keyword === "string" ? candidate.keyword.trim() : "",
  };
}

// 解析路由模型输出（分层容错）：
// 1) 先尝试整段 JSON；
// 2) 失败后尝试提取文本中的 JSON 子串；
// 3) 最终兜底为 chat。
// 这样可应对模型偶发输出“解释 + JSON”的污染场景，尽量维持业务可用。
function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    return normalizeParsedOutput(JSON.parse(modelOutput), modelOutput);
  } catch {
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return normalizeParsedOutput(JSON.parse(jsonMatch[0]), modelOutput);
      } catch {
        // ignore
      }
    }
    return { action: "chat", content: modelOutput, keyword: "" };
  }
}

// 限制长期记忆长度，防止提示词无限膨胀。
// 采用“保留末尾”策略：最近沉淀的信息通常对当前轮次更有价值。
function trimLongTerm(text: string): string {
  const cleaned = text.trim();
  if (cleaned.length <= MAX_LONG_TERM_CHARS) return cleaned;
  return cleaned.slice(-MAX_LONG_TERM_CHARS);
}

// 将长期记忆按行切分并去空行，便于合并与去重。
// 约定每行一个事实，后续可直接基于 Set 做去重。
function splitMemoryLines(longTerm: string): string[] {
  return longTerm
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// 追加长期记忆并按行去重，避免事实重复写入。
// 先合并旧+新，再去重，最后统一走长度裁剪，保证顺序与体积都可控。
function appendMemoryLines(longTerm: string, lines: string[]): string {
  if (lines.length === 0) return trimLongTerm(longTerm);
  const merged = [...splitMemoryLines(longTerm), ...lines];
  const deduped = Array.from(new Set(merged));
  return trimLongTerm(deduped.join("\n"));
}

// 规则抽取：从用户语句中提炼适合长期保留的事实。
// 只看 user 消息，避免把助手生成内容“反写”进长期记忆造成污染。
function extractRuleBasedMemory(messages: ChatMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user" && LONG_TERM_RULE_PATTERN.test(m.content))
    .map((m) => `- ${m.content.trim()}`)
    .filter((line) => line.length > 2);
}

// 使用模型压缩旧对话为长期记忆摘要（bullet 事实）。
// 输入是“超出 shortTerm 窗口的旧消息”，输出是可去重的事实行。
// 这一层是记忆压缩核心，目的是把 token 占用从“原对话”降到“关键信息”。
async function summarizeForMemory(
  oldMessages: ChatMessage[],
  existingLongTerm: string
): Promise<string> {
  const dialogue = oldMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");

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
`;

  const res = await callOllama([{ role: "user", content: prompt }]);
  if (!res.ok) return "";
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || "";
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
  const baseLongTerm = typeof prevMemory?.longTerm === "string" ? prevMemory.longTerm : "";
  const shouldSummarize = incomingMessages.length > MAX_CONTEXT_MESSAGES;
  const shortTerm = incomingMessages.slice(-SHORT_TERM_SIZE);
  const oldMessages = shouldSummarize ? incomingMessages.slice(0, -SHORT_TERM_SIZE) : [];

  let longTerm = baseLongTerm;
  if (oldMessages.length > 0) {
    const summary = await summarizeForMemory(oldMessages, longTerm);
    longTerm = appendMemoryLines(longTerm, splitMemoryLines(summary));
  }

  const ruleFacts = extractRuleBasedMemory(incomingMessages);
  longTerm = appendMemoryLines(longTerm, ruleFacts);

  const memory: Memory = {
    shortTerm,
    longTerm,
  };

  const modelMessages: Array<{ role: string; content: string }> = [];
  if (memory.longTerm) {
    modelMessages.push({
      role: "system",
      content: `以下是历史对话摘要（长期记忆）：\n${memory.longTerm}`,
    });
  }
  modelMessages.push(...memory.shortTerm);
  return { memory, modelMessages };
}

// 从自然语言里尽量提取城市名，支持常见助词/标点清洗。
// 先原文匹配，再清洗后匹配，最后返回清洗字符串供上层兜底提示。
function extractWeatherCity(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) return city;
  }
  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "")
    .replace(/\s+/g, "")
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "")
    .replace(/天气预报|天气情况|天气|温度|气温/g, "")
    .replace(/的/g, "");
  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) return city;
  }
  return cleaned;
}

// 查询实时天气，失败时返回用户可读错误文案。
// 外部依赖失败（城市不支持/API 不可用/字段缺失）都转成稳定中文提示，前端可直接展示。
async function realWeather(city: string): Promise<string> {
  const location = cityMap[city];
  if (!location) return "暂不支持该城市（当前仅支持：北京、上海）";
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`,
    { cache: "no-store" }
  );
  if (!res.ok) return "天气服务暂时不可用，请稍后再试";
  const data = (await res.json()) as {
    current_weather?: { temperature?: number; windspeed?: number };
  };
  const temperature = data.current_weather?.temperature;
  const windspeed = data.current_weather?.windspeed;
  if (typeof temperature !== "number") return "未获取到实时天气数据，请稍后重试";
  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : "";
  return `当前温度：${temperature}°C${windText}`;
}

// 获取最近一条用户消息，作为工具输入兜底来源。
// 当路由层 content/keyword 缺失时，仍可基于最后用户输入继续执行。
function getLatestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";
}

// chat 分支兜底：当路由内容不可用时，走普通聊天生成。
// 该函数只在默认聊天分支触发，避免“路由能判定、回答却为空”的空白回复。
async function generateFallbackChat(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const fallbackRes = await callOllama([
    {
      role: "system",
      content: "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。",
    },
    ...messages,
  ]);
  if (!fallbackRes.ok) return "抱歉，我现在暂时无法正常回答，请稍后再试。";
  const fallbackData = (await fallbackRes.json()) as { message?: { content?: string } };
  return (
    fallbackData.message?.content?.trim() || "抱歉，我现在暂时无法正常回答，请稍后再试。"
  );
}

// 总结任务的上下文选择：优先最近 6 条消息，缺失则回退到 fallback 文本。
// 这里限制窗口是为了控制总结 prompt 长度，降低模型波动和成本。
function pickSummaryContext(messages: ChatMessage[], fallbackText: string): string {
  const recent = messages.slice(-6);
  const context = recent
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");
  return context || fallbackText;
}

// 让模型生成结构化总结文本。
// 输出要求是“纯文本 bullet + 结论/下一步”，便于前端直接渲染为总结卡片。
async function summarizeWithModel(messages: ChatMessage[], fallbackText: string) {
  const content = pickSummaryContext(messages, fallbackText);
  const prompt = `
请总结以下对话，要求：
1. 提取关键信息
2. 用 3-5 条要点表达
3. 输出格式为纯文本项目符号，每行以"- "开头
4. 最后一行给出"结论："和"下一步："

对话：
${content}
`;
  const res = await callOllama([{ role: "user", content: prompt }]);
  if (!res.ok) {
    return "总结失败：模型暂时不可用，请稍后重试。";
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content?.trim();
  return text || "总结失败：未获取到有效结果。";
}

// 解析 todo JSON 数组，并清洗 task/done 字段。
// 任何一项不合法都会被过滤，确保最终返回给 UI 的 items 可直接展示。
function parseTodoItemsFromText(raw: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const task =
          typeof (item as { task?: unknown }).task === "string"
            ? (item as { task: string }).task.trim()
            : "";
        const done = Boolean((item as { done?: unknown }).done);
        if (!task) return null;
        return { task, done };
      })
      .filter((v): v is TodoItem => Boolean(v));
    return todos.length > 0 ? todos : null;
  } catch {
    return null;
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
`;
  const res = await callOllama([{ role: "user", content: prompt }]);
  if (!res.ok) {
    return [
      { task: "明确目标并拆分范围", done: false },
      { task: "先完成核心功能实现", done: false },
      { task: "执行自测并修复问题", done: false },
    ];
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const raw = data.message?.content?.trim() || "";
  const fromDirect = parseTodoItemsFromText(raw);
  if (fromDirect) return fromDirect;

  const wrapped = raw.match(/\[[\s\S]*\]/)?.[0];
  const fromWrapped = wrapped ? parseTodoItemsFromText(wrapped) : null;
  if (fromWrapped) return fromWrapped;

  return [
    { task: "分析需求并确认输入上下文", done: false },
    { task: "按优先级生成待办并细化步骤", done: false },
    { task: "执行任务后复盘结果", done: false },
  ];
}

export async function POST(req: Request) {
  // 记录请求总耗时，便于追踪慢请求。
  // 该时间覆盖“解析请求 + 记忆构建 + 路由 + 分发执行 + 响应”全链路。
  const requestStart = Date.now();
  try {
    const { messages, memory: incomingMemory } = (await req.json()) as {
      messages?: ChatMessage[];
      memory?: Partial<Memory>;
    };
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 先统一构建记忆，再生成本轮模型上下文。
    // 这样每个 action 分支都复用同一套上下文，不会出现分支之间记忆不一致。
    const { memory, modelMessages } = await buildMemory(messages, incomingMemory);
    // 用 systemPrompt 做意图路由，决定进入哪个业务分支。
    // 本次调用只负责“分类+抽取参数”，不负责最终业务回答。
    const routeRes = await callOllama([{ role: "system", content: systemPrompt }, ...modelMessages]);
    if (!routeRes.ok) {
      const data = await routeRes.json().catch(() => ({}));
      return Response.json(
        { error: (data as { error?: string }).error || "Ollama request failed" },
        { status: 500 }
      );
    }

    const routeData = (await routeRes.json()) as { message?: { content?: string } };
    const modelOutput = (routeData.message?.content || "").trim();
    // 规范化路由输出，尽量抵抗模型格式漂移。
    // toolInput 的优先级：parsed.content > latestUser，确保工具总能拿到输入。
    const parsed = parseModelOutput(modelOutput);
    const latestUser = getLatestUserText(memory.shortTerm);
    const toolInput = parsed.content || latestUser;
    const actionStart = Date.now();

    logAgent("route", {
      action: parsed.action,
      input: toolInput,
      shortTerm: memory.shortTerm.length,
      longTermChars: memory.longTerm.length,
    });

    // 每个业务响应都自动附带 memory，保证前后端状态一致。
    // 前端拿到后直接覆盖本地 memory，下一轮请求再携带回来形成闭环。
    const withMemory = <T extends Omit<ChatResponseBody, "memory">>(body: T): T & { memory: Memory } => ({
      ...body,
      memory,
    });

    // 根据 action 分发到具体能力：weather / summary / todo / chat。
    // 每个分支都记录耗时日志，方便后续比较不同能力调用性能。
    switch (parsed.action) {
      case "weather": {
        const keyword = extractWeatherCity(parsed.keyword || parsed.content || latestUser);
        const result = await realWeather(keyword);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json(withMemory({ type: "weather", keyword: keyword || "未知", result }));
      }
      case "summary": {
        const text = await summarizeWithModel(memory.shortTerm, toolInput);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json(withMemory({ type: "summary", text }));
      }
      case "todo": {
        const items = await generateTodosWithModel(toolInput);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json(withMemory({ type: "todo", items }));
      }
      default: {
        // chat 分支优先使用路由内容；空内容时才触发兜底聊天生成。
        // 这样可以减少一次模型调用，降低延迟；只有必要时才走 fallback。
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content
            : await generateFallbackChat(modelMessages);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json(withMemory({ type: "chat", content: chatContent }));
      }
    }
  } catch (error) {
    // 总兜底异常：统一返回 500，避免暴露内部细节。
    // 日志会保留真实错误信息用于排查，但接口仅返回通用错误文案。
    logAgent("error", {
      success: false,
      durationMs: Date.now() - requestStart,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
