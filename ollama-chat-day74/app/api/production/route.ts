import { getProductionRuntime } from "@/lib/production/production-runtime"; // 第74天：引入共享生产运行时。
import type { FeatureFlagMode } from "@/lib/production/types"; // 第74天：引入功能开关模式类型。

export const dynamic = "force-dynamic"; // 第74天：声明生产快照和功能开关操作必须实时执行。

function isMode(value: unknown): value is FeatureFlagMode { // 第74天：定义功能开关模式白名单校验函数。
  return value === "disabled" || value === "enabled" || value === "gradual"; // 第74天：只接受三种标准发布模式。
} // 第74天：结束功能开关模式校验函数。

export async function GET(): Promise<Response> { // 第74天：定义 GET /api/production 生产仪表盘快照接口。
  try { // 第74天：捕获历史平台初始化或基础设施探针异常。
    return Response.json(await getProductionRuntime().snapshot(), { headers: { "Cache-Control": "no-store" } }); // 第74天：返回完整生产平台快照。
  } catch (error) { // 第74天：处理生产快照生成失败。
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); // 第74天：返回稳定内部错误响应。
  } // 第74天：结束生产快照异常处理。
} // 第74天：结束生产仪表盘快照接口。

export async function POST(request: Request): Promise<Response> { // 第74天：定义 POST /api/production 功能开关更新接口。
  try { // 第74天：捕获 JSON 解析和功能开关业务错误。
    const body = await request.json() as { action?: unknown; key?: unknown; mode?: unknown; rolloutPercentage?: unknown }; // 第74天：解析功能开关更新请求体。
    if (body.action !== "update_feature_flag" || typeof body.key !== "string" || !isMode(body.mode)) return Response.json({ error: "需要 update_feature_flag、key 和合法 mode。" }, { status: 400 }); // 第74天：拒绝未知操作和非法模式。
    const flag = getProductionRuntime().updateFeatureFlag(body.key, body.mode, Number(body.rolloutPercentage)); // 第74天：更新功能开关模式与灰度比例。
    return Response.json({ flag, snapshot: await getProductionRuntime().snapshot() }); // 第74天：返回更新结果和最新生产快照。
  } catch (error) { // 第74天：处理请求或功能开关更新失败。
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); // 第74天：返回稳定参数错误响应。
  } // 第74天：结束功能开关更新异常处理。
} // 第74天：结束生产功能开关更新接口。
