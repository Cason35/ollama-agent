import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第72天：引入统一API成功和错误响应封装。
import { productionObservabilityPlatform } from "@/lib/observability/production-observability-platform"; // 第72天：引入进程级生产可观测平台单例。

type JsonBody = Record<string, unknown>; // 第72天：定义Observability API接收的通用JSON对象类型。
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; } // 第72天：把未知字段安全标准化为去首尾空白字符串。

export async function GET(request: Request) { // 第72天：定义读取完整仪表盘快照或单条链路诊断结果的Route Handler。
  try { const traceId = new URL(request.url).searchParams.get("traceId")?.trim(); return traceId ? apiJsonSuccess(await productionObservabilityPlatform.queryTrace(traceId), "observability trace query") : apiJsonSuccess(await productionObservabilityPlatform.getSnapshot(), "production observability platform snapshot"); } // 第72天：有traceId时返回跨度树、日志和指标否则返回完整可观测快照。
  catch (error) { return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Production Observability GET failed"); } // 第72天：把未知服务端异常转换为统一内部错误响应。
} // 第72天：结束生产可观测平台GET Route Handler。

export async function POST(request: Request) { // 第72天：定义告警中心恢复活动告警的Route Handler。
  try { const body = await request.json() as JsonBody; const action = text(body.action); const alertId = text(body.alertId); if (action === "resolve_alert" && alertId) return apiJsonSuccess(await productionObservabilityPlatform.resolveAlert(alertId), "observability alert resolved"); return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "第72天Observability API action或alertId不完整"); } // 第72天：校验恢复动作和告警标识后返回更新的告警中心快照。
  catch (error) { return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Observability POST failed"); } // 第72天：把JSON解析或告警恢复异常转换为统一参数错误响应。
} // 第72天：结束生产可观测平台POST Route Handler。
