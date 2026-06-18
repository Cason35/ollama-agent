# Day 45 测试用例：Evaluation Framework（评估框架）

本文档用于验证 `ollama-chat-day45` 是否完成第45天任务：Production Runtime V2（生产运行时第2版）支持 EvaluationResult（评估结果）、Evaluation Agent（评估智能体）、evaluateOutput（评估输出函数）、Evaluation Timeline（评估时间线）、Evaluation Explorer（评估浏览器）、Evaluation Metrics（评估指标）和 Prompt A/B Test（提示词 A/B 测试）。

## 1. 项目与标题测试

### 用例 1.1：项目名称已更新

步骤：
1. 打开 `package.json`。
2. 检查 `name` 字段。

预期结果：
- `name` 等于 `ollama-chat-day45`。

### 用例 1.2：浏览器标签页已更新

步骤：
1. 打开 `app/layout.tsx`。
2. 检查 `metadata.title`。

预期结果：
- 标题包含 `Day 45`。
- 标题包含 `Evaluation Framework`。
- 标题包含 `Production Runtime V2`。

### 用例 1.3：页面主标题已更新

步骤：
1. 启动项目并打开首页。
2. 查看顶部主标题。

预期结果：
- 顶部标记显示 `Day 45`。
- 主标题为 `Evaluation Framework（评估框架） · Production Runtime V2（生产运行时第2版）`。
- 右侧看板标题为 `Production Evaluation Dashboard（生产评估运行看板）`。

## 2. 类型与注册表测试

### 用例 2.1：EvaluationResult 类型存在

步骤：
1. 打开 `lib/agents/agent-types.ts`。
2. 搜索 `EvaluationResult`。

预期结果：
- 存在 `score` 字段。
- 存在 `dimensions.completeness`、`dimensions.correctness`、`dimensions.relevance`、`dimensions.coverage`。
- 存在 `strengths`、`weaknesses`、`suggestions`。

### 用例 2.2：Evaluation Agent 已注册

步骤：
1. 打开 `lib/agents/default-agents.ts`。
2. 搜索 `id: "evaluation"`。

预期结果：
- 存在 `Evaluation Agent`。
- `capabilities` 包含 `evaluation`、`grading`、`assessment`。
- `tools` 包含 `evaluateOutput`。

## 3. 运行时评估测试

### 用例 3.1：evaluateOutput 可直接调用

步骤：
1. 打开 `lib/agents/agent-executor.ts`。
2. 搜索 `evaluateOutput` 导出函数。

预期结果：
- 存在公开的 `evaluateOutput(task, output, agentId, rt)`。
- 返回类型为 `Promise<EvaluationResult>`。

### 用例 3.2：Agent 输出后自动评估

步骤：
1. 调用 `/api/agents`。
2. 查看返回的 `collaboration.evaluations`。

预期结果：
- `evaluations` 是数组。
- 每条记录包含 `agentId`、`taskId`、`output`、`evaluation`、`createdAt`。
- `evaluation.score` 为 0 到 100。

### 用例 3.3：Evaluation 写入 metadata

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.result.metadata.evaluation` 或子结果中的 `metadata.evaluation`。

预期结果：
- AgentResult 的 metadata 中包含 `evaluation`。
- `evaluation.dimensions` 四个维度均存在。

### 用例 3.4：Evaluation 写入 Workspace

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.workspace.entries`。

预期结果：
- 至少存在一条 `agentId` 为 `evaluation` 的记录。
- 记录正文包含 `Evaluation（评估）`。
- 记录标签包含 `evaluation`。

### 用例 3.5：Evaluation 写入 Timeline

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.timeline`。

预期结果：
- 存在 `Evaluation Started` 事件。
- 存在 `Evaluation Finished` 事件。
- 存在 `Prompt A/B Test winner` 事件。

### 用例 3.6：Evaluation 写入 Trace

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.trace.spans`。

预期结果：
- 至少存在一个 `type` 为 `evaluation` 的 span。
- 评估 span 的 metadata 包含 `score`。
- Prompt A/B Test span 的 metadata 包含 `scoreA`、`scoreB`、`winner`。

## 4. Evaluation Metrics 测试

### 用例 4.1：评估指标存在

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.evaluationMetrics`。

预期结果：
- 存在 `averageScore`。
- 存在 `scoreDistribution`。
- 存在 `topAgents`。
- 存在 `lowScoreTasks`。
- 存在 `improvementTrend`。

### 用例 4.2：评分分布合理

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.evaluationMetrics.scoreDistribution`。

预期结果：
- 分布桶只包含 `90-100`、`80-89`、`70-79`、`0-69` 中的键。
- 分布数量总和等于 `collaboration.evaluations.length`。

## 5. Prompt A/B Test 测试

### 用例 5.1：A/B 测试结果存在

步骤：
1. 调用 `/api/agents`。
2. 查看 `collaboration.promptABTest`。

预期结果：
- 存在 `promptVersionA` 和 `promptVersionB`。
- 存在 `scoreA` 和 `scoreB`。
- 存在 `winner`。
- 存在 `evaluationA` 和 `evaluationB`。

### 用例 5.2：B 版策略可解释

步骤：
1. 查看 `collaboration.promptABTest.promptVersionB`。

预期结果：
- B 版提示词策略包含完整性、正确性、相关性、覆盖度、风险和下一步。

## 6. 前端面板测试

### 用例 6.1：Evaluation Metrics 面板显示

步骤：
1. 启动项目。
2. 打开首页右侧 Agent 面板。

预期结果：
- 页面显示 `Evaluation Metrics（评估指标）`。
- 页面显示平均分、趋势、分布、高分智能体和低分任务。

### 用例 6.2：Evaluation Explorer 面板显示

步骤：
1. 启动项目。
2. 打开首页右侧 Agent 面板。

预期结果：
- 页面显示 `Evaluation Explorer（评估浏览器）`。
- 每条评估记录显示 Agent、任务、总分、四个维度分、优点和建议。

### 用例 6.3：Prompt A/B Test 面板显示

步骤：
1. 启动项目。
2. 打开首页右侧 Agent 面板。

预期结果：
- 页面显示 `Prompt A/B Test（提示词 A/B 测试）`。
- 页面显示 `Score A`、`Score B` 和 `Winner`。

## 7. 验收标准

- 已定义 `EvaluationResult`。
- 已新增 `Evaluation Agent`。
- 已实现 `evaluateOutput`。
- 已实现 Evaluation Prompt。
- Agent Runtime 已接入 Evaluation。
- Evaluation 已写入 Workspace。
- 已实现 Evaluation Timeline。
- 已实现 Evaluation Explorer。
- 已新增 Evaluation Metrics。
- 已完成 Prompt A/B Test。

全部通过后，说明第45天的 Evaluation Framework（评估框架）任务完成。
