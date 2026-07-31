import { pool } from "@/lib/db/mysql"; // 第74天：引入 MySQL 连接池执行真实数据库健康检查。
import { redisClient } from "@/lib/redis/redis-client"; // 第74天：引入 Redis 客户端执行缓存与队列健康检查。
import { createRegistrySnapshot } from "@/lib/registry/registry-runtime"; // 第74天：引入统一注册中心快照验证能力注册状态。
import { objectStorageClient } from "@/lib/storage/object-storage-client"; // 第74天：引入对象存储客户端验证 Local 或 MinIO 服务。
import type { HealthSnapshot, ServiceHealthName, ServiceHealthResult } from "@/lib/production/types"; // 第74天：引入综合健康检查领域类型。

export type HealthProbe = { name: ServiceHealthName; required: boolean; run: () => Promise<string> }; // 第74天：定义可注入的单项健康探针结构。

function errorMessage(error: unknown): string { // 第74天：定义未知错误到中文可读消息的转换函数。
  return error instanceof Error ? error.message : String(error); // 第74天：优先保留标准错误消息。
} // 第74天：结束错误消息转换函数。

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> { // 第74天：定义健康探针超时保护函数。
  let timer: ReturnType<typeof setTimeout> | undefined; // 第74天：保存超时定时器句柄。
  try { // 第74天：确保探针完成后清理定时器。
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${name} 健康检查超过 ${timeoutMs}ms`)), timeoutMs); })]); // 第74天：在真实探针与超时错误之间竞争。
  } finally { // 第74天：进入探针清理阶段。
    if (timer) clearTimeout(timer); // 第74天：清理已经创建的超时定时器。
  } // 第74天：结束探针清理阶段。
} // 第74天：结束健康探针超时保护函数。

export function createDefaultHealthProbes(): HealthProbe[] { // 第74天：创建 MySQL、Redis、MinIO、队列和注册中心默认健康探针。
  return [ // 第74天：返回五项生产健康探针。
    { name: "database", required: true, run: async () => { await pool.query("SELECT 1 AS healthy"); return "MySQL SELECT 1 执行成功。"; } }, // 第74天：通过最小只读 SQL 验证数据库连接池。
    { name: "redis", required: true, run: async () => { const pong = await redisClient.ping(); return `Redis PING 返回 ${pong}。`; } }, // 第74天：通过 PING 验证 Redis 缓存连接。
    { name: "storage", required: true, run: async () => { const snapshot = await objectStorageClient.snapshot(); return `${snapshot.provider} 对象存储可用，Bucket 为 ${snapshot.bucket}。`; } }, // 第74天：通过对象存储快照验证 Local 或 MinIO Provider。
    { name: "queue", required: true, run: async () => { const pong = await redisClient.ping(); return `Redis Queue 依赖返回 ${pong}。`; } }, // 第74天：复用 Redis PING 验证队列底层依赖。
    { name: "registry", required: true, run: async () => { const snapshot = createRegistrySnapshot(); if (snapshot.metrics.enabledCount <= 0) throw new Error("统一注册中心没有启用能力"); return `统一注册中心已启用 ${snapshot.metrics.enabledCount} 项能力。`; } }, // 第74天：验证统一注册中心至少存在一项启用能力。
  ]; // 第74天：结束默认健康探针数组。
} // 第74天：结束默认健康探针创建函数。

export class ProductionHealthChecker { // 第74天：定义支持依赖注入、超时和综合状态计算的健康检查器。
  constructor(private readonly probes: HealthProbe[] = createDefaultHealthProbes(), private readonly timeoutMs = 1500) {} // 第74天：默认使用真实生产依赖并把单项超时设置为一千五百毫秒。
  async checkAll(): Promise<HealthSnapshot> { // 第74天：并发执行全部生产健康探针。
    const services = await Promise.all(this.probes.map(async (probe) => await this.checkOne(probe))); // 第74天：并发检查全部服务以缩短健康端点总延迟。
    const requiredFailure = services.some((service) => service.required && service.state === "unhealthy"); // 第74天：判断是否存在影响就绪的必需依赖故障。
    const optionalFailure = services.some((service) => !service.required && service.state === "unhealthy"); // 第74天：判断是否只有可选依赖故障。
    const status = requiredFailure ? "unhealthy" : optionalFailure ? "degraded" : "healthy"; // 第74天：按必需依赖优先级计算综合状态。
    return { status, services, checkedAt: Date.now() }; // 第74天：返回综合健康检查快照。
  } // 第74天：结束综合健康检查方法。
  private async checkOne(probe: HealthProbe): Promise<ServiceHealthResult> { // 第74天：定义执行单项健康探针的方法。
    const startedAt = Date.now(); // 第74天：记录单项探针开始时间。
    try { // 第74天：捕获连接失败和探针超时。
      const message = await withTimeout(probe.run(), this.timeoutMs, probe.name); // 第74天：在超时保护下执行真实探针。
      return { name: probe.name, state: "healthy", latencyMs: Date.now() - startedAt, checkedAt: Date.now(), message, required: probe.required }; // 第74天：返回健康服务结果。
    } catch (error) { // 第74天：处理服务连接或探针执行失败。
      return { name: probe.name, state: "unhealthy", latencyMs: Date.now() - startedAt, checkedAt: Date.now(), message: errorMessage(error), required: probe.required }; // 第74天：返回包含失败原因的不健康结果。
    } // 第74天：结束单项探针异常处理。
  } // 第74天：结束单项健康探针方法。
} // 第74天：结束生产健康检查器类。

export const productionHealthChecker = new ProductionHealthChecker(); // 第74天：导出共享生产健康检查器供 API 和启动校验复用。
