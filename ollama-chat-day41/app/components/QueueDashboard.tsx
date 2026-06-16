"use client"; // 当前组件包含按钮、轮询状态和动态任务列表，需要客户端渲染。

import { useRef } from "react"; // 引入 useRef 保存点击防抖时间戳。
import type { CreateJobInput, Job, JobStoreSnapshot, JobType, QueueMetrics, WorkerPoolSnapshot } from "@/lib/queue/queue-types"; // 引入第35天队列任务、快照、创建输入和指标类型。

const CREATE_JOB_DEBOUNCE_MS = 700; // 定义创建任务按钮防抖间隔，避免连续点击重复创建。
const DASH = "-"; // 定义表格空值占位符。
const createJobButtonClass = "rounded-lg border border-cyan-500 bg-cyan-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-600 hover:bg-cyan-700 active:scale-[0.98] active:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"; // 定义创建任务按钮统一样式。
const requeueButtonClass = "rounded-md border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950/40 dark:text-red-200 dark:hover:bg-red-950/30"; // 定义死信任务重新入队按钮样式。
const cancelButtonClass = "rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-950/40 dark:text-amber-200 dark:hover:bg-amber-950/30"; // 第36天：定义取消任务按钮样式。

type QueueDashboardProps = { // 定义队列看板组件参数。
  jobs: Job[]; // 接收任务列表。
  metrics: QueueMetrics | null; // 接收队列指标。
  workerPool: WorkerPoolSnapshot | null; // 接收 WorkerPool 快照。
  runtimeSnapshot: JobStoreSnapshot | null; // 第35天：接收资源占用、速率窗口和限制器指标快照。
  queueLoading: boolean; // 接收队列 API 加载状态。
  handleCreateQueueJob: (input: CreateJobInput) => Promise<void>; // 接收创建任务回调。
  handleRequeueQueueJob: (jobId: string) => Promise<void>; // 接收死信任务重新入队回调。
  handleRestartQueueJob: (jobId: string) => Promise<void>; // 第37天：接收克隆旧任务并创建新 Job 的回调。
  handleCancelQueueJob: (jobId: string) => Promise<void>; // 第36天：接收取消任务回调。
  handleGracefulShutdown: () => Promise<void>; // 第36天：接收 WorkerPool 优雅关闭回调。
}; // 结束 QueueDashboardProps 类型。

function formatDuration(job: Job): string { // 定义任务耗时格式化函数。
  if (!job.startedAt) return "未开始"; // 没有开始时间时返回未开始。
  const end = job.completedAt ?? Date.now(); // 有完成时间用完成时间，否则用当前时间。
  return `${Math.max(0, end - job.startedAt)}ms`; // 返回毫秒耗时。
} // 结束 formatDuration。

function formatLockedAt(job: Job): string { // 定义任务锁时间格式化函数。
  if (!job.lockedAt) return DASH; // 没有锁时间时返回占位符。
  return new Date(job.lockedAt).toLocaleTimeString("zh-CN"); // 返回任务锁定本地时间。
} // 结束 formatLockedAt。

function formatWait(job: Job): string { // 定义等待时长格式化函数。
  const runAt = Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 取计划时间和重试时间中更晚的时间。
  if (!runAt || runAt <= Date.now()) return job.status === "queued" || job.status === "retrying" ? "ready" : DASH; // 到期任务显示 ready。
  return `${Math.ceil((runAt - Date.now()) / 1000)}s`; // 返回剩余秒数。
} // 结束 formatWait。

function formatHeartbeat(at?: number): string { // 定义 Worker 心跳格式化函数。
  if (!at) return DASH; // 没有心跳时返回占位符。
  return `${Math.max(0, Math.round((Date.now() - at) / 1000))}s ago`; // 返回距离上次心跳的秒数。
} // 结束 formatHeartbeat。

function statusClass(status: Job["status"]): string { // 定义状态样式函数。
  if (status === "queued") return "bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:text-sky-200"; // 返回排队状态样式。
  if (status === "running") return "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:text-amber-200"; // 返回执行状态样式。
  if (status === "success") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200"; // 返回成功状态样式。
  if (status === "retrying") return "bg-violet-500/15 text-violet-800 ring-violet-500/25 dark:text-violet-200"; // 返回重试状态样式。
  if (status === "cancelling") return "bg-orange-500/15 text-orange-800 ring-orange-500/25 dark:text-orange-200"; // 第36天：返回取消中状态样式。
  if (status === "cancelled") return "bg-zinc-500/15 text-zinc-700 ring-zinc-500/25 dark:text-zinc-200"; // 第36天：返回已取消状态样式。
  if (status === "timeout") return "bg-rose-500/15 text-rose-800 ring-rose-500/25 dark:text-rose-200"; // 第36天：返回超时状态样式。
  if (status === "dead_letter") return "bg-red-600/15 text-red-900 ring-red-600/25 dark:text-red-200"; // 返回死信状态样式。
  return "bg-red-500/15 text-red-800 ring-red-500/25 dark:text-red-200"; // 返回失败状态样式。
} // 结束 statusClass。

function priorityLabel(priority: number): string { // 定义优先级标签函数。
  if (priority >= 10) return "P10 high"; // 高优先级显示 P10。
  if (priority <= 1) return "P1 low"; // 低优先级显示 P1。
  return `P${priority} normal`; // 普通优先级显示实际数字。
} // 结束 priorityLabel。

function blockedText(job: Job): string { // 第35天：定义阻塞原因展示函数。
  if (job.blockedReason === "resource_limit") return `waiting(等待) ${job.resourceType ?? "resource"}`; // 资源并发满时展示等待资源。
  if (job.blockedReason === "rate_limit") return `rate limited(限流) ${job.resourceType ?? "resource"}`; // 速率超限时展示速率限制。
  return DASH; // 没有阻塞原因时返回占位符。
} // 结束 blockedText。

function canCancel(job: Job): boolean { // 第36天：定义任务是否允许取消的判断函数。
  return job.status === "queued" || job.status === "retrying" || job.status === "running"; // queued、retrying、running 状态允许取消。
} // 结束 canCancel。

export function QueueDashboard({ // 导出队列看板组件。
  jobs, // 接收任务列表。
  metrics, // 接收队列指标。
  workerPool, // 接收 WorkerPool 快照。
  runtimeSnapshot, // 接收 V5 运行时快照。
  queueLoading, // 接收加载状态。
  handleCreateQueueJob, // 接收创建任务回调。
  handleRequeueQueueJob, // 接收重新入队回调。
  handleRestartQueueJob, // 第37天：接收重启为新 Job 回调。
  handleCancelQueueJob, // 第36天：接收取消任务回调。
  handleGracefulShutdown, // 第36天：接收优雅关闭回调。
}: QueueDashboardProps) { // 结束组件参数。
  const latestJob = jobs[0] ?? null; // 取最新任务用于时间线展示。
  const restartableJobs = jobs.filter((job) => job.status === "dead_letter" || job.status === "timeout" || job.status === "cancelled" || job.status === "failed"); // 第37天：找出可克隆重启的终止任务列表。
  const resourceUsage = runtimeSnapshot?.resourceUsage ?? []; // 读取资源占用列表。
  const rateLimitUsage = runtimeSnapshot?.rateLimitUsage ?? []; // 读取速率窗口列表。
  const rateLimitMetrics = runtimeSnapshot?.rateLimitMetrics ?? null; // 读取限制器指标。
  const lastCreateClickAtRef = useRef(0); // 保存上一次创建点击时间。
  const handleDebouncedCreateJob = (input: CreateJobInput) => { // 定义带防抖的创建任务入口。
    const now = Date.now(); // 获取当前时间戳。
    if (now - lastCreateClickAtRef.current < CREATE_JOB_DEBOUNCE_MS) return; // 防抖窗口内忽略重复点击。
    lastCreateClickAtRef.current = now; // 记录本次点击时间。
    void handleCreateQueueJob(input); // 调用父组件创建任务逻辑。
  }; // 结束 handleDebouncedCreateJob。
  const create = (type: JobType, priority: number, scheduledDelayMs?: number, payload?: Record<string, unknown>) => handleDebouncedCreateJob({ type, priority, scheduledDelayMs, payload }); // 定义简化按钮创建函数。
  const createTenEmbeddingJobs = () => { // 第36天：定义 10 个 embedding 资源并发与取消压测入口。
    Array.from({ length: 10 }, (_, index) => index + 1).forEach((index) => { // 循环创建 10 个 embedding 长任务。
      void handleCreateQueueJob({ type: "embedding", priority: 1, timeoutMs: 30000, payload: { durationMs: 5000, document: `Day37 embedding 生命周期压测任务 ${index}` } }); // 创建 5 秒 embedding 任务。
    }); // 结束循环。
  }; // 结束 createTenEmbeddingJobs。
  const createFiveChatJobs = () => { // 第36天：定义 llm 速率限制压测入口。
    Array.from({ length: 5 }, (_, index) => index + 1).forEach((index) => { // 循环创建 5 个 chat 任务。
      void handleCreateQueueJob({ type: "chat", priority: 10, payload: { prompt: `Day37 llm rate limit burst ${index}` } }); // 创建 chat 任务观察每秒速率限制。
    }); // 结束循环。
  }; // 结束 createFiveChatJobs。
  const createTimeoutEmbeddingJob = () => handleDebouncedCreateJob({ type: "embedding", priority: 10, timeoutMs: 1200, payload: { durationMs: 5000, document: "Day37 timeout wrapper 测试任务" } }); // 第36天：创建一个会触发超时的 embedding 任务。
  const createManualWorkflowJob = () => { // 第37天：定义无需聊天入口也能创建的最小 WorkflowJob。
    const workflowId = `manual_wf_${Date.now()}`; // 生成手动工作流 ID。
    handleDebouncedCreateJob({ type: "workflow", priority: 8, timeoutMs: 120000, payload: { workflowId, workflow: { id: workflowId, goal: "手动创建 Day37 WorkflowJob 示例", status: "queued", steps: [], executionTimeline: [{ ts: Date.now(), message: "手动 WorkflowJob 已在 Queue Dashboard 创建" }] }, memory: { shortTerm: [], items: [] }, provider: "local" } }); // 创建包含完整 workflow 与 memory 的合法 WorkflowJob。
  }; // 结束 createManualWorkflowJob。
  return ( // 返回队列看板 UI。
    <div className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 队列看板容器。 */}
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Queue Runtime（队列运行时）V7</h2> {/* 看板标题。 */}
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第41天：继续保留 Workflow as Job（工作流任务化）基础设施，供 Agent DAG Runtime（智能体 DAG 运行时）复用 Queue（队列）、Worker（工作线程）、Retry（重试）、Cancel（取消）和 Unified Timeline（统一时间线）。</p> {/* 看板说明。 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"> {/* 队列指标网格。 */}
        <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 px-2 py-1.5 dark:border-sky-900/40 dark:bg-sky-950/20">queued（排队）: {metrics?.queuedJobs ?? 0}</div> {/* 排队指标。 */}
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">running（运行）: {metrics?.runningJobs ?? 0}</div> {/* 执行指标。 */}
        <div className="rounded-lg border border-violet-200/70 bg-violet-50/60 px-2 py-1.5 dark:border-violet-900/40 dark:bg-violet-950/20">retrying（重试）: {metrics?.retryingJobs ?? 0}</div> {/* 重试指标。 */}
        <div className="rounded-lg border border-red-200/70 bg-red-50/60 px-2 py-1.5 dark:border-red-900/40 dark:bg-red-950/20">dead（死信）: {metrics?.deadLetterJobs ?? 0}</div> {/* 死信指标。 */}
        <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/20">cancelled（已取消）: {metrics?.cancelledJobs ?? 0}</div> {/* 第36天：已取消指标。 */}
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-2 py-1.5 dark:border-rose-900/40 dark:bg-rose-950/20">timeout（超时）: {metrics?.timeoutJobs ?? 0}</div> {/* 第36天：超时指标。 */}
        <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 px-2 py-1.5 dark:border-cyan-900/40 dark:bg-cyan-950/20">allowed（放行）: {rateLimitMetrics?.allowedCount ?? 0}</div> {/* 限制器放行指标。 */}
        <div className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-2 py-1.5 dark:border-orange-900/40 dark:bg-orange-950/20">blocked（阻塞）: {rateLimitMetrics?.blockedCount ?? 0}</div> {/* 限制器阻塞指标。 */}
      </div> {/* 结束队列指标网格。 */}
      <p className="mt-2 font-mono text-[10px] text-cyan-900 dark:text-cyan-100">active(活跃): {workerPool?.metrics.activeWorkers ?? 0} | idle(空闲): {workerPool?.metrics.idleWorkers ?? 0} | throughput/min(每分钟吞吐): {workerPool?.metrics.throughputPerMinute ?? 0}</p> {/* WorkerPool 摘要。 */}
      <div className="mt-2 rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/30"> {/* 资源占用面板。 */}
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Resource Usage（资源占用）</h3> {/* 资源占用标题。 */}
        <ul className="mt-2 grid grid-cols-2 gap-1"> {/* 资源占用列表。 */}
          {resourceUsage.map((item) => ( // 遍历资源占用。 
            <li key={item.resourceType} className="rounded border border-zinc-200/70 bg-white/70 px-2 py-1 text-[10px] dark:border-zinc-800 dark:bg-zinc-900/40">{item.resourceType}: {item.active} / {item.limit}</li> // 渲染资源占用项。
          ))} {/* 结束资源占用遍历。 */}
        </ul> {/* 结束资源占用列表。 */}
      </div> {/* 结束资源占用面板。 */}
      <div className="mt-2 rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/30"> {/* 速率限制面板。 */}
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Rate Limit Window（限流窗口）</h3> {/* 速率限制标题。 */}
        <ul className="mt-2 grid grid-cols-2 gap-1"> {/* 速率限制列表。 */}
          {rateLimitUsage.map((item) => ( // 遍历速率窗口。 
            <li key={item.resourceType} className="rounded border border-zinc-200/70 bg-white/70 px-2 py-1 text-[10px] dark:border-zinc-800 dark:bg-zinc-900/40">{item.resourceType}: {item.used} / {item.limit}s</li> // 渲染速率窗口项。
          ))} {/* 结束速率窗口遍历。 */}
        </ul> {/* 结束速率限制列表。 */}
      </div> {/* 结束速率限制面板。 */}
      <div className="mt-2 rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950/30"> {/* WorkerPool 面板。 */}
        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Worker Pool（工作线程池）</h3> {/* WorkerPool 标题。 */}
        <ul className="mt-2 space-y-1"> {/* Worker 列表。 */}
          {(workerPool?.workers ?? []).map((worker) => ( // 遍历 Worker 状态。
            <li key={worker.id} className="grid grid-cols-[0.8fr_0.7fr_1fr_0.9fr] gap-1 rounded border border-zinc-200/70 bg-white/70 px-2 py-1 text-[10px] dark:border-zinc-800 dark:bg-zinc-900/40"> {/* Worker 行。 */}
              <span className="truncate font-mono">{worker.id}</span> {/* Worker ID。 */}
              <span className="truncate">{worker.status}</span> {/* Worker 状态。 */}
              <span className="truncate font-mono">{worker.currentJobId ?? DASH}</span> {/* 当前任务 ID。 */}
              <span className="truncate">{formatHeartbeat(worker.lastHeartbeatAt)}</span> {/* 最近心跳。 */}
            </li> // 结束 Worker 行。
          ))} {/* 结束 Worker 遍历。 */}
        </ul> {/* 结束 Worker 列表。 */}
      </div> {/* 结束 WorkerPool 面板。 */}
      <div className="mt-2 grid grid-cols-2 gap-2"> {/* 创建任务按钮区域。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("chat", 10)} className={createJobButtonClass}>High Chat（高优先级聊天）P10</button> {/* 创建高优先级 chat 任务。 */}
        <button type="button" disabled={queueLoading} onClick={createManualWorkflowJob} className={createJobButtonClass}>Workflow Job（工作流任务）P8</button> {/* 创建 workflow 任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("retrieval", 5)} className={createJobButtonClass}>Retrieval DB（检索数据库）P5</button> {/* 创建 database 资源任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("reindex", 3)} className={createJobButtonClass}>Reindex Embedding（重建向量）</button> {/* 创建 reindex 任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("unstable", 5)} className={createJobButtonClass}>Unstable Retry（不稳定重试）</button> {/* 创建不稳定重试任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("alwaysFail", 5)} className={createJobButtonClass}>AlwaysFail DLQ（死信队列）</button> {/* 创建必定失败死信任务。 */}
        <button type="button" disabled={queueLoading} onClick={createTenEmbeddingJobs} className={`${createJobButtonClass} col-span-2`}>Create 10 Embedding Jobs（创建 10 个向量任务）</button> {/* 创建 10 个 embedding 资源限制压测任务。 */}
        <button type="button" disabled={queueLoading} onClick={createFiveChatJobs} className={`${createJobButtonClass} col-span-2`}>Burst 5 Chat Jobs（突发 5 个聊天任务）</button> {/* 创建 5 个 chat 速率限制压测任务。 */}
        <button type="button" disabled={queueLoading} onClick={createTimeoutEmbeddingJob} className={`${createJobButtonClass} col-span-2`}>Timeout Embedding Job（超时向量任务）</button> {/* 第36天：创建会触发 timeout wrapper 的任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => void handleGracefulShutdown()} className={`${cancelButtonClass} col-span-2`}>Graceful Shutdown（优雅关闭）</button> {/* 第36天：触发 WorkerPool 优雅关闭。 */}
      </div> {/* 结束创建任务按钮区域。 */}
      <div className="mt-3 overflow-hidden rounded-lg border border-cyan-200/70 dark:border-cyan-900/40"> {/* 任务表格外框。 */}
        <div className="grid grid-cols-[1fr_0.58fr_0.58fr_0.65fr_0.65fr_0.65fr_0.62fr] bg-cyan-50/80 px-2 py-1 font-mono text-[9px] text-cyan-900 dark:bg-cyan-950/25 dark:text-cyan-100"> {/* 表头。 */}
          <span>Job</span> {/* Job 表头。 */}
          <span>Type</span> {/* Type 表头。 */}
          <span>Resource</span> {/* Resource 表头。 */}
          <span>Status</span> {/* Status 表头。 */}
          <span>Blocked</span> {/* Blocked 表头。 */}
          <span>Lock</span> {/* Lock 表头。 */}
          <span>Action</span> {/* 第36天：Action 表头。 */}
        </div> {/* 结束表头。 */}
        <ul className="max-h-44 overflow-y-auto"> {/* 任务列表。 */}
          {jobs.length === 0 ? ( // 判断是否暂无任务。
            <li className="px-2 py-3 text-center text-[11px] text-zinc-400">暂无任务；点击上方按钮创建 Day 41 继承队列 Job（任务）。</li> // 空状态。
          ) : ( // 有任务时渲染列表。
            jobs.map((job) => ( // 遍历任务。
              <li key={job.id} className="grid grid-cols-[1fr_0.58fr_0.58fr_0.65fr_0.65fr_0.65fr_0.62fr] items-center gap-1 border-t border-cyan-100 px-2 py-1.5 text-[10px] dark:border-cyan-900/30"> {/* 单行任务。 */}
                <span className="truncate font-mono" title={`${job.id} | workflow ${job.workflowId ?? DASH} | ${priorityLabel(job.priority)} | wait ${formatWait(job)}`}>{job.id}</span> {/* 任务 ID 与 Workflow ID。 */}
                <span className="truncate">{job.type}</span> {/* 任务类型。 */}
                <span className="truncate">{job.resourceType ?? DASH}</span> {/* 资源类型。 */}
                <span className={`inline-flex w-fit rounded-full px-1.5 py-0.5 font-semibold ring-1 ${statusClass(job.status)}`}>{job.status}</span> {/* 任务状态。 */}
                <span className="truncate font-mono" title={blockedText(job)}>{blockedText(job)}</span> {/* 阻塞原因。 */}
                <span className="truncate font-mono" title={`worker ${job.workerId ?? DASH}`}>{formatLockedAt(job)}</span> {/* 锁定时间。 */}
                {canCancel(job) ? ( // 第36天：判断是否展示取消按钮。
                  <button type="button" disabled={queueLoading} onClick={() => void handleCancelQueueJob(job.id)} className={cancelButtonClass}>Cancel（取消）</button> // 第36天：取消 queued/retrying/running 任务。
                ) : (
                  <span className="font-mono text-zinc-400">{DASH}</span> // 终态任务不显示动作按钮。
                )} {/* 结束取消按钮判断。 */}
              </li> // 结束单行任务。
            )) // 结束任务遍历。
          )} {/* 结束条件渲染。 */}
        </ul> {/* 结束任务列表。 */}
      </div> {/* 结束任务表格外框。 */}
      {restartableJobs.length ? ( // 判断是否存在可重启任务。
        <div className="mt-3 rounded-lg border border-red-200/80 bg-red-50/60 px-2 py-2 dark:border-red-900/50 dark:bg-red-950/20"> {/* 死信任务区域。 */}
          <h3 className="text-xs font-semibold text-red-950 dark:text-red-100">Restartable Jobs（可重启任务）</h3> {/* 第37天：可重启任务标题。 */}
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto"> {/* 死信任务列表。 */}
            {restartableJobs.map((job) => ( // 遍历可重启任务。
              <li key={job.id} className="rounded border border-red-200/80 bg-white/70 px-2 py-1.5 text-[10px] dark:border-red-900/50 dark:bg-zinc-950/30"> {/* 单个死信任务。 */}
                <div className="flex items-center justify-between gap-2"> {/* 死信任务头部。 */}
                  <span className="truncate font-mono text-red-950 dark:text-red-100" title={job.id}>{job.id}</span> {/* 死信任务 ID。 */}
                  <div className="flex gap-1"> {/* 操作按钮组。 */}
                    {(job.status === "dead_letter" || job.status === "timeout") ? <button type="button" disabled={queueLoading} onClick={() => void handleRequeueQueueJob(job.id)} className={requeueButtonClass}>Requeue（重新入队）</button> : null} {/* 原地重新入队按钮。 */}
                    <button type="button" disabled={queueLoading} onClick={() => void handleRestartQueueJob(job.id)} className={requeueButtonClass}>Restart（重启）</button> {/* 第37天：克隆为新 Job 的重启按钮。 */}
                  </div> {/* 结束操作按钮组。 */}
                </div> {/* 结束死信任务头部。 */}
                <p className="mt-1 break-words text-red-800 dark:text-red-200">type(类型): {job.type} | workflow(工作流): {job.workflowId ?? DASH} | resource(资源): {job.resourceType ?? DASH} | attempts(尝试): {job.attempts}/{job.maxAttempts}</p> {/* 可重启任务摘要。 */}
                <p className="mt-0.5 break-words font-mono text-[9px] text-red-700 dark:text-red-300">last error(最后错误): {job.error ?? DASH}</p> {/* 最后错误。 */}
              </li> // 结束单个死信任务。
            ))} {/* 结束死信遍历。 */}
          </ul> {/* 结束死信任务列表。 */}
        </div> // 结束死信任务区域。
      ) : null} {/* 结束死信判断。 */}
      {latestJob ? ( // 判断是否有最新任务。
        <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/60 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 时间线卡片。 */}
          <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Unified V7 Timeline（统一时间线） | {latestJob.id}</h3> {/* 时间线标题。 */}
          <p className="mt-1 font-mono text-[10px] text-cyan-800 dark:text-cyan-200">duration(耗时): {formatDuration(latestJob)} | resource(资源): {latestJob.resourceType ?? DASH} | attempts(尝试): {latestJob.attempts}/{latestJob.maxAttempts}</p> {/* 最新任务摘要。 */}
          <ol className="mt-2 space-y-1"> {/* 时间线列表。 */}
            {latestJob.timeline.map((item) => ( // 遍历时间线节点。
              <li key={`${item.label}-${item.at}`} className="rounded border border-cyan-100 bg-cyan-50/60 px-2 py-1 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 时间线节点。 */}
                <p className="font-semibold text-cyan-950 dark:text-cyan-100">{item.label} | {new Date(item.at).toLocaleString("zh-CN")}</p> {/* 节点标题。 */}
                <p className="text-cyan-800/90 dark:text-cyan-200/90">{item.note}</p> {/* 节点说明。 */}
              </li> // 结束时间线节点。
            ))} {/* 结束时间线遍历。 */}
          </ol> {/* 结束时间线列表。 */}
        </div> // 结束时间线卡片。
      ) : null} {/* 结束最新任务判断。 */}
    </div> // 结束队列看板容器。
  ); // 结束 UI 返回。
} // 结束 QueueDashboard 组件。
