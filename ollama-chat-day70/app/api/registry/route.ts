import { NextResponse } from "next/server"; // 第66天：引入 Next.js Route Handler 的 JSON 响应工具。
import { createRegistrySnapshot, isRegistryItemType } from "@/lib/registry/registry-runtime"; // 第66天：引入统一注册快照工厂和类型查询参数校验器。

export async function GET(request: Request) { // 第66天：提供 Registry Explorer 使用的统一能力列表、发现结果和指标接口。
  const url = new URL(request.url); // 第66天：使用标准 Web URL 读取类型、查询词和禁用项参数。
  const requestedType = url.searchParams.get("type"); // 第66天：读取可选注册项类型过滤参数。
  const type = isRegistryItemType(requestedType) ? requestedType : undefined; // 第66天：只把合法七类注册类型传入运行时。
  const query = url.searchParams.get("query") ?? ""; // 第66天：读取可选能力发现查询词。
  const includeDisabled = url.searchParams.get("includeDisabled") !== "false"; // 第66天：除非显式传 false，否则展示禁用提示词版本。
  return NextResponse.json(createRegistrySnapshot({ type, query, includeDisabled })); // 第66天：返回统一注册项、能力发现结果和 Registry Metrics。
} // 第66天：结束统一注册中心 GET 接口。
