# 20 天 Ollama Agent 课程 · 手动测试用例汇总

> 面向 **`ollama-chat-day20`**（第 20 天实现）及历史各天目录的验收清单。  
> 第 20 天详细步骤见本文 **§2**；第 1–19 天为回归索引（各天完整步骤见对应目录下的 `*_test_cases.md` / `*_manual_test_cases.md`）。

---

## 0. 测试前准备（day20）

### 0.1 启动项目

```bash
cd ollama-chat-day20
npm install
npm run dev
```

浏览器打开：**http://localhost:3000**

### 0.2 推理后端（二选一）

| 模式 | 页面设置 | 环境要求 |
|------|----------|----------|
| **本地 Ollama（推荐）** | 后端 → `Ollama` | Ollama 已启动；默认 `http://localhost:11434` |
| **小米 MiMo** | 后端 → `小米 MiMo` + 选模型 | `.env.local` 配置 `XIAOMI_MIMO_API_KEY` |

### 0.3 第 20 天新增控件

| 控件 | 位置 | 作用 |
|------|------|------|
| **Storage** 下拉 | 对话区顶部 | `local` = LocalWorkflowStore；`backend` = BackendWorkflowStore + `/api/workflows` |
| 徽章 `Storage: local/backend` | 标题右侧 | 当前存储模式 |
| **多步 Workflow** | 同上 | 与第 15–19 天相同，必勾 |
| **历史 Workflow** | 右侧栏 | 经当前 Store `list()` 展示 |

### 0.4 调试日志

```text
[WorkflowStore] save <workflowId>
[WorkflowStore] get <workflowId>
[WorkflowStore] list
[WorkflowStore] delete <workflowId>
[WorkflowPersist] purged N
```

---

## 1. 二十天用例总览

| 天 | 主题 | 推荐目录 | 核心验收（一句话） | 本文件详细章节 |
|----|------|----------|-------------------|----------------|
| D01 | Next.js + Ollama 聊天雏形 | `ollama-chat-day1` | 页面能发消息并收到模型回复 | §3.1 |
| D02 | 对话历史与 UI | `ollama-chat-day2` | 多轮气泡、滚动、输入区 | §3.2 |
| D03 | 流式输出 | `ollama-chat-day3` | 助手回复逐字/逐块出现 | §3.3 |
| D04 | 流式 + 中断/错误 | `ollama-chat-day4` | 流式中断或错误有提示 | §3.4 |
| D05 | 路由/意图分发 | `ollama-chat-day5` | 天气/总结/待办等分支 | §3.5 |
| D06 | 工具调用雏形 | `ollama-chat-day6` | 非 chat 类型响应有专用卡片 | §3.6 |
| D07 | Memory 短期窗口 | `ollama-chat-day7` | 侧栏可见 shortTerm 条数变化 | §3.7 |
| D08 | Memory 长期条目 | `ollama-chat-day8` | items 列表与 importance | §3.8 |
| D09 | 记忆裁剪/注入 | `ollama-chat-day9` | 长对话后仍带关键 facts | §3.9 |
| D10 | 双后端 Ollama/MiMo | `ollama-chat-day10` | 切换 provider 仍能对话 | §3.10 |
| D11 | MiMo 模型列表 | `ollama-chat-day11` | 下拉模型 id 生效 | §3.11 |
| D12 | Planner 单步规划 | `ollama-chat-day12` | useWorkflow 产出步骤列表 | §3.12 |
| D13 | Executor 顺序执行 | `ollama-chat-day13` | 步骤状态 pending→success | §3.13 |
| D14 | 依赖与上下文注入 | `ollama-chat-day14` | dependsOn 后继能读到前驱输出 | §3.14 |
| D15 | 重试 + Timeline | `ollama-chat-day15` | retry 字段、Execution Timeline | §3.15 |
| D16 | 并行批次 | `ollama-chat-day16` | Batch Timeline、queued 状态 | §3.16 |
| D17 | 条件 DAG / judge | `ollama-chat-day17` | skipped 分支、condition 展示 | §3.17 |
| D18 | HITL 人工确认 | `ollama-chat-day18` | waiting_confirmation + 确认/取消 | §3.18 |
| D19 | localStorage 持久化 | `ollama-chat-day19` | 刷新恢复 paused、continueWorkflow | §3.19 |
| D20 | Pluggable Storage | `ollama-chat-day20` | WorkflowStore、API mock、模式切换 | **§2** |

---

## 2. 第 20 天详细用例

### TC-20-01 WorkflowStore local 主路径（必测 ⭐）

**目的：** local 模式下行为与第 19 天等价，但经 Store 抽象。

**前置：** Storage = `local`；勾选 **多步 Workflow**；Ollama 可用。

**步骤：**

1. 发送：`帮我整理今天学习内容，并生成最终提交版总结`
2. 等待 Step2 `waiting_confirmation`，点击 **确认执行** 直至 success。
3. DevTools → Application → Local Storage：存在 `workflow:<uuid>`、`workflow:index`。
4. 硬刷新页面：紫卡与确认区仍在。
5. 控制台可见 `[WorkflowStore] save` / `list`。

**通过标准：** 刷新可恢复；确认后 Step1 不重跑；无直接 `localStorage.setItem` 业务代码路径（经 Store）。

---

### TC-20-02 切换 backend 存储（必测 ⭐）

**目的：** BackendWorkflowStore + 内存 API 可 save/list/get。

**步骤：**

1. Storage 切为 `backend`（页面徽章变为 `Storage: backend`）。
2. 重复 TC-20-01 的发送与 HITL 确认流程。
3. DevTools → Network：观察 `POST /api/workflows`、`GET /api/workflows` 成功 200。
4. 刷新页面：若服务端 dev 未重启，backend 模式下应能 `list` 到刚保存的 workflow（Map 仍在进程内）。

**通过标准：** API 有请求且 JSON 含 `workflowId`、`version:1`；历史侧栏有条目。

---

### TC-20-03 local 与 backend 数据隔离

**目的：** 两种模式使用不同物理存储，互不可见。

**步骤：**

1. local 模式完成一单 workflow A，记下 id（Network 或 Storage 键）。
2. 切 backend，侧栏不应出现 A（除非 backend 也存过）。
3. backend 模式完成 workflow B。
4. 切回 local：侧栏仅有 A，无 B。

**通过标准：** 模式切换后列表与存储位置一致，不串数据。

---

### TC-20-04 purgeExpired（local / backend）

**目的：** 两种 Store 均实现 `purgeExpired`。

**步骤（任选）：**

- **A：** 将某条 `updatedAt` 改为 8 天前 → 刷新页面 → 挂载时 purge，侧栏消失。
- **B：** backend 下 `POST /api/workflows/purge` 返回 `{ removed: N }`。

**通过标准：** 过期条被删除；`[WorkflowPersist] purged` 或 API `removed > 0`。

---

### TC-20-05 delete（API 直测，backend）

**curl 示例：**

```bash
curl -X DELETE http://localhost:3000/api/workflows/<workflowId>
```

**通过标准：** 404 或 200；随后 `GET` 同 id 为 404。

---

### TC-20-06 第 19 天回归（local 模式）

在 Storage=`local` 下执行 day19 的 TC-01～TC-03（刷新恢复、不重跑 success、历史列表点击恢复）。

---

### TC-20-07 第 18 天 HITL 回归

两种 Storage 各测一次：暂停 → 确认 → 完成；取消路径 workflow `cancelled` 并持久化。

---

## 3. 第 1–19 天回归要点（简表）

> 各天完整步骤见对应项目内 `dayNN_test_cases.md`；此处仅列 **day20 仓库验收时的最小检查点**。

### 3.1 第 1 天

- 启动 `ollama-chat-day1`，发送「你好」，收到助手回复。

### 3.2 第 2 天

- 连续两轮对话，气泡上下排列，用户右助手左。

### 3.3 第 3 天

- 回复流式出现（非一次性整块）。

### 3.4 第 4 天

- 流式过程中断或错误时页面有错误提示，不白屏。

### 3.5 第 5 天

- 发送天气/总结类意图，路由到对应卡片类型。

### 3.6 第 6 天

- 天气/总结/待办卡片样式与 chat 文本气泡区分。

### 3.7 第 7 天

- 侧栏 Memory `shortTerm` 随轮次更新。

### 3.8 第 8 天

- `items` 列表展示，含 high/low 样式或标记。

### 3.9 第 9 天

- 多轮后提问「我之前说过什么」，能引用已写入的长期记忆。

### 3.10 第 10 天

- 切换 Ollama / MiMo，均能完成一轮 chat。

### 3.11 第 11 天

- MiMo 下更换模型下拉，请求成功。

### 3.12 第 12 天

- 勾选 Workflow，返回紫卡多步骤（Planner）。

### 3.13 第 13 天

- 步骤依次 `running` → `success`（或 `failed` 有 error）。

### 3.14 第 14 天

- 后继步骤 injectedContext 含前驱输出摘录。

### 3.15 第 15 天

- 步骤行展示 `retry`；卡片底 Execution Timeline 有事件。

### 3.16 第 16 天

- 存在 `queued` / Batch Timeline；无依赖步骤可同批。

### 3.17 第 17 天

- 条件不满足步骤为 `skipped` 非 `failed`；condition 行可见。

### 3.18 第 18 天

- Step `waiting_confirmation`；确认后续跑；取消整单 `cancelled`。

### 3.19 第 19 天

- localStorage 键 `workflow:*`；刷新恢复 paused；`continueWorkflow` 不重跑 success。

---

## 4. 第 20 天打卡模板

```text
【第20天打卡】

1. 是否定义 WorkflowStore 接口：是 / 否
2. 是否实现 LocalWorkflowStore：是 / 否
3. Runtime 是否不再直接依赖 localStorage：是 / 否
4. 是否实现 BackendWorkflowStore：是 / 否
5. 是否实现后端 mock API：是 / 否
6. 是否支持 save / get / list / delete：是 / 否
7. 是否能切换 local / backend store：是 / 否
8. 是否保留 purgeExpired：是 / 否
9. 是否增加 WorkflowStore debug 日志：是 / 否

10. 遇到的最大问题：

11. 当前系统能力：Persistent Conditional DAG Runtime + HITL + Pluggable Storage
```

---

## 5. 相关源码索引（day20）

| 文件 | 说明 |
|------|------|
| `lib/workflow-store.ts` | 接口与工厂 |
| `lib/local-workflow-store.ts` | local 实现 |
| `lib/backend-workflow-store.ts` | backend 实现 |
| `lib/workflow-db.ts` | 服务端 Map |
| `app/api/workflows/*` | REST mock |
| `app/page.tsx` | Storage UI + 异步持久化 |
| `day20_learning_summary.md` | 学习总结 |

---

*文档版本：2026-05-20；第 20 天用例在 day20 项目内执行，第 1–19 天可在对应 `ollama-chat-dayN` 目录做完整回归。*
