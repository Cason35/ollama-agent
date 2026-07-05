import { redisClient, type RedisClient } from "@/lib/redis/redis-client"; // 第59天：引入 RedisClient，所有 Redis List 操作都通过统一封装执行。
import { deserializeJob, serializeJob } from "@/lib/queue/job-serialization"; // 第59天：引入 Job 序列化与反序列化函数。
import type { Job, JobTimelineItem, QueueBucketName, QueueOperationName, QueueOperationTrace, QueueStore, RedisQueueExplorerSnapshot, RedisQueueMetrics } from "@/lib/queue/queue-types"; // 第59天：引入队列存储、任务、指标和追踪类型。
const DEFAULT_VISIBILITY_TIMEOUT_MS = 30 * 1000; // 第59天：定义默认 Visibility Timeout（可见性超时）为 30 秒。
const MAX_BUCKET_JOBS = 80; // 第59天：限制 Queue Explorer 每个桶最多展示 80 个任务，避免页面过重。
function getRunnableAt(job: Job): number { // 第59天：计算 Job 最早可运行时间。
  return Math.max(job.scheduledAt ?? 0, job.nextRunAt ?? 0); // 第59天：同时兼容定时任务和 retry backoff。
} // 第59天：结束最早可运行时间计算。
function isRunnable(job: Job, now: number): boolean { // 第59天：判断 Job 当前是否允许被 Worker 认领。
  if (job.status !== "queued" && job.status !== "retrying") return false; // 第59天：只有 queued 和 retrying 能进入消费流程。
  return getRunnableAt(job) <= now; // 第59天：只有到达运行时间的任务才可见。
} // 第59天：结束可运行判断。
function compareRunnableJobs(a: Job, b: Job): number { // 第59天：定义 Redis Queue 的候选任务排序规则。
  if (b.priority !== a.priority) return b.priority - a.priority; // 第59天：优先级更高的任务先被认领。
  const aRunAt = getRunnableAt(a); // 第59天：读取任务 a 的可运行时间。
  const bRunAt = getRunnableAt(b); // 第59天：读取任务 b 的可运行时间。
  if (aRunAt !== bRunAt) return aRunAt - bRunAt; // 第59天：同优先级时更早到期的任务先运行。
  return a.createdAt - b.createdAt; // 第59天：再相同时按创建时间保持 FIFO。
} // 第59天：结束候选任务排序规则。
function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { // 第59天：创建 Job 时间线节点。
  return { label, at: Date.now(), note }; // 第59天：返回带当前时间戳的时间线节点。
} // 第59天：结束时间线节点工具。
type RawJobEntry = { raw: string; job: Job }; // 第59天：定义 Redis List 原始字符串与反序列化 Job 的配对结构。
export class RedisQueueStore implements QueueStore { // 第59天：实现基于 Redis List 的 QueueStore。
  private readonly keys = { waiting: "queue:waiting", processing: "queue:processing", completed: "queue:completed", deadLetter: "queue:dead-letter" } satisfies Record<QueueBucketName, string>; // 第59天：定义四个 Redis List 逻辑 Key。
  private readonly operations: QueueOperationTrace[] = []; // 第59天：保存最近 Queue Operation Trace。
  private sequence = 0; // 第59天：保存队列操作递增序号。
  constructor(private readonly client: RedisClient = redisClient, private readonly visibilityTimeoutMs = Number(process.env.QUEUE_VISIBILITY_TIMEOUT_MS ?? DEFAULT_VISIBILITY_TIMEOUT_MS)) {} // 第59天：默认使用共享 RedisClient，并允许环境变量覆盖可见性超时。
  async enqueue(job: Job): Promise<Job> { // 第59天：把 Job 写入 Waiting Queue（等待队列）。
    return await this.traced("enqueue", job.id, "waiting", undefined, async () => { // 第59天：记录 enqueue 操作追踪。
      await this.removeJobIdFromAllBuckets(job.id); // 第59天：入队前先移除同 ID 旧副本，避免重复消费。
      await this.client.lpush(this.keys.waiting, serializeJob(job)); // 第59天：使用 LPUSH 把序列化 Job 写入等待队列左侧。
      return job; // 第59天：返回入队后的 Job。
    }); // 第59天：结束 enqueue 追踪包装。
  } // 第59天：结束入队方法。
  async dequeue(workerId: string, now = Date.now()): Promise<Job | null> { // 第59天：由 Worker 从 Waiting Queue 领取一个可运行 Job。
    return await this.traced("dequeue", undefined, "processing", workerId, async () => { // 第59天：记录 dequeue 操作追踪。
      const entries = await this.readBucketEntries("waiting"); // 第59天：读取等待队列中的全部候选任务。
      const runnable = entries.filter((entry) => isRunnable(entry.job, now)).sort((a, b) => compareRunnableJobs(a.job, b.job)); // 第59天：筛出可见任务并按优先级排序。
      for (const entry of runnable) { // 第59天：逐个尝试候选任务，处理并发 Worker 竞争。
        const removed = await this.client.lrem(this.keys.waiting, 1, entry.raw); // 第59天：用 LREM 原子移除候选 JSON，只有一个 Worker 会成功。
        if (removed <= 0) continue; // 第59天：移除失败说明已被其他 Worker 抢走，继续尝试下一个候选。
        const lockedAt = Date.now(); // 第59天：记录领取时间。
        const claimed: Job = { ...entry.job, status: "running", workerId, lockedAt, blockedReason: undefined, updatedAt: lockedAt, timeline: [...entry.job.timeline, timeline("Claimed", `Worker ${workerId} 已从 Redis Waiting Queue 领取任务，并移动到 Processing Queue`)] }; // 第59天：构造 Processing Queue 中的运行中任务。
        await this.client.lpush(this.keys.processing, serializeJob(claimed)); // 第59天：把已领取任务写入 Processing Queue。
        return claimed; // 第59天：返回领取成功的任务。
      } // 第59天：结束候选任务遍历。
      return null; // 第59天：没有可运行任务时返回 null。
    }); // 第59天：结束 dequeue 追踪包装。
  } // 第59天：结束出队方法。
  async peek(now = Date.now()): Promise<Job | null> { // 第59天：查看下一个可运行任务但不移动队列。
    return await this.traced("peek", undefined, "waiting", undefined, async () => { // 第59天：记录 peek 操作追踪。
      const entries = await this.readBucketEntries("waiting"); // 第59天：读取等待队列候选任务。
      return entries.map((entry) => entry.job).filter((job) => isRunnable(job, now)).sort(compareRunnableJobs)[0] ?? null; // 第59天：返回最高优先级可见任务。
    }); // 第59天：结束 peek 追踪包装。
  } // 第59天：结束 peek 方法。
  async size(): Promise<number> { // 第59天：读取 Waiting Queue 长度。
    return await this.client.llen(this.keys.waiting); // 第59天：通过 LLEN 返回等待队列长度。
  } // 第59天：结束 size 方法。
  async ack(job: Job): Promise<boolean> { // 第59天：ACK 成功任务并归档到 Completed Queue。
    return await this.traced("ack", job.id, "completed", job.workerId, async () => { // 第59天：记录 ACK 操作追踪。
      const removed = await this.removeJobIdFromBucket("processing", job.id); // 第59天：从 Processing Queue 移除该任务。
      await this.client.rpush(this.keys.completed, serializeJob(job)); // 第59天：使用 RPUSH 追加到 Completed Queue，保留完成历史。
      return removed; // 第59天：返回 Processing 中是否移除了任务。
    }); // 第59天：结束 ACK 追踪包装。
  } // 第59天：结束 ACK 方法。
  async retry(job: Job): Promise<Job> { // 第59天：把失败但可重试任务从 Processing 放回 Waiting。
    return await this.traced("retry", job.id, "waiting", job.workerId, async () => { // 第59天：记录 retry 操作追踪。
      await this.removeJobIdFromBucket("processing", job.id); // 第59天：先从 Processing Queue 移除旧运行副本。
      await this.removeJobIdFromBucket("waiting", job.id); // 第59天：再清理 Waiting Queue 旧副本，避免重复。
      await this.client.lpush(this.keys.waiting, serializeJob(job)); // 第59天：把更新后的 retrying Job 放回 Waiting Queue。
      return job; // 第59天：返回重新入队任务。
    }); // 第59天：结束 retry 追踪包装。
  } // 第59天：结束 retry 方法。
  async fail(job: Job): Promise<Job> { // 第59天：把最终失败、取消或超时任务归档到 Dead Letter Queue。
    return await this.traced("fail", job.id, "deadLetter", job.workerId, async () => { // 第59天：记录 fail 操作追踪。
      await this.removeJobIdFromBucket("processing", job.id); // 第59天：从 Processing Queue 移除运行副本。
      await this.removeJobIdFromBucket("waiting", job.id); // 第59天：清理等待队列中可能残留的副本。
      await this.client.rpush(this.keys.deadLetter, serializeJob(job)); // 第59天：把终态任务追加到 Dead Letter Queue。
      return job; // 第59天：返回终态任务。
    }); // 第59天：结束 fail 追踪包装。
  } // 第59天：结束 fail 方法。
  async remove(jobId: string): Promise<boolean> { // 第59天：从所有 Redis 队列桶中删除指定 Job。
    return await this.traced("delete", jobId, undefined, undefined, async () => { // 第59天：记录 delete 操作追踪。
      return await this.removeJobIdFromAllBuckets(jobId); // 第59天：执行跨桶删除并返回是否命中。
    }); // 第59天：结束 delete 追踪包装。
  } // 第59天：结束 remove 方法。
  async recoverExpired(now = Date.now()): Promise<Job[]> { // 第59天：恢复超过 Visibility Timeout 的 Processing Job。
    return await this.traced("recover", undefined, "processing", undefined, async () => { // 第59天：记录 recover 操作追踪。
      const entries = await this.readBucketEntries("processing"); // 第59天：读取处理中队列。
      const expired = entries.filter((entry) => typeof entry.job.lockedAt === "number" && now - entry.job.lockedAt > this.visibilityTimeoutMs); // 第59天：筛出超过可见性超时的任务。
      const recovered: Job[] = []; // 第59天：准备保存恢复后的任务。
      for (const entry of expired) { // 第59天：逐个恢复超时任务。
        const removed = await this.client.lrem(this.keys.processing, 1, entry.raw); // 第59天：从 Processing Queue 移除过期副本。
        if (removed <= 0) continue; // 第59天：并发情况下若已被移除则跳过。
        const next: Job = { ...entry.job, status: "retrying", workerId: undefined, lockedAt: undefined, nextRunAt: now, updatedAt: now, timeline: [...entry.job.timeline, timeline("StaleRecovered", `Visibility Timeout 超过 ${this.visibilityTimeoutMs}ms，任务已回到 Waiting Queue`)] }; // 第59天：构造恢复为 retrying 的任务。
        await this.client.lpush(this.keys.waiting, serializeJob(next)); // 第59天：把恢复任务写回 Waiting Queue。
        recovered.push(next); // 第59天：记录恢复结果。
      } // 第59天：结束过期任务遍历。
      return recovered; // 第59天：返回已恢复任务列表。
    }); // 第59天：结束 recover 追踪包装。
  } // 第59天：结束 recoverExpired 方法。
  async snapshot(): Promise<RedisQueueExplorerSnapshot> { // 第59天：读取 Queue Explorer 完整快照。
    const buckets = await Promise.all((["waiting", "processing", "completed", "deadLetter"] as QueueBucketName[]).map(async (name) => ({ name, jobs: (await this.readBucketEntries(name)).map((entry) => entry.job).slice(0, MAX_BUCKET_JOBS) }))); // 第59天：并发读取四个队列桶。
    const metrics = await this.metricsFromBuckets(buckets); // 第59天：根据桶数据计算队列指标。
    return { backend: "redis-list", namespace: this.client.getNamespace(), keys: this.keys, buckets, metrics, operations: this.getOperationTraces(), generatedAt: Date.now() }; // 第59天：返回队列快照。
  } // 第59天：结束 snapshot 方法。
  getOperationTraces(): QueueOperationTrace[] { // 第59天：读取最近 Queue Operation Trace。
    return [...this.operations].sort((a, b) => b.createdAt - a.createdAt); // 第59天：按时间倒序返回追踪副本。
  } // 第59天：结束队列追踪读取。
  private async readBucketEntries(bucket: QueueBucketName): Promise<RawJobEntry[]> { // 第59天：读取指定 Redis List 并反序列化为 Job。
    const raws = await this.client.lrange(this.keys[bucket], 0, -1); // 第59天：读取队列桶中的全部 JSON 字符串。
    return raws.map((raw) => ({ raw, job: deserializeJob(raw) })).filter((entry): entry is RawJobEntry => entry.job !== null); // 第59天：过滤坏数据并保留原始字符串。
  } // 第59天：结束队列桶读取。
  private async removeJobIdFromBucket(bucket: QueueBucketName, jobId: string): Promise<boolean> { // 第59天：从单个队列桶按 Job ID 删除所有副本。
    const entries = await this.readBucketEntries(bucket); // 第59天：读取队列桶内容。
    const matches = entries.filter((entry) => entry.job.id === jobId); // 第59天：找出同 ID 的原始 JSON。
    let removed = false; // 第59天：记录是否删除过元素。
    for (const entry of matches) { // 第59天：逐个删除匹配副本。
      const count = await this.client.lrem(this.keys[bucket], 0, entry.raw); // 第59天：删除所有完全相同的 JSON 字符串。
      removed = removed || count > 0; // 第59天：合并删除结果。
    } // 第59天：结束删除副本遍历。
    return removed; // 第59天：返回是否命中过任务。
  } // 第59天：结束单桶删除。
  private async removeJobIdFromAllBuckets(jobId: string): Promise<boolean> { // 第59天：从四个队列桶中删除指定 Job。
    const results = await Promise.all((["waiting", "processing", "completed", "deadLetter"] as QueueBucketName[]).map(async (bucket) => await this.removeJobIdFromBucket(bucket, jobId))); // 第59天：并发执行跨桶删除。
    return results.some(Boolean); // 第59天：任意桶命中即视为删除成功。
  } // 第59天：结束跨桶删除。
  private async metricsFromBuckets(buckets: { name: QueueBucketName; jobs: Job[] }[]): Promise<RedisQueueMetrics> { // 第59天：根据 Queue Explorer 桶数据计算指标。
    const now = Date.now(); // 第59天：获取当前时间。
    const waitingJobs = buckets.find((bucket) => bucket.name === "waiting")?.jobs ?? []; // 第59天：读取等待队列任务。
    const processingJobs = buckets.find((bucket) => bucket.name === "processing")?.jobs ?? []; // 第59天：读取处理中任务。
    const completedJobs = buckets.find((bucket) => bucket.name === "completed")?.jobs ?? []; // 第59天：读取完成任务。
    const failedJobs = buckets.find((bucket) => bucket.name === "deadLetter")?.jobs ?? []; // 第59天：读取死信任务。
    const avgWaitTime = waitingJobs.length ? Math.round(waitingJobs.reduce((sum, job) => sum + Math.max(0, now - job.createdAt), 0) / waitingJobs.length) : 0; // 第59天：计算平均等待时长。
    const avgProcessingTime = processingJobs.length ? Math.round(processingJobs.reduce((sum, job) => sum + Math.max(0, now - (job.lockedAt ?? job.updatedAt)), 0) / processingJobs.length) : 0; // 第59天：计算平均处理时长。
    return { waiting: waitingJobs.length, processing: processingJobs.length, completed: completedJobs.length, failed: failedJobs.length, avgWaitTime, avgProcessingTime }; // 第59天：返回 Redis Queue Metrics。
  } // 第59天：结束指标计算。
  private async traced<T>(operation: QueueOperationName, jobId: string | undefined, bucket: QueueBucketName | undefined, workerId: string | undefined, action: () => Promise<T>): Promise<T> { // 第59天：统一包装 Queue Operation Trace。
    const startedAt = Date.now(); // 第59天：记录操作开始时间。
    try { // 第59天：捕获队列操作异常。
      const result = await action(); // 第59天：执行真实队列操作。
      this.recordOperation(operation, jobId, bucket, workerId, "success", `${operation} 执行成功`, Date.now() - startedAt); // 第59天：记录成功追踪。
      return result; // 第59天：返回操作结果。
    } catch (error) { // 第59天：处理队列操作失败。
      this.recordOperation(operation, jobId, bucket, workerId, "failed", error instanceof Error ? error.message : String(error), Date.now() - startedAt); // 第59天：记录失败追踪和错误原因。
      throw error; // 第59天：继续抛出错误交给上层决定是否降级。
    } // 第59天：结束异常处理。
  } // 第59天：结束 Trace 包装器。
  private recordOperation(operation: QueueOperationName, jobId: string | undefined, bucket: QueueBucketName | undefined, workerId: string | undefined, status: "success" | "failed", note: string, latencyMs: number): void { // 第59天：写入单条 Queue Operation Trace。
    this.sequence += 1; // 第59天：递增队列操作序号。
    this.operations.unshift({ id: `queue-op-${Date.now()}-${this.sequence}`, operation, jobId, workerId, bucket, status, note, latencyMs, createdAt: Date.now() }); // 第59天：把本次操作写入追踪列表头部。
    if (this.operations.length > 120) this.operations.pop(); // 第59天：只保留最近 120 条追踪，避免长期运行内存增长。
  } // 第59天：结束 Trace 写入方法。
} // 第59天：结束 RedisQueueStore。
