# 第24天学习总结：RAG Runtime（知识增强 Agent）

对照 `ollama-chat-day23/day23_learning_summary.md` §6 学习计划，本仓库 **`ollama-chat-day24`** 在 day23 **Capability-based Runtime V2** 之上完成 **Knowledge-aware Agent Runtime V1**。

> **上一章**：day23 Tool Composition + Capability Routing；**本章**：Local RAG + Retrieval Tool + Knowledge Metrics + RAG Debug UI。

```text
用户问题
    ↓
Embedding (Ollama nomic-embed-text)
    ↓
Cosine Similarity → TopK Chunks
    ↓
RAG Prompt Injection (buildRagPrompt)
    ↓
LLM 回答 (ragAnswer) / 仅返回片段 (retrieval)
```

---

## 1. 能力对比

| 阶段 | 知识能力 |
|------|----------|
| 第23天 | Memory（会话上下文） |
| **第24天** | **RAG 知识库**（持久化 Document/Chunk + 向量检索） |

```text
Memory  ≠  Knowledge Base
Memory     → 用户上下文（会话内）
RAG / KB   → 外部知识（可导入、可检索）
```

---

## 2. 实现清单

| 任务 | 文件 | 状态 |
|------|------|------|
| KnowledgeDocument / Chunk | `lib/knowledge-types.ts` | ✅ |
| Chunking（500 字符窗口） | `lib/knowledge-chunking.ts` | ✅ |
| Ollama Embedding | `lib/knowledge-embedding.ts` | ✅ |
| Cosine + TopK 检索 | `lib/knowledge-retrieval.ts` | ✅ |
| 本地 Store + 持久化 | `lib/knowledge-store.ts` | ✅ |
| RAG Prompt 注入 | `lib/knowledge-rag.ts` | ✅ |
| retrieval / ragAnswer 工具 | `lib/workflow-tools.ts` | ✅ |
| Capability 路由 | `lib/tool-registry.ts` | ✅ |
| GET/POST `/api/knowledge` | `app/api/knowledge/route.ts` | ✅ |
| POST `/api/knowledge/retrieve` | `app/api/knowledge/retrieve/route.ts` | ✅ |
| 知识导入 + RAG Debug UI | `app/page.tsx` | ✅ |
| Knowledge Metrics | `knowledge-store.getMetrics` | ✅ |
| 测试用例文档 | `day24_test_cases.md` | ✅ |

---

## 3. 核心代码说明

### 3.1 数据结构

`KnowledgeDocument` 含 `chunks[]`；每个 `KnowledgeChunk` 存 `text` + `embedding[]`。

### 3.2 导入流水线

`POST /api/knowledge` → `chunkText` → `embedTexts` → 写入 `.data/knowledge-store.json`。

### 3.3 retrievalTool

- **name**: `retrieval`
- **capabilities**: `knowledge-retrieval`
- **输出**: `{ query, hits, topK }`

### 3.4 ragAnswerTool

内部：`knowledgeStore.search` → `buildRagPrompt` → `invokeChatModel`；返回 `{ answer, hits }`。

### 3.5 前端可观测性

侧栏 **RAG 知识库**（Import）、**RAG Debug**（Query / topK / score / doc id）。

---

## 4. 第24天总结

### 4.1 已完成：Knowledge-aware Agent Runtime V1

你第 24 天已经正式进入：

**🔥 Knowledge-aware Agent Runtime V1**

你现在的系统已经不只是：

```text
Memory + Tool + Workflow
```

而是开始具备：

```text
知识库检索能力
```

你已经完成：

| 能力 | 说明 |
|------|------|
| KnowledgeDocument / Chunk | 文档与切块数据结构 |
| Chunking | 长文档切块 |
| Ollama Embedding | 语义向量生成 |
| Embedding 保存 | 持久化到本地 Store |
| Cosine Similarity | 向量相似度检索 |
| Retrieval Tool | `retrieval` / `ragAnswer` 工具 |
| RAG Prompt Injection | 检索结果注入 Prompt |
| Retrieved Chunks 展示 | 前端 RAG Debug |
| 知识导入 | textarea + Import 流程 |
| Retrieval Metrics | 知识库可观测指标 |

**这意味着**：你的 Agent **第一次拥有了「外部知识系统」**。

端到端链路已打通：

```text
导入文档 → 切块 → embedding → 检索 → 注入 prompt → 回答
```

### 4.2 核心认知

> **Memory 是「用户上下文」，RAG 是「外部知识系统」。**

能力演进：

```text
第23天  Capability-based Agent Runtime V2（Composition + Graph + Metrics）
第24天  Knowledge-aware Agent Runtime V1（RAG + Retrieval Tool + Knowledge Metrics）
```

---

## 5. 第24天打卡

```text
【第24天打卡】

1. 是否实现 KnowledgeDocument：是
2. 是否实现 chunking：是
3. 是否接入 Ollama Embedding：是
4. 是否保存 embedding：是
5. 是否实现 cosine similarity：是
6. 是否实现 retrievalTool：是
7. 是否实现 RAG prompt injection：是
8. 前端是否展示 retrieved chunks：是
9. 是否支持知识导入：是
10. 是否增加 retrieval metrics：是

11. 遇到的最大问题：（自填）

12. 当前系统能力：
Knowledge-aware Agent Runtime V1 + Capability Runtime V2 + Persistent DAG + HITL + MySQL + Envelope
```

---

## 6. 第25天学习计划：RAG 质量优化 + Chunk Overlap + TopK 控制

> **下一章目标**：RAG Runtime V2 —— 让 RAG 从「能检索」升级为「检索得更准、可调试、低幻觉」。

### 6.1 今日核心目标

第 24 天你已经打通：

```text
导入文档 → 切块 → embedding → 检索 → 注入 prompt → 回答
```

第 25 天要优化：

```text
chunk 质量 + 检索质量 + prompt 质量
```

---

### 6.2 任务 1：优化 Chunking，加 overlap

**现在的问题**

你可能现在是：

```ts
text.slice(i, i + 500)
```

这样会导致：

- 关键信息被切断
- 上下文断裂
- 检索结果不完整

**今天升级为 overlap chunking**

```ts
function chunkText(text: string, size = 500, overlap = 100) {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + size, text.length)
    chunks.push(text.slice(start, end))

    if (end === text.length) break
    start += size - overlap
  }

  return chunks
}
```

**验收标准**

1. chunk 之间有重叠内容
2. 关键信息不容易被切断
3. chunk 数量合理增长

---

### 6.3 任务 2：给 Chunk 增加 metadata

升级：

```ts
type KnowledgeChunk = {
  id: string
  documentId: string
  text: string
  embedding?: number[]

  index: number
  startOffset: number
  endOffset: number
  tokenEstimate?: number
}
```

**为什么？** 因为以后要展示来源：

- 来自第几个 chunk
- 在原文什么位置
- 相似度多少

---

### 6.4 任务 3：实现 TopK 控制

现在不要固定：

```ts
slice(0, 3)
```

升级为：

```ts
retrieve(query, {
  topK: 5
})
```

示例：

```ts
type RetrieveOptions = {
  topK: number
  minScore?: number
}
```

---

### 6.5 任务 4：增加 minScore 阈值

有时候检索结果很差，也会硬塞给模型，这样会污染回答。

升级：

```ts
const filtered = scoredChunks.filter(
  item => item.score >= minScore
)
```

建议默认：`minScore = 0.3`

---

### 6.6 任务 5：RAG 无结果 fallback

如果没有合格 chunk：

```ts
return {
  answer: "知识库中没有找到足够相关的信息，我只能基于当前对话回答。",
  retrievedChunks: []
}
```

**核心原则**：不要把低相关知识硬塞给模型。

---

### 6.7 任务 6：优化 RAG Prompt

从：

```text
请基于以下知识回答
```

升级成：

```text
你是一个严谨的知识库问答助手。

规则：
1. 优先基于知识片段回答
2. 如果知识片段不足，明确说明「不足」
3. 不要编造知识片段中没有的信息
4. 回答后列出使用了哪些 chunk
```

Prompt 示例：

```ts
const prompt = `
你是一个严谨的知识库问答助手。

【回答规则】
1. 优先基于知识片段回答
2. 如果知识片段不足，请明确说明
3. 不要编造知识片段中不存在的信息
4. 回答要简洁清晰

【知识片段】
${retrievedChunks.map((c, i) => `
[Chunk ${i + 1}]
score: ${c.score}
source: ${c.documentTitle}
${c.text}
`).join("\n")}

【用户问题】
${question}
`
```

---

### 6.8 任务 7：前端展示 RAG Debug Panel

展示：

| 字段 | 说明 |
|------|------|
| Query | 检索查询 |
| TopK | 返回条数配置 |
| MinScore | 相似度阈值 |
| Retrieved Chunks | 命中片段列表 |
| Similarity Score | 每条相似度 |
| Document Title | 来源文档 |
| Chunk Index | 块序号 |

这一步非常重要，因为 **RAG 的问题很多时候不是 LLM 的问题，而是 retrieval 的问题**。

---

### 6.9 任务 8：增加 RAG Metrics

新增：

```ts
type RetrievalMetrics = {
  queryCount: number
  avgTopScore: number
  noResultCount: number
  avgRetrievedChunks: number
}
```

---

### 6.10 任务 9：做 5 个测试问题

导入一段你的学习笔记，然后测试：

1. Workflow Runtime 是什么？
2. HITL 的作用是什么？
3. Tool Registry 解决了什么问题？
4. Memory 和 RAG 有什么区别？
5. 如果知识库没有相关内容，系统会怎么回答？

记录每个问题：

- 是否检索到正确 chunk
- 是否回答准确
- 是否出现幻觉

---

### 6.11 第25天验收标准

| # | 验收项 |
|---|--------|
| 1 | 是否实现 overlap chunking |
| 2 | 是否给 chunk 增加 metadata |
| 3 | 是否支持 topK |
| 4 | 是否支持 minScore |
| 5 | 是否实现无结果 fallback |
| 6 | 是否优化 RAG prompt |
| 7 | 前端是否展示 RAG Debug Panel |
| 8 | 是否增加 RAG metrics |
| 9 | 是否完成 5 个测试问题 |

---

### 6.12 第25天打卡模板

```text
【第25天打卡】

1. 是否实现 overlap chunking：是 / 否
2. 是否给 chunk 增加 metadata：是 / 否
3. 是否支持 topK：是 / 否
4. 是否支持 minScore：是 / 否
5. 是否实现无结果 fallback：是 / 否
6. 是否优化 RAG prompt：是 / 否
7. 前端是否展示 RAG Debug Panel：是 / 否
8. 是否增加 RAG metrics：是 / 否
9. 是否完成 5 个测试问题：是 / 否

10. 遇到的最大问题：

11. 当前系统能力：
```

---

### 6.13 第25天核心认知

> **RAG 的核心不是「能检索」，而是「检索得准、知道什么时候不该回答」。**

做完第 25 天后，你的系统会升级成：

```text
🔥 RAG Runtime V2：可调试、可控、低幻觉。
```

能力演进（完成后）：

```text
第24天  Knowledge-aware Agent Runtime V1（RAG + Retrieval Tool + Knowledge Metrics）
第25天  RAG Runtime V2（Overlap Chunking + TopK/minScore + Debug Panel + 低幻觉 Prompt）
```

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `lib/knowledge-types.ts` | Document / Chunk / Metrics 类型 |
| `lib/knowledge-chunking.ts` | 固定窗口切块（第25天：overlap + metadata） |
| `lib/knowledge-embedding.ts` | Ollama `/api/embeddings` |
| `lib/knowledge-retrieval.ts` | cosineSimilarity + retrieveTopChunks |
| `lib/knowledge-rag.ts` | buildRagPrompt |
| `lib/knowledge-store.ts` | 导入 / 检索 / 指标 / 持久化 |
| `lib/workflow-tools.ts` | retrieval + ragAnswer 注册 |
| `app/api/knowledge/route.ts` | 知识库 API |
| `app/page.tsx` | RAG UI |
| `day24_test_cases.md` | TC-24-01 ~ TC-24-15 |

---

*实现日期：2026-05-25（第24天 RAG）；第25天计划见 §6；测试见 `day24_test_cases.md`。*
