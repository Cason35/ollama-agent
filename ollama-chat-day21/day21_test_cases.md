# 21 天 Ollama Agent 课程 · 第 21 天测试用例（MySQL 持久化）

> 面向 **`ollama-chat-day21`**。第 20 天用例见 `day20_test_cases.md`；本文 **§2** 为第 21 天必测项。

---

## 0. 测试前准备（day21）

### 0.1 MySQL 环境

| 项 | 要求 |
|----|------|
| MySQL 版本 | 5.7+ 或 8.x（支持 JSON 列） |
| 数据库名 | `agent_runtime`（可改，需与 `.env.local` 一致） |
| 初始化脚本 | 执行 `scripts/init-mysql.sql` |

```bash
# 示例（按本地客户端调整）
mysql -u root -p < scripts/init-mysql.sql
```

### 0.2 环境变量

复制 `.env.example` 为 `.env.local`，填写：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=<你的密码>
MYSQL_DATABASE=agent_runtime
```

### 0.3 启动项目

```bash
cd ollama-chat-day21
npm install
npm run dev
```

浏览器：**http://localhost:3000**

### 0.4 第 21 天验收焦点

| 对比项 | day20（Map mock） | day21（MySQL） |
|--------|-------------------|----------------|
| 重启 `next dev` | backend 数据丢失 | backend 数据**仍在** |
| 物理存储 | 进程内 `Map` | `workflows` 表 |
| purge | JS 遍历 `updatedAt` | `DELETE ... INTERVAL 7 DAY` |

### 0.5 调试与排错

- API 返回 500：检查 MySQL 是否启动、`.env.local` 是否正确、是否已建表。
- Network：`POST/GET /api/workflows` 应 200；body 含 `version: 1`。
- 控制台：`[WorkflowStore] save/get/list`（前端 Store 日志）。

---

## 1. 用例总览

| 编号 | 主题 | 优先级 |
|------|------|--------|
| TC-21-01 | MySQL 连接与建表 | ⭐ 必测 |
| TC-21-02 | backend save + list API | ⭐ 必测 |
| TC-21-03 | 重启 dev 后数据仍在 | ⭐ 必测 |
| TC-21-04 | get / delete 单条 | 必测 |
| TC-21-05 | purgeExpired 7 天清理 | 建议 |
| TC-21-06 | HITL paused 经 backend 恢复 | 建议 |
| TC-21-07 | local 与 backend 数据隔离 | 回归 |
| TC-21-08 | curl 直接测 API | 可选 |

---

## 2. 第 21 天详细用例

### TC-21-01 MySQL 连接与建表（必测 ⭐）

**目的：** 确认依赖与 schema 就绪。

**步骤：**

1. `npm install` 后 `package.json` 含 `mysql2`。
2. 执行 `scripts/init-mysql.sql`，无报错。
3. MySQL 客户端：`SHOW TABLES FROM agent_runtime;` 可见 `workflows`。
4. `DESCRIBE workflows;` 含列：`id`, `goal`, `status`, `version`, `steps`, `step_outputs`, `timeline`, `memory_snapshot`, `extra_json`, `created_at`, `updated_at`。

**通过标准：** 表存在且 JSON 列类型正确。

---

### TC-21-02 backend save + list（必测 ⭐）

**目的：** `MySQLWorkflowStore.save` + `list` 经 API 可用。

**前置：** Storage = `backend`；Ollama 可用；勾选 **多步 Workflow**。

**步骤：**

1. 发送：`帮我整理今天学习内容，并生成最终提交版总结`。
2. 完成 HITL 确认直至 workflow 结束或 paused。
3. DevTools → Network：
   - `POST /api/workflows` → 200，`{ ok: true, workflowId }`。
   - `GET /api/workflows` → 200，数组含刚保存项。
4. MySQL：`SELECT id, goal, status FROM workflows ORDER BY updated_at DESC LIMIT 5;` 可见对应行。

**通过标准：** API 200；表中有记录；`version` 为 1。

---

### TC-21-03 重启 dev 后数据仍在（必测 ⭐）

**目的：** 验证 MySQL 持久化（day20 Map 做不到）。

**步骤：**

1. 在 TC-21-02 完成后记下 `workflowId`（Network 或侧栏）。
2. **停止** `npm run dev`（Ctrl+C），再 **重新启动** `npm run dev`。
3. 页面 Storage 仍为 `backend`，打开 **历史 Workflow** 侧栏。
4. 或 `curl http://localhost:3000/api/workflows` 检查 JSON 仍含该 id。

**通过标准：** 重启后列表/GET 仍能读到同一 `workflowId`（MySQL 未清空）。

---

### TC-21-04 get / delete 单条（必测）

**目的：** `get` 与 `delete` 路由正确。

**步骤：**

1. `GET /api/workflows/<workflowId>` → HTTP 200，body `{ ok: true, code: 200, data: <WorkflowState>, msg: "success" }`，`steps`/`status` 与保存时一致。
2. `DELETE /api/workflows/<workflowId>` → HTTP 200，`{ ok: true, code: 200, data: { workflowId, deleted: true }, msg: "success" }`。
3. 再次 `GET` 同 id → HTTP 200，`{ ok: true, code: 200, data: null, msg: "not found" }`（不再 HTTP 404）。
4. MySQL：`SELECT * FROM workflows WHERE id = '<workflowId>';` → 空。

**通过标准：** 删除后 API 与表均无记录；GET 未命中仍为 200 + `data: null`。

---

### TC-21-05 purgeExpired（建议）

**目的：** SQL `DATE_SUB(NOW(), INTERVAL 7 DAY)` 清理。

**方式 A — 改库模拟过期：**

1. 插入或更新一条测试记录，将 `updated_at` 设为 8 天前：
   ```sql
   UPDATE workflows SET updated_at = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE id = '<test-id>';
   ```
2. `POST /api/workflows/purge` → 200，`{ ok: true, code: 200, data: { removed: >= 1 }, msg: "success" }`。
3. 该 id 不再出现在 `GET /api/workflows`。

**方式 B — 仅冒烟：**

1. 无过期数据时 `POST /api/workflows/purge` → `removed: 0`。

**通过标准：** 过期行被删；未过期行保留。

---

### TC-21-06 HITL paused 经 backend 恢复（建议）

**目的：** `extra_json` 保留 `paused` / `memory` 供刷新恢复。

**步骤：**

1. backend 模式跑 workflow，停在 Step2 `waiting_confirmation`（不要点确认）。
2. 确认已 `POST /api/workflows`（paused 状态）。
3. 硬刷新页面：紫卡与确认按钮仍在；侧栏状态为 paused。
4. MySQL：`SELECT extra_json FROM workflows WHERE id = '<id>';` 含 `"paused":true` 等字段。

**通过标准：** 刷新可恢复 HITL；与 day20 local 行为一致，但数据来自 MySQL。

---

### TC-21-07 local 与 backend 隔离（回归）

**目的：** 两种 Store 物理存储不同。

**步骤：**

1. local 模式完成 workflow A。
2. 切 backend：侧栏无 A（除非 backend 也存过）。
3. backend 完成 B，重启 dev：B 仍在。
4. 切回 local：仅有 A，无 B。

**通过标准：** 隔离正确；backend 重启不丢 B。

---

### TC-21-08 curl 直接测 API（可选）

**最小 JSON 快照示例：**

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d "{\"version\":1,\"workflowId\":\"test-curl-001\",\"status\":\"pending\",\"goal\":\"curl测试\",\"steps\":[],\"stepOutputs\":{},\"timeline\":[],\"createdAt\":1700000000000,\"updatedAt\":1700000000000}"

curl http://localhost:3000/api/workflows/test-curl-001

curl -X DELETE http://localhost:3000/api/workflows/test-curl-001
```

**通过标准：** POST → GET 200（`data` 有值）→ DELETE 200 → GET 200（`data: null`, `msg: "not found"`）。

**响应约定：** 所有 `/api/*` 统一 `{ ok, code, data, msg }`；`code`/`msg` 查表见 `lib/api-envelope.ts`（`API_CODE` / `API_MSG` / `API_REASON`）。

---

## 3. 第 21 天打卡模板

```text
【第21天打卡】

1. 是否安装 mysql2：是 / 否
2. 是否创建 MySQL 数据库：是 / 否
3. 是否创建 workflows 表：是 / 否

4. 是否实现 mysql pool：是 / 否
5. 是否实现 MySQLWorkflowStore：是 / 否

6. 是否替换后端 mock store：是 / 否
7. 是否支持 save / get / list / delete：是 / 否

8. 服务重启后 workflow 是否仍存在：是 / 否
9. purgeExpired 是否正常：是 / 否

10. 遇到的最大问题：

11. 当前系统能力：
```

---

## 4. 相关源码索引（day21）

| 文件 | 职责 |
|------|------|
| `lib/mysql.ts` | 连接池 |
| `lib/mysql-workflow-store.ts` | CRUD + purge + `toWorkflowState` |
| `lib/workflow-db.ts` | API 层委托 |
| `lib/backend-workflow-store.ts` | 前端 fetch `/api/workflows*` |
| `app/api/workflows/route.ts` | GET list / POST save |
| `app/api/workflows/[id]/route.ts` | GET / DELETE |
| `app/api/workflows/purge/route.ts` | POST purge |
| `scripts/init-mysql.sql` | 建库建表 |
| `day21_learning_summary.md` | 学习总结 |

---

*文档版本：2026-05-21；第 21 天用例在 day21 项目内执行，需本地 MySQL。*
