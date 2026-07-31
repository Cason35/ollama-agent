# ADR-005：工作流支持持久化执行

## Problem
长任务会因进程重启、依赖故障或人工确认而中断，内存状态无法恢复。
## Decision
在节点边界持久化 Checkpoint、Event 与输出摘要，并支持 Resume 和 Replay。
## Alternatives
失败后整条重跑、只依赖队列重试、使用外部工作流引擎。
## Trade-off
显著提高恢复率并减少重复模型成本，但增加状态版本、幂等和兼容性设计。
## Consequence
节点输入输出需要可序列化，副作用工具必须提供幂等键或补偿策略。
