# Day 32 测试用例：Queue Runtime V2

## 测试目标

验证第32天新增的 Job Retry、Backoff、Dead Letter Queue、手动 Requeue、Timeline retry 事件与 Queue Metrics V2。

## 用例 1：普通任务仍可成功

1. 启动项目：`npm run dev`。
2. 打开 `http://localhost:3000`。
3. 点击 `Embedding 长任务`。
4. 预期：任务状态从 `queued` 变为 `running`，最后变为 `success`。
5. 预期：`success` 指标增加，`attempts` 显示 `1/3`。

## 用例 2：unstable 任务可自动重试

1. 点击 `Unstable 重试`。
2. 如果第一次失败，观察状态进入 `retrying`。
3. 预期：时间线出现 `Failed` 与 `RetryScheduled`。
4. 预期：`retrying` 指标短暂增加，`Next` 显示倒计时。
5. 预期：到期后任务重新进入 `running`。

## 用例 3：alwaysFail 任务进入死信队列

1. 点击 `AlwaysFail 死信`。
2. 等待任务完成 3 次尝试。
3. 预期：任务最终状态为 `dead_letter`。
4. 预期：`Dead Letter Jobs` 区域出现该任务。
5. 预期：时间线包含多次 `Failed`、`RetryScheduled` 与最终 `DeadLetter`。

## 用例 4：死信任务可手动 Requeue

1. 在 `Dead Letter Jobs` 中找到 `alwaysFail` 任务。
2. 点击 `Requeue`。
3. 预期：任务状态变回 `queued`。
4. 预期：`attempts` 重置为 `0/3`。
5. 预期：时间线新增 `Requeued`。

## 用例 5：Queue Metrics V2 正确展示

1. 创建至少一个普通成功任务。
2. 创建至少一个 `unstable` 或 `alwaysFail` 任务。
3. 预期：`avg attempts` 大于或等于 1。
4. 预期：发生重试后 `retry rate` 大于 0。
5. 预期：出现死信后 `dead rate` 大于 0。

## 用例 6：retrying 任务不会提前执行

1. 创建 `alwaysFail` 任务。
2. 观察第一次失败后的 `retrying` 状态。
3. 预期：在 `Next` 倒计时未结束前不会重新进入 `running`。
4. 预期：倒计时结束后才开始下一次尝试。

## 验收清单

- Job 已增加 `attempts / maxAttempts / nextRunAt / updatedAt`。
- 状态已支持 `retrying / dead_letter`。
- Worker 失败后会自动 retry。
- backoff 使用指数退避。
- QueueManager 只取到期可运行任务。
- Dead Letter Queue 可展示任务。
- Dead Letter Queue 支持手动 Requeue。
- Timeline 展示 retry / dead letter / requeue 事件。
- Queue Metrics V2 展示 retry 与 dead letter 指标。
- `unstable / alwaysFail` 测试任务可用于验证失败恢复。
