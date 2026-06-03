# Day 30 学习总结：RAG Runtime V7（RAG 运行时 V7）+ Vector Database Layer（向量数据库层）

本文档记录 `ollama-chat-day30` 项目做了什么、运用了什么知识、相比 `ollama-chat-day29` 有什么改进、为什么这样设计，以及本次学习对话整理、第 30 天打卡结果、第 30 天阶段总结与路线进度，以及第 31 天（Queue Runtime V1，队列运行时 V1）学习计划。

---

## 1. 项目做了什么

`ollama-chat-day30` 是在 `ollama-chat-day29` 基础上继续升级的本地 AI Agent（智能体）+ RAG（Retrieval-Augmented Generation，检索增强生成）聊天系统。

一句话总结：

```text
day29 重点解决“文档变了以后，怎么少算 embedding（向量表示）”；
day30 重点解决“文档内容和向量索引，怎么分开存、分开查、分开观察”。
```

day30 的核心升级是：

```text
RAG Runtime V7（RAG 运行时 V7）
+ KnowledgeStore（知识库存储）
+ LocalVectorStore（本地向量存储）
+ Vector Metrics（向量指标）
+ Vector Explorer（向量浏览器）
+ Metadata Filter（元数据过滤）
```

day29 的结构大致是：

```text
Document（文档）
-> Chunk（文本片段）
-> embedding（向量）
```

day30 改成：

```text
KnowledgeStore（知识库存储）
-> Document（文档）
-> Chunk（文本片段）

VectorStore（向量存储）
-> VectorRecord（向量记录）
-> embedding（向量）
-> metadata（元数据）：chunkId / documentId
```

也就是说，day30 把 **文档内容层** 和 **向量索引层** 分开了。

---

## 2. 用到的核心知识

### 2.1 VectorStore（向量存储）接口

day30 定义了统一的 `VectorStore`（向量存储）接口：

```ts
type VectorStore = {
  upsert(vectors: VectorRecord[]): Promise<void>
  query(embedding: number[], topK: number, filter?: VectorQueryFilter): Promise<VectorMatch[]>
  delete(ids: string[]): Promise<void>
  stats(): Promise<VectorStats>
}
```

它代表一个最小版向量数据库应该具备的能力：

- `upsert`：插入或更新向量。
- `query`：根据 query embedding（查询向量）查找相似向量。
- `delete`：删除向量记录。
- `stats`：返回向量库统计指标。

### 2.2 LocalVectorStore（本地向量存储）

day30 先实现了本地版本：

```text
Map<string, VectorRecord>
```

也就是用内存里的 `Map` 来保存向量记录。

虽然它还不是真正高性能的 ANN（Approximate Nearest Neighbor，近似最近邻）向量数据库，但它先把接口和职责拆出来了。

### 2.3 VectorRecord（向量记录）

day30 新增了：

```ts
type VectorRecord = {
  id: string
  embedding: number[]
  metadata: {
    chunkId: string
    documentId: string
  }
  createdAt: number
  updatedAt: number
}
```

这里的重点是 `metadata`（元数据）。

VectorStore（向量存储）只负责保存和查询向量；查到相似向量后，再通过 `chunkId` / `documentId` 回到 KnowledgeStore（知识库存储）里找到原文片段。

### 2.4 Store Separation（存储分离）

day30 的核心思想是 Store Separation（存储分离）：

```text
KnowledgeStore（知识库存储）负责文档和 chunk；
VectorStore（向量存储）负责 embedding 和相似度查询。
```

这样做以后，系统职责更清楚。

文档数据包括：

```text
title（标题）
content（正文）
contentHash（正文哈希）
version（版本）
chunks（文本片段）
updatedAt（更新时间）
```

向量数据包括：

```text
embedding（向量）
chunkId（片段 ID）
documentId（文档 ID）
dimension（向量维度）
queryCount（查询次数）
avgQueryDuration（平均查询耗时）
```

### 2.5 Cosine Similarity（余弦相似度）

`LocalVectorStore.query()` 使用 cosine similarity（余弦相似度）比较：

```text
用户问题的 query embedding（查询向量）
vs
知识片段的 chunk embedding（片段向量）
```

分数越高，说明语义越相似。

### 2.6 Metadata Filter（元数据过滤）

day30 的 `query()` 支持：

```ts
query(embedding, topK, { documentId })
```

这就是 Metadata Filter（元数据过滤）。

以后可以扩展成：

```text
只搜某一篇文档
只搜某个分类
只搜某个用户空间
只搜某个项目知识库
```

### 2.7 Vector Metrics（向量指标）

day30 新增了向量层指标：

| 指标 | 含义 |
|---|---|
| `vectorCount` | 向量总数 |
| `avgEmbeddingDimension` | 平均向量维度 |
| `queryCount` | 向量库查询次数 |
| `avgQueryDuration` | 平均向量查询耗时 |

day29 主要观察文档数、chunk 数、cache hit rate（缓存命中率）。

day30 还能观察向量库本身的运行情况。

### 2.8 Vector Explorer（向量浏览器）

day30 在右侧 UI 中新增 Vector Explorer（向量浏览器），展示：

```text
chunkId（片段 ID）
documentId（文档 ID）
dimension（向量维度）
updatedAt（更新时间）
```

它的作用是让你确认：

```text
这个 chunk 有没有对应向量？
向量属于哪篇文档？
向量维度是多少？
向量最近什么时候更新？
```

---

## 3. 用户提问后的检索流程

day30 中用户提问后的流程是：

```text
用户问题
-> 生成 query embedding（查询向量）
-> 调用 VectorStore.query()
-> 在 VectorStore（向量存储）里查相似向量
-> 得到 chunkId / documentId
-> 回查 KnowledgeStore（知识库存储）
-> 找到原始 chunk 正文
-> 计算 keywordScore（关键词分数）
-> 计算 hybridScore（混合分数）
-> rerank（重排）
-> 把最终 chunk 注入 Prompt（提示词）
-> 让模型回答
```

所以 day30 的检索核心是：

```text
先查向量库，再回查知识库。
```

---

## 4. day29 和 day30 的对比

| 对比项 | day29 | day30 |
|---|---|---|
| RAG 版本 | RAG Runtime V6（RAG 运行时 V6） | RAG Runtime V7（RAG 运行时 V7） |
| 核心目标 | 文档变化时少重复计算 embedding | 文档存储和向量存储解耦 |
| chunk 结构 | chunk 内保存 embedding | chunk 不保存 embedding |
| embedding 存储位置 | KnowledgeChunk 内部 | VectorStore 内部 |
| 检索方式 | 遍历 chunk 并使用 chunk.embedding | 先查 VectorStore，再回查 KnowledgeStore |
| 新增接口 | 无独立 VectorStore 抽象 | 新增 VectorStore 接口 |
| 本地向量库 | 无 | 新增 LocalVectorStore |
| 元数据过滤 | 弱 | 支持 documentId filter |
| 指标 | Knowledge Metrics V2 | 新增 Vector Metrics |
| 可视化 | Knowledge Explorer | Knowledge Explorer + Vector Explorer |
| 未来扩展 | 不方便替换向量数据库 | 可替换 Pinecone / Milvus / Weaviate |

---

## 5. 为什么这样做

真实 RAG 系统里，文档和向量不是一类东西。

文档是业务数据：

```text
用户导入了什么内容？
文档标题是什么？
版本是多少？
正文有没有变化？
chunk 是怎么切的？
```

向量是索引数据：

```text
embedding 是多少维？
有哪些向量？
查询了多少次？
相似度是多少？
向量属于哪个 chunk？
```

如果把它们全部塞进 chunk 里，早期 demo（演示项目）没问题，但工程上会越来越难维护：

```text
删除文档时，向量怎么删除？
更新文档时，旧向量怎么同步？
以后换 Milvus（向量数据库）怎么办？
只搜某篇文档怎么办？
向量库查询耗时怎么统计？
```

所以 day30 的意义不是马上把检索性能提升很多。

因为当前 `LocalVectorStore` 内部仍然是 `Map` 遍历。

它真正的意义是：

```text
先把向量库这一层抽象出来；
以后才能平滑替换成真正的 Vector DB（向量数据库）。
```

也就是从：

```text
会写 RAG demo（RAG 演示）
```

走向：

```text
会设计 RAG system（RAG 系统）
```

---

## 6. 本次对话记录与理解整理

### 问答 1：day30 项目做了什么、用了什么知识、相比 day29 有什么改进、为什么这样做

**我问：**

> 带我来读懂ollama-chat-day30这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day29有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day30` 是在 `ollama-chat-day29` 基础上继续升级的本地 AI Agent（智能体）+ RAG（Retrieval-Augmented Generation，检索增强生成）系统。

它的核心升级是把 day29 的：

```text
KnowledgeStore（知识库存储）+ Incremental Indexing（增量索引）
```

升级成：

```text
KnowledgeStore（知识库存储）+ Local Vector Store（本地向量存储）
```

day29 解决的是：

```text
文档变了以后，怎么少重复生成 embedding（向量表示）。
```

day30 解决的是：

```text
文档内容和向量数据，怎么分开存储、分开查询、分开观察。
```

day30 用到的核心知识包括：

- VectorStore（向量存储）接口。
- LocalVectorStore（本地向量存储）。
- VectorRecord（向量记录）。
- Store Separation（存储分离）。
- Cosine Similarity（余弦相似度）。
- Metadata Filter（元数据过滤）。
- Vector Metrics（向量指标）。
- Vector Explorer（向量浏览器）。

day30 的关键结构是：

```text
KnowledgeStore（知识库存储）
-> Document（文档）
-> Chunk（文本片段）

VectorStore（向量存储）
-> VectorRecord（向量记录）
-> embedding（向量）
-> metadata（元数据）：chunkId / documentId
```

所以 day30 的核心认知是：

```text
小型 RAG 可以把 embedding 放在 chunk 上；
工程化 RAG 要把文档存储和向量存储拆开。
```

---

### 问答 2：day30 是否主要是存储结构改变，先匹配 VectorStore，再反查 chunk

**我问：**

> 那就是说day30对比day29主要就是存储结构的改变，把文档和其向量分开，对于更新文档和匹配用户问题向量时，先匹配VectorStore里面的值，找出其相同或相似的向量值的项，再反查其关联的chunk

**回答整理：**

这个理解是正确的。

更准确地说：

```text
day29：
Document（文档） -> Chunk（文本片段） -> embedding（向量）

day30：
Document（文档） -> Chunk（文本片段）
VectorStore（向量存储） -> embedding（向量） + metadata（元数据）
```

更新文档时流程是：

```text
导入 / 更新文档
-> 切 chunk（文本片段）
-> 判断 chunkHash（片段哈希）是否变化
-> 没变的复用 embedding（向量）
-> 变了的重新生成 embedding（向量）
-> 把 embedding 写入 VectorStore（向量存储）
-> chunk 本身只保留 text / hash / metadata
```

用户提问时流程是：

```text
用户问题
-> 生成 query embedding（查询向量）
-> 去 VectorStore（向量存储）里查相似向量
-> 得到匹配项的 chunkId / documentId
-> 回到 KnowledgeStore（知识库存储）里找到对应 chunk 正文
-> 再算 keywordScore（关键词分数）/ hybridScore（混合分数）/ rerankScore（重排分数）
-> 把最终 chunk 注入模型回答
```

所以“先匹配 VectorStore 里面的值，再反查其关联的 chunk”就是 day30 的核心。

但需要补充一点：

当前 `LocalVectorStore`（本地向量存储）还不是真正高性能向量数据库，它内部仍然是 `Map` 遍历。

它的意义是先把架构抽象出来，后面要换 Pinecone（云向量数据库）/ Milvus（开源向量数据库）/ Weaviate（开源向量数据库）时，不需要大改 KnowledgeStore（知识库存储）和 Retriever（检索器）。

---

### 问答 3：除了存储结构改变，还有没有其他改进

**我问：**

> 还有其他改进的地方不

**回答整理：**

有，但都围绕“向量库独立出来”展开。

除了存储结构变化，day30 还有这些改进：

1. 新增 `VectorStore`（向量存储）标准接口。

定义了统一接口：

```ts
upsert()
query()
delete()
stats()
```

以后如果换成 Pinecone（云向量数据库）/ Milvus（开源向量数据库）/ Weaviate（开源向量数据库），只要实现同样接口，检索层不用大改。

2. 新增 `LocalVectorStore`（本地向量存储）。

day30 先实现了本地版向量库：

```text
Map<string, VectorRecord>
```

虽然还不是真正 ANN（Approximate Nearest Neighbor，近似最近邻）向量数据库，但已经有了向量库这一层。

3. 新增 Metadata Filter（元数据过滤）。

`query()` 支持按 `documentId` 过滤：

```ts
query(embedding, topK, { documentId })
```

以后可以实现：

```text
只搜某篇文档
只搜某类知识
只搜某个用户空间
```

4. 新增 Vector Metrics（向量指标）。

侧栏新增向量指标：

```text
vectorCount
avgEmbeddingDimension
queryCount
avgQueryDuration
```

day29 主要看文档、chunk、cache hit rate（缓存命中率）；day30 可以观察向量库本身。

5. 新增 Vector Explorer（向量浏览器）。

除了 Knowledge Explorer（知识库浏览器），还能看到：

```text
chunkId
documentId
dimension
updatedAt
```

这能确认“chunk 是否真的有对应向量”。

6. Reindex（重建索引）更完整。

day29 的 reindex 主要重建知识索引。

day30 的 reindex 是：

```text
清空 embedding cache（向量缓存）
清空 VectorStore（向量存储）
重新切 chunk（文本片段）
重新生成 / 写入向量
重新保存文档和 vector record（向量记录）
```

也就是文档索引和向量索引一起重建。

7. 持久化结构变了。

day30 使用新的持久化文件：

```text
knowledge-store-v7.json
```

里面同时保存：

```text
documents（文档）
vectors（向量记录）
metrics（指标）
lastIndexStats（最近索引统计）
```

8. UI（用户界面）文案和调试面板升级。

页面标题、标签页、侧栏都从：

```text
Day 29 / RAG V6 / Incremental Indexing（增量索引）
```

改成：

```text
Day 30 / RAG V7 / Local Vector Store（本地向量存储）
```

RAG Debug Panel（RAG 调试面板）也强调现在是：

```text
先走 VectorStore（向量存储）召回，再回查 KnowledgeStore（知识库存储）。
```

一句话总结：

```text
day30 不只是把 embedding 挪出去，
而是补齐了向量库接口、向量查询、向量指标、向量浏览器、元数据过滤和未来 Vector DB 替换入口。
```

---

## 7. 第30天打卡

【第30天打卡】

1. 是否定义 VectorStore（向量存储）接口：是
2. 是否实现 LocalVectorStore（本地向量存储）：是

3. 是否支持 upsert / query / delete / stats：是
4. KnowledgeStore 是否与 VectorStore 解耦：是

5. Indexer 是否写入 VectorStore：是
6. Retriever 是否改成 VectorStore 查询：是

7. 是否支持 Metadata Filter（元数据过滤）：是
8. 是否增加 Vector Metrics（向量指标）：是

9. 是否实现 Vector Explorer（向量浏览器）：是
10. 是否完成 Benchmark（基准测试）：是，已编写 `day30_test_cases.md` 中的 Benchmark 验收记录模板，并通过 `npm run build` 完成项目构建验证；实际 100 / 500 / 1000 chunk 耗时数据后续可按模板继续补充。

11. 遇到的最大问题：

day30 最容易混淆的是“结构升级”和“性能升级”的边界。

这一天确实新增了 VectorStore（向量存储）层，但当前实现是 `LocalVectorStore`（本地向量存储），内部仍然使用 `Map` 遍历来计算 cosine similarity（余弦相似度）。

所以它的意义不是立刻把大规模检索性能提升到生产级，而是先完成架构解耦：

```text
KnowledgeStore（知识库存储）负责文档；
VectorStore（向量存储）负责向量；
Retriever（检索器）先查向量，再回查文档。
```

后续如果接入 Milvus（开源向量数据库）、Pinecone（云向量数据库）或 Weaviate（开源向量数据库），就可以复用同一套 `VectorStore` 接口。

12. 当前系统能力：

```text
RAG Runtime V7（RAG 运行时 V7）
+ KnowledgeStore V3（知识库存储 V3）
+ VectorStore Interface（向量存储接口）
+ LocalVectorStore（本地向量存储）
+ VectorRecord（向量记录）
+ Metadata Filter（元数据过滤）
+ Vector Metrics（向量指标）
+ Vector Explorer（向量浏览器）
+ Knowledge Explorer（知识库浏览器）
+ Incremental Indexing（增量索引）
+ Embedding Cache（向量缓存）
+ Reindex Tool（重建索引工具）
+ Memory-aware Retrieval Pipeline（记忆感知检索流水线）
+ Query Rewrite（查询改写）
+ Multi-Query Retrieval（多查询检索）
+ Hybrid Search（混合检索）
+ Rerank（重排）
+ RAG Debug Panel（RAG 调试面板）
+ Tool Registry（工具注册表）
+ Workflow Runtime（工作流运行时）
```

---

## 8. 第 30 天阶段总结

### 8.1 你第 30 天完成了什么

第 30 天完成的是：

**RAG Runtime V7（RAG 运行时 V7）：Knowledge Infrastructure（知识基础设施）**

这一步非常重要。

因为你已经完成了 Agent（智能体）工程里最容易被忽略的一层：

**Knowledge Layer（知识层）**

很多教程做到：

```text
Embedding（向量化）
↓
Vector Search（向量检索）
```

就结束了。

但你已经继续完成：

| 能力 | 说明 |
|---|---|
| VectorStore（向量存储） | 统一向量读写与查询接口 |
| KnowledgeStore（知识库存储） | 文档与 chunk（文本片段）管理 |
| Store Separation（存储分离） | 文档层与向量层解耦 |
| Metadata Filter（元数据过滤） | 按 documentId 等条件过滤检索 |
| Vector Explorer（向量浏览器） | 可视化向量记录 |
| Benchmark（基准测试） | 可观测索引与检索性能 |
| Incremental Indexing（增量索引） | 文档变化时少重复算 embedding |
| Embedding Cache（向量缓存） | 复用已生成的 embedding |

这意味着：

你已经开始进入：

**AI Infrastructure Engineer（AI 基础设施工程师）**

而不仅仅是 **Agent Developer（智能体开发者）**。

### 8.2 当前进度定位（按 100 天路线）

若整个路线按 100 天来算：

```text
Agent 基础（智能体基础）                ██████████ 100%
Workflow Runtime（工作流运行时）         ██████████ 100%
Tool Ecosystem（工具生态）               █████████░  90%
RAG Runtime（RAG 运行时）                █████████░  90%
Knowledge Infrastructure（知识基础设施） ████████░░  80%
Queue / Worker（队列 / 工作进程）         ░░░░░░░░░░   0%
Multi-Agent（多智能体）                  ░░░░░░░░░░   0%
Production Infra（生产基础设施）          ░░░░░░░░░░   0%
```

你已经完成整个路线大约 **65% ~ 70%**。

接下来要进入：

**Execution Infrastructure（执行基础设施）**

也就是：

**Queue + Worker Runtime（队列 + 工作进程运行时）**

---

## 9. 第 31 天学习计划

### 9.1 Queue Runtime V1（队列运行时 V1）：Job Queue（任务队列）基础

#### 今天核心目标

让你的 Workflow（工作流）从：

```text
同步执行（Synchronous Execution，请求线程内直接跑完）
```

升级成：

```text
异步任务系统（Asynchronous Task System，请求只创建任务，后台执行）
```

#### 为什么必须学这个？

现在你的 Runtime（运行时）大致是：

```text
用户发请求
↓
Workflow（工作流）开始
↓
Workflow 执行
↓
返回结果
```

问题在于：如果未来要跑：

```text
分析 100 页 PDF
导入 5000 个 chunks（文本片段）
Research Agent（研究型智能体）
Multi-Agent（多智能体协作）
```

执行 30 秒怎么办？

HTTP（超文本传输协议）请求会 **超时（Timeout）**。

所以真实 Agent（智能体）平台通常是：

```text
用户请求
↓
创建 Job（后台任务）
↓
进入 Queue（队列）
↓
Worker（工作进程）执行
↓
状态更新（Status Update）
```

#### 第 31 天最终效果

用户说：

> 帮我分析整个知识库

系统返回：

```text
Job Created（任务已创建）

Job ID（任务 ID）:
job_12345

Status（状态）:
queued（排队中）
```

后台：

```text
Worker（工作进程）
↓
执行
↓
完成
```

前端实时展示状态流转：

```text
queued（排队中）
→ running（执行中）
→ success（成功）
```

---

### 9.2 任务清单

#### 任务 1：理解 Queue（队列）架构

今天先不要 Redis（内存键值存储，常用于分布式队列）。

先做 **Local Queue（本地队列）**：

```text
User（用户）
↓
Queue（队列）
↓
Worker（工作进程）
↓
Result（结果）
```

#### 任务 2：定义 Job（后台任务）

新增类型：

```ts
type Job = {
  id: string

  type: string

  payload: unknown

  status:
    | "queued"    // 排队中
    | "running"   // 执行中
    | "success"   // 成功
    | "failed"    // 失败

  result?: unknown

  error?: string

  createdAt: number

  startedAt?: number

  completedAt?: number
}
```

#### 任务 3：实现 JobStore（任务存储）

新增接口：

```ts
interface JobStore {
  create(job)
  get(id)
  update(job)
  list()
}
```

**推荐**：直接使用 **MySQL（关系型数据库）**，因为你已经有 **WorkflowStore（工作流存储）** 了。

新增表：`jobs`

#### 任务 4：实现 QueueManager（队列管理器）

新增：

```ts
class QueueManager
```

内部方法：

- `enqueue(job)`：入队
- `dequeue()`：出队
- `peek()`：查看队首（不出队）

今天先用 **array（数组）** 实现即可。

#### 任务 5：实现 Worker（工作进程）

新增：

```ts
class Worker
```

核心方法：

- `start()`：启动轮询
- `process(job)`：处理单个任务

循环可用 `setInterval(...)` 实现。

示例：

```ts
worker.start()
```

持续：**取任务 → 执行任务 → 更新状态**。

#### 任务 6：Job Executor（任务执行器）

新增 **JobType（任务类型）**，例如：

```text
workflow（工作流）
retrieval（检索）
embedding（向量化）
reindex（重建索引）
```

Worker 内 `switch(job.type)`，分别调用：

- `WorkflowRuntime（工作流运行时）`
- `KnowledgeRuntime（知识运行时）`

#### 任务 7：Queue Dashboard（队列看板）

新增页面 **Queue Dashboard（队列看板）**，展示：

```text
Queued（排队中）
Running（执行中）
Success（成功）
Failed（失败）
```

表格列：

| 列 | 说明 |
|---|---|
| Job ID（任务 ID） | 唯一标识 |
| Type（类型） | workflow / embedding 等 |
| Status（状态） | queued / running / success / failed |
| Duration（耗时） | 开始到结束的时长 |

#### 任务 8：Job Timeline（任务时间线）

类似 **Workflow Timeline（工作流时间线）**，新增 **Job Timeline（任务时间线）**，展示：

```text
Created（创建）
Started（开始执行）
Completed（完成）
```

#### 任务 9：Queue Metrics（队列指标）

新增指标：

| 指标 | 含义 |
|---|---|
| `queuedJobs` | 排队中的任务数 |
| `runningJobs` | 执行中的任务数 |
| `completedJobs` | 已完成任务数 |
| `failedJobs` | 失败任务数 |
| `avgDuration` | 平均执行耗时 |

在 UI 中展示 **Queue Metrics（队列指标）**。

#### 任务 10：模拟长任务

新增 `embedding` 类型任务，模拟：

```ts
await sleep(5000)
```

观察状态流转：

```text
queued（排队中）
↓
running（执行中）
↓
success（成功）
```

---

### 9.3 第 31 天验收标准

1. 是否定义 Job（后台任务）
2. 是否实现 JobStore（任务存储）
3. 是否实现 QueueManager（队列管理器）
4. 是否实现 Worker（工作进程）
5. 是否支持 enqueue / dequeue（入队 / 出队）
6. 是否支持 Job 状态更新
7. 是否实现 Queue Dashboard（队列看板）
8. 是否实现 Job Timeline（任务时间线）
9. 是否增加 Queue Metrics（队列指标）
10. 是否完成长任务模拟测试

---

### 9.4 第 31 天打卡模板

【第31天打卡】

1. 是否定义 Job（后台任务）：是 / 否
2. 是否实现 JobStore（任务存储）：是 / 否
3. 是否实现 QueueManager（队列管理器）：是 / 否
4. 是否实现 Worker（工作进程）：是 / 否
5. 是否支持 enqueue / dequeue（入队 / 出队）：是 / 否
6. 是否支持 Job 状态更新：是 / 否
7. 是否实现 Queue Dashboard（队列看板）：是 / 否
8. 是否实现 Job Timeline（任务时间线）：是 / 否
9. 是否增加 Queue Metrics（队列指标）：是 / 否
10. 是否完成长任务模拟测试：是 / 否
11. 遇到的最大问题：
12. 当前系统能力：

---

### 9.5 第 31 天核心认知

记住一句话：

```text
Workflow（工作流）解决“任务怎么执行”；
Queue（队列）解决“任务什么时候执行”。
```

完成第 31 天后，你将正式进入：

**Execution Infrastructure（执行基础设施）** 阶段

这也是从：

```text
Agent Runtime（智能体运行时）
```

迈向：

```text
Agent Platform（智能体平台）
```

的第一步。

---

## 10. 一句话总结

```text
day29 让 RAG 在文档变化时少重复计算 embedding；
day30 让 RAG 的文档存储和向量存储分离，检索时先查 VectorStore，再回查 KnowledgeStore。
```

更进一步：

```text
day30 的核心不是“马上变成高性能向量数据库”，
而是为未来接入真正的 Vector DB（向量数据库）打好接口和架构基础。
```

面向第 31 天：

```text
day31 让 Workflow 从同步执行升级为异步 Job Queue：
用户请求只创建 Job，Worker 在后台执行并更新状态，为长任务与 Agent Platform 铺路。
```
