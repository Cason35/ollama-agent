# Day 39 学习总结：Multi-Agent Runtime V2（多智能体运行时第 2 版）与 Agent-to-Agent Collaboration（智能体到智能体协作）

本文档记录本次关于 `ollama-chat-day38` 与 `ollama-chat-day39` 的学习对话整理，重点说明两个项目分别做了什么、运用了什么知识、Day 39 相比 Day 38 有什么改进，以及为什么要这样设计。

---

## 1. 用户提问：读懂 `ollama-chat-day38`

> 带我来读懂ollama-chat-day38这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day37有什么改进，为什么这样子做(且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述)

## 2. 回答整理：Day 38 做了什么

`ollama-chat-day38` 可以用一句话概括：

```text
Day 38 不是在做“更强的模型回答”，而是在 Day 37 已经能稳定执行 Workflow as Job（把工作流当作任务执行）的基础上，新增一层 Agent Registry（智能体注册表），让系统开始知道“有哪些 Agent（智能体）、每个 Agent 擅长什么、能用什么工具、怎么被查找和展示”。
```

Day 38 的主题是：

```text
Multi-Agent Runtime V1（多智能体运行时第 1 版）
= Agent Registry（智能体注册表）
```

Day 37 已经解决了“任务怎么可靠跑起来”，Day 38 开始解决“任务应该交给哪个角色来做”。

---

## 3. Day 38 的核心新增模块

### 3.1 Agent（智能体）类型

Day 38 在 `lib/agents/agent-types.ts` 中定义了 `Agent`（智能体）结构：

```ts
export type Agent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  tools: string[];
};
```

这里的 `Agent`（智能体）不是一个新模型，而是一个角色化的执行单元。

它由这些部分组成：

- `id`：唯一身份。
- `name`：展示名称。
- `description`：职责说明。
- `capabilities`（能力标签）：它擅长什么。
- `systemPrompt`（系统提示词）：它应该扮演什么角色。
- `tools`（工具列表）：它能使用哪些工具。

### 3.2 AgentRegistry（智能体注册表）

Day 38 在 `lib/agents/agent-registry.ts` 中实现了 `AgentRegistry`（智能体注册表）。

它提供：

```ts
register(agent)
get(id)
list()
findByCapability(capability)
getMetrics()
```

这相当于一个智能体花名册。

以前系统只知道：

```text
我有 retrieval（检索工具）、summary（总结工具）、workflowPlanner（工作流规划工具）。
```

现在系统进一步知道：

```text
谁负责研究？
谁负责规划？
谁负责审查？
谁负责写最终答案？
```

### 3.3 默认 Agent（默认智能体）

Day 38 在 `lib/agents/default-agents.ts` 中固定注册了 4 个角色：

```text
Research Agent（研究智能体）
Planner Agent（规划智能体）
Critic Agent（审查智能体）
Writer Agent（写作智能体）
```

它们的分工是：

```text
Research Agent（研究智能体）：负责检索、RAG（检索增强生成）和资料整理。
Planner Agent（规划智能体）：负责计划拆解和 Workflow（工作流）设计。
Critic Agent（审查智能体）：负责审查方案、发现问题和提出风险。
Writer Agent（写作智能体）：负责输出、总结和面向用户表达。
```

这一步把系统从工具集合升级为角色集合。

---

## 4. Day 38 的执行链路

Day 38 在 `lib/agents/agent-executor.ts` 中新增了两个重要函数。

第一个是：

```ts
routeAgentByCapability(capability)
```

它表示根据 `Capability`（能力）找到合适的 `Agent`（智能体）。

例如：

```text
research（研究） -> Research Agent（研究智能体）
plan（规划） -> Planner Agent（规划智能体）
review（审查） -> Critic Agent（审查智能体）
write（写作） -> Writer Agent（写作智能体）
```

第二个是：

```ts
executeAgent(agentId, task, context)
```

它表示根据 `agentId` 找到某个 `Agent`（智能体），然后执行一个任务。

但 Day 38 的 `executeAgent`（执行智能体）还是轻量入口，它主要用于固定数据结构和统一调用方式，并没有真正实现多个 `Agent`（智能体）之间的协作。

Day 38 的链路可以理解为：

```text
用户目标
  -> Agent Registry（智能体注册表）
  -> Capability Search（能力搜索）
  -> 找到合适的 Agent（智能体）
  -> executeAgent（执行智能体）
```

---

## 5. Day 38 的 API（接口）和 UI（用户界面）

Day 38 新增了：

```text
GET /api/agents
```

这个接口返回：

```text
agents（智能体列表）
metrics（智能体指标）
routes（能力路由测试结果）
demoResult（单智能体执行示例）
```

前端的 `Agent Explorer`（智能体浏览器）会请求该接口，并展示：

```text
Agents（智能体总数）
Caps / Capabilities（能力数量）
Tools（工具覆盖数量）
Capability Search（能力搜索）
Agent 列表
Prompt（提示词）
demoResult（执行示例）
```

这意味着 Day 38 第一次让系统具备了 Agent Layer（智能体层）的 Observability（可观测性）。

---

## 6. Day 38 相比 Day 37 的改进

Day 37 的主题是：

```text
Queue Runtime V7（队列运行时第 7 版）
Workflow as Job（把工作流作为任务）
```

Day 37 解决的是“怎么可靠执行”。

Day 37 的链路是：

```text
用户输入
  -> Workflow（工作流）
  -> Job（任务）
  -> Queue（队列）
  -> Worker（工作进程）
  -> 执行 Workflow Step（工作流步骤）
  -> 返回结果
```

Day 37 的重点包括：

```text
WorkflowJob（工作流任务）
WorkerPool（工作池）
Retry（重试）
Cancel（取消）
Timeout（超时）
Unified Timeline（统一时间线）
Restart as New Job（作为新任务重启）
```

Day 38 的重点变成：

```text
Agent（智能体）
Capability（能力）
Prompt（提示词）
Tools（工具权限）
Agent Metrics（智能体指标）
Agent Explorer（智能体浏览器）
```

所以可以这样对比：

```text
Day 37：重点是“任务怎么跑”。
Day 38：重点是“谁来负责这个任务”。
```

更具体地说：

```text
Day 37 管执行可靠性：
Queue（队列）、Worker（工作进程）、Retry（重试）、Cancel（取消）、Timeline（时间线）。

Day 38 管角色组织：
Agent（智能体）、Capability（能力）、Prompt（提示词）、Tool Permission（工具权限）、Agent Metrics（智能体指标）。
```

---

## 7. 为什么 Day 38 要这样做

复杂任务不只是调用工具。

例如用户说：

```text
帮我学习 LangGraph，并给我一个学习路线。
```

如果只有 `Tool`（工具）视角，系统可能只是：

```text
调用 retrieval（检索）
调用 summary（总结）
输出答案
```

但如果有 `Agent`（智能体）视角，系统可以自然拆成：

```text
Research Agent（研究智能体）：先查资料。
Planner Agent（规划智能体）：再制定学习路线。
Critic Agent（审查智能体）：检查路线是否有漏洞。
Writer Agent（写作智能体）：整理成用户能读懂的答案。
```

因此：

```text
Tool（工具）回答的是：我能做什么动作？
Agent（智能体）回答的是：谁负责判断、组织和交付这件事？
```

一句话：

```text
Tool（工具）更像函数，Agent（智能体）更像岗位。
```

Day 38 的核心认知是：

```text
Tool（工具）是执行动作，Agent（智能体）是组织这些动作的角色。
```

---

## 8. 用户提问：读懂 `ollama-chat-day39`

> 带我来读懂ollama-chat-day39这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day38有什么改进，为什么这样子做(且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述)

## 9. 回答整理：Day 39 做了什么

`ollama-chat-day39` 可以用一句话概括：

```text
Day 39 是在 Day 38 的 Agent Registry（智能体注册表）基础上，把系统从“能找到某个 Agent（智能体）”升级为“多个 Agent（智能体）可以按固定链路协作完成一个任务”。
```

也就是从：

```text
找到一个 Agent（智能体） -> 执行一个 Agent（智能体）
```

升级为：

```text
Research Agent（研究智能体）
  -> Planner Agent（规划智能体）
  -> Critic Agent（审查智能体）
  -> Writer Agent（写作智能体）
```

这就是：

```text
Multi-Agent Runtime V2（多智能体运行时第 2 版）
Agent-to-Agent Collaboration（智能体到智能体协作）
```

---

## 10. Day 39 的核心新增：AgentRuntime（智能体运行时）

Day 39 最重要的文件是：

```text
lib/agents/agent-runtime.ts
```

其中新增了：

```ts
export class AgentRuntime
```

`AgentRuntime`（智能体运行时）可以理解成多智能体协作的调度中心。

它负责三件事：

```text
executeAgent（执行智能体）
delegateTask（委派任务）
aggregateResults（聚合结果）
```

Day 38 的执行逻辑比较简单：

```text
executeAgent(agentId, task)
```

Day 39 把执行逻辑收进统一的 `AgentRuntime`（智能体运行时）里。

这样以后如果要加：

```text
Failure Retry（失败重试）
Permission Control（权限控制）
Context Isolation（上下文隔离）
Parallel Agent Execution（并行智能体执行）
Dynamic Routing（动态路由）
```

都可以围绕 `AgentRuntime`（智能体运行时）扩展。

---

## 11. AgentTask（智能体任务）的升级

Day 38 的 `AgentTask`（智能体任务）很简单：

```ts
type AgentTask = {
  id: string;
  goal: string;
};
```

Day 39 升级为：

```ts
type AgentTask = {
  id: string;
  goal: string;
  context?: unknown;
  parentTaskId?: string;
  assignedAgentId?: string;
};
```

新增字段含义：

```text
context（上下文）：上游 Agent（智能体）传给下游 Agent（智能体）的材料。
parentTaskId（父任务 ID）：说明这个任务来自哪个上游任务。
assignedAgentId（被分配的智能体 ID）：说明这个任务交给谁做。
```

这一步很重要。

因为多 `Agent`（多智能体）协作不是简单地连续调用几个函数，而是要知道：

```text
这个子任务从哪里来？
是谁交给谁的？
上游结果有没有传给下游？
```

---

## 12. AgentResult（智能体结果）的升级

Day 38 的 `AgentResult`（智能体结果）只有：

```ts
type AgentResult = {
  output: string;
};
```

Day 39 升级为：

```ts
type AgentResult = {
  taskId: string;
  agentId: string;
  output: string;
  metadata?: Record<string, unknown>;
  childResults?: AgentResult[];
};
```

新增字段含义：

```text
taskId（任务 ID）：这个结果属于哪个任务。
agentId（智能体 ID）：哪个 Agent（智能体）产出了这个结果。
metadata（元数据）：记录耗时、是否成功等额外信息。
childResults（子结果）：保存下游 Agent（智能体）的结果。
```

这个变化让结果从单段文本变成了可追踪的树状结果。

例如：

```text
Research Result（研究结果）
  childResults（子结果）:
    Planner Result（规划结果）
    Critic Result（审查结果）
    Writer Result（写作结果）
```

这就是 `Result Aggregation`（结果聚合）。

---

## 13. delegateTask（委派任务）

`delegateTask`（委派任务）是 Day 39 的核心动作。

它的含义是：

```text
当前 Agent（智能体）把一个任务委派给另一个 Agent（智能体）。
```

例如：

```text
research -> planner
planner -> critic
critic -> writer
```

这和 Day 38 最大不同在于：

```text
Day 38：系统调用某一个 Agent（智能体）。
Day 39：一个 Agent（智能体）可以把任务交给下一个 Agent（智能体）。
```

这就是 `Agent-to-Agent Collaboration`（智能体到智能体协作）。

---

## 14. Day 39 的固定协作链

Day 39 先没有做让模型自动决定谁先谁后。

它写死了一条固定链路：

```text
Research Agent（研究智能体）
  -> Planner Agent（规划智能体）
  -> Critic Agent（审查智能体）
  -> Writer Agent（写作智能体）
```

代码入口是：

```ts
runFixedCollaboration(goal)
```

内部顺序是：

```text
1. executeAgent("research", rootTask)
2. delegateTask("research", "planner", planTask)
3. delegateTask("planner", "critic", reviewTask)
4. delegateTask("critic", "writer", writeTask)
5. aggregateResults(...)
```

为什么先写死？

因为 Day 39 的重点不是让模型自由发挥，而是先把协作基础设施跑通：

```text
Task Delegation（任务委派）
Context Passing（上下文传递）
Call Graph Recording（调用图记录）
Timeline Recording（时间线记录）
Metrics Collection（指标统计）
Result Aggregation（结果聚合）
```

先有确定链路，系统才容易调试。固定链路稳定之后，再做 `Dynamic Routing`（动态路由）或 `Auto Planning`（自动规划）才更稳。

---

## 15. Agent Call Graph（智能体调用图）

Day 39 新增了：

```ts
type AgentCallEdge = {
  fromAgentId: string;
  toAgentId: string;
  taskId: string;
};
```

这叫 `Agent Call Graph`（智能体调用图）。

它记录：

```text
谁调用了谁。
为了哪个任务调用。
调用关系是什么。
```

例如：

```text
research -> planner    taskId: day39-plan-task
planner -> critic      taskId: day39-review-task
critic -> writer       taskId: day39-write-task
```

这让系统能够观察多智能体系统的结构。

如果以后系统变复杂，例如：

```text
Research Agent（研究智能体）同时委派给 Web Search Agent（网页搜索智能体）和 Database Agent（数据库智能体）。
Planner Agent（规划智能体）再汇总它们。
Critic Agent（审查智能体）审查多个分支。
```

没有 `Call Graph`（调用图），就很难知道任务流向了哪里。

---

## 16. Agent Timeline（智能体时间线）

Day 39 新增了：

```ts
type AgentTimelineEvent = {
  id: string;
  agentId: string;
  taskId: string;
  label: string;
  timestamp: string;
};
```

这叫 `Agent Timeline`（智能体时间线）。

它记录执行过程中的事件，例如：

```text
research started（研究智能体开始）
research finished（研究智能体完成）
research delegated to planner（研究智能体委派给规划智能体）
planner started（规划智能体开始）
planner finished（规划智能体完成）
planner delegated to critic（规划智能体委派给审查智能体）
critic started（审查智能体开始）
critic finished（审查智能体完成）
critic delegated to writer（审查智能体委派给写作智能体）
writer started（写作智能体开始）
writer finished（写作智能体完成）
```

它和 Day 37 的 `Unified Timeline`（统一时间线）类似。

区别是：

```text
Day 37 的 Timeline（时间线）观察 Job（任务）、Workflow（工作流）、Worker（工作进程）。
Day 39 的 Timeline（时间线）观察 Agent（智能体）、Task（任务）、Delegation（委派）。
```

---

## 17. Agent Metrics（智能体指标）的升级

Day 38 的 `AgentMetrics`（智能体指标）主要是注册表指标：

```text
totalAgents（智能体总数）
capabilityCount（能力数量）
toolCoverage（工具覆盖数量）
```

Day 39 增加了协作运行时指标：

```text
executedTasks（已执行任务数）
delegatedTasks（已委派任务数）
avgTaskDuration（平均任务耗时）
successRate（成功率）
```

这表示 Day 39 的指标不再只回答：

```text
系统里有什么 Agent（智能体）？
```

还开始回答：

```text
这些 Agent（智能体）刚才协作得怎么样？
```

这就是 `Observability`（可观测性）的升级。

---

## 18. Day 39 的 API（接口）和 Dashboard（看板）

Day 39 仍然使用：

```text
GET /api/agents
```

但返回内容比 Day 38 多了：

```text
collaboration（协作快照）
```

其中包含：

```text
result（聚合结果）
callGraph（调用图）
timeline（时间线）
metrics（运行时指标）
```

前端右侧看板从 Day 38 的 `Agent Explorer`（智能体浏览器）升级为：

```text
Agent Collaboration Dashboard（智能体协作看板）
```

它展示：

```text
Executed（执行任务数）
Delegated（委派任务数）
Success（成功率）
Avg ms（平均耗时）
Capability Search（能力搜索）
Agent Call Graph（智能体调用图）
Agent Timeline（智能体时间线）
Agent 列表
最终 Writer Agent（写作智能体）输出
```

这说明 Day 39 不只是代码层做了协作，也把协作过程可视化出来了。

---

## 19. Day 39 相比 Day 38 的改进

Day 38 的核心是：

```text
Agent Registry（智能体注册表）
Capability Search（能力搜索）
Single Agent Execution（单智能体执行）
```

Day 38 能回答：

```text
系统里有哪些 Agent（智能体）？
每个 Agent（智能体）有什么能力？
某个 capability（能力）应该路由到哪个 Agent（智能体）？
能不能执行一个 Agent（智能体）？
```

Day 39 的核心是：

```text
AgentRuntime（智能体运行时）
Agent-to-Agent Collaboration（智能体到智能体协作）
delegateTask（委派任务）
Agent Call Graph（智能体调用图）
Agent Timeline（智能体时间线）
Result Aggregation（结果聚合）
```

Day 39 能回答：

```text
多个 Agent（智能体）能不能串起来完成任务？
谁把任务交给了谁？
每个 Agent（智能体）的输出怎么传给下游？
整个协作链路怎么观察？
最终结果怎么聚合？
```

简单对比：

```text
Day 38：定义组织架构。
Day 39：让组织架构开始协作。
```

更形象地说：

```text
Day 38：把 Research / Planner / Critic / Writer 这些岗位建好了。
Day 39：让这些岗位开始按流程交接工作。
```

---

## 20. 为什么 Day 39 要这样设计

真正复杂的任务，通常不适合一个 `Agent`（智能体）从头做到尾。

例如用户说：

```text
帮我学习 LangGraph。
```

如果一个 `Agent`（智能体）全做，它要同时负责：

```text
查资料。
做规划。
找漏洞。
写最终答案。
```

这样容易出现：

```text
角色混乱。
上下文太杂。
输出容易跑偏。
审查不独立。
后续不好调试。
```

Day 39 的设计把它拆成：

```text
Research Agent（研究智能体）：负责收集和整理材料。
Planner Agent（规划智能体）：负责制定路线。
Critic Agent（审查智能体）：负责检查风险和遗漏。
Writer Agent（写作智能体）：负责最终表达。
```

这样做的好处是：

```text
职责更清楚。
上下文传递更明确。
每一步都可以观察。
每个 Agent（智能体）的责任更容易定位。
后续可以替换某个 Agent（智能体）或增强某个 Agent（智能体）。
```

这就是多智能体系统的核心思想：

```text
不是让一个大脑做所有事，而是把复杂任务拆成多个专业角色协作。
```

---

## 21. Day 39 运用的知识

1. `Runtime Abstraction`（运行时抽象）：用 `AgentRuntime`（智能体运行时）统一管理执行、委派、聚合和指标。

2. `Task Delegation`（任务委派）：用 `delegateTask`（委派任务）表达一个 `Agent`（智能体）把任务交给另一个 `Agent`（智能体）。

3. `Context Passing`（上下文传递）：用 `task.context`（任务上下文）把上游输出传给下游 `Agent`（智能体）。

4. `Parent-Child Task`（父子任务关系）：用 `parentTaskId`（父任务 ID）记录子任务来自哪个上游任务。

5. `Result Aggregation`（结果聚合）：用 `childResults`（子结果）保存下游结果，让最终结果可追踪。

6. `Call Graph`（调用图）：用 `AgentCallEdge`（智能体调用边）记录 `Agent`（智能体）之间的调用关系。

7. `Timeline`（时间线）：用 `AgentTimelineEvent`（智能体时间线事件）记录执行顺序和关键事件。

8. `Metrics`（指标）：统计执行数量、委派数量、平均耗时和成功率。

9. `Observability`（可观测性）：通过 `Dashboard`（看板）把运行时状态展示出来。

10. `Fixed Workflow`（固定工作流）：先写死 `Research -> Planner -> Critic -> Writer`，降低复杂度，方便验证基础设施。

---

## 22. 当前 Day 39 还没有做什么

Day 39 虽然已经有多 `Agent`（多智能体）协作，但它仍然是固定链路。

它还没有做：

```text
Dynamic Agent Routing（动态智能体路由）
Model-decided Collaboration（模型自动决定协作流程）
Parallel Agent Execution（并行智能体执行）
Real LLM Execution（真实大模型逐 Agent 调用）
Context Isolation Policy（上下文隔离策略）
Permission Control（权限控制）
Failure Recovery（失败恢复）
```

所以 Day 39 是多智能体协作运行时的最小可运行版本。

它先把骨架搭稳：

```text
任务怎么传。
结果怎么收。
调用怎么记。
过程怎么看。
指标怎么算。
```

这些比一上来做自动智能体编排更重要。

---

## 23. Day 38 与 Day 39 总结对比

Day 38 的核心是：

```text
系统知道有哪些 Agent（智能体）。
```

Day 39 的核心是：

```text
系统开始让这些 Agent（智能体）互相交接任务。
```

架构升级路径是：

```text
Agent Registry（智能体注册表）
  -> Agent Runtime（智能体运行时）
  -> Agent Collaboration（智能体协作）
```

这就是从“有角色”到“角色能协作”的一步。

---

## 24. 第39天打卡

【第39天打卡】

1. 是否扩展 AgentTask（智能体任务）：是

2. 是否扩展 AgentResult（智能体结果）：是

3. 是否实现 AgentRuntime（智能体运行时）：是

4. 是否实现 delegateTask（委派任务）：是

5. 是否记录 Agent Call Graph（智能体调用图）：是

6. 是否实现 Agent Timeline（智能体时间线）：是

7. 是否实现固定协作链：是

8. Dashboard（看板）是否展示 Agent Call Graph（智能体调用图）：是

9. 是否增加 Agent Metrics（智能体指标）：是

10. 是否完成多 Agent（多智能体）协作测试：是

11. 遇到的最大问题：

```text
Day 39 最大的问题不是单个 Agent（智能体）执行，而是如何让多个 Agent（智能体）的任务交接变得可追踪。
如果只是按顺序调用 Research、Planner、Critic、Writer，系统虽然能跑，但无法清楚说明谁把任务交给了谁、哪个任务来自哪个上游任务、下游结果如何聚合。
因此本次重点补上了 AgentTask（智能体任务）的 parentTaskId（父任务 ID）、assignedAgentId（被分配的智能体 ID）和 context（上下文），同时补上 Agent Call Graph（智能体调用图）、Agent Timeline（智能体时间线）和 Agent Metrics（智能体指标）。
```

12. 当前系统能力：

```text
当前系统已经从 Day 38 的 Agent Registry（智能体注册表）升级到 Day 39 的 Multi-Agent Runtime V2（多智能体运行时第 2 版）。
系统可以注册并展示 Research Agent（研究智能体）、Planner Agent（规划智能体）、Critic Agent（审查智能体）和 Writer Agent（写作智能体），也可以按 Capability（能力）搜索 Agent（智能体）。
在此基础上，系统已经可以通过 AgentRuntime（智能体运行时）执行固定协作链：Research Agent（研究智能体） -> Planner Agent（规划智能体） -> Critic Agent（审查智能体） -> Writer Agent（写作智能体）。
协作过程中会记录 delegateTask（委派任务）、Agent Call Graph（智能体调用图）、Agent Timeline（智能体时间线）、Agent Metrics（智能体指标），并通过 Dashboard（看板）展示执行任务数、委派任务数、成功率、平均耗时和最终 Writer Agent（写作智能体）输出。
```

---

## 25. 最终结论

Day 38 完成的是：

```text
Tool（工具） -> Agent（智能体）
```

这一层抽象。

Day 39 完成的是：

```text
Agent（智能体） -> Agent Collaboration（智能体协作）
```

这一层运行时基础。

最重要的一句话是：

```text
Day 38 让系统“有角色”，Day 39 让角色“会交接任务”。
```

---

## 26. 第39天补充总结

第 39 天完成的是：

```text
Multi-Agent Collaboration Runtime V1（多智能体协作运行时第 1 版）
```

这一步非常关键。

系统已经从：

```text
Single Agent Execution（单智能体执行任务）
```

升级成：

```text
多个 Agent（智能体）之间可以委派、协作、产出链式结果。
```

第 39 天已经拥有：

```text
AgentTask（智能体任务）
AgentResult（智能体结果）
AgentRuntime（智能体运行时）
delegateTask（委派任务）
Agent Call Graph（智能体调用图）
Agent Timeline（智能体时间线）
固定协作链
Agent Metrics（智能体指标）
多 Agent（多智能体）协作测试
```

这说明系统已经正式进入：

```text
Multi-Agent Runtime（多智能体运行时）
```

而不是普通的：

```text
Agent App（智能体应用）
```

普通 `Agent App`（智能体应用）通常只是一个 Agent（智能体）调用若干 Tool（工具）；而当前系统已经开始支持多个 Agent（智能体）之间的任务交接、上下文传递、结果聚合和过程观察。

---

## 27. 第40天学习计划：Multi-Agent Runtime V2（多智能体运行时第 2 版）与 Supervisor Agent（监督智能体）

第 40 天主题是：

```text
Multi-Agent Runtime V2（多智能体运行时第 2 版）：Supervisor Agent（监督智能体）
```

### 27.1 今日核心目标

第 40 天不再写死协作链，而是让一个 `Supervisor Agent`（监督智能体）负责决定该调用哪些 Agent（智能体）。

第 39 天的协作链是固定的：

```text
Research（研究）
  -> Planner（规划）
  -> Critic（审查）
  -> Writer（写作）
```

第 40 天要升级为：

```text
User Goal（用户目标）
  -> Supervisor Agent（监督智能体）
  -> 动态选择 Agent（智能体）
  -> 执行协作
```

也就是说，系统要从固定流程升级为由监督智能体进行任务分析和智能体调度。

---

## 28. 为什么第40天要做 Supervisor Agent（监督智能体）

固定链路的问题是：

```text
所有任务都 Research -> Planner -> Critic -> Writer。
```

但真实情况不是所有任务都需要完整链路。

例如：

```text
如果用户只是要总结：Writer Agent（写作智能体）可能就够了。
如果用户要研究新技术：Research Agent（研究智能体）+ Planner Agent（规划智能体）+ Critic Agent（审查智能体）+ Writer Agent（写作智能体）更合适。
如果用户要检查方案漏洞：Critic Agent（审查智能体）更合适。
```

所以系统需要：

```text
Supervisor Agent（监督智能体）
```

它的职责不是直接完成所有任务，而是先判断：

```text
这次任务需要哪些 Agent（智能体）？
执行顺序是什么？
哪些步骤依赖前面的结果？
是否需要全部 Agent（智能体）参与？
```

一句话：

```text
固定协作链是流程，Supervisor Agent（监督智能体）才是多 Agent（多智能体）调度。
```

---

## 29. 第40天最终效果

示例 1：

用户输入：

```text
帮我学习 LangGraph
```

`Supervisor Agent`（监督智能体）输出：

```json
{
  "selectedAgents": ["research", "planner", "critic", "writer"],
  "reason": "需要资料检索、学习计划、质量检查和最终输出"
}
```

示例 2：

用户输入：

```text
帮我润色这段文字
```

`Supervisor Agent`（监督智能体）输出：

```json
{
  "selectedAgents": ["writer"],
  "reason": "只需要写作与表达优化"
}
```

这意味着系统不再一刀切地执行固定链路，而是根据任务类型动态选择合适的 Agent（智能体）。

---

## 30. 第40天任务拆解

### 30.1 任务 1：新增 Supervisor Agent（监督智能体）

注册一个新 Agent（智能体）：

```ts
{
  id: "supervisor",
  name: "Supervisor Agent",
  description: "负责分析用户任务并选择合适的 Agent 协作链",
  capabilities: ["supervise", "agent-routing", "task-decomposition"],
  tools: [],
  systemPrompt: "你是一个多智能体调度器..."
}
```

字段含义：

```text
supervise（监督）：负责整体调度。
agent-routing（智能体路由）：负责选择合适的 Agent（智能体）。
task-decomposition（任务拆解）：负责把目标拆成步骤。
```

### 30.2 任务 2：定义 AgentPlan（智能体计划）

新增：

```ts
type AgentPlan = {
  goal: string;
  selectedAgents: string[];
  reason: string;
  steps: {
    agentId: string;
    task: string;
    dependsOn?: string[];
  }[];
};
```

注意：

```text
selectedAgents（已选择智能体）是简单列表。
steps（执行步骤）是真正执行计划。
dependsOn（依赖项）表示当前步骤依赖哪些前置步骤。
```

### 30.3 任务 3：实现 planAgents（规划智能体）

新增：

```ts
async function planAgents(goal: string): Promise<AgentPlan>
```

它调用 `Supervisor Agent`（监督智能体），让模型返回 `JSON`（结构化数据格式）。

### 30.4 任务 4：Supervisor Prompt（监督智能体提示词）

示例：

```ts
const prompt = `
你是一个多智能体调度器。

可用 Agent：
${agentRegistry.list().map(agent => `
- ${agent.id}: ${agent.description}
  capabilities: ${agent.capabilities.join(", ")}
`).join("\n")}

请根据用户目标选择最合适的 Agent 协作步骤。

要求：
1. 只选择必要的 Agent
2. 不要所有任务都用全部 Agent
3. steps 必须按执行顺序排列
4. 如果后续步骤依赖前一步结果，请写 dependsOn
5. 只返回 JSON

格式：
{
  "goal": "...",
  "selectedAgents": ["..."],
  "reason": "...",
  "steps": [
    {
      "agentId": "...",
      "task": "...",
      "dependsOn": []
    }
  ]
}

用户目标：
${goal}
`;
```

这里的 `Prompt`（提示词）用于约束 `Supervisor Agent`（监督智能体）返回可解析、可校验、可执行的计划。

### 30.5 任务 5：AgentPlan Validator（智能体计划校验器）

必须校验：

1. `selectedAgents`（已选择智能体）是否都存在。
2. `steps.agentId`（步骤中的智能体 ID）是否存在。
3. 是否有空 `task`（任务描述）。
4. `dependsOn`（依赖项）是否合法。
5. 是否出现循环依赖。

如果出错：

```text
fallback（降级兜底）到 Writer Agent（写作智能体）或固定协作链。
```

这里的 `fallback`（降级兜底）很重要，因为模型返回的 `JSON`（结构化数据格式）可能不稳定，系统必须有可运行的后备方案。

### 30.6 任务 6：执行 AgentPlan（智能体计划）

新增：

```ts
executeAgentPlan(plan)
```

逻辑类似 `Workflow DAG`（工作流有向无环图）：

```text
step1 agent（第 1 步智能体）
  -> step2 agent（第 2 步智能体）
```

第 40 天先做串行执行即可，后面再考虑并行。

这里的 `DAG`（有向无环图）表示步骤之间可以有依赖关系，但不能出现循环。

### 30.7 任务 7：Agent Context Passing（智能体上下文传递）

后续 Agent（智能体）要拿到前面 Agent（智能体）的输出。

例如：

```text
Research output（研究输出）
  -> Planner input（规划输入）
```

传入：

```ts
context.previousResults
```

这里的 `previousResults`（前置结果）用于让下游 Agent（智能体）看到上游 Agent（智能体）的产出。

### 30.8 任务 8：Agent Plan Debug Panel（智能体计划调试面板）

前端展示：

```text
Supervisor Decision（监督智能体决策）

Goal（目标）:
...

Selected Agents（已选择智能体）:
research, planner, writer

Reason（原因）:
...

Steps（步骤）:
1. Research Agent（研究智能体）
2. Planner Agent（规划智能体）
3. Writer Agent（写作智能体）
```

这个面板用于观察 `Supervisor Agent`（监督智能体）为什么这样调度。

### 30.9 任务 9：Agent Plan Timeline（智能体计划时间线）

展示：

```text
Supervisor planned（监督智能体完成规划）
Research started（研究智能体开始）
Research success（研究智能体成功）
Planner started（规划智能体开始）
Planner success（规划智能体成功）
Writer started（写作智能体开始）
Writer success（写作智能体成功）
```

这会把 Day 39 的 `Agent Timeline`（智能体时间线）升级为包含 `Supervisor`（监督者）决策阶段的计划执行时间线。

### 30.10 任务 10：测试 5 类任务

测试：

1. 帮我学习 LangGraph  
   期望：`research + planner + writer`（研究智能体 + 规划智能体 + 写作智能体）。

2. 帮我总结这段内容  
   期望：`writer`（写作智能体）或 `summary`（总结）类 Agent（智能体）。

3. 帮我检查这个方案有什么漏洞  
   期望：`critic`（审查智能体）。

4. 帮我制定一个三天学习计划  
   期望：`planner + writer`（规划智能体 + 写作智能体）。

5. 帮我研究并输出最终报告  
   期望：`research + critic + writer`（研究智能体 + 审查智能体 + 写作智能体）。

---

## 31. 第40天验收标准

1. 是否新增 `Supervisor Agent`（监督智能体）。
2. 是否定义 `AgentPlan`（智能体计划）。
3. 是否实现 `planAgents`（规划智能体）。
4. `Supervisor`（监督者）是否能动态选择 Agent（智能体）。
5. 是否实现 `AgentPlan Validator`（智能体计划校验器）。
6. 是否实现 `executeAgentPlan`（执行智能体计划）。
7. 是否支持 `Agent Context Passing`（智能体上下文传递）。
8. 前端是否展示 `Supervisor Decision`（监督智能体决策）。
9. 是否展示 `Agent Plan Timeline`（智能体计划时间线）。
10. 是否完成 5 类任务测试。

---

## 32. 第40天打卡模板

【第40天打卡】

1. 是否新增 Supervisor Agent（监督智能体）：是 / 否

2. 是否定义 AgentPlan（智能体计划）：是 / 否

3. 是否实现 planAgents（规划智能体）：是 / 否

4. Supervisor（监督者）是否能动态选择 Agent（智能体）：是 / 否

5. 是否实现 AgentPlan Validator（智能体计划校验器）：是 / 否

6. 是否实现 executeAgentPlan（执行智能体计划）：是 / 否

7. 是否支持 Agent Context Passing（智能体上下文传递）：是 / 否

8. 前端是否展示 Supervisor Decision（监督智能体决策）：是 / 否

9. 是否展示 Agent Plan Timeline（智能体计划时间线）：是 / 否

10. 是否完成 5 类任务测试：是 / 否

11. 遇到的最大问题：

```text
待填写。
```

12. 当前系统能力：

```text
待填写。
```

---

## 33. 第40天核心认知

记住一句话：

```text
固定协作链是流程，Supervisor（监督者）才是多 Agent（多智能体）调度。
```

完成第 40 天后，系统会升级成：

```text
Supervisor-based Multi-Agent Runtime V2（基于监督智能体的多智能体运行时第 2 版）
```
