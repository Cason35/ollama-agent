# ollama-chat-day21

第 21 天：**Persistent Conditional DAG + HITL + Pluggable Storage + MySQL 持久化**。在 day20 可插拔存储基础上，将服务端 `Map` mock 替换为 **MySQL**（`mysql2` 连接池 + `MySQLWorkflowStore`），`BackendWorkflowStore` 与 `/api/workflows*` 路径不变。

学习总结与测试：

- `day21_learning_summary.md` — 第 21 天实现说明与打卡
- `day21_test_cases.md` — 第 21 天手工测试用例（含 MySQL 验收）

## 快速开始

### 1. 安装依赖

```bash
cd ollama-chat-day21
npm install
```

### 2. 配置 MySQL

1. 复制环境变量：`cp .env.example .env.local`（Windows 可手动复制）
2. 在 MySQL 中执行：`scripts/init-mysql.sql`
3. 确认 `.env.local` 中 `MYSQL_*` 与本地实例一致
4.`cmd /c "mysql -u root -p < scripts\init-mysql.sql"`

### 3. 启动

```bash
npm run dev
```

浏览器：**http://localhost:3000**

Storage 选 **backend** 时，workflow 写入 MySQL；重启 `next dev` 后 `GET /api/workflows` 仍应能列出历史记录。

## 目录要点（第 21 天新增/变更）

| 文件 | 说明 |
|------|------|
| `lib/mysql.ts` | MySQL 连接池（仅服务端） |
| `lib/mysql-workflow-store.ts` | `save/get/list/delete/purgeExpired` |
| `lib/workflow-db.ts` | 委托 `mysqlWorkflowStore`（替代 Map） |
| `scripts/init-mysql.sql` | 建库建表（含 `extra_json` 存 HITL 字段） |
| `app/api/workflows/*` | 异步读写 MySQL，统一 `{ ok, code, data, msg }` 响应包 |
| `lib/api-envelope.ts` | `API_CODE` / `API_MSG` / `API_REASON` 查表与 `apiJsonSuccess` 等辅助函数 |

## 能力演进

```text
第20天  Pluggable Storage + 后端进程内 Map
第21天  Pluggable Storage + MySQL 持久化（重启不丢）
```
