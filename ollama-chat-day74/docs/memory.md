# Day74 Memory 架构

## 数据分层

- Short-term Memory：Redis，适合会话上下文、TTL 数据和快速读取。
- Long-term Memory：MySQL，适合租户用户边界、审计和长期恢复。
- Memory Attachment：MinIO，适合较大文本或二进制附件。

`migrations/004_memory.sql` 创建包含 `tenant_id`、`user_id`、重要性、元数据和时间戳的长期记忆表。

## Feature Flag

`enable_memory_merge` 默认全量开启，可通过 Day74 Production Dashboard 快速关闭。关闭功能开关不删除已有记忆，只停止新合并逻辑。

## 恢复原则

- MySQL 恢复长期事实数据。
- Redis RDB 恢复短期状态、队列和缓存。
- Redis 恢复后仍需依靠幂等键避免消息重复消费。
- 备份恢复演练必须验证租户隔离没有被破坏。
