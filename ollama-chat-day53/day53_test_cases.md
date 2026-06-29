# Day 53 测试用例：Prompt Experiment Platform（提示词实验平台）

## 测试目标

验证第 53 天新增的 Prompt Experiment Platform 能够基于同一批 Evaluation Cases 对多个 Prompt Version 进行实验，比较分数、成本、延迟、回归风险，选出 winner，并通过 Promote 将获胜版本切换为 active。

## 自动化脚本

```bash
npm run test:day53
```

## 用例 1：实验定义完整性

- 前置条件：默认 Prompt Registry 已注册 `writer.v1`、`writer.v2`、`writer.v3`。
- 操作：运行 `PromptExperimentRunner.runExperiment("writer-prompt-quality-cost-latency")`。
- 期望结果：实验组件为 `writer`，候选版本为 `v1 / v2 / v3`，数据集为 `day53-prompt-experiment-core`。

## 用例 2：多版本批量评估

- 前置条件：第 53 天实验使用同一套 Evaluation Cases。
- 操作：分别运行 `writer.v1`、`writer.v2`、`writer.v3` 的 Batch Evaluation。
- 期望结果：每个版本都生成一条 `BatchEvaluationRun`，并输出 `averageScore`、`passRate`、`averageCost`、`averageLatencyMs`。

## 用例 3：Winner Selection

- 前置条件：Winner Rule 设置为 `minScore=88`、`maxCostIncrease=0.35`、`requireNoHighPriorityRegression=true`、`optimizeFor=balanced`。
- 操作：运行默认实验。
- 期望结果：`writer.v3` 被选为 winner，且 `writer.v3.averageScore > writer.v2.averageScore`。

## 用例 4：Quality Gate

- 前置条件：`writer.v3` 没有高优先级案例退步，成本增长低于阈值。
- 操作：读取实验运行结果中的 `qualityGate`。
- 期望结果：`qualityGate.status` 为 `passed`，检查项包含平均分、成本增长、高优先级退步和 winner 存在性。

## 用例 5：实验时间线

- 前置条件：实验运行完成。
- 操作：检查 `timeline`。
- 期望结果：时间线包含 `Experiment Created`、`Version v1 Started`、`Version v1 Completed`、`Version v2 Started`、`Version v2 Completed`、`Version v3 Started`、`Version v3 Completed`、`Winner Selected`。

## 用例 6：一键 Promote

- 前置条件：默认实验已经选出 `writer.v3`，且 Quality Gate 通过。
- 操作：调用 `promoteExperimentWinner("writer-prompt-quality-cost-latency")`。
- 期望结果：`PromptRegistry.getActive("writer")` 返回 `v3`，快照中 `promotedVersion` 为 `v3`。

## 用例 7：前端仪表盘

- 前置条件：启动 Next.js 应用。
- 操作：打开首页右侧“实验”标签页或访问 `/experiments`。
- 期望结果：页面展示 Experiment Name、Component、Versions、Dataset、Score、Cost、Latency、Winner、Quality Gate 和 Timeline。

## 用例 8：API 快照

- 前置条件：应用服务运行中。
- 操作：请求 `GET /api/experiments`。
- 期望结果：返回统一 API Envelope，`data.run.results` 包含三个版本结果，`data.run.winnerVersion` 为 `v3`。

## 用例 9：API 重新运行

- 前置条件：应用服务运行中。
- 操作：请求 `POST /api/experiments`，请求体为 `{ "action": "run" }`。
- 期望结果：强制重新运行实验并返回最新快照。

## 用例 10：API Promote

- 前置条件：应用服务运行中，实验 Quality Gate 通过。
- 操作：请求 `POST /api/experiments`，请求体为 `{ "action": "promote", "experimentId": "writer-prompt-quality-cost-latency" }`。
- 期望结果：返回快照中的 `activePromptAfterPromotion.version` 为 `v3`。

## 用例 11：Prompt Console 保存并激活带 agentId 的模板

- 前置条件：启动 Next.js 应用并访问 `/prompts`。
- 操作：选择 `research` 组件，新建或复制一个草稿，模板正文包含 `{{task}}` 和 `{{agentId}}`，点击“保存并激活”。
- 期望结果：页面只展示“保存并激活成功。”，不会再出现 `Prompt research.v3 缺少变量：agentId`，右侧 Rendered Preview 能正常渲染样例变量。

## 用例 12：评分和成本字段来源

- 前置条件：打开 `/prompts` 并进入任意草稿。
- 操作：保持“评估分”为空，保持“成本估算”为空后保存；再尝试点击“估算”和“从实验结果填入评分/成本”。
- 期望结果：“评估分”不会在普通保存时自动生成；“成本估算”留空保存时会由系统按模板长度自动估算，也可以通过“估算”按钮先写入表单；实验结果按钮只会给已参与默认实验的版本回填分数和成本。

## 用例 13：变量校验面板窄屏展示

- 前置条件：打开 `/prompts`，将浏览器宽度调窄或使用三栏工作台默认宽度。
- 操作：编辑模板使其包含 `{{task}}`、`{{tools}}`、`{{memory}}`、`{{workspace}}`、`{{agentId}}`。
- 期望结果：右侧“必需变量”和“模板已用变量”以可换行标签展示，不会挤压、重叠或超出面板可视范围。

## 用例 14：同一批 Evaluation Cases 横向对比

- 前置条件：启动 Next.js 应用并访问 `/experiments`。
- 操作：切换到“评估用例”标签页。
- 期望结果：页面展示同一个 Dataset（数据集）的 `datasetId`、`caseCount`，并以每个 Evaluation Case 为行、`writer.v1 / writer.v2 / writer.v3` 为列展示 Score、Pass、Cost、Latency 和 Regression 状态。
