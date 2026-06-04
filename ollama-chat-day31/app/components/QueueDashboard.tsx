"use client"; // 当前组件包含按钮、轮询和动态状态，需要客户端渲染

import { useRef } from "react"; // 引入 useRef 保存点击防抖时间戳
import type { Job, JobType, QueueMetrics } from "@/lib/queue/queue-types"; // 引入队列任务与指标类型

const CREATE_JOB_DEBOUNCE_MS = 700; // 定义创建任务按钮防抖间隔，避免连续点击重复创建
const createJobButtonClass = "rounded-lg border border-fuchsia-500 bg-fuchsia-600 px-2 py-1.5 text-xs font-semibold text-white shadow-sm shadow-fuchsia-950/10 transition hover:border-fuchsia-600 hover:bg-fuchsia-700 hover:shadow-md hover:shadow-fuchsia-950/15 active:scale-[0.98] active:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-fuchsia-500 dark:bg-fuchsia-600 dark:hover:bg-fuchsia-500 dark:active:bg-fuchsia-700"; // 定义四个创建任务按钮的统一样式

type QueueDashboardProps = { // 定义队列看板组件参数
  jobs: Job[]; // 任务列表
  metrics: QueueMetrics | null; // 队列指标
  queueLoading: boolean; // 队列 API 加载状态
  handleCreateQueueJob: (type: JobType) => Promise<void>; // 创建任务回调
}; // QueueDashboardProps 类型结束

function formatDuration(job: Job): string { // 定义任务耗时格式化函数
  if (!job.startedAt) return "未开始"; // 没有开始时间时返回未开始
  const end = job.completedAt ?? Date.now(); // 有完成时间用完成时间，否则用当前时间
  return `${Math.max(0, end - job.startedAt)}ms`; // 返回毫秒耗时
} // formatDuration 函数结束

function statusClass(status: Job["status"]): string { // 定义状态样式函数
  if (status === "queued") return "bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:text-sky-200"; // 返回排队状态样式
  if (status === "running") return "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:text-amber-200"; // 返回执行状态样式
  if (status === "success") return "bg-emerald-500/15 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200"; // 返回成功状态样式
  return "bg-red-500/15 text-red-800 ring-red-500/25 dark:text-red-200"; // 返回失败状态样式
} // statusClass 函数结束

export function QueueDashboard({ // 导出队列看板组件
  jobs, // 接收任务列表
  metrics, // 接收队列指标
  queueLoading, // 接收加载状态
  handleCreateQueueJob, // 接收创建任务回调
}: QueueDashboardProps) { // 组件参数结束
  const latestJob = jobs[0] ?? null; // 取最新任务用于时间线展示
  const lastCreateClickAtRef = useRef(0); // 保存上一次创建任务点击时间
  const handleDebouncedCreateJob = (type: JobType) => { // 定义带防抖的创建任务入口
    const now = Date.now(); // 获取当前时间
    if (now - lastCreateClickAtRef.current < CREATE_JOB_DEBOUNCE_MS) return; // 防抖窗口内忽略重复点击
    lastCreateClickAtRef.current = now; // 记录本次点击时间
    void handleCreateQueueJob(type); // 调用父组件创建任务逻辑
  }; // handleDebouncedCreateJob 函数结束
  return ( // 返回队列看板 UI
    <div className="shrink-0 border-b border-fuchsia-200/70 px-4 py-3 dark:border-fuchsia-900/40"> {/* 队列看板容器 */}
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Queue Dashboard</h2> {/* 看板标题 */}
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"> {/* 看板说明 */}
        第31天：Local Queue + JobStore + Worker，观察 queued → running → success / failed 的异步状态流转。 {/* 说明文字 */}
      </p> {/* 看板说明结束 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"> {/* 指标网格 */}
        <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-2 py-1.5 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20">queued: {metrics?.queuedJobs ?? 0}</div> {/* 排队指标 */}
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">running: {metrics?.runningJobs ?? 0}</div> {/* 执行指标 */}
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">success: {metrics?.completedJobs ?? 0}</div> {/* 成功指标 */}
        <div className="rounded-lg border border-red-200/70 bg-red-50/60 px-2 py-1.5 dark:border-red-900/40 dark:bg-red-950/20">failed: {metrics?.failedJobs ?? 0}</div> {/* 失败指标 */}
      </div> {/* 指标网格结束 */}
      <p className="mt-2 font-mono text-[10px] text-fuchsia-900 dark:text-fuchsia-100">avg duration: {metrics?.avgDuration ?? 0}ms</p> {/* 平均耗时 */}
      <div className="mt-2 grid grid-cols-2 gap-2"> {/* 创建任务按钮区域 */}
        <button type="button" disabled={queueLoading} onClick={() => handleDebouncedCreateJob("embedding")} className={createJobButtonClass}>Embedding 长任务</button> {/* 创建 embedding 任务 */}
        <button type="button" disabled={queueLoading} onClick={() => handleDebouncedCreateJob("workflow")} className={createJobButtonClass}>Workflow 任务</button> {/* 创建 workflow 任务 */}
        <button type="button" disabled={queueLoading} onClick={() => handleDebouncedCreateJob("retrieval")} className={createJobButtonClass}>Retrieval 任务</button> {/* 创建 retrieval 任务 */}
        <button type="button" disabled={queueLoading} onClick={() => handleDebouncedCreateJob("reindex")} className={createJobButtonClass}>Reindex 任务</button> {/* 创建 reindex 任务 */}
      </div> {/* 创建任务按钮区域结束 */}
      <div className="mt-3 overflow-hidden rounded-lg border border-fuchsia-200/70 dark:border-fuchsia-900/40"> {/* 任务表格外框 */}
        <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr] bg-fuchsia-50/80 px-2 py-1 font-mono text-[9px] text-fuchsia-900 dark:bg-fuchsia-950/25 dark:text-fuchsia-100"> {/* 表头 */}
          <span>Job ID</span> {/* Job ID 表头 */}
          <span>Type</span> {/* Type 表头 */}
          <span>Status</span> {/* Status 表头 */}
          <span>Duration</span> {/* Duration 表头 */}
        </div> {/* 表头结束 */}
        <ul className="max-h-44 overflow-y-auto"> {/* 任务列表 */}
          {jobs.length === 0 ? ( // 判断是否暂无任务
            <li className="px-2 py-3 text-center text-[11px] text-zinc-400">暂无任务；点击上方按钮创建 Job。</li> // 空状态
          ) : ( // 有任务时渲染列表
            jobs.map((job) => ( // 遍历任务
              <li key={job.id} className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr] items-center gap-1 border-t border-fuchsia-100 px-2 py-1.5 text-[10px] dark:border-fuchsia-900/30"> {/* 单行任务 */}
                <span className="truncate font-mono" title={job.id}>{job.id}</span> {/* 任务 ID */}
                <span className="truncate">{job.type}</span> {/* 任务类型 */}
                <span className={`inline-flex w-fit rounded-full px-1.5 py-0.5 font-semibold ring-1 ${statusClass(job.status)}`}>{job.status}</span> {/* 任务状态 */}
                <span className="font-mono">{formatDuration(job)}</span> {/* 任务耗时 */}
              </li> // 单行任务结束
            )) // 遍历任务结束
          )} {/* 条件渲染结束 */}
        </ul> {/* 任务列表结束 */}
      </div> {/* 任务表格外框结束 */}
      {latestJob ? ( // 判断是否有最新任务
        <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/60 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 时间线卡片 */}
          <h3 className="text-xs font-semibold text-fuchsia-950 dark:text-fuchsia-100">Job Timeline · {latestJob.id}</h3> {/* 时间线标题 */}
          <ol className="mt-2 space-y-1"> {/* 时间线列表 */}
            {latestJob.timeline.map((item) => ( // 遍历时间线节点
              <li key={`${item.label}-${item.at}`} className="rounded border border-fuchsia-100 bg-fuchsia-50/60 px-2 py-1 text-[10px] dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 时间线节点 */}
                <p className="font-semibold text-fuchsia-950 dark:text-fuchsia-100">{item.label} · {new Date(item.at).toLocaleString("zh-CN")}</p> {/* 节点标题 */}
                <p className="text-fuchsia-800/90 dark:text-fuchsia-200/90">{item.note}</p> {/* 节点说明 */}
              </li> // 时间线节点结束
            ))} {/* 时间线遍历结束 */}
          </ol> {/* 时间线列表结束 */}
        </div> // 时间线卡片结束
      ) : null} {/* 最新任务判断结束 */}
    </div> // 队列看板容器结束
  ); // 返回 UI 结束
} // QueueDashboard 组件结束
