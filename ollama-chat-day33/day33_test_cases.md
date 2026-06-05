# Day 33 测试用例：Queue Runtime V3

验证第33天新增的 Priority Queue、Scheduled Job、Reminder Job、Priority Metrics 与 Scheduler Timeline，同时确认第32天的 retry / backoff / dead letter / requeue 能力仍然可用。

## 前置条件

1. 在 `ollama-chat-day33` 目录执行 `npm install`。
2. 执行 `npm run dev` 启动 Next.js。
3. 打开 `http://localhost:3000`。
4. 在右侧确认标题为 `Queue Runtime V3`。

## 用例 1：高优先级任务优先执行

操作步骤：
1. 连续点击 `Low Embedding P1`、`Normal Retrieval P5`、`High Chat P10`。
2. 观察任务列表中的 `Priority` 和 `Status`。

预期结果：
1. 三个任务都会创建成功。
2. 当 Worker 空闲时，`P10 high` 会优先进入 `running`。
3. 随后执行 `P5 normal`，最后执行 `P1 low`。

## 用例 2：定时任务未到期不执行

操作步骤：
1. 点击 `Reminder +30s`。
2. 立即观察任务列表中的 `Schedule`、`Wait` 和 `Status`。

预期结果：
1. Reminder 任务状态保持 `queued`。
2. `Schedule` 显示未来时间。
3. `Wait` 显示倒计时秒数。
4. 到期前不会进入 `running`。

## 用例 3：Reminder 到期后自动执行

操作步骤：
1. 延续用例 2，等待约 30 秒。
2. 观察 Reminder 任务状态和时间线。

预期结果：
1. Reminder 到期后进入 `running`。
2. 执行完成后进入 `success`。
3. `Scheduler Timeline` 中包含 `Created`、`Scheduled`、`Started`、`Completed`。

## 用例 4：混合调度顺序

操作步骤：
1. 点击 `Low Embedding P1` 创建低优先级任务。
2. 点击 `Normal Retrieval P5` 创建普通优先级任务。
3. 点击 `High Chat P10` 创建高优先级任务。
4. 点击 `Reminder +30s` 创建高优先级定时任务。

预期结果：
1. 立即可运行的任务按 `P10 -> P5 -> P1` 执行。
2. Reminder 虽然是 `P10 high`，但在 `scheduledAt` 到期前不会抢跑。
3. Reminder 到期后自动执行。

## 用例 5：Priority Metrics 展示正确

操作步骤：
1. 创建至少一个 `P10 high`、一个 `P5 normal`、一个 `P1 low` 和一个 Reminder。
2. 观察指标网格中的 `high`、`normal`、`low`、`scheduled`。

预期结果：
1. `high` 至少为 2，因为 High Chat 和 Reminder 都是 P10。
2. `normal` 至少为 1。
3. `low` 至少为 1。
4. Reminder 到期前 `scheduled` 至少为 1，到期执行后可下降。

## 用例 6：Unstable 任务仍支持 retry / backoff

操作步骤：
1. 点击 `Unstable Retry`。
2. 观察状态是否在失败后进入 `retrying`。

预期结果：
1. 如果首次失败，任务进入 `retrying`。
2. `Wait` 显示重试倒计时。
3. 时间线中出现 `Failed` 和 `RetryScheduled`。
4. 后续可能进入 `success` 或最终进入 `dead_letter`。

## 用例 7：AlwaysFail 任务仍进入死信队列

操作步骤：
1. 点击 `AlwaysFail DLQ`。
2. 等待任务达到最大尝试次数。

预期结果：
1. 任务多次失败后进入 `dead_letter`。
2. `Dead Letter Jobs` 区域展示该任务。
3. 时间线中包含 `DeadLetter`。

## 用例 8：Dead Letter 任务可手动 Requeue

操作步骤：
1. 延续用例 7，点击死信任务旁边的 `Requeue`。
2. 观察任务状态和尝试次数。

预期结果：
1. 任务回到 `queued`。
2. `attempts` 重置为 `0`。
3. `error` 清空。
4. 时间线追加 `Requeued`。

## 用例 9：页面标题与标签页为 Day 33

操作步骤：
1. 打开页面。
2. 查看浏览器标签页标题和页面顶部标题。

预期结果：
1. 浏览器标签页包含 `Day 33` 和 `Queue Runtime V3`。
2. 页面顶部显示 `Day 33`。
3. 页面顶部主标题显示 `Queue Runtime V3 · Priority Queue + Scheduling`。
