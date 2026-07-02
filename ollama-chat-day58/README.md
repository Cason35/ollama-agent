# Ollama Chat Day 58

Day 58 在 Day 57 Adaptive Runtime Decision Engine（自适应运行时决策引擎）基础上，进入 Production Infrastructure V1（生产基础设施第1版），核心主题是 Redis Integration（Redis 集成）。

本项目保留 Runtime Decision、Prompt Registry、Model Collaboration、Trace、Usage、Semantic Cache 和 Memory，并新增：

- `RedisClient`：统一封装 `get`、`set`、`del`、`expire`、`exists`、`keys`、`ttl`、`type` 和 `memoryUsage`。
- `RedisHealthCheck`：通过 `PING` 检查 Redis 是否可用。
- `CacheStore`：抽象缓存存储接口，支持 `MemoryCacheStore` 和 `RedisCacheStore`。
- `RedisCacheStore`：把 Semantic Cache（语义缓存）迁移到 Redis 共享状态中心。
- `Redis Operation Trace`：记录 Redis GET、SET、DEL、EXPIRE、TTL、TYPE、MEMORY 等操作的耗时、命中和错误。
- `Redis Metrics`：展示 totalKeys、hitRate、missRate、avgLatency 和 memoryUsage。
- `Redis Explorer`：展示 Key、TTL、Type、Size，并支持 Delete、Expire 和 Refresh。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day58 Redis Production Infrastructure。

打开 `http://localhost:3000/prompts` 可进入 Day58 Prompt Strategy Console。

打开 `http://localhost:3000/experiments` 可进入 Day58 Prompt Strategy Experiment View。

## Redis

建议使用 Docker 启动 Redis：

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

默认连接地址：

```bash
REDIS_URL=redis://127.0.0.1:6379
```

如果本机暂时没有 Redis，项目仍会构建和打开页面；Redis Explorer 会显示健康检查失败，Semantic Cache 会保留内存降级能力。

## 测试

```bash
npm run test:day58
```

Day 58 的测试用例说明见 `day58_test_cases.md`。
