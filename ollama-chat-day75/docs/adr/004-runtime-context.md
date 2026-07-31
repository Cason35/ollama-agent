# ADR-004：使用统一 Runtime Context

## Problem
Tenant、User、Trace、Budget 与权限信息若用散乱参数传递，容易遗漏或越权。
## Decision
在 API 边界创建不可变 Runtime Context，并贯穿 Agent、Workflow、Tool、Model 与存储调用。
## Alternatives
全局变量、请求局部对象、每层独立读取身份。
## Trade-off
获得一致审计与隔离，但需要明确 Context 生命周期并避免对象无限膨胀。
## Consequence
策略引擎、日志和配额使用同一身份来源，后台任务必须序列化最小上下文快照。
