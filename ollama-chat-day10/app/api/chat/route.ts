type ChatMessage = {
  role: "user" | "assistant";
  content: string;
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

const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
};

const MAX_CONTEXT_MESSAGES = 10;
const NAME_PATTERN = /(我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5]+)/;
const OLLAMA_API_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "qwen2.5:14b";

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

// 统一日志出口：便于后续在终端里快速按 [Agent] 前缀筛查路由决策与耗时。
function logAgent(event: string, payload: Record<string, unknown>) {
  console.log(`[Agent] ${event}`, payload);
}

// 对 Ollama 调用做一层薄封装，统一 model / stream / headers 配置，
// 避免在不同业务函数中重复拼接请求体。
async function callOllama(messages: Array<{ role: string; content: string }>) {
  const res = await fetch(OLLAMA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
    }),
  });
  return res;
}

function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

// 对话上下文裁剪策略：
// - 保留最近 N 条，限制上下文长度；
// - 若早期消息包含关键用户记忆（如姓名），即使超窗也前置补回。
function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  const keyUserMessage = messages.find(
    (msg) => msg.role === "user" && isKeyUserMemory(msg.content)
  );
  if (!keyUserMessage || recentMessages.includes(keyUserMessage)) {
    return recentMessages;
  }
  return [keyUserMessage, ...recentMessages];
}

// 兼容模型可能给出的别名（如 search -> weather），并保证 action 落在受控枚举内。
function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather";
  if (raw === "summary") return "summary";
  if (raw === "todo") return "todo";
  return "chat";
}

// 将模型输出规范化为稳定结构：
// - 非法结构回退为 chat；
// - content/keyword 做 trim；
// - action 强制归一到 Action 类型。
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

// 解析模型输出的容错逻辑：
// 1) 先尝试直接 JSON.parse；
// 2) 失败后尝试从文本中抽取首个 JSON 片段；
// 3) 仍失败则按普通聊天文本兜底，避免请求整体失败。
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

// 从用户查询中提取天气城市：
// - 优先命中 cityMap 中的已支持城市；
// - 再做一轮文本清洗（去语气词/标点/天气关键词）后匹配；
// - 最后返回清洗结果供上层继续处理。
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

// 调用 open-meteo 实时天气接口，并转换为可直接展示的中文文本。
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

// 获取“最近一次用户输入”，用于工具分支缺省参数兜底。
function getLatestUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";
}

// 当路由结果为 chat 且没有可直接复用内容时，使用一个“非 JSON 模式”的回退调用。
// 这样即使第一轮结构化路由输出异常，也能给用户自然语言回复。
async function generateFallbackChat(messages: ChatMessage[]): Promise<string> {
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

// 选择用于“总结”任务的上下文：
// - 优先使用最近几轮真实对话（保留角色标签）；
// - 若对话为空则回退到调用方提供的文本。
function pickSummaryContext(messages: ChatMessage[], fallbackText: string): string {
  const recent = messages.slice(-6);
  const context = recent
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");
  return context || fallbackText;
}

// 使用模型生成结构化总结（要点 + 结论 + 下一步）。
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

// 解析待办 JSON 数组并做类型清洗，确保返回给前端的数据稳定可渲染。
function parseTodoItemsFromText(raw: string): TodoItem[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const todos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const task = typeof (item as { task?: unknown }).task === "string"
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

// 生成待办任务：
// - 先要求模型返回 JSON 数组；
// - 若模型输出夹杂说明文本，则尝试提取中括号数组再次解析；
// - 全部失败时返回默认待办，保证业务始终可用。
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
  // 用于全链路错误日志记录总耗时（包括路由判别 + 工具调用）。
  const requestStart = Date.now();
  try {
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 先让模型做“意图路由”：输出 action/chat-content/keyword 的 JSON。
    const trimmedMessages = trimMessages(messages);
    const routeRes = await callOllama([
      { role: "system", content: systemPrompt },
      ...trimmedMessages,
    ]);
    if (!routeRes.ok) {
      const data = await routeRes.json().catch(() => ({}));
      return Response.json(
        { error: (data as { error?: string }).error || "Ollama request failed" },
        { status: 500 }
      );
    }

    const routeData = (await routeRes.json()) as { message?: { content?: string } };
    const modelOutput = (routeData.message?.content || "").trim();
    const parsed = parseModelOutput(modelOutput);
    const latestUser = getLatestUserText(trimmedMessages);
    const toolInput = parsed.content || latestUser;
    const actionStart = Date.now();

    // 记录路由决策，便于观察模型是否按预期分类 action。
    logAgent("route", { action: parsed.action, input: toolInput });

    // 根据 action 分派到不同业务工具分支，并返回统一的 type + payload。
    switch (parsed.action) {
      case "weather": {
        const keyword = extractWeatherCity(parsed.keyword || parsed.content || latestUser);
        const result = await realWeather(keyword);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json({ type: "weather", keyword: keyword || "未知", result });
      }
      case "summary": {
        const text = await summarizeWithModel(trimmedMessages, toolInput);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json({ type: "summary", text });
      }
      case "todo": {
        const items = await generateTodosWithModel(toolInput);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json({ type: "todo", items });
      }
      default: {
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content
            : await generateFallbackChat(trimmedMessages);
        logAgent("result", {
          action: parsed.action,
          durationMs: Date.now() - actionStart,
          success: true,
        });
        return Response.json({ type: "chat", content: chatContent });
      }
    }
  } catch (error) {
    // 所有未捕获异常统一返回 500，避免向前端暴露内部堆栈细节。
    logAgent("error", {
      success: false,
      durationMs: Date.now() - requestStart,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
