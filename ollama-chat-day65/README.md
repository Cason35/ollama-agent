# Ollama Chat Day 65

Day 65 在 Day 64 Unified Runtime Context（统一运行时上下文）基础上进入 Production Upgrade V2（生产化升级第2版），核心主题是 Unified Event System（统一事件系统）。

项目完整保留 Day64 的 Chat、Workflow、RAG、Memory、Model、Prompt、Evaluation、Redis、Queue、Lock、Storage、Config、Secrets 与 Runtime Context 业务能力，并新增：

- `RuntimeEvent` 与 `EventType`：统一描述运行时发生的事实。
- `EventBus`：定义发布、订阅和取消订阅协议。
- `MemoryEventBus`：提供多订阅者分发、有限历史和投递状态。
- Agent/Tool Event Publisher：发布开始与完成事件，不再直接调用 Trace、Usage 和 Evaluation。
- `TraceSubscriber`：监听全部运行时事件并生成 Trace Timeline。
- `UsageSubscriber`：监听 `model.completed` 并自动统计 Token、Cost 与 Latency。
- `EvaluationSubscriber`：监听 `agent.completed`，自动创建评估任务并发布 `evaluation.completed`。
- `Event Explorer`：展示事件时间线、来源、状态、上下文关联、载荷摘要和分类过滤。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 65 Unified Event System，右侧控制台默认展示“事件”标签页。

## 测试

```bash
npm run test:day65
npm run lint
npm run build
```

完整测试用例见 `day65_test_cases.md`。
