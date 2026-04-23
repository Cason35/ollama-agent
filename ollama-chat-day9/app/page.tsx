"use client";

/**
 * Day9 多工具：weather 文本、summary 卡片、todo 列表；上下文裁剪同 Day8。
 */

import { FormEvent, useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatApiResult =
  | { type: "chat"; content: string }
  | { type: "weather"; keyword: string; result: string }
  | { type: "summary"; text: string }
  | { type: "todo"; items: string[] };

type UserBubble = { role: "user"; content: string };

type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string }
  | {
      role: "assistant";
      variant: "weather";
      keyword: string;
      result: string;
    }
  | { role: "assistant"; variant: "summary"; text: string }
  | { role: "assistant"; variant: "todo"; items: string[] };

type Bubble = UserBubble | AssistantBubble;

const MAX_CONTEXT_MESSAGES = 10;
const NAME_PATTERN = /(我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5]+)/;

/**
 * 判断当前文本是否属于需要保留的用户关键信息（如姓名）。
 */
function isKeyUserMemory(text: string): boolean {
  return NAME_PATTERN.test(text);
}

/**
 * 构建发送给后端的上下文消息窗口，并保留关键记忆消息。
 */
function buildRequestMessages(messages: ChatMessage[]): ChatMessage[] {
  // 前端与后端保持同一套裁剪策略，减少上下文不一致。
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  // 姓名这类关键记忆优先保留，避免多轮后丢失用户身份信息。
  const keyUserMessage = messages.find(
    (msg) => msg.role === "user" && isKeyUserMemory(msg.content)
  );

  if (!keyUserMessage || recentMessages.includes(keyUserMessage)) {
    return recentMessages;
  }

  return [keyUserMessage, ...recentMessages];
}

/**
 * 将接口返回的多态结构转换为前端统一的助手气泡结构。
 */
function apiToAssistant(data: ChatApiResult): AssistantBubble {
  // 将接口多态结果统一映射成 UI 气泡结构，渲染层无需关心接口细节。
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

/**
 * 页面主组件：负责输入、请求、状态管理与不同类型消息渲染。
 */
export default function HomePage() {
  const [input, setInput] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pendingBubblesRef = useRef<Bubble[] | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // 组件卸载时取消尚未执行的 rAF，避免内存泄漏或卸载后 setState。
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // 每次消息或 loading 变化后滚动到底部，保证最新对话可见。
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, loading]);

  /**
   * 合并气泡更新请求，统一在下一帧提交，减少短时间重复渲染。
   */
  function scheduleBubblesCommit(next: Bubble[]) {
    // 使用 rAF 合并高频状态更新，避免连续 setState 导致卡顿。
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

  /**
   * 发送消息主流程：组装上下文、调用 API、处理成功和异常回包。
   */
  async function handleSend() {
    const userInput = input.trim();
    if (!userInput || loading) return;

    setErrorText("");

    // 将不同样式的 assistant 气泡回写成统一文本，供后端继续作为上下文。
    const forRequest: ChatMessage[] = bubbles.map((b) =>
        b.role === "user"
          ? b
          : b.variant === "chat"
            ? { role: "assistant" as const, content: b.content }
            : b.variant === "weather"
              ? {
                  role: "assistant" as const,
                  content: `🔍 ${b.keyword}\n${b.result}`,
                }
              : b.variant === "summary"
                ? { role: "assistant" as const, content: b.text }
                : {
                    role: "assistant" as const,
                    content: b.items.join("\n"),
                  });

    const withUser: ChatMessage[] = [
      ...forRequest,
      { role: "user", content: userInput },
    ];
    const nextBubbles: Bubble[] = [
      ...bubbles,
      { role: "user", content: userInput },
    ];

    // 先乐观更新用户气泡，提升输入后反馈速度。
    scheduleBubblesCommit(nextBubbles);
    setInput("");
    setLoading(true);

    try {
      // 发送前做上下文裁剪，减少 token 消耗并保留关键记忆。
      const requestMessages = buildRequestMessages(withUser);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        // 请求失败也写入一条助手消息，让对话上下文完整可追溯。
        scheduleBubblesCommit([
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]);
        return;
      }

      const data = (await res.json()) as ChatApiResult;
      // 根据返回类型追加对应气泡（聊天 / 天气 / 总结 / 待办）。
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]);
    } catch (error) {
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      // 网络异常时给出固定提示，避免界面静默失败。
      scheduleBubblesCommit([
        ...nextBubbles,
        { role: "assistant", variant: "chat", content: "Network error" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * 表单提交入口：阻止默认刷新并复用发送逻辑。
   */
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 9 - 多工具 Agent</h1>
      <p className="mb-4 text-sm text-zinc-600">
        试试：「北京天气」·「帮我总结这段话…」·「帮我做计划」·「你好」
      </p>

      <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
        <input
          className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="输入消息…"
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
            // 用户消息使用右侧深色气泡。
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

            // 普通聊天消息使用基础助手气泡样式。
            if (msg.variant === "chat") {
              return (
                <div
                  key={`asst-${index}`}
                  className="mr-8 rounded-lg bg-zinc-100 px-3 py-2 text-black dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
                    助手
                  </p>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              );
            }

            // 天气消息使用信息型视觉样式，突出城市与结果。
            if (msg.variant === "weather") {
              return (
                <div
                  key={`weather-${index}`}
                  className="mr-8 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                >
                  <p className="mb-1 text-xs opacity-80">天气</p>
                  <p className="whitespace-pre-wrap">
                    <span className="font-medium">{msg.keyword}</span>
                    {" · "}
                    {msg.result}
                  </p>
                </div>
              );
            }

            // 总结消息使用卡片样式，强调结构化阅读体验。
            if (msg.variant === "summary") {
              return (
                <div
                  key={`summary-${index}`}
                  className="mr-8 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
                >
                  <p className="border-b border-amber-200/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800/50 dark:text-amber-200">
                    总结
                  </p>
                  <p className="px-3 py-3 text-sm text-amber-950 dark:text-amber-50">
                    {msg.text}
                  </p>
                </div>
              );
            }

            // 剩余分支为 todo，列表化展示并去掉编号前缀重复。
            return (
              <div
                key={`todo-${index}`}
                className="mr-8 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40"
              >
                <p className="mb-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                  待办计划
                </p>
                <ul className="list-inside list-decimal space-y-1 text-sm text-emerald-950 dark:text-emerald-50">
                  {msg.items.map((item, i) => (
                    <li key={i}>{item.replace(/^\d+\.\s*/, "")}</li>
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
