# Ollama Chat Day 60

Day 60 在 Day 59 Redis Distributed Queue（Redis 分布式队列）基础上，进入 Production Infrastructure V3（生产基础设施第3版），核心主题是 Distributed Lock（分布式锁）。

本项目保留 RedisClient、Redis Explorer、Semantic Cache、Runtime Decision、Model Collaboration、Trace、Usage、Memory 和 Day 59 的 Redis Queue，并新增：

- `LockProvider`：统一锁接口，抽象 acquire、release、extend、isLocked、forceUnlock 和 snapshot。
- `RedisLockProvider`：基于 Redis `SET key value NX PX`、Lua owner 校验、PTTL 和 metadata 构建分布式锁。
- `LockToken`：保存 key、owner、expiresAt，确保 release 和 extend 只能由合法 owner 执行。
- `Worker Lock Guard`：Worker 领取 Job 后先获取业务资源锁，获取失败时把 Job 延迟重试。
- `Heartbeat + Lock Renewal`：长任务执行期间定时续期，避免锁在任务完成前过期。
- `Lock Explorer`：展示 Active Locks、TTL、Owner、Renew Count、Force Unlock 和 Lock Operation Trace。
- `Lock Metrics`：展示 totalLocks、acquireSuccess、acquireFailure、avgWaitTime、renewCount 和 expiredLocks。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 60 Redis Distributed Lock。

打开 `http://localhost:3000/prompts` 可进入 Day 60 Prompt Strategy Console。

## Redis

建议使用 Docker 启动 Redis：

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

默认连接地址：

```bash
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=ollama:day60:
```

## 测试

```bash
npm run test:day60
```

Day 60 的测试用例说明见 `day60_test_cases.md`。

