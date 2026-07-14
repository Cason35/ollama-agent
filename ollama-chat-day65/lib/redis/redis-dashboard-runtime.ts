import { redisClient } from "@/lib/redis/redis-client"; /* 第58天：引入共享 RedisClient，用于读取 Key、TTL、Type、Memory 和操作追踪。 */
import { redisHealthCheck } from "@/lib/redis/redis-health"; /* 第58天：引入 RedisHealthCheck，用于 Explorer 首屏展示健康状态。 */
import type { RedisExplorerSnapshot, RedisKeySummary } from "@/lib/redis/redis-types"; /* 第58天：引入 Redis Explorer 快照和 Key 摘要类型。 */
const DEMO_KEYS = ["day59:demo:queue", "day59:demo:processing", "day59:demo:dead-letter"]; /* 第59天：定义 Redis Explorer 演示 Key，全部在 Day59 命名空间内。 */
export async function seedRedisDemoKeys(): Promise<void> { /* 第59天：定义写入 Redis 演示 Key 的函数。 */
  await redisClient.set(DEMO_KEYS[0], JSON.stringify({ purpose: "redis-queue", day: 59 }), 3600); /* 第59天：写入模拟 Redis Queue（Redis 队列）Key 并设置一小时 TTL。 */
  await redisClient.set(DEMO_KEYS[1], JSON.stringify({ workerId: "worker_1", status: "processing" }), 1800); /* 第59天：写入模拟 Processing Queue（处理中队列）Key 并设置半小时 TTL。 */
  await redisClient.set(DEMO_KEYS[2], JSON.stringify({ failedJobs: 1, bucket: "dead-letter" }), 60); /* 第59天：写入模拟 Dead Letter（死信队列）Key 并设置一分钟 TTL。 */
} /* 第59天：结束 Redis 演示 Key 写入函数。 */
export async function getRedisExplorerSnapshot(forceSeed = false): Promise<RedisExplorerSnapshot> { /* 第58天：定义读取 Redis Explorer（Redis 浏览器）快照的入口。 */
  const health = await redisHealthCheck.getSnapshot(); /* 第58天：先执行健康检查，避免 Redis 未启动时页面直接报错。 */
  if (forceSeed && health.healthy) await seedRedisDemoKeys(); /* 第58天：用户点击刷新演示时，仅在 Redis 健康时写入示例 Key。 */
  const keys = health.healthy ? await redisClient.keys("*").catch(() => []) : []; /* 第58天：健康时读取命名空间 Key 列表，不健康时返回空列表。 */
  const summaries = await Promise.all(keys.map(async (key) => await summarizeRedisKey(key))); /* 第58天：并发读取每个 Key 的 TTL、类型与大小。 */
  const metrics = await redisClient.getMetrics(keys).catch(() => ({ totalKeys: 0, hitRate: 0, missRate: 0, avgLatency: 0, memoryUsage: 0 })); /* 第58天：读取 Redis Metrics，失败时返回空指标。 */
  return { health, keys: summaries, metrics, operations: redisClient.getOperationTraces(), namespace: redisClient.getNamespace(), generatedAt: Date.now() }; /* 第58天：返回完整 Redis Explorer 快照。 */
} /* 第58天：结束 Redis Explorer 快照入口。 */
export async function deleteRedisKey(key: string): Promise<RedisExplorerSnapshot> { /* 第58天：定义删除指定 Redis Key 后返回最新快照的方法。 */
  if (key.trim()) await redisClient.del(key.trim()); /* 第58天：仅在 Key 非空时执行删除。 */
  return await getRedisExplorerSnapshot(false); /* 第58天：删除后返回最新 Redis Explorer 快照。 */
} /* 第58天：结束 Redis Key 删除方法。 */
export async function expireRedisKey(key: string, ttlSeconds: number): Promise<RedisExplorerSnapshot> { /* 第58天：定义给指定 Redis Key 设置过期时间的方法。 */
  if (key.trim()) await redisClient.expire(key.trim(), Math.max(1, ttlSeconds)); /* 第58天：仅在 Key 非空时设置至少一秒的 TTL。 */
  return await getRedisExplorerSnapshot(false); /* 第58天：设置过期时间后返回最新快照。 */
} /* 第58天：结束 Redis Key 过期时间设置方法。 */
async function summarizeRedisKey(key: string): Promise<RedisKeySummary> { /* 第58天：定义单个 Redis Key 摘要读取函数。 */
  const [ttl, type, size] = await Promise.all([redisClient.ttl(key).catch(() => -2), redisClient.type(key).catch(() => "unknown"), redisClient.memoryUsage(key).catch(() => 0)]); /* 第58天：并发读取 TTL、Type 和 Memory Usage。 */
  return { key, ttl, type, size }; /* 第58天：返回 Redis Explorer 展示所需摘要。 */
} /* 第58天：结束 Redis Key 摘要读取函数。 */
