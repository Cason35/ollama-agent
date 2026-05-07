# Workflow 模式对话纪要（实现梳理 + 理解校准 + 设计动机）

> 整理自关于 `app/api/chat/route.ts` 中多步 Workflow 的讨论，可与 [`day13_learning_from_route_and_page.md`](./day13_learning_from_route_and_page.md) 对照阅读。

---

## 一、实现是怎么串起来的

1. **入口**  
   请求体 `useWorkflow: true` 时，`POST` 在 `buildMemory` 之后**不再走单步 action 路由**，进入工作流分支。

2. **目标 `goal`**  
   通常取短期记忆中的**最新一条用户话**（`getLatestUserText(memory.shortTerm)`）。

3. **Planner：`planWorkflowSteps(goal, memory, rt)`**  
   - 用专用提示词要求模型只输出 **JSON 数组**，每项含 `name`、`action`、`input`。  
   - 注入长期记忆：`formatMemoryForPlanner(memory)`。  
   - 解析：`parsePlannerPlanOutput`，配合 `normalizePlannerStepInput`、`normalizeWorkflowAction`（含 `search` → `weather`）。  
   - 模型不可用或解析为空：**单步 `chat` 兜底**。

4. **从草案到可执行步骤**  
   `PlannerPlanItem[]` 再 `map` 为 `WorkflowStep[]`（补 `id`、`status: "pending"` 等），装入 `Workflow`（`id`、`goal`、`status`）。

5. **Executor：`executeWorkflow`**  
   - **`for` 顺序执行**每一步：`pending` → `running` → `success` 或 `failed`。  
   - 按 `action` 分流：`summary` → `summarizeWithModel`；`todo` → `generateTodosWithModel`；`weather` → `realWeather`；否则 → `runWorkflowChat`。  
   - **`priorOutputText`**：每步成功后把 `[步骤名]\n输出` 拼入，后续步骤通过参数传入，形成**链式上下文**。  
   - 任一步抛错：该步 `failed`，`workflow.status = "failed"`，**`break` 不再执行后续步**。

6. **最终给用户的一段话**  
   - **全部成功**：`summarizeWorkflowResult(goal, wfDone, rt)`，只汇总 `status === "success"` 的步骤产出，再生成**一段中文**（不要 JSON）。  
   - **有失败**：不调汇总模型，`finalSummary` 为 **`工作流中断：…`**（含首错信息）。

7. **响应体**  
   `Response.json(withMemory({ type: "workflow", workflow: wfDone, finalSummary }))`  
   前端得到：**完整 `workflow`（每步状态、输出、耗时等）**、`finalSummary`、以及更新后的 **`memory`**——不单是 `finalSummary`。

---

## 二、对你先前理解的校准（要点）

| 你的理解 | 校准 |
|---------|------|
| Planner 直接返回「最终对象数组」 | 先返回 `PlannerPlanItem[]`，再在路由里包装成带 `id`、`status` 的 `WorkflowStep[]`。 |
| `action` / `input` | `action` 表示本步工具类型；`input` 为该步的字符串说明（代码还对对象型 `input` 做了规范化）。 |
| 各步独立执行 | 顺序执行，且通过 **`priorOutputText`** 把前面步骤结果传给后面几步。 |
| 成功则汇总并只返回 `finalSummary` | 成功会生成 `finalSummary`，但接口同时返回 **`workflow` + `memory`**。 |
| 失败也会走 `summarizeWorkflowResult` | **不会**；失败路径用中断文案作为 `finalSummary`。 |

---

## 三、为什么思路要设计成「Planner → 顺序执行 → 汇总」

1. **单步路由的天然局限**  
   一次只能选一个 `action`，复杂请求（多工具、有先后顺序）容易丢步骤或全靠模型「一口说完」，可控性差。Workflow 把需求**显式拆步**，每步映射到已有工具。

2. **规划与执行分离（Plan-and-Execute）**  
   Planner 专注产出结构化步骤列表；Executor 只负责按列表调用已有实现，与 Day12 单步工具复用、行为一致、易维护。

3. **线性链 + 前文拼接**  
   不引入 DAG 也能让后续步骤「看见」前面产出；实现与调试简单，对教学与常见串联场景够用。

4. **`summarizeWorkflowResult` 的意义**  
   逐步输出格式不一、较碎；最后再压成一段连贯答复，同时前端仍可展示过程明细。

5. **失败即停**  
   避免在出错后仍生成「看起来很完整」的总结，误导用户。

6. **`useWorkflow` 可选**  
   多轮模型调用成本更高，复杂场景再开启，简单对话仍走单步路由。

**一句话**：在不大改原有单工具逻辑的前提下，用 **显式多步计划 + 顺序执行 + 链式上下文 + 成功后再汇总**，把「一段话里的多个任务」变成 **可控、可观测、对用户友好** 的流程。

---

## 四、相关代码位置（便于跳转）

- 类型：`WorkflowStep`、`Workflow`、`ChatResponseBody` 中的 `workflow` 分支  
- Planner / 解析：`planWorkflowSteps`、`parsePlannerPlanOutput`、`normalizePlannerStepInput`、`normalizeWorkflowAction`  
- 执行：`executeWorkflow`、`runWorkflowChat`  
- 汇总：`summarizeWorkflowResult`  
- 入口分支：`POST` 内 `if (useWorkflow) { ... }`

文件：`ollama-chat-day13/app/api/chat/route.ts`。
