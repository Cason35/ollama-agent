# Day 34 测试用例：Queue Runtime V4（Concurrency + Worker Pool）

## 测试目标

验证 `ollama-chat-day34` 已从单 Worker 串行调度升级为 WorkerPool 并发调度，并确认 priority、schedule、retry、dead letter、job lock、heartbeat 和 stale lock 能共同工作。

## 用例 1：WorkerPool 状态展示

1. 启动项目并打开首页。
2. 查看右侧 `Queue Runtime V4` 面板。
3. 预期看到 `Worker Pool` 区域展示 `worker_1`、`worker_2`、`worker_3`。
4. 预期空闲时三个 Worker 状态均为 `idle`，并且 `heartbeat` 每秒刷新。

## 用例 2：5 个长任务并发执行

1. 点击 `Create 5 Sleep Jobs`。
2. 观察任务列表中出现 5 个 `embedding` 任务。
3. 预期最多同时有 3 个任务进入 `running`。
4. 预期前三个任务分别显示不同 `workerId`。
5. 预期总耗时约 10 秒左右，而不是单 Worker 串行的约 25 秒。

## 用例 3：任务锁防重复执行

1. 快速创建多个 `Low Embedding P1` 任务。
2. 观察每个 `running` 任务只对应一个 `workerId`。
3. 预期同一个 `job_xxx` 不会同时出现在多个 Worker 的 `currentJobId` 中。
4. 预期任务时间线包含 `Claimed` 节点，说明任务已被 Worker 原子认领。

## 用例 4：高优先级任务仍优先认领

1. 连续创建 `Low Embedding P1`、`Normal Retrieval P5`、`High Chat P10`。
2. 在有空闲 Worker 时观察认领顺序。
3. 预期可运行任务中 `High Chat P10` 优先被认领。
4. 预期已经 running 的低优先级任务不会被强行中断，这符合非抢占式 WorkerPool 行为。

## 用例 5：定时任务不会提前运行

1. 点击 `Reminder +30s`。
2. 在 30 秒内观察该任务状态保持 `queued`。
3. 预期该任务在到期前没有 `workerId` 和 `lockedAt`。
4. 预期到期后任务进入 `running` 并由某个 Worker 执行。

## 用例 6：retry 与 WorkerPool 共同工作

1. 点击 `Unstable Retry`。
2. 如果任务失败，观察状态进入 `retrying`。
3. 预期重试等待期间任务释放 `workerId` 和 `lockedAt`。
4. 预期到达 `nextRunAt` 后任务可被任意空闲 Worker 重新认领。

## 用例 7：Dead Letter 与手动 Requeue

1. 点击 `AlwaysFail DLQ`。
2. 等待任务尝试达到最大次数。
3. 预期任务进入 `dead_letter`。
4. 点击 `Requeue`。
5. 预期任务回到 `queued`，并由 WorkerPool 重新认领执行。

## 用例 8：stale lock 恢复

1. 准备一个 `.queue-data/jobs-v4.json` 中的 `running` 任务，并让 `lockedAt` 早于当前时间 30 秒以上。
2. 刷新页面或请求 `GET /api/queue`。
3. 预期该任务从 `running` 恢复为 `retrying`。
4. 预期任务时间线新增 `StaleRecovered` 节点。

## 验收清单

1. 是否定义 `WorkerInfo`：是。
2. 是否实现 `WorkerPool`：是。
3. 是否支持 `concurrency`：是，默认并发数为 3。
4. 是否实现 `claimNextJob(workerId)`：是。
5. 是否实现 `job lock`：是，包含 `workerId` 与 `lockedAt`。
6. 是否避免同一 Job 被重复执行：是。
7. Dashboard 是否展示 Worker 状态：是。
8. 是否增加 Concurrency Metrics：是。
9. 是否完成 concurrency=1 vs 3 的测试设计：是，文档中以 5 个 5 秒任务验证并发收益。
10. 是否实现 heartbeat / stale lock 检测：是。
