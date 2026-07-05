import { LocalFileJobStore, calculateQueueMetrics } from "@/lib/queue/job-store"; // 引入本地文件存储与指标计算。
import { RedisQueueStore } from "@/lib/queue/redis-queue-store"; // 第59天：引入 RedisQueueStore，把等待队列、处理中队列、完成队列和死信队列写入 Redis。
import { LimitMetricsRecorder, RateLimiter, ResourceLimiter, inferResourceType } from "@/lib/queue/resource-limiters"; // 引入第35天资源限制、速率限制和资源推断。
import { QueueManager } from "@/lib/queue/queue-manager"; // 引入第35天队列管理器。
import type { CreateJobInput, Job, JobStoreSnapshot, JobTimelineItem, RetryPolicy } from "@/lib/queue/queue-types"; // 引入任务输入、快照、时间线和重试策略类型。
import { WorkerPool } from "@/lib/queue/worker-pool"; // 引入 WorkerPool。
import { getLockRuntime } from "@/lib/lock/lock-runtime"; // 第60天：引入 Redis Distributed Lock 运行时单例。

const NORMAL_PRIORITY = 5; // 定义普通优先级。
const DEFAULT_CONCURRENCY = 3; // 默认启动 3 个并发 Worker。
const STALE_LOCK_MS = 30 * 1000; // 定义 30 秒过期锁检测窗口。
const DEFAULT_TIMEOUT_MS = 30 * 1000; // 第36天：定义任务默认超时时间。
const defaultRetryPolicy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1000, backoff: "exponential" }; // 定义默认重试策略。

function createJobId(): string { // 定义任务 ID 生成函数。
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; // 使用时间戳加随机片段生成 ID。
} // 结束 createJobId。

function normalizePriority(priority: unknown): number { // 定义优先级归一化函数。
  const value = Number(priority); // 将输入转成数字。
  if (!Number.isFinite(value)) return NORMAL_PRIORITY; // 非数字时返回普通优先级。
  return Math.max(1, Math.min(10, Math.round(value))); // 将优先级限制在 1 到 10。
} // 结束 normalizePriority。

function resolveScheduledAt(input: CreateJobInput, now: number): number | undefined { // 定义计划执行时间解析函数。
  if (typeof input.scheduledAt === "number" && Number.isFinite(input.scheduledAt)) return input.scheduledAt; // 优先使用明确时间戳。
  if (typeof input.scheduledDelayMs === "number" && Number.isFinite(input.scheduledDelayMs)) return now + Math.max(0, input.scheduledDelayMs); // 将延迟毫秒数换算成时间戳。
  return undefined; // 没有定时参数时立即执行。
} // 结束 resolveScheduledAt。

function resolveTimeoutMs(timeoutMs: unknown): number { // 第36天：定义任务超时时间解析函数。
  const value = Number(timeoutMs); // 将输入转换为数字。
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS; // 非法输入使用默认 30 秒。
  return Math.max(500, Math.min(120000, Math.round(value))); // 将超时时间限制在 0.5 秒到 120 秒之间。
} // 结束 resolveTimeoutMs。

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 定义创建时间线节点的工具。
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点。
} // 结束 timeline。

function createJob(input: CreateJobInput): Job { // 定义任务对象创建函数。
  const now = Date.now(); // 获取当前时间戳。
  const policy: RetryPolicy = { ...defaultRetryPolicy, ...input.retryPolicy }; // 合并默认策略与输入覆盖项。
  const scheduledAt = resolveScheduledAt(input, now); // 解析计划执行时间。
  const priority = normalizePriority(input.priority); // 解析任务优先级。
  const draft = { type: input.type, resourceType: input.resourceType }; // 创建资源推断所需的轻量对象。
  const resourceType = inferResourceType(draft); // 第35天：推断任务资源类型。
  const timeoutMs = resolveTimeoutMs(input.timeoutMs); // 第36天：解析任务超时时间。
  const payloadWorkflowId = typeof input.payload?.workflowId === "string" ? input.payload.workflowId : undefined; // 第37天：从载荷中读取可选 workflowId。
  const items: JobTimelineItem[] = [timeline("Created", `用户请求已创建 Job，并进入 Queue Runtime V7 Workflow as Job 队列，资源类型为 ${resourceType}，超时时间为 ${timeoutMs}ms`)]; // 写入创建时间线。
  if (input.type === "workflow" && payloadWorkflowId) { // 第37天：判断是否创建 WorkflowJob。
    items.push(timeline("WorkflowQueued", `Workflow ${payloadWorkflowId} 已关联到当前 Job，等待 Worker 认领执行`)); // 记录 Workflow 入队节点。
  } // 结束 WorkflowJob 判断。
  if (typeof scheduledAt === "number" && scheduledAt > now) { // 判断是否为未来定时任务。
    items.push(timeline("Scheduled", `任务已调度到 ${new Date(scheduledAt).toLocaleString("zh-CN")} 后执行`)); // 写入 Scheduled 节点。
  } // 结束定时判断。
  return { // 返回新任务。
    id: createJobId(), // 写入任务 ID。
    type: input.type, // 写入任务类型。
    workflowId: payloadWorkflowId, // 第37天：写入 Job 与 Workflow 的关联 ID。
    resourceType, // 第35天：写入资源类型。
    payload: input.payload ?? {}, // 写入任务载荷。
    timeoutMs, // 第36天：写入任务超时时间。
    priority, // 写入优先级。
    scheduledAt, // 写入计划执行时间。
    status: "queued", // 初始状态为排队中。
    attempts: 0, // 初始尝试次数为 0。
    maxAttempts: policy.maxAttempts, // 写入最大尝试次数。
    createdAt: now, // 写入创建时间。
    updatedAt: now, // 写入更新时间。
    timeline: items, // 写入时间线。
  }; // 结束新任务对象。
} // 结束 createJob。

export class QueueRuntime { // 定义第35天队列运行时。
  private readonly store = new LocalFileJobStore(); // 创建本地文件 JobStore。
  private readonly queueStore = new RedisQueueStore(); // 第59天：创建 Redis List 队列存储。
  private readonly resourceLimiter = new ResourceLimiter(); // 创建资源并发限制器。
  private readonly rateLimiter = new RateLimiter(); // 创建速率限制器。
  private readonly limitMetrics = new LimitMetricsRecorder(); // 第60天：创建限制器指标记录器。
  private readonly lockProvider = getLockRuntime(); // 第60天：创建共享 Redis 分布式锁提供者。
  private readonly queue = new QueueManager(this.queueStore, this.resourceLimiter, this.rateLimiter, this.limitMetrics, (job) => void this.store.update(job)); // 第59天：创建基于 RedisQueueStore 的 QueueManager。
  private readonly workerPool = new WorkerPool(DEFAULT_CONCURRENCY, this.queue, this.store, defaultRetryPolicy, this.lockProvider); // 第60天：创建并发 WorkerPool，并把分布式锁注入每个 Worker。
  constructor() { // 定义运行时构造函数。
    this.workerPool.start(); // 启动 WorkerPool 轮询。
  } // 结束构造函数。
  async enqueue(input: CreateJobInput): Promise<JobStoreSnapshot & { created: Job }> { // 定义立即或定时入队并返回快照的方法。
    const job = createJob(input); // 创建 queued 任务。
    const created = await this.store.create(job); // 保存任务到 JobStore。
    await this.queue.enqueue(created); // 第59天：将任务放入 Redis Waiting Queue。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, created }; // 返回快照和新任务。
  } // 结束 enqueue。
  async scheduleJob(input: CreateJobInput, runAt: number): Promise<JobStoreSnapshot & { scheduled: Job }> { // 定义定时入队方法。
    const result = await this.enqueue({ ...input, scheduledAt: runAt }); // 复用 enqueue 并写入计划执行时间。
    return { ...result, scheduled: result.created }; // 返回 scheduled 别名方便调用方理解。
  } // 结束 scheduleJob。
  async requeue(jobId: string): Promise<JobStoreSnapshot & { requeued: Job }> { // 定义手动重新入队方法。
    const current = await this.store.get(jobId); // 从存储读取任务。
    if (!current) throw new Error("Job 不存在，无法重新入队"); // 未找到任务时抛错。
    if (current.status !== "dead_letter" && current.status !== "timeout") throw new Error("只有 dead_letter 或 timeout 任务可以手动重新入队"); // 非死信或超时任务不允许重新入队。
    const now = Date.now(); // 获取当前时间。
    const requeued: Job = { // 构造重新入队任务。
      ...current, // 继承原任务字段。
      resourceType: current.resourceType ?? inferResourceType(current), // 补齐资源类型。
      blockedReason: undefined, // 清空阻塞原因。
      cancelRequestedAt: undefined, // 第36天：清空旧取消请求时间。
      cancelledAt: undefined, // 第36天：清空旧取消完成时间。
      timeoutAt: undefined, // 第36天：清空旧超时时间。
      status: "queued", // 状态改回排队中。
      attempts: 0, // 重置尝试次数。
      error: undefined, // 清空错误。
      workerId: undefined, // 清空 Worker 归属。
      lockedAt: undefined, // 清空任务锁。
      nextRunAt: undefined, // 清空下一次运行时间。
      scheduledAt: undefined, // 手动恢复默认立即执行。
      startedAt: undefined, // 清空最近开始时间。
      completedAt: undefined, // 清空完成时间。
      updatedAt: now, // 写入更新时间。
      timeline: [...current.timeline, timeline("Requeued", "用户手动重新入队，任务将重新参与 V7 Workflow as Job、资源与速率调度")], // 追加重新入队节点。
    }; // 结束 requeued 任务。
    await this.store.update(requeued); // 保存重新入队状态。
    await this.queue.enqueue(requeued); // 第59天：放回 Redis Waiting Queue。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, requeued }; // 返回快照和重新入队任务。
  } // 结束 requeue。
  async restartJob(jobId: string): Promise<JobStoreSnapshot & { restarted: Job }> { // 第37天：定义克隆旧任务并作为新 Job 重启的方法。
    const current = await this.store.get(jobId); // 从存储读取旧任务。
    if (!current) throw new Error("Job 不存在，无法重启"); // 未找到任务时抛错。
    if (current.status !== "dead_letter" && current.status !== "timeout" && current.status !== "cancelled" && current.status !== "failed") throw new Error("只有 failed、dead_letter、timeout 或 cancelled 任务可以作为新 Job 重启"); // 仅允许终止类任务重启。
    const result = await this.enqueue({ type: current.type, resourceType: current.resourceType, payload: current.payload, priority: current.priority, retryPolicy: { maxAttempts: current.maxAttempts }, timeoutMs: current.timeoutMs }); // 创建新 Job，保留旧任务业务载荷但生成新 jobId。
    const restarted: Job = { ...result.created, timeline: [...result.created.timeline, timeline("Requeued", `从旧 Job ${current.id} 克隆重启，旧任务历史保持不变`)] }; // 给新 Job 增加克隆来源说明。
    await this.store.update(restarted); // 保存追加时间线后的新任务。
    await this.queue.enqueue(restarted); // 第59天：确保追加时间线后的任务在 Redis Waiting Queue 中可被认领。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, restarted }; // 返回快照和新任务。
  } // 结束 restartJob。
  async cancelJob(jobId: string): Promise<JobStoreSnapshot & { cancelled: Job }> { // 第36天：定义取消任务方法。
    const current = await this.store.get(jobId); // 从存储读取目标任务。
    if (!current) throw new Error("Job 不存在，无法取消"); // 未找到任务时抛错。
    if (current.status === "success" || current.status === "dead_letter" || current.status === "cancelled" || current.status === "timeout") throw new Error("当前状态不允许取消任务"); // 终态任务不允许取消。
    const now = Date.now(); // 获取当前时间。
    if (current.status === "queued" || current.status === "retrying") { // 判断是否为尚未运行的任务。
      const queuedCancelled = await this.queue.cancelQueuedJob({ ...current, cancelRequestedAt: now }); // 第59天：尝试从 Redis Waiting Queue 中直接取消。
      const cancelled: Job = queuedCancelled ?? { // 如果内存队列未命中，则仍然持久化为已取消。
        ...current, // 继承当前任务字段。
        status: "cancelled", // 状态改为已取消。
        cancelRequestedAt: now, // 记录取消请求时间。
        cancelledAt: now, // 记录取消完成时间。
        blockedReason: undefined, // 清空阻塞原因。
        workerId: undefined, // 清空 Worker 归属。
        lockedAt: undefined, // 清空任务锁。
        nextRunAt: undefined, // 清空重试时间。
        scheduledAt: undefined, // 清空定时时间。
        completedAt: now, // 记录取消完成时间。
        updatedAt: now, // 更新时间。
        timeline: [...current.timeline, timeline("CancelRequested", "用户请求取消等待中的任务"), timeline("Cancelled", "任务尚未运行，已直接取消")], // 追加取消事件。
      }; // 结束已取消任务构造。
      await this.store.update(cancelled); // 保存取消结果。
      const snapshot = await this.snapshot(); // 读取最新快照。
      return { ...snapshot, cancelled }; // 返回快照和已取消任务。
    } // 结束等待中任务取消逻辑。
    const cancelling: Job = { // 构造运行中任务的取消中状态。
      ...current, // 继承当前任务字段。
      status: "cancelling", // 状态改为取消中，等待 Worker 协作退出。
      cancelRequestedAt: now, // 记录取消请求时间。
      updatedAt: now, // 更新时间。
      timeline: [...current.timeline, timeline("CancelRequested", "用户请求取消运行中的任务，等待 Worker 协作退出")], // 追加取消请求事件。
    }; // 结束取消中任务构造。
    await this.store.update(cancelling); // 保存取消中状态。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, cancelled: cancelling }; // 返回快照和取消中任务。
  } // 结束 cancelJob。
  async deleteJob(jobId: string): Promise<JobStoreSnapshot & { deleted: boolean }> { // 第59天：定义 Queue Explorer 删除任务方法。
    const removedFromQueue = await this.queue.deleteJob(jobId); // 第59天：先从 Redis Waiting、Processing、Completed 和 Dead Letter 队列桶中删除。
    const removedFromStore = await this.store.delete(jobId); // 第59天：再从本地 JobStore 索引中删除。
    const snapshot = await this.snapshot(); // 第59天：读取删除后的最新快照。
    return { ...snapshot, deleted: removedFromQueue || removedFromStore }; // 第59天：返回是否至少删除了一处数据。
  } // 第59天：结束删除任务方法。
  async forceUnlock(lockKey: string): Promise<JobStoreSnapshot & { unlocked: boolean }> { // 第60天：定义 Lock Explorer 强制解锁方法。
    const unlocked = await this.lockProvider.forceUnlock(lockKey); // 第60天：调用锁提供者执行强制解锁。
    const snapshot = await this.snapshot(); // 第60天：读取强制解锁后的最新快照。
    return { ...snapshot, unlocked }; // 第60天：返回快照和解锁结果。
  } // 第60天：结束强制解锁方法。
  async stopGracefully(gracePeriodMs = 10000): Promise<JobStoreSnapshot> { // 第36天：定义运行时优雅关闭方法。
    await this.workerPool.stopGracefully({ gracePeriodMs }); // 调用 WorkerPool 优雅关闭。
    return this.snapshot(); // 返回关闭后的最新快照。
  } // 结束 stopGracefully。
  async detectStaleJobs(now = Date.now()): Promise<Job[]> { // 检测并恢复过期任务锁。
    const recoveredFromRedis = await this.queue.recoverExpiredProcessing(now).catch(() => []); // 第59天：先从 Redis Processing Queue 恢复超过 Visibility Timeout 的任务。
    for (const job of recoveredFromRedis) await this.store.update(job); // 第59天：把 Redis 恢复结果同步回本地 JobStore 索引。
    const jobs = await this.store.list(); // 读取全部任务。
    const staleJobs = jobs.filter((job) => job.status === "running" && typeof job.lockedAt === "number" && now - job.lockedAt > STALE_LOCK_MS); // 找出运行中且锁超时的任务。
    const recovered: Job[] = [...recoveredFromRedis]; // 第59天：准备保存 Redis 与本地双通道恢复后的任务。
    for (const job of staleJobs) { // 遍历所有过期锁任务。
      const next: Job = { // 构造恢复任务。
        ...job, // 继承原任务字段。
        status: "retrying", // 恢复为等待重试。
        blockedReason: undefined, // 清空阻塞原因。
        workerId: undefined, // 清空 Worker 归属。
        lockedAt: undefined, // 清空过期锁。
        nextRunAt: now + 1000, // 一秒后允许重新认领。
        updatedAt: now, // 写入更新时间。
        timeline: [...job.timeline, timeline("StaleRecovered", "检测到 Worker 锁超过 30 秒未释放，任务已恢复为 retrying 并等待重新认领")], // 写入过期锁恢复节点。
      }; // 结束恢复任务。
      this.queue.releaseJobResource(job); // 第35天：恢复过期锁时释放它占用的资源额度。
      await this.store.update(next); // 保存恢复任务。
      await this.queue.retryJob(next); // 第59天：放回 Redis Waiting Queue。
      recovered.push(next); // 记录恢复结果。
    } // 结束遍历。
    return recovered; // 返回恢复任务列表。
  } // 结束 detectStaleJobs。
  async snapshot(): Promise<JobStoreSnapshot> { // 定义读取队列快照的方法。
    await this.detectStaleJobs(); // 读取快照前先检测过期锁。
    const jobs = await this.store.list(); // 从 JobStore 读取任务列表。
    const redisQueue = await this.queue.snapshot().catch(() => undefined); // 第59天：读取 Redis Queue Explorer 快照，Redis 不可用时不阻断基础页面。
    const lockExplorer = await this.lockProvider.snapshot().catch(() => undefined); // 第60天：读取 Lock Explorer 快照，Redis 不可用时不阻断基础页面。
    const baseSnapshot: JobStoreSnapshot = { jobs, metrics: calculateQueueMetrics(jobs), redisQueue, redisQueueMetrics: redisQueue?.metrics, queueOperations: redisQueue?.operations, workerPool: this.workerPool.getStats(jobs), resourceUsage: this.resourceLimiter.snapshot(), rateLimitUsage: this.rateLimiter.snapshot(), rateLimitMetrics: this.limitMetrics.snapshot() }; // 第60天：先构造原有队列快照。
    return Object.assign(baseSnapshot, { lockExplorer, lockMetrics: lockExplorer?.metrics }); // 第60天：附加锁浏览器和锁指标快照。
  } // 结束 snapshot。
} // 结束 QueueRuntime。

const globalForQueue = globalThis as typeof globalThis & { __day60QueueRuntime?: QueueRuntime }; // 第60天：扩展 globalThis 保存 Day60 Redis Queue + Lock 单例。

export function getQueueRuntime(): QueueRuntime { // 定义获取运行时单例的方法。
  if (!globalForQueue.__day60QueueRuntime) { // 第60天：判断是否已有 Day60 Redis Queue + Lock 单例。
    globalForQueue.__day60QueueRuntime = new QueueRuntime(); // 第60天：没有则创建新的运行时。
  } // 结束单例判断。
  return globalForQueue.__day60QueueRuntime; // 第60天：返回运行时单例。
} // 结束 getQueueRuntime。


