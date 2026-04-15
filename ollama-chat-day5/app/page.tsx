"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// 后端接口返回两种结构：
// 1) chat: 直接返回可展示给用户的回答文本
// 2) search: 代表模型识别到“应触发搜索”意图，前端先展示关键词
type ChatApiResult =
  | {
      type: "chat";
      content: string;
    }
  | {
      type: "search";
      keyword: string;
    };

export default function HomePage() {
  // 输入框当前内容
  const [input, setInput] = useState("");
  // 会话消息列表（用户与助手消息按顺序追加）
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 请求进行中的开关：用于禁用输入/按钮并显示“处理中...”
  const [loading, setLoading] = useState(false);
  // 页面上展示的错误文本（例如网络异常、后端报错）
  const [errorText, setErrorText] = useState("");
  // 聊天滚动容器引用，用于新消息到达后自动滚动到底部
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 每当消息变化或 loading 状态变化时，都尝试平滑滚动到底部，
    // 避免用户手动滚动查看最新回复。
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend() {
    // 去掉首尾空格，避免发送“只有空白字符”的消息
    const userInput = input.trim();
    // loading=true 时阻止重复提交，避免并发请求打乱会话顺序
    if (!userInput || loading) return;

    // 新一轮发送前先清除旧错误，避免误导用户
    setErrorText("");

    // 先把用户消息“乐观地”插入本地列表，提升交互响应速度
    const withUser: ChatMessage[] = [
      ...messages,
      { role: "user", content: userInput },
    ];

    setMessages(withUser);
    // 立即清空输入框，符合聊天产品的常见交互习惯
    setInput("");
    setLoading(true);

    try {
      // 将“当前完整上下文”发送给后端，由后端转发给 Ollama。
      // 这里传 withUser 而不是 messages，确保最新用户提问被包含。
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: withUser }),
      });

      if (!res.ok) {
        // 统一处理非 2xx 响应：优先使用后端返回的 error 字段
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        // 把错误也作为一条助手消息追加到对话中，方便回溯上下文
        setMessages((prev) => [...prev, { role: "assistant", content }]);
        return;
      }

      const data = (await res.json()) as ChatApiResult;
      if (data.type === "search") {
        // 当前 demo 中，“search”类型仅展示关键词占位；
        // 后续可以在这里接入真实搜索服务并返回结果摘要。
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `🔍 搜索：${data.keyword}` },
        ]);
      } else {
        // chat 类型直接展示模型回答
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.content },
        ]);
      }
    } catch (error) {
      console.error(error);
      // fetch 抛异常通常是网络层问题（断网、服务未启动、跨域等）
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      setMessages((prev) => [
        ...prev,
        // 保持一条简短英文文案用于与 errorText 区分
        { role: "assistant", content: "Network error" },
      ]);
    } finally {
      // 无论成功失败都解除 loading，恢复输入能力
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // 阻止 form 默认刷新页面行为，改为 SPA 内部异步提交
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 5 - JSON Structured Output</h1>

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

      {/* 顶部错误提示：用于展示本轮请求失败原因 */}
      {errorText ? <p className="mb-3 text-sm text-red-600">{errorText}</p> : null}

      <div
        ref={listRef}
        className="max-h-[65vh] min-h-[220px] space-y-3 overflow-y-auto rounded border p-4"
      >
        {messages.length === 0 ? (
          // 空态提示：首次进入页面时显示
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
