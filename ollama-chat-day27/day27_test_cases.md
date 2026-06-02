# 第27天测试用例：RAG Runtime V4（Query Rewrite + Multi-Query Retrieval）

## 测试目标

验证第27天新增的 Query Rewrite、Multi-Query Retrieval、chunk 去重、matchedQueries、Query Rewrite Debug Panel 与 Multi-Query Metrics 是否可用，并对比 single query 与 multi query 的命中效果。

## 前置准备

1. 在 `ollama-chat-day27` 目录执行 `npm install`。
2. 启动项目：`npm run dev`。
3. 确认 Ollama embedding 服务可用，建议已执行 `ollama pull nomic-embed-text`。
4. 在右侧「RAG 知识库」导入包含 HITL、Workflow Runtime、Tool Registry、Memory、RAG Retrieval 的学习笔记。
5. 打开「RAG Debug Panel」，默认使用 `hybrid` 模式、`recallK=20`、`topK=5`、`minScore=0.3`。

## 功能验收清单

| # | 验收项 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 新增 QueryRewriteTool | 打开 Tool Explorer | 能看到 `queryRewrite`，能力包含 `query-rewrite` 与 `retrieval-optimization` |
| 2 | 规则版 query rewrite | 输入 `人工确认节点是干啥的？` 后检索 | Debug Panel 展示原问题、`HITL human in the loop`、`waiting_confirmation 用户确认 工作流` 等 rewritten queries |
| 3 | LLM 版 query rewrite | 通过 Workflow 调用 `queryRewrite` 工具 | LLM 可用时返回多条 queries；不可用时回退规则版 |
| 4 | multiQueryRetrieve | 执行 RAG Debug 检索 | 后端对多条 query 分别召回，再合并返回 TopK |
| 5 | chunk 去重 | 用容易多路命中的 HITL 查询检索 | 同一个 chunk 不重复出现，分数保留最高值 |
| 6 | matchedQueries | 查看命中结果卡片 | 每条结果展示 `matched: query1 | query2` |
| 7 | Debug Panel 展示 rewritten queries | 任意有效检索 | 面板展示 Original Query 与 Rewritten Queries 编号列表 |
| 8 | Multi-Query Metrics | 多检索几次后查看知识库指标 | 展示 `rewrite`、`avgQ`、`hitRate`、`improvedTop1` |
| 9 | single vs multi query 对比 | 对 noisy query 做人工记录 | top1Hit / top3Hit 预期比 day26 更稳 |

## Noisy Query 对比表

| query | expectedTopic | singleTop1Hit | singleTop3Hit | multiTop1Hit | multiTop3Hit | usedMode | notes |
|---|---|---|---|---|---|---|---|
| 人工确认节点是干啥的？ | HITL / waiting_confirmation | 待测 | 待测 | 待测 | 待测 | hybrid | 期望 rewrite 生成 HITL、human in the loop、waiting_confirmation |
| 那个等用户点确认的状态是什么？ | waiting_confirmation / HITL | 待测 | 待测 | 待测 | 待测 | hybrid | 原 query 不一定包含 HITL，multi query 应补专业术语 |
| 工具为啥要注册起来？ | Tool Registry / Capability Routing | 待测 | 待测 | 待测 | 待测 | hybrid | 期望补 Tool Registry、Capability Routing |
| Agent 怎么知道该用哪个能力？ | Capability Routing / Tool Registry | 待测 | 待测 | 待测 | 待测 | hybrid | 期望命中能力路由或工具选择片段 |
| 长期知识和记忆有啥区别？ | RAG / Memory | 待测 | 待测 | 待测 | 待测 | hybrid | 期望补 Memory、longTerm、RAG Retrieval |

## API 手动测试

```bash
curl -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"人工确认节点是干啥的？\",\"recallK\":20,\"topK\":5,\"minScore\":0.3,\"mode\":\"hybrid\"}"
```

预期响应字段：

```json
{
  "query": "人工确认节点是干啥的？",
  "rewrite": {
    "originalQuery": "人工确认节点是干啥的？",
    "rewrittenQueries": ["人工确认节点是干啥的？", "HITL human in the loop 人工确认"],
    "rewriteCount": 2
  },
  "hits": [
    {
      "chunkId": "chunk-id",
      "matchedQueries": ["人工确认节点是干啥的？", "HITL human in the loop 人工确认"],
      "vectorScore": 0.8,
      "keywordScore": 0.5,
      "hybridScore": 0.71,
      "rerankScore": 0.76,
      "finalRank": 1
    }
  ]
}
```

## 第27天打卡

```text
【第27天打卡】

1. 是否新增 QueryRewriteTool：是
2. 是否实现规则版 query rewrite：是
3. 是否实现 LLM 版 query rewrite：是
4. 是否实现 multiQueryRetrieve：是
5. 是否实现 chunk 去重：是
6. 是否记录 matchedQueries：是
7. Debug Panel 是否展示 rewritten queries：是
8. 是否增加 multi-query metrics：是
9. 是否完成 single vs multi query 对比测试：已提供测试表，运行后填写命中情况

10. 遇到的最大问题：
规则版 rewrite 仍是关键词触发，中文语义改写能力有限；LLM rewrite 可改善表达覆盖，但依赖模型可用性与 JSON 输出稳定性。

11. 当前系统能力：
RAG Runtime V4 + Query Rewrite + Multi-Query Retrieval + Chunk Dedup + matchedQueries + Query Rewrite Metrics + Debug Panel V4
```
