import type { Trace, TraceAttachment, TraceMetrics, TraceSpan, TraceSpanStatus, TraceSpanType } from "@/lib/agents/agent-types"; /* 第61天：引入 Trace（追踪记录）、TraceAttachment（追踪附件）、TraceSpan（追踪跨度）和 TraceMetrics（追踪指标）类型。 */
import { maskSecretObject } from "@/lib/secrets/secret-masking"; /* 第63天：引入 Trace 元数据脱敏工具，避免密钥进入追踪记录。 */

type StartSpanInput = { /* 第44天：定义 startSpan（开始跨度）方法的入参结构。 */
  parentSpanId?: string; /* 第44天：保存可选父 Span（父跨度）ID。 */
  name: string; /* 第44天：保存 Span（跨度）名称。 */
  type: TraceSpanType; /* 第44天：保存 Span（跨度）类型。 */
  metadata?: Record<string, unknown>; /* 第44天：保存 Span（跨度）启动时附带的元数据。 */
}; /* 第44天：结束 StartSpanInput 类型定义。 */

export class TraceManager { /* 第44天：定义 TraceManager（追踪管理器），集中维护 Trace 和 Span。 */
  private readonly traces = new Map<string, Trace>(); /* 第44天：用 Map 按 traceId 保存追踪记录。 */
  private sequence = 0; /* 第44天：保存递增序号，让 ID 在同一毫秒内也保持唯一。 */

  startTrace(rootOperation: string): Trace { /* 第44天：开始一次完整 Trace（追踪记录）。 */
    const trace: Trace = { traceId: this.nextId("trace"), rootOperation, startedAt: Date.now(), spans: [] }; /* 第44天：创建包含根操作和开始时间的追踪记录。 */
    this.traces.set(trace.traceId, trace); /* 第44天：把 Trace（追踪记录）写入内存存储。 */
    return trace; /* 第44天：返回新建的 Trace（追踪记录）。 */
  } /* 第44天：结束 startTrace 方法。 */

  endTrace(traceId: string): Trace | undefined { /* 第44天：结束一次完整 Trace（追踪记录）。 */
    const trace = this.traces.get(traceId); /* 第44天：按 ID 查找目标 Trace（追踪记录）。 */
    if (!trace) return undefined; /* 第44天：找不到目标 Trace 时保持兼容并返回空值。 */
    trace.endedAt = trace.endedAt ?? Date.now(); /* 第44天：只在首次结束时写入结束时间。 */
    trace.spans.filter((span) => span.status === "running").forEach((span) => this.endSpan(traceId, span.spanId, "success")); /* 第44天：兜底关闭仍在运行中的 Span（跨度）。 */
    return trace; /* 第44天：返回已结束的 Trace（追踪记录）。 */
  } /* 第44天：结束 endTrace 方法。 */

  startSpan(traceId: string, input: StartSpanInput): string { /* 第44天：在指定 Trace（追踪记录）下开始一个 Span（跨度）。 */
    const trace = this.traces.get(traceId); /* 第44天：读取目标 Trace（追踪记录）。 */
    if (!trace) return ""; /* 第44天：Trace 不存在时返回空字符串，避免业务流程被观测系统打断。 */
    const span: TraceSpan = { spanId: this.nextId("span"), parentSpanId: input.parentSpanId, name: input.name, type: input.type, startedAt: Date.now(), status: "running", metadata: maskSecretObject(input.metadata) }; /* 第63天：创建运行中的 Span，并对初始元数据执行密钥脱敏。 */
    trace.spans.push(span); /* 第44天：把 Span（跨度）追加到 Trace（追踪记录）中。 */
    return span.spanId; /* 第44天：返回 Span（跨度）ID 供后续结束时使用。 */
  } /* 第44天：结束 startSpan 方法。 */

  endSpan(traceId: string, spanId: string, status: TraceSpanStatus = "success", metadata?: Record<string, unknown>): TraceSpan | undefined { /* 第44天：结束指定 Span（跨度）并更新状态。 */
    const span = this.getTrace(traceId)?.spans.find((item) => item.spanId === spanId); /* 第44天：在 Trace（追踪记录）中查找目标 Span（跨度）。 */
    if (!span) return undefined; /* 第44天：找不到 Span 时保持兼容并返回空值。 */
    span.status = status; /* 第44天：写入 Span（跨度）最终状态。 */
    span.endedAt = span.endedAt ?? Date.now(); /* 第44天：写入 Span（跨度）结束时间。 */
    span.metadata = maskSecretObject({ ...(span.metadata ?? {}), ...(metadata ?? {}) }); /* 第63天：合并结束时追加的元数据，并统一执行密钥脱敏。 */
    return span; /* 第44天：返回更新后的 Span（跨度）。 */
  } /* 第44天：结束 endSpan 方法。 */

  addAttachment(traceId: string, attachment: TraceAttachment): TraceAttachment | undefined { /* 第61天：给指定 Trace（追踪记录）追加对象存储附件引用。 */
    const trace = this.traces.get(traceId); /* 第61天：按 Trace ID 查找目标追踪记录。 */
    if (!trace) return undefined; /* 第61天：Trace 不存在时返回空值，避免附件写入影响主流程。 */
    trace.attachments = [...(trace.attachments ?? []), attachment]; /* 第61天：追加附件引用并保持不可变数组更新风格。 */
    return attachment; /* 第61天：返回已挂载的附件引用。 */
  } /* 第61天：结束 addAttachment 方法。 */

  attachEvaluation(traceId: string, evaluation: import("@/lib/evaluation/evaluation-platform-types").EvaluationTraceLink): Trace | undefined { /* 第71天：把 EvaluationRun、多维评分和评估器版本自动关联到指定 Trace。 */
    const trace = this.traces.get(traceId); /* 第71天：按 Trace ID 查找需要补充质量链路的追踪记录。 */
    if (!trace) return undefined; /* 第71天：Trace 不存在时返回空值并避免评估关联打断主业务。 */
    trace.evaluation = structuredClone(evaluation); /* 第71天：保存防御性副本避免外部修改追踪记录中的评估信息。 */
    return trace; /* 第71天：返回已完成评估关联的 Trace 供运行时快照使用。 */
  } /* 第71天：结束 Trace 自动关联 Evaluation 方法。 */

  getTrace(traceId: string): Trace | undefined { /* 第44天：按 ID 读取单条 Trace（追踪记录）。 */
    return this.traces.get(traceId); /* 第44天：返回内存中的 Trace（追踪记录）。 */
  } /* 第44天：结束 getTrace 方法。 */

  listTraces(): Trace[] { /* 第44天：列出当前 TraceManager（追踪管理器）保存的全部 Trace。 */
    return Array.from(this.traces.values()); /* 第44天：把 Map 值转换为数组返回。 */
  } /* 第44天：结束 listTraces 方法。 */

  getMetrics(): TraceMetrics { /* 第44天：计算 Trace Metrics（追踪指标）。 */
    const traces = this.listTraces(); /* 第44天：读取全部 Trace（追踪记录）。 */
    const spans = traces.flatMap((trace) => trace.spans); /* 第44天：展开所有 Span（跨度）用于按类型统计。 */
    return { totalTraces: traces.length, avgTraceDuration: this.averageTraceDuration(traces), avgAgentDuration: this.averageSpanDuration(spans, ["agent"]), avgToolDuration: this.averageSpanDuration(spans, ["tool", "retrieval"]), avgReflectionDuration: this.averageSpanDuration(spans, ["reflection"]), avgDecisionDuration: this.averageSpanDuration(spans, ["decision"]) }; /* 第57天：返回完整追踪指标快照，并新增运行时决策耗时。 */
  } /* 第44天：结束 getMetrics 方法。 */

  private averageTraceDuration(traces: Trace[]): number { /* 第44天：计算 Trace（追踪记录）的平均耗时。 */
    const durations = traces.map((trace) => this.durationOf(trace.startedAt, trace.endedAt)); /* 第44天：收集每条 Trace 的耗时。 */
    return this.average(durations); /* 第44天：返回平均耗时。 */
  } /* 第44天：结束 averageTraceDuration 方法。 */

  private averageSpanDuration(spans: TraceSpan[], types: TraceSpanType[]): number { /* 第44天：计算指定类型 Span（跨度）的平均耗时。 */
    const durations = spans.filter((span) => types.includes(span.type)).map((span) => this.durationOf(span.startedAt, span.endedAt)); /* 第44天：筛选类型并提取耗时。 */
    return this.average(durations); /* 第44天：返回平均耗时。 */
  } /* 第44天：结束 averageSpanDuration 方法。 */

  private durationOf(startedAt: number, endedAt?: number): number { /* 第44天：计算开始和结束时间之间的耗时。 */
    return Math.max(0, (endedAt ?? Date.now()) - startedAt); /* 第44天：运行中 Span 使用当前时间估算耗时。 */
  } /* 第44天：结束 durationOf 方法。 */

  private average(values: number[]): number { /* 第44天：计算数字数组平均值。 */
    if (values.length === 0) return 0; /* 第44天：空数组返回 0，避免除零。 */
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)); /* 第44天：返回保留两位小数的平均值。 */
  } /* 第44天：结束 average 方法。 */

  private nextId(prefix: string): string { /* 第44天：生成 Trace（追踪记录）和 Span（跨度）的唯一 ID。 */
    this.sequence += 1; /* 第44天：递增本地序号。 */
    return `${prefix}-${Date.now()}-${this.sequence}`; /* 第44天：组合前缀、时间戳和序号作为 ID。 */
  } /* 第44天：结束 nextId 方法。 */
} /* 第44天：结束 TraceManager（追踪管理器）类定义。 */
