# ADR-003：Redis Queue 承载异步调度

## Problem
模型和工具调用耗时长，不能长期占用同步 HTTP 请求。
## Decision
使用 Redis Queue 保存待执行任务、重试信息和 Worker 协调状态。
## Alternatives
进程内队列、数据库轮询、Kafka 或云消息队列。
## Trade-off
Redis 易部署且延迟低，但持久性和超大规模吞吐不如专用消息平台。
## Consequence
任务事实状态仍持久化，Redis 故障恢复后允许安全重投，节点必须具备幂等键。
