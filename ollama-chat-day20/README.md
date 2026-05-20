# ollama-chat-day20

基于 [Next.js](https://nextjs.org) App Router 的智能对话 Demo：支持**长期记忆**、**意图路由**（闲聊 / 天气 / 总结 / 待办）、**多步工作流**（并行 DAG、条件分支、HITL 人工确认、**可插拔持久化** local / backend）。模型可走本地 **Ollama** 或小米 **MiMo** OpenAI 兼容接口。

更完整的学习笔记与测试用例见：`day20_learning_summary.md`、`day20_test_cases.md`（第 19 天演进见 `day19_*`）。

---

## 项目目录结构

```
ollama-chat-day20/
├── app/                          # Next.js App Router（页面与 API 路由）
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # POST /api/chat：聊天入口（编排层，业务在 lib/）
│   │   ├── workflow/
│   │   │   └── confirm/
│   │   │       └── route.ts      # POST /api/workflow/confirm：HITL 确认/取消后续跑
│   │   └── workflows/
│   │       ├── route.ts          # GET/POST /api/workflows：列表与保存快照
│   │       ├── purge/
│   │       │   └── route.ts      # POST /api/workflows/purge：清理 7 天过期记录
│   │       └── [id]/
│   │           └── route.ts      # GET/DELETE /api/workflows/:id：单条读写
│   ├── layout.tsx                # 根布局（字体、全局 HTML 结构）
│   ├── page.tsx                  # 首页：聊天 UI、记忆侧栏、工作流卡片、HITL 与 Storage 切换
│   ├── globals.css               # 全局样式（Tailwind 等）
│   └── favicon.ico               # 站点图标
│
├── lib/                          # 服务端可复用逻辑（由 route 拆分而来）
│   ├── chat-types.ts             # 聊天 API 专用类型（消息、路由 action、响应体等）
│   ├── chat-memory.ts            # 记忆管线：短期窗口、长期条目、压缩与 buildMemory
│   ├── chat-routing.ts           # 意图路由：解析模型 JSON、延续语义、路由 system 提示词
│   ├── chat-tools.ts             # 单步工具：天气、总结、待办、闲聊兜底
│   ├── model-runtime.ts          # Ollama / MiMo 统一补全与 buildModelRuntime
│   ├── mimo-models.ts            # 小米 MiMo 模型 id 白名单与前端下拉配置
│   ├── workflow-types.ts         # 工作流类型（Step、Workflow、WorkflowState、HITL 等）
│   ├── workflow-planner.ts       # Planner：需求拆步、解析 JSON、步骤内 chat
│   ├── workflow-validate.ts      # 进入执行前的静态校验与 repairWorkflow
│   ├── workflow-executor.ts      # 并行 DAG 执行、条件分支、HITL 暂停与最终汇总
│   ├── workflow-pause-store.ts   # 内存级暂停上下文（供 confirm API 续跑）
│   ├── workflow-log.ts           # Workflow 结构化控制台日志
│   ├── workflow-store.ts         # WorkflowStore 接口与 createWorkflowStore 工厂
│   ├── local-workflow-store.ts   # local 实现：浏览器 localStorage + 索引
│   ├── backend-workflow-store.ts # backend 实现：fetch /api/workflows*
│   ├── workflow-db.ts            # 服务端内存 Map（backend API 的数据层 mock）
│   ├── workflow-persistence-constants.ts  # 版本号、过期时间、localStorage 键名
│   └── workflow-persistence.ts   # 快照 build/summary/恢复；经 WorkflowStore 读写
│
├── public/                       # 静态资源（SVG 图标等，通过 URL 直接访问）
├── scripts/
│   └── assemble-lib.mjs          # 开发用：从旧版单文件 route 组装 lib 的脚本（可选）
│
├── day19_learning_summary.md     # 第 19 天：持久化 + HITL（localStorage 直写）
├── day19_test_cases.md           # 第 19 天手工测试用例
├── day20_learning_summary.md     # 第 20 天：Pluggable Storage 与学习总结
├── day20_test_cases.md           # 第 20 天手工测试用例（local / backend 切换）
├── package.json                  # 依赖与 npm scripts
├── tsconfig.json                 # TypeScript 配置（@/* 路径别名指向项目根）
├── next.config.ts                # Next.js 配置
├── postcss.config.mjs            # PostCSS（Tailwind v4）
├── eslint.config.mjs             # ESLint 规则
├── AGENTS.md / CLAUDE.md         # 给 AI 助手的项目说明（Next.js 版本提示等）
└── .env.local                    # 本地环境变量（勿提交密钥，见下方说明）
```

### 各目录 / 文件职责说明

| 路径 | 作用 |
|------|------|
| **`app/api/chat/route.ts`** | 唯一主聊天 API：解析请求、构建记忆、分支到「单步路由」或「工作流」；对外 re-export 部分 workflow 符号供 confirm 使用。 |
| **`app/api/workflow/confirm/route.ts`** | 用户在工作流暂停（HITL）后点击确认或取消；从 `workflow-pause-store` 取上下文并调用 `executeWorkflow` 续跑。 |
| **`app/api/workflows/*`** | 第 20 天 backend 存储 mock：`GET/POST` 列表与保存、`GET/DELETE` 单条、`POST purge` 过期清理；数据在 `workflow-db.ts` 进程内 Map。 |
| **`app/page.tsx`** | 前端主界面：消息列表、模型提供商切换、工作流进度/Timeline、记忆展示、HITL 确认、**Storage（local/backend）** 切换等。 |
| **`lib/chat-*`** | 与「单轮对话 + 四路由」相关的类型、记忆、路由解析、工具实现。 |
| **`lib/model-runtime.ts`** | 屏蔽 Ollama 与 MiMo 请求格式差异；校验 MiMo 模型 id 与 API Key。 |
| **`lib/workflow-*`** | 多步任务的规划、校验修复、并行调度执行、暂停存储、持久化与 **WorkflowStore**（local / backend 可插拔）。 |
| **`lib/mimo-models.ts`** | 前后端共用的 MiMo 模型列表，避免前端传非法 id。 |
| **`public/`** | 不参与业务逻辑，仅静态资源。 |
| **`scripts/`** | 维护脚本，日常运行不依赖。 |

### 请求大致流向

```mermaid
flowchart LR
  UI[app/page.tsx] --> Chat[POST /api/chat]
  Chat --> Mem[lib/chat-memory]
  Chat -->|useWorkflow| Plan[lib/workflow-planner]
  Plan --> Val[lib/workflow-validate]
  Val --> Exec[lib/workflow-executor]
  Exec -->|HITL 暂停| Store[lib/workflow-pause-store]
  Exec --> Persist[lib/workflow-persistence]
  Persist --> WStore[WorkflowStore local/backend]
  WStore -->|backend| Api[/api/workflows]
  UI --> Confirm[POST /api/workflow/confirm]
  Confirm --> Exec
  Chat -->|单步| Route[lib/chat-routing]
  Route --> Tools[lib/chat-tools]
```

---

## 环境变量

在项目根目录配置 `.env.local`（可参考仓库内示例字段）：

| 变量 | 说明 |
|------|------|
| `OLLAMA_API_URL` | 本地 Ollama 聊天 API，默认 `http://localhost:11434/api/chat` |
| `OLLAMA_MODEL` | 本地模型名，默认 `qwen2.5:14b` |
| `XIAOMI_MIMO_API_KEY` | 使用 `provider=mimo` 时必填 |
| `XIAOMI_MIMO_BASE_URL` | MiMo 网关，默认小米 OpenAI 兼容地址 |
| 前端请求体 `mimoModel` | 须在 `lib/mimo-models.ts` 白名单内 |

---

## 快速开始

安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

使用本地模型前请确保 Ollama 已启动且已拉取对应模型；使用 MiMo 时需配置 `XIAOMI_MIMO_API_KEY`。

其它脚本：

```bash
npm run build   # 生产构建
npm run start   # 运行构建产物
npm run lint    # ESLint
```

---

## 相关文档

- [Next.js 文档](https://nextjs.org/docs)
- 本项目：`day20_learning_summary.md`（Pluggable Storage 与第 16–20 天演进）
- 本项目：`day20_test_cases.md`（回归测试清单）
