# Day 38 学习总结：Multi-Agent Runtime V1（多智能体运行时第 1 版）与 Agent Registry（智能体注册表）

本文档记录 `ollama-chat-day38` 项目做了什么、运用了什么知识、相比 `ollama-chat-day37` 有什么改进、为什么这样设计，并整理本次关于 Multi-Agent（多智能体）、Agent（智能体）与 Tool（工具）的学习对话。

---

## 1. 项目做了什么

`ollama-chat-day38` 是在 `ollama-chat-day37` 的 Agent Execution Platform（智能体执行平台）基础上继续升级的本地 AI Agent（人工智能智能体）聊天系统。

day37 的核心是：

```text
Agent Execution Platform（智能体执行平台）
= Workflow as Job（把工作流作为任务）
+ Queue Runtime（队列运行时）
+ WorkerPool（工作进程池）
+ Retry / Timeout / Cancel（重试 / 超时 / 取消）
+ Unified Timeline（统一时间线）
```

day38 的核心是：

```text
Multi-Agent Runtime V1（多智能体运行时第 1 版）
= Agent Registry（智能体注册表）
+ Agent Explorer（智能体浏览器）
+ Capability Search（能力搜索）
+ Agent Metrics（智能体指标）
+ Single Agent Execution（单智能体执行）
```

一句话理解：

```text
day37 解决“复杂 Workflow（工作流）怎么可靠地跑起来”；
day38 解决“系统里有哪些 Agent（智能体）、每个 Agent 会什么、怎么找到合适的 Agent”。
```

day38 并没有删除 day37 的 Queue（队列）、Workflow（工作流）、RAG（Retrieval-Augmented Generation，检索增强生成）、Tool Registry（工具注册表）和 Worker（工作进程）能力，而是在这些基础设施之上新增了一层 Agent Registry（智能体注册表）。

---

## 2. 核心执行链路

day37 的主链路是：

```text
用户输入
  -> Workflow（工作流）
  -> Job（任务）
  -> Queue（队列）
  -> Worker（工作进程）
  -> 执行结果
```

day38 在这个基础上新增了 Agent（智能体）层：

```text
用户目标
  -> Agent Registry（智能体注册表）
  -> Capability Routing（能力路由）
  -> 找到合适 Agent（智能体）
  -> Single Agent Execution（单智能体执行）
  -> 后续为 Multi-Agent Collaboration（多智能体协作）做准备
```

当前 day38 还没有做复杂的 Multi-Agent Collaboration（多智能体协作），也没有让多个 Agent 互相对话或互相审查。它先做最基础但很关键的一层：

```text
先定义 Agent（智能体）
再注册 Agent（智能体）
再按 capability（能力）搜索 Agent
再展示 Agent Metrics（智能体指标）
最后提供 executeAgent（执行智能体）的统一入口
```

---

## 3. 关键文件

- `lib/agents/agent-types.ts`：定义 Agent（智能体）、AgentMetrics（智能体指标）、AgentContext（智能体上下文）、AgentTask（智能体任务）和 AgentResult（智能体结果）。
- `lib/agents/agent-registry.ts`：实现 AgentRegistry（智能体注册表），支持注册、查找、列出和按能力搜索。
- `lib/agents/default-agents.ts`：创建 4 个默认 Agent（智能体）：Research、Planner、Critic、Writer。
- `lib/agents/agent-executor.ts`：实现 routeAgentByCapability（按能力路由智能体）和 executeAgent（执行智能体）。
- `app/api/agents/route.ts`：提供 `GET /api/agents` 接口，返回 Agent 列表、指标、路由测试结果和执行示例。
- `app/components/AgentExplorer.tsx`：右侧 Agent Explorer（智能体浏览器），展示 Agent、Capabilities（能力）、Tools（工具）、Prompt（提示词）、Metrics（指标）和执行示例。
- `app/components/Header.tsx`：将页面标题切换为 Day 38 和 Multi-Agent Runtime V1（多智能体运行时第 1 版）。
- `day38_test_cases.md`：记录 day38 的手动测试用例。

---

## 4. 运用了什么知识

### 4.1 Agent（智能体）

day38 定义的 Agent（智能体）结构是：

```ts
type Agent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  tools: string[];
};
```

这里的 Agent（智能体）不是一个独立模型，而是一个“角色化的执行单元”。它通常由这些部分组成：

```text
Agent（智能体）
= Model（模型）
+ System Prompt（系统提示词）
+ Memory（记忆）
+ Tools（工具）
+ Capability（能力）
+ Execution Policy（执行策略）
```

### 4.2 AgentRegistry（智能体注册表）

AgentRegistry（智能体注册表）用于集中管理所有 Agent（智能体）：

```ts
register(agent)
get(id)
list()
findByCapability(capability)
```

它的意义是让系统不再硬编码“某件事应该交给谁”，而是可以通过 id（唯一标识）或 capability（能力）找到合适的 Agent（智能体）。

### 4.3 Capability Search（能力搜索）

Capability Search（能力搜索）用于按能力查找 Agent（智能体）。

例如：

```text
research（研究） -> Research Agent（研究智能体）
plan（规划） -> Planner Agent（规划智能体）
review（审查） -> Critic Agent（审查智能体）
write（写作） -> Writer Agent（写作智能体）
```

它是后续 Capability Routing（能力路由）的基础。

### 4.4 Agent Metrics（智能体指标）

day38 新增了 AgentMetrics（智能体指标）：

```ts
type AgentMetrics = {
  totalAgents: number;
  capabilityCount: number;
  toolCoverage: number;
};
```

它们分别表示：

```text
totalAgents：当前系统中有多少 Agent（智能体）
capabilityCount：这些 Agent 覆盖了多少去重后的 capability（能力）
toolCoverage：这些 Agent 覆盖了多少去重后的 tool（工具）
```

这让 Agent Registry（智能体注册表）开始具备可观察性。

### 4.5 Agent Context（智能体上下文）

day38 定义了 AgentContext（智能体上下文）：

```ts
type AgentContext = {
  memory: unknown;
  workflow: unknown;
  tools: unknown;
};
```

这一步是在为后续 Multi-Agent Collaboration（多智能体协作）做准备。以后不同 Agent 不应该都看到一样的上下文，而应该根据角色看到不同内容。

例如：

```text
Research Agent（研究智能体）看到资料、检索结果、知识库片段；
Planner Agent（规划智能体）看到目标、限制条件和任务结构；
Critic Agent（审查智能体）看到方案、风险和待检查内容；
Writer Agent（写作智能体）看到最终材料、受众和输出要求。
```

### 4.6 executeAgent（执行智能体）

day38 的 executeAgent（执行智能体）还是一个轻量版本：

```text
根据 agentId 找 Agent
接收 AgentTask（智能体任务）
读取 Agent 的 capabilities（能力）和 tools（工具）
返回 AgentResult（智能体结果）
```

它当前不是完整的大模型执行器，而是先把执行入口和数据结构固定下来。后续可以在这个入口里接入真实模型调用、Queue Job（队列任务）、Workflow Step（工作流步骤）或多 Agent 协作。

---

## 5. 默认 Agent（智能体）

day38 固定创建了 4 个 Agent（智能体）。

### 5.1 Research Agent（研究智能体）

职责：

```text
负责检索、RAG（检索增强生成）和资料整理。
```

能力：

```text
research（研究）
search（搜索）
rag（检索增强生成）
```

工具：

```text
retrieval（检索）
ragAnswer（基于检索结果回答）
summary（总结）
```

### 5.2 Planner Agent（规划智能体）

职责：

```text
负责计划拆解和 Workflow（工作流）设计。
```

能力：

```text
plan（规划）
planning（计划制定）
workflow（工作流）
```

工具：

```text
workflowPlanner（工作流规划器）
topologicalSort（拓扑排序）
validateWorkflow（校验工作流）
```

### 5.3 Critic Agent（审查智能体）

职责：

```text
负责审查方案、发现问题和提出风险。
```

能力：

```text
critic（审查）
review（评审）
risk（风险）
```

工具：

```text
validateWorkflow（校验工作流）
qualityCheck（质量检查）
riskReview（风险审查）
```

### 5.4 Writer Agent（写作智能体）

职责：

```text
负责输出、总结和面向用户的表达。
```

能力：

```text
write（写作）
summary（总结）
output（输出）
```

工具：

```text
summary（总结）
formatAnswer（格式化回答）
todo（待办列表）
```

---

## 6. 相比 day37 的改进

### 6.1 从“怎么执行”到“谁来执行”

day37 重点是执行基础设施：

```text
Workflow（工作流）怎么变成 Job（任务）
Job 怎么进入 Queue（队列）
Worker（工作进程）怎么执行
失败怎么 Retry（重试）
卡住怎么 Timeout（超时）
用户怎么 Cancel（取消）
执行过程怎么进入 Timeline（时间线）
```

day38 重点是角色组织：

```text
系统里有哪些 Agent（智能体）
每个 Agent 擅长什么
每个 Agent 可以用哪些 Tool（工具）
系统如何按 Capability（能力）找到 Agent
如何展示和观测 Agent
```

### 6.2 从 Tool Registry（工具注册表）走向 Agent Registry（智能体注册表）

day37 之前已经有 Tool Registry（工具注册表），可以按工具能力组织工具。

day38 新增 Agent Registry（智能体注册表），不是为了替代 Tool Registry，而是增加一个更高层的组织结构：

```text
Tool Registry（工具注册表）：管理“能做什么动作”
Agent Registry（智能体注册表）：管理“谁负责组织这些动作”
```

### 6.3 为 Multi-Agent Collaboration（多智能体协作）打地基

day38 暂时只做单 Agent 执行，但已经准备好了：

```text
AgentTask（智能体任务）
AgentResult（智能体结果）
AgentContext（智能体上下文）
Capability Routing（能力路由）
Agent Metrics（智能体指标）
```

这些都是后续做多 Agent 协作需要的基础结构。

---

## 7. 为什么这样设计

如果一上来就做多个 Agent 互相协作，系统会很容易变复杂：

```text
谁负责研究？
谁负责规划？
谁负责审查？
谁负责输出？
谁能调用哪些工具？
谁能看到哪些记忆？
一个 Agent 的结果怎么交给下一个 Agent？
如果结果不合格，谁负责返工？
```

所以 day38 先做最稳的一层：Agent Registry（智能体注册表）。

这样做的好处是：

```text
先明确角色边界；
先明确能力边界；
先明确工具权限；
先明确上下文结构；
先让 UI 可以观察 Agent；
后续再做 Agent 间交接和协作。
```

这相当于在组建团队之前，先把组织架构和岗位职责写清楚。

---

## 8. 学习对话记录

### 8.1 关于 Multi-Agent（多智能体）的理解

我的理解：

```text
多 Agent 的时候，每个 Agent 的区别主要是提示词不一样，然后根据其角色拿到的记忆应该不一样吧。
实际最终判断都是同一个模型，只是接收的信息更准确。
```

回答整理：

```text
这个理解很接近核心，而且抓住了多 Agent 最容易被神化的地方。
很多时候，多 Agent 并不是“真的有多个不同大脑”，而是同一个或同一类 Model（模型），在不同 Role（角色）、不同 Context（上下文）、不同 Tool Permission（工具权限）下工作。
```

更完整的理解是：

```text
Agent（智能体）
= Model（模型）
+ Role Prompt（角色提示词）
+ Visible Context（可见上下文）
+ Available Tools（可用工具）
+ Execution Policy（执行策略）
```

不同 Agent 的区别不只是 systemPrompt（系统提示词）不同，还包括：

```text
1. systemPrompt（系统提示词）不一样；
2. 能看到的 memory（记忆）不一样；
3. 能使用的 tools（工具）不一样；
4. task goal（任务目标）不一样；
5. output format（输出格式）不一样；
6. execution policy（执行策略）不一样。
```

例如，同一个底层模型可以扮演不同 Agent：

```text
Research Agent（研究智能体）
看到：资料、检索结果、知识库片段
目标：尽量收集事实
工具：retrieval / search / ragAnswer

Critic Agent（审查智能体）
看到：研究结果、计划草稿、风险清单
目标：找漏洞、反例、不确定性
工具：validate / review / judge

Writer Agent（写作智能体）
看到：最终确认过的材料
目标：组织成用户能读懂的答案
工具：summary / formatAnswer
```

关键点是：

```text
真正有价值的多 Agent，不是让所有 Agent 都看到全部上下文。
相反，通常应该做 Context Pruning（上下文裁剪）和 Context Isolation（上下文隔离）。
```

这样做的好处是：

```text
减少上下文污染；
降低模型跑偏概率；
让输出更聚焦；
节省 token（上下文消耗）；
更容易调试责任边界。
```

可以把理解升级为：

```text
多 Agent 不一定是多个模型，而是用角色、记忆、工具和流程，把同一个模型组织成多个专业工位。
```

### 8.2 关于 Tool（工具）和 Agent（智能体）的区别

我的问题：

```text
现有的工具已经是可以按能力区分了，为什么又要加个多 Agent 来让各个 Agent 有其不同的能力呢？
```

回答整理：

```text
Tool（工具）按能力区分的是“能做什么动作”。
Agent（智能体）按能力区分的是“谁来组织这些动作、怎么判断、怎么取舍、怎么表达”。
```

Tool（工具）更像函数：

```text
retrieval(query) -> 查资料
summary(text) -> 总结
validateWorkflow(plan) -> 校验工作流
weather(city) -> 查天气
```

Tool（工具）解决的是：

```text
我能不能做这件事？
```

Agent（智能体）更像角色：

```text
Research Agent（研究智能体）：决定查什么、查几轮、哪些资料可信。
Planner Agent（规划智能体）：决定怎么拆任务、步骤顺序是什么。
Critic Agent（审查智能体）：决定哪里有漏洞、是否需要返工。
Writer Agent（写作智能体）：决定怎么组织最终表达。
```

Agent（智能体）解决的是：

```text
这件事应该怎么做？
做到什么程度算够？
结果该怎么判断和交付？
```

例如用户说：

```text
帮我研究 LangGraph，并给我一个学习路线。
```

只看 Tool（工具）视角，系统可能只是：

```text
调用 retrieval（检索）
调用 summary（总结）
输出
```

但 Agent（智能体）视角会拆成：

```text
Research Agent（研究智能体）：先查 LangGraph 是什么、核心概念、适用场景。
Planner Agent（规划智能体）：把资料变成学习阶段和顺序。
Critic Agent（审查智能体）：检查路线是否缺少前置知识、是否太理想化。
Writer Agent（写作智能体）：整理成最终学习计划。
```

所以多 Agent 不是为了替代 Tool Registry（工具注册表），而是比 Tool Registry 高一层：

```text
Tool Registry（工具注册表）：能力库。
Agent Registry（智能体注册表）：角色库 / 决策单元库。
Workflow（工作流）：调度这些角色和动作的流程。
Queue（队列）：让这些流程可靠执行。
```

可以画成：

```text
用户目标
  -> Agent Selection（智能体选择）：这事交给谁负责？
  -> Agent Decision（智能体决策）：需要哪些步骤？
  -> Tool Call（工具调用）：执行具体动作。
  -> Agent Evaluation（智能体评估）：结果够不够？
  -> Agent Output（智能体输出）：怎么交付？
```

一个重要判断是：

```text
如果只是给同一个模型换个名字，而上下文、工具、目标、评估标准都一样，那多 Agent 就是多余包装。
```

真正有意义的多 Agent 至少要让这些东西不同：

```text
角色目标不同；
可见记忆不同；
可用工具不同；
输出格式不同；
是否能通过 / 驳回的判断标准不同。
```

一句话总结：

```text
Tool（工具）负责“执行能力”，Agent（智能体）负责“组织能力”。
```

---

## 9. 第38天打卡

【第38天打卡】

1. 是否定义 Agent（智能体）：是

2. 是否实现 AgentRegistry（智能体注册表）：是

3. 是否创建 Research Agent（研究智能体）：是

4. 是否创建 Planner Agent（规划智能体）：是

5. 是否创建 Critic Agent（审查智能体）：是

6. 是否创建 Writer Agent（写作智能体）：是

7. 是否实现 Capability Search（能力搜索）：是

8. 是否实现 Agent Explorer（智能体浏览器）：是

9. 是否实现 executeAgent（执行智能体）：是

10. 是否完成 Capability Routing（能力路由）测试：是

11. 遇到的最大问题：

```text
最大的认知问题是区分 Tool（工具）和 Agent（智能体）的边界。

Tool（工具）已经可以按能力区分，例如 retrieval（检索）、summary（总结）、validateWorkflow（校验工作流）。
但 Tool 主要回答“能做什么动作”，而 Agent 主要回答“谁来组织这些动作、按照什么目标和判断标准完成任务”。

因此，多 Agent（多智能体）不是为了重复 Tool Registry（工具注册表），而是为了在工具之上增加角色、上下文、权限、输出标准和评估责任。
如果多个 Agent 只是提示词名字不同，却看到相同上下文、使用相同工具、承担相同目标，那么它确实只是包装。
真正有价值的多 Agent 应该做到角色目标不同、可见记忆不同、可用工具不同、输出格式不同、评估标准不同。
```

12. 当前系统能力：

```text
当前系统已经在 day37 的 Agent Execution Platform（智能体执行平台）基础上，新增了 Multi-Agent Runtime V1（多智能体运行时第 1 版）的基础结构。

系统可以定义 Agent（智能体），通过 AgentRegistry（智能体注册表）统一注册和管理 Research Agent（研究智能体）、Planner Agent（规划智能体）、Critic Agent（审查智能体）和 Writer Agent（写作智能体）。

系统可以通过 Capability Search（能力搜索）和 Capability Routing（能力路由）按能力找到合适的 Agent，例如 research（研究）路由到 Research Agent，plan（规划）路由到 Planner Agent。

右侧 Agent Explorer（智能体浏览器）可以展示 Agent 列表、Capabilities（能力）、Tools（工具）、Prompt（提示词）、Agent Metrics（智能体指标）和单 Agent 执行示例。

同时，原有 Queue Runtime（队列运行时）、Workflow as Job（工作流作为任务）、RAG（检索增强生成）、Tool Registry（工具注册表）和 Knowledge Store（知识库）能力仍然保留，为后续 Multi-Agent Collaboration（多智能体协作）提供底层基础设施。
```

---

## 10. 今日结论

day38 最重要的工程思想是：

```text
Tool（工具）是执行能力，Agent（智能体）是能力的组织者。
```

多 Agent（多智能体）的价值不在于“模型数量变多”，而在于：

```text
角色更清晰；
上下文更干净；
工具权限更明确；
任务拆分更自然；
审查和输出责任更容易定位。
```

完成 day38 后，系统正式从：

```text
单 Agent（单智能体）调用工具
```

开始走向：

```text
多 Agent（多智能体）分工协作
```

不过 day38 仍然只是第一步。真正的多智能体价值，需要在后续继续实现：

```text
Agent Handoff（智能体交接）
Context Isolation（上下文隔离）
Critic Review（审查智能体评审）
Planner -> Researcher -> Writer（规划到研究再到写作）
Multi-Agent Workflow（多智能体工作流）
```
