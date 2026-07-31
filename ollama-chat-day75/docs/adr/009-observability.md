# ADR-009：统一日志、指标和链路关联

## Problem
Agent 请求跨越模型、工具、队列和工作流，仅靠文本日志难以定位质量或性能问题。
## Decision
使用 Trace ID 关联 Structured Log、Metric、Span、Error 与 Evaluation 结果。
## Alternatives
普通控制台日志、只采集基础设施指标、完全依赖供应商 APM。
## Trade-off
提升可诊断性和成本归因，但带来采样、存储费用与敏感数据治理要求。
## Consequence
日志默认脱敏，生产按策略采样，关键错误与审计事件不因普通采样而丢弃。
