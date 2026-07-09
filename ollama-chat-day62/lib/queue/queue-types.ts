import type { Memory, Workflow } from "@/lib/workflow/workflow-types"; // 第37天：引入 Workflow 与 Memory 类型，用于描述 WorkflowJob 载荷。
export type JobStatus = "queued" | "running" | "success" | "failed" | "retrying" | "dead_letter" | "cancelling" | "cancelled" | "timeout"; // 定义第37天任务状态，继承取消中、已取消和超时状态。
export type JobType = "workflow" | "retrieval" | "embedding" | "reindex" | "unstable" | "alwaysFail" | "reminder" | "chat"; // 定义教学项目支持的任务类型，并为第35天补充 chat 类型。
export type RetryBackoff = "fixed" | "exponential"; // 定义重试退避策略类型，支持固定退避和指数退避。
export type WorkerStatus = "idle" | "running" | "stopped"; // 定义 Worker 当前状态，便于看板观察工作池。
export type ResourceType = "llm" | "embedding" | "database" | "workflow" | "tool"; // 第35天：定义资源类型，用于资源并发限制和速率限制。
export type BlockedReason = "resource_limit" | "rate_limit"; // 第35天：定义任务暂时不能运行时的阻塞原因。
export type RetryPolicy = { // 定义重试策略结构。
  maxAttempts: number; // 记录最大允许尝试次数。
  baseDelayMs: number; // 记录基础退避延迟毫秒数。
  backoff: RetryBackoff; // 记录当前退避模式。
}; // 结束 RetryPolicy 类型。
export type JobTimelineItem = { // 定义任务生命周期时间线条目。
  label: "Created" | "Scheduled" | "Claimed" | "Started" | "Completed" | "Failed" | "RetryScheduled" | "DeadLetter" | "Requeued" | "StaleRecovered" | "Blocked" | "CancelRequested" | "Cancelled" | "Timeout" | "GracefulShutdownStarted" | "WorkerStopped" | "WorkflowQueued" | "WorkflowStarted" | "WorkflowPaused" | "WorkflowSuccess" | "WorkflowFailed" | "WorkflowCancelled"; // 第37天：补充 WorkflowJob 与 Workflow 状态同步节点。
  at: number; // 记录节点发生的时间戳。
  note: string; // 记录节点的中文说明。
}; // 结束 JobTimelineItem 类型。
export type WorkflowJobPayload = { // 第37天：定义 Workflow as Job 的任务载荷。
  workflowId: string; // 记录要由 Worker 执行的工作流 ID。
  workflow: Workflow; // 保存完整工作流快照，Worker 领取 Job 后从这里恢复执行。
  memory: Memory; // 保存创建 Job 时的记忆快照，供工作流步骤调用模型或工具。
  provider?: "local" | "mimo"; // 保存模型提供方，Worker 执行时恢复同一模型路由。
  mimoModel?: string; // 保存 MiMo 模型 ID，仅 provider 为 mimo 时使用。
}; // 结束 WorkflowJobPayload 类型。
export type Job = { // 定义后台任务结构。
  id: string; // 记录任务唯一 ID。
  type: JobType; // 记录任务类型。
  workflowId?: string; // 第37天：可选关联工作流 ID，用于 Job 与 Workflow 双向跳转。
  resourceType?: ResourceType; // 第35天：记录任务消耗的资源类型，缺省时由任务类型推断。
  blockedReason?: BlockedReason; // 第35天：记录任务最近一次被资源或速率限制挡住的原因。
  payload: Record<string, unknown>; // 记录任务输入载荷。
  timeoutMs?: number; // 第36天：记录单个任务的超时阈值，缺省由运行时使用 30000ms。
  cancelRequestedAt?: number; // 第36天：记录用户请求取消任务的时间戳。
  cancelledAt?: number; // 第36天：记录任务实际完成取消的时间戳。
  timeoutAt?: number; // 第36天：记录任务发生超时的时间戳。
  priority: number; // 记录任务优先级，数字越大越先执行。
  scheduledAt?: number; // 记录计划执行时间戳，未来时间表示定时任务。
  workerId?: string; // 记录认领当前任务的 Worker ID。
  lockedAt?: number; // 记录任务被 Worker 锁定的时间戳。
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
export type WorkerInfo = { // 定义 Worker 信息结构。
  id: string; // 记录 Worker 唯一 ID。
  status: WorkerStatus; // 记录 Worker 当前状态。
  currentJobId?: string; // 记录 Worker 当前正在处理的任务 ID。
  startedAt: number; // 记录 Worker 启动时间。
  lastHeartbeatAt: number; // 记录 Worker 最近心跳时间。
  processedJobs: number; // 记录 Worker 已成功处理任务数量。
  failedJobs: number; // 记录 Worker 处理失败任务数量。
}; // 结束 WorkerInfo 类型。
export type ResourceUsageItem = { // 第35天：定义单个资源的占用快照。
  resourceType: ResourceType; // 记录资源类型。
  active: number; // 记录当前正在占用该资源的任务数。
  limit: number | "Infinity"; // 记录该资源允许的最大并发数。
}; // 结束 ResourceUsageItem 类型。
export type RateLimitUsageItem = { // 第35天：定义单个资源的速率窗口快照。
  resourceType: ResourceType; // 记录资源类型。
  used: number; // 记录当前时间窗口内已经放行的次数。
  limit: number | "Infinity"; // 记录该资源当前时间窗口允许的最大次数。
  windowMs: number; // 记录速率限制窗口毫秒数。
}; // 结束 RateLimitUsageItem 类型。
export type RateLimitMetrics = { // 第35天：定义资源限制与速率限制指标。
  allowedCount: number; // 记录被允许认领的次数。
  blockedCount: number; // 记录被限制器挡住的总次数。
  blockedByResource: Record<string, number>; // 按资源类型记录被资源并发限制挡住的次数。
  blockedByRate: Record<string, number>; // 按资源类型记录被速率限制挡住的次数。
}; // 结束 RateLimitMetrics 类型。
export type QueueBucketName = "waiting" | "processing" | "completed" | "deadLetter"; // 第59天：定义 Redis Queue Explorer 展示的四个队列桶。
export type QueueOperationName = "enqueue" | "dequeue" | "ack" | "retry" | "fail" | "delete" | "recover" | "peek"; // 第59天：定义 Queue Trace（队列追踪）记录的业务操作名称。
export type QueueOperationTrace = { // 第59天：定义单次 Queue Operation（队列操作）追踪结构。
  id: string; // 第59天：保存队列操作追踪唯一 ID。
  operation: QueueOperationName; // 第59天：保存队列操作名称。
  jobId?: string; // 第59天：保存本次操作涉及的 Job ID。
  workerId?: string; // 第59天：保存本次操作涉及的 Worker ID。
  bucket?: QueueBucketName; // 第59天：保存本次操作涉及的队列桶。
  status: "success" | "failed"; // 第59天：保存队列操作是否成功。
  note: string; // 第59天：保存中文可读说明，方便 Queue Explorer 排查。
  latencyMs: number; // 第59天：保存本次队列操作耗时毫秒数。
  createdAt: number; // 第59天：保存队列操作发生时间。
}; // 第59天：结束队列操作追踪结构。
export type RedisQueueMetrics = { // 第59天：定义 Redis Queue Metrics（Redis 队列指标）。
  waiting: number; // 第59天：统计等待队列中的任务数量。
  processing: number; // 第59天：统计处理中队列中的任务数量。
  completed: number; // 第59天：统计完成队列中的任务数量。
  failed: number; // 第59天：统计死信或最终失败队列中的任务数量。
  avgWaitTime: number; // 第59天：统计平均等待时间毫秒数。
  avgProcessingTime: number; // 第59天：统计平均处理时间毫秒数。
}; // 第59天：结束 Redis 队列指标类型。
export type QueueBucketSnapshot = { // 第59天：定义单个队列桶的展示快照。
  name: QueueBucketName; // 第59天：保存队列桶名称。
  jobs: Job[]; // 第59天：保存该队列桶内的 Job 摘要列表。
}; // 第59天：结束队列桶快照类型。
export type RedisQueueExplorerSnapshot = { // 第59天：定义 Queue Explorer（队列浏览器）完整快照。
  backend: "redis-list"; // 第59天：标记当前队列后端为 Redis List。
  namespace: string; // 第59天：保存 Redis 命名空间，方便确认数据隔离。
  keys: Record<QueueBucketName, string>; // 第59天：保存四个 Redis List 的逻辑 Key。
  buckets: QueueBucketSnapshot[]; // 第59天：保存 Waiting、Processing、Completed 和 Dead Letter 四个队列桶。
  metrics: RedisQueueMetrics; // 第59天：保存队列指标。
  operations: QueueOperationTrace[]; // 第59天：保存最近队列操作追踪。
  generatedAt: number; // 第59天：保存快照生成时间。
}; // 第59天：结束 Queue Explorer 快照类型。
export interface QueueStore { // 第59天：定义队列存储接口，用于统一 Memory Queue 与 Redis Queue 的行为边界。
  enqueue(job: Job): Promise<Job>; // 第59天：把 Job 放入等待队列。
  dequeue(workerId: string, now?: number): Promise<Job | null>; // 第59天：由 Worker 领取一个可运行 Job，并移动到 Processing Queue。
  peek(now?: number): Promise<Job | null>; // 第59天：查看下一个可运行 Job，但不移除它。
  size(): Promise<number>; // 第59天：读取等待队列长度。
  ack(job: Job): Promise<boolean>; // 第59天：Worker 成功后确认 Job，移出 Processing 并归档到 Completed。
  retry(job: Job): Promise<Job>; // 第59天：失败但可重试时把 Job 从 Processing 放回 Waiting。
  fail(job: Job): Promise<Job>; // 第59天：最终失败、取消或超时时把 Job 从 Processing 归档到 Dead Letter。
  remove(jobId: string): Promise<boolean>; // 第59天：从所有 Redis 队列桶中删除指定 Job。
  recoverExpired(now?: number): Promise<Job[]>; // 第59天：恢复超过 Visibility Timeout 的 Processing Job。
  snapshot(): Promise<RedisQueueExplorerSnapshot>; // 第59天：读取 Queue Explorer 完整快照。
} // 第59天：结束 QueueStore 接口。
export type WorkerPoolMetrics = { // 定义 WorkerPool 并发指标。
  concurrency: number; // 记录配置的并发 Worker 数量。
  activeWorkers: number; // 统计正在工作的 Worker 数量。
  idleWorkers: number; // 统计空闲 Worker 数量。
  runningJobs: number; // 统计正在执行的任务数量。
  throughputPerMinute: number; // 统计最近每分钟吞吐量。
  avgJobDuration: number; // 统计成功任务平均耗时毫秒数。
}; // 结束 WorkerPoolMetrics 类型。
export type WorkerPoolSnapshot = { // 定义 WorkerPool 对外快照。
  workers: WorkerInfo[]; // 返回全部 Worker 状态。
  metrics: WorkerPoolMetrics; // 返回并发指标。
}; // 结束 WorkerPoolSnapshot 类型。
export type QueueMetrics = { // 定义队列指标。
  queuedJobs: number; // 统计排队任务数量。
  runningJobs: number; // 统计执行中任务数量。
  retryingJobs: number; // 统计等待重试任务数量。
  deadLetterJobs: number; // 统计死信任务数量。
  successJobs: number; // 统计成功任务数量。
  failedJobs: number; // 统计历史失败任务数量。
  cancellingJobs: number; // 第36天：统计正在协作取消的任务数量。
  cancelledJobs: number; // 第36天：统计已经取消的任务数量。
  timeoutJobs: number; // 第36天：统计发生过超时或当前处于超时状态的任务数量。
  avgDuration: number; // 统计成功任务平均执行耗时毫秒数。
  avgAttempts: number; // 统计平均尝试次数。
  retryRate: number; // 统计发生过重试的任务比例。
  deadLetterRate: number; // 统计进入死信队列的任务比例。
  highPriorityJobs: number; // 统计高优先级任务数量。
  normalPriorityJobs: number; // 统计普通优先级任务数量。
  lowPriorityJobs: number; // 统计低优先级任务数量。
  scheduledJobs: number; // 统计未来定时任务数量。
}; // 结束 QueueMetrics 类型。
export type JobStoreSnapshot = { // 定义 JobStore 对外快照。
  jobs: Job[]; // 返回全部任务列表。
  metrics: QueueMetrics; // 返回队列指标。
  redisQueue?: RedisQueueExplorerSnapshot; // 第59天：返回 Redis Queue Explorer 快照。
  redisQueueMetrics?: RedisQueueMetrics; // 第59天：返回 Redis Queue Metrics 便于前端直接展示。
  queueOperations?: QueueOperationTrace[]; // 第59天：返回最近 Queue Operation Trace。
  workerPool?: WorkerPoolSnapshot; // 返回 WorkerPool 快照。
  resourceUsage?: ResourceUsageItem[]; // 第35天：返回资源并发占用快照。
  rateLimitUsage?: RateLimitUsageItem[]; // 第35天：返回速率窗口占用快照。
  rateLimitMetrics?: RateLimitMetrics; // 第35天：返回资源限制与速率限制指标。
}; // 结束 JobStoreSnapshot 类型。
export type CreateJobInput = { // 定义创建任务输入。
  type: JobType; // 记录用户选择的任务类型。
  resourceType?: ResourceType; // 第35天：允许调用方显式指定资源类型。
  payload?: Record<string, unknown>; // 记录可选任务载荷。
  priority?: number; // 记录可选优先级，默认普通优先级 5。
  scheduledAt?: number; // 记录可选计划执行时间戳。
  scheduledDelayMs?: number; // 记录可选延迟毫秒数，服务端会换算为 scheduledAt。
  retryPolicy?: Partial<RetryPolicy>; // 记录可选重试策略覆盖项。
  timeoutMs?: number; // 第36天：允许创建任务时传入自定义超时时间。
}; // 结束 CreateJobInput 类型。
export interface JobStore { // 定义任务存储接口。
  create(job: Job): Promise<Job>; // 创建任务。
  get(id: string): Promise<Job | null>; // 按 ID 读取任务。
  update(job: Job): Promise<Job>; // 更新任务。
  delete(id: string): Promise<boolean>; // 第59天：删除任务持久化记录，配合 Queue Explorer 的 Delete 动作。
  list(): Promise<Job[]>; // 列出全部任务。
} // 结束 JobStore 接口。
