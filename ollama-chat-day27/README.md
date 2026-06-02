# ollama-chat-day27

第 27 天：**RAG Runtime V4**（Query Rewrite + Multi-Query Retrieval + Hybrid Search + Rerank + RAG Debug Panel V4）。在上一版多阶段检索之上提升召回能力。

学习总结与测试：

- `day26_learning_summary.md` — 第 27 天任务说明来源，见文档第 10 节
- `day27_test_cases.md` — 第 27 天测试用例与 single query vs multi query 对比表
- `day26_test_cases.md` — 第 26 天测试用例（继承参考）

## 快速开始

```bash
cd ollama-chat-day27
npm install
npm run dev
```

浏览器：**http://localhost:3000** — 侧栏 **RAG 知识库**（overlap 导入）+ **RAG Debug Panel**（Original Query / Rewritten Queries / Matched Queries / 多分数）。

**RAG 依赖：** 本地 Ollama + `ollama pull nomic-embed-text`。

可选 MySQL（backend 持久化）：执行 `scripts/init-mysql.sql`，配置 `.env.local` 中 `MYSQL_*`。

## 第 27 天核心变更

| 文件 | 说明 |
|------|------|
| `lib/query-rewrite.ts` | 规则版 query rewrite + LLM 版 rewrite + fallback |
| `lib/knowledge-chunking.ts` | overlap 500/100 + chunk metadata |
| `lib/knowledge-retrieval.ts` | `multiQueryRetrieve`：改写 query、逐 query 召回、chunk 去重、matchedQueries、rerank |
| `lib/knowledge-rag.ts` | Prompt 注入 matchedQueries 与多分数 |
| `lib/knowledge-store.ts` | 保存 rewrittenQueries、matchedQueries 与 Query Rewrite Metrics |
| `lib/workflow-tools.ts` | 新增 `queryRewrite` 工具，并让 retrieval / ragAnswer 走 RAG V4 |
| `app/components/KnowledgeSidebar.tsx` | RAG Debug Panel V4 展示 rewritten queries、matched queries 与 metrics |
