# ollama-chat-day28

第 28 天：**RAG Runtime V5**（Memory-aware Retrieval Pipeline + Query Rewrite + Multi-Query Retrieval + Hybrid Search + Rerank + RAG Debug Panel V5）。

这一版在 day27 的多查询检索基础上，让检索链路结合 Memory（记忆）、recentMessages（最近对话）和 knowledgeTopics（知识库主题）理解用户真正想查什么。

## 学习总结与测试

- `day28_learning_summary.md` — 第 28 天学习总结
- `day28_test_cases.md` — 第 28 天 Memory-aware Retrieval Pipeline 测试用例
- `day27_test_cases.md` — 第 27 天 single query vs multi query 对比参考

## 快速开始

```bash
cd ollama-chat-day28
npm install
npm run dev
```

浏览器：**http://localhost:3000**

侧栏包含 **RAG 知识库** 和 **RAG Debug Panel V5**，可观察 Original Query、Ambiguous、Rewrite Mode、Memory Used、Rewritten Queries、Matched Queries 与多分数。

**RAG 依赖：** 本地 Ollama + `ollama pull nomic-embed-text`。

可选 MySQL（backend 持久化）：执行 `scripts/init-mysql.sql`，配置 `.env.local` 中 `MYSQL_*`。

## 第 28 天核心变更

| 文件 | 说明 |
|------|------|
| `lib/knowledge/query-rewrite.ts` | Memory-aware query rewrite、ambiguous query detector、LLM 版 rewrite + fallback |
| `lib/knowledge/retrieval-pipeline.ts` | `runRetrievalPipeline`：统一 rule / llm / fallback-llm 检索流水线 |
| `lib/knowledge/knowledge-retrieval.ts` | `retrieveWithQueries` / `multiQueryRetrieve`：逐 query 召回、chunk 去重、matchedQueries、rerank |
| `lib/knowledge/knowledge-rag.ts` | Prompt 注入 matchedQueries 与多分数 |
| `lib/knowledge/knowledge-store.ts` | 保存 rewrittenQueries、matchedQueries、pipeline metrics 与 fallback metrics |
| `lib/workflow/workflow-tools.ts` | `queryRewrite` 支持 memory / recentMessages，并让 retrieval / ragAnswer 走 RAG V5 |
| `app/components/KnowledgeSidebar.tsx` | RAG Debug Panel V5 展示 ambiguous、rewrite mode、memory used、topics 与 metrics |
| `app/components/ChatTranscript.tsx` | 拆分聊天消息渲染，降低 `app/page.tsx` 复杂度 |
