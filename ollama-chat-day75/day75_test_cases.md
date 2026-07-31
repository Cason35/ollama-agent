# Day75 测试用例文档

## 测试目标

验证第 75 天最终作品集的目录、文档、版本、页面、发布材料和继承业务能力。代码层用例不依赖 MySQL、Redis、MinIO、Docker 或 Ollama；完整环境用例单独标注。

## 自动化用例

| ID | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| D75-01 | 核心交付物存在 | 运行 `npm run test:day75` | 12 项核心文件全部存在 |
| D75-02 | ADR 数量与命名 | 运行 `npm run test:day75` | 001–010 十份 ADR 全部存在 |
| D75-03 | 五张架构图 | 读取 `docs/architecture.md` | 恰好检测到 5 个 Mermaid 图块 |
| D75-04 | 面试问答数量 | 读取 `docs/interview-qa.md` | 至少 30 个编号问题 |
| D75-05 | 正式版本 | 读取 `package.json` | name 为 `ollama-chat-day75`，version 为 `1.0.0` |
| D75-06 | 浏览器标签页 | 读取 `app/layout.tsx` | 包含 Day 75 Portfolio 标题 |
| D75-07 | 历史回归 | 运行 `npm run test:all` | Day64–Day75 全部测试通过 |
| D75-08 | 类型安全 | 运行 `npm run typecheck` | TypeScript 零错误 |
| D75-09 | 代码规范 | 运行 `npm run lint` | 无阻断错误；继承警告单独记录 |
| D75-10 | 生产构建 | 运行 `npm run build` | Next.js 构建成功并生成 `/portfolio` |

## 页面人工用例

| ID | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| D75-11 | 主标签与标题 | 打开 `/` | 标签页、Day 徽标、主标题均为 Day75 作品集主题 |
| D75-12 | Portfolio 总览 | 打开 `/portfolio` | 展示 12 张 COMPLETED 卡片和 10 项能力标签 |
| D75-13 | 导航继承 | 从主工作台进入 Production / Governance / Observability | 历史业务页面可访问，导航可返回 |
| D75-14 | 响应式布局 | 在 375px、768px、1440px 查看 Portfolio | 无水平溢出，卡片按 1 / 2 / 3 列变化 |
| D75-15 | 无基础设施降级 | 仅运行 `npm run dev` 后访问 `/api/health` | 可返回 503 和可读依赖状态，页面不崩溃 |

## 完整环境用例

| ID | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| D75-16 | Docker 启动 | 配置 `.env`，运行 `docker compose up -d --build` | MySQL、Redis、MinIO、Migration 和 App 按依赖启动 |
| D75-17 | Migration / Rollback | 在预发布数据副本执行 status、up、rollback | 版本可追踪且数据符合预期 |
| D75-18 | Tenant 隔离 | Tenant A 创建资源，Tenant B 尝试读取和修改 | 全部拒绝并生成 Audit Log |
| D75-19 | 恢复演练 | 运行 Demo 并在节点中断 Worker | 从 Checkpoint 恢复且不重复已完成副作用 |
| D75-20 | 基准采集 | 按 `benchmark/README.md` 执行三轮 | 环境、模型、参数、次数和原始结果完整记录 |
| D75-21 | Backup / Restore | 创建测试数据后备份、删除并恢复 | MySQL、Redis 和 MinIO 数据达到约定 RPO / RTO |
| D75-22 | 依赖安全审计 | 运行 `npm audit` 并人工评估 | 每个发现均有风险、影响、缓解和升级决定 |

## 验收命令

```powershell
npm install
npm run test:day75
npm run typecheck
npm run lint
npm run build
```

## 通过标准

代码层 D75-01 至 D75-15 全部通过；D75-16 至 D75-22 必须在真实目标环境执行后才能标记通过，不以模拟或文档存在替代实际结果。
