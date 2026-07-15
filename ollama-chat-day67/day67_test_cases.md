# Day67 Production Prompt Platform 测试用例

## 1. 测试范围

本文档用于验证第 67 天 Production Prompt Platform（生产级提示词平台）的十项任务：

1. PromptRegistry 与 UnifiedRegistry 的生产化集成。
2. ProductionPrompt 数据结构。
3. PromptRuntimeService 运行链路。
4. RuntimeContext 上下文接入。
5. PromptVersion 与 Trace 自动绑定。
6. PromptExperiment 通用实验平台。
7. PromptQualityScore 质量评分。
8. PromptPromotion 发布晋级。
9. Prompt Explorer V2 运营控制台。
10. Research、Writer、Critic 三类 Agent 的 ProductionPromptTest。

## 2. 测试环境

- 工作目录：`ollama-chat-day67`
- Node.js：20.9 或更高版本
- Next.js：16.2.4
- 测试命令：`npm run test:day67`
- 静态检查：`npm run lint`
- 生产构建：`npm run build`

## 3. 自动化测试用例

| 编号 | 测试目标 | 前置条件 | 操作步骤 | 预期结果 |
| --- | --- | --- | --- | --- |
| TC67-01 | ProductionPrompt 独立版本注册 | 创建全新的 ProductionPromptPlatform | 列出全部 ProductionPrompt | 存在 `research.v1`、`writer.v2`、`critic.v1`，且所有 ID 唯一 |
| TC67-02 | 状态与 UnifiedRegistry.enabled 一致 | 默认版本已注册 | 读取 `prompt:research@v1` 与 `prompt:research@v2` | `research.v1` 为 enabled，testing 状态的 `research.v2` 为 disabled |
| TC67-03 | 统一注册元数据完整 | 默认版本已注册 | 查看生产提示词注册项 metadata | 包含 promptId、agentId、capabilities、strategy、blockIds、status |
| TC67-04 | Agent/Workflow 能力发现 | Research Agent 有 active 版本 | 调用 `discoverPromptDependencies("research")` | 返回 `prompt:research@v1`，且结果全部为 enabled |
| TC67-05 | PromptRuntimeService 自动选择 | Writer Agent 的 `writer.v2` 为 active | 调用 `renderPrompt({ agentId: "writer" })` | 自动选择 `writer.v2`，不选择 deprecated 或 approved 版本 |
| TC67-06 | RuntimeContext 五类数据接入 | 构建包含 Memory、Workspace、Knowledge、Strategy、User Intent 的上下文 | 渲染 Writer Prompt | 最终 Prompt 包含五类上下文对应块，避免上下文漂移 |
| TC67-07 | PromptBlock 组合与优化 | Writer Prompt 存在多个块 | 使用 balanced 策略渲染 | usedBlockIds 与实际正文块一致；缺少上下文的条件块被跳过 |
| TC67-08 | PromptVersion 绑定 Trace | 完成一次 Writer Prompt 渲染 | 查看 PromptTraceBinding | traceId、promptId、version、blocks、strategy 均存在且正确 |
| TC67-09 | Prompt Metrics 关联模型 | 完成一次 Prompt → Model 链路 | 查看 PromptRuntimeMetrics | 记录 model、promptTokens、costUsd、latencyMs、usageCount |
| TC67-10 | PromptQualityScore 归一化 | 提供正确性、相关性、成本和延迟原始值 | 调用 `calculatePromptQualityScore` | 成本与延迟转换为越高越好的效率分，overall 为加权综合分 |
| TC67-11 | 通用 PromptExperiment | 三个 Agent 均有两个候选版本和数据集 | 调用 `runAll()` | 生成 3 个实验，每个至少 2 个候选版本、3 个案例和 Winner Selection |
| TC67-12 | 高优先级回归检测 | 候选版本质量低于 active 基线 | 运行 Critic Prompt 实验 | highPriorityRegressionCount 大于 0，Quality Gate 失败 |
| TC67-13 | 质量门禁阻止审批 | `critic.v2` 为 testing，证据不合格 | 执行 approve | 抛出 `Quality Gate 未通过`，状态仍为 testing |
| TC67-14 | testing → approved | `research.v2` 为 testing，证据合格 | 执行 approve | 状态变为 approved，并生成 approve 审计日志 |
| TC67-15 | approved → active | `research.v2` 已 approved | 执行 promote | `research.v2` 变为 active，旧 `research.v1` 变为 deprecated，UnifiedRegistry 同步更新 |
| TC67-16 | Rollback | `research.v1` 为 deprecated | 执行 rollback | `research.v1` 恢复 active，当前线上版本被自动弃用，并生成回滚日志 |
| TC67-17 | Archive | `writer.v3` 未归档 | 执行 archive | `writer.v3` 变为 deprecated，UnifiedRegistry.enabled 为 false |
| TC67-18 | Compare | `writer.v2` 与 `writer.v3` 均存在 | 调用版本比较接口 | 识别新增 reflection 块及 balanced → quality 策略变化 |
| TC67-19 | 三 Agent 完整链路 | 平台默认数据加载完成 | 生成平台快照 | Research、Writer、Critic 均完成 Agent → Prompt → Model → Evaluation |
| TC67-20 | Prompt Explorer V2 数据完整 | 打开 `/prompts` | 查看版本卡片 | 显示 Prompt、Version、Agent、Blocks、Strategy、Score、Usage、Status |

## 4. Prompt Explorer V2 手工测试

### TC67-UI-01：页面标题和标签页

1. 启动 `npm run dev`。
2. 打开 `http://localhost:3000`。
3. 检查浏览器标签页标题和主页面页头。
4. 打开右侧“提示V2”标签页。
5. 点击“打开 Prompt Explorer V2”。

预期结果：

- 浏览器标签页显示 Day 67 和 Production Prompt Platform。
- 主页面日期徽标显示 67。
- 主标题显示 Production Prompt Platform（生产级提示词平台）。
- `/prompts` 标签页标题显示 Day 67 - Prompt Explorer V2。

### TC67-UI-02：版本比较

1. 在 `/prompts` 切换到 Writer Agent 标签页。
2. 分别选择 `writer.v2` 和 `writer.v3`。
3. 点击 Compare（比较）。

预期结果：

- 显示左右版本 ID。
- 显示新增的 reflection 块。
- 显示策略发生变化。

### TC67-UI-03：质量门禁阻断

1. 切换到 Critic Agent 标签页。
2. 对 `critic.v2` 点击“批准”。

预期结果：

- 页面显示 Quality Gate 未通过原因。
- `critic.v2` 保持 testing 状态。
- 不产生错误的 active 版本切换。

### TC67-UI-04：晋级、回滚和归档

1. 对 approved 状态版本点击“晋级”。
2. 对 deprecated 历史版本点击“回滚”。
3. 对非 deprecated 版本点击“归档”。
4. 查看页面底部 Audit Log。

预期结果：

- 晋级后同 Agent 只有一个 active 版本。
- 回滚后历史版本恢复 active。
- 归档后版本变为 deprecated。
- 每次操作均生成包含前后状态、操作者、原因和时间的审计日志。

## 5. 验收命令

```bash
npm run test:day67
npm run lint
npm run build
```

验收通过条件：

- `test:day67` 全部断言通过。
- ESLint 无 error；历史迁移代码允许保留既有 warning。
- Next.js 生产构建成功。
- `/` 与 `/prompts` 均可正常生成。
