# Ollama Chat Day 47

Day 47 在 Day 46 Continuous Evaluation System（持续评估系统）的基础上，升级为 Production Runtime V3（生产运行时第3版）：Usage & Cost Observability（用量与成本可观测性）。

## 本日重点

- 定义统一 `UsageRecord`（用量记录）及 `UsageManager`（用量管理器）。
- 为 Agent、Tool、Reflection 与 Evaluation 记录输入词元、输出词元、费用和耗时。
- 通过 `traceId + spanId` 把 Usage（用量）关联回完整 Trace（追踪记录）。
- 聚合总费用、总词元、平均任务费用及成本最高的 Agent 和 Tool。
- 实现 `Usage Explorer`（用量浏览器）与调用级明细。
- 实现 `Cost Breakdown`（成本构成分析）。
- 为 Retrieval、Summary 与 Weather 工具提供统一用量包装运行时。
- 在 Prompt A/B Test 基础上增加 `Cost/Score Ratio` 与 `Prompt ROI Test`。
- 完整保留 Day 46 的回归评估、失败案例与质量门禁能力。

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧控制台默认进入“用量”标签页，可切换查看用量概览、调用明细、成本构成和 Prompt ROI。

## 验证方式

```bash
npm run test:day47
npm run test:day46
npm run lint
npm run build
```

Day 47 的自动化、接口与人工测试用例见 `day47_test_cases.md`。
