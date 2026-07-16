# Day68 Production Memory Platform 测试用例

## 一、测试目标

验证第 68 天 Production Memory Platform（生产级记忆平台）是否完整实现以下能力：

1. `ProductionMemoryItem`、Memory Scope（记忆作用域）与生命周期字段。
2. `RedisSessionMemoryProvider` 和 `PersistentLongTermMemoryProvider`。
3. Redis 会话三键模型、TTL 和最近条数上限。
4. MySQL 元数据持久化与 VectorStore 语义索引协同。
5. Session、Long-Term、Workspace 三路统一检索和五分量评分。
6. 重复记忆合并、新状态替代和矛盾记忆人工审核。
7. Workspace Memory Archive（工作空间记忆归档）。
8. RuntimeContext、EventBus、UnifiedRegistry 集成。
9. Memory Governance Explorer 的筛选、归档、遗忘、固定、合并与冲突处理。
10. Production Memory Metrics（生产记忆指标）和完整端到端链路。

## 二、测试环境

- 项目目录：`ollama-chat-day68`
- Node.js：建议 20 或更高版本
- Next.js：16.2.4
- 默认自动化测试：使用内存适配器隔离外部 Redis 与 MySQL
- 基础设施联调：可选启动真实 Redis 与 MySQL

基础命令：

```bash
npm install
npm run test:day68
npx tsc --noEmit
npm run lint
npm run build
```

## 三、自动化端到端用例

自动化脚本：`scripts/test-day68-production-memory-platform.ts`

### PM-E2E-01：同 Session 会话记忆命中

前置条件：创建 `session-a`，会话 Provider 使用 10 秒 TTL 的测试后端。

步骤：

1. 写入“我当前项目使用 MySQL。”。
2. 使用相同 `sessionId` 询问“我现在数据库用的是什么？”。
3. 关闭 Long-Term 与 Workspace 检索。

预期：

- 创建 `memory:session:session-a:items`。
- 创建 `memory:session:session-a:summary`。
- 创建 `memory:session:session-a:meta`。
- 检索结果来自 `redis-session`。
- 命中第一轮写入的数据库事实。

### PM-E2E-02：跨 Session 长期偏好

步骤：

1. 在 Session A 写入“以后代码优先使用 TypeScript。”，作用域为 `user/user-a`。
2. 新建 Session B。
3. 在 Session B 询问“帮我写一个工具类。”。

预期：

- 记忆正文与元数据进入长期 Provider。
- VectorStore 数量增加。
- Session B 不依赖 Session A 的 Redis 数据。
- 检索结果包含 `user/user-a` 的 TypeScript 偏好。

### PM-E2E-03：Workspace 高价值归档

步骤：

1. 写入高重要性 `fact`。
2. 写入带 `draft` 标签的低重要性 `task_state`。
3. 写入高重要性 `lesson`。
4. 调用 `archiveWorkspace("workspace-a", "user-a")`。

预期：

- 扫描 3 条工作空间记忆。
- `fact` 与 `lesson` 沉淀到用户长期记忆。
- 临时草稿不进入用户长期记忆。
- 原工作空间 3 条记忆全部变为 `archived`。

### PM-E2E-04：重复记忆自动合并

步骤：连续两次写入“用户偏好中文回答。”。

预期：

- 第二次写入的 `created` 为 `false`。
- 只保留一条 `active` 记忆。
- 合并 `confidence`、`accessCount`、`tags` 和 `source`。
- 生成 `duplicate / merge / resolved` 冲突记录。
- 发布 `memory.conflict_detected` 与 `memory.consolidated` 事件。

### PM-E2E-05：矛盾记忆人工审核

步骤：

1. 写入“用户偏好简洁回答。”。
2. 写入“用户希望提供非常详细的教学步骤。”。
3. 在治理流程中选择 `keep_existing`。

预期：

- 检测 `contradiction`。
- 初始结论为 `manual_review`。
- 初始状态为 `pending`。
- 人工处理后已有记忆保持 `active`。
- 候选记忆变为 `archived`。
- 冲突状态变为 `resolved`。

### PM-E2E-06：Redis TTL 不影响长期记忆

步骤：

1. 写入 `ttl-session` 会话记忆。
2. 写入 `ttl-user` 长期记忆。
3. 推进测试时钟超过 Redis 键 TTL。

预期：

- 会话记忆不可再读取。
- 长期记忆仍为 `active`。
- 不发生会话数据向长期存储的无条件复制。

### PM-E2E-07：RuntimeContext 注入

步骤：

1. 构建包含 `userId`、`sessionId`、`agentId` 的 `RuntimeContextV2`。
2. 调用 `getContextForRuntime()`。

预期：

- `runtimeContext.memoryContext` 被写入。
- 包含 `sessionMemories`、`longTermMemories`、`workspaceMemories`。
- 包含 `retrievedMemoryIds`。
- 包含统一检索策略说明。

### PM-E2E-08：EventBus 生命周期事件

预期至少出现：

- `memory.read`
- `memory.write`
- `memory.consolidated`
- `memory.conflict_detected`
- `memory.archived`

执行 Forget（遗忘）操作后还应出现 `memory.deleted`。

### PM-E2E-09：UnifiedRegistry 能力注册

预期注册 4 个 `day68.v1` 记忆能力：

1. `memory:provider:redis-session`
2. `memory:provider:persistent-long-term`
3. `memory:service:production`
4. `memory:strategy:consolidation`

### PM-E2E-10：生产记忆指标

预期：

- `retrievalCount` 随统一检索增加。
- `retrievalHitRate` 在有命中时大于 0。
- `deduplicationCount` 在重复写入后增加。
- `conflictCount` 在矛盾检测后增加。
- `archiveCount` 在工作空间归档与人工审核后增加。
- `usedMemoryCount` 与调用方确认使用的去重记忆数量一致。

## 四、API 测试用例

### PM-API-01：读取治理快照

请求：

```http
GET /api/production-memory
```

预期响应：

- `ok = true`
- 包含 `items`、`conflicts`、`metrics`、`providers`
- 包含 `registryItems`、`events`、`lastRetrieval`

### PM-API-02：新增会话记忆

请求体：

```json
{
  "action": "write",
  "memory": {
    "scope": "session",
    "scopeId": "manual-session",
    "type": "fact",
    "content": "手动测试会话使用 PostgreSQL。",
    "importance": 0.8,
    "confidence": 0.9,
    "tags": ["manual-test"]
  }
}
```

预期：新记忆状态为 `active`，带默认 7 天 `expiresAt`。

### PM-API-03：统一检索

请求体：

```json
{
  "action": "retrieve",
  "search": {
    "query": "数据库是什么？",
    "sessionId": "manual-session",
    "userId": "day68-user",
    "workspaceId": "research-day68",
    "agentId": "chat",
    "topK": 8,
    "minScore": 0.12
  }
}
```

预期：`lastRetrieval.results` 包含最终分和五个评分分量。

### PM-API-04：归档记忆

请求体：

```json
{ "action": "archive", "id": "目标记忆 ID" }
```

预期：目标状态变为 `archived`，`archiveCount` 增加并产生 `memory.archived`。

### PM-API-05：遗忘记忆

请求体：

```json
{ "action": "forget", "id": "目标记忆 ID" }
```

预期：目标状态变为 `deleted`；长期记忆对应向量被移除；产生 `memory.deleted`。

### PM-API-06：固定记忆

请求体：

```json
{ "action": "pin", "id": "目标记忆 ID", "pinned": true }
```

预期：`pinned = true`、包含 `pinned` 标签、`importance = 1`。

### PM-API-07：合并记忆

请求体：

```json
{
  "action": "merge",
  "primaryId": "主记忆 ID",
  "secondaryId": "次记忆 ID"
}
```

预期：

- 只能合并相同 Scope 与 Scope ID 的记忆。
- 主记忆合并正文、分数、访问、标签、来源和 `consolidatedFrom`。
- 次记忆变为 `archived`。

### PM-API-08：人工解决冲突

请求体：

```json
{
  "action": "resolve_conflict",
  "conflictId": "冲突 ID",
  "resolution": "keep_existing"
}
```

允许的最终结论：`keep_existing`、`replace`、`merge`。

### PM-API-09：工作空间归档

请求体：

```json
{
  "action": "archive_workspace",
  "workspaceId": "research-day68",
  "targetUserId": "day68-user"
}
```

预期：高价值条目沉淀到用户长期记忆，草稿与低价值任务状态被跳过。

## 五、Memory Governance Explorer 手工用例

### PM-UI-01：标签页与标题

- 浏览器标签页显示 `Day 68 - Memory Governance Explorer | 生产级记忆平台`。
- 页面显示 `DAY 68`。
- 页面显示 `Production Upgrade V5`。
- 页面主标题显示 `Production Memory Platform 生产级记忆平台`。

### PM-UI-02：作用域与类型筛选

- Scope 选择 `workspace` 时只显示工作空间记忆。
- Type 选择 `lesson` 时只显示教训记忆。
- 两个筛选同时生效。

### PM-UI-03：记忆治理字段

每张记忆卡至少展示：

- Scope 与 Scope ID
- Type 与 Content
- Importance 与 Confidence
- Status 与 Version
- Source Trace
- Last Accessed
- Expires At
- Access Count

### PM-UI-04：Provider 状态

- 未启动 Redis 时显示 `memory-fallback`。
- 未配置 MySQL 时显示 `memory-fallback`。
- 页面仍可完整演示生产记忆业务。
- 启动真实基础设施后刷新页面，应显示 `redis` 与 `mysql`。

### PM-UI-05：冲突人工审核

- 进入“冲突审核”标签页。
- 待处理冲突显示 Existing 与 Candidate ID。
- 可以选择“保留已有”“采用候选”“合并两条”。
- 操作后冲突状态变为 `resolved`。

### PM-UI-06：事件审计

- 进入“事件审计”标签页。
- 可以看到事件时间、类型、Trace ID、Runtime Context ID、投递状态和安全 Payload 摘要。
- Payload 不应包含密码、Token 或数据库凭据。

## 六、异常与边界用例

### PM-EDGE-01：空正文

预期：拒绝写入并返回 `ProductionMemoryItem.content 不能为空`。

### PM-EDGE-02：空 Scope ID

预期：拒绝写入并返回 `ProductionMemoryItem.scopeId 不能为空`。

### PM-EDGE-03：分数越界

预期：`importance` 或 `confidence` 不在 0 到 1 之间时拒绝写入。

### PM-EDGE-04：乐观并发冲突

步骤：使用旧 `expectedVersion` 更新同一记忆。

预期：Provider 返回明确的版本冲突错误，不覆盖新版本。

### PM-EDGE-05：跨 Scope 合并

预期：不同用户、会话或工作空间的记忆不能合并。

### PM-EDGE-06：Redis 故障降级

预期：

- 首次 Redis 操作失败后自动切换到 `memory-fallback`。
- `providerErrors` 增加。
- API 和治理页面继续可用。

### PM-EDGE-07：MySQL 故障降级

预期：

- 未配置或连接失败时自动切换到内存元数据存储。
- VectorStore 仍可为当前进程内数据建立语义索引。
- `providerErrors` 增加。

## 七、验收结论记录

| 验收项 | 结果 | 备注 |
| --- | --- | --- |
| ProductionMemoryItem 与 Scope | 待填写 |  |
| 两类 MemoryProvider | 待填写 |  |
| ProductionMemoryService | 待填写 |  |
| Redis Session Memory | 待填写 |  |
| MySQL + VectorStore | 待填写 |  |
| Unified Retrieval Pipeline | 待填写 |  |
| Deduplication / Conflict Resolution | 待填写 |  |
| Workspace Archive | 待填写 |  |
| RuntimeContext / EventBus / Registry | 待填写 |  |
| Memory Governance Explorer | 待填写 |  |
| Production Memory Metrics | 待填写 |  |
| End-to-End Test | 待填写 |  |
