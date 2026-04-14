"use client";

/**
 * Day 4 聊天页：前端只负责展示与输入；模型推理经 Next.js API 转发到本机 Ollama。
 * 助手回复采用流式：后端透传 NDJSON，本页用 ReadableStream + 行缓冲拼出增量文本并实时更新 UI。
 */

import { FormEvent, useEffect, useRef, useState } from "react";

/** 单条对话：与 Ollama chat API 的 message 角色对齐（本页仅展示 user / assistant） */
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * 消费 Ollama 流式响应中的一段原始文本缓冲区。
 *
 * 业务背景：Ollama `/api/chat` 在 stream:true 时返回 **按行分隔的 NDJSON**（每行一个 JSON 对象），
 * 对象里通常含 `message.content` 表示本帧增量。网络分块可能把一行截断到两次 read 之间，
 * 因此必须保留「未凑满一行」的尾部到下次再拼。
 *
 * @param buffer 已累计的 UTF-8 文本（可能含多行、末行可能不完整）
 * @param onDelta 每解析出一小段助手正文就回调（用于拼 fullText）
 * @returns 仍未形成完整行的剩余字符串，应作为下一轮 buffer 的前缀继续拼接
 */
function consumeOllamaNdjsonLines(
  buffer: string,
  onDelta: (piece: string) => void
): string {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";

  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as {
        message?: { content?: string };
      };
      const piece = obj.message?.content;
      if (typeof piece === "string" && piece.length > 0) {
        onDelta(piece);
      }
    } catch {
      // 单行非合法 JSON 时跳过（常见原因是上行 chunk 截断，剩余部分在 buffer 里下轮再解）
    }
  }

  return rest;
}

export default function HomePage() {
  const [input, setInput] = useState("");
  /** 完整会话列表；最后一条若为 assistant 且 content 逐步变长，即表示流式输出中 */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** 请求进行中：禁用输入、按钮文案切换，并与「思考中」占位联动 */
  const [loading, setLoading] = useState(false);
  /** 非流式错误（HTTP 失败等）在表单下方展示；流式内的错误会写入最后一条 assistant */
  const [errorText, setErrorText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  /** 新消息或加载态变化时把列表滚到底部，保证长回复时用户始终看到最新内容 */
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  /**
   * 发送一轮对话：
   * 1）先把用户消息并入历史 withUser，并立刻追加一条空的 assistant 占位（便于流式往里填字）；
   * 2）POST 只传 messages，模型与流式开关由服务端 route 决定；
   * 3）成功时用 getReader 读 body，按 chunk 解码 UTF-8，用 consumeOllamaNdjsonLines 抽出增量并累加到 fullText，
   *    每处理一段就 setMessages 更新最后一条 assistant，实现打字机效果；
   * 4）流结束时再 flush decoder、处理最后一截 buffer，保证不丢尾字。
   */
  async function handleSend() {
    const userInput = input.trim();
    if (!userInput || loading) return;

    setErrorText("");

    // 提交给 API 的历史 = 旧消息 + 本轮用户输入（不含当前仍为空的 assistant 占位）
    const withUser: ChatMessage[] = [
      ...messages,
      { role: "user", content: userInput },
    ];

    // UI 上立刻多出一条 assistant，content 先为空；流式过程中会反复更新同一条
    setMessages([...withUser, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: withUser,
        }),
      });

      // 4xx/5xx：服务端返回 JSON { error }，不走流，直接展示错误并给 assistant 一条固定文案
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorText(data.error || "请求失败，请稍后重试");
        setMessages([
          ...withUser,
          {
            role: "assistant",
            content: data.error || "Request failed",
          },
        ]);
        return;
      }

      // 2xx：正文应为 Ollama 转发的 NDJSON 流
      const reader = res.body?.getReader();
      if (!reader) {
        setErrorText("无法读取响应流");
        setMessages([
          ...withUser,
          { role: "assistant", content: "No response body" },
        ]);
        return;
      }

      const decoder = new TextDecoder("utf-8");
      /** 跨二进制 chunk 拼字符串用的行缓冲（半行 NDJSON 会留在这里） */
      let lineBuffer = "";
      /** 当前轮助手回复已展示的完整文本，与最后一条 assistant 的 content 同步 */
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 流结束：decode() 无参数会输出内部剩余字符，再扫一遍 NDJSON，避免最后几字留在 buffer
          lineBuffer += decoder.decode();
          lineBuffer = consumeOllamaNdjsonLines(lineBuffer, (piece) => {
            fullText += piece;
          });
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: fullText };
            }
            return next;
          });
          break;
        }

        lineBuffer += decoder.decode(value, { stream: true });
        lineBuffer = consumeOllamaNdjsonLines(lineBuffer, (piece) => {
          fullText += piece;
        });

        // 每读一块就刷新 UI，用户能看到逐字/逐段生成
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: fullText };
          }
          return next;
        });
      }
    } catch (error) {
      // fetch 失败、断网等：兜底文案写入最后一条 assistant，并提示检查 Ollama
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: "Network error" };
        }
        return next;
      });
    } finally {
      // 无论成功、HTTP 错误还是异常，都要结束 loading，避免界面永久卡在「生成中」
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleSend();
  }

  const last = messages[messages.length - 1];
  /**
   * 仅在「已追加 assistant 占位但尚未收到任何 NDJSON 正文」时显示「思考中…」，
   * 与已有内容后的流式输出区分（有内容后即使仍在 loading 也显示已生成的字）。
   */
  const streamingAssistant =
    loading && last?.role === "assistant" && last.content === "";

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 4 - Ollama Chat（Streaming）</h1>

      <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="请输入你的问题"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "生成中..." : "发送"}
        </button>
      </form>

      {errorText ? <p className="mb-3 text-sm text-red-600">{errorText}</p> : null}

      <div
        ref={listRef}
        className="max-h-[65vh] min-h-[220px] space-y-3 overflow-y-auto rounded border p-4"
      >
        {messages.length === 0 ? (
          <p className="text-gray-500">聊天记录会显示在这里</p>
        ) : (
          messages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              className={`whitespace-pre-wrap rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "ml-8 bg-black text-white"
                  : "mr-8 bg-gray-100 text-black"
              }`}
            >
              <p className="mb-1 text-xs opacity-70">
                {msg.role === "user" ? "你" : "助手"}
              </p>
              <p>
                {msg.role === "assistant" &&
                msg.content === "" &&
                streamingAssistant
                  ? "思考中..."
                  : msg.content}
              </p>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
