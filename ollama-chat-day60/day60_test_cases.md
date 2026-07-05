# Day 60 Redis Distributed Lock 测试用例

本文档用于测试 `ollama-chat-day60` 的 Day 60 任务：Redis Distributed Lock（Redis 分布式锁）。

## 测试范围

- LockProvider（锁提供者接口）
- RedisLockProvider（Redis 分布式锁实现）
- LockToken（锁令牌）
- Worker 获取锁后执行任务
- Workflow Job 使用 `locks:workflow:<workflowId>` 防止同一工作流并发执行
- Job Retry（任务重试）遇到锁竞争时延迟重试
- Heartbeat + Lock Renewal（心跳续期）
- Lock Explorer（锁浏览器）
- Lock Metrics（锁指标）

## 用例 1：同一资源互斥

前置条件：Redis 已启动，`REDIS_KEY_PREFIX=ollama:day60:`。

操作步骤：
1. Worker A 对同一个资源 Key 调用 `acquire()`。
2. Worker B 立即对同一个资源 Key 调用 `acquire()`。

预期结果：
- Worker A 获取锁成功。
- Worker B 获取锁失败并返回 `null`。
- Lock Metrics 的 `acquireSuccess` 增加。
- Lock Metrics 的 `acquireFailure` 增加。

## 用例 2：非 owner 不能释放锁

操作步骤：
1. Worker A 获取锁。
2. Worker B 使用自己的 owner 调用 `release()`。

预期结果：
- Worker B 释放失败。
- 锁仍然存在。
- Worker A 仍然是合法持有者。

## 用例 3：owner 可以释放锁

操作步骤：
1. Worker A 获取锁。
2. Worker A 使用返回的 `LockToken` 调用 `release()`。
3. 再次调用 `isLocked()`。

预期结果：
- `release()` 返回 `true`。
- `isLocked()` 返回 `false`。
- Lock Operation Trace 出现 `release success`。

## 用例 4：长任务心跳续期

操作步骤：
1. 创建一个执行时间超过默认 TTL 的长任务。
2. Worker 获取锁后开始执行。
3. 等待超过一个续期间隔。

预期结果：
- Lock Explorer 中该锁的 `renewCount` 增加。
- 任务执行期间锁不会提前过期。
- 任务结束后锁被释放。

## 用例 5：Worker 崩溃后 TTL 恢复

操作步骤：
1. Worker A 获取一个短 TTL 锁。
2. 模拟 Worker A 崩溃，不调用 `release()`。
3. 等待 TTL 结束。
4. Worker B 再次获取同一把锁。

预期结果：
- TTL 结束前 Worker B 获取失败。
- TTL 结束后 Worker B 获取成功。
- 系统不会出现永久死锁。

## 用例 6：Workflow Job 锁保护

操作步骤：
1. 创建两个带相同 `workflowId` 的 Workflow Job。
2. 启动多个 Worker 并发处理队列。

预期结果：
- 同一时间只有一个 Worker 能持有 `locks:workflow:<workflowId>`。
- 未获得锁的任务进入 `retrying`。
- 时间线出现锁竞争说明。

## 用例 7：Lock Explorer 强制解锁

操作步骤：
1. 创建一个正在运行的长任务。
2. 打开右侧“锁”标签页。
3. 点击对应锁的 `Force Unlock（强制解锁）`。

预期结果：
- 指定锁从 Active Locks 中消失。
- Lock Operation Trace 出现 `forceUnlock`。
- 该能力只用于教学和排障，真实生产环境应谨慎使用。

## 可执行测试命令

```bash
npm run test:day60
```

说明：
- 如果 Redis 未启动，脚本会明确跳过 Redis 集成测试。
- 如果 Redis 已启动，脚本会验证互斥、owner 校验、续期、释放、TTL 过期恢复和指标记录。
