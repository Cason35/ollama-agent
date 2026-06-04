# Day 31 测试用例：Queue Runtime V1（本地任务队列）

本文档用于验收 `ollama-chat-day31` 的第31天任务：Job Queue、JobStore、QueueManager、Worker、Queue Dashboard、Job Timeline、Queue Metrics 与长任务模拟。

## 1. 页面与标题验收

| 编号 | 测试目标 | 操作步骤 | 预期结果 |
|---|---|---|---|
| TC31-01 | 浏览器标签页标题已更新 | 启动项目并打开首页 | 标签页显示 `Day 31 - Queue Runtime V1 · Local Job Queue` |
| TC31-02 | 顶部标题已更新 | 查看页面顶部 Header | 显示 `Day 31` 与 `Queue Runtime V1 · Local Job Queue + Worker` |
| TC31-03 | day30 业务能力仍保留 | 查看右侧 RAG / Tool / Memory 面板 | RAG 知识库、Vector Explorer、RAG Debug Panel、历史 Workflow 与长期记忆仍存在 |

## 2. Queue Dashboard 验收

| 编号 | 测试目标 | 操作步骤 | 预期结果 |
|---|---|---|---|
| TC31-04 | 队列看板可加载 | 打开首页右侧侧栏最上方 | 可以看到 `Queue Dashboard`、四个指标卡与任务表格 |
| TC31-05 | 初始指标正确 | 首次打开或清空任务文件后刷新页面 | `queued/running/success/failed` 均为 0，任务表显示暂无任务 |
| TC31-06 | 创建 embedding 长任务 | 点击 `Embedding 长任务` | 新任务进入表格，状态先为 `queued`，随后变为 `running` |
| TC31-07 | 长任务完成 | 等待约 5 秒 | embedding 任务状态变为 `success`，`success` 指标加 1，平均耗时接近 5000ms |
| TC31-08 | 创建 workflow 任务 | 点击 `Workflow 任务` | workflow 任务被创建并由 Worker 异步执行，最终状态为 `success` |
| TC31-09 | 创建 retrieval 任务 | 点击 `Retrieval 任务` | retrieval 任务被创建，payload 使用当前 RAG Debug Query，最终状态为 `success` |
| TC31-10 | 创建 reindex 任务 | 点击 `Reindex 任务` | reindex 模拟任务被创建并成功完成 |

## 3. Job Timeline 验收

| 编号 | 测试目标 | 操作步骤 | 预期结果 |
|---|---|---|---|
| TC31-11 | Created 节点存在 | 创建任意任务后查看 `Job Timeline` | 时间线包含 `Created` 节点与创建时间 |
| TC31-12 | Started 节点存在 | 创建任务并等待 Worker 取走 | 时间线出现 `Started` 节点 |
| TC31-13 | Completed 节点存在 | 等待任务成功完成 | 时间线出现 `Completed` 节点 |
| TC31-14 | Duration 展示正确 | 查看任务表 Duration 列 | running 时持续变化，success 后固定为开始到完成耗时 |

## 4. API 验收

| 编号 | 测试目标 | 请求 | 预期结果 |
|---|---|---|---|
| TC31-15 | 获取队列快照 | `GET /api/queue` | 返回 `{ jobs, metrics }`，并符合统一 API Envelope |
| TC31-16 | 创建合法任务 | `POST /api/queue`，body 为 `{ "type": "embedding", "payload": { "durationMs": 5000 } }` | 返回 `job created`，新任务状态为 `queued` |
| TC31-17 | 拒绝非法任务类型 | `POST /api/queue`，body 为 `{ "type": "unknown" }` | 返回 400，错误信息为 `无效的 Job Type` |
| TC31-18 | 拒绝非法 JSON | `POST /api/queue`，body 不是 JSON | 返回 400，错误信息为 `请求体必须是 JSON` |

## 5. 持久化验收

| 编号 | 测试目标 | 操作步骤 | 预期结果 |
|---|---|---|---|
| TC31-19 | JobStore 文件写入 | 创建任意任务后查看 `.queue-data/jobs-v1.json` | 文件存在，里面包含任务 ID、type、status、timeline |
| TC31-20 | 刷新后任务保留 | 创建并完成任务后刷新页面 | 任务表仍能看到历史任务与指标 |

## 6. 构建验收

| 编号 | 测试目标 | 操作步骤 | 预期结果 |
|---|---|---|---|
| TC31-21 | TypeScript 与 Next 构建 | 执行 `npm run build` | 构建成功，无类型错误 |
