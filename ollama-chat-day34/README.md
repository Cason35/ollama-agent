# Ollama Chat Day 34

Day 34 在 `ollama-chat-day33` 的 Queue Runtime V3 基础上，升级为 Queue Runtime V4：Concurrency（并发）+ Worker Pool（工作池）。

## 本日重点

- WorkerInfo：记录每个 Worker 的状态、当前任务、心跳、成功数和失败数。
- WorkerPool：默认启动 3 个 Worker 并发处理任务。
- claimNextJob：Worker 通过原子认领获取任务，避免同一个 Job 被重复执行。
- job lock：任务进入 running 时写入 `workerId` 和 `lockedAt`。
- heartbeat：Worker 周期性刷新 `lastHeartbeatAt`。
- stale lock：运行中任务锁超过 30 秒后自动恢复为 `retrying`。
- Concurrency Metrics：展示并发数、活跃 Worker、空闲 Worker、吞吐量和平均耗时。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，在右侧 `Queue Runtime V4` 中创建任务，观察 Worker Pool、任务锁、并发执行与时间线变化。

## 测试用例

测试用例见 `day34_test_cases.md`。
