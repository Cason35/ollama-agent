# Ollama Chat Day 55

Day 55 在 Day 54 Prompt Composition（提示词组合）基础上，升级为 Dynamic Prompt Optimization（动态提示词优化）。

本项目保留 Prompt Registry、PromptBlock、PromptBuilder、Block Diff 和 Block Metrics，并新增：

- `PromptOptimizationContext`：描述任务类型、记忆、工作空间、知识、JSON、引用和复杂度。
- `PromptOptimizer`：根据上下文、规则、策略和评估弱点动态启用或关闭 PromptBlock。
- `PromptRule`：声明某个条件成立时启用或禁用哪些块。
- `Block Weight`：让重要块在最终提示词中更靠前。
- `Prompt Recommendation`：根据任务和评估结果给出提示词组合建议。
- `Prompt Strategy Explorer`：对比 Fast、Balanced、Quality 三种策略的块、token 和成本。
- `Prompt Optimization Metrics`：统计平均提示词长度、平均块数、优化耗时、推荐命中率和策略分布。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day55 Dynamic Prompt Optimization Platform。

打开 `http://localhost:3000/prompts` 可进入 Day55 Dynamic Prompt Optimization Console。

打开 `http://localhost:3000/experiments` 可进入 Day55 兼容实验视图。

## 测试

```bash
npm run test:day55
```

Day 55 的测试用例说明见 `day55_test_cases.md`。
