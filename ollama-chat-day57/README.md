# Ollama Chat Day 57

Day 57 在 Day 56 Multi-Model Collaboration Runtime（多模型协作运行时）基础上，升级为 Adaptive Runtime Decision Engine（自适应运行时决策引擎）。

本项目保留 Prompt Registry、PromptBlock、PromptBuilder、PromptOptimizer、Model Router、Model Collaboration、Trace 和 Usage，并新增：

- `RuntimeContext`：描述任务类型、复杂度、延迟偏好、预算、知识库、工作空间、记忆和 JSON 需求。
- `RuntimeDecision`：描述 Prompt、Model、Collaboration、Cache、Retrieval 和 Memory 的最终策略。
- `RuntimeDecisionEngine`：用稳定可解释的规则生成自适应运行时决策。
- `RuntimeDecisionStore`：保存 Decision Replay（决策回放）并统计 Runtime Metrics。
- `Trace decision span`：把每次运行时决策写入 Trace，便于排查为什么系统这样配置自己。
- `Runtime Explorer`：展示典型决策、真实请求回放、平均决策耗时、成本和延迟。
- `Agent Runtime 接入`：Supervisor 协作会先读取 RuntimeDecision，再决定走轻量单 Agent 或完整 Agent DAG。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day57 Adaptive Runtime Decision Platform。

打开 `http://localhost:3000/prompts` 可进入 Day57 Prompt Strategy Console。

打开 `http://localhost:3000/experiments` 可进入 Day57 Prompt Strategy Experiment View。

## 测试

```bash
npm run test:day57
```

Day 57 的测试用例说明见 `day57_test_cases.md`。
