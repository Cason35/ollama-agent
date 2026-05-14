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
- **下一方向**（在并行 DAG 稳定后再展开）：**条件分支（Conditional Branch）**、**Human-in-the-loop**、**Tool Memory**、**RAG Workflow**、**Multi-Agent** 等。

---

## 7. 相关文件索引

| 文件 | 说明 |
|------|------|
| `ollama-chat-day16/app/api/chat/route.ts` | 并行 DAG 调度、`getRunnableSteps`、`executeWorkflow`、`executionBatches`、失败传播 |
| `ollama-chat-day16/app/page.tsx` | Workflow UI、DAG 列表、Batch Timeline、状态符号 |
| `ollama-chat-day16/day16_manual_test_cases.md` | 手动测试与学习目标验收表 |
| `ollama-chat-day15/day15_learning_summary.md` §12 | 第16天原始学习计划与打卡模板 |

---

*文档生成说明：结构与 §12 对齐，内容根据 `ollama-chat-day16` 当前实现归纳；若后续改动执行器或 UI，请同步更新本文「实现映射」与打卡表。*
