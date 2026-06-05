"use client"; // 当前组件包含按钮、轮询状态和动态任务列表，需要客户端渲染。

import { useRef } from "react"; // 引入 useRef 保存点击防抖时间戳。
import type { CreateJobInput, Job, JobType, QueueMetrics } from "@/lib/queue/queue-types"; // 引入队列任务、创建输入与指标类型。

const CREATE_JOB_DEBOUNCE_MS = 700; // 定义创建任务按钮防抖间隔，避免连续点击重复创建。
const DASH = "—"; // 定义表格空值占位符。
const createJobButtonClass = "rounded-lg border border-cyan-500 bg-cyan-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:border-cyan-600 hover:bg-cyan-700 active:scale-[0.98] active:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500 dark:bg-cyan-600 dark:hover:bg-cyan-500"; // 定义创建任务按钮统一样式。
const requeueButtonClass = "rounded-md border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950/40 dark:text-red-200 dark:hover:bg-red-950/30"; // 定义死信任务重新入队按钮样式。

type QueueDashboardProps = { // 定义队列看板组件参数。
  jobs: Job[]; // 接收任务列表。
  metrics: QueueMetrics | null; // 接收队列指标。
  queueLoading: boolean; // 接收队列 API 加载状态。
  handleCreateQueueJob: (input: CreateJobInput) => Promise<void>; // 接收创建任务回调。
  handleRequeueQueueJob: (jobId: string) => Promise<void>; // 接收死信任务重新入队回调。
}; // 结束 QueueDashboardProps 类型。

function formatDuration(job: Job): string { // 定义任务耗时格式化函数。
  if (!job.startedAt) return "未开始"; // 没有开始时间时返回未开始。
  const end = job.completedAt ?? Date.now(); // 有完成时间用完成时间，否则用当前时间。
  return `${Math.max(0, end - job.startedAt)}ms`; // 返回毫秒耗时。
} // 结束 formatDuration。

function formatScheduledAt(job: Job): string { // 定义计划执行时间格式化函数。
  if (!job.scheduledAt) return DASH; // 没有计划时间时返回占位符。
  return new Date(job.scheduledAt).toLocaleTimeString("zh-CN"); // 返回本地时间字符串。
} // 结束 formatScheduledAt。

function formatWait(job: Job): string { // 定义等待时长格式化函数。
  const runAt = Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 取计划时间和重试时间中更晚的时间。
  if (!runAt || runAt <= Date.now()) return job.status === "queued" || job.status === "retrying" ? "ready" : DASH; // 到期任务显示 ready，非等待任务显示占位符。
  return `${Math.ceil((runAt - Date.now()) / 1000)}s`; // 返回剩余秒数。
} // 结束 formatWait。

function statusClass(status: Job["status"]): string { // 定义状态样式函数。
  if (status === "queued") return "bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:text-sky-200"; // 返回排队状态样式。
  if (status === "running") return "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:text-amber-200"; // 返回执行状态样式。
  if (status === "success") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200"; // 返回成功状态样式。
  if (status === "retrying") return "bg-violet-500/15 text-violet-800 ring-violet-500/25 dark:text-violet-200"; // 返回重试等待状态样式。
  if (status === "dead_letter") return "bg-red-600/15 text-red-900 ring-red-600/25 dark:text-red-200"; // 返回死信状态样式。
  return "bg-red-500/15 text-red-800 ring-red-500/25 dark:text-red-200"; // 返回历史失败状态样式。
} // 结束 statusClass。

function priorityLabel(priority: number): string { // 定义优先级标签函数。
  if (priority >= 10) return "P10 high"; // 高优先级显示 P10。
  if (priority <= 1) return "P1 low"; // 低优先级显示 P1。
  return `P${priority} normal`; // 普通优先级显示实际数字。
} // 结束 priorityLabel。

export function QueueDashboard({ // 导出队列看板组件。
  jobs, // 接收任务列表。
  metrics, // 接收队列指标。
  queueLoading, // 接收加载状态。
  handleCreateQueueJob, // 接收创建任务回调。
  handleRequeueQueueJob, // 接收重新入队回调。
}: QueueDashboardProps) { // 结束组件参数。
  const latestJob = jobs[0] ?? null; // 取最新任务用于时间线展示。
  const deadLetterJobs = jobs.filter((job) => job.status === "dead_letter"); // 找出死信任务列表。
  const lastCreateClickAtRef = useRef(0); // 保存上一创建点击时间。
  const handleDebouncedCreateJob = (input: CreateJobInput) => { // 定义带防抖的创建任务入口。
    const now = Date.now(); // 获取当前时间戳。
    if (now - lastCreateClickAtRef.current < CREATE_JOB_DEBOUNCE_MS) return; // 防抖窗口内忽略重复点击。
    lastCreateClickAtRef.current = now; // 记录本次点击时间。
    void handleCreateQueueJob(input); // 调用父组件创建任务逻辑。
  }; // 结束 handleDebouncedCreateJob。
  const create = (type: JobType, priority: number, scheduledDelayMs?: number) => handleDebouncedCreateJob({ type, priority, scheduledDelayMs }); // 定义简化按钮创建函数。
  return ( // 返回队列看板 UI。
    <div className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 队列看板容器。 */}
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Queue Runtime V3</h2> {/* 看板标题。 */}
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"> {/* 看板说明。 */}
        第33天：Priority Queue + Scheduled Job，在 retry / backoff / DLQ 基础上观察高优先级抢占、未来调度与 Reminder 任务。 {/* 说明文字。 */}
      </p> {/* 结束看板说明。 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"> {/* 指标网格。 */}
        <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 px-2 py-1.5 dark:border-sky-900/40 dark:bg-sky-950/20">queued: {metrics?.queuedJobs ?? 0}</div> {/* 排队指标。 */}
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">running: {metrics?.runningJobs ?? 0}</div> {/* 执行指标。 */}
        <div className="rounded-lg border border-violet-200/70 bg-violet-50/60 px-2 py-1.5 dark:border-violet-900/40 dark:bg-violet-950/20">retrying: {metrics?.retryingJobs ?? 0}</div> {/* 重试指标。 */}
        <div className="rounded-lg border border-red-200/70 bg-red-50/60 px-2 py-1.5 dark:border-red-900/40 dark:bg-red-950/20">dead: {metrics?.deadLetterJobs ?? 0}</div> {/* 死信指标。 */}
        <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 px-2 py-1.5 dark:border-cyan-900/40 dark:bg-cyan-950/20">high: {metrics?.highPriorityJobs ?? 0}</div> {/* 高优先级指标。 */}
        <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/30">scheduled: {metrics?.scheduledJobs ?? 0}</div> {/* 定时任务指标。 */}
      </div> {/* 结束指标网格。 */}
      <p className="mt-2 font-mono text-[10px] text-cyan-900 dark:text-cyan-100">normal: {metrics?.normalPriorityJobs ?? 0} · low: {metrics?.lowPriorityJobs ?? 0} · avg attempts: {metrics?.avgAttempts ?? 0}</p> {/* 优先级分布补充。 */}
      <div className="mt-2 grid grid-cols-2 gap-2"> {/* 创建任务按钮区域。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("workflow", 10)} className={createJobButtonClass}>High Chat P10</button> {/* 创建高优先级 workflow 任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("retrieval", 5)} className={createJobButtonClass}>Normal Retrieval P5</button> {/* 创建普通优先级 retrieval 任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("embedding", 1)} className={createJobButtonClass}>Low Embedding P1</button> {/* 创建低优先级 embedding 任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("reminder", 10, 30000)} className={createJobButtonClass}>Reminder +30s</button> {/* 创建 30 秒后提醒任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("unstable", 5)} className={createJobButtonClass}>Unstable Retry</button> {/* 创建不稳定重试任务。 */}
        <button type="button" disabled={queueLoading} onClick={() => create("alwaysFail", 5)} className={createJobButtonClass}>AlwaysFail DLQ</button> {/* 创建必定失败死信任务。 */}
      </div> {/* 结束创建任务按钮区域。 */}
      <div className="mt-3 overflow-hidden rounded-lg border border-cyan-200/70 dark:border-cyan-900/40"> {/* 任务表格外框。 */}
        <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.8fr_0.65fr] bg-cyan-50/80 px-2 py-1 font-mono text-[9px] text-cyan-900 dark:bg-cyan-950/25 dark:text-cyan-100"> {/* 表头。 */}
          <span>Job</span> {/* Job 表头。 */}
          <span>Type</span> {/* Type 表头。 */}
          <span>Priority</span> {/* Priority 表头。 */}
          <span>Schedule</span> {/* Schedule 表头。 */}
          <span>Status</span> {/* Status 表头。 */}
          <span>Wait</span> {/* Wait 表头。 */}
        </div> {/* 结束表头。 */}
        <ul className="max-h-44 overflow-y-auto"> {/* 任务列表。 */}
          {jobs.length === 0 ? ( // 判断是否暂无任务。
            <li className="px-2 py-3 text-center text-[11px] text-zinc-400">暂无任务；点击上方按钮创建 Day 33 Job。</li> // 空状态。
          ) : ( // 有任务时渲染列表。
            jobs.map((job) => ( // 遍历任务。
              <li key={job.id} className="grid grid-cols-[1fr_0.7fr_0.8fr_0.7fr_0.8fr_0.65fr] items-center gap-1 border-t border-cyan-100 px-2 py-1.5 text-[10px] dark:border-cyan-900/30"> {/* 单行任务。 */}
                <span className="truncate font-mono" title={job.id}>{job.id}</span> {/* 任务 ID。 */}
                <span className="truncate">{job.type}</span> {/* 任务类型。 */}
                <span className="truncate font-mono">{priorityLabel(job.priority)}</span> {/* 任务优先级。 */}
                <span className="truncate font-mono">{formatScheduledAt(job)}</span> {/* 计划执行时间。 */}
                <span className={`inline-flex w-fit rounded-full px-1.5 py-0.5 font-semibold ring-1 ${statusClass(job.status)}`}>{job.status}</span> {/* 任务状态。 */}
                <span className="font-mono">{formatWait(job)}</span> {/* 等待时长。 */}
              </li> // 结束单行任务。
            )) // 结束任务遍历。
          )} {/* 结束条件渲染。 */}
        </ul> {/* 结束任务列表。 */}
      </div> {/* 结束任务表格外框。 */}
      {deadLetterJobs.length ? ( // 判断是否存在死信任务。
        <div className="mt-3 rounded-lg border border-red-200/80 bg-red-50/60 px-2 py-2 dark:border-red-900/50 dark:bg-red-950/20"> {/* 死信任务区域。 */}
          <h3 className="text-xs font-semibold text-red-950 dark:text-red-100">Dead Letter Jobs</h3> {/* 死信标题。 */}
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto"> {/* 死信任务列表。 */}
            {deadLetterJobs.map((job) => ( // 遍历死信任务。
              <li key={job.id} className="rounded border border-red-200/80 bg-white/70 px-2 py-1.5 text-[10px] dark:border-red-900/50 dark:bg-zinc-950/30"> {/* 单个死信任务。 */}
                <div className="flex items-center justify-between gap-2"> {/* 死信任务头部。 */}
                  <span className="truncate font-mono text-red-950 dark:text-red-100" title={job.id}>{job.id}</span> {/* 死信任务 ID。 */}
                  <button type="button" disabled={queueLoading} onClick={() => void handleRequeueQueueJob(job.id)} className={requeueButtonClass}>Requeue</button> {/* 重新入队按钮。 */}
                </div> {/* 结束死信任务头部。 */}
                <p className="mt-1 break-words text-red-800 dark:text-red-200">type: {job.type} · priority: {job.priority} · attempts: {job.attempts}/{job.maxAttempts}</p> {/* 死信摘要。 */}
                <p className="mt-0.5 break-words font-mono text-[9px] text-red-700 dark:text-red-300">last error: {job.error ?? DASH}</p> {/* 最后错误。 */}
              </li> // 结束单个死信任务。
            ))} {/* 结束死信遍历。 */}
          </ul> {/* 结束死信任务列表。 */}
        </div> // 结束死信任务区域。
      ) : null} {/* 结束死信判断。 */}
      {latestJob ? ( // 判断是否有最新任务。
        <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/60 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 时间线卡片。 */}
          <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Scheduler Timeline · {latestJob.id}</h3> {/* 时间线标题。 */}
          <p className="mt-1 font-mono text-[10px] text-cyan-800 dark:text-cyan-200">duration: {formatDuration(latestJob)} · priority: {latestJob.priority} · attempts: {latestJob.attempts}/{latestJob.maxAttempts}</p> {/* 最新任务摘要。 */}
          <ol className="mt-2 space-y-1"> {/* 时间线列表。 */}
            {latestJob.timeline.map((item) => ( // 遍历时间线节点。
              <li key={`${item.label}-${item.at}`} className="rounded border border-cyan-100 bg-cyan-50/60 px-2 py-1 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 时间线节点。 */}
                <p className="font-semibold text-cyan-950 dark:text-cyan-100">{item.label} · {new Date(item.at).toLocaleString("zh-CN")}</p> {/* 节点标题。 */}
                <p className="text-cyan-800/90 dark:text-cyan-200/90">{item.note}</p> {/* 节点说明。 */}
              </li> // 结束时间线节点。
            ))} {/* 结束时间线遍历。 */}
          </ol> {/* 结束时间线列表。 */}
        </div> // 结束时间线卡片。
      ) : null} {/* 结束最新任务判断。 */}
    </div> // 结束队列看板容器。
  ); // 结束 UI 返回。
} // 结束 QueueDashboard 组件。
