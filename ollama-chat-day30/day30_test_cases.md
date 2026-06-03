# Day 30 测试用例：RAG Runtime V7 + Local Vector Store

## 1. VectorStore 接口测试

| 编号 | 场景 | 步骤 | 预期结果 |
|---|---|---|---|
| TC30-01 | upsert 新向量 | 导入一篇可切出多个 chunk 的文档 | `metrics.vector.vectorCount` 等于 chunk 数 |
| TC30-02 | upsert 覆盖向量 | 用同标题导入修改后的文档 | 同 chunkId 的向量被更新，vectorCount 不异常翻倍 |
| TC30-03 | query TopK | 导入知识后执行 RAG Debug 检索 | 返回结果数量不超过 `topK`，并按分数降序 |
| TC30-04 | delete 向量 | 删除或重建文档后观察向量摘要 | 旧文档不再存在孤儿 vector 记录 |
| TC30-05 | stats 指标 | 连续执行 3 次检索 | `queryCount` 增加，`avgQueryDuration` 有数值 |

## 2. KnowledgeStore 与 VectorStore 解耦测试

| 编号 | 场景 | 步骤 | 预期结果 |
|---|---|---|---|
| TC30-06 | chunk 不保存 embedding | 查看持久化文件或返回的文档摘要 | chunk 只包含文本、hash 和偏移，向量在 `vectors` 中 |
| TC30-07 | 导入写入 VectorStore | 导入一篇新文档 | `lastIndexStats.upsertedVectors` 等于本次 chunk 数 |
| TC30-08 | 重复导入未变化文档 | 同标题同正文再次导入 | `unchangedDocument=true`，不重新 upsert 向量 |
| TC30-09 | 小幅修改文档 | 修改同标题文档中的一小段 | 未变 chunk 复用 embedding，变化 chunk 写入新向量 |
| TC30-10 | 强制重建索引 | 点击 `Reindex 重建索引与向量` | 文档仍存在，向量库被重建，vectorCount 与 chunk 数一致 |

## 3. Metadata Filter 测试

| 编号 | 场景 | 步骤 | 预期结果 |
|---|---|---|---|
| TC30-11 | 限定 documentId 查询 | 调用检索逻辑并传入某篇文档的 `documentId` | 返回命中的 `documentId` 全部等于过滤条件 |
| TC30-12 | 不传过滤条件 | 用相同 query 检索全库 | 可返回多篇文档中的候选 |
| TC30-13 | 不存在的 documentId | 传入不存在的 `documentId` | 返回空命中，不报错 |

## 4. UI 验收测试

| 编号 | 场景 | 步骤 | 预期结果 |
|---|---|---|---|
| TC30-14 | 标签页标题 | 打开页面 | 浏览器标题显示 Day 30 / RAG Runtime V7 |
| TC30-15 | 顶部标题 | 查看页面 Header | 标题显示 `RAG Runtime V7 · Knowledge Store + Local Vector Store` |
| TC30-16 | Vector Metrics | 导入文档后查看侧栏 | 显示 vectors、dim、vector queries、avg query |
| TC30-17 | Vector Explorer | 导入文档后查看侧栏 | 展示 chunkId、documentId、dimension、updatedAt |
| TC30-18 | Knowledge Explorer | 导入文档后查看侧栏 | chunk 行显示 `vector: yes` |

## 5. RAG Debug 测试

| 编号 | 场景 | 步骤 | 预期结果 |
|---|---|---|---|
| TC30-19 | vector 模式 | 选择 `vector` 并检索 | 结果主要按向量分排序 |
| TC30-20 | keyword 模式 | 选择 `keyword` 并检索 | 关键词命中高的片段优先 |
| TC30-21 | hybrid 模式 | 选择 `hybrid` 并检索 | 同时展示 vector、keyword、hybrid、rerank 分数 |
| TC30-22 | Query Rewrite | 输入模糊查询并检索 | Rewrite 面板展示 rewrittenQueries |
| TC30-23 | 无命中 fallback | 设置较高 minScore 并检索 | 命中为空，界面提示 ragAnswer 会 fallback |

## 6. Benchmark 验收记录模板

| 规模 | 导入耗时 | 查询耗时 | vectorCount | 备注 |
|---|---:|---:|---:|---|
| 100 chunk | 待测 | 待测 | 待测 | 记录首次导入 |
| 500 chunk | 待测 | 待测 | 待测 | 记录平均查询 |
| 1000 chunk | 待测 | 待测 | 待测 | 观察是否仍可交互 |

