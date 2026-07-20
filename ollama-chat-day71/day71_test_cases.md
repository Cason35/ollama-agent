# Day71 Production Evaluation Platform V2 测试用例

## 1. 测试目标

验证第 71 天的 Production Evaluation Platform V2（生产评估平台第 2 版）是否完成以下闭环：

```text
Observe（观察）
  → Evaluate（评估）
  → Diagnose（诊断）
  → Improve（改进）
  → Validate（验证）
```

自动化测试命令：

```bash
npm run test:day71
```

构建与静态检查命令：

```bash
npm run lint
npm run build
```

## 2. 环境与前置条件

- 工作目录：`ollama-chat-day71`。
- Node.js、npm 可正常使用。
- 已完成 `npm install`。
- 测试采用确定性夹具，不依赖真实 Ollama、MySQL、Redis、MinIO 或外部模型 API。
- 手工页面验收地址：`http://localhost:3000/evaluations`。

## 3. 自动化生产评估测试

### TC71-01：Agent Evaluation

目的：验证 Research Agent 运行后生成独立 EvaluationRun，并关联 RuntimeContext 和 Trace。

步骤：

1. 注册 `agent-research-v2` 数据集。
2. 使用高质量 Research Agent 夹具执行离线评估。
3. 读取 EvaluationRun、RuntimeContext 和 Trace。

预期结果：

- EvaluationRun 状态为 `completed`。
- `runtimeContextId` 非空。
- `traceIds` 包含独立 Trace。
- `evaluationContext.runId` 等于当前 EvaluationRun ID。
- `evaluationContext.datasetId` 等于 `agent-research-v2`。
- `trace.evaluation.evaluationRunId` 等于当前 EvaluationRun ID。
- Trace 中记录实际使用的评估器版本。

### TC71-02：Prompt Regression

目的：比较 Prompt V1 Baseline 与 Prompt V2 Candidate 在多维质量、延迟和成本上的变化。

步骤：

1. 在 `prompt-release-v2` 固定数据集上运行 Prompt V1。
2. 在同一数据集上运行 Prompt V2。
3. 执行 Regression Comparison。
4. 执行 Quality Gate V2。

预期结果：

- Candidate 的 `overall` 不低于 Baseline。
- Candidate 的 `correctness` 不低于 Baseline。
- Candidate 的 `completeness` 高于 Baseline。
- Candidate 延迟低于 Baseline。
- Candidate 成本增长不超过 20%。
- 高优先级案例通过率为 100%。
- Quality Gate V2 返回 `passed`。
- 不存在 Regressed Cases。

### TC71-03：RAG Evaluation

目的：验证十个知识问题的引用正确性、回答质量、知识库和活动索引版本。

步骤：

1. 注册包含十个知识问题的 `rag-knowledge-v2` 数据集。
2. 执行 RAG 离线评估。
3. 检查每个案例的引用和检索元数据。

预期结果：

- 生成十个 Evaluation Case Result。
- 每个案例均通过多维评估。
- 每个案例至少包含一个引用。
- `knowledgeBaseId` 为 `kb-agent-platform`。
- `indexVersion` 为 `knowledge-index-v71`。
- CitationEvaluator 和 RAGEvaluator 均被调用并保存版本。

### TC71-04：Workflow Evaluation

目的：使用第 70 天真实持久化工作流运行时评估失败恢复可靠性。

步骤：

1. 创建 Prepare、Analyze、Publish 三步骤工作流。
2. 在 Analyze 成功检查点后模拟服务中断。
3. 调用 Resume 恢复工作流。
4. 调用 Replay 检查完整事件时间线。
5. 将四项恢复诊断交给 WorkflowEvaluator。

预期结果：

- Prepare、Analyze、Publish 各执行一次。
- 已完成步骤不会被重复执行。
- Checkpoint 正确保存。
- Resume 从可靠位置继续。
- Event Timeline 包含 `workflow.paused`、`workflow.resumed`、`workflow.completed`。
- Workflow Evaluation 通过。
- Reliability Score 为 10 分。

### TC71-05：Online Evaluation

目的：验证 5% 基础采样之外的风险条件可以强制触发在线评估。

步骤：

1. 将采样率设置为 0。
2. 将生产请求延迟设置为 1600ms，阈值设置为 900ms。
3. 将即时用户反馈设置为 1 分。
4. 提交生产请求给 Online Evaluation。

预期结果：

- 即使采样率为 0，风险请求仍被评估。
- `evaluated` 为 `true`。
- 触发原因优先记录为 `feedback-risk`。
- EvaluationRun 类型为 `online`。

### TC71-06：Feedback Loop 与 Bad Case Loop

目的：验证低分输出和负向用户反馈自动进入数据集并成为后续回归案例。

步骤：

1. 对低分在线评估结果提交 👎。
2. 提交 `rating = 1`。
3. 提交文字评论“低分输出遗漏持续改进关键步骤”。
4. 读取 Bad Case、Dataset 和 EventBus 快照。

预期结果：

- 创建一条 UserFeedbackV2。
- 创建一条 EvaluationBadCaseV2。
- 原数据集案例数量增加 1。
- 新案例 ID 以 `feedback_case_` 开头。
- 新案例来源为 `user_feedback`。
- 新案例优先级为 `critical`。
- EventBus 发布 `bad_case.created`。

### TC71-07：Evaluation Strategy Registry

目的：验证新增 Evaluator 时不需要修改 Evaluation Runner 核心流程。

预期注册项：

- `evaluation:evaluator:correctness`
- `evaluation:evaluator:citation`
- `evaluation:evaluator:rag`
- `evaluation:evaluator:workflow`
- `evaluation:evaluator:memory`
- `evaluation:evaluator:safety`

预期平台核心注册项：

- `evaluation:runner:v2`
- `evaluation:quality-gate:v2`
- `evaluation:dataset-provider:v2`

### TC71-08：Multi-Dimension Evaluation

目的：验证每个案例和运行均返回七维评分，而不是只有单个总分。

预期维度：

- `correctness`
- `relevance`
- `completeness`
- `safety`
- `latency`
- `cost`
- `overall`

预期结果：所有维度均处于 0 到 10 的范围内。

### TC71-09：RuntimeContext / EventBus / Trace

预期 RuntimeContext 字段：

- `evaluationContext.runId`
- `evaluationContext.datasetId`
- `evaluationContext.evaluatorVersions`
- `evaluationContext.scores`

预期 EventBus 事件：

- `evaluation.started`
- `evaluation.case_completed`
- `evaluation.completed`
- `quality_gate.passed` 或 `quality_gate.failed`
- `bad_case.created`

预期 Trace 字段：

- `trace.evaluation.evaluationRunId`
- `trace.evaluation.score`
- `trace.evaluation.evaluatorVersions`

### TC71-10：Evaluation Metrics V2

预期指标：

- `totalRuns`
- `successRate`
- `avgScore`
- `avgLatency`
- `avgCost`
- `regressionCount`
- `badCaseCount`
- `qualityGateFailCount`
- `evaluatorUsage`

## 4. Evaluation Explorer V2 手工页面测试

### TC71-UI-01：标题与标签页

- 浏览器标签页标题包含 `Day 71` 和 `Production Evaluation Platform V2`。
- 页面主标题为 `Production Evaluation Platform V2`。
- 页面徽标显示 `Day 71`。
- 生产化升级标签显示 `Production Upgrade V8`。
- 主工作台标题和日期徽标均已由 70 更新为 71。
- 页面提供以下标签页：
  - Day71 Evaluation Runs。
  - Day71 Case Analysis。
  - Day71 Regression。
  - Day71 Quality Gate。
  - Day71 Feedback Loop。

### TC71-UI-02：Evaluation Runs

- 展示 Run ID、Type、Dataset、Score、Duration。
- 展示 RuntimeContext ID 和 Trace ID。
- 展示七个评分维度。
- 在线、离线、回归、实验运行使用清晰状态徽标。

### TC71-UI-03：Case Analysis

- 展示 Input、Output、Expected、Score、Trace。
- RAG 案例展示引用。
- 可展开查看 Evaluator Version 和评分原因。
- 低分案例显示“👎 2分并沉淀 Bad Case”按钮。

### TC71-UI-04：Regression 与 Quality Gate

- 展示 Baseline 和 Candidate。
- 展示 Improved、Regressed、Failed Cases。
- 展示七维评分变化。
- Quality Gate 展示 PASS / FAIL。
- 展示综合分、正确性、高优先级通过率、成本增长和 Reasons。

### TC71-UI-05：Feedback Loop

- 展示点赞、点踩、rating 和 comment。
- 展示“线上失败 → Bad Case → Dataset → Regression Test”闭环。
- 展示 `evaluationContext` 示例。
- 展示 EventBus 事件。
- 展示 UnifiedRegistry 中的 Day71 评估能力。

## 5. 第 71 天验收标准映射

| 验收项 | 对应测试 |
| --- | --- |
| EvaluationRun | TC71-01、TC71-02、TC71-03、TC71-04、TC71-05 |
| Evaluation Dataset V2 | TC71-03、TC71-06、TC71-07 |
| Evaluation Runner V2 | TC71-01 至 TC71-05 |
| Multi-Dimension Evaluation | TC71-02、TC71-08 |
| Evaluation Strategy Registry | TC71-07 |
| Trace 关联 Evaluation | TC71-01、TC71-09 |
| Online Evaluation | TC71-05 |
| Feedback Loop | TC71-06 |
| Quality Gate V2 | TC71-02 |
| Evaluation Explorer V2 | TC71-UI-01 至 TC71-UI-05 |
| Evaluation Metrics V2 | TC71-10 |
| RuntimeContext / EventBus / UnifiedRegistry | TC71-07、TC71-09 |
| Production Evaluation Test | TC71-01 至 TC71-06 |

## 6. 通过标准

- `npm run test:day71` 退出码为 0。
- `npm run lint` 退出码为 0。
- `npm run build` 退出码为 0。
- `/evaluations` 页面可正常加载，无控制台致命错误。
- 第 71 天十三项验收标准均有代码实现、自动化断言或手工页面验证覆盖。
