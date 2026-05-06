"use client"; // 声明为客户端组件，启用浏览器端交互与 React Hooks

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react"; // 引入类型与 Hooks：表单事件、副作用、DOM 引用、状态

// 与后端 `/api/chat` 对齐的单条对话消息（仅文本）
type ChatMessage = {
  role: "user" | "assistant"; // 说话方角色
  content: string; // 文本内容
};

// 长期记忆条目的重要程度，用于侧栏展示与后端裁剪策略
type MemoryImportance = "high" | "low"; // 高优先级事实 vs 其他

// 单条长期记忆：内容与重要性标记
type MemoryItem = {
  content: string; // 记忆正文
  importance: MemoryImportance; // high / low
};

// 前端持有的记忆结构：短期对话窗口 + 长期条目列表（替代单一 longTerm 字符串）
type Memory = {
  shortTerm: ChatMessage[]; // 最近若干轮对话快照
  items: MemoryItem[]; // 带权重的长期记忆条目
};

// 待办卡片中单条任务
type TodoItem = {
  task: string; // 任务描述
  done: boolean; // 是否完成（当前只读展示）
};

/** 工作流单步（与后端 route.ts 对齐）。 */
type WorkflowStep = {
  id: string;
  name: string;
  action: "chat" | "summary" | "todo" | "weather";
  input: string;
  status: "pending" | "running" | "success" | "failed";
  output?: unknown;
  error?: string;
  durationMs?: number;
};

/** 多步骤任务容器。 */
type Workflow = {
  id: string;
  goal: string;
  steps: WorkflowStep[];
  status: "pending" | "running" | "success" | "failed";
};

// API 成功响应的联合类型，按 type 分发 UI
type ChatApiResult =
  | { type: "chat"; content: string; memory: Memory } // 普通聊天
  | { type: "weather"; keyword: string; result: string; memory: Memory } // 天气
  | { type: "summary"; text: string; memory: Memory } // 总结
  | { type: "todo"; items: TodoItem[]; memory: Memory } // 待办
  | { type: "workflow"; workflow: Workflow; finalSummary: string; memory: Memory }; // 工作流

// 用户侧气泡：纯文本
type UserBubble = { role: "user"; content: string }; // 仅 user + content

// 助手侧气泡：用 variant 区分五种卡片
type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string } // 助手文本
  | { role: "assistant"; variant: "weather"; keyword: string; result: string } // 天气卡
  | { role: "assistant"; variant: "summary"; text: string } // 总结卡
  | { role: "assistant"; variant: "todo"; items: TodoItem[] } // 待办卡
  | { role: "assistant"; variant: "workflow"; workflow: Workflow; finalSummary: string }; // 工作流过程

// 对话区单条 UI 单元
type Bubble = UserBubble | AssistantBubble; // 用户或助手联合

// 将 API 联合响应映射为助手气泡（单一适配点）
function apiToAssistant(data: ChatApiResult): AssistantBubble {
  // 聊天类型：映射为 variant chat
  if (data.type === "chat") {
    return { role: "assistant", variant: "chat", content: data.content }; // 组装 chat 气泡
  } // 结束 chat
  // 天气类型
  if (data.type === "weather") {
    return {
      role: "assistant", // 助手角色
      variant: "weather", // 天气变体
      keyword: data.keyword, // 查询关键词（如城市）
      result: data.result, // 天气结果文案
    }; // 返回对象
  } // 结束 weather
  // 总结类型
  if (data.type === "summary") {
    return { role: "assistant", variant: "summary", text: data.text }; // 总结正文
  } // 结束 summary
  if (data.type === "workflow") {
    return {
      role: "assistant",
      variant: "workflow",
      workflow: data.workflow,
      finalSummary: data.finalSummary,
    };
  }
  // 默认待办类型
  return { role: "assistant", variant: "todo", items: data.items }; // 待办列表
} // 结束 apiToAssistant

// 页面根组件：对话区 + 右侧 Memory 调试（items 带重要性样式）
export default function HomePage() {
  const [input, setInput] = useState(""); // 输入框受控值
  const [bubbles, setBubbles] = useState<Bubble[]>([]); // 聊天气泡列表
  const [loading, setLoading] = useState(false); // 请求进行中标志
  const [errorText, setErrorText] = useState(""); // 顶部错误提示
  const [memory, setMemory] = useState<Memory>({ shortTerm: [], items: [] }); // 记忆状态初始为空
  const [useWorkflow, setUseWorkflow] = useState(false); // 是否启用多步 Workflow 模式
  const listRef = useRef<HTMLDivElement>(null); // 消息列表滚动容器
  const pendingBubblesRef = useRef<Bubble[] | null>(null); // RAF 批处理待提交快照
  const rafIdRef = useRef<number | null>(null); // 当前 requestAnimationFrame id

  useEffect(() => {
    // 卸载时取消未执行的 RAF，防止卸载后 setState
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current); // 取消动画帧回调
      } // 结束 if
    }; // 清理函数
  }, []); // 仅挂载/卸载时运行

  useEffect(() => {
    // 气泡或加载状态变化时滚到底部
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight, // 滚动到内容总高度
      behavior: "smooth", // 平滑滚动
    }); // scrollTo
  }, [bubbles, loading]); // 依赖 bubbles 与 loading

  // 同一帧内合并多次 setBubbles，减少抖动
  function scheduleBubblesCommit(next: Bubble[]) {
    pendingBubblesRef.current = next; // 保存下一状态快照
    if (rafIdRef.current !== null) return; // 已排队则不再重复调度
    rafIdRef.current = requestAnimationFrame(() => {
      if (pendingBubblesRef.current) {
        setBubbles(pendingBubblesRef.current); // 提交快照到 React
      } // 结束 if
      pendingBubblesRef.current = null; // 清空待提交
      rafIdRef.current = null; // 允许下次调度
    }); // RAF 回调结束
  } // scheduleBubblesCommit 结束

  async function handleSend() {
    const userInput = input.trim(); // 修剪后的用户输入
    if (!userInput || loading) return; // 空输入或加载中直接返回

    setErrorText(""); // 清空历史错误提示

    // 将气泡列表扁化为发给后端的 ChatMessage[]
    const forRequest: ChatMessage[] = bubbles.map((b: Bubble) =>
      b.role === "user"
        ? b
        : b.variant === "chat"
          ? { role: "assistant" as const, content: b.content }
          : b.variant === "weather"
            ? { role: "assistant" as const, content: `🔍 ${b.keyword}\n${b.result}` }
            : b.variant === "summary"
              ? { role: "assistant" as const, content: b.text }
              : b.variant === "workflow"
                ? {
                    role: "assistant" as const,
                    content: `【Workflow】${b.workflow.goal}\n${b.finalSummary}`,
                  }
                : {
                    role: "assistant" as const,
                    content: b.items.map((item: TodoItem) => item.task).join("\n"),
                  }
    ); // map 结束

    const withUser: ChatMessage[] = [...forRequest, { role: "user", content: userInput }]; // 附带本轮用户句
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", content: userInput }]; // 乐观追加用户气泡

    scheduleBubblesCommit(nextBubbles); // 批处理更新气泡
    setInput(""); // 清空输入
    setLoading(true); // 进入加载态

    try {
      const res = await fetch("/api/chat", {
        method: "POST", // POST JSON
        headers: { "Content-Type": "application/json" }, // 声明 JSON
        body: JSON.stringify({ messages: withUser, memory, useWorkflow }), // 消息 + 记忆 + Workflow 开关
      }); // fetch 结束

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }; // 解析错误体
        const content = data.error || "请求失败，请稍后重试"; // 错误文案
        setErrorText(content); // 顶部展示
        scheduleBubblesCommit([
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]); // 对话区追加错误气泡
        return; // 终止成功分支
      } // !res.ok 结束

      const data = (await res.json()) as ChatApiResult; // 断言成功响应
      setMemory(data.memory); // 覆盖本地记忆（含 items）
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]); // 追加助手气泡
    } catch (error) {
      console.error(error); // 控制台记录异常
      setErrorText("网络异常，请检查 Ollama 与网络连接"); // 用户提示
      scheduleBubblesCommit([
        ...nextBubbles,
        { role: "assistant", variant: "chat", content: "Network error" },
      ]); // 对话区网络错误气泡
    } finally {
      setLoading(false); // 恢复可交互
    } // finally 结束
  } // handleSend 结束

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 阻止表单默认提交刷新
    handleSend(); // 走异步发送
  } // handleSubmit 结束

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-8">
      {/* Day12 标题 */}
      <h1 className="mb-6 text-2xl font-bold">Day 13 - Workflow Agent（Planner + Executor）</h1>
      <p className="mb-4 text-sm text-zinc-600">
        勾选「Workflow 多步骤模式」后发送复杂需求（如「规划明天学习任务并生成待办」），可观察步骤执行过程与最终结果。
        普通模式仍走 Day12 单步路由 + Memory。
      </p>

      {/* 响应式两栏：大屏 2:1，小屏堆叠 */}
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        {/* 左侧：对话与输入 */}
        <section>
          {/* 输入表单 */}
          <form onSubmit={handleSubmit} className="mb-3 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={useWorkflow}
                onChange={(e) => setUseWorkflow(e.target.checked)}
                disabled={loading}
              />
              Workflow 多步骤模式
            </label>
            <input
              className="min-w-[200px] flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              value={input}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
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
              bubbles.map((msg: Bubble, index: number) => {
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

                if (msg.variant === "workflow") {
                  return (
                    <div
                      key={`workflow-${index}`}
                      className="mr-8 overflow-hidden rounded-xl border border-violet-200 bg-violet-50 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30"
                    >
                      <p className="border-b border-violet-200/80 px-3 py-2 text-xs font-medium text-violet-900 dark:border-violet-800/50 dark:text-violet-200">
                        Workflow：{msg.workflow.goal}
                      </p>
                      <ul className="space-y-1.5 px-3 py-2 text-sm text-violet-950 dark:text-violet-50">
                        {msg.workflow.steps.map((step) => (
                          <li key={step.id} className="flex flex-wrap items-baseline gap-2">
                            <span aria-hidden="true">
                              {step.status === "success"
                                ? "✅"
                                : step.status === "failed"
                                  ? "❌"
                                  : step.status === "running"
                                    ? "⏳"
                                    : "⏸"}
                            </span>
                            <span className="font-medium">{step.name}</span>
                            <span className="text-xs text-violet-600 dark:text-violet-400">
                              [{step.action}]
                              {typeof step.durationMs === "number" ? ` · ${step.durationMs}ms` : ""}
                            </span>
                            {step.error ? (
                              <span className="text-xs text-red-600 dark:text-red-400">{step.error}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="border-t border-violet-200/80 px-3 py-3 dark:border-violet-800/50">
                        <p className="mb-1 text-xs font-semibold text-violet-900 dark:text-violet-200">
                          最终结果
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-violet-950 dark:text-violet-50">
                          {msg.finalSummary}
                        </p>
                      </div>
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
                      {msg.items.map((item: TodoItem, i: number) => (
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

        {/* 右侧：Memory 调试 — items 列表 + importance 样式 */}
        <aside className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <h3 className="mb-2 text-sm font-semibold">🧠 Memory Debug</h3>
          <p className="mb-2 text-xs text-zinc-500">
            shortTerm: {memory.shortTerm.length} 条 · items: {memory.items.length} 条
          </p>
          <ul className="max-h-[55vh] space-y-2 overflow-auto rounded bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {memory.items.length === 0 ? (
              <li>(暂无长期记忆条目)</li>
            ) : (
              memory.items.map((item: MemoryItem, i: number) => (
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
