# Day68 学习总结：Production Memory Platform（生产级记忆平台）

## 本文记录范围

本文整理 `ollama-chat-day68` 项目完成后的学习型对话，记录以下内容：

- 我对 Day68 项目整体功能、核心架构和代码组织的提问。
- Day68 运用的工程知识、设计模式和生产化思想。
- Day68 对比 Day67 的改进及其设计原因。
- Production Memory Platform（生产级记忆平台）后续接入 Cache Hit（缓存命中）的可行性与设计方法。
- 已完成状态的第 68 天打卡记录。

本文不记录创建目录、复制业务代码、修改源码、安装依赖、执行命令、修复构建错误等工程操作过程。

---

## 一、读懂 `ollama-chat-day68` 项目

### 我的提问

> 带我来读懂 ollama-chat-day68 这个文件夹中的项目做了什么，运用了什么知识，对比 ollama-chat-day67 有什么改进，为什么这样子做（且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述）。

### 回答整理

### 1. 一句话理解 Day68

`ollama-chat-day68` 在 Day67 Production Prompt Platform（生产级提示词平台）的基础上，把系统中零散的会话记忆、长期记忆和工作空间记录，统一升级成了：

> Production Memory Platform（生产级记忆平台）：决定“记什么、存在哪里、何时取出、冲突时如何处理、什么时候归档或删除”。

可以这样理解两天的主题：

```text
Day67：模型执行任务时，应该使用哪个 Prompt（提示词）？
Day68：系统执行任务时，应该记住什么，又应该取出什么？
```

### 2. Day68 整体做了什么

Day68 没有删除 Day67 的功能，而是完整继承了：

- Chat（对话）。
- Workflow（工作流）。
- Agent（智能体）。
- Tool（工具）。
- Model（模型）。
- Prompt（提示词）。
- RAG（Retrieval-Augmented Generation，检索增强生成）。
- Evaluation（评估）。
- RuntimeContext（运行时上下文）。
- EventBus（事件总线）。
- UnifiedRegistry（统一注册中心）。
- Redis、Queue（队列）、Lock（锁）、Storage（存储）、Config（配置）和 Secrets（密钥）。

然后在这些能力外面增加了一个统一的生产记忆层：

```text
Agent / Chat / Workflow（智能体 / 对话 / 工作流）
                    ↓
ProductionMemoryService（生产记忆统一服务）
          ┌─────────┴─────────┐
          ↓                   ↓
RedisSessionMemoryProvider    PersistentLongTermMemoryProvider
（Redis 会话记忆提供者）       （持久化长期记忆提供者）
          ↓                   ├── MySQL（关系型数据库）
Redis（内存键值数据库）        └── VectorStore（向量存储）
```

生产记忆服务还会接入：

- RuntimeContext（运行时上下文）。
- EventBus（事件总线）。
- UnifiedRegistry（统一注册中心）。
- Memory Governance Explorer（记忆治理浏览器）。
- Production Memory Metrics（生产记忆指标）。

项目主要入口如下：

```text
/                       Day68 主应用
/memories               Memory Governance Explorer（记忆治理浏览器）
/prompts                继承自 Day67 的 Prompt Explorer V2（提示词浏览器第2版）
/api/production-memory  Production Memory API（生产记忆接口）
```

---

## 二、ProductionMemoryItem（生产记忆条目）

以前的记忆可能只是一段正文：

```ts
{
  content: "用户喜欢中文回答"
}
```

Day68 将它升级为一个完整的生产资产：

```ts
type ProductionMemoryItem = {
  id: string;
  scope: ProductionMemoryScope;
  scopeId: string;
  type: ProductionMemoryType;
  content: string;
  importance: number;
  confidence: number;
  source: ProductionMemorySource;
  tags: string[];
  status: MemoryLifecycleStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  lastAccessedAt?: number;
  accessCount: number;
  version: number;
  pinned: boolean;
  consolidatedFrom: string[];
};
```

### 1. Memory Scope（记忆作用域）

支持五种作用域：

| Scope（作用域） | 含义 | 示例 |
| --- | --- | --- |
| `session` | 当前会话记忆 | 当前会话的项目使用 MySQL |
| `user` | 用户长期记忆 | 用户偏好 TypeScript（类型化 JavaScript 语言） |
| `workspace` | 当前任务工作空间 | Research Agent（研究智能体）的研究发现 |
| `agent` | 某个智能体专属经验 | Writer Agent（写作智能体）的写作经验 |
| `global` | 全局共享记忆 | 系统级稳定规则 |

`scopeId` 用来进一步说明记忆属于哪个会话、用户、工作空间或智能体。

这样可以避免：

```text
用户 A 的偏好
被错误地提供给用户 B
```

### 2. ProductionMemoryType（生产记忆类型）

支持：

- `fact`：事实。
- `preference`：偏好。
- `experience`：经验。
- `decision`：决策。
- `lesson`：教训。
- `summary`：摘要。
- `task_state`：任务状态。

分类以后，系统可以判断哪些内容值得长期保存：

```text
decision / lesson（决策 / 教训）
通常值得长期保存

task_state / draft（任务状态 / 草稿）
通常只应该在当前任务中使用
```

### 3. Lifecycle（生命周期）

支持：

- `active`：当前有效。
- `consolidated`：已经整合。
- `archived`：已经归档。
- `deleted`：已经软删除。

这里使用 Soft Delete（软删除）：不是立即从数据库中彻底清除，而是先标记为已经删除，方便审计、排查和恢复。

### 4. Optimistic Concurrency Control（乐观并发控制）

`version` 用于 Optimistic Concurrency Control（乐观并发控制）。

例如两个请求同时读取到版本 3：

```text
请求 A：基于 v3 更新成功 → v4
请求 B：仍然尝试基于 v3 更新 → 被拒绝
```

这样可以防止多个请求并发更新时相互覆盖。

---

## 三、MemoryProvider（记忆提供者）

Day68 定义了统一的 MemoryProvider（记忆提供者）接口：

```ts
interface MemoryProvider {
  add(...)
  get(...)
  update(...)
  search(...)
  archive(...)
  delete(...)
  listByScope(...)
  listAll(...)
}
```

这里运用了 Dependency Inversion（依赖倒置）：

```text
ProductionMemoryService（生产记忆服务）
                    ↓ 依赖接口
MemoryProvider（记忆提供者）
                    ↓
Redis / MySQL / VectorStore（内存数据库 / 关系型数据库 / 向量存储）
```

上层业务不需要知道 Redis 或 MySQL 的具体调用方式。

以后如果需要把 VectorStore（向量存储）替换成 Milvus、Pinecone 或 Weaviate，只需要增加新的 Provider（提供者），不需要重写整个生产记忆服务。

---

## 四、Session Memory（会话记忆）

会话记忆使用三个 Redis Key（Redis 键）：

```text
memory:session:{sessionId}:items
memory:session:{sessionId}:summary
memory:session:{sessionId}:meta
```

它们分别保存：

| Redis Key（Redis 键） | 内容 |
| --- | --- |
| `items` | 当前会话最近使用的记忆条目 |
| `summary` | 当前会话摘要 |
| `meta` | 条目数量、更新时间和 TTL 等元数据 |

Session Memory（会话记忆）具有以下能力：

- TTL（Time To Live，生存时间），默认七天。
- 读取时刷新 TTL（生存时间）。
- 最近记忆数量上限。
- 自动清理过期记忆。
- Redis 不可用时自动 Fallback（降级）到内存实现。
- 不会把全部长期记忆复制到 Session Redis（会话 Redis）中。

为什么使用 Redis（内存键值数据库）？

因为 Session Memory（会话记忆）通常具有以下特点：

```text
访问频率高
生命周期短
需要快速读取
允许自动过期
```

这些特点更适合 Redis，而不是每一轮对话都访问 MySQL。

---

## 五、Long-Term Memory（长期记忆）

长期记忆采用：

```text
MySQL + VectorStore（关系型数据库 + 向量存储）
```

### 1. MySQL 的职责

MySQL 是 Source of Truth（权威数据源），主要保存：

- 原始正文。
- Scope（作用域）。
- Type（类型）。
- Importance（重要性）。
- Confidence（置信度）。
- Status（生命周期状态）。
- Source Trace（来源链路追踪）。
- Version（版本）。
- Access Count（访问次数）。
- 创建、更新、访问和过期时间。

### 2. VectorStore（向量存储）的职责

VectorStore（向量存储）保存：

- Embedding（向量表示）。
- Memory ID（记忆标识）。
- Scope（作用域）。
- Type（类型）。
- Status（状态）。

它主要负责 Semantic Retrieval（语义检索）。

例如用户提出：

```text
帮我写一个工具类。
```

虽然问题中没有直接出现“TypeScript”，但向量检索仍然可能找到：

```text
以后代码优先使用 TypeScript。
```

### 3. 为什么不能只使用 VectorStore（向量存储）

VectorStore（向量存储）适合寻找相似内容，但不适合单独承担：

- Transaction（事务）。
- Lifecycle Management（生命周期管理）。
- Concurrent Version Control（并发版本控制）。
- 完整正文审计。
- 可靠更新与删除。

因此采用：

```text
MySQL：可靠保存和权威状态
VectorStore：语义召回和相似度检索
```

---

## 六、ProductionMemoryService（生产记忆服务）

ProductionMemoryService（生产记忆服务）是 Day68 最重要的模块。

主要方法包括：

```text
write                 写入记忆
retrieve              统一检索
consolidate           记忆整合
archiveWorkspace      工作空间归档
archive               归档
forget                遗忘或软删除
pin                   固定重要记忆
merge                 合并记忆
resolveConflict       人工处理冲突
getContextForRuntime  注入运行时上下文
```

这里运用了 Facade Pattern（外观模式）：

```text
调用方只需要面对 ProductionMemoryService（生产记忆服务）
不需要直接操作 Redis、MySQL、VectorStore 和 EventBus（事件总线）
```

完整写入流程如下：

```text
Memory Draft（记忆草稿）
        ↓
字段校验
        ↓
补齐 ID、版本、时间和访问统计
        ↓
根据 Scope（作用域）选择 Provider（提供者）
        ↓
检查重复记忆
        ↓
检查矛盾记忆
        ↓
合并 / 替代 / 人工审核
        ↓
Redis 或 MySQL + VectorStore
        ↓
发布 Event（事件）
        ↓
更新 Metrics（指标）
```

---

## 七、Memory Deduplication / Conflict Resolution（记忆去重 / 冲突处理）

### 1. 重复记忆

连续写入：

```text
用户偏好中文回答。
用户偏好中文回答。
```

系统不会产生两条活动记忆，而是合并：

- `confidence`（置信度）。
- `importance`（重要性）。
- `accessCount`（访问次数）。
- `tags`（标签）。
- `source`（来源）。
- `consolidatedFrom`（合并来源）。

这叫 Deduplication（去重）。

### 2. 新状态替代旧状态

旧记忆：

```text
用户以前使用 SQLite。
```

新记忆：

```text
用户现在改用 MySQL。
```

系统检测到“现在”“改用”等覆盖标记后：

```text
旧记忆 → archived（已经归档）
新记忆 → active（当前有效）
```

冲突类型为 `superseded`（已经被新版本替代）。

### 3. 无法确定的矛盾

例如：

```text
用户偏好简洁回答。
用户希望提供非常详细的教学步骤。
```

系统不会擅自删除其中任何一条，而是生成：

```text
resolution = manual_review（人工审核）
status = pending（等待处理）
```

这是一个重要的生产设计：模型不应该在不确定时偷偷修改用户事实。

---

## 八、Memory Retrieval Pipeline（记忆检索管线）

检索过程如下：

```text
Session Memory（会话记忆）
        +
Long-Term Memory（长期记忆）
        +
Workspace Memory（工作空间记忆）
        ↓
Unified Scoring（统一评分）
        ↓
Deduplication（正文去重）
        ↓
Sorting（排序）
        ↓
TopK（取得分最高的前 K 条）
```

综合评分公式：

```text
finalScore =
  semanticScore   × 0.45 +
  importanceScore × 0.20 +
  recencyScore    × 0.15 +
  confidenceScore × 0.10 +
  accessScore     × 0.10
```

各评分含义：

| 分数 | 中文含义 |
| --- | --- |
| `semanticScore` | 当前问题与记忆正文的语义相关度 |
| `importanceScore` | 记忆自身的重要程度 |
| `recencyScore` | 记忆是否足够新 |
| `confidenceScore` | 对记忆真实性和稳定性的信心 |
| `accessScore` | 过去是否经常被访问和使用 |

为什么不能只看 Semantic Similarity（语义相似度）？

因为一条记忆可能文字很相似，但已经过时；另一条虽然表达方式不同，却可能是用户明确确认过的重要偏好。

生产级检索需要综合判断：

```text
相关不相关
重不重要
新不新
可不可信
过去有没有价值
```

---

## 九、Workspace Memory Archive（工作空间记忆归档）

Workspace（工作空间）中通常包含很多中间内容：

```text
草稿
研究发现
失败尝试
模型猜测
最终决策
稳定教训
```

Day68 不会把它们全部写入长期记忆，而是只选择：

- `fact`：重要事实。
- `preference`：明确偏好。
- `experience`：可复用经验。
- `decision`：最终决策。
- `lesson`：稳定教训。

同时过滤：

- `draft`：草稿。
- `temporary`：临时内容。
- `log`：日志。
- `guess`：模型猜测。
- 低重要性的任务状态。

这样可以避免 Memory Pollution（记忆污染）。

生产记忆的目标不是“记得越多越好”，而是：

> 在正确的作用域中保存正确的信息，并在正确的时候取出来。

---

## 十、RuntimeContext / EventBus / UnifiedRegistry 集成

### 1. RuntimeContext（运行时上下文）

`getContextForRuntime()` 会生成：

```ts
{
  sessionMemories,
  longTermMemories,
  workspaceMemories,
  retrievedMemoryIds,
  retrievalStrategy
}
```

然后写入：

```ts
runtimeContext.memoryContext
```

这样 Agent（智能体）、Prompt（提示词）、Model（模型）和 Evaluation（评估）可以使用同一份记忆上下文，减少 Context Drift（上下文漂移）。

### 2. EventBus（事件总线）

Day68 使用以下事件记录生产记忆生命周期：

- `memory.read`：读取记忆。
- `memory.write`：写入记忆。
- `memory.consolidated`：完成记忆整合。
- `memory.conflict_detected`：检测到记忆冲突。
- `memory.archived`：归档记忆。
- `memory.deleted`：删除记忆。

这些事件可以提供 Traceability（可追溯性）和 Audit（审计）能力。

### 3. UnifiedRegistry（统一注册中心）

Day68 注册了四项生产记忆能力：

```text
RedisSessionMemoryProvider（Redis 会话记忆提供者）
PersistentLongTermMemoryProvider（持久化长期记忆提供者）
ProductionMemoryService（生产记忆服务）
MemoryConsolidationStrategy（记忆合并策略）
```

以后系统可以通过 Capability Discovery（能力发现）找到记忆能力，而不是在业务代码中写死具体实现。

---

## 十一、Memory Governance Explorer（记忆治理浏览器）

访问地址：

```text
http://localhost:3000/memories
```

页面包含五个标签页：

1. 治理概览。
2. 记忆资产。
3. 统一检索。
4. 冲突审核。
5. 事件审计。

页面支持：

- 按 Scope（作用域）筛选。
- 按 Type（类型）筛选。
- 查看 Importance（重要性）。
- 查看 Confidence（置信度）。
- 查看 Source Trace（来源链路追踪）。
- 查看 Version（版本）。
- 查看 TTL（生存时间）与过期时间。
- Archive（归档）。
- Forget（遗忘或软删除）。
- Pin（固定重要记忆）。
- Merge（合并记忆）。
- 人工处理冲突。
- 查看统一检索评分。
- 查看 Provider Health（提供者健康状态）。
- 查看 Lifecycle Event（生命周期事件）。

---

## 十二、Day68 运用了哪些工程知识

### 1. Domain Modeling（领域建模）

把记忆从普通字符串升级成具有归属、类型、状态、来源、版本和生命周期的领域对象。

### 2. Facade Pattern（外观模式）

调用方只操作 ProductionMemoryService（生产记忆服务），不直接面对多个存储系统。

### 3. Strategy Pattern（策略模式）

不同 Scope（作用域）可以使用不同 Provider（提供者）和治理策略。

### 4. Dependency Inversion（依赖倒置）

业务层依赖 MemoryProvider（记忆提供者）接口，而不是依赖 Redis 或 MySQL 的具体实现。

### 5. Separation of Concerns（职责分离）

```text
Redis：会话状态
MySQL：可靠数据和权威状态
VectorStore：语义检索
ProductionMemoryService：业务编排
EventBus：事件通知
Memory Governance Explorer：管理和观察
```

### 6. Event-Driven Architecture（事件驱动架构）

记忆变化通过事件通知审计和观察模块，而不是让不同模块互相直接调用。

### 7. Observability（可观察性）

记录：

- 检索次数。
- 检索命中率。
- 平均检索耗时。
- 去重次数。
- 冲突次数。
- 归档次数。
- 删除次数。
- Provider Error（提供者错误）次数。
- 真正用于回答的记忆数量。

### 8. Graceful Degradation（优雅降级）

Redis 或 MySQL 不可用时，可以切换到 `memory-fallback`（内存降级存储），保证本地开发和教学演示仍然能够运行。

### 9. Dependency Injection（依赖注入）

测试时可以注入：

- In-Memory Redis Backend（内存版 Redis 后端）。
- In-Memory MySQL Metadata Store（内存版 MySQL 元数据存储替代实现）。
- 可控制的时间函数。
- 独立 EventBus（事件总线）。

因此 TTL（生存时间）、过期、冲突和指标测试不依赖真实基础设施。

---

## 十三、Day68 对比 Day67 的改进

| 对比维度 | Day67 | Day68 |
| --- | --- | --- |
| 核心主题 | Prompt Governance（提示词治理） | Memory Governance（记忆治理） |
| 核心资产 | `ProductionPrompt`（生产提示词） | `ProductionMemoryItem`（生产记忆条目） |
| 核心服务 | `PromptRuntimeService`（提示词运行服务） | `ProductionMemoryService`（生产记忆服务） |
| 存储重点 | 提示词注册表和版本 | Redis + MySQL + VectorStore |
| 生命周期 | testing、approved、active、deprecated | active、consolidated、archived、deleted |
| 质量控制 | A/B Testing（A/B 测试）、Quality Gate（质量门禁） | 统一评分、去重和冲突审核 |
| 回滚或替代 | Prompt Version Rollback（提示词版本回滚） | 旧记忆归档、新记忆替代 |
| 主要页面 | Prompt Explorer V2（提示词浏览器第2版） | Memory Governance Explorer（记忆治理浏览器） |
| 主要问题 | 模型应该使用哪个提示词 | 系统应该记住什么 |
| 数据治理 | 提示词版本、实验和晋级 | Scope、TTL、冲突、归档和遗忘 |
| 可观察性 | Prompt Score、Usage、Audit | Hit Rate、Conflict、Dedup、Archive、Provider Error |

最大的变化可以概括为：

```text
Day67 管理“模型收到的指令”
Day68 管理“系统积累的历史”
```

二者结合后，一次 Agent（智能体）执行可以形成：

```text
用户任务
  ↓
ProductionMemoryService 检索历史
  ↓
RuntimeContext 注入记忆
  ↓
PromptRuntimeService 选择并渲染提示词
  ↓
Model 执行
  ↓
Evaluation 评估
  ↓
高价值结果重新写入记忆
```

---

## 十四、为什么要这样设计

### 原因 1：不同记忆的生命周期完全不同

会话记忆可能七天后过期，但用户偏好可能需要长期保留。

如果全部存进同一个数组，就无法合理处理：

- TTL（生存时间）。
- Archive（归档）。
- 用户隔离。
- 工作空间隔离。
- Long-Term Semantic Retrieval（长期语义检索）。

### 原因 2：长期记忆不能只增不减

如果系统只会写入，不会去重、归档和删除，最终会出现：

```text
重复记忆
过时记忆
矛盾记忆
低价值草稿
模型错误猜测
```

因此生产记忆必须增加 Governance（治理）。

### 原因 3：模型不能擅自决定用户事实

对于明确的新状态，可以自动替代旧状态。

对于不确定冲突，必须进入 Manual Review（人工审核），这样更加安全且可解释。

### 原因 4：生产系统必须允许替换基础设施

通过 MemoryProvider（记忆提供者）接口，可以让 Redis、MySQL、VectorStore 与业务层解耦。

### 原因 5：必须能够回答“这次为什么使用了这条记忆”

`retrievedMemoryIds`、Source Trace（来源链路追踪）、EventBus（事件总线）和评分分量共同提供 Traceability（可追溯性）。

---

## 十五、当前实现的限制

Day68 是一个完成度较高的教学型 Production Memory Platform V1（生产记忆平台第1版），但还不是最终生产实现。

当前限制包括：

1. VectorStore（向量存储）目前是进程内本地实现，服务重启后需要从 MySQL 惰性恢复索引。
2. Conflict Detection（冲突检测）主要依靠规则和相反词对，还没有接入 NLI（Natural Language Inference，自然语言推理）模型。
3. 冲突记录、事件历史和部分 Metrics（指标）主要保存在当前进程内，服务重启后会重置。
4. Redis、MySQL 未配置时会进入 Memory Fallback（内存降级）模式，降级数据不能跨进程持久化。
5. 新生产记忆平台已经接入独立 API（应用程序接口）、治理页面和 RuntimeContext（运行时上下文）注入方法，但历史 Chat、Agent 和 Workflow 模块还没有全部强制迁移为只调用 ProductionMemoryService。
6. 当前还缺少完整的用户权限、租户隔离、数据加密和数据保留策略。
7. `usedMemoryCount` 需要调用方主动执行 `markUsed()`，还不能自动判断最终回答实际使用了哪些记忆。

Day68 最重要的认知是：

> 记忆不是一段随便保存的文本，而是一种有归属、有来源、有状态、有版本，可以检索、可以冲突、可以归档、可以删除的生产资产。

---

## 十六、Production Memory Platform（生产级记忆平台）能否增加缓存命中

### 我的提问

> 这个生产记忆平台是不是以后还可以弄缓存命中呢？

### 回答整理

可以，而且非常适合。

项目中已经保留了 Day48 Semantic Cache（语义缓存）能力，后续可以把它接入 Production Memory Platform（生产级记忆平台）的检索链路。

但首先需要区分：

```text
Memory（记忆）：系统长期保存了什么
Cache（缓存）：为了减少重复计算，临时保存上一次计算结果
```

例如用户连续提问：

```text
我使用什么数据库？
我的数据库是什么？
当前项目用的哪种数据库？
```

这三句话可能都需要检索同一条记忆：

```text
我当前项目使用 MySQL。
```

可以把第一次 Memory Retrieval（记忆检索）的结果缓存起来，后续相似问题直接 Cache Hit（缓存命中）。

推荐流程：

```text
用户问题
   ↓
生成 Cache Key（缓存键）
   ↓
查询 Semantic Cache（语义缓存）
   ├── 命中 → 直接返回记忆检索结果
   └── 未命中
          ↓
       Redis Session Memory（Redis 会话记忆）
          +
       MySQL + VectorStore（关系型数据库 + 向量存储）
          ↓
       统一评分、去重、排序
          ↓
       写入缓存
```

### 1. Memory Retrieval Cache（记忆检索结果缓存）

可以缓存一次完整的检索结果：

```ts
{
  query: "我现在数据库用的是什么？",
  memoryIds: ["memory-001"],
  scores: [0.92],
  expiresAt: 123456789
}
```

Cache Key（缓存键）必须包含作用域信息：

```text
memory:retrieval-cache:
  userId:
  sessionId:
  workspaceId:
  agentId:
  normalizedQuery:
  types:
```

不能只使用问题文本，否则可能把用户 A 的记忆缓存错误地返回给用户 B。

### 2. Embedding Cache（向量缓存）

同一段记忆正文不必重复计算 Embedding（向量表示）：

```text
contentHash（正文哈希） → embedding（向量表示）
```

例如：

```text
embedding-cache:{contentHash}
```

这样可以降低重复生成向量的成本。

### 3. Hot Memory Cache（热点记忆缓存）

对于经常访问的长期记忆，可以按照记忆 ID 缓存：

```text
memory:item:{memoryId}
```

此时各存储职责为：

```text
Redis：热点记忆副本
MySQL：权威数据源
VectorStore：语义检索索引
```

### 4. Runtime Memory Context Cache（运行时记忆上下文缓存）

对于短时间内重复执行的相同任务，可以缓存最终注入 RuntimeContext（运行时上下文）的记忆集合：

```text
query + scope + strategy → memoryContext
```

但这一层 TTL（生存时间）应该比较短，避免使用已经过时的记忆。

### 5. Cache Invalidation（缓存失效）

缓存实现中最重要的不是“如何写入缓存”，而是“什么时候让缓存失效”。

记忆发生以下变化时，相关缓存必须失效：

- `memory.write`：写入记忆。
- `memory.consolidated`：整合记忆。
- `memory.archived`：归档记忆。
- `memory.deleted`：删除记忆。
- `memory.conflict_detected`：检测到冲突。
- `memory.updated`：更新记忆。

可以让 EventBus（事件总线）监听这些事件：

```text
Memory Event（记忆事件）
        ↓
Cache Invalidation Subscriber（缓存失效订阅者）
        ↓
删除对应 Scope（作用域）的缓存
```

这里适合使用 Cache-Aside Pattern（旁路缓存模式）：

```text
先查询缓存
缓存未命中再查询正式存储
查询完成后写入缓存
记忆发生变化时主动删除缓存
```

### 6. 缓存相关指标

后续可以增加：

```ts
{
  memoryCacheHits: number;
  memoryCacheMisses: number;
  memoryCacheHitRate: number;
  embeddingCacheHitRate: number;
  cacheInvalidationCount: number;
  cacheSavedRetrievalDurationMs: number;
  cacheSavedVectorQueries: number;
}
```

因此后续可以升级为：

```text
Production Memory Platform V2（生产记忆平台第2版）
    +
Memory Retrieval Cache（记忆检索缓存）
    +
Embedding Cache（向量缓存）
    +
Event-Driven Cache Invalidation（事件驱动缓存失效）
```

核心原则是：

> 缓存可以提高记忆检索速度，但 MySQL 和正式 MemoryProvider（记忆提供者）仍然必须是权威数据源，缓存不能成为唯一的记忆来源。

---

## 十七、第 68 天打卡

【第68天打卡】

1. 是否定义 ProductionMemoryItem（生产记忆条目）和 Memory Scope（记忆作用域）：是

已定义 `session`、`user`、`workspace`、`agent`、`global` 五种作用域，并定义事实、偏好、经验、决策、教训、摘要和任务状态等记忆类型。

2. 是否定义并实现 MemoryProvider（记忆提供者）：是

已定义统一 MemoryProvider（记忆提供者）接口，并实现 RedisSessionMemoryProvider（Redis 会话记忆提供者）与 PersistentLongTermMemoryProvider（持久化长期记忆提供者）。

3. 是否实现 ProductionMemoryService（生产记忆服务）：是

已实现写入、检索、整合、归档、遗忘、固定、合并、冲突处理、工作空间归档和运行时上下文注入。

4. Session Memory（会话记忆）是否迁移到 Redis（内存键值数据库）：是

已实现 `items`、`summary`、`meta` 三键模型、TTL（生存时间）、读取续期、最近条数上限和 Redis 故障降级。未启动真实 Redis 时使用 Memory Fallback（内存降级）模式。

5. Long-Term Memory（长期记忆）是否接入 MySQL + VectorStore（关系型数据库 + 向量存储）：是

已使用 MySQL 保存正文、作用域、生命周期和审计元数据，并使用 VectorStore（向量存储）保存 Embedding（向量表示）和语义检索索引。未配置真实 MySQL 时使用内存元数据存储降级模式。

6. 是否实现统一 Memory Retrieval Pipeline（记忆检索管线）：是

已实现 Session Memory（会话记忆）、Long-Term Memory（长期记忆）和 Workspace Memory（工作空间记忆）三路召回，并执行统一评分、去重、排序和 TopK（取得分最高的前 K 条）截断。

7. 是否实现 Memory Deduplication / Conflict Resolution（记忆去重 / 冲突处理）：是

已实现重复自动合并、新状态替代旧状态、矛盾记忆进入 Manual Review（人工审核）以及治理页面人工处理。

8. 是否实现 Workspace Memory Archive（工作空间记忆归档）：是

已实现高价值事实、偏好、经验、决策和教训沉淀，并过滤草稿、临时内容、日志、猜测和低价值任务状态。

9. Memory（记忆）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是

已实现结构化 `memoryContext` 注入，发布读取、写入、整合、冲突、归档和删除事件，并注册两类 Provider、统一服务和合并策略。

10. 是否实现 Memory Governance Explorer（记忆治理浏览器）：是

已实现治理概览、记忆资产、统一检索、冲突审核和事件审计五个标签页，并支持 Archive（归档）、Forget（遗忘）、Pin（固定）、Merge（合并）和冲突人工确认。

11. 是否增加 Production Memory Metrics（生产记忆指标）：是

已增加记忆总数、三类记忆数量、检索次数、命中率、平均检索时间、去重数、冲突数、整合数、归档数、删除数、过期数、Provider Error（提供者错误）数和实际使用记忆数。

12. 是否完成 Production Memory End-to-End Test（生产记忆端到端测试）：是

已完成同会话记忆、跨会话长期记忆、工作空间归档、重复记忆、自动替代、矛盾人工审核、TTL、软删除、RuntimeContext、EventBus、UnifiedRegistry 和 Metrics 等端到端测试，并通过 TypeScript 类型检查、ESLint 代码检查和 Next.js Production Build（生产构建）。

13. 遇到的最大问题：

最大的难点不是简单地把正文保存进 Redis 或 MySQL，而是如何在 Redis Session Memory（Redis 会话记忆）、MySQL 权威记录和 VectorStore（向量存储）语义索引之间维持一致的 Scope（作用域）、Lifecycle（生命周期）和检索结果，同时避免重复、过时、冲突和低价值内容污染 RuntimeContext（运行时上下文）。

当前通过以下方式处理：

- 使用 MemoryProvider（记忆提供者）隔离具体基础设施。
- 使用 ProductionMemoryService（生产记忆服务）统一编排写入和检索。
- 使用 MySQL 作为 Source of Truth（权威数据源）。
- 使用 VectorStore（向量存储）负责语义召回。
- 使用 Redis 保存短期高频会话记忆。
- 使用 EventBus（事件总线）记录生命周期变化。
- 使用 Version（版本）实现乐观并发控制。
- 使用 Memory Fallback（内存降级）保证本地开发环境可运行。

14. 当前系统能力：

当前系统已经形成 Production Memory Platform V1（生产记忆平台第1版），并完整保留 Day67 Production Prompt Platform（生产级提示词平台）及此前的 Chat、Workflow、Agent、Tool、Model、RAG、Evaluation、RuntimeContext、EventBus、UnifiedRegistry 和基础设施能力。

当前可以：

- 按 Session、User、Workspace、Agent 和 Global 管理记忆作用域。
- 使用 Redis 保存带 TTL 的会话记忆和会话摘要。
- 使用 MySQL + VectorStore 保存并检索长期记忆。
- 统一检索会话、长期和工作空间记忆。
- 使用语义、重要性、时效性、置信度和访问价值进行综合评分。
- 自动合并重复记忆。
- 自动归档被新状态替代的旧记忆。
- 将不确定冲突交给人工审核。
- 只把工作空间中的高价值结果沉淀到长期记忆。
- 将检索结果注入 RuntimeContext（运行时上下文）。
- 通过 EventBus（事件总线）追踪记忆生命周期。
- 通过 UnifiedRegistry（统一注册中心）发现和替换记忆能力。
- 通过 Memory Governance Explorer（记忆治理浏览器）查看和治理生产记忆。
- 通过 Production Memory Metrics（生产记忆指标）观察检索、去重、冲突、归档、删除和 Provider 健康状态。
- 通过 End-to-End Test（端到端测试）验证完整链路。

后续可以继续升级 Memory Retrieval Cache（记忆检索缓存）、Embedding Cache（向量缓存）、Hot Memory Cache（热点记忆缓存）和 Event-Driven Cache Invalidation（事件驱动缓存失效），形成 Production Memory Platform V2（生产记忆平台第2版）。

---

## 十八、Day68 核心认知

Day68 最重要的一句话是：

> 生产级 Memory（记忆）的核心不是“记得越多越好”，而是“在正确的 Scope（作用域）中保存正确的信息，并在正确的时候取出来”。

Day67 和 Day68 共同完成了两类核心生产资产的治理：

```text
Day67：治理 Prompt（提示词），决定模型如何执行
Day68：治理 Memory（记忆），决定系统如何积累历史
```

完成 Day68 后，当前系统已经从“拥有长期记忆功能”升级为“拥有可持久化、可检索、可治理、可追踪、可测试的生产记忆平台”。

---

## 十九、Day68 补充总结

第 68 天完成的是：

```text
Production Upgrade V5（生产化升级第5版）
Production Memory Platform V1（生产级记忆平台第1版）
```

这一天把此前分散的记忆能力：

- Conversation Memory（对话记忆）。
- Summary Memory（摘要记忆）。
- Long-Term Memory（长期记忆）。
- Experience Memory（经验记忆）。
- Workspace Memory（工作空间记忆）。

统一升级为：

```text
ProductionMemoryService（生产记忆服务）
```

并完成了生产级记忆系统最重要的四件事：

| 核心问题 | 中文解释 | 需要回答的问题 |
| --- | --- | --- |
| Scope（作用域） | 记忆的归属范围 | 这是谁的记忆？ |
| Lifecycle（生命周期） | 记忆从创建到归档、删除的过程 | 这条记忆应该保存多久？ |
| Retrieval（检索） | 从记忆存储中取出相关信息 | 应该在什么时候取出哪些记忆？ |
| Governance（治理） | 管理错误、重复、冲突和过时记忆 | 重复、冲突和错误记忆应该怎么办？ |

当前生产记忆链路已经形成：

```text
用户请求
    ↓
RuntimeContext（运行时上下文）
    ↓
Session / User / Workspace Scope（会话 / 用户 / 工作空间作用域）
    ↓
Redis + MySQL + VectorStore（内存键值数据库 + 关系型数据库 + 向量存储）
    ↓
统一检索、去重和排序
    ↓
Prompt Injection（提示词上下文注入）
    ↓
Agent（智能体）使用记忆
    ↓
Workspace Archive（工作空间归档）
    ↓
长期经验沉淀
```

Day68 不仅实现了“保存数据”，还实现了：

- Redis Failure Fallback（Redis 故障降级）。
- MySQL Memory Fallback（MySQL 未配置时的内存降级）。
- Soft Delete（软删除）。
- Manual Conflict Review（人工冲突审核）。
- Workspace High-Value Archive（工作空间高价值归档）。
- Actual Memory Usage Metrics（记忆实际使用指标）。

因此，Day68 已经不是简单的 Memory Feature（记忆功能），而是一个：

```text
Memory Governance System（记忆治理系统）
```

---

# Day69 学习计划：Production Knowledge & RAG Platform（生产知识与检索增强生成平台）

## 二十、Day69 主题与核心目标

Day69 的主题是：

```text
Production Upgrade V6（生产化升级第6版）
Production Knowledge & RAG Platform V1（生产知识与检索增强生成平台第1版）
```

今日核心目标是：

> 把现有 RAG（Retrieval-Augmented Generation，检索增强生成）从“能够导入、能够检索”，升级成可管理、可追踪、可隔离、可增量更新的生产级知识平台。

Day24～Day30 已经完成：

- Document Chunking（文档切块）。
- Embedding（向量表示生成）。
- Vector Search（向量检索）。
- Hybrid Search（混合检索）。
- Rerank（重排序）。
- Query Rewrite（查询改写）。
- Incremental Indexing（增量索引）。
- VectorStore（向量存储）。
- Knowledge Explorer（知识浏览器）。

这些能力主要解决：

```text
怎样检索知识？
```

Day69 需要进一步解决：

```text
知识属于谁？
谁可以检索？
索引是什么版本？
文档更新后如何同步？
文档删除后如何保证不残留？
回答使用了哪些来源？
索引失败后如何恢复？
```

---

## 二十一、为什么现有 RAG（检索增强生成）还不是生产版

当前系统虽然已经拥有完整的 Retrieval Pipeline（检索管线），但仍可能存在：

- 所有知识库默认全局可见。
- Document（文档）、Chunk（文本片段）和 Vector（向量记录）之间缺少统一生命周期。
- 索引过程仍可能在请求链路中同步执行。
- 文档更新后旧向量可能残留。
- 删除文档时可能只删除元数据，没有删除对象、片段和向量。
- Citation（引用来源）结构不够标准。
- 不同用户或 Workspace（工作空间）之间缺少权限隔离。

生产版必须形成完整生命周期：

```text
上传原始文件
    ↓
创建知识文档
    ↓
进入 Indexing Job（索引任务）
    ↓
解析与切块
    ↓
生成 Embedding（向量表示）
    ↓
写入 VectorStore（向量存储）
    ↓
发布 Index Version（索引版本）
    ↓
检索与 Citation（引用）
    ↓
更新 / 重建 / 删除
    ↓
Consistency Check（一致性检查）
```

---

## 二十二、Day69 最终架构

建议形成以下架构：

```text
                    ProductionKnowledgeService
                         （生产知识服务）
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
 Object Storage          Metadata Store          VectorStore
 （对象存储）              （元数据存储）           （向量存储）
 原始文档 / 附件             MySQL                 向量索引
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                    Indexing Pipeline（索引管线）
                               │
                 Retrieval Pipeline V2（检索管线第2版）
                               │
           Citation + Permission + Version（引用 + 权限 + 版本）
                               │
              RuntimeContext.retrieval（运行时检索上下文）
```

---

## 二十三、Day69 任务清单

### 任务 1：定义 ProductionKnowledgeBase（生产知识库）

先把“知识库”从普通文档集合升级成正式平台资源：

```ts
type KnowledgeScope =
  | "user"
  | "workspace"
  | "team"
  | "global";

type KnowledgeBaseStatus =
  | "active"
  | "disabled"
  | "archived"
  | "deleting";

type ProductionKnowledgeBase = {
  id: string;
  name: string;
  description?: string;
  scope: KnowledgeScope;
  scopeId: string;
  status: KnowledgeBaseStatus;
  embeddingModelId: string;
  chunkStrategyId: string;
  retrievalStrategyId: string;
  activeIndexVersion?: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
};
```

这一结构解决的问题是：检索时不再“搜索全部 Chunks（文本片段）”，而是“搜索当前用户有权限访问的 Knowledge Base（知识库）”。

知识库可以包括：

- 用户私人知识库。
- 某个 Workspace（工作空间）的临时知识库。
- Team Shared Knowledge Base（团队共享知识库）。
- Global Public Knowledge Base（全局公共知识库）。

### 任务 2：升级 ProductionKnowledgeDocument（生产知识文档）生命周期

定义生产文档结构：

```ts
type KnowledgeDocumentStatus =
  | "uploaded"
  | "queued"
  | "indexing"
  | "ready"
  | "failed"
  | "updating"
  | "deleting"
  | "deleted";

type ProductionKnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  mimeType: string;
  storage: StorageObjectMetadata;
  status: KnowledgeDocumentStatus;
  contentHash: string;
  version: number;
  activeIndexVersion?: number;
  error?: {
    code: string;
    message: string;
  };
  createdAt: number;
  updatedAt: number;
  indexedAt?: number;
  deletedAt?: number;
};
```

文档状态必须真实反映索引进度，不能出现：

```text
文件上传成功
但前端错误地认为文档已经可以检索
```

### 任务 3：定义 IndexManifest / IndexVersion（索引清单 / 索引版本）

新增索引清单：

```ts
type IndexVersionStatus =
  | "building"
  | "ready"
  | "failed"
  | "superseded";

type IndexManifest = {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  version: number;
  status: IndexVersionStatus;
  contentHash: string;
  embeddingModelId: string;
  embeddingDimension: number;
  chunkStrategyId: string;
  chunkCount: number;
  createdChunkIds: string[];
  reusedChunkIds: string[];
  deletedChunkIds: string[];
  startedAt: number;
  completedAt?: number;
  error?: string;
};
```

为什么需要 Index Version（索引版本）？

当系统更换以下配置时，旧索引与新索引不能混用：

- Chunk Size（文本片段大小）。
- Embedding Model（向量模型）。
- Metadata Schema（元数据结构）。

生产环境应该支持：

```text
Index V1：当前线上活动版本
Index V2：后台构建中
V2 完成后原子切换为 Active（活动版本）
V1 之后再异步清理
```

这样可以避免重建索引期间知识库不可用。

### 任务 4：实现 ProductionKnowledgeService（生产知识服务）

新增统一服务：

```ts
class ProductionKnowledgeService {
  createKnowledgeBase(...)
  uploadDocument(...)
  enqueueIndexing(...)
  getDocument(...)
  listDocuments(...)
  rebuildDocument(...)
  publishIndexVersion(...)
  deleteDocument(...)
  deleteKnowledgeBase(...)
  retrieve(...)
}
```

业务层以后不应该直接调用：

- KnowledgeStore（知识存储）。
- VectorStore（向量存储）。
- ObjectStorageClient（对象存储客户端）。
- QueueStore（队列存储）。

而应该统一通过 ProductionKnowledgeService（生产知识服务）协调：

- Object Storage（对象存储）。
- MySQL（关系型数据库）。
- Queue（队列）。
- VectorStore（向量存储）。
- EventBus（事件总线）。
- RuntimeContext（运行时上下文）。
- Trace（链路追踪）。

### 任务 5：把索引改成 Asynchronous Job（异步任务）

上传文件后，不要在请求中同步切块和生成 Embedding（向量表示），而应该：

```text
Upload API（上传接口）
    ↓
Object Storage（对象存储）
    ↓
Document Status = queued（文档状态为等待索引）
    ↓
创建 knowledge.index Job（知识索引任务）
    ↓
Redis Queue（Redis 队列）
    ↓
Indexer Worker（索引工作进程）
```

索引任务载荷：

```ts
type KnowledgeIndexJobPayload = {
  knowledgeBaseId: string;
  documentId: string;
  targetVersion: number;
  forceRebuild?: boolean;
  embeddingModelId: string;
  chunkStrategyId: string;
};
```

Indexer Worker（索引工作进程）流程：

```text
获取文档级 Distributed Lock（分布式锁）
    ↓
下载原始文件
    ↓
解析文本
    ↓
Chunk（切块）
    ↓
计算 Hash（哈希值）
    ↓
复用 Embedding Cache（向量缓存）
    ↓
写入 VectorStore（向量存储）
    ↓
保存 IndexManifest（索引清单）
    ↓
发布 Active Version（活动索引版本）
    ↓
Document Status = ready（文档状态为可检索）
```

### 任务 6：实现索引 Idempotency（幂等性）与 Consistency（一致性）

同一个文档的同一个版本，即使重复收到 Job（任务），也不能重复生成两套索引。

建议使用幂等键：

```text
knowledge:index:{documentId}:{version}
```

执行前检查：

```ts
const existing = await getIndexManifest(documentId, version);

if (existing?.status === "ready") {
  return existing;
}
```

同时使用 Distributed Lock（分布式锁）：

```text
lock:knowledge:index:{documentId}
```

### 任务 7：实现安全更新与 Two-Phase Delete（两阶段删除）

#### 文档更新

不要直接覆盖旧版本：

```text
上传新文件
    ↓
document.version + 1
    ↓
构建 Index V2（索引第2版）
    ↓
V2 ready（索引第2版就绪）
    ↓
activeIndexVersion 切换到 V2
    ↓
V1 标记 superseded（已被替代）
    ↓
异步清理 V1 向量
```

#### 文档删除

不能只删除 MySQL 文档记录，删除过程必须覆盖：

- Document Metadata（文档元数据）。
- Chunks（文本片段）。
- Vector Records（向量记录）。
- Embedding Cache Reference（向量缓存引用）。
- Object Storage Object（对象存储文件）。
- Index Manifest（索引清单）。
- Citation Reference（引用关系）。

建议使用两阶段删除：

```text
status = deleting（标记删除中）
    ↓
创建 knowledge.delete Job（知识删除任务）
    ↓
清理全部资源
    ↓
status = deleted（标记已删除）
```

清理失败时可以 Retry（重试）。

### 任务 8：实现 Knowledge Permission Filter（知识权限过滤）

新增访问上下文：

```ts
type KnowledgeAccessContext = {
  userId?: string;
  workspaceId?: string;
  teamIds?: string[];
  isAdmin?: boolean;
};
```

检索前先计算用户可以访问的知识库：

```text
resolveAccessibleKnowledgeBases(accessContext)
```

然后执行 VectorStore Metadata Filter（向量存储元数据过滤）：

```ts
{
  knowledgeBaseId: {
    $in: accessibleKnowledgeBaseIds
  },
  indexVersion: activeVersion,
  status: "active"
}
```

必须避免：

```text
用户 A 检索到用户 B 的私人文档
```

### 任务 9：升级 Production Retrieval Pipeline V2（生产检索管线第2版）

新增生产检索输入：

```ts
type ProductionRetrievalInput = {
  query: string;
  runtimeContext: RuntimeContextV2;
  knowledgeBaseIds?: string[];
  strategy?: "fast" | "balanced" | "quality";
  topK?: number;
  recallK?: number;
  minScore?: number;
  requireCitations?: boolean;
  allowGlobalKnowledge?: boolean;
};
```

完整流程：

```text
Query（查询）
    ↓
读取 RuntimeDecision（运行时决策）
    ↓
解析 Accessible Knowledge Bases（可访问知识库）
    ↓
Memory-Aware Query Rewrite（记忆感知查询改写）
    ↓
Multi-Query Recall（多查询召回）
    ↓
Vector + Keyword Hybrid Search（向量 + 关键词混合检索）
    ↓
Active Index Version Filter（活动索引版本过滤）
    ↓
Rerank（重排序）
    ↓
Deduplicate（去重）
    ↓
Citation Build（引用构建）
    ↓
RuntimeContext.retrieval 注入
```

### 任务 10：实现标准 KnowledgeCitation（知识引用）

新增：

```ts
type KnowledgeCitation = {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  indexVersion: number;
  quote?: string;
  score: number;
  location?: {
    page?: number;
    section?: string;
    startOffset?: number;
    endOffset?: number;
  };
  storageObjectKey?: string;
};
```

最终回答不能只返回：

```text
Chunk 1、Chunk 2
```

而应该返回稳定来源：

- 文档名称。
- Section（章节）或 Page（页码）。
- 片段位置。
- Index Version（索引版本）。

Trace（链路追踪）中保存 Citation ID（引用标识），不一定把大段全文复制进 Trace。

### 任务 11：接入 RuntimeContext / EventBus / UnifiedRegistry

#### RuntimeContext（运行时上下文）

```ts
runtimeContext.retrievalContext = {
  query,
  rewrittenQueries,
  knowledgeBaseIds,
  strategy,
  retrievedChunkIds,
  citations,
  indexVersions,
  durationMs
};
```

#### EventBus（事件总线）

至少发布：

```text
knowledge.document_uploaded       知识文档已上传
knowledge.index_queued            知识索引已进入队列
knowledge.index_started           知识索引已开始
knowledge.index_completed         知识索引已完成
knowledge.index_failed            知识索引失败
knowledge.index_published         知识索引已发布
knowledge.document_updated        知识文档已更新
knowledge.document_deleting       知识文档删除中
knowledge.document_deleted        知识文档已删除
retrieval.started                 检索已开始
retrieval.completed               检索已完成
retrieval.no_result               检索无结果
retrieval.permission_denied       检索权限被拒绝
```

#### UnifiedRegistry（统一注册中心）

注册：

- ProductionKnowledgeService（生产知识服务）。
- ChunkStrategy（切块策略）。
- RetrievalStrategy（检索策略）。
- EmbeddingProvider（向量生成提供者）。
- DocumentParser（文档解析器）。
- CitationFormatter（引用格式化器）。

以后新增 PDF Parser（PDF 解析器）或其他 VectorStore（向量存储）时，只注册新能力，不修改核心代码。

### 任务 12：实现 Knowledge Governance Explorer V2（知识治理浏览器第2版）

前端建议至少包含五个标签页。

#### 1. Knowledge Bases（知识库）

展示：

- 名称。
- Scope（作用域）。
- Scope ID（作用域标识）。
- 状态。
- 文档数量。
- Active Index Version（活动索引版本）。
- Embedding Model（向量模型）。

#### 2. Documents（文档）

展示：

- Document（文档）。
- Status（状态）。
- Version（版本）。
- Index Version（索引版本）。
- Chunk Count（片段数量）。
- Storage Object（存储对象）。
- Error（错误信息）。

#### 3. Index Jobs（索引任务）

展示和支持：

- Queued（等待中）。
- Indexing（索引中）。
- Ready（已就绪）。
- Failed（已失败）。
- Rebuild（重建）。
- Retry（重试）。

#### 4. Retrieval Debug（检索调试）

展示：

- Original Query（原始查询）。
- Rewritten Queries（改写后的查询）。
- Accessible Knowledge Bases（可访问知识库）。
- Retrieval Strategy（检索策略）。
- Scores（评分）。
- Citations（引用）。
- Index Version（索引版本）。

#### 5. Governance（治理）

支持：

- Disable Knowledge Base（禁用知识库）。
- Reindex（重新索引）。
- Delete（删除）。
- Retry Failed Index（重试失败索引）。
- 查看 Orphan Vector（孤儿向量）。
- 查看 Stale Chunk（失效片段）。
- Consistency Scan（一致性扫描）。

### 任务 13：增加 ProductionKnowledgeMetrics（生产知识指标）

```ts
type ProductionKnowledgeMetrics = {
  knowledgeBaseCount: number;
  documentCount: number;
  readyDocumentCount: number;
  failedDocumentCount: number;
  indexingDocumentCount: number;
  totalChunkCount: number;
  totalVectorCount: number;
  indexJobCount: number;
  indexFailureRate: number;
  avgIndexDurationMs: number;
  retrievalCount: number;
  retrievalHitRate: number;
  noResultRate: number;
  avgRetrievalDurationMs: number;
  citationCoverageRate: number;
  permissionDeniedCount: number;
  orphanChunkCount: number;
  orphanVectorCount: number;
  staleIndexCount: number;
};
```

重点新增：

- Citation Coverage（引用覆盖率）。
- Orphan Vector（孤儿向量）。
- Stale Index（过期或失效索引）。
- Permission Denied（权限拒绝次数）。

这些才是生产知识平台真正需要关注的治理指标。

### 任务 14：实现 Knowledge Consistency Checker（知识一致性检查器）

新增：

```ts
type KnowledgeConsistencyReport = {
  missingStorageObjects: string[];
  orphanChunks: string[];
  orphanVectors: string[];
  staleIndexVersions: string[];
  documentsWithoutActiveIndex: string[];
  activeIndexesWithoutDocument: string[];
};
```

实现：

```text
scanKnowledgeConsistency（扫描知识一致性）
```

检查：

- MySQL 中存在文档，但 Object Storage（对象存储）文件不存在。
- Chunk（文本片段）存在，但所属文档已经删除。
- Vector（向量）存在，但对应 Chunk 不存在。
- Active Index（活动索引）指向失败版本。
- 文档状态为 `ready`，但没有 Active Index（活动索引）。

支持：

- Report Only（仅生成报告）。
- Auto Repair Safe Items（自动修复安全项）。
- Manual Confirmation for Dangerous Items（危险项人工确认）。

### 任务 15：完成 Production Knowledge End-to-End Test（生产知识端到端测试）

#### Case 1：新建知识库并上传文档

预期状态流转：

```text
uploaded（已上传）
    ↓
queued（等待索引）
    ↓
indexing（索引中）
    ↓
ready（可检索）
```

同时生成 Active Index Version（活动索引版本）。

#### Case 2：重复索引 Job（任务）

同一文档同一版本投递两次。

预期：

- 只生成一次索引。
- 另一个任务通过 Idempotency Check（幂等检查）直接结束。
- 不产生重复向量。

#### Case 3：文档更新

上传 V2（第2版文档）。

预期：

- V1 检索仍然可用。
- V2 在后台构建。
- V2 就绪后切换为活动版本。
- 后续只检索 V2。
- V1 标记为 `superseded`（已被替代）。

#### Case 4：权限隔离

用户 A 和用户 B 各自拥有私人知识库。

预期：

- 用户 A 无法检索用户 B 的内容。
- 系统返回 Permission Filtered（已被权限过滤），不能泄漏结果。

#### Case 5：Citation（引用）

执行知识问答。

预期：

- 每个核心结论都有 Citation（引用）。
- Citation 可以定位文档、Chunk（文本片段）和 Index Version（索引版本）。
- Citation 引用的是 Active Index（活动索引）。

#### Case 6：删除一致性

删除文档。

预期：

- Metadata（元数据）进入 `deleting` 状态。
- Worker（工作进程）清理对象、Chunk、Vector 和 Index。
- 最终状态为 `deleted`。
- Consistency Checker（一致性检查器）不应该发现孤儿资源。

#### Case 7：索引失败与重试

模拟 Embedding（向量生成）失败。

预期：

- Document Status（文档状态）变为 `failed`。
- 保存错误信息。
- 支持 Retry（重试）。
- 重试成功后正常发布索引。

#### Case 8：RuntimeContext（运行时上下文）与事件

验证：

- 检索信息写入统一运行时上下文。
- EventBus（事件总线）产生完整索引与检索事件。
- Trace（链路追踪）可以通过 `traceId` 找到全部过程。

---

## 二十四、Day69 验收标准

1. 是否定义 ProductionKnowledgeBase（生产知识库）和 Knowledge Scope（知识作用域）。
2. 是否升级 ProductionKnowledgeDocument（生产知识文档）生命周期。
3. 是否定义 IndexManifest / IndexVersion（索引清单 / 索引版本）。
4. 是否实现 ProductionKnowledgeService（生产知识服务）。
5. 索引是否改为 Redis Queue（Redis 队列）异步 Job（任务）。
6. 是否实现索引幂等与 Distributed Lock（分布式锁）。
7. 是否实现安全更新与 Two-Phase Delete（两阶段删除）。
8. 是否实现 Knowledge Permission Filter（知识权限过滤）。
9. 是否升级 Production Retrieval Pipeline V2（生产检索管线第2版）。
10. 是否实现标准 Knowledge Citation（知识引用）。
11. Knowledge（知识）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
12. 是否实现 Knowledge Governance Explorer V2（知识治理浏览器第2版）。
13. 是否增加 Production Knowledge Metrics（生产知识指标）。
14. 是否实现 Knowledge Consistency Checker（知识一致性检查器）。
15. 是否完成 Production Knowledge End-to-End Test（生产知识端到端测试）。

---

## 二十五、Day69 打卡模板

【第69天打卡】

1. 是否定义 ProductionKnowledgeBase（生产知识库）和 Knowledge Scope（知识作用域）：是 / 否

2. 是否升级 ProductionKnowledgeDocument（生产知识文档）生命周期：是 / 否

3. 是否定义 IndexManifest / IndexVersion（索引清单 / 索引版本）：是 / 否

4. 是否实现 ProductionKnowledgeService（生产知识服务）：是 / 否

5. 索引是否改为 Redis Queue（Redis 队列）异步 Job（任务）：是 / 否

6. 是否实现索引幂等与 Distributed Lock（分布式锁）：是 / 否

7. 是否实现安全更新与 Two-Phase Delete（两阶段删除）：是 / 否

8. 是否实现 Knowledge Permission Filter（知识权限过滤）：是 / 否

9. 是否升级 Production Retrieval Pipeline V2（生产检索管线第2版）：是 / 否

10. 是否实现标准 Knowledge Citation（知识引用）：是 / 否

11. Knowledge（知识）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是 / 否

12. 是否实现 Knowledge Governance Explorer V2（知识治理浏览器第2版）：是 / 否

13. 是否增加 Production Knowledge Metrics（生产知识指标）：是 / 否

14. 是否实现 Knowledge Consistency Checker（知识一致性检查器）：是 / 否

15. 是否完成 Production Knowledge End-to-End Test（生产知识端到端测试）：是 / 否

16. 遇到的最大问题：


17. 当前系统能力：


---

## 二十六、Day69 核心认知

Day69 最重要的一句话是：

> 生产级 RAG（检索增强生成）的核心不只是“检索准确”，而是让知识从上传、索引、更新、访问、引用到删除的整个生命周期都可信。

Day24～Day30 主要解决：

```text
怎样找到相关内容？
```

Day69 进一步解决：

```text
找到的是不是当前活动版本？
用户有没有权限看到？
引用能不能追溯？
更新和删除是否保持一致？
失败以后能不能恢复？
```

完成 Day69 后，系统将升级为：

```text
Production Knowledge & RAG Platform V1
（生产知识与检索增强生成平台第1版）
```

---

## 二十七、Day70 预告

Day70 将继续生产化 Workflow（工作流）与 Agent Execution（智能体执行）：

- Dynamic Workflow Definition（动态工作流定义）。
- Workflow Version（工作流版本）。
- Workflow Publish and Rollback（工作流发布与回滚）。
- Durable Execution（持久化执行）。
- Checkpoint（检查点）。
- Event Replay（事件重放）。
- Exactly-Once Semantic Boundary（恰好一次语义边界）。
- Subworkflow（子工作流）。
- Workflow Governance（工作流治理）。
- Unified Job / Lock / Context / Event Chain（统一任务、锁、上下文与事件链路）。
