# Day 16 手动测试用例（对照学习计划与业务代码）

本文档验收 **`ollama-chat-day15/day15_learning_summary.md` §12（第16天）** 与当前仓库实现：`ollama-chat-day16/app/api/chat/route.ts`（`getRunnableSteps`、`executeWorkflow` 内 `Promise.all` 分批、`propagateBlockedSteps` / `sweepPendingToBlockedWhenWorkflowFailed`、`queued` / `blocked` 状态、`executionBatches`）、`ollama-chat-day16/app/page.tsx`（步骤状态符、Workflow DAG 邻接列表、Execution Batch Timeline）。

---

## 学习目标 ↔ 验收映射

| 学习计划要点（§12） | 本仓库中的体现 | 用例锚点 |
|---------------------|----------------|----------|
| 任务 1：`getRunnableSteps`（依赖已 success、自身 pending） | `getRunnableSteps` + 主循环每轮取 runnable | **§3.1** |
| 任务 2：Parallel Executor / `Promise.all` | `await Promise.all(runnable.map(...))` | **§3.1**、**§3.2** |
| 任务 3：步骤状态机含 `queued` / `blocked` | 入批前 `queued`；传播与扫尾 `blocked` | **§3.3** |
| 任务 4：失败传播 | `propagateBlockedSteps`、`hasFailedDependency` | **§3.4** |
| 任务 5：Workflow 图可视化 | 前端「Workflow DAG（dependsOn）」邻接列表 | **§3.5** |
| 任务 6：Execution Batch Timeline | `workflow.executionBatches` + UI「Batch #n」 | **§3.6** |
| 第15天延续：校验 / 修复 / 重试 / Timeline | `validateWorkflow`、`repairWorkflow`、`runOneStepWithRetries`、`executionTimeline` | **§4** |

---

## 一、环境与最小前置

| 步骤 | 操作 | 预期 |
|------|------|------|
| E1 | 在 `ollama-chat-day16` 执行 `npm install` → `npm run dev` | 可打开首页 |
| E2 | 本地验收：Ollama 已启动，模型与 `.env.local` 中配置一致 | Workflow 可完成 Planner + 多工具执行 |
| E3 | 浏览器打开应用，**勾选「多步 Workflow」** | 请求体带 `useWorkflow: true`，走后端 workflow 分支 |
| E4 | （可选）验收 MiMo：切换 Provider 为云端、填写密钥与模型 | 与 local 路径一致返回 `type: "workflow"` 时，以下用例同样适用 |

> 未勾选 Workflow 时的普通聊天、单步天气/总结/待办等 **非第16天 DAG 主线**，见 **§5 附录**。

---

## 二、第16天核心验收（必测）

> Planner 与模型存在随机性：同一提示可多试 1～2 次。通过标准以 **响应 JSON 中的 `workflow.steps` / `workflow.executionBatches` / `workflow.executionTimeline`** 与 **页面 Workflow 卡片** 为准，不要求 Planner 文案逐字相同。

### 2.1 Runnable 检测与层内并行（`Promise.all`）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-1a** | 勾选 Workflow，输入强并行意图（示例）：**「请拆成三步且互不依赖：1）查北京天气 2）用一句话总结我们上面聊的内容 3）列 3 条明日待办；三步之间不要 dependsOn，最后第四步再汇总前三步结果」**（可先人工发 2～3 条消息再发此句） | 返回 `type: "workflow"`；`steps.length >= 3` |
| **D16-1b** | 展开 **Execution Batch Timeline**，查看 **Batch #1** 的 `stepIds`（或 UI 中 `id:名称` 竖线分隔列表） | **第一批** 中出现 **≥2 个不同 step id**（表示同一调度层内多步被一并选中，与 `Promise.all` 语义一致） |
| **D16-1c** | 查看 **Execution Timeline** | 存在含 **「调度批次 #1（并行 … 步）」** 或等价批次边界的打点；且可见 **`queued · 批次 #n`** 类条目（与代码中入批 `queued` 一致） |
| **D16-1d** | （结构向）若 Planner 给出 **菱形依赖**（`A → B`、`A → C`、`B+C → D`） | **Batch #1** 仅含 `A`；**Batch #2** 同时含 `B` 与 `C`（顺序可按拓扑稳定序）；**Batch #3** 含 `D`。满足则 **强通过**（不强制每次 Planner 都生成，可作回归场景记录） |

**弱通过说明**：若多步始终串行成链（每批仅 1 步），记录 Planner 输出；只要 **批次索引递增、每步状态终态正确**，标为弱通过，并注明「未观测到宽并行」。

---

### 2.2 拓扑序与执行顺序（非 Planner 数组盲跑）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-2a** | 任意成功 Workflow | `executionTimeline` 中含 **「topologicalSort 预览序」** 或等价校验通过说明（与 `route.ts` 中校验后打点一致） |
| **D16-2b** | 存在 `dependsOn` 的步骤 | 下游步骤的 **`success` 时间顺序** 不早于其依赖步骤（可结合 Timeline 与 Batch 顺序综合判断） |

---

### 2.3 步骤状态机：`pending` → `queued` → `running` → `success` / `failed` / `blocked`

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-3a** | 成功完成的 Workflow | 终态步骤以 **✓** 为主；执行过程中（若网络慢可观察）可能出现 **…**（running）、**▷**（queued） |
| **D16-3b** | 对照 `page.tsx` 中 `workflowStepStatusGlyph` | **✓ / ✕ / … / ▷ / ⛔ / ○** 与状态语义一致：**blocked** 显示 **⛔** |
| **D16-3c** | 步骤上声明了 `retry` 数字时 | UI 展示 **retry：** 行，与 JSON 一致 |

---

### 2.4 失败传播与全局短路

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-4a** | （推荐用可控手段）构造 **某一步必失败** 的场景：例如 Workflow 中某 `weather` 步输入非法城市名且模型/工具返回错误，或暂时断网使某步连续失败耗尽重试 | 存在 **`status === "failed"`** 的步骤 |
| **D16-4b** | 同一张卡片上检查 **依赖该失败步的下游**（`dependsOn` 含失败步 id） | 下游为 **`blocked`**（⛔），**不应**再出现该下游的 `success` |
| **D16-4c** | 检查仍停留在「未开始」语义上的其它 pending 步 | 在 workflow 全局失败后，应被 **`sweepPendingToBlockedWhenWorkflowFailed`** 标为 **blocked**，**不得长期悬挂 pending** |
| **D16-4d** | `finalSummary` | 为 **中断说明** 类文案（非全成功合成口吻），与 `route.ts` 中失败分支一致 |

**反例（不通过）**：上游已 `failed`，下游仍 `success`；或大量步骤永久 `pending`。

---

### 2.5 Workflow DAG 可视化（前端）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-5a** | 任意含多步的 Workflow 卡片 | 卡片内存在 **「Workflow DAG（dependsOn）」** 区块 |
| **D16-5b** | 阅读列表中每一行 | 格式为 **`步骤名` + `id` +「← 依赖：」**；有依赖则列出 **id（名称）**；无依赖则出现 **「（无依赖，可与同批其它无依赖步骤并行启动）」** 提示 |
| **D16-5c** | 与步骤列表中的 **`dependsOn：`** 行 | **边关系一致**（同一 `dependsOn` 语义） |

---

### 2.6 Execution Batch Timeline（批次时间线）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-6a** | Workflow 成功后 | 卡片内存在 **「Execution Batch Timeline」**（当 `executionBatches.length > 0`） |
| **D16-6b** | 每一批展示 | **`Batch #n`** + **本地化时:分:秒** + **`| id:名称 | …`** 并行列表 |
| **D16-6c** | 与 **Execution Timeline** 中批次开始/结束打点 | **批次数量与顺序** 可互证（不要求毫秒级一致） |

---

### 2.7 第15天能力回归（与并行调度共存）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D16-7a** | 输入：**「先总结上面聊天，再据总结生成待办」** | 常见情况下 **`todo` 带 `dependsOn`** 指向 **summary**；**注入上下文预览** 可见前序要点 |
| **D16-7b** | 展开 **Execution Timeline** | 仍可见 **validate / repair / execute / retry** 等第15天风格事件（与实现保留一致） |
| **D16-7c** | **最终结果** 区块 | `finalSummary` 在 **全成功** 时为自然语言整段答复（`synthesizeWorkflowResult`），非简单步骤罗列 |

---

## 三、打卡清单（对照 §12.11）

在完成 **§二** 后，可按学习计划自评：

1. runnable step 检测：是 / 否（**D16-1**）  
2. Parallel Executor：是 / 否（**D16-1b**）  
3. `Promise.all` 并行执行：是 / 否（**D16-1b**、**D16-1c**）  
4. Step 状态机：是 / 否（**D16-3**）  
5. `blocked` / `queued`：是 / 否（**D16-3**、**D16-4**）  
6. failure propagation：是 / 否（**D16-4**）  
7. 前端 DAG：是 / 否（**D16-5**）  
8. batch timeline：是 / 否（**D16-6**）  
9. 最大问题：（自由填写）  
10. 当前系统能力：（自由填写）  

---

## 四、可选：接口与 JSON 抽查（开发者）

在浏览器开发者工具 **Network** 中选中标为成功的 `/api/chat` 请求，查看响应体：

| 检查项 | 预期 |
|--------|------|
| `type` | `"workflow"` |
| `workflow.executionBatches` | 非空数组；元素含 `batchIndex`、`stepIds[]`、`ts` |
| `workflow.executionTimeline` | 非空数组；元素含 `ts`、`message`、可选 `stepId` |
| `workflow.steps[*].status` | 仅出现白名单：`pending` \| `queued` \| `running` \| `success` \| `failed` \| `blocked`（终态不应残留 `queued` / `running`） |

---

## 五、附录：非第16天主线的冒烟

| ID | 操作 | 预期 |
|----|------|------|
| A1 | **不勾选** Workflow，发送普通问候 | 返回 `type: "chat"`，对话区文本气泡 |
| A2 | 勾选 Workflow 但输入明显单意图（如「你好」） | 可能仍为 chat 或极短 workflow；不阻塞 **§二** 结论 |
| A3 | Provider 切换、Memory 侧栏数字变化 | 与既有 day14/15 行为一致即可 |

---

## 六、缺陷记录模板

| 字段 | 说明 |
|------|------|
| 用例 ID | 如 D16-4b |
| 复现输入 | 用户原句 + 是否勾选 Workflow |
| 实际现象 | JSON 片段或截图说明 |
| 预期 | 引用上表通过标准 |
| 备注 | Provider、模型名、是否断网测试 |
