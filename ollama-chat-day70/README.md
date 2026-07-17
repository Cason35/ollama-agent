# Ollama Chat Day70

本项目基于 Day69 业务代码升级为 `Durable Agent Workflow Platform V1（持久化智能体工作流平台第 1 版）`。

核心能力包括 Workflow Definition V2、不可覆盖版本、Workflow Execution、State Store V2、Checkpoint、Resume、HITL、Replay、Event Sourcing、Workflow Explorer V2、Metrics V2，以及 RuntimeContext / EventBus / UnifiedRegistry 集成。

## 启动与验证

```bash
npm install
npm run dev
npm run test:day70
npm run build
```

治理页面：`http://localhost:3000/workflows`。

测试说明见 `day70_test_cases.md`。
