# Day 44 测试用例：Observability & Tracing（可观测性与链路追踪）

本文档用于验证 `ollama-chat-day44` 是否完成第44天任务：Production Runtime V1（生产运行时第1版）支持 Trace（追踪记录）、TraceSpan（追踪跨度）、TraceManager（追踪管理器）、Supervisor/Agent/Tool/Reflection 链路接入、Trace Explorer（追踪浏览器）和 Trace Metrics（追踪指标）。

## 1. 项目与标题验证

### TC-44-01：项目名称与浏览器标签页

**前置条件**
- 已进入 `ollama-chat-day44` 目录。

**操作步骤**
1. 运行 `npm install`。
2. 运行 `npm run build`。
3. 启动页面后查看浏览器标签页。

**预期结果**
- `package.json` 的项目名为 `ollama-chat-day44`。
- 浏览器标签页包含 `Day 44`。
- 浏览器标签页包含 `Observability & Tracing`。
- 页面主标题包含 `Production Runtime V1`。

### TC-44-02：首页标题与侧栏标题

**操作步骤**
1. 打开首页。
2. 查看顶部标题。
3. 查看右侧 Agent 面板标题。

**预期结果**
- 顶部标记显示 `Day 44`。
- 顶部主标题为 `Observability & Tracing（可观测性与链路追踪） · Production Runtime V1（生产运行时第1版）`。
- 右侧看板标题为 `Production Tracing Dashboard（生产追踪运行看板）`。

## 2. Trace 类型与管理器验证

### TC-44-03：Trace 与 TraceSpan 类型

**操作步骤**
1. 打开 `lib/agents/agent-types.ts`。
2. 检查类型定义。

**预期结果**
- 存在 `Trace` 类型。
- 存在 `TraceSpan` 类型。
- `TraceSpan.type` 支持 `agent`、`tool`、`workflow`、`queue`、`reflection`、`retrieval`。
- `AgentCollaborationSnapshot` 返回 `trace`、`traces` 和 `traceMetrics`。

### TC-44-04：TraceManager 基础能力

**操作步骤**
1. 打开 `lib/agents/trace-manager.ts`。
2. 检查 `TraceManager` 方法。

**预期结果**
- 存在 `startTrace`。
- 存在 `endTrace`。
- 存在 `startSpan`。
- 存在 `endSpan`。
- 存在 `getTrace`。
- 存在 `listTraces`。
- 存在 `getMetrics`。

## 3. 后端链路追踪验证

### TC-44-05：Supervisor 接入 Trace

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查看返回的 `data.collaboration.trace.spans`。

**预期结果**
- 存在名为 `supervisor-plan` 的 span。
- `supervisor-plan.type` 为 `agent`。
- `supervisor-plan.status` 为 `success`。
- `supervisor-plan.metadata.selectedAgents` 存在。

### TC-44-06：Agent Runtime 接入 Trace

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查看 `trace.spans`。

**预期结果**
- 存在 `research`、`planner` 或 `writer` 等 agent span。
- agent span 的 `metadata.taskId` 存在。
- agent span 的 `status` 为 `success`。
- agent span 的 `metadata.reflectionScore` 存在或可为空但字段链路正常返回。

### TC-44-07：Tool 与 Retrieval 接入 Trace

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查找 `type` 为 `tool` 或 `retrieval` 的 span。

**预期结果**
- Research Agent 相关链路中至少存在一个 `retrieval` span。
- Writer、Planner 或 Critic 相关链路中可以看到 `tool` span。
- span 的 `metadata.agentId`、`metadata.taskId` 和 `metadata.attempt` 存在。

### TC-44-08：Reflection 接入 Trace

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查找 `type` 为 `reflection` 的 span。

**预期结果**
- 每个 Agent 输出后至少存在一次 reflection span。
- reflection span 的 `metadata.score` 存在。
- reflection span 的 `metadata.shouldRetry` 存在。
- 如果触发重试，同一 agent/task 下可以看到多次 reflection span。

### TC-44-09：Queue/Batch 接入 Trace

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查找 `type` 为 `queue` 的 span。

**预期结果**
- 存在 `parallel-batch-*` queue span。
- queue span 的 `metadata.stepIds` 存在。
- queue span 的 `metadata.completedStepIds` 存在。

## 4. 前端展示验证

### TC-44-10：Trace Metrics 展示

**操作步骤**
1. 打开首页。
2. 查看右侧 `Trace Metrics（追踪指标）` 面板。

**预期结果**
- 显示 `Traces（追踪数）`。
- 显示 `Trace Avg（链路均耗）`。
- 显示 `Agent Avg（智能体均耗）`。
- 显示 `Tool Avg（工具均耗）`。
- 显示 `Reflection Avg（反思均耗）`。

### TC-44-11：Trace Explorer 展示

**操作步骤**
1. 打开首页。
2. 查看右侧 `Trace Explorer（追踪浏览器）` 面板。

**预期结果**
- 显示 `traceId`。
- 显示 `Root（根操作）`。
- 显示 Span 名称、类型、状态和耗时。
- 子 Span 根据 `parentSpanId` 产生缩进。

## 5. 回归验证

### TC-44-12：Reflection 功能仍然可用

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查看 `collaboration.reflectionAttempts`。
3. 查看 `collaboration.reflectionMetrics`。

**预期结果**
- `reflectionAttempts` 不为空。
- `reflectionMetrics.averageScore` 为数字。
- `reflectionMetrics.retryCount` 为数字。
- 原 Day43 的反思评分、重试和 Workspace 写入能力仍然保留。

### TC-44-13：Workspace 功能仍然可用

**操作步骤**
1. 请求 `GET /api/agents`。
2. 查看 `collaboration.workspace`。
3. 查看 `collaboration.workspaceMetrics`。

**预期结果**
- `workspace.entries` 不为空。
- Workspace 中包含 Reflection 写入的 `decision` 条目。
- `workspaceMetrics.entryCount` 大于 0。

## 6. 验收命令

```bash
npm install
npm run lint
npm run build
```

全部通过后，说明第44天的 Observability & Tracing（可观测性与链路追踪）任务完成。
