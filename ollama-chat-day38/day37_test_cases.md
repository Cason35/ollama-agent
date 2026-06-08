# Day 37 测试用例：Queue Runtime V7 - Workflow as Job

## 测试前准备

1. 在 `ollama-chat-day37` 目录执行 `npm install`。
2. 执行 `npm run dev` 并打开 `http://localhost:3000`。
3. 如需真实模型工作流，确保 Ollama 服务与 `.env.local` 中的模型配置可用。

## 用例 1：页面标题与标签页

- 操作：打开首页。
- 预期：浏览器标签页显示 `Day 37 - Queue Runtime V7 | Workflow as Job`。
- 预期：首页标题显示 `Queue Runtime V7 · Workflow as Job`。
- 预期：右侧看板标题显示 `Queue Runtime V7`。

## 用例 2：Workflow 请求只创建 Job，不直接同步执行

- 操作：打开 Workflow 开关，输入“帮我分析整个知识库并整理行动清单”。
- 预期：聊天区返回 `Workflow Job 已创建`，并展示 workflow 的 `jobId`。
- 预期：workflow 初始状态为 `queued`。
- 预期：右侧 Queue 表格出现 `type = workflow` 的任务。

## 用例 3：Job 与 Workflow 双向关联

- 操作：查看聊天气泡中的 `job` 字段，再查看右侧最新 Job 的悬浮提示或时间线。
- 预期：聊天气泡里的 `jobId` 与 Queue 表格中的 Job ID 一致。
- 预期：workflow job 的 `workflowId` 与聊天气泡中的 workflow id 一致。

## 用例 4：Worker 执行 WorkflowJob

- 操作：等待 Worker 认领 workflow job。
- 预期：Job 状态从 `queued` 变为 `running`，最终变为 `success`、`dead_letter`、`timeout` 或因 HITL 变成带 `WorkflowPaused` 节点的完成结果。
- 预期：Job result 中包含 `workflowStatus`、`workflow` 和 `finalSummary`。
- 预期：Unified V7 Timeline 中出现 `WorkflowStarted`，成功时出现 `WorkflowSuccess`。

## 用例 5：Workflow 状态同步

- 操作：创建一个可正常执行的 WorkflowJob。
- 预期：Worker 执行时 workflow 状态为 `running`。
- 预期：执行成功后 Job result 里的 workflow 状态为 `success`。
- 预期：如遇人工确认步骤，workflow 状态为 `paused`，并保留等待确认步骤。

## 用例 6：Workflow 取消

- 操作：创建 workflow job 后，在其 `queued`、`retrying` 或 `running` 状态点击 `Cancel`。
- 预期：未运行任务直接变为 `cancelled`。
- 预期：运行中任务先变为 `cancelling`，Worker 检测后变为 `cancelled`。
- 预期：时间线出现 `CancelRequested` 和 `Cancelled`。

## 用例 7：Restart as New Job

- 操作：对 `cancelled`、`failed`、`dead_letter` 或 `timeout` 任务点击 `Restart`。
- 预期：旧 Job 保持原终态和历史时间线。
- 预期：系统创建一个新的 Job ID。
- 预期：新 Job 继承旧 Job 的 `type`、`payload`、`priority`、`timeoutMs` 和 `workflowId`。

## 用例 8：Timeout 与 Requeue 保持兼容

- 操作：点击 `Timeout Embedding Job`。
- 预期：任务触发 timeout，并按重试策略进入 `retrying` 或最终 `timeout`。
- 操作：对 `timeout` 任务点击 `Requeue`。
- 预期：同一个 Job ID 回到 `queued`，尝试次数清零。

## 用例 9：手动 Workflow Job 按钮

- 操作：点击右侧 `Workflow Job P8`。
- 预期：创建一个合法的最小 workflow job。
- 预期：该 Job 不会因为缺少 workflow 或 memory payload 而失败。
- 预期：Worker 可执行该 workflow job，并在结果中返回 workflow 状态。

## 用例 10：构建与静态检查

- 操作：执行 `npm run lint`。
- 预期：没有错误；允许继承代码中的少量历史 warning。
- 操作：执行 `npm run build`。
- 预期：Next.js 构建与 TypeScript 类型检查通过。
