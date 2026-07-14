import { NextResponse } from "next/server"; // 第65天：引入 Next.js Route Handler 的 JSON 响应工具。
import { executeUnifiedEventTask } from "@/lib/events/event-driven-runtime"; // 第65天：引入统一事件系统完整演示链路。
import type { RuntimeContextRequest } from "@/lib/runtime/unified-runtime-context"; // 第65天：引入允许调用方覆盖的统一上下文请求类型。

export async function GET() { // 第65天：提供 Event Explorer 默认事件链路快照接口。
  return NextResponse.json(await executeUnifiedEventTask()); // 第65天：执行一次全新的统一事件任务并返回 JSON 快照。
} // 第65天：结束统一事件系统 GET 接口。

export async function POST(request: Request) { // 第65天：允许测试或调用方传入固定请求、会话和追踪标识。
  const body = await request.json().catch(() => ({})) as RuntimeContextRequest; // 第65天：安全读取 JSON 请求体，解析失败时使用空对象。
  return NextResponse.json(await executeUnifiedEventTask(body)); // 第65天：执行自定义上下文的统一事件任务并返回快照。
} // 第65天：结束统一事件系统 POST 接口。
