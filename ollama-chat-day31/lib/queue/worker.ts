import type { Job, JobStore, JobTimelineItem } from "@/lib/queue/queue-types"; // 引入任务与存储类型
import type { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器类型

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)); // 定义异步等待工具

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 定义创建时间线节点的工具
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点
} // timeline 函数结束

async function executeJob(job: Job): Promise<Record<string, unknown>> { // 定义任务执行器
  if (job.type === "embedding") { // 判断是否为向量化模拟任务
    const duration = Number(job.payload.durationMs ?? 5000); // 读取模拟耗时，默认 5 秒
    await sleep(Math.max(500, Math.min(duration, 10000))); // 等待 0.5 到 10 秒之间的耗时
    return { message: "embedding 长任务模拟完成", durationMs: duration }; // 返回模拟结果
  } // embedding 分支结束
  if (job.type === "reindex") { // 判断是否为重建索引模拟任务
    await sleep(2500); // 等待 2.5 秒模拟索引重建
    return { message: "reindex 模拟完成，可在 RAG 面板继续执行真实 Reindex" }; // 返回重建索引模拟结果
  } // reindex 分支结束
  if (job.type === "retrieval") { // 判断是否为检索模拟任务
    await sleep(1500); // 等待 1.5 秒模拟检索任务
    return { message: "retrieval 异步检索模拟完成", query: job.payload.query ?? "Workflow Runtime" }; // 返回检索模拟结果
  } // retrieval 分支结束
  await sleep(2000); // 等待 2 秒模拟工作流任务
  return { message: "workflow 异步执行模拟完成", goal: job.payload.goal ?? "队列中的 Workflow 任务" }; // 返回工作流模拟结果
} // executeJob 函数结束

export class Worker { // 定义本地 Worker
  private timer: ReturnType<typeof setInterval> | null = null; // 保存轮询计时器
  private processing = false; // 标记当前是否正在处理任务

  constructor( // 定义 Worker 构造函数
    private readonly queue: QueueManager, // 注入队列管理器
    private readonly store: JobStore // 注入任务存储
  ) {} // 构造函数结束

  start(): void { // 定义启动 Worker 方法
    if (this.timer) return; // 如果已经启动则直接返回
    this.timer = setInterval(() => void this.tick(), 600); // 每 600ms 轮询一次队列
  } // start 方法结束

  stop(): void { // 定义停止 Worker 方法
    if (!this.timer) return; // 如果没有启动则直接返回
    clearInterval(this.timer); // 清除轮询计时器
    this.timer = null; // 重置计时器引用
  } // stop 方法结束

  private async tick(): Promise<void> { // 定义轮询执行方法
    if (this.processing) return; // 当前有任务在执行则跳过
    const job = this.queue.dequeue(); // 从队列取一个任务
    if (!job) return; // 没有任务则结束
    this.processing = true; // 标记进入处理状态
    try { // 开始执行任务
      await this.process(job); // 处理当前任务
    } finally { // 不论成功失败都需要清理状态
      this.processing = false; // 标记处理结束
    } // try/finally 结束
  } // tick 方法结束

  async process(job: Job): Promise<Job> { // 定义处理单个任务的方法
    const running: Job = { // 构造 running 状态任务
      ...job, // 继承原任务字段
      status: "running", // 状态改为执行中
      startedAt: Date.now(), // 写入开始时间
      timeline: [...job.timeline, timeline("Started", "Worker 已取出任务并开始执行")], // 追加开始节点
    }; // running 任务结束
    await this.store.update(running); // 保存 running 状态
    try { // 开始调用任务执行器
      const result = await executeJob(running); // 执行不同类型任务
      const success: Job = { // 构造成功状态任务
        ...running, // 继承 running 字段
        status: "success", // 状态改为成功
        result, // 写入执行结果
        completedAt: Date.now(), // 写入完成时间
        timeline: [...running.timeline, timeline("Completed", "任务执行成功并写入结果")], // 追加完成节点
      }; // success 任务结束
      await this.store.update(success); // 保存成功状态
      return success; // 返回成功任务
    } catch (error) { // 捕获执行失败
      const failed: Job = { // 构造失败状态任务
        ...running, // 继承 running 字段
        status: "failed", // 状态改为失败
        error: error instanceof Error ? error.message : "未知任务错误", // 写入错误信息
        completedAt: Date.now(), // 写入失败完成时间
        timeline: [...running.timeline, timeline("Failed", "任务执行失败并记录错误")], // 追加失败节点
      }; // failed 任务结束
      await this.store.update(failed); // 保存失败状态
      return failed; // 返回失败任务
    } // try/catch 结束
  } // process 方法结束
} // Worker 类结束
