# Day 29 学习总结：Knowledge Store + Incremental Indexing（知识库存储 + 增量索引）

本文档记录 `ollama-chat-day29` 项目的学习理解、关键问答、与 `ollama-chat-day28` 的对比、为什么这样设计，以及第 29 天打卡结果。

---

## 1. 项目做了什么

`ollama-chat-day29` 是在 `ollama-chat-day28` 基础上继续升级的本地 AI Agent（智能体）/ RAG（Retrieval-Augmented Generation，检索增强生成）聊天系统。

一句话总结：

```text
day28 重点解决“用户到底想查什么”；
day29 重点解决“知识库变大以后，文档索引怎么少重算”。
```

day28 已经实现了 Memory-aware Retrieval Pipeline（记忆感知检索流水线），可以结合 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题）来改写用户问题。

day29 在这个基础上升级为：

```text
RAG Runtime V6（RAG 运行时 V6）
+ Knowledge Store（知识库存储）
+ Incremental Indexing（增量索引）
+ Embedding Cache（向量缓存）
+ Knowledge Explorer（知识库浏览器）
+ Reindex Tool（重建索引工具）
```

也就是说，day29 的重点不是继续改变“用户提问后怎么检索”，而是优化“导入 / 更新文档时怎么构建知识库索引”。

---

## 2. 用到的核心知识

### 2.1 RAG（Retrieval-Augmented Generation，检索增强生成）

RAG 的基本流程仍然是：

```text
导入知识
-> 切分 chunk（文本片段）
-> 生成 embedding（向量表示）
-> 用户提问
-> 检索相关 chunk
-> 注入 Prompt（提示词）
-> LLM（Large Language Model，大语言模型）回答
```

day29 仍然继承 day28 的检索能力：

- Query Rewrite（查询改写）
- Multi-Query Retrieval（多查询检索）
- Memory-aware Retrieval Pipeline（记忆感知检索流水线）
- vector search（向量检索）
- keyword search（关键词检索）
- hybrid search（混合检索）
- rerank（重排）
- RAG Debug Panel（RAG 调试面板）

### 2.2 Knowledge Store（知识库存储）

Knowledge Store（知识库存储）负责保存文档、文本片段、向量、指标和最近一次检索 / 索引调试数据。

day29 中的核心结构是：

```ts
type KnowledgeDocument = {
  id: string
  title: string
  content: string
  contentHash: string
  version: number
  chunks: KnowledgeChunk[]
  createdAt: number
  updatedAt: number
}
```

它比 day28 多了：

- `contentHash`：Content Hash（内容哈希），用于判断整篇文档有没有变化。
- `version`：Document Version（文档版本号），同标题文档内容变化后递增。
- `updatedAt`：更新时间，用于观察文档最近一次变化。

### 2.3 Content Hash（内容哈希）

Content Hash（内容哈希）是对整篇文档正文计算 SHA256（安全哈希算法 256 位）摘要。

如果两次导入的同标题文档 `contentHash` 完全一样，说明正文没有变化，可以直接跳过索引重建。

```text
同标题文档
-> contentHash 一样
-> 文档没变
-> 不重新切块，不重新 embedding
```

### 2.4 Chunk Hash（片段哈希）

Chunk Hash（片段哈希）是对每个 chunk（文本片段）计算 SHA256 摘要。

它的作用是判断某个文本片段有没有变化。

```text
chunkHash 一样
-> 片段文本没变
-> 可以复用旧 embedding

chunkHash 变化
-> 片段文本变了
-> 需要重新生成 embedding
```

### 2.5 Incremental Indexing（增量索引）

Incremental Indexing（增量索引）的核心思想是：

```text
不要因为文档有一点变化，就把全部 chunk 都重新算 embedding。
```

day29 的增量索引流程是：

```text
导入文档
-> 计算 contentHash
-> 找同标题旧文档
-> 如果整篇文档没变，直接复用
-> 如果变了，重新切 chunk
-> 计算每个 chunkHash
-> 对比旧 chunkHash
-> 没变的 chunk 复用旧 embedding
-> 新增或变化的 chunk 才重新生成 embedding
-> 文档 version 递增
-> 记录 added / updated / reused / cached / generated 指标
```

### 2.6 Embedding Cache（向量缓存）

Embedding Cache（向量缓存）用 `chunkHash` 作为 key（键），用 embedding（向量）作为 value（值）。

结构可以理解成：

```text
Map<chunkHash, embedding>
```

它的作用是：

```text
如果某个 chunkHash 已经出现过
-> 说明相同文本片段已经生成过 embedding
-> 直接复用缓存中的向量
```

这样即使不同文档里出现相同片段，也可以复用 embedding。

### 2.7 Knowledge Metrics V2（知识库指标 V2）

day29 新增了索引层面的指标：

| 指标 | 含义 |
|---|---|
| `documentsCount` | 文档数量 |
| `chunksCount` | 文本片段数量 |
| `cachedEmbeddings` | 从缓存复用的向量数量 |
| `generatedEmbeddings` | 新生成的向量数量 |
| `cacheHitRate` | 缓存命中率 |
| `avgChunksPerDoc` | 平均每篇文档片段数 |
| `lastIndexStats` | 最近一次导入或重建索引的统计 |

### 2.8 Knowledge Explorer（知识库浏览器）

Knowledge Explorer（知识库浏览器）在右侧侧栏展示知识库内部结构。

它展示：

```text
Document（文档）
├─ version（版本号）
├─ contentHash（内容哈希）
├─ chunkCount（片段数量）
├─ updatedAt（更新时间）
└─ chunks（片段列表）
   ├─ index（片段序号）
   ├─ chunkHash（片段哈希）
   ├─ embedding status（向量状态）
   └─ preview（片段预览）
```

### 2.9 Reindex Tool（重建索引工具）

Reindex Tool（重建索引工具）对应工具名：

```text
reindexKnowledge
```

它的作用是强制重建知识库索引。

适合这些情况：

- chunking strategy（切块策略）变了。
- embedding model（向量模型）变了。
- 想强制刷新全部 chunk 的 embedding。

---

## 3. day28 和 day29 的对比

| 对比项 | day28 | day29 |
|---|---|---|
| RAG 版本 | RAG Runtime V5（RAG 运行时 V5） | RAG Runtime V6（RAG 运行时 V6） |
| 核心目标 | 让 RAG 更理解用户要查什么 | 让知识库更新时少重算索引 |
| 重点位置 | 用户提问后的 retrieval pipeline（检索流水线） | 文档导入 / 更新时的 indexing pipeline（索引流水线） |
| 文档结构 | 普通文档 + chunks | 文档版本 + contentHash + chunks |
| chunk 结构 | text + embedding + metadata | 新增 chunkHash |
| 导入逻辑 | 本次导入文档的每个 chunk 都生成 embedding | 只有新增或变化的 chunk 才生成 embedding |
| 缓存能力 | 没有明确 embeddingCache | 新增 embeddingCache |
| 指标 | retrieval metrics + query rewrite metrics | 新增 Knowledge Metrics V2 |
| 前端观察 | RAG Debug Panel V5 | 新增 Knowledge Explorer |
| 工具 | queryRewrite / retrieval / ragAnswer | 新增 reindexKnowledge |

---

## 4. 为什么这样做

真实 RAG 系统里的知识库会越来越大。

如果只有几篇文档，全部重新计算 embedding 成本不高。

但如果未来有：

```text
100 篇文档
1000 篇文档
10000 个 chunk
```

每次文档稍微改一点就重新处理全部 chunk，会带来明显问题：

- 导入变慢。
- embedding model（向量模型）调用成本变高。
- 本地 Ollama 压力变大。
- 很难观察哪些 chunk 是新增的、哪些是复用的。
- 大型知识库维护成本变高。

所以 day29 引入 hash（哈希）和 cache（缓存）。

它的核心思想是：

```text
内容没变，就不要重新处理。
chunk 没变，就不要重新 embedding。
只有变化的部分，才需要重新索引。
```

这就是 Incremental Indexing（增量索引）。

---

## 5. 对话记录与理解

### 问答 1：这个项目做了什么，用了什么知识，对比 day28 有什么改进，为什么这样做

**我问：**

> 带我来读懂ollama-chat-day29这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day28有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day29` 可以理解成：

```text
day28 解决“怎么检索得更聪明”；
day29 解决“知识库变大以后，怎么维护索引更高效”。
```

也就是从 RAG Runtime V5（RAG 运行时 V5）：Memory-aware Retrieval Pipeline（记忆感知检索流水线），升级到 RAG Runtime V6（RAG 运行时 V6）：Knowledge Store（知识库存储）+ Incremental Indexing（增量索引）。

day29 仍然保留 day28 的能力：

- chat（聊天）
- Workflow（工作流）
- Tool Registry（工具注册表）
- RAG 知识库
- Query Rewrite（查询改写）
- Multi-Query Retrieval（多查询检索）
- Memory-aware Retrieval Pipeline（记忆感知检索流水线）
- RAG Debug Panel（RAG 调试面板）

但是 day29 的重点变成了知识库索引管理。

以前导入知识大概是：

```text
导入文档
-> 切 chunk
-> 每个 chunk 都重新生成 embedding
-> 保存
```

day29 变成：

```text
导入文档
-> 计算 contentHash
-> 判断文档是否变化
-> 切 chunk
-> 计算 chunkHash
-> 判断每个 chunk 是否变化
-> 没变的 chunk 复用 embedding
-> 变化的 chunk 才重新 embedding
-> 保存索引指标
```

所以一句话总结：

```text
ollama-chat-day28 让 RAG 更会“理解要查什么”。
ollama-chat-day29 让 RAG 更会“维护知识库索引”。
```

day29 的核心认知是：

```text
小型 RAG 的核心是检索；
大型 RAG 的核心是索引管理。
```

---

### 问答 2：day29 对提问后的性能是不是没有帮助

**我问：**

> 我能不能这样子理解：
> day28就是rag的文档每导入新的，所有文档都根据embeddings模型重新给文档切成的chunk都算一遍向量值，然后用户问问题的时候把用户的问题算一遍向量值，给rag里面所有的chunk也算一遍向量值，关键字匹配值，向量和匹配按比例的值，然后根据用户的模式去选择分数高的chunk，带入到模型来回到用户问题；
> day29就是rag文档导入的时候，只对修改的和新增的文档做处理，给有变化的chunk弄上版本号，计算其在embeddings模型里的向量值，但是用户输入问题时，对于关键词匹配来说，还是要遍历所有的chunk来比对，这样子不还是要全部过一遍，对性能没什么帮助吧

**回答整理：**

这个理解方向很接近，但有两个关键点需要修正。

第一，day28 不是每次导入新文档时，把所有旧文档的 chunk 都重新算 embedding（向量表示）。

更准确是：

```text
day28 导入一篇新文档
-> 只把这篇新文档切 chunk
-> 只给这篇新文档的 chunk 算 embedding
-> 存进知识库
```

旧文档已经存好的 embedding 不会因为新导入一篇文档就全部重算。

第二，用户提问时，也不是给 RAG 里所有 chunk 重新算一遍向量值。

用户提问时大概是：

```text
用户问题
-> 给用户问题算一次 query embedding（查询向量）
-> 拿 query embedding 和所有 chunk 已保存的 embedding 做相似度计算
-> 同时对所有 chunk 做 keyword matching（关键词匹配）
-> 得到 vectorScore（向量分数）/ keywordScore（关键词分数）/ hybridScore（混合分数）
-> rerank（重排）
-> 取高分 chunk 放进 prompt（提示词）
-> 让模型回答
```

也就是说，chunk 的 embedding 是导入时算好的；提问时只是拿来比较，不重新生成。

不过这个疑问是对的：

```text
day29 主要优化的是“导入 / 更新 / 重建索引”的成本，
不是彻底优化“检索时遍历所有 chunk”的成本。
```

day29 做的是：

```text
文档没变
-> 不重新切块，不重新 embedding

文档变了
-> 只处理变化 chunk
-> 没变 chunk 复用旧 embedding 或 embeddingCache
```

但检索时，目前代码里关键词匹配和向量相似度计算，还是会遍历当前知识库里的 chunk。

只是遍历时不会重新调用 embedding model（向量模型）生成 chunk 向量。

所以结论可以改成：

```text
day29 对“导入性能 / 更新性能 / embedding 成本”有帮助；
但对“大规模检索时仍要扫描所有 chunk”这个问题，只是还没进一步优化。
```

如果后面要继续优化检索性能，就需要：

- inverted index（倒排索引）
- vector database（向量数据库）
- ANN（Approximate Nearest Neighbor，近似最近邻）
- BM25（经典关键词相关性排序算法）

更成熟的流程会是：

```text
现在：
用户问题 -> 遍历所有 chunk 打分

更成熟：
用户问题 -> 向量索引先召回 topN
        -> 倒排索引召回 topN
        -> 合并候选
        -> 只对候选 chunk rerank
```

一句话总结：

```text
day28 优化“怎么问得更准”；
day29 优化“文档变化时怎么少重算”；
但“检索时怎么不扫全库”还需要后续用倒排索引 / 向量索引继续升级。
```

---

### 问答 3：day28 和 day29 的主要区别是不是在 RAG 文档构建阶段

**我问：**

> 那就是day28和day29在用户提问后的操作是一样的，区别在于在rag文档构建的地方
> 其中day28对于导入的文档，全部都计算每个chunk的向量值，对于day29，会拿导入的新文档的chunk和原本rag里面的chunk比较，一样的不做处理，有变化和新增的会重新计算其向量值，还会做版本记录；是这样子吗

**回答整理：**

这个理解基本正确。

更准确地说：

```text
day28 和 day29 在“用户提问后的检索流程”基本一样：
用户问题
-> query rewrite（查询改写）
-> 用户问题算 query embedding（查询向量）
-> 和知识库 chunk 的已有 embedding 做相似度比较
-> 做 keyword matching（关键词匹配）
-> 算 hybrid score（混合分数）
-> rerank（重排）
-> 取高分 chunk 注入模型回答
```

主要区别确实在 RAG 文档构建 / 导入 / 更新索引这里。

day28：

```text
导入一篇文档
-> 把这篇文档切成 chunks
-> 给这篇文档的每个 chunk 都计算 embedding
-> 保存到知识库
```

注意：不是把整个 RAG 里所有旧文档都重新算一遍，而是对本次导入的这篇文档全部 chunk 都算 embedding。

day29：

```text
导入一篇同标题文档
-> 计算整篇文档 contentHash
-> 如果 contentHash 完全没变：不重新处理
-> 如果变了：重新切 chunks
-> 给每个 chunk 算 chunkHash
-> 和旧文档对应 chunk / embeddingCache 比较
-> 一样的 chunk 复用旧 embedding
-> 新增或变化的 chunk 才重新计算 embedding
-> 文档 version 递增
-> 记录 added / updated / reused / generated / cached 等指标
```

所以可以总结成：

```text
day28：本次导入的文档，每个 chunk 都重新生成向量。
day29：本次导入的文档，只有新增或变化的 chunk 才重新生成向量，没变的 chunk 复用旧向量，并记录版本和索引指标。
```

这里还有一个细节：

```text
目前代码主要是按同标题文档查找旧文档，
然后把新切出来的 chunk 和这篇旧文档的旧 chunk 比较，
不是和整个 RAG 里所有文档的 chunk 全量比较。
```

不过它还有 embeddingCache（向量缓存），所以如果别的地方已经有相同 `chunkHash` 的 embedding，也可以复用。

一句话版：

```text
day28 和 day29 的主要区别就在知识库构建阶段；
day29 让“重复导入 / 小幅修改文档”时少算 embedding，并保留版本记录。
```

---

## 6. 第29天打卡

【第29天打卡】

1. 是否实现 KnowledgeStore（知识库存储）：是
2. 是否增加 Document Version（文档版本号）：是

3. 是否实现 Content Hash（内容哈希）：是
4. 是否实现 Chunk Hash（片段哈希）：是

5. 是否实现 Incremental Indexer（增量索引器）：是
6. 是否实现 Embedding Cache（向量缓存）：是

7. 是否增加 Knowledge Metrics V2（知识库指标 V2）：是
8. 是否实现 Knowledge Explorer（知识库浏览器）：是

9. 是否新增 Reindex Tool（重建索引工具）：是
10. 是否完成增量导入测试：是，已编写 `day29_test_cases.md`（第29天测试用例文档），并通过 `npm run build` 验证核心代码可构建

11. 遇到的最大问题：

day29 最容易混淆的是“导入阶段”和“检索阶段”的性能优化边界。

Incremental Indexing（增量索引）主要优化的是文档导入、更新、重建索引时的成本：没变化的 chunk 复用旧 embedding，只给新增或变化的 chunk 重新生成 embedding。

但是用户提问后的检索阶段，目前仍然会遍历知识库中的 chunk 来计算向量相似度、关键词匹配和混合分数。因此 day29 并没有彻底解决“大规模检索时不扫全库”的问题。后续如果继续升级，需要引入 inverted index（倒排索引）、vector database（向量数据库）或 ANN（近似最近邻）等能力。

12. 当前系统能力：

```text
RAG Runtime V6（RAG 运行时 V6）
+ Knowledge Store V2（知识库存储 V2）
+ Document Version（文档版本号）
+ Content Hash（内容哈希）
+ Chunk Hash（片段哈希）
+ Incremental Indexer（增量索引器）
+ Embedding Cache（向量缓存）
+ Knowledge Metrics V2（知识库指标 V2）
+ Knowledge Explorer（知识库浏览器）
+ Reindex Tool（重建索引工具）
+ Memory-aware Retrieval Pipeline（记忆感知检索流水线）
+ Query Rewrite（查询改写）
+ Multi-Query Retrieval（多查询检索）
+ Hybrid Search（混合检索）
+ Rerank（重排）
+ RAG Debug Panel（RAG 调试面板）
+ Tool Registry（工具注册表）
```

---

## 7. 一句话总结

```text
day28：让 RAG 先结合记忆和上下文想清楚“用户到底想找什么”。
day29：让 RAG 在文档变化时只增量更新索引，而不是让本次导入文档的所有 chunk 都重新生成 embedding。
```

更进一步：

```text
day29 优化的是“知识库构建阶段”；
不是彻底优化“用户提问后的全库扫描检索阶段”。
```

---

## 8. 第 29 天总结

你第 29 天完成的是：

**RAG Runtime V6（RAG 运行时 V6）：Knowledge Store（知识库存储）+ Incremental Indexing（增量索引）**

这一步是一个分水岭。

因为很多教程到这里就结束了：

```text
文档
↓
Embedding（向量表示）
↓
检索
```

而你已经进入：

**Knowledge Lifecycle（知识生命周期）**

即：

```text
导入
↓
版本管理
↓
增量索引
↓
缓存
↓
重建
↓
维护
```

你已经拥有：

| 能力 | 说明 |
|---|---|
| KnowledgeStore（知识库存储） | 统一管理文档、片段与索引状态 |
| Document Version（文档版本号） | 同标题文档内容变化后递增 |
| Content Hash（内容哈希） | 判断整篇文档是否变化 |
| Chunk Hash（片段哈希） | 判断单个文本片段是否变化 |
| Incremental Indexer（增量索引器） | 只处理新增或变化的 chunk |
| Embedding Cache（向量缓存） | 按 chunkHash 复用已有 embedding |
| Knowledge Explorer（知识库浏览器） | 可视化文档 / 片段 / 向量状态 |
| Reindex Tool（重建索引工具） | 强制全量重建索引 |
| Metrics V2（指标 V2） | 索引层面的统计与命中率 |

这已经开始接近：

- Notion AI（Notion 内置 AI 知识检索）
- Cursor Indexing（Cursor 代码索引机制）
- Perplexity Knowledge Layer（Perplexity 知识层架构）

的思路。

---

## 9. 第 30 天学习计划

### RAG Runtime V7（RAG 运行时 V7）：Vector Database Layer（向量数据库层）

#### 今天核心目标

把你的 RAG 从：

```text
Array（数组）+ 遍历
```

升级成：

```text
真正的 Vector Store（向量存储）
```

#### 为什么第 30 天必须学这个？

你现在大概率是：

```ts
chunks.map(...)
  .sort(...)
  .slice(...)
```

做相似度搜索。

问题：

| 规模 | 表现 |
|---|---|
| 100 chunk（文本片段） | 没问题 |
| 1000 chunk | 开始变慢 |
| 5000 chunk | 明显延迟 |
| 50000 chunk | 每次查询全部比较，不可接受 |

每次查询：**全部比较**

复杂度：**O(N)（线性复杂度，数据量越大越慢）**

真正生产环境：

```text
Embedding（向量表示）
↓
Vector Store（向量存储）
↓
ANN Search（Approximate Nearest Neighbor Search，近似最近邻搜索）
```

今天先不接 Pinecone（云端向量数据库）、Weaviate（开源向量数据库）、Milvus（开源向量数据库）。

今天先做：

**Local Vector Store（本地向量存储）**

#### 第 30 天最终效果

现在：

```text
KnowledgeStore（知识库存储）
```

升级：

```text
KnowledgeStore（知识库存储）
+
VectorStore（向量存储）
```

架构变成：

```text
Document（文档）
↓
Chunk（文本片段）
↓
Embedding（向量表示）
↓
VectorStore（向量存储）
↓
Retriever（检索器）
```

---

### 任务 1：定义 Vector Store（向量存储）接口

新增：

```ts
type VectorStore = {
  upsert(
    vectors: VectorRecord[]
  ): Promise<void>

  query(
    embedding: number[],
    topK: number
  ): Promise<VectorMatch[]>

  delete(
    ids: string[]
  ): Promise<void>

  stats(): Promise<VectorStats>
}
```

`VectorRecord`（向量记录）：

```ts
type VectorRecord = {
  id: string
  embedding: number[]
  metadata: {
    chunkId: string
    documentId: string
  }
}
```

**核心认知**

从今天开始：

- **KnowledgeStore（知识库存储）** 负责文档
- **VectorStore（向量存储）** 负责向量

---

### 任务 2：实现 LocalVectorStore（本地向量存储）

新增：

```ts
class LocalVectorStore
```

内部：

```ts
Map<string, VectorRecord>
```

支持：

- `upsert()`（插入或更新）
- `query()`（查询）
- `delete()`（删除）
- `stats()`（统计）

`query` 实现：

- cosine similarity（余弦相似度）
- 返回：

```ts
[
  {
    id,
    score,
    metadata
  }
]
```

---

### 任务 3：KnowledgeStore（知识库存储）解耦

之前：Chunk（文本片段）包含 embedding（向量表示）

升级：Chunk 不再负责 embedding

```ts
type KnowledgeChunk = {
  id: string
  documentId: string
  text: string
  chunkHash: string
}
```

Embedding 进入 VectorStore（向量存储）。

---

### 任务 4：Indexer（索引器）写入 VectorStore

之前：

```text
Chunk
↓
Embedding
↓
Chunk.embedding
```

升级：

```text
Chunk
↓
Embedding
↓
VectorStore.upsert()
```

---

### 任务 5：Retriever（检索器）改成 VectorStore 查询

之前：

```text
for chunk in chunks
```

升级：

```text
vectorStore.query(queryEmbedding, recallK)
↓
拿到 chunkId
↓
回查 KnowledgeStore
```

你会第一次拥有：

**Store Separation（存储分离）**

---

### 任务 6：实现 Metadata Filter（元数据过滤）

新增：

```ts
query(
  embedding,
  topK,
  {
    documentId
  }
)
```

以后可以：

- 只搜 Workflow（工作流）文档
- 而不是搜整个知识库

---

### 任务 7：Vector Metrics（向量指标）

新增：

| 指标 | 含义 |
|---|---|
| `vectorCount` | 向量总数 |
| `avgEmbeddingDimension` | 平均向量维度 |
| `queryCount` | 查询次数 |
| `avgQueryDuration` | 平均查询耗时 |

UI 示例：

```text
Vectors: 520
Queries: 125
Avg Query: 15ms
```

---

### 任务 8：Vector Explorer（向量浏览器）

类似 Knowledge Explorer（知识库浏览器），新增 **Vector Explorer（向量浏览器）**，展示：

- `chunkId`（片段 ID）
- `documentId`（文档 ID）
- `dimension`（向量维度）
- `createdAt`（创建时间）

---

### 任务 9：Import Benchmark（导入基准测试）

测试规模与记录项：

| 规模 | 记录项 |
|---|---|
| 100 chunk | 导入耗时、查询耗时 |
| 500 chunk | 导入耗时、查询耗时 |
| 1000 chunk | 导入耗时、查询耗时 |

输出：**Benchmark Report（基准测试报告）**

---

### 任务 10：准备未来 Vector DB（向量数据库）

新增：

```ts
type VectorStoreProvider =
  | "local"
  | "pinecone"
  | "weaviate"
  | "milvus"
```

今天先实现 `local`（本地），后面可直接切换 provider（提供商）。

---

### 第 30 天验收标准

1. 是否定义 VectorStore（向量存储）接口
2. 是否实现 LocalVectorStore（本地向量存储）
3. 是否实现 upsert / query / delete / stats
4. KnowledgeStore 是否与 VectorStore 解耦
5. Indexer 是否写入 VectorStore
6. Retriever 是否改成 VectorStore 查询
7. 是否支持 Metadata Filter（元数据过滤）
8. 是否增加 Vector Metrics（向量指标）
9. 是否实现 Vector Explorer（向量浏览器）
10. 是否完成 100 / 500 / 1000 chunk benchmark（基准测试）

---

### 第 30 天打卡模板

【第30天打卡】

1. 是否定义 VectorStore（向量存储）接口：是 / 否
2. 是否实现 LocalVectorStore（本地向量存储）：是 / 否

3. 是否支持 upsert / query / delete / stats：是 / 否
4. KnowledgeStore 是否与 VectorStore 解耦：是 / 否

5. Indexer 是否写入 VectorStore：是 / 否
6. Retriever 是否改成 VectorStore 查询：是 / 否

7. 是否支持 Metadata Filter（元数据过滤）：是 / 否
8. 是否增加 Vector Metrics（向量指标）：是 / 否

9. 是否实现 Vector Explorer（向量浏览器）：是 / 否
10. 是否完成 Benchmark（基准测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

---

### 第 30 天核心认知

记住一句话：

```text
小型 RAG 的核心是检索；
大型 RAG 的核心是存储与索引架构。
```

完成第 30 天后，你就正式进入：

**Knowledge Infrastructure（知识基础设施）阶段**

这也是从：

```text
会做 RAG
```

走向：

```text
会设计 RAG 系统
```

的关键一步。

---

### 路线进度说明

到第 30 天的时候，你已经大约完成了整个 Agent（智能体）工程路线的 **60% ~ 65%**。

接下来剩下的大头会是：

| 方向 | 说明 |
|---|---|
| 真正的 Vector DB（向量数据库） | Pinecone / Milvus 等云端或分布式方案 |
| Queue + Worker Runtime（队列 + Worker 运行时） | 异步任务与后台索引 |
| Multi-Agent（多智能体） | 多角色协作与任务分发 |
| Production Infra（生产基础设施） | Redis（内存缓存）、Tracing（链路追踪）、权限、成本控制 |

这几部分会比前面的难度再上一个台阶，但也是最有价值的部分。
