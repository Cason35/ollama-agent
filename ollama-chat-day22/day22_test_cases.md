# 22 天 Ollama Agent 课程 · 第 22 天测试用例（Tool Registry）

> 面向 **`ollama-chat-day22`**。第 21 天用例见 `ollama-chat-day21/day21_test_cases.md`。  
> 本文 **§2** 为第 22 天主线（Tool Registry）；**§3** 为 day21 Upsert 回归（本仓库仍保留）。

---

## 0. 测试前准备

### 0.1 环境

```bash
cd ollama-chat-day22
npm install
npm run dev
```

浏览器：**http://localhost:3000**

可选（backend 持久化 / Upsert 回归）：MySQL 已执行 `scripts/init-mysql.sql`，`.env.local` 配置 `MYSQL_*`。

### 0.2 第 22 天验收焦点

| 对比项 | day21 | day22 |
|--------|-------|-------|
| 工具分发 | Executor `if/else` | **`ToolRegistry.execute`** |
| Planner 工具列表 | Prompt 写死 | **`registry.list()` 动态生成** |
| 入参校验 | 无统一 Validator | **`validateToolInput`** |
| 可观测性 | 无工具清单 UI | **侧栏 Tool Explorer + GET /api/tools** |

### 0.3 调试要点

- 终端 / 构建日志：`[ToolRegistry] register weather` 等（启动时注册）。
- 执行 workflow 步骤时：`[ToolRegistry] execute { tool, stepId }`。
- 校验失败：`[ToolRegistry] validation failed` + 步骤 `failed` 与 `error` 含「缺少 city」等文案。
- DevTools → Network：`GET /api/tools` 返回 5 个工具描述。

---

## 1. 用例总览

| 编号 | 主题 | 优先级 |
|------|------|--------|
| TC-22-01 | GET /api/tools 返回已注册工具 | ⭐ 必测 |
| TC-22-02 | 侧栏 Tool Explorer 展示工具 | ⭐ 必测 |
| TC-22-03 | Workflow 天气步骤正常执行 | ⭐ 必测 |
| TC-22-04 | weather 缺 city 触发 Validator | ⭐ 必测 |
| TC-22-05 | 服务端 Registry 注册日志 | 必测 |
| TC-22-06 | 执行步骤时 execute 日志 | 必测 |
| TC-22-07 | Planner 使用动态工具（间接） | 必测 |
| TC-22-08 | judge + 条件分支仍可用 | 回归 |
| TC-22-09 | curl 列出工具 | 可选 |
| TC-22-10 | backend Upsert 仅 POST | 回归 §3 |
| TC-22-11 | 二次保存 createdAt 不变 | 回归 §3 |
| TC-22-12 | local 模式未破坏 | 回归 §3 |

---

## 2. Tool Registry 详细用例

### TC-22-01 GET /api/tools（必测 ⭐）

**步骤：**

```bash
curl -s http://localhost:3000/api/tools
```

**预期：**

- HTTP **200**，`ok: true`。
- `data` 为数组，长度 **5**。
- 每项含 `name`、`description`；`weather` 含 `inputSchema`（含 `city`）、`outputSchema`。

**失败判定：** 缺少任一已注册工具名（weather / summary / todo / judge / chat）。

---

### TC-22-02 Tool Explorer UI（必测 ⭐）

**步骤：**

1. 打开 http://localhost:3000 。
2. 查看右侧栏顶部 **Tool Explorer** 区域。

**预期：**

- 列出 5 个工具卡片：`name`、中文 `description`。
- `weather` 卡片显示 `in:` / `out:` 的 schema JSON 摘要。
- 与 TC-22-01 的 `data` 一致（可对比 Network 中 `GET /api/tools`）。

---

### TC-22-03 Workflow 天气步骤（必测 ⭐）

**前置：** 开启 **Workflow** 模式，模型可用（local Ollama 或 MiMo）。

**步骤：**

1. 发送：`查一下北京天气，并简单总结`（或同类多步需求）。
2. 等待 workflow 卡片完成。

**预期：**

- 存在 `action: weather` 的步骤且 **success**。
- 输出含温度相关信息（如 `°C`）。
- 终端可见 `[ToolRegistry] execute` 且 `tool: "weather"`。

---

### TC-22-04 weather Validator（必测 ⭐）

**目的：** Planner 若给出空 `input`，Validator 应拦截（可经 repair 或步骤失败观察）。

**步骤（任选其一）：**

1. **间接**：使用极短 workflow 提示，观察 weather 步是否 `failed` 且 `error` 含「缺少」或 `city`。
2. **开发验证**：临时将某 workflow 步 `action` 设为 `weather`、`input` 设为 `""` 后执行（仅本地调试）。

**预期：**

- 步骤 **failed**（或 repair 后补全 input 再 success）。
- 日志含 `[ToolRegistry] validation failed` 或 error 消息含 `缺少必填字段：city`。

---

### TC-22-05 注册日志（必测）

**步骤：** 启动 `npm run dev` 或 `npm run build`，查看终端。

**预期：**

- 出现 5 行 `[ToolRegistry] register`（weather / summary / todo / judge / chat）。

---

### TC-22-06 执行日志（必测）

**步骤：** 完成 TC-22-03 或任意多步 workflow。

**预期：**

- 每个被执行的步骤至少一条 `[ToolRegistry] execute`，`tool` 与 `step.action` 一致。

---

### TC-22-07 Planner 动态工具（必测）

**目的：** 确认 Planner Prompt 不再硬编码固定 action 列表（改由 Registry 注入）。

**步骤：**

1. 在 `lib/workflow-planner.ts` 中确认 `formatToolsForPlanner(workflowToolRegistry)` 被调用（代码审查）。
2. 发送需 **todo** 的 workflow：`帮我根据本周目标生成 3 条待办`。
3. 观察计划中是否出现 `action: "todo"` 且步骤可 success。

**预期：**

- 计划含 todo 步骤且能执行成功（说明 Planner 知晓 Registry 中的 todo 工具）。

**扩展（可选）：** 本地临时 `registry.register` 第六个工具后，Planner Prompt 应自动多一行（需重启 dev）。

---

### TC-22-08 judge + 条件分支回归（必测）

**步骤：** 发送含条件语义的需求，例如：

`先判断我是否说清楚目标，如果不完整就补充待办，如果完整就总结`

**预期：**

- 存在 `judge` 步骤，输出含 `result`。
- 条件未命中步骤为 **skipped**（非 failed）。
- 与 day17–18 行为一致。

---

### TC-22-09 curl 工具列表（可选）

同 TC-22-01；可配合 `jq` 格式化：

```bash
curl -s http://localhost:3000/api/tools | jq ".data[].name"
```

**预期：** 输出五行工具名。

---

## 3. Upsert 回归（day21 §8，本仓库仍保留）

### TC-22-10 backend 保存仅 POST

**前置：** Storage Mode = **backend**，MySQL 正常。

**步骤：** 触发 workflow 保存，观察 Network。

**预期：** 同一轮保存中，**无** 保存前 `GET /api/workflows/:id`；有 `POST /api/workflows`。

---

### TC-22-11 二次保存 createdAt 不变

**步骤：** 对同一 `workflowId` 触发两次保存。

**预期：** 第二次 POST `created: false`；`createdAt` 与首次一致；`updatedAt` 更新。

---

### TC-22-12 local 模式回归

**步骤：** Storage Mode = **local**，触发 workflow 保存两次。

**预期：** localStorage 中 `createdAt` 不变；无 `/api/workflows`（除非切 backend）。

---

## 4. 打卡对照（§9.11）

| # | 验收项 | 本用例 |
|---|--------|--------|
| 1 | 定义 Tool 接口 | 代码 `lib/tool-registry.ts` |
| 2 | 实现 ToolRegistry | TC-22-01、TC-22-05 |
| 3 | register / get / execute | TC-22-05、TC-22-06 |
| 4 | Executor Registry 驱动 | TC-22-03、TC-22-06 |
| 5 | Planner 动态工具列表 | TC-22-07 |
| 6 | Tool Schema | TC-22-01、TC-22-02 |
| 7 | Tool Validator | TC-22-04 |
| 8 | Tool Explorer | TC-22-02 |
| 9 | debug 日志 | TC-22-05、TC-22-06 |

---

## 5. 常见问题

| 现象 | 可能原因 |
|------|----------|
| Tool Explorer 一直「加载中」 | dev 未启动；`/api/tools` 404；检查 `app/api/tools/route.ts` |
| 工具少于 5 个 | `workflow-tools.ts` 未注册完整；构建缓存旧代码 |
| weather 步 failed「缺少 city」 | Planner `input` 为空；属 Validator 预期行为 |
| 仍有 Executor 大段 if/else | 未更新 `workflow-executor.ts` 至 Registry 版 |
| Upsert 回归失败 | 见 day21 文档；检查 `mysql-workflow-store.ts` UPDATE 子句 |

---

*文档版本：第 22 天 Tool Registry；实现见 `day22_learning_summary.md`。*
