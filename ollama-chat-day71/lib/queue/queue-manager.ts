import { inferResourceType, LimitMetricsRecorder, RateLimiter, ResourceLimiter } from "@/lib/queue/resource-limiters"; // 第59天：引入资源推断、资源限制、速率限制和限制指标记录器。
import type { BlockedReason, Job, JobTimelineItem, QueueStore, RedisQueueExplorerSnapshot } from "@/lib/queue/queue-types"; // 第59天：引入任务、队列存储、时间线和 Redis 队列快照类型。
function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 第59天：创建任务时间线节点。
  return { label, at: Date.now(), note }; // 第59天：返回包含当前时间的时间线节点。
} // 第59天：结束时间线工具。
export class QueueManager { // 第59天：定义 Redis Queue 协调器，负责资源限制、速率限制和 QueueStore 调用。
  constructor( // 第59天：定义队列管理器构造函数。
    private readonly queueStore: QueueStore, // 第59天：注入 RedisQueueStore，真正的队列数据存放在 Redis List。
    private readonly resourceLimiter: ResourceLimiter, // 第59天：注入资源并发限制器。
    private readonly rateLimiter: RateLimiter, // 第59天：注入速率限制器。
    private readonly metricsRecorder: LimitMetricsRecorder, // 第59天：注入限制器指标记录器。
    private readonly onBlockedJob?: (job: Job) => void // 第59天：注入阻塞任务回调，用于异步持久化 blockedReason。
  ) {} // 第59天：结束构造函数。
  async enqueue(job: Job): Promise<Job> { // 第59天：把任务写入 Redis Waiting Queue。
    return await this.queueStore.enqueue(job); // 第59天：委托 QueueStore 执行入队。
  } // 第59天：结束入队方法。
  async cancelQueuedJob(job: Job): Promise<Job | undefined> { // 第59天：取消仍在 Redis Waiting Queue 中的任务。
    const removed = await this.queueStore.remove(job.id); // 第59天：先从 Redis 四个队列桶中移除该任务。
    if (!removed) return undefined; // 第59天：没有命中说明任务可能已被 Worker 领取，交给运行中取消流程。
    const now = Date.now(); // 第59天：获取当前时间戳。
    const cancelled: Job = { // 第59天：构造已取消任务快照。
      ...job, // 第59天：继承传入任务字段。
      status: "cancelled", // 第59天：将状态改为已取消。
      cancelRequestedAt: job.cancelRequestedAt ?? now, // 第59天：记录取消请求时间。
      cancelledAt: now, // 第59天：记录取消完成时间。
      blockedReason: undefined, // 第59天：清空阻塞原因。
      workerId: undefined, // 第59天：清空 Worker 归属。
      lockedAt: undefined, // 第59天：清空任务锁。
      nextRunAt: undefined, // 第59天：清空重试时间。
      scheduledAt: undefined, // 第59天：清空定时时间。
      completedAt: now, // 第59天：把完成时间标记为取消完成时间。
      updatedAt: now, // 第59天：更新时间。
      timeline: [...job.timeline, timeline("CancelRequested", "用户取消了 Redis Waiting Queue 中尚未运行的任务"), timeline("Cancelled", "任务尚未运行，已从 Redis Queue 删除并标记为 cancelled")], // 第59天：追加取消生命周期事件。
    }; // 第59天：结束已取消任务构造。
    await this.queueStore.fail(cancelled); // 第59天：把取消结果归档到 Dead Letter Queue，方便 Queue Explorer 查看终态。
    return cancelled; // 第59天：返回已取消任务，交给运行时持久化。
  } // 第59天：结束取消等待任务方法。
  async claimNextJob(workerId: string, now = Date.now()): Promise<Job | undefined> { // 第59天：认领下一个满足资源与速率限制的 Redis Queue 任务。
    const maxAttempts = Math.max(1, await this.queueStore.size().catch(() => 0)); // 第59天：最多尝试等待队列长度次，避免资源受限任务造成死循环。
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) { // 第59天：逐个尝试可运行候选任务。
      const selected = await this.queueStore.dequeue(workerId, now); // 第59天：从 Redis Waiting Queue 移动一个候选任务到 Processing Queue。
      if (!selected) return undefined; // 第59天：没有可运行任务时结束认领。
      const resourceType = inferResourceType(selected); // 第59天：推断候选任务需要的资源类型。
      if (!this.resourceLimiter.canRun(resourceType)) { // 第59天：判断资源并发是否已满。
        const blocked = this.markBlocked(selected, "resource_limit", `等待 ${resourceType} 资源空闲后再认领`); // 第59天：构造资源阻塞任务。
        this.metricsRecorder.recordBlocked(resourceType, "resource_limit"); // 第59天：统计资源阻塞次数。
        await this.queueStore.retry(blocked); // 第59天：把阻塞任务从 Processing Queue 放回 Waiting Queue。
        continue; // 第59天：继续尝试其他候选任务。
      } // 第59天：结束资源并发判断。
      if (!this.rateLimiter.allow(resourceType, now)) { // 第59天：判断当前速率窗口是否允许运行。
        const blocked = this.markBlocked(selected, "rate_limit", `等待 ${resourceType} 速率窗口刷新后再认领`); // 第59天：构造限流阻塞任务。
        this.metricsRecorder.recordBlocked(resourceType, "rate_limit"); // 第59天：统计限流阻塞次数。
        await this.queueStore.retry(blocked); // 第59天：把限流任务从 Processing Queue 放回 Waiting Queue。
        continue; // 第59天：继续尝试其他候选任务。
      } // 第59天：结束速率限制判断。
      this.resourceLimiter.acquire(resourceType); // 第59天：成功认领后占用资源额度。
      this.metricsRecorder.recordAllowed(); // 第59天：统计一次成功放行。
      return { ...selected, resourceType }; // 第59天：返回写入资源类型后的任务。
    } // 第59天：结束候选任务尝试循环。
    return undefined; // 第59天：所有候选都暂时受限时返回空。
  } // 第59天：结束任务认领方法。
  releaseJobResource(job: Job): void { // 第59天：释放任务占用的资源额度。
    this.resourceLimiter.release(inferResourceType(job)); // 第59天：根据任务资源类型释放资源占用。
  } // 第59天：结束资源释放方法。
  async ackJob(job: Job): Promise<boolean> { // 第59天：确认任务成功完成。
    return await this.queueStore.ack(job); // 第59天：委托 RedisQueueStore 从 Processing 移到 Completed。
  } // 第59天：结束 ACK 方法。
  async retryJob(job: Job): Promise<Job> { // 第59天：把可重试任务放回 Redis Waiting Queue。
    return await this.queueStore.retry(job); // 第59天：委托 RedisQueueStore 执行 retry。
  } // 第59天：结束重试回队方法。
  async failJob(job: Job): Promise<Job> { // 第59天：把终态失败、取消或超时任务归档到 Dead Letter Queue。
    return await this.queueStore.fail(job); // 第59天：委托 RedisQueueStore 执行 fail 归档。
  } // 第59天：结束失败归档方法。
  async deleteJob(jobId: string): Promise<boolean> { // 第59天：从 Redis Queue 中删除指定任务。
    return await this.queueStore.remove(jobId); // 第59天：委托 RedisQueueStore 跨桶删除。
  } // 第59天：结束任务删除方法。
  async recoverExpiredProcessing(now = Date.now()): Promise<Job[]> { // 第59天：恢复超过 Visibility Timeout 的 Processing Job。
    const recovered = await this.queueStore.recoverExpired(now); // 第59天：委托 RedisQueueStore 恢复过期任务。
    recovered.forEach((job) => this.releaseJobResource(job)); // 第59天：释放这些任务可能占用的资源额度。
    return recovered; // 第59天：返回恢复后的任务列表。
  } // 第59天：结束可见性超时恢复。
  async peek(now = Date.now()): Promise<Job | undefined> { // 第59天：查看下一个可运行任务。
    return (await this.queueStore.peek(now)) ?? undefined; // 第59天：委托 RedisQueueStore 读取候选任务。
  } // 第59天：结束 peek 方法。
  async size(): Promise<number> { // 第59天：读取 Redis Waiting Queue 长度。
    return await this.queueStore.size(); // 第59天：委托 RedisQueueStore 读取长度。
  } // 第59天：结束 size 方法。
  async snapshot(): Promise<RedisQueueExplorerSnapshot> { // 第59天：读取 Queue Explorer 快照。
    return await this.queueStore.snapshot(); // 第59天：委托 RedisQueueStore 返回四个队列桶和 Trace。
  } // 第59天：结束快照方法。
  private markBlocked(job: Job, reason: BlockedReason, note: string): Job { // 第59天：记录任务暂时无法运行的原因。
    const now = Date.now(); // 第59天：获取当前时间。
    const last = job.timeline[job.timeline.length - 1]; // 第59天：读取最近一条时间线。
    const timelineItems = last?.label !== "Blocked" || last.note !== note ? [...job.timeline, timeline("Blocked", note)] : job.timeline; // 第59天：避免每次轮询都追加相同阻塞节点。
    const blocked: Job = { ...job, status: job.status === "running" ? "queued" : job.status, blockedReason: reason, workerId: undefined, lockedAt: undefined, nextRunAt: now + 500, updatedAt: now, resourceType: inferResourceType(job), timeline: timelineItems }; // 第59天：构造回到等待队列的阻塞任务，并短暂延后避免同一轮反复抢占。
    this.onBlockedJob?.(blocked); // 第59天：通知外部异步持久化阻塞状态。
    return blocked; // 第59天：返回阻塞任务。
  } // 第59天：结束阻塞记录。
} // 第59天：结束 QueueManager。
