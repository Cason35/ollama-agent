# 第25天学习总结：RAG Runtime V2（质量优化 + 可调试）

对照 `ollama-chat-day24/day24_learning_summary.md` §6 学习计划，本仓库 **`ollama-chat-day25`** 在 day24 **Knowledge-aware Agent Runtime V1** 之上完成 **RAG Runtime V2**。

> **上一章**：day24 Local RAG + Retrieval Tool；**本章**：Overlap Chunking + TopK/minScore + 低幻觉 Prompt + RAG Debug Panel V2。

```text
导入文档
    ↓
Overlap Chunking（500 / overlap 100）+ metadata
    ↓
Embedding → Store
    ↓
retrieve(query, { topK, minScore })
    ↓
无合格 chunk → fallback（不硬塞低分片段）
    ↓
有合格 chunk → 严谨 RAG Prompt → LLM
```

---

## 1. 能力对比

| 阶段 | 切块 | 检索 | 回答 |
|------|------|------|------|
| 第24天 | 固定 500 无重叠 | TopK=3 固定 | 简单 Prompt |
| **第25天** | **overlap + metadata** | **TopK + minScore** | **低幻觉 Prompt + fallback** |

---

## 2. 实现清单

| 任务 | 文件 | 状态 |
|------|------|------|
| Overlap chunking | `lib/knowledge-chunking.ts` | ✅ |
| Chunk metadata | `lib/knowledge-types.ts` | ✅ |
| TopK 控制 | `lib/knowledge-retrieval.ts` | ✅ |
| minScore 阈值 | `lib/knowledge-retrieval.ts` | ✅ |
| 无结果 fallback | `lib/knowledge-rag.ts` | ✅ |
| RAG Prompt V2 | `lib/knowledge-rag.ts` | ✅ |
| RAG Debug Panel | `app/page.tsx` | ✅ |
| RetrievalMetrics | `lib/knowledge-store.ts` | ✅ |
| 测试用例文档 | `day25_test_cases.md` | ✅ |

---

## 3. 第25天打卡

```text
【第25天打卡】

1. 是否实现 overlap chunking：是
2. 是否给 chunk 增加 metadata：是
3. 是否支持 topK：是
4. 是否支持 minScore：是
5. 是否实现无结果 fallback：是
6. 是否优化 RAG prompt：是
7. 前端是否展示 RAG Debug Panel：是
8. 是否增加 RAG metrics：是
9. 是否完成 5 个测试问题：见 day25_test_cases.md §5

10. 遇到的最大问题：（自填）

11. 当前系统能力：
RAG Runtime V2 + Knowledge-aware Agent V1 + Capability Runtime V2 + Persistent DAG + HITL
```

---

## 4. 核心认知

> **RAG 的核心不是「能检索」，而是「检索得准、知道什么时候不该回答」。**

能力演进：

```text
第24天  Knowledge-aware Agent Runtime V1
第25天  RAG Runtime V2（Overlap + TopK/minScore + Debug + 低幻觉）
```

---

*实现日期：2026-05-26；测试见 `day25_test_cases.md`。*
