# 第17天学习总结：Conditional Workflow + Conditional DAG Runtime

本文档对照 `ollama-chat-day16/day16_learning_summary.md` §8 的学习目标，结合本仓库 **`ollama-chat-day17`** 中 `app/api/chat/route.ts` 与 `app/page.tsx` 的实际实现，归纳第17天「学了什么、系统多了什么能力」。

---

## 1. 第17天在解决什么问题

**第16天及以前**：Workflow 在 **`dependsOn` 约束满足** 后按层并行执行——只要某步入度（依赖）已就绪，就会进入 runnable 批次并真正调用模型，**无法表达「二选一 / 多选一」的业务分支**。

**第17天核心**：在 Parallel DAG Runtime 之上增加 **条件分支（Conditional Branch）**——步骤可声明 `condition`，执行前用前驱 **`success` 步骤的输出** 做判定；未命中则标记为 **`skipped`（正常控制流，非 `failed`）**，从而只走用户语义上「如果 A 则 step2、如果 B 则 step3」中的一条路。

一句话：**Workflow 不只是「按依赖图跑任务」，而是「根据状态选择路径」——Runtime 从 DAG 升级为 Conditional DAG。**

---

## 2. 学习计划（§8）与实现映射

| §8 任务要点 | 本仓库实现要点 | 主要位置 |
|--------------|----------------|----------|
| **任务 1：`condition` / `skipped`** | `WorkflowStepCondition`、`WorkflowStepStatus` 含 `skipped`、`skipReason`；`parseWorkflowConditionFromUnknown` 解析 Planner JSON | `route.ts`：类型区、`parseWorkflowConditionFromUnknown` |
| **任务 2：`judge` action** | `runWorkflowJudge` 约束 JSON `{ result, reason }`；失败/解析失败保守返回 `incomplete`；`WORKFLOW_ALLOWED_ACTIONS` 含 `judge`；别名 repair：`classify`/`decision` → `judge` | `route.ts`：`runWorkflowJudge`、`repairWorkflowActionAlias` |
| **任务 3：`evaluateCondition`** | `getJudgeResultValue` 抽取 `result`；`buildSuccessStepOutputsRecord` 仅收录 `success` 输出；`equals` / `includes` / `truthy` 三算子 | `route.ts`：§17 条件分支区块 |
| **任务 4：Executor `skipped`** | `runOneStepWithRetries` 执行模型前 `shouldRun` 判定；未命中 → `skipped`、`skipReason`、`durationMs: 0`、Timeline 打点 | `route.ts`：`executeWorkflow` → `runOneStepWithRetries` |
| **任务 5：Planner 条件分支** | `planWorkflowSteps` 提示词：触发词、judge + condition 示例、`operator` 说明、dependsOn 与 fromStepId 对齐要求 | `route.ts`：`planWorkflowSteps` |
| **任务 6：Validator / repair** | `validateWorkflow` 校验 fromStepId、operator、value、dependsOn 包含关系；`repairWorkflowConditionDependsOn` 自动补依赖边 | `route.ts`：`validateWorkflow`、`repairWorkflow` |
| **任务 7：前端展示** | `workflowStepStatusGlyph` 的 **⏭️**；琥珀色 skipped 卡片；`condition：` 行；「分支跳过」与输出摘录 `—（本分支未执行）` | `page.tsx`：Workflow 步骤卡片 |
| **任务 8：Condition Debug** | 有 `condition` 时 `console.log("[Condition]", { stepId, fromStepId, operator, expected, actual, matched })` | `route.ts`：`runOneStepWithRetries` |
| **第16天能力延续** | `getRunnableSteps` 并行批次、`Promise.all`、`queued`/`blocked`、失败传播、`executionBatches`、Batch Timeline 等保留 | `route.ts`、`page.tsx` |

更细的验收用例与手动测试步骤见同目录 **`day17_manual_test_cases.md`**。

---

## 3. 核心概念（结合代码行为理解）

### 3.1 `judge`：结构化判定节点，不是面向用户的闲聊

`judge` 步骤通过专用 prompt 要求模型 **只返回 JSON**，字段为 `result`（如 `complete` / `incomplete`）与 `reason`。执行结果写入 `step.output`，供后续 `condition.operator === "equals"` 与 `getJudgeResultValue` 对齐。

模型不可用或 JSON 解析失败时，**保守返回 `incomplete`**，避免误走「完整」分支导致业务假阳性。

### 3.2 `evaluateCondition` + `skipped`：执行前的路径选择

在每个 runnable 步骤 **真正调用工具之前**：

1. `buildSuccessStepOutputsRecord` 收集当前所有 **`status === "success"`** 的步骤输出（**`skipped` 不产生条目**，避免未执行分支污染条件读取）。
2. `evaluateCondition(step, stepOutputsRecord)` 计算 `shouldRun`。
3. 若 `!shouldRun`：置 `skipped`、`skipReason: "condition not matched"`、`durationMs: 0`，**不进入重试循环、不调用模型**。

**`skipped` ≠ `failed`**：表示「走了另一条分支」，属于正常控制流；前端用琥珀色样式与 **⏭️** 区分于 **✕** / **⛔**。

### 3.3 依赖汇合：`success` 与 `skipped` 均可满足下游 `dependsOn`

`getRunnableSteps` 在检查依赖时，允许依赖步为 **`success` 或 `skipped`**：

- 互斥分支场景：一条分支 `success`、另一条 `skipped`，依赖 **两条分支 id** 的汇总步仍可被调度（汇合节点）。
- `formatDependencyOutputsForStep` 仍只拼接 **`success`** 依赖的输出；skipped 分支无产物可注入。

这与「条件只读 judge 的 success 输出」一致：`buildSuccessStepOutputsRecord` 与依赖注入语义分工明确。

### 3.4 Planner → parse → validate → repair → execute 闭环

| 阶段 | 行为 |
|------|------|
| **Planner** | 识别「如果…就…」等模式，生成 `judge` + 带 `condition` 的互斥分支，`value` 与 `result` 枚举对齐 |
| **parse** | `parseWorkflowConditionFromUnknown` 过滤非法 condition（缺 fromStepId、非法 operator、equals/includes 空 value） |
| **validate** | `fromStepId` 存在、在 `dependsOn` 中、operator 合法、value 非空（按需） |
| **repair** | `repairWorkflowConditionDependsOn`：漏写时把 `condition.fromStepId` 追加进 `dependsOn` |
| **execute** | 并行批次内每步先条件判定，再工具执行或 skip |

### 3.5 最终汇总（Synthesizer）对 skipped 的语义

`synthesizeWorkflowResult` 将 **`success` 与 `skipped`** 步骤都纳入上下文，但对 skipped 只传递 **跳过原因**，并提示模型 **自然忽略未选中分支的产物**，避免最终答复引用「未执行分支」的幻觉内容。

---

## 4. 典型用户场景（端到端语义）

**用户输入示例**：

> 帮我检查今天的学习总结，如果内容不完整，就生成补充任务；如果已经完整，就生成复盘总结。

**系统执行（语义）**：

```text
step1（judge）判断学习总结是否完整 → result: complete | incomplete
├─ condition equals incomplete → step2a（todo）生成补充任务
└─ condition equals complete  → step2b（summary）生成复盘总结
（未命中分支为 skipped，非 failed）
```

Planner 提示词中明确要求：**先 judge，再 dependsOn + condition**；`equals` 比对 `judge.result` 字符串。

---

## 5. 前端（`page.tsx`）与类型对齐

- 与后端对齐 **`WorkflowStep.action`**（含 `judge`）、**`condition`**、**`status: skipped`**、**`skipReason`**。
- **`workflowStepStatusGlyph`**：`skipped` → **⏭️**（与 `blocked` ⛔、`failed` ✕ 区分）。
- Workflow 卡片内与第17天强相关：
  - **`condition：`** 行（`fromStepId` · `operator` · `value`）
  - **`skipped`** 琥珀色行背景 + **「分支跳过」** 文案
  - **输出摘录**：skipped 显示 `—（本分支未执行）`
- 页面副标题：**Conditional DAG · judge · condition · skipped**（`layout.tsx` 描述一致）。

第16天的 **DAG 邻接列表**、**Batch Timeline**、**executionTimeline** 仍保留，与条件分支叠加展示。

---

## 6. 第17天打卡（对照 §8.5，按当前实现填写）

1. 是否新增 judge action：**是**（`runWorkflowJudge`、`WorkflowStepAction` 含 `judge`）
2. judge 是否能稳定返回结构化判断：**是**（JSON 解析 + 失败降级 `incomplete`；`getJudgeResultValue` 兼容字符串化 JSON）

3. 是否实现 condition 字段：**是**（`WorkflowStepCondition`、`parseWorkflowConditionFromUnknown`）
4. 是否实现 evaluateCondition：**是**（`equals` / `includes` / `truthy` + `getJudgeResultValue`）

5. 是否新增 skipped 状态：**是**（`WorkflowStepStatus`、前端类型与样式）
6. 条件不满足时是否能跳过 step：**是**（`runOneStepWithRetries` 前置分支，`durationMs: 0`）

7. Planner 是否能生成条件分支：**是**（`planWorkflowSteps` 条件分支段落与示例 JSON）
8. Validator 是否检查 condition：**是**（`validateWorkflow` + `repairWorkflowConditionDependsOn`）

9. 前端是否展示 skipped / condition 结果：**是**（⏭️、condition 行、分支跳过、输出占位）
10. 是否增加 condition debug 日志：**是**（`[Condition]` 结构化 `console.log`）

11. 遇到的最大问题：（个人实验记录，例如：Planner 未生成 `judge` 时需对照原始 `workflow.steps` 回归；`result` 枚举与 `condition.value` 不对齐会导致双分支皆 skipped 或皆 success；judge 输出格式漂移时依赖 `getJudgeResultValue` 容错——请按自己调试经历填写）

12. 当前系统能力：**Conditional DAG Runtime V1**——在第16天 Parallel DAG（分层并行、失败传播、批次可观测）之上，具备 judge 判定、条件求值、skipped 正常分支、Planner/Validator/repair 闭环与前端分支可视化。

---

## 7. 做完第17天后的位置与下一方向

- **当前位置**：Runtime 从 **Parallel DAG** 升级为 **Conditional DAG**——工作流可按前驱状态 **选择路径**，而不仅是「依赖满足就全跑」。
- **与第16天的关系**：条件分支 **叠加** 在并行调度之上（同批内各步独立做 `evaluateCondition`）；`skipped` 与 `blocked`/`failed` 语义严格分离。
- **下一方向**：见下文 **§8 第18天学习计划**（Human-in-the-loop 人工确认节点）；更远期可参考第16天 §6（嵌套条件、Tool Memory、RAG Workflow、Multi-Agent 等）。

---

## 8. 第18天学习计划：Human-in-the-loop 人工确认节点

> 本节为 **第18天学习任务与验收 blueprint**（Conditional DAG Runtime + HITL）。与 §1–§7 不同：§8 描述的是「待做/要做的能力」，实现可落在后续目录（如 `ollama-chat-day18`）或在本仓库演进中完成；做完第18天后可将实现映射与打卡结果按 §2、§6 的方式回写本文或单独 `day18_learning_summary.md`。

### 8.1 今日核心目标

让 Agent 在执行**高风险或关键步骤**前，先让用户确认。

**之前（第17天 Conditional DAG）**：

```text
判断 → 执行
```

**第18天目标（HITL）**：

```text
判断 → 等待用户确认 → 再执行
```

这就是 **HITL：Human-in-the-loop**。

### 8.2 第18天最终效果（用户场景）

**用户输入示例**：

> 帮我整理今天学习内容，并生成最终提交版总结

**系统执行到关键 step 时**：

```text
Step1：总结学习内容 ✅
Step2：生成最终提交版总结 ⏸️ 等待确认

是否继续执行？
[确认执行] [取消]
```

用户点击确认后：

```text
Step2：继续执行 ✅
Workflow 完成 ✅
```

### 8.3 任务清单

#### 任务 1：给 Step 增加 confirmation 字段

升级 `WorkflowStep` 类型，**重点新增**：

- **`requiresConfirmation`**：本步执行前是否需用户确认。  
- **`confirmationMessage`**：展示给用户的确认文案。  
- **`waiting_confirmation`**：暂停等待用户操作的状态（**不是** `failed`，**不是** `skipped`）。

建议类型形态示例：

```ts
type WorkflowStep = {
  id: string
  name: string
  action: string
  input: string
  dependsOn?: string[]
  condition?: Condition

  requiresConfirmation?: boolean
  confirmationMessage?: string

  status:
    | "pending"
    | "queued"
    | "running"
    | "success"
    | "failed"
    | "blocked"
    | "skipped"
    | "waiting_confirmation"

  output?: unknown
  error?: string
}
```

（若实现里需要 `confirmed` 布尔标记、`skipReason` 等，可与确认/取消流程一并写入步骤对象。）

#### 任务 2：Executor 支持暂停

在执行 step **前**加判断：

```ts
if (step.requiresConfirmation && !step.confirmed) {
  step.status = "waiting_confirmation"
  return {
    workflow,
    paused: true,
    waitingStepId: step.id
  }
}
```

**注意**：这里不是 `failed`，也不是 `skipped`，而是**暂停整个 workflow**，等待用户操作后再 `continueWorkflow`。

#### 任务 3：前端增加确认按钮

当 workflow 返回 `paused: true`、`waitingStepId: "step2"` 时，前端展示确认 UI，例如：

```tsx
<div>
  <p>该步骤需要确认：{step.confirmationMessage}</p>
  <button onClick={() => confirmStep(step.id)}>确认执行</button>
  <button onClick={() => cancelStep(step.id)}>取消</button>
</div>
```

#### 任务 4：实现 `confirmStep` 接口

新增 API：

```http
POST /api/workflow/confirm
```

**请求体示例**：

```json
{
  "workflowId": "xxx",
  "stepId": "step2",
  "decision": "confirm"
}
```

**后端处理**：

1. `step.confirmed = true`  
2. `step.status = "pending"`  
3. `continueWorkflow(workflow)`

#### 任务 5：实现 `cancelStep`

用户取消时：

```ts
step.status = "skipped"
step.skipReason = "user cancelled"
```

然后根据策略决定后续行为：

| 策略 | 行为 | 适用 |
|------|------|------|
| **策略 A** | `workflow.status = "cancelled"`，整个 workflow 停止 | 关键步骤（**第18天建议先做**） |
| **策略 B** | 跳过该 step，继续执行不依赖它的后续节点 | 非关键步骤 |

#### 任务 6：Planner 支持 `requiresConfirmation`

更新 Planner 提示词：若某步骤属于以下类型，请设置 `requiresConfirmation=true`：

1. 最终提交  
2. 删除、覆盖、发送、发布  
3. 用户明确要求「最终版」  
4. 可能产生不可逆结果  

**Planner 输出示例**：

```json
{
  "id": "step2",
  "name": "生成最终提交版总结",
  "action": "summary",
  "input": "生成最终提交版总结",
  "dependsOn": ["step1"],
  "requiresConfirmation": true,
  "confirmationMessage": "即将生成最终提交版总结，是否继续？"
}
```

#### 任务 7：Validator 检查 confirmation

增加校验（并可 **auto repair**）：

1. `requiresConfirmation=true` 时，`confirmationMessage` 不能为空。  
2. `waiting_confirmation` **不能**被当作 `failed`。  
3. 仅 `confirmed` 后才能继续执行该步。  

**Auto repair 示例**：

```ts
if (step.requiresConfirmation && !step.confirmationMessage) {
  step.confirmationMessage = `是否继续执行：${step.name}？`
}
```

#### 任务 8：前端展示 HITL Timeline

Timeline 建议展示语义序列，例如：

```text
✅ Step1 completed
⏸️ Step2 waiting confirmation
👤 User confirmed
✅ Step2 completed
```

**Debug 日志**：

```ts
console.log("[HITL]", {
  workflowId,
  stepId,
  status: step.status,
  decision
})
```

### 8.4 第18天验收标准

完成后应满足：

1. step 是否支持 **`requiresConfirmation`**。  
2. 是否新增 **`waiting_confirmation`** 状态。  
3. **Executor** 是否能暂停 workflow。  
4. **前端** 是否能展示确认按钮。  
5. 用户确认后是否能继续执行。  
6. 用户取消后是否能停止 workflow（策略 A）。  
7. **Planner** 是否能生成 confirmation step。  
8. **Validator** 是否检查 confirmation 字段。  
9. **Timeline** 是否展示 HITL 事件。

### 8.5 第18天打卡模板

```text
【第18天打卡】

1. 是否实现 requiresConfirmation：是 / 否
2. 是否新增 waiting_confirmation 状态：是 / 否

3. Executor 是否能暂停 workflow：是 / 否
4. 前端是否能展示确认按钮：是 / 否

5. 用户确认后是否能继续执行：是 / 否
6. 用户取消后是否能停止 workflow：是 / 否

7. Planner 是否能生成 requiresConfirmation：是 / 否
8. Validator 是否检查 confirmation：是 / 否

9. Timeline 是否展示 HITL 事件：是 / 否
10. 是否增加 HITL debug 日志：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

### 8.6 第18天核心认知

**真正可用的 Agent，不是所有事情都自动做，而是在关键节点知道停下来问人。**

做完第18天，Runtime 从：

- **Conditional DAG Runtime**

升级为：

- **Conditional DAG Runtime + HITL**

---

## 9. 相关文件索引

| 文件 | 说明 |
|------|------|
| `ollama-chat-day17/app/api/chat/route.ts` | Conditional DAG：`evaluateCondition`、`runWorkflowJudge`、`skipped` 执行路径、`validateWorkflow`/`repairWorkflowConditionDependsOn`、Planner 条件分支提示、`[Condition]` 日志 |
| `ollama-chat-day17/app/page.tsx` | Workflow UI：`judge`/`condition`/`skipped` 展示、⏭️ 状态符、分支跳过文案 |
| `ollama-chat-day17/day17_manual_test_cases.md` | 第17天手动测试与 §6 打卡验收 |
| 本文 §8 | 第18天 HITL 学习计划、验收标准与打卡模板 |
| `ollama-chat-day16/day16_learning_summary.md` §8 | 第17天原始学习计划与打卡模板 |
| `ollama-chat-day16/day16_learning_summary.md` §1–§7 | 第16天 Parallel DAG 实现归纳（本日基础） |

---

## 10. 第17天核心认知

**Workflow 不只是「按顺序或按依赖执行任务」，而是「根据状态选择路径」。**

控制流三态对比（执行器视角）：

| 状态 | 含义 | 是否调用模型 |
|------|------|----------------|
| `success` | 本步执行成功 | 是 |
| `skipped` | 条件未命中，走另一分支 | 否（`durationMs: 0`） |
| `failed` / `blocked` | 错误或依赖失败短路 | 否（语义与 skipped 不同） |

做完第17天，你在心智模型上应能区分：

- **DAG**：谁可以并行、谁必须等待依赖完成；
- **Conditional DAG**：在「可以跑」的前提下，还要问「**该不该跑**」——由 `condition` + 前驱输出回答。

---

*文档生成说明：结构与 `ollama-chat-day16/day16_learning_summary.md` 对齐；§2、§6 对照第16天文档 §8 任务清单与打卡模板；§8 为第18天 HITL 学习计划（实现后请同步实现映射、打卡与相关文件索引）。实现细节以 `ollama-chat-day17` 当前代码为准。若后续改动执行器或 UI，请同步更新 §2、§5 与 §9。*
