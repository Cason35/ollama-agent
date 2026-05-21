# 第21天学习总结：MySQL 持久化 Workflow

对照 `ollama-chat-day20/day20_learning_summary.md` §8 学习计划，本仓库 **`ollama-chat-day21`** 在 day20 **Pluggable Storage** 之上将后端 **`Map` mock** 替换为 **MySQL** 存储。

---

## 1. 核心认知

第20天已抽象 `WorkflowStore`；第21天**只换服务端实现**：

- `BackendWorkflowStore`（`lib/backend-workflow-store.ts`）**未改 API 路径**
- `app/api/workflows/*` 仍暴露 REST，内部改为 `MySQLWorkflowStore`
- `local` 模式仍走 `LocalWorkflowStore` + `localStorage`

能力演进：

```text
第20天  Persistent Conditional DAG + HITL + Pluggable Storage（后端 Map mock）
第21天  Persistent Conditional DAG + HITL + Pluggable Storage + MySQL 持久化
```

---

## 2. 实现清单

| 任务 | 文件 | 状态 |
|------|------|------|
| 安装 `mysql2` | `package.json` | ✅ |
| 环境变量 | `.env.example` → `.env.local` | ✅ 模板 |
| 建库建表 | `scripts/init-mysql.sql` | ✅ |
| 连接池 | `lib/mysql.ts` | ✅ |
| `MySQLWorkflowStore` | `lib/mysql-workflow-store.ts` | ✅ |
| 替换 Map mock | `lib/workflow-db.ts` 委托 | ✅ |
| API 异步 + 错误处理 | `app/api/workflows/*` | ✅ |

### 2.1 表结构说明

学习计划中的 `workflows` 表已实现；另增 **`extra_json`** 列，用于存放 day20 Map 中的 HITL 扩展字段（`paused`、`waitingStepId`、`memory` 等），避免 confirm 续跑能力退化。

---

## 3. 第21天打卡

```text
【第21天打卡】

1. 是否安装 mysql2：是
2. 是否创建 MySQL 数据库：需本地执行 init-mysql.sql
3. 是否创建 workflows 表：是（见 scripts/init-mysql.sql）

4. 是否实现 mysql pool：是（lib/mysql.ts）
5. 是否实现 MySQLWorkflowStore：是（lib/mysql-workflow-store.ts）

6. 是否替换后端 mock store：是（lib/workflow-db.ts）
7. 是否支持 save / get / list / delete：是

8. 服务重启后 workflow 是否仍存在：backend 模式下重启 next dev 后应仍在（需 MySQL 已连接）
9. purgeExpired 是否正常：是（SQL INTERVAL 7 DAY）

10. 遇到的最大问题：（自填）

11. 当前系统能力：
Persistent Conditional DAG Runtime + HITL + Pluggable Storage + MySQL 持久化
```

---

*实现日期：2026-05-21；测试步骤见 `day21_test_cases.md`。*
