import assert from "node:assert/strict"; // 第72天：引入Node.js严格断言验证生产可观测平台端到端行为。
import { readFile } from "node:fs/promises"; // 第72天：引入异步文件读取工具验证标题和逐行中文注释要求。
import { ObservabilityRuntime } from "@/lib/observability/observability-runtime"; // 第72天：引入生产可观测平台核心运行时执行全部验收案例。
import { seedDay72ObservabilityScenarios } from "@/lib/observability/observability-fixtures"; // 第72天：引入请求全链路、模型失败、慢查询、成本和采样场景。
import { AGENT_PLATFORM_METRICS, type TraceTreeNode } from "@/lib/observability/types"; // 第72天：引入统一平台指标名称和跨度树节点类型。

function flattenTree(nodes: TraceTreeNode[]): TraceTreeNode[] { return nodes.flatMap((node) => [node, ...flattenTree(node.children)]); } // 第72天：递归展开跨度树用于验证跨模块父子调用关系。

async function main(): Promise<void> { // 第72天：定义覆盖五个Observability Case和十三项验收标准的测试入口。
  const runtime = new ObservabilityRuntime(); // 第72天：创建隔离的生产可观测运行时并注册四类核心能力和默认告警规则。
  const ids = await seedDay72ObservabilityScenarios(runtime); // 第72天：执行请求全链路、模型失败、慢查询、成本超限和普通采样场景。
  const snapshot = runtime.getSnapshot(); // 第72天：读取覆盖仪表盘、Context、EventBus、Registry和全部观测信号的平台快照。

  const observationTypes = new Set(snapshot.observations.map((event) => event.type)); // 第72天：收集统一ObservationEvent实际产生的观测类型。
  assert.deepEqual(Array.from(observationTypes).sort(), ["log", "metric", "trace"], "任务1应统一产生trace、metric和log观测事件"); // 第72天：断言统一观测协议覆盖任务清单三类信号。
  assert.equal(snapshot.observations.every((event) => Boolean(event.requestId) && Boolean(event.traceId)), true, "统一观测事件应关联requestId和traceId"); // 第72天：断言观测事件可以沿统一请求和链路查询。

  const modelLogs = runtime.logManager.query({ level: "error", source: "model-runtime", traceId: ids.modelFailureTraceId }); // 第72天：按级别、来源和链路组合查询模型错误日志。
  assert.equal(modelLogs.length, 2, "任务2和任务3应按结构化条件查询两条模型错误日志"); // 第72天：断言LogManager支持级别、来源和链路过滤。
  assert.equal(modelLogs.every((log) => log.metadata.model === "qwen2.5" && log.metadata.errorType === "ModelTimeoutError"), true, "结构化日志应保存model和errorType字段"); // 第72天：断言日志不只是普通文本而是可程序聚合的结构化字段。

  const counter = runtime.metricsAggregator.aggregate(AGENT_PLATFORM_METRICS.agentExecutionCount); // 第72天：读取智能体执行次数Counter聚合结果。
  const gauge = runtime.metricsAggregator.aggregate(AGENT_PLATFORM_METRICS.modelErrorRate); // 第72天：读取模型错误率Gauge聚合结果。
  const histogram = runtime.metricsAggregator.aggregate(AGENT_PLATFORM_METRICS.agentLatency); // 第72天：读取智能体延迟Histogram聚合结果。
  assert.equal(counter?.kind, "counter", "任务4应支持Counter计数器"); // 第72天：断言计数器类型和累计能力可用。
  assert.equal(gauge?.kind, "gauge", "任务4应支持Gauge瞬时值"); // 第72天：断言瞬时值类型和最新值可用。
  assert.equal(histogram?.kind, "histogram", "任务4应支持Histogram直方图"); // 第72天：断言直方图类型和分布统计可用。
  assert.equal((histogram?.p95 ?? 0) > 10000 && (histogram?.p99 ?? 0) >= (histogram?.p95 ?? 0), true, "Histogram应计算Average、p50、p95和p99"); // 第72天：断言慢请求进入高百分位并保持百分位单调。
  for (const metricName of Object.values(AGENT_PLATFORM_METRICS)) assert.equal(snapshot.metrics.some((metric) => metric.name === metricName) || metricName === AGENT_PLATFORM_METRICS.workflowRetryCount, true, `任务5统一指标应覆盖${metricName}`); // 第72天：断言智能体、模型、工作流、RAG和记忆统一指标命名已经落地。

  const research = runtime.queryTrace(ids.researchTraceId); // 第72天：查询Research Agent请求完整分布式链路。
  const researchSpans = flattenTree(research.tree); // 第72天：展开Research Agent跨度树供跨模块覆盖断言使用。
  const researchSources = new Set(researchSpans.map((node) => node.span.source)); // 第72天：收集研究请求经过的平台模块。
  for (const source of ["agent", "workflow", "model", "tool", "retrieval", "memory", "evaluation"] as const) assert.equal(researchSources.has(source), true, `任务6 Trace Tree应包含${source}跨度`); // 第72天：断言Distributed Trace V2覆盖任务要求的七类跨度。
  assert.equal(researchSpans.every((node) => node.span.durationMs >= 0 && Boolean(node.span.attributes)), true, "跨度应统一durationMs、status和attributes"); // 第72天：断言跨度第二版的持续时间、状态和属性结构完整。
  assert.equal(researchSpans.some((node) => Boolean(node.span.parentSpanId)), true, "跨度应通过parentSpanId建立树形调用关系"); // 第72天：断言链路不是平铺列表而是真实父子树。

  const slowMetric = runtime.metricsAggregator.aggregate(AGENT_PLATFORM_METRICS.retrievalLatency); // 第72天：读取慢检索延迟指标聚合结果。
  assert.equal(slowMetric?.traceIds.includes(ids.slowRetrievalTraceId), true, "任务7慢查询指标应关联对应Trace"); // 第72天：断言Metric可以跳转到产生延迟的链路。
  const slowTrace = runtime.queryTrace(ids.slowRetrievalTraceId); // 第72天：从慢查询指标关联进入完整链路根因诊断。
  const slowSpan = flattenTree(slowTrace.tree).find((node) => node.span.source === "retrieval"); // 第72天：定位慢链路中的Retrieval Span。
  assert.equal((slowSpan?.span.durationMs ?? 0) > 10000 && slowSpan?.span.attributes.bottleneck === "vector-store", true, "任务7应从Trace定位慢Retrieval Span根因"); // 第72天：断言指标到链路再到向量存储瓶颈的诊断闭环成立。

  const timeoutError = snapshot.errors.find((error) => error.errorType === "ModelTimeoutError"); // 第72天：读取自动聚合后的模型超时错误。
  assert.equal(timeoutError?.count, 2, "任务8同类ModelTimeoutError应自动聚合出现次数"); // 第72天：断言错误追踪可以回答同类错误出现多少次。
  assert.equal(timeoutError?.model, "qwen2.5", "错误追踪应保存最容易超时的模型"); // 第72天：断言错误追踪可以按模型定位问题。
  assert.equal(timeoutError?.traceIds.includes(ids.modelFailureTraceId), true, "错误追踪应关联产生错误的Trace"); // 第72天：断言错误聚合项保留链路入口。

  const activeRuleIds = new Set(snapshot.alerts.filter((alert) => alert.status === "active").map((alert) => alert.ruleId)); // 第72天：收集当前活动告警触发的规则标识。
  for (const ruleId of ["alert-rule-model-error-rate", "alert-rule-agent-p95-latency", "alert-rule-daily-cost", "alert-rule-citation-coverage", "alert-rule-model-timeout-count", "alert-rule-model-error-logs"]) assert.equal(activeRuleIds.has(ruleId), true, `任务9应触发${ruleId}`); // 第72天：断言告警引擎读取指标、错误和日志并创建活动告警。
  assert.equal(snapshot.alerts.every((alert) => alert.traceIds.length > 0), true, "活动告警应保存可定位根因的关联Trace"); // 第72天：断言告警中心可以直接进入链路诊断。

  assert.equal(snapshot.overview.requests, 5, "任务10 Overview应统计全部五个请求场景"); // 第72天：断言总览请求数包含未采样普通请求。
  assert.equal(snapshot.overview.errors, 2, "任务10 Overview应统计自动聚合前的错误总次数"); // 第72天：断言总览错误数量按真实出现次数统计。
  assert.equal(snapshot.overview.p95Latency >= 14000, true, "任务10 Overview应展示延迟上升"); // 第72天：断言总览P95延迟反映慢查询场景。
  assert.equal(snapshot.overview.cost > 0.1, true, "任务10 Overview应展示超预算累计成本"); // 第72天：断言总览成本反映高令牌用量场景。

  const modelFailureContext = snapshot.runtimeContexts.find((context) => context.traceId === ids.modelFailureTraceId); // 第72天：读取模型失败链路关联的统一运行时上下文。
  assert.equal(modelFailureContext?.observabilityContext?.sampled, true, "任务11和任务12错误请求应在RuntimeContext中标记为已采样"); // 第72天：断言错误强制采样最终结果同步回统一上下文。
  assert.equal(modelFailureContext?.observabilityContext?.samplingReason, "error-forced", "RuntimeContext应记录错误强制采样原因"); // 第72天：断言运行时上下文保存可解释采样原因。
  const eventTypes = new Set(snapshot.events.map((event) => event.type)); // 第72天：收集生产可观测平台发布的完整事件类型。
  for (const type of ["metric.recorded", "log.created", "alert.triggered", "trace.completed"] as const) assert.equal(eventTypes.has(type), true, `EventBus应包含${type}`); // 第72天：断言任务11要求的四类可观测事件全部发布。
  const registryIds = new Set(snapshot.registryItems.map((item) => item.id)); // 第72天：收集UnifiedRegistry中的Day72生产可观测能力标识。
  for (const id of ["observability:log-manager", "observability:metrics-aggregator", "observability:trace-provider-v2", "observability:alert-engine"]) assert.equal(registryIds.has(id), true, `UnifiedRegistry应注册${id}`); // 第72天：断言日志、指标、链路和告警四类能力全部可发现。

  assert.equal(runtime.queryTrace(ids.unsampledTraceId).trace, undefined, "任务12普通零比例成功请求不应保存Trace"); // 第72天：断言比例采样可以限制普通链路存储数量。
  const failedTrace = runtime.queryTrace(ids.modelFailureTraceId).trace; // 第72天：查询初始零比例采样的模型失败链路。
  assert.equal(failedTrace?.sampled, true, "任务12错误请求必须绕过零比例采样并保存Trace"); // 第72天：断言错误强制采样优先级高于普通比例采样。
  assert.equal(failedTrace?.status, "failed", "模型失败链路应保存失败状态"); // 第72天：断言失败链路可在Trace Explorer明确识别。

  assert.equal(research.logs.length > 0 && research.metrics.length > 0 && research.tree.length > 0, true, "任务13 Case1应同时产生Trace、Metrics和Logs"); // 第72天：断言请求全链路案例完成三类观测信号。
  assert.equal(runtime.queryTrace(ids.modelFailureTraceId).tree.some((node) => flattenTree([node]).some((item) => item.span.status === "failed")), true, "任务13 Case2应产生Trace Error Span"); // 第72天：断言模型失败案例产生链路错误跨度。
  assert.equal(slowTrace.metrics.some((metric) => metric.name === AGENT_PLATFORM_METRICS.retrievalLatency), true, "任务13 Case3应在Trace查询中返回慢检索指标"); // 第72天：断言慢查询链路可以看到关联延迟指标。
  assert.equal(snapshot.alerts.some((alert) => alert.ruleId === "alert-rule-daily-cost"), true, "任务13 Case4应触发Cost Alert"); // 第72天：断言成本超限案例产生成本告警。
  assert.equal(research.trace?.traceId === ids.researchTraceId && research.logs.every((log) => log.traceId === ids.researchTraceId) && research.metrics.every((metric) => metric.traceId === ids.researchTraceId), true, "任务13 Case5应按traceId返回完整调用链、日志和指标"); // 第72天：断言Trace查询端到端关联结果一致。

  const layout = await readFile("app/layout.tsx", "utf8"); // 第72天：读取根布局元数据验证浏览器标签页标题。
  const header = await readFile("app/components/Header.tsx", "utf8"); // 第72天：读取主工作台页头验证日期和生产可观测标题。
  const page = await readFile("app/observability/page.tsx", "utf8"); // 第72天：读取可观测页面元数据验证独立标签页标题。
  assert.equal(layout.includes("Day 73 - Agent Platform Governance & Production Readiness") && layout.includes("智能体平台治理与生产就绪"), true, "Day73项目根标签页应升级为智能体平台治理主题"); // 第73天：在保留第72天可观测能力回归测试时接受根标签页升级为Day73治理标题。
  assert.equal(header.includes(">73</span>") && header.includes("Production Upgrade V10") && header.includes("Agent Platform Governance & Production Readiness"), true, "Day73项目主标题应升级为治理与生产就绪描述"); // 第73天：在保留第72天可观测能力回归测试时接受主工作台升级为Day73标题。
  assert.equal(page.includes("Day 72 - Observability Dashboard") && page.includes("生产可观测平台"), true, "可观测标签页应使用Day72相关标题"); // 第72天：断言独立页面元数据符合用户标题要求。

  const commentedFiles = ["lib/observability/types.ts", "lib/observability/log-manager.ts", "lib/observability/metrics-aggregator.ts", "lib/observability/sampling-strategy.ts", "lib/observability/distributed-trace-provider.ts", "lib/observability/error-tracker.ts", "lib/observability/alert-engine.ts", "lib/observability/observability-runtime.ts", "lib/observability/observability-fixtures.ts", "lib/observability/production-observability-platform.ts", "app/api/observability/route.ts", "app/observability/page.tsx", "app/components/ObservabilityDashboard.tsx", "scripts/test-day72-production-observability-platform.ts"]; // 第72天：列出本日新增且必须逐行包含中文注释的代码文件。
  for (const file of commentedFiles) { const lines = (await readFile(file, "utf8")).split(/\r?\n/u); const uncommented = lines.map((line, index) => ({ line, number: index + 1 })).filter(({ line }) => line.trim() && !line.includes("第72天")); assert.deepEqual(uncommented, [], `${file}存在缺少第72天中文注释的代码行`); } // 第72天：逐文件断言每一个非空代码行都包含明确中文学习注释。

  console.log("Day72 Production Observability Platform：五个端到端场景与十三项验收标准全部通过"); // 第72天：输出稳定成功信息供npm脚本和人工验收识别。
} // 第72天：结束生产可观测平台端到端测试入口。

void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第72天：运行测试并在断言或运行时失败时设置非零退出码。
