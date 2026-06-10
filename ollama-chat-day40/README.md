# Ollama Chat Day 40

Day 40 在 `ollama-chat-day39` 的固定多智能体协作链基础上，升级为基于 Supervisor Agent 的 Multi-Agent Runtime。

## 本日重点

- 新增 `Supervisor Agent`，负责分析用户目标并选择必要智能体。
- 新增 `AgentPlan`，用结构化步骤描述智能体执行顺序与依赖关系。
- 新增 `AgentPlan Validator`，校验智能体是否存在、任务是否为空、依赖是否合法、是否有循环依赖。
- 新增 `executeAgentPlan`，按计划串行执行智能体步骤。
- 新增 `previousResults` 上下文传递，让后续智能体能看到前置结果。
- 右侧 `Supervisor Runtime Dashboard` 展示 Supervisor Decision、Agent Plan Steps、Agent Call Graph 和 Agent Plan Timeline。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧看板会展示第40天的 Supervisor Runtime 能力。

测试用例见 `day40_test_cases.md`。
