# Day 42 测试用例：Agent Memory + Shared Workspace

本文档用于验证 `ollama-chat-day42` 是否完成第42天任务：在 Day41 的 DAG 并行运行时基础上加入共享工作空间。

## 测试用例 1：Workspace 类型定义

- 前置条件：打开 `lib/agents/agent-types.ts`
- 操作：检查是否存在 `Workspace`、`WorkspaceEntry`、`WorkspaceEntryType`、`WorkspaceMetrics`
- 预期结果：类型包含 `id`、`goal`、`entries`、`createdAt`、`updatedAt`，条目类型包含 `note`、`finding`、`draft`、`decision`、`question`、`final`

## 测试用例 2：WorkspaceStore 内存存储

- 前置条件：打开 `lib/agents/workspace-store.ts`
- 操作：检查 `MemoryWorkspaceStore` 是否实现 `create`、`get`、`addEntry`、`listEntries`、`getMetrics`
- 预期结果：可以创建工作空间、追加条目、读取条目，并统计条目总数、类型分布、Agent 分布和最后更新时间

## 测试用例 3：AgentContext 注入 Workspace

- 前置条件：运行 `/api/agents`
- 操作：检查 `executeAgentPlan` 是否为每次协作创建并注入 `workspace`
- 预期结果：每个 DAG 节点执行时都能通过 `context.workspace` 读取同一个共享工作空间

## 测试用例 4：Research Agent 写入 finding

- 前置条件：调用 `/api/agents`
- 操作：查看返回值 `collaboration.workspace.entries`
- 预期结果：存在 `agentId = research` 且 `type = finding` 的条目

## 测试用例 5：Planner Agent 读取 finding 并写入 draft

- 前置条件：Research 节点已完成
- 操作：查看 Planner 输出和 Workspace 条目
- 预期结果：Planner 能读取工作空间已有内容，并写入 `type = draft` 的条目

## 测试用例 6：Critic Agent 写入 decision

- 前置条件：Critic 节点参与 Day42 演示任务
- 操作：查看工作空间条目类型
- 预期结果：存在 `agentId = critic` 且 `type = decision` 的条目

## 测试用例 7：Writer Agent 写入 final

- 前置条件：Writer 节点完成汇总
- 操作：查看 `collaboration.workspace.entries`
- 预期结果：存在 `agentId = writer` 且 `type = final` 的条目，内容是最终输出或汇总文本

## 测试用例 8：Workspace Summarizer

- 前置条件：DAG 执行完成
- 操作：查看工作空间最后阶段条目
- 预期结果：存在 `agentId = workspace-summarizer` 且 `type = note` 的摘要条目

## 测试用例 9：Workspace Metrics

- 前置条件：调用 `/api/agents`
- 操作：检查 `collaboration.workspaceMetrics`
- 预期结果：`entryCount` 大于 0，`entriesByType` 和 `entriesByAgent` 能反映工作空间条目分布

## 测试用例 10：Workspace Explorer 前端展示

- 前置条件：运行 `npm run dev` 并打开首页
- 操作：查看右侧 Agent 面板
- 预期结果：看到 `Shared Workspace（共享工作空间）`、`Workspace Metrics（工作空间指标）`、Goal、类型过滤、标签过滤和条目列表

## 测试用例 11：标题与标签页更新为 Day 42

- 前置条件：打开首页
- 操作：查看浏览器标签页和右侧面板标题
- 预期结果：浏览器标题包含 `Day 42 - Agent Memory + Shared Workspace`，面板徽标显示 `Day 42`

## 测试用例 12：完整端到端任务

- 测试任务：研究 LangGraph，总结核心概念，制定三天学习路线，并把研究发现、草稿、决策和最终报告写入共享工作空间
- 操作：调用 `/api/agents` 或打开首页等待面板加载
- 预期流程：Research 写入 `finding`，Planner 写入 `draft`，Critic 写入 `decision`，Writer 写入 `final`，Summarizer 写入 `note`
- 验收标准：API 返回 `workspace`、`workspaceMetrics`、`resultStore`、`dagMetrics`，前端能完整展示工作空间协作过程
