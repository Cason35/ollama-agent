import { inferResourceType, LimitMetricsRecorder, RateLimiter, ResourceLimiter } from "@/lib/queue/resource-limiters"; // 引入第35天资源推断、资源限制、速率限制和指标记录器。
import type { BlockedReason, Job, JobTimelineItem } from "@/lib/queue/queue-types"; // 引入任务、时间线和阻塞原因类型。

function getRunnableAt(job: Job): number { // 计算任务最早可运行时间。
  return Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 同时兼容定时任务与重试退避任务。
} // 结束 getRunnableAt。

function isRunnable(job: Job, now: number): boolean { // 判断任务当前是否可被 Worker 认领。
  if (job.status !== "queued" && job.status !== "retrying") return false; // 只有 queued 和 retrying 能被 Worker 认领。
  return getRunnableAt(job) <= now; // 只有到期任务才允许被认领。
} // 结束 isRunnable。

function compareRunnableJobs(a: Job, b: Job): number { // 定义可运行任务排序规则。
  if (b.priority !== a.priority) return b.priority - a.priority; // 优先级更高的任务排在前面。
  const aRunAt = getRunnableAt(a); // 读取任务 a 的最早运行时间。
  const bRunAt = getRunnableAt(b); // 读取任务 b 的最早运行时间。
  if (aRunAt !== bRunAt) return aRunAt - bRunAt; // 同优先级时更早到期的任务排在前面。
  return a.createdAt - b.createdAt; // 再相同时保持 FIFO 顺序。
} // 结束 compareRunnableJobs。

function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 创建时间线节点。
  return { label, at: Date.now(), note }; // 返回带当前时间的时间线节点。
} // 结束 timeline。

export class QueueManager { // 定义第35天本地队列管理器。
  private queue: Job[] = []; // 使用数组保存待认领、定时与等待重试的任务。
  constructor( // 定义队列管理器构造函数。
    private readonly resourceLimiter: ResourceLimiter, // 注入资源并发限制器。
    private readonly rateLimiter: RateLimiter, // 注入速率限制器。
    private readonly metricsRecorder: LimitMetricsRecorder, // 注入限制器指标记录器。
    private readonly onBlockedJob?: (job: Job) => void // 注入阻塞任务回调，用于异步持久化 blockedReason。
  ) {} // 结束构造函数。
  enqueue(job: Job): Job { // 定义入队方法。
    if (!this.queue.some((item) => item.id === job.id)) { // 避免同一任务重复入队。
      this.queue.push(job); // 将任务加入内存队列。
    } // 结束去重判断。
    return job; // 返回入队任务。
  } // 结束 enqueue。
  claimNextJob(workerId: string, now = Date.now()): Job | undefined { // 第35天：认领下一个满足优先级、资源并发和速率限制的任务。
    const runnableJobs = this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs); // 找出到期任务并按优先级排序。
    for (const selected of runnableJobs) { // 按排序结果逐个尝试候选任务。
      const resourceType = inferResourceType(selected); // 推断候选任务需要的资源类型。
      if (!this.resourceLimiter.canRun(resourceType)) { // 判断资源并发是否已经满载。
        this.markBlocked(selected, "resource_limit", `等待 ${resourceType} 资源空闲后再认领`); // 记录资源并发阻塞原因。
        this.metricsRecorder.recordBlocked(resourceType, "resource_limit"); // 统计资源并发阻塞次数。
        continue; // 继续尝试后面的任务，避免一个资源卡住整个队列。
      } // 结束资源并发判断。
      if (!this.rateLimiter.allow(resourceType, now)) { // 判断当前时间窗口是否超过速率上限。
        this.markBlocked(selected, "rate_limit", `等待 ${resourceType} 速率窗口刷新后再认领`); // 记录速率阻塞原因。
        this.metricsRecorder.recordBlocked(resourceType, "rate_limit"); // 统计速率阻塞次数。
        continue; // 继续尝试后面的任务。
      } // 结束速率限制判断。
      const index = this.queue.findIndex((job) => job.id === selected.id); // 在原队列中定位选中任务。
      if (index < 0) continue; // 防御异常索引，继续尝试其他任务。
      const [job] = this.queue.splice(index, 1); // 从队列移除任务，保证其他 Worker 不能再拿到它。
      const lockedAt = Date.now(); // 记录认领锁定时间。
      const claimed: Job = { // 构造带锁信息的 running 任务。
        ...job, // 保留原任务字段。
        resourceType, // 写入最终资源类型。
        blockedReason: undefined, // 成功认领后清空阻塞原因。
        status: "running", // 将状态改为执行中。
        workerId, // 写入认领 Worker ID。
        lockedAt, // 写入任务锁时间。
        updatedAt: lockedAt, // 写入更新时间。
        timeline: [...job.timeline, timeline("Claimed", `Worker ${workerId} 已认领任务，并占用 ${resourceType} 资源额度`)], // 写入认领时间线。
      }; // 结束 claimed 任务对象。
      this.resourceLimiter.acquire(resourceType); // 成功认领后占用资源额度。
      this.metricsRecorder.recordAllowed(); // 统计一次成功放行。
      return claimed; // 返回认领任务。
    } // 结束候选任务遍历。
    return undefined; // 没有可运行且可通过限制的任务时返回空。
  } // 结束 claimNextJob。
  releaseJobResource(job: Job): void { // 第35天：释放任务占用的资源额度。
    this.resourceLimiter.release(inferResourceType(job)); // 根据任务资源类型释放资源占用。
  } // 结束 releaseJobResource。
  peek(now = Date.now()): Job | undefined { // 定义查看下一个到期任务方法。
    return this.queue.filter((job) => isRunnable(job, now)).sort(compareRunnableJobs)[0]; // 返回最高优先级可运行任务但不移除。
  } // 结束 peek。
  size(): number { // 定义队列长度方法。
    return this.queue.length; // 返回当前内存队列数量。
  } // 结束 size。
  list(): Job[] { // 定义队列快照方法。
    return [...this.queue].sort(compareRunnableJobs); // 返回排序后的队列副本。
  } // 结束 list。
  private markBlocked(job: Job, reason: BlockedReason, note: string): void { // 第35天：记录任务暂时无法运行的原因。
    const now = Date.now(); // 获取当前时间。
    job.blockedReason = reason; // 写入阻塞原因。
    job.updatedAt = now; // 更新任务更新时间。
    job.resourceType = inferResourceType(job); // 写入推断后的资源类型。
    const last = job.timeline[job.timeline.length - 1]; // 读取最近一条时间线。
    if (last?.label !== "Blocked" || last.note !== note) { // 避免每次轮询都追加完全相同的阻塞节点。
      job.timeline = [...job.timeline, timeline("Blocked", note)]; // 追加阻塞时间线节点。
    } // 结束去重判断。
    this.onBlockedJob?.({ ...job, timeline: [...job.timeline] }); // 通知外部异步持久化阻塞状态。
  } // 结束 markBlocked。
} // 结束 QueueManager。
