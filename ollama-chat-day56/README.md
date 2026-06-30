# Ollama Chat Day 56

Day 56 在 Day 55 Dynamic Prompt Optimization（动态提示词优化）基础上，升级为 Multi-Model Collaboration Runtime（多模型协作运行时）。

本项目保留 Prompt Registry、PromptBlock、PromptBuilder、PromptOptimizer、Model Router、Model Executor、Trace 和 Usage，并新增：

- `ModelRole`：描述模型在协作团队中承担 reasoning、writing、evaluation、json、embedding、summary 等角色。
- `ModelProfile.roles`：让同一个模型可以声明多个协作角色。
- `CollaborationPlan`：描述一个任务如何拆成多个模型阶段，并通过 `inputFrom` 传递上下文。
- `ModelCollaborationPlanner`：根据 research、json、evaluation 等任务自动规划模型团队。
- `ModelCollaborationExecutor`：按计划串行或并行执行多个模型阶段，并记录 Trace/Usage。
- `mergeResults`：把多个模型阶段输出合并成最终答案。
- `Model Collaboration Explorer`：展示模型团队、协作计划、并行阶段、成本、耗时和合并结果。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day56 Multi-Model Collaboration Platform。

打开 `http://localhost:3000/prompts` 可进入 Day56 Prompt Compatibility Console。

打开 `http://localhost:3000/experiments` 可进入 Day56 Prompt Experiment Compatibility View。

## 测试

```bash
npm run test:day56
```

Day 56 的测试用例说明见 `day56_test_cases.md`。
