# Ollama Chat Day 46

Day 46 在 Day 45 Evaluation Framework（评估框架）的基础上，升级为 Bad Case Management & Regression Evaluation（失败案例管理与回归评估）。

## 本日重点

- 定义 `EvaluationCase`（评估案例）、`EvaluationDataset`（评估数据集）和稳定的多维评分规则。
- 建立包含正常案例、`Bad Case`（失败案例）和 `Edge Case`（边界案例）的固定数据集。
- 实现失败类型、严重度、影响范围、Agent、Prompt Version 与 Trace ID 管理。
- 实现带并发限制和单案例异常隔离的 `Batch Evaluation Runner`（批量评估运行器）。
- 保存并读取包含案例明细、版本信息和多维指标的 `Baseline`（基线）。
- 比较 `Baseline` 与 `Candidate`（候选版本），识别改进、未变化、退步和失败修复。
- 通过 `Quality Gate`（质量门禁）阻止平均分、通过率、正确性或高优先级案例回退。
- 将批量评估写入 `Workspace`（工作空间）、`Timeline`（时间线）和 `Trace`（追踪记录）。
- 新增可重新运行、切换标签页的 `Regression Dashboard`（回归评估看板）。
- 保留第45天的 Reflection、单次 Evaluation、Evaluation Metrics 和 Prompt A/B Test。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧面板会展示第46天的持续评估系统。

执行自动化验收：

```bash
npm run test:day46
npm run lint
npm run build
```

人工与接口测试用例见 `day46_test_cases.md`。
