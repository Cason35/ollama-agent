import { loadEnvironmentConfig, validateEnvironmentConfig } from "@/lib/production/environment-config"; // 第74天：引入生产配置加载与校验函数。
import { productionHealthChecker, type ProductionHealthChecker } from "@/lib/production/health-checker"; // 第74天：引入真实健康检查器和可注入类型。
import type { StartupValidationSnapshot } from "@/lib/production/types"; // 第74天：引入启动校验快照类型。

const globalForStartup = globalThis as typeof globalThis & { __day74StartupSnapshot?: StartupValidationSnapshot }; // 第74天：扩展全局对象保存 Next.js 进程级启动校验状态。

function initialSnapshot(): StartupValidationSnapshot { // 第74天：定义未开始启动校验的默认状态。
  const config = validateEnvironmentConfig(loadEnvironmentConfig()); // 第74天：生成初始配置校验结果供仪表盘读取。
  return { status: "not_started", config }; // 第74天：返回未开始状态。
} // 第74天：结束默认启动校验状态函数。

export function getStartupValidationSnapshot(): StartupValidationSnapshot { // 第74天：定义读取当前启动校验快照的方法。
  globalForStartup.__day74StartupSnapshot ??= initialSnapshot(); // 第74天：首次读取时创建初始状态。
  return structuredClone(globalForStartup.__day74StartupSnapshot); // 第74天：返回防御性副本避免外部修改全局状态。
} // 第74天：结束启动校验快照读取函数。

export async function runStartupValidation(checker: ProductionHealthChecker = productionHealthChecker): Promise<StartupValidationSnapshot> { // 第74天：执行配置、数据库、Redis、MinIO 和注册中心启动校验。
  const config = loadEnvironmentConfig(); // 第74天：读取当前进程生产配置。
  const validation = validateEnvironmentConfig(config); // 第74天：校验环境变量与密钥引用。
  globalForStartup.__day74StartupSnapshot = { status: "validating", config: validation, checkedAt: Date.now() }; // 第74天：记录启动校验正在执行。
  if (!validation.valid) { // 第74天：判断生产配置是否存在阻断错误。
    const error = validation.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.key}: ${issue.message}`).join("；"); // 第74天：拼接全部阻断错误。
    globalForStartup.__day74StartupSnapshot = { status: "failed", config: validation, checkedAt: Date.now(), error }; // 第74天：保存配置校验失败状态。
    return getStartupValidationSnapshot(); // 第74天：返回失败快照并停止依赖探测。
  } // 第74天：结束生产配置阻断判断。
  const health = await checker.checkAll(); // 第74天：检查 MySQL、Redis、MinIO、队列和注册中心。
  const status = health.status === "healthy" ? "ready" : "failed"; // 第74天：全部必需依赖健康时才进入 ready。
  const error = status === "failed" ? health.services.filter((service) => service.state === "unhealthy").map((service) => `${service.name}: ${service.message}`).join("；") : undefined; // 第74天：聚合不健康服务原因。
  globalForStartup.__day74StartupSnapshot = { status, config: validation, health, checkedAt: Date.now(), error }; // 第74天：保存最终启动校验结果。
  return getStartupValidationSnapshot(); // 第74天：返回最终启动校验防御性快照。
} // 第74天：结束启动校验执行函数。

export async function assertStartupReady(checker: ProductionHealthChecker = productionHealthChecker): Promise<void> { // 第74天：定义 Fail Fast 启动断言方法。
  const snapshot = await runStartupValidation(checker); // 第74天：执行完整启动校验。
  if (snapshot.status !== "ready") throw new Error(`Startup Failed（启动失败）：${snapshot.error ?? "未知生产依赖错误"}`); // 第74天：非就绪状态立即抛错阻止假启动。
} // 第74天：结束 Fail Fast 启动断言方法。
