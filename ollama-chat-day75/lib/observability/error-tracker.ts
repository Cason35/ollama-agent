import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建错误聚合项唯一标识。
import type { ErrorEvent } from "@/lib/observability/types"; // 第72天：引入错误事件聚合类型。

type CaptureErrorInput = { errorType: string; message: string; stack?: string; source: string; traceId?: string; requestId?: string; model?: string; timestamp?: number }; // 第72天：定义捕获一次原始错误所需的结构化输入。

function fingerprint(input: CaptureErrorInput): string { return `${input.errorType.trim()}|${input.source.trim()}|${input.model?.trim() ?? ""}|${input.message.trim().toLowerCase()}`; } // 第72天：根据错误类型、来源、模型和消息创建稳定聚合指纹。

export class ErrorTracker { // 第72天：实现按错误指纹自动聚合次数、来源和链路的错误追踪器。
  private readonly errors = new Map<string, ErrorEvent>(); // 第72天：按稳定指纹保存错误聚合结果。

  capture(input: CaptureErrorInput): ErrorEvent { // 第72天：捕获一次错误并更新对应聚合项。
    if (!input.errorType.trim() || !input.message.trim() || !input.source.trim()) throw new Error("ErrorEvent 的 errorType、message 和 source 不能为空"); // 第72天：阻止缺少关键诊断字段的错误写入。
    const key = fingerprint(input); // 第72天：计算当前错误的稳定聚合指纹。
    const timestamp = input.timestamp ?? Date.now(); // 第72天：读取显式时间或使用当前时间。
    const current = this.errors.get(key); // 第72天：查找是否已经存在同类错误聚合项。
    if (current) { current.count += 1; current.lastSeenAt = timestamp; current.traceId = input.traceId; current.requestId = input.requestId; current.stack = input.stack ?? current.stack; if (input.traceId && !current.traceIds.includes(input.traceId)) current.traceIds.push(input.traceId); return structuredClone(current); } // 第72天：同类错误累加次数并更新最近链路、请求、堆栈和时间。
    const created: ErrorEvent = { id: `error_${randomUUID()}`, fingerprint: key, errorType: input.errorType.trim(), message: input.message.trim(), stack: input.stack, source: input.source.trim(), traceId: input.traceId, traceIds: input.traceId ? [input.traceId] : [], requestId: input.requestId, model: input.model, count: 1, firstSeenAt: timestamp, lastSeenAt: timestamp }; // 第72天：为首次出现的错误创建完整聚合项。
    this.errors.set(key, created); // 第72天：保存新的错误聚合项。
    return structuredClone(created); // 第72天：返回防御性副本供告警引擎和接口使用。
  } // 第72天：结束错误捕获与自动聚合方法。

  list(): ErrorEvent[] { return Array.from(this.errors.values()).map((error) => structuredClone(error)).sort((left, right) => right.count - left.count || right.lastSeenAt - left.lastSeenAt); } // 第72天：按出现次数和最近时间返回错误排行。
} // 第72天：结束错误追踪器实现。
