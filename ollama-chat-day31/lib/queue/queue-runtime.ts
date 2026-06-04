import { LocalFileJobStore, calculateQueueMetrics } from "@/lib/queue/job-store"; // 引入本地文件存储与指标计算
import { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器
import type { CreateJobInput, Job, JobStoreSnapshot } from "@/lib/queue/queue-types"; // 引入任务输入与快照类型
import { Worker } from "@/lib/queue/worker"; // 引入本地 Worker

function createJobId(): string { // 定义任务 ID 生成函数
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; // 使用时间戳加随机片段生成 ID
} // createJobId 函数结束

function createJob(input: CreateJobInput): Job { // 定义任务对象创建函数
  const now = Date.now(); // 获取当前时间戳
  return { // 返回新任务
    id: createJobId(), // 写入任务 ID
    type: input.type, // 写入任务类型
    payload: input.payload ?? {}, // 写入任务载荷
    status: "queued", // 初始状态为排队中
    createdAt: now, // 写入创建时间
    timeline: [{ label: "Created", at: now, note: "用户请求已创建 Job 并进入队列" }], // 写入创建时间线
  }; // 新任务对象结束
} // createJob 函数结束

export class QueueRuntime { // 定义第31天队列运行时
  private readonly store = new LocalFileJobStore(); // 创建本地文件 JobStore
  private readonly queue = new QueueManager(); // 创建本地数组 QueueManager
  private readonly worker = new Worker(this.queue, this.store); // 创建 Worker 并注入依赖

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

  async snapshot(): Promise<JobStoreSnapshot> { // 定义读取队列快照的方法
    const jobs = await this.store.list(); // 从 JobStore 读取任务列表
    return { jobs, metrics: calculateQueueMetrics(jobs) }; // 返回任务列表与指标
  } // snapshot 方法结束
} // QueueRuntime 类结束

const globalForQueue = globalThis as typeof globalThis & { __day31QueueRuntime?: QueueRuntime }; // 扩展 globalThis 保存单例

export function getQueueRuntime(): QueueRuntime { // 定义获取运行时单例的方法
  if (!globalForQueue.__day31QueueRuntime) { // 判断是否已有单例
    globalForQueue.__day31QueueRuntime = new QueueRuntime(); // 没有则创建新的运行时
  } // 单例判断结束
  return globalForQueue.__day31QueueRuntime; // 返回运行时单例
} // getQueueRuntime 函数结束
