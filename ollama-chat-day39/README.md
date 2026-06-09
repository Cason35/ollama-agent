# Ollama Chat Day 39

Day 39 在 `ollama-chat-day38` 的 Agent Registry 基础上，升级为 Multi-Agent Runtime V2：Agent-to-Agent Collaboration。

## 本日重点

- AgentTask：新增 `context`、`parentTaskId` 和 `assignedAgentId`，支持上游任务向下游智能体传递上下文。
- AgentResult：新增 `taskId`、`agentId`、`metadata` 和 `childResults`，支持嵌套聚合协作结果。
- AgentRuntime：统一承载 `executeAgent`、`delegateTask` 和 `aggregateResults`。
- delegateTask：记录从上游智能体到下游智能体的明确委派动作。
- Agent Call Graph：展示 Research 到 Planner 到 Critic 到 Writer 的调用关系。
- Agent Timeline：展示协作链路的开始、委派和完成事件。
- Agent Metrics：展示 executedTasks、delegatedTasks、avgTaskDuration 和 successRate。
- Agent Dashboard：右侧侧栏升级为第39天多智能体协作看板。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧 `Agent Collaboration Dashboard` 会展示第39天的 Multi-Agent Runtime V2 能力。

## 测试用例

测试用例见 `day39_test_cases.md`。
