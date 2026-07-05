import { mkdir, readFile, writeFile } from "fs/promises"; // 引入 Node 文件读写能力。
import path from "path"; // 引入路径工具。
import { inferResourceType } from "@/lib/queue/resource-limiters"; // 引入资源类型推断工具。
import type { Job, JobStore, QueueMetrics } from "@/lib/queue/queue-types"; // 引入任务、存储和指标类型。

const STORE_DIR = path.join(process.cwd(), ".queue-data"); // 定义本地任务数据目录。
const STORE_FILE = path.join(STORE_DIR, "jobs-day59-redis-queue.json"); // 第59天：使用独立持久化文件，避免污染 Day58 本地队列数据。
const NORMAL_PRIORITY = 5; // 定义普通优先级默认值。
const DEFAULT_TIMEOUT_MS = 30 * 1000; // 第36天：定义任务默认超时时间为 30 秒。

type PersistedJobData = { // 定义持久化文件结构。
  jobs: Job[]; // 保存全部任务。
}; // 结束 PersistedJobData 类型。

async function ensureStoreDir() { // 定义确保存储目录存在的函数。
  await mkdir(STORE_DIR, { recursive: true }); // 递归创建本地队列数据目录。
} // 结束 ensureStoreDir。

function sortJobs(jobs: Job[]) { // 定义任务展示排序函数。
  return [...jobs].sort((a, b) => b.createdAt - a.createdAt); // 按创建时间倒序返回副本。
} // 结束 sortJobs。

function normalizeJob(job: Job): Job { // 定义旧数据兼容函数。
  const normalized: Job = { // 构造补齐字段后的任务对象。
    ...job, // 保留原有任务字段。
    workflowId: job.workflowId ?? (typeof job.payload?.workflowId === "string" ? job.payload.workflowId : undefined), // 第37天：补齐 Job 与 Workflow 的关联 ID。
    resourceType: job.resourceType ?? inferResourceType(job), // 第35天：补齐资源类型。
    blockedReason: job.blockedReason, // 第35天：保留阻塞原因。
    timeoutMs: typeof job.timeoutMs === "number" && Number.isFinite(job.timeoutMs) ? job.timeoutMs : DEFAULT_TIMEOUT_MS, // 第36天：补齐任务超时阈值。
    cancelRequestedAt: job.cancelRequestedAt, // 第36天：保留取消请求时间。
    cancelledAt: job.cancelledAt, // 第36天：保留实际取消完成时间。
    timeoutAt: job.timeoutAt, // 第36天：保留超时发生时间。
    priority: Number.isFinite(job.priority) ? job.priority : NORMAL_PRIORITY, // 兼容旧任务缺少 priority 的情况。
    scheduledAt: job.scheduledAt, // 保留计划执行时间。
    workerId: job.workerId, // 保留任务认领 Worker ID。
    lockedAt: job.lockedAt, // 保留任务锁定时间。
    attempts: job.attempts ?? 0, // 兼容旧任务的尝试次数。
    maxAttempts: job.maxAttempts ?? 3, // 兼容旧任务的最大尝试次数。
    updatedAt: job.updatedAt ?? job.createdAt, // 兼容旧任务的更新时间。
    timeline: Array.isArray(job.timeline) ? job.timeline : [], // 兼容异常时间线数据。
  }; // 结束 normalized 对象。
  return normalized; // 返回标准化任务。
} // 结束 normalizeJob。

export function calculateQueueMetrics(jobs: Job[]): QueueMetrics { // 定义队列指标计算函数。
  const now = Date.now(); // 获取当前时间戳。
  const completed = jobs.filter((job) => job.status === "success" && job.startedAt && job.completedAt); // 找出成功且有耗时的任务。
  const totalDuration = completed.reduce((sum, job) => sum + ((job.completedAt ?? 0) - (job.startedAt ?? 0)), 0); // 累加成功任务耗时。
  const totalAttempts = jobs.reduce((sum, job) => sum + (job.attempts ?? 0), 0); // 累加所有任务尝试次数。
  const retriedJobs = jobs.filter((job) => (job.attempts ?? 0) > 1 || job.timeline.some((item) => item.label === "RetryScheduled")); // 找出发生过重试的任务。
  const deadLetterJobs = jobs.filter((job) => job.status === "dead_letter"); // 找出死信任务。
  return { // 返回指标对象。
    queuedJobs: jobs.filter((job) => job.status === "queued").length, // 统计排队任务。
    runningJobs: jobs.filter((job) => job.status === "running").length, // 统计执行中任务。
    retryingJobs: jobs.filter((job) => job.status === "retrying").length, // 统计等待重试任务。
    deadLetterJobs: deadLetterJobs.length, // 统计死信任务。
    successJobs: jobs.filter((job) => job.status === "success").length, // 统计成功任务。
    failedJobs: jobs.filter((job) => job.status === "failed").length, // 统计历史失败任务。
    cancellingJobs: jobs.filter((job) => job.status === "cancelling").length, // 第36天：统计取消中的任务。
    cancelledJobs: jobs.filter((job) => job.status === "cancelled").length, // 第36天：统计已经取消的任务。
    timeoutJobs: jobs.filter((job) => job.status === "timeout" || typeof job.timeoutAt === "number").length, // 第36天：统计当前或历史发生过超时的任务。
    avgDuration: completed.length ? Math.round(totalDuration / completed.length) : 0, // 计算平均耗时。
    avgAttempts: jobs.length ? Number((totalAttempts / jobs.length).toFixed(2)) : 0, // 计算平均尝试次数。
    retryRate: jobs.length ? Number((retriedJobs.length / jobs.length).toFixed(2)) : 0, // 计算重试率。
    deadLetterRate: jobs.length ? Number((deadLetterJobs.length / jobs.length).toFixed(2)) : 0, // 计算死信率。
    highPriorityJobs: jobs.filter((job) => job.priority >= 10).length, // 统计高优先级任务。
    normalPriorityJobs: jobs.filter((job) => job.priority > 1 && job.priority < 10).length, // 统计普通优先级任务。
    lowPriorityJobs: jobs.filter((job) => job.priority <= 1).length, // 统计低优先级任务。
    scheduledJobs: jobs.filter((job) => job.status === "queued" && typeof job.scheduledAt === "number" && job.scheduledAt > now).length, // 统计未来定时任务。
  }; // 结束指标对象。
} // 结束 calculateQueueMetrics。

export class LocalFileJobStore implements JobStore { // 定义本地文件任务存储。
  private writeChain: Promise<void> = Promise.resolve(); // 串行化写入，避免并发覆盖。
  private async readData(): Promise<PersistedJobData> { // 定义读取持久化数据的方法。
    try { // 开始尝试读取文件。
      const raw = await readFile(STORE_FILE, "utf8"); // 读取 JSON 文件内容。
      const parsed = JSON.parse(raw) as PersistedJobData; // 解析 JSON 为持久化结构。
      const jobs = Array.isArray(parsed.jobs) ? parsed.jobs.map(normalizeJob) : []; // 安全读取并兼容任务字段。
      return { jobs }; // 返回安全任务数组。
    } catch { // 捕获文件不存在或 JSON 损坏。
      return { jobs: [] }; // 返回空任务列表。
    } // 结束 try/catch。
  } // 结束 readData。
  private async writeData(data: PersistedJobData): Promise<void> { // 定义写入持久化数据的方法。
    this.writeChain = this.writeChain.then(async () => { // 将本次写入排到上次写入之后。
      await ensureStoreDir(); // 确保存储目录存在。
      await writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf8"); // 写入格式化 JSON 文件。
    }); // 结束串行写入链。
    await this.writeChain; // 等待本次写入完成。
  } // 结束 writeData。
  async create(job: Job): Promise<Job> { // 实现创建任务。
    const data = await this.readData(); // 读取现有任务。
    const normalized = normalizeJob(job); // 标准化新任务字段。
    const nextJobs = [normalized, ...data.jobs.filter((item) => item.id !== normalized.id)]; // 插入新任务并去重。
    await this.writeData({ jobs: sortJobs(nextJobs) }); // 保存排序后的任务。
    return normalized; // 返回创建的任务。
  } // 结束 create。
  async get(id: string): Promise<Job | null> { // 实现读取单个任务。
    const data = await this.readData(); // 读取现有任务。
    return data.jobs.find((job) => job.id === id) ?? null; // 返回命中任务或 null。
  } // 结束 get。
  async update(job: Job): Promise<Job> { // 实现更新任务。
    const data = await this.readData(); // 读取现有任务。
    const normalized = normalizeJob(job); // 补齐任务字段。
    const exists = data.jobs.some((item) => item.id === normalized.id); // 判断原任务是否存在。
    const nextJobs = exists ? data.jobs.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...data.jobs]; // 替换同 ID 任务或补插新任务。
    await this.writeData({ jobs: sortJobs(nextJobs) }); // 保存排序后的任务。
    return normalized; // 返回更新后的任务。
  } // 结束 update。
  async delete(id: string): Promise<boolean> { // 第59天：实现删除任务持久化记录，配合 Queue Explorer 的 Delete 动作。
    const data = await this.readData(); // 第59天：读取现有任务数据。
    const nextJobs = data.jobs.filter((job) => job.id !== id); // 第59天：过滤掉目标任务。
    if (nextJobs.length === data.jobs.length) return false; // 第59天：没有删除任何任务时返回 false。
    await this.writeData({ jobs: sortJobs(nextJobs) }); // 第59天：写回删除后的任务列表。
    return true; // 第59天：返回删除成功。
  } // 第59天：结束删除任务持久化记录。
  async list(): Promise<Job[]> { // 实现列出任务。
    const data = await this.readData(); // 读取现有任务。
    return sortJobs(data.jobs); // 返回倒序任务列表。
  } // 结束 list。
} // 结束 LocalFileJobStore。
