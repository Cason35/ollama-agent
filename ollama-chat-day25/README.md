# ollama-chat-day25

第 25 天：**RAG Runtime V2**（Overlap Chunking + TopK/minScore + 低幻觉 Prompt + RAG Debug Panel）。在 day24 **Knowledge-aware Agent Runtime V1** 之上优化检索质量与可观测性。

学习总结与测试：

- `day25_learning_summary.md` — 第 25 天 RAG V2 实现说明与打卡
- `day25_test_cases.md` — 第 25 天测试用例（TC-25-01 ~ TC-25-08 + 5 个验收问题）
- `day24_learning_summary.md` — 第 24 天 RAG 基础（参考）

## 快速开始

```bash
cd ollama-chat-day25
npm install
npm run dev
```

浏览器：**http://localhost:3000** — 侧栏 **RAG 知识库**（overlap 导入）+ **RAG Debug Panel**（Query / TopK / MinScore / Chunk 元数据）。

**RAG 依赖：** 本地 Ollama + `ollama pull nomic-embed-text`。

可选 MySQL（backend 持久化）：执行 `scripts/init-mysql.sql`，配置 `.env.local` 中 `MYSQL_*`。

## 第 25 天核心变更

| 文件 | 说明 |
|------|------|
| `lib/knowledge-chunking.ts` | overlap 500/100 + chunk metadata |
| `lib/knowledge-retrieval.ts` | `RetrieveOptions`：topK + minScore |
| `lib/knowledge-rag.ts` | 严谨 Prompt + `executeRagAnswer` fallback |
| `lib/knowledge-store.ts` | `RetrievalMetrics` 持久化 |
| `app/api/knowledge/retrieve/route.ts` | 支持 `minScore` body |
| `app/page.tsx` | RAG Debug Panel V2 |
