import { NextResponse } from "next/server"; // 第73天：引入Next.js响应工具返回带真实HTTP状态的网关结果。
import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第73天：引入历史统一API成功和异常响应封装。
import { productionGovernancePlatform } from "@/lib/governance/production-governance-platform"; // 第73天：引入进程级多租户治理平台单例。
import { GOVERNANCE_PERMISSIONS, type GatewayRequest, type GovernedResourceType, type GovernanceAction, type RequestedUsage } from "@/lib/governance/types"; // 第73天：引入标准动作、网关请求、资源类型和用量类型。
type JsonBody = Record<string, unknown>; // 第73天：定义生产治理接口接收的通用JSON对象。
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; } // 第73天：把未知输入安全标准化为去空白字符串。
export async function GET() { try { return apiJsonSuccess(await productionGovernancePlatform.getSnapshot(), "day73 governance snapshot"); } catch (error) { return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Day73 Governance GET failed"); } } // 第73天：返回Tenant、Permission、Audit、Quota和安全测试完整快照。
export async function POST(request: Request) { // 第73天：定义/api/v1下统一执行认证、授权、限流、配额和审计的生产接口。
  try { // 第73天：捕获JSON解析和治理运行时异常并返回稳定响应。
    const body = await request.json() as JsonBody; // 第73天：解析客户端提交的标准网关动作对象。
    const authorization = request.headers.get("authorization") ?? ""; // 第73天：读取标准Authorization请求头。
    const token = authorization.replace(/^Bearer\s+/iu, "").trim() || text(body.token); // 第73天：优先使用Bearer令牌并允许本地测试从请求体传入。
    const action = text(body.action) as GovernanceAction; // 第73天：读取需要执行的标准权限动作。
    if (!token || !GOVERNANCE_PERMISSIONS.includes(action)) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要有效token和Day73标准action"); // 第73天：拒绝缺失令牌或未知动作进入生产网关。
    const gatewayRequest: GatewayRequest = { token, action, tenantId: text(body.tenantId) || undefined, requestId: text(body.requestId) || undefined, traceId: text(body.traceId) || undefined, resourceType: (text(body.resourceType) || "platform") as GovernedResourceType | "platform", resourceId: text(body.resourceId) || undefined, estimatedUsage: body.estimatedUsage && typeof body.estimatedUsage === "object" ? body.estimatedUsage as RequestedUsage : undefined, payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : undefined }; // 第73天：组装认证、租户、资源、用量和请求链路统一网关输入。
    const result = await productionGovernancePlatform.execute(gatewayRequest); // 第73天：通过API Gateway执行完整生产安全边界。
    return NextResponse.json(result, { status: result.status }); // 第73天：使用网关真实HTTP状态返回允许或拒绝结果。
  } catch (error) { return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Day73 Governance POST failed"); } // 第73天：把无效JSON或运行时异常转换为统一参数错误响应。
} // 第73天：结束Day73生产治理POST Route Handler。
