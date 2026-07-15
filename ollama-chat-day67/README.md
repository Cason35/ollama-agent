# Ollama Chat Day 67

Day 67 在 Day 66 Unified Registry（统一注册中心）基础上进入 Production Upgrade V4（生产化升级第4版），核心主题是 Production Prompt Platform（生产级提示词平台）。

项目完整保留 Day 66 的 Chat、Workflow、RAG、Memory、Model、Prompt、Evaluation、Redis、Queue、Lock、Storage、Config、Secrets、Runtime Context、Event System 与 Unified Registry 业务能力，并新增：

- `ProductionPrompt`：管理提示词 ID、版本、关联 Agent、PromptBlock、Strategy 和完整生命周期状态。
- `PromptRegistry` 生产化扩展：让每个生产提示词版本独立注册，并同步到 `UnifiedRegistry`。
- `PromptRuntimeService`：统一完成选择版本、加载资产、优化提示词块、渲染、Trace 绑定和指标记录。
- RuntimeContext 集成：从同一上下文读取 Memory、Workspace、Knowledge、Strategy 和 User Intent。
- `PromptQualityScore`：把正确性、相关性、原始成本和延迟转换为可比较的综合评分。
- `ProductionPromptExperimentService`：支持不同 Agent、数据集和版本的通用 A/B Testing。
- `PromptPromotionService`：支持 testing、approved、active、deprecated 生命周期，以及 Quality Gate、Rollback、Archive 和 Audit Log。
- `Prompt Explorer V2`：展示 Prompt、Version、Agent、Blocks、Strategy、Score、Usage 和 Status，并支持 Compare、Promote、Rollback 与 Archive。
- `GET/PATCH/POST /api/production-prompts`：提供平台快照、生命周期操作和版本比较接口。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 67 主应用；打开 `http://localhost:3000/prompts` 可直接进入 Prompt Explorer V2。

## 测试

```bash
npm run test:day67
npm run lint
npm run build
```

完整测试用例见 `day67_test_cases.md`。
