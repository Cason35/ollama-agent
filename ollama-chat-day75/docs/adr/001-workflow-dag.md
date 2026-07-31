# ADR-001：使用 DAG 表达复杂工作流

## Problem
多步骤 Agent 任务存在依赖、并行和失败传播关系，线性脚本无法稳定表达。
## Decision
使用经过环检测和依赖校验的 DAG；调度器只运行依赖已完成的节点。
## Alternatives
线性 Pipeline、自由递归 Agent、外部工作流 SaaS。
## Trade-off
获得可视化、并行和确定性，但增加图校验、状态管理和调试成本。
## Consequence
所有复杂任务统一为节点与边，Durable Execution 可围绕节点边界保存检查点。
