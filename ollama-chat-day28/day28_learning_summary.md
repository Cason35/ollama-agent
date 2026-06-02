# Day 28 学习总结：Memory-aware Retrieval Pipeline（记忆感知检索流水线）

本文档记录 `ollama-chat-day28` 项目的学习理解、关键问答、与 `ollama-chat-day27` 的对比、为什么这样设计，以及第 28 天打卡结果。

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

## 8. 一句话总结

day28 的核心不是让系统“多查几遍”，而是让系统在检索前先结合 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题）理解检索意图。

```text
好的 RAG（检索增强生成）不只是检索知识，
而是先理解用户到底想检索什么。
```

