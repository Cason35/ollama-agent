# Day 38 测试用例：Multi-Agent Runtime V1 - Agent Registry

## 测试前准备

1. 在 `ollama-chat-day38` 目录执行 `npm install`。
2. 执行 `npm run dev` 并打开 `http://localhost:3000`。
3. 如需继续测试继承的聊天、Workflow、RAG 或 Queue 能力，请确保 Ollama 与 `.env.local` 配置可用。

## 用例 1：页面标题与标签页

- 操作：打开首页。
- 预期：浏览器标签页显示 `Day 38 - Multi-Agent Runtime V1 | Agent Registry`。
- 预期：首页标题显示 `Multi-Agent Runtime V1 · Agent Registry`。
- 预期：首页说明中出现 `Agent Registry`、`Agent Explorer`、`Capability Search` 和 `单 Agent 执行器`。

## 用例 2：Agent Registry 接口

- 操作：访问 `GET /api/agents`。
- 预期：响应 Envelope 为 `ok: true`。
- 预期：`data.agents.length` 等于 `4`。
- 预期：返回 `Research Agent`、`Planner Agent`、`Critic Agent` 和 `Writer Agent`。

## 用例 3：Agent 类型字段完整性

- 操作：检查 `GET /api/agents` 中每个 Agent。
- 预期：每个 Agent 都包含 `id`、`name`、`description`、`capabilities`、`systemPrompt` 和 `tools`。
- 预期：`capabilities` 是字符串数组。
- 预期：`tools` 是字符串数组。

## 用例 4：Capability Search - research

- 操作：在 Agent Explorer 的 `Capability Search` 输入 `research`。
- 预期：匹配结果显示 `Research Agent`。
- 预期：接口返回的 `routes.research` 为 `Research Agent`。

## 用例 5：Capability Search - plan

- 操作：在 Agent Explorer 的 `Capability Search` 输入 `plan`。
- 预期：匹配结果显示 `Planner Agent`。
- 预期：接口返回的 `routes.plan` 为 `Planner Agent`。

## 用例 6：Capability Search - 无匹配

- 操作：在 Agent Explorer 的 `Capability Search` 输入 `unknown-capability`。
- 预期：匹配结果显示 `暂无匹配`。
- 预期：页面不报错，已有 Agent 列表仍然可见。

## 用例 7：Agent Metrics

- 操作：观察 Agent Explorer 顶部三个指标。
- 预期：`Agents` 显示 `4`。
- 预期：`Caps` 大于 `4`，表示能力已去重统计。
- 预期：`Tools` 大于 `4`，表示工具覆盖已去重统计。

## 用例 8：Agent Explorer 展示内容

- 操作：查看右侧 Agent Explorer 列表。
- 预期：每张 Agent 卡片展示名称、职责说明、能力列表、工具列表和 Prompt。
- 预期：`Research Agent` 的能力包含 `research`、`search`、`rag`。
- 预期：`Planner Agent` 的能力包含 `plan`、`planning`、`workflow`。

## 用例 9：单 Agent 执行器

- 操作：观察 Agent Explorer 底部执行示例。
- 预期：执行示例文本包含 `Research Agent 已接收任务 day38-demo-task`。
- 预期：执行示例文本包含能力列表、工具列表和上下文状态。

## 用例 10：继承功能兼容性

- 操作：继续使用右侧 Queue Dashboard 创建一个普通 Job。
- 预期：队列看板仍能展示 Job 状态和 WorkerPool 状态。
- 预期：新增 Agent Explorer 不影响原有 Queue、Tool、RAG、Workflow 面板加载。

## 用例 11：构建与静态检查

- 操作：执行 `npm run lint`。
- 预期：ESLint 检查通过。
- 操作：执行 `npm run build`。
- 预期：Next.js 构建和 TypeScript 类型检查通过。
