"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

// 与后端接口约定的基础消息结构。
// 注意：这里是“传输层消息”，不包含天气卡片/Todo 卡片等富展示字段。
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// Todo 业务卡片的数据结构。
// done 目前仅展示状态，前端未提供交互更新逻辑（只读勾选框）。
type TodoItem = {
  task: string;
  done: boolean;
};

// 前端维护的记忆信息：
// - shortTerm: 最近上下文，便于排查后端窗口裁剪是否生效；
// - longTerm: 后端压缩后的长期事实，用于跨轮次保持用户画像与目标。
type Memory = {
  shortTerm: ChatMessage[];
  longTerm: string;
};

// /api/chat 的联合返回类型，前端通过 type 做分发渲染。
// 设计成可判别联合（discriminated union），可在 TS 层获得完整分支类型收窄。
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

// 将接口响应转换为统一的助手气泡结构，避免渲染层感知后端返回细节。
// 目的：把“后端协议”隔离在这一层，渲染层只处理 Bubble 结构。
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
  // 输入框内容（受控组件）。
  const [input, setInput] = useState("");
  // 聊天区渲染源（用户 + 助手所有气泡）。
  // 所有 UI 展示都由它驱动，属于页面最核心状态。
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  // 请求中状态，控制按钮/输入可用性与文案。
  // 避免并发提交导致消息顺序错乱。
  const [loading, setLoading] = useState(false);
  // 统一错误提示文案（顶部短提示）。
  const [errorText, setErrorText] = useState("");
  // 与后端同步的记忆对象。
  // 每次响应后整体覆盖，确保本地状态与后端最新记忆一致。
  const [memory, setMemory] = useState<Memory>({ shortTerm: [], longTerm: "" });
  // 聊天列表容器引用，用于滚动到底部。
  const listRef = useRef<HTMLDivElement>(null);
  // 下一帧准备提交的 bubbles 快照。
  // 通过 ref 暂存，避免同一帧内多次 setState 造成无意义重渲染。
  const pendingBubblesRef = useRef<Bubble[] | null>(null);
  // requestAnimationFrame 任务 id，用于去重调度与卸载清理。
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // 组件卸载时清理 raf，避免无效 setState。
    // 防止页面切换后仍尝试提交 bubbles，触发 React 警告。
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // 每次消息变化后自动滚动到最底部，保证最新消息可见。
    // loading 也纳入依赖，确保“发送后等待中”状态下滚动逻辑同样触发。
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, loading]);

  // 在同一帧内合并多次 bubbles 更新，减少重渲染抖动。
  // 这是一个微型批处理器：同一帧只真正 setState 一次。
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
    // 输入为空或仍在处理中时，不触发请求。
    // 双重防抖：交互层阻断无效请求 + 状态层阻断并发请求。
    if (!userInput || loading) return;

    setErrorText("");

    // 将多形态 UI 气泡还原成模型可理解的纯文本对话。
    // 关键点：后端路由基于文本理解，因此前端需要把卡片型消息降级为文本摘要再传输。
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
    // 乐观更新：先把用户消息渲染出来，再等待后端响应。
    // 这样用户输入后立即可见，减少“点击发送后无反馈”的体感延迟。
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", content: userInput }];

    scheduleBubblesCommit(nextBubbles);
    setInput("");
    setLoading(true);

    try {
      // 发送完整上下文（messages + memory）给后端进行路由与执行。
      // messages 提供会话文本，memory 提供压缩记忆，两者结合提升多轮稳定性。
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: withUser, memory }),
      });

      if (!res.ok) {
        // 后端返回失败时，将错误同时展示在顶部和对话区。
        // 顶部用于快速感知；对话区保留上下文，便于回看问题发生点。
        const data = (await res.json()) as { error?: string };
        const content = data.error || "请求失败，请稍后重试";
        setErrorText(content);
        scheduleBubblesCommit([
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]);
        return;
      }

      // 正常返回后，用后端返回的最新 memory 覆盖本地状态。
      // 注意这里不做 merge，直接替换能避免前后端记忆分叉。
      const data = (await res.json()) as ChatApiResult;
      setMemory(data.memory);
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]);
    } catch (error) {
      // 网络异常通常是 Ollama 未启动或本地网络不可达。
      // 这里给出固定文案，避免把底层异常对象直接暴露给用户。
      console.error(error);
      setErrorText("网络异常，请检查 Ollama 与网络连接");
      scheduleBubblesCommit([
        ...nextBubbles,
        { role: "assistant", variant: "chat", content: "Network error" },
      ]);
    } finally {
      // 请求结束后恢复输入能力。
      // 无论成功/失败都执行，避免按钮卡死在 loading。
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // 阻止表单默认刷新，改为前端异步提交。
    // 统一入口到 handleSend，保证点击按钮与回车提交逻辑一致。
    e.preventDefault();
    handleSend();
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Day 11 - Memory 升级 Agent</h1>
      <p className="mb-4 text-sm text-zinc-600">
        试试先说身份目标，再多轮聊天：例如「我是前端工程师，目标是转型 Agent」
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
            {/* 按消息类型渲染不同业务卡片（普通聊天/天气/总结/Todo） */}
            {/* 这里的分支顺序与 Bubble 联合类型保持一致，便于维护时一一对应。 */}
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
                    {/* Todo 仅用于展示，勾选框当前为只读。 */}
                    {/* 若后续要支持勾选同步，可在此处增加 onChange 并回传后端。 */}
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
          {/* shortTerm 条数可快速观察上下文窗口是否被裁剪。 */}
          {/* 该区域主要用于调试记忆策略，生产环境可按需隐藏。 */}
          <p className="mb-2 text-xs text-zinc-500">shortTerm: {memory.shortTerm.length} 条</p>
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {memory.longTerm || "(暂无 longTerm 记忆)"}
          </pre>
        </aside>
      </div>
    </main>
  );
}
