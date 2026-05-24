# 第22天学习总结：Tool Registry + Dynamic Tool System

对照 `ollama-chat-day21/day21_learning_summary.md` §9 学习计划，本仓库 **`ollama-chat-day22`** 在 day21 **MySQL + Envelope + Upsert** 之上完成 **Plugin-based Agent Runtime V1**。

> **下一章**：§1–§7 为第22天实现总结；§9 为第23天「Tool Ecosystem + Tool Composition」学习计划。

```text
Tool Registry
├── weather
├── summary
├── todo
├── judge
└── chat

Runtime：  workflowToolRegistry.execute(action, toolInput)
Planner：  formatToolsForPlanner(registry) 动态生成可用工具列表
UI：       侧栏 Tool Explorer（GET /api/tools）
```

---

## 1. 为什么从 if/else 升级到 Registry？

| 之前 | 问题 |
|------|------|
| `if (step.action === "weather") { ... }` | 工具增多后 Executor 臃肿 |
| Planner Prompt 写死 action 列表 | 新工具需改两处代码 |
| 无统一入参校验 | Planner 输出 `{}` 时运行时才暴露 |

**核心认知**：`Tool = Runtime Plugin`；Runtime 只依赖 **Tool 接口**，不「认识」具体函数。

---

## 2. 能力对比

| 阶段 | 工具分发 |
|------|----------|
| 第21天 | Executor 内 `if/else` + Planner 写死 action |
| **第22天** | `ToolRegistry.register` + `execute`；Planner 读 `registry.list()` |

```text
第21天  Persistent DAG + HITL + MySQL + Envelope + Upsert
第22天  … + Tool Registry + Schema + Validator + Tool Explorer
```

（Upsert 保留 `created_at`、backend 保存仅 POST 一次等能力仍保留，见 §7。）

---

## 3. 实现清单

| 任务 | 文件 | 状态 |
|------|------|------|
| 定义 `Tool` 接口（含 Schema） | `lib/tool-registry.ts` | ✅ |
| 实现 `ToolRegistry`（register / get / list / execute） | `lib/tool-registry.ts` | ✅ |
| 注册 weather / summary / todo / judge / chat | `lib/workflow-tools.ts` | ✅ |
| Executor 改为 Registry 驱动 | `lib/workflow-executor.ts` | ✅ |
| Planner 动态工具 Prompt | `lib/workflow-planner.ts` | ✅ |
| `validateToolInput` 执行前校验 | `lib/tool-registry.ts` | ✅ |
| `GET /api/tools` | `app/api/tools/route.ts` | ✅ |
| 前端 Tool Explorer | `app/page.tsx` | ✅ |
| `[ToolRegistry] register` / `execute` 日志 | `lib/tool-registry.ts` | ✅ |
| 打破循环依赖（chat 执行） | `lib/workflow-chat.ts` | ✅ |

---

## 4. 核心代码说明

### 4.1 Tool 接口

```ts
type Tool = {
  name: string
  description: string
  inputSchema?: ToolSchema
  outputSchema?: ToolSchema
  execute(input: WorkflowToolExecuteInput): Promise<unknown>
}
```

`WorkflowToolExecuteInput` 由 `buildWorkflowToolInput` 从 `WorkflowStep` + 依赖链上下文组装，供所有工具共用。

### 4.2 ToolRegistry

```ts
workflowToolRegistry.register(weatherTool)
await workflowToolRegistry.execute(step.action, toolInput)
```

注册时打印 `[ToolRegistry] register <name>`；执行时打印 `[ToolRegistry] execute { tool, stepId }`。

### 4.3 Executor 变化

**之前**：`if (step.action === "summary")` 等多分支。  
**之后**：单入口 `workflowToolRegistry.execute(step.action, toolInput)`。

校验失败抛出 `ToolValidationError`（如 weather 缺少可解析的 `city`），步骤进入重试/失败流程。

### 4.4 Planner 动态工具列表

```ts
const toolPrompt = formatToolsForPlanner(workflowToolRegistry)
// Planner Prompt 片段：
// 可用工具（action 必须与工具 name 一致）：
// - weather: 查询天气…
// - summary: …
```

新增工具只需 `registry.register(newTool)`，Planner **自动**感知（无需改 Prompt 字符串）。

### 4.5 Tool Validator

`validateToolInput(tool, input)` 在 `execute` 内调用：

- 按 `inputSchema` 检查必填字段；
- `weather`：`extractWeatherCity(step.input || 最新 user 消息)` 为空则报「缺少 city」。

### 4.6 Tool Explorer

- API：`GET /api/tools` → `{ ok, data: ToolDescriptor[] }`
- UI：右侧栏 **Tool Explorer** 展示 `name`、`description`、`inputSchema`、`outputSchema`

---

## 5. 架构示意

```mermaid
flowchart LR
  subgraph Registry
    TR[ToolRegistry]
    W[weather]
    S[summary]
    T[todo]
    J[judge]
    C[chat]
  end
  Planner -->|list / formatToolsForPlanner| TR
  Executor -->|execute| TR
  TR --> W & S & T & J & C
  API_tools["GET /api/tools"] --> TR
  Page[Tool Explorer] --> API_tools
```

---

## 6. 第22天打卡（Tool Registry）

```text
【第22天打卡】

1. 是否定义 Tool 接口：是
2. 是否实现 ToolRegistry：是
3. 是否支持 register / get / execute：是
4. Executor 是否改成 Registry 驱动：是
5. Planner 是否动态读取工具列表：是
6. 是否增加 Tool Schema：是
7. 是否实现 Tool Validator：是
8. 前端是否展示 Tool Explorer：是
9. 是否增加 ToolRegistry debug 日志：是

10. 遇到的最大问题：（自填）

11. 当前系统能力：
Plugin-based Agent Runtime V1 + Persistent DAG + HITL + MySQL + Envelope + Upsert
```

---

## 7. 延续能力（day21 §8 Upsert，未回退）

| 项 | 说明 |
|----|------|
| SQL upsert 保留 `created_at` | `lib/mysql-workflow-store.ts` |
| backend 保存仅 POST | `lib/workflow-persistence.ts` |
| POST 响应 `created` / `createdAt` | `app/api/workflows/route.ts` |

回归用例见 `day22_test_cases.md` §3。

---

## 8. 相关文件

| 文件 | 说明 |
|------|------|
| `lib/tool-registry.ts` | Tool / ToolRegistry / Validator / Planner 格式化 |
| `lib/workflow-tools.ts` | 五类工具注册 + `WORKFLOW_ALLOWED_ACTIONS` |
| `lib/workflow-chat.ts` | chat 工具实现（避免与 planner 循环依赖） |
| `lib/workflow-executor.ts` | Registry 驱动执行 |
| `lib/workflow-planner.ts` | 动态工具 Prompt |
| `app/api/tools/route.ts` | 工具列表 API |
| `app/page.tsx` | Tool Explorer UI |
| `day22_test_cases.md` | TC-22-01 ~ TC-22-12 |

---

## 9. 第23天学习计划：Tool Ecosystem + Tool Composition

> **前置**：完成 §1–§7（Tool Registry + Schema + Validator + Tool Explorer）。  
> **核心目标**：不只是「增加几个工具」，而是让 **Tool 开始互相组合**。

### 9.1 当前 Runtime 的瓶颈

你现在虽然有 **Tool Registry**，但工具仍是：

- 单个工具、单步执行

| 问题 | 说明 |
|------|------|
| Tool 无法复用 Tool | ❌ |
| Tool 无法组合 | ❌ |
| Tool 不会形成能力链 | ❌ |

真正 Agent Runtime 演进路径：

```text
Tool
  ↓
Tool Composition
  ↓
Capability
```

### 9.2 第23天最终效果

```text
research_tool
  ├─ weather_tool
  ├─ summary_tool
  └─ todo_tool
```

即：**Tool 调 Tool** —— 第一次拥有 **Tool Composition**。

做完第 23 天后，系统从 **Plugin-based Runtime** 升级为 **Capability-based Agent Runtime V2**。

### 9.3 任务 1：给 Tool 增加 context（非常关键）

| 之前 | 升级 |
|------|------|
| `execute(input)` | `execute(input, context)` |

Context 结构：

```ts
type ToolExecutionContext = {
  workflowId: string
  toolRegistry: ToolRegistry
  memory?: MemoryItem[]
  stepOutputs?: Record<string, unknown>
  logger?: RuntimeLogger
}
```

**为什么重要**：Tool 以后可以调用其他 Tool。

### 9.4 任务 2：实现 Composite Tool（核心）

新增类型：

```ts
type CompositeTool = Tool & {
  subTools?: string[]
}
```

示例：

```ts
const researchTool: Tool = {
  name: "research",
  description: "研究任务生成器",
  async execute(input, context) {
    const summary = await context.toolRegistry.execute("summary", input)
    const todos = await context.toolRegistry.execute("todo", { summary })
    return { summary, todos }
  },
}
```

第一次拥有：**Tool Composition**。

### 9.5 任务 3：增加 Tool Capability 标签

Tool 升级：

```ts
type Tool = {
  name: string
  description: string
  capabilities?: string[]
  execute(...)
}
```

示例：

```ts
capabilities: ["text-summary", "task-generation"]
```

**为什么重要**：以后 Planner **不是按工具名选**，而是 **按 capability 选**。

### 9.6 任务 4：Planner 改成 Capability Routing

| 之前 | 升级 |
|------|------|
| 用 `summary` tool | 需要 `text-summary` + `task-generation` |

Planner 再映射到：`summary` tool、`todo` tool。

第一次真正理解：**Tool ≠ Capability**。

### 9.7 任务 5：实现 Tool Dependency Graph（重点）

目标展示：

```text
research
 ├─ summary
 └─ todo
```

新增字段：

```ts
dependencies: ["summary", "todo"]
```

前端展示：

```text
research
  ├─ summary
  └─ todo
```

第一次拥有：**Tool Graph**。

### 9.8 任务 6：实现 Tool Sandbox（轻量版）

**为什么**：未来 Tool 可能崩溃、timeout、无限递归、调自己。

超时：

```ts
const result = await Promise.race([
  tool.execute(...),
  timeout(10000),
])
```

递归守卫：

```ts
if (depth > 3) {
  throw new Error("Tool recursion limit")
}
```

第一次拥有：**Tool Isolation**。

### 9.9 任务 7：Tool Metrics（很重要）

`ToolRegistry` 增加统计：

```ts
{
  totalCalls
  successCalls
  failedCalls
  avgDuration
}
```

UI 示例：

```text
weather  - calls: 12, avg: 240ms
summary  - calls: 35
```

第一次拥有：**Runtime Metrics**。

### 9.10 任务 8：新增几个真正有用的 Tool

| # | 工具 | 说明 |
|---|------|------|
| 1 | `noteTool` | 保存笔记 |
| 2 | `searchHistoryTool` | 搜索历史 workflow |
| 3 | `generatePlanTool` | 根据目标生成学习计划 |
| 4 | `criticTool` | 评估 workflow 结果质量（Self-evaluation Agent） |

### 9.11 任务 9：Tool Explorer 升级

展示维度：

- Tool
- Capabilities
- Dependencies
- Metrics
- Schemas

### 9.12 第23天验收标准

| # | 验收项 |
|---|--------|
| 1 | Tool 是否支持 execution context |
| 2 | 是否实现 Composite Tool |
| 3 | Tool 是否能调用其他 Tool |
| 4 | 是否增加 capabilities |
| 5 | Planner 是否支持 capability routing |
| 6 | 是否实现 Tool Dependency Graph |
| 7 | 是否实现 timeout / recursion guard |
| 8 | 是否实现 Tool Metrics |
| 9 | 是否新增至少 3 个新 Tool |
| 10 | Tool Explorer 是否升级 |

### 9.13 第23天打卡模板

```text
【第23天打卡】

1. Tool 是否支持 execution context：是 / 否
2. 是否实现 Composite Tool：是 / 否
3. Tool 是否能调用其他 Tool：是 / 否
4. 是否增加 capabilities：是 / 否
5. Planner 是否支持 capability routing：是 / 否
6. 是否实现 Tool Dependency Graph：是 / 否
7. 是否实现 timeout / recursion guard：是 / 否
8. 是否实现 Tool Metrics：是 / 否
9. 是否新增至少 3 个 Tool：是 / 否
10. Tool Explorer 是否升级：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

### 9.14 第23天核心认知

> **真正高级的 Agent，不是「工具多」，而是「工具能形成能力网络」。**

能力演进（完成后）：

```text
第22天  Plugin-based Agent Runtime V1（Tool Registry + Schema + Validator）
第23天  Capability-based Agent Runtime V2（Composition + Capability Routing + Tool Graph + Metrics）
```

---

*实现日期：2026-05-23（第22天 Tool Registry）；Upsert 见 §7；第23天计划见 §9；测试步骤见 `day22_test_cases.md`。*
