# Ollama Chat Day 43

Day 43 在 `ollama-chat-day42` 的 Agent Memory + Shared Workspace 基础上，升级为 Multi-Agent Runtime V5：Reflection & Self-Correction（反思与自我修正）。

## 本日重点

- 新增 `ReflectionResult`、`ReflectionAttempt` 和 `ReflectionMetrics`，记录评分、问题、建议、重试判断和整体反思指标。
- 新增 `Reflection Agent`，能力包括 `reflection`、`review` 和 `self-check`。
- `AgentRuntime` 支持生成、反思、重试闭环，默认阈值为 80 分，最多重试 2 次。
- `reflectResult` 支持模型 JSON 评审，模型不可用时使用规则型兜底评审。
- Reflection 结果会写入 Workspace，类型为 `decision`，标签包含 `reflection`、目标 Agent 和任务 ID。
- 前端新增 Reflection Metrics 面板，展示平均分、重试次数、通过率、提升幅度和每轮反思详情。
- 浏览器标签页、页面标题、侧栏标题和演示任务均已更新为 Day 43 相关描述。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧面板会展示第43天的 Reflection & Self-Correction 能力。

测试用例见 `day43_test_cases.md`。
