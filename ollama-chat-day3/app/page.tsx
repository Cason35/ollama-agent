"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

// 聊天消息的数据结构：
// role 用于区分消息来源（用户 / 助手），content 为消息正文
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function HomePage() {
  // 输入框当前内容
  const [input, setInput] = useState("");
  // 完整聊天记录（按时间顺序）
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 是否正在等待模型响应，用于禁用输入与展示“思考中”
  const [loading, setLoading] = useState(false);
  // 顶部错误提示文案
  const [errorText, setErrorText] = useState("");
  // 聊天列表容器引用，用于在新消息出现时自动滚动到底部
  const listRef = useRef<HTMLDivElement>(null);

  // 当消息更新或进入/结束加载时，自动平滑滚动到最新内容
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend() {
    // 去除首尾空格，避免发送纯空白消息
    const userInput = input.trim();
    // loading 时直接返回，防止重复提交请求
    if (!userInput || loading) return;

    // 每次发送前清空上一次的错误提示
    setErrorText("");

    // 先乐观更新 UI：立即把用户消息加入列表
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userInput },
    ];

    setMessages(newMessages);
    // 清空输入框，提升交互流畅度
    setInput("");
    setLoading(true);

    try {
      // 调用本地 Next.js API 路由，再由后端代理到 Ollama
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
        }),
      });

      const data = await res.json();

      // 非 2xx 响应：展示错误文案，并在消息区添加一条助手错误回复
      if (!res.ok) {
        setErrorText(data.error || "请求失败，请稍后重试");
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: data.error || "Request failed",
          },
        ]);
        return;
      }

      // 正常响应：将助手回复拼接到聊天记录末尾
      const reply = data.reply ?? "No response from model";
      setMessages([
        ...newMessages,
        { role: "assistant", content: reply },
      ]);
    } catch (error) {
      // 请求异常（网络断开、服务未启动等）统一走这里
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Network error" },
      ]);
    } finally {
      // 无论成功或失败，都要结束 loading 状态
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // 阻止表单默认刷新行为，改为前端异步发送
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 3 - Ollama Chat</h1>

      {/* 输入区：用户输入问题并触发发送 */}
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
          {loading ? "思考中..." : "发送"}
        </button>
      </form>

      {/* 错误提示区：仅在 errorText 非空时显示 */}
      {errorText ? <p className="mb-3 text-sm text-red-600">{errorText}</p> : null}

      {/* 消息展示区：空态提示、历史消息与加载中占位都在这里渲染 */}
      <div
        ref={listRef}
        className="min-h-[220px] max-h-[65vh] space-y-3 overflow-y-auto rounded border p-4"
      >
        {messages.length === 0 ? (
          <p className="text-gray-500">聊天记录会显示在这里</p>
        ) : (
          // 根据 role 决定消息气泡样式：用户右侧深色，助手左侧浅色
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
        {/* loading 时展示助手“思考中”占位，减少用户等待焦虑 */}
        {loading ? (
          <div className="mr-8 whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-black">
            <p className="mb-1 text-xs opacity-70">助手</p>
            <p>思考中...</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
