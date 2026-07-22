# Day74 总体架构

## 目标

Day74 把 Day73 的多租户智能体平台从开发项目升级为可构建、可部署、可检查、可备份、可回滚和可发布的生产候选版本。

```text
User（用户）
  → Load Balancer（负载均衡器）
  → Next.js API / UI
  → Authentication / Tenant / RBAC / Quota
  → RuntimeContext
  → Agent Runtime
  → Workflow / Tools / Models
  → Memory / Knowledge / Evaluation
  → Observability / Audit

Next.js Application
  ├─ MySQL：用户、租户、工作流、记忆和知识元数据
  ├─ Redis：缓存、队列、锁和短期状态
  ├─ MinIO：文档、附件、导出和追踪附件
  └─ Ollama：宿主机模型推理服务
```

## 生产交付闭环

```text
Source Code
  → Lint / Type Check / Automated Tests
  → Next.js standalone Build
  → Docker Image
  → Database Migration
  → Startup Validation
  → Health / Ready / Live
  → Monitoring / Backup
  → Release Version / Feature Flag
```

## 关键目录

| 目录 | 职责 |
| --- | --- |
| `app/api/health` | 综合健康检查 |
| `app/api/ready` | Kubernetes 就绪探针 |
| `app/api/live` | Kubernetes 存活探针 |
| `app/api/production` | 生产仪表盘与功能开关 API |
| `lib/production` | 配置、健康、迁移、备份、版本、开关与启动校验 |
| `migrations` | MySQL 向上与回滚 SQL |
| `scripts` | 迁移、备份、恢复、压测与故障测试 |
| `docs` | 架构、运行时和部署说明 |
