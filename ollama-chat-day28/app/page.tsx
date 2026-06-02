"use client"; // 声明为客户端组件，启用浏览器端交互与 React Hooks

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"; // 引入类型与 Hooks：表单事件、副作用、DOM 引用、状态、派生 Store

import { ApiClientError, readApiData } from "@/lib/api-client"; // 统一 API 响应解析
import { MIMO_MODEL_IDS } from "@/lib/mimo-models"; // MiMo 模型 id 白名单
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
} from "@/lib/workflow-persistence"; // 第19–20天：经 WorkflowStore 持久化
import {
  createWorkflowStore, // 按模式创建 localStorage 或后端 API Store
  type WorkflowStorageMode, // 存储模式：local | backend
} from "@/lib/workflow-store"; // 第20天：可插拔存储
import type { WorkflowStateListItem, WorkflowStepAction } from "@/lib/workflow-types"; // 历史列表与步骤 action
import type { ToolDescriptor, ToolMetricsSnapshot } from "@/lib/tool-registry"; // 第22–23天：Tool Explorer
import type { KnowledgeMetricsSnapshot, QueryRewriteDebug, RetrievalMode, RetrievedChunkHit } from "@/lib/knowledge-types"; // 第28天：RAG V5 类型
import { ChatComposer } from "@/app/components/ChatComposer"; // 第27天：聊天输入区
import { ChatToolbar } from "@/app/components/ChatToolbar"; // 第27天：聊天顶部控制栏
import { Header } from "@/app/components/Header"; // 顶部标题与状态徽标
import { KnowledgeSidebar } from "@/app/components/KnowledgeSidebar"; // 第27天：右侧知识库与调试侧栏

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
  action: WorkflowStepAction; // 第23天：含 research / note / searchHistory 等
  input: string; // 传给后端的文本入参摘要
  dependsOn?: string[]; // 依赖的步骤 id
  /** 第17天：条件分支约束（相对前驱步骤输出的判定）。 */
  condition?: {
    fromStepId: string; // 条件读取来源步骤 id（通常指向 judge）
    operator: "equals" | "includes" | "truthy"; // 判定算子（与后端 evaluateCondition 对齐）
    value: string; // 期望值（truthy 下可为空）
  }; // condition 对象结束
  /** 第15天：步骤级额外重试次数（不含首轮）；与后端 route.ts 对齐。 */
  retry?: number; // undefined 走后端默认；0 表示不重试；正整数为失败后的最多追加尝试次数
  status:
    | "pending"
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "blocked"
    | "skipped" // 第17天：skipped 表示条件未命中而跳过的正常分支
    | "waiting_confirmation"; // 第18天：等待用户确认，非 failed
  output?: unknown; // 成功后可选的中间结果（本页 mainly 展示状态时忽略细节）
  error?: string; // 失败错误信息（若有则显示在列表行内）
  durationMs?: number; // 服务端记录的该步毫秒耗时（用于徽章展示）
  injectedContextPreview?: string; // 本步执行前注入的依赖/线性上下文预览
  /** 第17天：skipped 原因（例如 condition not matched）。 */
  skipReason?: string; // 仅 skipped 状态有意义；其它状态通常为空
  /** 第18天：执行前需用户确认。 */
  requiresConfirmation?: boolean; // HITL 标记
  /** 第18天：确认 UI 展示文案。 */
  confirmationMessage?: string; // 暂停时展示
  /** 第18天：用户点击确认后为 true。 */
  confirmed?: boolean; // 续跑条件
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
  status: "pending" | "running" | "success" | "failed" | "cancelled"; // 整单状态（第18天含用户取消）
  executionTimeline?: WorkflowTimelineEvent[]; // 第15天：Runtime trace（validate/repair/execute/retry）
  executionBatches?: WorkflowExecutionBatch[]; // 第16天：并行批次边界（供 Batch Timeline 展示）
}; // Workflow 类型结束

// API 成功响应的联合类型，按 type 分发 UI
type ChatApiResult =
  | { type: "chat"; content: string; memory: Memory } // 普通聊天
  | { type: "weather"; keyword: string; result: string; memory: Memory } // 天气
  | { type: "summary"; text: string; memory: Memory } // 总结
  | { type: "todo"; items: TodoItem[]; memory: Memory } // 待办
  | {
      type: "workflow"; // 工作流
      workflow: Workflow; // 步骤状态
      finalSummary: string; // 汇总或暂停说明
      memory: Memory; // 记忆
      paused?: boolean; // 第18天：HITL 暂停
      waitingStepId?: string; // 待确认步骤 id
    }; // 工作流（含 HITL）

// 用户侧气泡：纯文本
type UserBubble = { role: "user"; content: string }; // 仅 user + content

// 助手侧气泡：用 variant 区分五种卡片
type AssistantBubble =
  | { role: "assistant"; variant: "chat"; content: string } // 助手文本
  | { role: "assistant"; variant: "weather"; keyword: string; result: string } // 天气卡
  | { role: "assistant"; variant: "summary"; text: string } // 总结卡
  | { role: "assistant"; variant: "todo"; items: TodoItem[] } // 待办卡
  | {
      role: "assistant"; // 助手
      variant: "workflow"; // 工作流卡片
      workflow: Workflow; // 工作流对象
      finalSummary: string; // 正文摘要
      paused?: boolean; // 是否等待确认
      waitingStepId?: string; // 待确认 stepId
    }; // 工作流过程（HITL）

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
      paused: data.paused, // 第18天：暂停标记
      waitingStepId: data.waitingStepId, // 待确认步骤
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

/** 第16–17天：把步骤状态映射为可读符号（并行调度区分 queued/blocked；条件分支区分 skipped）。 */
function workflowStepStatusGlyph(status: WorkflowStep["status"]): string {
  if (status === "success") return "✓"; // 成功：对勾
  if (status === "failed") return "✕"; // 失败：叉号
  if (status === "running") return "…"; // 运行中：省略号动画占位
  if (status === "queued") return "▷"; // 已入队：三角提示「即将并行启动」
  if (status === "blocked") return "⛔"; // 阻塞：禁止符号提示「依赖失败导致短路」
  if (status === "skipped") return "⏭️"; // 第17天：跳过：条件未命中走另一分支（非失败）
  if (status === "waiting_confirmation") return "⏸️"; // 第18天：等待用户确认
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
          <Header
            provider={provider}
            useWorkflow={useWorkflow}
            storageMode={storageMode}
            restoredFromDisk={restoredFromDisk}
            workflowHistory={workflowHistory}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-4 pt-5 lg:flex-row lg:gap-5">
            {/* 对话主栏 */}
            <section className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/75 shadow-xl shadow-zinc-900/5 ring-1 ring-white/60 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/70 dark:shadow-black/40 dark:ring-zinc-700/40 lg:min-h-[calc(100dvh-11rem)]">
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
                    const waitingStep =
                      msg.paused && msg.waitingStepId
                        ? msg.workflow.steps.find((s) => s.id === msg.waitingStepId)
                        : undefined; // 第18天：当前待 HITL 确认的步骤
                    return (
                      <div key={`workflow-${index}`} className="flex justify-start">
                        {/* 工作流卡片：上方目标 + 中间步骤列表 + HITL 确认区 + 底部最终总结 */}
                        <div className="max-w-[min(100%,40rem)] overflow-hidden rounded-2xl rounded-bl-md border border-violet-200/90 bg-gradient-to-br from-violet-50 to-fuchsia-50/50 shadow-md dark:border-violet-900/45 dark:from-violet-950/40 dark:to-fuchsia-950/25">
                          <p className="border-b border-violet-200/70 px-4 py-2.5 text-xs font-semibold text-violet-900 dark:border-violet-800/40 dark:text-violet-100">
                            Workflow · {msg.workflow.goal} {/* 展示本轮工作流目标 */}
                          </p>
                          <ul className="space-y-3 px-4 py-3 text-sm text-violet-950 dark:text-violet-50">
                            {msg.workflow.steps.map((step) => {
                              const downstream = findDownstreamSteps(msg.workflow.steps, step.id);
                              return (
                                <li
                                  key={step.id}
                                  className={`rounded-lg bg-white/40 ring-1 ring-violet-500/10 dark:bg-violet-950/20 dark:ring-violet-500/15 ${
                                    step.status === "skipped"
                                      ? "bg-amber-50/40 ring-amber-400/35 dark:bg-amber-950/20 dark:ring-amber-500/25"
                                      : step.status === "waiting_confirmation"
                                        ? "bg-sky-50/50 ring-sky-400/40 dark:bg-sky-950/25 dark:ring-sky-500/30"
                                        : ""
                                  }`}
                                >
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
                                  {step.condition ? (
                                    <p className="border-t border-sky-200/55 px-3 py-1.5 text-[11px] text-sky-950 dark:border-sky-900/35 dark:text-sky-100">
                                      <span className="font-semibold">condition：</span>
                                      <span className="font-mono">
                                        from={step.condition.fromStepId} · {step.condition.operator} ·{" "}
                                        {step.condition.value ? JSON.stringify(step.condition.value) : "（truthy / 空值）"}
                                      </span>
                                    </p>
                                  ) : null}
                                  {step.requiresConfirmation ? (
                                    <p className="border-t border-indigo-200/55 px-3 py-1.5 text-[11px] text-indigo-950 dark:border-indigo-900/35 dark:text-indigo-100">
                                      <span className="font-semibold">HITL：</span>
                                      <span>
                                        requiresConfirmation
                                        {step.confirmationMessage
                                          ? ` · ${step.confirmationMessage}`
                                          : ""}
                                      </span>
                                    </p>
                                  ) : null}
                                  {step.status === "waiting_confirmation" ? (
                                    <p className="border-t border-sky-200/65 bg-sky-500/5 px-3 py-1.5 text-[11px] text-sky-950 dark:border-sky-900/35 dark:text-sky-50">
                                      <span className="font-semibold">等待确认：</span>
                                      {step.confirmationMessage || "该步骤需您确认后继续执行"}
                                    </p>
                                  ) : null}
                                  {step.status === "skipped" ? (
                                    <p className="border-t border-amber-200/65 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-950 dark:border-amber-900/35 dark:text-amber-50">
                                      <span className="font-semibold">分支跳过：</span>
                                      {step.skipReason || "condition not matched"}
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
                                      {step.status === "skipped"
                                        ? "—（本分支未执行）"
                                        : step.status === "waiting_confirmation"
                                          ? "—（等待用户确认，尚未执行）"
                                          : typeof step.output === "string"
                                          ? step.output.slice(0, 280)
                                          : step.output != null
                                            ? JSON.stringify(step.output).slice(0, 280)
                                            : "—"}
                                      {step.status !== "skipped" &&
                                      typeof step.output === "string" &&
                                      step.output.length > 280
                                        ? "…"
                                        : ""}
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
                          {msg.paused && waitingStep && msg.waitingStepId ? (
                            <div className="border-t border-sky-300/70 bg-sky-50/80 px-4 py-4 dark:border-sky-800/50 dark:bg-sky-950/30">
                              <p className="mb-2 text-sm font-semibold text-sky-900 dark:text-sky-100">
                                该步骤需要确认
                              </p>
                              <p className="mb-3 text-sm text-sky-800 dark:text-sky-200">
                                {waitingStep.confirmationMessage ||
                                  `是否继续执行：${waitingStep.name}？`}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() =>
                                    handleWorkflowConfirm(
                                      index,
                                      msg.workflow.id,
                                      msg.waitingStepId!,
                                      "confirm"
                                    )
                                  }
                                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-50"
                                >
                                  确认执行
                                </button>
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() =>
                                    handleWorkflowConfirm(
                                      index,
                                      msg.workflow.id,
                                      msg.waitingStepId!,
                                      "cancel"
                                    )
                                  }
                                  className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : null}
                          <div className="border-t border-violet-200/70 bg-violet-500/5 px-4 py-3 dark:border-violet-800/40">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                              {msg.paused ? "当前状态" : "最终结果"}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-violet-950 dark:text-violet-50">
                              {msg.finalSummary} {/* 服务端汇总或暂停说明 */}
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

              <ChatComposer
                input={input}
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
      </div>
    </main>
  );
}


