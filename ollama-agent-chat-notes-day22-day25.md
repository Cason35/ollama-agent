# Ollama Agent Day22-Day25 聊天学习笔记

> 本文记录本次围绕 `ollama-chat-day22` 到 `ollama-chat-day25` 的项目解读与问答。  
> 重点术语后补充中文括注，方便后续复习。

## 1. Day22：Tool Registry + Dynamic Tool System（工具注册表 + 动态工具系统）

### 用户提问

带我来读懂 `ollama-chat-day22` 文件夹中的项目做了什么，运用了什么知识。

### 回答整理

`ollama-chat-day22` 是一个基于 Next.js（React 全栈框架）和 Ollama / MiMo（模型运行时）的 Agent（智能体）聊天工作流系统。

它不是单纯的聊天框，而是让用户的问题可以走两种路径：

```text
普通模式：模型判断用户想要 chat / weather / summary / todo，然后直接调用工具。
Workflow 模式：模型先把复杂需求拆成多个步骤，再按依赖关系执行工具，最后汇总回答。
```

核心入口：

- `app/api/chat/route.ts`

Day22 的重点是把原来 Executor（执行器）里的 `if/else` 工具分发，升级成 Tool Registry（工具注册表）。

之前可能是：

```ts
if (step.action === "weather") {
  ...
} else if (step.action === "summary") {
  ...
}
```

Day22 变成：

```ts
workflowToolRegistry.execute(step.action, toolInput)
```

也就是说，Executor（执行器）不再关心具体工具怎么实现，只根据工具名去 ToolRegistry（工具注册表）里找对应工具并执行。

### Day22 注册的工具

- `weather`：查询天气
- `summary`：总结内容
- `todo`：生成待办
- `judge`：结构化判断，用于条件分支
- `chat`：普通对话

### Day22 用到的知识

- Next.js App Router（Next.js 应用路由）
- React Hooks（React 状态与生命周期钩子）
- TypeScript（类型系统）
- LLM Agent（大语言模型智能体）
- Tool Registry（工具注册表）
- Schema Validation（模式校验 / 入参校验）
- Workflow（工作流）
- DAG（Directed Acyclic Graph，有向无环图）
- Topological Sort（拓扑排序）
- Retry（重试机制）
- HITL（Human in the Loop，人在回路 / 人工确认）
- MySQL Persistence（MySQL 持久化）
- API Envelope（统一 API 响应包）

一句话总结：

```text
Day22 是在已有聊天 Agent 上，把工具系统工程化了，让工具变成可注册、可展示、可校验、可动态调度的插件。
```

## 2. Day23：Tool Composition + Capability Routing（工具组合 + 能力路由）

### 用户提问

再看看 `ollama-chat-day23` 文件夹的项目，项目里面是有中文注释，要用对应的编码来阅读。

### 回答整理

读取时使用 UTF-8 编码后，中文注释可以正常显示。

`ollama-chat-day23` 是在 Day22 的 Tool Registry（工具注册表）基础上继续升级：从“工具注册表”变成 Capability-based Agent Runtime V2（基于能力的智能体运行时 V2）。

Day23 的重点不是单纯多加几个工具，而是让工具之间可以互相调用，形成 Capability Network（能力网络）。

### Day23 的核心变化

Day22：

```text
Executor 调用工具
```

Day23：

```text
工具可以调用其他工具
```

核心新增概念：

- ToolExecutionContext（工具执行上下文）
- Composite Tool（组合工具）
- Capability Routing（能力路由）
- Tool Graph（工具依赖图）
- Tool Metrics（工具调用指标）
- Sandbox（沙箱保护，包括超时和递归深度限制）

### 新增组合工具 research

`research` 是一个 Composite Tool（组合工具），内部调用：

```text
research
  -> summary
  -> todo
```

Executor（执行器）只看到一步：

```text
step-1 research
```

但实际执行时，`research` 工具内部通过：

```ts
context.toolRegistry.execute("summary", ...)
context.toolRegistry.execute("todo", ...)
```

调用了子工具。

### Day23 的 10 个工具

- `weather`：查天气
- `summary`：总结
- `todo`：生成待办
- `judge`：结构化判断
- `chat`：普通对话
- `research`：组合工具，总结 + 待办
- `note`：写入长期记忆
- `searchHistory`：搜索历史 Workflow（工作流）
- `generatePlan`：生成学习计划
- `critic`：自评工具

### 用户追问

Day22 里面是通过工具名来匹配使用的工具，且按模型返回的步骤一步步地调用相关工具，不也是一种工具组合使用吗？

### 回答整理

是的，Day22 也有广义上的工具组合。但组合发生的位置不同。

Day22 是：

```text
Workflow Composition（工作流层组合）
```

模型 Planner（规划器）返回多个步骤：

```text
step-1 summary
step-2 todo
step-3 chat
```

然后 Executor（执行器）按步骤依赖执行工具。

Day23 是：

```text
Tool Composition（工具层组合）
```

`research` 本身就是一个工具，但它内部会调用 `summary` 和 `todo`。

区别可以概括为：

```text
Day22：工作流编排工具
Day23：工具内部组合工具
```

### 用户追问

为什么要从 Workflow Composition（工作流组合）到 Tool Composition（工具组合）呢？用模型来决定不是更精准些吗？这样弄有什么好处？

### 回答整理

不是说 Tool Composition（工具组合）一定比 Workflow Composition（工作流组合）更精准。很多时候，让模型直接拆 Workflow（工作流）确实更灵活。

但 Day23 要解决的是：

```text
哪些组合逻辑应该沉淀成稳定能力，而不是每次都靠模型临场发挥。
```

比如用户说：

```text
帮我研究一下如何学习 TypeScript，总结要点并列出待办。
```

Day22 里希望模型每次都规划成：

```text
summary -> todo
```

但模型可能今天输出：

```text
summary -> chat -> todo
```

明天又输出：

```text
todo -> summary
```

或者只输出 `chat`。

Day23 把这个常见模式封装成：

```text
research = summary + todo
```

这样模型只要选中 `research`，内部流程就稳定了。

### Tool Composition 的好处

1. 稳定性更高：常见流程不依赖模型每次重新规划。
2. 复用性更好：`research` 可以被任何 Workflow（工作流）复用。
3. 降低 Planner（规划器）压力：模型只需要判断需要什么能力。
4. 可控性更强：工具内部可以做参数清洗、错误兜底、超时保护。
5. 隐藏复杂性：对外暴露高级能力，不暴露内部步骤。
6. 可观测性更好：可以统计组合工具和子工具的调用情况。

更理想的 Agent Runtime（智能体运行时）是两者都有：

```text
用户目标
  -> 模型规划 Workflow
      -> Workflow 步骤可以调用原子工具
      -> 也可以调用组合工具
```

一句话总结：

```text
Workflow Composition 负责任务级编排；
Tool Composition 负责稳定能力封装。
```

## 3. Day24：RAG Runtime V1（检索增强生成运行时 V1）

### 用户提问

继续解读 `ollama-chat-day24` 文件夹的项目。

### 回答整理

`ollama-chat-day24` 的主题是 RAG Runtime（Retrieval-Augmented Generation Runtime，检索增强生成运行时）。

它是在 Day23 的 Capability Runtime（能力运行时）基础上，加了一套本地知识库能力。

简单说：

```text
Day23 的 Agent 会用工具、会组合工具；
Day24 的 Agent 开始能查资料。
```

### Day24 新增模块

- `knowledge-types.ts`：定义 KnowledgeDocument（知识文档）、KnowledgeChunk（知识块）、RetrievedChunkHit（检索命中）
- `knowledge-chunking.ts`：文本切块
- `knowledge-embedding.ts`：调用 Ollama Embedding（Ollama 向量模型）
- `knowledge-retrieval.ts`：Cosine Similarity（余弦相似度）+ TopK 检索
- `knowledge-store.ts`：本地知识库存储，保存到 `.data/knowledge-store.json`
- `knowledge-rag.ts`：RAG Prompt Injection（检索片段注入提示词）

### Day24 的 RAG 链路

```text
导入文档
  -> Chunking（文本切块）
  -> Embedding（向量化）
  -> 保存到本地知识库
  -> 用户查询时生成 Query Embedding（查询向量）
  -> Cosine Similarity（余弦相似度）找 TopK Chunks（最相关的 K 个文本块）
  -> Prompt Injection（提示词注入）
  -> LLM（大语言模型）基于知识回答
```

### Day24 新增 API

```text
GET  /api/knowledge
POST /api/knowledge
POST /api/knowledge/retrieve
```

`POST /api/knowledge` 用于导入知识。  
`POST /api/knowledge/retrieve` 用于手动检索知识库。

### Day24 新增工具

Day23 有 10 个工具，Day24 增加到 12 个：

- `retrieval`：只做知识库检索，返回 `{ query, hits, topK }`
- `ragAnswer`：先检索，再构造 RAG Prompt（检索增强提示词），然后调用模型回答

### Day24 的核心认知

```text
Memory（记忆）不是 Knowledge Base（知识库）。
```

Memory（记忆）：

```text
用户当前会话上下文、短期/长期记忆。
```

RAG / Knowledge Base（检索增强生成 / 知识库）：

```text
外部资料系统，可导入、可持久化、可检索。
```

一句话总结：

```text
Day24 让 Agent 第一次拥有了外部知识库。
```

## 4. RAG 基础概念问答

### 用户提问

讲讲这个 RAG，什么文本切块、向量、余弦相似度 cosine similarity、TopK 检索等等是什么？

### 回答整理

RAG 全称是 Retrieval-Augmented Generation（检索增强生成）。

它解决的问题是：大模型本身不知道你本地资料里的内容，或者它记忆不可靠。所以回答前先去知识库查资料，再把查到的资料塞进 Prompt（提示词），让模型基于资料回答。

流程：

```text
用户问题
  -> 去知识库检索相关内容
  -> 找到最相关的几个文本片段
  -> 把片段放进 Prompt
  -> 让大模型基于这些片段回答
```

### Chunking（文本切块）

一篇文章可能很长，不能整篇都拿去检索，也不能整篇都塞给模型。

所以要把文章切成小块，叫 Chunk（文本块）。

例如：

```text
chunk-1: Workflow Runtime 负责 DAG 调度。
chunk-2: Tool Registry 负责注册和执行工具。
chunk-3: RAG Runtime 负责知识库检索。
```

Day24 里是固定 500 字切一块。

### Embedding（向量化 / 嵌入）

Embedding（向量化）就是把一段文本变成一串数字，用来表示语义。

例如：

```text
"Workflow Runtime 负责 DAG 调度"
```

经过 Embedding Model（向量模型）后，可能变成：

```text
[0.12, -0.03, 0.88, 0.41, ...]
```

真实向量可能有几百到几千维。

关键点：

```text
意思相近的文本，向量距离更近。
```

### 为什么要向量

如果只用 Keyword Search（关键词搜索），用户问：

```text
工作流是怎么安排步骤的？
```

但文档里写的是：

```text
Workflow Runtime 负责 DAG 调度。
```

关键词可能对不上。

Vector Search（向量搜索）可以按语义匹配，而不是只按字面匹配。

### Cosine Similarity（余弦相似度）

有了向量之后，需要判断两个向量像不像。

Cosine Similarity（余弦相似度）看的是两个向量方向是否接近。

可以粗略理解为：

```text
方向越接近，语义越相似。
方向越偏，语义越不相关。
```

常见分数：

```text
1.0  非常相似
0.8  比较相关
0.5  一般
0.1  不相关
```

### TopK Retrieval（TopK 检索）

TopK（取前 K 个）就是从所有 Chunk（文本块）里，找相似度最高的前 K 个。

比如 `topK = 3`，系统会返回最相关的 3 个文本块。

### RAG Prompt Injection（RAG 提示词注入）

检索到 Chunk（文本块）后，把它们放进 Prompt（提示词）：

```text
【知识片段】
1. Workflow Runtime 负责 DAG 调度与 Tool 执行。
2. Capability-based Agent 在 day23 引入组合工具。

【用户问题】
Workflow Runtime 是什么？
```

然后把这个 Prompt 发给 LLM（Large Language Model，大语言模型）。

### 用户追问

那为什么意思越接近的东西，其向量就是越接近的呢？

### 回答整理

因为向量不是随便生成的一串数字，而是 Embedding Model（向量模型）专门学出来的语义坐标。

更准确地说：

```text
不是“意思接近所以天然向量接近”，
而是“Embedding 模型被训练成让意思接近的文本向量接近”。
```

Embedding 模型训练时的目标之一就是：

```text
相似文本，向量拉近；
不相似文本，向量推远。
```

可以把它想象成一张“语义地图”：

```text
天气、气温、下雨、预报        在一个区域
React、Next.js、组件、Hooks    在一个区域
MySQL、表、索引、SQL           在一个区域
```

一句话被 Embedding（向量化）后，就被放到这张语义地图上的某个位置。

### 用户追问

Embedding 模型是怎么训练的呢？RAG 文档里的那些向量值也是靠 Embedding 模型来判断的吗？

### 回答整理

是的，RAG 文档里的向量值就是 Embedding Model（向量模型）算出来的。

但要注意：

```text
Embedding 模型不是在你的 RAG 项目里训练出来的。
```

Day24 / Day25 使用的是已经训练好的模型，例如：

```text
nomic-embed-text
```

项目只是调用它：

```text
文本 -> Embedding 模型 -> 向量数组
```

Embedding 模型常见训练方式：

1. 大规模文本预训练：学习词和句子在上下文中的关系。
2. Contrastive Learning（对比学习）：相似文本拉近，不相似文本推远。
3. Search / QA Training（搜索 / 问答数据训练）：让 query（查询）和相关 document（文档）靠近。

RAG 中：

```text
文档 chunk 向量：Embedding 模型算出来
用户 query 向量：同一个 Embedding 模型算出来
相似度排序：Cosine Similarity + TopK 完成
```

所以 Embedding 模型负责“编码语义”，而检索排序由 Cosine Similarity（余弦相似度）和 TopK（取前 K 个）完成。

## 5. Day25：RAG Runtime V2（检索质量优化 + 可调试）

### 用户提问

接下来再看看 `ollama-chat-day25` 文件夹里面的项目。

### 回答整理

`ollama-chat-day25` 是 RAG Runtime V2（检索增强生成运行时 V2）。

它不是再加一个全新的大功能，而是在 Day24 的 RAG 基础上做质量优化：

```text
让检索更准、可调试，并且在知识不足时不要硬答。
```

### Day25 相比 Day24 的核心变化

Day24：

```text
RAG 能跑通
```

Day25：

```text
RAG 开始变可靠
```

### 1. Overlap Chunking（重叠切块）

Day24 是：

```text
0-500
500-1000
1000-1500
```

Day25 改成：

```text
0-500
400-900
800-1300
```

默认：

```text
chunk size = 500
overlap = 100
```

为什么要重叠？

```text
避免关键信息刚好被切在两个 chunk 边界，导致检索不到完整语义。
```

### 2. Chunk Metadata（文本块元数据）

Day25 给每个 Chunk（文本块）加了：

```ts
index
startOffset
endOffset
tokenEstimate
```

作用是知道命中的内容来自：

```text
第几个 chunk
原文哪个位置
大概多少 token
```

这对 Debug（调试）和引用来源很重要。

### 3. TopK 可控

Day25 默认 TopK 从 3 变成 5，并允许 API 传：

```json
{
  "topK": 5
}
```

系统限制：

```text
topK 最小 1，最大 20
```

### 4. minScore（最低相似度阈值）

这是 Day25 非常关键的升级。

Day24 的问题是：

```text
即使问题和知识库完全不相关，也会硬找出“最像”的几个 chunk。
```

但“最像”不等于“真的相关”。

Day25 加了：

```text
minScore = 0.3
```

只有相似度大于等于这个阈值的 Chunk（文本块）才会进入结果。

这样可以避免：

```text
用户问：量子纠缠是什么？
知识库只有：Workflow、HITL、Tool Registry
系统却拿 Workflow chunk 去回答量子纠缠。
```

### 5. No-result Fallback（无结果兜底）

Day25 的 `ragAnswer` 如果没有合格 Chunk（文本块），就不调用 LLM（大语言模型）硬编，而是直接返回：

```text
知识库中没有找到足够相关的信息，我只能基于当前对话回答。
```

并且输出：

```json
{
  "usedFallback": true
}
```

这就是降低 Hallucination（幻觉 / 编造）的关键。

### 6. RAG Prompt V2（检索增强提示词 V2）

Day25 的 Prompt（提示词）更严格，要求模型：

- 优先基于知识片段回答
- 知识不足要明确说明
- 不要编造知识片段中不存在的信息
- 回答末尾列出参考片段

### 7. RAG Metrics（RAG 指标）

Day25 新增了更细的指标：

```ts
queryCount
avgTopScore
noResultCount
avgRetrievedChunks
```

含义：

- `queryCount`：检索次数
- `avgTopScore`：平均最高相似度
- `noResultCount`：无合格结果次数
- `avgRetrievedChunks`：平均每次返回多少 chunk

这些指标可以帮助判断 RAG 是否健康：

```text
noResultCount 高：可能知识库缺资料，或 minScore 太高
avgTopScore 低：检索质量可能不佳
avgRetrievedChunks 太低：阈值可能太严
```

### 8. RAG Debug Panel V2（RAG 调试面板 V2）

前端新增或升级调试面板，可展示：

- Query（查询）
- TopK（取前 K 个）
- MinScore（最低相似度阈值）
- Similarity Score（相似度分数）
- Document Title（文档标题）
- Chunk Index（文本块序号）
- Offset（原文偏移）

### Day25 的工具层变化

仍然是 12 个工具，`retrieval` 和 `ragAnswer` 保留，但升级为 V2。

`retrieval` 输出增加：

```text
topK
minScore
```

`ragAnswer` 输出增加：

```text
usedFallback
```

### Day25 一句话总结

```text
Day24 是“RAG 能检索”，Day25 是“RAG 检索得更准，而且知道什么时候不该回答”。
```

核心认知：

```text
RAG 的核心不是“能检索”，而是“检索得准、知道什么时候不该回答”。
```

## 6. 整体演进总结

```text
Day22：Plugin-based Runtime V1（基于插件的运行时）
       Tool Registry（工具注册表）
       Schema Validator（模式校验器）
       Tool Explorer（工具浏览器）

Day23：Capability-based Runtime V2（基于能力的运行时）
       Tool Composition（工具组合）
       Capability Routing（能力路由）
       Tool Graph（工具图）
       Tool Metrics（工具指标）

Day24：Knowledge-aware Agent Runtime V1（知识感知智能体运行时）
       Local RAG（本地检索增强生成）
       Embedding（向量化）
       Cosine Similarity（余弦相似度）
       TopK Retrieval（TopK 检索）
       RAG Prompt Injection（RAG 提示词注入）

Day25：RAG Runtime V2（检索增强生成运行时 V2）
       Overlap Chunking（重叠切块）
       Chunk Metadata（文本块元数据）
       TopK + MinScore（取前 K 个 + 最低相似度阈值）
       Low-hallucination Prompt（低幻觉提示词）
       Fallback（兜底回答）
       RAG Debug Panel（RAG 调试面板）
```

最终主线：

```text
工具可插拔
  -> 工具可组合
  -> Agent 能查知识库
  -> RAG 检索质量变可靠
```

