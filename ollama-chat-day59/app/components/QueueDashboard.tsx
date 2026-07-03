"use client"; // 当前组件包含按钮、轮询状态和动态任务列表，需要客户端渲染。

import { useRef, useState } from "react"; // 第59天：引入 useRef 和 useState，分别保存点击防抖与 Inspect 选中任务。
import type { CreateJobInput, Job, JobStoreSnapshot, JobType, QueueMetrics, WorkerPoolSnapshot } from "@/lib/queue/queue-types"; // 引入第35天队列任务、快照、创建输入和指标类型。

const CREATE_JOB_DEBOUNCE_MS = 700; // 定义创建任务按钮防抖间隔，避免连续点击重复创建。
const DASH = "-"; // 定义表格空值占位符。
const createJobButtonClass = "rounded-lg border border-cyan-500 bg-cyan-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-600 hover:bg-cyan-700 active:scale-[0.98] active:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"; // 定义创建任务按钮统一样式。
const requeueButtonClass = "rounded-md border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950/40 dark:text-red-200 dark:hover:bg-red-950/30"; // 定义死信任务重新入队按钮样式。
const cancelButtonClass = "rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-zinc-950/40 dark:text-amber-200 dark:hover:bg-amber-950/30"; // 第36天：定义取消任务按钮样式。
const inspectButtonClass = "rounded-md border border-cyan-300 bg-white px-2 py-1 text-[10px] font-semibold text-cyan-800 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-800 dark:bg-zinc-950/40 dark:text-cyan-200 dark:hover:bg-cyan-950/30"; // 第59天：定义 Inspect 和 Delete 的紧凑按钮样式。

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
  handleDeleteQueueJob: (jobId: string) => Promise<void>; // 第59天：接收删除 Redis Queue 任务回调。
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
  handleDeleteQueueJob, // 第59天：接收删除任务回调。
  handleGracefulShutdown, // 第36天：接收优雅关闭回调。
}: QueueDashboardProps) { // 结束组件参数。
  const [inspectedJobId, setInspectedJobId] = useState<string | null>(null); // 第59天：保存用户正在 Inspect 的 Job ID。
  const latestJob = jobs[0] ?? null; // 取最新任务作为 Inspect 默认值。
  const inspectedJob = jobs.find((job) => job.id === inspectedJobId) ?? latestJob; // 第59天：优先展示用户选中的任务，否则展示最新任务。
  const restartableJobs = jobs.filter((job) => job.status === "dead_letter" || job.status === "timeout" || job.status === "cancelled" || job.status === "failed"); // 第37天：找出可克隆重启的终止任务列表。
  const resourceUsage = runtimeSnapshot?.resourceUsage ?? []; // 读取资源占用列表。
  const rateLimitUsage = runtimeSnapshot?.rateLimitUsage ?? []; // 读取速率窗口列表。
  const rateLimitMetrics = runtimeSnapshot?.rateLimitMetrics ?? null; // 读取限制器指标。
  const redisQueue = runtimeSnapshot?.redisQueue ?? null; // 第59天：读取 Redis Queue Explorer 快照。
  const redisQueueMetrics = runtimeSnapshot?.redisQueueMetrics ?? redisQueue?.metrics ?? null; // 第59天：读取 Redis Queue Metrics。
  const queueOperations = runtimeSnapshot?.queueOperations ?? redisQueue?.operations ?? []; // 第59天：读取 Queue Operation Trace。
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
      void handleCreateQueueJob({ type: "embedding", priority: 1, timeoutMs: 30000, payload: { durationMs: 5000, document: `Day59 Redis Queue embedding 生命周期压测任务 ${index}` } }); // 第59天：创建 5 秒 embedding 任务。
    }); // 结束循环。
  }; // 结束 createTenEmbeddingJobs。
  const createFiveChatJobs = () => { // 第36天：定义 llm 速率限制压测入口。
    Array.from({ length: 5 }, (_, index) => index + 1).forEach((index) => { // 循环创建 5 个 chat 任务。
      void handleCreateQueueJob({ type: "chat", priority: 10, payload: { prompt: `Day59 Redis Queue llm rate limit burst ${index}` } }); // 第59天：创建 chat 任务观察每秒速率限制。
    }); // 结束循环。
  }; // 结束 createFiveChatJobs。
  const createTimeoutEmbeddingJob = () => handleDebouncedCreateJob({ type: "embedding", priority: 10, timeoutMs: 1200, payload: { durationMs: 5000, document: "Day59 Redis Queue visibility timeout 测试任务" } }); // 第59天：创建一个会触发超时的 embedding 任务。
  const createManualWorkflowJob = () => { // 第37天：定义无需聊天入口也能创建的最小 WorkflowJob。
    const workflowId = `manual_wf_${Date.now()}`; // 生成手动工作流 ID。
    handleDebouncedCreateJob({ type: "workflow", priority: 8, timeoutMs: 120000, payload: { workflowId, workflow: { id: workflowId, goal: "手动创建 Day59 Redis Queue WorkflowJob 示例", status: "queued", steps: [], executionTimeline: [{ ts: Date.now(), message: "手动 WorkflowJob 已在 Queue Explorer 创建" }] }, memory: { shortTerm: [], items: [] }, provider: "local" } }); // 第59天：创建包含完整 workflow 与 memory 的合法 WorkflowJob。
  }; // 结束 createManualWorkflowJob。
  return ( // 返回队列看板 UI。
    <div className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 队列看板容器。 */}
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Queue Explorer（队列浏览器）Day 59</h2> {/* 第59天：看板标题。 */}
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第59天：Production Infrastructure V2（生产基础设施第2版），使用 Redis List 构建 Distributed Queue（分布式队列），观察 Waiting、Processing、Completed、Dead Letter、ACK、Retry、Delete 和 Visibility Timeout。</p> {/* 第59天：看板说明。 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"> {/* 队列指标网格。 */}
        <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 px-2 py-1.5 dark:border-sky-900/40 dark:bg-sky-950/20">waiting（等待）: {redisQueueMetrics?.waiting ?? metrics?.queuedJobs ?? 0}</div> {/* 第59天：Redis Waiting Queue 指标。 */}
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">processing（处理中）: {redisQueueMetrics?.processing ?? metrics?.runningJobs ?? 0}</div> {/* 第59天：Redis Processing Queue 指标。 */}
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">completed（已完成）: {redisQueueMetrics?.completed ?? metrics?.successJobs ?? 0}</div> {/* 第59天：Redis Completed Queue 指标。 */}
        <div className="rounded-lg border border-red-200/70 bg-red-50/60 px-2 py-1.5 dark:border-red-900/40 dark:bg-red-950/20">dead letter（死信）: {redisQueueMetrics?.failed ?? metrics?.deadLetterJobs ?? 0}</div> {/* 第59天：Redis Dead Letter Queue 指标。 */}
        <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/20">cancelled（已取消）: {metrics?.cancelledJobs ?? 0}</div> {/* 第36天：已取消指标。 */}
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-2 py-1.5 dark:border-rose-900/40 dark:bg-rose-950/20">timeout（超时）: {metrics?.timeoutJobs ?? 0}</div> {/* 第36天：超时指标。 */}
        <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 px-2 py-1.5 dark:border-cyan-900/40 dark:bg-cyan-950/20">avg wait（平均等待）: {redisQueueMetrics?.avgWaitTime ?? 0}ms</div> {/* 第59天：展示平均等待时长。 */}
        <div className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-2 py-1.5 dark:border-orange-900/40 dark:bg-orange-950/20">avg processing（平均处理）: {redisQueueMetrics?.avgProcessingTime ?? 0}ms</div> {/* 第59天：展示平均处理时长。 */}
      </div> {/* 结束队列指标网格。 */}
      <p className="mt-2 font-mono text-[10px] text-cyan-900 dark:text-cyan-100">backend(后端): {redisQueue?.backend ?? "redis-list"} | namespace(命名空间): {redisQueue?.namespace ?? "Redis 未连接"} | active(活跃): {workerPool?.metrics.activeWorkers ?? 0} | idle(空闲): {workerPool?.metrics.idleWorkers ?? 0} | allowed(放行): {rateLimitMetrics?.allowedCount ?? 0} | blocked(阻塞): {rateLimitMetrics?.blockedCount ?? 0}</p> {/* 第59天：展示 Redis Queue 后端、命名空间、WorkerPool 与限制器摘要。 */}
      <div className="mt-2 rounded-lg border border-cyan-200/70 bg-cyan-50/50 px-2 py-2 dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 第59天：Queue Explorer 四桶面板。 */}
        <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Redis Queue Buckets（Redis 队列桶）</h3> {/* 第59天：四桶面板标题。 */}
        <div className="mt-2 grid grid-cols-2 gap-2"> {/* 第59天：四桶网格布局。 */}
          {(redisQueue?.buckets ?? []).map((bucket) => ( // 第59天：遍历 Waiting、Processing、Completed 和 Dead Letter。 
            <div key={bucket.name} className="min-w-0 rounded-md border border-cyan-100 bg-white/70 px-2 py-1.5 dark:border-cyan-900/40 dark:bg-zinc-950/30"> {/* 第59天：单个队列桶卡片。 */}
              <p className="font-mono text-[10px] font-semibold text-cyan-950 dark:text-cyan-100">{bucket.name} · {bucket.jobs.length}</p> {/* 第59天：展示队列桶名称与任务数量。 */}
              <ul className="mt-1 max-h-20 space-y-1 overflow-y-auto"> {/* 第59天：队列桶内任务列表。 */}
                {bucket.jobs.length === 0 ? <li className="text-[10px] text-zinc-400">empty（空）</li> : null} {/* 第59天：空桶占位。 */}
                {bucket.jobs.slice(0, 5).map((job) => ( // 第59天：最多展示前五个任务，完整数据仍在任务表中。 
                  <li key={`${bucket.name}-${job.id}`} className="truncate font-mono text-[9px] text-cyan-800 dark:text-cyan-200" title={`${job.id} | ${job.status}`}>{job.id} · {job.status}</li> // 第59天：展示队列桶内 Job 摘要。
                ))} {/* 第59天：结束桶内任务遍历。 */}
              </ul> {/* 第59天：结束队列桶内任务列表。 */}
            </div> // 第59天：结束单个队列桶卡片。
          ))} {/* 第59天：结束四桶遍历。 */}
          {!redisQueue ? <p className="col-span-2 rounded border border-dashed border-cyan-200 px-2 py-3 text-center text-[11px] text-cyan-700 dark:border-cyan-900/50 dark:text-cyan-300">Redis Queue 暂不可用；请确认 Redis 已启动。</p> : null} {/* 第59天：Redis 不可用时展示友好提示。 */}
        </div> {/* 第59天：结束四桶网格布局。 */}
      </div> {/* 第59天：结束 Queue Explorer 四桶面板。 */}
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
        <div className="grid grid-cols-[1fr_0.58fr_0.58fr_0.65fr_0.65fr_0.65fr_1.05fr] bg-cyan-50/80 px-2 py-1 font-mono text-[9px] text-cyan-900 dark:bg-cyan-950/25 dark:text-cyan-100"> {/* 第59天：扩展 Action 列以容纳 Inspect、Cancel 和 Delete。 */}
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
            <li className="px-2 py-3 text-center text-[11px] text-zinc-400">暂无任务；点击上方按钮创建 Day 59 Redis Queue Job（任务）。</li> // 第59天：空状态。
          ) : ( // 有任务时渲染列表。
            jobs.map((job) => ( // 遍历任务。
              <li key={job.id} className="grid grid-cols-[1fr_0.58fr_0.58fr_0.65fr_0.65fr_0.65fr_1.05fr] items-center gap-1 border-t border-cyan-100 px-2 py-1.5 text-[10px] dark:border-cyan-900/30"> {/* 第59天：单行任务。 */}
                <span className="truncate font-mono" title={`${job.id} | workflow ${job.workflowId ?? DASH} | ${priorityLabel(job.priority)} | wait ${formatWait(job)}`}>{job.id}</span> {/* 任务 ID 与 Workflow ID。 */}
                <span className="truncate">{job.type}</span> {/* 任务类型。 */}
                <span className="truncate">{job.resourceType ?? DASH}</span> {/* 资源类型。 */}
                <span className={`inline-flex w-fit rounded-full px-1.5 py-0.5 font-semibold ring-1 ${statusClass(job.status)}`}>{job.status}</span> {/* 任务状态。 */}
                <span className="truncate font-mono" title={blockedText(job)}>{blockedText(job)}</span> {/* 阻塞原因。 */}
                <span className="truncate font-mono" title={`worker ${job.workerId ?? DASH}`}>{formatLockedAt(job)}</span> {/* 锁定时间。 */}
                <span className="flex flex-wrap gap-1"> {/* 第59天：Action 按钮组。 */}
                  <button type="button" disabled={queueLoading} onClick={() => setInspectedJobId(job.id)} className={inspectButtonClass}>Inspect（检查）</button> {/* 第59天：选中任务并在下方展示详情。 */}
                  {canCancel(job) ? <button type="button" disabled={queueLoading} onClick={() => void handleCancelQueueJob(job.id)} className={cancelButtonClass}>Cancel（取消）</button> : null} {/* 第59天：取消 queued/retrying/running 任务。 */}
                  <button type="button" disabled={queueLoading} onClick={() => void handleDeleteQueueJob(job.id)} className={requeueButtonClass}>Delete（删除）</button> {/* 第59天：从 Redis Queue 与 JobStore 删除任务。 */}
                </span> {/* 第59天：结束 Action 按钮组。 */}
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
      <div className="mt-3 rounded-lg border border-cyan-200/70 bg-cyan-50/40 px-2 py-2 dark:border-cyan-900/40 dark:bg-cyan-950/15"> {/* 第59天：Queue Operation Trace 面板。 */}
        <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Queue Operation Trace（队列操作追踪）</h3> {/* 第59天：队列追踪标题。 */}
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto"> {/* 第59天：队列追踪列表。 */}
          {queueOperations.length === 0 ? <li className="text-[11px] text-zinc-400">暂无 Queue Trace；创建任务后会出现 enqueue、dequeue、ack、retry、fail、delete。</li> : null} {/* 第59天：队列追踪空状态。 */}
          {queueOperations.slice(0, 10).map((op) => ( // 第59天：展示最近 10 条队列操作。
            <li key={op.id} className="rounded border border-cyan-100 bg-white/70 px-2 py-1 text-[10px] dark:border-cyan-900/40 dark:bg-zinc-950/30"> {/* 第59天：单条队列追踪。 */}
              <p className="font-mono font-semibold text-cyan-950 dark:text-cyan-100">{op.operation} · {op.status} · {op.latencyMs}ms</p> {/* 第59天：展示操作名、状态和耗时。 */}
              <p className="break-words text-cyan-800 dark:text-cyan-200">job(任务): {op.jobId ?? DASH} | worker(工作线程): {op.workerId ?? DASH} | bucket(队列桶): {op.bucket ?? DASH}</p> {/* 第59天：展示操作上下文。 */}
              <p className="break-words text-zinc-500 dark:text-zinc-400">{op.note} · {new Date(op.createdAt).toLocaleTimeString("zh-CN")}</p> {/* 第59天：展示中文说明和时间。 */}
            </li> // 第59天：结束单条队列追踪。
          ))} {/* 第59天：结束队列追踪遍历。 */}
        </ul> {/* 第59天：结束队列追踪列表。 */}
      </div> {/* 第59天：结束 Queue Operation Trace 面板。 */}
      {inspectedJob ? ( // 第59天：判断是否有可检查任务。
        <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/60 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 时间线卡片。 */}
          <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Inspect Job（检查任务） | {inspectedJob.id}</h3> {/* 第59天：检查任务标题。 */}
          <p className="mt-1 font-mono text-[10px] text-cyan-800 dark:text-cyan-200">status(状态): {inspectedJob.status} | duration(耗时): {formatDuration(inspectedJob)} | resource(资源): {inspectedJob.resourceType ?? DASH} | attempts(尝试): {inspectedJob.attempts}/{inspectedJob.maxAttempts}</p> {/* 第59天：检查任务摘要。 */}
          <p className="mt-1 break-words font-mono text-[10px] text-zinc-500 dark:text-zinc-400">payload(载荷): {JSON.stringify(inspectedJob.payload)}</p> {/* 第59天：展示任务载荷，完成 Inspect 要求。 */}
          <ol className="mt-2 space-y-1"> {/* 时间线列表。 */}
            {inspectedJob.timeline.map((item) => ( // 第59天：遍历被检查任务的时间线节点。
              <li key={`${item.label}-${item.at}`} className="rounded border border-cyan-100 bg-cyan-50/60 px-2 py-1 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 时间线节点。 */}
                <p className="font-semibold text-cyan-950 dark:text-cyan-100">{item.label} | {new Date(item.at).toLocaleString("zh-CN")}</p> {/* 节点标题。 */}
                <p className="text-cyan-800/90 dark:text-cyan-200/90">{item.note}</p> {/* 节点说明。 */}
              </li> // 结束时间线节点。
            ))} {/* 结束时间线遍历。 */}
          </ol> {/* 结束时间线列表。 */}
        </div> // 结束时间线卡片。
      ) : null} {/* 第59天：结束 Inspect 任务判断。 */}
    </div> // 结束队列看板容器。
  ); // 结束 UI 返回。
} // 结束 QueueDashboard 组件。
