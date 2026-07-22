import type { ObservabilityRuntime } from "@/lib/observability/observability-runtime"; // 第72天：引入可观测核心运行时以执行五个端到端验收场景。
import { AGENT_PLATFORM_METRICS, type SamplingPolicy } from "@/lib/observability/types"; // 第72天：引入统一指标名称和采样策略类型。

const FULL_POLICY: SamplingPolicy = { mode: "full", samplingRate: 1, forceErrors: true, highValueRate: 1, highCostThreshold: 0.1, lowQualityThreshold: 6 }; // 第72天：定义开发和关键验收场景使用的全量采样策略。
const ZERO_POLICY: SamplingPolicy = { mode: "ratio", samplingRate: 0, forceErrors: true, highValueRate: 1, highCostThreshold: 0.1, lowQualityThreshold: 6 }; // 第72天：定义普通请求不采样但错误强制保留的测试策略。

export async function runResearchObservationCase(runtime: ObservabilityRuntime, baseTime = Date.now() - 60000): Promise<string> { // 第72天：执行 Research Agent 全链路并产生链路、指标和日志。
  const { trace, context } = await runtime.startRequest({ requestId: "req-day72-research", traceId: "trace-day72-research", sessionId: "session-day72", rootOperation: "research-agent.execute", agentId: "research-agent", taskId: "case-1-request-chain", policy: FULL_POLICY, startedAt: baseTime }); // 第72天：创建全量采样研究请求和统一可观测上下文。
  const agentSpan = runtime.startSpan(trace.traceId, { name: "Research Agent", source: "agent", attributes: { agentId: "research-agent", version: "2.0.0" }, startedAt: baseTime }); // 第72天：创建研究智能体根跨度。
  const workflowSpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Research Workflow", source: "workflow", attributes: { workflowId: "research-dag", version: 2 }, startedAt: baseTime + 50 }); // 第72天：创建挂在智能体下的工作流跨度。
  const modelSpan = runtime.startSpan(trace.traceId, { parentSpanId: workflowSpan, name: "Planning Model Call", source: "model", attributes: { model: "qwen2.5", provider: "ollama" }, startedAt: baseTime + 100 }); // 第72天：创建规划模型调用跨度。
  runtime.endSpan(trace.traceId, modelSpan, "success", { attributes: { inputTokens: 420, outputTokens: 180 }, endedAt: baseTime + 520 }); // 第72天：结束模型跨度并补充令牌属性。
  const retrievalSpan = runtime.startSpan(trace.traceId, { parentSpanId: workflowSpan, name: "RAG Retrieval", source: "retrieval", attributes: { knowledgeBase: "kb-agent-platform", topK: 5 }, startedAt: baseTime + 530 }); // 第72天：创建RAG检索跨度。
  runtime.endSpan(trace.traceId, retrievalSpan, "success", { attributes: { hits: 5, citationCoverage: 0.95 }, endedAt: baseTime + 1250 }); // 第72天：结束检索跨度并记录命中和引用覆盖率。
  const toolSpan = runtime.startSpan(trace.traceId, { parentSpanId: workflowSpan, name: "Search Tool", source: "tool", attributes: { tool: "web-search", attempts: 1 }, startedAt: baseTime + 1260 }); // 第72天：创建工具调用跨度。
  runtime.endSpan(trace.traceId, toolSpan, "success", { endedAt: baseTime + 1580 }); // 第72天：结束工具调用跨度并形成时间线。
  const memorySpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Memory Recall", source: "memory", attributes: { scope: "user", hit: true }, startedAt: baseTime + 1600 }); // 第72天：创建生产记忆召回跨度。
  runtime.endSpan(trace.traceId, memorySpan, "success", { endedAt: baseTime + 1840 }); // 第72天：结束记忆召回跨度。
  const evaluationSpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Online Evaluation", source: "evaluation", attributes: { dataset: "agent-research-v2", evaluatorVersion: "2.0.0" }, startedAt: baseTime + 1900 }); // 第72天：创建在线评估跨度。
  runtime.endSpan(trace.traceId, evaluationSpan, "success", { attributes: { score: 9.2 }, endedAt: baseTime + 2320 }); // 第72天：结束评估跨度并记录质量分数。
  runtime.endSpan(trace.traceId, workflowSpan, "success", { endedAt: baseTime + 2200 }); // 第72天：结束研究工作流跨度。
  runtime.endSpan(trace.traceId, agentSpan, "success", { endedAt: baseTime + 2400 }); // 第72天：结束研究智能体根跨度。
  await runtime.writeLog({ level: "info", message: "Research Agent 已完成跨模块研究任务", source: "agent-runtime", observationSource: "agent", traceId: trace.traceId, requestId: context.requestId, metadata: { agentId: "research-agent", workflow: "research-dag", model: "qwen2.5" }, createdAt: baseTime + 2350 }); // 第72天：写入可按链路、模型和智能体查询的结构化成功日志。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentExecutionCount, kind: "counter", value: 1, source: "agent", traceId: trace.traceId, labels: { agent: "research-agent" }, timestamp: baseTime + 2400 }); // 第72天：记录智能体执行次数计数器。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentLatency, kind: "histogram", value: 2400, source: "agent", traceId: trace.traceId, labels: { agent: "research-agent" }, timestamp: baseTime + 2400 }); // 第72天：记录智能体延迟直方图并关联当前链路。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelCallCount, kind: "counter", value: 1, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5" }, timestamp: baseTime + 520 }); // 第72天：记录模型调用次数计数器。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelTokenUsage, kind: "histogram", value: 600, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5" }, timestamp: baseTime + 520 }); // 第72天：记录模型令牌用量直方图。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelCost, kind: "gauge", value: 0.024, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5", currency: "USD" }, timestamp: baseTime + 520 }); // 第72天：记录本次模型调用成本瞬时值。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.workflowSuccessRate, kind: "gauge", value: 1, source: "workflow", traceId: trace.traceId, labels: { workflow: "research-dag" }, timestamp: baseTime + 2200 }); // 第72天：记录工作流成功率瞬时值。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.workflowDuration, kind: "histogram", value: 2150, source: "workflow", traceId: trace.traceId, labels: { workflow: "research-dag" }, timestamp: baseTime + 2200 }); // 第72天：记录工作流持续时间直方图。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.retrievalHitRate, kind: "gauge", value: 1, source: "retrieval", traceId: trace.traceId, labels: { knowledgeBase: "kb-agent-platform" }, timestamp: baseTime + 1250 }); // 第72天：记录检索命中率瞬时值。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.retrievalLatency, kind: "histogram", value: 720, source: "retrieval", traceId: trace.traceId, labels: { knowledgeBase: "kb-agent-platform" }, timestamp: baseTime + 1250 }); // 第72天：记录检索延迟直方图。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.citationCoverage, kind: "gauge", value: 0.95, source: "knowledge", traceId: trace.traceId, labels: { knowledgeBase: "kb-agent-platform" }, timestamp: baseTime + 1250 }); // 第72天：记录RAG引用覆盖率瞬时值。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.memoryHitRate, kind: "gauge", value: 0.9, source: "memory", traceId: trace.traceId, labels: { scope: "user" }, timestamp: baseTime + 1840 }); // 第72天：记录记忆命中率瞬时值。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.memoryUsedCount, kind: "counter", value: 1, source: "memory", traceId: trace.traceId, labels: { scope: "user" }, timestamp: baseTime + 1840 }); // 第72天：记录记忆使用次数计数器。
  await runtime.completeTrace(trace.traceId, "success", baseTime + 2400); // 第72天：完成研究请求完整链路并发布 trace.completed 事件。
  return trace.traceId; // 第72天：返回研究链路标识供Trace查询验收使用。
} // 第72天：结束Research Agent全链路验收场景。

export async function runModelFailureCase(runtime: ObservabilityRuntime, baseTime = Date.now() - 45000): Promise<string> { // 第72天：模拟模型超时并验证错误、告警和失败跨度。
  const { trace, context } = await runtime.startRequest({ requestId: "req-day72-model-timeout", traceId: "trace-day72-model-timeout", rootOperation: "agent.model-timeout", agentId: "research-agent", taskId: "case-2-model-failure", policy: ZERO_POLICY, startedAt: baseTime }); // 第72天：创建初始不采样但错误强制采样的模型失败请求。
  const agentSpan = runtime.startSpan(trace.traceId, { name: "Research Agent", source: "agent", attributes: { agentId: "research-agent" }, startedAt: baseTime }); // 第72天：创建失败请求的智能体根跨度。
  const modelSpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Model Call Timeout", source: "model", attributes: { model: "qwen2.5", timeoutMs: 10000 }, startedAt: baseTime + 100 }); // 第72天：创建即将超时的模型调用跨度。
  runtime.endSpan(trace.traceId, modelSpan, "failed", { error: "model timeout after 12000ms", attributes: { model: "qwen2.5", retryable: true }, endedAt: baseTime + 12100 }); // 第72天：把模型跨度标记为失败并触发错误强制采样。
  runtime.endSpan(trace.traceId, agentSpan, "failed", { error: "downstream model timeout", endedAt: baseTime + 12500 }); // 第72天：结束失败的智能体根跨度。
  await runtime.writeLog({ level: "error", message: "模型 qwen2.5 调用超时", source: "model-runtime", observationSource: "model", traceId: trace.traceId, requestId: context.requestId, metadata: { errorType: "ModelTimeoutError", model: "qwen2.5", timeoutMs: 10000, elapsedMs: 12000 }, createdAt: baseTime + 12100 }); // 第72天：写入第一条包含模型和超时字段的结构化错误日志。
  await runtime.writeLog({ level: "error", message: "模型 qwen2.5 调用超时", source: "model-runtime", observationSource: "model", traceId: trace.traceId, requestId: context.requestId, metadata: { errorType: "ModelTimeoutError", model: "qwen2.5", timeoutMs: 10000, retryAttempt: 1 }, createdAt: baseTime + 12300 }); // 第72天：写入第二条同指纹错误验证自动聚合与持续增长告警。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelCallCount, kind: "counter", value: 1, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5" }, timestamp: baseTime + 12100 }); // 第72天：记录失败请求同样发生了一次模型调用。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelErrorRate, kind: "gauge", value: 0.08, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5" }, timestamp: baseTime + 12300 }); // 第72天：记录超过百分之五阈值的模型错误率并触发告警。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentFailureRate, kind: "gauge", value: 1, source: "agent", traceId: trace.traceId, labels: { agent: "research-agent" }, timestamp: baseTime + 12500 }); // 第72天：记录本次智能体执行失败率。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentLatency, kind: "histogram", value: 12500, source: "agent", traceId: trace.traceId, labels: { agent: "research-agent" }, timestamp: baseTime + 12500 }); // 第72天：记录高延迟样本并触发P95延迟告警。
  await runtime.completeTrace(trace.traceId, "failed", baseTime + 12500); // 第72天：完成失败链路并验证初始零采样被错误强制覆盖。
  return trace.traceId; // 第72天：返回模型失败链路标识供测试查询。
} // 第72天：结束模型失败端到端验收场景。

export async function runSlowRetrievalCase(runtime: ObservabilityRuntime, baseTime = Date.now() - 30000): Promise<string> { // 第72天：模拟慢RAG检索并验证指标到链路再到根因的关联。
  const { trace, context } = await runtime.startRequest({ requestId: "req-day72-slow-rag", traceId: "trace-day72-slow-rag", rootOperation: "research-agent.slow-rag", agentId: "research-agent", taskId: "case-3-slow-query", policy: FULL_POLICY, startedAt: baseTime }); // 第72天：创建全量采样的慢检索请求。
  const agentSpan = runtime.startSpan(trace.traceId, { name: "Research Agent", source: "agent", attributes: { agentId: "research-agent" }, startedAt: baseTime }); // 第72天：创建慢检索请求智能体根跨度。
  const retrievalSpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Slow RAG Retrieval", source: "retrieval", attributes: { knowledgeBase: "kb-agent-platform", queryMode: "hybrid" }, startedAt: baseTime + 200 }); // 第72天：创建耗时过长的检索跨度。
  runtime.endSpan(trace.traceId, retrievalSpan, "success", { attributes: { hits: 3, bottleneck: "vector-store" }, endedAt: baseTime + 11700 }); // 第72天：结束持续十一点五秒的检索跨度并标记向量存储瓶颈。
  runtime.endSpan(trace.traceId, agentSpan, "success", { endedAt: baseTime + 14000 }); // 第72天：结束总耗时十四秒的智能体根跨度。
  await runtime.writeLog({ level: "warn", message: "RAG Retrieval 延迟超过十秒", source: "knowledge-runtime", observationSource: "knowledge", traceId: trace.traceId, requestId: context.requestId, metadata: { knowledgeBase: "kb-agent-platform", durationMs: 11500, bottleneck: "vector-store" }, createdAt: baseTime + 11700 }); // 第72天：写入可按链路定位向量存储瓶颈的结构化警告日志。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.retrievalLatency, kind: "histogram", value: 11500, source: "retrieval", traceId: trace.traceId, labels: { knowledgeBase: "kb-agent-platform" }, timestamp: baseTime + 11700 }); // 第72天：记录慢检索延迟并关联对应链路。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentLatency, kind: "histogram", value: 14000, source: "agent", traceId: trace.traceId, labels: { agent: "research-agent" }, timestamp: baseTime + 14000 }); // 第72天：记录智能体总延迟并更新P95告警关联链路。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.citationCoverage, kind: "gauge", value: 0.76, source: "knowledge", traceId: trace.traceId, labels: { knowledgeBase: "kb-agent-platform" }, timestamp: baseTime + 11700 }); // 第72天：记录低于百分之八十的引用覆盖率并触发RAG质量告警。
  await runtime.completeTrace(trace.traceId, "success", baseTime + 14000); // 第72天：完成慢检索链路并发布链路完成事件。
  return trace.traceId; // 第72天：返回慢检索链路标识供指标跳转和根因测试使用。
} // 第72天：结束慢RAG检索端到端验收场景。

export async function runCostLimitCase(runtime: ObservabilityRuntime, baseTime = Date.now() - 15000): Promise<string> { // 第72天：模拟令牌用量和模型成本超过预算限制。
  const { trace } = await runtime.startRequest({ requestId: "req-day72-cost-limit", traceId: "trace-day72-cost-limit", rootOperation: "agent.high-cost", agentId: "analysis-agent", taskId: "case-4-cost-limit", policy: FULL_POLICY, estimatedCost: 0.22, startedAt: baseTime }); // 第72天：创建高成本请求并使用高价值信号保留完整链路。
  const agentSpan = runtime.startSpan(trace.traceId, { name: "Analysis Agent", source: "agent", attributes: { agentId: "analysis-agent" }, startedAt: baseTime }); // 第72天：创建高成本智能体根跨度。
  const modelSpan = runtime.startSpan(trace.traceId, { parentSpanId: agentSpan, name: "Long Context Model Call", source: "model", attributes: { model: "qwen2.5", contextWindow: 32768 }, startedAt: baseTime + 100 }); // 第72天：创建长上下文模型调用跨度。
  runtime.endSpan(trace.traceId, modelSpan, "success", { attributes: { totalTokens: 18000, estimatedCost: 0.22 }, endedAt: baseTime + 5100 }); // 第72天：结束模型跨度并记录超预算令牌和成本。
  runtime.endSpan(trace.traceId, agentSpan, "success", { endedAt: baseTime + 5600 }); // 第72天：结束高成本智能体根跨度。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelTokenUsage, kind: "histogram", value: 18000, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5" }, timestamp: baseTime + 5100 }); // 第72天：记录超过常规范围的模型令牌用量。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelCost, kind: "gauge", value: 0.22, source: "model", traceId: trace.traceId, labels: { model: "qwen2.5", currency: "USD" }, timestamp: baseTime + 5100 }); // 第72天：记录超预算模型成本并触发成本告警。
  await runtime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentLatency, kind: "histogram", value: 5600, source: "agent", traceId: trace.traceId, labels: { agent: "analysis-agent" }, timestamp: baseTime + 5600 }); // 第72天：记录高成本请求的智能体延迟样本。
  await runtime.completeTrace(trace.traceId, "success", baseTime + 5600); // 第72天：完成高成本请求完整链路。
  return trace.traceId; // 第72天：返回高成本链路标识供成本告警跳转使用。
} // 第72天：结束成本超限端到端验收场景。

export async function runUnsampledSuccessCase(runtime: ObservabilityRuntime, baseTime = Date.now() - 5000): Promise<string> { // 第72天：执行普通成功请求验证零比例采样不会保存链路。
  const { trace } = await runtime.startRequest({ requestId: "req-day72-unsampled", traceId: "trace-day72-unsampled", rootOperation: "agent.health-check", agentId: "router-agent", taskId: "sampling-ratio-case", policy: ZERO_POLICY, startedAt: baseTime }); // 第72天：创建普通零比例采样请求。
  const span = runtime.startSpan(trace.traceId, { name: "Health Check Agent", source: "agent", attributes: { agentId: "router-agent" }, startedAt: baseTime }); // 第72天：创建普通健康检查跨度。
  runtime.endSpan(trace.traceId, span, "success", { endedAt: baseTime + 80 }); // 第72天：快速完成普通健康检查跨度。
  await runtime.completeTrace(trace.traceId, "success", baseTime + 80); // 第72天：完成未发生错误的零比例采样链路。
  return trace.traceId; // 第72天：返回未采样链路标识供持久化断言使用。
} // 第72天：结束普通请求比例采样验收场景。

export async function seedDay72ObservabilityScenarios(runtime: ObservabilityRuntime): Promise<{ researchTraceId: string; modelFailureTraceId: string; slowRetrievalTraceId: string; costTraceId: string; unsampledTraceId: string }> { // 第72天：串行执行五个可观测端到端场景并返回稳定链路标识。
  const now = Date.now(); // 第72天：使用同一基准时间构造可读且有序的演示时间线。
  const researchTraceId = await runResearchObservationCase(runtime, now - 60000); // 第72天：执行请求全链路场景。
  const modelFailureTraceId = await runModelFailureCase(runtime, now - 45000); // 第72天：执行模型失败和错误强制采样场景。
  const slowRetrievalTraceId = await runSlowRetrievalCase(runtime, now - 30000); // 第72天：执行慢查询和指标到链路关联场景。
  const costTraceId = await runCostLimitCase(runtime, now - 15000); // 第72天：执行令牌用量与成本超限场景。
  const unsampledTraceId = await runUnsampledSuccessCase(runtime, now - 5000); // 第72天：执行普通请求比例采样场景。
  return { researchTraceId, modelFailureTraceId, slowRetrievalTraceId, costTraceId, unsampledTraceId }; // 第72天：返回全部场景链路标识供端到端测试复用。
} // 第72天：结束Day72可观测演示场景初始化函数。
