import { LocalFileJobStore, calculateQueueMetrics } from "@/lib/queue/job-store"; // 引入本地文件存储与指标计算。
import { QueueManager } from "@/lib/queue/queue-manager"; // 引入第33天队列管理器。
import type { CreateJobInput, Job, JobStoreSnapshot, JobTimelineItem, RetryPolicy } from "@/lib/queue/queue-types"; // 引入任务输入、任务快照、时间线和重试策略类型。
import { Worker } from "@/lib/queue/worker"; // 引入本地 Worker。

const NORMAL_PRIORITY = 5; // 定义普通优先级。

const defaultRetryPolicy: RetryPolicy = { // 定义默认重试策略。
  maxAttempts: 3, // 默认最多尝试 3 次。
  baseDelayMs: 1000, // 默认基础退避 1000ms。
  backoff: "exponential", // 默认使用指数退避。
}; // 结束 defaultRetryPolicy。

function createJobId(): string { // 定义任务 ID 生成函数。
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; // 使用时间戳加随机片段生成 ID。
} // 结束 createJobId。

function normalizePriority(priority: unknown): number { // 定义优先级归一化函数。
  const value = Number(priority); // 将输入转成数字。
  if (!Number.isFinite(value)) return NORMAL_PRIORITY; // 非数字时回退普通优先级。
  return Math.max(1, Math.min(10, Math.round(value))); // 将优先级限制在 1 到 10。
} // 结束 normalizePriority。

function resolveScheduledAt(input: CreateJobInput, now: number): number | undefined { // 定义计划执行时间解析函数。
  if (typeof input.scheduledAt === "number" && Number.isFinite(input.scheduledAt)) return input.scheduledAt; // 优先使用明确时间戳。
  if (typeof input.scheduledDelayMs === "number" && Number.isFinite(input.scheduledDelayMs)) return now + Math.max(0, input.scheduledDelayMs); // 将延迟毫秒换算成时间戳。
  return undefined; // 没有定时参数时立即执行。
} // 结束 resolveScheduledAt。

function createJob(input: CreateJobInput): Job { // 定义任务对象创建函数。
  const now = Date.now(); // 获取当前时间戳。
  const policy: RetryPolicy = { ...defaultRetryPolicy, ...input.retryPolicy }; // 合并默认策略与输入覆盖项。
  const scheduledAt = resolveScheduledAt(input, now); // 解析计划执行时间。
  const priority = normalizePriority(input.priority); // 解析任务优先级。
  const timeline: JobTimelineItem[] = [{ label: "Created", at: now, note: "用户请求已创建 Job，并进入 Queue Runtime V3 队列" }]; // 写入创建时间线。
  if (typeof scheduledAt === "number" && scheduledAt > now) { // 判断是否为未来定时任务。
    timeline.push({ label: "Scheduled", at: now, note: `任务已调度到 ${new Date(scheduledAt).toLocaleString("zh-CN")} 后执行` }); // 写入 Scheduled 节点。
  } // 结束定时判断。
  return { // 返回新任务。
    id: createJobId(), // 写入任务 ID。
    type: input.type, // 写入任务类型。
    payload: input.payload ?? {}, // 写入任务载荷。
    priority, // 写入优先级。
    scheduledAt, // 写入计划执行时间。
    status: "queued", // 初始状态为排队中。
    attempts: 0, // 初始尝试次数为 0。
    maxAttempts: policy.maxAttempts, // 写入最大尝试次数。
    createdAt: now, // 写入创建时间。
    updatedAt: now, // 写入更新时间。
    timeline, // 写入时间线。
  }; // 结束新任务对象。
} // 结束 createJob。

export class QueueRuntime { // 定义第33天队列运行时。
  private readonly store = new LocalFileJobStore(); // 创建本地文件 JobStore。
  private readonly queue = new QueueManager(); // 创建本地优先级 QueueManager。
  private readonly worker = new Worker(this.queue, this.store, defaultRetryPolicy); // 创建 Worker 并注入重试策略。

  constructor() { // 定义运行时构造函数。
    this.worker.start(); // 启动 Worker 轮询。
  } // 结束构造函数。

  async enqueue(input: CreateJobInput): Promise<JobStoreSnapshot & { created: Job }> { // 定义立即或定时入队并返回快照的方法。
    const job = createJob(input); // 创建 queued 任务。
    await this.store.create(job); // 保存任务到 JobStore。
    this.queue.enqueue(job); // 将任务放入本地队列。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, created: job }; // 返回快照和新任务。
  } // 结束 enqueue。

  async scheduleJob(input: CreateJobInput, runAt: number): Promise<JobStoreSnapshot & { scheduled: Job }> { // 定义第33天定时入队方法。
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
      status: "queued", // 状态改回排队中。
      attempts: 0, // 重置尝试次数。
      error: undefined, // 清空错误。
      nextRunAt: undefined, // 清空下一次运行时间。
      scheduledAt: undefined, // 手动恢复默认立即执行。
      startedAt: undefined, // 清空最近开始时间。
      completedAt: undefined, // 清空完成时间。
      updatedAt: now, // 写入更新时间。
      timeline: [...current.timeline, { label: "Requeued", at: now, note: "用户从死信队列手动重新入队，尝试次数已重置并立即重新调度" }], // 追加重新入队节点。
    }; // 结束 requeued 任务。
    await this.store.update(requeued); // 保存重新入队状态。
    this.queue.enqueue(requeued); // 放回内存队列。
    const snapshot = await this.snapshot(); // 读取最新快照。
    return { ...snapshot, requeued }; // 返回快照和重新入队任务。
  } // 结束 requeue。

  async snapshot(): Promise<JobStoreSnapshot> { // 定义读取队列快照的方法。
    const jobs = await this.store.list(); // 从 JobStore 读取任务列表。
    return { jobs, metrics: calculateQueueMetrics(jobs) }; // 返回任务列表与指标。
  } // 结束 snapshot。
} // 结束 QueueRuntime。

const globalForQueue = globalThis as typeof globalThis & { __day33QueueRuntime?: QueueRuntime }; // 扩展 globalThis 保存第33天单例。

export function getQueueRuntime(): QueueRuntime { // 定义获取运行时单例的方法。
  if (!globalForQueue.__day33QueueRuntime) { // 判断是否已有第33天单例。
    globalForQueue.__day33QueueRuntime = new QueueRuntime(); // 没有则创建新的运行时。
  } // 结束单例判断。
  return globalForQueue.__day33QueueRuntime; // 返回运行时单例。
} // 结束 getQueueRuntime。
