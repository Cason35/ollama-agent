# Day 49 Learning Summary（第 49 天学习总结）

## 文档范围

本文档整理围绕 `ollama-chat-day49` 项目学习与理解的对话，包含学习问题与对应回答。

按照要求，本文档不记录创建文件夹、复制项目、修改代码、安装依赖、运行测试和检查页面等项目实施过程，只保留用于理解项目设计、技术知识、版本改进和设计原因的内容。

---

## 问题 1：Day 49 项目做了什么、运用了什么知识、相比 Day 48 有什么改进、为什么这样做？

### 我问

> 带我来读懂 `ollama-chat-day49` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day48` 有什么改进，为什么这样子做（对于一些英文术语后面加上括号，并用中文翻译或描述下）。

### 回答

#### 一句话理解 Day 49

Day 49 的主题是 **Long-Term Memory V2（长期记忆第 2 版）**，定位是 `Advanced Optimization V2（高级优化第 2 版）`。

它和 Day 48 的关系（项目反复强调的核心认知）：

> Cache（缓存）负责"避免重复思考"，Long-Term Memory（长期记忆）负责"积累经验"。

也就是说，Day 48 让系统遇到**相同问题**时不用重新算（省钱省时间）；Day 49 则让系统从**做过的任务**里提炼经验、沉淀下来，下次遇到**同类（但不完全相同）的新任务**时能复用过去的教训。

#### 落地的 10 个能力

| 能力 | 实现位置 |
| --- | --- |
| 1. 定义记忆条目结构 `MemoryItemV2`（记忆条目第 2 版） | `lib/memory/long-term-memory-types.ts` |
| 2. 长期记忆存储 `LongTermMemoryStore`（长期记忆存储） | `lib/memory/long-term-memory-store.ts` |
| 3. Experience Extraction（经验提取） | `lib/memory/experience-extraction.ts` |
| 4. Memory Consolidation（记忆整合 / 去重） | `consolidateMemories()` |
| 5. Importance Decay（重要性衰减） | `importanceDecay()` |
| 6. Memory Retrieval V2（记忆检索第 2 版，综合打分） | `retrieve()` |
| 7. Agent Runtime（智能体运行时）接入长期记忆 | `answerWithLongTermMemory()` |
| 8. Memory Explorer V2（记忆浏览器第 2 版）前端 + API（接口） | `MemoryExplorerV2.tsx` + `/api/memory` |
| 9. Memory Metrics（记忆指标） | `stats()` |
| 10. 自动化测试 | `scripts/test-day49-memory.ts` |

#### 核心机制（运用了什么知识）

**1. 记忆有五种类型，且类型决定默认权重**

`MemoryItemType`（记忆类型）把记忆分成五类，不同类型有不同的默认 importance（重要性）和 confidence（置信度）：

- `lesson`（教训）：默认重要性最高（0.85），因为它直接指导后续决策。
- `decision`（决策）：默认重要性较高（0.75）。
- `experience`（经验）：默认重要性中上（0.7）。
- `fact`（事实）：默认重要性中等（0.6），但置信度最高（0.85）。
- `preference`（偏好）：默认重要性偏低（0.5）。

设计意图：体现"不是所有记忆都同等重要"这一认知科学（Cognitive Science）概念。

**2. Memory Retrieval V2（记忆检索第 2 版）：从"单一相似度"升级为"综合打分"**

这是相比 Day 48 缓存最关键的算法升级。Day 48 缓存检索只看一个维度（Cosine Similarity（余弦相似度）≥ 0.9 就命中）；Day 49 检索用了三因子加权综合分（Multi-factor Scoring（多因子打分））：

```text
score = 0.5 × semantic（语义相似度）
      + 0.3 × importance（重要性）
      + 0.2 × recency（新近度）
```

`accessFrequency`（访问频率）作为同分时的辅助排序依据。

- `semantic`（语义）：和查询内容相不相关——复用 Day 48 的余弦相似度。
- `recency`（新近度）：`Math.exp(-Δt / τ)`，这是指数时间衰减（Exponential Time Decay），最近用过的记忆分高，τ（时间常数）= 7 天。
- `accessFrequency`（访问频率）：经常被用到的记忆更可靠。

这其实是借鉴了人类记忆模型 + 信息检索（Information Retrieval）里的 LRU / LFU（最近最少使用 / 最不经常使用）+ 语义检索的混合思路。

**3. 检索本身会"反哺"记忆（自强化）**

`retrieve()` 是有副作用的：被命中的记忆 `accessCount`（访问次数）+1、`lastAccessedAt`（最近访问时间）更新。意义：越常被用到的经验，新近度更高、衰减更慢，于是更容易被再次检索到——这是一个正反馈循环（Positive Feedback Loop），让"有用的记忆"自然浮上来，"没用的记忆"慢慢沉底。

**4. Importance Decay（重要性衰减）：会遗忘，但访问越多忘得越慢**

衰减阻力公式 `resistance = 1 + log10(1 + accessCount)`，是对数衰减阻力（Logarithmic Decay Resistance）：访问次数越多，每次衰减幅度越小。同时有两个保护：`pinned`（置顶）的记忆完全不衰减，所有记忆有重要性下限 `IMPORTANCE_FLOOR`（= 0.05），避免衰减到 0 后永远检索不到。

这对应人脑的遗忘曲线（Ebbinghaus Forgetting Curve（艾宾浩斯遗忘曲线））：经常回忆的东西忘得慢，不用的东西慢慢淡忘。

**5. Memory Consolidation（记忆整合）：把重复经验压成一条**

同类型 + 相似度 ≥ 0.9 的记忆会被合并：保留信息量最大的正文，取较高的重要性 / 置信度，累加访问次数，并用 `consolidatedFrom`（整合来源条数）记下"这条是由几条合并来的"。这避免了同一条经验被反复写入导致记忆膨胀——类似人睡眠时把零散记忆整理归档（Memory Consolidation（记忆固化））的过程。

**6. Experience Extraction（经验提取）：从任务结果里自动"长"出记忆**

记忆不是手动喂的，而是从多智能体协作的结果里自动提炼，来源有三处：

- Evaluation（评估）结果 → "哪个 Agent 在这类任务上表现最好" → `lesson`（教训）
- Reflection（反思）建议 → "下次该注意什么" → `lesson`（教训）
- 协作策略本身 → "用了 Supervisor（主管调度）+ DAG（有向无环图）+ 反思闭环" → `decision`（决策）

`deriveTopic()`（主题提取）还会把"研究 LangGraph"里的填充词（研究 / 学习 / 如何…）剥掉，提炼出主题 `LangGraph`，这样不同 query（查询）才能映射到同一主题的经验。

**7. 接入 Agent Runtime（智能体运行时）：检索 → 注入提示词 → 执行 → 写回（闭环）**

`answerWithLongTermMemory()` 形成了一个"读-用-写回"的闭环（Closed Loop）：

1. 先 `retrieve()`（检索）出与查询最相关的历史经验。
2. 把经验注入 `AgentContext`（智能体上下文）的 memory 字段。
3. 经验最终拼进 Agent 提示词，把 `Prompt`（提示词）升级成 `Prompt + Long-Term Experience`（提示词 + 长期经验）。
4. 任务执行完后，从协作快照里提取新经验并写回记忆。

整个过程通过 Trace（追踪）的 memory span（记忆跨度）被观测记录——`TraceSpanType`（追踪跨度类型）专门新增了 `"memory"` 类型。

#### 对比 Day 48 有什么改进

| 维度 | Day 48（Semantic Cache（语义缓存）） | Day 49（Long-Term Memory（长期记忆）） |
| --- | --- | --- |
| 目标 | 避免重复思考（同一问题不重算） | 积累经验（同类新任务复用过去教训） |
| 存的是什么 | `查询 → 答案` 的整段映射 | 分类型的经验 / 教训 / 决策 / 事实 / 偏好 |
| 命中判定 | 单一维度：余弦相似度 ≥ 0.9 | 三因子综合分：0.5 语义 + 0.3 重要性 + 0.2 新近度 |
| 失效 / 淘汰策略 | TTL（存活时间）+ LRU（最近最少使用），硬删除 | Importance Decay（重要性渐进衰减）+ pin（置顶保护），软淡忘 |
| 去重 | 无（每个查询各存一条） | Consolidation（整合）把相似记忆合并成一条 |
| 数据怎么来 | 未命中时直接把答案存进去 | 从 Evaluation / Reflection 自动提炼经验 |
| 对生成的影响 | 命中后跳过整个 Agent 执行 | 不跳过，而是把经验注入提示词增强生成 |
| Trace 跨度类型 | 新增 `cache`（缓存）span | 新增 `memory`（记忆）span |
| 是否自强化 | 否 | 是（检索会更新访问次数 / 时间，形成正反馈） |

最本质的差别：**Day 48 缓存是"走捷径"（命中就不执行了），Day 49 记忆是"带着经验去执行"（仍然完整跑一遍，但更聪明）**。两者是互补关系，而不是替代——代码里 `answerWithCache` 和 `answerWithLongTermMemory` 同时保留。

技术上的复用也很优雅：Day 49 的 `LongTermMemoryStore` 直接 import 了 Day 48 的 `computeQueryEmbedding`（查询向量计算）和 `cosineSimilarity`（余弦相似度），说明语义向量这套底座是层层叠加、复用的。

#### 为什么这样设计

1. **为什么要分两套（缓存 + 记忆）？** 因为它们解决两类不同问题。缓存解决"完全相同问题的成本"，但现实里用户问法千变万化，更多是"同类不同问"——这要靠经验复用，而不是精确命中。
2. **为什么检索要用三因子加权？** 因为记忆要回答的不是"一模一样吗"，而是"现在最该想起哪条经验"。一条语义相关但已过时、或不重要的记忆，不该压过一条稍微不那么相关但很关键、最近刚验证过的教训。
3. **为什么要衰减而不是直接删除？** 直接删太"一刀切"。衰减是渐进的、可恢复的（被重新检索到就抬升访问次数、减缓衰减），更贴近"记忆模糊但没彻底消失"的真实情况。
4. **为什么访问越多衰减越慢、还能置顶？** 防止"有用的核心经验"被时间冲刷掉。`accessCount` 体现"被验证过的可靠性"，`pinned` 给人类一个强制保留的开关。
5. **为什么要整合去重？** 多智能体反复做同类任务，必然产出大量近似经验。不整合，记忆库会被噪声淹没。整合把 N 条压成 1 条并记下来源数量，既瘦身又保留"被反复验证过 N 次"的信号。
6. **为什么经验要自动提取而非手填？** 让系统具备自主学习闭环（Autonomous Learning Loop）：做任务 → 评估 / 反思 → 提炼经验 → 写回 → 下次检索复用。这正是 Agent 从"会执行"走向"会成长"的关键一步。

> 备注：`ollama-chat-day49/README.md` 的内容还停留在 Day 48（讲语义缓存），但 `day49_test_cases.md`、代码注释和 `package.json` 的 `test:day49` 都已经是 Day 49 长期记忆的内容。

---

## 问题 2：这种记忆是全局的吗？A 用户问过，B 用户再问会用到这个记忆吗？

### 我问

> 这种记忆是全局的吗，如果 A 用户已经问过相关的，B 再问，会用到这个记忆不？

### 回答

是的，**当前这套长期记忆是全局共享（Global / Shared）的**。A 用户问过、沉淀下来的经验，B 用户问相关问题时会被检索到并复用。三处证据很明确：

**1. 它是一个进程级单例（Process-wide Singleton（进程内单例））**

```text
export const longTermMemory = new LongTermMemoryStore();
```

整个 Node 进程只有这一个记忆库实例，所有请求共用它。

**2. 所有 AgentRuntime 默认都注入这个同一个单例**

`AgentRuntime` 构造函数里 `memoryStore` 的缺省值就是全局 `longTermMemory`。哪怕每个请求 new 一个新的 `AgentRuntime`，大家写进去 / 读出来的都是同一份记忆。

**3. 记忆条目和检索里完全没有"用户"这个维度**

- 记忆来源 `MemoryItemSource`（记忆来源）只有 `traceId` / `workspaceId` / `agentId`，没有 `userId`（用户标识）/ `sessionId`（会话标识）。
- `retrieve()` 检索时只按 `type`（类型）和综合分过滤，没有任何"只看当前用户记忆"的筛选条件。

所以执行流程上：B 问"如何学习 Agent"，`retrieve()` 会扫描全库记忆，只要 A 之前沉淀的经验语义相关、分数过阈值，就会被命中并注入到 B 的提示词里。

**为什么会这么设计？** 因为 Day 49 是教学 / 演示项目，记忆存在内存 `Map` 里（重启即丢），目标是讲清"长期记忆的机制"本身，所以刻意省略了多租户隔离（Multi-tenancy Isolation（多租户隔离））。在这个语境下，"全局经验池"反而更能体现"系统整体在成长"的效果。

**如果要做成按用户隔离，改动不大**，两种思路：

1. 加字段过滤（轻量）：在 `MemoryItemSource` 里加 `userId`，`retrieve()` 增加 `userId` 过滤条件——既能做"私有经验"，也能保留 `userId` 为空的"公共经验"共享。
2. 按用户分库（彻底）：把单例换成 `Map<userId, LongTermMemoryStore>`，每个用户一个独立记忆库，互不可见。

另外提醒：Day 48 的语义缓存也是同样的全局单例（`export const semanticCache = ...`），所以 A 问过的问题，B 问相同问题时也会直接命中 A 留下的缓存答案——同样没有用户隔离。

---

## 问题 3：真实系统是怎么设计的？

### 我问

> 真实系统是怎么设计的呢？

### 回答

Day 49 是教学 demo，真实生产系统在每一层都会"重得多"。按维度对比真实做法：

#### 1. 存储层：从内存 Map → 专用向量数据库

| | Day 49 demo | 真实系统 |
| --- | --- | --- |
| 存储 | 进程内 `Map`，重启即丢 | 持久化的 Vector Database（向量数据库） |
| 检索 | 遍历全库算余弦（暴力 O(n)） | ANN（Approximate Nearest Neighbor（近似最近邻））索引，亚毫秒级 |
| 向量 | 确定性哈希伪向量 | 真实 Embedding Model（嵌入模型，如 OpenAI text-embedding-3、bge、Cohere）生成 |

真实系统会用 Pinecone / Weaviate / Qdrant / Milvus / pgvector 这类向量库，底层用 HNSW（Hierarchical Navigable Small World（分层可导航小世界图））或 IVF（Inverted File Index（倒排文件索引））做到千万级向量仍能快速检索。

#### 2. 多租户隔离（Multi-tenancy Isolation）：生产系统的硬性要求

Day 49 全局共享在真实系统里通常是安全 / 隐私事故。真实做法：

- Namespace / Partition Key（命名空间 / 分区键）：每个向量带 `user_id`、`tenant_id`、`session_id` 等元数据，检索时强制按这些字段过滤（Metadata Filtering（元数据过滤））。
- 分层可见性：私有记忆（属于某用户）+ 共享知识（全局 / 团队级）分开存，检索时按权限合并。
- 数据删除合规：GDPR（通用数据保护条例）等隐私法要求"被遗忘权"，必须能按 `user_id` 物理删除某人的全部记忆。

#### 3. 记忆分层：不止"长期记忆"一种

真实 Agent 记忆通常分多层（参考认知科学 + MemGPT / Letta 的设计）：

- Working / Short-term Memory（工作记忆 / 短期记忆）：当前对话上下文，放在 LLM 的 context window（上下文窗口）里。
- Episodic Memory（情景记忆）：具体发生过的事件 / 对话片段。
- Semantic Memory（语义记忆）：抽象出来的事实和知识（≈ Day 49 的 fact 类型）。
- Procedural Memory（程序性记忆）：怎么做某件事的流程 / 技能（≈ Day 49 的 decision / lesson）。

Day 49 的五种类型算是把这些揉在了一层里的简化版。

#### 4. 检索：从"单一向量相似度" → 混合检索 + 重排

- Hybrid Search（混合检索）：向量检索 + 关键词检索（BM25（一种关键词相关性排序算法））并行，召回更全。纯向量会漏掉精确关键词（如产品型号、人名）。
- Reranking（重排序）：先粗召回 top 50-100 条，再用 Cross-Encoder（交叉编码器）重排模型精排出 top 5，质量远高于单纯算分。
- Metadata Filtering（元数据过滤）：先按 `user_id`、时间范围、类型硬过滤，再做语义检索。

#### 5. 写入与整合：用 LLM 来做，而非字符串规则

- Day 49 的经验提取是模板字符串拼接。
- 真实系统用 LLM 做 Memory Extraction（记忆抽取）：让模型判断"哪些信息值得记""是否和已有记忆冲突""该更新还是新增"。
- Consolidation（整合）也常用 LLM 做摘要归并。
- 还会处理冲突与更新：比如用户先说"我住北京"后说"我搬到上海了"，系统要 update（更新）而不是存两条矛盾记忆——这是 Day 49 没有的。

#### 6. 遗忘机制：真实但更工程化

- 基于"访问频率 + 时效 + 重要性打分"综合决定保留 / 归档 / 删除。
- 冷数据降级到便宜存储，或定期 LLM 摘要压缩成"记忆卡片"。
- 显式 TTL（存活时间）+ pin（置顶保护），这点 Day 49 已经有了。

#### 7. 成熟的开源 / 商业方案

真实项目一般不会从零写，而是用现成框架：

- Mem0：专门做 LLM 应用记忆层，自动抽取 / 更新 / 检索。
- Letta（前 MemGPT）：把 LLM 当"操作系统"，自主管理分层记忆的换入换出。
- Zep：带时序知识图谱（Temporal Knowledge Graph（时序知识图谱））的记忆服务。
- LangGraph / LangChain Memory：提供 checkpointer（检查点）和 store（存储）抽象。
- 知识图谱方案：把记忆存成实体-关系图（如 Graphiti），擅长处理"实体随时间变化"的关系型记忆。

#### 一句话总结

Day 49 在**机制思想上是对的**（分类型、综合打分检索、衰减、整合、检索-注入-写回闭环），这些正是真实系统的核心概念。但它做的是单机、内存、全局、规则驱动、伪向量的教学简化版；真实系统则是**持久化向量库 + 真实嵌入 + 多租户隔离 + 混合检索 + 重排 + LLM 驱动的抽取 / 整合 / 冲突处理**的工程化版本。

---

## 第 49 天打卡（已完成）

```text
【第49天打卡】

1. 是否定义 MemoryItemV2（记忆条目第 2 版）：是
2. 是否实现 LongTermMemoryStore（长期记忆存储）：是

3. 是否实现 Experience Extraction（经验提取）：是
4. 是否实现 Memory Consolidation（记忆整合）：是

5. 是否实现 Importance Decay（重要性衰减）：是
6. 是否升级 Memory Retrieval（记忆检索）：是

7. Agent Runtime（智能体运行时）是否接入 Long-Term Memory（长期记忆）：是

8. 是否实现 Memory Explorer V2（记忆浏览器第 2 版）：是

9. 是否增加 Memory Metrics（记忆指标）：是

10. 是否完成 Long-Term Memory Test（长期记忆测试）：是

11. 遇到的最大问题：
理解 Memory（长期记忆）与 Cache（语义缓存）的本质区别——缓存是"命中就跳过执行（走捷径）"，
记忆是"带着检索到的经验完整执行（更聪明地做）"，两者互补共存而非替代。
另一个关键点是记忆检索从 Day 48 的单一相似度，升级为"0.5 语义 + 0.3 重要性 + 0.2 新近度"
的多因子综合打分，并配合重要性衰减（访问越多衰减越慢）与记忆整合去重，模拟人脑的记忆强化与遗忘。
此外注意到当前记忆是进程级全局单例、无用户隔离，属于教学简化设计。

12. 当前系统能力：
系统升级为 Advanced Optimization V2（高级优化第 2 版）：Experience Memory System（经验记忆系统）。
具备跨任务积累经验的能力：每完成一次多智能体协作，会从 Evaluation（评估）与 Reflection（反思）
中自动提取 lesson / decision / experience 等记忆并写回；下次遇到同类任务时，按综合分检索历史经验
并注入提示词（Prompt + Long-Term Experience），通过 Trace 中的 memory span（记忆跨度）可观测整个
检索与写回过程；并提供 Memory Explorer V2（记忆浏览器第 2 版）与 /api/memory 接口进行查看、置顶与清理。
至此，系统从 Smart Agent（智能体）迈向 Autonomous Learning Agent（自主学习智能体），成为真正"会成长"的智能体平台。
```

---

## 第 49 天核心认知

记住一句话：

> Cache（缓存）负责避免重复思考，Long-Term Memory（长期记忆）负责积累经验。

完成第 49 天以后，系统升级为：

> Advanced Optimization V2（高级优化第 2 版）：Experience Memory System（经验记忆系统）

这一步完成以后，你会拥有真正意义上「会成长的 Agent Platform（智能体平台）」，也是从 Smart Agent（智能体）迈向 Autonomous Learning Agent（自主学习智能体）最关键的一步。

---

## 第 49 天总结

第 49 天完成的是：

> Advanced Optimization V2（高级优化第 2 版）：Experience Memory System（经验记忆系统）

这一步非常关键。你现在已经不只是拥有：

- Conversation Memory（对话记忆，保留多轮对话上下文）
- Task Workspace（任务工作空间，多智能体共享中间结果）
- Semantic Cache（语义缓存，避免重复思考相同问题）

而是拥有了真正意义上的：

- Experience Memory（经验记忆，跨任务沉淀与复用经验）

也就是说，你的 Agent（智能体）系统开始具备：

- 从历史任务中沉淀经验（Experience Distillation（经验提炼））
- 在未来任务中复用经验（Experience Reuse（经验复用））
- 自动整合重复记忆（Memory Consolidation（记忆整合））
- 根据重要性和访问频率管理记忆（Importance & Access-based Management（基于重要性与访问频率的管理））

这已经非常接近业界一线产品的能力：

- Devin（自主软件工程智能体）的任务经验沉淀
- Cursor（AI 代码编辑器）的项目上下文记忆
- Claude Code（命令行编程智能体）的长期项目记忆
- Deep Research（深度研究智能体）的跨任务研究经验复用

### 当前系统能力

- Cache（缓存）：避免重复思考
- Workspace（工作空间）：支持团队协作
- Long-Term Memory（长期记忆）：积累经验
- Evaluation（评估）：衡量质量
- Regression（回归测试）：防止退步
- Usage（用量统计）：衡量成本
- Trace（追踪）：定位问题

这已经是一个完整 Agent Platform（智能体平台）的核心闭环（Core Loop）了。

### 当前整体进度

```text
Agent Foundation（智能体基础）              ██████████ 100%

Workflow Runtime（工作流运行时）            ██████████ 100%
Tool Runtime（工具运行时）                  ██████████ 100%
RAG Runtime（检索增强生成运行时）           ██████████ 100%

Queue Runtime（队列运行时）                 ██████████ 100%
Execution Platform（执行平台）              ██████████ 100%

Multi-Agent Runtime（多智能体运行时）       ██████████ 100%

Continuous Evaluation（持续评估）           ██████████ 100%
Production Runtime（生产运行时）            ██████████ 100%

Advanced Optimization（高级优化）           ███████░░░ 70%

Deployment & Infra（部署与基础设施）        ░░░░░░░░░░ 0%
```

整体进度：

> 97%

---

## 第 50 天学习计划

> Advanced Optimization V3（高级优化第 3 版）：Model Router（模型路由器）

### 今日核心目标

让系统学会：

> 不同任务，选择不同模型（Per-task Model Selection（按任务选择模型））

### 为什么第 50 天必须做 Model Router（模型路由器）？

现在你的系统大概率还是「所有任务都用同一个模型」，比如 `qwen2.5:14b`。

但真实生产系统不会这样。不同任务需要不同模型：

- 简单分类（Simple Classification） → 小模型（Small Model）
- 复杂推理（Complex Reasoning） → 大模型（Large Model）
- Embedding（向量嵌入） → embedding 模型（嵌入模型）
- Reflection / Evaluation（反思 / 评估） → 稳定评估模型（Stable Evaluation Model）
- 写作（Writing） → 表达能力强的模型（Strong Expression Model）
- 结构化 JSON（Structured JSON） → 遵循格式强的模型（Format-following Model）

### 最终效果

| 用户任务 | 系统选择 |
| --- | --- |
| 帮我总结这段话 | small model（小模型） |
| 帮我设计多 Agent 架构 | large reasoning model（大推理模型） |
| Evaluation（评估） | evaluation model（评估模型） |
| Embedding（向量嵌入） | embedding model（嵌入模型） |

### 任务 1：定义 ModelProfile（模型档案）

新增：

```typescript
type ModelProfile = {
  id: string

  name: string

  provider:
    | "ollama"
    | "openai"
    | "anthropic"
    | "local"

  model: string

  capabilities: string[]

  cost: {
    inputPer1K: number
    outputPer1K: number
  }

  limits: {
    contextWindow: number
    maxOutputTokens: number
  }

  speed:
    | "fast"
    | "medium"
    | "slow"

  quality:
    | "basic"
    | "strong"
    | "reasoning"
}
```

### 任务 2：实现 ModelRegistry（模型注册表）

新增：

```typescript
class ModelRegistry {
  register(model: ModelProfile)

  get(id: string)

  list()

  findByCapability(capability: string)
}
```

### 任务 3：注册模型（Register Models）

先注册几个逻辑模型（Logical Models）：

- small-chat（小型对话模型）
- large-reasoning（大型推理模型）
- json-structured（结构化 JSON 模型）
- embedding（嵌入模型）
- evaluation（评估模型）

示例：

```typescript
{
  id: "local-qwen-chat",
  provider: "ollama",
  model: "qwen2.5:14b",
  capabilities: ["chat", "summary", "reasoning"]
}
```

### 任务 4：定义 ModelRoutingInput（模型路由输入）

```typescript
type ModelRoutingInput = {
  taskType:
    | "chat"
    | "summary"
    | "planning"
    | "reflection"
    | "evaluation"
    | "embedding"
    | "json"

  complexity:
    | "low"
    | "medium"
    | "high"

  requiresJson?: boolean

  maxCost?: number

  latencyPreference?:
    | "fast"
    | "balanced"
    | "quality"
}
```

### 任务 5：实现 ModelRouter（模型路由器）

```typescript
class ModelRouter {
  route(input: ModelRoutingInput): ModelProfile
}
```

基础规则（Routing Rules（路由规则））：

- embedding（向量嵌入） → embedding model（嵌入模型）
- requiresJson（需要 JSON） → json-structured（结构化 JSON 模型）
- evaluation（评估） → evaluation model（评估模型）
- complexity=high（高复杂度） → large-reasoning（大型推理模型）
- latencyPreference=fast（偏好低延迟） → small-chat（小型对话模型）

### 任务 6：Agent Runtime（智能体运行时）接入 ModelRouter

之前：

```typescript
callLLM(prompt)
```

升级：

```typescript
const model = modelRouter.route({
  taskType: agent.taskType,
  complexity,
  requiresJson
})

callLLM({
  model: model.model,
  prompt
})
```

### 任务 7：Tool Runtime（工具运行时）接入 ModelRouter

例如：

- summaryTool（总结工具） → summary model（总结模型）
- queryRewriteTool（查询改写工具） → json-structured model（结构化 JSON 模型）
- evaluationTool（评估工具） → evaluation model（评估模型）

### 任务 8：Usage（用量统计）接入模型信息

`UsageRecord`（用量记录）增加：

```typescript
modelId: string
provider: string
modelName: string
```

以后能看到：

- 哪个模型花钱最多（Cost Attribution（成本归因））
- 哪个模型性价比最好（Cost-Effectiveness（性价比））

### 任务 9：Model Explorer（模型浏览器）

前端新增 Model Explorer（模型浏览器），展示：

- Model（模型）
- Provider（提供方）
- Capabilities（能力）
- Cost（成本）
- Speed（速度）
- Quality（质量）

### 任务 10：模型路由测试（Model Routing Test）

测试：

1. 简单总结 → small model（小模型）
2. 复杂规划 → large reasoning（大推理模型）
3. JSON 输出 → json model（JSON 模型）
4. Evaluation（评估） → evaluation model（评估模型）
5. Embedding（向量嵌入） → embedding model（嵌入模型）

### 第 50 天验收标准

1. 是否定义 ModelProfile（模型档案）
2. 是否实现 ModelRegistry（模型注册表）
3. 是否注册多个模型 profile（模型档案）
4. 是否定义 ModelRoutingInput（模型路由输入）
5. 是否实现 ModelRouter（模型路由器）
6. Agent Runtime（智能体运行时）是否接入 ModelRouter
7. Tool Runtime（工具运行时）是否接入 ModelRouter
8. Usage（用量统计）是否记录 model 信息
9. 是否实现 Model Explorer（模型浏览器）
10. 是否完成模型路由测试

### 第 50 天打卡模板

```text
【第50天打卡】

1. 是否定义 ModelProfile（模型档案）：是 / 否
2. 是否实现 ModelRegistry（模型注册表）：是 / 否

3. 是否注册多个模型 profile（模型档案）：是 / 否
4. 是否定义 ModelRoutingInput（模型路由输入）：是 / 否

5. 是否实现 ModelRouter（模型路由器）：是 / 否
6. Agent Runtime（智能体运行时）是否接入 ModelRouter：是 / 否

7. Tool Runtime（工具运行时）是否接入 ModelRouter：是 / 否
8. Usage（用量统计）是否记录 model 信息：是 / 否

9. 是否实现 Model Explorer（模型浏览器）：是 / 否
10. 是否完成模型路由测试：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

### 第 50 天核心认知

记住一句话：

> Tool Router（工具路由器）选择能力（Capability），
> Model Router（模型路由器）选择算力（Compute）。

完成第 50 天后，你的系统会升级为：

> Advanced Optimization V3（高级优化第 3 版）：Multi-Model Routing Runtime（多模型路由运行时）
