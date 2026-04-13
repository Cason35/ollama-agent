import { NextRequest, NextResponse } from "next/server";

/**
 * Day2 任务：App Router 路由处理器
 * 浏览器只请求本站的 /api/chat；由 Next 服务端再转发到本机 Ollama（默认 11434），
 * 避免浏览器直连 Ollama 带来的 CORS、密钥暴露等问题（后续可在此加鉴权、限流等）。
 */
export async function POST(req: NextRequest) {
  try {
    // ---------- 任务节点 1：解析请求体 ----------
    // 前端 POST JSON：{ "message": "用户问题" }；需 await，因为 body 是流。
    const body = await req.json();
    const { message } = body;

    // ---------- 任务节点 2：参数校验 ----------
    // 缺 message 时直接 400，避免无意义地打到 Ollama。
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // ---------- 任务节点 3：调用 Ollama Chat API ----------
    // 与 Day1 脚本一致：POST /api/chat，非流式 stream:false，便于一次性取完整回复。
    // 模型名须与本机 `ollama list` 中一致；若未拉取会由下方 response.ok 分支报错。
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
        stream: false,
      }),
    });

    // ---------- 任务节点 4：处理 Ollama 返回的非 2xx ----------
    // 把 Ollama 返回的正文带给前端，便于排查（如模型不存在、显存不足等）。
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Ollama request failed: ${errorText}` },
        { status: 500 }
      );
    }

    // ---------- 任务节点 5：解析成功响应并映射为前端字段 ----------
    // Ollama chat 非流式 JSON 中，助手文本一般在 message.content。
    const data = await response.json();

    return NextResponse.json({
      reply: data.message?.content ?? "No response from model",
      raw: data,
    });
  } catch (error) {
    // ---------- 任务节点 6：兜底：网络异常、JSON 解析失败等 ----------
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
