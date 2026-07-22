# Day74 Workflow 架构

## 继承能力

Day74 保留 Day70 Durable Agent Workflow Platform 的 DAG、Checkpoint、Pause、Resume、Replay、Event Timeline 和 Failure Recovery 能力。

## 生产持久化

`migrations/003_workflow.sql` 创建与 `MySQLWorkflowStore` 兼容的 `workflows` 表，保存：

- 目标、状态和结构版本。
- 步骤、步骤输出和时间线 JSON。
- 记忆快照。
- 暂停状态、待确认步骤、最终摘要和执行批次。

迁移系统提供：

```bash
npm run migration:up
npm run migration:status
npm run migration:rollback
```

## 故障恢复

Redis Queue 保存 Waiting、Processing、Completed 和 Dead Letter 状态；Worker 通过可见性超时与分布式锁恢复过期任务。故障测试会主动停止 Redis，验证健康发现和服务恢复。

长任务验收应至少覆盖：Checkpoint 写入、进程重启、Resume 恢复、重复执行幂等性和最终时间线完整性。
