export type ObservationType = "trace" | "metric" | "log"; // 第72天：定义统一观测事件支持的链路、指标和日志三种类型。
export type ObservationSource = "agent" | "workflow" | "tool" | "model" | "memory" | "knowledge" | "evaluation" | "retrieval" | "system"; // 第72天：定义可观测数据可以来自的智能体平台模块。
export type ObservationLevel = "debug" | "info" | "warn" | "error"; // 第72天：定义统一观测事件和结构化日志级别。

export type ObservationEvent = { // 第72天：定义所有模块共享的统一观测事件协议。
  id: string; // 第72天：保存观测事件唯一标识。
  type: ObservationType; // 第72天：区分链路、指标和日志事件。
  source: ObservationSource; // 第72天：记录事件来自哪个智能体平台模块。
  level: ObservationLevel; // 第72天：记录调试、信息、警告或错误级别。
  requestId?: string; // 第72天：按需关联统一请求标识。
  traceId?: string; // 第72天：按需关联完整分布式调用链。
  timestamp: number; // 第72天：记录事件发生的毫秒时间戳。
  data: Record<string, unknown>; // 第72天：保存可供程序过滤与聚合的结构化观测数据。
}; // 第72天：结束统一观测事件结构定义。

export type LogRecord = { // 第72天：定义日志管理器保存的结构化日志记录。
  id: string; // 第72天：保存日志唯一标识。
  level: ObservationLevel; // 第72天：保存日志级别。
  message: string; // 第72天：保存便于人员阅读的日志消息。
  source: string; // 第72天：保存产生日志的具体模块名称。
  requestId?: string; // 第72天：按需关联统一请求标识。
  traceId?: string; // 第72天：按需关联分布式链路标识。
  metadata: Record<string, unknown>; // 第72天：保存模型、工具、数据集、错误等结构化字段。
  createdAt: number; // 第72天：保存日志创建时间。
}; // 第72天：结束结构化日志记录定义。

export type LogQuery = { // 第72天：定义结构化日志查询过滤条件。
  level?: ObservationLevel; // 第72天：按需筛选指定日志级别。
  source?: string; // 第72天：按需筛选来源模块。
  traceId?: string; // 第72天：按需筛选指定调用链的日志。
  requestId?: string; // 第72天：按需筛选指定请求的日志。
  search?: string; // 第72天：按需搜索消息和结构化元数据文本。
}; // 第72天：结束结构化日志查询条件定义。

export type MetricKind = "counter" | "gauge" | "histogram"; // 第72天：定义计数器、瞬时值和直方图三类基础指标。
export type MetricLabels = Record<string, string>; // 第72天：定义用于模块、模型和环境过滤的指标标签集合。

export type MetricRecord = { // 第72天：定义一次统一指标采样记录。
  id: string; // 第72天：保存指标记录唯一标识。
  name: string; // 第72天：保存统一指标名称。
  kind: MetricKind; // 第72天：保存指标属于计数器、瞬时值还是直方图。
  value: number; // 第72天：保存本次记录的数值。
  source: ObservationSource; // 第72天：保存产生指标的平台模块。
  requestId?: string; // 第72天：按需关联统一请求标识。
  traceId?: string; // 第72天：按需关联导致指标变化的调用链。
  labels: MetricLabels; // 第72天：保存模型、工作流和环境等结构化标签。
  timestamp: number; // 第72天：保存指标采样时间。
}; // 第72天：结束统一指标记录定义。

export type MetricQuery = { // 第72天：定义指标明细查询条件。
  name?: string; // 第72天：按需筛选统一指标名称。
  kind?: MetricKind; // 第72天：按需筛选基础指标类型。
  source?: ObservationSource; // 第72天：按需筛选来源模块。
  traceId?: string; // 第72天：按需筛选关联调用链。
  from?: number; // 第72天：按需限制查询开始时间。
  to?: number; // 第72天：按需限制查询结束时间。
  labels?: MetricLabels; // 第72天：按需要求记录包含指定标签。
}; // 第72天：结束指标查询条件定义。

export type MetricAggregate = { // 第72天：定义计数器、瞬时值和直方图的统一聚合结果。
  name: string; // 第72天：保存被聚合的指标名称。
  kind: MetricKind; // 第72天：保存被聚合指标的基础类型。
  count: number; // 第72天：保存参与聚合的采样数量。
  sum: number; // 第72天：保存全部样本之和。
  latest: number; // 第72天：保存最近一次瞬时值或样本值。
  average: number; // 第72天：保存样本平均值。
  min: number; // 第72天：保存最小样本值。
  max: number; // 第72天：保存最大样本值。
  p50: number; // 第72天：保存中位数或第50百分位。
  p95: number; // 第72天：保存第95百分位。
  p99: number; // 第72天：保存第99百分位。
  traceIds: string[]; // 第72天：保存与当前指标样本关联的链路标识。
  lastUpdatedAt: number; // 第72天：保存最近一次指标更新时间。
}; // 第72天：结束统一指标聚合结果定义。

export const AGENT_PLATFORM_METRICS = { // 第72天：集中定义智能体平台统一指标命名规范。
  agentExecutionCount: "agent.execution.count", // 第72天：定义智能体执行次数指标。
  agentFailureRate: "agent.failure.rate", // 第72天：定义智能体失败率指标。
  agentLatency: "agent.latency", // 第72天：定义智能体执行延迟指标。
  modelCallCount: "model.call.count", // 第72天：定义模型调用次数指标。
  modelErrorRate: "model.error.rate", // 第72天：定义模型错误率指标。
  modelTokenUsage: "model.token.usage", // 第72天：定义模型令牌用量指标。
  modelCost: "model.cost", // 第72天：定义模型调用成本指标。
  workflowSuccessRate: "workflow.success.rate", // 第72天：定义工作流成功率指标。
  workflowDuration: "workflow.duration", // 第72天：定义工作流持续时间指标。
  workflowRetryCount: "workflow.retry.count", // 第72天：定义工作流重试次数指标。
  retrievalHitRate: "retrieval.hit.rate", // 第72天：定义检索命中率指标。
  retrievalLatency: "retrieval.latency", // 第72天：定义检索延迟指标。
  citationCoverage: "citation.coverage", // 第72天：定义引用覆盖率指标。
  memoryHitRate: "memory.hit.rate", // 第72天：定义记忆命中率指标。
  memoryUsedCount: "memory.used.count", // 第72天：定义记忆使用次数指标。
} as const; // 第72天：把统一指标名称收窄为只读字面量集合。

export type TraceSpanStatusV2 = "running" | "success" | "failed"; // 第72天：定义分布式跨度第二版运行状态。

export type DistributedTraceSpan = { // 第72天：定义跨模块分布式链路跨度第二版。
  spanId: string; // 第72天：保存跨度唯一标识。
  parentSpanId?: string; // 第72天：保存父跨度标识并建立树形调用关系。
  name: string; // 第72天：保存跨度可读名称。
  source: ObservationSource; // 第72天：保存跨度所属智能体平台模块。
  startedAt: number; // 第72天：保存跨度开始时间。
  endedAt?: number; // 第72天：按需保存跨度结束时间。
  durationMs: number; // 第72天：保存跨度持续时间毫秒数。
  status: TraceSpanStatusV2; // 第72天：保存运行、成功或失败状态。
  attributes: Record<string, unknown>; // 第72天：保存模型、工具、数据集和版本等结构化属性。
  error?: string; // 第72天：按需保存安全错误摘要。
}; // 第72天：结束分布式链路跨度第二版定义。

export type DistributedTraceV2 = { // 第72天：定义一次请求的完整分布式链路第二版。
  traceId: string; // 第72天：保存完整链路唯一标识。
  requestId: string; // 第72天：关联统一请求标识。
  rootOperation: string; // 第72天：保存根操作名称。
  startedAt: number; // 第72天：保存链路开始时间。
  endedAt?: number; // 第72天：按需保存链路结束时间。
  durationMs: number; // 第72天：保存完整链路持续时间。
  status: TraceSpanStatusV2; // 第72天：保存完整链路最终状态。
  sampled: boolean; // 第72天：标记链路是否被采样策略保留。
  samplingReason: string; // 第72天：保存全量、比例、错误或高价值采样原因。
  spans: DistributedTraceSpan[]; // 第72天：保存跨模块跨度列表。
}; // 第72天：结束完整分布式链路第二版定义。

export type TraceTreeNode = { // 第72天：定义链路浏览器展示的递归跨度树节点。
  span: DistributedTraceSpan; // 第72天：保存当前树节点对应的跨度。
  children: TraceTreeNode[]; // 第72天：保存所有直接子跨度节点。
}; // 第72天：结束递归跨度树节点定义。

export type TraceQueryResult = { // 第72天：定义从指标或链路标识进入根因诊断的查询结果。
  trace?: DistributedTraceV2; // 第72天：保存命中的完整分布式链路。
  tree: TraceTreeNode[]; // 第72天：保存命中链路的跨度树。
  logs: LogRecord[]; // 第72天：保存同一链路关联的结构化日志。
  metrics: MetricRecord[]; // 第72天：保存同一链路关联的指标明细。
}; // 第72天：结束链路根因诊断查询结果定义。

export type ErrorEvent = { // 第72天：定义支持自动聚合的错误事件。
  id: string; // 第72天：保存错误聚合项唯一标识。
  fingerprint: string; // 第72天：保存错误类型、来源、模型和消息组成的稳定指纹。
  errorType: string; // 第72天：保存错误类型名称。
  message: string; // 第72天：保存安全错误消息。
  stack?: string; // 第72天：按需保存错误堆栈。
  source: string; // 第72天：保存错误来源模块。
  traceId?: string; // 第72天：保存最近一次错误链路标识。
  traceIds: string[]; // 第72天：保存产生同类错误的全部去重链路标识。
  requestId?: string; // 第72天：保存最近一次错误请求标识。
  model?: string; // 第72天：按需保存发生错误的模型名称。
  count: number; // 第72天：保存同类错误累计出现次数。
  firstSeenAt: number; // 第72天：保存首次出现时间。
  lastSeenAt: number; // 第72天：保存最近出现时间。
}; // 第72天：结束错误聚合事件定义。

export type AlertSeverity = "info" | "warning" | "critical"; // 第72天：定义告警信息、警告和严重三级严重度。
export type AlertOperator = ">" | ">=" | "<" | "<=" | "="; // 第72天：定义告警规则支持的比较运算符。
export type AlertSignal = "metric" | "error" | "log"; // 第72天：定义告警规则可以读取的指标、错误和日志信号。
export type AlertAggregationField = "latest" | "average" | "sum" | "count" | "p50" | "p95" | "p99" | "max"; // 第72天：定义指标告警可以读取的聚合字段。

export type AlertRule = { // 第72天：定义生产告警引擎规则。
  id: string; // 第72天：保存告警规则唯一标识。
  name: string; // 第72天：保存告警规则可读名称。
  signal: AlertSignal; // 第72天：指定规则读取指标、错误还是日志。
  target: string; // 第72天：保存指标名称、错误类型或日志来源目标。
  aggregation: AlertAggregationField; // 第72天：指定参与比较的聚合字段。
  operator: AlertOperator; // 第72天：指定阈值比较运算符。
  threshold: number; // 第72天：保存告警触发阈值。
  severity: AlertSeverity; // 第72天：保存告警严重程度。
  windowMs: number; // 第72天：保存规则评估时间窗口。
  enabled: boolean; // 第72天：标记规则当前是否启用。
  description: string; // 第72天：保存规则业务含义说明。
}; // 第72天：结束生产告警规则定义。

export type Alert = { // 第72天：定义告警中心展示的活动或历史告警。
  id: string; // 第72天：保存告警唯一标识。
  ruleId: string; // 第72天：关联触发当前告警的规则。
  title: string; // 第72天：保存告警标题。
  severity: AlertSeverity; // 第72天：保存告警严重程度。
  status: "active" | "resolved"; // 第72天：标记告警当前活动或已恢复。
  actualValue: number; // 第72天：保存触发时的真实观测值。
  threshold: number; // 第72天：保存触发规则阈值。
  traceIds: string[]; // 第72天：保存可跳转定位根因的关联链路。
  message: string; // 第72天：保存用户可读告警说明。
  triggeredAt: number; // 第72天：保存告警触发时间。
  resolvedAt?: number; // 第72天：按需保存告警恢复时间。
}; // 第72天：结束告警记录定义。

export type SamplingMode = "full" | "ratio"; // 第72天：定义全量和比例两种基础采样模式。

export type SamplingPolicy = { // 第72天：定义生产分布式链路采样策略。
  mode: SamplingMode; // 第72天：指定使用全量或比例采样。
  samplingRate: number; // 第72天：保存零到一之间的普通请求采样比例。
  forceErrors: boolean; // 第72天：标记错误请求是否强制采样。
  highValueRate: number; // 第72天：保存高价值请求使用的更高采样比例。
  highCostThreshold: number; // 第72天：保存高成本请求强制采样阈值。
  lowQualityThreshold: number; // 第72天：保存低质量评估请求强制采样阈值。
}; // 第72天：结束生产链路采样策略定义。

export type SamplingDecision = { // 第72天：定义确定性采样策略输出。
  sampled: boolean; // 第72天：标记当前链路是否应该保留。
  rate: number; // 第72天：保存本次决策实际使用的采样比例。
  reason: string; // 第72天：保存全量、比例、错误或高价值决策原因。
}; // 第72天：结束采样决策定义。

export type ObservabilityContext = { // 第72天：定义注入统一运行时上下文的可观测信息。
  traceId: string; // 第72天：关联本次请求完整分布式链路。
  metricsEnabled: boolean; // 第72天：标记本次请求是否开启指标采集。
  samplingRate: number; // 第72天：保存本次链路使用的采样比例。
  sampled: boolean; // 第72天：保存本次链路初始采样结果。
  samplingReason: string; // 第72天：保存本次采样原因。
}; // 第72天：结束统一可观测运行时上下文定义。

export type ObservabilityOverview = { // 第72天：定义可观测仪表盘总览指标。
  requests: number; // 第72天：保存请求总数。
  successRate: number; // 第72天：保存请求成功率。
  averageLatency: number; // 第72天：保存平均延迟毫秒数。
  p95Latency: number; // 第72天：保存第95百分位延迟毫秒数。
  cost: number; // 第72天：保存累计模型成本。
  errors: number; // 第72天：保存错误总数。
  activeAlerts: number; // 第72天：保存活动告警数量。
}; // 第72天：结束可观测仪表盘总览指标定义。

export type ObservabilitySnapshot = { // 第72天：定义可观测仪表盘、接口和测试共享的完整快照。
  overview: ObservabilityOverview; // 第72天：保存请求、成功率、延迟、成本和错误总览。
  observations: ObservationEvent[]; // 第72天：保存统一观测事件历史。
  logs: LogRecord[]; // 第72天：保存结构化日志历史。
  metricRecords: MetricRecord[]; // 第72天：保存统一指标明细。
  metrics: MetricAggregate[]; // 第72天：保存各统一指标聚合结果。
  traces: DistributedTraceV2[]; // 第72天：保存采样后保留的分布式链路。
  traceTrees: Record<string, TraceTreeNode[]>; // 第72天：按链路标识保存跨度树。
  errors: ErrorEvent[]; // 第72天：保存按指纹自动聚合的错误事件。
  alertRules: AlertRule[]; // 第72天：保存告警引擎规则列表。
  alerts: Alert[]; // 第72天：保存活动和历史告警。
  events: import("@/lib/events/event-types").RuntimeEventRecord[]; // 第72天：保存 EventBus 中的指标、日志、告警和链路事件。
  runtimeContexts: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2[]; // 第72天：保存注入可观测上下文的统一运行时上下文。
  registryItems: import("@/lib/registry/registry-types").RegistryItem[]; // 第72天：保存统一注册中心中的可观测平台能力。
  generatedAt: number; // 第72天：保存快照生成时间。
}; // 第72天：结束生产可观测平台完整快照定义。
