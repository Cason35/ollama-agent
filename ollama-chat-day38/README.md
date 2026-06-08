# Ollama Chat Day 38

Day 38 在 `ollama-chat-day37` 的 Agent Execution Platform 基础上，升级为 Multi-Agent Runtime V1：Agent Registry。

## 本日重点

- Agent 类型：定义 `id`、`name`、`description`、`capabilities`、`systemPrompt` 和 `tools`。
- AgentRegistry：支持 `register`、`get`、`list` 和 `findByCapability`。
- 默认 Agent：内置 Research / Planner / Critic / Writer 四个智能体。
- Agent Explorer：在右侧侧栏展示 Agent、Capabilities、Tools、Prompt、Metrics 和执行示例。
- Capability Search：按能力搜索 Agent，例如 `research` 路由到 Research Agent，`plan` 路由到 Planner Agent。
- Agent Metrics：展示总 Agent 数、能力覆盖数和工具覆盖数。
- Agent Context：为后续多智能体协作准备 memory / workflow / tools 上下文结构。
- Agent Executor：实现第38天的单 Agent 执行入口 `executeAgent(agentId, task)`。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧 `Agent Explorer` 会展示第38天的 Multi-Agent Runtime V1 能力。

## 测试用例

测试用例见 `day38_test_cases.md`。
