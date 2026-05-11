# 第15天学习总结：Workflow Runtime 工程化

本文档对应「第14天学习预告」中的第15天任务（Workflow Validation、Auto Repair、DAG 执行、步骤重试与 Execution Timeline），并结合 `ollama-chat-day15` 中 `app/api/chat/route.ts` 与 `app/page.tsx` 的实际实现做归纳。

---

## 1. 定位：从「能跑 Workflow」到 Agent Runtime V1

第14天已经能跑通多步 Workflow；第15天在此基础上把重点放在 **Runtime 结构**，而不是指望 Planner 一次输出完美 JSON：

- **执行前校验**：非法结构在进入模型/工具链之前就被拦住，并给出 **可分条定位的错误信息**。
- **自动修复**：在规则允许范围内改写 Planner 漂移（别名、悬空依赖、重复 id、常见漏依赖等），再二次校验。
- **DAG 拓扑执行**：执行顺序 **严格来自 `dependsOn` 依赖图**，禁止按 Planner 返回数组下标盲跑。
- **步骤级重试**：单步偶发失败（网络、解析、模型抖动）时有限次重试，避免整条流水线无谓中断。
- **可观测时间线**：把 validate / repair / execute / retry 打成带时间戳的事件序列，便于对标 LangSmith、OpenAI Tracing 等「先看时间线再排错」的体验。

一句话：**高可靠 Agent 往往由 Runtime（校验、修复、排序、重试、观测）决定上限，单靠 Prompt 无法消除 Planner 漂移。**

---

## 2. 核心 Runtime 管道（后端）

Workflow 分支在进入 `executeWorkflow` 之前走固定管线：

1. **`validateWorkflow(workflow)`**：首轮静态校验。
2. 若失败 → **`repairWorkflow(workflow)`** → 再次 **`validateWorkflow`**。
3. 若仍失败 → **`workflow.status = "failed"`**，**不执行任何步骤**，`finalSummary` 列出校验错误；同时将已产生的 Timeline 一并返回前端。
4. 若通过 → Timeline 中写入 **`topologicalSort` 预览序**（仅可读示意），再 **`executeWorkflow`**（内部同样用 `topologicalSort` 排序）。

这与第14天预告中的「**校验 →（可选）修复 → 再校验 → 拓扑序执行**」一致。

---

## 3. `validateWorkflow`：执行前合法性

校验项（与预告及 Executor 白名单对齐）包括但不限于：

| 检查项 | 说明 |
|--------|------|
| `steps` 非空 | 空工作流直接非法 |
| `step.id` | 非空字符串，且 **全局唯一** |
| `action` 白名单 | 仅允许 `chat`、`summary`、`todo`、`weather`（`WORKFLOW_ALLOWED_ACTIONS`） |
| `dependsOn` 引用 | 每条依赖必须指向 **存在的步骤 id** |
| **循环依赖** | 通过 **Kahn 算法**（`kahnWorkflowTopology`）判断 DAG；有环则报错并拒绝执行 |

输出 `{ ok, errors[] }`，便于日志与用户可见的分条说明。

---

## 4. `repairWorkflow`：Auto Repair 策略

修复按优先级串联（**能修则修，修不动交给 validator**）：

1. **`repairWorkflowDuplicateStepIds`**：空白或重复的 `id` 重写为带随机后缀的稳定 id。
2. **`repairWorkflowActionAlias`**：别名表归一（如 `summarize` / `summaries` → `summary`，`todos` / `tasks` → `todo`，`forecast` / `meteo` 等 → `weather`）；未命中则回落到既有 `normalizeWorkflowAction`。
3. **`repairWorkflowFilterDependsOn`**：去掉指向不存在 id 的悬挂依赖边。
4. **`repairWorkflowHeuristicTodoDependsOnSummary`**：按 Planner **数组顺序**启发式——若某 `todo` 步 **没有** `dependsOn`，且前面出现过 `summary`，则自动补上「依赖最近一次 summary」的边（常见「先总结再待办」漏写依赖场景）。
5. **`repairWorkflowBreakCyclesIfNeeded`**：若仍存在环，则从末尾往前贪心 **删依赖边** 直到 Kahn 判定无环（保守消解，优先恢复可执行性）。

---

## 5. 拓扑排序与执行顺序

- **`topologicalSortWorkflowSteps`**：第14天已有的 **DFS 后序** 拓扑实现；遇环时 `console.warn` 并在必要时 **补全未入序步骤** 作为兜底。
- **`topologicalSort(steps)`**：第15天增加的 **命名封装**，内部直接委托 `topologicalSortWorkflowSteps`，避免「校验用一套序、执行用另一套」的不一致。
- **`executeWorkflow` / `synthesizeWorkflowResult`**：统一通过 **`topologicalSort`** 得到执行序与汇总序，强调 **DAG-first**，而非 Planner 数组顺序。

判环用于 **validate** 的是 Kahn；执行排序仍是 DFS 版——二者职责分离（一个严格拒绝非法 DAG，一个在实际执行路径上与合作已久的排序逻辑保持一致）。

---

## 6. 步骤级 Retry

- **`WorkflowStep.retry`**：`undefined` 使用全局默认；`0` 表示不重试；正整数表示 **首轮之外的最多追加尝试次数**。
- **`WORKFLOW_DEFAULT_STEP_RETRIES`**：默认额外重试次数（例如 `2`，即首轮 + 2 次重试，共 3 次机会）。
- `executeWorkflow` 内对每步 `for` 循环尝试；非首次尝试会：
  - 向 Timeline 写入 **`步骤 {id} retry #{attempt}`**；
  - `console.log("[Workflow] step retry", { stepId, attempt, maxAttempts })` 便于服务端聚合日志。

典型受益场景：天气 API 网络抖动、模型偶发异常等。

---

## 7. Execution Timeline（后端数据结构 + 前端展示）

- **类型**：`WorkflowTimelineEvent` —— `ts`（毫秒）、可选 `stepId`、`message`（中文可读描述）。
- **挂载位置**：`Workflow.executionTimeline`，随 `type: "workflow"` 的 JSON 返回前端。
- **覆盖阶段**：校验开始、校验失败及 repair、二次校验、拓扑预览、执行器启动、各步 `started` / `retry` / `success` / `fail` 等。
- **前端**（`page.tsx`）：Workflow 卡片底部 **Execution Timeline** 区域，用 `toLocaleTimeString("zh-CN", { hour12: false })` 格式化为 **时:分:秒**，并附带可选 `stepId` 提示，对齐「Runtime Trace」阅读习惯。

页面标题与文案也明确为：**Workflow Validator · Repair · Retry · Timeline**。

---

## 8. 前端其它配套

- `WorkflowStep` 类型同步 **`retry?: number`**，步骤详情中可展示当前步骤配置的 retry。
- 工作流卡片仍保留步骤列表、依赖关系、`finalSummary` 等第14天能力；第15天主要是 **Timeline 区块** 与头部产品化描述。

---

## 9. 第15天核心认知（对照预告原文）

1. **Runtime 与 Prompt 分工**：结构化的校验、修复、排序、重试、观测比单条 Prompt 更能拉高 Workflow 成功率上限。
2. **Planner 必然会漂移**：需要 **validate → repair → retry**（以及校验失败时的明确短路），而不是假设 JSON 永远合法。
3. **DAG Runtime 是进阶基础**：有序、可依赖的执行模型，为后续并行步骤、条件分支、HITL、RAG 多步编排打地基。

---

## 10. 打卡自检（对应第14天预告 §8.7）

| 项 | 第15天实现要点 |
|----|----------------|
| workflow validator | ✅ `validateWorkflow` |
| dependsOn 不存在检测 | ✅ |
| 循环依赖检测 | ✅ Kahn（`kahnWorkflowTopology`） |
| auto repair | ✅ `repairWorkflow` 组合策略 |
| action 漂移修复 | ✅ 别名表 + `normalizeWorkflowAction` |
| topological sort | ✅ `topologicalSort` → `topologicalSortWorkflowSteps` |
| 按 DAG 顺序执行 | ✅ `executeWorkflow` 使用拓扑序 |
| retry | ✅ 步骤级 + 全局默认 + Timeline / 日志 |
| 前端 execution timeline | ✅ `executionTimeline` 列表展示 |

---

## 11. 做完第15天后的预期位置

更接近 **「Agent Runtime V1」**：**可校验、可修复、有序执行、可重试、可追踪**。在此之上，并行 Workflow、条件分支、人在回路（HITL）、RAG Workflow、Multi-Agent 等才有稳定的工程落脚点。

---

*文档生成依据：`ollama-chat-day14/day14_learning_summary.md` 第15天预告（§8）、`ollama-chat-day15/app/api/chat/route.ts`、`ollama-chat-day15/app/page.tsx`。*
