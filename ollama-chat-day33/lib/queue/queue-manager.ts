import type { Job } from "@/lib/queue/queue-types"; // 引入任务类型。

function getRunnableAt(job: Job): number { // 计算任务最早可运行时间。
  return Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 取 scheduledAt 与 nextRunAt 中更晚的时间，兼容定时任务与重试退避。
} // 结束 getRunnableAt。

function isRunnable(job: Job, now: number): boolean { // 判断任务当前是否可运行。
  if (job.status !== "queued" && job.status !== "retrying") return false; // 只有 queued 与 retrying 任务可被 Worker 取走。
  return getRunnableAt(job) <= now; // 只有计划时间或重试时间到期后才允许执行。
} // 结束 isRunnable。

function compareRunnableJobs(a: Job, b: Job): number { // 定义可运行任务排序规则。
  if (b.priority !== a.priority) return b.priority - a.priority; // 优先级高的任务排在前面。
  const aRunAt = getRunnableAt(a); // 读取任务 a 的最早运行时间。
  const bRunAt = getRunnableAt(b); // 读取任务 b 的最早运行时间。
  if (aRunAt !== bRunAt) return aRunAt - bRunAt; // 同优先级时更早到期的任务排在前面。
  return a.createdAt - b.createdAt; // 再相同则保留先进先出的稳定顺序。
} // 结束 compareRunnableJobs。

export class QueueManager { // 定义第33天本地队列管理器。
  private queue: Job[] = []; // 使用数组保存排队、定时与等待重试的任务。

  enqueue(job: Job): Job { // 定义入队方法。
    if (!this.queue.some((item) => item.id === job.id)) { // 避免同一个任务重复入队。
      this.queue.push(job); // 将任务加入内存队列。
    } // 结束去重判断。
    return job; // 返回入队任务。
  } // 结束 enqueue。

  dequeue(now = Date.now()): Job | undefined { // 定义出队方法。
    const runnableJobs = this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs); // 找出到期任务并按优先级排序。
    const selected = runnableJobs[0]; // 取最高优先级的可运行任务。
    if (!selected) return undefined; // 没有可运行任务时返回空。
    const index = this.queue.findIndex((job) => job.id === selected.id); // 在原队列中定位选中任务。
    if (index < 0) return undefined; // 防御性处理异常索引。
    const [job] = this.queue.splice(index, 1); // 从队列中移除选中任务。
    return job; // 返回可执行任务。
  } // 结束 dequeue。

  peek(now = Date.now()): Job | undefined { // 定义查看下一任务方法。
    return this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs)[0]; // 返回最高优先级可运行任务但不移除。
  } // 结束 peek。

  size(): number { // 定义队列长度方法。
    return this.queue.length; // 返回当前内存队列数量。
  } // 结束 size。

  list(): Job[] { // 定义队列快照方法。
    return [...this.queue].sort(compareRunnableJobs); // 返回排序后的队列副本。
  } // 结束 list。
} // 结束 QueueManager。
