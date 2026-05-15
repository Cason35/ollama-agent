# 第16天学习总结：Parallel Workflow + DAG Runtime

本文档对照 `ollama-chat-day15/day15_learning_summary.md` §12 的学习目标，结合本仓库 **`ollama-chat-day16`** 中 `app/api/chat/route.ts` 与 `app/page.tsx` 的实际实现，归纳第16天「学了什么、系统多了什么能力」。

---

## 1. 第16天在解决什么问题

**第15天及以前**：工作流步骤多为「Planner 数组顺序」下的串行心智，执行侧也容易退化成「一条链挨个跑」——多工具场景偏慢，且难以表达「无依赖可同时进行」的真实结构。

**第16天核心**：把 Runtime 从「单链串行」推进为 **DAG 调度语义**——在 **`dependsOn` 约束满足** 的前提下 **按层分批**，**层内用 `Promise.all` 并行**，并补齐 **步骤状态机、失败沿依赖向下游传播、批次可观测性（Batches）与前端图/时间线展示**。

一句话：**Workflow Runtime 的本质更接近「拓扑分层 + 层内并行」的调度器，而不是单纯的 `for` 循环。**

---

## 2. 学习计划（§12）与实现映射

| §12 任务要点 | 本仓库实现要点 | 主要位置 |
|--------------|----------------|----------|
| **可并行节点检测** `getRunnableSteps()` | 扫描 `status === "pending"` 且所有 `dependsOn` 对应步骤均为 `success` 的步骤；结果按拓扑稳定序排序，保证日志/UI 顺序确定 | `route.ts`：`getRunnableSteps` |
| **Parallel Executor** | 主循环每轮取一批 `runnable`，`await Promise.all(runnable.map(...))` 层内并行 | `route.ts`：`executeWorkflow` |
| **步骤状态机扩展** | `pending` → `queued` → `running` → `success` / `failed`，以及 **`blocked`** | `route.ts`：`WorkflowStepStatus`；入批前写 `queued` |
| **失败传播** | `hasFailedDependency`、`propagateBlockedSteps`（不动点迭代）；工作流全局失败后 `sweepPendingToBlockedWhenWorkflowFailed` 扫尾，避免 UI 长期悬挂 `pending` | `route.ts` |
| **Workflow 图可视化** | 前端用 **`dependsOn` 邻接列表** 展示「节点 ← 依赖」；步骤卡片上展示 `dependsOn`、后继引用提示 | `page.tsx`：Workflow 卡片内「Workflow DAG（dependsOn）」区块 |
| **Execution Batch Timeline** | 后端 `workflow.executionBatches`（`batchIndex`、`stepIds`、`ts`）；前端 **Batch #n + 时间 + 同批并行步骤** | `route.ts`：`WorkflowExecutionBatch`；`page.tsx`：Batch Timeline 列表 |
| **第15天能力延续** | 校验 / 修复 / 拓扑预览、步骤级 retry、`executionTimeline` 等仍保留，与并行调度叠加 | `route.ts`、`page.tsx` |

更细的验收用例与手动测试步骤见同目录 **`day16_manual_test_cases.md`**。

---

## 3. 核心概念（结合代码行为理解）

### 3.1 Runnable 集合 = 「当前层的待执行入度为 0 的变体」

在动态执行过程中，**只有仍为 `pending` 且依赖已全部 `success` 的步骤** 才能进入本批 `runnable`。这与静态 DAG 里「入度为 0」的思想一致，只是依赖完成条件用 **运行时状态** 表达，而不是一次性算完静态层序。

### 3.2 并行边界：`Promise.all` 一批、再合并线性链上下文

同批步骤并行时，执行器会 **冻结本批开始前的「线性前置输出」快照**，避免同批之间互相读写污染；批次结束后将 **本批成功步骤的输出** 按拓扑序合并进线性链，继续服务「Planner 漏写 `dependsOn`」时的容错上下文（与第15天设计衔接）。

### 3.3 为什么需要 `queued` 与 `blocked`

- **`queued`**：已被调度器选中进入本批，语义上介于「仍排队」与「正在跑」之间，便于 Timeline 对齐 **批次边界** 与 UI 符号区分。
- **`blocked`**：任一依赖 **`failed` / `blocked`**，或工作流已失败、或调度出现「仍有 `pending` 但本轮无 `runnable`」等异常短路时，下游不应再假装可执行——这是 **Runtime Failure Model** 的外显，避免「上游已挂、下游仍跑」的假成功。

### 3.4 可观测性：Timeline vs Batches

- **`executionTimeline`**：偏事件流/trace（校验、repair、每步 queued/running/retry 等）。
- **`executionBatches`**：偏 **调度器视角**，一眼看出 **第几批、同批并行哪些 step**，对应 §12.9 的「Batch Timeline」。

---

## 4. 前端（`page.tsx`）与类型对齐

- 与后端对齐 **`WorkflowStep.status`**（含 `queued` / `blocked`）、**`WorkflowExecutionBatch`**、**`workflow.executionBatches`**。
- **`workflowStepStatusGlyph`**：用符号区分 `queued`（▷）、`blocked`（⛔）等，让并行调度下的状态 **一眼可读**。
- Workflow 卡片内三块与第16天强相关：**步骤列表（依赖/后继/注入上下文）**、**DAG 邻接列表**、**Batch Timeline**（无批次数据时自动隐藏）。

---

## 5. 第16天打卡（对照 §12.11，按当前实现填写）

1. 是否实现 runnable step 检测：**是**（`getRunnableSteps`）  
2. 是否实现 Parallel Executor：**是**（`executeWorkflow` 主循环分批）  
3. 是否实现 `Promise.all` 并行执行：**是**  
4. 是否实现 Step State Machine：**是**（扩展 `WorkflowStepStatus`）  
5. 是否新增 `blocked` / `queued` 状态：**是**  
6. 是否实现 failure propagation：**是**（`propagateBlockedSteps`、失败依赖判断、全局失败扫尾）  
7. 前端是否展示 DAG 结构：**是**（基于 `dependsOn` 的邻接/边列表；非 React Flow 级图形编辑器）  
8. 是否展示 batch timeline：**是**（`executionBatches`）  
9. 遇到的最大问题：（个人实验记录，例如：Planner 依赖边不完整时需依赖线性链兜底；并行下上下文快照与合并顺序需仔细对齐等——请按自己调试经历填写）  
10. 当前系统能力：**Parallel DAG Runtime V1**——分层调度、层内并行、失败传播、批次与步骤状态可观测，并保留第15天校验/修复/retry/Timeline。

---

## 6. 做完第16天后的位置与下一方向（对照 §13）

- **当前位置**：已具备 **「并行 DAG Runtime」** 的关键分水岭能力；Runtime 更接近 **Workflow Engine** 而非纯任务链脚本。
- **下一方向（第17天）**：**条件分支（Conditional Branch / Conditional DAG）**——在 `dependsOn` 与并行批次之上，让步骤按前驱输出**选择路径**；详细学习计划见下文 **§8**。
- **更远的方向**：**Human-in-the-loop**、**Tool Memory**、**RAG Workflow**、**Multi-Agent** 等。

---

## 7. 相关文件索引

| 文件 | 说明 |
|------|------|
| `ollama-chat-day16/app/api/chat/route.ts` | 并行 DAG 调度、`getRunnableSteps`、`executeWorkflow`、`executionBatches`、失败传播 |
| `ollama-chat-day16/app/page.tsx` | Workflow UI、DAG 列表、Batch Timeline、状态符号 |
| `ollama-chat-day16/day16_manual_test_cases.md` | 手动测试与学习目标验收表 |
| `ollama-chat-day15/day15_learning_summary.md` §12 | 第16天原始学习计划与打卡模板 |

---

## 8. 第17天学习计划：Conditional Workflow 条件分支

> 本节为 **第17天学习任务与验收 blueprint**（Conditional DAG Runtime）。与 §1–§7 不同：§8 描述的是「待做/要做的能力」，实现可落在后续目录或在本仓库演进中完成；做完第17天后可将实现映射与打卡结果按 §2、§5 的方式回写本文或单独 `day17_learning_summary.md`。

### 8.1 今日核心目标

让 Workflow **不再固定执行全部步骤**，而是能根据**前一步结果**决定下一步走哪条路。

**之前（DAG 并行）**：`step1` 完成后，若无依赖冲突，`step2` / `step3` / `step4` 可能被同一批或后续批 **全部执行**。

**第17天目标（条件分支）**：

```text
step1 判断结果
├─ 如果 A：执行 step2
└─ 如果 B：执行 step3
```

这就是 **Conditional Branch / 条件分支**。

### 8.2 第17天最终效果（用户场景）

**用户输入示例**：

> 帮我检查今天的学习总结，如果内容不完整，就生成补充任务；如果已经完整，就生成复盘总结。

**系统执行（语义）**：

1. **Step1**：检查学习总结是否完整（判断节点）  
2. **Step2A**：若不完整 → 生成补充 todo  
3. **Step2B**：若完整 → 生成复盘 summary  
4. **Step3**：汇总结果（若有汇总步骤）

### 8.3 任务清单

#### 任务 1：给 Step 增加条件字段

升级 `WorkflowStep` 类型，**重点新增**：

- **`condition`**：本 step 是否应该执行（相对某前驱输出的约束）。  
- **`skipped`**：条件不满足时的**正常分支**状态（不是 `failed`）。

建议类型形态示例：

```ts
type WorkflowStep = {
  id: string
  name: string
  action: "chat" | "summary" | "todo" | "weather" | "judge"
  input: string
  dependsOn?: string[]

  condition?: {
    fromStepId: string
    operator: "equals" | "includes" | "truthy"
    value: string
  }

  status: "pending" | "queued" | "running" | "success" | "failed" | "blocked" | "skipped"
  output?: unknown
  error?: string
}
```

（若实现里需要 `skipReason`，可与 `skipped` 状态一并写入步骤对象。）

#### 任务 2：新增 `judge` 工具（判断节点）

条件分支需要一个**不面向最终用户的闲聊**、而返回**结构化判断**的 action：

- **`action: "judge"`**  

返回示例：

```json
{
  "result": "complete",
  "reason": "学习内容包含目标、完成项、问题和下一步"
}
```

或：

```json
{
  "result": "incomplete",
  "reason": "缺少遇到的问题和下一步计划"
}
```

**`judgePrompt` 示例**（Planner/执行侧可按需调整）：

```ts
const judgePrompt = `
你是一个任务判断器。

请根据输入判断状态，只返回 JSON：

{
  "result": "complete" | "incomplete",
  "reason": "简短原因"
}

判断标准：
1. 是否有明确完成内容
2. 是否有遇到的问题
3. 是否有当前系统能力
4. 是否有下一步方向

输入：
${input}
`
```

#### 任务 3：实现 `evaluateCondition`

新增函数，根据 `step.condition` 与前驱步骤输出字典判断是否应执行本步：

```ts
function evaluateCondition(step: WorkflowStep, stepOutputs: Record<string, unknown>) {
  if (!step.condition) return true

  const sourceOutput = stepOutputs[step.condition.fromStepId]

  if (step.condition.operator === "equals") {
    return getResultValue(sourceOutput) === step.condition.value
  }

  if (step.condition.operator === "includes") {
    return JSON.stringify(sourceOutput).includes(step.condition.value)
  }

  if (step.condition.operator === "truthy") {
    return Boolean(sourceOutput)
  }

  return false
}
```

（`getResultValue` 需与 `judge` 输出字段对齐，例如从 `output` 中取出 `result` 字符串。）

#### 任务 4：Executor 支持 `skipped`

在每个 **可运行（runnable）** step **真正执行前**先算 `shouldRun`：

```ts
const shouldRun = evaluateCondition(step, stepOutputs)

if (!shouldRun) {
  step.status = "skipped"
  step.skipReason = "condition not matched"
  continue
}
```

**注意**：`skipped` **不是** `failed`——表示「走了另一条分支」，属于正常控制流。

#### 任务 5：Planner 学会生成条件分支

更新 Planner 提示词，当用户需求包含类似模式时生成条件边：

- 如果……就……  
- 判断……然后……  
- 根据结果……  
- 不完整则…… / 完整则……

**可用 action**：`chat`、`summary`、`todo`、`weather`、**`judge`**。

**条件 JSON 格式示例**：

```json
{
  "fromStepId": "step1",
  "operator": "equals",
  "value": "complete"
}
```

**Planner 输出示例**（节选）：

```json
[
  {
    "id": "step1",
    "name": "判断学习总结是否完整",
    "action": "judge",
    "input": "检查今天的学习总结是否完整"
  },
  {
    "id": "step2a",
    "name": "生成补充任务",
    "action": "todo",
    "input": "根据不完整部分生成补充任务",
    "dependsOn": ["step1"],
    "condition": {
      "fromStepId": "step1",
      "operator": "equals",
      "value": "incomplete"
    }
  },
  {
    "id": "step2b",
    "name": "生成复盘总结",
    "action": "summary",
    "input": "生成完整复盘总结",
    "dependsOn": ["step1"],
    "condition": {
      "fromStepId": "step1",
      "operator": "equals",
      "value": "complete"
    }
  }
]
```

#### 任务 6：增强 Validator

对 `condition` 做校验（并可 **auto repair**）：

1. `condition.fromStepId` 是否存在于 workflow 的步骤 id 中。  
2. `fromStepId` 是否在 `dependsOn` 中（或语义上等价：确保排序/数据流先于本步）。  
3. `operator` 是否合法。  
4. `value` 是否为空（若 `operator` 需要）。  

**Auto repair 示例**：若 `fromStepId` 不在 `dependsOn`：

```ts
step.dependsOn = [...(step.dependsOn || []), step.condition.fromStepId]
```

#### 任务 7：前端展示条件分支

前端状态示例：

```text
✅ step1 判断学习总结是否完整
⏭️ step2a 生成补充任务 skipped：condition not matched
✅ step2b 生成复盘总结
```

建议为 **`skipped`** 单独样式（与 `failed` / `blocked` 区分）。

#### 任务 8：Conditional Debug 日志

每次条件判断打印结构化日志，便于对照 Planner 与 `evaluateCondition`：

```ts
console.log("[Condition]", {
  stepId: step.id,
  fromStepId: step.condition?.fromStepId,
  operator: step.condition?.operator,
  expected: step.condition?.value,
  actual: sourceOutput,
  matched: shouldRun
})
```

### 8.4 第17天验收标准

完成后应满足：

1. 支持 **`judge` action**。  
2. 支持 **`condition` 字段**。  
3. 支持 **`skipped` 状态**。  
4. **Executor** 按条件执行或跳过。  
5. **Planner** 能生成条件分支。  
6. **Validator** 能检查 `condition`（必要时 repair）。  
7. **前端** 能展示 `skipped` 与条件命中结果。  
8. **Debug** 能看到 `matched` / `not matched`。

### 8.5 第17天打卡模板

```text
【第17天打卡】

1. 是否新增 judge action：是 / 否
2. judge 是否能稳定返回结构化判断：是 / 否

3. 是否实现 condition 字段：是 / 否
4. 是否实现 evaluateCondition：是 / 否

5. 是否新增 skipped 状态：是 / 否
6. 条件不满足时是否能跳过 step：是 / 否

7. Planner 是否能生成条件分支：是 / 否
8. Validator 是否检查 condition：是 / 否

9. 前端是否展示 skipped / condition 结果：是 / 否
10. 是否增加 condition debug 日志：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

### 8.6 第17天核心认知

**Workflow 不只是「按顺序执行任务」，而是「根据状态选择路径」。**

做完第17天，Runtime 从：

- **DAG Runtime**  

升级为：

- **Conditional DAG Runtime**

---

*文档生成说明：§1–§7 结构与第15天 §12 对齐，内容根据 `ollama-chat-day16` 当前实现归纳；**§8** 为第17天条件分支学习计划（实现后请同步「实现映射」、打卡与相关文件索引）。若后续改动执行器或 UI，请同步更新 §2、§5 与 §7。*
