# 第23天学习总结：Tool Ecosystem + Tool Composition

对照 `ollama-chat-day22/day22_learning_summary.md` §9 学习计划，本仓库 **`ollama-chat-day23`** 在 day22 **Tool Registry** 之上完成 **Capability-based Agent Runtime V2**。

> **上一章**：day22 Plugin-based Runtime V1；**本章**：Tool Composition + Capability Routing + Tool Graph + Sandbox + Metrics。

```text
research（Composite）
 ├── summary
 └── todo

Runtime：  execute(input, context) + sandbox + metrics
Planner：  formatCapabilitiesForPlanner + resolveActionFromCapabilities
UI：       Tool Explorer（能力 / 依赖树 / 指标 / Schema）
```

---

## 1. 能力对比

| 阶段 | 工具模型 |
|------|----------|
| 第22天 | 单工具单步；`execute(input)` |
| **第23天** | **Tool 调 Tool**；`execute(input, context)`；Capability 路由 |

```text
第22天  Plugin-based Agent Runtime V1
第23天  Capability-based Agent Runtime V2（Composition + Graph + Metrics）
```

---

## 2. 实现清单

| 任务 | 文件 | 状态 |
|------|------|------|
| ToolExecutionContext | `lib/tool-registry.ts` | ✅ |
| Composite Tool `research` | `lib/workflow-tools.ts` | ✅ |
| capabilities 标签 | `lib/tool-registry.ts` / `workflow-tools.ts` | ✅ |
| Planner Capability Routing | `lib/workflow-planner.ts` | ✅ |
| dependencies / subTools（Tool Graph） | 各 Tool 定义 + Explorer UI | ✅ |
| Sandbox（timeout + recursion） | `lib/tool-registry.ts` | ✅ |
| Tool Metrics | `ToolRegistry.getMetrics` | ✅ |
| 新工具 note / searchHistory / generatePlan / critic | `lib/workflow-tools.ts` | ✅ |
| Tool Explorer 升级 | `app/page.tsx` + `app/api/tools/route.ts` | ✅ |

---

## 3. 核心代码说明

### 3.1 Execution Context

```ts
type ToolExecutionContext = {
  workflowId: string
  toolRegistry: ToolRegistry
  stepOutputs?: Record<string, unknown>
  depth: number
}
```

Executor 调用：`workflowToolRegistry.execute(action, toolInput, { workflowId, stepOutputs, depth: 0 })`。

### 3.2 Composite Tool

`research` 在 `execute` 内依次 `context.toolRegistry.execute("summary", …)` 与 `execute("todo", …)`，实现 **Tool Composition**。

### 3.3 Capability Routing

Planner Prompt 增加 `formatCapabilitiesForPlanner`；步骤可只写 `capabilities: ["text-summary","task-generation"]`，由 `resolveActionFromCapabilities` 映射为 `research`。

### 3.4 Sandbox

- 超时：`Promise.race` + `DEFAULT_TOOL_TIMEOUT_MS`（10s）
- 递归：`depth > MAX_TOOL_RECURSION_DEPTH`（3）抛出 `ToolRecursionError`

### 3.5 Metrics

`GET /api/tools` 返回 `{ tools, metrics }`；Explorer 展示 `calls / ok / fail / avg ms`。

---

## 4. 第23天总结

### 4.1 已完成：Capability-based Agent Runtime V2

这一步意义非常大：系统已从 **「Workflow + Tool」** 升级为 **「Capability Network」**。

当前已具备：

| 能力 | 说明 |
|------|------|
| Tool Registry | 统一注册与执行 |
| Composite Tool | 组合工具（如 `research`） |
| Tool 调 Tool | `execute(input, context)` |
| Capability Routing | Planner 按能力选工具 |
| Tool Dependency Graph | `dependencies` / `subTools` |
| Tool Sandbox | Timeout + Recursion Guard |
| Tool Metrics | calls / ok / fail / avg ms |
| Tool Explorer | 能力 / 依赖树 / 指标 / Schema |
| Critic Tool | 开始具备自评估 |

### 4.2 与主流 Runtime 的对齐方向

当前 Runtime 已接近以下框架的**核心方向**（非完整对标，而是架构同类）：

- LangGraph Runtime
- AutoGen Runtime
- CrewAI Runtime
- OpenAI Agents Runtime

### 4.3 核心认知

> **真正高级的 Agent，不是「工具多」，而是「工具能形成能力网络」。**

```text
第22天  Plugin-based Agent Runtime V1（Tool Registry + Schema + Validator）
第23天  Capability-based Agent Runtime V2（Composition + Capability Routing + Tool Graph + Metrics）
```

---

## 5. 第23天打卡

```text
【第23天打卡】

1. Tool 是否支持 execution context：是
2. 是否实现 Composite Tool：是（research）
3. Tool 是否能调用其他 Tool：是
4. 是否增加 capabilities：是
5. Planner 是否支持 capability routing：是
6. 是否实现 Tool Dependency Graph：是
7. 是否实现 timeout / recursion guard：是
8. 是否实现 Tool Metrics：是
9. 是否新增至少 3 个 Tool：是（4 个：note / searchHistory / generatePlan / critic）
10. Tool Explorer 是否升级：是

11. 遇到的最大问题：（自填）

12. 当前系统能力：
Capability-based Agent Runtime V2 + Persistent DAG + HITL + MySQL + Envelope + Upsert
```

---

## 6. 第24天学习计划：RAG Runtime（知识增强 Agent）

> **下一章目标**：Knowledge-aware Agent Runtime V1 —— Agent 不再只依赖「当前上下文」，而是能从**知识库**检索信息。

### 6.1 为什么第24天必须开始 RAG？

当前系统会：Workflow、Tool、Memory、DAG。

但 **❌ 没有长期知识能力** —— Agent 只能处理当前对话与当前 memory，不能从大量文档中查资料。

```text
Memory  ≠  Knowledge Base

Memory     → 用户上下文（会话内）
RAG / KB   → 外部知识系统（可持久、可检索）
```

**第24天最终效果示例**：

用户：「帮我总结一下之前关于 Workflow Runtime 的知识」

Agent 流程：

```text
1. 去知识库检索
2. 找相关 chunk
3. 拼上下文
4. 再总结回答
```

今天第一次拥有：**🔥 RAG Runtime**

---

### 6.2 任务 1：理解 RAG 架构

**RAG** = **R**etrieval + **A**ugmented + **G**eneration

```text
用户问题
    ↓
Embedding
    ↓
Vector Search
    ↓
Relevant Chunks
    ↓
Prompt Injection
    ↓
LLM 回答
```

今天先做最小版：**👉 Local RAG**（本地向量 + Ollama Embedding，无外部向量库）。

---

### 6.3 任务 2：Knowledge Document 数据结构

新建类型（建议 `lib/knowledge-types.ts` 或同类模块）：

```ts
type KnowledgeDocument = {
  id: string
  title: string
  content: string
  chunks: KnowledgeChunk[]
  createdAt: number
}

type KnowledgeChunk = {
  id: string
  documentId: string
  text: string
  embedding?: number[]
}
```

**核心认知**：RAG 不直接检索整篇文档，而是检索 **Chunk**。

---

### 6.4 任务 3：实现 Chunking（重点）

把长文档切块。今天用最简方案，后续再优化 overlap / semantic / markdown-aware。

```ts
function chunkText(text: string) {
  const size = 500
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}
```

---

### 6.5 任务 4：实现 Embedding（关键）

推荐先用 **Ollama Embedding**：

```bash
ollama pull nomic-embed-text
```

```ts
const res = await fetch("http://localhost:11434/api/embeddings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "nomic-embed-text",
    prompt: chunkText,
  }),
})
// chunk.embedding = embedding
```

完成后第一次拥有：**🔥 Semantic Search**。

---

### 6.6 任务 5：Vector Similarity Search（重点）

根据用户问题找最相关 chunk。今天用 **Cosine Similarity**：

```ts
function cosineSimilarity(a: number[], b: number[]): number { /* ... */ }
```

查询流程：

```text
用户 query → 生成 embedding → 与所有 chunk embedding 比较 → 取 topK
```

```ts
const topChunks = chunks.sort(bySimilarity).slice(0, 3)
```

**这一步非常关键**：Agent 第一次拥有「知识检索」能力。

---

### 6.7 任务 6：新增 `retrievalTool`

```ts
const retrievalTool = {
  name: "retrieval",
  capabilities: ["knowledge-retrieval"],
  async execute(input, context) { /* ... */ },
}
```

- **输入**：如 `Workflow Runtime 是什么？`
- **输出**：最相关 chunk 列表（含 text / score / documentId）

注册到现有 Tool Registry，与 Capability Routing 衔接。

---

### 6.8 任务 7：RAG Prompt Injection（核心）

| 之前 | 现在 |
|------|------|
| 用户问题 → LLM | 用户问题 + retrieved chunks → LLM |

```text
请基于以下知识回答：

【知识片段】
${chunks}

【用户问题】
${question}
```

**核心认知**：RAG = **「动态上下文」** —— 每次问答按需注入检索结果，而非塞进固定 system prompt。

---

### 6.9 任务 8：前端 RAG Debug UI

展示检索可观测性（Retrieval Observability）：

```text
Query: Workflow Runtime

Retrieved:
1. ... (score: 0.87, doc: xxx)
2. ...
3. ...
```

需展示：**similarity score**、**chunk source**、**topK**。

---

### 6.10 任务 9：知识库导入（最小版）

UI：一个 **textarea** + **Import** 按钮。

流程：`输入笔记 → chunk → embedding → save`

今天**不要**急着做：PDF、Markdown parser、多文件上传 —— **先打通端到端**。

---

### 6.11 任务 10：Knowledge Metrics

建议指标：

| 指标 | 含义 |
|------|------|
| documents | 文档数 |
| chunks | 切块总数 |
| avg chunk size | 平均块大小 |
| retrieval count | 检索调用次数 |

完成后第一次拥有：**👉 Knowledge Runtime** 可观测性。

---

### 6.12 第24天验收标准

| # | 验收项 |
|---|--------|
| 1 | 是否实现 KnowledgeDocument / Chunk |
| 2 | 是否实现 chunking |
| 3 | 是否接入 Ollama Embedding |
| 4 | 是否保存 embedding |
| 5 | 是否实现 cosine similarity |
| 6 | 是否实现 retrievalTool |
| 7 | 是否实现 RAG prompt injection |
| 8 | 前端是否展示 retrieved chunks |
| 9 | 是否支持导入知识 |
| 10 | 是否增加 retrieval metrics |

---

### 6.13 第24天打卡模板

```text
【第24天打卡】

1. 是否实现 KnowledgeDocument：是 / 否
2. 是否实现 chunking：是 / 否
3. 是否接入 Ollama Embedding：是 / 否
4. 是否保存 embedding：是 / 否
5. 是否实现 cosine similarity：是 / 否
6. 是否实现 retrievalTool：是 / 否
7. 是否实现 RAG prompt injection：是 / 否
8. 前端是否展示 retrieved chunks：是 / 否
9. 是否支持知识导入：是 / 否
10. 是否增加 retrieval metrics：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

---

### 6.14 第24天核心认知

> **Memory 是「用户上下文」，RAG 是「外部知识系统」。**

能力演进（完成后）：

```text
第23天  Capability-based Agent Runtime V2（Composition + Graph + Metrics）
第24天  Knowledge-aware Agent Runtime V1（RAG + Retrieval Tool + Knowledge Metrics）
```

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `lib/tool-registry.ts` | Context / Sandbox / Metrics / Capability 辅助 |
| `lib/workflow-tools.ts` | 全部工具注册 + research 组合 |
| `lib/workflow-planner.ts` | Capability Routing Prompt |
| `lib/workflow-executor.ts` | 注入 workflowId + stepOutputs |
| `app/api/tools/route.ts` | tools + metrics API |
| `app/page.tsx` | Tool Explorer V2 |
| `day23_test_cases.md` | TC-23-01 ~ TC-23-15 |

---

*实现日期：2026-05-24（第23天 Tool Composition）；第24天计划见 §6；测试见 `day23_test_cases.md`。*
