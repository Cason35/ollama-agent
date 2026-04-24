"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type TodoItem = {
  task: string;
  done: boolean;
};

type ChatApiResult =
  | { type: "chat"; content: string }
  | { type: "weather"; keyword: string; result: string }
  | { type: "summary"; text: string }
  | { type: "todo"; items: TodoItem[] };

type UserBubble = { role: "user"; content: string };

type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string }
  | { role: "assistant"; variant: "weather"; keyword: string; result: string }
  | { role: "assistant"; variant: "summary"; text: string }
  | { role: "assistant"; variant: "todo"; items: TodoItem[] };

type Bubble = UserBubble | AssistantBubble;

const MAX_CONTEXT_MESSAGES = 10;
const NAME_PATTERN = /(我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5]+)/;

// 判断一条用户消息是否属于“需要长期保留”的关键信息（例如姓名）
// 这类信息即使不在最近 N 条上下文里，也会被额外带给后端，避免模型忘记用户身份。
function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

// 构建发给后端 API 的上下文消息：
// 1) 默认只保留最近 MAX_CONTEXT_MESSAGES 条，控制 token 成本与响应时延；
// 2) 如果历史里存在关键信息（如“我叫xx”）且不在最近窗口内，则插入到最前面。
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

// 将后端统一响应结构转换为前端气泡结构，便于渲染层按 variant 分支展示不同 UI。
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

  // 通过 requestAnimationFrame 合并同一帧内的多次状态更新，减少高频 setState 造成的抖动。
  // 这里把“待提交气泡”暂存在 ref 中，等下一帧统一 commit。
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

    // 前端展示层中的 Assistant 气泡有多种结构（chat/weather/summary/todo）；
    // 这里统一“降维”为后端可消费的 ChatMessage[] 文本上下文，保证接口入参稳定。
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

    // withUser：给模型的完整上下文（历史 + 当前用户输入）
    // nextBubbles：前端立即可见的 optimistic UI（先把用户消息渲染出来）
    const withUser: ChatMessage[] = [...forRequest, { role: "user", content: userInput }];
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", content: userInput }];

    scheduleBubblesCommit(nextBubbles);
    setInput("");
    setLoading(true);

    try {
      // 在发送请求前做“上下文裁剪 + 关键记忆补偿”，避免无上限增长。
      const requestMessages = buildRequestMessages(withUser);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
      });

      if (!res.ok) {
        // 服务端返回业务错误时，除了顶部错误提示，也补一条助手气泡，保证聊天流连续可读。
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        scheduleBubblesCommit([
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]);
        return;
      }

      // 正常返回后把不同 type 映射为对应气泡，交由下方渲染分支展示。
      const data = (await res.json()) as ChatApiResult;
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]);
    } catch (error) {
      console.error(error);
      // 网络异常场景下，给出可执行的排障方向（Ollama/网络）。
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
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 10 - 可用化 Agent</h1>
      <p className="mb-4 text-sm text-zinc-600">
        试试：「帮我总结一下刚刚内容」·「把今天学习拆成待办」·「北京天气」
      </p>

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
          // user / assistant(chat/weather/summary/todo) 五类展示分支：
          // 通过判别 role + variant，分别渲染不同视觉样式与数据结构。
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
    </main>
  );
}
