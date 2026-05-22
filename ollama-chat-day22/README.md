# ollama-chat-day22

第 22 天：**Tool Registry + Dynamic Tool System**（Plugin-based Agent Runtime V1）。在 day21 **MySQL + Envelope + Upsert** 之上，将 Workflow 工具从 Executor `if/else` 升级为可插拔 **ToolRegistry**。

学习总结与测试：

- `day22_learning_summary.md` — 第 22 天 Tool Registry 实现说明与打卡
- `day22_test_cases.md` — 第 22 天测试用例（含 Upsert 回归）

## 快速开始

```bash
cd ollama-chat-day22
npm install
npm run dev
```

浏览器：**http://localhost:3000** — 右侧栏 **Tool Explorer** 展示已注册工具。

可选 MySQL（backend 持久化）：执行 `scripts/init-mysql.sql`，配置 `.env.local` 中 `MYSQL_*`。

## 目录要点（第 22 天新增/变更）

| 文件 | 说明 |
|------|------|
| `lib/tool-registry.ts` | `Tool` / `ToolRegistry` / `validateToolInput` |
| `lib/workflow-tools.ts` | 注册 weather / summary / todo / judge / chat |
| `lib/workflow-chat.ts` | chat 工具实现 |
| `lib/workflow-executor.ts` | `workflowToolRegistry.execute` 驱动 |
| `lib/workflow-planner.ts` | `formatToolsForPlanner` 动态 Prompt |
| `app/api/tools/route.ts` | `GET /api/tools` |
| `app/page.tsx` | Tool Explorer UI |

## 能力演进

```text
第21天  Persistent DAG + HITL + MySQL + Envelope + Upsert
第22天  … + Tool Registry + Schema + Validator + Tool Explorer
```
