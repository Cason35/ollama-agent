/**
 * 聊天 API 路由（业务代理层）：
 * - 浏览器只请求同源 `/api/chat`，避免直接跨域访问本机 Ollama，也便于以后统一换模型、鉴权、限流。
 * - 请求体仅需 `messages`（OpenAI 风格的对话数组）；模型名、是否流式在此固定，与前端解耦。
 * - 成功时 **不缓冲** 整段回复，直接把 Ollama 返回的 ReadableStream 原样交给 Next Response，
 *   前端按 NDJSON 行解析即可实现流式展示。
 */

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // 前端必须带上至少一条对话；空数组或缺少 messages 时直接 400，避免无意义打到 Ollama
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 转发到本机 Ollama HTTP API（默认端口 11434）；需本机已 ollama serve 且已拉取对应模型
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages,
        // 开启流式，与前端协商好
        stream: true,
      }),
    });

    // Ollama 在模型不存在、显存不足等情况下会返回非 2xx，通常 body 为 JSON { error: "..." }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(
        { error: (data as { error?: string })?.error || "Ollama request failed" },
        { status: 500 }
      );
    }

    // 2xx 但无 body 的异常情况（极少见），无法流式转发给前端
    if (!res.body) {
      return Response.json({ error: "Empty stream from Ollama" }, { status: 500 });
    }

    // 透传 Ollama 的 Content-Type（流式多为 NDJSON / 文本类），便于客户端按行解析
    const contentType = res.headers.get("Content-Type") ?? "application/x-ndjson";

    // 将字节流直接 pipe 给浏览器；不设置 Content-Length，由 chunked 传输
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        // 禁止 CDN/浏览器把整段流缓存成「整页」再一次性给前端
        "Cache-Control": "no-cache",
        // 保持连接，利于长回复流不断开（具体行为依运行时与代理而定）
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    // JSON 解析失败、本机 Ollama 未启动导致连接拒绝等都会进这里
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
