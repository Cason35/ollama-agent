# Day 40 学习总结：Supervisor Multi-Agent Runtime（基于监督智能体的多智能体运行时）

本文档记录本次围绕 `ollama-chat-day40` 的学习对话整理，重点说明 Day40 项目做了什么、运用了什么知识、相比 `ollama-chat-day39` 有什么改进、为什么这样设计，以及围绕 `Supervisor Agent`（监督智能体）的几个关键疑问和澄清。

---

## 1. 用户提问：读懂 `ollama-chat-day40`

用户问题：

```text
带我来读懂 ollama-chat-day40 这个文件夹中的项目做了什么，运用了什么知识，对比 ollama-chat-day39 有什么改进，为什么这样子做，且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述。
```

回答整理：

`ollama-chat-day40` 可以用一句话概括：

```text
Day40 是在 Day39 固定多 Agent（智能体）协作链的基础上，新增 Supervisor Agent（监督智能体），让系统不再每次都死板地按 Research -> Planner -> Critic -> Writer 全流程执行，而是先根据用户目标动态选择需要哪些 Agent（智能体），生成 AgentPlan（智能体执行计划），校验计划，再按计划执行。
```

Day40 的主题是：

```text
Supervisor Multi-Agent Runtime（基于监督智能体的多智能体运行时）
Dynamic Agent Planning（动态智能体规划）
```

它的核心流程是：

```text
User Goal（用户目标）
  -> Supervisor Agent（监督智能体）
  -> AgentPlan（智能体计划）
  -> AgentPlan Validator（智能体计划校验器）
  -> executeAgentPlan（执行智能体计划）
  -> Agent Call Graph（智能体调用图）
  -> Agent Plan Timeline（智能体计划时间线）
```

Day39 只是让多个 Agent（智能体）能按固定顺序协作；Day40 开始让系统拥有调度判断能力。

例如：

```text
帮我学习 LangGraph 并制定三天学习计划
```

Day40 应该选择：

```text
research -> planner -> writer
```

而不是无论什么任务都强行执行：

```text
research -> planner -> critic -> writer
```

如果用户只是说：

```text
帮我总结这段内容
```

理论上只需要：

```text
writer
```

这就是 Day40 最重要的变化：

```text
从固定流程升级为按任务动态调度。
```

---

## 2. Day40 的核心新增模块

### 2.1 `default-agents.ts`

这里新增了 `Supervisor Agent`（监督智能体）。

它的核心身份是：

```text
id: "supervisor"
capabilities: ["supervise", "agent-routing", "task-decomposition"]
```

含义：

- `supervise`（监督 / 总控）：负责整体调度。
- `agent-routing`（智能体路由）：决定任务交给哪些 Agent（智能体）。
- `task-decomposition`（任务拆解）：把用户目标拆成执行步骤。

### 2.2 `agent-types.ts`

这里新增了 `AgentPlan`（智能体计划）和 `AgentPlanStep`（智能体计划步骤）。

`AgentPlan`（智能体计划）回答这些问题：

```text
目标是什么？
选择了哪些 Agent？
为什么这样选？
每一步由哪个 Agent 执行？
每一步依赖哪些前置步骤？
```

这让系统从“调用几个函数”升级为“先产出结构化计划，再执行计划”。

### 2.3 `agent-runtime.ts`

这是 Day40 的核心运行时。

关键能力包括：

- `planAgents`（规划智能体）：由 `Supervisor Agent`（监督智能体）根据目标选择 Agent。
- `validateAgentPlan`（校验智能体计划）：检查计划是否合法。
- `executeAgentPlan`（执行智能体计划）：按计划串行执行步骤。
- `runSupervisorCollaboration`（运行监督式协作）：完整执行 Supervisor 调度流程。
- `previousResults`（前置结果）：把前面 Agent 的输出传给后面的 Agent。

### 2.4 `app/api/agents/route.ts`

这个接口返回：

- Agent（智能体）列表。
- 能力路由测试结果。
- `Supervisor Agent`（监督智能体）执行示例。
- `AgentPlan`（智能体计划）。
- `Timeline`（时间线）。
- `Call Graph`（调用图）。
- `Metrics`（指标）。

### 2.5 `AgentExplorer.tsx`

右侧看板改为展示：

- `Supervisor Decision`（监督智能体决策）。
- `Selected Agents`（已选择智能体）。
- `Agent Plan Steps`（智能体计划步骤）。
- `Agent Call Graph`（智能体调用图）。
- `Agent Plan Timeline`（智能体计划时间线）。

---

## 3. 运用了什么知识

Day40 主要运用了这些知识：

### 3.1 Multi-Agent Runtime（多智能体运行时）

不是只调用一个模型，而是把任务拆给多个角色型 Agent（智能体）。

### 3.2 Supervisor Agent（监督智能体）

它不直接完成所有任务，而是负责判断：

```text
谁来做？
按什么顺序做？
后续步骤是否依赖前置步骤？
```

### 3.3 Agent Routing（智能体路由）

根据任务类型选择 Agent（智能体）。

例如：

```text
学习类任务 -> research + planner + writer
总结类任务 -> writer
审查类任务 -> critic + writer
```

### 3.4 Task Decomposition（任务拆解）

把一个大目标拆成多个小步骤。

### 3.5 AgentPlan（智能体计划）

用结构化数据描述执行链路，而不是把流程写死在代码里。

### 3.6 DAG（有向无环图）

`dependsOn`（依赖项）表示步骤依赖关系。

虽然 Day40 当前按串行方式执行，但已经开始具备 DAG（有向无环图）思维：步骤之间可以有依赖，但不能出现循环依赖。

### 3.7 Validator（校验器）

校验计划是否安全可执行，包括：

```text
Agent 是否存在。
任务是否为空。
依赖是否存在。
是否有循环依赖。
```

### 3.8 Fallback（降级兜底）

如果计划非法，就降级为 `Writer Agent`（写作智能体）兜底输出，避免系统直接崩溃。

### 3.9 Context Passing（上下文传递）

通过 `previousResults`（前置结果）把前面 Agent 的输出交给后面的 Agent，让后续步骤不是孤立执行。

### 3.10 Observability（可观测性）

通过这些结构观察系统内部发生了什么：

- `Agent Call Graph`（智能体调用图）。
- `Timeline`（时间线）。
- `Metrics`（指标）。

---

## 4. Day40 对比 Day39 有什么改进

Day39 的重点是：

```text
Agent-to-Agent Collaboration（智能体到智能体协作）
```

它能让多个 Agent（智能体）按固定顺序协作：

```text
Research -> Planner -> Critic -> Writer
```

但问题是：所有任务都走同一条链。

这会带来浪费。

例如用户只是想：

```text
润色一段文字
```

其实只需要 `Writer Agent`（写作智能体），但 Day39 仍然可能按完整链路跑一遍。

Day40 的改进是：

```text
固定协作链 -> 动态调度计划
```

更具体地说：

```text
Day39：系统知道怎么让 Agent 交接任务。
Day40：系统开始判断哪些 Agent 有必要参与。
```

Day39 是“流程固定”。

Day40 是“先规划，再执行”。

Day39 像一条固定流水线。

Day40 像一个调度员，先看任务，再安排合适的人上场。

---

## 5. 为什么 Day40 要这样做

因为真实的复杂任务并不是每次都需要所有 Agent（智能体）。

固定链路的问题是：

```text
简单任务太重。
复杂任务不够灵活。
所有任务都被迫走同一套流程。
```

引入 `Supervisor Agent`（监督智能体）后，系统可以做到：

```text
总结任务 -> writer
学习任务 -> research + planner + writer
审查任务 -> critic + writer
研究报告 -> research + critic + writer
```

这让系统更接近真实的多 Agent（多智能体）架构。

更重要的是，Day40 引入了 `AgentPlan`（智能体计划）和 `Validator`（校验器），这意味着以后可以继续升级到：

```text
LLM-decided Planning（由大模型决定计划）
Parallel Agent Execution（并行智能体执行）
Dynamic DAG Execution（动态有向无环图执行）
Permission Control（权限控制）
Failure Recovery（失败恢复）
```

所以 Day40 不是只加了一个新 Agent（智能体），而是把系统从“能协作”推进到“能调度”。

---

## 6. 核心理解

Day39 的核心是：

```text
多个 Agent 可以按固定链路协作。
```

Day40 的核心是：

```text
Supervisor Agent 先决定需要哪些 Agent，再生成计划并执行。
```

一句话总结：

```text
Day39 解决的是“Agent 怎么交接任务”，Day40 解决的是“这次任务到底该让哪些 Agent 参与”。
```

---

## 7. 用户疑问 1：POST `/api/chat` 是否会经过 Supervisor Agent？

用户问题：

```text
用户通过 POST /api/chat 来提问 x，这个时候是通过 Supervisor Agent 把问题 x 分解选出该问题需要动用到什么 Agent 吗？具体的调用代码在哪？
```

回答整理：

最初版本中，用户通过 `POST /api/chat` 提问时，并不会经过 `Supervisor Agent`（监督智能体）。

当时 `Supervisor Agent` 只在：

```text
GET /api/agents
```

里作为演示数据运行。

这意味着右侧 `Supervisor Runtime Dashboard`（监督运行时看板）可以看到 Supervisor 效果，但真实聊天主链路仍然没有使用它。

后续补齐后，普通用户提问已经接入：

```text
POST /api/chat
  -> executeSupervisorAgentCollaboration
  -> runSupervisorCollaboration
  -> planAgents
  -> executeAgentPlan
```

现在普通提问会进入 `Supervisor Agent`（监督智能体）调度链路。

---

## 8. 用户疑问 2：Supervisor Agent 不知道系统有什么 Agent 吗？

用户问题：

```text
我看 Supervisor Agent 的 systemPrompt 里面并没有其他 Agent 的相关信息，就是相当于这样问模型要返回要的 Agent，但是模型并不知道系统有什么 Agent，这里返回不会有问题吗？
```

回答整理：

这个疑问是对的。

如果只看 `default-agents.ts` 中的 `Supervisor Agent.systemPrompt`（监督智能体系统提示词），它确实只是角色描述：

```text
你是一个多智能体调度器，负责根据用户目标选择必要 Agent、生成步骤和校验依赖。
```

它本身没有列出：

```text
系统里有哪些 Agent？
每个 Agent 的 id 是什么？
每个 Agent 擅长什么？
每个 Agent 有哪些 capabilities（能力）？
```

后续补齐后，系统不是把这些内容写死在 `systemPrompt` 里，而是在运行时通过 `buildSupervisorPrompt`（构造监督智能体提示词）动态注入。

实际发给模型的内容会包含：

```text
可用 Agent：
- research: 负责检索、RAG 和资料整理。
  capabilities: research, search, rag

- planner: 负责计划拆解和 Workflow 设计。
  capabilities: plan, planning, workflow

- critic: 负责审查方案、发现问题和提出风险。
  capabilities: critic, review, risk

- writer: 负责输出、总结和面向用户的表达。
  capabilities: write, summary, output
```

因此现在的设计是：

```text
Supervisor systemPrompt（监督智能体系统提示词）：告诉模型“你是调度器”。
buildSupervisorPrompt（构造监督提示词）：告诉模型“系统有哪些 Agent，以及输出 AgentPlan 的格式”。
```

---

## 9. 用户疑问 3：Agent 之间是否真正接力？

用户问题：

```text
planAgents 可以通过用户输入的一些文本判断可能用什么 Agent，但是这样判断出来的 Agent 并没有联系，无法说得到 agentA 的结果要给到 agentB 来继续调用模型；这样不就没达到第40天任务的需求吗？
```

回答整理：

这个疑问也是对的。

最初版本中，`executeAgent`（执行智能体）只是生成模拟文本，没有真正调用模型。

也就是说最初版本只是：

```text
Agent A 产生模拟 output
Agent B 收到 previousResults
Agent B 再产生模拟 output
```

而不是：

```text
Agent A 调用模型得到真实结果
Agent B 把 Agent A 的真实结果放进 prompt
Agent B 再调用模型继续处理
```

后续补齐后，`executeAgent` 已经支持真实模型调用：

```text
system: agent.systemPrompt
user:
当前任务：...
前置 Agent 输出：...
```

同时 `executeAgentPlan`（执行智能体计划）会把前置步骤结果放进：

```ts
context: { previousResults }
```

下游 Agent（下游智能体）会读取这些 `previousResults`（前置结果）继续调用模型。

因此现在已经补齐：

```text
Supervisor Agent（监督智能体）
  -> AgentPlan（智能体计划）
  -> Research Agent 调模型
  -> Planner Agent 读取 Research 结果再调模型
  -> Writer Agent 读取前置结果再调模型
```

---

## 10. 用户疑问 4：文档里的 Day40 任务需要做到什么程度？

用户问题：

```text
day39_learning_summary.md 文档里面的 day40 任务需要做到什么程度呢，现在 ollama-chat-day40 文件夹的系统对应有哪些没完成呢，先列出来。
```

回答整理：

根据文档，Day40 不是只做一个展示面板，而是要做到：

```text
用户目标
  -> Supervisor Agent（监督智能体）分析任务
  -> 动态选择需要的 Agent（智能体）
  -> 生成 AgentPlan（智能体计划）
  -> 校验 AgentPlan
  -> 按计划执行 Agent
  -> 后续 Agent 能拿到前面 Agent 的结果继续处理
  -> 前端展示 Supervisor 决策、计划步骤和时间线
```

最初版本已经完成：

```text
Supervisor Agent 注册。
AgentPlan 类型。
AgentPlan Validator。
executeAgentPlan 结构。
previousResults 结构。
前端 Debug Panel（调试面板）。
Agent Plan Timeline（智能体计划时间线）。
```

最初没完成：

```text
POST /api/chat 没有接入 Supervisor Agent。
Supervisor Agent 没有真正调用模型。
Supervisor Prompt 没有动态注入可用 Agent 信息。
每个 Agent 没有用自己的 systemPrompt 调模型。
Agent 之间没有真实模型结果接力。
测试还只是文档，没有真实闭环验证。
```

后续已经补齐核心闭环：

```text
用户通过 POST /api/chat 提问
  -> Supervisor 调模型生成 AgentPlan
  -> AgentPlan Validator 校验
  -> 各 Agent 按自己的 systemPrompt 调模型
  -> previousResults 传给下游 Agent
  -> 返回最终结果
```

---

## 11. 用户疑问 5：之前没完成这些任务是为什么？

用户问题：

```text
之前没完成这些任务是为什么？
```

回答整理：

主要原因是：之前实现时把 Day40 先做成了一个“可展示、可验证的 Supervisor Runtime（监督运行时）骨架”，而不是完整接入真实聊天链路的版本。

具体原因：

1. 当时重点落在显式条目上：

```text
新增 Supervisor Agent。
定义 AgentPlan。
实现 planAgents。
实现 AgentPlan Validator。
实现 executeAgentPlan。
展示 Supervisor Decision。
展示 Agent Plan Timeline。
生成测试用例文档。
```

2. 当时把“先做可运行骨架”当成了 Day40 的阶段性完成。

最初做的是：

```text
Rule-based Supervisor（规则型监督器）
```

而不是：

```text
LLM-based Supervisor Agent（基于大模型的监督智能体）
```

3. 没有把“真实 Agent 执行”作为验收底线。

最初的 `executeAgent`（执行智能体）没有调用：

```text
invokeChatModel（调用聊天模型）
```

也没有把每个 Agent 的 `systemPrompt`（系统提示词）真正传给模型。

4. Day39 原项目本身已有多套链路：

```text
普通 chat 路由
weather / summary / todo 工具路由
useWorkflow 工作流分支
Queue Runtime（队列运行时）
Workflow as Job（把工作流作为任务执行）
RAG（检索增强生成）
Memory（记忆）
```

把 Supervisor 接进 `POST /api/chat` 需要决定它和这些旧能力的关系。

后续选择的边界是：

```text
保留 useWorkflow 工作流分支。
普通提问默认走 Day40 Supervisor Agent。
```

---

## 12. 用户疑问 6：`createRuleBasedPlan` 的作用是什么？

用户问题：

```text
createRuleBasedPlan 的作用是什么？
```

回答整理：

`createRuleBasedPlan`（创建规则型计划）的作用是：

```text
当 Supervisor Agent 没法通过模型正常生成 AgentPlan 时，用规则兜底生成一个可执行计划，保证系统不崩。
```

它主要在 `planAgents`（规划智能体）里被调用。

场景包括：

```text
没有 ModelRuntime（模型运行时）。
Supervisor 模型请求失败。
Supervisor 返回空内容。
Supervisor 返回内容无法解析为合法 AgentPlan。
```

它内部通过关键词判断要用哪些 Agent：

```text
包含“研究 / 学习 / 资料 / LangGraph / 报告” -> research
包含“计划 / 规划 / 三天 / 拆解” -> planner
包含“检查 / 审查 / 漏洞 / 风险” -> critic
一般最后加入 writer
```

一句话总结：

```text
createRuleBasedPlan 是 Supervisor 模型规划失败时的兜底规划器，用关键词规则生成一个最低可运行的 AgentPlan。
```

它不是 Day40 的主路径。

主路径是：

```text
Supervisor Agent 调模型 -> 返回 AgentPlan
```

---

## 13. 用户疑问 7：现在是否真的是 Supervisor 决定 Agent 和依赖？

用户问题：

```text
现在是根据 Supervisor Agent 来决定用户的问题 x 是用什么 Agent 及用到的 Agent 之间的关联吗？我怎么看代码 Supervisor Agent 还是没有描述系统有什么 Agent。
```

回答整理：

现在逻辑上是由 `Supervisor Agent`（监督智能体）决定：

```text
用户问题 x 需要哪些 Agent。
这些 Agent 的执行顺序是什么。
后续 Agent 是否依赖前面 Agent 的结果。
```

但要区分两个位置：

```text
default-agents.ts 里的 systemPrompt：只是角色设定。
agent-runtime.ts 里的 buildSupervisorPrompt：真正把可用 Agent 列表注入模型。
```

实际设计是：

```text
Supervisor systemPrompt：告诉模型“你是调度器”。
buildSupervisorPrompt：告诉模型“系统有哪些 Agent，以及输出 AgentPlan 的格式”。
AgentPlan.steps.dependsOn：描述 Agent 之间的依赖。
executeAgentPlan：按依赖把 previousResults 传给后续 Agent。
```

因此现在不是只靠静态 `systemPrompt`（系统提示词）让模型猜，而是运行时从 `AgentRegistry`（智能体注册表）读取 Agent 信息后，动态写进 Supervisor 的用户提示词中。

---

## 14. 第40天最终打卡

【第40天打卡】

1. 是否新增 Supervisor Agent（监督智能体）：是

2. 是否定义 AgentPlan（智能体计划）：是

3. 是否实现 planAgents（规划智能体）：是

4. Supervisor（监督者）是否能动态选择 Agent（智能体）：是

5. 是否实现 AgentPlan Validator（智能体计划校验器）：是

6. 是否实现 executeAgentPlan（执行智能体计划）：是

7. 是否支持 Agent Context Passing（智能体上下文传递）：是

8. 前端是否展示 Supervisor Decision（监督智能体决策）：是

9. 是否展示 Agent Plan Timeline（智能体计划时间线）：是

10. 是否完成 5 类任务测试：是

11. 遇到的最大问题：

```text
第40天最大的难点是区分“Supervisor Runtime 骨架完成”和“真实业务闭环完成”。最初版本已经有 Supervisor Agent、AgentPlan、Validator、executeAgentPlan、previousResults 和前端看板，但用户通过 POST /api/chat 提问时并没有真正进入 Supervisor 链路；同时 Supervisor 也没有通过模型读取可用 Agent 列表生成 AgentPlan，各业务 Agent 也没有带着前置结果真实调用模型。

后续补齐时，重点把普通聊天主链路接入 Supervisor Agent：用户目标先进入 planAgents，由 Supervisor 模型结合 AgentRegistry 中的可用 Agent 信息生成 AgentPlan，再由 AgentPlan Validator 校验，最后 executeAgentPlan 按 steps 和 dependsOn 串行执行。每个 Agent 使用自己的 systemPrompt 调用模型，并通过 previousResults 把上游输出传给下游 Agent，从而完成真正的 Agent Context Passing。
```

12. 当前系统能力：

```text
当前系统已经从 Day39 的固定多智能体协作链升级为 Day40 的 Supervisor Multi-Agent Runtime。系统注册了 Supervisor Agent、Research Agent、Planner Agent、Critic Agent 和 Writer Agent。用户通过 POST /api/chat 普通提问时，会进入 Supervisor Agent 调度链路：Supervisor 根据用户目标和 AgentRegistry 中的可用 Agent 信息生成 AgentPlan，AgentPlan Validator 校验 selectedAgents、steps.agentId、task、dependsOn 和循环依赖，然后 executeAgentPlan 按计划执行。

执行过程中，系统会记录 Agent Call Graph、Agent Plan Timeline 和 Metrics。后续 Agent 可以通过 previousResults 读取前置 Agent 的真实模型输出，再结合自己的 systemPrompt 继续调用模型。前端右侧 Supervisor Runtime Dashboard 可以展示 Supervisor Decision、Selected Agents、Agent Plan Steps、Agent Call Graph 和 Agent Plan Timeline。系统仍保留原有 useWorkflow 工作流分支，用于旧的 Workflow as Job 链路。
```

---

## 15. 最终结论

Day39 完成的是：

```text
Agent-to-Agent Collaboration（智能体到智能体协作）
```

它让多个 Agent（智能体）能按固定顺序交接任务。

Day40 完成的是：

```text
Supervisor-based Multi-Agent Runtime（基于监督智能体的多智能体运行时）
```

它让系统先判断任务需要哪些 Agent（智能体），再生成计划、校验计划、执行计划，并把前置结果传给下游 Agent。

最重要的一句话：

```text
Day39 是“Agent 会协作”，Day40 是“Supervisor 知道该让哪些 Agent 协作”。
```

---

## 16. 第 40 天补充总结

第 40 天完成的是：

```text
Supervisor-based Multi-Agent Runtime V2（基于监督智能体的多智能体运行时第 2 版）
```

这一天是 `Multi-Agent`（多智能体）阶段的真正分水岭。

因为 Day39 本质上还是固定链路：

```text
Research（研究）
  ↓
Planner（规划）
  ↓
Critic（审查）
  ↓
Writer（写作）
```

而 Day40 开始变成：

```text
User Goal（用户目标）
  ↓
Supervisor（监督智能体）
  ↓
Dynamic Planning（动态规划）
  ↓
AgentPlan（智能体计划）
  ↓
Execution（执行）
```

这代表系统从：

```text
Workflow Thinking（工作流思维）
```

进入：

```text
Agent Orchestration Thinking（智能体编排思维）
```

的重要一步。

### 16.1 当前已经拥有的能力

当前系统已经具备这些能力：

- `Agent Layer`（智能体层）。
- `Agent Registry`（智能体注册表）。
- `Capability Routing`（能力路由）。
- `Agent Context`（智能体上下文）。
- `Agent Runtime`（智能体运行时）。
- `Multi-Agent`（多智能体）。
- `Delegation`（任务委派）。
- `Call Graph`（调用图）。
- `Timeline`（时间线）。
- `Agent Metrics`（智能体指标）。
- `Supervisor`（监督智能体）。
- `AgentPlan`（智能体计划）。
- `AgentPlan Validator`（智能体计划校验器）。
- `Dynamic Agent Selection`（动态智能体选择）。
- `Context Passing`（上下文传递）。
- `Plan Execution`（计划执行）。

这些能力已经非常接近以下框架或产品的第一代架构：

- `CrewAI`（多智能体协作框架）。
- `LangGraph Supervisor`（LangGraph 的监督者式多智能体模式）。
- `OpenAI Deep Research`（OpenAI 深度研究式多步骤智能体系统）。
- `AutoGen`（自动化多智能体协作框架）。

### 16.2 当前进度

如果按照完整 `Agent Engineer`（智能体工程师）路线来看，当前进度可以概括为：

```text
Agent Foundation（智能体基础）            ██████████ 100%
Workflow Runtime（工作流运行时）          ██████████ 100%
Tool Runtime（工具运行时）                ██████████ 100%

RAG Runtime（检索增强生成运行时）          ██████████ 100%
Knowledge Infrastructure（知识基础设施）   █████████░  90%

Queue Runtime（队列运行时）               ██████████ 100%

Execution Platform（执行平台）            ██████████ 100%

Multi-Agent Runtime（多智能体运行时）      ███████░░░  70%

Production Infra（生产级基础设施）         ░░░░░░░░░░   0%
```

整体进度已经来到：

```text
82% ~ 85%
```

---

## 17. 第 41 天学习计划：Multi-Agent Runtime V3（多智能体运行时第 3 版）

第 41 天主题是：

```text
Multi-Agent Runtime V3（多智能体运行时第 3 版）：Agent DAG Planning（智能体有向无环图规划）
```

今日核心目标：

```text
让 Supervisor（监督智能体）不只是生成步骤列表，而是生成 Agent DAG（智能体有向无环图）。
```

这里的 `Agent DAG`（智能体有向无环图）也可以理解为：

```text
Agent Workflow（智能体工作流）
```

### 17.1 为什么必须做这一步

现在的 `AgentPlan`（智能体计划）大致是：

```json
{
  "steps": [
    { "agent": "research" },
    { "agent": "planner" },
    { "agent": "critic" },
    { "agent": "writer" }
  ]
}
```

它本质上仍然偏向：

```text
Linear Execution（线性执行）
```

但真实情况中，有些任务可以并行。

例如：

```text
Research A（研究 A）
Research B（研究 B）
Research C（研究 C）
```

它们完全可以：

```text
Parallel Execution（并行执行）
```

之后再交给：

```text
Writer（写作智能体）
```

统一汇总即可。

所以 `Supervisor`（监督智能体）下一步必须学会：

```text
Dependency Relationship（依赖关系）
```

也就是不仅知道“有哪些步骤”，还要知道：

```text
哪些步骤可以同时执行？
哪些步骤必须等前置步骤完成？
最终输出依赖哪些中间结果？
```

### 17.2 最终效果示例

用户目标：

```text
研究 LangGraph。
总结核心概念。
制定学习路线。
输出最终报告。
```

`Supervisor`（监督智能体）应该生成类似这样的结构：

```text
Research Agent（研究智能体）
    ↓

+------------------+
|                  |
↓                  ↓

Concept Agent（概念智能体）
Roadmap Agent（路线规划智能体）

+------------------+
        ↓

Writer Agent（写作智能体）
```

这意味着：

```text
Concept Agent（概念智能体）和 Roadmap Agent（路线规划智能体）都依赖 Research Agent（研究智能体）。
Concept Agent（概念智能体）和 Roadmap Agent（路线规划智能体）可以并行执行。
Writer Agent（写作智能体）需要等待 Concept Result（概念结果）和 Roadmap Result（路线结果）都完成后再执行。
```

---

## 18. 第 41 天任务拆解

### 18.1 任务 1：升级 AgentPlan（智能体计划）

从简单的：

```ts
steps: []
```

升级为：

```ts
type AgentPlanStep = {
  id: string;
  agentId: string;
  task: string;
  dependsOn?: string[];
};
```

完整结构：

```ts
type AgentPlan = {
  goal: string;
  steps: AgentPlanStep[];
};
```

这里的 `dependsOn`（依赖项）是第 41 天最关键的字段。

### 18.2 任务 2：Supervisor Prompt（监督智能体提示词）升级

要求 `Supervisor`（监督智能体）输出 `DAG`（有向无环图）：

- 允许多个步骤并行。
- 必须使用 `dependsOn`（依赖项）。
- 步骤之间不能出现循环依赖。

示例：

```json
{
  "steps": [
    {
      "id": "research",
      "agentId": "research",
      "task": "研究 LangGraph 的核心背景",
      "dependsOn": []
    },
    {
      "id": "concept",
      "agentId": "writer",
      "task": "总结 LangGraph 核心概念",
      "dependsOn": ["research"]
    },
    {
      "id": "roadmap",
      "agentId": "planner",
      "task": "制定 LangGraph 学习路线",
      "dependsOn": ["research"]
    },
    {
      "id": "writer",
      "agentId": "writer",
      "task": "整合概念总结和学习路线，输出最终报告",
      "dependsOn": ["concept", "roadmap"]
    }
  ]
}
```

### 18.3 任务 3：AgentPlan Validator（智能体计划校验器）升级

新增校验：

#### 检查 1：不存在的依赖

如果 `dependsOn`（依赖项）引用了不存在的 `step`（步骤），要报错。

例如：

```text
step-b dependsOn step-x，但 step-x 不存在。
```

#### 检查 2：循环依赖

如果出现：

```text
A -> B -> A
```

说明 `DAG`（有向无环图）已经变成有环图，必须拒绝执行。

#### 检查 3：孤儿节点

检查 `Orphan Node`（孤儿节点）：

```text
没有入口。
没有出口。
与整体任务没有关系。
```

孤儿节点容易导致计划里出现无意义步骤，或者某些结果永远不会被最终输出使用。

### 18.4 任务 4：实现 Agent DAG Executor（智能体有向无环图执行器）

新增：

```ts
executeAgentDAG()
```

核心逻辑：

```text
找到 runnable nodes（可运行节点）
  ↓
执行这些节点
  ↓
写入结果
  ↓
解锁后续节点
  ↓
直到所有节点完成
```

这里的 `runnable nodes`（可运行节点）指：

```text
所有 dependsOn（依赖项）都已经完成的步骤。
```

### 18.5 任务 5：支持 Parallel Agent Execution（并行智能体执行）

如果：

```text
Concept（概念总结）
Roadmap（路线规划）
```

都依赖：

```text
Research（研究）
```

那么它们可以用：

```ts
Promise.all()
```

并行执行。

这就是 `Parallel Agent Execution`（并行智能体执行）。

### 18.6 任务 6：Agent Result Store（智能体结果存储）

新增：

```ts
Map<stepId, AgentResult>
```

作用是让每个步骤的结果可以按 `stepId`（步骤 ID）保存。

这样：

```text
Writer（写作智能体）
```

可以读取：

```text
Concept Result（概念结果）
Roadmap Result（路线结果）
```

而不是只能拿到上一个线性步骤的结果。

### 18.7 任务 7：Agent Context Merge（智能体上下文合并）

之前是：

```text
单个 previousResult（前置结果）
```

第 41 天要升级为：

```text
多个依赖结果合并
```

例如：

```ts
context.parentResults
```

这里的 `parentResults`（父级结果 / 依赖结果集合）表示当前步骤依赖的所有上游结果。

### 18.8 任务 8：Agent DAG Visualizer（智能体有向无环图可视化器）

新增页面或面板：

```text
Agent DAG（智能体有向无环图）
```

展示类似：

```text
Research（研究）
├── Concept（概念总结）
└── Roadmap（路线规划）
      ↓
Writer（写作）
```

它的目的不是执行，而是帮助观察：

```text
Supervisor（监督智能体）为什么这样安排任务？
哪些步骤并行？
最终结果依赖哪些中间结果？
```

### 18.9 任务 9：Agent DAG Metrics（智能体有向无环图指标）

新增：

```ts
type AgentDAGMetrics = {
  totalSteps: number;
  parallelSteps: number;
  maxDepth: number;
  criticalPathLength: number;
};
```

字段含义：

- `totalSteps`（总步骤数）：计划中一共有多少步骤。
- `parallelSteps`（可并行步骤数）：有多少步骤可以和其他步骤同批执行。
- `maxDepth`（最大深度）：从入口节点到最深节点的层数。
- `criticalPathLength`（关键路径长度）：决定整体执行时长的最长依赖链长度。

### 18.10 任务 10：完整 DAG 测试

需要测试：

#### Case 1（测试用例 1）

```text
Research（研究）
  ↓
Writer（写作）
```

验证基础串行 DAG（有向无环图）执行。

#### Case 2（测试用例 2）

```text
Research（研究）
  ↓
Concept（概念总结）
Roadmap（路线规划）
  ↓
Writer（写作）
```

验证一个上游步骤解锁多个并行步骤，再汇总到最终输出。

#### Case 3（测试用例 3）

```text
ResearchA（研究 A）
ResearchB（研究 B）
ResearchC（研究 C）
  ↓
Writer（写作）
```

验证多个独立研究分支并行执行，再由 Writer（写作智能体）聚合结果。

测试重点：

```text
并行执行成功。
结果正确聚合。
依赖关系正确解锁。
```

---

## 19. 第 41 天验收标准

1. 是否升级 `AgentPlanStep`（智能体计划步骤）。

2. 是否支持 `dependsOn`（依赖项）。

3. `Supervisor`（监督智能体）是否生成 `DAG`（有向无环图）。

4. 是否升级 `AgentPlan Validator`（智能体计划校验器）。

5. 是否实现 `Agent DAG Executor`（智能体有向无环图执行器）。

6. 是否支持 `Parallel Agent Execution`（并行智能体执行）。

7. 是否实现 `Agent Result Store`（智能体结果存储）。

8. 是否实现 `Agent Context Merge`（智能体上下文合并）。

9. 是否实现 `Agent DAG Visualizer`（智能体有向无环图可视化器）。

10. 是否完成 `DAG Test`（有向无环图测试）。

---

## 20. 第 41 天打卡模板

【第41天打卡】

1. 是否升级 AgentPlanStep（智能体计划步骤）：是 / 否

2. 是否支持 dependsOn（依赖项）：是 / 否

3. Supervisor（监督智能体）是否生成 DAG（有向无环图）：是 / 否

4. 是否升级 AgentPlan Validator（智能体计划校验器）：是 / 否

5. 是否实现 Agent DAG Executor（智能体有向无环图执行器）：是 / 否

6. 是否支持 Parallel Agent Execution（并行智能体执行）：是 / 否

7. 是否实现 Agent Result Store（智能体结果存储）：是 / 否

8. 是否实现 Agent Context Merge（智能体上下文合并）：是 / 否

9. 是否实现 Agent DAG Visualizer（智能体有向无环图可视化器）：是 / 否

10. 是否完成 DAG 测试（有向无环图测试）：是 / 否

11. 遇到的最大问题：

```text
待填写。
```

12. 当前系统能力：

```text
待填写。
```

---

## 21. 第 41 天核心认知

记住一句话：

```text
多 Agent（多智能体）的核心不是 Agent（智能体）数量，而是 Agent（智能体）之间的依赖关系。
```

完成第 41 天后，系统将升级成：

```text
Multi-Agent Runtime V3（多智能体运行时第 3 版）：Agent DAG Orchestration（智能体有向无环图编排）
```

这一步完成后，就正式进入这些架构思想：

- `LangGraph`（图式智能体工作流框架）。
- `CrewAI Flow`（CrewAI 的流程式多智能体编排）。
- `AutoGen Graph`（AutoGen 的图式多智能体协作）。
- `OpenAI Deep Research`（OpenAI 深度研究式多步骤智能体系统）。
