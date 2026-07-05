# Day 59 Distributed Queue 测试用例

## 测试目标

验证 Day 59 是否完成 Distributed Queue（分布式队列）核心能力：`QueueStore` 抽象、`RedisQueueStore`、Job Serialization、Worker 消费 Redis Queue、ACK、Visibility Timeout、Queue Metrics、Queue Explorer、Queue Trace、Retry 和 Delete。

## 自动化测试

运行命令：

```bash
npm run test:day59
```

### 用例 1：Job Serialization

- 前置条件：不需要 Redis。
- 操作：创建测试 Job，执行 `serializeJob()` 和 `deserializeJob()`。
- 预期结果：Job ID、状态和核心字段可以恢复；非法 JSON 返回 `null`，不会抛异常。

### 用例 2：Redis Queue 入队与优先级出队

- 前置条件：Redis 已启动，`REDIS_URL=redis://127.0.0.1:6379`。
- 操作：写入低优先级 Job 和高优先级 Job。
- 预期结果：`size()` 返回 2；`peek()` 和 `dequeue()` 优先返回高优先级 Job。

### 用例 3：ACK 完成确认

- 前置条件：Job 已从 Waiting Queue 移入 Processing Queue。
- 操作：构造 success Job，执行 `ack()`。
- 预期结果：Job 从 Processing Queue 移除，并进入 Completed Queue；Queue Trace 出现 `ack`。

### 用例 4：Retry 重新入队

- 前置条件：Job 已被 Worker 领取。
- 操作：构造 `retrying` Job，执行 `retry()`。
- 预期结果：Job 回到 Waiting Queue，并可被 Worker 再次领取。

### 用例 5：Visibility Timeout 恢复

- 前置条件：测试队列可见性超时设置为 20ms。
- 操作：Job 被领取后不 ACK，等待超过 20ms，调用 `recoverExpired()`。
- 预期结果：超时 Job 从 Processing Queue 回到 Waiting Queue，时间线出现 `StaleRecovered`。

### 用例 6：Dead Letter 归档

- 前置条件：Job 已被 Worker 领取。
- 操作：构造 `dead_letter` Job，执行 `fail()`。
- 预期结果：Job 进入 Dead Letter Queue；Queue Metrics 的 `failed` 增加。

### 用例 7：Delete 删除任务

- 前置条件：目标 Job 存在于某个 Redis Queue bucket。
- 操作：执行 `remove(jobId)`。
- 预期结果：目标 Job 从 Waiting、Processing、Completed、Dead Letter 中删除；Queue Trace 出现 `delete`。

## 页面手动测试

### 用例 8：Queue Explorer 默认标签页

- 操作：打开首页。
- 预期结果：右侧控制台默认打开“队列”标签页，页面徽标显示 Day 59，主标题为 Distributed Redis Queue / 分布式 Redis 队列。

### 用例 9：创建 10 个任务

- 操作：点击 `Create 10 Embedding Jobs（创建 10 个向量任务）`。
- 预期结果：Waiting、Processing、Completed 的数量随 Worker 消费变化；任务不会重复消费。

### 用例 10：失败任务 Retry

- 操作：点击 `AlwaysFail DLQ（死信队列）`，等待任务进入死信后点击 `Requeue（重新入队）` 或 `Restart（重启）`。
- 预期结果：任务可以重新进入等待队列或克隆为新任务，旧任务历史保留。

### 用例 11：Inspect 任务详情

- 操作：在任务表点击 `Inspect（检查）`。
- 预期结果：下方 Inspect Job 面板展示状态、耗时、资源、尝试次数、payload 和完整时间线。

### 用例 12：Delete 任务

- 操作：在任务表点击 `Delete（删除）`。
- 预期结果：任务从任务表和 Redis Queue bucket 中移除。

## 验收清单

1. 是否定义 `QueueStore`：是。
2. 是否实现 `RedisQueueStore`：是。
3. 是否实现 Job Serialization：是。
4. Worker 是否从 Redis Queue 消费：是。
5. 是否实现 ACK：是。
6. 是否实现 Visibility Timeout：是。
7. 是否增加 Queue Metrics：是。
8. 是否实现 Queue Explorer：是。
9. Trace 是否接入 Queue：是。
10. 是否完成 Distributed Queue Test：是。
