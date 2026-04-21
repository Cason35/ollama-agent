"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

const MAX_CONTEXT_MESSAGES = 10;
const NAME_PATTERN = /(我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5]+)/;

function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

function buildRequestMessages(messages: ChatMessage[]): ChatMessage[] {
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  const keyUserMessage = messages.find(
    (msg) => msg.role === "user" && isKeyUserMemory(msg.content)
  );

  if (!keyUserMessage || recentMessages.includes(keyUserMessage)) {
    return recentMessages;
  }

  return [keyUserMessage, ...recentMessages];
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pendingMessagesRef = useRef<ChatMessage[] | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  function scheduleMessagesCommit(nextMessages: ChatMessage[]) {
    pendingMessagesRef.current = nextMessages;

    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      if (pendingMessagesRef.current) {
        setMessages(pendingMessagesRef.current);
      }
      pendingMessagesRef.current = null;
      rafIdRef.current = null;
    });
  }

  async function handleSend() {
    const userInput = input.trim();
    if (!userInput || loading) return;

    setErrorText("");

    const withUser: ChatMessage[] = [
      ...messages,
      { role: "user", content: userInput },
    ];

    scheduleMessagesCommit(withUser);
    setInput("");
    setLoading(true);

    try {
      const requestMessages = buildRequestMessages(withUser);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: requestMessages }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        scheduleMessagesCommit([...withUser, { role: "assistant", content }]);
        return;
      }

      const data = (await res.json()) as ChatApiResult;
      if (data.type === "search") {
        scheduleMessagesCommit([
          ...withUser,
          {
            role: "assistant",
            content: `🔍 ${data.keyword}\n📌 ${data.result}`,
          },
        ]);
      } else {
        scheduleMessagesCommit([
          ...withUser,
          { role: "assistant", content: data.content },
        ]);
      }
    } catch (error) {
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      scheduleMessagesCommit([
        ...withUser,
        { role: "assistant", content: "Network error" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 8 - 上下文裁剪（Context 管理）</h1>

      <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="请输入你的问题（例如：我叫 Cason）"
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
