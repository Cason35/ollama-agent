# Day72 Production Observability Platform 测试用例

## 1. 测试目标

验证第 72 天生产可观测平台是否完整实现统一观测事件、结构化日志、指标聚合、统一指标命名、分布式链路追踪第 2 版、链路与指标关联、错误追踪、告警、仪表盘、RuntimeContext / EventBus / UnifiedRegistry 接入、采样策略以及端到端诊断闭环。

## 2. 自动化执行命令

```powershell
npm run test:day72
npm run build
```

预期结果：

- 终端输出 `Day72 Production Observability Platform：五个端到端场景与十三项验收标准全部通过`。
- Next.js 生产构建成功。
- `/observability` 页面和 `/api/observability` 接口均进入构建路由清单。

## 3. Case 1：Research Agent 请求全链路

前置条件：使用 Full Sampling（全量采样）启动 `research-agent.execute`。

步骤：

1. 创建 Research Agent 根 Span。
2. 创建 Workflow、Model、Retrieval、Tool、Memory、Evaluation 子 Span。
3. 写入一条 `info` 结构化日志。
4. 写入 Agent、Model、Workflow、RAG、Memory 指标。
5. 完成 Trace。

预期结果：

- Trace Tree 同时包含 Agent、Workflow、Model、Tool、Retrieval、Memory、Evaluation。
- 每个 Span 都包含 `parentSpanId`、`durationMs`、`status` 和 `attributes`。
- 同一个 `traceId` 能查询到完整跨度树、结构化日志和指标。
- EventBus 发布 `metric.recorded`、`log.created` 和 `trace.completed`。

## 4. Case 2：Model Timeout 模型失败

前置条件：普通采样率设置为 `0`，开启错误强制采样。

步骤：

1. 创建 Agent Span 和 Model Span。
2. 将 Model Span 标记为 `failed`，错误为 `model timeout after 12000ms`。
3. 连续写入两条相同指纹的 `ModelTimeoutError` 结构化日志。
4. 记录 `model.error.rate = 0.08`。
5. 以失败状态完成 Trace。

预期结果：

- 即使普通采样率为 `0`，失败 Trace 仍被保存。
- RuntimeContext 中 `samplingReason` 更新为 `error-forced`。
- Error Tracking 把两次超时聚合为一类错误，`count = 2`。
- Alert Engine 触发模型错误率、模型超时次数和模型日志增长告警。
- Trace Explorer 显示失败 Model Span 和错误摘要。

## 5. Case 3：RAG 慢查询

步骤：

1. 创建持续 11.5 秒的 Retrieval Span。
2. 记录 `retrieval.latency = 11500`。
3. 记录 `agent.latency = 14000`。
4. 记录 `citation.coverage = 0.76`。
5. 完成成功 Trace。

预期结果：

- Dashboard 的 P95 Latency 明显上升。
- Metrics Explorer 中延迟指标包含对应 `traceId`。
- 点击 `Metric → Trace` 能打开慢查询链路。
- Trace Tree 定位到 `Slow RAG Retrieval`，其 `attributes.bottleneck` 为 `vector-store`。
- 触发 P95 延迟和引用覆盖率告警。

## 6. Case 4：Token Usage 与 Cost 超限

步骤：

1. 创建长上下文 Model Span。
2. 记录 `model.token.usage = 18000`。
3. 记录 `model.cost = 0.22`。
4. 完成 Trace。

预期结果：

- Metrics Explorer 显示令牌用量 Histogram。
- Overview 的累计 Cost 超过演示预算 `0.1`。
- Alert Center 产生 `Model Cost Budget Exceeded` 活动告警。
- 告警包含高成本 Trace，可直接进入根因诊断。

## 7. Case 5：按 traceId 查询

输入：`trace-day72-research`、`trace-day72-model-timeout` 或 `trace-day72-slow-rag`。

预期结果：

- 返回完整 Trace 基础信息。
- 返回递归 Span Tree。
- 返回每个 Span 的耗时、状态、属性和错误。
- 返回同一 Trace 关联的日志和指标。
- 不存在或未采样的 `trace-day72-unsampled` 不返回已保存 Trace。

## 8. ObservationEvent 与 Structured Logging 测试

检查项：

- `ObservationEvent.type` 覆盖 `trace`、`metric`、`log`。
- `ObservationEvent.source` 能区分 Agent、Workflow、Model、Tool、Memory、Knowledge、Evaluation 和 Retrieval。
- 日志可以按 `level`、`source`、`traceId`、`requestId` 和关键字组合查询。
- 模型错误日志的 `metadata` 包含 `model`、`errorType`、`timeoutMs` 等结构化字段。

## 9. MetricsAggregator 测试

检查项：

- Counter 只允许记录非负增量，并以 `sum` 表示累计值。
- Gauge 使用 `latest` 表示最近瞬时值。
- Histogram 计算 `average`、`p50`、`p95`、`p99`、`min` 和 `max`。
- 同一指标的 Trace ID 自动去重保存。
- 同名指标不能混用多种 MetricKind。

## 10. Alert Engine 测试

默认规则：

| 规则 | 信号 | 条件 | 严重度 |
| --- | --- | --- | --- |
| Model Error Rate High | Metric | `model.error.rate > 0.05` | Critical |
| Agent P95 Latency High | Metric | `agent.latency.p95 > 10000` | Warning |
| Model Cost Budget Exceeded | Metric | `model.cost.sum > 0.1` | Warning |
| Citation Coverage Low | Metric | `citation.coverage < 0.8` | Warning |
| Model Timeout Repeated | Error | `ModelTimeoutError.count >= 2` | Critical |
| Model Error Logs Growing | Log | `model-runtime.count >= 2` | Warning |

预期结果：

- 同一规则只有一条活动告警，后续信号更新真实值和关联 Trace。
- 信号恢复正常时可以自动恢复；页面也支持手动 Resolve。
- 新告警发布 `alert.triggered` 事件。

## 11. RuntimeContext / EventBus / UnifiedRegistry 测试

检查项：

- `observabilityContext` 包含 `traceId`、`metricsEnabled`、`samplingRate`、`sampled` 和 `samplingReason`。
- EventBus 包含 `metric.recorded`、`log.created`、`alert.triggered`、`trace.completed`。
- UnifiedRegistry 注册以下能力：
  - `observability:log-manager`
  - `observability:metrics-aggregator`
  - `observability:trace-provider-v2`
  - `observability:alert-engine`

## 12. Sampling Strategy 测试

检查项：

- Full Sampling 保存全部开发请求。
- Ratio Sampling 按稳定哈希和比例决定普通请求是否保存。
- Error Forced Sampling 在比例未命中时仍保留失败 Trace。
- VIP、关键工作流、高成本和低质量请求使用更高采样率或强制采样。
- 未采样成功请求仍计入 Overview 请求数，但不会进入 Trace Explorer。

## 13. 页面与标题测试

检查项：

- 根浏览器标签页标题包含 `Day 72 - Production Observability Platform` 和 `生产可观测平台`。
- 主工作台徽标显示 `72`。
- 主标题显示 `Production Upgrade V9` 和 `Production Observability Platform`。
- `/observability` 的五个标签页均使用 Day72 相关标题。
- Header 提供 `Observability Dashboard` 入口并保留 Day71 Evaluation Explorer 入口。

## 14. 中文逐行注释测试

自动化脚本会扫描第 72 天新增的 TypeScript、TSX、API、测试脚本和核心运行时文件。每一个非空代码行必须包含 `第72天` 中文注释标记；发现任一遗漏时测试立即失败并报告文件名与行号。
