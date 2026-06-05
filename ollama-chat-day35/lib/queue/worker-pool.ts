import type { Job, JobStore, RetryPolicy, WorkerPoolMetrics, WorkerPoolSnapshot } from "@/lib/queue/queue-types"; // 引入任务、存储、重试策略与 WorkerPool 类型。
import type { QueueManager } from "@/lib/queue/queue-manager"; // 引入队列管理器类型。
import { Worker } from "@/lib/queue/worker"; // 引入单个 Worker 实现。

type FinishedJobStat = { // 定义完成任务统计结构。
  completedAt: number; // 记录完成时间。
  durationMs: number; // 记录任务耗时。
}; // 结束 FinishedJobStat 类型。

export class WorkerPool { // 第35天：沿用 WorkerPool 工作池，并配合资源限制器控制任务认领。
  private readonly workers: Worker[]; // 保存池内 Worker 实例。
  private readonly finishedJobs: FinishedJobStat[] = []; // 保存最近完成任务统计。

  constructor( // 定义 WorkerPool 构造函数。
    private readonly concurrency: number, // 注入并发 Worker 数量。
    private readonly queue: QueueManager, // 注入共享队列管理器。
    private readonly store: JobStore, // 注入共享任务存储。
    private readonly retryPolicy: RetryPolicy // 注入共享重试策略。
  ) { // 构造函数主体开始。
    this.workers = Array.from({ length: concurrency }, (_, index) => new Worker(`worker_${index + 1}`, queue, store, retryPolicy, (job) => this.recordFinishedJob(job))); // 按并发数创建 Worker。
  } // 结束构造函数。

  start(): void { // 定义启动工作池方法。
    this.workers.forEach((worker) => worker.start()); // 启动池内全部 Worker。
  } // 结束 start。

  stop(): void { // 定义停止工作池方法。
    this.workers.forEach((worker) => worker.stop()); // 停止池内全部 Worker。
  } // 结束 stop。

  getStats(jobs: Job[] = []): WorkerPoolSnapshot { // 定义读取工作池快照方法。
    const workers = this.workers.map((worker) => worker.getInfo()); // 读取全部 Worker 状态。
    const metrics = this.calculateMetrics(workers.length, workers.filter((worker) => worker.status === "running").length, jobs); // 计算并发指标。
    return { workers, metrics }; // 返回 Worker 列表和指标。
  } // 结束 getStats。

  private recordFinishedJob(job: Job): void { // 定义完成任务统计方法。
    const durationMs = job.startedAt && job.completedAt ? Math.max(0, job.completedAt - job.startedAt) : 0; // 计算任务耗时。
    if (durationMs > 0 && job.status === "success") this.finishedJobs.push({ completedAt: Date.now(), durationMs }); // 只记录成功任务的有效耗时。
    const cutoff = Date.now() - 5 * 60 * 1000; // 定义最近五分钟统计窗口。
    while (this.finishedJobs.length && this.finishedJobs[0].completedAt < cutoff) this.finishedJobs.shift(); // 移除过旧统计。
  } // 结束 recordFinishedJob。

  private calculateMetrics(concurrency: number, activeWorkers: number, jobs: Job[]): WorkerPoolMetrics { // 定义并发指标计算方法。
    const oneMinuteAgo = Date.now() - 60 * 1000; // 计算一分钟前时间戳。
    const recentFinished = this.finishedJobs.filter((item) => item.completedAt >= oneMinuteAgo); // 读取最近一分钟完成任务。
    const totalDuration = this.finishedJobs.reduce((sum, item) => sum + item.durationMs, 0); // 累计成功任务耗时。
    return { // 返回 WorkerPool 指标。
      concurrency, // 写入配置并发数。
      activeWorkers, // 写入活跃 Worker 数。
      idleWorkers: Math.max(0, concurrency - activeWorkers), // 写入空闲 Worker 数。
      runningJobs: jobs.filter((job) => job.status === "running").length, // 写入运行中任务数。
      throughputPerMinute: recentFinished.length, // 写入最近一分钟吞吐量。
      avgJobDuration: this.finishedJobs.length ? Math.round(totalDuration / this.finishedJobs.length) : 0, // 写入平均任务耗时。
    }; // 结束指标对象。
  } // 结束 calculateMetrics。
} // 结束 WorkerPool。
