# Day 50 测试用例文档（Model Router · 模型路由器）

> 主题：Advanced Optimization V3（高级优化第 3 版）：Multi-Model Routing Runtime（多模型路由运行时）
>
> 核心认知：Tool Router（工具路由器）选择能力（Capability），Model Router（模型路由器）选择算力（Compute）。

本文档覆盖第 50 天 10 项验收标准对应的测试用例，分为：

- 自动化测试用例（`npm run test:day50`，对应脚本 `scripts/test-day50-model-router.ts`）
- 接口（API）手工测试用例（`/api/model`）
- 前端 Model Explorer（模型浏览器）手工测试用例

---

## 一、被测能力与文件清单

| 能力 | 实现位置 |
| --- | --- |
| 1. 定义 ModelProfile（模型档案） | `lib/model/model-profile-types.ts` |
| 2. 实现 ModelRegistry（模型注册表） | `lib/model/model-registry.ts` |
| 3. 注册多个模型 profile（模型档案） | `lib/model/default-models.ts` |
| 4. 定义 ModelRoutingInput（模型路由输入） | `lib/model/model-profile-types.ts` |
| 5. 实现 ModelRouter（模型路由器） | `lib/model/model-router.ts` |
| 6. Agent Runtime（智能体运行时）接入 ModelRouter | `lib/agents/agent-runtime.ts` |
| 7. Tool Runtime（工具运行时）接入 ModelRouter | `lib/usage/tool-usage-runtime.ts` |
| 8. Usage（用量统计）记录 model 信息 | `lib/usage/usage-types.ts` + `lib/usage/usage-manager.ts` |
| 9. Model Explorer（模型浏览器） | `app/components/ModelExplorer.tsx` + `app/api/model/route.ts` |
| 10. 模型路由测试 | `scripts/test-day50-model-router.ts` |

### 默认注册的五个逻辑模型（Logical Models）

| id | provider | model | capabilities | speed | quality |
| --- | --- | --- | --- | --- | --- |
| `small-chat` | ollama | qwen2.5:3b | chat, summary | fast | basic |
| `large-reasoning` | ollama | qwen2.5:14b | chat, reasoning, planning | slow | reasoning |
| `json-structured` | ollama | qwen2.5:7b | json, summary, chat | medium | strong |
| `embedding` | ollama | nomic-embed-text | embedding | fast | basic |
| `evaluation` | ollama | qwen2.5:14b-instruct | evaluation, reflection, json | medium | strong |

### 路由规则（Routing Rules）优先级（从高到低）

1. `taskType === "embedding"` → `embedding`（嵌入模型）
2. `requiresJson` 或 `taskType === "json"` → `json-structured`（结构化 JSON 模型）
3. `taskType === "evaluation" | "reflection"` → `evaluation`（评估模型）
4. `complexity === "high"` 或 `taskType === "planning"` → `large-reasoning`（大型推理模型）
5. `latencyPreference === "fast"` → `small-chat`（小型对话模型）
6. `latencyPreference === "quality"` → `large-reasoning`（大型推理模型）
7. `taskType === "summary"` → `small-chat`（小型对话模型）
8. 兜底：按任务能力匹配（capability-fallback）

---

## 二、自动化测试用例（`npm run test:day50`）

### TC-A1 ModelRegistry 基础能力（register / get / list / findByCapability）

- 步骤：新建空 `ModelRegistry`，注册一条 `unit-chat` 模型。
- 期望：
  - `register` 返回模型档案；
  - `get("unit-chat").model === "demo:1b"`；
  - `list().length === 1`；
  - `findByCapability("summary").length === 1`；
  - `findByCapability("embedding").length === 0`。

### TC-A2 默认模型注册（Register Models）

- 步骤：`createDefaultModelRegistry()`。
- 期望：
  - 模型数量等于 `DEFAULT_MODEL_PROFILES.length`（5）；
  - `small-chat / large-reasoning / json-structured / embedding / evaluation` 均存在；
  - `stats().cheapestModelId === "embedding"`（输入单价最低）。

### TC-A3 ModelRouter 核心规则（对应验收 5 个用例）

| 输入 | 期望选中模型 |
| --- | --- |
| `{ taskType: "summary", complexity: "low", latencyPreference: "fast" }` | `small-chat` |
| `{ taskType: "planning", complexity: "high" }` | `large-reasoning` |
| `{ taskType: "json", requiresJson: true }` | `json-structured` |
| `{ taskType: "evaluation", complexity: "medium" }` | `evaluation` |
| `{ taskType: "embedding" }` | `embedding` |

### TC-A4 路由规则优先级

- `{ taskType: "embedding", requiresJson: true }` → `embedding`（嵌入规则优先于 JSON 规则）。
- `routeWithReason({ taskType: "json", requiresJson: true }).matchedRule === "requires-json"`（命中规则可解释）。
- `{ taskType: "chat", latencyPreference: "quality" }` → `large-reasoning`。

### TC-A5 Agent Runtime 接入 ModelRouter + Usage 记录模型信息

- 步骤：用独立 `UsageManager` 与 `ModelRouter` 构造 `AgentRuntime`，执行一次 Supervisor 协作。
- 期望：
  - 产生若干用量记录；
  - 每条 `UsageRecord` 都带非空 `modelId`；
  - 评估阶段记录 `componentType === "evaluation"` 且 `modelId === "evaluation"`；
  - `getModelUsage()` 能按模型聚合出成本归因（每组 `recordCount > 0`）。

### TC-A6 Tool Runtime 接入 ModelRouter

- 步骤：用独立 `UsageManager` 与 `ModelRouter` 构造 `ToolUsageRuntime`，执行 `retrieval` 与 `queryRewrite` 两个工具。
- 期望：
  - `retrieval` 工具记录 `modelId === "embedding"`；
  - `queryRewrite` 工具记录 `modelId === "json-structured"`。

### TC-A7 Model Explorer 快照

- 步骤：`getModelDashboardSnapshot()`。
- 期望：
  - `models.length === 5`；
  - `routingPreviews.length >= 5`；
  - 嵌入路由预览选中 `embedding`。

> 全部通过时控制台输出：`Day 50 Model Router tests passed.`

---

## 三、接口手工测试用例（`/api/model`）

> 启动：`npm run dev`，默认地址 `http://localhost:3000`。

### TC-B1 GET /api/model（读取模型快照）

```bash
curl http://localhost:3000/api/model
```

- 期望：`ok === true`，`data.models` 含 5 个模型，`data.metrics.totalModels === 5`，`data.routingPreviews` 含 5 条预览。

### TC-B2 POST /api/model（在线试路由）

```bash
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d '{"taskType":"planning","complexity":"high"}'
```

- 期望：`data.model.id === "large-reasoning"`，`data.matchedRule === "complexity-high"`，`data.reason` 为中文路由理由。

### TC-B3 POST /api/model 参数校验

```bash
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d '{"taskType":"unknown"}'
```

- 期望：`ok === false`，提示缺少或非法的 `taskType`，并列出可选值。

### TC-B4 POST /api/model（嵌入任务）

```bash
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d '{"taskType":"embedding"}'
```

- 期望：`data.model.id === "embedding"`，`data.matchedRule === "embedding"`。

---

## 四、前端 Model Explorer（模型浏览器）手工测试用例

> 入口：右侧控制台 → 「模型」标签页（默认打开）。

### TC-C1 模型概览（overview）

- 期望：展示 Total Models（5）、Capability Coverage（能力覆盖）、Fast Models（快速模型数）、Cheapest Model（embedding）与提供方分布徽标。

### TC-C2 模型档案（models）

- 期望：列出 5 个模型，每条展示 id、provider、底层模型名、能力标签、速度、质量、输入/输出单价与上下文窗口。

### TC-C3 路由预览（routing）

- 期望：展示 5 个典型任务，每条显示 `→ 选中模型 id`、命中规则、任务类型与中文路由理由：
  - 「帮我总结这段话」→ `small-chat`
  - 「帮我设计多 Agent 架构」→ `large-reasoning`
  - 「把结果改写成 JSON」→ `json-structured`
  - 「Evaluation（评估）任务」→ `evaluation`
  - 「Embedding（向量嵌入）」→ `embedding`

### TC-C4 刷新与错误态

- 点击「刷新」按钮：期望重新拉取快照、按钮进入禁用「加载中...」。
- 接口异常：期望顶部展示红色错误条，不崩溃。

---

## 五、第 50 天验收对照

| 验收项 | 覆盖用例 | 结论 |
| --- | --- | --- |
| 1. 定义 ModelProfile | TC-A1 | 通过 |
| 2. 实现 ModelRegistry | TC-A1 | 通过 |
| 3. 注册多个模型 profile | TC-A2 | 通过 |
| 4. 定义 ModelRoutingInput | TC-A3/TC-B2 | 通过 |
| 5. 实现 ModelRouter | TC-A3/TC-A4 | 通过 |
| 6. Agent Runtime 接入 ModelRouter | TC-A5 | 通过 |
| 7. Tool Runtime 接入 ModelRouter | TC-A6 | 通过 |
| 8. Usage 记录 model 信息 | TC-A5 | 通过 |
| 9. 实现 Model Explorer | TC-A7/TC-B1/TC-C1~C4 | 通过 |
| 10. 完成模型路由测试 | TC-A3/TC-A4 | 通过 |
