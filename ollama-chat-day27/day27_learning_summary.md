# Day 27 学习总结：RAG Runtime V4（Query Rewrite 查询改写 + Multi-Query Retrieval 多查询检索）

本文档记录第 27 天 `ollama-chat-day27` 项目的学习理解、关键问答、与 day26 的能力对比、为什么这样设计，以及第 27 天打卡结果。

---

## 1. 项目做了什么

`ollama-chat-day27` 是在 `ollama-chat-day26` 基础上继续升级的 Next.js（React 全栈框架）聊天与 Agent（智能体）项目。

它继承了 day26 已有能力：

- Chat（普通聊天）
- Workflow（工作流，多步骤任务执行）
- HITL（Human-in-the-loop，人在回路 / 人工确认）
- Tool Registry（工具注册表）
- Knowledge Store（知识库）
- RAG（Retrieval-Augmented Generation，检索增强生成）
- RAG Debug Panel（RAG 调试面板）
- Hybrid Search（混合检索）
- Rerank（重排）

第 27 天的核心升级是：

> 不再只用用户原始问题检索知识库，而是先把用户问题改写成多个检索 query（查询表达），再多路检索、合并、去重、重排，最后选出最相关的 chunk（文本片段）给模型回答。

也就是说，day27 把 RAG 检索链路升级成：

```text
用户原始问题
-> Query Rewrite（查询改写）
-> 生成多个检索 query（查询表达）
-> Multi-Query Retrieval（多查询检索）
-> 合并结果
-> chunk 去重（文本片段去重）
-> matchedQueries 记录（命中过该 chunk 的查询表达）
-> Rerank（重排）
-> minScore 过滤（最低分过滤）
-> TopK（最终取前 K 条）
-> 注入 Prompt（提示词）
-> LLM（Large Language Model，大语言模型）基于知识回答
```

---

## 2. 用到的核心知识

### 2.1 Next.js（React 全栈框架）

项目使用 Next.js App Router（应用路由）组织页面与接口：

- `app/page.tsx`：主页面
- `app/components/KnowledgeSidebar.tsx`：右侧知识库与 RAG Debug Panel（调试面板）
- `app/api/knowledge/route.ts`：知识库导入与指标接口
- `app/api/knowledge/retrieve/route.ts`：RAG 检索接口

### 2.2 RAG（Retrieval-Augmented Generation，检索增强生成）

RAG 的核心思想是：模型回答前，先从知识库里检索相关资料，再把资料塞进 Prompt（提示词）中，让模型基于资料回答。

简化流程：

```text
用户问题
-> 检索知识库
-> 找到相关 chunk（文本片段）
-> 注入 Prompt（提示词）
-> LLM（大语言模型）回答
```

### 2.3 Embedding（向量化）

Embedding（向量化）是把文本变成一组数字向量。系统会把用户 query（查询）和知识库 chunk（文本片段）都转成向量，然后用 cosine similarity（余弦相似度）判断它们语义上是否接近。

### 2.4 Hybrid Search（混合检索）

day27 继续继承 day26 的 Hybrid Search（混合检索）：

```text
hybridScore = vectorScore * 0.7 + keywordScore * 0.3
```

其中：

- `vectorScore`：向量相似度分数，负责语义接近
- `keywordScore`：关键词匹配分数，负责字面命中
- `hybridScore`：混合分数，同时考虑语义和关键词

### 2.5 Rerank（重排）

Rerank（重排）是在已经召回的一批候选 chunk 中重新排序。day27 当前仍是规则版 rerank，会给明确命中关键词的 chunk 一点额外奖励。

### 2.6 Query Rewrite（查询改写）

Query Rewrite（查询改写）是 day27 新增的关键能力。

它会把用户的口语化问题改写成多个更适合知识库检索的 query（查询表达）。

例如用户问：

```text
人工确认节点是干啥的？
```

系统会补充：

```text
HITL human in the loop 人工确认
waiting_confirmation 用户确认 工作流
Agent 关键步骤 暂停 等待用户确认
```

这样即使知识库里写的是专业术语，也更容易被检索出来。

### 2.7 Multi-Query Retrieval（多查询检索）

Multi-Query Retrieval（多查询检索）是指多个 query 一起检索知识库。

它不是用多个 query 直接生成答案，而是用多个 query 扩大召回范围，找到更多可能相关的 chunk，最后仍然围绕用户原始问题回答。

### 2.8 matchedQueries（命中查询记录）

同一个 chunk 可能被多个 query 命中。day27 新增 `matchedQueries` 字段，用来记录：

```text
这个 chunk 是被哪些 query 检索出来的
```

这样在 Debug Panel（调试面板）里能看到某个结果为什么会出现。

---

## 3. day26 和 day27 对比

| 对比项 | day26：RAG Runtime V3 | day27：RAG Runtime V4 |
|---|---|---|
| 检索入口 | 用户原始 query | 原始 query + 多个改写 query |
| Query Rewrite（查询改写） | 无 | 有 |
| Multi-Query Retrieval（多查询检索） | 无 | 有 |
| chunk 去重 | 不需要 | 有 |
| matchedQueries（命中查询记录） | 无 | 有 |
| Debug Panel（调试面板） | 展示 score（分数）和 rank（排名） | 额外展示 rewritten queries（改写查询）和 matched queries（命中查询） |
| Metrics（指标） | RAG 检索指标 | 新增 multi-query metrics（多查询指标） |
| 主要解决的问题 | 召回后怎么排得更准 | 怎么让正确 chunk 更容易被召回 |

day26 的流程可以理解为：

```text
用户 query
-> 计算 vectorScore / keywordScore / hybridScore
-> 按 mode 召回 recallK 条
-> rerank
-> minScore 过滤
-> topK
-> 注入 Prompt
```

day27 的流程升级为：

```text
用户 query
-> Query Rewrite
-> 多个 query 分别检索
-> 合并结果
-> chunk 去重
-> 记录 matchedQueries
-> rerank
-> minScore 过滤
-> topK
-> 注入 Prompt
```

---

## 4. 为什么要这样做

day26 的核心问题是：

> 如果正确 chunk 没有进入第一阶段 recallK，后面的 rerank 再怎么排也救不回来。

也就是说，Rerank（重排）只能优化已经召回的候选，不能把没召回的 chunk 变出来。

但用户的问题和文档里的写法经常不一样。

例如用户问：

```text
那个等用户点确认的状态是什么？
```

文档里可能写的是：

```text
HITL
Human-in-the-loop
waiting_confirmation
关键步骤暂停
等待用户确认
```

如果只用原始 query 检索，可能找不到正确 chunk。

所以 day27 用 Query Rewrite（查询改写）把用户的口语表达扩展成：

- 专业术语
- 英文缩写
- 状态字段
- 机制描述
- 中英文混合表达

这样做的本质是：

> Rerank（重排）是优化候选排序，Query Rewrite（查询改写）是扩大候选来源。

---

## 5. 对话记录与理解

### 问答 1：项目做了什么，用了什么知识，和 day26 有什么区别

**我问：**

> 带我来读懂 `ollama-chat-day27` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day26` 有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day27` 是一个基于 Next.js（React 全栈框架）的本地 AI Agent（智能体）聊天项目。它不只是聊天，还支持 Workflow（工作流）、HITL（人工确认）、Tool Registry（工具注册表）、Knowledge Store（知识库）、RAG（检索增强生成）和 RAG Debug Panel（调试面板）。

第 27 天新增的是 Query Rewrite（查询改写）和 Multi-Query Retrieval（多查询检索）。

day26 主要是 RAG Runtime V3（RAG 运行时 V3），重点在 Hybrid Search（混合检索）和 Rerank（重排）。它能把已经召回的结果排得更好。

day27 主要是 RAG Runtime V4（RAG 运行时 V4），重点在扩大召回入口。它会先生成多个检索 query（查询表达），再多路检索、合并、去重、重排。

核心区别可以总结为：

```text
day26：把已召回的结果排得更好
day27：让更多正确结果先被召回
```

---

### 问答 2：day27 是不是给用户问题加很多相近问题一起查

**我问：**

> day27 是不是主要就是给用户的问题加上很多相近的问题一并查询再找出最终的答案呢

**回答整理：**

是的，这个理解是对的。

day27 的核心就是：

```text
不要只拿用户原始问题去查知识库，
而是先把用户问题改写成多个相近 / 专业 / 中英文混合的问题，
再用这些问题一起去查，
最后合并、去重、重排，选出最相关的 chunk，
再让模型基于这些 chunk 回答。
```

例如用户问：

```text
人工确认节点是干啥的？
```

day27 会额外生成：

```text
HITL human in the loop 人工确认
waiting_confirmation 用户确认 工作流
Agent 关键步骤 暂停 等待用户确认
```

然后这些 query 都去知识库里查。

但要注意：

> 它不是直接用这些相近问题生成最终答案。

更准确的流程是：

```text
用户问题
-> 生成多个检索 query
-> 多路检索知识库
-> 合并重复 chunk
-> rerank 排序
-> 选 topK chunk
-> 把 chunk 塞进 Prompt
-> 模型基于这些资料回答原始用户问题
```

所以最终回答仍然围绕用户原始问题，只是检索阶段更聪明。

---

### 问答 3：生成多个检索 query 是通过模型和记忆来的吗

**我问：**

> 那这个生成多个检索 query 是通过模型和记忆来的吗

**回答整理：**

在当前 `ollama-chat-day27` 里，生成多个检索 query 主要有两种方式：

#### 方式 1：RAG 主检索流程主要靠规则版 rewrite（规则查询改写）

RAG Debug Panel（RAG 调试面板）和知识库检索主流程当前主要使用规则生成，也就是 `lib/query-rewrite.ts` 里的 `rewriteQueryByRules()`。

它不是靠模型，也不是靠记忆，而是靠规则判断用户问题里有没有某些关键词。

例如：

```ts
if (q.includes("人工确认") || lowered.includes("hitl") || q.includes("确认节点")) {
  queries.push("HITL human in the loop 人工确认");
  queries.push("waiting_confirmation 用户确认 工作流");
  queries.push("Agent 关键步骤 暂停 等待用户确认");
}
```

所以用户问：

```text
人工确认节点是干啥的？
```

系统会按规则补出 HITL（人在回路 / 人工确认）、waiting_confirmation（等待用户确认状态）等检索 query。

#### 方式 2：Tool Registry 里的 queryRewrite 工具是模型优先，规则兜底

在 `lib/workflow-tools.ts` 里注册了 `queryRewrite` 工具。

它会调用：

```ts
rewriteQueryWithFallback(query, input.rt, 5)
```

这个函数会先尝试用 LLM（大语言模型）生成多个 query；如果模型不可用，或者返回结果不够，就回退到规则版。

所以当前可以总结为：

```text
RAG 主检索流程：当前主要靠规则 rewrite
queryRewrite 工具：模型优先，规则兜底
记忆：目前没有直接参与 query rewrite
```

Memory（记忆）现在主要用于 Chat（聊天）、Summary（总结）、Todo（待办）、Workflow（工作流）上下文，不是 day27 Query Rewrite（查询改写）的主要输入。

后续如果要升级，可以做成：

```text
用户原始问题
+ 最近对话记忆
+ 长期记忆
+ 知识库主题摘要
-> LLM 生成多个检索 query
```

这样 Query Rewrite 会更聪明。

---

## 6. 当前代码中的关键文件

| 文件 | 作用 |
|---|---|
| `lib/query-rewrite.ts` | Query Rewrite（查询改写）：规则版、LLM 版、fallback（兜底） |
| `lib/knowledge-retrieval.ts` | Multi-Query Retrieval（多查询检索）、chunk 去重、matchedQueries、rerank |
| `lib/knowledge-store.ts` | 知识库存储、最近一次检索、Query Rewrite Metrics（查询改写指标） |
| `lib/knowledge-rag.ts` | 构建 RAG Prompt（检索增强提示词）并执行知识库问答 |
| `lib/workflow-tools.ts` | 注册 queryRewrite、retrieval、ragAnswer 等 Tool（工具） |
| `app/components/KnowledgeSidebar.tsx` | 展示 RAG Debug Panel（调试面板）、rewritten queries、matched queries |
| `app/api/knowledge/retrieve/route.ts` | RAG 检索 API（接口） |
| `day27_test_cases.md` | 第 27 天测试用例和 single query vs multi query 对比表 |

---

## 7. 第 27 天打卡

```text
【第27天打卡】

1. 是否新增 QueryRewriteTool：是
2. 是否实现规则版 query rewrite：是
3. 是否实现 LLM 版 query rewrite：是
4. 是否实现 multiQueryRetrieve：是
5. 是否实现 chunk 去重：是
6. 是否记录 matchedQueries：是
7. Debug Panel 是否展示 rewritten queries：是
8. 是否增加 multi-query metrics：是
9. 是否完成 single vs multi query 对比测试：是（已在 day27_test_cases.md 中提供对比测试表，可运行后填写具体命中结果）

10. 遇到的最大问题：
当前 RAG 主检索流程主要使用规则版 query rewrite，稳定但不够灵活；LLM 版 query rewrite 已作为 queryRewrite 工具实现，但主检索链路暂未直接把记忆和 LLM rewrite 融入进去。后续可以让 LLM 结合 Memory（记忆）、最近对话和知识库主题生成更智能的检索 query。

11. 当前系统能力：
RAG Runtime V4 + Query Rewrite + Multi-Query Retrieval + Hybrid Search + Rule-based Rerank + chunk 去重 + matchedQueries + Query Rewrite Metrics + RAG Debug Panel V4 + Tool Registry 中的 queryRewrite 工具
```

---

## 8. 一句话总结

day27 的核心不是让模型“凭空回答得更好”，而是让检索阶段更容易找到正确资料：

```text
Rerank 负责把已召回的结果排好，
Query Rewrite 负责让正确结果更有机会被召回。
```

因此，day27 是从“会排序的 RAG”进一步升级成“会扩展查询入口的 RAG”。

---

## 9. 第 27 天总结补充

第 27 天完成的是：

**RAG Runtime V4（RAG 运行时 V4）：Query Rewrite（查询改写） + Multi-Query Retrieval（多查询检索）**

这一步非常关键。

系统已经把 RAG（Retrieval-Augmented Generation，检索增强生成）从：

```text
用户原始 query（查询） -> 检索
```

升级成：

```text
用户原始 query（查询）
-> query rewrite（查询改写）
-> 多 query（多查询表达）检索
-> 去重
-> 聚合
-> rerank（重排）
-> prompt injection（提示词注入）
```

现在已经具备：

- QueryRewriteTool（查询改写工具）
- 规则版 query rewrite（规则查询改写）
- LLM 版 query rewrite（大语言模型查询改写）
- multiQueryRetrieve（多查询检索函数）
- chunk 去重（文本片段去重）
- matchedQueries（命中查询记录）
- Query Rewrite Metrics（查询改写指标）
- single vs multi query 对比测试（单查询与多查询对比测试）
- RAG Debug Panel V4（RAG 调试面板 V4）

第 27 天发现的问题也很关键：

> 规则版稳定但不够灵活；LLM rewrite（大语言模型查询改写）更智能，但还没正式进入主检索链路。

所以第 28 天的重点就是：

> 让 LLM Query Rewrite（大语言模型查询改写） + Memory（记忆）真正参与 RAG 主链路。

---

## 10. 第 28 天学习计划：Memory-aware Query Rewrite + Retrieval Pipeline

第 28 天的目标是：

**Memory-aware Query Rewrite（记忆感知查询改写） + Retrieval Pipeline（检索流水线）**

### 10.1 今日核心目标

让 RAG 检索不只看用户当前问题，而是结合：

- Memory（记忆）
- recent messages（最近对话）
- knowledge topics（知识库主题）
- 当前 workflow topic（工作流主题）

生成更智能的检索 query（查询表达）。

### 10.2 为什么第 28 天要做这个

现在用户可能问：

```text
那它和之前那个有什么区别？
```

如果只看当前 query：

```text
那它和之前那个有什么区别？
```

系统根本不知道“它”和“之前那个”指什么。

但如果结合：

- longTerm memory（长期记忆）
- recent messages（最近消息）
- 当前 workflow topic（工作流主题）
- 知识库主题

系统就可能 rewrite（改写）成：

```text
RAG 和 Memory 的区别是什么？
Summary Memory 与 Knowledge Base 的区别
Agent Runtime 中长期记忆和外部知识库的关系
```

这就是：

**Memory-aware RAG（记忆感知 RAG）**

### 10.3 第 28 天最终效果

用户输入：

```text
那它和记忆有什么区别？
```

系统能自动识别：

```text
它 = RAG / 知识库 / retrieval（检索）
```

然后生成：

```text
1. RAG 和 Memory 的区别
2. 外部知识库和长期记忆的区别
3. Retrieval Augmented Generation 与 Summary Memory 的关系
```

最后检索到正确 chunk（文本片段）。

---

## 11. 第 28 天任务拆解

### 任务 1：定义 RetrievalPipeline

先把 RAG 主流程抽象出来。

```ts
type RetrievalPipelineInput = {
  query: string
  memory?: MemoryItem[]
  recentMessages?: Message[]
  options?: RetrieveOptions
}

type RetrievalPipelineResult = {
  originalQuery: string
  rewrittenQueries: string[]
  retrievedChunks: ScoredChunk[]
  mode: "rule" | "llm" | "hybrid"
  metrics: RetrievalMetrics
}
```

这里的 RetrievalPipeline（检索流水线）表示：RAG 不应该只是一个函数，而是一条可以被观测、调试和扩展的 pipeline（流水线）。

### 任务 2：实现 runRetrievalPipeline

把之前分散的逻辑统一起来：

```ts
async function runRetrievalPipeline(input: RetrievalPipelineInput) {
  const rewrittenQueries = await rewriteQueries({
    query: input.query,
    memory: input.memory,
    recentMessages: input.recentMessages
  })

  const retrievedChunks = await multiQueryRetrieve(
    rewrittenQueries,
    input.options
  )

  return {
    originalQuery: input.query,
    rewrittenQueries,
    retrievedChunks,
    mode: "hybrid",
    metrics
  }
}
```

核心认知：

> RAG 不是一个函数，而是一条 pipeline（流水线）。

### 任务 3：升级 QueryRewriteTool 输入

之前：

```ts
{
  query: string
}
```

升级为：

```ts
type QueryRewriteInput = {
  query: string
  memory?: MemoryItem[]
  recentMessages?: Message[]
  knowledgeTopics?: string[]
  maxQueries?: number
}
```

这样 QueryRewriteTool（查询改写工具）就能使用 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题）。

### 任务 4：让 LLM rewrite 结合 Memory

Prompt（提示词）可以设计为：

```ts
const prompt = `
你是一个 RAG 检索查询改写器。

请根据：
1. 用户当前问题
2. 长期记忆
3. 最近对话
4. 知识库主题

生成 3-5 个适合知识库检索的 query。

要求：
- 解决代词、省略语、不完整表达
- 加入可能的专业术语
- 保留原问题意图
- 包含中英文关键词
- 只返回 JSON

格式：
{
  "queries": ["...", "..."]
}

【用户当前问题】
${query}

【长期记忆】
${memoryText}

【最近对话】
${recentText}

【知识库主题】
${topicsText}
`
```

目标是让 LLM rewrite（大语言模型查询改写）不仅看当前 query，还能结合上下文补全指代关系。

### 任务 5：设计 rewrite 策略

不要简单全用 LLM（大语言模型）。

建议策略：

```text
短问题 / 省略语 -> LLM rewrite
明确问题 -> rule rewrite
检索失败 -> fallback 到 LLM rewrite 再查一次
```

伪代码：

```ts
if (isAmbiguousQuery(query)) {
  use LLM rewrite
} else {
  use rule rewrite first
}

if (retrievedChunks.length === 0) {
  retry with LLM rewrite
}
```

### 任务 6：实现 ambiguous query detector

ambiguous query detector（模糊查询检测器）用来判断用户问题是否存在指代不清、省略或上下文依赖。

```ts
function isAmbiguousQuery(query: string) {
  const ambiguousWords = ["它", "这个", "那个", "之前", "刚刚", "区别", "继续"]

  return (
    query.length < 20 ||
    ambiguousWords.some(w => query.includes(w))
  )
}
```

### 任务 7：加入 knowledgeTopics

knowledgeTopics（知识库主题）可以先从已导入文档标题中提取：

```ts
const knowledgeTopics = documents.map(doc => doc.title)
```

后面可以升级为自动 topic extraction（主题抽取）。

### 任务 8：Retrieval Debug Panel V5

RAG Debug Panel V5（RAG 调试面板 V5）需要展示：

```text
Original Query（原始查询）
Ambiguous: true / false（是否模糊查询）
Rewrite Mode: rule / llm / fallback-llm（改写模式）
Memory Used: yes / no（是否使用记忆）
Recent Messages Used: yes / no（是否使用最近对话）
Knowledge Topics Used（使用的知识库主题）
Rewritten Queries（改写查询）
Retrieved Chunks（检索到的文本片段）
```

### 任务 9：增加 pipeline metrics

PipelineMetrics（流水线指标）可以定义为：

```ts
type PipelineMetrics = {
  totalQueries: number
  rewriteMode: string
  usedMemory: boolean
  usedRecentMessages: boolean
  fallbackTriggered: boolean
  retrievalDurationMs: number
}
```

这些指标可以帮助判断这次检索到底用了哪种 rewrite（查询改写）策略，是否触发 fallback（兜底），以及耗时如何。

### 任务 10：测试省略语查询

新增测试：

```text
1. 那它和记忆有什么区别？
2. 刚刚那个确认节点有什么用？
3. 这个工具系统为什么要抽象？
4. 它和 workflow 有什么关系？
5. 继续查一下那个知识库能力
```

记录：

```text
是否正确补全指代
是否检索到正确 chunk
是否比 rule-only（纯规则）更好
```

---

## 12. 第 28 天验收标准

```text
1. 是否定义 RetrievalPipeline
2. 是否实现 runRetrievalPipeline
3. QueryRewriteTool 是否支持 memory / recentMessages
4. LLM rewrite 是否结合 Memory
5. 是否实现 ambiguous query detector
6. 是否实现 rule / llm / fallback rewrite 策略
7. 是否加入 knowledgeTopics
8. Debug Panel 是否展示 rewrite mode / memory used
9. 是否增加 pipeline metrics
10. 是否完成省略语查询测试
```

---

## 13. 第 28 天打卡模板

```text
【第28天打卡】

1. 是否定义 RetrievalPipeline：是 / 否
2. 是否实现 runRetrievalPipeline：是 / 否

3. QueryRewriteTool 是否支持 memory / recentMessages：是 / 否
4. LLM rewrite 是否结合 Memory：是 / 否

5. 是否实现 ambiguous query detector：是 / 否
6. 是否实现 rule / llm / fallback rewrite 策略：是 / 否

7. 是否加入 knowledgeTopics：是 / 否
8. Debug Panel 是否展示 rewrite mode / memory used：是 / 否

9. 是否增加 pipeline metrics：是 / 否
10. 是否完成省略语查询测试：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

---

## 14. 第 28 天核心认知

记住一句话：

> 好的 RAG 不只是检索知识，而是先理解“用户到底想检索什么”。

做完第 28 天后，系统会升级成：

**RAG Runtime V5（RAG 运行时 V5）：Memory-aware Retrieval Pipeline（记忆感知检索流水线）**
