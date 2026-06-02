"use client"; // 声明为客户端组件，启用浏览器端交互与 React Hooks

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"; // 引入类型与 Hooks：表单事件、副作用、DOM 引用、状态、派生 Store

import { ApiClientError, readApiData } from "@/lib/api/api-client"; // 统一 API 响应解析
import { MIMO_MODEL_IDS } from "@/lib/model/mimo-models"; // MiMo 模型 id 白名单
import {
  listWorkflowStateSummaries, // 经 Store 列出工作流摘要（侧栏历史）
  statesToSummaries, // 全量 WorkflowState[] → 侧栏摘要（与 list 共用一次结果）
  loadResumablePausedStates, // 加载所有可恢复的 HITL 暂停快照
  loadWorkflowState, // 按 workflowId 读取完整 WorkflowState
  loadStorageModePreference, // 从 localStorage 读取 local/backend 偏好
  persistWorkflowFromApi, // 将 API 返回的 workflow 写入 Store
  purgeExpiredWorkflowStates, // 清理过期记录，返回删除条数
  saveStorageModePreference, // 保存用户选择的存储模式偏好
  workflowStateToBubbleFields, // 将持久化快照还原为聊天气泡字段
} from "@/lib/workflow/workflow-persistence"; // 第19–20天：经 WorkflowStore 持久化
import {
  createWorkflowStore, // 按模式创建 localStorage 或后端 API Store
  type WorkflowStorageMode, // 存储模式：local | backend
} from "@/lib/workflow/workflow-store"; // 第20天：可插拔存储
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types"; // 历史列表类型
import type { ToolDescriptor, ToolMetricsSnapshot } from "@/lib/tools/tool-registry"; // 第22–23天：Tool Explorer
import type { KnowledgeMetricsSnapshot, QueryRewriteDebug, RetrievalMode, RetrievedChunkHit } from "@/lib/knowledge/knowledge-types"; // 第28天：RAG V5 类型
import { ChatComposer } from "@/app/components/ChatComposer"; // 第27天：聊天输入区
import { ChatToolbar } from "@/app/components/ChatToolbar"; // 第27天：聊天顶部控制栏
import { Header } from "@/app/components/Header"; // 顶部标题与状态徽标
import { KnowledgeSidebar } from "@/app/components/KnowledgeSidebar"; // 第28天：右侧知识库与调试侧栏
import { ChatTranscript } from "@/app/components/ChatTranscript"; // 第28天：聊天消息列表组件
import type { AssistantBubble, Bubble, ChatApiResult, ChatMessage, ChatProvider, Memory, TodoItem } from "@/app/types/chat-ui"; // 第28天：聊天 UI 类型
import { apiToAssistant } from "@/app/utils/chat-ui"; // 第28天：API 响应转气泡

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
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowStateListItem[]>([]); // 第19天：历史列表摘要
  const [restoredFromDisk, setRestoredFromDisk] = useState(false); // 是否已完成首次从存储恢复
  const [storageMode, setStorageMode] = useState<WorkflowStorageMode>("local"); // 第20天：local | backend
  const [registeredTools, setRegisteredTools] = useState<ToolDescriptor[]>([]); // 第22天：Tool Registry 列表
  const [toolMetrics, setToolMetrics] = useState<Record<string, ToolMetricsSnapshot>>({}); // 第23天：Runtime Metrics
  const [knowledgeImportText, setKnowledgeImportText] = useState(""); // 第24天：知识导入 textarea
  const [knowledgeImportTitle, setKnowledgeImportTitle] = useState(""); // 第24天：可选文档标题
  const [knowledgeMetrics, setKnowledgeMetrics] = useState<KnowledgeMetricsSnapshot | null>(null); // 第24天：知识指标
  const [knowledgeDocCount, setKnowledgeDocCount] = useState(0); // 第24天：文档数量
  const [ragDebugQuery, setRagDebugQuery] = useState("Workflow Runtime"); // 第27天：RAG 调试查询
  const [ragDebugHits, setRagDebugHits] = useState<RetrievedChunkHit[]>([]); // 第27天：最近检索命中
  const [ragDebugRewrite, setRagDebugRewrite] = useState<QueryRewriteDebug | null>(null); // 第27天：Query Rewrite 调试信息
  const [ragDebugRecallK, setRagDebugRecallK] = useState(20); // 第27天：第一阶段召回数量
  const [ragDebugTopK, setRagDebugTopK] = useState(5); // 第27天：TopK（默认 5）
  const [ragDebugMinScore, setRagDebugMinScore] = useState(0.3); // 第27天：最终分阈值
  const [ragDebugMode, setRagDebugMode] = useState<RetrievalMode>("hybrid"); // 第27天：检索模式
  const [knowledgeLoading, setKnowledgeLoading] = useState(false); // 第24天：知识 API 加载中
  const workflowStore = useMemo(
    () => createWorkflowStore(storageMode), // 随模式切换 Store 实现
    [storageMode] // 依赖 storageMode
  ); // workflowStore 结束
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

  /** 第20天：挂载时读取 Storage Mode 偏好。 */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStorageMode(loadStorageModePreference()); // 从 localStorage meta 恢复用户选择
    }, 0); // 避免在 effect 主体里同步 setState
    return () => window.clearTimeout(timer); // 卸载时清理延迟任务
  }, []); // 仅挂载一次

  /** 第22–23天：加载 Tool Registry（Tool Explorer + Metrics）。 */
  useEffect(() => {
    let cancelled = false; // 卸载时忽略异步结果
    (async () => {
      try {
        const res = await fetch("/api/tools"); // GET /api/tools
        const payload = await readApiData<{ tools: ToolDescriptor[]; metrics: Record<string, ToolMetricsSnapshot> }>(
          res
        ); // 第23天：tools + metrics
        if (!cancelled) {
          setRegisteredTools(payload.tools ?? []); // 工具描述列表
          setToolMetrics(payload.metrics ?? {}); // 全量指标
        }
      } catch (err) {
        console.warn("[ToolExplorer] load failed", err); // 加载失败
      }
    })();
    return () => {
      cancelled = true; // 标记取消
    };
  }, []); // 仅挂载一次

  /** 第24天：加载知识库指标与文档数（Knowledge Runtime 可观测性）。 */
  const refreshKnowledgePanel = async () => {
    try {
      const res = await fetch("/api/knowledge"); // GET 知识库
      const payload = await readApiData<{
        documents: { id: string }[];
        metrics: KnowledgeMetricsSnapshot;
        lastRetrieval: {
          query: string;
          recallK?: number;
          topK: number;
          minScore?: number;
          mode?: RetrievalMode;
          rewrite?: QueryRewriteDebug;
          hits: RetrievedChunkHit[];
        } | null;
      }>(res);
      setKnowledgeMetrics(payload.metrics ?? null); // 指标
      setKnowledgeDocCount(payload.documents?.length ?? 0); // 文档数
      if (payload.lastRetrieval) {
        setRagDebugHits(payload.lastRetrieval.hits ?? []); // 恢复最近检索（含空结果）
        setRagDebugRewrite(payload.lastRetrieval.rewrite ?? null); // 恢复 rewritten queries
        setRagDebugQuery(payload.lastRetrieval.query); // 同步查询词
        setRagDebugRecallK(payload.lastRetrieval.recallK ?? 20); // 同步 recallK
        setRagDebugTopK(payload.lastRetrieval.topK); // 同步 TopK
        setRagDebugMode(payload.lastRetrieval.mode ?? "hybrid"); // 同步检索模式
        if (typeof payload.lastRetrieval.minScore === "number") {
          setRagDebugMinScore(payload.lastRetrieval.minScore); // 同步 minScore
        }
      }
    } catch (err) {
      console.warn("[Knowledge] load failed", err); // 加载失败
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshKnowledgePanel(); // 挂载时拉取知识库状态
    }, 0); // 避免在 effect 主体里同步触发状态更新
    return () => window.clearTimeout(timer); // 卸载时清理延迟任务
  }, []); // 仅挂载一次

  /** 第24天：导入笔记到知识库（chunk → embedding → save）。 */
  const handleImportKnowledge = async () => {
    const content = knowledgeImportText.trim(); // 正文
    if (!content) {
      setErrorText("请先输入要导入的知识正文"); // 校验
      return;
    }
    setKnowledgeLoading(true); // 开始加载
    setErrorText(""); // 清空旧错误
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST", // 导入
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: knowledgeImportTitle.trim() || undefined,
          content,
        }),
      });
      await readApiData(res); // 解析 Envelope
      setKnowledgeImportText(""); // 清空 textarea
      await refreshKnowledgePanel(); // 刷新指标
    } catch (err) {
      setErrorText(err instanceof ApiClientError ? err.message : "知识导入失败"); // 展示错误
    } finally {
      setKnowledgeLoading(false); // 结束加载
    }
  };

  /** 第27天：RAG Debug — 手动触发多查询检索并展示 rewrite / score / rank / mode。 */
  const handleRagDebugRetrieve = async () => {
    const query = ragDebugQuery.trim(); // 查询词
    if (!query) return; // 空则跳过
    setKnowledgeLoading(true); // 加载中
    try {
      const res = await fetch("/api/knowledge/retrieve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query, // 查询文本
          recallK: ragDebugRecallK, // 第一阶段召回数量
          topK: ragDebugTopK, // 最终返回数量
          minScore: ragDebugMinScore, // 最低最终分阈值
          mode: ragDebugMode, // 检索模式
        }),
      });
      const payload = await readApiData<{
        hits: RetrievedChunkHit[];
        metrics: KnowledgeMetricsSnapshot;
        rewrite?: QueryRewriteDebug;
        minScore?: number;
      }>(res);
      setRagDebugHits(payload.hits ?? []); // 展示命中
      setRagDebugRewrite(payload.rewrite ?? null); // 展示 query rewrite 调试信息
      setKnowledgeMetrics(payload.metrics ?? null); // 更新 retrievalCount
      await refreshKnowledgePanel(); // 同步 lastRetrieval
    } catch (err) {
      setErrorText(err instanceof ApiClientError ? err.message : "检索失败"); // 错误提示
    } finally {
      setKnowledgeLoading(false); // 结束
    }
  };

  /** 第19–20天：挂载或切换 Store 后清理过期、刷新列表、恢复 paused 卡片。 */
  useEffect(() => {
    let cancelled = false; // 防止切换 storageMode 时竞态写状态
    (async () => {
      try {
        const removed = await purgeExpiredWorkflowStates(workflowStore); // 经 Store 清理
        if (!cancelled && removed > 0) console.log("[WorkflowPersist] purged", removed); // 调试
        const allStates = await workflowStore.list(); // 单次 list（backend 仅一次 GET /api/workflows）
        if (cancelled) return; // 已卸载或模式已切换
        setWorkflowHistory(statesToSummaries(allStates)); // 更新侧栏
        const pausedStates = await loadResumablePausedStates(workflowStore, allStates); // 复用全量，不再 list
        if (pausedStates.length === 0) {
          setRestoredFromDisk(true); // 无暂停单
          return; // 结束
        } // 无 paused
        const restoredBubbles: Extract<AssistantBubble, { variant: "workflow" }>[] =
          pausedStates.map((state) => {
            const fields = workflowStateToBubbleFields(state); // 转气泡字段
            return {
              role: "assistant", // 助手
              variant: "workflow", // 工作流卡
              workflow: fields.workflow, // 含 waiting_confirmation
              finalSummary: fields.finalSummary, // 暂停说明
              paused: fields.paused, // true
              waitingStepId: fields.waitingStepId, // 待确认 id
            }; // workflow 变体
          }); // map
        setBubbles((prev) => {
          const existingIds = new Set(
            prev
              .filter(
                (b): b is Extract<Bubble, { role: "assistant"; variant: "workflow" }> =>
                  b.role === "assistant" && b.variant === "workflow"
              )
              .map((b) => b.workflow.id)
          ); // 已有 id
          const toAdd = restoredBubbles.filter((b) => !existingIds.has(b.workflow.id)); // 去重
          return [...prev, ...toAdd]; // 追加
        }); // setBubbles
        const latest = pausedStates[0]; // 最近 paused
        if (latest?.memory) setMemory(latest.memory); // 恢复 memory
        setRestoredFromDisk(true); // 标记完成
      } catch (err) {
        console.error(err); // 记录 Store 错误
        if (!cancelled) setErrorText("加载 Workflow 存储失败，请检查网络或切换 Storage Mode"); // 提示
      } // catch
    })(); // 立即执行 async
    return () => {
      cancelled = true; // 清理：忽略未完成请求的结果
    }; // cleanup
  }, [workflowStore]); // storageMode 变化会重建 Store 并重新跑

  /** 第20天：刷新历史列表（经当前 Store）。 */
  async function refreshWorkflowHistory() {
    const summaries = await listWorkflowStateSummaries(workflowStore); // 异步 list
    setWorkflowHistory(summaries); // 更新 UI
  } // refreshWorkflowHistory 结束

  /** 第20天：切换 local / backend 存储模式。 */
  function handleStorageModeChange(mode: WorkflowStorageMode) {
    setStorageMode(mode); // 更新状态 → useMemo 重建 Store
    saveStorageModePreference(mode); // 持久化用户偏好（meta 仍用 localStorage）
  } // handleStorageModeChange 结束

  /** 第19–22天：将 workflow API 结果写入当前 WorkflowStore（backend 仅 POST 一次）。 */
  async function persistWorkflowBubble(data: Extract<ChatApiResult, { type: "workflow" }>) {
    await persistWorkflowFromApi(
      workflowStore,
      {
        workflow: data.workflow, // 工作流
        memory: data.memory, // 记忆
        paused: data.paused, // 暂停
        waitingStepId: data.waitingStepId, // 待确认
        finalSummary: data.finalSummary, // 摘要
      },
      { storageMode } // 第22天：backend 跳过保存前 GET
    ); // 经 Store 写入
    await refreshWorkflowHistory(); // 更新侧栏（含 createdAt）
  } // persistWorkflowBubble 结束

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

      const data = await readApiData<ChatApiResult>(res); // 统一包：ok true + data
      setMemory(data.memory); // 覆盖本地记忆（含 items）
      if (data.type === "workflow") await persistWorkflowBubble(data); // 第20天：经 Store 持久化
      scheduleBubblesCommit([...nextBubbles, apiToAssistant(data)]); // 追加助手气泡
    } catch (error) {
      console.error(error); // 控制台记录异常
      const content =
        error instanceof ApiClientError
          ? error.message
          : "网络异常，请检查本机网络、Ollama 或小米 API 配置"; // 业务错 vs 网络
      setErrorText(content); // 用户提示
      scheduleBubblesCommit([
        ...nextBubbles,
        { role: "assistant", variant: "chat", content },
      ]); // 对话区错误气泡
    } finally {
      setLoading(false); // 恢复可交互
    } // finally 结束
  } // handleSend 结束

  /** 第18天：调用 confirm API 并更新对应 workflow 气泡。 */
  async function handleWorkflowConfirm(
    bubbleIndex: number, // 要更新的气泡下标
    workflowId: string, // 工作流 id
    stepId: string, // 待确认步骤 id
    decision: "confirm" | "cancel" // 用户决策
  ) {
    setErrorText(""); // 清空错误
    setLoading(true); // 锁定 UI
    const bubble = bubbles[bubbleIndex]; // 当前 workflow 气泡
    const resumeContext =
      bubble.role === "assistant" && bubble.variant === "workflow"
        ? {
            workflow: bubble.workflow, // 第19天：刷新后服务端无 pause-store 时用本地快照
            memory, // 记忆
            timeline: bubble.workflow.executionTimeline, // 时间线
          }
        : undefined; // 非 workflow 气泡不传
    try {
      const res = await fetch("/api/workflow/confirm", {
        method: "POST", // POST JSON
        headers: { "Content-Type": "application/json" }, // JSON
        body: JSON.stringify({
          workflowId, // 实例 id
          stepId, // 步骤 id
          decision, // confirm | cancel
          memory, // 记忆闭环
          provider, // 模型提供商
          mimoModel, // MiMo 模型
          resumeContext, // 第19天：hydrate pause-store
        }), // body 结束
      }); // fetch 结束
      const data = await readApiData<
        ChatApiResult & { paused?: boolean; waitingStepId?: string }
      >(res); // 统一包
      if (data.type !== "workflow") return; // 类型守卫
      setMemory(data.memory); // 更新记忆
      await persistWorkflowBubble(data); // 第20天：确认/取消后更新 Store
      scheduleBubblesCommit(
        bubbles.map((b, i) =>
          i === bubbleIndex && b.role === "assistant" && b.variant === "workflow"
            ? {
                role: "assistant", // 助手
                variant: "workflow", // 工作流
                workflow: data.workflow, // 新状态
                finalSummary: data.finalSummary, // 新摘要
                paused: data.paused, // 可能再次暂停
                waitingStepId: data.waitingStepId, // 下一步待确认
              }
            : b
        ) // map 更新单气泡
      ); // scheduleBubblesCommit
    } catch (error) {
      console.error(error); // 控制台
      setErrorText(
        error instanceof ApiClientError ? error.message : "确认请求网络异常"
      ); // 用户提示
    } finally {
      setLoading(false); // 恢复可交互
    } // finally
  } // handleWorkflowConfirm 结束

  /** 第19–20天：从历史列表点击恢复 workflow 卡片到对话区。 */
  async function handleRestoreWorkflowFromHistory(workflowId: string) {
    const state = await loadWorkflowState(workflowStore, workflowId); // 经 Store 读取
    if (!state) {
      setErrorText("工作流快照不存在或版本不兼容（当前 Storage Mode 下无此记录）"); // 用户提示
      return; // 终止
    } // 无快照
    const fields = workflowStateToBubbleFields(state); // 转气泡字段
    setMemory(fields.memory); // 恢复 memory
    const card: AssistantBubble = {
      role: "assistant", // 助手
      variant: "workflow", // 工作流
      workflow: fields.workflow, // 步骤状态
      finalSummary: fields.finalSummary, // 摘要
      paused: fields.paused, // 暂停
      waitingStepId: fields.waitingStepId, // 待确认
    }; // 卡片
    setBubbles((prev) => {
      if (prev.some((b) => b.role === "assistant" && b.variant === "workflow" && b.workflow.id === workflowId)) {
        return prev; // 已存在则不重复插入
      } // 去重
      return [...prev, card]; // 追加
    }); // setBubbles
  } // handleRestoreWorkflowFromHistory 结束

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 阻止表单默认提交刷新
    handleSend(); // 走异步发送
  } // handleSubmit 结束

  return (
    <main className="h-screen overflow-hidden bg-zinc-100 font-sans text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex h-full max-w-[1360px] flex-col px-4 py-4 sm:px-5 lg:px-6">
          <Header
            provider={provider}
            useWorkflow={useWorkflow}
            storageMode={storageMode}
            restoredFromDisk={restoredFromDisk}
            workflowHistory={workflowHistory}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-4 pt-4 lg:flex-row lg:gap-5">
            {/* 对话主栏 */}
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/80 bg-white/80 shadow-xl shadow-zinc-900/5 ring-1 ring-white/60 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/70 dark:shadow-black/40 dark:ring-zinc-700/40">
              <ChatToolbar
                useWorkflow={useWorkflow}
                setUseWorkflow={setUseWorkflow}
                loading={loading}
                provider={provider}
                setProvider={setProvider}
                mimoModel={mimoModel}
                setMimoModel={setMimoModel}
                storageMode={storageMode}
                handleStorageModeChange={handleStorageModeChange}
              />

              {errorText ? (
                <div className="shrink-0 border-b border-red-200/80 bg-red-50/90 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {errorText}
                </div>
              ) : null}
              <ChatTranscript
                bubbles={bubbles}
                loading={loading}
                listRef={listRef}
                handleWorkflowConfirm={handleWorkflowConfirm}
              />

              <ChatComposer                input={input}
                setInput={setInput}
                loading={loading}
                handleSend={handleSend}
                handleSubmit={handleSubmit}
              />
            </section>

            <KnowledgeSidebar
              registeredTools={registeredTools}
              toolMetrics={toolMetrics}
              knowledgeMetrics={knowledgeMetrics}
              knowledgeImportTitle={knowledgeImportTitle}
              setKnowledgeImportTitle={setKnowledgeImportTitle}
              knowledgeImportText={knowledgeImportText}
              setKnowledgeImportText={setKnowledgeImportText}
              knowledgeLoading={knowledgeLoading}
              handleImportKnowledge={handleImportKnowledge}
              knowledgeDocCount={knowledgeDocCount}
              ragDebugQuery={ragDebugQuery}
              setRagDebugQuery={setRagDebugQuery}
              ragDebugMode={ragDebugMode}
              setRagDebugMode={setRagDebugMode}
              ragDebugRecallK={ragDebugRecallK}
              setRagDebugRecallK={setRagDebugRecallK}
              ragDebugTopK={ragDebugTopK}
              setRagDebugTopK={setRagDebugTopK}
              ragDebugMinScore={ragDebugMinScore}
              setRagDebugMinScore={setRagDebugMinScore}
              handleRagDebugRetrieve={handleRagDebugRetrieve}
              ragDebugHits={ragDebugHits}
              ragDebugRewrite={ragDebugRewrite}
              storageMode={storageMode}
              workflowHistory={workflowHistory}
              handleRestoreWorkflowFromHistory={handleRestoreWorkflowFromHistory}
              memory={memory}
            />
          </div>
      </div>
    </main>
  );
}





