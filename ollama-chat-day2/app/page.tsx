"use client";

import { useState } from "react";

/**
 * Day2 最小前端：任务链「输入 → POST /api/chat → 展示 reply」
 * "use client"：本页用 useState / 事件，需在浏览器端运行（与仅服务端的 Route Handler 分开）。
 */
export default function HomePage() {
  // ---------- 任务节点：页面状态 ----------
  // input：输入框受控值；messages：会话记录；loading：请求中禁用按钮、显示「发送中...」
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    // 空内容或纯空格不发起请求，避免无效调用
    const userMessage = input.trim();
    if (!userMessage || loading) return;

    // 优化点 1：先立刻回显用户消息，并清空输入框，连续提问更顺滑
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setLoading(true);

    try {
      // ---------- 任务节点：调用本站 API（相对路径，同源）----------
      // 由 app/api/chat/route.ts 转发到 Ollama；不要写 localhost:11434，避免 CORS 与暴露后端地址策略
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      const data = await res.json();

      // HTTP 4xx/5xx：展示服务端返回的 error 字段（如缺参数、Ollama 失败信息）
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Request failed" },
        ]);
        return;
      }

      // 2xx：展示统一字段 reply（与 route 返回一致）
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (error) {
      // 断网、DNS、JSON 异常等：fetch 抛错，非 HTTP 状态码分支
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error" },
      ]);
    } finally {
      // 无论成功失败，结束 loading，避免按钮一直禁用
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Day 2 - Ollama Chat</h1>

      {/* 任务节点：输入区 — 受控 input + 触发发送 */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          disabled={loading}
          placeholder="请输入你的问题"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? "思考中..." : "发送"}
        </button>
      </div>

      {/* 任务节点：聊天区 — 展示用户问题与模型回答；保留本次页面生命周期内的记录 */}
      <div className="border rounded p-4 min-h-[220px] space-y-3">
        {messages.length === 0 ? (
          <p className="text-gray-500">聊天记录会显示在这里</p>
        ) : (
          messages.map((msg, index) => (
            <div
              key={`${msg.role}-${index}`}
              className={`rounded-lg px-3 py-2 whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-black text-white ml-8"
                  : "bg-gray-100 text-black mr-8"
              }`}
            >
              <p className="text-xs opacity-70 mb-1">
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
