# Architecture Decision Records

| ADR | 决策 |
| --- | --- |
| [001](001-workflow-dag.md) | 使用 DAG 表达复杂工作流 |
| [002](002-mysql-vector-store.md) | MySQL 与 Vector Store 分工存储 |
| [003](003-redis-queue.md) | Redis Queue 承载异步调度 |
| [004](004-runtime-context.md) | 使用统一 Runtime Context |
| [005](005-durable-execution.md) | 工作流支持持久化执行 |
| [006](006-rag-rerank.md) | RAG 检索后执行 Rerank |
| [007](007-tenant-isolation.md) | 应用层与数据层双重租户隔离 |
| [008](008-feature-flags.md) | 使用确定性 Feature Flag 灰度 |
| [009](009-observability.md) | 统一日志、指标和链路关联 |
| [010](010-object-storage.md) | 使用对象存储管理大文件 |

状态：全部 Accepted（已接受），适用于 v1.0.0。
