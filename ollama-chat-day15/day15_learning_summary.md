# 第15天学习总结：Workflow Runtime 工程化（含第16天学习计划）

本文档对应「第14天学习预告」中的第15天任务（Workflow Validation、Auto Repair、DAG 执行、步骤重试与 Execution Timeline），并结合 `ollama-chat-day15` 中 `app/api/chat/route.ts` 与 `app/page.tsx` 的实际实现做归纳。**文末 §12 起为第16天学习计划**（Parallel DAG Runtime V2），与第15天串行执行形成对照。

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

## 12. 第16天学习计划：Parallel Workflow + Branch Execution（核心升级）

### 12.1 核心目标

让 Runtime 支持 **「多个 step 同时执行」**，从「单链串行」升级为 **真正的 DAG 调度器（Parallel / DAG Scheduler）**。

### 12.2 当前限制 vs 目标形态

**第15天及之前的典型形态**：`step1 → step2 → step3` 全部串行 —— 偏慢、扩展性差。

**目标：Parallel Workflow（DAG Runtime）**：

```text
        step1
       /     \
   step2   step3
       \     /
        step4
```

### 12.3 第16天「最终效果」示例（用户意图 → 系统行为）

用户输入示例：帮我 1）查北京天气 2）总结今天学习内容 3）生成明天 todo。

系统行为示意：

- **Batch 1（并行）**：`step1 weather`、`step2 summary`、`step3 todo` 在无互相未完成依赖时可同批执行。
- **Batch 2**：`step4 synthesize` 在依赖满足后执行（具体依赖边由 Planner / 图结构决定）。

---

### 12.4 任务 1：识别「可并行节点」

**目标**：找出当前时刻 **所有依赖已满足、尚未执行** 的步骤 —— 典型特征是 **没有未完成的 `dependsOn` 前置**（实现上常表现为「入度为 0 的待执行节点」在动态调度中的变体）。

**新增能力**：`getRunnableSteps()` —— 返回当前轮次可一并调度的 step 列表。

**示例（概念）**：

| DAG 片段 | 第一轮 runnable | 第二轮 runnable |
|----------|-----------------|-----------------|
| `step1 weather`；`step2 summary`；`step3 todo` 依赖 `step2` | `step1`、`step2` | `step3`（在 `step2` 成功后） |

---

### 12.5 任务 2：实现 Parallel Executor（重点）

**现状**：`for (const step of steps)` 按序串行。

**升级**：对每一批 `runnableSteps` 使用 **`await Promise.all(runnable.map(runStep))`** 并行执行。

**核心调度循环（结构要点）**：

```ts
while (hasPendingSteps()) {
  const runnable = getRunnableSteps();
  await Promise.all(runnable.map((step) => executeStep(step)));
}
```

到这一步，Runtime 才第一次具备 **DAG Scheduler** 语义：按依赖分层、层内并行。

---

### 12.6 任务 3：Step 状态机（重点）

**现状**：`pending` → `running` → `success` / `failed` 偏简单。

**升级**：扩展为更贴近并行调度与依赖语义的类型，例如：

```ts
type StepStatus =
  | "pending"
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "blocked";
```

**为何需要 `blocked` / `queued`**：并行后，有的 step 已可运行，有的仍在等依赖；若某依赖失败，下游应进入 **阻塞** 而非继续执行。

**示例**：`step4` 因 `step2 failed` 且 `step4 dependsOn step2` → `step4` 标记为 `blocked`。

---

### 12.7 任务 4：失败传播（Failure Propagation）

**目标**：任一依赖失败后，**后续依赖该节点的 step 不得继续执行**，并显式标记为 `blocked`（或等价语义）。

**Executor 增强思路**：

```ts
if (hasFailedDependency(step)) {
  step.status = "blocked";
}
```

由此形成清晰的 **Runtime Failure Model**：失败沿依赖边向下游传播，避免「上游已挂、下游仍跑」的假成功。

---

### 12.8 任务 5：Workflow Graph 可视化

**前端**：展示步骤与依赖 —— 最简单可先基于 `step.dependsOn` 渲染依赖链或邻接列表（如 `weather ✅`、`summary ✅`、`todo ⏳`，再汇聚到 `synthesize`）。

**后续可增强**：React Flow、专用 DAG 编辑器等。

---

### 12.9 任务 6：Execution Batch Timeline

**现状**：时间线多为逐步串行：`step1` → `step2` → `step3`。

**升级**：按 **调度批次** 展示，例如：

- **Batch #1**：`step1 running`、`step2 running`（同批并行）
- **Batch #2**：`step3 running`

便于直观看到 **Scheduler 的分批与并行边界**。

---

### 12.10 第16天核心认知

1. **Workflow Runtime 的本质**不是单纯 `for-loop`，而是 **DAG Scheduling**（在满足依赖的前提下分批、可并行）。
2. **并行是 Runtime 分水岭**：无并行更像「任务链」；有并行才接近 **Workflow Engine**。
3. **Failure Propagation 必须存在**：依赖失败后，下游不能继续「正常执行」，应阻塞或短路并对外一致暴露状态。

---

### 12.11 第16天打卡模板

**【第16天打卡】**

1. 是否实现 runnable step 检测：是 / 否  
2. 是否实现 Parallel Executor：是 / 否  
3. 是否实现 `Promise.all` 并行执行：是 / 否  
4. 是否实现 Step State Machine：是 / 否  
5. 是否新增 `blocked` / `queued` 状态：是 / 否  
6. 是否实现 failure propagation：是 / 否  
7. 前端是否展示 DAG 结构：是 / 否  
8. 是否展示 batch timeline：是 / 否  
9. 遇到的最大问题：（自由填写）  
10. 当前系统能力：（自由填写）

---

## 13. 做完第16天后的预期位置

- **能力**：**Parallel DAG Runtime V2**（分层调度 + 层内并行 + 失败传播 + 更丰富步骤状态 + 图与时间线可观测）。
- **下一阶段方向**（在并行 DAG 稳定之后才真正展开）：**Conditional Branch**、**Human-in-the-loop**、**Tool Memory**、**RAG Workflow**、**Multi-Agent** 等。

---

*文档生成依据：`ollama-chat-day14/day14_learning_summary.md` 第15天预告（§8）、`ollama-chat-day15/app/api/chat/route.ts`、`ollama-chat-day15/app/page.tsx`；**第16天**为本文 §12 所收录的学习计划（Parallel Workflow / DAG Scheduler / 状态机与失败模型 / 可视化与时间线）。*
