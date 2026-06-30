# Day 55 Dynamic Prompt Optimization 测试用例

## 测试目标

验证 Day55 是否完成 Dynamic Prompt Optimization（动态提示词优化）任务：系统应能根据任务上下文、策略、规则、权重和评估反馈，自动选择不同 PromptBlock，并生成可观察的策略、推荐和指标。

## 自动化测试

执行命令：

```bash
npm run test:day55
```

期望结果：

```text
Day 55 Dynamic Prompt Optimization tests passed.
```

## 用例 1：普通聊天任务

输入上下文：

- `taskType = chat`
- `hasMemory = false`
- `hasWorkspace = false`
- `hasKnowledge = false`
- `requiresJson = false`
- `requiresCitation = false`
- `complexity = low`
- `strategy = fast`

期望结果：

- `memory.context` 被关闭。
- `workspace.context` 被关闭。
- `knowledge.context` 被关闭。
- `reflection.checklist` 被关闭。
- 最终提示词保留 system、task、output 等低成本基础块。

## 用例 2：Research 研究任务

输入上下文：

- `taskType = research`
- `hasMemory = true`
- `hasWorkspace = true`
- `hasKnowledge = true`
- `requiresCitation = true`
- `complexity = high`
- `strategy = quality`

期望结果：

- `memory.context` 被启用。
- `workspace.context` 被启用。
- `knowledge.context` 被启用。
- `citation.requirements` 被启用。
- `reflection.checklist` 被启用。
- 生成 `Research 任务建议保留 Memory Block` 相关推荐。

## 用例 3：JSON 结构化输出任务

输入上下文：

- `taskType = planning`
- `requiresJson = true`
- `strategy = balanced`

期望结果：

- `output.schema-json` 被启用。
- 最终提示词包含结构化输出要求。
- 推荐结果中出现 JSON Schema 相关建议。

## 用例 4：Reflection 反思任务

输入上下文：

- `taskType = reflection`
- `complexity = high`

期望结果：

- `strategy = fast` 时，`reflection.checklist` 被关闭。
- `strategy = quality` 时，`reflection.checklist` 被启用。
- 用例证明策略可以影响同一任务的块组合。

## 用例 5：Evaluation 评估任务

输入上下文：

- `taskType = evaluation`
- `requiresJson = true`
- `complexity = high`
- `strategy = balanced`

期望结果：

- `evaluation.rubric` 被启用。
- `output.schema-json` 被启用。
- 最终提示词具备评估维度和结构化输出约束。

## 用例 6：Evaluation 弱点反向推荐

输入信号：

- `weakness = 缺少引用`
- `suggestedBlockId = citation.requirements`

期望结果：

- 即使 `requiresCitation = false`，评估弱点也可以反向启用 `citation.requirements`。
- 推荐结果中出现 Evaluation 弱点相关建议。

## 用例 7：Block Weight 权重排序

输入：

- 使用研究任务质量优先策略生成动态提示词。

期望结果：

- 高权重 system block 排在最终提示词前部。
- `Prompt Block Explorer` 中可以看到每个块的 `weight`。
- `PromptBuilder` 使用优化后的块顺序构建最终提示词。

## 用例 8：Prompt Strategy Explorer 页面验收

打开页面：

```text
http://localhost:3000
```

期望结果：

- 首页标题显示 `Day 55`。
- 浏览器标签页显示 `Day 55 - Dynamic Prompt Optimization Platform`。
- Prompt Explorer 中出现 `Prompt Strategy Explorer（提示词策略浏览器）`。
- 页面展示 Fast、Balanced、Quality 三种策略。
- 每种策略展示启用块、Estimated Tokens 和 Estimated Cost。
- 页面展示 Prompt Recommendation 和 Dynamic Prompt Preview。
