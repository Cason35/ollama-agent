"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

// UI 状态与 API 请求共用的消息结构。
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// API 响应的可辨识联合类型：
// - `chat` 表示普通助手回复
// - `search` 表示工具调用结果
type ChatApiResult =
  | {
      type: "chat";
      content: string;
    }
  | {
      type: "search";
      keyword: string;
      result: string;
    };

export default function HomePage() {
  // `input`：当前输入框草稿
  // `messages`：已渲染的对话记录
  // `loading`：请求进行中，防止重复发送
  // `errorText`：页面上的轻量错误提示
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  // 消息列表容器引用，用于自动滚动到最新消息。
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 当消息或加载状态变化时，自动滚动到底部。
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend() {
    // 忽略空输入，并在请求中阻止重复发送。
    const userInput = input.trim();
    if (!userInput || loading) return;

    setErrorText("");

    // 乐观更新：先把用户消息加入列表，再等待服务端响应。
    const withUser: ChatMessage[] = [
      ...messages,
      { role: "user", content: userInput },
    ];

    setMessages(withUser);
    setInput("");
    setLoading(true);

    try {
      // 发送完整对话上下文，保证后端/模型有足够语境。
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: withUser }),
      });

      if (!res.ok) {
        // 后端报错时，同时展示页面错误文本和助手气泡消息。
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        setMessages((prev) => [...prev, { role: "assistant", content }]);
        return;
      }

      const data = (await res.json()) as ChatApiResult;
      if (data.type === "search") {
        // 将工具结果渲染为两行紧凑格式的助手消息。
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `🔍 ${data.keyword}\n📌 ${data.result}`,
          },
        ]);
      } else {
        // 普通聊天回复分支。
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.content },
        ]);
      }
    } catch (error) {
      // 网络或传输层异常（如服务未启动、Ollama 不可达等）。
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error" }]);
    } finally {
      // 无论成功失败，都在结束时释放 loading 状态。
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // 阻止表单默认跳转，统一走异步发送逻辑。
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 7 - 真实 Tool Calling（实时天气）</h1>

      <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="请输入你的问题（例如：帮我查北京天气）"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "处理中..." : "发送"}
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
              <p>{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
