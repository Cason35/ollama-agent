# Day69 Production Knowledge & RAG Platform 测试用例

## 一、测试目标

验证 `ollama-chat-day69` 已把历史 RAG（Retrieval-Augmented Generation，检索增强生成）升级为可管理、可追踪、可隔离、可增量更新的 Production Knowledge & RAG Platform V1（生产知识与检索增强生成平台第 1 版）。

重点覆盖：

- ProductionKnowledgeBase（生产知识库）与 Knowledge Scope（知识作用域）。
- ProductionKnowledgeDocument（生产知识文档）生命周期。
- IndexManifest / IndexVersion（索引清单 / 索引版本）。
- Redis Queue Asynchronous Job（Redis 队列异步任务）。
- Distributed Lock（分布式锁）与 Idempotency（幂等性）。
- Safe Update（安全更新）与 Two-Phase Delete（两阶段删除）。
- Knowledge Permission Filter（知识权限过滤）。
- Production Retrieval Pipeline V2（生产检索管线第 2 版）。
- KnowledgeCitation（知识引用）。
- RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
- ProductionKnowledgeMetrics（生产知识指标）。
- Knowledge Consistency Checker（知识一致性检查器）。

## 二、自动化执行方式

```bash
npm install
npm run test:day69
```

预期输出：

```text
Day69 Production Knowledge & RAG Platform：全部端到端测试通过
```

## 三、端到端测试用例

### Case 1：新建知识库并上传文档

前置条件：系统中不存在本次测试知识库。

步骤：

1. 创建 `scope = workspace`、`scopeId = workspace-a` 的知识库。
2. 上传一篇文本知识文档。
3. 检查上传接口返回的文档状态。
4. 驱动一个 Indexer Worker（索引工作进程）任务。
5. 检查文档与索引清单。

预期：

- 文档状态依次经过 `uploaded → queued → indexing → ready`。
- 上传请求不会同步完成切块和向量生成。
- 队列中生成 `knowledge.index` Job（知识索引任务）。
- 文档生成 `activeIndexVersion = 1`。
- `IndexManifest V1` 状态为 `ready`。

### Case 2：重复索引任务幂等

前置条件：Case 1 的文档 V1 已经 `ready`。

步骤：

1. 对同一 `documentId + version` 连续投递两次索引任务。
2. 驱动 Worker 处理两条任务。
3. 比较任务前后的 Chunk（片段）和 Vector（向量）数量。

预期：

- 两条任务使用相同幂等键 `knowledge:index:{documentId}:{version}`。
- 已存在 `ready` 清单时直接返回幂等命中。
- 不重复生成第二套片段和向量。
- 文档级锁 Key 为 `knowledge:index:{documentId}`。

### Case 3：文档安全更新

前置条件：文档 V1 已经发布。

步骤：

1. 上传文档 V2 正文。
2. 在 V2 Worker 执行前进行一次检索。
3. 驱动 Worker 完成 V2 构建和发布。
4. 再次执行检索。

预期：

- V2 构建期间文档状态为 `updating`。
- V2 构建期间 `activeIndexVersion` 仍然是 1。
- V2 发布前检索结果全部来自 V1。
- V2 发布后 `activeIndexVersion = 2`。
- `IndexManifest V1` 变为 `superseded`。
- V2 发布后检索结果全部来自 V2。

### Case 4：知识权限隔离

前置条件：用户 A 与用户 B 分别拥有一个私人知识库。

步骤：

1. 在用户 A 私有库写入 `ALPHA` 内容。
2. 在用户 B 私有库写入 `BETA` 内容。
3. 使用 `userId = user-a` 显式请求用户 B 的知识库。

预期：

- 用户 A 无法得到用户 B 的任何文档或片段。
- `hits` 为空。
- 目标知识库进入 `permissionFilteredKnowledgeBaseIds`。
- EventBus（事件总线）产生 `retrieval.permission_denied`。
- ProductionKnowledgeMetrics（生产知识指标）的 `permissionDeniedCount` 增加。

### Case 5：标准知识引用

前置条件：至少一篇文档拥有活动索引。

步骤：

1. 以 `requireCitations = true` 执行生产检索。
2. 检查每个命中的 `citation`。
3. 检查 RuntimeContext（运行时上下文）。

预期：

- 每个命中都有 KnowledgeCitation（知识引用）。
- 引用包含 `knowledgeBaseId`、`documentId`、`chunkId`、`indexVersion`、`quote`、`location` 和 `storageObjectKey`。
- 引用的 `indexVersion` 等于文档活动索引版本。
- `runtimeContext.retrievalContext.citationIds` 保存引用标识。

### Case 6：两阶段删除与一致性

前置条件：目标文档已经完成至少一个索引版本。

步骤：

1. 调用删除文档动作。
2. 检查文档是否先进入 `deleting`。
3. 驱动 Delete Worker（删除工作进程）。
4. 执行 Knowledge Consistency Checker（知识一致性检查器）。

预期：

- 第一阶段只标记 `deleting` 并创建 `knowledge.delete` Job。
- Worker 清理全部 Object Storage Object（对象存储文件）、Chunk、Vector、IndexManifest 和 Citation Reference（引用关系）。
- 最终文档状态为 `deleted`。
- 一致性报告中没有该文档产生的孤儿片段或孤儿向量。

### Case 7：索引失败与重试

前置条件：测试环境启用一次性 Embedding（向量生成）故障注入。

步骤：

1. 上传一篇故障测试文档。
2. 驱动第一次索引任务。
3. 检查文档错误信息。
4. 调用 Retry（重试）。
5. 驱动重试任务。

预期：

- 第一次任务状态为 `failed`。
- 文档状态为 `failed`。
- 文档保存 `KNOWLEDGE_INDEX_FAILED` 错误代码和安全错误消息。
- 重试不会创建错误的文档版本。
- 重试成功后文档变为 `ready` 并发布活动索引。

### Case 8：RuntimeContext、EventBus 与 UnifiedRegistry 集成

步骤：

1. 执行上传、索引、更新、检索、权限拒绝和删除流程。
2. 检查事件历史。
3. 检查 RuntimeContext 检索上下文。
4. 注册 Day69 知识能力并读取 UnifiedRegistry。

预期：

- 事件历史包含文档上传、索引排队、开始、完成、失败、发布、更新、删除和检索事件。
- RuntimeContext 保存查询、改写查询、知识库、片段、引用、索引版本和耗时。
- UnifiedRegistry 注册 6 类 Day69 知识能力：生产知识服务、切块策略、检索策略、向量 Provider（提供者）、文档解析器和引用格式化器。

## 四、治理界面手工测试

访问：

```text
http://localhost:3000/knowledge
```

### 标签页 1：Knowledge Bases（知识库）

- 能查看名称、Scope（作用域）、Scope ID（作用域标识）、状态、文档数、活动索引版本、Embedding Model（向量模型）和 Chunk Strategy（切块策略）。
- 能创建 User / Workspace / Team / Global（用户 / 工作空间 / 团队 / 全局）知识库。
- 能 Disable / Enable（禁用 / 启用）知识库。

### 标签页 2：Documents（文档）

- 能查看文档状态、内容版本、活动索引版本、片段数量、对象存储键和错误信息。
- 上传后应先显示 `queued`。
- 能触发 Rebuild（重建）、Retry（重试）和 Two-Phase Delete（两阶段删除）。

### 标签页 3：Index Jobs（索引任务）

- 能查看任务类型、状态、幂等键、尝试次数和执行结果。
- `Process Next` 只处理一个任务。
- `Drain Redis Queue` 处理全部等待任务。

### 标签页 4：Retrieval Debug（检索调试）

- 能切换 Fast / Balanced / Quality（快速 / 平衡 / 质量）策略。
- 能输入 User ID（用户标识）与 Workspace ID（工作空间标识）验证权限过滤。
- 能查看 Original Query（原始查询）、Rewritten Queries（改写查询）、可访问知识库、权限过滤、评分、引用和索引版本。

### 标签页 5：Governance（治理）

- 能执行 Report Only（仅报告）一致性扫描。
- 能执行 Auto Repair Safe Items（自动修复安全项）。
- 能查看 UnifiedRegistry（统一注册中心）知识能力。
- 能查看 EventBus / Trace（事件总线 / 链路追踪）事件历史。

## 五、构建与静态检查

```bash
npm run lint
npm run build
```

预期：

- ESLint（代码规范检查）通过。
- TypeScript（类型检查）通过。
- Next.js Production Build（Next.js 生产构建）通过。
- 浏览器根标签页标题包含 `Day 69` 与 `Production Knowledge & RAG Platform`。
- `/knowledge` 标签页标题包含 `Day 69` 与 `Knowledge Governance Explorer V2`。
