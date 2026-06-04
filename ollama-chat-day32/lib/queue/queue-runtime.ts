import { LocalFileJobStore, calculateQueueMetrics } from "@/lib/queue/job-store"; // 引入本地文件存储与指标计算
import { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器
import type { CreateJobInput, Job, JobStoreSnapshot, RetryPolicy } from "@/lib/queue/queue-types"; // 引入任务输入、任务、快照和重试策略类型
import { Worker } from "@/lib/queue/worker"; // 引入本地 Worker

const defaultRetryPolicy: RetryPolicy = { // 定义第32天默认重试策略
  maxAttempts: 3, // 默认最多尝试 3 次
  baseDelayMs: 1000, // 默认基础退避 1000ms
  backoff: "exponential", // 默认使用指数退避
}; // defaultRetryPolicy 定义结束

function createJobId(): string { // 定义任务 ID 生成函数
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; // 使用时间戳加随机片段生成 ID
} // createJobId 函数结束

function createJob(input: CreateJobInput): Job { // 定义任务对象创建函数
  const now = Date.now(); // 获取当前时间戳
  const policy: RetryPolicy = { ...defaultRetryPolicy, ...input.retryPolicy }; // 合并默认策略与输入覆盖项
  return { // 返回新任务
    id: createJobId(), // 写入任务 ID
    type: input.type, // 写入任务类型
    payload: input.payload ?? {}, // 写入任务载荷
    status: "queued", // 初始状态为排队中
    attempts: 0, // 初始尝试次数为 0
    maxAttempts: policy.maxAttempts, // 写入最大尝试次数
    createdAt: now, // 写入创建时间
    updatedAt: now, // 写入更新时间
    timeline: [{ label: "Created", at: now, note: "用户请求已创建 Job，并进入 Queue Runtime V2 队列" }], // 写入创建时间线
  }; // 新任务对象结束
} // createJob 函数结束

export class QueueRuntime { // 定义第32天队列运行时
  private readonly store = new LocalFileJobStore(); // 创建本地文件 JobStore
  private readonly queue = new QueueManager(); // 创建本地数组 QueueManager
  private readonly worker = new Worker(this.queue, this.store, defaultRetryPolicy); // 创建 Worker 并注入重试策略

  constructor() { // 定义构造函数
    this.worker.start(); // 启动 Worker 轮询
  } // 构造函数结束

  async enqueue(input: CreateJobInput): Promise<JobStoreSnapshot & { created: Job }> { // 定义入队并返回快照的方法
    const job = createJob(input); // 创建 queued 任务
    await this.store.create(job); // 保存任务到 JobStore
    this.queue.enqueue(job); // 把任务放入本地队列
    const snapshot = await this.snapshot(); // 读取最新快照
    return { ...snapshot, created: job }; // 返回快照和新任务
  } // enqueue 方法结束

  async requeue(jobId: string): Promise<JobStoreSnapshot & { requeued: Job }> { // 定义手动重新入队方法
    const current = await this.store.get(jobId); // 从存储读取任务
    if (!current) throw new Error("Job 不存在，无法重新入队"); // 未找到任务时抛错
    if (current.status !== "dead_letter") throw new Error("只有 dead_letter 任务可以手动重新入队"); // 非死信任务不允许重新入队
    const now = Date.now(); // 获取当前时间
    const requeued: Job = { // 构造重新入队任务
      ...current, // 继承原任务字段
      status: "queued", // 状态改回排队中
      attempts: 0, // 重置尝试次数
      error: undefined, // 清空错误
      nextRunAt: undefined, // 清空下一次运行时间
      startedAt: undefined, // 清空最近开始时间
      completedAt: undefined, // 清空完成时间
      updatedAt: now, // 写入更新时间
      timeline: [...current.timeline, { label: "Requeued", at: now, note: "用户从死信队列手动重新入队，尝试次数已重置" }], // 追加重新入队节点
    }; // requeued 任务结束
    await this.store.update(requeued); // 保存重新入队状态
    this.queue.enqueue(requeued); // 放回内存队列
    const snapshot = await this.snapshot(); // 读取最新快照
    return { ...snapshot, requeued }; // 返回快照和重新入队任务
  } // requeue 方法结束

  async snapshot(): Promise<JobStoreSnapshot> { // 定义读取队列快照的方法
    const jobs = await this.store.list(); // 从 JobStore 读取任务列表
    return { jobs, metrics: calculateQueueMetrics(jobs) }; // 返回任务列表与指标
  } // snapshot 方法结束
} // QueueRuntime 类结束

const globalForQueue = globalThis as typeof globalThis & { __day32QueueRuntime?: QueueRuntime }; // 扩展 globalThis 保存第32天单例

export function getQueueRuntime(): QueueRuntime { // 定义获取运行时单例的方法
  if (!globalForQueue.__day32QueueRuntime) { // 判断是否已有第32天单例
    globalForQueue.__day32QueueRuntime = new QueueRuntime(); // 没有则创建新的运行时
  } // 单例判断结束
  return globalForQueue.__day32QueueRuntime; // 返回运行时单例
} // getQueueRuntime 函数结束
