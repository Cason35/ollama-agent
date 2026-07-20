# Ollama Chat Day 71

Day 71 主题：Production Evaluation Platform V2（生产评估平台第 2 版）。

本项目在完整继承 Day 70 业务代码的基础上，新增 EvaluationRun、Evaluation Dataset V2、Evaluation Runner V2、多维评分、六类可插拔 Evaluator、Trace 评估关联、Online Evaluation、Feedback Loop、Quality Gate V2、Evaluation Explorer V2、Evaluation Metrics V2，以及 RuntimeContext / EventBus / UnifiedRegistry 集成。

## 启动

```bash
npm install
npm run dev
```

打开：

- 主工作台：`http://localhost:3000`
- Production Evaluation Platform V2：`http://localhost:3000/evaluations`

## 验证

```bash
npm run test:day71
npm run lint
npm run build
```

详细测试用例见 `day71_test_cases.md`。
