# Ollama Chat Day 32

Day 32 在 `ollama-chat-day31` 的 Queue Runtime V1 基础上，升级为 Queue Runtime V2：Retry（任务重试）+ Backoff（退避延迟）+ Dead Letter Queue（死信队列）。

## 本日新增

- `Job`：新增 `attempts`、`maxAttempts`、`nextRunAt`、`updatedAt`、`retrying` 与 `dead_letter`。
- `RetryPolicy`：支持 `maxAttempts`、`baseDelayMs` 与 `fixed / exponential` backoff。
- `Worker`：任务失败后不再立刻终止，而是按退避延迟重新入队，超过最大次数后进入死信队列。
- `QueueManager`：只取 `queued` 或 `retrying 且 nextRunAt 到期` 的任务。
- `Dead Letter Queue`：侧栏单独展示死信任务、最后错误、失败时间与 Requeue 按钮。
- `Queue Metrics V2`：新增 retrying、deadLetter、avgAttempts、retryRate 与 deadLetterRate。
- `unstable / alwaysFail`：用于测试自动重试与死信队列的两个失败模拟任务。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，在右侧 `Queue Runtime V2` 中创建 `Unstable 重试` 或 `AlwaysFail 死信` 任务，观察 retry / backoff / DLQ / requeue。

## 验收

测试用例见 `day32_test_cases.md`。

推荐执行：

```bash
npm run build
```
