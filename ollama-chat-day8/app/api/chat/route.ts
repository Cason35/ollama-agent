/**
 * 聊天 API：调用本地 Ollama，用结构化 JSON 区分「闲聊」与「搜索（天气）」，
 * 搜索分支再请求 Open-Meteo 返回真实天气；上下文条数与前端一致做裁剪。
 */

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** 模型按 systemPrompt 解析后的意图与展示/检索用字段 */
type ParsedOutput = {
  action: "chat" | "search";
  content: string;
  keyword: string;
};

/** 仅支持的城市 → 经纬度（供天气 API 使用） */
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
};

/** 参与 Ollama 请求的最大消息条数（与前端 buildRequestMessages 对齐） */
const MAX_CONTEXT_MESSAGES = 10;
/** 识别用户自我介绍类句子，用于上下文裁剪时始终保留「名字」记忆 */
const NAME_PATTERN = /(我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5]+)/;

/** 约束模型只输出 JSON，便于路由层解析 action / keyword */
const systemPrompt = `
你是一个AI助手，必须严格输出 JSON，不允许输出任何解释或 Markdown。

任务：
1) 若用户在查询天气、实时信息、搜索内容，action 必须为 "search"
2) 普通闲聊，action 为 "chat"
3) 当 action="search" 时，keyword 必须简短稳定：
   - 查询天气时，只保留城市名，例如："北京"
   - 不要包含 "帮我查"、"天气情况"、标点或完整句子

输出格式：
{
  "action": "chat | search",
  "content": "",
  "keyword": ""
}
`;

function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

/**
 * 裁剪上下文：只取最近 N 条；若更早的用户消息含「名字」等关键记忆且不在最近 N 条内，
 * 则把该条 prepend，避免长对话丢身份。
 */
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

/** 将模型 JSON 规范为合法 ParsedOutput，异常时回退为纯闲聊 */
function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  if (!input || typeof input !== "object") {
    return {
      action: "chat",
      content: rawText,
      keyword: "",
    };
  }

  const candidate = input as Partial<ParsedOutput>;
  const action = candidate.action === "search" ? "search" : "chat";
  const content =
    typeof candidate.content === "string" && candidate.content.trim().length > 0
      ? candidate.content.trim()
      : rawText;
  const keyword =
    typeof candidate.keyword === "string" ? candidate.keyword.trim() : "";

  return {
    action,
    content,
    keyword,
  };
}

/** 解析模型输出：整段 JSON 或从文本中提取 {...} 再解析；失败则当作普通回复 */
function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    const parsed = JSON.parse(modelOutput);
    return normalizeParsedOutput(parsed, modelOutput);
  } catch {
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return normalizeParsedOutput(parsed, modelOutput);
      } catch {
        // 提取的片段仍非法则走下方回退
      }
    }

    return {
      action: "chat",
      content: modelOutput,
      keyword: "",
    };
  }
}

/** 从用户/keyword 文案里解析城市名（先匹配已知城市，再清洗口语后缀后匹配） */
function extractWeatherCity(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

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

/** 调用 Open-Meteo 当前天气，仅 cityMap 内城市有结果 */
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

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    const trimmedMessages = trimMessages(messages);

    // 本地 Ollama：由模型根据 systemPrompt 输出 JSON，决定 chat / search
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages: [{ role: "system", content: systemPrompt }, ...trimmedMessages],
        stream: false,
      }),
    });

    const rawModelResponse = await res.clone().text();
    console.log("模型返回信息:", rawModelResponse);
    console.log("上下文条数:", trimmedMessages.length);

    if (!res.ok) {
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

    // search：用 keyword/内容/最近用户句解析城市，拉真实天气后返回 type: search
    if (parsed.action === "search") {
      const latestUserMessage = [...trimmedMessages]
        .reverse()
        .find((item) => item.role === "user")?.content;

      const sourceKeyword = parsed.keyword || parsed.content || latestUserMessage || "";
      const keyword = extractWeatherCity(sourceKeyword);
      const result = await realWeather(keyword);

      return Response.json({
        type: "search",
        keyword: keyword || "未知关键词",
        result,
      });
    }

    // 普通闲聊：直接返回模型解析后的 content
    return Response.json({
      type: "chat",
      content: parsed.content,
    });
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
