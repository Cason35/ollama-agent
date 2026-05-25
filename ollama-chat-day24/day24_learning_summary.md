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

## 4. 第24天打卡

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

## 5. 相关文件

| 文件 | 说明 |
|------|------|
| `lib/knowledge-types.ts` | Document / Chunk / Metrics 类型 |
| `lib/knowledge-chunking.ts` | 固定窗口切块 |
| `lib/knowledge-embedding.ts` | Ollama `/api/embeddings` |
| `lib/knowledge-retrieval.ts` | cosineSimilarity + retrieveTopChunks |
| `lib/knowledge-rag.ts` | buildRagPrompt |
| `lib/knowledge-store.ts` | 导入 / 检索 / 指标 / 持久化 |
| `lib/workflow-tools.ts` | retrieval + ragAnswer 注册 |
| `app/api/knowledge/route.ts` | 知识库 API |
| `app/page.tsx` | RAG UI |
| `day24_test_cases.md` | TC-24-01 ~ TC-24-15 |

---

*实现日期：2026-05-25（第24天 RAG）；测试见 `day24_test_cases.md`。*
