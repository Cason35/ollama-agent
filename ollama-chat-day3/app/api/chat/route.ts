export async function POST(req: Request) {
  try {
    // 从前端请求体中解析出对话消息数组
    const { messages } = await req.json();

    // 基础参数校验：必须是非空数组，否则直接返回 400
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "messages is required" }, { status: 400 });
    }

    // 将消息转发给本地 Ollama 服务
    // stream: false 表示等待完整结果后一次性返回
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen2.5:14b",
        messages,
        stream: false,
      }),
    });

    // 解析 Ollama 返回的 JSON 结构
    const data = await res.json();

    // Ollama 返回非 2xx 时，统一包装成后端错误响应给前端
    if (!res.ok) {
      return Response.json(
        { error: data?.error || "Ollama request failed" },
        { status: 500 }
      );
    }

    // 仅向前端暴露实际回复文本，避免耦合 Ollama 原始响应结构
    return Response.json({
      reply: data?.message?.content ?? "No response from model",
    });
  } catch (error) {
    // 兜底异常处理：覆盖 JSON 解析失败、网络异常等不可预期错误
    console.error("API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
