# ADR-007：应用层与数据层双重租户隔离

## Problem
共享平台最严重风险之一是 Tenant A 读取或修改 Tenant B 数据。
## Decision
Runtime Context 强制携带 Tenant ID，权限服务先授权，存储查询与 Key Prefix 再执行租户过滤。
## Alternatives
只依赖前端隐藏、每租户独立部署、只在数据库层过滤。
## Trade-off
纵深隔离降低越权风险，但增加测试矩阵和所有存储适配器的约束。
## Consequence
跨租户访问默认拒绝并写入审计日志，自动测试必须包含 A/B 正反向用例。
