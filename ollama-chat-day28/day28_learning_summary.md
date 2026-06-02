# Day 28 学习总结：Memory-aware Retrieval Pipeline（记忆感知检索流水线）

本文档记录 `ollama-chat-day28` 项目的学习理解、关键问答、与 `ollama-chat-day27` 的对比、为什么这样设计、第 28 天打卡结果，以及第 29 天学习计划。

---

## 1. 项目做了什么

`ollama-chat-day28` 是在 `ollama-chat-day27` 基础上继续升级的本地 AI Agent（智能体）/ RAG（Retrieval-Augmented Generation，检索增强生成）聊天系统。

一句话总结：

```text
day28 把 day27 的 Query Rewrite（查询改写）+ Multi-Query Retrieval（多查询检索）
升级成 Memory-aware Retrieval Pipeline（记忆感知检索流水线）。
```

也就是说，day27 已经可以把用户问题改写成多个检索 query（查询表达）再去查 Knowledge Base（知识库）；day28 进一步让系统在改写 query 时参考：

- Memory（记忆 / 长期记忆）
- recentMessages（最近对话消息）
- knowledgeTopics（知识库主题，当前主要来自文档标题）
- ambiguous query detector（模糊查询检测器）

这样系统就能更好处理这类不完整、依赖上下文的问题：

```text
那它和记忆有什么区别？
刚刚那个确认节点有什么用？
继续查一下那个知识库能力
```

这些问题如果只看当前句子，很难知道“它”“刚刚那个”“那个能力”指什么。day28 的目标就是让 RAG（检索增强生成）在检索前先理解用户到底想查什么。

---

## 2. 用到的核心知识

### 2.1 Next.js App Router（Next.js 应用路由）

项目使用 Next.js（React 全栈框架）组织前端页面与后端 API（接口）。

关键文件：

| 文件 | 作用 |
|---|---|
| `app/page.tsx` | 主页面，对话区、状态管理、知识库调试入口 |
| `app/api/knowledge/route.ts` | Knowledge Base（知识库）导入、列表、指标 API |
| `app/api/knowledge/retrieve/route.ts` | RAG Debug（RAG 调试）检索 API |
| `app/components/KnowledgeSidebar.tsx` | 右侧工具、知识库、RAG Debug Panel（RAG 调试面板） |

### 2.2 RAG（Retrieval-Augmented Generation，检索增强生成）

RAG（检索增强生成）的核心流程是：

```text
导入知识
-> 切分 chunk（文本片段）
-> 生成 embedding（向量表示）
-> 用户提问
-> 检索相关 chunk（文本片段）
-> 注入 Prompt（提示词）
-> LLM（Large Language Model，大语言模型）回答
```

day28 仍然继承前面几天的 RAG 能力，包括：

- chunking（文本切块）
- embedding（向量化）
- vector search（向量检索）
- keyword search（关键词检索）
- hybrid search（混合检索）
- rerank（重排）
- TopK（最终取前 K 条结果）
- minScore（最低分过滤）

### 2.3 Query Rewrite（查询改写）

Query Rewrite（查询改写）是指：不要直接拿用户原始问题去检索，而是先把问题改写成更适合知识库检索的多个 query（查询表达）。

例如用户问：

```text
人工确认节点是干嘛的？
```

系统可以扩展成：

```text
HITL human in the loop 人工确认
waiting_confirmation 用户确认 工作流
Agent 关键步骤 暂停 等待用户确认
```

这样即使知识库里写的是专业术语，也更容易被召回。

### 2.4 Multi-Query Retrieval（多查询检索）

Multi-Query Retrieval（多查询检索）是指：用多个 query（查询表达）分别去知识库检索，再把结果合并、去重、重排。

它的目的不是用多个问题直接生成答案，而是扩大 recall（召回范围），让正确 chunk（文本片段）更有机会进入候选集。

### 2.5 Memory-aware Query Rewrite（记忆感知查询改写）

day28 的重点是 Memory-aware Query Rewrite（记忆感知查询改写）。

它不只看当前问题，还会结合：

- Memory（长期记忆）
- recentMessages（最近对话）
- knowledgeTopics（知识库主题）

例如用户问：

```text
那它和记忆有什么区别？
```

如果最近对话里正在聊 RAG（检索增强生成），系统理想情况下可以改写成：

```text
RAG 和 Memory 的区别是什么
Retrieval Augmented Generation 与长期记忆的关系
知识库检索和 Summary Memory 的区别
```

### 2.6 Retrieval Pipeline（检索流水线）

day28 新增了 `runRetrievalPipeline()`，把原本分散的 RAG 主流程整理成一条可观察、可调试、可扩展的 pipeline（流水线）。

核心流程：

```text
用户原始问题
-> ambiguous query detector（模糊查询检测器）
-> 准备 memory / recentMessages / knowledgeTopics
-> 选择 rewrite strategy（改写策略）
-> 生成多个 retrieval query（检索查询）
-> Multi-Query Retrieval（多查询检索）
-> chunk 去重、rerank（重排）、minScore 过滤
-> 如果没有命中，fallback LLM rewrite（兜底大模型改写）再查一次
-> 返回 hits（命中结果）+ debug（调试信息）+ metrics（指标）
```

关键文件：

```text
lib/knowledge/retrieval-pipeline.ts
```

---

## 3. day27 和 day28 的对比

| 对比项 | day27 | day28 |
|---|---|---|
| RAG 版本 | RAG Runtime V4（RAG 运行时 V4） | RAG Runtime V5（RAG 运行时 V5） |
| 核心能力 | Query Rewrite（查询改写）+ Multi-Query Retrieval（多查询检索） | Memory-aware Retrieval Pipeline（记忆感知检索流水线） |
| Query Rewrite 输入 | 当前 query（当前查询） | query + memory + recentMessages + knowledgeTopics |
| 模糊问题处理 | 较弱，主要靠当前问题文本 | 新增 ambiguous query detector（模糊查询检测器） |
| 检索组织方式 | 检索函数内部完成规则改写和多路检索 | 抽象成 Pipeline（流水线）统一调度 |
| 策略选择 | 规则改写为主 | rule / llm / fallback-llm 多策略 |
| fallback（兜底） | 工具层有 LLM fallback，主链路较弱 | 主检索无命中时可 fallback 到 LLM rewrite 再查 |
| Debug Panel（调试面板） | rewritten queries、matched queries、score | ambiguous、rewrite mode、memory used、recent used、topics、pipeline metrics |
| Metrics（指标） | query rewrite metrics（查询改写指标） | pipeline metrics（流水线指标）+ fallback metrics（兜底指标） |

day27 可以理解为：

```text
让 RAG 会用多个 query 找资料。
```

day28 可以理解为：

```text
让 RAG 先结合记忆和上下文想清楚“用户到底想找什么”，再用多个 query 找资料。
```

---

## 4. 为什么这样做

真实对话里的问题经常不是完整问题。

用户不会每次都说：

```text
请比较 RAG 检索增强生成系统和 Memory 长期记忆系统的区别。
```

用户更可能说：

```text
那它和记忆有什么区别？
```

人能听懂，是因为人记得前面聊了什么。但普通 RAG（检索增强生成）如果只拿这句话去检索，就会很迷糊。

所以 day28 的设计目标是：

```text
在检索知识库之前，先把用户真正想查的东西补全。
```

它主要解决三个问题：

1. 指代消解：比如“它”“那个”“刚刚那个”到底指什么。
2. 省略补全：用户没有说完整，但上下文里有答案。
3. 检索意图重写：把口语问题改成更适合知识库命中的专业 query（查询表达）。

所以 day28 的本质不是“多加几个查询词”，而是把 RAG（检索增强生成）从“会检索”推进到“会理解检索意图”。

---

## 5. 当前关键文件

| 文件 | 作用 |
|---|---|
| `lib/knowledge/query-rewrite.ts` | Query Rewrite（查询改写）、ambiguous query detector（模糊查询检测器）、LLM rewrite（大模型查询改写） |
| `lib/knowledge/retrieval-pipeline.ts` | Retrieval Pipeline（检索流水线）主流程 |
| `lib/knowledge/knowledge-retrieval.ts` | Multi-Query Retrieval（多查询检索）、Hybrid Search（混合检索）、Rerank（重排） |
| `lib/knowledge/knowledge-store.ts` | Knowledge Store（知识库存储）、指标统计、最近一次检索调试数据 |
| `lib/workflow/workflow-tools.ts` | Tool Registry（工具注册表）中的 queryRewrite / retrieval / ragAnswer 工具 |
| `app/components/KnowledgeSidebar.tsx` | RAG Debug Panel V5（RAG 调试面板 V5） |
| `day28_test_cases.md` | 第 28 天测试用例文档 |

---

## 6. 对话记录与理解

### 问答 1：项目做了什么，用了什么知识，对比 day27 有什么改进，为什么这样做

**我问：**

> 带我来读懂ollama-chat-day28这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day27有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day28` 是在 `ollama-chat-day27` 基础上继续升级的本地 AI Agent（智能体）/ RAG（Retrieval-Augmented Generation，检索增强生成）聊天系统。

day27 的核心是 Query Rewrite（查询改写）+ Multi-Query Retrieval（多查询检索）。它能把用户问题扩展成多个检索 query（查询表达），再去知识库里多路检索，最后合并、去重、重排。

day28 的核心是 Memory-aware Retrieval Pipeline（记忆感知检索流水线）。它会在检索前结合 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题），先判断用户真正想查什么，再生成更适合检索的 query（查询表达）。

关键升级是：day28 能更好处理上下文依赖问题，例如：

```text
那它和记忆有什么区别？
刚刚那个确认节点有什么用？
继续查一下那个知识库能力
```

这些问题如果只看当前句子，很难知道“它”“刚刚那个”“那个能力”指什么。day28 通过 ambiguous query detector（模糊查询检测器）和 Memory-aware Query Rewrite（记忆感知查询改写）来补全指代和省略。

day28 的主流程是：

```text
用户原始问题
-> 判断是否模糊 ambiguous
-> 准备 memory / recentMessages / knowledgeTopics
-> 选择 query rewrite 策略
-> 生成多个检索 query
-> multi-query retrieval
-> chunk 去重、重排、过滤
-> 如果无命中，尝试 fallback LLM rewrite 再查一次
-> 返回 hits + rewrite debug + pipeline metrics
```

为什么这样做？

因为真实用户不会总是问完整问题。人类能听懂省略表达，是因为记得上下文；RAG（检索增强生成）也需要在检索前利用上下文补全检索意图。day28 就是让系统先理解“用户到底想查什么”，再去查资料。

一句话总结：

```text
day27：让 RAG 会用多个 query 找资料。
day28：让 RAG 先结合记忆和上下文想清楚“用户到底想找什么”，再用多个 query 找资料。
```

---

### 问答 2：现在判断用户问题是否模糊是不是通过问题内是否含有关键字来判断的

**我问：**

> 现在判断用户问题是否模糊是不是通过问题内是否含有关键字来判断的

**回答整理：**

是的，现在 day28 里判断“用户问题是否模糊”，主要靠两条规则，在 `lib/knowledge/query-rewrite.ts` 中：

```ts
const AMBIGUOUS_WORDS = ["它", "这个", "那个", "之前", "刚刚", "区别", "继续", "上面", "前面"];
```

然后在 `isAmbiguousQuery()` 里判断：

```ts
return q.length < 20 || AMBIGUOUS_WORDS.some((word) => q.includes(word));
```

也就是说：

1. 问题长度小于 20 个字符，认为可能是 ambiguous query（模糊查询）。
2. 问题里包含 `它`、`这个`、`那个`、`之前`、`刚刚`、`继续` 等关键词，也认为是 ambiguous query（模糊查询）。

所以当前版本的 ambiguous query detector（模糊查询检测器）是 rule-based detector（规则检测器），不是 LLM-based detector（基于大语言模型的检测器）。

优点：

- 快
- 稳定
- 成本低
- 不依赖模型调用

缺点：

- 会有误判
- 例如“这个系统的架构是什么”其实可能很明确，但因为包含“这个”，仍然会被判成模糊问题

后续可以升级成：

```text
规则先粗筛；
如果命中模糊关键词，再让 LLM（大语言模型）判断是否真的需要上下文补全。
```

---

## 7. 第28天打卡

【第28天打卡】

1. 是否定义 RetrievalPipeline：是
2. 是否实现 runRetrievalPipeline：是

3. QueryRewriteTool 是否支持 memory / recentMessages：是
4. LLM rewrite 是否结合 Memory：是

5. 是否实现 ambiguous query detector：是
6. 是否实现 rule / llm / fallback rewrite 策略：是

7. 是否加入 knowledgeTopics：是
8. Debug Panel 是否展示 rewrite mode / memory used：是

9. 是否增加 pipeline metrics：是
10. 是否完成省略语查询测试：是

11. 遇到的最大问题：

当前 ambiguous query detector（模糊查询检测器）主要还是 rule-based（基于规则），通过短问题长度和关键词判断是否模糊。它稳定、简单、成本低，但可能误判一些本来明确的问题。后续可以升级成 rule-based detector（规则检测器）+ LLM judge（大模型判断）的混合策略。

12. 当前系统能力：

```text
RAG Runtime V5（RAG 运行时 V5）
+ Memory-aware Retrieval Pipeline（记忆感知检索流水线）
+ Query Rewrite（查询改写）
+ LLM Rewrite（大模型查询改写）
+ Multi-Query Retrieval（多查询检索）
+ Hybrid Search（混合检索）
+ Rerank（重排）
+ ambiguous query detector（模糊查询检测器）
+ knowledgeTopics（知识库主题）
+ fallback-llm（大模型兜底改写）
+ pipeline metrics（流水线指标）
+ RAG Debug Panel V5（RAG 调试面板 V5）
+ Tool Registry（工具注册表）中的 queryRewrite / retrieval / ragAnswer 工具
```

---

## 8. 第 28 天总结

### 8.1 你第 28 天完成的是什么

**RAG Runtime V5（RAG 运行时 V5）：Memory-aware Retrieval Pipeline（记忆感知检索流水线）**

这是一个非常大的跨越。

因为现在你的系统已经不是：

```text
用户问题
-> 检索
-> 回答
```

而是：

```text
用户问题
    ↓
Ambiguous Detection（模糊查询检测）
    ↓
Memory（长期记忆）
    ↓
Recent Messages（最近对话消息）
    ↓
Knowledge Topics（知识库主题）
    ↓
Query Rewrite（查询改写）
    ↓
Multi Query Retrieval（多查询检索）
    ↓
Hybrid Search（混合检索）
    ↓
Rerank（重排）
    ↓
Prompt Injection（提示词注入）
    ↓
Answer（生成回答）
```

这已经开始接近 **Perplexity**（AI 搜索引擎）、**Cursor**（AI 编程 IDE）、**Claude Projects**（Claude 项目级知识上下文）、**OpenAI Deep Research**（OpenAI 深度研究模式）等产品背后的 **Retrieval Pipeline**（检索流水线）思路了。

### 8.2 第 28 天核心认知

day28 的核心不是让系统“多查几遍”，而是让系统在检索前先结合 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题）理解检索意图。

```text
好的 RAG（检索增强生成）不只是检索知识，
而是先理解用户到底想检索什么。
```

---

## 9. 第 29 天学习计划：Knowledge Store + Incremental Indexing（知识库 + 增量索引）

### 9.1 今日核心目标

**RAG Runtime V6（RAG 运行时 V6）：Knowledge Store（知识库存储）+ Incremental Indexing（增量索引）**

你现在的问题已经不是：

```text
怎么检索
```

而是：

```text
知识库越来越大怎么办？
```

### 9.2 为什么第 29 天必须学这个？

现在你的知识库流程可能是：

```text
导入文档
    ↓
切 Chunk（文本片段）
    ↓
Embedding（向量化）
    ↓
存储
```

**问题：**

如果未来有：

- 100 份文档
- 1000 份文档
- 10000 个 Chunk（文本片段）

每次都重新执行：

```text
Chunk（切块）
-> Embedding（向量化）
-> Save（保存）
```

性能会崩。

**今天要解决的问题：Incremental Indexing（增量索引）**

以后：

```text
新文档
    ↓
只处理新增部分
```

而不是：

```text
重新处理整个知识库
```

### 9.3 第 29 天最终效果

**第一次导入：** `Agent学习笔记V1`

系统：

```text
新增 35 chunks（文本片段）
新增 35 embeddings（向量）
```

**再次导入：** `Agent学习笔记V2`

系统：

```text
已有 35 chunks
新增 4 chunks
更新 2 chunks
```

而不是：

```text
重新生成全部 embedding（向量）
```

---

### 任务 1：设计 Knowledge Store（知识库存储）

新增：

```ts
type KnowledgeStore = {
  documents: KnowledgeDocument[]
  chunks: KnowledgeChunk[]

  addDocument(...)
  updateDocument(...)
  deleteDocument(...)

  retrieve(...)
}
```

---

### 任务 2：给 Document 增加版本号

升级：

```ts
type KnowledgeDocument = {
  id: string

  title: string
  content: string

  version: number              // 版本号：同一文档多次导入时递增
  contentHash: string            // 内容哈希：用于判断正文是否变化

  createdAt: number
  updatedAt: number
}
```

**为什么？**

以后判断「内容是否变化」不靠文件名，而靠 **contentHash**（内容哈希）。

---

### 任务 3：实现 Content Hash（内容哈希）

推荐：**SHA256**（安全哈希算法 256 位）对 `content` 求摘要。

例如：

```ts
import crypto from "crypto"

function generateHash(content: string) {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
}
```

---

### 任务 4：Chunk Fingerprint（文本片段指纹）

升级：

```ts
type KnowledgeChunk = {
  id: string
  documentId: string

  chunkHash: string            // 片段哈希：用于判断该 chunk 文本是否变化
  text: string
  embedding: number[]
}
```

**作用：**

```text
chunk 没变
    ↓
不用重新 embedding（向量化）
```

---

### 任务 5：实现 Incremental Indexer（增量索引器）

新增：

```ts
class IncrementalIndexer
```

**核心逻辑：**

```text
导入文档
    ↓
生成 chunk（文本片段）
    ↓
计算 chunkHash（片段哈希）
    ↓
比较旧 chunkHash
    ↓
只处理变化 chunk
```

**示例：**

旧：`chunk1`、`chunk2`、`chunk3`

新：`chunk1`、`chunk2`、`chunk3`、`chunk4`

**结果：** 只对 `chunk4` 做 embedding（向量化）。

---

### 任务 6：Embedding Cache（向量缓存）

新增 **embeddingCache**（向量缓存）：

结构：

```ts
Map<
  chunkHash,    // 片段哈希作为 key
  embedding     // 向量作为 value
>
```

**流程：**

```text
chunkHash
    ↓
Cache（缓存）存在？
    ↓ 是
直接读取 embedding
    ↓ 否
生成 embedding
    ↓
写入 Cache
```

---

### 任务 7：Knowledge Metrics V2（知识库指标 V2）

新增指标：

| 指标 | 含义 |
|---|---|
| `documentsCount` | 文档数量 |
| `chunksCount` | 文本片段数量 |
| `cachedEmbeddings` | 从缓存复用的向量数 |
| `generatedEmbeddings` | 新生成的向量数 |
| `cacheHitRate` | 缓存命中率 |
| `avgChunksPerDoc` | 平均每文档片段数 |

**前端展示示例：**

```text
Documents: 15
Chunks: 482

Embedding Cache:
Hit: 89%
Miss: 11%
```

---

### 任务 8：Knowledge Explorer（知识库浏览器）

升级 **Tool Explorer**（工具浏览器）思路，新增 **Knowledge Explorer**（知识库浏览器）。

**展示：**

```text
Document（文档）
├─ chunks（文本片段列表）
├─ version（版本号）
├─ hash（内容哈希）
├─ createdAt（创建时间）
```

**点击文档后显示：**

- Chunk 列表（文本片段列表）
- Embedding 状态（是否已向量化）
- Chunk Hash（片段哈希）

---

### 任务 9：实现 Reindex Tool（重建索引工具）

新增 Tool（工具）：

```text
reindexKnowledge
```

**作用：** 强制重建索引。

**什么时候用？**

- Chunk 策略变了（例如切块大小、重叠方式改变）
- Embedding 模型变了（需要全部重新向量化）

---

### 任务 10：导入测试

**测试步骤：**

1. **第一次导入** `Workflow Runtime` 笔记  
   - 记录：新增 chunks、新增 embeddings

2. **第二次导入**（在笔记中增加 `Queue Runtime` 等内容）  
   - 记录：新增 chunks、复用 chunks、**Cache Hit Rate**（缓存命中率）

---

### 9.4 第 29 天验收标准

1. 是否实现 KnowledgeStore（知识库存储）
2. 是否增加 Document Version（文档版本号）
3. 是否实现 Content Hash（内容哈希）
4. 是否实现 Chunk Hash（片段哈希）
5. 是否实现 Incremental Indexer（增量索引器）
6. 是否实现 Embedding Cache（向量缓存）
7. 是否增加 Knowledge Metrics V2（知识库指标 V2）
8. 是否实现 Knowledge Explorer（知识库浏览器）
9. 是否新增 Reindex Tool（重建索引工具）
10. 是否完成增量导入测试

---

### 9.5 第 29 天打卡模板

```text
【第29天打卡】

1. 是否实现 KnowledgeStore：是 / 否
2. 是否增加 Document Version：是 / 否

3. 是否实现 Content Hash：是 / 否
4. 是否实现 Chunk Hash：是 / 否

5. 是否实现 Incremental Indexer：是 / 否
6. 是否实现 Embedding Cache：是 / 否

7. 是否增加 Knowledge Metrics V2：是 / 否
8. 是否实现 Knowledge Explorer：是 / 否

9. 是否新增 Reindex Tool：是 / 否
10. 是否完成增量导入测试：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

---

### 9.6 第 29 天核心认知

记住一句话：

> **小型 RAG 的核心是「检索」，大型 RAG 的核心是「索引管理」。**

做完第 29 天后，你的系统会升级成：

**RAG Runtime V6：Knowledge Store + Incremental Indexing（知识库存储 + 增量索引）**

这也是你从「会做 RAG」走向「会维护长期知识系统」的开始。

---

## 10. 一句话总结（全文）

```text
day27：让 RAG 会用多个 query 找资料。
day28：让 RAG 先结合记忆和上下文想清楚「用户到底想找什么」，再用多个 query 找资料。
day29（计划）：让 RAG 在知识库变大时只增量更新索引，而不是每次全量重建。
```

