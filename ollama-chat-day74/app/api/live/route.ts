import { loadEnvironmentConfig } from "@/lib/production/environment-config"; // 第74天：引入生产配置读取发布版本。

export const dynamic = "force-dynamic"; // 第74天：声明存活检查必须实时执行。

export async function GET(): Promise<Response> { // 第74天：定义 GET /api/live Kubernetes 存活检查接口。
  const config = loadEnvironmentConfig(); // 第74天：读取当前环境和发布版本。
  return Response.json({ status: "alive", environment: config.environment, version: config.release.version, uptimeSeconds: Math.round(process.uptime()), checkedAt: Date.now() }, { status: 200, headers: { "Cache-Control": "no-store" } }); // 第74天：只验证 Node.js 进程存活，不依赖外部服务。
} // 第74天：结束 Kubernetes 存活检查接口。
