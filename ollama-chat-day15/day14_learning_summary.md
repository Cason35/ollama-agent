# 第14天学习总结：Workflow 上下文链与 Step Dependency

本文档对照 `ollama-chat-day13/day13_learning_from_route_and_page.md` 中「第14天学习计划」（Workflow 依赖链、上下文注入、Planner、调试面板、最终合成），结合本目录 **`app/api/chat/route.ts`** 与 **`app/page.tsx`** 的实际实现做归纳，便于复盘与扩展。**文末 §8** 收录 **第15天学习任务预告**（Validation / Auto Repair / Retry / Timeline），与第14天现状对照使用。

---

## 1. 第14天要解决什么问题？

**之前**：多步流程容易变成「各跑各的」—— summary、todo、chat 各自独立执行，后一步不一定吃到前一步的结构化产出。

**目标**：真正的工作流是 **步骤之间存在因果依赖**：

- Step1（如 `summary`）产出结果；
- Step2（如 `todo`）**显式依赖** Step1，并在 prompt 里注入 Step1 的输出；
- 执行顺序尊重依赖关系（拓扑序），而不是简单平行罗列工具调用。

这与学习文档中的示例一致：先总结学习内容，再基于总结生成明天待办。

---

## 2. 任务对照：文档要求 ↔ 代码实现

### 任务 1：Step Output Context（`dependsOn` + `output`）

**文档要求**：`WorkflowStep` 增加 `dependsOn?: string[]`、`output?: unknown`，用稳定 `id` 串联步骤。

**实现要点**（`route.ts`）：

- `WorkflowStep` 包含 `id`、`dependsOn`、`status`、`output`、`durationMs`，以及用于可观测性的 `injectedContextPreview`。
- Planner 解析与收尾：`parsePlannerPlanOutput` 读取 `dependsOn`；`finalizePlannerPlanItems` 为缺省 id 分配 `step-1`…并 **过滤掉指向不存在步骤的依赖 id**，避免脏引用。

前端 `page.tsx` 中的 `WorkflowStep` 类型与后端对齐，保证 JSON 响应可直接渲染。

---

### 任务 2：Context Injection（依赖输出注入 Executor）

**文档要求**：从「只传 `step.input`」升级为「聚合依赖步骤的输出 → 注入下游工具」；待办场景示例为「【依赖步骤结果】+【当前任务】」。

**实现要点**（`route.ts`）：

- `formatDependencyOutputsForStep(step, byId)`：按 `dependsOn` 收集 **已成功** 的前序步骤输出，格式化为可读的注入文本。
- `executeWorkflow` 中：
  - 有显式 `dependsOn` 时：`injectedContextPreview` 使用依赖聚合文本；`todo` 走 `generateTodosWithModel` 的 **`dependencyContext`** 分支，prompt 结构与学习文档一致（依赖块 + 当前任务 + 记忆块）。
  - **无** `dependsOn` 时：使用 **`linearPriorOutputs`** 作为线性兜底——按拓扑执行顺序把前面步骤输出串起来，仍能向后传递上下文（Planner 偶尔漏写依赖时的容错）。
- `summary` 步骤同样区分：显式依赖时用依赖输出；否则可用线性前缀。

---

### 任务 3：Planner 学会依赖关系

**文档要求**：Planner 产出 JSON 数组，步骤含 `id`、`action`，且后续步骤在需要前序产出时填写 `dependsOn: ["step-1"]` 等形式。

**实现要点**（`route.ts`）：

- `planWorkflowSteps` 的系统提示明确要求：`id` 稳定唯一、`input` 为字符串，以及 **「若某步需要直接使用前面某步产出则写 dependsOn」**，并给出 summary → todo 的示例。
- `topologicalSortWorkflowSteps`：按 DAG **拓扑排序**执行顺序；检测到环会告警并尽量不落死循环。

---

### 任务 4：Workflow Chain Debug 面板

**文档要求**：前端能看到 dependency、上下文传递、链式执行。

**实现要点**（`page.tsx`）：

- 勾选 **「多步 Workflow」** 后，请求体携带 `useWorkflow: true`，后端返回 `type: "workflow"`。
- Workflow 卡片内每一步展示：`id`、`action`、状态图标、耗时、`dependsOn` 列表（含被引用步骤名称）、可展开的 **「注入上下文预览」**、`输出摘录`，以及 **「↓ 被后继步骤用作依赖」**（通过 `findDownstreamSteps` 反查谁会依赖当前步）。
- 底部 **「最终结果」** 展示服务端合成后的 `finalSummary`（见任务 5）。

---

### 任务 5：Workflow Final Synthesizer

**文档要求**：`synthesizeWorkflowResult(workflow)` 把各步产出汇总成 **一篇自然、完整的最终回答**，而不是机械地分段「step1 / step2」。

**实现要点**（`route.ts`）：

- `synthesizeWorkflowResult`：先拓扑排序，再把成功步骤的产出拼成结构化草稿行，再用模型提示词要求 **连贯中文答复、避免「第一步/第二步」式标题**；失败时回退到拼接文本或固定提示。
- `POST` 在 workflow 整体 `success` 时调用该函数，响应字段 **`finalSummary`** 供前端主展示；失败则返回中断说明字符串。

---

## 3. 端到端数据流（便于脑图记忆）

1. 前端：`useWorkflow === true` → `POST /api/chat`。
2. `planWorkflowSteps`：模型 → JSON 步骤数组（含 `dependsOn`）→ `finalizePlannerPlanItems`。
3. `executeWorkflow`：拓扑序逐步执行 → 写 `output` / `status` / `injectedContextPreview` → 更新 `linearPriorOutputs`。
4. `synthesizeWorkflowResult`：汇总成功步骤 → 生成 **`finalSummary`**。
5. 前端：Workflow 卡片展示步骤链 + 调试信息 + **最终结果**正文。

---

## 4. 口述理解与补充（学习者复盘 × 实现核对）

下面把学习者的口头总结与实现层补充写在一起，便于以后快速对照代码（`route.ts` 中 `executeWorkflow` 等）。

### 4.1 学习者口述的主线（正确）

开启 **`useWorkflow`** 后：

1. **`planWorkflowSteps`**：把用户这句话拆成多步任务；各步用 **`dependsOn`** 标明「依赖哪几步的产出」。  
2. **`executeWorkflow`**：真正执行每一步。  
3. **`topologicalSortWorkflowSteps`**：在 **DAG** 上排出执行顺序（谁先谁后），相对第 13 天「按数组下标顺序 `for`」是核心升级。  
4. **依赖结果注入再调模型**：上游已成功步骤的输出经 **`formatDependencyOutputsForStep`** 聚成字符串；在 `executeWorkflow` 里对应局部变量 **`depTextRaw`**（仅来自显式 **`dependsOn`**）。后续步骤（如 `todo` / `summary` / `chat`）把这段（或与之等价的 prompt 结构）塞进当前步的模型调用，使「本步」在 **依赖步骤结果** 的基础上继续生成。  
5. **`synthesizeWorkflowResult`**：把各成功步骤的产出再交给模型，生成面向用户的 **`finalSummary`**（连贯的一篇答复，而不是机械列 step1/step2）。  
6. **响应**：带上本次处理后的 **`memory`** 回前端，与整体聊天闭环一致。

### 4.2 实现层补充（建议与 4.1 一起记）

- **`depTextRaw` 的适用范围**：它表示 **「显式写了 `dependsOn` 时」** 从已成功依赖步聚合来的文本。若 Planner **漏写** `dependsOn`，执行器仍可用 **`linearPriorOutputs`**（按拓扑序已执行完的前面步骤输出串）做 **线性兜底**，避免后一步完全「各跑各的」。  
- **`synthesizeWorkflowResult` 的措辞**：口语说「润色」可以，更准确是 **汇总 / 合成**——先拼结构化草稿，再要求模型输出自然中文，并约束少用「第一步/第二步」式标题。  
- **与第 13 天对比**：第 13 天强调 **顺序执行 + `priorOutputText` 链**；第 14 天在此基础上增加 **显式依赖 + 拓扑序 + 依赖注入 + 合成器**，并把漏依赖时的线性前缀作为容错。

---

## 5. 第14天核心认知（与学习文档一致）

1. **Workflow ≠ 多工具循环**：关键是 **步骤间因果依赖** 与 **上下文传递**。
2. **Context Passing**：进入「最小 Agent Runtime」—— Planner 拆步、Executor 按依赖注入上下文、最后再合成面向用户的答复。
3. **Planner 职责扩展**：不仅要拆步骤，还要在需要时建立 **`dependsOn`**；执行器则用拓扑序与注入逻辑保证语义闭环。

---

## 6. 自检打卡（学习计划模板 + **本仓库已回填**）

模板原文见 `ollama-chat-day13/day13_learning_from_route_and_page.md`（【第14天打卡】）；下列为对照 **`ollama-chat-day14`** 当前实现的 **已打卡** 复盘（第 8、9 项为简述，可自行改写）。

【第14天打卡】（已填写）

1. 是否实现 step `dependsOn`：**是**（`WorkflowStep.dependsOn`；`finalizePlannerPlanItems` 过滤非法 id）  
2. 是否实现 dependency output 注入：**是**（`formatDependencyOutputsForStep` → 各 action 分支；`injectedContextPreview` 可观测）  
3. `todo` 是否能使用 `summary` 输出：**是**（`generateTodosWithModel` 的 `dependencyContext` +「【依赖步骤结果】」类 prompt）  
4. Workflow 是否真正形成链式执行：**是**（`topologicalSortWorkflowSteps` 拓扑序执行；依赖步产出写入后再跑下游）  
5. Planner 是否能生成 `dependsOn`：**是**（依赖 `planWorkflowSteps` 提示；模型偶发漏写时可按 **`day14_manual_test_cases.md`** 记为弱通过并重试）  
6. 是否实现 workflow synthesize：**是**（`synthesizeWorkflowResult` → 响应 **`finalSummary`**）  
7. 前端是否展示 dependency chain：**是**（`dependsOn` 展示、注入上下文预览、后继步骤反查、`finalSummary`）  
8. 遇到的最大问题：**Planner / JSON 输出的随机性与 `dependsOn` 漏写**；单靠提示无法 100% 保证结构稳定，因此在执行侧保留 **`linearPriorOutputs` 线性兜底** 与解析容错，并用 **`day14_manual_test_cases.md`** 做主观验收口径。  
9. 当前系统能力：**最小 Agent Runtime 闭环**——显式 DAG 依赖 + 拓扑执行 + 依赖上下文注入（及线性容错）+ 最终合成答复 + Memory 随响应回写前端；与工作流并列仍保留 Day12/Day13 **单步路由**模式（关闭「多步 Workflow」时）。

---

## 7. 相关文件索引

| 文件 | 作用 |
|------|------|
| `app/api/chat/route.ts` | `WorkflowStep` / `Workflow`、`planWorkflowSteps`、`topologicalSortWorkflowSteps`、`formatDependencyOutputsForStep`、`executeWorkflow`、`synthesizeWorkflowResult`、workflow 分支 `POST` |
| `app/page.tsx` | Workflow 开关、`workflow` 气泡 UI、依赖链调试展示、`finalSummary` |
| `ollama-chat-day13/day13_learning_from_route_and_page.md` | 第14天任务原文（学习目标与打卡模板） |

做完第14天后，你便具备 **依赖 DAG + 上下文注入 + 最终合成** 的最小运行时闭环，可在此基础上继续扩展：并行分支、重试、人在回路（HITL）、RAG 工作流、工具图等。

---

## 8. 第15天学习任务（预告）：Workflow Validation + Auto Repair

**定位**：在「能跑通 Workflow」之上，让 Runtime 具备 **自检（Validator）**、**自动修复（Repair）**、**失败重试（Retry）** 与 **可观测时间线（Timeline）**，把系统从「赌 Planner 一次就对」升级为 **可校验、可修复、可恢复** 的 **Agent Runtime 工程化**一层（可类比给 Runtime 加「编译器 / 静态检查」层）。

**当前主要隐患（第14天仍部分依赖 Planner 一次成功）**

LLM 产出的计划可能：**漏 `action`**、**漏 `dependsOn`**、`output` / 结构类型不稳、**依赖指向不存在的 `id`**、**循环依赖**、`action` 拼写漂移等。单靠 prompt 无法根本消除，需要在 **执行前与执行中** 用代码约束与补救。

---

### 8.1 任务 1：实现 `validateWorkflow(workflow)`

**目标**：在 **执行前** 判定 Workflow 是否 **合法**；非法则 **拒绝执行**，并返回 **可定位的错误说明**（便于日志与用户提示）。

**新增**：`validateWorkflow(workflow)`

**建议必查项**

| 检查项 | 说明 |
|--------|------|
| `step.id` 是否唯一 | 例如用 `Set` 收集 id，发现重复即报错 |
| `dependsOn` 引用是否存在 | 如 `dependsOn: ["step999"]` 但无该 id → 非法 |
| `action` 是否在白名单内 | 仅允许：`"chat"`、`"summary"`、`"todo"`、`"weather"`（与现有 Executor 对齐） |
| 是否存在 **循环依赖** | 如 `step1 → step2`、`step2 → step1` 必须检出 |

**验收**

- 非法 workflow **不会进入执行**（或进入即短路失败并带原因）。  
- 能输出 **分条、具体的** 校验错误信息。

---

### 8.2 任务 2：实现 `repairWorkflow(workflow)`（Auto Repair）

**目标**：校验失败时 **尽量不单刀直报**；在规则允许范围内 **自动改写** Planner 输出，再交给 `validateWorkflow` 或直接进入执行。

**新增**：`repairWorkflow(workflow)`

**思路**

- **能修则修**，修不动再失败。  
- **示例 1（缺 `dependsOn`）**  
  - 用户意图：先总结再生成 todo。  
  - Planner 给出两步 `summary` → `todo` 但未写依赖。  
  - Repair：为 `todo` 步 **补** `dependsOn: ["<summary 步骤的 id>"]`（需与用户意图 / 步骤顺序策略一致）。  
- **示例 2（`action` 拼错）**  
  - Planner：`"summarize"` → 映射为 **`"summary"`**  
  - 同理可建别名表：`todos` → `todo` 等。

**Repair 优先级**：别名归一 → 缺失依赖启发式补齐（按规则谨慎）→ 无法归类则交由 validator 报错。

**验收**

- 常见 Planner **漂移** 可 **无需人工** 恢复为可执行计划。  
- Workflow **整体成功率**相对仅校验不修复时有 **明显提升**（可用统计或手动回归用例衡量）。

---

### 8.3 任务 3：拓扑排序与 DAG 执行顺序（强化）

**目标**：保证执行顺序 **严格来自依赖图**，而不是「Planner 返回数组的下标顺序」。

**新增 / 明确**：`topologicalSort(workflow.steps)`（名称可与现有实现统一）

**示例**

- 输入关系：`step3` dependsOn `step2`，`step2` dependsOn `step1`  
- 输出执行序：`step1` → `step2` → `step3`

**与第14天现状的关系**：第14天已在 `route.ts` 中使用 **`topologicalSortWorkflowSteps`**。第15天建议将拓扑排序 **与 Validator / Repair 置于同一套「Runtime 管道」**：**校验 →（可选）修复 → 再校验 → 拓扑序执行**，并在文档与单测中明确 **禁止** 在未排序情况下按原始数组盲跑。

**后续扩展意义**：规范的 DAG 执行序是 **并行步骤**、**分支 Workflow**、**条件分支** 的基础。

---

### 8.4 任务 4：Workflow Retry（步骤级重试）

**目标**：单步 **偶发失败**（解析、超时、模型抖动）时，**不立即** 将整个 workflow 标记为终结失败；在步骤上支持 **有限次重试**。

**约定示例**

- 步骤级配置：`retry: 2`（或全局默认 + 按 action 覆盖）。  
- 执行伪代码：`executeStep` 内 `for` 循环尝试，成功即返回；用尽次数再抛错或标记该步失败。

**典型场景**：JSON 解析失败、HTTP / 模型 API 超时、输出格式漂移。

**验收**

- 偶发失败 **有机会** 在重试后成功，整条 workflow **不无谓中断**。  
- 服务端有 **清晰的重试日志**（第几次、错误摘要）。

---

### 8.5 任务 5：Workflow Execution Timeline（前端 / 日志）

**目标**：展示 **带时间戳** 的执行轨迹，接近 **Runtime Trace** 体验（与 LangSmith、OpenAI Tracing、AgentOps 等产品的思想一致：先看时间线再排错）。

**前端示例形态（文字即可）**

```text
09:10:01  Step1 started
09:10:03  Step1 success
09:10:03  Step2 started
09:10:05  Step2 retry #1
09:10:07  Step2 success
```

**价值**：第一次系统化看到 **谁何时开始 / 成功 / 重试 / 失败**，便于调 Planner、Executor 与网络。

---

### 8.6 第15天核心认知

1. **Runtime 与 Prompt 分工**：高可靠 Agent 往往 **Runtime 结构**（校验、修复、排序、重试、观测）比 **单条 Prompt** 更决定上限。  
2. **Planner 必然会漂移**：因此需要 **validate → repair → retry → fallback** 组合，而不是假设一次 JSON 永远合法。  
3. **DAG Runtime 是进阶 Agent 的核心**：有序、可依赖、可扩展的执行模型，是并行、条件、HITL、RAG 多步编排的前提。

---

### 8.7 第15天打卡模板（未完成前可为空）

【第15天打卡】

1. 是否实现 workflow validator：是 / 否  
2. 是否检测 dependsOn 不存在：是 / 否  
3. 是否检测循环依赖：是 / 否  
4. 是否实现 auto repair：是 / 否  
5. 是否能自动修复 action 漂移：是 / 否  
6. 是否实现 topological sort：是 / 否  
7. Workflow 是否按 DAG 顺序执行：是 / 否  
8. 是否实现 retry：是 / 否  
9. 前端是否展示 execution timeline：是 / 否  
10. 遇到的最大问题：  
11. 当前系统能力：

---

### 8.8 做完第15天后的预期位置

你将更接近一个可称为 **「Agent Runtime V1」** 的实现：**可校验、可修复、有序执行、可重试、可追踪**。在此基础上，**并行 Workflow**、**条件分支**、**HITL（人在回路）**、**RAG Workflow**、**Multi-Agent** 等主题才有稳定的落地基础。
