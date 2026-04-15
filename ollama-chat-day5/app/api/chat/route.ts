type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// 规范化后的模型输出结构：
// - action=chat   表示常规对话
// - action=search 表示识别为“搜索意图”
// content/keyword 都兜底为字符串，避免前端处理 undefined
type ParsedOutput = {
  action: "chat" | "search";
  content: string;
  keyword: string;
};

// 强约束系统提示词：要求模型“只输出 JSON”，用于降低解析不稳定性。
// 即便如此，大模型仍可能夹带自然语言，所以后面仍需兜底解析。
const systemPrompt = `
你是一个AI助手，你必须严格按照JSON格式输出，不允许输出任何额外文字。
你必须只输出JSON，不允许出现任何解释、说明、前后缀文本。

格式如下：
{
  "action": "chat | search",
  "content": "回答内容",
  "keyword": "如果是search，这里是关键词"
}
`;

function normalizeParsedOutput(input: unknown, rawText: string): ParsedOutput {
  // 若不是对象，直接回退为 chat，保留原始文本，保证接口始终可返回
  if (!input || typeof input !== "object") {
    return {
      action: "chat",
      content: rawText,
      keyword: "",
    };
  }

  const candidate = input as Partial<ParsedOutput>;
  // action 只允许 chat/search，非法值统一回退到 chat
  const action = candidate.action === "search" ? "search" : "chat";
  // content 缺失或空串时回退到 rawText，尽量不丢失模型信息
  const content =
    typeof candidate.content === "string" && candidate.content.trim().length > 0
      ? candidate.content.trim()
      : rawText;
  // keyword 允许为空串，交给上层决定是否使用 content 兜底
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
    // 理想路径：模型完全按约定输出纯 JSON
    const parsed = JSON.parse(modelOutput);
    return normalizeParsedOutput(parsed, modelOutput);
  } catch {
    // 常见情况：模型输出 "好的，以下是JSON：{...}"，
    // 先抽取首个 JSON 块再解析，提升容错能力。
    const jsonMatch = modelOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return normalizeParsedOutput(parsed, modelOutput);
      } catch {
        // 抽取后仍不可解析，继续走最终兜底
      }
    }

    // 最终兜底：把模型原文当作普通 chat 内容返回，
    // 避免因为 JSON 解析失败导致整个接口报错。
    return {
      action: "chat",
      content: modelOutput,
      keyword: "",
    };
  }
}

export async function POST(req: Request) {
  try {
    // 读取并校验前端传入的会话历史
    const { messages } = (await req.json()) as { messages?: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 调用本地 Ollama chat 接口；stream=false 方便直接拿完整文本做 JSON 解析
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 这里可按需替换成你本地已有的模型名
        model: "qwen2.5:14b",
        // 把系统提示放在最前面，引导模型稳定输出结构化 JSON
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
      }),
    });

    if (!res.ok) {
      // Ollama 返回非 2xx：尝试透传其错误信息，方便前端定位问题
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
    // 将模型输出统一转为 ParsedOutput，屏蔽模型“格式不稳定”细节
    const parsed = parseModelOutput(modelOutput);

    if (parsed.action === "search") {
      // search 分支：优先使用 keyword，缺失时回退到 content 作为关键词
      return Response.json({
        type: "search",
        keyword: parsed.keyword || parsed.content,
      });
    }

    // chat 分支：直接返回处理后的文本内容
    return Response.json({
      type: "chat",
      content: parsed.content,
    });
  } catch (error) {
    // 兜底异常捕获，防止未处理异常导致服务崩溃
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
