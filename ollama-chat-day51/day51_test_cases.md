# Day 51 测试用例文档（Model Fallback & Circuit Breaker）

> 主题：Advanced Optimization V4（高级优化第 4 版）：Resilient Multi-Model Runtime（具备容错能力的多模型运行时）

> 核心认知：Model Router（模型路由器）解决“该用谁”，Fallback + Circuit Breaker（备用模型切换 + 熔断器）解决“它坏了怎么办”。

## 一、验收范围

| 验收项 | 测试覆盖 |
| --- | --- |
| ModelProfile 支持 fallback / timeout / retry | `testModelProfileFallbackConfig` |
| ModelCallResult 统一返回模型调用结果 | `ModelExecutor.call` 返回结构断言 |
| ModelExecutor 统一调用入口 | `testExecutorPrimarySuccess`、`testExecutorFallbackSuccess` |
| Fallback Chain 备用模型链 | 主模型失败后切到 `json-structured` |
| CircuitBreakerManager 熔断器 | `testCircuitBreakerStateTransitions` |
| 连续失败打开熔断 | `testExecutorOpensCircuitOnFailures` |
| ModelRouter 避开熔断模型 | `testRouterSkipsOpenCircuitModel` |
| Trace / Usage 记录 fallback 信息 | `testTraceMetadata`、Usage 记录断言 |
| Model Health Dashboard | `testModelHealthDashboardSnapshot` |
| 全链路降级响应 | `testExecutorDegradedResponse` |

## 二、自动化测试

运行命令：

```bash
npm run test:day51
```

预期输出：

```text
Day 51 Fallback and Circuit Breaker tests passed.
```

失败时重点查看：

- `fallbackChain` 是否按主模型到备用模型顺序记录。
- `fallbackUsed` 是否在切换备用模型后变为 `true`。
- `CircuitBreakerState.state` 是否按 `closed → open → half_open → closed` 流转。
- `ModelRouter.routeWithReason()` 是否返回 `skippedByCircuit`。

## 三、手工页面测试

1. 启动项目：

```bash
npm run dev
```

2. 打开首页后检查浏览器标签页：

- 标题应包含 `Day 51 - Model Fallback & Circuit Breaker`。
- 顶部 Header 应显示 `Day 51`、`Advanced Optimization V4`、`Resilient Multi-Model Runtime`。

3. 检查右侧控制台：

- 徽标应显示 `Day 51`。
- 默认标签页应为 `健康`。
- `Model Health Dashboard` 应展示 `state`、`failureCount`、`successRate`、`fallback`、`lastFail`。
- 下方仍保留 `Model Explorer`，用于查看模型档案与路由预览。

## 四、API 测试

读取模型快照：

```bash
curl http://localhost:3000/api/model
```

预期响应的 `data` 中包含：

- `models`
- `metrics`
- `routingPreviews`
- `health.models`
- `health.openModelCount`
- `health.fallbackUsedCount`

在线试路由：

```bash
curl -X POST http://localhost:3000/api/model \
  -H "Content-Type: application/json" \
  -d "{\"taskType\":\"planning\",\"complexity\":\"high\"}"
```

预期响应：

- 正常情况下模型为 `large-reasoning`。
- 如果 `large-reasoning` 处于熔断状态，应切到 fallback 链中的 `json-structured`。
- 响应中应包含 `matchedRule`、`reason`、`candidates` 和 `skippedByCircuit`。

## 五、第51天打卡对照

```text
【第51天打卡】
1. ModelProfile 是否支持 fallback 配置：是
2. 是否定义 ModelCallResult：是
3. 是否实现 ModelExecutor：是
4. 是否实现 fallback chain：是
5. 是否实现 CircuitBreaker：是
6. 是否实现 CircuitBreakerManager：是
7. ModelRouter 是否避开熔断模型：是
8. Trace / Usage 是否记录 fallback 信息：是
9. 是否实现 Model Health Dashboard：是
10. 是否完成 fallback / circuit breaker 测试：是
```
