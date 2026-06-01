# ollama-chat-day26

第 26 天：**RAG Runtime V3**（Hybrid Search + Rerank + RecallK/TopK 多阶段检索 + RAG Debug Panel V3）。在 day25 **RAG Runtime V2** 之上提升召回可靠性与排序可解释性。

学习总结与测试：

- `day25_learning_summary.md` — 第 26 天任务说明来源，见文档第 6 节
- `day26_test_cases.md` — 第 26 天测试用例与 noisy query evaluation 表
- `day25_test_cases.md` — 第 25 天测试用例（继承参考）

## 快速开始

```bash
cd ollama-chat-day26
npm install
npm run dev
```

浏览器：**http://localhost:3000** — 侧栏 **RAG 知识库**（overlap 导入）+ **RAG Debug Panel**（Query / Mode / RecallK / TopK / MinScore / 多分数）。

**RAG 依赖：** 本地 Ollama + `ollama pull nomic-embed-text`。

可选 MySQL（backend 持久化）：执行 `scripts/init-mysql.sql`，配置 `.env.local` 中 `MYSQL_*`。

## 第 26 天核心变更

| 文件 | 说明 |
|------|------|
| `lib/knowledge-chunking.ts` | overlap 500/100 + chunk metadata |
| `lib/knowledge-retrieval.ts` | `RetrieveOptions`：recallK + topK + minScore + mode；keywordScore / hybridScore / rerank |
| `lib/knowledge-rag.ts` | Prompt 注入 vector / keyword / hybrid / rerank 分数 |
| `lib/knowledge-store.ts` | 保存最近一次检索的 recallK / mode / 多分数结果 |
| `app/api/knowledge/retrieve/route.ts` | 支持 `recallK`、`mode`、`minScore` body |
| `app/page.tsx` | RAG Debug Panel V3 |
