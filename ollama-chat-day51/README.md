# Ollama Chat Day 50

Day 50 在 Day 49 Long-Term Memory V2（长期记忆第 2 版）的基础上，升级为 Advanced Optimization V3（高级优化第 3 版）：Multi-Model Routing Runtime（多模型路由运行时）。

> 核心认知：Tool Router（工具路由器）选择能力（Capability），Model Router（模型路由器）选择算力（Compute）。
>
> 一句话目标：不同任务，选择不同模型（Per-task Model Selection，按任务选择模型）。

## 本日重点

- 定义 `ModelProfile`（模型档案）：id、provider、model、capabilities、cost、limits、speed、quality。
- 实现 `ModelRegistry`（模型注册表）：`register` / `get` / `list` / `findByCapability` 与注册表指标统计。
- 注册多个逻辑模型（Logical Models）：`small-chat`（小模型）、`large-reasoning`（大推理模型）、`json-structured`（JSON 模型）、`embedding`（嵌入模型）、`evaluation`（评估模型）。
- 定义 `ModelRoutingInput`（模型路由输入）：taskType、complexity、requiresJson、maxCost、latencyPreference。
- 实现 `ModelRouter`（模型路由器）：按优先级路由（embedding → JSON → evaluation → 高复杂度/规划 → 低延迟 → 高质量 → 总结 → 能力兜底）。
- Agent Runtime（智能体运行时）接入 ModelRouter：按智能体职责为生成、反思、评估阶段选择模型。
- Tool Runtime（工具运行时）接入 ModelRouter：检索/嵌入工具走 embedding、查询改写走 json-structured、总结走 small-chat。
- Usage（用量统计）记录 model 信息：`UsageRecord` 增加 `modelId` / `provider` / `modelName`，并新增按模型聚合的 Cost Attribution（成本归因）。
- 实现 `Model Explorer`（模型浏览器）：展示模型档案、注册表指标与典型任务的路由预览。
- 完整保留 Day 49 的长期记忆、Day 48 的语义缓存，以及更早的用量成本、回归评估、队列、工作流与 RAG 能力。

## 默认逻辑模型与路由规则

| id | provider | model | capabilities | speed | quality |
| --- | --- | --- | --- | --- | --- |
| `small-chat` | ollama | qwen2.5:3b | chat, summary | fast | basic |
| `large-reasoning` | ollama | qwen2.5:14b | chat, reasoning, planning | slow | reasoning |
| `json-structured` | ollama | qwen2.5:7b | json, summary, chat | medium | strong |
| `embedding` | ollama | nomic-embed-text | embedding | fast | basic |
| `evaluation` | ollama | qwen2.5:14b-instruct | evaluation, reflection, json | medium | strong |

| 用户任务 | 系统选择 |
| --- | --- |
| 帮我总结这段话 | `small-chat`（小模型） |
| 帮我设计多 Agent 架构 | `large-reasoning`（大推理模型） |
| 把结果改写成 JSON | `json-structured`（JSON 模型） |
| Evaluation（评估） | `evaluation`（评估模型） |
| Embedding（向量嵌入） | `embedding`（嵌入模型） |

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧控制台默认进入“模型”标签页，可切换查看模型概览、模型档案与路由预览。

## 验证方式

```bash
npm run test:day50
npm run test:day49
npm run test:day48
npm run lint
npm run build
```

Day 50 的自动化、接口与人工测试用例见 `day50_test_cases.md`。
