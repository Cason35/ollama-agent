# Day 28 测试用例：Memory-aware Retrieval Pipeline

本文档用于测试 `ollama-chat-day28` 的第 28 天任务：RAG Runtime V5（Memory-aware Query Rewrite + Retrieval Pipeline）。

## 1. 测试前准备

1. 启动 Ollama，并确保 `nomic-embed-text` 可用。
2. 启动项目后进入首页，确认标签页标题为 `Day 28 - RAG Runtime V5 · Memory-aware Retrieval Pipeline`。
3. 在右侧知识库导入至少 2 篇文档，标题建议包含 `RAG`, `Memory`, `Workflow`, `HITL`, `Tool Registry` 等主题词。
4. 先进行几轮对话，让长期记忆或最近对话中出现 `RAG`, `Memory`, `Workflow` 等上下文。

## 2. 核心验收表

| 编号 | 测试目标 | 输入示例 | 期望结果 |
|---|---|---|---|
| 1 | RetrievalPipeline 已接入主检索 | `RAG 和 Memory 有什么区别？` | Debug Panel 显示 rewritten queries、matched queries、pipeline metrics |
| 2 | ambiguous query detector 生效 | `那它和记忆有什么区别？` | `ambiguous: true`，rewrite query 能补全 RAG / retrieval / knowledge base 等语义 |
| 3 | 明确问题优先规则改写 | `人工确认节点是做什么的？` | `rewriteMode: rule`，queries 包含 HITL / waiting_confirmation |
| 4 | Memory / recent messages 参与 LLM rewrite | 先聊 `我们刚刚讨论 RAG`，再问 `它和记忆有什么区别？` | 工具链调用时 `memory: yes` 或 `recent: yes`，query 补全上下文 |
| 5 | knowledgeTopics 参与 rewrite | 导入标题 `RAG Runtime V5` 后检索 `继续查那个能力` | topics 显示导入文档标题，query 更靠近知识库主题 |
| 6 | fallback LLM 策略 | 输入一个规则无法命中的省略问题 | 首轮无命中时可触发 `fallback-llm`，metrics 中 fallback 为 true |
| 7 | pipeline metrics | 任意检索 | 指标显示 totalQueries、rewriteMode、usedMemory、usedRecentMessages、retrievalDurationMs |
| 8 | RAG Debug Panel V5 展示 | 任意检索 | 展示 Original Query、Ambiguous、Rewrite Mode、Memory Used、Recent Used、Knowledge Topics |
| 9 | QueryRewriteTool 输入升级 | Workflow 中使用 queryRewrite | 工具描述包含 memory-aware，输出多条 queries |
| 10 | ragAnswer 使用 V5 主链路 | Workflow 中使用 ragAnswer | 返回答案时检索链路写入 lastRetrieval.pipeline |

## 3. 省略语查询专项测试

| 输入 | 预期补全方向 | 检查点 |
|---|---|---|
| `那它和记忆有什么区别？` | RAG / Knowledge Base 与 Memory 的区别 | ambiguous=true，queries 含 RAG / Memory |
| `刚刚那个确认节点有什么用？` | HITL / waiting_confirmation / 人工确认 | queries 含 HITL 或 waiting_confirmation |
| `这个工具系统为什么要抽象？` | Tool Registry / Capability Routing | queries 含 Tool Registry 或 工具注册 |
| `它和 workflow 有什么关系？` | RAG / Memory / Workflow 的关系 | queries 能结合最近对话主题 |
| `继续查一下那个知识库能力` | Knowledge Store / retrieval / chunk / embedding | topics 有知识库文档标题 |

## 4. 打卡记录模板

```text
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
12. 当前系统能力：RAG Runtime V5 + Memory-aware Retrieval Pipeline + Query Rewrite + Multi-Query Retrieval + Hybrid Search + Rerank + Debug Panel V5
```
