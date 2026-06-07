# Ollama Chat Day 37

Day 37 在 `ollama-chat-day36` 的 Queue Runtime V6 生命周期控制基础上，升级为 Queue Runtime V7：Workflow as Job。

## 本日重点

- WorkflowJob：`type: "workflow"` 的 Job 会携带 `workflowId`、完整 Workflow 快照和 Memory 快照。
- Job 驱动 Workflow：聊天接口只负责规划、校验和入队，不再在请求内直接执行 Workflow。
- Worker 执行 Workflow：Worker 领取 workflow job 后调用 Workflow Runtime 执行 DAG 步骤。
- 状态同步：Workflow 支持 `queued` / `running` / `paused` / `success` / `failed` / `cancelled`，并和 Job 结果关联。
- 双向关联：Job 增加 `workflowId`，Workflow 增加 `jobId`，聊天气泡和 Queue Dashboard 都能对照查看。
- Unified Timeline：Job Timeline 新增 WorkflowQueued、WorkflowStarted、WorkflowSuccess、WorkflowFailed 等节点。
- Restart as New Job：终止任务可克隆为新 Job 重启，旧 Job 历史保持不变。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，开启 Workflow 模式并发送多步骤任务，右侧 `Queue Runtime V7` 会展示 Job -> Workflow -> Step 的执行链路。

## 测试用例

测试用例见 `day37_test_cases.md`。
