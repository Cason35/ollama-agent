import { loadEnvironmentConfig, validateEnvironmentConfig } from "@/lib/production/environment-config"; // 第74天：引入生产配置加载与校验函数。
import { productionHealthChecker } from "@/lib/production/health-checker"; // 第74天：引入生产健康检查器。

export const dynamic = "force-dynamic"; // 第74天：声明就绪检查必须实时执行。

export async function GET(): Promise<Response> { // 第74天：定义 GET /api/ready Kubernetes 就绪检查接口。
  const config = validateEnvironmentConfig(loadEnvironmentConfig()); // 第74天：验证当前生产配置可用。
  const health = await productionHealthChecker.checkAll(); // 第74天：验证全部必需基础设施可用。
  const ready = config.valid && health.status === "healthy"; // 第74天：配置与依赖都健康时才允许接收流量。
  return Response.json({ status: ready ? "ready" : "not_ready", config, health, checkedAt: Date.now() }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } }); // 第74天：返回就绪状态和失败证据。
} // 第74天：结束 Kubernetes 就绪检查接口。
