import { productionHealthChecker } from "@/lib/production/health-checker"; // 第74天：引入共享生产健康检查器。

export const dynamic = "force-dynamic"; // 第74天：声明健康检查必须在请求时实时执行。

export async function GET(): Promise<Response> { // 第74天：定义 GET /api/health 综合健康检查接口。
  const snapshot = await productionHealthChecker.checkAll(); // 第74天：检查 MySQL、Redis、MinIO、队列和注册中心。
  const status = snapshot.status === "healthy" ? 200 : 503; // 第74天：健康时返回二百，否则返回五百零三。
  return Response.json(snapshot, { status, headers: { "Cache-Control": "no-store" } }); // 第74天：返回禁止缓存的实时健康快照。
} // 第74天：结束综合健康检查接口。
