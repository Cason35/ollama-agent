// 用户与助手之间的一条对话消息。
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// 解析后统一使用的模型输出结构。
type ParsedOutput = {
  action: "chat" | "search";
  content: string;
  keyword: string;
};

// 天气工具调用使用的固定城市经纬度映射。
const cityMap: Record<string, { lat: number; lon: number }> = {
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
};

// 系统提示词：强制模型输出结构化 JSON，
// 便于服务端稳定判断是直接回复还是调用工具。
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

function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  // 如果解析结果不是对象，则回退到普通聊天模式。
  if (!input || typeof input !== "object") {
    return {
      action: "chat",
      content: rawText,
      keyword: "",
    };
  }

  // 对各字段做防御性归一化，避免模型输出不规范导致运行时问题
  // （如缺少字段、类型错误、空字符串等）。
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

function parseModelOutput(modelOutput: string): ParsedOutput {
  try {
    // 优先路径：模型输出本身就是合法 JSON。
    const parsed = JSON.parse(modelOutput);
    return normalizeParsedOutput(parsed, modelOutput);
  } catch {
    // 恢复路径：当模型夹带说明文字时，尝试提取其中的 JSON 片段。
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return normalizeParsedOutput(parsed, modelOutput);
      } catch {
        // ignore and fallback
      }
    }

    // 最终兜底：把原始文本当作聊天内容返回。
    return {
      action: "chat",
      content: modelOutput,
      keyword: "",
    };
  }
}

function extractWeatherCity(text: string): string {
  // 将自然语言请求提炼为简洁的城市关键词。
  const trimmed = text.trim();
  if (!trimmed) return "";

  // 快速路径：原始文本中直接包含支持的城市名。
  for (const city of Object.keys(cityMap)) {
    if (trimmed.includes(city)) {
      return city;
    }
  }

  // 通过去掉语气词和天气相关后缀，做文本归一化。
  const cleaned = trimmed
    .replace(/[，。！？、,.!?]/g, "")
    .replace(/\s+/g, "")
    .replace(/帮我|请|一下|查一下|查下|查一查|查|查询|搜索/g, "")
    .replace(/天气预报|天气情况|天气|温度|气温/g, "")
    .replace(/的/g, "");

  // 清洗后再匹配一次，提升命中率。
  for (const city of Object.keys(cityMap)) {
    if (cleaned.includes(city)) {
      return city;
    }
  }

  return cleaned;
}

async function realWeather(city: string): Promise<string> {
  // 先校验支持范围（当前示例仅支持两个城市）。
  const location = cityMap[city];
  if (!location) {
    return "暂不支持该城市（当前仅支持：北京、上海）";
  }

  // 请求 Open-Meteo 实时天气，并关闭缓存保证数据新鲜。
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

  // 将温度作为必需字段，缺失时返回友好错误信息。
  if (typeof temperature !== "number") {
    return "未获取到实时天气数据，请稍后重试";
  }

  const windText = typeof windspeed === "number" ? `，风速：${windspeed}km/h` : "";
  return `当前温度：${temperature}°C${windText}`;
}

export async function POST(req: Request) {
  try {
    // 客户端传入完整上下文，便于模型理解对话语境。
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 第一步：调用本地 Ollama，让模型完成意图分类并输出 JSON。
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
      }),
    });

    // 打印模型接口返回的原始内容，便于调试排查。
    const rawModelResponse = await res.clone().text();
    console.log("模型返回信息:", rawModelResponse);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(
        { error: (data as { error?: string })?.error || "Ollama request failed" },
        { status: 500 }
      );
    }

    // 第二步：将模型输出规范化为内部统一结构。
    const data = (await res.json()) as {
      message?: { content?: string };
    };
    const modelOutput = (data.message?.content || "").trim();
    const parsed = parseModelOutput(modelOutput);

    if (parsed.action === "search") {
      // 按优先级构造关键词来源：keyword -> content -> 最新用户消息。
      const latestUserMessage = [...messages]
        .reverse()
        .find((item) => item.role === "user")?.content;

      const sourceKeyword = parsed.keyword || parsed.content || latestUserMessage || "";
      const keyword = extractWeatherCity(sourceKeyword);
      const result = await realWeather(keyword);

      // 执行天气工具，并返回工具响应格式的数据。
      return Response.json({
        type: "search",
        keyword: keyword || "未知关键词",
        result,
      });
    }

    // 默认分支：直接返回助手文本回复。
    return Response.json({
      type: "chat",
      content: parsed.content,
    });
  } catch (error) {
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
