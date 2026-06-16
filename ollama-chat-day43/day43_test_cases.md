# Day 43 测试用例：Reflection & Self-Correction（反思与自我修正）

本文档用于验证 `ollama-chat-day43` 是否完成第43天任务：Multi-Agent Runtime V5（多智能体运行时第5版）支持 Reflection Agent（反思智能体）、ReflectionResult（反思结果）、Retry Loop（重试循环）、Workspace（工作空间）记录、Reflection Timeline（反思时间线）和 Reflection Metrics（反思指标）。

## TC-01：类型定义完整性

测试目标：确认 Day43 新增的反思类型存在。

操作步骤：
1. 打开 `lib/agents/agent-types.ts`。
2. 搜索 `ReflectionResult`、`ReflectionAttempt` 和 `ReflectionMetrics`。
3. 检查 `AgentCollaborationSnapshot` 是否包含 `reflectionAttempts` 和 `reflectionMetrics`。

预期结果：
- `ReflectionResult` 包含 `score`、`issues`、`suggestions`、`shouldRetry`。
- `ReflectionAttempt` 记录轮次、Agent、任务、输出、反思结果、是否重试和时间戳。
- `ReflectionMetrics` 包含平均分、重试次数、通过率和提升幅度。

## TC-02：Reflection Agent 注册

测试目标：确认默认智能体注册表中存在反思智能体。

操作步骤：
1. 打开 `lib/agents/default-agents.ts`。
2. 搜索 `id: "reflection"`。
3. 检查能力是否包含 `reflection`、`review`、`self-check`。

预期结果：
- `Reflection Agent` 已注册。
- `/api/agents` 返回的智能体列表中包含 `Reflection Agent`。

## TC-03：反思评分与重试闭环

测试目标：确认 Agent 输出后会先经过 Reflection（反思），必要时触发 Retry Loop（重试循环）。

操作步骤：
1. 启动项目：`npm run dev`。
2. 打开 `http://localhost:3000`。
3. 观察右侧 `Reflection Metrics（反思指标）` 面板。
4. 查看每条 attempt 的 `score`、`issues`、`suggestions` 和 `retried`。

预期结果：
- 至少出现一条 Reflection attempt。
- 初稿评分不足时，`retried` 显示为 `yes`。
- 重试后出现新的 attempt，分数应高于或不低于初稿。

## TC-04：Reflection 写入 Workspace

测试目标：确认反思结论沉淀到共享工作空间中。

操作步骤：
1. 打开右侧 `Shared Workspace（共享工作空间）` 面板。
2. 在 tag 输入框中输入 `reflection`。
3. 观察过滤后的 Workspace 条目。

预期结果：
- 能看到 `agentId` 为 `reflection` 的条目。
- 条目类型为 `decision`。
- 条目内容包含 `score`、`shouldRetry`、`issues` 和 `suggestions`。

## TC-05：Reflection Timeline

测试目标：确认时间线能解释系统为什么重试。

操作步骤：
1. 打开右侧 `Agent Plan Timeline（智能体计划时间线）`。
2. 查找 `Reflection Started`、`Reflection Failed`、`Retry`、`Reflection Passed`。

预期结果：
- 时间线包含反思开始事件。
- 如果触发重试，应看到失败和重试事件。
- 最终应看到反思通过事件或达到重试边界后的最终输出。

## TC-06：API 快照结构

测试目标：确认 `/api/agents` 返回 Day43 反思字段。

操作步骤：
1. 访问 `http://localhost:3000/api/agents`。
2. 查看 `data.collaboration.reflectionAttempts`。
3. 查看 `data.collaboration.reflectionMetrics`。

预期结果：
- `reflectionAttempts` 是数组。
- `reflectionMetrics.averageScore`、`retryCount`、`passRate`、`improvementRate` 均存在。

## TC-07：标题与标签页

测试目标：确认界面描述已经从 Day42 更新为 Day43。

操作步骤：
1. 打开浏览器页面。
2. 查看浏览器标签页标题。
3. 查看页面 Header 和右侧看板标题。

预期结果：
- 浏览器标签页包含 `Day 43` 和 `Reflection & Self-Correction`。
- 页面主标题包含 `Multi-Agent Runtime V5`。
- 右侧看板标题为 `Reflection Runtime Dashboard（反思运行看板）`。

## TC-08：构建验证

测试目标：确认 Day43 项目能通过静态构建。

操作步骤：
1. 在 `ollama-chat-day43` 目录运行 `npm run build`。

预期结果：
- TypeScript 编译通过。
- Next.js 构建成功。
- 若本地缺少模型服务，仍应能通过规则型反思兜底完成 `/api/agents` 示例。
