# 第13天学习总结（基于 `route.ts` + `page.tsx`）

> **承接第12天**：在「记忆参与路由 + 单步工具」基础上，将复杂需求拆成多步并顺序执行，过程可观测。

## 今日目标回顾

第13天的核心是 **Workflow Agent**：把系统从 **「一次路由 → 一个 action」** 升级为 **「Planner 拆步 → Executor 顺序执行 → 汇总答复」**，并继续复用第12天已有的 **Memory（`shortTerm` + `items`）**、天气 / 总结 / 待办等能力。  
后端增加工作流类型、`planWorkflowSteps` / `executeWorkflow` / `summarizeWorkflowResult` 与专用日志；前端通过 **`useWorkflow`** 开关走独立分支，并用 **工作流卡片** 展示每步状态、`action`、耗时与最终总结。

## 你今天完成了什么

### 1) 工作流数据结构（与 API 联合类型对齐）

- 在 `app/api/chat/route.ts` 与 `app/page.tsx` 中约定一致形状：
  - `WorkflowStep`：`id`、`name`、`action`（`chat` | `summary` | `todo` | `weather`）、`input`、`status`、`output?`、`error?`、`durationMs?`
  - `Workflow`：`id`、`goal`、`steps[]`、`status`
- 响应体扩展为联合类型之一：`{ type: "workflow"; workflow; finalSummary; memory }`，与既有 `chat` / `weather` / `summary` / `todo` 并列。

### 2) Planner：把用户目标拆成 1～4 步 JSON

- `planWorkflowSteps(userInput, memory, rt)`：专用提示词要求 **只输出 JSON 数组**，每项含 `name`、`action`、`input`；复杂需求 2～4 步，简单需求可单步。
- **记忆注入**：`formatMemoryForPlanner(memory)` 将长期 **items**（非旧版单一 `longTerm` 字段名）格式化为 Planner 可读文本，便于结合身份与目标拆步。
- **解析与容错**：`parsePlannerPlanOutput` 支持整段解析失败时抽取 `[...]` 子串重试；模型失败或解析为空时 **单步 `chat` 兜底**。
- **input 规范化**：`normalizePlannerStepInput` 处理 Planner 把 `input` 写成对象的情况（优先 `city` / `keyword` 等键），避免下游出现 `"[object Object]"` 污染天气等分支。

### 3) Executor：顺序执行并串联前置输出

- `executeWorkflow(workflow, memory, rt)`：逐步将 `status` 置为 `running` → 成功则 `success` 并写入 `output` 与 `durationMs`；任一步抛错则 `failed`、记录 `error` 并 **中断后续步骤**。
- **工具复用**：`summary` → `summarizeWithModel(..., priorOutputText)`；`todo` → `generateTodosWithModel(..., chainPrefix)`；`weather` → `realWeather` + 城市抽取；默认 `chat` → `runWorkflowChat`（system 中带记忆，`user` 中可含「前置步骤输出」）。
- **链式上下文**：维护 `priorOutputText`，把已完成步骤的输出拼给后续 summary / todo / chat，使多步任务有因果衔接。

### 4) 最终汇总与用户可见文案

- 成功路径：`summarizeWorkflowResult(goal, workflow, rt)` 仅聚合 **status === "success"** 的步骤产出，再调模型生成 **一段简洁中文答复**（无 JSON）；失败则不上汇总模型，而是用 **首错信息** 拼 `finalSummary`。
- 与仅返回最后一步裸输出相比，用户拿到的是 **「过程已执行 + 结论重整」** 的一层体验。

### 5) 可观测性：Workflow 日志与耗时

- `logWorkflow("start" | "step" | "done" | "error", payload)`：**结构化阶段日志**。
- `console.log("[Workflow] start:", goal)`、`console.log("[Workflow] output:", step.output)` 与收尾 `logWorkflow("done", { durationMs, steps: [...] })`：**目标、每步 action、耗时、总耗时** 可对齐服务端控制台排查。
- `logAgent("result", { action: "workflow", ... })` 与单次路由链路统一，便于和 Day12 的 Agent 日志习惯衔接。

### 6) POST 契约：可选工作流分支 + 模型运行时

- 请求体增加 **`useWorkflow?: boolean`**；为 `true` 时 **`buildMemory` 之后直接进入工作流**，不再走当次请求的 action 路由分支。
- 保留 **`provider`（`local` | `mimo`）与 `mimoModel`**：Planner、Executor、汇总均通过 `invokeChatModel(rt, ...)` 统一走本地 Ollama 或小米 MiMo（密钥仅服务端环境变量）。

### 7) 前端：`page.tsx` 闭环与过程展示

- **`useWorkflow` 开关**：勾选「多步 Workflow」后 POST 携带 `useWorkflow: true`；顶栏徽标提示当前模式。
- **`ChatApiResult` / `AssistantBubble`** 增加 `workflow` 变体；`apiToAssistant` 映射为工作流卡片。
- **工作流卡片 UI**：标题区 `Workflow · {goal}`；步骤列表展示 **状态图标**（成功 / 失败 / 运行中 / 未开始）、**`action` 徽章**、**`durationMs`**、失败时的 **内联 `error`**；底部 **「最终结果」** 展示 `finalSummary`。
- **历史扁化**：workflow 气泡记入下一轮 `messages` 时用 `【Workflow】${goal}\n${finalSummary}`，避免把整段 JSON 塞进对话历史。
- 延续 Day12：`requestAnimationFrame` 合并气泡、`memory` 回写与侧栏 **items 重要性样式** 等。

## 工程能力上的收获

### Agent 设计认知

- **Tool 是单步能力，Workflow 是多步编排**：同一套 summary / todo / weather / chat，在 Executor 里按序调用即形成「小代理」。
- **Planner 与路由解耦**：工作流开启时不再依赖单次 JSON 路由，避免「既要多步又塞在一个 action 里」的扭曲；关闭工作流时仍走 Day12 路由链。
- **步骤间需要显式传递上下文**：`priorOutputText`（及 summary/todo 的 chain 参数）是简单可行的 **DAG 以外线性链** 实现，复杂场景可再演化为依赖图。

### 稳定性与可观测性

- Planner **只产出 JSON 数组** 仍可能漂移，故需要 **数组抽取、单步兜底、input 对象规范化** 三层防守。
- **每步 `durationMs` + `logWorkflow`** 让「慢在哪一步」可定位，与前端徽章形成 **体感 ↔ 日志** 对照。

### 类型与产品形态

- 前后端 **`Workflow` / `WorkflowStep` 对齐**，减少联调歧义；响应联合类型让 UI 用 `type` 一次性分流。

## 第13天打卡（结合你当前实现）

1. 是否实现 Workflow 数据结构：是  
2. 是否实现 Planner：是（`planWorkflowSteps` + 记忆注入）  
3. Planner 是否能输出步骤 JSON：是（含解析失败时的单步兜底）  
4. 是否实现 Executor：是（`executeWorkflow`，失败中断）  
5. 是否能按顺序执行多个 step：是  
6. 是否复用已有 summary / todo / weather / chat：是  
7. 前端是否能展示 Workflow 步骤状态：是（含 `action`、耗时、错误文案）  
8. 是否增加 Workflow 日志与耗时统计：是（`logWorkflow` + 单步/总 `durationMs`）  
9. 遇到的最大问题：Planner 输出 JSON 与 `input` 类型不稳定时，需要 **解析容错 + `normalizePlannerStepInput`** 与执行期 **链式上下文** 配合  
10. 当前系统能力：**双模式**（单步路由 vs 多步工作流）+ Memory 闭环 + **过程可视化** + 本地/MiMo 双后端  

## 一句话结论

第13天你已经把 Agent 从「单次决策执行」推进到 **「规划多步 → 顺序执行 → 汇总输出」**，并在 **同一路由与记忆体系** 下用 UI 与日志把工作流 **全过程摊开可见**。

---

## 下一关（可选方向）

- **并行步骤 / 条件分支**：在纯线性 `for` 之上引入依赖或简单分支（例如仅当某步成功才跑某步）。  
- **流式 UI**：Server-Sent Events 或流式接口逐步推送 `step.status`，避免长工作流期间界面长时间静止。  
- **人机协同**：某步失败时允许用户改 `input` 或跳过并继续，而不是整单失败。

---

## 第14天学习计划：Workflow 上下文链 + Step Dependency（关键）

### 第14天核心目标

让 Workflow 的步骤之间真正「互相依赖」。

现在你的 Workflow 很可能还是：

- Step1 独立执行
- Step2 独立执行
- Step3 独立执行

但真实 Workflow 是：

- Step2 依赖 Step1 输出
- Step3 依赖 Step2 输出

#### 第14天你最终要做出的效果

**用户输入：**

> 帮我总结今天学习内容，然后生成明天待办

**系统：**

- **Step1:** `summary` → 输出总结
- **Step2:** `todo` → 使用 summary 的结果生成待办

👉 这才是真正 Workflow。

### 任务1：实现 Step Output Context

**目标：** 后面的 step 能读取前面的结果。

**新增字段：**

```ts
type WorkflowStep = {
  id: string
  name: string
  action: string
  input: string

  dependsOn?: string[]

  output?: unknown
}
```

**示例：**

```json
[
  {
    "id": "step1",
    "action": "summary"
  },
  {
    "id": "step2",
    "action": "todo",
    "dependsOn": ["step1"]
  }
]
```

### 任务2：实现 Context Injection（核心）

**Executor 升级**

- 现在：`runTodo(step.input)`
- 升级成：

```ts
const dependencyOutputs = getDependencyOutputs(step)

runTodo({
  input: step.input,
  context: dependencyOutputs
})
```

**示例 Prompt：**

```
请基于以下内容生成 todo：

【依赖步骤结果】
${context}

【当前任务】
${input}
```

**效果：** `todo` 不再「瞎生成」，而是基于 `summary` 结果继续工作。

### 任务3：Planner 学会「依赖关系」

**之前** Planner 只拆步骤：

```json
[
  { "action": "summary" },
  { "action": "todo" }
]
```

**现在要学会：**

```json
[
  {
    "id": "step1",
    "action": "summary"
  },
  {
    "id": "step2",
    "action": "todo",
    "dependsOn": ["step1"]
  }
]
```

**Planner Prompt 升级：** 如果后续步骤需要前面步骤结果，请使用 `dependsOn`。例如：`summary` → `todo`，则 `todo` 的 `dependsOn` 指向 `summary` 所在步骤 id。

### 任务4：Workflow Chain Debug 面板

**前端展示：**

- Step1 ✅ — 输出：……  
  ↓ 被 Step2 使用  
- Step2 ✅ — 输入上下文：……

**验收标准：**

- 能看到 `dependency`
- 能看到上下文传递
- 能看到链式执行

### 任务5：实现 Workflow Final Synthesizer（重要）

现在你的 workflow 可能只是：`step1 output`、`step2 output`、`step3 output` 分段展示。

但真实 Agent 最后会 **汇总**。

**新增：** `synthesizeWorkflowResult(workflow)`

**Prompt：**

```
请把以下 workflow 结果整理成最终回答：

${allStepOutputs}
```

**最终效果：** 用户不会看到 `step1:` / `step2:` / `step3:` 分段罗列，而是 **一个自然、完整的最终回答**。

### 第14天核心认知（非常重要）

1. **Workflow ≠ 多工具循环**  
   真正 Workflow 是「步骤之间存在因果依赖」。

2. **Context Passing 是 Agent 核心**  
   这一步开始，你真正进入 **Agent Runtime**。

3. **Planner 不只是「拆步骤」**  
   还必须：建 `dependency`、管上下文、控制执行顺序。

### 第14天打卡模板

【第14天打卡】

1. 是否实现 step `dependsOn`：是 / 否  
2. 是否实现 dependency output 注入：是 / 否  
3. `todo` 是否能使用 `summary` 输出：是 / 否  
4. Workflow 是否真正形成链式执行：是 / 否  
5. Planner 是否能生成 `dependsOn`：是 / 否  
6. 是否实现 workflow synthesize：是 / 否  
7. 前端是否展示 dependency chain：是 / 否  
8. 遇到的最大问题：  
9. 当前系统能力：

### 做完第14天后会发生什么？

你会真正拥有 **一个「最小 Agent Runtime」**，然后可以进入：

- 并行 Workflow  
- Retry  
- HITL  
- RAG Workflow  
- Tool Graph  

这些就是真正高级 Agent 的核心了。
