# Day 26 学习总结：RAG Runtime V3（Hybrid Search 混合检索 + Rerank 重排）

本文件记录第 26 天 `ollama-chat-day26` 项目的学习理解、关键问答、与 day25 的能力对比、第 26 天打卡结果，以及第 27 天学习计划。

---

## 1. 项目做了什么

`ollama-chat-day26` 是在 `ollama-chat-day25` 的基础上继续升级的 Next.js（React 全栈框架）聊天项目。

它保留了 day25 已经完成的能力：

- 普通 Chat（聊天）
- Workflow（工作流，多步骤任务）
- HITL（Human-in-the-loop，人在回路/人工确认）
- Tool Registry（工具注册表）
- Knowledge Store（知识库）
- RAG（Retrieval-Augmented Generation，检索增强生成）
- RAG Debug Panel（RAG 调试面板）

第 26 天重点升级的是 RAG Retrieval（检索）链路。

day25 的检索流程主要是：

```text
用户问题
-> embedding（向量化）
-> cosine similarity（余弦相似度）
-> topK（取前 K 条）
-> minScore（最低分过滤）
-> Prompt（提示词）注入
-> LLM（大语言模型）回答
```

day26 升级成：

```text
用户问题
-> 计算 vectorScore / keywordScore / hybridScore
-> 按 mode（检索模式）召回 recallK 条候选
-> rerank（重排）
-> minScore（最低分过滤）
-> topK（最终取前 K 条）
-> Prompt（提示词）注入
-> LLM（大语言模型）回答
```

核心变化是：day26 不再只看向量相似度，而是加入 keyword（关键词匹配）、hybrid（混合评分）、rerank（重排）和可切换 Retrieval Mode（检索模式）。

---

## 2. day25 与 day26 对比

| 对比项 | day25：RAG Runtime V2 | day26：RAG Runtime V3 |
|---|---|---|
| 检索方式 | vector search（向量检索） | vector / keyword / hybrid 三种模式 |
| 候选数量 | 直接 topK | 先 recallK 召回，再 topK |
| 分数类型 | 单一 score | vectorScore / keywordScore / hybridScore / rerankScore |
| 排序方式 | 主要按向量相似度 | 按 mode 召回，再 rerank |
| 调试能力 | 展示 query、topK、minScore、score | 展示 mode、recallK、topK、多种 score、finalRank |
| 抗噪能力 | 一般 | 更好，但仍是学习版 |
| 核心目标 | 不乱答，低幻觉 | 找得更准，排序更可解释 |

---

## 3. 关键概念解释

### 3.1 RAG（Retrieval-Augmented Generation，检索增强生成）

RAG 的核心思想是：模型回答问题之前，先从知识库中检索相关资料，再把资料塞进 Prompt（提示词）中，让 LLM（大语言模型）基于资料回答。

### 3.2 embedding（向量化）

embedding 是把文本转成一组数字向量。用户问题和知识库 chunk（文本片段）都可以变成向量，然后通过 cosine similarity（余弦相似度）比较它们语义上是否接近。

### 3.3 chunk（文本片段）

chunk 是把一篇长文档切成的小段。RAG 检索时通常不是直接检索整篇文章，而是检索这些 chunk。

### 3.4 recallK（召回候选数量）

`recallK` 表示第一阶段先保留多少个候选 chunk。

例如：

```text
recallK = 20
topK = 5
```

意思是：先召回 20 条候选，再经过 rerank（重排）和 filter（过滤），最后只取 5 条。

### 3.5 topK（最终返回数量）

`topK` 表示最终进入 Prompt（提示词）的 chunk 数量。

### 3.6 keywordScore（关键词匹配分）

`keywordScore` 是根据用户问题中的词是否出现在 chunk 文本里计算的分数。它主要解决“字面命中”的问题。

### 3.7 vectorScore（向量相似度分）

`vectorScore` 是用户问题向量与 chunk 向量之间的相似度分数。它主要解决“语义接近”的问题。

### 3.8 hybridScore（混合分）

`hybridScore` 是把 vectorScore 和 keywordScore 按比例合成的分数：

```ts
hybridScore = vectorScore * 0.7 + keywordScore * 0.3
```

它的目标是同时兼顾语义相似和字面命中。

### 3.9 rerank（重排）

rerank 是在已经召回的一批候选 chunk 中重新排序。当前 day26 是规则版 rerank，不是模型版 reranker（重排模型）。

---

## 4. 对话记录与理解

### 问答 1：recallK 是否仍然依赖向量召回

**我问：**

> 这里 recallK 让系统先保留更多候选，减少好 chunk 被提前丢掉的概率，不是还是根据向量接近的来拿的吗？这种情况不就有可能返回的 20 条都没有语义化的 chunk 吗？

**回答：**

对，这个质疑是成立的。

在当前 day26 实现里，`recallK` 本身并不是万能的。如果 Retrieval Mode（检索模式）是 `vector`，那第一阶段确实是按 vectorScore（向量相似度分）拿前 20 条。如果 embedding（向量化）没有把真正正确的 chunk 排进前 20，那么后面的 rerank（重排）也救不回来。

更准确地说：

```text
recallK 只能减少“正确 chunk 本来排在 topK 后面、但仍在候选池里”的丢失概率。
recallK 不能解决“正确 chunk 根本没有被第一阶段召回”的问题。
```

也就是说，如果真正有用的 chunk 排在第 35 名，而 recallK 只取前 20，那么它依然会被丢掉。

这也是为什么真实 RAG（检索增强生成）系统通常会做 multi-recall（多路召回），而不是只依赖单一路径。

更工程化的流程通常是：

```text
vector recall（向量召回） topN
+
keyword recall（关键词召回） topN
+
metadata recall（元数据召回） topN
+
title recall（标题召回） topN
-> merge and deduplicate（合并去重）
-> rerank（重排）
-> filter（过滤）
-> topK（最终取前 K 条）
```

所以 day26 当前只是学习版：

```text
vector / keyword / hybrid 排序模式
+ recallK
+ rerank
```

它降低了好 chunk 被过早丢掉的概率，但不能彻底解决“召回不到”的问题。真正更稳的是 multi-recall（多路召回）+ rerank（重排）。

---

### 问答 2：day26 的整体检索流程能不能这样理解

**我问：**

> 我能不能这样理解，现在 day26 就是用户输入问题 x，系统通过 embedding 模型来给 x 算向量，然后再和 RAG 里面的 chunk 对比，找出最相近的 20 个，然后根据用户传来的模式（"vector" | "keyword" | "hybrid"）来确认是用 vectorScore 向量分数、keywordScore 关键词匹配分数、hybridScore 向量和关键词分数按比例的分数来选取前五条，再塞进提示词，让模型做出回答给用户？

**回答：**

这个理解基本正确，但有一个关键修正：

day26 不是永远先用 embedding（向量化）找最相近的 20 个。它会先给所有 chunk（文本片段）计算：

- `vectorScore`：向量相似度分
- `keywordScore`：关键词匹配分
- `hybridScore`：混合分

然后根据用户选择的 `mode`（检索模式）决定用哪种分数召回 `recallK = 20` 条候选。

更准确的流程是：

```text
用户输入问题 x
-> 给 x 生成 embedding（向量）
-> 遍历知识库里的每个 chunk（文本片段）
-> 对每个 chunk 计算三种分数：
   1. vectorScore：x 向量和 chunk 向量的相似度
   2. keywordScore：x 的关键词是否出现在 chunk 文本里
   3. hybridScore：vectorScore * 0.7 + keywordScore * 0.3
-> 根据用户选择的 mode 排序：
   mode = vector  -> 按 vectorScore 排
   mode = keyword -> 按 keywordScore 排
   mode = hybrid  -> 按 hybridScore 排
-> 先取前 20 条，也就是 recallK
-> 在这 20 条里做 rerank（重排）
-> 过滤低于 minScore（最低分阈值）的结果
-> 最终取前 5 条，也就是 topK
-> 把这 5 条 chunk 塞进 RAG Prompt（检索增强提示词）
-> 让 LLM（大语言模型）基于这些 chunk 回答用户
```

所以：

```text
如果 mode = vector，确实是按向量相似度取前 20。
如果 mode = keyword，则更偏向关键词命中的 20 条。
如果 mode = hybrid，则按 vectorScore * 0.7 + keywordScore * 0.3 取前 20。
```

最终可以记成：

```text
算分 -> 按模式召回 20 条 -> rerank -> minScore 过滤 -> 取前 5 条 -> 注入 Prompt -> 模型回答
```

---

### 问答 3：rerank 的排序依据是什么

**我问：**

> 那 rerank 的排序依据是什么呢？

**回答：**

在当前 day26 里，`rerank`（重排）的排序依据是一个轻量规则：

```ts
rerankScore = 当前模式下的基础分 + 关键词命中奖励
```

它会先根据当前 `mode`（检索模式）拿基础分：

```ts
if (mode === "vector") baseScore = vectorScore
if (mode === "keyword") baseScore = keywordScore
if (mode === "hybrid") baseScore = hybridScore
```

然后把用户问题切成 terms（词项），如果 chunk 文本里包含某个 term，就加一点 bonus（奖励分）：

```ts
if (chunk.text.includes(term)) {
  bonus += 0.05
}
```

最终：

```ts
rerankScore = Math.min(1, baseScore + bonus)
```

再按照 `rerankScore` 从高到低排序。

举例：

```text
用户问题：tool registry 为什么要抽象？
```

候选 chunk A：

```text
hybridScore = 0.72
文本里包含 tool registry
```

候选 chunk B：

```text
hybridScore = 0.75
文本里不包含 tool registry
```

经过 rerank 后：

```text
A: 0.72 + 关键词奖励 = 0.82
B: 0.75
```

A 就可能排到 B 前面。

当前 rerank 的目的不是“彻底理解问题”，而是：

```text
在已经召回的一批候选里，把更明确命中用户问题关键词的 chunk 往前推一点。
```

它的局限也很明显：

- 只看字面包含
- 中文没有真正分词
- 不理解同义词
- 不判断 chunk 是否真的回答了问题
- 只能重排已经被召回的候选，没召回的 chunk 依然救不了

更高级的版本会使用 reranker model（重排模型）：

```text
query（问题） + chunk（文本片段）
-> reranker model（重排模型）
-> relevance score（相关性分数）
```

那时排序依据就不是简单关键词奖励，而是模型判断“这个 chunk 对这个问题到底有多相关”。

---

## 5. 为什么这样设计

day26 这样设计，是为了让 RAG 从“能检索”进一步走向“能调质量”。

### 5.1 为什么要 recallK

因为如果直接取 topK，真正有用的 chunk 可能排在第 6、第 8、第 12 位，被提前丢掉。

`recallK` 的作用是延后截断：

```text
先保留更多候选，再让 rerank 有机会重新排序。
```

但它不能解决所有问题。如果第一阶段召回失败，rerank 也无能为力。

### 5.2 为什么要 keywordScore

因为 vectorScore（向量相似度分）负责语义相似，但有时候字面关键词更可靠。

例如：

```text
tool registry 为什么要抽象？
```

如果某个 chunk 明确包含 `tool registry`，它就应该得到额外关注。

### 5.3 为什么要 hybridScore

因为只看 vectorScore 可能“语义像但不精确”，只看 keywordScore 又可能“不懂同义表达”。

hybridScore（混合分）把两者结合：

```text
vectorScore 负责语义召回
keywordScore 负责字面证据
hybridScore 负责折中
```

### 5.4 为什么要 rerank

因为召回阶段的目标是“别漏掉”，而 rerank 阶段的目标是“排得更准”。

这也是很多真实 RAG 系统的常见结构：

```text
Recall（召回） -> Rerank（重排） -> Filter（过滤） -> Prompt Injection（提示词注入）
```

---

## 6. 当前系统能力

当前 `ollama-chat-day26` 已经具备：

- RAG Runtime V3（检索增强生成运行时 V3）
- RecallK / TopK 两阶段检索
- vector search（向量检索）
- keyword search（关键词检索）
- hybrid search（混合检索）
- rule-based rerank（规则版重排）
- minScore filter（最低分过滤）
- RAG Debug Panel V3（RAG 调试面板 V3）
- 多 score 可观测性：
  - vectorScore（向量分）
  - keywordScore（关键词分）
  - hybridScore（混合分）
  - rerankScore（重排分）
  - finalRank（最终排名）

---

## 7. 第26天打卡

```text
【第26天打卡】

1. 是否支持 recallK / topK 两阶段：是
2. 是否实现 rerank：是
3. 是否实现 keywordScore：是
4. 是否实现 hybridScore：是
5. 是否支持 vector / keyword / hybrid 模式：是
6. Debug Panel 是否展示 vector / keyword / hybrid / rerank score：是
7. 是否完成 noisy query 测试：是（已在 day26_test_cases.md 中提供 noisy query 测试集与验收表）
8. 是否增加 retrieval evaluation 记录：是（已在 day26_test_cases.md 中增加 query / expectedTopic / top1Hit / top3Hit / usedMode / notes 表）

9. 遇到的最大问题：
当前 recallK 仍然受第一阶段召回方式限制。如果正确 chunk 没有进入 recallK 候选池，后续 rerank 无法挽救；当前规则版 rerank 也只做关键词奖励，不能真正理解 query 与 chunk 的深层相关性。

10. 当前系统能力：
RAG Runtime V3 + Hybrid Search + Rule-based Rerank + RecallK/TopK Multi-stage Retrieval + RAG Debug Panel V3 + Retrieval Evaluation
```

---

## 8. 一句话总结

day26 的核心不是简单把 `topK` 改大，而是让 RAG 检索链路变成：

```text
先多召回，再按模式评分，再重排，再过滤，最后只把更可靠的 chunk 注入 Prompt。
```

这一步让系统从“能做 RAG”进入到“能分析和调试 RAG 质量”的阶段。

---

## 9. 第 26 天总结

你第 26 天完成了：

**RAG Runtime V3：Hybrid Search + Rule-based Rerank**

你已经从：

- 单纯向量检索

升级成：

- 多阶段检索系统

现在你的 RAG 已经具备：

- recallK / topK 两阶段检索
- vector search（向量检索）
- keyword search（关键词检索）
- hybrid score（混合评分）
- rule-based rerank（规则版重排）
- retrieval mode 切换
- RAG Debug Panel V3
- noisy query 测试集
- retrieval evaluation 表

你今天遇到的问题非常关键：

> 如果正确 chunk 没进入 recallK，rerank 无法挽救。

这说明你已经理解了 RAG 的核心瓶颈：

**Retrieval 质量上限由 Recall 决定**

所以第 27 天重点不是继续“调 rerank”，而是：

**提升 Recall 能力**

---

## 10. 第 27 天学习计划：Query Rewrite + Multi-Query Retrieval

### 10.1 今日核心目标

让系统不要只用“用户原问题”检索，而是自动生成多个检索 query，提高召回率。

### 10.2 为什么第 27 天要做这个？

你现在的流程是：

```text
用户 query
-> embedding（向量化）
-> recallK
-> rerank
```

问题是：用户表达可能很模糊，例如：

- 用户问：`人工确认有啥用？`
- 文档里写的是：`Human-in-the-loop`、`HITL`、`等待用户确认`、`关键节点暂停`

如果只用原 query，可能召回不到。

所以要做：

- **Query Rewrite**（查询改写）
- **Multi-Query Retrieval**（多查询检索）

### 10.3 第 27 天最终效果

用户问：

```text
人工确认节点是干啥的？
```

系统自动生成：

1. 人工确认节点的作用是什么
2. HITL 在 Agent Runtime 中的作用
3. Workflow 中 waiting_confirmation 状态的意义
4. Agent 在关键步骤前暂停等待用户确认的机制

然后用多个 query 检索，合并结果，再 rerank。

---

### 任务 1：新增 QueryRewriteTool

新增工具：

```ts
const queryRewriteTool: Tool = {
  name: "queryRewrite",
  description: "将用户问题改写成多个用于知识检索的查询表达",
  capabilities: ["query-rewrite", "retrieval-optimization"],

  inputSchema: {
    query: "string",
    maxQueries: "number"
  },

  outputSchema: {
    queries: "string[]"
  },

  async execute(input) {
    // 调用 LLM 或规则生成 query variants
  }
}
```

---

### 任务 2：先实现规则版 rewrite

今天先别完全依赖模型，先做稳定规则版。

```ts
function rewriteQuery(query: string) {
  const queries = new Set<string>()

  queries.add(query)

  if (query.includes("人工确认")) {
    queries.add("HITL human in the loop")
    queries.add("waiting_confirmation 用户确认 工作流")
    queries.add("Agent 关键步骤 暂停 等待用户确认")
  }

  if (query.includes("工作流") || query.toLowerCase().includes("workflow")) {
    queries.add("Workflow Runtime DAG 执行 依赖")
    queries.add("工作流 状态机 执行步骤")
  }

  if (query.includes("工具") || query.toLowerCase().includes("tool")) {
    queries.add("Tool Registry Capability Routing")
    queries.add("工具注册 工具能力 路由")
  }

  if (query.includes("记忆") || query.toLowerCase().includes("memory")) {
    queries.add("Memory longTerm shortTerm Summary Memory")
    queries.add("长期记忆 短期记忆 摘要记忆")
  }

  return Array.from(queries).slice(0, 5)
}
```

---

### 任务 3：再实现 LLM 版 rewrite

Prompt：

```ts
const prompt = `
你是一个检索查询改写器。

请把用户问题改写成 3-5 个适合知识库检索的查询。

要求：
1. 保留原始问题含义
2. 包含中英文关键词
3. 包含可能的专业术语
4. 只返回 JSON

格式：
{
  "queries": ["...", "..."]
}

用户问题：
${query}
`
```

建议策略：

- 规则版作为 fallback
- LLM 版优先

---

### 任务 4：实现 Multi-Query Retrieval

现在：

```ts
retrieve(query)
```

升级成：

```ts
multiQueryRetrieve(query)
```

流程：

1. rewrite query → `queries[]`
2. 对每个 query 执行 `retrieve`
3. 合并所有结果
4. 按 `chunkId` 去重
5. 聚合 score
6. rerank
7. 返回 topK

---

### 任务 5：实现结果去重

同一个 chunk 可能被多个 query 命中。

用：

```ts
const map = new Map<string, ScoredChunk>()

// 如果重复：
existing.score = Math.max(existing.score, newScore)
existing.matchedQueries.push(query)
```

---

### 任务 6：增加 matchedQueries 字段

升级：

```ts
type ScoredChunk = {
  chunk: KnowledgeChunk
  vectorScore: number
  keywordScore: number
  hybridScore: number
  rerankScore: number

  matchedQueries?: string[]
}
```

前端展示：

```text
Matched Queries:
- HITL human in the loop
- waiting_confirmation 用户确认 工作流
```

---

### 任务 7：增加 query expansion debug panel

展示：

```text
Original Query:
人工确认节点是干啥的？

Rewritten Queries:
1. 人工确认节点的作用是什么
2. HITL human in the loop
3. waiting_confirmation 用户确认 工作流

Retrieved Chunks:
...
```

---

### 任务 8：增加 Multi-Query Metrics

新增：

```ts
type QueryRewriteMetrics = {
  rewriteCount: number
  avgGeneratedQueries: number
  multiQueryHitRate: number
  improvedTop1Count: number
}
```

---

### 任务 9：扩展 noisy query 测试

继续用 `day26_test_cases.md`，新增：

1. 人工确认节点是干啥的？
2. 那个等用户点确认的状态是什么？
3. 工具为啥要注册起来？
4. Agent 怎么知道该用哪个能力？
5. 长期知识和记忆有啥区别？

比较：

- single query vs multi query
- top1Hit / top3Hit 是否提升

---

### 10.4 第 27 天验收标准

1. 是否新增 QueryRewriteTool
2. 是否实现规则版 query rewrite
3. 是否实现 LLM 版 query rewrite
4. 是否实现 multiQueryRetrieve
5. 是否实现 chunk 去重
6. 是否记录 matchedQueries
7. Debug Panel 是否展示 rewritten queries
8. 是否增加 multi-query metrics
9. 是否完成 single vs multi query 对比测试

---

### 10.5 第 27 天打卡模板

```text
【第27天打卡】

1. 是否新增 QueryRewriteTool：是 / 否
2. 是否实现规则版 query rewrite：是 / 否
3. 是否实现 LLM 版 query rewrite：是 / 否
4. 是否实现 multiQueryRetrieve：是 / 否
5. 是否实现 chunk 去重：是 / 否
6. 是否记录 matchedQueries：是 / 否
7. Debug Panel 是否展示 rewritten queries：是 / 否
8. 是否增加 multi-query metrics：是 / 否
9. 是否完成 single vs multi query 对比测试：是 / 否

10. 遇到的最大问题：

11. 当前系统能力：
```

---

### 10.6 第 27 天核心认知

记住一句话：

> **Rerank 只能优化候选排序，Query Rewrite 才能扩大候选来源。**

做完第 27 天后，你的系统会升级成：

**RAG Runtime V4：Multi-Query Retrieval + Query Rewrite**
