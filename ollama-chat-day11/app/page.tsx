"use client"; // 声明本文件为 Next.js 客户端组件，启用浏览器端 Hooks 与事件

/**
 * Day 11 聊天前端：与 `/api/chat` 交互，展示用户气泡与多种助手卡片（普通文本 / 天气 / 总结 / 待办）。
 *
 * 状态策略：
 * - `bubbles` 是唯一渲染数据源；助手侧用 discriminated union（variant）区分 UI；
 * - `memory` 每轮用响应整体覆盖，与后端压缩策略保持一致；
 * - `scheduleBubblesCommit` 用 requestAnimationFrame 合并同一帧内的多次气泡更新，减轻抖动。
 *
 * 数据流：用户在输入框发送 → 将历史气泡降级为 `ChatMessage[]` 并附上本轮输入 → POST → 根据 `type` 转成助手气泡并追加。
 */

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react"; // 从 React 引入事件类型、副作用、引用与状态 API

// 与后端接口约定的基础消息结构。
// 注意：这里是「传输层消息」，不包含天气卡片 / Todo 卡片等富展示字段。
type ChatMessage = {
  // 消息发送方：用户或助手，用于对话序列语义
  role: "user" | "assistant";
  // 纯文本正文，与后端 `ChatMessage` 一致
  content: string;
};

// Todo 业务卡片的数据结构。
// done 目前仅展示状态，前端未提供交互更新逻辑（只读勾选框）。
type TodoItem = {
  // 待办任务描述字符串
  task: string;
  // 是否已完成，当前仅用于展示勾选状态
  done: boolean;
};

// 前端维护的记忆信息（与 Day11 后端约定：longTerm 为聚合后的长字符串）。
// - shortTerm：最近若干条对话快照，便于在侧栏观察上下文窗口；
// - longTerm：跨轮次沉淀的事实文本，用于下一请求带回服务端。
type Memory = {
  // 短期记忆：最近若干轮对话，用于调试与和后端对齐
  shortTerm: ChatMessage[];
  // 长期记忆：压缩后的跨轮事实字符串
  longTerm: string;
};

// /api/chat 的联合返回类型，前端通过 type 做分发渲染。
// 设计成可判别联合（discriminated union），可在 TS 层获得完整分支类型收窄。
type ChatApiResult =
  // 普通聊天分支：文本内容与记忆
  | { type: "chat"; content: string; memory: Memory }
  // 天气分支：关键词、结果文案与记忆
  | { type: "weather"; keyword: string; result: string; memory: Memory }
  // 总结分支：总结正文与记忆
  | { type: "summary"; text: string; memory: Memory }
  // 待办分支：条目列表与记忆
  | { type: "todo"; items: TodoItem[]; memory: Memory };

/** 用户侧气泡：仅纯文本。 */
type UserBubble = { role: "user"; content: string }; // 用户气泡：固定 role 为 user，仅含 content

/** 助手侧气泡：用 variant 区分四种渲染分支（与普通字符串分开，便于 TS 收窄）。 */
type AssistantBubble =
  // 助手普通文本气泡
  | { role: "assistant"; variant: "chat"; content: string }
  // 助手天气卡片气泡
  | { role: "assistant"; variant: "weather"; keyword: string; result: string }
  // 助手总结卡片气泡
  | { role: "assistant"; variant: "summary"; text: string }
  // 助手待办列表气泡
  | { role: "assistant"; variant: "todo"; items: TodoItem[] };

/** 列表渲染用的联合：先按 role 分出用户 / 助手，再按 variant 细分手助手卡片类型。 */
type Bubble = UserBubble | AssistantBubble; // 对话区单条展示单元的联合类型

/**
 * 将 `/api/chat` 的联合响应映射为助手气泡（AssistantBubble）。
 * 隔离点：后续若后端字段改名或增加类型，只需改此处与 fetch 处的类型断言。
 */
function apiToAssistant(data: ChatApiResult): AssistantBubble {
  // 若为普通聊天类型，映射为 variant chat
  if (data.type === "chat") {
    // 返回助手聊天气泡，content 来自接口
    return { role: "assistant", variant: "chat", content: data.content }; // 组装 chat 变体
  } // 结束 chat 分支
  // 若为天气类型，映射为 variant weather
  if (data.type === "weather") {
    // 返回天气卡片，携带关键词与结果摘要
    return {
      // 固定为助手角色
      role: "assistant",
      // 固定为天气变体
      variant: "weather",
      // 城市或查询关键词
      keyword: data.keyword,
      // 天气描述正文
      result: data.result,
    }; // 返回天气对象字面量
  } // 结束 weather 分支
  // 若为总结类型，映射为 variant summary
  if (data.type === "summary") {
    // 返回总结卡片，text 为全文
    return { role: "assistant", variant: "summary", text: data.text }; // 组装 summary 变体
  } // 结束 summary 分支
  // 其余情况视为 todo 类型
  return { role: "assistant", variant: "todo", items: data.items }; // 组装 todo 变体并返回
} // 结束 apiToAssistant

/** 页面根组件：左侧对话 + 右侧 Memory 调试侧栏（-lg 以下单列堆叠）。 */
export default function HomePage() {
  // 输入框内容（受控组件）。
  const [input, setInput] = useState(""); // 受控输入框的当前字符串与更新函数
  // 聊天区渲染源（用户 + 助手所有气泡）。
  // 所有 UI 展示都由它驱动，属于页面最核心状态。
  const [bubbles, setBubbles] = useState<Bubble[]>([]); // 气泡列表状态与 setter
  // 请求中状态，控制按钮/输入可用性与文案。
  // 避免并发提交导致消息顺序错乱。
  const [loading, setLoading] = useState(false); // 是否正在等待接口响应
  // 统一错误提示文案（顶部短提示）。
  const [errorText, setErrorText] = useState(""); // 全局简短错误提示字符串
  // 与后端同步的记忆对象。
  // 每次响应后整体覆盖，确保本地状态与后端最新记忆一致。
  const [memory, setMemory] = useState<Memory>({ shortTerm: [], longTerm: "" }); // 记忆状态初始为空短期与空长期
  // 聊天列表容器引用，用于滚动到底部。
  const listRef = useRef<HTMLDivElement>(null); // 绑定滚动容器的 DOM 引用
  // 下一帧准备提交的 bubbles 快照。
  // 通过 ref 暂存，避免同一帧内多次 setState 造成无意义重渲染。
  const pendingBubblesRef = useRef<Bubble[] | null>(null); // RAF 批处理待提交的 bubbles
  // requestAnimationFrame 任务 id，用于去重调度与卸载清理。
  const rafIdRef = useRef<number | null>(null); // 当前排队的 animation frame id

  useEffect(() => {
    // 组件卸载时清理 raf，避免无效 setState。
    // 防止页面切换后仍尝试提交 bubbles，触发 React 警告。
    return () => {
      // 若仍存在未执行的 RAF，则取消之
      if (rafIdRef.current !== null) {
        // 取消浏览器动画帧回调
        cancelAnimationFrame(rafIdRef.current); // 传入保存的 id
      } // 结束 if
    }; // 返回清理函数
  }, []); // 仅在挂载时注册卸载清理

  useEffect(() => {
    // 每次消息变化后自动滚动到最底部，保证最新消息可见。
    // loading 也纳入依赖，确保“发送后等待中”状态下滚动逻辑同样触发。
    listRef.current?.scrollTo({
      // 滚动到可滚动区域的底部位置
      top: listRef.current.scrollHeight, // 总高度作为滚动目标 top
      behavior: "smooth", // 平滑滚动提升体验
    }); // 调用 scrollTo
  }, [bubbles, loading]); // 依赖气泡列表与加载状态

  // 在同一帧内合并多次 bubbles 更新，减少重渲染抖动。
  // 这是一个微型批处理器：同一帧只真正 setState 一次。
  function scheduleBubblesCommit(next: Bubble[]) {
    pendingBubblesRef.current = next; // 暂存下一帧要提交的气泡快照
    // 若本帧已排队 RAF，则不再重复调度
    if (rafIdRef.current !== null) return; // 提前返回避免重复 requestAnimationFrame
    // 安排下一帧执行真正的 setState
    rafIdRef.current = requestAnimationFrame(() => {
      // 若有待提交快照则写入 React 状态
      if (pendingBubblesRef.current) {
        setBubbles(pendingBubblesRef.current); // 一次性更新 bubbles
      } // 结束 if
      pendingBubblesRef.current = null; // 清空待提交引用
      rafIdRef.current = null; // 重置 RAF id，允许再次调度
    }); // 结束 requestAnimationFrame 回调
  } // 结束 scheduleBubblesCommit

  async function handleSend() {
    const userInput = input.trim(); // 去掉首尾空白后的用户输入
    // 输入为空或仍在处理中时，不触发请求。
    // 双重防抖：交互层阻断无效请求 + 状态层阻断并发请求。
    if (!userInput || loading) return; // 空输入或加载中直接退出

    setErrorText(""); // 新请求开始时清空顶部错误提示

    /*
     * 将气泡列表扁化为 ChatMessage[]：
     * - 天气卡：合成「关键词 + 结果」一行摘要；
     * - 总结卡：用全文 text；
     * - 待办卡：只用每条 task 文本拼接（勾选状态不传——后端若需要可自行扩展协议）。
     */
    const forRequest: ChatMessage[] = bubbles.map((b: Bubble) =>
      // 若当前气泡是用户消息，原样作为 ChatMessage
      b.role === "user"
        ? b
        : // 助手侧按 variant 降级为纯文本
          b.variant === "chat"
          ? { role: "assistant" as const, content: b.content }
          : b.variant === "weather"
            ? { role: "assistant" as const, content: `🔍 ${b.keyword}\n${b.result}` }
            : b.variant === "summary"
              ? { role: "assistant" as const, content: b.text }
              : {
                  // 待办：拼接每条 task
                  role: "assistant" as const,
                  content: b.items.map((item: TodoItem) => item.task).join("\n"),
                }
    ); // 结束 map

    const withUser: ChatMessage[] = [...forRequest, { role: "user", content: userInput }]; // 历史加上本轮用户句
    // 乐观更新：先把用户气泡写入 pending/next，请求返回后再追加助手气泡。
    // 失败时也在同一列表末尾追加错误提示，保证时间顺序与用户感知一致。
    const nextBubbles: Bubble[] = [...bubbles, { role: "user", content: userInput }]; // 本地先追加用户气泡

    scheduleBubblesCommit(nextBubbles); // 批处理提交新增用户气泡
    setInput(""); // 清空输入框
    setLoading(true); // 标记请求进行中，禁用重复发送

    try {
      // 发送完整上下文（messages + memory）给后端进行路由与执行。
      // messages 提供会话文本，memory 提供压缩记忆，两者结合提升多轮稳定性。
      const res = await fetch("/api/chat", {
        method: "POST", // HTTP POST 提交 JSON
        headers: { "Content-Type": "application/json" }, // 声明请求体为 JSON
        body: JSON.stringify({ messages: withUser, memory }), // 序列化消息与记忆
      }); // 结束 fetch 选项

      if (!res.ok) {
        // 后端返回失败时，将错误同时展示在顶部和对话区。
        // 顶部用于快速感知；对话区保留上下文，便于回看问题发生点。
        const data = (await res.json()) as { error?: string }; // 解析错误响应体
        const content = data.error || "请求失败，请稍后重试"; // 优先用服务端 error 字段
        setErrorText(content); // 顶部展示错误
        scheduleBubblesCommit([
          // 在已有用户气泡后追加助手错误气泡
          ...nextBubbles,
          { role: "assistant", variant: "chat", content },
        ]); // 对话区展示同一错误文案
        return; // 不再继续解析成功分支
      } // 结束 !res.ok

      // 正常返回后，用后端返回的最新 memory 覆盖本地状态。
      // 注意这里不做 merge，直接替换能避免前后端记忆分叉。
      const data = (await res.json()) as ChatApiResult; // 断言成功响应形状
      setMemory(data.memory); // 用服务端记忆整体覆盖
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]); // 追加助手气泡
    } catch (error) {
      // 网络异常通常是 Ollama 未启动或本地网络不可达。
      // 这里给出固定文案，避免把底层异常对象直接暴露给用户。
      console.error(error); // 开发者控制台记录原始错误
      setErrorText("网络异常，请检查 Ollama 与网络连接"); // 用户可读中文提示
      scheduleBubblesCommit([
        // 在对话区追加 Network error 英文占位（与示例一致）
        ...nextBubbles,
        { role: "assistant", variant: "chat", content: "Network error" },
      ]); // 批处理提交错误气泡
    } finally {
      // 请求结束后恢复输入能力。
      // 无论成功/失败都执行，避免按钮卡死在 loading。
      setLoading(false); // 解除加载状态
    } // 结束 finally
  } // 结束 handleSend

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // 阻止表单默认刷新，改为前端异步提交。
    // 统一入口到 handleSend，保证点击按钮与回车提交逻辑一致。
    e.preventDefault(); // 阻止浏览器原生表单提交与页面刷新
    handleSend(); // 调用异步发送逻辑
  } // 结束 handleSubmit

  return (
    // 页面主容器：居中、最小屏高、最大宽度与内边距
    <main className="mx-auto min-h-screen max-w-5xl p-8">
      {/* 页面主标题 */}
      <h1 className="mb-6 text-2xl font-bold">Day 11 - Memory 升级 Agent</h1>
      {/* 引导用户多轮对话的说明段落 */}
      <p className="mb-4 text-sm text-zinc-600">
        试试先说身份目标，再多轮聊天：例如「我是前端工程师，目标是转型 Agent」
      </p>

      {/* 大屏：主栏约占 2/3，侧栏 1/3；小屏垂直排列 */}
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        {/* 左侧对话区域，供屏幕阅读器识别 */}
        <section aria-label="对话区">
          {/* 输入表单：横向排列输入框与按钮 */}
          <form onSubmit={handleSubmit} className="mb-3 flex gap-2">
            {/* 文本输入框，占满剩余宽度 */}
            <input
              className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
              value={input} // 受控 value
              onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)} // 同步输入到 state
              disabled={loading} // 加载中禁用输入
              placeholder="输入消息..." // 占位提示
              maxLength={2000} // 限制最大字符数
            />
            {/* 提交按钮，类型 submit 触发表单 onSubmit */}
            <button
              type="submit" // 表单提交按钮
              disabled={loading} // 加载中禁用点击
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
            >
              {/* 根据 loading 切换按钮文案 */}
              {loading ? "处理中..." : "发送"}
            </button>
          </form>

          {/* 有错误时渲染顶部红色提示 */}
          {errorText ? <p className="mb-3 text-sm text-red-600">{errorText}</p> : null}

          {/* 可滚动消息列表容器 */}
          <div
            ref={listRef} // 绑定滚动引用
            className="max-h-[65vh] min-h-[220px] space-y-3 overflow-y-auto rounded border border-zinc-200 p-4 dark:border-zinc-700"
          >
            {/* 按消息类型渲染不同业务卡片（普通聊天/天气/总结/Todo） */}
            {/* 这里的分支顺序与 Bubble 联合类型保持一致，便于维护时一一对应。 */}
            {bubbles.length === 0 ? (
              // 无消息时的占位提示
              <p className="text-zinc-500">聊天记录会显示在这里</p>
            ) : (
              // 有消息时遍历渲染
              bubbles.map((msg: Bubble, index: number) => {
                // 用户消息分支
                if (msg.role === "user") {
                  return (
                    // 用户气泡右对齐视觉（ml-8），深色背景
                    <div
                      key={`user-${index}`} // 列表 key，用户侧用索引前缀
                      className="ml-8 rounded-lg bg-black px-3 py-2 text-white dark:bg-zinc-100 dark:text-black"
                    >
                      {/* 小标签：你 */}
                      <p className="mb-1 text-xs opacity-70">你</p>
                      {/* 保留换行的用户正文 */}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ); // 结束 return
                } // 结束 user 分支

                // 助手普通聊天分支
                if (msg.variant === "chat") {
                  return (
                    // 助手文本气泡，浅色背景
                    <div
                      key={`asst-${index}`} // 助手 chat key
                      className="mr-8 rounded-lg bg-zinc-100 px-3 py-2 text-black dark:bg-zinc-800 dark:text-zinc-50"
                    >
                      {/* 小标签：助手 */}
                      <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">助手</p>
                      {/* 助手回复正文 */}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ); // 结束 return
                } // 结束 chat 分支

                // 助手天气卡片分支
                if (msg.variant === "weather") {
                  return (
                    // 天气卡片：天蓝色主题边框与背景
                    <div
                      key={`weather-${index}`} // 天气 key
                      className="mr-8 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                    >
                      {/* 区块标题：天气 */}
                      <p className="mb-1 text-xs opacity-80">天气</p>
                      {/* 关键词加粗，结果紧随其后 */}
                      <p className="whitespace-pre-wrap">
                        <span className="font-medium">{msg.keyword}</span> · {msg.result}
                      </p>
                    </div>
                  ); // 结束 return
                } // 结束 weather 分支

                // 助手总结卡片分支
                if (msg.variant === "summary") {
                  return (
                    // 总结卡片：琥珀色主题与阴影
                    <div
                      key={`summary-${index}`} // 总结 key
                      className="mr-8 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
                    >
                      {/* 总结标题栏 */}
                      <p className="border-b border-amber-200/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800/50 dark:text-amber-200">
                        总结
                      </p>
                      {/* 总结正文区域 */}
                      <p className="px-3 py-3 text-sm whitespace-pre-wrap text-amber-950 dark:text-amber-50">
                        {msg.text}
                      </p>
                    </div>
                  ); // 结束 return
                } // 结束 summary 分支

                // 默认：待办列表分支（todo）
                return (
                  // 待办卡片：绿色主题
                  <div
                    key={`todo-${index}`} // 待办 key
                    className="mr-8 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40"
                  >
                    {/* Todo 仅用于展示，勾选框当前为只读。 */}
                    {/* 若后续要支持勾选同步，可在此处增加 onChange 并回传后端。 */}
                    {/* 待办区块标题 */}
                    <p className="mb-2 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                      待办计划
                    </p>
                    {/* 待办条目无序列表 */}
                    <ul className="space-y-1 text-sm text-emerald-950 dark:text-emerald-50">
                      {msg.items.map((item: TodoItem, i: number) => (
                        // 单行待办：复选框 + 文案
                        <li key={i} className="flex items-center gap-2">
                          <input type="checkbox" checked={item.done} readOnly /> {/* 只读勾选 */}
                          <span>{item.task}</span> {/* 任务描述 */}
                        </li>
                      ))}
                    </ul>
                  </div>
                ); // 结束 todo return
              }) // 结束 map 回调
            )}
          </div>
        </section>

        {/* 调试用途：展示服务端回传的 shortTerm 条数与 longTerm 全文 */}
        <aside
          className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700" // 侧栏边框与内边距
          aria-label="Memory 调试" // 无障碍标签
        >
          {/* 侧栏标题 */}
          <h3 className="mb-2 text-sm font-semibold">🧠 Memory Debug</h3>
          {/* shortTerm 条数可快速观察上下文窗口是否被裁剪。 */}
          {/* 该区域主要用于调试记忆策略，生产环境可按需隐藏。 */}
          <p className="mb-2 text-xs text-zinc-500">shortTerm: {memory.shortTerm.length} 条</p>
          {/* 长期记忆全文，等宽字体可滚动 */}
          <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {memory.longTerm || "(暂无 longTerm 记忆)"}
          </pre>
        </aside>
      </div>
    </main>
  ); // 结束 return
} // 结束 HomePage
