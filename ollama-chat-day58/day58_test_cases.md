# Day 58 测试用例：Production Infrastructure V1（Redis 集成）

## 测试范围

本文档用于验收 `ollama-chat-day58` 的第58天任务，重点验证 RedisClient、RedisHealthCheck、CacheStore 抽象、RedisCacheStore、Semantic Cache 迁移、Redis Operation Trace、Redis Metrics 和 Redis Explorer。

## 自动化测试命令

```bash
npm run test:day58
```

## 可选 Redis 启动命令

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

## 用例 1：MemoryCacheStore 基础操作

- 步骤：执行 `set -> get -> keys -> ttl 过期 -> delete`
- 期望：
  - `SET` 后可以 `GET` 到值
  - 未过期 Key 可以被 `keys()` 列出
  - TTL 到期后读取返回 `null`
  - `delete()` 返回 `true`

## 用例 2：Semantic Cache 接入 CacheStore

- 步骤：
  - 用 `MemoryCacheStore<CacheEntry>` 注入 `SemanticCache`
  - 调用 `addAsync()`
  - 调用 `searchAsync("介绍 LangGraph")`
  - 调用 `searchAsync("Redis 是什么")`
- 期望：
  - `addAsync()` 会写入底层 Store
  - 近义查询命中缓存
  - 无关查询未命中缓存
  - 检索结果带 `backend` 字段

## 用例 3：RedisClient 基础 Redis 操作

- 前置：本机 Redis 可用
- 步骤：执行 `SET -> GET -> EXISTS -> EXPIRE -> TTL -> KEYS -> MEMORY USAGE -> DEL -> GET`
- 期望：
  - `GET` 能读到 `SET` 的值
  - `EXISTS` 返回存在
  - `EXPIRE` 后 TTL 在合理范围
  - `DEL` 后再次 `GET` 返回 `null`

## 用例 4：Redis Operation Trace

- 前置：本机 Redis 可用
- 步骤：运行 RedisClient 基础操作测试后读取 `redisClient.getOperationTraces()`
- 期望：
  - 存在 `SET` 记录
  - 存在 `GET hit` 记录
  - 存在 `GET miss` 记录
  - 每条记录都有 `latencyMs`

## 用例 5：RedisCacheStore JSON 读写

- 前置：本机 Redis 可用
- 步骤：
  - 创建 `RedisCacheStore("day58-test-store")`
  - 写入 `{ value: "ok" }`
  - 读取对象
  - 列出 Key
  - 删除 Key
- 期望：
  - 对象可以正确序列化和反序列化
  - 当前 Store 命名空间可以列出 Key
  - 删除后读取返回 `null`

## 用例 6：Redis Explorer 快照

- 步骤：调用 `getRedisExplorerSnapshot(false)`
- 期望：
  - 返回 `health.healthy`
  - 返回 `keys`
  - 返回 `operations`
  - 返回 `metrics.totalKeys`
  - 返回 `metrics.avgLatency`

## 用例 7：浏览器标签页和页面标题

- 步骤：打开首页、`/prompts` 和 `/experiments`
- 期望：
  - 首页标签页为 Day 58 Redis Production Infrastructure
  - 首页主标题为 Redis Production Infrastructure / Redis 生产基础设施
  - 侧栏默认打开 Redis 标签页
  - `/prompts` 和 `/experiments` 的标签页内容均为 Day58 相关描述
