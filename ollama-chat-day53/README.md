# Ollama Chat Day 53

Day 53 在 Day 52 Prompt Registry（提示词注册表）基础上，升级为 Prompt Experiment Platform V1（提示词实验平台第 1 版）。

> 核心认知：Prompt Versioning 解决“提示词怎么管理”，Prompt Experiment 解决“哪个提示词更好”。

## 本日重点

- 定义 `PromptExperiment`：记录实验名称、组件、候选版本、数据集、状态和 Winner Rule。
- 定义 `PromptExperimentResult`：记录平均分、通过率、成本、延迟、退步数量、最佳案例和最差案例。
- 实现 `PromptExperimentRunner`：对 `writer.v1 / writer.v2 / writer.v3` 使用同一套 Evaluation Cases 批量评估。
- 支持多版本 Prompt 对比：同时比较 score、cost、latency 和 regression。
- 实现 Winner Selection：支持 `score`、`cost`、`balanced` 三种策略。
- 接入 Quality Gate：阻止高优先级案例退步或成本增长超过阈值的版本自动获胜。
- 新增 Prompt Experiment Dashboard：展示实验定义、版本结果、Winner、Quality Gate 和 Timeline。
- 新增 Prompt Experiment Timeline：记录实验创建、版本开始、版本完成、Winner 选择和 Promote。
- 支持一键 Promote：实验 winner 通过门禁后调用 `PromptRegistry.activate(componentId, version)` 切换 active 版本。

## 默认实验

| Experiment | Component | Versions | Dataset | Winner Rule |
| --- | --- | --- | --- | --- |
| `writer-prompt-quality-cost-latency` | `writer` | `v1 / v2 / v3` | `day53-prompt-experiment-core` | balanced，最低 88 分，成本增长不超过 35%，高优先级无退步 |

## 默认 Writer 提示词版本

| Version | Status | 说明 |
| --- | --- | --- |
| `writer.v1` | archived | 旧版简短总结，成本低但容易遗漏 |
| `writer.v2` | active | Day 52 基线汇总提示词 |
| `writer.v3` | draft | Day 53 实验候选提示词，强化证据、风险、回滚和下一步 |

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧控制台默认进入“实验”标签页，可查看 Prompt Experiment Platform。

打开 `http://localhost:3000/experiments` 可进入完整 Prompt Experiment Dashboard。

打开 `http://localhost:3000/prompts` 可进入 Prompt Console，维护实验候选提示词版本。

## 验证方式

```bash
npm run test:day53
npm run test:day52
npm run lint
npm run build
```

Day 53 的测试用例见 `day53_test_cases.md`。
