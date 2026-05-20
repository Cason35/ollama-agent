# 第19天测试用例：Workflow 持久化 + 恢复执行

> 面向 **`ollama-chat-day19`** 页面与 API 的手动测试清单。  
> 学习说明见 [`day19_learning_summary.md`](./day19_learning_summary.md)；任务 blueprint 见 `ollama-chat-day18/day18_learning_summary.md` §14。

---

## 0. 测试前准备

### 0.1 启动项目

```bash
cd ollama-chat-day19
npm install
npm run dev
```

浏览器打开：**http://localhost:3000**

### 0.2 后端依赖（二选一）

| 模式 | 页面设置 | 环境要求 |
|------|----------|----------|
| **本地 Ollama（推荐）** | 后端 → `Ollama` | Ollama 已启动；默认 `http://localhost:11434` |
| **小米 MiMo** | 后端 → `小米 MiMo` + 选模型 | `.env.local` 配置 `XIAOMI_MIMO_API_KEY` |

### 0.3 页面控件对照（`app/page.tsx`）

| 控件 | 位置 | 作用 |
|------|------|------|
| **多步 Workflow** 复选框 | 对话区顶部 | **必须勾选** |
| **历史 Workflow** 列表 | 右侧栏顶部 | 展示 localStorage 中的 goal / status / 时间；点击恢复卡片 |
| **已从本地恢复暂停 Workflow** 徽章 | 标题右侧 | 刷新后自动恢复了 paused 单时出现 |
| Workflow 紫卡 + 天蓝确认区 | 对话区 | 与第18天相同；confirm 会带 `resumeContext` |
| DevTools → Application → Local Storage | 浏览器 | 键名 `workflow:{uuid}`、`workflow:index` |

### 0.4 服务端日志（可选）

```text
[WorkflowPersist] { workflowId, action: "hydrate-from-client" }  // 刷新后 confirm 重建 pause-store
[HITL] { workflowId, stepId, status, decision }
[WorkflowPersist] purged N  // 挂载时过期清理（若有过期项）
```

---

## 1. 用例总览

| 编号 | 用例名称 | 覆盖第19天验收点 |
|------|----------|------------------|
| TC-01 | 持久化主路径：暂停 → 刷新 → 恢复 → 确认完成 | #1–5, #7–9 |
| TC-02 | 已成功 step 不重复执行 | #5 |
| TC-03 | 历史 Workflow 列表展示与点击恢复 | #6 |
| TC-04 | localStorage 键与 version 校验 | #1, #9 |
| TC-05 | timeline / stepOutputs 写入快照 | #8 |
| TC-06 | 取消后持久化状态为 cancelled | 回归 |
| TC-07 | confirm 无服务端上下文但有 resumeContext | #5, #7 |
| TC-08 | 过期清理（可选，改系统时间或 mock） | #10 |
| TC-09 | 第18天 HITL 回归（未刷新路径） | 回归 |

---

## 2. 详细用例

### TC-01 刷新后恢复 paused Workflow（必测 ⭐）

**目的：** 验证 WorkflowState 写入 localStorage，刷新后仍能看到 `waiting_confirmation` 与确认按钮。

**前置：** 勾选 **多步 Workflow**；Ollama 可用。

**步骤：**

1. 发送：

   > 帮我整理今天学习内容，并生成最终提交版总结

2. 等待 Workflow 卡出现：Step1 `success`，Step2 `waiting_confirmation`（⏸️），底部有 **确认执行 / 取消**。
3. 打开 DevTools → Application → Local Storage → `http://localhost:3000`，确认存在：
   - `workflow:index`（JSON 数组，含 workflow id）
   - `workflow:<uuid>`（JSON 内含 `version: 1`、`status: "paused"`、`stepOutputs`、`timeline`）
4. **硬刷新页面**（F5 或 Ctrl+R）。
5. 观察：
   - 对话区自动出现恢复的 Workflow 紫卡（或侧栏点击历史条目恢复）。
   - Step2 仍为 `waiting_confirmation`，确认区仍在。
   - 标题旁可能出现 **已从本地恢复暂停 Workflow** 徽章。
6. 点击 **确认执行**，等待 Step2 `success`，整单完成。

**通过标准：**

- 刷新后 **无需重新发送** 用户消息即可看到暂停态。
- 确认后 **Step1 仍为 success**（未变回 pending/running）。
- `finalSummary` 变为最终汇总（非暂停说明）。

---

### TC-02 已成功 step 不重复执行（必测 ⭐）

**目的：** 验证 `continueWorkflow` 不会 replan，也不会重跑 success 步骤。

**步骤：**

1. 完成 TC-01 至 Step1 成功、Step2 等待确认。
2. 在 DevTools Network 中点击 **确认执行**，观察 `POST /api/workflow/confirm` 请求体含 `resumeContext.workflow`。
3. 确认执行期间，步骤列表中 **仅 Step2** 出现 `running` → `success`；Step1 始终保持 `success`。
4. （可选）对比 Step1 的 `durationMs` / 输出摘录刷新前后一致。

**通过标准：** Step1 无第二次 `running`；终端无新的 Step1 工具调用日志。

---

### TC-03 历史 Workflow 列表（必测 ⭐）

**目的：** 验收任务 4「历史 Workflow 列表」。

**步骤：**

1. 至少完成 2 次不同的 Workflow 请求（或 1 次 paused + 1 次 success）。
2. 查看右侧 **历史 Workflow** 区域：
   - 每条显示 **goal 摘要**、`status` 徽章（`paused` / `success` 等）、**本地化时间**。
   - paused 项显示 `⏸ <步骤名>`（若有 `waitingStepName`）。
3. 清空对话区气泡（刷新页面后若未自动恢复，可手动观察列表仍在）。
4. 点击某条 **success** 历史 → 对话区追加对应 Workflow 卡（只读回顾，无确认区）。
5. 点击 **paused** 历史 → 恢复卡含确认区。

**通过标准：** 列表按 `updatedAt` **最近在前**；点击可恢复卡片。

---

### TC-04 localStorage 结构与 version（建议）

**步骤：**

1. 在 Application 中打开任意 `workflow:<id>` JSON。
2. 检查字段：
   - `version` === `1`
   - `workflowId`、`goal`、`steps`、`stepOutputs`、`timeline`、`createdAt`、`updatedAt`
   - `paused` / `waitingStepId`（暂停时）
   - `memory` 或 `memorySnapshot`

**通过标准：** 字段齐全；手动将 `version` 改为 `2` 后刷新，`loadWorkflowState` 应忽略（列表不展示或点击提示不存在）。

---

### TC-05 timeline 与 stepOutputs（建议）

**步骤：**

1. 在 TC-01 暂停态，打开 `workflow:<id>`。
2. 确认 `timeline` 数组含 `⏸️` 等待确认事件。
3. 确认 `stepOutputs` 含 Step1 的 id 键及输出对象/字符串。

**通过标准：** 与页面 Execution Timeline、Step1 输出摘录一致。

---

### TC-06 取消后持久化（建议）

**步骤：**

1. 触发 HITL 暂停后点击 **取消**。
2. 检查 localStorage 中该条 `status` 为 `cancelled`。
3. 刷新页面，恢复的卡 **无** 确认区，`workflow.status` 为 `cancelled`。

**通过标准：** 与第18天策略 A 行为一致，且本地状态已更新。

---

### TC-07 刷新后 confirm 带 resumeContext（必测 ⭐）

**目的：** 服务端进程内 pause-store 在刷新后为空，靠客户端快照续跑。

**步骤：**

1. TC-01 暂停后 **刷新页面**（不重启 dev server 亦可）。
2. 打开 Network，点击 **确认执行**。
3. 检查 `POST /api/workflow/confirm` 请求体：
   - 含 `resumeContext.workflow`（完整 steps）
   - 含 `resumeContext.memory`
4. 响应 HTTP **200**（非 404）。

**通过标准：** 无 404；终端可能出现 `[WorkflowPersist] hydrate-from-client`。

---

### TC-08 过期清理（可选）

**说明：** 默认 `WORKFLOW_STATE_EXPIRE_MS = 7 天`。

**步骤（二选一）：**

- **A：** 在 DevTools 中将某条 `updatedAt` 改为 8 天前，刷新页面，该条从历史列表消失。
- **B：** 单元级：调用 `purgeExpiredWorkflowStates()` 返回删除条数 > 0。

**通过标准：** 过期项从 `workflow:index` 与 `workflow:<id>` 移除。

---

### TC-09 第18天 HITL 回归（未刷新）

**步骤：** 不刷新页面，完成「暂停 → 确认 → 完成」全流程。

**通过标准：** 与 day18 一致；localStorage 在每次状态变化后更新 `updatedAt`。

---

## 3. 第19天打卡模板

```text
【第19天打卡】

1. 是否实现 WorkflowState：是 / 否
2. 是否实现 localStorage 持久化：是 / 否

3. 页面刷新后是否能恢复 workflow：是 / 否
4. waiting_confirmation 是否能恢复：是 / 否

5. 已成功 step 是否不会重复执行：是 / 否
6. confirm 后是否能从 paused workflow 继续：是 / 否

7. 是否实现历史 workflow 列表：是 / 否
8. 是否保存 timeline / stepOutputs：是 / 否

9. 是否加入 version：是 / 否
10. 是否实现过期清理：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：Persistent Conditional DAG Runtime + HITL
```

---

## 4. 相关文件

| 文件 | 说明 |
|------|------|
| `lib/workflow-types.ts` | `WorkflowState`、`WorkflowStateListItem` |
| `lib/workflow-persistence.ts` | save/load/list/purge |
| `lib/workflow-executor.ts` | `continueWorkflow` |
| `app/page.tsx` | 持久化、历史列表、挂载恢复 |
| `app/api/workflow/confirm/route.ts` | `resumeContext` hydrate |
| `day19_learning_summary.md` | 实现说明与打卡 |

---

*文档版本：与 ollama-chat-day19 代码同步。*
