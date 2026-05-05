"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type MemoryImportance = "high" | "low";

type MemoryItem = {
  content: string;
  importance: MemoryImportance;
};

type Memory = {
  shortTerm: ChatMessage[];
  items: MemoryItem[];
};

type TodoItem = {
  task: string;
  done: boolean;
};

type ChatApiResult =
  | { type: "chat"; content: string; memory: Memory }
  | { type: "weather"; keyword: string; result: string; memory: Memory }
  | { type: "summary"; text: string; memory: Memory }
  | { type: "todo"; items: TodoItem[]; memory: Memory };

type UserBubble = { role: "user"; content: string };

type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string }
  | { role: "assistant"; variant: "weather"; keyword: string; result: string }
  | { role: "assistant"; variant: "summary"; text: string }
  | { role: "assistant"; variant: "todo"; items: TodoItem[] };

type Bubble = UserBubble | AssistantBubble;

function apiToAssistant(data: ChatApiResult): AssistantBubble {
  if (data.type === "chat") {
    return { role: "assistant", variant: "chat", content: data.content };
  }
  if (data.type === "weather") {
    return {
      role: "assistant",
      variant: "weather",
      keyword: data.keyword,
      result: data.result,
    };
  }
  if (data.type === "summary") {
    return { role: "assistant", variant: "summary", text: data.text };
  }
  return { role: "assistant", variant: "todo", items: data.items };
}

export default function HomePage() {
  const [input, setInput] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [memory, setMemory] = useState<Memory>({ shortTerm: [], items: [] });
  const listRef = useRef<HTMLDivElement>(null);
  const pendingBubblesRef = useRef<Bubble[] | null>(null);
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
  }, [bubbles, loading]);

  function scheduleBubblesCommit(next: Bubble[]) {
    pendingBubblesRef.current = next;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      if (pendingBubblesRef.current) {
        setBubbles(pendingBubblesRef.current);
      }
      pendingBubblesRef.current = null;
      rafIdRef.current = null;
    });
  }

  async function handleSend() {
    const userInput = input.trim();
    if (!userInput || loading) return;

    setErrorText("");

    const forRequest: ChatMessage[] = bubbles.map((b) =>
      b.role === "user"
        ? b
        : b.variant === "chat"
          ? { role: "assistant" as const, content: b.content }
          : b.variant === "weather"
            ? { role: "assistant" as const, content: `🔍 ${b.keyword}\n${b.result}` }
            : b.variant === "summary"
              ? { role: "assistant" as const, content: b.text }
              : {
                  role: "assistant" as const,
                  content: b.items.map((item) => item.task).join("\n"),
                }
    );

    const withUser: ChatMessage[] = [...forRequest, { role: "user", content: userInput }];
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", content: userInput }];

    scheduleBubblesCommit(nextBubbles);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: withUser, memory }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        scheduleBubblesCommit([
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]);
        return;
      }

      const data = (await res.json()) as ChatApiResult;
      setMemory(data.memory);
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]);
    } catch (error) {
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      scheduleBubblesCommit([
        ...nextBubbles,
        { role: "assistant", variant: "chat", content: "Network error" },
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
    <main className="mx-auto min-h-screen max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 12 - Memory 参与决策链</h1>
      <p className="mb-4 text-sm text-zinc-600">
        先说身份与目标，再试「继续刚才的待办」「按计划拆解任务」；观察右侧记忆权重与长度控制。
      </p>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <section>
          <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
            <input
              className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder="输入消息..."
              maxLength={2000}
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
            >
              {loading ? "处理中..." : "发送"}
            </button>
          </form>

          {errorText ? <p className="mb-3 text-sm text-red-600">{errorText}</p> : null}

          <div
            ref={listRef}
            className="max-h-[65vh] min-h-[220px] space-y-3 overflow-y-auto rounded border border-zinc-200 p-4 dark:border-zinc-700"
          >
            {bubbles.length === 0 ? (
              <p className="text-zinc-500">聊天记录会显示在这里</p>
            ) : (
              bubbles.map((msg, index) => {
                if (msg.role === "user") {
                  return (
                    <div
                      key={`user-${index}`}
                      className="ml-8 rounded-lg bg-black px-3 py-2 text-white dark:bg-zinc-100 dark:text-black"
                    >
                      <p className="mb-1 text-xs opacity-70">你</p>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  );
                }

                if (msg.variant === "chat") {
                  return (
                    <div
                      key={`asst-${index}`}
                      className="mr-8 rounded-lg bg-zinc-100 px-3 py-2 text-black dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">助手</p>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  );
                }

                if (msg.variant === "weather") {
                  return (
                    <div
                      key={`weather-${index}`}
                      className="mr-8 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                    >
                      <p className="mb-1 text-xs opacity-80">天气</p>
                      <p className="whitespace-pre-wrap">
                        <span className="font-medium">{msg.keyword}</span> · {msg.result}
                      </p>
                    </div>
                  );
                }

                if (msg.variant === "summary") {
                  return (
                    <div
                      key={`summary-${index}`}
                      className="mr-8 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
                    >
                      <p className="border-b border-amber-200/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800/50 dark:text-amber-200">
                        总结
                      </p>
                      <p className="px-3 py-3 text-sm whitespace-pre-wrap text-amber-950 dark:text-amber-50">
                        {msg.text}
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={`todo-${index}`}
                    className="mr-8 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40"
                  >
                    <p className="mb-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                      待办计划
                    </p>
                    <ul className="space-y-1 text-sm text-emerald-950 dark:text-emerald-50">
                      {msg.items.map((item, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <input type="checkbox" checked={item.done} readOnly />
                          <span>{item.task}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="mb-2 text-sm font-semibold">🧠 Memory Debug</h3>
          <p className="mb-2 text-xs text-zinc-500">
            shortTerm: {memory.shortTerm.length} 条 · items: {memory.items.length} 条
          </p>
          <ul className="max-h-[55vh] space-y-2 overflow-auto rounded bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {memory.items.length === 0 ? (
              <li>(暂无长期记忆条目)</li>
            ) : (
              memory.items.map((item, i) => (
                <li
                  key={`${item.content}-${i}`}
                  className={
                    item.importance === "high"
                      ? "border-l-2 border-amber-500 pl-2"
                      : "border-l-2 border-zinc-300 pl-2 dark:border-zinc-600"
                  }
                >
                  <span className="mr-2 font-mono text-[10px] uppercase text-zinc-500">
                    {item.importance}
                  </span>
                  {item.content}
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </main>
  );
}
