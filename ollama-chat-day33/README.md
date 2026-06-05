# Ollama Chat Day 33

Day 33 在 `ollama-chat-day32` 的 Queue Runtime V2 基础上，升级为 Queue Runtime V3：Priority Queue（优先级队列）+ Scheduled Job（定时任务调度）。

## 本日重点

- `Job` 新增 `priority` 字段，约定 `10 = high`、`5 = normal`、`1 = low`。
- `Job` 新增 `scheduledAt` 字段，未来时间到期后才会被 Worker 执行。
- `QueueManager` 出队时只从已到期任务中选择最高优先级任务。
- `QueueDashboard` 展示 Priority、ScheduledAt、Wait Duration 与 Priority Metrics。
- 新增 `reminder` 任务，用于验证 30 秒后的定时执行。
- 保留 Day 32 的 retry、backoff、dead letter queue 与手动 requeue。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，在右侧 `Queue Runtime V3` 中创建高优先级、普通优先级、低优先级、Reminder、Unstable 或 AlwaysFail 任务，观察调度顺序和状态变化。

## 测试用例

测试用例见 `day33_test_cases.md`。
