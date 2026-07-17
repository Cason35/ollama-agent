"use client"; // 侧栏包含输入框、按钮和动态列表，需要客户端渲染

import { useState, type Dispatch, type SetStateAction } from "react"; // 引入 React 状态 setter 类型
import Link from "next/link"; // 第68天：引入 Next.js Link 组件提供生产记忆治理页面入口。
import type { KnowledgeDocumentSummary, KnowledgeMetricsSnapshot, QueryRewriteDebug, RetrievalMode, RetrievedChunkHit, VectorRecordSummary } from "@/lib/knowledge/knowledge-types"; // 引入 RAG 与 VectorStore 类型
import type { ToolDescriptor, ToolMetricsSnapshot } from "@/lib/tools/tool-registry"; // 引入工具描述与指标类型
import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store"; // 引入工作流存储模式类型
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types"; // 引入工作流历史摘要类型
import type { CreateJobInput, Job, JobStoreSnapshot, QueueMetrics, WorkerPoolSnapshot } from "@/lib/queue/queue-types"; // 第35天：引入队列任务、创建输入、资源指标与 WorkerPool 类型
import type { LockExplorerSnapshot } from "@/lib/lock/lock-types"; // 第60天：引入 Lock Explorer 快照类型。
import { QueueDashboard } from "@/app/components/QueueDashboard"; // 第35天：引入 Queue Dashboard V5 组件
import { LockExplorer } from "@/app/components/LockExplorer"; // 第60天：引入 Redis Distributed Lock Explorer 组件。
import { StorageExplorer } from "@/app/components/StorageExplorer"; // 第62天：引入 Object Storage Explorer（对象存储浏览器）组件。
import { ConfigExplorer } from "@/app/components/ConfigExplorer"; // 第62天：引入 Config Explorer（配置中心浏览器）组件。
import { SecretsExplorer } from "@/app/components/SecretsExplorer"; // 第63天：引入 Secrets Explorer（密钥管理浏览器）组件。
import { RuntimeContextExplorer } from "@/app/components/RuntimeContextExplorer"; // 第64天：引入统一运行时上下文浏览器组件。
import { EventExplorer } from "@/app/components/EventExplorer"; // 第65天：引入统一事件系统 Event Explorer 组件。
import { RegistryExplorer } from "@/app/components/RegistryExplorer"; // 第66天：引入统一注册中心 Registry Explorer 组件。
import { AgentExplorer } from "@/app/components/AgentExplorer"; // 第42天：引入 Agent Workspace Runtime Dashboard 智能体调度看板组件
import { RegressionDashboard } from "@/app/components/RegressionDashboard"; // 第46天：引入失败案例管理与回归评估看板组件。
import { UsageExplorer } from "@/app/components/UsageExplorer"; /* 第47天：引入用量、成本构成与 Prompt ROI 看板组件。 */
import { CacheExplorer } from "@/app/components/CacheExplorer"; /* 第48天：引入语义缓存命中、节省与 TTL 失效看板组件。 */
import { MemoryExplorerV2 } from "@/app/components/MemoryExplorerV2"; /* 第49天：引入长期记忆经验提取、综合检索与整合衰减看板组件。 */
import { ModelExplorer } from "@/app/components/ModelExplorer"; /* 第50天：引入模型档案、注册表指标与按任务路由预览看板组件。 */
import { ModelHealthDashboard } from "@/app/components/ModelHealthDashboard"; /* 第51天：引入模型健康、备用链和熔断器仪表盘组件。 */
import { ModelCollaborationExplorer } from "@/app/components/ModelCollaborationExplorer"; /* 第56天：引入模型协作团队、计划、执行、合并与用量看板组件。 */
import { PromptExplorer } from "@/app/components/PromptExplorer"; /* 第52天：引入 Prompt Explorer（提示词浏览器）组件。 */
import { PromptExperimentDashboard } from "@/app/components/PromptExperimentDashboard"; /* 第53天：引入 Prompt Experiment Dashboard（提示词实验仪表盘）组件。 */
import { RuntimeExplorer } from "@/app/components/RuntimeExplorer"; /* 第57天：引入 Runtime Decision Explorer（运行时决策浏览器）组件。 */
import { RedisExplorer } from "@/app/components/RedisExplorer"; /* 第58天：引入 Redis Explorer（Redis 浏览器）组件，用于观察共享状态中心。 */

/** 侧栏展示所需的长期记忆条目。 */
type SidebarMemoryItem = {
  content: string; // 记忆正文
  importance: "high" | "low"; // 记忆重要程度
};

/** 侧栏展示所需的记忆结构。 */
type SidebarMemory = {
  shortTerm: unknown[]; // 短期消息只需要数量
  items: SidebarMemoryItem[]; // 长期记忆条目
};

type QueueSnapshotWithLocks = JobStoreSnapshot & { lockExplorer?: LockExplorerSnapshot }; // 第60天：定义带 Lock Explorer 字段的队列快照交叉类型。

/** KnowledgeSidebar 组件参数。 */
type KnowledgeSidebarProps = {
  registeredTools: ToolDescriptor[]; // 已注册工具列表
  toolMetrics: Record<string, ToolMetricsSnapshot>; // 工具运行指标
  knowledgeMetrics: KnowledgeMetricsSnapshot | null; // 知识库指标
  knowledgeImportTitle: string; // 导入知识标题
  setKnowledgeImportTitle: Dispatch<SetStateAction<string>>; // 标题 setter
  knowledgeImportText: string; // 导入知识正文
  setKnowledgeImportText: Dispatch<SetStateAction<string>>; // 正文 setter
  knowledgeLoading: boolean; // 知识库相关请求加载状态
  handleImportKnowledge: () => Promise<void>; // 导入知识动作
  handleReindexKnowledge: () => Promise<void>; // 第30天：强制重建索引与向量动作
  knowledgeDocCount: number; // 已导入文档数
  knowledgeDocuments: KnowledgeDocumentSummary[]; // 第29天：Knowledge Explorer 文档树
  vectorRecords: VectorRecordSummary[]; // 第30天：Vector Explorer 向量记录
  ragDebugQuery: string; // RAG 调试查询
  setRagDebugQuery: Dispatch<SetStateAction<string>>; // 查询 setter
  ragDebugMode: RetrievalMode; // 检索模式
  setRagDebugMode: Dispatch<SetStateAction<RetrievalMode>>; // 检索模式 setter
  ragDebugRecallK: number; // 召回数量
  setRagDebugRecallK: Dispatch<SetStateAction<number>>; // 召回数量 setter
  ragDebugTopK: number; // 最终返回数量
  setRagDebugTopK: Dispatch<SetStateAction<number>>; // topK setter
  ragDebugMinScore: number; // 最低分阈值
  setRagDebugMinScore: Dispatch<SetStateAction<number>>; // 最低分 setter
  handleRagDebugRetrieve: () => Promise<void>; // 手动检索动作
  ragDebugHits: RetrievedChunkHit[]; // 最近检索结果
  ragDebugRewrite: QueryRewriteDebug | null; // 第28天：Query Rewrite 调试信息
  storageMode: WorkflowStorageMode; // 当前存储模式
  workflowHistory: WorkflowStateListItem[]; // 工作流历史
  handleRestoreWorkflowFromHistory: (workflowId: string) => void; // 恢复历史工作流动作
  memory: SidebarMemory; // 记忆数据
  queueJobs: Job[]; // 第35天：队列任务列表
  queueMetrics: QueueMetrics | null; // 第35天：队列指标
  workerPool: WorkerPoolSnapshot | null; // 第35天：WorkerPool 并发状态
  queueRuntimeSnapshot: JobStoreSnapshot | null; // 第35天：资源占用、速率窗口和限制器指标快照
  queueLoading: boolean; // 第35天：队列请求加载状态
  handleCreateQueueJob: (input: CreateJobInput) => Promise<void>; // 第35天：创建优先级、定时或资源控制测试队列任务动作
  handleRequeueQueueJob: (jobId: string) => Promise<void>; // 第35天：死信任务重新入队动作
  handleRestartQueueJob: (jobId: string) => Promise<void>; // 第37天：克隆终止任务并创建新 Job 的动作
  handleCancelQueueJob: (jobId: string) => Promise<void>; // 第36天：取消 queued、retrying 或 running 队列任务动作
  handleDeleteQueueJob: (jobId: string) => Promise<void>; // 第60天：从 Redis Queue Explorer 删除任务动作
  handleForceUnlock: (lockKey: string) => Promise<void>; // 第60天：从 Lock Explorer 强制释放指定分布式锁。
  handleGracefulShutdown: () => Promise<void>; // 第36天：触发 WorkerPool 优雅关闭动作
};

/** 右侧工具、知识库、RAG 调试、历史和记忆侧栏。 */
export function KnowledgeSidebar({
  registeredTools,
  toolMetrics,
  knowledgeMetrics,
  knowledgeImportTitle,
  setKnowledgeImportTitle,
  knowledgeImportText,
  setKnowledgeImportText,
  knowledgeLoading,
  handleImportKnowledge,
  handleReindexKnowledge,
  knowledgeDocCount,
  knowledgeDocuments,
  vectorRecords,
  ragDebugQuery,
  setRagDebugQuery,
  ragDebugMode,
  setRagDebugMode,
  ragDebugRecallK,
  setRagDebugRecallK,
  ragDebugTopK,
  setRagDebugTopK,
  ragDebugMinScore,
  setRagDebugMinScore,
  handleRagDebugRetrieve,
  ragDebugHits,
  ragDebugRewrite,
  storageMode,
  workflowHistory,
  handleRestoreWorkflowFromHistory,
  memory,
  queueJobs,
  queueMetrics,
  workerPool,
  queueRuntimeSnapshot,
  queueLoading,
  handleCreateQueueJob,
  handleRequeueQueueJob,
  handleRestartQueueJob,
  handleCancelQueueJob,
  handleDeleteQueueJob,
  handleForceUnlock,
  handleGracefulShutdown,
}: KnowledgeSidebarProps) {
  const [activePanel, setActivePanel] = useState<"registry" | "events" | "context" | "secrets" | "config" | "storage" | "lock" | "queue" | "runtime" | "redis" | "experiment" | "prompt" | "collaboration" | "model" | "memory" | "cache" | "usage" | "knowledge" | "records">("knowledge"); /* 第69天：默认打开知识面板，并通过页头入口进入 Knowledge Governance Explorer V2。 */
  const queueSnapshotWithLocks = queueRuntimeSnapshot as QueueSnapshotWithLocks | null; // 第60天：把队列快照扩展为可读取锁快照的本地类型。
  const tabClass = (panel: typeof activePanel) =>
    `h-8 rounded-md px-2 text-[11px] font-semibold transition ${
      activePanel === panel
        ? "bg-zinc-950 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-950"
        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700"
    }`;

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/30 lg:h-full lg:w-[400px] xl:w-[430px]">
      <div className="z-10 shrink-0 border-b border-zinc-200/80 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">控制台</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">第69天默认进入知识与 RAG 调试，并可通过页头打开生产知识治理浏览器第二版。</p> {/* 第69天：更新控制台说明并突出生产知识与 RAG 平台入口。 */}
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200">
            Day 70 {/* 第70天：更新控制台日期徽标。 */}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-12 gap-1" role="tablist" aria-label="Day 70 持久化工作流项目继承能力侧边栏面板"> {/* 第70天：更新侧边栏标签页名称为持久化工作流项目主题。 */}
          <button type="button" className={tabClass("registry")} onClick={() => setActivePanel("registry")}> {/* 第66天：统一注册中心标签页入口。 */}
            注册 {/* 第66天：显示 Registry Explorer 紧凑标签名称。 */}
          </button> {/* 第66天：结束统一注册中心标签页按钮。 */}
          <button type="button" className={tabClass("events")} onClick={() => setActivePanel("events")}> {/* 第65天：统一事件系统标签页入口。 */}
            事件 {/* 第65天：显示 Event Explorer 紧凑标签名称。 */}
          </button> {/* 第65天：结束统一事件系统标签页按钮。 */}
          <button type="button" className={tabClass("context")} onClick={() => setActivePanel("context")}> {/* 第64天：统一上下文标签页入口。 */}
            上下文 {/* 第64天：显示统一上下文标签名称。 */}
          </button> {/* 第64天：结束统一上下文标签页按钮。 */}
          <button type="button" className={tabClass("secrets")} onClick={() => setActivePanel("secrets")}> {/* 第63天：Secrets 密钥管理标签页入口。 */}
            密钥 {/* 第63天：显示紧凑的 Secrets 标签名称。 */}
          </button> {/* 第63天：结束 Secrets 标签页按钮。 */}
          <button type="button" className={tabClass("config")} onClick={() => setActivePanel("config")}> {/* 第62天：Config 配置中心标签页入口。 */}
            配置 {/* 第62天：显示紧凑的 Config 标签名称。 */}
          </button> {/* 第62天：结束 Config 标签页按钮。 */}
          <button type="button" className={tabClass("storage")} onClick={() => setActivePanel("storage")}> {/* 第62天：Storage 对象存储标签页入口。 */}
            存储 {/* 第62天：显示紧凑的 Storage 标签名称。 */}
          </button> {/* 第62天：结束 Storage 标签页按钮。 */}
          <button type="button" className={tabClass("lock")} onClick={() => setActivePanel("lock")}> {/* 第60天：Lock 分布式锁标签页入口。 */}
            锁 {/* 第60天：显示紧凑的 Lock 标签名称。 */}
          </button> {/* 第60天：结束 Lock 标签页按钮。 */}
          <button type="button" className={tabClass("queue")} onClick={() => setActivePanel("queue")}> {/* 第60天：Queue 分布式任务队列标签页入口。 */}
            队列 {/* 第60天：显示紧凑的 Queue 标签名称。 */}
          </button> {/* 第60天：结束 Queue 标签页按钮。 */}
          <button type="button" className={tabClass("redis")} onClick={() => setActivePanel("redis")}> {/* 第58天：Redis 共享状态中心标签页入口。 */}
            Redis {/* 第58天：显示紧凑的 Redis 标签名称。 */}
          </button> {/* 第58天：结束 Redis 标签页按钮。 */}
          <button type="button" className={tabClass("runtime")} onClick={() => setActivePanel("runtime")}>
            决策 {/* 第57天：把首个标签页改为运行时决策入口。 */}
          </button>
          <button type="button" className={tabClass("experiment")} onClick={() => setActivePanel("experiment")}> {/* 第53天：提示词实验平台标签页入口。 */}
            实验 {/* 第53天：显示紧凑的实验标签名称。 */}
          </button> {/* 第53天：结束提示词实验标签页按钮。 */}
          <button type="button" className={tabClass("prompt")} onClick={() => setActivePanel("prompt")}> {/* 第67天：生产提示词平台标签页入口。 */}
            提示V2 {/* 第67天：显示 Prompt Explorer V2 紧凑标签名称。 */}
          </button> {/* 第67天：结束生产提示词平台标签页按钮。 */}
          <button type="button" className={tabClass("collaboration")} onClick={() => setActivePanel("collaboration")}> {/* 第56天：模型协作标签页入口。 */}
            协作 {/* 第56天：显示紧凑的模型协作标签名称。 */}
          </button> {/* 第56天：结束模型协作标签页按钮。 */}
          <button type="button" className={tabClass("model")} onClick={() => setActivePanel("model")}> {/* 第56天：模型健康与路由标签页入口。 */}
            模型 {/* 第56天：显示紧凑的模型与健康标签名称。 */}
          </button>
          <button type="button" className={tabClass("memory")} onClick={() => setActivePanel("memory")}> {/* 第49天：新增长期记忆标签页入口。 */}
            记忆 {/* 第49天：显示紧凑的长期记忆标签名称。 */}
          </button> {/* 第49天：结束长期记忆标签页按钮。 */}
          <button type="button" className={tabClass("cache")} onClick={() => setActivePanel("cache")}> {/* 第48天：新增语义缓存标签页入口。 */}
            缓存 {/* 第48天：显示紧凑的缓存标签名称。 */}
          </button> {/* 第48天：结束缓存标签页按钮。 */}
          <button type="button" className={tabClass("usage")} onClick={() => setActivePanel("usage")}> {/* 第47天：新增用量与成本标签页入口。 */}
            用量 {/* 第47天：显示紧凑的用量标签名称。 */}
          </button> {/* 第47天：结束用量标签页按钮。 */}
          <button type="button" className={tabClass("knowledge")} onClick={() => setActivePanel("knowledge")}>
            知识
          </button>
          <button type="button" className={tabClass("records")} onClick={() => setActivePanel("records")}>
            记录
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 [scrollbar-gutter:stable]">
      <div className={activePanel === "registry" ? "contents" : "hidden"}> {/* 第66天：仅在注册标签页展示 Registry Explorer。 */}
        <RegistryExplorer /> {/* 第66天：展示统一能力库存、类型过滤、能力发现、启用状态和注册指标。 */}
      </div> {/* 第66天：结束统一注册中心标签页内容。 */}
      <div className={activePanel === "events" ? "contents" : "hidden"}> {/* 第65天：仅在事件标签页展示 Event Explorer。 */}
        <EventExplorer /> {/* 第65天：展示事件时间线、过滤器、投递状态、Trace、Usage 和 Evaluation 结果。 */}
      </div> {/* 第65天：结束统一事件系统标签页内容。 */}
      <div className={activePanel === "context" ? "contents" : "hidden"}> {/* 第64天：仅在上下文标签页展示 Runtime Context Explorer。 */}
        <RuntimeContextExplorer /> {/* 第64天：展示统一请求、模块接入记录、一致性和完整上下文。 */}
      </div> {/* 第64天：结束统一上下文标签页内容。 */}
      <div className={activePanel === "secrets" ? "contents" : "hidden"}> {/* 第63天：仅在密钥标签页展示 Secrets Explorer。 */}
        <SecretsExplorer /> {/* 第63天：展示密钥脱敏元数据、加密状态、轮换、删除和指标能力。 */}
      </div> {/* 第63天：结束 Secrets 标签页内容。 */}
      <div className={activePanel === "config" ? "contents" : "hidden"}> {/* 第62天：仅在配置标签页展示 Config Explorer。 */}
        <ConfigExplorer /> {/* 第62天：展示配置合并、校验、热更新、指标和编辑重置能力。 */}
      </div> {/* 第62天：结束 Config 标签页内容。 */}
      <div className={activePanel === "storage" ? "contents" : "hidden"}> {/* 第62天：仅在存储标签页展示 Object Storage Explorer。 */}
        <StorageExplorer /> {/* 第62天：展示 Bucket、Object Key、Size、Signed URL、Storage Metrics 与对象操作。 */}
      </div> {/* 第62天：结束 Storage 标签页内容。 */}
      <div className={activePanel === "experiment" ? "contents" : "hidden"}> {/* 第53天：仅在实验标签页展示 Prompt Experiment Dashboard。 */}
        <PromptExperimentDashboard /> {/* 第53天：展示多版本提示词实验、Winner Selection、Quality Gate 和 Promote。 */}
      </div> {/* 第53天：结束提示词实验标签页内容。 */}
      <div className={activePanel === "prompt" ? "space-y-3" : "hidden"}> {/* 第67天：仅在提示词标签页展示生产提示词平台入口和历史浏览器。 */}
        <a href="/prompts" className="block rounded-lg bg-violet-600 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-violet-500">打开 Prompt Explorer V2（生产级提示词运营控制台）</a> {/* 第67天：提供完整生产提示词版本、实验、评分、晋级和审计页面入口。 */}
        <PromptExplorer /> {/* 第67天：保留第52至55天提示词注册、Diff、Rollback 和优化能力作为历史基础。 */}
      </div> {/* 第67天：结束生产提示词平台标签页内容。 */}
      <div className={activePanel === "collaboration" ? "contents" : "hidden"}> {/* 第56天：仅在模型协作标签页展示 Model Collaboration Explorer。 */}
        <ModelCollaborationExplorer /> {/* 第56天：展示模型团队、协作计划、并行执行、结果合并与 Trace/Usage。 */}
      </div> {/* 第56天：结束模型协作标签页内容。 */}
      <div className={activePanel === "model" ? "space-y-3" : "hidden"}> {/* 第51天：仅在模型健康标签页展示健康仪表盘与模型浏览器。 */}
        <ModelHealthDashboard /> {/* 第51天：展示 fallback、Circuit Breaker、成功率与最近失败时间。 */}
        <ModelExplorer /> {/* 第51天：保留第50天模型档案、注册表指标与按任务路由预览作为参考。 */}
      </div> {/* 第51天：结束模型健康标签页内容。 */}
      <div className={activePanel === "memory" ? "space-y-3" : "hidden"}> {/* 第68天：在记忆标签页突出生产记忆治理入口并保留历史 Memory Explorer V2。 */}
        <Link href="/memories" className="block rounded-lg bg-cyan-600 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-cyan-500">打开 Memory Governance Explorer（生产记忆治理控制台）</Link> {/* 第68天：提供 Redis、MySQL、VectorStore、冲突、归档和指标完整治理页面入口。 */}
        <MemoryExplorerV2 /> {/* 第68天：保留第49天长期记忆经验提取、综合检索、整合压缩与重要性衰减作为历史基础。 */}
      </div> {/* 第68天：结束生产记忆平台标签页内容。 */}
      <div className={activePanel === "cache" ? "contents" : "hidden"}> {/* 第48天：仅在缓存标签页展示 Cache Explorer。 */}
        <CacheExplorer /> {/* 第48天：展示命中率、节省费用、缓存条目与查询事件。 */}
      </div> {/* 第48天：结束缓存标签页内容。 */}
      <div className={activePanel === "usage" ? "contents" : "hidden"}> {/* 第47天：仅在用量标签页展示 Usage Explorer。 */}
        <UsageExplorer /> {/* 第47天：展示 Token、Cost、Trace、成本构成和 Prompt ROI。 */}
      </div> {/* 第47天：结束用量标签页内容。 */}
      <div className={activePanel === "runtime" ? "contents" : "hidden"}>
      <RuntimeExplorer /> {/* 第57天：展示运行时决策、指标和 Decision Replay。 */}
      <RegressionDashboard /> {/* 第46天：展示固定数据集、版本对比、退步案例与质量门禁。 */}
      <AgentExplorer />
      </div>
      <div className={activePanel === "lock" ? "contents" : "hidden"}> {/* 第60天：仅在锁标签页展示 Redis Distributed Lock Explorer。 */}
        <LockExplorer snapshot={queueSnapshotWithLocks?.lockExplorer} loading={queueLoading} handleForceUnlock={handleForceUnlock} /> {/* 第60天：展示 Lock Key、Owner、TTL、Renew Count 和 Force Unlock。 */}
      </div> {/* 第60天：结束 Lock 标签页内容。 */}
      <div className={activePanel === "queue" ? "contents" : "hidden"}> {/* 第60天：仅在队列标签页展示 Redis Queue Explorer。 */}
      <QueueDashboard
        jobs={queueJobs}
        metrics={queueMetrics}
        workerPool={workerPool}
        runtimeSnapshot={queueRuntimeSnapshot}
        queueLoading={queueLoading}
        handleCreateQueueJob={handleCreateQueueJob}
        handleRequeueQueueJob={handleRequeueQueueJob}
        handleRestartQueueJob={handleRestartQueueJob}
        handleCancelQueueJob={handleCancelQueueJob}
        handleDeleteQueueJob={handleDeleteQueueJob}
        handleGracefulShutdown={handleGracefulShutdown}
      /> {/* 第60天：展示 Waiting、Processing、Completed、Dead Letter 与 Queue Trace。 */}
      </div> {/* 第60天：结束 Queue 标签页内容。 */}
      <div className={activePanel === "redis" ? "contents" : "hidden"}> {/* 第58天：仅在 Redis 标签页展示 Redis Explorer。 */}
        <RedisExplorer /> {/* 第58天：展示 Redis 健康检查、Key、TTL、Size、Metrics 和操作 Trace。 */}
      </div> {/* 第58天：结束 Redis 标签页内容。 */}
      <div className={activePanel === "records" ? "shrink-0 border-b border-emerald-200/70 px-4 py-3 dark:border-emerald-900/40" : "hidden"}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tool Explorer（工具浏览器）</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          第42天：继承 retrieval（检索）/ ragAnswer（基于知识回答）/ reindexKnowledge（重建索引），并观察 Agent Workspace（智能体工作空间）、Workflow as Job（工作流任务化）、统一时间线、重启与生命周期控制。
        </p>
        <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {registeredTools.length === 0 ? (
            <li className="rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
              加载中或暂无工具…
            </li>
          ) : (
            registeredTools.map((tool) => {
              const m = tool.metrics ?? toolMetrics[tool.name]; // 优先使用工具描述中的指标
              return (
                <li
                  key={tool.name}
                  className="min-w-0 overflow-hidden rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-2 text-xs dark:border-emerald-800/50 dark:bg-emerald-950/25"
                >
                  <p className="break-all font-mono font-semibold text-emerald-900 dark:text-emerald-100">{tool.name}</p>
                  <p className="mt-0.5 break-words text-[11px] leading-snug text-emerald-800/90 dark:text-emerald-200/90">
                    {tool.description}
                  </p>
                  {tool.capabilities?.length ? (
                    <p className="mt-1 break-words text-[10px] text-emerald-800/90 dark:text-emerald-200/90">
                      能力: {tool.capabilities.join(", ")}
                    </p>
                  ) : null}
                  {tool.dependencies?.length ? (
                    <div className="mt-1 break-all font-mono text-[10px] text-emerald-700/90 dark:text-emerald-300/90">
                      <p>{tool.name}</p>
                      {tool.dependencies.map((dep) => (
                        <p key={dep} className="pl-3">
                          ├─ {dep}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {tool.subTools?.length ? (
                    <p className="mt-0.5 break-all font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      组合: {tool.subTools.join(" → ")}
                    </p>
                  ) : null}
                  {m ? (
                    <p className="mt-1 break-all font-mono text-[10px] text-amber-800/90 dark:text-amber-200/90">
                      calls(调用): {m.totalCalls}, ok(成功): {m.successCalls}, fail(失败): {m.failedCalls}, avg(平均): {m.avgDurationMs}ms
                    </p>
                  ) : null}
                  {tool.inputSchema ? (
                    <p className="mt-1 break-all font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      in(输入): {JSON.stringify(tool.inputSchema)}
                    </p>
                  ) : null}
                  {tool.outputSchema ? (
                    <p className="break-all font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      out(输出): {JSON.stringify(tool.outputSchema)}
                    </p>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className={activePanel === "knowledge" ? "shrink-0 border-b border-sky-200/70 px-4 py-3 dark:border-sky-900/40" : "hidden"}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">RAG 知识库</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          第35天：继承 RAG（检索增强生成）V7 · Knowledge Store（知识存储） · Local Vector Store（本地向量库） · Metadata Filter（元数据过滤） · Vector Explorer（向量浏览器）。
        </p>
        {knowledgeMetrics ? (
          <div className="mt-2 space-y-1 font-mono text-[10px] text-sky-800/90 dark:text-sky-200/90">
            <p>
              docs(文档): {knowledgeMetrics.index?.documentsCount ?? knowledgeMetrics.documents}, chunks(分块):{" "}
              {knowledgeMetrics.index?.chunksCount ?? knowledgeMetrics.chunks}, avg/doc(每篇均值):{" "}
              {knowledgeMetrics.index?.avgChunksPerDoc ?? 0}, avg size(平均大小): {knowledgeMetrics.avgChunkSize}
            </p>
            <p>
              cache hit(缓存命中): {Math.round((knowledgeMetrics.index?.cacheHitRate ?? 0) * 100)}%, cached(已缓存):{" "}
              {knowledgeMetrics.index?.cachedEmbeddings ?? 0}, generated(新生成):{" "}
              {knowledgeMetrics.index?.generatedEmbeddings ?? 0}
            </p>
            <p>
              vectors(向量): {knowledgeMetrics.vector?.vectorCount ?? 0}, dim(维度):{" "}
              {knowledgeMetrics.vector?.avgEmbeddingDimension ?? 0}, vector queries(向量查询):{" "}
              {knowledgeMetrics.vector?.queryCount ?? 0}, avg query(平均查询):{" "}
              {knowledgeMetrics.vector?.avgQueryDuration ?? 0}ms
            </p>
            <p>
              queries(查询): {knowledgeMetrics.retrieval?.queryCount ?? knowledgeMetrics.retrievalCount}, avgTop(最高分均值):{" "}
              {knowledgeMetrics.retrieval?.avgTopScore ?? 0}, noHit(无命中): {knowledgeMetrics.retrieval?.noResultCount ?? 0},
              rewrite(改写): {knowledgeMetrics.queryRewrite?.rewriteCount ?? 0}, avgQ(平均改写数):{" "}
              {knowledgeMetrics.queryRewrite?.avgGeneratedQueries ?? 0}, fallback(兜底):{" "}
              {knowledgeMetrics.queryRewrite?.fallbackTriggeredCount ?? 0}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-400">指标加载中…</p>
        )}
        {knowledgeMetrics?.index?.lastIndexStats ? (
          <p className="mt-2 rounded-lg border border-sky-200/70 bg-sky-50/70 px-2 py-1.5 font-mono text-[10px] text-sky-900 dark:border-sky-800/40 dark:bg-sky-950/20 dark:text-sky-100">
            last index(最近索引): v{knowledgeMetrics.index.lastIndexStats.version}, total(总分块):{" "}
            {knowledgeMetrics.index.lastIndexStats.totalChunks}, added(新增):{" "}
            {knowledgeMetrics.index.lastIndexStats.addedChunks}, updated(更新):{" "}
            {knowledgeMetrics.index.lastIndexStats.updatedChunks}, reused(复用):{" "}
            {knowledgeMetrics.index.lastIndexStats.reusedChunks}, generated(生成):{" "}
            {knowledgeMetrics.index.lastIndexStats.generatedEmbeddings}, vectors(向量):{" "}
            {knowledgeMetrics.index.lastIndexStats.upsertedVectors}, hit(命中):{" "}
            {Math.round(knowledgeMetrics.index.lastIndexStats.cacheHitRate * 100)}%
          </p>
        ) : null}
        <input
          type="text"
          value={knowledgeImportTitle}
          onChange={(e) => setKnowledgeImportTitle(e.target.value)}
          placeholder="标题（可选）"
          className="mt-2 w-full rounded-lg border border-sky-200/80 bg-white/80 px-2 py-1.5 text-xs dark:border-sky-800/50 dark:bg-zinc-950/40"
        />
        <textarea
          value={knowledgeImportText}
          onChange={(e) => setKnowledgeImportText(e.target.value)}
          placeholder="粘贴笔记正文，点击 Import（导入）写入知识库…"
          rows={4}
          className="mt-2 w-full resize-y rounded-lg border border-sky-200/80 bg-white/80 px-2 py-1.5 text-xs leading-relaxed dark:border-sky-800/50 dark:bg-zinc-950/40"
        />
        <button
          type="button"
          disabled={knowledgeLoading}
          onClick={() => void handleImportKnowledge()}
          className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {knowledgeLoading ? "处理中…" : "Import（导入）写入 VectorStore（向量库）"}
        </button>
        <button
          type="button"
          disabled={knowledgeLoading || knowledgeDocCount === 0}
          onClick={() => void handleReindexKnowledge()}
          className="mt-2 w-full rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:opacity-50 dark:border-sky-800 dark:bg-zinc-950/40 dark:text-sky-200"
        >
          Reindex（重建索引）与向量
        </button>
        <p className="mt-2 text-[11px] text-zinc-500">已导入 {knowledgeDocCount} 篇文档</p>
        <div className="mt-3 rounded-lg border border-sky-200/70 bg-white/60 px-2 py-2 dark:border-sky-900/40 dark:bg-zinc-950/25">
          <h3 className="text-xs font-semibold text-sky-950 dark:text-sky-100">Knowledge Explorer（知识浏览器）</h3>
          <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
            {knowledgeDocuments.length === 0 ? (
              <li className="text-[11px] text-zinc-400">暂无文档；导入后会展示版本、hash 与 chunk。</li>
            ) : (
              knowledgeDocuments.map((doc) => (
                <li key={doc.id} className="rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-2 text-[10px] dark:border-sky-900/40 dark:bg-sky-950/20">
                  <p className="break-words font-semibold text-sky-950 dark:text-sky-100">
                    {doc.title} · v{doc.version} · {doc.chunkCount} chunks（分块）
                  </p>
                  <p className="mt-0.5 font-mono text-sky-800/90 dark:text-sky-200/90">
                    hash（哈希）: {doc.contentHash} · {new Date(doc.updatedAt).toLocaleString("zh-CN")}
                  </p>
                  <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
                    {doc.chunks.map((chunk) => (
                      <li key={chunk.id} className="rounded border border-sky-100/80 bg-white/70 px-1.5 py-1 dark:border-sky-900/40 dark:bg-zinc-950/30">
                        <p className="font-mono text-sky-900 dark:text-sky-100">
                          #{chunk.index} · vector（向量）: {chunk.hasVector ? "yes" : "no"} · hash（哈希）: {chunk.chunkHash}
                        </p>
                        <p className="line-clamp-2 text-zinc-600 dark:text-zinc-400">{chunk.preview}</p>
                      </li>
                    ))}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/60 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25">
          <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Vector Explorer（向量浏览器）</h3>
          <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {vectorRecords.length === 0 ? (
              <li className="text-[11px] text-zinc-400">暂无向量；导入文档后会展示 chunkId、documentId 与维度。</li>
            ) : (
              vectorRecords.map((record) => (
                <li key={record.id} className="rounded border border-cyan-100 bg-cyan-50/70 px-2 py-1.5 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20">
                  <p className="break-all font-mono text-cyan-950 dark:text-cyan-100">
                    {record.chunkId} · dim {record.dimension}
                  </p>
                  <p className="break-all font-mono text-cyan-800/90 dark:text-cyan-200/90">
                    doc: {record.documentId}
                  </p>
                  <p className="font-mono text-cyan-700/90 dark:text-cyan-300/90">
                    updated: {new Date(record.updatedAt).toLocaleString("zh-CN")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className={activePanel === "knowledge" ? "shrink-0 border-b border-amber-200/70 px-4 py-3 dark:border-amber-900/40" : "hidden"}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">RAG Debug Panel（调试面板）</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          第35天：RAG 仍先走 Local Vector Store（本地向量库）召回，再回查 KnowledgeStore（知识存储）；后台任务可按优先级、定时规则、WorkerPool（工作线程池）、资源限制和速率限制执行。
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            value={ragDebugQuery}
            onChange={(e) => setRagDebugQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1 text-xs dark:border-amber-800/50 dark:bg-zinc-950/40"
            placeholder="Query（查询）"
          />
          <select
            value={ragDebugMode}
            onChange={(e) => setRagDebugMode(e.target.value as RetrievalMode)}
            className="w-20 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-xs dark:border-amber-800/50 dark:bg-zinc-950/40"
            title="retrieval mode"
          >
            <option value="vector">vector</option>
            <option value="keyword">keyword</option>
            <option value="hybrid">hybrid</option>
          </select>
          <input
            type="number"
            min={1}
            max={50}
            value={ragDebugRecallK}
            onChange={(e) => setRagDebugRecallK(Number(e.target.value) || 20)}
            className="w-14 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="recallK"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={ragDebugTopK}
            onChange={(e) => setRagDebugTopK(Number(e.target.value) || 5)}
            className="w-12 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="topK"
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={ragDebugMinScore}
            onChange={(e) => setRagDebugMinScore(Number(e.target.value) || 0.3)}
            className="w-14 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="minScore"
          />
        </div>
        <button
          type="button"
          disabled={knowledgeLoading}
          onClick={() => void handleRagDebugRetrieve()}
          className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          检索
        </button>
        <p className="mt-2 font-mono text-[10px] text-amber-900 dark:text-amber-100">
          Query(查询): {ragDebugQuery || "—"} · mode(模式): {ragDebugMode} · recallK(召回数): {ragDebugRecallK} · topK(返回数):{" "}
          {ragDebugTopK} · minScore(最低分): {ragDebugMinScore} · hits(命中): {ragDebugHits.length}
        </p>
        {ragDebugRewrite ? (
          <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-2 text-[10px] dark:border-amber-800/40 dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Original Query（原始查询）: {ragDebugRewrite.originalQuery}
            </p>
            <p className="mt-1 break-words font-mono text-[9px] text-amber-800 dark:text-amber-200">
              ambiguous(有歧义): {String(ragDebugRewrite.ambiguous ?? false)} · rewriteMode(改写模式):{" "}
              {ragDebugRewrite.rewriteMode ?? "rule"} · memory(使用记忆): {ragDebugRewrite.usedMemory ? "yes" : "no"} · recent(使用近期消息):{" "}
              {ragDebugRewrite.usedRecentMessages ? "yes" : "no"} · topics(主题):{" "}
              {(ragDebugRewrite.knowledgeTopicsUsed ?? []).join(" | ") || "none"}
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-amber-800 dark:text-amber-200">
              {ragDebugRewrite.rewrittenQueries.map((query) => (
                <li key={query} className="break-words">
                  {query}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
          {ragDebugHits.length === 0 ? (
            <li className="text-[11px] text-zinc-400">
              无合格检索结果（可能未 Import（导入）、或 score（分数）低于 minScore（最低分））；ragAnswer（基于知识回答）将走 fallback（兜底）。
            </li>
          ) : (
            ragDebugHits.map((hit, i) => (
              <li
                key={`${hit.chunkId}-${i}`}
                className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-2 py-1.5 text-[10px] dark:border-amber-800/40 dark:bg-amber-950/20"
              >
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  #{hit.finalRank ?? i + 1} · mode(模式): {hit.retrievalMode ?? ragDebugMode} · chunk(分块) #{hit.chunkIndex} ·
                  offset(偏移) {hit.startOffset}-{hit.endOffset}
                </p>
                <p className="font-mono text-amber-900/90 dark:text-amber-100/90">
                  vector(向量): {hit.vectorScore ?? hit.score} · keyword(关键词): {hit.keywordScore ?? 0} · hybrid(混合):{" "}
                  {hit.hybridScore ?? hit.score} · rerank(重排): {hit.rerankScore ?? hit.score}
                </p>
                <p className="text-amber-800/90 dark:text-amber-200/90">
                  doc(文档): {hit.documentTitle} ({hit.documentId})
                </p>
                {hit.matchedQueries?.length ? (
                  <p className="mt-0.5 break-words font-mono text-[9px] text-amber-700/90 dark:text-amber-300/90">
                    matched(匹配查询): {hit.matchedQueries.join(" | ")}
                  </p>
                ) : null}
                <p className="mt-0.5 line-clamp-3 text-zinc-600 dark:text-zinc-400">{hit.text}</p>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className={activePanel === "records" ? "border-b border-violet-200/70 px-4 py-4 dark:border-violet-900/40" : "hidden"}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">历史 Workflow</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          经 WorkflowStore（工作流存储，{storageMode}）持久化；点击条目可恢复到对话区（含 paused（暂停）确认按钮）。
        </p>
        <ul className="mt-3 max-h-36 space-y-2 overflow-y-auto">
          {workflowHistory.length === 0 ? (
            <li className="rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
              暂无记录；开启 Workflow 发送后会出现在此。
            </li>
          ) : (
            workflowHistory.map((item) => (
              <li key={item.workflowId}>
                <button
                  type="button"
                  onClick={() => handleRestoreWorkflowFromHistory(item.workflowId)}
                  className="w-full rounded-lg border border-violet-200/80 bg-violet-50/80 px-2.5 py-2 text-left text-xs transition hover:bg-violet-100/90 dark:border-violet-800/50 dark:bg-violet-950/30 dark:hover:bg-violet-900/40"
                >
                  <span className="line-clamp-2 font-medium text-violet-950 dark:text-violet-50">{item.goal}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] text-violet-700/90 dark:text-violet-300/90">
                    <span
                      className={
                        item.status === "paused"
                          ? "rounded bg-sky-500/20 px-1 text-sky-800 dark:text-sky-200"
                          : item.status === "success"
                            ? "rounded bg-emerald-500/20 px-1 text-emerald-800 dark:text-emerald-200"
                            : "rounded bg-zinc-500/15 px-1"
                      }
                    >
                      {item.status}
                    </span>
                    <span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                    {item.waitingStepName ? <span>⏸ {item.waitingStepName}</span> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className={activePanel === "records" ? "border-b border-zinc-200/70 px-4 py-4 dark:border-zinc-800/80" : "hidden"}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">长期记忆</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          服务端返回的 Memory（记忆），便于观察 routing（路由）与 compression（压缩）效果。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            short（短期） {memory.shortTerm.length}
          </span>
          <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            items（条目） {memory.items.length}
          </span>
        </div>
      </div>

      <ul className={activePanel === "records" ? "min-h-0 space-y-2 px-3 py-3" : "hidden"}>
        {memory.items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
            暂无条目；多聊几句或触发总结后会出现。
          </li>
        ) : (
          memory.items.map((item, i) => (
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
      </div>
    </aside>
  );
}


