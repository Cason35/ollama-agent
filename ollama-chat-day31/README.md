# Ollama Chat Day 31

Day 31 在 `ollama-chat-day30` 的 RAG Runtime V7、Knowledge Store、Local Vector Store、Workflow Runtime 与 Tool Registry 基础上，新增 Queue Runtime V1（本地任务队列）。

## 本日新增

- `Job`：定义后台任务 ID、type、payload、status、result、error 与时间字段。
- `LocalFileJobStore`：把任务持久化到 `.queue-data/jobs-v1.json`。
- `QueueManager`：使用本地数组实现 `enqueue / dequeue / peek`。
- `Worker`：使用轮询执行任务，并更新 `queued -> running -> success / failed`。
- `Queue Dashboard`：在右侧侧栏展示排队、执行、成功、失败、平均耗时、任务表和最新任务时间线。
- `embedding` 长任务模拟：默认等待 5000ms，便于观察异步状态流转。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，可在右侧 `Queue Dashboard` 创建 `Embedding 长任务`、`Workflow 任务`、`Retrieval 任务` 与 `Reindex 任务`。

## 验收

测试用例见 `day31_test_cases.md`。

推荐执行：

```bash
npm run build
```
