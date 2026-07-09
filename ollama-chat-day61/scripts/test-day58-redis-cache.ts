import assert from "node:assert/strict"; /* 第58天：引入 Node.js 严格断言工具。 */
import { MemoryCacheStore, RedisCacheStore } from "../lib/cache/cache-store"; /* 第58天：引入 MemoryCache 与 RedisCache 两种 CacheStore 实现。 */
import { SemanticCache } from "../lib/cache/semantic-cache"; /* 第58天：引入支持 CacheStore 抽象的语义缓存。 */
import type { CacheEntry } from "../lib/cache/cache-types"; /* 第58天：引入语义缓存条目类型用于泛型约束。 */
import { redisClient } from "../lib/redis/redis-client"; /* 第58天：引入统一 RedisClient 封装用于基础 Redis 操作测试。 */
import { redisHealthCheck } from "../lib/redis/redis-health"; /* 第58天：引入 RedisHealthCheck 健康检查。 */
import { getRedisExplorerSnapshot } from "../lib/redis/redis-dashboard-runtime"; /* 第58天：引入 Redis Explorer 快照函数。 */
async function testMemoryCacheStoreBasicOperations(): Promise<void> { /* 第58天：定义 MemoryCacheStore 基础操作测试。 */
  let clock = 1_000_000; /* 第58天：定义可控时钟，便于验证 TTL 过期。 */
  const store = new MemoryCacheStore<string>(() => clock); /* 第58天：创建带可控时钟的内存缓存存储。 */
  await store.set("memory-basic", "value", 5); /* 第58天：写入一条五秒 TTL 的内存缓存。 */
  assert.equal(await store.get("memory-basic"), "value", "MemoryCacheStore 应支持 SET 后 GET"); /* 第58天：验证内存缓存 SET/GET。 */
  assert.deepEqual(await store.keys(), ["memory-basic"], "MemoryCacheStore 应列出未过期 Key"); /* 第58天：验证内存缓存 KEYS。 */
  clock += 6_000; /* 第58天：推进时钟超过 TTL。 */
  assert.equal(await store.get("memory-basic"), null, "MemoryCacheStore 应在 TTL 后返回 null"); /* 第58天：验证内存缓存 TTL 过期。 */
  await store.set("memory-delete", "value"); /* 第58天：写入一条无 TTL 的内存缓存。 */
  assert.equal(await store.delete("memory-delete"), true, "MemoryCacheStore 应支持 DELETE"); /* 第58天：验证内存缓存 DELETE。 */
} /* 第58天：结束 MemoryCacheStore 基础操作测试。 */
async function testSemanticCacheWithCacheStore(): Promise<void> { /* 第58天：定义 SemanticCache 接入 CacheStore 抽象测试。 */
  const store = new MemoryCacheStore<CacheEntry>(); /* 第58天：创建测试专用 MemoryCacheStore，避免依赖外部 Redis。 */
  const cache = new SemanticCache({ store }); /* 第58天：创建注入 CacheStore 的语义缓存。 */
  await cache.addAsync({ query: "LangGraph 是什么", answer: "LangGraph 是图式工作流框架。", score: 91, genDurationMs: 4000 }); /* 第58天：异步写入语义缓存并同步写入 Store。 */
  const storedKeys = await store.keys(); /* 第58天：读取底层 Store 中的缓存 Key。 */
  assert.equal(storedKeys.length, 1, "SemanticCache.addAsync 应写入 CacheStore"); /* 第58天：验证语义缓存写入外部 Store。 */
  const hit = await cache.searchAsync("介绍 LangGraph"); /* 第58天：执行近义查询异步检索。 */
  const miss = await cache.searchAsync("Redis 是什么"); /* 第58天：执行无关查询异步检索。 */
  assert.equal(hit.hit, true, "SemanticCache.searchAsync 应命中近义查询"); /* 第58天：验证语义缓存命中。 */
  assert.equal(hit.backend, "memory", "测试注入 MemoryCacheStore 时后端应标记为 memory"); /* 第58天：验证检索结果携带后端标记。 */
  assert.equal(miss.hit, false, "SemanticCache.searchAsync 应对无关查询返回未命中"); /* 第58天：验证语义缓存未命中。 */
} /* 第58天：结束 SemanticCache 接入 CacheStore 抽象测试。 */
async function testRedisClientBasicOperationsIfAvailable(): Promise<void> { /* 第58天：定义真实 Redis 基础操作测试，Redis 不可用时跳过。 */
  const health = await redisHealthCheck.getSnapshot(); /* 第58天：读取 Redis 健康检查快照。 */
  if (!health.healthy) { console.warn(`Redis 未启动，跳过真实 Redis SET/GET/EXPIRE/DEL 测试：${health.error ?? "unknown"}`); return; } /* 第58天：Redis 不可用时跳过真实连接测试但不中断本地验收。 */
  redisClient.resetOperationTraces(); /* 第58天：清空 Redis 操作追踪，保证断言只看本测试产生的命令。 */
  const key = `day58:test:basic:${Date.now()}`; /* 第58天：生成测试专用 Redis Key。 */
  await redisClient.set(key, "value", 30); /* 第58天：执行 Redis SET 并设置 30 秒 TTL。 */
  assert.equal(await redisClient.get(key), "value", "RedisClient 应支持 SET 后 GET"); /* 第58天：验证 Redis GET 命中。 */
  assert.equal(await redisClient.exists(key), true, "RedisClient 应支持 EXISTS"); /* 第58天：验证 Redis EXISTS 命中。 */
  assert.equal(await redisClient.expire(key, 3), true, "RedisClient 应支持 EXPIRE"); /* 第58天：验证 Redis EXPIRE 设置成功。 */
  const ttl = await redisClient.ttl(key); /* 第58天：读取 Redis TTL。 */
  assert.ok(ttl > 0 && ttl <= 3, "RedisClient TTL 应反映刚设置的过期时间"); /* 第58天：验证 Redis TTL 落在合理区间。 */
  assert.ok((await redisClient.keys("day58:test:basic:*")).includes(key), "RedisClient KEYS 应能列出测试 Key"); /* 第58天：验证 Redis KEYS。 */
  assert.ok(await redisClient.memoryUsage(key) >= 0, "RedisClient MEMORY USAGE 应返回非负数"); /* 第58天：验证 Redis MEMORY USAGE。 */
  assert.equal(await redisClient.del(key), 1, "RedisClient 应支持 DEL"); /* 第58天：验证 Redis DEL。 */
  assert.equal(await redisClient.get(key), null, "RedisClient 删除后 GET 应返回 null"); /* 第58天：验证删除后的 Redis 未命中。 */
  const operations = redisClient.getOperationTraces(); /* 第58天：读取 Redis 操作追踪。 */
  assert.ok(operations.some((item) => item.operation === "SET"), "Redis Operation Trace 应记录 SET"); /* 第58天：验证 SET 追踪。 */
  assert.ok(operations.some((item) => item.operation === "GET" && item.hit === true), "Redis Operation Trace 应记录 GET Hit"); /* 第58天：验证 GET 命中追踪。 */
  assert.ok(operations.some((item) => item.operation === "GET" && item.hit === false), "Redis Operation Trace 应记录 GET Miss"); /* 第58天：验证 GET 未命中追踪。 */
  assert.ok(operations.every((item) => item.latencyMs >= 0), "Redis Operation Trace 应记录非负延迟"); /* 第58天：验证 Redis 操作延迟记录。 */
} /* 第58天：结束真实 Redis 基础操作测试。 */
async function testRedisCacheStoreIfAvailable(): Promise<void> { /* 第58天：定义 RedisCacheStore 测试，Redis 不可用时跳过。 */
  const healthy = await redisHealthCheck.isHealthy(); /* 第58天：读取 Redis 健康布尔状态。 */
  if (!healthy) { console.warn("Redis 未启动，跳过 RedisCacheStore 真实读写测试。"); return; } /* 第58天：Redis 不可用时跳过真实 RedisCacheStore 测试。 */
  const store = new RedisCacheStore<{ value: string }>("day58-test-store"); /* 第58天：创建测试专用 RedisCacheStore 命名空间。 */
  await store.clear(); /* 第58天：清空测试命名空间，保证测试独立。 */
  await store.set("redis-cache", { value: "ok" }, 30); /* 第58天：写入一条 Redis 缓存对象。 */
  assert.deepEqual(await store.get("redis-cache"), { value: "ok" }, "RedisCacheStore 应支持对象写入与读取"); /* 第58天：验证 RedisCacheStore JSON 序列化读写。 */
  assert.deepEqual(await store.keys(), ["redis-cache"], "RedisCacheStore 应列出当前命名空间 Key"); /* 第58天：验证 RedisCacheStore KEYS。 */
  assert.equal(await store.delete("redis-cache"), true, "RedisCacheStore 应支持删除单个 Key"); /* 第58天：验证 RedisCacheStore DELETE。 */
  assert.equal(await store.get("redis-cache"), null, "RedisCacheStore 删除后应返回 null"); /* 第58天：验证 RedisCacheStore 删除后未命中。 */
  await store.clear(); /* 第58天：再次清理测试命名空间。 */
} /* 第58天：结束 RedisCacheStore 测试。 */
async function testRedisExplorerSnapshot(): Promise<void> { /* 第58天：定义 Redis Explorer 快照测试。 */
  const snapshot = await getRedisExplorerSnapshot(false); /* 第58天：读取 Redis Explorer 快照。 */
  assert.equal(typeof snapshot.health.healthy, "boolean", "Redis Explorer 应返回健康状态"); /* 第58天：验证健康状态字段。 */
  assert.ok(Array.isArray(snapshot.keys), "Redis Explorer 应返回 Key 列表"); /* 第58天：验证 Key 列表字段。 */
  assert.ok(Array.isArray(snapshot.operations), "Redis Explorer 应返回 Redis Operation Trace 列表"); /* 第58天：验证操作追踪列表字段。 */
  assert.ok(snapshot.metrics.totalKeys >= 0, "Redis Metrics 应返回 totalKeys"); /* 第58天：验证 Redis Metrics 键数量。 */
  assert.ok(snapshot.metrics.avgLatency >= 0, "Redis Metrics 应返回 avgLatency"); /* 第58天：验证 Redis Metrics 平均延迟。 */
} /* 第58天：结束 Redis Explorer 快照测试。 */
async function main(): Promise<void> { /* 第58天：定义 Day58 自动化验收主入口。 */
  try { /* 第58天：确保测试结束后断开 Redis 连接。 */
    await testMemoryCacheStoreBasicOperations(); /* 第58天：执行 MemoryCacheStore 基础操作测试。 */
    await testSemanticCacheWithCacheStore(); /* 第58天：执行 SemanticCache + CacheStore 抽象测试。 */
    await testRedisClientBasicOperationsIfAvailable(); /* 第58天：执行真实 RedisClient 基础操作测试。 */
    await testRedisCacheStoreIfAvailable(); /* 第58天：执行 RedisCacheStore 真实读写测试。 */
    await testRedisExplorerSnapshot(); /* 第58天：执行 Redis Explorer 快照测试。 */
    console.log("Day 58 Redis Production Infrastructure tests passed."); /* 第58天：输出测试通过信息。 */
  } finally { /* 第58天：无论测试成功失败都释放 Redis 连接。 */
    await redisClient.disconnect(); /* 第58天：断开 ioredis 连接，避免测试进程悬挂。 */
  } /* 第58天：结束资源清理。 */
} /* 第58天：结束自动化验收主入口。 */
void main().catch((error: unknown) => { /* 第58天：启动测试并捕获异步错误。 */
  console.error(error); /* 第58天：输出失败原因。 */
  process.exitCode = 1; /* 第58天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第58天：结束错误处理。 */
