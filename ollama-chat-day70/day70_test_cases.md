# Day70 持久化智能体工作流平台测试用例

## 1. 测试目标

验证 `Durable Agent Workflow Platform V1（持久化智能体工作流平台第 1 版）` 的版本化定义、执行实例、状态存储第二版、检查点、恢复、重试、人工确认、回放、取消、事件溯源、指标、运行时上下文和统一注册中心能力。

## 2. 自动化测试执行

```bash
npm run test:day70
```

成功标志：

```text
Day70 Durable Agent Workflow Platform：六个验收案例与十四项标准全部通过
```

## 3. 核心测试用例

### Case 1：Workflow Version Upgrade（工作流版本升级）

前置条件：

- 注册 `research-flow V1`，步骤为 `research → draft → publish`。
- 注册 `research-flow V2`，步骤为 `research → draft → critic → approval → publish`。

测试步骤：

1. 查询 Workflow Catalog。
2. 分别读取 V1 和 V2 的冻结步骤定义。
3. 在 V2 已存在的情况下启动一个 V1 执行实例。

预期结果：

- V1 与 V2 同时存在。
- V1 不包含 `critic`，V2 包含 `critic`。
- V1 执行实例的 `workflowVersion` 始终为 `1`。
- V1 执行不会被 V2 定义覆盖，仍可以完成和审计。

### Case 2：Interrupted Recovery（中断恢复）

前置条件：

- 定义 `step-1 → step-2 → step-3` 三步骤工作流。
- 每个步骤处理器记录实际调用次数。

测试步骤：

1. 启动工作流。
2. 在 `step-2` 成功并写入 Checkpoint 后模拟服务重启。
3. 确认执行状态为 `paused`。
4. 调用 `resumeWorkflow(executionId)`。

预期结果：

- 中断前 `completedSteps` 为 `step-1、step-2`。
- 恢复点为 `step-2` 的成功 Checkpoint。
- 恢复后只执行 `step-3`。
- 三个步骤的实际调用次数均为 1。
- 最终状态为 `completed`。

### Case 3：Checkpoint Recovery（检查点失败恢复）

前置条件：

- `stable` 步骤成功。
- `fragile` 步骤第一次执行失败、第二次执行成功。
- `tail` 依赖 `fragile`。

测试步骤：

1. 首次启动工作流并等待 `fragile` 失败。
2. 检查 `stable` 成功 Checkpoint 与 `fragile` 失败 Checkpoint。
3. 调用 `resumeWorkflow(executionId)` 重试。

预期结果：

- 首次执行状态为 `failed`。
- `stable` 保留在 `completedSteps` 中。
- Retry 不重复执行 `stable`。
- `fragile` 总共执行两次。
- `tail` 只执行一次。
- 最终状态为 `completed`。

### Case 4：HITL Resume（人工确认后恢复）

前置条件：

- 使用 `research-flow V2`。
- `approval` 设置 `requiresConfirmation: true`。

测试步骤：

1. 启动 V2 执行。
2. 等待执行进入 `approval`。
3. 检查执行状态与等待 Checkpoint。
4. 调用 `approveAndResumeWorkflow(executionId)`。

预期结果：

- 确认前状态为 `waiting`。
- `currentStepId` 为 `approval`。
- Event Timeline 包含 `workflow.paused`，原因为 `hitl`。
- 确认后发布 `workflow.resumed`。
- `approval` 与 `publish` 继续执行。
- 最终状态为 `completed`。

### Case 5：Replay（无副作用回放）

前置条件：

- 至少存在一个已完成执行实例。
- 已保存 Event Log、Checkpoint 和 Step Output。

测试步骤：

1. 记录全部步骤处理器调用次数。
2. 调用 `replayWorkflow(executionId)`。
3. 对比回放前后的处理器调用次数。
4. 检查回放时间线、检查点、输出与 Recovery Point。

预期结果：

- 回放不会重新调用步骤处理器或模型。
- 返回完整 Event Timeline。
- 返回全部 Checkpoint。
- 返回历史 Step Output。
- `reconstructedStatus` 与历史执行终态一致。
- `recoveryCheckpointId` 指向最近成功检查点。

### Case 6：Cancel（取消执行）

前置条件：

- 存在一个 `paused`、`waiting`、`running` 或 `failed` 执行实例。

测试步骤：

1. 调用 `cancelWorkflow(executionId)`。
2. 重新读取执行实例与 Workflow State V2。
3. 检查 Event Timeline。

预期结果：

- 最终状态为 `cancelled`。
- `completedAt` 已记录。
- 已有 Checkpoint 与历史输出仍然保留。
- Event Timeline 包含 `workflow.cancelled`。

## 4. 集成测试用例

### Case 7：RuntimeContext 集成

检查项：

- `workflowContext.workflowId` 与执行定义一致。
- `workflowContext.executionId` 与执行实例一致。
- `workflowContext.version` 为冻结版本。
- 成功步骤完成后，`workflowContext.checkpointId` 指向最近 Checkpoint。

### Case 8：EventBus 与 Event Sourcing 集成

必须出现的事件：

- `workflow.created`
- `workflow.started`
- `workflow.step_started`
- `workflow.step_completed`
- `workflow.step_failed`
- `workflow.paused`
- `workflow.resumed`
- `workflow.completed`
- `workflow.cancelled`

预期结果：

- Workflow Event Store 中事件按 `sequence` 递增。
- MemoryEventBus 中能够读取相同生命周期类型。
- 每条事件包含 `traceId` 与 `runtimeContextId`。

### Case 9：UnifiedRegistry 集成

必须注册：

- `DurableWorkflowExecutor（持久化工作流执行器）`
- `CheckpointStore（检查点存储）`
- `WorkflowReplayEngine（工作流回放引擎）`
- `WorkflowStateStoreV2（工作流状态存储第 2 版）`
- `research-flow V1` 与 `research-flow V2` 两个定义版本

### Case 10：Workflow Metrics V2

检查字段：

| 字段 | 预期 |
| --- | --- |
| `totalExecutions` | 等于当前执行实例总数 |
| `successRate` | 完成实例数 / 总实例数 |
| `failureRate` | 当前失败实例数 / 总实例数 |
| `averageDuration` | 终态实例平均执行时长，单位毫秒 |
| `retryCount` | 失败恢复重试累计次数 |
| `resumeCount` | 中断、失败、HITL 恢复累计次数 |
| `replayCount` | 历史回放累计次数 |
| `checkpointCount` | 成功、失败、等待检查点总数 |
| `activeExecutions` | `created/running/paused/waiting` 实例数 |

## 5. 页面手工测试

访问：

```text
http://localhost:3000/workflows
```

### Workflow Catalog 标签页

- 页面标题显示 `Day 70` 和 `Durable Agent Workflow Platform V1`。
- 同时显示 `research-flow V1` 与 `research-flow V2`。
- V1 显示 `deprecated`，V2 显示 `active`。
- 步骤、依赖、负责人和更新时间完整。

### Execution Explorer 标签页

- 能看到 `completed`、`paused` 与 `waiting` 示例执行。
- `paused` 实例显示 `Resume（恢复）`。
- `waiting` 实例显示 `Confirm & Resume（确认并恢复）`。
- 非终态实例显示 `Cancel（取消）`。
- 所有实例均可执行 `Replay（回放）`。

### Replay Debug 标签页

- 显示 Event Timeline、Checkpoint、Step Output 和 Recovery Point。
- 显示 `RuntimeContext.workflowContext`。
- 显示 UnifiedRegistry 中 Day70 工作流能力。

## 6. Day70 验收映射

| 验收项 | 实现或测试位置 |
| --- | --- |
| Workflow Definition V2 / Version | `durable-workflow-types.ts`、Case 1 |
| UnifiedRegistry | `durable-workflow-runtime.ts`、Case 9 |
| Workflow Execution Instance | `WorkflowExecutionV2`、Execution Explorer |
| Workflow State Store V2 | `durable-workflow-store.ts`、Case 2/3 |
| Checkpoint System | `CheckpointStore`、Case 2/3/4 |
| Durable Executor | `executeDurableWorkflow`、全部自动化案例 |
| Workflow Resume | `resumeWorkflow`、Case 2/3/4 |
| Workflow Replay | `replayWorkflow`、Case 5 |
| Workflow Event Sourcing | `WorkflowEventStore`、Case 8 |
| Workflow Explorer V2 | `/workflows` 三个标签页 |
| Workflow Metrics V2 | 顶部九项指标、Case 10 |
| RuntimeContext / EventBus / Registry | Case 7/8/9 |
| Durable Workflow Test | `npm run test:day70` |
