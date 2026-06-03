# Day 29 测试用例：Knowledge Store + Incremental Indexing

本文档用于测试 `ollama-chat-day29` 的 RAG Runtime V6 能力：Document Version、Content Hash、Chunk Hash、Incremental Indexer、Embedding Cache、Knowledge Metrics V2、Knowledge Explorer 与 Reindex Tool。

## 前置条件

1. 启动 Ollama，并确认已安装 embedding 模型：`ollama pull nomic-embed-text`
2. 进入项目：`cd ollama-chat-day29`
3. 启动项目：`npm run dev`
4. 打开浏览器：http://localhost:3000

## 用例 1：首次导入新文档

标题输入：`Workflow Runtime 笔记`

正文输入：

```text
Workflow Runtime 负责把用户目标拆成多个步骤。
Planner 会生成步骤列表，Executor 会按顺序执行。
当某个步骤需要人工确认时，系统会进入 waiting_confirmation。
确认通过后，Workflow Runtime 会继续执行后续步骤。
```

预期结果：

- Knowledge Explorer 出现 `Workflow Runtime 笔记`
- 文档版本为 `v1`
- `contentHash` 有值
- 每个 chunk 都有 `chunkHash`
- `generatedEmbeddings` 大于 0
- 最近一次索引统计中 `addedChunks` 大于 0
- `cacheHitRate` 首次通常为 0%

## 用例 2：重复导入完全相同内容

标题仍输入：`Workflow Runtime 笔记`

正文保持与用例 1 完全一致。

预期结果：

- 文档版本仍为 `v1`
- 最近一次索引统计中 `unchangedDocument` 为 true
- `reusedChunks` 等于当前文档 chunk 总数
- `generatedEmbeddings` 为 0
- 本次 `cacheHitRate` 为 100%

## 用例 3：增量导入新增内容

标题仍输入：`Workflow Runtime 笔记`

正文在用例 1 后追加：

```text
Queue Runtime 负责把等待执行的任务放入队列。
当多个任务并发进入系统时，队列可以控制执行顺序和重试。
```

预期结果：

- 文档版本从 `v1` 变为 `v2`
- `contentHash` 发生变化
- 已存在且未变化的 chunk 会被复用
- 新增 chunk 才会生成新的 embedding
- 最近一次索引统计展示 `addedChunks` 或 `updatedChunks`
- `cachedEmbeddings` 大于 0

## 用例 4：修改中间内容

标题仍输入：`Workflow Runtime 笔记`

把 `waiting_confirmation` 改成 `human_approval_waiting`，其他内容尽量保持不变。

预期结果：

- 文档版本继续递增
- 被修改位置附近的 chunkHash 发生变化
- 未变化 chunk 的 embedding 继续复用
- `updatedChunks` 大于 0
- `generatedEmbeddings` 只覆盖变化片段

## 用例 5：Knowledge Explorer 展示检查

观察右侧 `Knowledge Explorer`。

预期结果：

- 文档展示 title、version、chunkCount、contentHash、updatedAt
- chunk 展示 index、embedding 状态、chunkHash、文本预览
- 每个 chunk 的 `emb` 应显示 `yes`

## 用例 6：Reindex Tool 强制重建索引

点击侧栏 `Reindex 重建索引`。

预期结果：

- 请求完成后 Knowledge Metrics V2 刷新
- 最近一次索引统计中 `forcedReindex` 为 true
- `generatedEmbeddings` 会增加
- Tool Explorer 中能看到 `reindexKnowledge`

## 用例 7：RAG Debug 继承验证

在 RAG Debug Panel 输入：

```text
Queue Runtime 有什么用？
```

预期结果：

- 检索结果能命中新导入的 Queue Runtime 内容
- 命中项展示 documentTitle、chunkIndex、score、matchedQueries
- Query Rewrite 调试信息仍展示 Original Query、rewriteMode、memory/recent/topics

## 第 29 天验收打卡

```text
【第29天打卡】

1. 是否实现 KnowledgeStore：是
2. 是否增加 Document Version：是

3. 是否实现 Content Hash：是
4. 是否实现 Chunk Hash：是

5. 是否实现 Incremental Indexer：是
6. 是否实现 Embedding Cache：是

7. 是否增加 Knowledge Metrics V2：是
8. 是否实现 Knowledge Explorer：是

9. 是否新增 Reindex Tool：是
10. 是否完成增量导入测试：按本文档执行

11. 遇到的最大问题：
同标题文档更新时，需要同时保持文档版本递增、片段复用和 embedding 缓存命中，避免把“重复导入”误当成新文档。

12. 当前系统能力：
RAG Runtime V6 + Knowledge Store V2 + Incremental Indexing + Embedding Cache + Knowledge Explorer + Reindex Tool + Memory-aware Retrieval Pipeline。
```
