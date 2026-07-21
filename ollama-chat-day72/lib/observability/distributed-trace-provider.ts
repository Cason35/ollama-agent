import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建链路和跨度唯一标识。
import { SamplingStrategy, DEFAULT_SAMPLING_POLICY } from "@/lib/observability/sampling-strategy"; // 第72天：引入生产采样策略和默认策略。
import type { DistributedTraceSpan, DistributedTraceV2, ObservationSource, SamplingPolicy, TraceSpanStatusV2, TraceTreeNode } from "@/lib/observability/types"; // 第72天：引入分布式链路、跨度、状态和树节点类型。

type StartTraceInput = { traceId?: string; requestId: string; rootOperation: string; policy?: SamplingPolicy; vip?: boolean; criticalWorkflow?: boolean; estimatedCost?: number; qualityScore?: number; startedAt?: number }; // 第72天：定义创建完整链路时的请求与采样输入。
type StartSpanInput = { parentSpanId?: string; name: string; source: ObservationSource; attributes?: Record<string, unknown>; startedAt?: number }; // 第72天：定义创建跨模块跨度时的父子关系和结构化属性。

export class DistributedTraceProviderV2 { // 第72天：实现跨 Agent、Workflow、Model、Tool、RAG、Memory 和 Evaluation 的链路追踪第二版。
  private readonly active = new Map<string, DistributedTraceV2>(); // 第72天：保存尚未完成且可能等待错误强制采样的链路。
  private readonly completed = new Map<string, DistributedTraceV2>(); // 第72天：只保存最终命中采样策略的已完成链路。

  constructor(private readonly sampling = new SamplingStrategy()) {} // 第72天：允许依赖注入采样策略并默认使用确定性生产策略。

  startTrace(input: StartTraceInput): DistributedTraceV2 { // 第72天：开始一次完整分布式链路并执行初始采样决策。
    if (!input.requestId.trim()) throw new Error("Distributed Trace requestId 不能为空"); // 第72天：阻止没有统一请求标识的链路创建。
    if (!input.rootOperation.trim()) throw new Error("Distributed Trace rootOperation 不能为空"); // 第72天：阻止没有根操作名称的链路创建。
    const traceId = input.traceId?.trim() || `trace_${randomUUID()}`; // 第72天：优先复用上游链路标识否则生成新标识。
    const decision = this.sampling.decide({ traceId, vip: input.vip, criticalWorkflow: input.criticalWorkflow, estimatedCost: input.estimatedCost, qualityScore: input.qualityScore }, input.policy ?? DEFAULT_SAMPLING_POLICY); // 第72天：根据普通或高价值请求特征执行可解释采样判断。
    const trace: DistributedTraceV2 = { traceId, requestId: input.requestId.trim(), rootOperation: input.rootOperation.trim(), startedAt: input.startedAt ?? Date.now(), durationMs: 0, status: "running", sampled: decision.sampled, samplingReason: decision.reason, spans: [] }; // 第72天：创建包含采样结果和空跨度列表的运行中链路。
    this.active.set(traceId, trace); // 第72天：暂存运行中链路以便错误发生时强制采样。
    return structuredClone(trace); // 第72天：返回防御性链路副本供运行时注入上下文。
  } // 第72天：结束完整分布式链路创建方法。

  startSpan(traceId: string, input: StartSpanInput): string { // 第72天：在指定链路下创建一个跨模块跨度。
    const trace = this.active.get(traceId); // 第72天：从运行中链路集合读取目标链路。
    if (!trace) return ""; // 第72天：链路不存在时安全返回空标识避免观测系统打断业务。
    const span: DistributedTraceSpan = { spanId: `span_${randomUUID()}`, parentSpanId: input.parentSpanId, name: input.name.trim(), source: input.source, startedAt: input.startedAt ?? Date.now(), durationMs: 0, status: "running", attributes: structuredClone(input.attributes ?? {}) }; // 第72天：创建包含父子关系和结构化属性的运行中跨度。
    trace.spans.push(span); // 第72天：把新跨度追加到完整链路。
    return span.spanId; // 第72天：返回跨度标识供子跨度关联和结束操作使用。
  } // 第72天：结束跨模块跨度创建方法。

  endSpan(traceId: string, spanId: string, status: Exclude<TraceSpanStatusV2, "running"> = "success", input: { attributes?: Record<string, unknown>; error?: string; endedAt?: number } = {}): DistributedTraceSpan | undefined { // 第72天：结束指定跨度并补充耗时、状态、属性和错误摘要。
    const trace = this.active.get(traceId); // 第72天：读取目标运行中链路。
    const span = trace?.spans.find((item) => item.spanId === spanId); // 第72天：在链路中查找需要结束的跨度。
    if (!trace || !span) return undefined; // 第72天：链路或跨度不存在时安全返回空值。
    span.endedAt = input.endedAt ?? Date.now(); // 第72天：记录跨度实际或模拟结束时间。
    span.durationMs = Math.max(0, span.endedAt - span.startedAt); // 第72天：计算跨度持续时间并避免负数。
    span.status = status; // 第72天：写入跨度成功或失败状态。
    span.attributes = { ...span.attributes, ...(input.attributes ?? {}) }; // 第72天：合并结束阶段补充的结构化属性。
    span.error = input.error; // 第72天：按需保存安全错误摘要供链路浏览器展示。
    if (status === "failed") this.forceSample(traceId, "error-forced"); // 第72天：任何失败跨度都会强制保留完整链路。
    return structuredClone(span); // 第72天：返回结束后的跨度防御性副本。
  } // 第72天：结束指定跨度方法。

  forceSample(traceId: string, reason = "error-forced"): void { // 第72天：允许错误追踪或高价值信号在运行中强制保留链路。
    const trace = this.active.get(traceId); // 第72天：读取需要提升采样优先级的运行中链路。
    if (!trace) return; // 第72天：目标链路不存在时保持幂等安全返回。
    trace.sampled = true; // 第72天：把链路标记为必须保存。
    trace.samplingReason = reason; // 第72天：记录错误或高价值强制采样原因。
  } // 第72天：结束运行中链路强制采样方法。

  endTrace(traceId: string, status: Exclude<TraceSpanStatusV2, "running"> = "success", endedAt = Date.now()): DistributedTraceV2 | undefined { // 第72天：结束完整链路并仅持久化命中采样策略的结果。
    const trace = this.active.get(traceId); // 第72天：读取需要完成的运行中链路。
    if (!trace) return undefined; // 第72天：找不到运行中链路时安全返回空值。
    for (const span of trace.spans.filter((item) => item.status === "running")) this.endSpan(traceId, span.spanId, status, { endedAt }); // 第72天：兜底结束所有仍在运行中的跨度。
    trace.endedAt = endedAt; // 第72天：记录完整链路结束时间。
    trace.durationMs = Math.max(0, endedAt - trace.startedAt); // 第72天：计算完整链路持续时间。
    trace.status = status; // 第72天：写入完整链路最终状态。
    if (status === "failed") this.forceSample(traceId, "error-forced"); // 第72天：失败链路无条件覆盖普通比例采样结果。
    this.active.delete(traceId); // 第72天：从运行中集合移除已经结束的链路。
    if (trace.sampled) this.completed.set(traceId, structuredClone(trace)); // 第72天：仅把命中采样策略的链路写入已完成存储。
    return structuredClone(trace); // 第72天：无论是否采样都返回本次完成结果供运行时发布事件。
  } // 第72天：结束完整分布式链路方法。

  getTrace(traceId: string): DistributedTraceV2 | undefined { // 第72天：按链路标识读取运行中或已采样完成的链路。
    const trace = this.active.get(traceId) ?? this.completed.get(traceId); // 第72天：优先读取运行中链路否则读取已完成链路。
    return trace ? structuredClone(trace) : undefined; // 第72天：命中时返回防御性副本否则返回空值。
  } // 第72天：结束按标识读取分布式链路方法。

  listTraces(): DistributedTraceV2[] { return Array.from(this.completed.values()).map((trace) => structuredClone(trace)).sort((left, right) => right.startedAt - left.startedAt); } // 第72天：返回按开始时间倒序排列的已采样链路列表。

  buildTree(traceId: string): TraceTreeNode[] { // 第72天：根据 parentSpanId 构建可展开的跨度树。
    const trace = this.getTrace(traceId); // 第72天：读取需要构建树形关系的完整链路。
    if (!trace) return []; // 第72天：链路不存在时返回空树。
    const nodes = new Map(trace.spans.map((span) => [span.spanId, { span, children: [] as TraceTreeNode[] }])); // 第72天：为每个跨度创建可挂载子节点的树节点。
    const roots: TraceTreeNode[] = []; // 第72天：初始化没有有效父跨度的根节点列表。
    for (const span of trace.spans) { const node = nodes.get(span.spanId) as TraceTreeNode; const parent = span.parentSpanId ? nodes.get(span.parentSpanId) : undefined; if (parent) parent.children.push(node); else roots.push(node); } // 第72天：按照父跨度标识建立树形调用关系。
    const sortNodes = (items: TraceTreeNode[]): void => { items.sort((left, right) => left.span.startedAt - right.span.startedAt); for (const item of items) sortNodes(item.children); }; // 第72天：定义按开始时间递归排序跨度树的辅助函数。
    sortNodes(roots); // 第72天：稳定排序全部根节点和子节点。
    return roots; // 第72天：返回可供 Trace Explorer 展示的跨度树。
  } // 第72天：结束跨度树构建方法。
} // 第72天：结束分布式链路追踪提供者第二版实现。
