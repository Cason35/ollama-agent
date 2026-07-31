import { NextResponse } from "next/server"; // 第64天：引入 Next.js JSON 响应工具。
import { executeUnifiedResearchTask } from "@/lib/runtime/unified-runtime-chain"; // 第64天：引入统一上下文完整链路。

export async function GET() { // 第64天：提供 Runtime Context Explorer 默认研究任务快照接口。
  return NextResponse.json(await executeUnifiedResearchTask()); // 第64天：执行并返回统一上下文快照。
} // 第64天：结束 GET 接口。

export async function POST(request: Request) { // 第64天：允许调用方提交用户、会话与任务上下文。
  const body = await request.json().catch(() => ({})); // 第64天：安全读取 JSON 请求体，空请求使用默认对象。
  return NextResponse.json(await executeUnifiedResearchTask(body)); // 第64天：执行自定义研究任务并返回快照。
} // 第64天：结束 POST 接口。
