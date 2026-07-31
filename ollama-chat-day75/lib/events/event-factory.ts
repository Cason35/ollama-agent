import { randomUUID } from "node:crypto"; // 第65天：引入 UUID 生成器，为每一条运行时事件创建唯一标识。
import type { EventSource, EventType, RuntimeEvent } from "@/lib/events/event-types"; // 第65天：引入事件来源、事件类型和统一事件结构。
import type { RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第65天：引入 Day64 统一运行时上下文类型。

export function createRuntimeEvent(context: RuntimeContextV2, type: EventType, source: EventSource, payload: unknown, status: string): RuntimeEvent { // 第65天：根据统一上下文创建轻量且可追踪的运行时事件。
  return { // 第65天：返回符合统一事件协议的安全事件对象。
    id: `evt_${randomUUID()}`, // 第65天：生成带事件前缀的全局唯一标识。
    type, // 第65天：写入调用方声明的事件类型。
    timestamp: Date.now(), // 第65天：记录事件创建时的毫秒时间戳。
    traceId: context.traceId, // 第65天：复用统一上下文中的链路追踪标识。
    runtimeContextId: context.requestId, // 第65天：使用 Request ID 关联统一上下文且避免复制完整上下文。
    payload, // 第65天：写入调用方提供的已脱敏业务载荷。
    metadata: { source, status, version: "day65.v1", requestId: context.requestId }, // 第65天：写入来源、状态、版本和请求标识等安全元数据。
  }; // 第65天：结束统一事件对象组装。
} // 第65天：结束运行时事件工厂函数。
