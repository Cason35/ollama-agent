import type { Job, JobTimelineItem } from "@/lib/queue/queue-types"; // 引入任务与时间线类型。

function getRunnableAt(job: Job): number { // 计算任务最早可运行时间。
  return Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 同时兼容定时任务与重试退避任务。
} // 结束 getRunnableAt。

function isRunnable(job: Job, now: number): boolean { // 判断任务当前是否可运行。
  if (job.status !== "queued" && job.status !== "retrying") return false; // 只有 queued 与 retrying 能被 Worker 认领。
  return getRunnableAt(job) <= now; // 只有到期任务才允许被认领。
} // 结束 isRunnable。

function compareRunnableJobs(a: Job, b: Job): number { // 定义可运行任务排序规则。
  if (b.priority !== a.priority) return b.priority - a.priority; // 优先级更高的任务排在前面。
  const aRunAt = getRunnableAt(a); // 读取任务 a 的最早运行时间。
  const bRunAt = getRunnableAt(b); // 读取任务 b 的最早运行时间。
  if (aRunAt !== bRunAt) return aRunAt - bRunAt; // 同优先级时更早到期的任务排在前面。
  return a.createdAt - b.createdAt; // 再相同则保留 FIFO 顺序。
} // 结束 compareRunnableJobs。

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 创建时间线节点。
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点。
} // 结束 timeline。

export class QueueManager { // 定义第34天本地队列管理器。
  private queue: Job[] = []; // 使用数组保存待认领、定时与等待重试的任务。

  enqueue(job: Job): Job { // 定义入队方法。
    if (!this.queue.some((item) => item.id === job.id)) { // 避免同一任务重复入队。
      this.queue.push(job); // 将任务加入内存队列。
    } // 结束去重判断。
    return job; // 返回入队任务。
  } // 结束 enqueue。

  claimNextJob(workerId: string, now = Date.now()): Job | undefined { // 第34天：原子认领下一个可运行任务。
    const runnableJobs = this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs); // 找出到期任务并按优先级排序。
    const selected = runnableJobs[0]; // 取最高优先级的可运行任务。
    if (!selected) return undefined; // 没有可运行任务时返回空。
    const index = this.queue.findIndex((job) => job.id === selected.id); // 在原队列中定位选中任务。
    if (index < 0) return undefined; // 防御异常索引。
    const [job] = this.queue.splice(index, 1); // 从队列移除任务，保证其他 Worker 不能再拿到它。
    const lockedAt = Date.now(); // 记录认领锁定时间。
    return { // 返回带锁信息的 running 任务。
      ...job, // 保留原任务字段。
      status: "running", // 将状态改为执行中。
      workerId, // 写入认领 Worker ID。
      lockedAt, // 写入任务锁时间。
      updatedAt: lockedAt, // 写入更新时间。
      timeline: [...job.timeline, timeline("Claimed", `Worker ${workerId} 已认领任务并写入 job lock`)], // 写入认领时间线。
    }; // 结束认领任务对象。
  } // 结束 claimNextJob。

  peek(now = Date.now()): Job | undefined { // 定义查看下一个任务方法。
    return this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs)[0]; // 返回最高优先级可运行任务但不移除。
  } // 结束 peek。

  size(): number { // 定义队列长度方法。
    return this.queue.length; // 返回当前内存队列数量。
  } // 结束 size。

  list(): Job[] { // 定义队列快照方法。
    return [...this.queue].sort(compareRunnableJobs); // 返回排序后的队列副本。
  } // 结束 list。
} // 结束 QueueManager。
