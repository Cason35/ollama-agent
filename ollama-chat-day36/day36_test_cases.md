# Day 36 测试用例：Queue Runtime V6 生命周期控制

本文档用于验证第36天任务：Cancellation（取消）、Timeout（超时）和 Graceful Shutdown（优雅关闭）。

## 测试前准备

1. 启动项目：`npm run dev`
2. 打开页面后观察右侧 `Queue Runtime V6` 看板。
3. 确认浏览器标签页标题包含 `Day 36 - Queue Runtime V6`。

## 用例 1：取消 queued 任务

步骤：

1. 连续点击 `Create 10 Embedding Jobs`。
2. 找到状态为 `queued` 的任务。
3. 点击该任务行右侧 `Cancel`。

期望结果：

1. 任务状态变为 `cancelled`。
2. `cancelled` 指标加 1。
3. 时间线出现 `CancelRequested` 和 `Cancelled`。
4. 任务不会被 Worker 继续认领。

## 用例 2：取消 running 任务

步骤：

1. 点击 `Create 10 Embedding Jobs`。
2. 找到状态为 `running` 的 embedding 任务。
3. 点击该任务行右侧 `Cancel`。

期望结果：

1. 任务先变为 `cancelling`。
2. Worker 在长任务等待过程中检测到取消请求。
3. 任务最终变为 `cancelled`。
4. 时间线出现 `CancelRequested` 和 `Cancelled`。
5. 取消任务不进入 `retrying`。

## 用例 3：任务超时后进入 retrying

步骤：

1. 点击 `Timeout Embedding Job`。
2. 等待任务运行超过 1200ms。

期望结果：

1. 时间线出现 `Timeout`。
2. 任务进入 `retrying`，并带有下一次运行等待时间。
3. `timeout` 指标加 1。
4. 任务可在后续重试中继续被 Worker 认领。

## 用例 4：任务多次超时后变为 timeout

步骤：

1. 点击 `Timeout Embedding Job`。
2. 等待该任务用完最大尝试次数。

期望结果：

1. 时间线中可以看到多次 `Timeout` 或 `RetryScheduled`。
2. 最终状态变为 `timeout`。
3. 该任务出现在 `Dead Letter / Timeout Jobs` 区域。
4. 点击 `Requeue` 后任务重新回到 `queued`。

## 用例 5：优雅关闭 WorkerPool

步骤：

1. 点击 `Create 10 Embedding Jobs`。
2. 等至少一个任务进入 `running`。
3. 点击 `Graceful Shutdown`。

期望结果：

1. WorkerPool 停止认领新任务。
2. 已经在运行的任务会在 10 秒宽限期内尽量自然完成。
3. 宽限期后仍未完成的任务会恢复为 `retrying`。
4. 时间线出现 `GracefulShutdownStarted` 和 `WorkerStopped`。

## 用例 6：保留 Day35 能力

步骤：

1. 点击 `Burst 5 Chat Jobs`。
2. 观察 `Rate Limit Window`。
3. 点击 `Create 10 Embedding Jobs`。
4. 观察 `Resource Usage`。

期望结果：

1. chat 任务仍受 llm rate limit 限制。
2. embedding 任务仍受 embedding resource limit 限制。
3. 被限制任务仍显示 `blockedReason`。
4. 第36天生命周期功能不破坏第35天资源与速率控制能力。
