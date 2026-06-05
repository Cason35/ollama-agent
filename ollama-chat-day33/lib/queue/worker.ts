import type { Job, JobStore, JobTimelineItem, RetryPolicy } from "@/lib/queue/queue-types"; // 引入任务、存储、时间线和重试策略类型。
import type { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器类型。

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)); // 定义异步等待工具。

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 定义创建时间线节点的工具。
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点。
} // 结束 timeline。

export function getRetryDelay(attempts: number, policy: RetryPolicy): number { // 定义退避延迟计算函数。
  if (policy.backoff === "fixed") return policy.baseDelayMs; // 固定退避直接返回基础延迟。
  return policy.baseDelayMs * Math.pow(2, Math.max(0, attempts - 1)); // 指数退避按尝试次数放大延迟。
} // 结束 getRetryDelay。

async function executeJob(job: Job): Promise<Record<string, unknown>> { // 定义任务执行器。
  if (job.type === "unstable") { // 判断是否为不稳定任务。
    await sleep(800); // 短暂等待以模拟外部调用。
    if (Math.random() < 0.7) throw new Error("Random failure from unstable job"); // 70% 概率抛错以测试自动重试。
    return { message: "unstable 任务最终执行成功", attempts: job.attempts }; // 返回不稳定任务成功结果。
  } // 结束 unstable 分支。
  if (job.type === "alwaysFail") { // 判断是否为必定失败任务。
    await sleep(600); // 短暂等待以模拟失败任务耗时。
    throw new Error("AlwaysFail job forced failure"); // 永远抛错以测试死信队列。
  } // 结束 alwaysFail 分支。
  if (job.type === "reminder") { // 判断是否为第33天提醒任务。
    await sleep(500); // 短暂等待以模拟提醒投递。
    return { message: "reminder 定时提醒已触发", text: job.payload.text ?? "该处理定时任务了" }; // 返回提醒任务结果。
  } // 结束 reminder 分支。
  if (job.type === "embedding") { // 判断是否为向量化模拟任务。
    const duration = Number(job.payload.durationMs ?? 5000); // 读取模拟耗时，默认 5 秒。
    await sleep(Math.max(500, Math.min(duration, 10000))); // 等待 0.5 到 10 秒之间的耗时。
    return { message: "embedding 长任务模拟完成", durationMs: duration }; // 返回模拟结果。
  } // 结束 embedding 分支。
  if (job.type === "reindex") { // 判断是否为重建索引模拟任务。
    await sleep(2500); // 等待 2.5 秒模拟索引重建。
    return { message: "reindex 模拟完成，可在 RAG 面板继续执行真实 Reindex" }; // 返回重建索引模拟结果。
  } // 结束 reindex 分支。
  if (job.type === "retrieval") { // 判断是否为检索模拟任务。
    await sleep(1500); // 等待 1.5 秒模拟检索任务。
    return { message: "retrieval 异步检索模拟完成", query: job.payload.query ?? "Workflow Runtime" }; // 返回检索模拟结果。
  } // 结束 retrieval 分支。
  await sleep(2000); // 等待 2 秒模拟工作流任务。
  return { message: "workflow 异步执行模拟完成", goal: job.payload.goal ?? "队列中的 Workflow 任务" }; // 返回工作流模拟结果。
} // 结束 executeJob。

export class Worker { // 定义本地 Worker。
  private timer: ReturnType<typeof setInterval> | null = null; // 保存轮询计时器。
  private processing = false; // 标记当前是否正在处理任务。

  constructor( // 定义 Worker 构造函数。
    private readonly queue: QueueManager, // 注入队列管理器。
    private readonly store: JobStore, // 注入任务存储。
    private readonly retryPolicy: RetryPolicy // 注入默认重试策略。
  ) {} // 结束构造函数。

  start(): void { // 定义启动 Worker 方法。
    if (this.timer) return; // 如果已经启动则直接返回。
    this.timer = setInterval(() => void this.tick(), 600); // 每 600ms 轮询一次队列。
  } // 结束 start。

  stop(): void { // 定义停止 Worker 方法。
    if (!this.timer) return; // 如果没有启动则直接返回。
    clearInterval(this.timer); // 清除轮询计时器。
    this.timer = null; // 重置计时器引用。
  } // 结束 stop。

  private async tick(): Promise<void> { // 定义轮询执行方法。
    if (this.processing) return; // 当前有任务在执行则跳过。
    const job = this.queue.dequeue(); // 从队列取一个到期且优先级最高的任务。
    if (!job) return; // 没有可运行任务则结束。
    this.processing = true; // 标记进入处理状态。
    try { // 开始执行任务。
      await this.process(job); // 处理当前任务。
    } finally { // 无论成功失败都清理状态。
      this.processing = false; // 标记处理结束。
    } // 结束 try/finally。
  } // 结束 tick。

  async process(job: Job): Promise<Job> { // 定义处理单个任务的方法。
    const now = Date.now(); // 获取当前时间戳。
    const attemptNumber = job.attempts + 1; // 计算本次尝试序号。
    const running: Job = { // 构造 running 状态任务。
      ...job, // 继承原任务字段。
      status: "running", // 状态改为执行中。
      attempts: attemptNumber, // 写入本次尝试次数。
      nextRunAt: undefined, // 清空下一次运行时间。
      scheduledAt: undefined, // 清空计划时间，表示调度已经兑现。
      startedAt: now, // 写入最近开始时间。
      updatedAt: now, // 写入更新时间。
      timeline: [...job.timeline, timeline("Started", `Worker 开始执行第 ${attemptNumber} 次尝试，当前优先级为 ${job.priority}`)], // 追加开始节点。
    }; // 结束 running 任务。
    await this.store.update(running); // 保存 running 状态。
    try { // 开始调用任务执行器。
      const result = await executeJob(running); // 执行不同类型任务。
      const success: Job = { // 构造成功状态任务。
        ...running, // 继承 running 字段。
        status: "success", // 状态改为成功。
        result, // 写入执行结果。
        error: undefined, // 清空旧错误。
        completedAt: Date.now(), // 写入完成时间。
        updatedAt: Date.now(), // 写入更新时间。
        timeline: [...running.timeline, timeline("Completed", `第 ${attemptNumber} 次尝试执行成功并写入结果`)], // 追加完成节点。
      }; // 结束 success 任务。
      await this.store.update(success); // 保存成功状态。
      return success; // 返回成功任务。
    } catch (error) { // 捕获执行失败。
      const message = error instanceof Error ? error.message : "未知任务错误"; // 规范化错误消息。
      if (attemptNumber < running.maxAttempts) { // 判断是否还允许重试。
        const delayMs = getRetryDelay(attemptNumber, this.retryPolicy); // 计算本次失败后的退避延迟。
        const retrying: Job = { // 构造等待重试任务。
          ...running, // 继承 running 字段。
          status: "retrying", // 状态改为等待重试。
          error: message, // 写入最近一次错误。
          nextRunAt: Date.now() + delayMs, // 写入下一次可运行时间。
          updatedAt: Date.now(), // 写入更新时间。
          timeline: [ // 追加失败与重试计划节点。
            ...running.timeline, // 保留已有时间线。
            timeline("Failed", `第 ${attemptNumber} 次尝试失败：${message}`), // 记录本次失败。
            timeline("RetryScheduled", `${delayMs}ms 后安排第 ${attemptNumber + 1} 次重试`), // 记录重试计划。
          ], // 结束时间线。
        }; // 结束 retrying 任务。
        await this.store.update(retrying); // 保存等待重试状态。
        this.queue.enqueue(retrying); // 重新放入内存队列等待到期执行。
        return retrying; // 返回等待重试任务。
      } // 结束重试判断。
      const deadLetter: Job = { // 构造死信任务。
        ...running, // 继承 running 字段。
        status: "dead_letter", // 状态改为死信。
        error: message, // 写入最终错误。
        nextRunAt: undefined, // 清空下一次运行时间。
        scheduledAt: undefined, // 清空计划执行时间。
        completedAt: Date.now(), // 写入进入死信时间。
        updatedAt: Date.now(), // 写入更新时间。
        timeline: [ // 追加失败与死信节点。
          ...running.timeline, // 保留已有时间线。
          timeline("Failed", `第 ${attemptNumber} 次尝试失败：${message}`), // 记录最后一次失败。
          timeline("DeadLetter", `已达到最大尝试次数 ${running.maxAttempts}，任务进入死信队列`), // 记录死信迁移。
        ], // 结束时间线。
      }; // 结束 deadLetter 任务。
      await this.store.update(deadLetter); // 保存死信状态。
      return deadLetter; // 返回死信任务。
    } // 结束 try/catch。
  } // 结束 process。
} // 结束 Worker。
