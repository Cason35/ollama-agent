# Day 17 手动测试用例（Conditional DAG · judge · condition · skipped）

本文档对照 **`ollama-chat-day16/day16_learning_summary.md` §8（第17天）** 与当前实现：`ollama-chat-day17/app/api/chat/route.ts`（`evaluateCondition`、`runWorkflowJudge`、`getJudgeResultValue`、`buildSuccessStepOutputsRecord`、`repairWorkflowConditionDependsOn`、`validateWorkflow` 对 `condition` 的校验、`[Condition]` 调试日志、`skipped` 与依赖汇合语义）、`ollama-chat-day17/app/page.tsx`（`skipped` 样式 **⏭️**、`condition` 行、「分支跳过」说明、输出摘录占位）。

---

## 学习目标 ↔ 验收映射

| 学习计划要点（§8） | 本仓库中的体现 | 用例锚点 |
|-------------------|----------------|----------|
| 任务 1：`WorkflowStep.condition` / `skipped` | `WorkflowStep` 类型与执行前 `shouldRun` 分支 | **§3.1**、**§3.2** |
| 任务 2：`judge` action | `runWorkflowJudge`、`WORKFLOW_ALLOWED_ACTIONS` | **§3.1** |
| 任务 3：`evaluateCondition` | `equals` / `includes` / `truthy` + `getJudgeResultValue` | **§3.2**、**§4** |
| 任务 4：Executor `skipped` | `runOneStepWithRetries` 前置判定、`skipReason`、`durationMs: 0` | **§3.2** |
| 任务 5：Planner 条件分支 | `planWorkflowSteps` 内 Planner 提示词 | **§3.3** |
| 任务 6：Validator / repair | `validateWorkflow`、`repairWorkflowConditionDependsOn` | **§3.4** |
| 任务 7：前端展示 | `condition：` 行、琥珀色 skipped 卡片、`branch skip` 文案 | **§3.5** |
| 任务 8：Condition Debug | `[Condition]` 结构化 `console`（服务端终端） | **§3.6** |

---

## 一、环境与最小前置

| 步骤 | 操作 | 预期 |
|------|------|------|
| E1 | 在 `ollama-chat-day17` 执行 `npm install` → `npm run dev` | 可打开首页 |
| E2 | 本地验收：Ollama 已启动，模型与 `.env.local`（若使用）一致 | Planner / judge / 各工具可调用 |
| E3 | 浏览器打开应用，**勾选「多步 Workflow」** | 请求体带 `useWorkflow: true` |
| E4 | （可选）MiMo 云端：切换 Provider、密钥与模型 | 与 local 路径同一套 Workflow JSON 语义 |

> Planner 与模型有随机性：同一提示可多试 1～2 次。通过标准以 **`workflow.steps` 终态**、**UI Workflow 卡片**、必要时 **Network 响应 JSON** 为准。

---

## 二、第17天核心验收（必测）

### 2.1 `judge` 步骤与结构化输出

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-1a** | 勾选 Workflow，输入含「判断 / 如果…就…」的复合需求（学习计划示例）：**「帮我检查今天的学习总结：如果内容不完整就生成补充任务；如果已经完整就生成复盘总结。下面是我的总结：……」**（粘贴一段故意「缺项」或「完整」的文本） | 返回 `type: "workflow"`；步骤中出现 **`action === "judge"`**（名称可为「判断…」类） |
| **D17-1b** | 展开该 judge 步骤在卡片中的 **输出摘录** | 为合法 JSON 形态或可被解析的结构，含 **`result`** 与 **`reason`** 字段语义（与 `runWorkflowJudge` 约定一致：`complete` \| `incomplete` 等字符串） |
| **D17-1c** | 若暂时无法连接模型（断网 / Ollama 未启） | judge 步仍应 **结束于可控路径**（实现侧保守返回 `incomplete` 类结果）；不应使整个路由无响应（对照 `route.ts` 中 judge 失败分支） |

**弱通过**：Planner 未生成 `judge` 但生成了其它链式步骤——记录原始 `workflow.steps`，单独作为 Planner 回归样本，**不替代** D17-1a 的主线结论。

---

### 2.2 `condition` + `skipped`（条件未命中 = 正常跳过，非失败）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-2a** | 在同一张 Workflow 卡片上，找到 **两条（或多条）互斥分支**，均 `dependsOn` 同一 judge 步骤 id | 各分支步骤对象含 **`condition`**：`fromStepId` 指向该 judge、`operator` 为 **`equals`**（常见）且 **`value`** 与 judge 的 `result` 语义对齐（如 `complete` / `incomplete`） |
| **D17-2b** | 观察终态 | **命中分支**为 **`success`**；**未命中分支**为 **`skipped`**（图标 **⏭️**），**不是** `failed` |
| **D17-2c** | 查看 skipped 步骤 | 存在 **`skipReason`**（服务端写入 **`condition not matched`**）；UI **「分支跳过：」** 行展示一致或等价文案 |
| **D17-2d** | 查看 skipped 步骤 **durationMs**（开发者 Network） | 预期为 **`0`**（未调用模型即跳过） |
| **D17-2e** | （汇合场景）若存在依赖 judge 的「汇总」步骤，且汇总依赖 **两条分支 id** | 在一分支 `skipped`、另一分支 `success` 时，汇总步仍可 **`success`**（`getRunnableSteps`：**依赖可为 `success` 或 `skipped`**）；且 **`skipped` 不提供 `stepOutputs` 条目**（条件读取仅来自 **已成功** 步骤——见 `buildSuccessStepOutputsRecord`） |

**反例（不通过）**：条件仅「未命中」却标记为 `failed`；或双分支同时 `success` 且无理由（除非 Planner 未配互斥 condition）。

---

### 2.3 Planner：自然语言触发条件分支

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-3a** | 使用触发词之一：**「如果…就…」「判断…然后…」「根据结果…」「不完整则…完整则…」** + 明确两类后续动作 | `steps` 中较易出现 **`judge` + 多条带 `condition` 的步骤** |
| **D17-3b** | 核对 **互斥分支** 的 `condition.value` | 与 judge 提示中允许的 **`result` 枚举**一致（常用 `complete` / `incomplete`）；不等则观察 **哪条分支被 skipped** 是否符合 judge 输出 |

---

### 2.4 Validator 与 `repairWorkflowConditionDependsOn`

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-4a** | （间接验收）正常使用 Planner 生成的条件工作流 | **`condition.fromStepId`** 出现在对应步骤的 **`dependsOn`** 中；若 Planner 漏写，**repair** 应补齐（`repairWorkflowConditionDependsOn`），最终仍能 **`validateWorkflow` 通过** |
| **D17-4b** | （开发者）构造非法 payload（仅建议在本地临时改请求或使用接口调试）：`condition.fromStepId` 指向不存在 id、`operator` 非法、`equals`/`includes` 下 **`value` 为空字符串** | `executeWorkflow` 前应被 **`validateWorkflow` 拦截**，响应中带 **`errors[]` 说明**（与 `route.ts` 校验文案一致） |

---

### 2.5 前端展示（条件分支可读性）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-5a** | 任意含 `condition` 的步骤 | 卡片内展示 **`condition：`** 行：**`from=`**、`operator`、`value`（`truthy` 可无值时显示「truthy / 空值」类提示） |
| **D17-5b** | `skipped` 步骤 | 行底色与 **failed/blocked** 明显区分（琥珀色系）；状态符为 **⏭️** |
| **D17-5c** | **输出摘录** | skipped 为 **`—（本分支未执行）`** |

---

### 2.6 Condition Debug 日志（服务端）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-6a** | 运行 `npm run dev`，终端保持可见 | 执行带条件的 Workflow 时，服务端打印 **`[Condition]`**（或实现中等价结构化日志），字段包含 **`stepId`、`fromStepId`、`operator`、`expected`、`actual`、`matched`** 等语义 |
| **D17-6b** | 对照 UI | **`matched: true`** 的步骤最终应执行；**`matched: false`** 应对应 **`skipped`** |

---

## 三、第16天并行 DAG 回归（与条件分支共存）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D17-R1** | 勾选 Workflow，发送 **Day16** 式强并行用例（多步无依赖或菱形依赖 + 汇总） | 仍可见 **`executionBatches`**、批次并行语义；与 **D17** 步骤不冲突 |
| **D17-R2** | 全局失败场景（某步 `failed`） | 下游仍为 **`blocked`**（§16 语义保留）；**勿与 `skipped` 混淆** |

---

## 四、打卡清单（对照 §8.5）

在完成 **§二** 后自评：

1. judge action：是 / 否（**D17-1**）  
2. judge 结构化输出稳定：是 / 否（**D17-1b**）  
3. condition 字段：是 / 否（**D17-2a**）  
4. evaluateCondition 生效：是 / 否（**D17-2b**、**D17-6**）  
5. skipped 状态：是 / 否（**D17-2**）  
6. 条件不满足跳过步骤：是 / 否（**D17-2b**）  
7. Planner 生成条件分支：是 / 否（**D17-3**）  
8. Validator 检查 condition：是 / 否（**D17-4**）  
9. 前端展示 skipped / condition：是 / 否（**D17-5**）  
10. condition debug 日志：是 / 否（**D17-6**）  
11. 遇到的最大问题：（自由填写）  
12. 当前系统能力：（自由填写）  

---

## 五、可选：Network JSON 抽查（开发者）

在浏览器 **Network** 中选中 `/api/chat` 成功响应：

| 检查项 | 预期 |
|--------|------|
| `workflow.steps[*].action` | 可出现 **`judge`** |
| `workflow.steps[*].condition` | 含 `fromStepId`、`operator`、`value`（`truthy` 允许空串语义） |
| `workflow.steps[*].status` | 含 **`skipped`**；终态不应残留 `queued` / `running` |
| `workflow.steps[*].skipReason` | 仅在 **`skipped`** 时有意义 |
| `workflow.executionTimeline` | 可含 **`skipped：condition not matched`** 类消息（与 `appendTimeline` 一致） |

---

## 六、附录：非第17天主线的冒烟

| ID | 操作 | 预期 |
|----|------|------|
| A1 | **不勾选** Workflow，普通问候 | `type: "chat"` |
| A2 | 勾选 Workflow，单一闲聊句 | 可能短 workflow 或 chat；不阻塞 **§二** |
| A3 | 页面副标题 **Conditional DAG · judge · condition · skipped** | 与 `page.tsx` / `layout.tsx` 描述一致即可 |

---

## 七、缺陷记录模板

| 字段 | 说明 |
|------|------|
| 用例 ID | 如 D17-2b |
| 复现输入 | 用户原句 + 是否勾选 Workflow + 粘贴材料摘要 |
| 实际现象 | `workflow.steps` 片段或截图 |
| 预期 | 引用上表通过标准 |
| 备注 | Provider、模型名、终端是否可见 `[Condition]` 日志 |
