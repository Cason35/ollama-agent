# 第18天测试用例：Conditional DAG + HITL

> 面向 **`ollama-chat-day18`** 页面与 API 的手动测试清单。  
> 学习说明见 [`day18_learning_summary.md`](./day18_learning_summary.md)；任务 blueprint 见 `ollama-chat-day17/day17_learning_summary.md` §8。

---

## 0. 测试前准备

### 0.1 启动项目

```bash
cd ollama-chat-day18
npm install
npm run dev
```

浏览器打开：**http://localhost:3000**

### 0.2 后端依赖（二选一）

| 模式 | 页面设置 | 环境要求 |
|------|----------|----------|
| **本地 Ollama（推荐）** | 后端 → `Ollama` | Ollama 已启动；默认 `http://localhost:11434`；模型如 `qwen2.5:14b`（见 `.env.local` 或默认） |
| **小米 MiMo** | 后端 → `小米 MiMo` + 选模型 | 项目根 `.env.local` 配置 `XIAOMI_MIMO_API_KEY` |

### 0.3 页面控件对照（`app/page.tsx`）

测试前确认你操作的是这些 UI 元素：

| 控件 | 位置 | 作用 |
|------|------|------|
| **多步 Workflow** 复选框 | 对话区顶部工具栏 | **必须勾选**，否则走单步路由，不会出现 HITL |
| **后端** 下拉 | 同上 | `Ollama` / `小米 MiMo` |
| **模型** 下拉 | 仅 MiMo 时显示 | 请求体 `mimoModel` |
| 顶部徽章 | 标题右侧 | `Workflow 开` = 已勾选 Workflow |
| **发送** 按钮 / Enter | 底部输入区 | 触发 `handleSend` → `POST /api/chat` |
| Workflow 紫卡 | 助手回复区 | 步骤列表、DAG、Batch Timeline、Execution Timeline |
| **该步骤需要确认** 天蓝区 | Workflow 卡底部（`paused` 时） | **确认执行** / **取消** → `POST /api/workflow/confirm` |
| 红色顶栏 | 全局 | `errorText`（网络/参数/404 暂停上下文等） |
| **长期记忆** 侧栏 | 右侧 | `shortTerm` / `items` 数量；每轮请求会回传 `memory` |

### 0.4 服务端日志（可选）

在运行 `npm run dev` 的终端观察：

```text
[HITL] { workflowId, stepId, status, decision: "pause" | "confirm" | "cancel" }
[Workflow] start: ...
```

---

## 1. 用例总览

| 编号 | 用例名称 | 覆盖第18天验收点 |
|------|----------|------------------|
| TC-01 | HITL 主路径：暂停 → 确认 → 完成 | #1–5, #7, #9 |
| TC-02 | HITL 取消（策略 A） | #6 |
| TC-03 | 未开 Workflow 不回 HITL | 回归 |
| TC-04 | 步骤 UI：`waiting_confirmation` 与 HITL 字段展示 | #2, #4, #9 |
| TC-05 | Timeline 含 ⏸️ 与 👤 事件 | #9, #10 |
| TC-06 | 确认后再次 HITL（多关键步，可选） | #3, #5 |
| TC-07 | confirm API 异常：404 / 重复提交 | 健壮性 |
| TC-08 | 第17天 + 第18天：条件分支与 HITL 并存（可选） | 衔接 |

---

## 2. 详细用例

### TC-01 HITL 主路径（必测 ⭐）

**目的：** 验证 Planner 产出 `requiresConfirmation`、Executor 暂停、前端确认后续跑完成。

**前置：** 勾选 **多步 Workflow**；Ollama 可用。

**步骤：**

1. 在输入框粘贴并发送：

   ```text
   帮我整理今天学习内容，并生成最终提交版总结
   ```

2. 等待加载结束（按钮从「处理中」恢复「发送」）。

**预期结果：**

| 检查项 | 预期 |
|--------|------|
| 回复形态 | 出现 **Workflow · …** 紫色卡片，不是普通「助手」灰气泡 |
| 步骤 1 | 状态符号 **✓**（`success`），有输出摘录 |
| 步骤 2（或 Planner 命名的「最终/提交」步） | 符号 **⏸️**（`waiting_confirmation`），高亮天蓝边框 |
| 步骤行 HITL 标签 | 显示 `HITL：requiresConfirmation · …confirmationMessage…` |
| 等待确认行 | `等待确认：` + 确认文案 |
| 输出摘录 | `—（等待用户确认，尚未执行）` |
| 卡片底部 | 天蓝区 **「该步骤需要确认」** + **确认执行** + **取消** |
| 底部文案标题 | **「当前状态」**（非「最终结果」） |
| `finalSummary` | 含「暂停」「等待您确认」类说明，**不是**完整最终总结 |
| 顶栏徽章 | 仍显示 `Workflow 开` |
| 终端日志 | 出现 `[HITL]` 且 `decision: "pause"` |

3. 点击 **确认执行**。

**预期（确认后）：**

| 检查项 | 预期 |
|--------|------|
| 加载 | 再次「处理中」，按钮 disabled |
| 待确认步 | **✓** `success`，有正常输出摘录 |
| 天蓝确认区 | **消失** |
| 底部标题 | **「最终结果」** |
| `finalSummary` | 连贯中文最终答复（非暂停提示） |
| Execution Timeline | 含 `👤 用户已确认，继续执行：…` |
| 终端 | `[HITL]` `decision: "confirm"` |

**通过标准：** TC-01 全部检查项符合。

---

### TC-02 用户取消（策略 A）

**目的：** 取消后整单 `cancelled`，后续步不执行。

**步骤：**

1. 重复 TC-01 的发送，直到再次出现 HITL 确认区。
2. 点击 **取消**（不要点确认）。

**预期结果：**

| 检查项 | 预期 |
|--------|------|
| 被取消步 | **⏭️** 或 skipped 样式；`分支跳过：user cancelled` |
| 后续 pending 步 | **⛔** `blocked` 或带「工作流已取消：本步骤未执行」 |
| Workflow 整单 | 逻辑上为取消（`finalSummary` 含「用户取消」「未继续执行」） |
| 确认区 | 消失 |
| 底部 | 「最终结果」+ 取消说明 |
| Timeline | 含「用户取消步骤 … 工作流已终止（策略 A）」 |
| 终端 | `[HITL]` `decision: "cancel"` |

**通过标准：** 无步骤在取消后继续变成 `success`（除取消前已完成的步）。

---

### TC-03 未开启 Workflow（回归）

**目的：** 单步模式不应出现 HITL UI。

**步骤：**

1. **取消勾选**「多步 Workflow」。
2. 发送同一句：`帮我整理今天学习内容，并生成最终提交版总结`。

**预期：**

- 回复为 **助手** 灰气泡或 **总结** 黄卡等，**无** Workflow 紫卡。
- **无**「确认执行 / 取消」按钮。

**通过标准：** 不出现 `waiting_confirmation` 相关 UI。

---

### TC-04 步骤卡片字段展示

**目的：** 对照 `page.tsx` 渲染与第18天类型字段。

**前置：** 完成 TC-01 至暂停态即可。

**在 Workflow 卡内逐步核对：**

| UI 区块 | 对应字段 / 逻辑 |
|---------|-----------------|
| 步骤名 + `step-id` 徽章 | `step.name`, `step.id` |
| `summary` / `chat` 等 | `step.action` |
| `HITL：requiresConfirmation` | `step.requiresConfirmation`, `confirmationMessage` |
| ⏸️ 与 sky 高亮 | `status === "waiting_confirmation"` |
| `dependsOn`  chips | `step.dependsOn` |
| `condition` 行（若有） | 第17天字段，可与 HITL 共存 |
| Workflow DAG 列表 | 依赖边展示 |
| Execution Batch Timeline | `executionBatches`（第16天，HITL 暂停前已有批次） |

**通过标准：** 待确认步上 HITL 与等待确认文案均可见。

---

### TC-05 Execution Timeline 与 HITL 事件

**目的：** 验收 Timeline #9、日志 #10。

**步骤：** TC-01 全流程（暂停 → 确认）。

**在卡片「Execution Timeline」中按时间顺序查找：**

| 序号 | 消息应包含（关键字） |
|------|----------------------|
| 1 | `validate` / `校验` |
| 2 | `executeWorkflow 启动` |
| 3 | 首批步骤 `success` / `started` |
| 4 | **`⏸️`** + `等待用户确认` |
| 5 | **`👤 用户已确认`** |
| 6 | 确认步 `success` |

**通过标准：** 至少出现 4 与 5 两条 HITL 专用事件。

---

### TC-06 连续多个 HITL 步（可选）

**目的：** 确认后若下一步仍需确认，应再次暂停。

**输入示例：**

```text
先总结今天的学习内容，再生成最终提交版总结并发布到群里（发布前让我确认）
```

**说明：** 依赖 Planner 是否为多步都标 `requiresConfirmation`；模型输出不稳定时可多试 1～2 次。

**预期（若 Planner 配合）：**

1. 第一次暂停 → 确认 → 执行一步。
2. 再次返回 `paused: true`，确认区 **再次出现**，`waitingStepId` 指向另一步。
3. 全部确认后 `paused: false`，生成最终汇总。

**通过标准：** 第二次暂停时 `POST /api/workflow/confirm` 仍成功（`savePausedWorkflow` 覆盖新上下文）。

---

### TC-07 API 异常与边界

#### TC-07a 暂停后重启 dev 服务

1. 做到 TC-01 暂停态。
2. **停止** `npm run dev` 再 **启动**。
3. 点击 **确认执行**。

**预期：** 顶栏红色错误，如「未找到暂停的工作流」；confirm 返回 404。

#### TC-07b 加载中不可重复点

1. 暂停态点击 **确认执行** 后立刻观察。

**预期：** 确认/取消按钮 `disabled`；输入区与 Workflow 复选框 `disabled`（`loading === true`）。

#### TC-07c 空输入

**预期：** 不发送；无请求。

---

### TC-08 条件分支 + HITL（可选，第17+18）

**输入示例：**

```text
先判断我今天学习记录是否完整：不完整就只列待补项，完整则整理学习内容并生成最终提交版总结（提交前让我确认）
```

**预期要点：**

- 存在 `judge` 步与 `condition` 行（页面 `condition：from=…`）。
- 「最终提交」相关步带 `requiresConfirmation`。
- 未命中分支为 `skipped`（⏭️），不是 `failed`。
- HITL 仍只在需确认且依赖已满足的步触发。

---

## 3. API 级快速验证（可选）

在 TC-01 暂停后，从浏览器 DevTools → Network 复制 `workflow.id` 与 `waitingStepId`，或用最近一次响应 JSON。

### 3.1 确认续跑

```bash
curl -s -X POST http://localhost:3000/api/workflow/confirm \
  -H "Content-Type: application/json" \
  -d "{\"workflowId\":\"<粘贴 workflow.id>\",\"stepId\":\"<粘贴 waitingStepId>\",\"decision\":\"confirm\",\"memory\":{\"shortTerm\":[],\"items\":[]},\"provider\":\"local\"}"
```

**预期：** HTTP 200；`type: "workflow"`；`paused: false`（若无第二步 HITL）；`workflow.steps` 中目标步 `success`。

### 3.2 取消

```bash
curl -s -X POST http://localhost:3000/api/workflow/confirm \
  -H "Content-Type: application/json" \
  -d "{\"workflowId\":\"<id>\",\"stepId\":\"<stepId>\",\"decision\":\"cancel\",\"memory\":{\"shortTerm\":[],\"items\":[]},\"provider\":\"local\"}"
```

**预期：** `workflow.status` 为 `cancelled`（JSON 内可见）；`paused: false`。

### 3.3 非法参数

```bash
curl -s -X POST http://localhost:3000/api/workflow/confirm \
  -H "Content-Type: application/json" \
  -d "{\"workflowId\":\"\",\"stepId\":\"\",\"decision\":\"maybe\"}"
```

**预期：** HTTP 400。

---

## 4. 推荐测试输入速查

复制到页面输入框即可：

| 场景 | 推荐输入 |
|------|----------|
| **标准 HITL（必测）** | `帮我整理今天学习内容，并生成最终提交版总结` |
| 强调不可逆 | `总结今日学习要点，然后覆盖写入最终提交版文档（执行前问我）` |
| 删除类（Planner 可能标确认） | `整理学习笔记，并删除草稿文件夹里的旧版本（删除前确认）` |
| 无 HITL 对照 | `用三句话总结 React Hooks`（仅 1～2 步，通常无确认） |
| 条件 + HITL | 见 TC-08 |

> Planner 由模型生成，步骤 id/名称可能略有差异；以 **是否存在 `requiresConfirmation` + ⏸️ 暂停** 为准。

---

## 5. 第18天验收勾选表

测试完成后可在表中打勾：

```text
【第18天测试打卡】

环境：Ollama □  MiMo □   日期：________

[ ] TC-01  暂停 → 确认 → 完成
[ ] TC-02  取消 → cancelled / blocked
[ ] TC-03  未开 Workflow 无 HITL
[ ] TC-04  步骤卡 HITL / waiting_confirmation UI
[ ] TC-05  Timeline ⏸️ 与 👤
[ ] TC-06  连续 HITL（可选）
[ ] TC-07  404 / loading 边界
[ ] TC-08  condition + HITL（可选）

1. requiresConfirmation 在步骤上可见：是 / 否
2. waiting_confirmation（⏸️）出现：是 / 否
3. Executor 暂停（未执行待确认步）：是 / 否
4. 确认按钮展示：是 / 否
5. 确认后续跑成功：是 / 否
6. 取消后 workflow 停止：是 / 否
7. Planner 生成确认步：是 / 否
8. [HITL] 终端日志：是 / 否

问题记录：
_________________________________________________
```

---

## 6. 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 无 Workflow 卡，只有普通回复 | 未勾选「多步 Workflow」 | 勾选后重发 |
| 两步都直接 ✓，无 ⏸️ | Planner 未标 `requiresConfirmation` | 换 TC-01 文案或强调「最终提交版」；看步骤行有无 `HITL：` |
| 确认报「未找到暂停的工作流」 | 服务重启或重复 confirm | 重新从 TC-01 发起 |
| 一直「处理中」 | Ollama 未启动 / 模型超时 | 检查 `ollama serve` 与模型是否已 pull |
| MiMo 503 | 未配置 `XIAOMI_MIMO_API_KEY` | 配置 `.env.local` 或改回 Ollama |
| 取消后仍有步在执行 | 不应出现 | 记 bug：应对齐策略 A |

---

## 7. 与自动化测试的关系

当前仓库 **无** 针对 HITL 的 E2E 脚本；本文件为 **手动测试** 专用。  
若后续补充 Playwright，可优先自动化：TC-01（mock Planner JSON）与 TC-07a（404）。
