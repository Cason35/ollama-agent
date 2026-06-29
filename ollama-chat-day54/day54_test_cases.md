# Day 54 测试用例：Prompt Composition（提示词组合）

## 测试目标

验证第 54 天新增的 Prompt Lifecycle V2 与 Prompt Composition 能够把单个 `systemPrompt` 升级为可组合的 `PromptBlock` 系统，并支持注册、读取、启用、禁用、排序、条件跳过、变量渲染、Block Diff、Block Metrics 和 Agent Runtime 接入。

## 自动化测试命令

```bash
npm run test:day54
```

## 用例 1：PromptBlock 类型与默认块存在

- 前置条件：项目已安装依赖。
- 操作：运行 `npm run test:day54`。
- 期望结果：`memory.context`、`memory.context.v2`、`workspace.context`、`tool.context`、`task.goal`、`output.format` 等默认块能够被注册表读取。

## 用例 2：PromptBlockRegistry 支持启用与禁用

- 操作：测试脚本先禁用 `tool.context`，再重新启用。
- 期望结果：`disable` 后 `enabled=false`，`enable` 后 `enabled=true`。

## 用例 3：PromptBuilder 按 order 组合块

- 操作：用 research active prompt 生成运行时块列表，再调用 `buildPromptWithReport`。
- 期望结果：最终提示词包含 system、memory、workspace、tool、task、output 等块，并且输出中出现块标题边界。

## 用例 4：PromptBuilder 正确渲染变量

- 操作：给 `task`、`memory`、`workspace`、`tools` 注入样例变量。
- 期望结果：最终提示词正文包含样例 `task` 内容，不保留未渲染的 `{{task}}`。

## 用例 5：条件块自动跳过

- 操作：再次构建提示词，但传入空 `memory`。
- 期望结果：`memory.context` 出现在 `skippedBlockIds` 中，`task.goal` 仍然出现在 `usedBlockIds` 中。

## 用例 6：Block Diff 能比较两个提示词块

- 操作：比较 `memory.context` 与 `memory.context.v2`。
- 期望结果：Diff 能识别 `template` 字段变化，并列出新增模板行。

## 用例 7：Block Metrics 统计长度、Token、启用率和命中率

- 操作：基于“有 memory”和“无 memory”两次构建结果计算指标。
- 期望结果：总块数与注册表一致，启用率大于 0，`memory.context` 的 `hitCount=1`、`renderCount=2`。

## 用例 8：Agent Runtime 接入 PromptBuilder

- 操作：无模型执行 `research` Agent。
- 期望结果：运行时能成功返回模拟输出，说明 `resolvePrompt` 已能通过 PromptBuilder 构建最终系统提示词。

## 用例 9：Prompt Explorer 展示 Prompt Block 视图

- 操作：启动应用并打开首页，查看右侧 Prompt Explorer。
- 期望结果：页面展示 Prompt Block Explorer、Block Diff、Prompt Composition Preview、启用率、平均 Token 和命中块列表。

## 用例 10：浏览器标签页与标题为 Day54

- 操作：打开 `/`、`/prompts`、`/experiments`。
- 期望结果：浏览器标签页和页面标题出现 Day 54、Prompt Composition、提示词组合等描述，不再以 Day 53 作为当前主题。
