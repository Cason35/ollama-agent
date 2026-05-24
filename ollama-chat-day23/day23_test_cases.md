# 23 天 Ollama Agent 课程 · 第 23 天测试用例（Tool Composition）

> 面向 **`ollama-chat-day23`**。第 22 天用例见 `ollama-chat-day22/day22_test_cases.md`。  
> 本文 **§2** 为第 23 天主线；**§3** 为 day22 Registry 回归。

---

## 0. 测试前准备

### 0.1 环境

```bash
cd ollama-chat-day23
npm install
npm run dev
```

浏览器：**http://localhost:3000**

可选（`searchHistory` / Upsert 回归）：MySQL 已执行 `scripts/init-mysql.sql`，`.env.local` 配置 `MYSQL_*`，侧栏 Storage Mode 选 **backend**。

### 0.2 第 23 天验收焦点

| 对比项 | day22 | day23 |
|--------|-------|-------|
| 执行签名 | `execute(input)` | **`execute(input, context)`** |
| 工具组合 | ❌ | **`research` 调 summary + todo** |
| Planner | 仅工具名 | **Capability → action 映射** |
| 可观测性 | Schema | **+ 依赖树 + Metrics** |
| 沙箱 | 无 | **10s 超时 + depth≤3** |

### 0.3 调试要点

- 日志：`[ToolRegistry] execute { tool, stepId, depth }`（组合子调用 depth 递增）。
- `GET /api/tools`：`data.tools` 长度 **10**；`data.metrics` 为对象。
- 组合工具 `research` 的 `dependencies` / `subTools` 含 `summary`、`todo`。

---

## 1. 用例总览

| 编号 | 主题 | 优先级 |
|------|------|--------|
| TC-23-01 | GET /api/tools 返回 tools + metrics | ⭐ 必测 |
| TC-23-02 | Tool Explorer 展示能力/依赖/指标 | ⭐ 必测 |
| TC-23-03 | research 组合工具 Workflow 执行 | ⭐ 必测 |
| TC-23-04 | Planner capabilities 映射为 research | 必测 |
| TC-23-05 | note 工具写入长期记忆 | 必测 |
| TC-23-06 | generatePlan 生成学习计划 | 必测 |
| TC-23-07 | critic 读取 stepOutputs 自评 | 必测 |
| TC-23-08 | searchHistory 搜索历史（backend） | 可选 |
| TC-23-09 | Metrics 执行后递增 | 必测 |
| TC-23-10 | 递归 depth 日志 | 必测 |
| TC-23-11 | weather 仍可用（day22 回归） | 回归 |
| TC-23-12 | Tool Registry 注册 10 个工具 | 必测 |
| TC-23-13 | capabilities 字段在 API 中存在 | 必测 |
| TC-23-14 | research 依赖图在 UI 树形展示 | 必测 |
| TC-23-15 | backend Upsert 未破坏 | 回归 §3 |

---

## 2. Tool Composition 详细用例

### TC-23-01 GET /api/tools（必测 ⭐）

**步骤：**

```bash
curl -s http://localhost:3000/api/tools
```

**预期：**

- HTTP **200**，`ok: true`。
- `data.tools` 为数组，长度 **10**。
- `data.metrics` 为对象（可为空指标，键为工具名）。
- 含 `research`，且 `capabilities` 含 `research`；`dependencies` 含 `summary`、`todo`。

**失败判定：** 工具数不足 10；缺少 `research` 或 metrics 字段。

---

### TC-23-02 Tool Explorer UI（必测 ⭐）

**步骤：**

1. 打开首页，查看右侧 **Tool Explorer**。
2. 确认文案含「第23天」与 Capability 说明。

**预期：**

- 列表展示 ≥10 个工具卡片。
- `research` 卡片含「能力」行、`├─ summary` / `├─ todo` 依赖树、组合说明。
- 执行过 Workflow 后刷新页面，部分工具显示 `calls: N, avg: Xms`（Metrics）。

---

### TC-23-03 research 组合执行（必测 ⭐）

**步骤：**

1. 开启 Workflow，输入：`帮我研究一下如何学 TypeScript，总结要点并列出待办`。
2. 观察 Planner 是否含 `research` 或 `summary`+`todo` 步骤。
3. 查看终端日志。

**预期：**

- 若 action 为 `research`：日志出现对 `summary`、`todo` 的 `[ToolRegistry] execute`，且 `depth` ≥ 1。
- 步骤成功时 `output` 含 `{ summary, todos }` 结构（或等价字段）。

**失败判定：** research 步骤失败且无子工具 execute 日志。

---

### TC-23-04 Capability Routing（必测）

**步骤：**

1. 在 Planner 输出中（Network 或调试）查找是否包含 capabilities 说明块。
2. 手动构造仅含 capabilities 的 plan（若可）：`capabilities: ["text-summary","task-generation"]` 且无 action。

**预期：**

- 服务端将步骤 action 解析为 **`research`**（见 `resolveActionFromCapabilities`）。

---

### TC-23-05 note 工具（必测）

**步骤：**

Workflow 单步或 Planner 生成：`action: "note"`, `input: "第23天：Tool Composition 笔记"`。

**预期：**

- 步骤 success，`output.saved === true`。
- 侧栏 Memory 或长期记忆中出现 `[笔记]` 前缀条目。

---

### TC-23-06 generatePlan（必测）

**输入：** `为我制定一个 7 天学习 Next.js 的计划`（action: generatePlan）。

**预期：**

- 输出含 `plan` 字段，非空中文文本。

---

### TC-23-07 critic 自评（必测）

**步骤：**

1. 先跑一个 2 步以上且至少一步 success 的 Workflow。
2. 追加或单独步骤 `action: "critic"`。

**预期：**

- 输出含 `score`（0–10）与 `feedback` 字符串。
- 无 stepOutputs 时 feedback 仍合理（降级文案）。

---

### TC-23-08 searchHistory（可选）

**前置：** Storage Mode = **backend**，库中已有历史 workflow。

**步骤：** `action: "searchHistory"`, `input: "TypeScript"`（或已知 goal 关键词）。

**预期：**

- `output.hits` 为数组，项含 `workflowId`、`goal`、`status`。

---

### TC-23-09 Metrics 递增（必测）

**步骤：**

1. `curl -s http://localhost:3000/api/tools` 记录 `weather.totalCalls`（或 0）。
2. 执行一次 weather Workflow。
3. 再次 curl。

**预期：**

- `metrics.weather.totalCalls` 增加 ≥1。
- `avgDurationMs` 为合理非负整数。

---

### TC-23-10 递归 depth 日志（必测）

**步骤：** 执行 TC-23-03，检查 stderr。

**预期：**

- 同一 workflow 内可见 `depth: 0`（顶层）与 `depth: 1`（子工具）日志。

---

### TC-23-11 ~ TC-23-12 回归

- **TC-23-11**：`北京天气` Workflow 与 day22 一致成功。
- **TC-23-12**：`curl` 数 `data.tools` 名称包含：weather, summary, todo, judge, chat, research, note, searchHistory, generatePlan, critic。

---

### TC-23-13 ~ TC-23-14

- **TC-23-13**：每个基础工具（非 chat）至少 1 个 `capabilities` 字符串。
- **TC-23-14**：Explorer 中 research 显示依赖树形 `├─`。

---

## 3. day22 回归（简要）

| 编号 | 说明 |
|------|------|
| TC-23-15 | backend Upsert：二次 POST 同一 workflowId，`createdAt` 不变（同 day21 TC） |

---

## 4. 沙箱（手工/代码审查）

| 场景 | 预期 |
|------|------|
| 组合深度 | research → summary/todo 时 depth 不超过 3 |
| 超时 | 若工具阻塞 >10s，步骤 failed，错误含 `timed out` |

> 不建议在生产环境故意触发无限递归；可通过代码审查 `MAX_TOOL_RECURSION_DEPTH` 常量验证。

---

*文档版本：2026-05-24 · ollama-chat-day23*
