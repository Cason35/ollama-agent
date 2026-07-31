# Project Highlights

## README / 面试版

- 自研 Agent Runtime：统一 Planner、Tool Calling、Memory、Reflection 与 Trace，在不可变 Runtime Context 中贯穿租户、权限、预算和链路信息。
- Durable Workflow Engine：支持 DAG 校验、并行调度、Checkpoint、Replay、Resume、人工确认及幂等恢复。
- Production RAG Platform：实现 Query Rewrite、Hybrid Search、Rerank、Citation、Index Version 与知识治理闭环。
- AI Engineering Loop：Prompt 版本与实验、批量 Evaluation、Bad Case、Regression 和 Quality Gate 形成可持续优化闭环。
- Enterprise Governance：Tenant、RBAC、Quota、Audit、API Gateway 与数据层过滤共同提供纵深租户隔离。
- Production Delivery：使用 Docker Compose 编排 MySQL、Redis、MinIO 与应用，配套 Migration、Health、Startup Validation、Backup、Feature Flag 和 CI。

## 简历精简版

设计并实现模块化 Agent Platform，覆盖 Agent Runtime、DAG 持久化工作流、生产级 RAG、长期记忆、评估回归、可观测性与多租户治理；通过统一运行时上下文、检查点恢复、引用溯源、质量门禁和 Docker 化交付，将本地 LLM Chat 演进为可测试、可解释和可维护的 v1.0 工程作品集。

## 可量化表达原则

只引用 `benchmark/results.json` 中有环境、数据、参数和执行次数支撑的结果；未经真实环境执行的项目标为“代码层验证”或“待 Docker 演练”，不把模拟数据描述为生产成绩。
