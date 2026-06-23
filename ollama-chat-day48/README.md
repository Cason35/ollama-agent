# Ollama Chat Day 48

Day 48 在 Day 47 Usage & Cost Observability（用量与成本可观测性）的基础上，升级为 Advanced Optimization V1（高级优化第 1 版）：Semantic Cache Runtime（语义缓存运行时）。

> 核心认知：Memory（记忆）是记住事实，Cache（缓存）是避免重复思考。

## 本日重点

- 定义统一 `CacheEntry`（缓存条目）及 `SemanticCache`（语义缓存）。
- 实现 `Query Embedding`（查询向量）与 `Similarity Search`（相似度检索，余弦相似度，阈值 0.9）。
- 为 Agent Runtime 增加 `answerWithCache`：Cache Hit（命中）直接返回，Cache Miss（未命中）正常执行并写入缓存。
- 记录 `Cache Metrics`（缓存指标）：命中率、节省词元、节省费用与平均延迟降低。
- 在 Trace（追踪记录）中接入 `cache span`（缓存跨度），记录 hit / miss 状态。
- 实现 `Cache Explorer`（缓存浏览器）：查询、相似度、创建时间、命中次数、节省成本，支持手动失效。
- 支持 TTL（存活时间，24h / 7d / never）与 LRU（最近最少使用）失效策略。
- 完整保留 Day 47 的用量与成本可观测性以及更早的回归评估、队列、工作流与 RAG 能力。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧控制台默认进入“缓存”标签页，可切换查看缓存概览、缓存条目和查询事件。

## 验证方式

```bash
npm run test:day48
npm run test:day47
npm run test:day46
npm run lint
npm run build
```

Day 48 的自动化、接口与人工测试用例见 `day48_test_cases.md`。
