# ollama-chat-day29

第 29 天：**RAG Runtime V6**（Knowledge Store + Incremental Indexing + Embedding Cache + Knowledge Explorer + Reindex Tool）。

这一版在 day28 的 Memory-aware Retrieval Pipeline 基础上，重点解决“知识库越来越大时不能每次全量重建索引”的问题。

## 学习总结与测试

- `day29_test_cases.md`：第 29 天 Knowledge Store + Incremental Indexing 测试用例
- `../ollama-chat-day28/day28_learning_summary.md`：第 28 天总结与第 29 天任务来源

## 快速开始

```bash
cd ollama-chat-day29
npm install
npm run dev
```

浏览器：http://localhost:3000

## 第 29 天核心变更

| 文件 | 说明 |
|---|---|
| `lib/knowledge/knowledge-types.ts` | 新增 `version`、`contentHash`、`chunkHash`、`IncrementalIndexStats`、`Knowledge Metrics V2` 与 Explorer 摘要类型 |
| `lib/knowledge/knowledge-store.ts` | 实现 `KnowledgeStore V2`、`IncrementalIndexer`、`embeddingCache`、增量导入、删除/更新门面与强制重建索引 |
| `app/api/knowledge/route.ts` | GET 返回 Explorer 数据；POST 支持增量导入和 `{ action: "reindex" }` |
| `lib/workflow/workflow-tools.ts` | 新增 `reindexKnowledge` 工具，`ragAnswer` 描述升级到 RAG V6 |
| `app/components/KnowledgeSidebar.tsx` | 展示 Knowledge Metrics V2、最近一次索引统计、Knowledge Explorer 与 Reindex 按钮 |
| `app/layout.tsx` / `app/components/Header.tsx` | 标签页和页面标题升级为 Day 29 / RAG Runtime V6 |

## 运行依赖

RAG embedding 依赖本地 Ollama：

```bash
ollama pull nomic-embed-text
```

可选 MySQL 后端持久化仍沿用 day28 配置，见 `.env.local` 和 `scripts/init-mysql.sql`。
