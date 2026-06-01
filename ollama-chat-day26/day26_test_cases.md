# 第26天测试用例：RAG Runtime V3（Hybrid Search + Rerank）

## 测试目标

验证第26天新增的多阶段检索能力是否可用：`recallK` 召回、`topK` 截断、`minScore` 过滤、`vector / keyword / hybrid` 模式切换、规则版 `rerank`、Debug Panel 多分数展示，以及 noisy query 的命中效果。

## 前置准备

1. 启动项目：在 `ollama-chat-day26` 目录执行 `npm run dev`。
2. 确认 Ollama embedding 服务可用，否则导入知识时无法生成向量。
3. 在右侧「RAG 知识库」导入至少 3 篇笔记，建议包含 HITL、Workflow Runtime、Tool Registry、RAG 与 Memory 的内容。
4. 打开「RAG Debug Panel」，依次测试 `vector`、`keyword`、`hybrid` 三种模式。

## 功能验收清单

| # | 验收项 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 支持 recallK / topK 两阶段 | 设置 `recallK=20`、`topK=5` 后检索 | API 返回最多 5 条结果，Debug Panel 显示 recallK 和 topK |
| 2 | 支持 rerank | 使用包含明确关键词的查询 | 命中项展示 `rerankScore`，最终排序按 rerank 后结果排列 |
| 3 | 支持 keywordScore | 模式切到 `keyword` 后检索 | 字面命中多的 chunk 排名更靠前，`keywordScore` 大于 0 |
| 4 | 支持 hybridScore | 模式切到 `hybrid` 后检索 | 命中项展示 `vectorScore`、`keywordScore`、`hybridScore` |
| 5 | 支持 vector / keyword / hybrid | 同一查询依次切换三种模式 | 排序可能变化，返回项的 `retrievalMode` 与所选模式一致 |
| 6 | Debug Panel 展示多 score | 执行任意一次有效检索 | 每条结果显示 `vector`、`keyword`、`hybrid`、`rerank`、`finalRank` |
| 7 | minScore 过滤仍有效 | 将 `minScore` 调高到 `0.95` | 弱相关结果被过滤，可能出现空结果 |
| 8 | fallback 仍有效 | 用无关问题触发 ragAnswer | 无合格 chunk 时返回知识不足提示，不硬编答案 |

## Noisy Query 测试集

| query | expectedTopic | top1Hit | top3Hit | usedMode | notes |
|---|---|---|---|---|---|
| hitl 有啥用？ | HITL / 人工确认 | 待测 | 待测 | hybrid | 口语化表达，期望命中人工确认或暂停等待用户确认片段 |
| 人工确认节点是干啥的？ | HITL / confirmation | 待测 | 待测 | hybrid | 同义表达，观察 rerank 是否提升字面相关片段 |
| workflow 持久化怎么恢复？ | Workflow persistence / resume | 待测 | 待测 | hybrid | 混合中英文查询，期望命中 workflow store 或 resume 内容 |
| tool registry 为什么要抽象？ | Tool Registry / capability | 待测 | 待测 | hybrid | 期望命中工具注册、能力路由、schema 或 metrics 内容 |
| RAG 和 memory 区别？ | RAG vs Memory | 待测 | 待测 | hybrid | 期望命中知识检索与对话记忆边界说明 |

## API 手动测试

```bash
curl -X POST http://localhost:3000/api/knowledge/retrieve \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"HITL 为什么重要\",\"recallK\":20,\"topK\":5,\"minScore\":0.3,\"mode\":\"hybrid\"}"
```

预期响应字段：

```json
{
  "query": "HITL 为什么重要",
  "recallK": 20,
  "topK": 5,
  "minScore": 0.3,
  "mode": "hybrid",
  "hits": [
    {
      "vectorScore": 0.8,
      "keywordScore": 0.5,
      "hybridScore": 0.71,
      "rerankScore": 0.76,
      "finalRank": 1,
      "retrievalMode": "hybrid"
    }
  ]
}
```

## 第26天打卡

```text
【第26天打卡】

1. 是否支持 recallK / topK 两阶段：是
2. 是否实现 rerank：是
3. 是否实现 keywordScore：是
4. 是否实现 hybridScore：是
5. 是否支持 vector / keyword / hybrid 模式：是
6. Debug Panel 是否展示 vector / keyword / hybrid / rerank score：是
7. 是否完成 noisy query 测试：已提供测试表，运行后填写命中情况
8. 是否增加 retrieval evaluation 记录：是，见 Noisy Query 测试集

9. 遇到的最大问题：
规则版关键词检索对中文长句不会做真正分词，目前主要依赖空格和标点切分；后续可以接入 jieba、BM25 或专门 reranker 模型。

10. 当前系统能力：
RAG Runtime V3 + Hybrid Search + Rule-based Rerank + Multi-stage Retrieval + Debug Panel V3
```
