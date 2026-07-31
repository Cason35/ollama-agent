# Agent Platform v1.0 Portfolio Package

## 包含内容

- Source Code：`app/`、`lib/`、`scripts/`、`tests/`、`migrations/` 与配置模板。
- Architecture：`docs/architecture.md` 的五张图与 `docs/adr/` 的十份决策记录。
- Documentation：README、部署、安全、运行时、工作流、RAG、Memory 与 API 文档。
- Demo：`docs/demo-story.md` 端到端研究智能体故事。
- Benchmark：测试协议、结构化结果与复现命令。
- Interview Material：30 组问答与技术亮点。
- Release：CHANGELOG、v1.0.0 元数据、安全检查和 Day75 测试用例。

## 不包含内容

真实密钥、`.env`、用户数据、备份、运行日志、`node_modules`、`.next` 和本机专属配置。

## 五分钟阅读路线

1. README 了解目标、能力和启动方式。
2. Architecture 看系统边界与五条核心链路。
3. ADR 理解重要选择及其成本。
4. Demo Story 看业务价值，Benchmark 看证据边界。
5. Security Checklist 与 CHANGELOG 判断发布成熟度。

## 发布清单

- [x] 项目名称 `ollama-chat-day75`，版本 `1.0.0`。
- [x] 文档、演示、基准、面试和安全材料齐备。
- [x] `npm run test:day75` 自动检查作品集结构。
- [ ] 在目标 Git 仓库创建不可变 `v1.0.0` Tag 与 Release（需仓库所有者明确执行）。
- [ ] 在目标生产环境完成容量、恢复、渗透和供应链验证。
