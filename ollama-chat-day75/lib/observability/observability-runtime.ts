import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建统一观测事件和运行事件标识。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第72天：引入内存事件总线发布指标、日志、告警和链路事件。
import type { EventType, RuntimeEvent } from "@/lib/events/event-types"; // 第72天：引入统一事件类型和运行事件结构。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第72天：引入历史统一注册中心作为生产可观测平台能力底座。
import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第72天：引入统一注册中心类型用于依赖注入。
import { runtimeContextBuilder, type RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第72天：引入统一运行时上下文构建器并注入 observabilityContext。
import { AlertEngine } from "@/lib/observability/alert-engine"; // 第72天：引入生产告警引擎。
import { DistributedTraceProviderV2 } from "@/lib/observability/distributed-trace-provider"; // 第72天：引入分布式链路追踪提供者第二版。
import { ErrorTracker } from "@/lib/observability/error-tracker"; // 第72天：引入错误自动聚合追踪器。
import { LogManager } from "@/lib/observability/log-manager"; // 第72天：引入结构化日志管理器。
import { MetricsAggregator } from "@/lib/observability/metrics-aggregator"; // 第72天：引入统一指标聚合器。
import { DEFAULT_SAMPLING_POLICY } from "@/lib/observability/sampling-strategy"; // 第72天：引入默认生产链路采样策略。
import { AGENT_PLATFORM_METRICS, type Alert, type AlertRule, type DistributedTraceSpan, type DistributedTraceV2, type ErrorEvent, type LogRecord, type MetricKind, type MetricLabels, type MetricRecord, type ObservationEvent, type ObservationLevel, type ObservationSource, type ObservabilitySnapshot, type SamplingPolicy, type TraceQueryResult } from "@/lib/observability/types"; // 第72天：引入可观测运行时使用的完整领域类型和统一指标名称。

export type StartObservationRequest = { requestId?: string; traceId?: string; sessionId?: string; rootOperation: string; agentId?: string; taskId?: string; metricsEnabled?: boolean; policy?: SamplingPolicy; vip?: boolean; criticalWorkflow?: boolean; estimatedCost?: number; qualityScore?: number; startedAt?: number }; // 第72天：定义创建可观测请求上下文和完整链路的输入。
export type StructuredLogInput = { level: ObservationLevel; message: string; source: string; observationSource: ObservationSource; traceId: string; requestId?: string; metadata?: Record<string, unknown>; createdAt?: number }; // 第72天：定义运行时写入结构化日志并自动关联错误追踪的输入。
export type RecordMetricInput = { name: string; kind: MetricKind; value: number; source: ObservationSource; traceId?: string; requestId?: string; labels?: MetricLabels; timestamp?: number }; // 第72天：定义运行时记录统一指标和链路关联的输入。
export type CaptureErrorInput = { errorType: string; message: string; stack?: string; source: string; traceId?: string; requestId?: string; model?: string; timestamp?: number }; // 第72天：定义运行时直接捕获结构化错误的输入。

type RequestOutcome = { traceId: string; status: "success" | "failed"; durationMs: number; completedAt: number }; // 第72天：定义包含未采样请求在内的总览统计结果。

function p95(values: number[]): number { // 第72天：定义仪表盘请求延迟第95百分位计算函数。
  if (values.length === 0) return 0; // 第72天：空请求集合安全返回零。
  const sorted = [...values].sort((left, right) => left - right); // 第72天：复制并升序排列请求延迟。
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0; // 第72天：使用最近秩算法读取第95百分位延迟。
} // 第72天：结束仪表盘请求延迟百分位计算函数。

function samplingRate(trace: DistributedTraceV2, policy: SamplingPolicy): number { // 第72天：根据采样原因计算写入运行时上下文的实际比例。
  return trace.samplingReason === "ratio" ? policy.samplingRate : trace.sampled ? 1 : policy.samplingRate; // 第72天：强制或全量采样记录一，普通比例采样记录策略比例。
} // 第72天：结束运行时上下文采样比例计算函数。

export class ObservabilityRuntime { // 第72天：实现统一日志、指标、链路、错误、告警、采样和平台接入的可观测核心运行时。
  readonly registry: UnifiedRegistry; // 第72天：公开统一注册中心供页面和测试验证可观测能力注册。
  readonly eventBus = new MemoryEventBus(500); // 第72天：创建保存五百条事件历史的统一事件总线。
  readonly logManager = new LogManager(); // 第72天：创建结构化日志管理器。
  readonly metricsAggregator = new MetricsAggregator(); // 第72天：创建统一指标聚合器。
  readonly traceProvider = new DistributedTraceProviderV2(); // 第72天：创建分布式链路追踪提供者第二版。
  readonly errorTracker = new ErrorTracker(); // 第72天：创建错误自动聚合追踪器。
  readonly alertEngine = new AlertEngine(); // 第72天：创建读取指标、日志和错误信号的告警引擎。
  private readonly contexts = new Map<string, RuntimeContextV2>(); // 第72天：按链路标识保存注入 observabilityContext 的统一运行时上下文。
  private readonly observations: ObservationEvent[] = []; // 第72天：保存链路、指标和日志三类统一观测事件。
  private readonly outcomes: RequestOutcome[] = []; // 第72天：保存包含未采样请求在内的总览统计结果。

  constructor(registry: UnifiedRegistry = createDay66UnifiedRegistry()) { // 第72天：允许复用外部注册中心并默认继承历史智能体平台能力。
    this.registry = registry; // 第72天：保存统一注册中心依赖。
    this.registerCapabilities(); // 第72天：注册日志、指标、链路和告警四类核心可观测能力。
    this.registerDefaultAlertRules(); // 第72天：注册错误率、延迟、成本、引用质量和错误数量默认规则。
  } // 第72天：结束生产可观测运行时构造函数。

  async startRequest(input: StartObservationRequest): Promise<{ context: RuntimeContextV2; trace: DistributedTraceV2 }> { // 第72天：创建统一请求上下文并开始一次分布式链路。
    const requestId = input.requestId?.trim() || `req_${randomUUID()}`; // 第72天：优先复用上游请求标识否则生成新标识。
    const traceId = input.traceId?.trim() || `trace_${randomUUID()}`; // 第72天：优先复用上游链路标识否则生成新标识。
    const policy = input.policy ?? DEFAULT_SAMPLING_POLICY; // 第72天：使用请求级策略或默认生产采样策略。
    const trace = this.traceProvider.startTrace({ traceId, requestId, rootOperation: input.rootOperation, policy, vip: input.vip, criticalWorkflow: input.criticalWorkflow, estimatedCost: input.estimatedCost, qualityScore: input.qualityScore, startedAt: input.startedAt }); // 第72天：开始完整链路并执行全量、比例或高价值采样决策。
    const context = runtimeContextBuilder.build({ requestId, traceId, sessionId: input.sessionId, agentId: input.agentId, taskId: input.taskId, observabilityContext: { traceId, metricsEnabled: input.metricsEnabled ?? true, samplingRate: samplingRate(trace, policy), sampled: trace.sampled, samplingReason: trace.samplingReason }, metadata: { rootOperation: input.rootOperation } }); // 第72天：把链路、指标开关和采样信息注入统一运行时上下文。
    this.contexts.set(traceId, context); // 第72天：按链路标识保存运行时上下文供日志、指标和事件复用。
    this.addObservation("trace", "system", "info", context, { operation: trace.rootOperation, status: "running", sampled: trace.sampled, samplingReason: trace.samplingReason }, trace.startedAt); // 第72天：创建链路开始统一观测事件。
    await this.publish("runtime.started", context, { operation: trace.rootOperation, sampled: trace.sampled }, "observability"); // 第72天：通过历史 EventBus 标记可观测请求运行开始。
    return { context: structuredClone(context), trace }; // 第72天：返回统一上下文和初始链路防御性快照。
  } // 第72天：结束可观测请求启动方法。

  startSpan(traceId: string, input: { parentSpanId?: string; name: string; source: ObservationSource; attributes?: Record<string, unknown>; startedAt?: number }): string { // 第72天：在当前请求链路中开始一个跨模块跨度。
    return this.traceProvider.startSpan(traceId, input); // 第72天：委托链路提供者保存父子关系和结构化属性。
  } // 第72天：结束跨模块跨度启动方法。

  endSpan(traceId: string, spanId: string, status: "success" | "failed" = "success", input: { attributes?: Record<string, unknown>; error?: string; endedAt?: number } = {}): DistributedTraceSpan | undefined { // 第72天：结束跨度并写入耗时、状态和错误摘要。
    return this.traceProvider.endSpan(traceId, spanId, status, input); // 第72天：委托链路提供者计算持续时间和强制错误采样。
  } // 第72天：结束跨模块跨度完成方法。

  async writeLog(input: StructuredLogInput): Promise<LogRecord> { // 第72天：写入结构化日志并接入观测事件、EventBus、错误追踪和告警。
    const logInput = { message: input.message, source: input.source, requestId: input.requestId ?? this.contexts.get(input.traceId)?.requestId, traceId: input.traceId, metadata: input.metadata, createdAt: input.createdAt }; // 第72天：补齐当前链路对应的请求标识和结构化字段。
    const record = input.level === "debug" ? this.logManager.debug(logInput) : input.level === "info" ? this.logManager.info(logInput) : input.level === "warn" ? this.logManager.warn(logInput) : this.logManager.error(logInput); // 第72天：按照日志级别调用统一日志管理器。
    const context = this.contextFor(input.traceId, record.requestId); // 第72天：读取或补齐当前日志关联的统一运行时上下文。
    this.addObservation("log", input.observationSource, input.level, context, { message: record.message, source: record.source, ...record.metadata }, record.createdAt); // 第72天：把结构化日志转换为统一观测事件。
    await this.publish("log.created", context, record, "observability"); // 第72天：发布日志已创建事件供订阅者消费。
    await this.publishAlerts(this.alertEngine.evaluateLog(record, this.logManager.query({ source: record.source }).length, record.createdAt), context); // 第72天：使用当前来源日志数量计算日志告警规则并发布新告警。
    if (record.level === "error") await this.captureError({ errorType: typeof record.metadata.errorType === "string" ? record.metadata.errorType : "RuntimeError", message: record.message, stack: typeof record.metadata.stack === "string" ? record.metadata.stack : undefined, source: record.source, traceId: record.traceId, requestId: record.requestId, model: typeof record.metadata.model === "string" ? record.metadata.model : undefined, timestamp: record.createdAt }); // 第72天：错误日志自动进入错误追踪并强制保留关联链路。
    return record; // 第72天：返回已经写入全部观测闭环的结构化日志。
  } // 第72天：结束结构化日志写入闭环方法。

  async recordMetric(input: RecordMetricInput): Promise<MetricRecord | undefined> { // 第72天：记录指标并接入统一观测事件、EventBus、链路关联和告警。
    const context = input.traceId ? this.contextFor(input.traceId, input.requestId) : undefined; // 第72天：按需读取指标关联的统一运行时上下文。
    if (context?.observabilityContext?.metricsEnabled === false) return undefined; // 第72天：请求明确关闭指标采集时跳过记录。
    const record = this.metricsAggregator.recordMetric({ name: input.name, kind: input.kind, value: input.value, source: input.source, requestId: input.requestId ?? context?.requestId, traceId: input.traceId, labels: input.labels, timestamp: input.timestamp }); // 第72天：把统一名称、类型、标签和链路写入指标聚合器。
    const eventContext = context ?? this.contextFor(input.traceId ?? `metric-trace-${record.id}`, record.requestId); // 第72天：为平台级无链路指标创建最小统一上下文。
    this.addObservation("metric", input.source, "info", eventContext, { name: record.name, kind: record.kind, value: record.value, labels: record.labels }, record.timestamp); // 第72天：把指标样本转换为统一观测事件。
    await this.publish("metric.recorded", eventContext, record, "observability"); // 第72天：发布指标已记录事件供仪表盘和扩展订阅者消费。
    const aggregate = this.metricsAggregator.aggregate(record.name); // 第72天：读取包含最新样本的指标聚合结果。
    if (aggregate) await this.publishAlerts(this.alertEngine.evaluateMetric(aggregate, record.timestamp), eventContext); // 第72天：使用聚合值、平均值或百分位计算告警并发布新告警。
    return record; // 第72天：返回已经接入链路和告警的指标记录。
  } // 第72天：结束统一指标记录闭环方法。

  async captureError(input: CaptureErrorInput): Promise<ErrorEvent> { // 第72天：捕获错误并接入强制采样、EventBus 和错误数量告警。
    const error = this.errorTracker.capture(input); // 第72天：按错误指纹累加次数并保存来源、模型和链路。
    if (input.traceId) this.traceProvider.forceSample(input.traceId, "error-forced"); // 第72天：错误发生时无条件强制保留完整链路。
    const context = this.contextFor(input.traceId ?? `error-trace-${error.id}`, input.requestId); // 第72天：读取错误关联上下文或创建最小上下文。
    await this.publish("error.occurred", context, error, "observability"); // 第72天：发布统一错误发生事件供历史订阅者和诊断流程消费。
    await this.publishAlerts(this.alertEngine.evaluateError(error, input.timestamp), context); // 第72天：使用同类错误累计次数计算错误追踪告警。
    return error; // 第72天：返回最新错误聚合结果。
  } // 第72天：结束错误追踪闭环方法。

  async completeTrace(traceId: string, status: "success" | "failed" = "success", endedAt = Date.now()): Promise<DistributedTraceV2 | undefined> { // 第72天：结束完整链路并发布链路完成事件。
    const trace = this.traceProvider.endTrace(traceId, status, endedAt); // 第72天：完成所有运行中跨度并执行最终错误强制采样判断。
    if (!trace) return undefined; // 第72天：目标链路不存在时安全返回空值。
    const context = this.contextFor(traceId, trace.requestId); // 第72天：读取链路关联的统一运行时上下文。
    if (context.observabilityContext) { context.observabilityContext.sampled = trace.sampled; context.observabilityContext.samplingReason = trace.samplingReason; } // 第72天：把最终错误强制采样结果同步回运行时上下文。
    this.outcomes.push({ traceId, status, durationMs: trace.durationMs, completedAt: endedAt }); // 第72天：保存包含未采样链路在内的请求总览结果。
    this.addObservation("trace", "system", status === "failed" ? "error" : "info", context, { operation: trace.rootOperation, status, durationMs: trace.durationMs, sampled: trace.sampled, samplingReason: trace.samplingReason }, endedAt); // 第72天：创建链路完成统一观测事件。
    await this.publish("trace.completed", context, trace, "observability"); // 第72天：发布链路已完成事件并回显最终采样结果。
    await this.publish("runtime.completed", context, { operation: trace.rootOperation, status, durationMs: trace.durationMs }, "observability"); // 第72天：发布统一运行时完成事件保持历史链路一致性。
    return trace; // 第72天：返回完整链路最终快照。
  } // 第72天：结束完整链路完成闭环方法。

  queryTrace(traceId: string): TraceQueryResult { // 第72天：从链路标识进入跨度树、日志和指标根因诊断。
    return { trace: this.traceProvider.getTrace(traceId), tree: this.traceProvider.buildTree(traceId), logs: this.logManager.query({ traceId }), metrics: this.metricsAggregator.queryMetric({ traceId }) }; // 第72天：返回同一链路下的完整调用链和关联观测数据。
  } // 第72天：结束链路根因诊断查询方法。

  resolveAlert(alertId: string): Alert | undefined { return this.alertEngine.resolve(alertId); } // 第72天：提供告警中心手动恢复活动告警的入口。

  getSnapshot(): ObservabilitySnapshot { // 第72天：生成可观测仪表盘、接口和测试共享的完整快照。
    const traces = this.traceProvider.listTraces(); // 第72天：读取最终命中采样策略的完整分布式链路。
    const metricRecords = this.metricsAggregator.queryMetric(); // 第72天：读取全部统一指标明细。
    const metrics = this.metricsAggregator.aggregateAll(); // 第72天：读取全部 Counter、Gauge 和 Histogram 聚合结果。
    const errors = this.errorTracker.list(); // 第72天：读取按次数排序的错误聚合结果。
    const alerts = this.alertEngine.listAlerts(); // 第72天：读取活动告警和历史告警。
    const durations = this.outcomes.map((outcome) => outcome.durationMs); // 第72天：提取全部请求持续时间用于总览统计。
    const cost = this.metricsAggregator.aggregate(AGENT_PLATFORM_METRICS.modelCost)?.sum ?? 0; // 第72天：累计统一模型成本指标。
    const overview = { requests: this.outcomes.length, successRate: this.outcomes.length === 0 ? 1 : this.outcomes.filter((outcome) => outcome.status === "success").length / this.outcomes.length, averageLatency: durations.length === 0 ? 0 : Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2)), p95Latency: p95(durations), cost, errors: errors.reduce((sum, error) => sum + error.count, 0), activeAlerts: alerts.filter((alert) => alert.status === "active").length }; // 第72天：聚合请求、成功率、平均与P95延迟、成本、错误和活动告警。
    return { overview, observations: this.observations.map((event) => structuredClone(event)), logs: this.logManager.list(), metricRecords, metrics, traces, traceTrees: Object.fromEntries(traces.map((trace) => [trace.traceId, this.traceProvider.buildTree(trace.traceId)])), errors, alertRules: this.alertEngine.listRules(), alerts, events: this.eventBus.getHistory(), runtimeContexts: Array.from(this.contexts.values()).map((context) => structuredClone(context)), registryItems: this.registry.list("observability"), generatedAt: Date.now() }; // 第72天：返回完整可观测平台快照和三大平台接入证据。
  } // 第72天：结束生产可观测平台完整快照生成方法。

  private contextFor(traceId: string, requestId?: string): RuntimeContextV2 { // 第72天：读取已有上下文或为平台级信号创建最小统一上下文。
    const existing = this.contexts.get(traceId); // 第72天：按链路标识查找已有请求上下文。
    if (existing) return existing; // 第72天：命中时复用同一上下文保证链路一致性。
    const context = runtimeContextBuilder.build({ traceId, requestId, observabilityContext: { traceId, metricsEnabled: true, samplingRate: 1, sampled: true, samplingReason: "platform-signal" } }); // 第72天：为无业务请求的指标或错误补齐最小可观测上下文。
    this.contexts.set(traceId, context); // 第72天：保存最小上下文供后续同一信号复用。
    return context; // 第72天：返回新建的统一运行时上下文。
  } // 第72天：结束统一运行时上下文读取与补齐方法。

  private addObservation(type: ObservationEvent["type"], source: ObservationSource, level: ObservationLevel, context: RuntimeContextV2, data: Record<string, unknown>, timestamp: number): void { // 第72天：创建链路、指标或日志统一观测事件。
    this.observations.push({ id: `observation_${randomUUID()}`, type, source, level, requestId: context.requestId, traceId: context.traceId, timestamp, data: structuredClone(data) }); // 第72天：保存包含请求、链路和结构化数据的观测事件。
  } // 第72天：结束统一观测事件创建方法。

  private async publish(type: EventType, context: RuntimeContextV2, payload: unknown, source: string): Promise<void> { // 第72天：把可观测平台状态变化发布到统一事件总线。
    const event: RuntimeEvent = { id: `event_${randomUUID()}`, type, timestamp: Date.now(), traceId: context.traceId, runtimeContextId: context.requestId, payload: structuredClone(payload), metadata: { source, status: "completed", version: "2.0.0" } }; // 第72天：创建与运行时上下文和链路标识一致的统一事件。
    await this.eventBus.publish(event); // 第72天：等待全部订阅者处理并保存事件历史。
  } // 第72天：结束统一事件发布方法。

  private async publishAlerts(alerts: Alert[], context: RuntimeContextV2): Promise<void> { // 第72天：发布本轮新触发的全部告警事件。
    for (const alert of alerts) await this.publish("alert.triggered", context, alert, "observability"); // 第72天：逐条发布告警已触发事件供告警中心和外部通知扩展消费。
  } // 第72天：结束新告警事件发布方法。

  private registerCapabilities(): void { // 第72天：把四类生产可观测核心能力注册到统一注册中心。
    const createdAt = Date.UTC(2026, 6, 20, 0, 0, 0); // 第72天：使用稳定教学时间戳注册可观测能力。
    const items = [{ id: "observability:log-manager", name: "LogManager（日志管理器）", capabilities: ["structured-logging", "log-query", "trace-log-correlation"] }, { id: "observability:metrics-aggregator", name: "MetricsAggregator（指标聚合器）", capabilities: ["counter", "gauge", "histogram", "percentile"] }, { id: "observability:trace-provider-v2", name: "Distributed Trace Provider V2（分布式链路提供者第2版）", capabilities: ["distributed-trace", "trace-tree", "sampling"] }, { id: "observability:alert-engine", name: "AlertEngine（告警引擎）", capabilities: ["metric-alert", "error-alert", "log-alert"] }]; // 第72天：定义日志、指标、链路和告警四个可发现能力注册项。
    for (const item of items) if (!this.registry.get(item.id)) this.registry.register({ ...item, type: "observability", version: "2.0.0", metadata: { description: `${item.name} 是 Day72 Production Observability Platform 核心能力。`, capabilities: item.capabilities, tags: ["observability", "production", "day72"] }, enabled: true, createdAt }); // 第72天：幂等注册全部可观测能力并声明版本、描述和标签。
  } // 第72天：结束生产可观测能力统一注册方法。

  private registerDefaultAlertRules(): void { // 第72天：注册任务清单要求的错误率、延迟、成本和RAG质量告警。
    const rules: AlertRule[] = [{ id: "alert-rule-model-error-rate", name: "Model Error Rate High（模型错误率过高）", signal: "metric", target: AGENT_PLATFORM_METRICS.modelErrorRate, aggregation: "latest", operator: ">", threshold: 0.05, severity: "critical", windowMs: 300000, enabled: true, description: "模型错误率超过百分之五" }, { id: "alert-rule-agent-p95-latency", name: "Agent P95 Latency High（智能体P95延迟过高）", signal: "metric", target: AGENT_PLATFORM_METRICS.agentLatency, aggregation: "p95", operator: ">", threshold: 10000, severity: "warning", windowMs: 300000, enabled: true, description: "智能体第95百分位延迟超过十秒" }, { id: "alert-rule-daily-cost", name: "Model Cost Budget Exceeded（模型成本超限）", signal: "metric", target: AGENT_PLATFORM_METRICS.modelCost, aggregation: "sum", operator: ">", threshold: 0.1, severity: "warning", windowMs: 86400000, enabled: true, description: "累计模型成本超过演示预算" }, { id: "alert-rule-citation-coverage", name: "Citation Coverage Low（引用覆盖率过低）", signal: "metric", target: AGENT_PLATFORM_METRICS.citationCoverage, aggregation: "latest", operator: "<", threshold: 0.8, severity: "warning", windowMs: 300000, enabled: true, description: "RAG引用覆盖率低于百分之八十" }, { id: "alert-rule-model-timeout-count", name: "Model Timeout Repeated（模型超时持续发生）", signal: "error", target: "ModelTimeoutError", aggregation: "count", operator: ">=", threshold: 2, severity: "critical", windowMs: 86400000, enabled: true, description: "模型超时错误已经重复出现" }, { id: "alert-rule-model-error-logs", name: "Model Error Logs Growing（模型错误日志增长）", signal: "log", target: "model-runtime", aggregation: "count", operator: ">=", threshold: 2, severity: "warning", windowMs: 3600000, enabled: true, description: "模型运行时结构化日志数量持续增长" }]; // 第72天：定义覆盖指标、错误和日志三类信号的默认告警规则。
    for (const rule of rules) this.alertEngine.registerRule(rule); // 第72天：逐条注册默认生产告警规则。
  } // 第72天：结束默认告警规则注册方法。
} // 第72天：结束生产可观测核心运行时实现。
