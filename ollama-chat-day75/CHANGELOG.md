# Changelog

## v1.0.0 — 2026-07-29

Agent Platform 首个正式作品集版本。

### Added

- Agent Runtime：Planner、Tool Calling、Memory、Reflection 与 Trace。
- Workflow Engine：DAG、Checkpoint、Replay、Resume 与 Durable Execution。
- RAG Platform：Hybrid Search、Rerank、Citation 与 Index Version。
- Memory System：Session Memory、Long-Term Memory 与治理能力。
- Evaluation Platform：数据集、批量评估、回归、坏案例与质量门禁。
- Observability：结构化日志、指标、链路、错误、告警与采样。
- Governance：Tenant、RBAC、Permission、Quota、Audit 与 API Gateway。
- Deployment：Docker Compose、Migration、Health Check、Backup / Restore、CI 与 Feature Flag。
- Day75 Portfolio：README、10 份 ADR、5 张图、Demo、Benchmark、30 组面试问答、安全记录与自动验收。

### Release Notes

- 版本由 `1.0.0-rc.1` 提升为 `1.0.0`。
- 发布包不包含 `.env`、备份、运行日志、依赖目录或构建产物。
- 真实生产部署仍应执行组织级渗透测试、依赖审计、容量规划和灾难恢复演练。
