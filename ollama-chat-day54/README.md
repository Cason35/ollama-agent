# Ollama Chat Day 54

Day 54 在 Day 53 Prompt Experiment Platform（提示词实验平台）基础上，升级为 Prompt Lifecycle V2 与 Prompt Composition（提示词组合）。

> 核心认知：Prompt 不再只是一个大字符串，而是由 System、Memory、Workspace、Tool、Task、Output 多个 PromptBlock 按顺序组合出来。

## 本日重点

- 定义 `PromptBlock`：包含 `id`、`name`、`type`、`template`、`enabled`、`order` 等字段。
- 实现 `PromptBlockRegistry`：支持 `register`、`get`、`list`、`enable`、`disable`。
- 实现 `PromptBuilder`：支持 `buildPrompt(blocks, variables)` 与可观测组合报告。
- 支持 Block 排序：按 `order` 稳定组合提示词块。
- 支持条件 Block：缺少 `memory`、`workspace`、`tools` 时自动跳过对应块。
- Agent Runtime 接入 PromptBuilder：运行时不再只渲染单个 `systemPrompt`。
- Prompt Explorer 新增 Prompt Block 视图：展示块列表、启用状态、顺序、命中率和组合预览。
- 实现 Block Diff：比较两个 PromptBlock 的模板、启用状态和顺序变化。
- 实现 Block Metrics：统计长度、Token、启用率和命中率。
- 增加 Day54 自动化测试脚本与测试用例文档。

## 默认 Prompt Block

| Block | Type | Order | 说明 |
| --- | --- | --- | --- |
| `system.runtime-role` | system | 5 | 组合式运行时身份说明 |
| `memory.context` | memory | 20 | 有记忆时注入，缺失时跳过 |
| `workspace.context` | workspace | 30 | 有共享工作空间时注入，缺失时跳过 |
| `tool.context` | tool | 40 | 有可用工具时注入，缺失时跳过 |
| `task.goal` | task | 50 | 当前任务块 |
| `output.format` | output | 60 | 输出格式约束 |

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，可在右侧 Prompt Explorer 查看 Prompt Block Explorer、Block Diff、Block Metrics 和 Prompt Composition Preview。

打开 `http://localhost:3000/prompts` 可进入 Day54 Prompt Composition Console。

打开 `http://localhost:3000/experiments` 可进入 Day54 兼容实验视图，用于对照 Day53 Prompt Experiment 能力。

## 验证方式

```bash
npm run test:day54
npm run lint
npm run build
```

Day 54 的测试用例见 `day54_test_cases.md`。
