export type JobStatus = "queued" | "running" | "success" | "failed" | "retrying" | "dead_letter"; // 定义任务状态，保留第32天 retry 与 dead letter 能力。

export type JobType = "workflow" | "retrieval" | "embedding" | "reindex" | "unstable" | "alwaysFail" | "reminder"; // 定义第33天支持的任务类型，新增 reminder 定时提醒任务。

export type RetryBackoff = "fixed" | "exponential"; // 定义重试退避策略类型：固定延迟或指数退避。

export type RetryPolicy = { // 定义重试策略结构。
  maxAttempts: number; // 定义最大允许尝试次数。
  baseDelayMs: number; // 定义基础退避延迟毫秒数。
  backoff: RetryBackoff; // 定义当前退避模式。
}; // 结束 RetryPolicy 类型。

export type JobTimelineItem = { // 定义任务时间线条目类型。
  label: "Created" | "Scheduled" | "Started" | "Completed" | "Failed" | "RetryScheduled" | "DeadLetter" | "Requeued"; // 定义第33天时间线节点，加入 Scheduled 调度节点。
  at: number; // 记录节点发生的时间戳。
  note: string; // 记录节点的中文说明。
}; // 结束 JobTimelineItem 类型。

export type Job = { // 定义后台任务结构。
  id: string; // 记录任务唯一 ID。
  type: JobType; // 记录任务类型。
  payload: Record<string, unknown>; // 记录任务输入载荷。
  priority: number; // 第33天：记录任务优先级，数字越大越先执行。
  scheduledAt?: number; // 第33天：记录计划执行时间戳，未来时间表示定时任务。
  status: JobStatus; // 记录当前任务状态。
  attempts: number; // 记录已经尝试执行的次数。
  maxAttempts: number; // 记录最大允许尝试次数。
  nextRunAt?: number; // 记录下一次可运行时间戳，用于 retry backoff。
  result?: Record<string, unknown>; // 记录成功结果。
  error?: string; // 记录最近一次失败错误。
  createdAt: number; // 记录创建时间。
  startedAt?: number; // 记录最近一次开始时间。
  completedAt?: number; // 记录完成时间或进入死信时间。
  updatedAt: number; // 记录最近一次更新时间。
  timeline: JobTimelineItem[]; // 记录任务生命周期时间线。
}; // 结束 Job 类型。

export type JobStoreSnapshot = { // 定义 JobStore 对外快照。
  jobs: Job[]; // 返回全部任务列表。
  metrics: QueueMetrics; // 返回队列指标。
}; // 结束 JobStoreSnapshot 类型。

export type QueueMetrics = { // 定义第33天队列指标。
  queuedJobs: number; // 统计排队任务数量。
  runningJobs: number; // 统计执行中任务数量。
  retryingJobs: number; // 统计等待重试任务数量。
  deadLetterJobs: number; // 统计死信任务数量。
  successJobs: number; // 统计成功任务数量。
  failedJobs: number; // 统计历史失败任务数量。
  avgDuration: number; // 统计成功任务平均执行耗时毫秒数。
  avgAttempts: number; // 统计平均尝试次数。
  retryRate: number; // 统计发生过重试的任务比例。
  deadLetterRate: number; // 统计进入死信队列的任务比例。
  highPriorityJobs: number; // 第33天：统计高优先级任务数量。
  normalPriorityJobs: number; // 第33天：统计普通优先级任务数量。
  lowPriorityJobs: number; // 第33天：统计低优先级任务数量。
  scheduledJobs: number; // 第33天：统计未来定时任务数量。
}; // 结束 QueueMetrics 类型。

export type CreateJobInput = { // 定义创建任务输入。
  type: JobType; // 记录用户选择的任务类型。
  payload?: Record<string, unknown>; // 记录可选任务载荷。
  priority?: number; // 第33天：记录可选优先级，默认普通优先级 5。
  scheduledAt?: number; // 第33天：记录可选计划执行时间戳。
  scheduledDelayMs?: number; // 第33天：记录可选延迟毫秒数，服务端会换算为 scheduledAt。
  retryPolicy?: Partial<RetryPolicy>; // 记录可选重试策略覆盖项。
}; // 结束 CreateJobInput 类型。

export interface JobStore { // 定义任务存储接口。
  create(job: Job): Promise<Job>; // 创建任务。
  get(id: string): Promise<Job | null>; // 按 ID 读取任务。
  update(job: Job): Promise<Job>; // 更新任务。
  list(): Promise<Job[]>; // 列出全部任务。
} // 结束 JobStore 接口。
