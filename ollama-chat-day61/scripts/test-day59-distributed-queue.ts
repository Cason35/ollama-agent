import assert from "node:assert/strict"; /* 第59天：引入 Node.js 严格断言工具。 */
import { RedisClient } from "../lib/redis/redis-client"; /* 第59天：引入 RedisClient，使用测试专属命名空间隔离真实 Redis 数据。 */
import { deserializeJob, serializeJob } from "../lib/queue/job-serialization"; /* 第59天：引入 Job 序列化与反序列化工具。 */
import { RedisQueueStore } from "../lib/queue/redis-queue-store"; /* 第59天：引入 RedisQueueStore，验证 Redis List 分布式队列行为。 */
import type { Job, JobTimelineItem, JobType } from "../lib/queue/queue-types"; /* 第59天：引入 Job 类型与任务类型。 */
function timeline(label: JobTimelineItem["label"], note: string): JobTimelineItem { /* 第59天：定义测试用时间线节点工具。 */
  return { label, at: Date.now(), note }; /* 第59天：返回带当前时间的测试时间线节点。 */
} /* 第59天：结束测试时间线工具。 */
function createTestJob(id: string, type: JobType = "chat", priority = 5): Job { /* 第59天：定义测试 Job 构造函数。 */
  const now = Date.now(); /* 第59天：记录任务创建时间。 */
  return { id, type, payload: { source: "day59-test" }, priority, status: "queued", attempts: 0, maxAttempts: 3, createdAt: now, updatedAt: now, timeline: [timeline("Created", `测试任务 ${id} 已创建`)] }; /* 第59天：返回最小可运行 Job。 */
} /* 第59天：结束测试 Job 构造函数。 */
async function testJobSerialization(): Promise<void> { /* 第59天：定义 Job Serialization 单元测试。 */
  const job = createTestJob("serialize_job"); /* 第59天：创建测试任务。 */
  const raw = serializeJob(job); /* 第59天：把 Job 序列化为 JSON 字符串。 */
  const restored = deserializeJob(raw); /* 第59天：把 JSON 字符串反序列化回 Job。 */
  assert.equal(restored?.id, job.id, "deserializeJob 应恢复 Job ID"); /* 第59天：验证任务 ID。 */
  assert.equal(restored?.status, "queued", "deserializeJob 应恢复 Job 状态"); /* 第59天：验证任务状态。 */
  assert.equal(deserializeJob("{bad json"), null, "deserializeJob 应安全处理非法 JSON"); /* 第59天：验证非法 JSON 不会抛异常。 */
} /* 第59天：结束 Job Serialization 单元测试。 */
async function testRedisQueueStoreIfAvailable(): Promise<void> { /* 第59天：定义 RedisQueueStore 集成测试。 */
  const client = new RedisClient({ keyPrefix: `ollama:day59:test:${Date.now()}:`, operationTimeoutMs: 800 }); /* 第59天：创建测试专属 RedisClient 命名空间。 */
  try { /* 第59天：确保测试结束后断开 Redis 连接。 */
    try { /* 第59天：检查真实 Redis 是否可用。 */
      await client.ping(); /* 第59天：执行 Redis PING。 */
    } catch (error) { /* 第59天：Redis 不可用时跳过真实队列测试。 */
      console.warn(`Redis 未启动，跳过 RedisQueueStore 真实队列测试：${error instanceof Error ? error.message : String(error)}`); /* 第59天：输出跳过原因。 */
      return; /* 第59天：跳过真实 Redis 依赖测试。 */
    } /* 第59天：结束 Redis 健康检查。 */
    const store = new RedisQueueStore(client, 20); /* 第59天：创建 20ms 可见性超时的测试队列。 */
    const low = createTestJob("job_low", "chat", 1); /* 第59天：创建低优先级任务。 */
    const high = createTestJob("job_high", "chat", 10); /* 第59天：创建高优先级任务。 */
    await store.enqueue(low); /* 第59天：写入低优先级任务到 Waiting Queue。 */
    await store.enqueue(high); /* 第59天：写入高优先级任务到 Waiting Queue。 */
    assert.equal(await store.size(), 2, "RedisQueueStore.size 应统计 Waiting Queue 长度"); /* 第59天：验证等待队列长度。 */
    assert.equal((await store.peek())?.id, high.id, "RedisQueueStore.peek 应优先返回高优先级任务"); /* 第59天：验证优先级选择。 */
    const claimedHigh = await store.dequeue("worker_a"); /* 第59天：Worker A 领取高优先级任务。 */
    assert.equal(claimedHigh?.id, high.id, "dequeue 应领取最高优先级任务"); /* 第59天：验证高优先级先出队。 */
    assert.equal(claimedHigh?.status, "running", "dequeue 后任务应进入 running 状态"); /* 第59天：验证 Processing 状态。 */
    const completedHigh: Job = { ...claimedHigh!, status: "success", completedAt: Date.now(), updatedAt: Date.now(), timeline: [...claimedHigh!.timeline, timeline("Completed", "测试任务已 ACK 完成")] }; /* 第59天：构造成功任务。 */
    assert.equal(await store.ack(completedHigh), true, "ACK 应从 Processing Queue 移除任务"); /* 第59天：验证 ACK 移除 Processing。 */
    const retrySource = createTestJob("job_retry", "unstable", 5); /* 第59天：创建需要重试的任务。 */
    await store.enqueue(retrySource); /* 第59天：写入重试任务。 */
    const claimedRetry = await store.dequeue("worker_b"); /* 第59天：Worker B 领取重试任务。 */
    const retrying: Job = { ...claimedRetry!, status: "retrying", attempts: 1, workerId: undefined, lockedAt: undefined, nextRunAt: Date.now(), updatedAt: Date.now(), timeline: [...claimedRetry!.timeline, timeline("RetryScheduled", "测试任务安排重试")] }; /* 第59天：构造 retrying 任务。 */
    await store.retry(retrying); /* 第59天：把任务放回 Waiting Queue。 */
    assert.equal((await store.dequeue("worker_c"))?.id, retrySource.id, "retry 后任务应能再次被 Worker 领取"); /* 第59天：验证 Retry 回队。 */
    const timeoutSource = createTestJob("job_timeout", "embedding", 5); /* 第59天：创建可见性超时任务。 */
    await store.enqueue(timeoutSource); /* 第59天：写入可见性超时任务。 */
    const claimedTimeout = await store.dequeue("worker_timeout"); /* 第59天：Worker 领取但不 ACK。 */
    assert.equal(claimedTimeout?.id, timeoutSource.id, "可见性超时任务应先进入 Processing"); /* 第59天：验证任务进入 Processing。 */
    await new Promise((resolve) => setTimeout(resolve, 30)); /* 第59天：等待超过测试可见性超时。 */
    const recovered = await store.recoverExpired(Date.now()); /* 第59天：触发 Visibility Timeout 恢复。 */
    assert.ok(recovered.some((job) => job.id === timeoutSource.id), "超时 Processing 任务应恢复到 Waiting Queue"); /* 第59天：验证超时恢复。 */
    const failedSource = createTestJob("job_dead", "alwaysFail", 5); /* 第59天：创建死信任务。 */
    await store.enqueue(failedSource); /* 第59天：写入死信任务。 */
    const claimedDead = await store.dequeue("worker_dead"); /* 第59天：领取死信任务。 */
    const dead: Job = { ...claimedDead!, status: "dead_letter", error: "forced failure", completedAt: Date.now(), updatedAt: Date.now(), timeline: [...claimedDead!.timeline, timeline("DeadLetter", "测试任务进入死信队列")] }; /* 第59天：构造死信任务。 */
    await store.fail(dead); /* 第59天：把死信任务归档到 Dead Letter Queue。 */
    const snapshot = await store.snapshot(); /* 第59天：读取 Queue Explorer 快照。 */
    assert.equal(snapshot.metrics.completed, 1, "Queue Metrics 应统计 Completed Queue"); /* 第59天：验证完成指标。 */
    assert.ok(snapshot.metrics.failed >= 1, "Queue Metrics 应统计 Dead Letter Queue"); /* 第59天：验证死信指标。 */
    assert.ok(snapshot.operations.some((op) => op.operation === "enqueue"), "Queue Trace 应记录 enqueue"); /* 第59天：验证入队追踪。 */
    assert.ok(snapshot.operations.some((op) => op.operation === "dequeue"), "Queue Trace 应记录 dequeue"); /* 第59天：验证出队追踪。 */
    assert.ok(snapshot.operations.some((op) => op.operation === "ack"), "Queue Trace 应记录 ack"); /* 第59天：验证 ACK 追踪。 */
    assert.equal(await store.remove(dead.id), true, "remove 应删除指定 Job"); /* 第59天：验证 Delete 动作。 */
  } finally { /* 第59天：清理 Redis 连接。 */
    await client.disconnect(); /* 第59天：断开测试 Redis 连接，避免进程悬挂。 */
  } /* 第59天：结束资源清理。 */
} /* 第59天：结束 RedisQueueStore 集成测试。 */
async function main(): Promise<void> { /* 第59天：定义自动化验收主入口。 */
  await testJobSerialization(); /* 第59天：执行 Job Serialization 测试。 */
  await testRedisQueueStoreIfAvailable(); /* 第59天：执行 RedisQueueStore 集成测试。 */
  console.log("Day 59 Distributed Queue tests passed."); /* 第59天：输出测试通过信息。 */
} /* 第59天：结束自动化验收主入口。 */
void main().catch((error: unknown) => { /* 第59天：启动测试并捕获异步错误。 */
  console.error(error); /* 第59天：输出失败原因。 */
  process.exitCode = 1; /* 第59天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第59天：结束错误处理。 */
