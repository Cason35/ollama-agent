# Day 57 测试用例：Adaptive Runtime Decision Engine（自适应运行时决策引擎）

## 测试范围

本文档用于验收 `ollama-chat-day57` 的第57天任务，重点验证 RuntimeContext、RuntimeDecision、Decision Rules、Agent Runtime 接入、Trace 接入、Runtime Explorer、Runtime Metrics 和 Decision Replay。

## 自动化测试命令

```bash
npm run test:day57
```

## 用例 1：普通聊天选择快速策略

- 输入：`taskType=chat`、`complexity=low`、`latencyPreference=fast`、`budgetLevel=low`
- 期望：
  - `promptStrategy=fast`
  - `modelStrategy=small`
  - `collaborationStrategy=direct`
  - `cacheStrategy=cache-first`
  - `retrievalStrategy=none`

## 用例 2：复杂研究选择质量和多模型策略

- 输入：`taskType=research`、`complexity=high`、`latencyPreference=quality`、`budgetLevel=high`、`hasKnowledge=true`、`hasWorkspace=true`、`hasMemory=true`
- 期望：
  - `promptStrategy=quality`
  - `modelStrategy=multi`
  - `collaborationStrategy=model-collaboration`
  - `retrievalStrategy=deep-rag`
  - `memoryStrategy=workspace`

## 用例 3：JSON 输出选择结构化策略

- 输入：`requiresJson=true`
- 期望：
  - `promptStrategy=json`
  - `modelStrategy=json`
  - `cacheStrategy=bypass`

## 用例 4：Decision Replay 与 Runtime Metrics

- 步骤：
  - 连续写入一条 fast 决策和一条 quality 决策
  - 读取 `RuntimeDecisionStore.listRecords()`
  - 读取 `RuntimeDecisionStore.getMetrics()`
- 期望：
  - 最新决策排在回放记录最前面
  - `fastStrategyUsage >= 1`
  - `qualityUsage >= 1`
  - `avgDecisionTime >= 1`
  - `avgEstimatedCost > 0`

## 用例 5：Runtime Explorer 看板快照

- 步骤：
  - 调用 `getRuntimeDashboardSnapshot()`
  - 检查预览、回放和指标
- 期望：
  - 至少包含四类典型决策预览
  - 返回 Decision Replay 记录
  - 返回平均估算延迟等 Runtime Metrics

## 用例 6：Agent Runtime 接入 RuntimeDecision

- 步骤：
  - 调用 `AgentRuntime.runSupervisorCollaboration()`
  - 读取返回的协作快照
- 期望：
  - 快照包含 `runtimeContext`
  - 快照包含 `runtimeDecision`
  - 决策被传入 Agent 执行上下文

## 用例 7：Trace 接入 Decision Span

- 步骤：
  - 运行一次高复杂研究任务
  - 检查 `snapshot.trace.spans`
- 期望：
  - 至少存在一个 `type=decision` 的 Span
  - Span metadata 包含 `promptStrategy`、`modelStrategy`、`collaborationStrategy`
  - `traceMetrics.avgDecisionDuration` 可计算

## 用例 8：聊天 API 写入真实决策回放

- 步骤：
  - 通过页面发送普通聊天或 Workflow 请求
  - 打开右侧“决策”标签页
- 期望：
  - Decision Replay 出现来源为 `chat-api` 或 `chat-api-workflow` 的记录
  - 记录中展示 Prompt、Model、Collaboration、Cache、Retrieval 和 Memory 策略

## 用例 9：浏览器标签页和页面标题

- 步骤：
  - 打开首页、`/prompts` 和 `/experiments`
- 期望：
  - 首页标签页为 Day 57 Adaptive Runtime Decision Platform
  - 首页主标题为 Adaptive Runtime Decision Platform / 自适应运行时决策平台
  - 侧栏默认打开“决策”标签页
  - `/prompts` 和 `/experiments` 的标签页内容均为 Day57 相关描述
