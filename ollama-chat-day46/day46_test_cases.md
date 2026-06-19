# Day 46 测试用例：Bad Case Management & Regression Evaluation

本文档用于验收 `ollama-chat-day46` 的 Continuous Evaluation System（持续评估系统）。测试覆盖固定评估数据集、失败案例管理、批量评估、基线保存、回归对比、质量门禁、可观测性接入、前端看板和第45天功能兼容性。

## 1. 项目与标题测试

### 用例 1.1：项目名称已更新

步骤：

1. 打开 `package.json`。
2. 检查 `name` 字段。

预期结果：

- `name` 等于 `ollama-chat-day46`。

### 用例 1.2：浏览器标签页已更新

步骤：

1. 打开 `app/layout.tsx`。
2. 检查 `metadata.title` 和 `metadata.description`。

预期结果：

- 标题包含 `Day 46`。
- 标题包含 `Bad Case Management & Regression Evaluation`。
- 描述包含 `Continuous Evaluation System` 对应的持续评估能力。

### 用例 1.3：页面主标题已更新

步骤：

1. 运行 `npm run dev`。
2. 打开首页。

预期结果：

- 顶部显示 `Day 46`。
- 主标题显示 `Bad Case Management（失败案例管理） · Regression Evaluation（回归评估）`。
- 右侧显示 `Regression Dashboard（回归评估看板）`。

## 2. Evaluation Dataset（评估数据集）测试

### 用例 2.1：数据集结构校验

步骤：

1. 运行 `npm run test:day46`。
2. 或调用 `validateEvaluationDataset(DAY46_EVALUATION_DATASET)`。

预期结果：

- 校验错误数组为空。
- 数据集具有 `id`、`name`、`version` 和 `cases`。
- 每个案例具有唯一 ID、输入、期望输出或参考答案、评分规则、标签、难度、优先级和来源。
- 四个评分维度权重之和为 1。

### 用例 2.2：案例类型覆盖

预期结果：

- 至少包含一个 `normal`（正常案例）。
- 至少包含一个 `bad_case`（失败案例）。
- 至少包含一个 `edge_case`（边界案例）。
- 数据集包含空输入、长文本或超时隔离场景。

## 3. Bad Case Management（失败案例管理）测试

### 用例 3.1：历史失败记录完整

步骤：

1. 请求 `GET /api/regression`。
2. 查看 `data.badCases`。

预期结果：

- 每条记录包含失败类型、严重度、影响范围、Agent、Prompt Version 和 Trace ID。
- 每条记录包含 `fixed` 和 `regressionPassed` 状态。

### 用例 3.2：修复状态自动更新

预期结果：

- `bad-factual-arithmetic` 的候选版本输出为 `2 + 2 = 4`。
- 该历史失败记录被标记为已修复且回归通过。

### 用例 3.3：新退步自动沉淀

预期结果：

- 候选版本退步案例会创建新的失败记录。
- 新记录保存候选提示词版本与当前回归 Trace ID。

## 4. Batch Evaluation Runner（批量评估运行器）测试

### 用例 4.1：并发数量受限

步骤：

1. 调用 `runBatchEvaluation` 并传入 `concurrency: 2`。
2. 检查返回的 `concurrency`。

预期结果：

- 实际并发数不小于 1，且不超过案例数量。
- 结果顺序与数据集案例顺序一致。

### 用例 4.2：单案例失败不会中断批任务

步骤：

1. 让 `edge-model-timeout` 的执行器抛出异常。
2. 运行完整数据集。

预期结果：

- 超时案例状态为 `failed`。
- 返回结果数量仍等于数据集案例数量。
- 其他案例继续执行并保存结果。

### 用例 4.3：批量指标完整

预期结果：

- 每个案例包含实际输出、评估结果或错误、状态、通过状态、耗时和模型调用次数。
- 汇总包含平均分、通过率、四维平均分、总耗时、模型调用次数及成功/失败/跳过数量。

## 5. Baseline（基线）测试

### 用例 5.1：保存并读取完整基线

步骤：

1. 执行基线批量评估。
2. 调用 `BaselineStore.save`。
3. 使用相同数据集 ID 与版本调用 `BaselineStore.get`。

预期结果：

- 可以读取刚保存的基线。
- 基线包含模型、提示词、工作流和数据集版本。
- 基线保留每个案例的输出、评分、耗时和汇总指标，而不是只保存总分。

## 6. Regression Comparison（回归对比）测试

### 用例 6.1：同一测试集重复执行

预期结果：

- Baseline 与 Candidate 使用相同 `datasetId` 和 `datasetVersion`。
- 不同数据集或版本的结果不能直接比较。

### 用例 6.2：正确分类案例变化

预期结果：

- `improvedCases` 至少包含一个案例。
- `unchangedCases` 至少包含一个案例。
- `regressedCases` 至少包含一个案例。
- 每个退步案例包含基线分、候选分、分数差、输出差异和原因。

### 用例 6.3：识别失败变化

预期结果：

- 报告包含新增失败、已修复失败和仍未解决失败。
- `bad-factual-arithmetic` 被识别为已修复失败。

## 7. Quality Gate（质量门禁）测试

### 用例 7.1：高优先级退步触发阻断

步骤：

1. 执行默认候选版本。
2. 查看 `qualityGate.status` 和 `failureReasons`。

预期结果：

- `normal-tool-weather` 为关键优先级退步案例。
- 质量门禁状态为 `failed`。
- 阻断原因明确包含高优先级案例退步。

### 用例 7.2：门禁检查完整

预期结果：

- 检查整体平均分不低于基线。
- 检查通过率下降阈值。
- 检查正确性分数下降阈值。
- 检查高优先级案例退步。
- 检查严重历史失败案例是否全部通过。

## 8. Workspace、Timeline 与 Trace 测试

### 用例 8.1：工作空间写入

预期结果：

- `workspace.entries` 包含批量评估开始、版本对比、退步案例和质量门禁结论。
- 质量门禁条目标签包含 `quality-gate`。

### 用例 8.2：时间线写入

预期结果：

- 时间线包含批量评估开始事件。
- 每个 Baseline 与 Candidate 案例都有执行事件。
- 时间线包含回归对比和质量门禁最终事件。

### 用例 8.3：追踪记录写入

预期结果：

- Trace 包含批量回归根 Span。
- 每个案例具有 `evaluation` 类型 Span。
- Trace 包含 `quality-gate` Span 及门禁结果元数据。

## 9. Regression Dashboard（回归评估看板）测试

### 用例 9.1：概览标签页

预期结果：

- 显示数据集名称、版本、案例数量和三类案例分布。
- 显示基线与候选的平均分、通过率、耗时和版本信息。
- 显示四个评分维度的基线、候选和分数变化。
- 显示改进案例、退步案例和质量门禁结果。

### 用例 9.2：失败案例标签页

预期结果：

- 可以切换到“失败案例”标签页。
- 显示失败类型、严重度、影响范围、Agent、Prompt Version、Trace ID 和修复状态。

### 用例 9.3：运行记录标签页

预期结果：

- 可以切换到“运行记录”标签页。
- 显示 Workspace、Timeline 和 Trace Span 数量。
- 显示批量执行顺序和工作空间结论。

### 用例 9.4：重新运行

步骤：

1. 点击“重新运行”。
2. 观察按钮与结果。

预期结果：

- 按钮在请求期间显示“运行中...”。
- 页面通过 `POST /api/regression` 获取新的完整快照。
- 运行结束后更新生成时间与结果，不需要刷新页面。

## 10. 第45天功能回归测试

预期结果：

- `Reflection`（反思）面板仍然可用。
- 单次 `Evaluation`（评估）与 Evaluation Metrics 仍然可用。
- `Prompt A/B Test`（提示词 A/B 测试）仍然可用。
- 原有聊天、Workflow、Queue、RAG 和 Tool Registry 功能代码继续保留。

## 11. 工程验收

执行：

```bash
npm run test:day46
npm run lint
npm run build
```

预期结果：

- `npm run test:day46` 通过。
- `npm run lint` 退出码为 0；允许第45天继承代码中已有的非阻断 warning。
- `npm run build` 成功生成生产构建。

全部通过后，说明第46天已从单次 Evaluation（评估）升级为可维护失败案例、重复比较版本并阻止质量回退的 Continuous Evaluation System（持续评估系统）。
