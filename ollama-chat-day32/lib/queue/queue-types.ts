export type JobStatus = "queued" | "running" | "success" | "failed" | "retrying" | "dead_letter"; // 定义第32天任务状态：排队、执行、成功、历史失败、等待重试、死信
export type JobType = "workflow" | "retrieval" | "embedding" | "reindex" | "unstable" | "alwaysFail"; // 定义第32天支持的任务类型，新增不稳定任务与必定失败任务

export type RetryBackoff = "fixed" | "exponential"; // 定义重试退避策略类型：固定延迟或指数退避

export type RetryPolicy = { // 定义重试策略结构
  maxAttempts: number; // 最大允许尝试次数
  baseDelayMs: number; // 基础延迟毫秒数
  backoff: RetryBackoff; // 当前退避模式
}; // RetryPolicy 类型结束

export type JobTimelineItem = { // 定义任务时间线条目类型
  label: "Created" | "Started" | "Completed" | "Failed" | "RetryScheduled" | "DeadLetter" | "Requeued"; // 定义时间线节点名称
  at: number; // 记录节点发生时间戳
  note: string; // 记录节点中文说明
}; // JobTimelineItem 类型结束

export type Job = { // 定义后台任务结构
  id: string; // 任务唯一 ID
  type: JobType; // 任务类型
  payload: Record<string, unknown>; // 任务输入载荷
  status: JobStatus; // 当前任务状态
  attempts: number; // 当前已经尝试执行的次数
  maxAttempts: number; // 最大允许尝试执行次数
  nextRunAt?: number; // 下一次可执行时间戳，用于 backoff 调度
  result?: Record<string, unknown>; // 成功结果
  error?: string; // 最近一次失败错误
  createdAt: number; // 创建时间
  startedAt?: number; // 最近一次开始时间
  completedAt?: number; // 最终完成时间或进入死信时间
  updatedAt: number; // 最近一次更新时间
  timeline: JobTimelineItem[]; // 任务生命周期时间线
}; // Job 类型结束

export type JobStoreSnapshot = { // 定义 JobStore 对外快照
  jobs: Job[]; // 全部任务列表
  metrics: QueueMetrics; // 队列指标
}; // JobStoreSnapshot 类型结束

export type QueueMetrics = { // 定义第32天队列指标
  queuedJobs: number; // 排队中任务数
  runningJobs: number; // 执行中任务数
  retryingJobs: number; // 等待重试任务数
  deadLetterJobs: number; // 死信任务数
  successJobs: number; // 成功任务数
  failedJobs: number; // 历史失败任务数
  avgDuration: number; // 成功任务平均执行耗时毫秒数
  avgAttempts: number; // 平均尝试次数
  retryRate: number; // 发生过重试的任务比例
  deadLetterRate: number; // 进入死信队列的任务比例
}; // QueueMetrics 类型结束

export type CreateJobInput = { // 定义创建任务输入
  type: JobType; // 用户选择的任务类型
  payload?: Record<string, unknown>; // 可选任务载荷
  retryPolicy?: Partial<RetryPolicy>; // 可选重试策略覆盖项
}; // CreateJobInput 类型结束

export interface JobStore { // 定义任务存储接口
  create(job: Job): Promise<Job>; // 创建任务
  get(id: string): Promise<Job | null>; // 按 ID 读取任务
  update(job: Job): Promise<Job>; // 更新任务
  list(): Promise<Job[]>; // 列出全部任务
} // JobStore 接口结束
