# Day72 学习总结：Production Observability Platform（生产可观测平台）

## 一、文档说明

本文档整理第 72 天项目完成后的学习交流内容，包含：

- `ollama-chat-day72` 项目做了什么。
- 项目运用了哪些技术、架构思想和设计模式。
- Day72 相比 Day71 有什么改进。
- 为什么生产级 Agent（智能体）需要 Observability（可观测能力）。
- 如何通过外卖、餐厅、医院、快递、汽车和商场监控等生活化例子理解 Day72。
- 已完成状态的第 72 天打卡内容。
- Day72 完成后的阶段性总结、平台能力进度和核心技术闭环。
- Day73 Agent Platform Governance & Production Readiness（智能体平台治理与生产就绪）的学习计划、任务清单、验收标准和打卡模板。

本文档不记录创建文件夹、复制代码、修改代码、安装依赖、执行命令和修复构建等项目代码修改过程，只保留与 Day72 知识理解有关的提问和回答。

---

## 二、对话一：Day72 项目做了什么，运用了什么知识

### 用户提问

> 带我来读懂 `ollama-chat-day72` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day71` 有什么改进，为什么这样子做，且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述。

### 回答

一句话概括：

> Day71 负责判断 Agent（智能体）“回答得好不好”；Day72 负责在生产运行中发现“哪里慢、哪里错、为什么告警，以及如何定位根因”。

Day72 没有替换 Day71，而是在 Day71 的 Production Evaluation Platform（生产评估平台）上面增加了一层 Production Observability Platform（生产可观测平台）。

### 1. Day72 整体架构

一次请求的观测流程如下：

```text
用户请求
  ↓
RuntimeContext（运行时上下文）
  ↓
Distributed Trace V2（分布式链路追踪第 2 版）
  ├─ Agent Span（智能体跨度）
  ├─ Workflow Span（工作流跨度）
  ├─ Model Span（模型调用跨度）
  ├─ Tool Span（工具调用跨度）
  ├─ Retrieval Span（检索跨度）
  ├─ Memory Span（记忆跨度）
  └─ Evaluation Span（评估跨度）
  ↓
Logs（日志） + Metrics（指标） + Errors（错误）
  ↓
Alert Engine（告警引擎）
  ↓
Observability Dashboard（可观测仪表盘）
  ↓
Metric → Trace → Root Cause
指标 → 调用链 → 根本原因
```

系统最终希望回答：

- 哪个请求很慢？
- 慢在哪个 Span（跨度）？
- 哪个模型错误率最高？
- 最近哪类错误频繁出现？
- 哪条 Trace（链路追踪记录）触发了告警？
- 成本为什么突然升高？

### 2. 推荐的代码阅读顺序

| 阅读顺序 | 文件 | 作用 |
| --- | --- | --- |
| 1 | `lib/observability/types.ts` | 理解全部可观测领域模型 |
| 2 | `lib/observability/log-manager.ts` | 理解 Structured Logging（结构化日志） |
| 3 | `lib/observability/metrics-aggregator.ts` | 理解指标记录、查询和聚合 |
| 4 | `lib/observability/distributed-trace-provider.ts` | 理解 Trace（链路）和 Span Tree（跨度树） |
| 5 | `lib/observability/error-tracker.ts` | 理解错误自动聚合 |
| 6 | `lib/observability/alert-engine.ts` | 理解告警规则和告警生命周期 |
| 7 | `lib/observability/sampling-strategy.ts` | 理解 Sampling Strategy（采样策略） |
| 8 | `lib/observability/observability-runtime.ts` | 理解日志、指标、链路、错误和告警如何串联 |
| 9 | `lib/observability/observability-fixtures.ts` | 阅读五个端到端演示场景 |
| 10 | `app/components/ObservabilityDashboard.tsx` | 理解前端如何展示可观测数据 |
| 11 | `scripts/test-day72-production-observability-platform.ts` | 从自动化断言理解验收标准 |

### 3. ObservationEvent（统一观测事件）

系统把观测数据统一成三类：

```ts
type ObservationType = "trace" | "metric" | "log";
```

- Trace（链路追踪）：一次请求经过了哪些模块。
- Metric（指标）：延迟、成本、调用次数和错误率等数字。
- Log（日志）：一次具体事件的详细记录。

每个 ObservationEvent（统一观测事件）都可以携带：

- `requestId`：一次请求的统一标识。
- `traceId`：一条完整调用链的统一标识。
- `source`：数据来自 Agent、Model、Workflow、Memory 等哪个模块。
- `level`：Debug（调试）、Info（信息）、Warn（警告）或 Error（错误）。
- `data`：适合程序查询和聚合的结构化业务数据。

这样所有模块都遵守相同的 Observability Contract（可观测协议），不需要每个模块使用一套互不兼容的数据结构。

### 4. Structured Logging（结构化日志）

普通日志可能只是：

```ts
console.log("model failed");
```

这种日志的问题是：

- 不知道哪个 Model（模型）失败。
- 不知道属于哪条 Trace（链路）。
- 不知道具体 Error Type（错误类型）。
- 不方便执行自动统计和告警。

Day72 使用类似下面的结构：

```json
{
  "level": "error",
  "source": "model-runtime",
  "traceId": "trace-day72-model-timeout",
  "message": "模型 qwen2.5 调用超时",
  "metadata": {
    "errorType": "ModelTimeoutError",
    "model": "qwen2.5",
    "timeoutMs": 10000
  }
}
```

`LogManager` 支持：

- `debug()`：记录调试日志。
- `info()`：记录普通信息日志。
- `warn()`：记录警告日志。
- `error()`：记录错误日志。
- `query()`：按级别、来源、请求、链路和关键词查询。

日志写入前还会执行 Secret Masking（敏感信息脱敏），避免密钥和敏感字段进入生产日志。

### 5. MetricsAggregator（指标聚合器）

Day72 实现了三类基础指标。

#### Counter（计数器）

Counter（计数器）只累计增加，例如：

```text
agent.execution.count
model.call.count
memory.used.count
```

连续记录三次 `1`，聚合后的总量是 `3`。

#### Gauge（瞬时值）

Gauge（瞬时值）表示当前或最近状态，例如：

```text
model.error.rate
workflow.success.rate
citation.coverage
model.cost
```

它通常重点观察 `latest`，也就是最近一次记录值。

#### Histogram（直方图）

Histogram（直方图）保存一组数值的分布，例如：

```text
agent.latency
workflow.duration
retrieval.latency
model.token.usage
```

它会计算：

- Average（平均值）。
- p50（第 50 百分位，接近中位数）。
- p95（第 95 百分位）。
- p99（第 99 百分位）。
- Min / Max（最小值 / 最大值）。

为什么生产系统不能只看 Average（平均值）？

假设一百个请求中，九十五个耗时一秒，五个耗时十五秒。平均值可能仍然不算特别高，但那五个用户已经获得了非常差的体验。因此生产系统通常重点观察 p95（第 95 百分位）和 p99（第 99 百分位）。

### 6. Agent Platform Metrics（智能体平台统一指标）

Day72 为不同模块定义了统一指标名称。

#### Agent Metrics（智能体指标）

```text
agent.execution.count
agent.failure.rate
agent.latency
```

#### Model Metrics（模型指标）

```text
model.call.count
model.error.rate
model.token.usage
model.cost
```

#### Workflow Metrics（工作流指标）

```text
workflow.success.rate
workflow.duration
workflow.retry.count
```

#### RAG Metrics（检索增强生成指标）

```text
retrieval.hit.rate
retrieval.latency
citation.coverage
```

#### Memory Metrics（记忆指标）

```text
memory.hit.rate
memory.used.count
```

统一命名之后，Dashboard（仪表盘）和 Alert Rule（告警规则）不需要了解每个业务模块的内部实现。

### 7. Distributed Trace V2（分布式链路追踪第 2 版）

Day71 已经存在基础 Trace（链路追踪），但主要为 Agent（智能体）执行和 EvaluationRun（评估运行）服务。

Day72 把它升级为跨模块 Trace Tree（链路树）：

```text
Research Agent
├─ Research Workflow
│  ├─ Planning Model Call
│  ├─ RAG Retrieval
│  └─ Search Tool
├─ Memory Recall
└─ Online Evaluation
```

每个 Span（跨度）包含：

- `spanId`：当前跨度的唯一标识。
- `parentSpanId`：父跨度标识，用于建立树形调用关系。
- `source`：跨度属于哪个模块。
- `durationMs`：跨度持续时间。
- `status`：Running（运行中）、Success（成功）或 Failed（失败）。
- `attributes`：模型、工具、知识库、令牌数量和版本等结构化属性。
- `error`：安全的错误摘要。

`parentSpanId` 是构造 Trace Tree（链路树）的关键。如果没有它，只能得到一组平铺的调用记录，无法知道“谁调用了谁”。

### 8. Trace-Metrics Correlation（链路与指标关联）

这是 Day72 最重要的改进之一。

每条 `MetricRecord` 都可以保存 `traceId`：

```text
retrieval.latency = 11500ms
traceId = trace-day72-slow-rag
```

于是页面可以形成完整诊断路径：

```text
发现 retrieval.latency 上升
          ↓
点击 Metric → Trace
          ↓
打开 trace-day72-slow-rag
          ↓
发现 Slow RAG Retrieval 耗时 11500ms
          ↓
attributes.bottleneck = vector-store
          ↓
根因是 Vector Store（向量存储）检索变慢
```

这比单纯显示“系统变慢了”更有价值，因为它同时说明了“为什么变慢”。

### 9. Error Tracking（错误追踪）

`ErrorTracker` 不会把每次错误都当成完全不同的问题，而是通过 Fingerprint（错误指纹）聚合相同错误。

错误指纹由以下内容组成：

```text
errorType + source + model + message
```

例如两次相同错误：

```text
ModelTimeoutError
source = model-runtime
model = qwen2.5
message = 模型 qwen2.5 调用超时
```

会被聚合成：

```text
ModelTimeoutError
count = 2
traceIds = [...] 
firstSeenAt = ...
lastSeenAt = ...
```

因此系统可以回答：

- 哪类错误出现最多？
- 哪个模型经常超时？
- 错误第一次和最后一次何时出现？
- 哪些 Trace（链路）产生了这种错误？

### 10. Alert Engine（告警引擎）

Day72 内置了六条演示规则：

| 告警规则 | 触发条件 |
| --- | --- |
| Model Error Rate High（模型错误率过高） | `model.error.rate > 5%` |
| Agent P95 Latency High（智能体 P95 延迟过高） | `agent.latency.p95 > 10000ms` |
| Model Cost Budget Exceeded（模型成本超过预算） | `model.cost.sum > 0.1` |
| Citation Coverage Low（引用覆盖率过低） | `citation.coverage < 80%` |
| Model Timeout Repeated（模型超时持续发生） | `ModelTimeoutError.count >= 2` |
| Model Error Logs Growing（模型错误日志增长） | `model-runtime.count >= 2` |

告警生命周期为：

```text
Metric / Error / Log（指标 / 错误 / 日志）
        ↓
匹配 AlertRule（告警规则）
        ↓
创建 Alert（告警）
        ↓
发布 alert.triggered（告警已触发事件）
        ↓
Alert Center（告警中心）
        ↓
点击 Alert → Trace
```

同一规则不会不断创建重复的活动告警，而是更新已有告警的实际值和关联 Trace（链路）。告警恢复正常后可以自动恢复，也可以在页面中手动执行 Resolve（恢复告警）。

### 11. Sampling Strategy（采样策略）

生产请求数量可能非常大，不能永久保存每一条 Trace（链路）。

Day72 支持：

- Full Sampling（全量采样）：开发环境保存全部链路。
- Ratio Sampling（比例采样）：例如普通请求只保存 10%。
- Error Forced Sampling（错误强制采样）：发生错误时必须保存。
- High Value Sampling（高价值请求采样）：VIP（高价值用户）、高成本、关键工作流和低质量请求提高采样率或强制保存。

项目使用 Deterministic Sampling（确定性采样）：根据 `traceId` 计算稳定哈希，而不是每次随机决定。

好处是同一个 `traceId` 的采样结果可以稳定复现，自动化测试不会因为随机结果而忽好忽坏。

### 12. ObservabilityRuntime（可观测运行时）做了什么

`observability-runtime.ts` 是整个 Day72 的 Orchestrator（编排器）。

主要流程是：

```text
startRequest()
  → 创建 RuntimeContext（运行时上下文）
  → 创建 Trace（链路）
  → 写入 observabilityContext（可观测上下文）

startSpan() / endSpan()
  → 构建跨模块调用树

writeLog()
  → LogManager（日志管理器）
  → ObservationEvent（观测事件）
  → EventBus（事件总线）
  → ErrorTracker（错误追踪器）
  → AlertEngine（告警引擎）

recordMetric()
  → MetricsAggregator（指标聚合器）
  → ObservationEvent（观测事件）
  → EventBus（事件总线）
  → AlertEngine（告警引擎）

completeTrace()
  → 完成所有 Span（跨度）
  → 执行最终采样判断
  → 发布 trace.completed（链路已完成事件）

getSnapshot()
  → 汇总 Dashboard（仪表盘）所需全部数据
```

这里运用了 Facade Pattern（外观模式）：页面和 API（应用程序接口）不需要分别操作日志、指标、链路、错误和告警，只需要调用统一的运行时入口。

### 13. 接入历史平台基础设施

#### RuntimeContext（运行时上下文）

Day72 新增：

```ts
observabilityContext = {
  traceId,
  metricsEnabled,
  samplingRate,
  sampled,
  samplingReason
}
```

这样一次请求的所有模块都可以共享相同的可观测上下文。

#### EventBus（事件总线）

新增事件：

```text
metric.recorded
log.created
alert.triggered
trace.completed
```

这里使用 Event-Driven Architecture（事件驱动架构）：模块通过事件协作，避免日志、指标、告警和业务模块彼此产生强耦合。

#### UnifiedRegistry（统一注册中心）

注册了以下生产可观测能力：

```text
LogManager（日志管理器）
MetricsAggregator（指标聚合器）
Distributed Trace Provider V2（分布式链路提供者第 2 版）
AlertEngine（告警引擎）
```

这里使用 Registry Pattern（注册中心模式），让平台能够统一发现当前有哪些可观测能力以及它们的版本、标签和功能。

### 14. 五个演示场景

`observability-fixtures.ts` 中包含五个典型场景。

#### Case 1：Research Agent（研究智能体）完整请求

产生 Agent、Workflow、Model、Tool、Retrieval、Memory 和 Evaluation 全链路，同时产生日志和统一指标。

#### Case 2：Model Timeout（模型超时）

产生错误日志、错误聚合、失败 Span（跨度）和告警，并验证 Error Forced Sampling（错误强制采样）。

#### Case 3：Slow RAG Retrieval（慢检索）

产生持续 11.5 秒的 Retrieval Span（检索跨度），验证 Metric → Trace → Root Cause（指标 → 链路 → 根本原因）的诊断流程。

#### Case 4：Cost Limit（成本超限）

模拟使用 18000 个 Token（令牌）和 `0.22` 模型成本，触发成本告警。

#### Case 5：Unsampled Success（未采样成功请求）

普通请求采样率为零，成功链路不会保存，但仍然计入 Overview（总览）的请求总数。

### 15. 相比 Day71 的改进

| 对比维度 | Day71 | Day72 |
| --- | --- | --- |
| 核心目标 | 评估输出质量 | 观察生产运行状态 |
| 主要问题 | 回答好不好 | 哪里慢、哪里错、为什么告警 |
| 核心数据 | EvaluationRun、Dataset、Score（评估运行、数据集、评分） | Log、Metric、Trace、Error、Alert（日志、指标、链路、错误、告警） |
| 关键能力 | 多维评分、回归、质量门禁 | 日志聚合、指标百分位、链路树、错误追踪和告警 |
| 闭环 | 失败案例进入回归数据集 | 异常指标进入链路根因诊断 |
| 主要页面 | Evaluation Explorer（评估浏览器） | Observability Dashboard（可观测仪表盘） |
| 触发方式 | 在线或离线评估 | 每次运行持续采集观测信号 |
| 关注角色 | 算法、测试和产品质量人员 | 开发、运维和 SRE（站点可靠性工程师） |

最简单的理解是：

```text
Day71：
这个回答只有 6 分，质量退化了。

Day72：
为什么只有 6 分？
因为 RAG（检索增强生成）检索用了 11.5 秒，
引用覆盖率只有 76%，
对应 Trace 是 trace-day72-slow-rag，
瓶颈是 vector-store（向量存储）。
```

Day71 给出 Quality Result（质量结果），Day72 给出 Operational Diagnosis（运行诊断）。

### 16. 为什么要这样设计

#### 日志、指标和链路各有不同职责

- Log（日志）解释具体发生了什么。
- Metric（指标）发现系统是否出现趋势异常。
- Trace（链路）定位异常发生在哪一步。

三者不能互相完全替代，所以需要统一关联，而不是只保留一种观测信号。

#### 所有数据必须关联 traceId

如果日志、指标和链路没有共同标识，就只能分别查看，无法形成 Root Cause Analysis（根因分析）闭环。

#### 观测系统不能拖垮业务系统

因此需要 Sampling（采样），也需要在观测数据不存在时安全返回，而不是让观测系统故障导致业务请求失败。

#### 错误请求比普通请求更值得保存

普通请求可以比例采样，但失败请求必须保存，否则真正需要诊断时反而没有证据。

#### 告警必须可以回到具体请求

只有“错误率超过 5%”还不够。真正可操作的告警必须包含相关 Trace，让开发人员继续定位具体 Model Span（模型跨度）或 Retrieval Span（检索跨度）。

### 17. 前端页面和 API

Observability Dashboard（可观测仪表盘）包含五个标签页：

- Overview（总览）。
- Trace Explorer（链路浏览器）。
- Metrics Explorer（指标浏览器）。
- Alert Center（告警中心）。
- Logs & Errors（日志与错误）。

API Route Handler（接口路由处理器）支持：

```text
GET /api/observability
获取完整仪表盘快照

GET /api/observability?traceId=xxx
查询指定链路、跨度树、关联日志和指标

POST /api/observability
恢复活动告警
```

### 18. 当前项目的真实定位

虽然项目名称是 Production Observability Platform（生产可观测平台），但目前更准确的定位是“生产可观测架构教学实现”。

当前数据主要保存在：

- 内存数组。
- 内存 Map（键值映射容器）。
- 进程级 Singleton（单例）。

真正上线时还可以替换或接入：

- OpenTelemetry（开放遥测标准）采集链路。
- Prometheus（指标监控系统）保存指标。
- Loki / Elasticsearch（日志存储与检索系统）保存日志。
- Tempo / Jaeger（分布式链路追踪系统）保存 Trace。
- Alertmanager（告警管理器）发送邮件、短信或即时通信通知。
- MySQL / Redis（关系型数据库 / 内存数据存储）保存告警状态和规则。

当前项目已经把重要的 Domain Model（领域模型）、Data Flow（数据流）和 Integration Point（集成点）搭好，后续可以替换基础设施，而不需要重新设计业务接口。

---

## 三、对话二：通过生活例子理解 Day72

### 用户提问

> 能举一些生活上的例子来说明 Day72 主要弄什么吗？

### 回答

Day72 最像给 Agent（智能体）安装一套“监控室、行车记录仪、报警器和故障档案”。

### 1. 外卖订单追踪

假设用户点了一份外卖：

```text
用户下单
  → 商家接单
  → 厨房备餐
  → 骑手取餐
  → 骑手配送
  → 用户收餐
```

这和一次 Agent（智能体）请求非常相似：

```text
用户提问
  → Agent 分析
  → Prompt（提示词）生成
  → Model（模型）调用
  → Tool（工具）调用
  → RAG（检索增强生成）检索
  → Memory（记忆）读取
  → 返回答案
```

#### Trace（链路追踪）就是外卖订单号

外卖订单号可以串联整条配送过程：

```text
订单号：20260720-001
├─ 商家接单：2 分钟
├─ 厨房备餐：35 分钟
├─ 骑手等待：12 分钟
├─ 配送：8 分钟
└─ 用户收餐：成功
```

在 Day72 中，`traceId` 就相当于订单号：

```text
trace-day72-slow-rag
├─ Agent Span：14 秒
├─ Model Span：1 秒
├─ Retrieval Span：11.5 秒
└─ Evaluation Span：0.4 秒
```

发现整个请求耗时 14 秒后，继续展开可以发现：

> 不是 Model（模型）慢，而是 Retrieval Span（检索跨度）用了 11.5 秒。

这就是 Root Cause Analysis（根因分析）。

#### Span（跨度）就是订单中的一个环节

- 商家接单是一个 Span（跨度）。
- 厨房备餐是一个 Span（跨度）。
- 骑手配送是一个 Span（跨度）。

每个 Span 都会记录：

- 谁负责。
- 几点开始。
- 几点结束。
- 花了多久。
- 成功还是失败。
- 失败原因是什么。

### 2. 餐厅的日志和指标

假设餐厅发现今天顾客经常投诉上菜慢。

#### Log（日志）是具体记录

```text
12:01 订单 A 进入厨房
12:05 厨师开始制作
12:20 牛肉原料不足
12:35 原料补充完成
12:40 订单 A 出餐
```

Log（日志）适合回答：

> 订单 A 具体发生了什么？

对应 Day72 的 Structured Logging（结构化日志）：

```json
{
  "level": "warn",
  "source": "kitchen",
  "orderId": "A",
  "message": "牛肉原料不足",
  "waitMinutes": 15
}
```

#### Metric（指标）是整体统计

```text
今日订单数量：500
平均出餐时间：18 分钟
P95 出餐时间：42 分钟
订单失败率：6%
退款金额：2000 元
```

Metric（指标）适合回答：

> 整个餐厅是否出现了趋势性问题？

所以：

- Log（日志）关注一件具体事情。
- Metric（指标）关注整体趋势。
- Trace（链路）关注一次订单经过了哪些环节。

### 3. 医院重症监护室

医院的 ICU（重症监护室）就是典型的 Observability（可观测性）系统。

#### Metrics（指标）

监护仪持续记录：

```text
心率：120
血氧：88%
血压：90/60
体温：39.5℃
```

这些数据类似：

```text
model.error.rate = 8%
agent.latency.p95 = 14 秒
citation.coverage = 76%
model.cost = 0.22
```

单个数值不一定代表问题，但连续异常或超过阈值就需要处理。

#### Logs（日志）

护士记录：

```text
10:02 患者出现呼吸急促
10:05 已给予吸氧
10:08 血氧仍然偏低
```

对应 Agent（智能体）系统中的：

```text
模型调用超时
检索结果为空
记忆读取失败
工具返回非法数据
```

#### Alert（告警）

如果血氧低于 90%，监护仪会自动报警：

```text
血氧 < 90% → 严重告警
```

Day72 中类似：

```text
model.error.rate > 5% → 模型错误率告警
agent.latency.p95 > 10 秒 → 延迟告警
citation.coverage < 80% → 引用质量告警
```

这就是 Alert Engine（告警引擎）。

### 4. 快递物流系统

一个快递包裹可能经过：

```text
商家发货
  → 揽件
  → 城市中转站
  → 航空运输
  → 目的地中转站
  → 配送员
  → 签收
```

快递单号就相当于 `traceId`。

如果包裹晚了，不能只告诉用户：

```text
包裹已延迟
```

而应该进一步说明：

```text
包裹在上海中转站停留了 18 小时
原因：航班取消
```

这对应 Day72 的：

```text
Metric（指标）：请求延迟上升
        ↓
Trace（链路）：找到具体请求
        ↓
Span（跨度）：发现 RAG 检索耗时 11.5 秒
        ↓
Root Cause（根因）：vector-store（向量存储）变慢
```

Day72 的重点不是只知道“慢了”，而是知道“慢在哪里”。

### 5. 汽车仪表盘

汽车上的各种功能也可以对应 Day72。

#### Dashboard（仪表盘）

汽车仪表盘展示：

- 当前速度。
- 剩余油量。
- 发动机温度。
- 胎压。
- 故障灯。

Day72 的 Observability Dashboard（可观测仪表盘）展示：

- 请求数量。
- 成功率。
- 平均延迟。
- P95 延迟。
- 模型成本。
- 错误数量。
- 活动告警。

#### Alert（告警）

汽车中的告警包括：

```text
发动机温度过高 → 告警
胎压过低 → 告警
油量不足 → 告警
```

对应 Day72：

```text
模型错误率过高 → 告警
P95 延迟过高 → 告警
成本超过预算 → 告警
引用覆盖率过低 → 告警
```

#### Error Tracking（错误追踪）

修理厂不会只记录：

```text
汽车坏了
```

而是会分类统计：

```text
发动机过热：出现 5 次
胎压异常：出现 2 次
电池电压不足：出现 8 次
```

Day72 也会聚合同类错误：

```text
ModelTimeoutError：出现 253 次
来源：model-runtime
模型：qwen2.5
关联 Trace：……
```

### 6. 商场监控录像与 Sampling（采样）

商场有几百个摄像头。如果把所有高清录像永久保存，成本会非常高。

因此可以采用：

- 正常情况下只保存部分录像。
- 发生打架、火灾或盗窃时保存完整录像。
- 金库、收银台等重要区域保存更多录像。

这就是 Day72 的 Sampling Strategy（采样策略）。

#### 普通请求比例采样

```text
普通请求只保存 10%
```

#### 错误强制采样

```text
发生错误 → 无论是否命中 10%，都必须保存
```

#### 高价值请求采样

```text
VIP（高价值用户）
高成本请求
关键业务工作流
低质量评估结果
```

这些请求可以提高采样率或全部保存。

原因很简单：

> 平时不能把所有东西都永久保存，但真正出问题时必须留下证据。

### 7. Day71 和 Day72 的生活对比

继续用餐厅来理解。

#### Day71 像美食品鉴员

它负责评价菜品：

```text
味道：8 分
卖相：9 分
分量：7 分
安全：10 分
综合：8.5 分
```

它回答：

> 这道菜做得好不好？

#### Day72 像餐厅监控中心

它负责观察生产过程：

```text
厨房今天处理了多少订单？
平均出餐时间是多少？
哪位厨师所在工位最慢？
哪批原料频繁出错？
哪张订单触发了顾客投诉？
```

它回答：

> 为什么这道菜做得慢、做错了，问题具体发生在哪个环节？

因此两天组合起来就是：

```text
Day71：
这次回答质量只有 6 分。

Day72：
质量低的原因是：
RAG（检索增强生成）检索用了 11.5 秒，
引用覆盖率只有 76%，
对应链路是 trace-day72-slow-rag，
瓶颈位于 vector-store（向量存储）。
```

最核心的生活化总结是：

> Day71 像考试老师，负责打分；Day72 像监控室和维修工程师，负责发现异常、保留证据、发出告警并定位故障。

---

## 四、第 72 天打卡

【第72天打卡】

1. 是否定义 ObservationEvent（统一观测事件）：是

2. 是否实现 LogManager（日志管理器）：是

3. 是否实现 Structured Logging（结构化日志）：是

4. 是否实现 MetricsAggregator（指标聚合器）：是

5. 是否统一 Agent Platform Metrics（智能体平台指标）：是

6. 是否升级 Distributed Trace V2（分布式链路追踪第 2 版）：是

7. 是否实现 Trace-Metrics Correlation（链路与指标关联）：是

8. 是否实现 Error Tracking（错误追踪）：是

9. 是否实现 Alert Engine（告警引擎）：是

10. 是否实现 Observability Dashboard（可观测仪表盘）：是

11. Observability（可观测能力）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是

12. 是否实现 Sampling Strategy（采样策略）：是

13. 是否完成 Observability End-to-End Test（可观测平台端到端测试）：是

14. 遇到的最大问题：

    最大问题是如何把原本分散在 Agent（智能体）、Workflow（工作流）、Model（模型）、Tool（工具）、RAG（检索增强生成）、Memory（记忆）和 Evaluation（评估）模块中的 Logs（日志）、Metrics（指标）、Trace（链路）和 Event（事件）统一起来，并通过同一个 `traceId` 建立 Trace-Metrics Correlation（链路与指标关联）。同时还需要解决生产链路数量过大不能全部保存的问题，因此增加 Sampling Strategy（采样策略），并保证 Error Forced Sampling（错误强制采样）的优先级高于普通比例采样。

15. 当前系统能力：

    当前系统已经具备一个较完整的 Agent Platform V1.0（智能体平台第 1.0 版）教学架构，包含：

    - Agent Runtime（智能体运行时）。
    - Model Runtime（模型运行时）与 Model Collaboration（模型协作）。
    - Tool Registry（工具注册表）与 Tool Runtime（工具运行时）。
    - Workflow Runtime（工作流运行时）、Durable Workflow（持久化工作流）、暂停恢复、检查点和回放能力。
    - Prompt Platform（提示词平台）、版本管理、实验和质量晋级能力。
    - Memory Platform（记忆平台）、长期记忆、会话记忆、冲突检测、整合和遗忘能力。
    - Knowledge Platform（知识平台）、文档治理、索引版本、RAG（检索增强生成）、引用和权限过滤能力。
    - Evaluation Platform（评估平台）、在线评估、离线评估、回归评估、多维评分、Quality Gate（质量门禁）、Feedback Loop（反馈闭环）和 Bad Case（坏案例）沉淀能力。
    - RuntimeContext（运行时上下文）、EventBus（事件总线）和 UnifiedRegistry（统一注册中心）等平台基础设施。
    - Production Observability Platform（生产可观测平台），包含 ObservationEvent（统一观测事件）、Structured Logging（结构化日志）、Counter / Gauge / Histogram（计数器 / 瞬时值 / 直方图）、Distributed Trace V2（分布式链路追踪第 2 版）、Trace-Metrics Correlation（链路与指标关联）、Error Tracking（错误追踪）、Alert Engine（告警引擎）、Sampling Strategy（采样策略）和 Observability Dashboard（可观测仪表盘）。
    - Metric → Trace → Root Cause（指标 → 链路 → 根本原因）的生产故障诊断闭环。
    - 覆盖请求全链路、模型失败、慢查询、成本超限和 Trace 查询的 Observability End-to-End Test（可观测平台端到端测试）。

---

## 五、Day72 核心认知

Day72 最重要的一句话是：

> 生产 Agent（智能体）最大的风险不是偶尔出现问题，而是出现问题时不知道问题发生在哪里、为什么发生，以及应该从哪条请求链路开始排查。

完成 Day72 后，系统已经从“能够运行、能够评估”，进一步升级为“能够观察、能够告警、能够定位根因”。

```text
Observe（观察）
  → Detect（发现异常）
  → Alert（触发告警）
  → Correlate（关联日志、指标和链路）
  → Diagnose（诊断根因）
  → Improve（持续改进）
```

---

## 六、Day72 阶段性总结：完成 Agent 平台最后一个核心技术闭环

首先，恭喜完成 Day72。

完成 Day72 后，当前系统已经补齐 Agent Platform（智能体平台）最后一个核心技术闭环：

```text
Production Upgrade V9（生产化升级第 9 版）
Production Observability Platform（生产可观测平台）
```

这一阶段非常重要，因为前面已经具备的：

- Agent（智能体）。
- Workflow（工作流）。
- Memory（记忆）。
- Knowledge（知识平台）。
- Prompt（提示词）。
- Model（模型）。
- Evaluation（评估）。

主要解决的是：

> 系统能够做什么？

而 Day72 进一步解决的是：

> 系统出问题时，能不能快速发现问题、保留证据并找到原因？

### 1. Day72 之前的状态

系统原本已经拥有很多分散指标，例如：

- Model Metrics（模型指标）。
- RAG Metrics（检索增强生成指标）。
- Memory Metrics（记忆指标）。
- Workflow Metrics（工作流指标）。
- Evaluation Metrics（评估指标）。
- Usage Metrics（用量指标）。

问题是这些指标主要由各模块独立维护，Logs（日志）、Metrics（指标）、Trace（链路）和 Event（事件）之间还没有形成统一诊断入口。

### 2. Day72 完成后的状态

Day72 形成了以下完整生产观测链路：

```text
Request（请求）
  ↓
RuntimeContext（运行时上下文）
  ↓
Trace（链路追踪）
  ↓
Logs（日志）
  ↓
Metrics（指标）
  ↓
Alert（告警）
  ↓
Diagnosis（诊断）
```

### 3. Day72 最大升级点

#### 统一可观测事件

所有模块不再只使用：

```ts
console.log()
```

而是统一产生 ObservationEvent（统一观测事件），进入 Observability Platform（可观测平台）进行查询、聚合、关联和展示。

#### Trace-Metrics Correlation（链路与指标联动）

这是生产系统非常重要的能力。

例如：

```text
发现 P95 Latency（第 95 百分位延迟）上升
  ↓
点击 Metric（指标）
  ↓
进入 Trace（链路）
  ↓
发现 RAG Retrieval（检索增强生成检索）耗时 8 秒
  ↓
继续展开 Span Tree（跨度树）
  ↓
发现 Vector Search（向量检索）变慢
  ↓
最终定位 Root Cause（根本原因）
```

#### Agent 平台形成完整工程闭环

当前平台已经形成：

```text
Build（构建）
  ↓
Run（运行）
  ↓
Observe（观察）
  ↓
Evaluate（评估）
  ↓
Improve（改进）
```

### 4. 当前课程和平台能力进度

```text
Agent Core（智能体核心）
██████████████████████████ 100%

Infrastructure（基础设施）
Redis（内存数据存储）          ██████████
Queue（任务队列）              ██████████
Lock（分布式锁）               ██████████
Storage（对象存储）            ██████████
Config（配置管理）             ██████████
Secrets（密钥管理）            ██████████

Production Platform（生产平台）
Runtime（运行时）              ██████████
Registry（注册中心）           ██████████
Prompt（提示词平台）           ██████████
Memory（记忆平台）             ██████████
Knowledge（知识平台）          ██████████
Workflow（工作流平台）         ██████████
Evaluation（评估平台）         ██████████
Observability（可观测平台）    ██████████
```

当前整体学习进度约为：

```text
99.8%
```

剩余的核心任务不再是补充 Agent（智能体）的执行能力，而是完成 Governance（治理）、Security（安全）、Multi-Tenancy（多租户）、Audit（审计）和 Production Readiness（生产就绪）。

---

## 七、Day73 学习计划：Agent Platform Governance & Production Readiness（智能体平台治理与生产就绪）

### 1. Day73 主题

```text
Production Upgrade V10（生产化升级第 10 版）
Agent Platform Governance & Production Readiness（智能体平台治理与生产就绪）
```

### 2. Day73 核心目标

将当前 Agent Platform（智能体平台）从“内部工程系统”升级为“真正可以向多个用户和组织提供服务的生产平台”。

Day73 的核心升级方向是：

```text
Single User Agent System（单用户智能体系统）
  ↓
Multi-Tenant Agent Platform（多租户智能体平台）
```

### 3. 为什么需要 Day73

当前系统已经具备：

```text
Agent Runtime（智能体运行时）
  + Workflow（工作流）
  + Knowledge（知识平台）
  + Memory（记忆平台）
  + Evaluation（评估平台）
  + Observability（可观测平台）
```

但是生产环境还必须回答：

- 谁可以使用平台？
- 用户能够访问哪些能力和资源？
- 如何隔离不同用户和组织的数据？
- 如何控制 Token（令牌）、成本、工作流和存储额度？
- 如何记录谁在什么时候执行了什么操作？
- 如何安全发布新版本？
- 发生问题后如何回滚？

### 4. Day73 最终架构

```text
                    Agent Platform（智能体平台）
                              │
                    API Gateway Layer（接口网关层）
                              │
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
      Auth（身份认证）  Tenant（租户）  Policy（策略）
              ↓               ↓               ↓
      RBAC（角色权限） Quota（配额） Audit（审计）
              └───────────────┼───────────────┘
                              ↓
                    Runtime Platform（运行时平台）
```

---

## 八、Day73 任务清单

### 任务 1：定义 User Identity System（用户身份系统）

新增统一用户身份结构：

```ts
type UserIdentity = {
  id: string;
  email?: string;
  name?: string;
  status: "active" | "disabled";
  createdAt: number;
};
```

之前的 RuntimeContext（运行时上下文）虽然已经包含 `userId`，但 `userId` 只是一个标识，还没有完整的 User Identity System（用户身份系统）。

用户身份系统需要负责：

- 标识用户是谁。
- 保存用户基本资料。
- 标记用户是 Active（正常启用）还是 Disabled（已禁用）。
- 为 Authentication（身份认证）、Authorization（权限授权）和 Audit（审计）提供用户依据。

### 任务 2：实现 Organization / Tenant（组织 / 租户）

生产 SaaS（软件即服务）平台不能只有 User（用户），还需要 Organization / Tenant（组织 / 租户）体系。

```ts
type Tenant = {
  id: string;
  name: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "suspended";
  createdAt: number;
};
```

Tenant（租户）和资源之间的关系为：

```text
Tenant（租户）
  ├─ User（用户）
  ├─ Workspace（工作空间）
  ├─ KnowledgeBase（知识库）
  ├─ Agent（智能体）
  └─ Workflow（工作流）
```

`plan` 字段用于区分 Free（免费版）、Pro（专业版）和 Enterprise（企业版），为后续 Quota（配额）和能力限制提供基础。

### 任务 3：RuntimeContext（运行时上下文）增加 Tenant Context（租户上下文）

升级 RuntimeContext（运行时上下文），增加 Identity Context（身份上下文）：

```ts
runtimeContext.identityContext = {
  userId,
  tenantId,
  roles,
  permissions
};
```

以后所有核心资源都必须携带 `tenantId`。

例如 Knowledge（知识）资源以前可能只保存：

```text
knowledgeBaseId
```

升级后必须保存：

```text
tenantId + knowledgeBaseId
```

这样每次 Agent、Workflow、Knowledge、Memory、Prompt 和 Evaluation 调用都可以知道请求属于哪个用户和租户。

### 任务 4：实现 RBAC（基于角色的访问控制）

新增 Role（角色）和 Permission（权限）模型：

```ts
type Role = {
  id: string;
  name: string;
  permissions: string[];
};
```

Permission（权限）可以使用统一命名：

```text
agent.execute（执行智能体）
workflow.create（创建工作流）
workflow.cancel（取消工作流）
knowledge.read（读取知识）
knowledge.delete（删除知识）
prompt.publish（发布提示词）
evaluation.run（运行评估）
```

默认角色可以包括：

#### Admin（管理员）

拥有全部平台权限。

#### Developer（开发者）

- 创建和修改 Agent（智能体）。
- 修改 Prompt（提示词）。
- 运行 Evaluation（评估）。

#### User（普通用户）

- 调用 Agent（智能体）。
- 查询自己的执行结果。

#### Viewer（只读查看者）

只允许查看资源和结果，不能执行修改操作。

### 任务 5：实现 Permission Checker（权限检查器）

新增 PermissionService（权限服务）：

```ts
class PermissionService {
  check(user, permission) {
    // 返回允许或拒绝结果
  }
}
```

权限检查需要接入关键操作之前：

```text
Agent 执行前：agent.execute？
Workflow 启动前：workflow.run？
Knowledge 检索前：knowledge.read？
Prompt 发布前：prompt.publish？
Evaluation 运行前：evaluation.run？
```

权限不足时必须返回 Permission Denied（权限拒绝），同时发布 `permission.denied`（权限已拒绝）事件并记录 Audit Log（审计日志）。

### 任务 6：实现 Resource Ownership（资源归属）

所有核心资源需要增加 Owner Context（所有者上下文）：

```ts
ownerContext = {
  tenantId,
  createdBy
};
```

需要补充资源归属的对象包括：

- Agent（智能体）。
- AgentDefinition（智能体定义）。
- Workflow（工作流）。
- WorkflowDefinition（工作流定义）。
- Prompt（提示词）。
- ProductionPrompt（生产提示词）。
- Knowledge（知识）。
- KnowledgeBase（知识库）。
- Evaluation（评估）。
- EvaluationDataset（评估数据集）。

Resource Ownership（资源归属）用于判断资源属于哪个 Tenant（租户），由哪个 User（用户）创建，以及谁有权读取、修改、发布或删除它。

### 任务 7：实现 Tenant Isolation（租户隔离）

Tenant Isolation（租户隔离）是 Multi-Tenancy（多租户体系）中最重要的安全能力。

所有数据查询都必须自动添加租户过滤条件：

```sql
WHERE tenant_id = 当前租户标识
```

例如以前可能调用：

```ts
knowledgeStore.list();
```

升级后应改为：

```ts
knowledgeStore.list({ tenantId });
```

系统必须保证：

```text
Tenant A（租户 A）不能看到 Tenant B（租户 B）的数据。
```

租户隔离不仅适用于 Knowledge（知识），还应覆盖 Agent、Workflow、Prompt、Memory、Evaluation、Trace 和 Audit Log 等全部租户资源。

### 任务 8：实现 Usage Quota（用量配额）

系统已经拥有 UsageManager（用量管理器），Day73 需要把它升级为租户级额度管理。

```ts
type TenantQuota = {
  dailyTokens: number;
  monthlyCost: number;
  maxWorkflow: number;
  maxKnowledgeSize: number;
};
```

配额检查包括：

- 模型调用前检查 Daily Tokens（每日令牌额度）是否足够。
- 模型调用前检查 Monthly Cost（每月成本额度）是否超限。
- Workflow（工作流）创建前检查最大工作流数量。
- Knowledge（知识）上传或索引前检查最大知识库容量。

超过额度时需要：

- 拒绝继续执行高成本操作。
- 发布 `quota.exceeded`（配额已超出）事件。
- 创建 Audit Log（审计日志）。
- 在 Quota Dashboard（配额仪表盘）展示超限状态。

### 任务 9：实现 API Gateway Layer（接口网关层）

增加统一生产接口入口：

```text
/api/v1
```

API Gateway Layer（接口网关层）需要统一处理：

#### Authentication（身份认证）

验证 Token（身份令牌）是否合法，并识别请求用户。

#### Authorization（权限授权）

调用 PermissionService（权限服务）检查当前用户是否允许执行目标操作。

#### Rate Limit（请求频率限制）

限制单个用户或租户在指定时间内可以发送的请求数量，避免恶意请求、程序错误或流量突增拖垮系统。

#### Request Context（请求上下文）

为每个请求统一生成或传递：

```text
RequestId（请求标识）
TenantId（租户标识）
UserId（用户标识）
```

API Gateway（接口网关）是生产请求进入 Agent Platform（智能体平台）的第一道安全边界。

### 任务 10：实现 Audit Log（审计日志）

生产平台必须知道“谁在什么时候对什么资源执行了什么操作，以及操作是否成功”。

```ts
type AuditLog = {
  id: string;
  userId: string;
  tenantId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: "success" | "failed";
  timestamp: number;
};
```

典型审计记录包括：

```text
User A（用户 A）发布 Prompt v3（提示词第 3 版）：成功
Admin（管理员）删除 Knowledge Base（知识库）：成功
User B（用户 B）执行 prompt.publish（发布提示词）：权限拒绝
Tenant C（租户 C）超过每日令牌配额：失败
```

Audit Log（审计日志）与普通 Log（运行日志）的区别是：

- 普通日志重点记录系统运行细节。
- 审计日志重点记录用户、权限、资源、动作和结果。
- 审计日志通常需要更严格的保存、查询和防篡改策略。

### 任务 11：实现 Governance Dashboard（治理仪表盘）

新增平台治理页面，并包含以下主要区域。

#### Tenant Explorer（租户浏览器）

展示：

- Tenant（租户）。
- Users（用户）。
- Usage（用量）。
- Resources（资源）。

#### Permission Explorer（权限浏览器）

展示：

- Role（角色）。
- Permission（权限）。
- User Mapping（用户与角色映射）。

#### Audit Explorer（审计浏览器）

展示：

- 谁执行了操作。
- 什么时候执行。
- 操作了什么资源。
- 操作结果是成功、失败还是权限拒绝。

#### Quota Dashboard（配额仪表盘）

展示：

- Token（令牌）用量。
- Cost（成本）。
- Workflow（工作流）数量。
- Storage（存储）用量。

### 任务 12：接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）

#### RuntimeContext（运行时上下文）

增加 Security Context（安全上下文）：

```ts
securityContext = {
  tenantId,
  userId,
  roles,
  permissions
};
```

`identityContext`（身份上下文）和 `securityContext`（安全上下文）可以作为统一身份安全模型设计：前者描述用户和租户是谁，后者描述他们拥有哪些角色和权限。

#### EventBus（事件总线）

新增：

```text
user.created（用户已创建）
tenant.created（租户已创建）
permission.denied（权限已拒绝）
quota.exceeded（配额已超出）
audit.created（审计记录已创建）
```

#### UnifiedRegistry（统一注册中心）

注册：

- AuthProvider（身份认证提供者）。
- PermissionService（权限服务）。
- QuotaManager（配额管理器）。
- AuditLogger（审计日志记录器）。

### 任务 13：完成 Production Security Test（生产安全测试）

#### Case 1：用户认证

创建 User（用户）并执行登录，验证生成包含用户、租户和权限信息的 RuntimeContext（运行时上下文）。

#### Case 2：权限拒绝

普通 User（用户）尝试执行：

```text
prompt.publish（发布提示词）
```

预期结果：Permission Denied（权限拒绝），同时产生 `permission.denied` 事件和 Audit Log（审计日志）。

#### Case 3：Tenant Isolation（租户隔离）

Tenant A（租户 A）创建 Knowledge（知识），Tenant B（租户 B）尝试搜索。

预期结果：Tenant B 不能读取 Tenant A 的知识数据。

#### Case 4：Quota（配额）限制

租户超过 Token Quota（令牌配额）后继续调用模型。

预期结果：模型调用被拒绝，产生 `quota.exceeded` 事件和审计记录。

#### Case 5：Audit（审计）

执行删除 Workflow（工作流）操作，检查 Audit Log（审计日志）是否正确记录用户、租户、资源、动作和结果。

#### Case 6：完整生产请求链

调用 Agent（智能体），验证完整链路包含：

```text
User（用户）
  ↓
Tenant（租户）
  ↓
Permission（权限）
  ↓
Trace（链路）
  ↓
Usage（用量）
  ↓
Audit（审计）
```

---

## 九、Day73 验收标准

1. 是否实现 User Identity System（用户身份系统）。
2. 是否实现 Tenant System（租户系统）。
3. RuntimeContext（运行时上下文）是否支持 Tenant Context（租户上下文）。
4. 是否实现 RBAC（基于角色的访问控制）。
5. 是否实现 Permission Checker（权限检查器）。
6. 是否实现 Resource Ownership（资源归属）。
7. 是否实现 Tenant Isolation（租户隔离）。
8. 是否实现 Usage Quota（用量配额）。
9. 是否实现 API Gateway Layer（接口网关层）。
10. 是否实现 Audit Log（审计日志）。
11. 是否实现 Governance Dashboard（治理仪表盘）。
12. 是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
13. 是否完成 Production Security Test（生产安全测试）。

---

## 十、Day73 打卡模板

【第73天打卡】

1. 是否实现 User Identity System（用户身份系统）：是 / 否

2. 是否实现 Tenant System（租户系统）：是 / 否

3. RuntimeContext（运行时上下文）是否支持 Tenant Context（租户上下文）：是 / 否

4. 是否实现 RBAC（基于角色的访问控制）：是 / 否

5. 是否实现 Permission Checker（权限检查器）：是 / 否

6. 是否实现 Resource Ownership（资源归属）：是 / 否

7. 是否实现 Tenant Isolation（租户隔离）：是 / 否

8. 是否实现 Usage Quota（用量配额）：是 / 否

9. 是否实现 API Gateway Layer（接口网关层）：是 / 否

10. 是否实现 Audit Log（审计日志）：是 / 否

11. 是否实现 Governance Dashboard（治理仪表盘）：是 / 否

12. 是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是 / 否

13. 是否完成 Production Security Test（生产安全测试）：是 / 否

14. 遇到的最大问题：


15. 当前系统能力：

---

## 十一、Day73 核心认知

Day73 最重要的一句话是：

> 一个 Agent Demo（智能体演示项目）关注“智能”；一个 Agent Platform（智能体平台）关注“谁能安全、合规、可控地使用智能”。

完成 Day73 后，系统目标状态是：

```text
Agent Platform v1.0 Production Ready
智能体平台第 1.0 版达到生产就绪状态
```

最终治理架构为：

```text
User（用户）
  ↓
Tenant（租户）
  ↓
Auth / RBAC（身份认证 / 基于角色的访问控制）
  ↓
RuntimeContext（运行时上下文）
  ↓
Agent Runtime（智能体运行时）
  ↓
Workflow（工作流）
  ↓
Knowledge（知识平台）
  ↓
Memory（记忆平台）
  ↓
Prompt（提示词平台）
  ↓
Evaluation（评估平台）
  ↓
Observability（可观测平台）
  ↓
Audit / Governance（审计 / 治理）
```

---

## 十二、Day74 预告：Final Capstone Agent Platform Release（最终综合项目：智能体平台发布）

如果继续进入 Day74，主题将是把七十多天构建的系统整理为真正可以部署、演示和用于作品集的完整项目。

主要内容包括：

- Dockerization（Docker 容器化）。
- CI/CD（持续集成与持续交付）。
- Production Deployment（生产部署）。
- Health Check（健康检查）。
- Backup & Restore（备份与恢复）。
- Disaster Recovery（灾难恢复）。
- Architecture Documentation（架构文档）。
- Portfolio Demo（作品集演示项目）。

最终目标是把当前 Engineering Demo（工程演示项目）升级为：

```text
Deployable Agent Platform（可部署的智能体平台）
```

完成这些内容后，整个学习项目将同时具备 Agent Engineering（智能体工程）、Platform Engineering（平台工程）、Production Engineering（生产工程）和 Governance Engineering（治理工程）的完整能力展示。
