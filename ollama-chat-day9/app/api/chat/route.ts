/**
 * 多工具聊天 API：Ollama 按 JSON 输出 action（chat | weather | summary | todo），
 * 后端按 action 调用对应工具；天气走 Open-Meteo；上下文裁剪与 Day8 一致。
 */

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
1) 用户问天气、气温、某城市天气 → action 为 "weather"
2) 用户要总结、概括、归纳某段话或内容 → action 为 "summary"
3) 用户要做计划、列待办、任务清单、安排步骤 → action 为 "todo"
4) 普通闲聊、问候、一般问答 → action 为 "chat"

字段规则：
- 当 action="chat" 时，content 必须是给用户的直接回复，不能为空
- 当 action="weather" 时，keyword 只保留城市名，例如 "北京"（不要口语、标点）
- 当 action="summary" 时，content 为需要被总结的文本；若用户一句话里已包含，请完整放入 content
- 当 action="todo" 时，content 里写用户关心的主题或需求要点，便于拆任务
- 若与天气无关，keyword 可为空字符串

输出格式（仅一行 JSON）：
{
  "action": "chat" | "weather" | "summary" | "todo",
  "content": "",
  "keyword": ""
}
`;

/**
 * 判断用户消息是否包含需要长期保留的关键信息（如姓名）。
 */
function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

/**
 * 裁剪会话上下文：保留最近窗口消息，并尽量保留一条关键记忆消息。
 */
function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  // 只保留最近 N 轮消息，控制 token 成本与响应速度。
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  // 关键记忆（如用户姓名）尽量保留，避免被窗口裁剪掉。
  const keyUserMessage = messages.find(
    (msg) => msg.role === "user" && isKeyUserMemory(msg.content)
  );

  if (!keyUserMessage || recentMessages.includes(keyUserMessage)) {
    return recentMessages;
  }

  return [keyUserMessage, ...recentMessages];
}

/**
 * 将模型返回的 action 规范化到系统支持的枚举值，未知值统一回落到 chat。
 */
function normalizeAction(raw: unknown): Action {
  if (raw === "weather" || raw === "search") return "weather";
  if (raw === "summary") return "summary";
  if (raw === "todo") return "todo";
  return "chat";
}

/**
 * 对模型解析结果做字段清洗，确保 action/content/keyword 三个字段可安全使用。
 */
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  // 模型未按 JSON 输出时，降级为普通聊天，避免接口直接失败。
  if (!input || typeof input !== "object") {
    return {
      action: "chat",
      content: rawText,
      keyword: "",
    };
  }

  const candidate = input as Partial<ParsedOutput>;
  const action = normalizeAction(candidate.action);
  const content =
    typeof candidate.content === "string" && candidate.content.trim().length > 0
      ? candidate.content.trim()
      : "";
  const keyword =
    typeof candidate.keyword === "string" ? candidate.keyword.trim() : "";

  return {
    action,
    content,
    keyword,
  };
}

/**
 * 生成总结结果（当前为 Day9 占位实现）。
 */
function summarize(text: string): string {
  // Day9 先用本地占位总结逻辑，后续可替换为真实总结模型。
  return "总结：" + text.slice(0, 50);
}

/**
 * 生成待办列表（当前为 Day9 占位实现）。
 */
function generateTodos(_text: string): string[] {
  return ["1. 分析需求", "2. 编写代码", "3. 测试功能"];
}

/**
 * 当结构化调用失败时，发起一次纯聊天请求作为兜底回复。
 */
async function generateFallbackChat(messages: ChatMessage[]): Promise<string> {
  // 主调用输出异常时，走一次“纯聊天”兜底，提升可用性。
  const fallbackSystemPrompt =
    "你是一个简洁、友好的中文助手。请直接回答用户，不要输出 JSON。";

  const fallbackRes = await fetch(OLLAMA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: "system", content: fallbackSystemPrompt }, ...messages],
      stream: false,
    }),
  });

  if (!fallbackRes.ok) {
    return "抱歉，我现在暂时无法正常回答，请稍后再试。";
  }

  const fallbackData = (await fallbackRes.json()) as {
    message?: { content?: string };
  };

  return (
    fallbackData.message?.content?.trim() ||
    "抱歉，我现在暂时无法正常回答，请稍后再试。"
  );
}

/**
 * 解析模型输出：优先直接 JSON，其次提取文本中的 JSON，最终回退到 chat 文本。
 */
function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    const parsed = JSON.parse(modelOutput);
    return normalizeParsedOutput(parsed, modelOutput);
  } catch {
    // 兼容模型返回“前后夹杂文本 + JSON”的场景。
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return normalizeParsedOutput(parsed, modelOutput);
      } catch {
        // ignore
      }
    }

    return {
      action: "chat",
      content: modelOutput,
      keyword: "",
    };
  }
}

/**
 * 从用户表达中提取天气查询城市，先词典匹配，再文本清洗后匹配。
 */
function extractWeatherCity(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // 优先命中内置城市词典，避免过度清洗造成误判。
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) {
      return city;
    }
  }

  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "")
    .replace(/\s+/g, "")
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "")
    .replace(/天气预报|天气情况|天气|温度|气温/g, "")
    .replace(/的/g, "");

  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) {
      return city;
    }
  }

  return cleaned;
}

/**
 * 调用 Open-Meteo 获取实时天气，并格式化为前端可展示的文本。
 */
async function realWeather(city: string): Promise<string> {
  const location = cityMap[city];
  if (!location) {
    return "暂不支持该城市（当前仅支持：北京、上海）";
  }

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    return "天气服务暂时不可用，请稍后再试";
  }

  const data = (await res.json()) as {
    current_weather?: {
      temperature?: number;
      windspeed?: number;
    };
  };

  const temperature = data.current_weather?.temperature;
  const windspeed = data.current_weather?.windspeed;

  if (typeof temperature !== "number") {
    return "未获取到实时天气数据，请稍后重试";
  }

  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : "";
  return `当前温度：${temperature}°C${windText}`;
}

/**
 * 获取当前上下文中最新一条用户消息，用于 summary/todo/chat 的内容兜底。
 */
function getLatestUserText(messages: ChatMessage[]): string {
  return (
    [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || ""
  );
}

/**
 * 聊天主入口：接收消息、调用模型做意图路由，再分发到具体业务工具执行。
 */
export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    const trimmedMessages = trimMessages(messages);

    // 第一步：让模型做“意图路由”，统一返回 action/content/keyword。
    const res = await fetch(OLLAMA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...trimmedMessages],
        stream: false,
      }),
    });

    if (!res.ok) {
      // 模型服务异常时，将上游错误信息透传给前端，便于定位问题。
      const data = await res.json().catch(() => ({}));
      return Response.json(
        { error: (data as { error?: string })?.error || "Ollama request failed" },
        { status: 500 }
      );
    }

    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const modelOutput = (data.message?.content || "").trim();
    const parsed = parseModelOutput(modelOutput);
    const latestUser = getLatestUserText(trimmedMessages);

    // 第二步：后端根据 action 调用对应业务工具。
    switch (parsed.action) {
      case "weather": {
        // 天气关键词优先级：keyword > content > 最新用户输入。
        const sourceKeyword =
          parsed.keyword || parsed.content || latestUser;
        const keyword = extractWeatherCity(sourceKeyword);
        const result = await realWeather(keyword);
        return Response.json({
          type: "weather",
          keyword: keyword || "未知",
          result,
        });
      }

      case "summary": {
        // 优先使用模型抽取的待总结文本；没有则回退到用户原话。
        const text = parsed.content || latestUser;
        return Response.json({
          type: "summary",
          text: summarize(text),
        });
      }

      case "todo": {
        // todo 与 summary 一样，优先用模型提取内容，避免上下文歧义。
        const text = parsed.content || latestUser;
        return Response.json({
          type: "todo",
          items: generateTodos(text),
        });
      }

      default: {
        // 普通聊天分支：若模型 content 为空，触发 fallback 确保有可读回复。
        const chatContent =
          parsed.content.trim().length > 0
            ? parsed.content
            : await generateFallbackChat(trimmedMessages);
        return Response.json({
          type: "chat",
          content: chatContent,
        });
      }
    }
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
