import { LocalFileJobStore, calculateQueueMetrics } from "@/lib/queue/job-store"; // 引入本地文件存储与指标计算。
import { LimitMetricsRecorder, RateLimiter, ResourceLimiter, inferResourceType } from "@/lib/queue/resource-limiters"; // 引入第35天资源限制、速率限制和资源推断。
import { QueueManager } from "@/lib/queue/queue-manager"; // 引入第35天队列管理器。
import type { CreateJobInput, Job, JobStoreSnapshot, JobTimelineItem, RetryPolicy } from "@/lib/queue/queue-types"; // 引入任务输入、快照、时间线和重试策略类型。
import { WorkerPool } from "@/lib/queue/worker-pool"; // 引入 WorkerPool。

const NORMAL_PRIORITY = 5; // 定义普通优先级。
const DEFAULT_CONCURRENCY = 3; // 默认启动 3 个并发 Worker。
const STALE_LOCK_MS = 30 * 1000; // 定义 30 秒过期锁检测窗口。
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
  const items: JobTimelineItem[] = [timeline("Created", `用户请求已创建 Job，并进入 Queue Runtime V5 资源控制队列，资源类型为 ${resourceType}`)]; // 写入创建时间线。
  if (typeof scheduledAt === "number" && scheduledAt > now) { // 判断是否为未来定时任务。
    items.push(timeline("Scheduled", `任务已调度到 ${new Date(scheduledAt).toLocaleString("zh-CN")} 后执行`)); // 写入 Scheduled 节点。
  } // 结束定时判断。
  return { // 返回新任务。
    id: createJobId(), // 写入任务 ID。
    type: input.type, // 写入任务类型。
    resourceType, // 第35天：写入资源类型。
    payload: input.payload ?? {}, // 写入任务载荷。
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
  private readonly resourceLimiter = new ResourceLimiter(); // 创建资源并发限制器。
  private readonly rateLimiter = new RateLimiter(); // 创建速率限制器。
  private readonly limitMetrics = new LimitMetricsRecorder(); // 创建限制器指标记录器。
  private readonly queue = new QueueManager(this.resourceLimiter, this.rateLimiter, this.limitMetrics, (job) => void this.store.update(job)); // 创建支持资源控制的 QueueManager。
  private readonly workerPool = new WorkerPool(DEFAULT_CONCURRENCY, this.queue, this.store, defaultRetryPolicy); // 创建并发 WorkerPool。
  constructor() { // 定义运行时构造函数。
    this.workerPool.start(); // 启动 WorkerPool 轮询。
  } // 结束构造函数。
  async enqueue(input: CreateJobInput): Promise<JobStoreSnapshot & { created: Job }> { // 定义立即或定时入队并返回快照的方法。
    const job = createJob(input); // 创建 queued 任务。
    const created = await this.store.create(job); // 保存任务到 JobStore。
    this.queue.enqueue(created); // 将任务放入本地队列。
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
    if (current.status !== "dead_letter") throw new Error("只有 dead_letter 任务可以手动重新入队"); // 非死信任务不允许重新入队。
    const now = Date.now(); // 获取当前时间。
    const requeued: Job = { // 构造重新入队任务。
      ...current, // 继承原任务字段。
      resourceType: current.resourceType ?? inferResourceType(current), // 补齐资源类型。
      blockedReason: undefined, // 清空阻塞原因。
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
      timeline: [...current.timeline, timeline("Requeued", "用户从死信队列手动重新入队，任务将重新参与 V5 资源与速率调度")], // 追加重新入队节点。
    }; // 结束 requeued 任务。
    await this.store.update(requeued); // 保存重新入队状态。
    this.queue.enqueue(requeued); // 放回内存队列。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, requeued }; // 返回快照和重新入队任务。
  } // 结束 requeue。
  async detectStaleJobs(now = Date.now()): Promise<Job[]> { // 检测并恢复过期任务锁。
    const jobs = await this.store.list(); // 读取全部任务。
    const staleJobs = jobs.filter((job) => job.status === "running" && typeof job.lockedAt === "number" && now - job.lockedAt > STALE_LOCK_MS); // 找出运行中且锁超时的任务。
    const recovered: Job[] = []; // 准备保存恢复后的任务。
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
      this.queue.enqueue(next); // 放回内存队列。
      recovered.push(next); // 记录恢复结果。
    } // 结束遍历。
    return recovered; // 返回恢复任务列表。
  } // 结束 detectStaleJobs。
  async snapshot(): Promise<JobStoreSnapshot> { // 定义读取队列快照的方法。
    await this.detectStaleJobs(); // 读取快照前先检测过期锁。
    const jobs = await this.store.list(); // 从 JobStore 读取任务列表。
    return { jobs, metrics: calculateQueueMetrics(jobs), workerPool: this.workerPool.getStats(jobs), resourceUsage: this.resourceLimiter.snapshot(), rateLimitUsage: this.rateLimiter.snapshot(), rateLimitMetrics: this.limitMetrics.snapshot() }; // 返回任务、队列指标、WorkerPool 指标和 V5 限制指标。
  } // 结束 snapshot。
} // 结束 QueueRuntime。

const globalForQueue = globalThis as typeof globalThis & { __day35QueueRuntime?: QueueRuntime }; // 扩展 globalThis 保存第35天单例。

export function getQueueRuntime(): QueueRuntime { // 定义获取运行时单例的方法。
  if (!globalForQueue.__day35QueueRuntime) { // 判断是否已有第35天单例。
    globalForQueue.__day35QueueRuntime = new QueueRuntime(); // 没有则创建新的运行时。
  } // 结束单例判断。
  return globalForQueue.__day35QueueRuntime; // 返回运行时单例。
} // 结束 getQueueRuntime。
