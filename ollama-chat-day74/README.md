# Ollama Chat Day 74

Day 74 主题：Agent Platform Production Delivery & Release（智能体平台生产交付与发布）。

本项目完整继承 Day 73 的 Agent、Workflow、RAG、Memory、Prompt、Evaluation、Observability 与 Governance 业务代码，并新增：

- Production Configuration（生产配置）与密钥引用校验。
- Next.js standalone 多阶段 `Dockerfile`。
- MySQL、Redis、MinIO 与应用的 `docker-compose.yml`。
- 支持 `up / rollback / status` 的 MySQL Migration System（数据库迁移系统）。
- `/api/health`、`/api/ready`、`/api/live` 三类健康检查。
- 基于 Next.js Instrumentation 的 Startup Validation（启动校验）与 Fail Fast（快速失败）。
- GitHub Actions CI、统一 `test:all` 回归测试流水线。
- MySQL、Redis、MinIO Backup & Restore（备份与恢复）。
- Release Version System（发布版本系统）。
- Disabled、Enabled、Gradual Rollout 三种 Feature Flag（功能开关）。
- Day74 Production Dashboard（生产仪表盘）。
- 100 并发压力测试与 Redis 故障恢复测试脚本。

## 代码层验证

这部分不要求启动 MySQL、Redis、MinIO 或 Docker：

```bash
npm install
npm run typecheck
npm run test:day74
npm run lint
npm run build
```

## 本地开发启动

只运行页面与不依赖真实基础设施的功能：

```bash
npm run dev
```

访问：

- Day74 主工作台：`http://localhost:3000`
- Day74 Production Dashboard：`http://localhost:3000/production`
- Day74 Governance Capability：`http://localhost:3000/governance`
- 存活检查：`http://localhost:3000/api/live`

此时 MySQL、Redis 或 MinIO 尚未启动属于正常情况，`/api/health` 可能返回 `503`。

## 完整生产教学环境

完整启动步骤见 [docs/deployment.md](docs/deployment.md)。核心命令为：

```bash
Copy-Item .env.example .env
docker compose up -d --build
```

Compose 会先启动 MySQL、Redis 与 MinIO，再自动运行一次性 `migrate` 服务；只有迁移成功后才会启动 Day74 应用，无需在宿主机手动执行迁移。

## 验证入口

```bash
npm run test:all
npm run migration:status
npm run validate:startup
npm run backup
npm run load:test
npm run failure:test
```

详细用例见 [day74_test_cases.md](day74_test_cases.md)。

目标状态：

```text
Agent Platform v1.0.0-rc.1
智能体平台第 1.0 版发布候选版本
```
