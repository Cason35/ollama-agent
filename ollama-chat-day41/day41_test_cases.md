# Day 41 DAG Test Cases

本文档用于验证第41天 Multi-Agent Runtime V3：Agent DAG Planning 的核心能力。

## Case 1：基础串行 DAG

目标：

```text
研究 LangGraph，并输出一段总结。
```

期望 DAG：

```text
research -> writer
```

验证点：

- `writer.dependsOn` 包含 `research`。
- `research` 先完成，`writer` 后执行。
- `resultStore.research` 和 `resultStore.writer` 都存在。
- `dagMetrics.totalSteps` 等于 2。
- `dagMetrics.maxDepth` 等于 2。

## Case 2：单上游解锁多个并行步骤

目标：

```text
研究 LangGraph，总结核心概念，制定三天学习路线，并输出最终报告。
```

期望 DAG：

```text
research
  -> concept
  -> roadmap
concept + roadmap -> writer
```

验证点：

- `concept.dependsOn` 包含 `research`。
- `roadmap.dependsOn` 包含 `research`。
- `writer.dependsOn` 同时包含 `concept` 和 `roadmap`。
- `concept` 与 `roadmap` 位于同一 DAG 深度，可以同批并行执行。
- `dagMetrics.parallelSteps` 至少为 2。
- `writer` 的上下文能读取 `concept` 和 `roadmap` 两个父级结果。

## Case 3：多个独立研究分支汇总

目标：

```text
分别研究 LangGraph、CrewAI 和 AutoGen，再合并成一份对比报告。
```

期望 DAG：

```text
research-a
research-b
research-c
  -> writer
```

验证点：

- 三个研究节点都没有依赖，可以第一批并行执行。
- `writer.dependsOn` 同时包含三个研究节点。
- `resultStore` 中存在全部研究分支结果。
- `writer` 的 `parentResults` 包含三个父级结果。

## Case 4：不存在的依赖应被拒绝

构造计划：

```json
{
  "goal": "非法依赖测试",
  "selectedAgents": ["writer"],
  "reason": "测试 dependsOn 校验",
  "steps": [
    { "id": "writer", "agentId": "writer", "task": "输出总结", "dependsOn": ["missing-step"] }
  ]
}
```

验证点：

- `validateAgentPlan().ok` 为 `false`。
- `errors` 包含不存在依赖的提示。
- 执行时应降级到 `day41-fallback-writer`。

## Case 5：循环依赖应被拒绝

构造计划：

```json
{
  "goal": "循环依赖测试",
  "selectedAgents": ["planner", "writer"],
  "reason": "测试 DAG 不能成环",
  "steps": [
    { "id": "a", "agentId": "planner", "task": "规划 A", "dependsOn": ["b"] },
    { "id": "b", "agentId": "writer", "task": "总结 B", "dependsOn": ["a"] }
  ]
}
```

验证点：

- `validateAgentPlan().ok` 为 `false`。
- `errors` 包含循环依赖提示。
- DAG Executor 不应进入死循环。

## Case 6：孤儿节点应被发现

构造计划：

```json
{
  "goal": "孤儿节点测试",
  "selectedAgents": ["research", "writer"],
  "reason": "测试孤儿节点",
  "steps": [
    { "id": "research", "agentId": "research", "task": "研究主题", "dependsOn": [] },
    { "id": "writer", "agentId": "writer", "task": "直接输出", "dependsOn": [] }
  ]
}
```

验证点：

- `research` 与 `writer` 没有依赖关系。
- 至少一个节点会被识别为孤儿节点。
- `validateAgentPlan().ok` 为 `false`。

## 接口验收

请求：

```bash
curl http://localhost:3000/api/agents
```

验证点：

- 响应中存在 `collaboration.plan.steps`。
- 响应中存在 `collaboration.dagMetrics`。
- 响应中存在 `collaboration.resultStore`。
- `collaboration.callGraph` 能表达依赖边。
- 右侧面板展示 `Agent DAG Visualizer`。
