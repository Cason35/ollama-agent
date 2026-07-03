import { redisClient, type RedisClient } from "@/lib/redis/redis-client"; /* 第58天：引入共享 RedisClient 和类型，用于健康检查。 */
import type { RedisHealthSnapshot } from "@/lib/redis/redis-types"; /* 第58天：引入 Redis 健康检查快照类型。 */
export class RedisHealthCheck { /* 第58天：定义 RedisHealthCheck（Redis 健康检查）类。 */
  constructor(private readonly client: RedisClient = redisClient) {} /* 第58天：默认使用共享 RedisClient，也支持测试注入。 */
  async ping(): Promise<string> { /* 第58天：定义 PING（连通性检查）方法。 */
    return await this.client.ping(); /* 第58天：委托 RedisClient 执行 PING 并记录操作追踪。 */
  } /* 第58天：结束 PING 方法。 */
  async isHealthy(): Promise<boolean> { /* 第58天：定义布尔健康状态检查方法。 */
    const snapshot = await this.getSnapshot(); /* 第58天：复用完整快照逻辑，避免健康判断与展示结果不一致。 */
    return snapshot.healthy; /* 第58天：返回 Redis 当前是否健康。 */
  } /* 第58天：结束健康状态检查方法。 */
  async getSnapshot(): Promise<RedisHealthSnapshot> { /* 第58天：定义读取 Redis 健康检查快照的方法。 */
    const checkedAt = Date.now(); /* 第58天：记录健康检查时间。 */
    try { /* 第58天：捕获 Redis PING 失败。 */
      const pong = await this.ping(); /* 第58天：执行 Redis PING。 */
      return { healthy: pong.toUpperCase() === "PONG", ping: pong, checkedAt }; /* 第58天：返回健康快照，PONG 表示连接可用。 */
    } catch (error) { /* 第58天：处理 Redis 不可用或未启动。 */
      return { healthy: false, ping: "FAILED", checkedAt, error: error instanceof Error ? error.message : String(error) }; /* 第58天：返回失败快照并保留错误原因。 */
    } /* 第58天：结束健康检查异常处理。 */
  } /* 第58天：结束健康检查快照方法。 */
} /* 第58天：结束 RedisHealthCheck（Redis 健康检查）类定义。 */
export const redisHealthCheck = new RedisHealthCheck(); /* 第58天：导出共享 RedisHealthCheck 单例。 */
