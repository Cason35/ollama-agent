"use client"; // 声明为客户端组件，启用浏览器端交互与 React Hooks

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react"; // 引入类型与 Hooks：表单事件、副作用、DOM 引用、状态

import { MIMO_MODEL_IDS, MIMO_MODEL_OPTIONS } from "@/lib/mimo-models"; // MiMo 模型 id 白名单与下拉展示配置

/** 与 `/api/chat` 请求体 `provider` 对齐 */
type ChatProvider = "local" | "mimo"; // 本地 Ollama 或云端小米 MiMo

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
  id: string; // 步骤唯一 id（列表渲染 key、dependsOn 引用目标）
  name: string; // 步骤展示名称
  action: "chat" | "summary" | "todo" | "weather"; // 本步工具类型（与后端一致）
  input: string; // 传给后端的文本入参摘要
  dependsOn?: string[]; // 依赖的步骤 id
  /** 第15天：步骤级额外重试次数（不含首轮）；与后端 route.ts 对齐。 */
  retry?: number; // undefined 走后端默认；0 表示不重试；正整数为失败后的最多追加尝试次数
  status: "pending" | "queued" | "running" | "success" | "failed" | "blocked"; // 第16天：含排队/阻塞的 UI 状态机
  output?: unknown; // 成功后可选的中间结果（本页 mainly 展示状态时忽略细节）
  error?: string; // 失败错误信息（若有则显示在列表行内）
  durationMs?: number; // 服务端记录的该步毫秒耗时（用于徽章展示）
  injectedContextPreview?: string; // 本步执行前注入的依赖/线性上下文预览
};

/** 第15天：工作流 Timeline 打点（毫秒时间戳 + 可读中文 message）。 */
type WorkflowTimelineEvent = {
  ts: number; // 服务端 Date.now：前端格式化为本地化「时:分:秒」观感
  stepId?: string; // 可能与某 WorkflowStep.id 对齐；全局事件可无
  message: string; // 事件中文描述：校验/repair/start/retry/success/fail 等
}; // WorkflowTimelineEvent 结束

/** 第16天：后端返回的并行调度批次摘要（与 route.ts 对齐）。 */
type WorkflowExecutionBatch = {
  batchIndex: number; // 批次序号：从 1 递增
  stepIds: string[]; // 本批并行执行的步骤 id 列表
  ts: number; // 批次开始时间戳（毫秒）
}; // WorkflowExecutionBatch 类型结束

/** 多步骤任务容器。 */
type Workflow = {
  id: string; // 工作流实例 id
  goal: string; // 用户本轮目标简述（用作卡片标题后缀）
  steps: WorkflowStep[]; // 各步骤与状态列表
  status: "pending" | "running" | "success" | "failed"; // 整单状态（与服务端一致）
  executionTimeline?: WorkflowTimelineEvent[]; // 第15天：Runtime trace（validate/repair/execute/retry）
  executionBatches?: WorkflowExecutionBatch[]; // 第16天：并行批次边界（供 Batch Timeline 展示）
}; // Workflow 类型结束

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
      role: "assistant", // 助手气泡
      variant: "workflow", // 使用工作流专用卡片 UI
      workflow: data.workflow, // 完整步骤与状态供进度列表渲染
      finalSummary: data.finalSummary, // 服务端汇总后的最终答复正文
    };
  }
  // 默认待办类型
  return { role: "assistant", variant: "todo", items: data.items }; // 待办列表
} // 结束 apiToAssistant

/** 列出将 `stepId` 列入 dependsOn 的后继步骤（用于链式调试箭头）。 */
function findDownstreamSteps(all: WorkflowStep[], stepId: string): WorkflowStep[] {
  return all.filter((s) => s.dependsOn?.includes(stepId) ?? false);
}

/** 将 id 映射为步骤短名，便于展示「被谁使用」。 */
function stepIdToName(all: WorkflowStep[], id: string): string {
  return all.find((s) => s.id === id)?.name ?? id;
}

/** 第16天：把步骤状态映射为可读符号（并行调度下区分 queued/blocked）。 */
function workflowStepStatusGlyph(status: WorkflowStep["status"]): string {
  if (status === "success") return "✓"; // 成功：对勾
  if (status === "failed") return "✕"; // 失败：叉号
  if (status === "running") return "…"; // 运行中：省略号动画占位
  if (status === "queued") return "▷"; // 已入队：三角提示「即将并行启动」
  if (status === "blocked") return "⛔"; // 阻塞：禁止符号提示「依赖失败导致短路」
  return "○"; // 默认：仍待调度（pending）
} // workflowStepStatusGlyph 结束

/** 第16天：把毫秒时间戳格式化为「时:分:秒」便于批次时间线扫读。 */
function formatZhHhMmSs(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour12: false, // 使用 24 小时制
    hour: "2-digit", // 两位数小时
    minute: "2-digit", // 两位数分钟
    second: "2-digit", // 两位数秒
  }); // toLocaleTimeString 结束
} // formatZhHhMmSs 结束

// 页面根组件：对话区 + 右侧 Memory 调试（items 带重要性样式）
export default function HomePage() {
  const [input, setInput] = useState(""); // 输入框受控值
  const [bubbles, setBubbles] = useState<Bubble[]>([]); // 聊天气泡列表
  const [loading, setLoading] = useState(false); // 请求进行中标志
  const [errorText, setErrorText] = useState(""); // 顶部错误提示
  const [memory, setMemory] = useState<Memory>({ shortTerm: [], items: [] }); // 记忆状态初始为空
  const [useWorkflow, setUseWorkflow] = useState(false); // 是否启用多步 Workflow 模式
  const [provider, setProvider] = useState<ChatProvider>("local"); // 本地 Ollama 或小米 MiMo
  const [mimoModel, setMimoModel] = useState<string>(MIMO_MODEL_IDS[0]); // MiMo 模型 id
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
                    role: "assistant" as const, // 记入请求历史的助手角色
                    content: `【Workflow】${b.workflow.goal}\n${b.finalSummary}`, // 扁化为单行文本摘要供后续轮次上下文使用
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
        body: JSON.stringify({
          messages: withUser, // 含历史与本轮用户气泡对应的 ChatMessage[]
          memory, // 上轮回传的 Memory，闭环持久化
          useWorkflow, // 是否启用后端多步 Planner+Executor
          provider, // local / mimo 选择
          mimoModel, // 仅 mimo 时生效的模型 id
        }), // POST 体与 route.ts 约定一致
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
      setErrorText("网络异常，请检查本机网络、Ollama 或小米 API 配置"); // 用户提示
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

  const selectFieldClass =
    "rounded-xl bg-zinc-100/90 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200/80 transition hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800 dark:focus:ring-violet-400/30";

  return (
    <main className="font-sans">
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zinc-100 via-white to-violet-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-violet-950/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-25"
          aria-hidden
          style={{
            backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgb(139 92 246 / 0.22), transparent),
              radial-gradient(ellipse 60% 40% at 100% 100%, rgb(56 189 248 / 0.12), transparent)`,
          }}
        />

        <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col px-4 pb-6 pt-5 sm:px-6 lg:px-8">
          <header className="shrink-0 border-b border-zinc-200/70 pb-5 dark:border-zinc-800/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-widest text-violet-600 dark:text-violet-400">
                  Day 16
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                  Parallel DAG · Promise.all · State Machine · Failure Propagation
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  第16天：并行 DAG 调度、批次时间线、失败传播与步骤状态（queued/blocked）。仍保留第15天校验/修复/重试/Timeline。后端可选本地 Ollama 或小米 MiMo，密钥写在{" "}
                  <code className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    .env.local
                  </code>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/80 backdrop-blur dark:bg-zinc-900/80 dark:text-zinc-300 dark:ring-zinc-700">
                  {provider === "local" ? "本地推理" : "云端 MiMo"}
                </span>
                {useWorkflow ? (
                  <span className="inline-flex items-center rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-500/25 dark:text-violet-200">
                    Workflow 开
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 pt-5 lg:flex-row lg:gap-5">
            {/* 对话主栏 */}
            <section className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/75 shadow-xl shadow-zinc-900/5 ring-1 ring-white/60 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/70 dark:shadow-black/40 dark:ring-zinc-700/40 lg:min-h-[calc(100dvh-11rem)]">
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/70 px-4 py-3 dark:border-zinc-800/80">
                <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-xl bg-zinc-100/90 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-700">
                  <input
                    type="checkbox" // 复选框控件
                    className="size-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500" // 小号方形勾选样式
                    checked={useWorkflow} // 受控：是否走后端 workflow 分支
                    onChange={(e) => setUseWorkflow(e.target.checked)} // 切换时更新状态
                    disabled={loading} // 请求中禁止改动避免竞态
                  />
                  多步 Workflow
                </label>

                <div className="hidden h-6 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" aria-hidden />

                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="whitespace-nowrap text-zinc-500 dark:text-zinc-500">后端</span>
                  <select
                    className={selectFieldClass} // 与模型下拉共享的圆角选择框样式
                    value={provider} // 当前提供商
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      setProvider(e.target.value === "mimo" ? "mimo" : "local") // 归一化为联合类型
                    }
                    disabled={loading} // 加载中锁定
                  >
                    <option value="local">Ollama</option> {/* 本地默认 */}
                    <option value="mimo">小米 MiMo</option> {/* 云端兼容 API */}
                  </select>
                </label>

                {provider === "mimo" ? (
                  // 仅在选择 MiMo 时展示具体模型下拉，避免本地模式误触
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-600 sm:max-w-[280px] dark:text-zinc-400">
                    <span className="shrink-0 whitespace-nowrap text-zinc-500 dark:text-zinc-500">模型</span>
                    <select
                      className={`${selectFieldClass} min-w-0 flex-1 truncate`} // 下拉占满剩余宽并截断长尾文案
                      value={mimoModel} // 与请求体 mimoModel 同步
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setMimoModel(e.target.value)} // 选定 apiId 写回状态
                      disabled={loading} // 请求中禁止切换模型
                    >
                  {MIMO_MODEL_OPTIONS.map(({ apiId, label }) => (
                    <option key={apiId} value={apiId}>
                      {/* 展示友好名称；value 为后端校验用的 api id */}
                      {label}
                    </option>
                  ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {errorText ? (
                <div className="shrink-0 border-b border-red-200/80 bg-red-50/90 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {errorText}
                </div>
              ) : null}

              <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
              >
                {bubbles.length === 0 && !loading ? (
                  <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-4 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-sky-500/15 ring-1 ring-violet-500/20">
                      <span className="text-2xl" aria-hidden>
                        ◈
                      </span>
                    </div>
                    <div>
                      <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">开始对话</p>
                      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                        试试天气、总结、待办，或打开 Workflow 描述一个多步骤任务。
                      </p>
                    </div>
                  </div>
                ) : null}

                {bubbles.map((msg: Bubble, index: number) => {
                  if (msg.role === "user") {
                    return (
                      <div key={`user-${index}`} className="flex justify-end">
                        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 text-white shadow-lg shadow-violet-600/20">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                            你
                          </p>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.variant === "chat") {
                    return (
                      <div key={`asst-${index}`} className="flex justify-start">
                        <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-zinc-200/90 bg-zinc-50/95 px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/90">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            助手
                          </p>
                          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.variant === "weather") {
                    return (
                      <div key={`weather-${index}`} className="flex justify-start">
                        <div className="max-w-[min(100%,36rem)] overflow-hidden rounded-2xl rounded-bl-md border border-sky-200/90 bg-gradient-to-br from-sky-50 to-cyan-50/80 shadow-sm dark:border-sky-800/60 dark:from-sky-950/50 dark:to-cyan-950/30">
                          <p className="border-b border-sky-200/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-800/50 dark:text-sky-300">
                            天气
                          </p>
                          <p className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-sky-950 dark:text-sky-50">
                            <span className="font-semibold">{msg.keyword}</span>
                            <span className="text-sky-600 dark:text-sky-400"> · </span>
                            {msg.result}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.variant === "summary") {
                    return (
                      <div key={`summary-${index}`} className="flex justify-start">
                        <div className="max-w-[min(100%,36rem)] overflow-hidden rounded-2xl rounded-bl-md border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/60 shadow-sm dark:border-amber-900/40 dark:from-amber-950/35 dark:to-orange-950/20">
                          <p className="border-b border-amber-200/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:border-amber-800/40 dark:text-amber-200">
                            总结
                          </p>
                          <p className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-amber-950 dark:text-amber-50">
                            {msg.text}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  if (msg.variant === "workflow") {
                    return (
                      <div key={`workflow-${index}`} className="flex justify-start">
                        {/* 工作流卡片：上方目标 + 中间步骤列表 + 底部最终总结 */}
                        <div className="max-w-[min(100%,40rem)] overflow-hidden rounded-2xl rounded-bl-md border border-violet-200/90 bg-gradient-to-br from-violet-50 to-fuchsia-50/50 shadow-md dark:border-violet-900/45 dark:from-violet-950/40 dark:to-fuchsia-950/25">
                          <p className="border-b border-violet-200/70 px-4 py-2.5 text-xs font-semibold text-violet-900 dark:border-violet-800/40 dark:text-violet-100">
                            Workflow · {msg.workflow.goal} {/* 展示本轮工作流目标 */}
                          </p>
                          <ul className="space-y-3 px-4 py-3 text-sm text-violet-950 dark:text-violet-50">
                            {msg.workflow.steps.map((step) => {
                              const downstream = findDownstreamSteps(msg.workflow.steps, step.id);
                              return (
                                <li key={step.id} className="rounded-lg bg-white/40 ring-1 ring-violet-500/10 dark:bg-violet-950/20 dark:ring-violet-500/15">
                                  <div className="flex flex-wrap items-baseline gap-2 px-3 py-2">
                                    <span className="text-base" aria-hidden>
                                      {workflowStepStatusGlyph(step.status)}
                                    </span>
                                    <span className="font-medium">{step.name}</span>
                                    <span className="font-mono text-[10px] text-violet-600/90 dark:text-violet-400/90">
                                      {step.id}
                                    </span>
                                    <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 dark:text-violet-300">
                                      {step.action}
                                      {typeof step.durationMs === "number" ? ` · ${step.durationMs}ms` : ""}
                                    </span>
                                    {step.error ? (
                                      <span className="text-xs text-red-600 dark:text-red-400">{step.error}</span>
                                    ) : null}
                                  </div>
                                  {typeof step.retry === "number" ? (
                                    <p className="border-t border-violet-200/40 px-3 py-1 text-[11px] text-violet-800/80 dark:border-violet-800/35 dark:text-violet-100/85">
                                      <span className="font-semibold">retry：</span>
                                      {/* 展示 Planner 下发的步骤级重试上限；未声明时服务端使用默认常量 */}
                                      {step.retry}
                                    </p>
                                  ) : null}
                                  {step.dependsOn?.length ? (
                                    <p className="border-t border-violet-200/40 px-3 py-1.5 text-[11px] text-violet-800/90 dark:border-violet-800/30 dark:text-violet-200/90">
                                      <span className="font-semibold">dependsOn：</span>
                                      {step.dependsOn.map((id) => (
                                        <span
                                          key={id}
                                          className="ml-1 inline-block rounded bg-violet-600/10 px-1.5 py-0.5 font-mono text-[10px]"
                                        >
                                          {id} ({stepIdToName(msg.workflow.steps, id)})
                                        </span>
                                      ))}
                                    </p>
                                  ) : null}
                                  {step.injectedContextPreview ? (
                                    <details className="border-t border-violet-200/40 dark:border-violet-800/30">
                                      <summary className="cursor-pointer select-none px-3 py-1.5 text-[11px] font-semibold text-violet-900 dark:text-violet-100">
                                        注入上下文预览
                                      </summary>
                                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 pb-2 text-[11px] leading-relaxed text-violet-900/95 dark:text-violet-100/95">
                                        {step.injectedContextPreview}
                                      </pre>
                                    </details>
                                  ) : null}
                                  <div className="border-t border-transparent px-3 py-2 text-[11px] text-violet-700/95 dark:text-violet-300/95">
                                    <span className="font-semibold">输出摘录：</span>
                                    <span className="font-mono whitespace-pre-wrap break-words">
                                      {typeof step.output === "string"
                                        ? step.output.slice(0, 280)
                                        : step.output != null
                                          ? JSON.stringify(step.output).slice(0, 280)
                                          : "—"}
                                      {typeof step.output === "string" && step.output.length > 280 ? "…" : ""}
                                    </span>
                                  </div>
                                  {downstream.length ? (
                                    <p className="rounded-b-lg border-t border-violet-200/50 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-800 dark:border-violet-800/35 dark:text-violet-100">
                                      ↓ 被后继步骤用作依赖：
                                      {downstream.map((d) => (
                                        <span key={d.id} className="ml-1 inline font-medium">
                                          {d.name}
                                        </span>
                                      ))}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          {/* 第16天：Workflow DAG 可视化（邻接/依赖边列表：先满足「能看见图」的最低交付） */}
                          <div className="border-t border-violet-200/60 bg-white/30 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/15">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                              Workflow DAG（dependsOn）
                            </p>
                            <ul className="space-y-1.5 text-[11px] leading-relaxed text-violet-900/95 dark:text-violet-50/95">
                              {msg.workflow.steps.map((s) => {
                                // 遍历每个步骤：渲染「节点 → 依赖」的可读边列表
                                const depLine =
                                  s.dependsOn && s.dependsOn.length > 0
                                    ? s.dependsOn
                                        .map((did) => `${did}（${stepIdToName(msg.workflow.steps, did)}）`) // 把依赖 id 转成「id（名称）」提升可读性
                                        .join("，") // 多个依赖用中文逗号拼接
                                    : "（无依赖，可与同批其它无依赖步骤并行启动）"; // 无依赖：提示并行语义
                                return (
                                  // key 使用稳定 step id：避免同索引复用导致 React reconcile 异常
                                  <li key={s.id} className="whitespace-pre-wrap break-words">
                                    <span className="font-semibold">{s.name}</span>
                                    <span className="font-mono text-violet-700/90 dark:text-violet-300/90"> {s.id}</span>
                                    <span className="text-zinc-500 dark:text-zinc-400"> ← 依赖：</span>
                                    <span>{depLine}</span>
                                  </li>
                                ); // map return 结束
                              })}
                            </ul>
                          </div>
                          {/* 第16天：Execution Batch Timeline（按调度批次展示并行边界） */}
                          {msg.workflow.executionBatches && msg.workflow.executionBatches.length > 0 ? (
                            <div className="border-t border-violet-200/60 bg-white/35 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                                Execution Batch Timeline
                              </p>
                              <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-violet-900/95 dark:text-violet-50/95">
                                {msg.workflow.executionBatches.map((b) => {
                                  // 遍历每个批次：展示 batchIndex、时间与并行 stepIds
                                  const hhmmss = formatZhHhMmSs(b.ts); // 将批次开始时间格式化为「时:分:秒」
                                  const names = b.stepIds
                                    .map((id) => `${id}:${stepIdToName(msg.workflow.steps, id)}`) // 组合「id:名称」便于对照步骤卡
                                    .join(" | "); // 用竖线分隔同批并行步骤，强调并行边界
                                  return (
                                    // key 使用 batchIndex：批次号天然唯一且稳定
                                    <li key={b.batchIndex} className="whitespace-pre-wrap break-words">
                                      <span className="text-violet-600 dark:text-violet-300">Batch #{b.batchIndex}</span>
                                      <span className="text-zinc-400 dark:text-zinc-500"> {hhmmss}</span>
                                      <span className="text-zinc-700 dark:text-zinc-200"> · {names}</span>
                                    </li>
                                  ); // map return 结束
                                })}
                              </ul>
                            </div>
                          ) : null}
                          {/* 第15天：Execution Timeline——把服务端 trace 以「时间 + 文案」对齐 LangSmith/OpenAI tracing 的阅读习惯 */}
                          {msg.workflow.executionTimeline?.length ? (
                            <div className="border-t border-violet-200/60 bg-white/35 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                                Execution Timeline
                              </p>
                              <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-violet-900/95 dark:text-violet-50/95">
                                {msg.workflow.executionTimeline.map((ev, ti) => {
                                  const hhmmss = new Date(ev.ts).toLocaleTimeString("zh-CN", {
                                    hour12: false, // 使用 24 小时制，接近文档示例的可扫读样式
                                    hour: "2-digit", // 两位数小时：左侧补零
                                    minute: "2-digit", // 两位数分钟
                                    second: "2-digit", // 两位数秒：形成「时:分:秒」轨迹
                                  }); // toLocaleTimeString 结束
                                  const stepHint = ev.stepId ? ` · ${ev.stepId}` : ""; // 若事件绑定具体 step id，则在时间戳后附上弱提示
                                  return (
                                    // key 组合 ts+ti：避免同一时间戳多条事件触发 React reconcile 告警
                                    <li key={`${ev.ts}-${ti}`} className="whitespace-pre-wrap break-words">
                                      <span className="text-violet-600 dark:text-violet-300">{hhmmss}</span>
                                      <span className="text-zinc-400 dark:text-zinc-500">{stepHint}</span>
                                      <span className="text-zinc-700 dark:text-zinc-200"> {ev.message}</span>
                                    </li>
                                  ); // map return 结束
                                })}
                              </ul>
                            </div>
                          ) : null}
                          <div className="border-t border-violet-200/70 bg-violet-500/5 px-4 py-3 dark:border-violet-800/40">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                              最终结果
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-violet-950 dark:text-violet-50">
                              {msg.finalSummary} {/* 服务端汇总后的答复 */}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={`todo-${index}`} className="flex justify-start">
                      <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-teal-50/50 px-4 py-3 shadow-sm dark:border-emerald-800/50 dark:from-emerald-950/35 dark:to-teal-950/20">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                          待办
                        </p>
                        <ul className="space-y-2.5 text-sm text-emerald-950 dark:text-emerald-50">
                          {msg.items.map((item: TodoItem, i: number) => (
                            <li key={i} className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-0.5 size-4 shrink-0 rounded border-emerald-300 text-emerald-600"
                                checked={item.done}
                                readOnly
                              />
                              <span className="leading-relaxed">{item.task}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}

                {loading ? (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-zinc-200/90 bg-zinc-50/95 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/90">
                      <div className="flex gap-1">
                        <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-duration:0.6s]" />
                        <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0.12s] [animation-duration:0.6s]" />
                        <span className="size-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0.24s] [animation-duration:0.6s]" />
                      </div>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">正在思考…</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <form
                onSubmit={handleSubmit}
                className="shrink-0 border-t border-zinc-200/70 bg-zinc-50/50 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/50 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    className="min-h-[48px] flex-1 resize-y rounded-xl border-0 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 ring-1 ring-zinc-200/90 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/35 dark:bg-zinc-800/90 dark:text-zinc-100 dark:ring-zinc-700 dark:placeholder:text-zinc-500 dark:focus:ring-violet-400/30"
                    rows={2}
                    value={input}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={loading}
                    placeholder="输入消息，Enter 发送 · Shift+Enter 换行"
                    maxLength={2000}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-45 sm:h-auto sm:min-h-[48px] sm:self-stretch"
                  >
                    {loading ? "处理中" : "发送"}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500 sm:text-left">
                  {input.length}/2000
                </p>
              </form>
            </section>

            {/* Memory 侧栏 */}
            <aside className="flex min-h-[260px] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/70 shadow-lg shadow-zinc-900/5 ring-1 ring-white/50 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/65 dark:shadow-black/30 dark:ring-zinc-700/40 lg:h-[calc(100dvh-11rem)] lg:w-[300px] xl:w-[320px]">
              <div className="border-b border-zinc-200/70 px-4 py-4 dark:border-zinc-800/80">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">长期记忆</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  服务端返回的 Memory，便于观察路由与压缩效果。
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    short {memory.shortTerm.length}
                  </span>
                  <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    items {memory.items.length}
                  </span>
                </div>
              </div>
              <ul className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-3">
                {memory.items.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                    暂无条目；多聊几句或触发总结后会出现。
                  </li>
                ) : (
                  memory.items.map((item: MemoryItem, i: number) => (
                    <li
                      key={`${item.content}-${i}`}
                      className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                        item.importance === "high"
                          ? "border border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-50"
                          : "border border-zinc-200/70 bg-zinc-50/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200"
                      }`}
                    >
                      <span
                        className={`mb-1 inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          item.importance === "high"
                            ? "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                            : "bg-zinc-200/80 text-zinc-600 dark:bg-zinc-600/50 dark:text-zinc-300"
                        }`}
                      >
                        {item.importance}
                      </span>
                      <p className="mt-1">{item.content}</p>
                    </li>
                  ))
                )}
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
