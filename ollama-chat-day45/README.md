# Ollama Chat Day 45

Day 45 在 `ollama-chat-day44` 的 Observability & Tracing（可观测性与链路追踪）基础上，升级为 Production Runtime V2：Evaluation Framework（评估框架）。

## 本日重点

- 新增 `EvaluationResult`（评估结果）、`EvaluationRecord`（评估记录）、`EvaluationMetrics`（评估指标）和 `PromptABTestResult`（提示词 A/B 测试结果）。
- 新增 `Evaluation Agent`（评估智能体），能力包括 `evaluation`、`grading` 和 `assessment`。
- 新增 `evaluateOutput`（评估输出函数），支持模型评估和规则兜底评估。
- `Agent Runtime`（智能体运行时）在 `Reflection`（反思）之后自动接入 `Evaluation`（评估）。
- `Workspace`（工作空间）、`Timeline`（时间线）和 `Trace`（追踪）都会记录评估结果。
- 前端新增 `Evaluation Metrics`、`Evaluation Explorer` 和 `Prompt A/B Test` 面板。
- 浏览器标签页、页面标题、侧栏标题和演示任务均已更新为 Day 45 相关描述。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧面板会展示第45天的 Evaluation Framework 能力。

测试用例见 `day45_test_cases.md`。
