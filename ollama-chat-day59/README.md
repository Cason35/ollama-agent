# Ollama Chat Day 59

Day 59 在 Day 58 Redis Production Infrastructure（Redis 生产基础设施）基础上，进入 Production Infrastructure V2（生产基础设施第2版），核心主题是 Distributed Queue（分布式队列）。

本项目保留 RedisClient、Redis Explorer、Semantic Cache、Runtime Decision、Model Collaboration、Trace、Usage 和 Memory，并新增：

- `QueueStore`：统一队列存储接口，抽象 enqueue、dequeue、peek、size、ack、retry、fail、remove 和 recoverExpired。
- `RedisQueueStore`：基于 Redis List 保存 Waiting、Processing、Completed 和 Dead Letter 四个队列桶。
- `Job Serialization`：通过 `serializeJob()` 和 `deserializeJob()` 在 Job 对象与 JSON 字符串之间转换。
- `ACK`：Worker 成功完成任务后从 Processing Queue 移除，并归档到 Completed Queue。
- `Visibility Timeout`：Processing 中超过超时时间未完成的任务会恢复到 Waiting Queue。
- `Queue Metrics`：展示 waiting、processing、completed、failed、avgWaitTime 和 avgProcessingTime。
- `Queue Explorer`：展示队列桶、任务表、Inspect、Retry、Delete 和 Queue Operation Trace。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 59 Distributed Redis Queue。

打开 `http://localhost:3000/prompts` 可进入 Day 59 Prompt Strategy Console。

## Redis

建议使用 Docker 启动 Redis：

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

默认连接地址：

```bash
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=ollama:day59:
```

## 测试

```bash
npm run test:day59
```

Day 59 的测试用例说明见 `day59_test_cases.md`。
