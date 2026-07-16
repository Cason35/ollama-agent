# Ollama Chat Day 68

Day 68 在 Day 67 Production Prompt Platform（生产级提示词平台）基础上进入 Production Upgrade V5（生产化升级第5版），核心主题是 Production Memory Platform（生产级记忆平台）。

项目完整保留 Day 67 的 Chat、Workflow、Agent、Tool、Model、Prompt、RAG、Evaluation、Runtime Context、Event System、Unified Registry、Redis、Queue、Lock、Storage、Config 和 Secrets 能力，并新增：

- `ProductionMemoryItem`：统一记忆作用域、业务类型、来源、生命周期、TTL、访问统计和乐观并发版本。
- `MemoryProvider`：解耦生产记忆服务与 Redis、MySQL、VectorStore 等具体存储。
- `RedisSessionMemoryProvider`：通过 `items`、`summary`、`meta` 三键模型保存会话记忆，支持 TTL、最近条数上限和故障降级。
- `PersistentLongTermMemoryProvider`：MySQL 保存正文与治理元数据，VectorStore 保存 Embedding 和语义索引。
- `ProductionMemoryService`：统一提供写入、检索、整合、工作空间归档、遗忘、固定、合并和 RuntimeContext 注入。
- `Memory Retrieval Pipeline`：并行召回 Session、Long-Term 与 Workspace 记忆，执行五分量评分、去重、排序和 TopK 截断。
- `Memory Deduplication / Conflict Resolution`：支持重复自动合并、新状态替代旧状态和不确定冲突人工审核。
- `Workspace Memory Archive`：只把高价值事实、偏好、经验、决策和教训沉淀到长期记忆。
- `RuntimeContext / EventBus / UnifiedRegistry` 集成：让记忆具备运行时注入、生命周期事件审计和动态能力发现。
- `Memory Governance Explorer`：展示记忆资产、Provider、指标、评分、来源 Trace、冲突和事件，并支持 Archive、Forget、Pin、Merge 与人工冲突处理。
- `GET/POST/PATCH /api/production-memory`：提供治理快照、写入、检索、工作空间归档和生命周期操作接口。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 68 主应用；打开 `http://localhost:3000/memories` 可直接进入 Memory Governance Explorer；打开 `http://localhost:3000/prompts` 可查看继承的 Prompt Explorer V2。

未配置 Redis 或 MySQL 时，治理页面会明确显示 `memory-fallback`。配置 `REDIS_URL`、`MYSQL_HOST`、`MYSQL_USER`、`MYSQL_PASSWORD` 和 `MYSQL_DATABASE` 后，Provider 会使用真实基础设施。

## 测试

```bash
npm run test:day68
npx tsc --noEmit
npm run lint
npm run build
```

完整人工与自动化测试用例见 `day68_test_cases.md`。
