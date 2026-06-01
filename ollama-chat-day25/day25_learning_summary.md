# 第25天学习总结：RAG Runtime V2（质量优化 + 可调试）

对照 `ollama-chat-day24/day24_learning_summary.md` §6 学习计划，本仓库 **`ollama-chat-day25`** 在 day24 **Knowledge-aware Agent Runtime V1** 之上完成 **RAG Runtime V2**。

> **上一章**：day24 Local RAG + Retrieval Tool；**本章**：Overlap Chunking + TopK/minScore + 低幻觉 Prompt + RAG Debug Panel V2；**下一章**：day26 Rerank + Hybrid Search（见 §6）。

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

## 3. 第25天总结

你第 25 天已经完成了：

### ✅ RAG Runtime V2：可调试、可控、低幻觉

你现在的 RAG 不只是「能检索」，而是已经具备：

- overlap chunking
- chunk metadata
- topK 控制
- minScore 阈值
- 无结果 fallback
- RAG prompt 约束
- RAG Debug Panel
- retrieval metrics
- 测试问题验证

这说明你已经开始掌握 RAG 的核心：

> **RAG 不是把知识塞给模型，而是控制「检索什么、注入什么、什么时候不注入」。**

---

## 4. 第25天打卡

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

## 5. 核心认知

> **RAG 的核心不是「能检索」，而是「检索得准、知道什么时候不该回答」。**

做完第 25 天后，你的系统已升级成：

```text
🔥 RAG Runtime V2：可调试、可控、低幻觉。
```

能力演进：

```text
第24天  Knowledge-aware Agent Runtime V1
第25天  RAG Runtime V2（Overlap + TopK/minScore + Debug + 低幻觉）
```

---

## 6. 第26天学习计划：Rerank + Hybrid Search

> **下一章**：`ollama-chat-day26` — 让 RAG 从「向量相似度检索」升级为「更可靠的多阶段检索」。

### 6.1 今日核心目标

第 25 天你已经实现：

```text
query embedding → cosine similarity → topK chunks
```

第 26 天要升级成：

```text
第一阶段：召回 Recall
第二阶段：重排 Rerank
第三阶段：过滤 Filter
第四阶段：注入 Prompt
```

### 6.2 为什么要做 Rerank？

向量检索有一个常见问题：**语义像，但不一定最有用。**

例如用户问：

> HITL 为什么重要？

向量检索可能找出：

- 「用户确认按钮」

但真正最有用的是：

- 「Agent 在关键节点暂停并等待用户确认」

所以需要 **Rerank：把召回结果重新排序**。

### 6.3 第26天最终效果

用户问题：

> Workflow Runtime 中 HITL 的作用是什么？

系统流程：

```text
1. 向量召回 top20
2. rerank 重新打分
3. 选出 top5
4. minScore 过滤
5. 注入 prompt
6. 返回答案
```

---

### 6.4 任务 1：把 retrieve 拆成两阶段

之前：

```ts
retrieve(query, { topK: 5 })
```

升级为：

```ts
retrieve(query, {
  recallK: 20,
  topK: 5,
  minScore: 0.3
})
```

新增类型：

```ts
type RetrieveOptions = {
  recallK: number
  topK: number
  minScore: number
}
```

执行逻辑：

1. 先用 cosine similarity 召回 `recallK`
2. 再 rerank
3. 最后取 `topK`

---

### 6.5 任务 2：实现最小 Reranker

今天先做规则版，不要急着接新模型。

```ts
function rerank(query: string, chunks: ScoredChunk[]) {
  return chunks.map(item => {
    let bonus = 0

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    for (const term of terms) {
      if (item.chunk.text.toLowerCase().includes(term)) {
        bonus += 0.05
      }
    }

    return {
      ...item,
      rerankScore: item.score + bonus
    }
  }).sort((a, b) => b.rerankScore - a.rerankScore)
}
```

---

### 6.6 任务 3：加入关键词检索 BM25 简化版

今天做轻量版即可。

核心思路：

| 方式 | 作用 |
|------|------|
| 向量检索 | 语义相似 |
| 关键词检索 | 字面匹配 |

简单实现：

```ts
function keywordScore(query: string, text: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  let score = 0

  for (const term of terms) {
    if (text.toLowerCase().includes(term)) {
      score += 1
    }
  }

  return score / Math.max(terms.length, 1)
}
```

---

### 6.7 任务 4：实现 Hybrid Score

把 `vectorScore` 和 `keywordScore` 合成：

```ts
hybridScore = vectorScore * 0.7 + keywordScore * 0.3
```

新增：

```ts
type ScoredChunk = {
  chunk: KnowledgeChunk
  vectorScore: number
  keywordScore: number
  hybridScore: number
  rerankScore?: number
}
```

---

### 6.8 任务 5：支持检索模式切换

前端增加选项：

```text
Retrieval Mode:
- vector
- keyword
- hybrid
```

后端：

```ts
type RetrievalMode = "vector" | "keyword" | "hybrid"
```

不同模式排序：

```ts
if (mode === "vector") sort by vectorScore
if (mode === "keyword") sort by keywordScore
if (mode === "hybrid") sort by hybridScore
```

---

### 6.9 任务 6：RAG Debug Panel 升级

展示：

| 字段 | 说明 |
|------|------|
| chunk title | 片段标题 |
| vectorScore | 向量相似度 |
| keywordScore | 关键词匹配分 |
| hybridScore | 混合分 |
| rerankScore | 重排分 |
| finalRank | 最终排名 |

这样你能知道：**为什么这个 chunk 被选中。**

---

### 6.10 任务 7：增加 Noisy Query 测试

测试：

1. hitl 有啥用？
2. 人工确认节点是干啥的？
3. workflow 持久化怎么恢复？
4. tool registry 为什么要抽象？
5. RAG 和 memory 区别？

目标：**同义表达也能命中正确 chunk**。

---

### 6.11 任务 8：增加 Retrieval Evaluation 表

前端或日志记录：

| 字段 | 说明 |
|------|------|
| query | 查询文本 |
| expectedTopic | 期望命中主题 |
| top1Hit | top1 是否命中 |
| top3Hit | top3 是否命中 |
| usedMode | 使用的检索模式 |
| notes | 备注 |

你可以先用简单数组记录。

---

### 6.12 第26天验收标准

| # | 验收项 |
|---|--------|
| 1 | 是否支持 recallK / topK 两阶段 |
| 2 | 是否实现 rerank |
| 3 | 是否实现 keywordScore |
| 4 | 是否实现 hybridScore |
| 5 | 是否支持 vector / keyword / hybrid 模式 |
| 6 | Debug Panel 是否展示多种 score |
| 7 | 是否完成 noisy query 测试 |
| 8 | 是否增加 retrieval evaluation 记录 |

---

### 6.13 第26天打卡模板

```text
【第26天打卡】

1. 是否支持 recallK / topK 两阶段：是 / 否
2. 是否实现 rerank：是 / 否
3. 是否实现 keywordScore：是 / 否
4. 是否实现 hybridScore：是 / 否
5. 是否支持 vector / keyword / hybrid 模式：是 / 否
6. Debug Panel 是否展示 vector / keyword / hybrid / rerank score：是 / 否
7. 是否完成 noisy query 测试：是 / 否
8. 是否增加 retrieval evaluation 记录：是 / 否

9. 遇到的最大问题：

10. 当前系统能力：
```

---

### 6.14 第26天核心认知

> **向量检索负责「召回相似内容」，Rerank 负责「挑出真正有用内容」。**

做完第 26 天后，你的系统会升级成：

```text
🔥 RAG Runtime V3：Hybrid Search + Rerank。
```

能力演进（完成后）：

```text
第25天  RAG Runtime V2（Overlap + TopK/minScore + Debug + 低幻觉）
第26天  RAG Runtime V3（Hybrid Search + Rerank + 多阶段检索）
```

---

*实现日期：2026-05-26；测试见 `day25_test_cases.md`；第26天计划见 §6。*
