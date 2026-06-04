import { mkdir, readFile, writeFile } from "fs/promises"; // 引入 Node 文件读写能力
import path from "path"; // 引入路径工具
import type { Job, JobStore, QueueMetrics } from "@/lib/queue/queue-types"; // 引入任务与指标类型

const STORE_DIR = path.join(process.cwd(), ".queue-data"); // 定义本地任务数据目录
const STORE_FILE = path.join(STORE_DIR, "jobs-v1.json"); // 定义第31天任务持久化文件

type PersistedJobData = { // 定义持久化文件结构
  jobs: Job[]; // 保存全部任务
}; // PersistedJobData 类型结束

async function ensureStoreDir() { // 定义确保目录存在的函数
  await mkdir(STORE_DIR, { recursive: true }); // 递归创建本地队列数据目录
} // ensureStoreDir 函数结束

function sortJobs(jobs: Job[]) { // 定义任务排序函数
  return [...jobs].sort((a, b) => b.createdAt - a.createdAt); // 按创建时间倒序返回副本
} // sortJobs 函数结束

export function calculateQueueMetrics(jobs: Job[]): QueueMetrics { // 定义队列指标计算函数
  const completed = jobs.filter((job) => job.status === "success" && job.startedAt && job.completedAt); // 找出成功且有耗时的任务
  const totalDuration = completed.reduce((sum, job) => sum + ((job.completedAt ?? 0) - (job.startedAt ?? 0)), 0); // 累加成功任务耗时
  return { // 返回指标对象
    queuedJobs: jobs.filter((job) => job.status === "queued").length, // 统计排队任务
    runningJobs: jobs.filter((job) => job.status === "running").length, // 统计执行中任务
    completedJobs: jobs.filter((job) => job.status === "success").length, // 统计成功任务
    failedJobs: jobs.filter((job) => job.status === "failed").length, // 统计失败任务
    avgDuration: completed.length ? Math.round(totalDuration / completed.length) : 0, // 计算平均耗时
  }; // 指标对象结束
} // calculateQueueMetrics 函数结束

export class LocalFileJobStore implements JobStore { // 定义本地文件任务存储
  private writeChain: Promise<void> = Promise.resolve(); // 串行化写入，避免并发覆盖

  private async readData(): Promise<PersistedJobData> { // 定义读取持久化数据的方法
    try { // 开始尝试读取文件
      const raw = await readFile(STORE_FILE, "utf8"); // 读取 JSON 文件内容
      const parsed = JSON.parse(raw) as PersistedJobData; // 解析 JSON 为持久化结构
      return { jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] }; // 返回安全的任务数组
    } catch { // 捕获文件不存在或 JSON 损坏
      return { jobs: [] }; // 返回空任务列表
    } // try/catch 结束
  } // readData 方法结束

  private async writeData(data: PersistedJobData): Promise<void> { // 定义写入持久化数据的方法
    this.writeChain = this.writeChain.then(async () => { // 把本次写入排到上次写入之后
      await ensureStoreDir(); // 确保存储目录存在
      await writeFile(STORE_FILE, JSON.stringify(data, null, 2), "utf8"); // 写入格式化 JSON 文件
    }); // 串行写入链结束
    await this.writeChain; // 等待本次写入完成
  } // writeData 方法结束

  async create(job: Job): Promise<Job> { // 实现创建任务
    const data = await this.readData(); // 读取现有任务
    const nextJobs = [job, ...data.jobs.filter((item) => item.id !== job.id)]; // 插入新任务并去重
    await this.writeData({ jobs: sortJobs(nextJobs) }); // 保存排序后的任务
    return job; // 返回创建的任务
  } // create 方法结束

  async get(id: string): Promise<Job | null> { // 实现读取单个任务
    const data = await this.readData(); // 读取现有任务
    return data.jobs.find((job) => job.id === id) ?? null; // 返回命中任务或 null
  } // get 方法结束

  async update(job: Job): Promise<Job> { // 实现更新任务
    const data = await this.readData(); // 读取现有任务
    const nextJobs = data.jobs.map((item) => (item.id === job.id ? job : item)); // 替换同 ID 任务
    await this.writeData({ jobs: sortJobs(nextJobs) }); // 保存排序后的任务
    return job; // 返回更新后的任务
  } // update 方法结束

  async list(): Promise<Job[]> { // 实现列出任务
    const data = await this.readData(); // 读取现有任务
    return sortJobs(data.jobs); // 返回倒序任务列表
  } // list 方法结束
} // LocalFileJobStore 类结束
