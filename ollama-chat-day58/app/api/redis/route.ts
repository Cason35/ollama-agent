import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第58天：引入统一 API 成功与错误响应包装器。 */
import { deleteRedisKey, expireRedisKey, getRedisExplorerSnapshot } from "@/lib/redis/redis-dashboard-runtime"; /* 第58天：引入 Redis Explorer 后端运行时方法。 */
export async function GET() { /* 第58天：定义 GET /api/redis 读取 Redis Explorer 快照接口。 */
  try { /* 第58天：捕获 Redis 快照读取异常。 */
    return apiJsonSuccess(await getRedisExplorerSnapshot(false)); /* 第58天：返回健康检查、Key 列表、指标和操作追踪。 */
  } catch (error) { /* 第58天：处理 Redis 快照读取失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Redis snapshot failed"); /* 第58天：返回统一内部错误响应。 */
  } /* 第58天：结束 GET 异常处理。 */
} /* 第58天：结束 GET 接口。 */
export async function POST() { /* 第58天：定义 POST /api/redis 写入演示 Key 并刷新快照接口。 */
  try { /* 第58天：捕获 Redis 演示写入异常。 */
    return apiJsonSuccess(await getRedisExplorerSnapshot(true), "redis demo keys seeded"); /* 第58天：写入演示 Key 后返回最新快照。 */
  } catch (error) { /* 第58天：处理 Redis 演示写入失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Redis demo seed failed"); /* 第58天：返回统一内部错误响应。 */
  } /* 第58天：结束 POST 异常处理。 */
} /* 第58天：结束 POST 接口。 */
export async function DELETE(request: Request) { /* 第58天：定义 DELETE /api/redis 删除指定 Key 接口。 */
  try { /* 第58天：捕获 Redis 删除异常。 */
    const key = new URL(request.url).searchParams.get("key") ?? ""; /* 第58天：从查询参数读取要删除的逻辑 Key。 */
    return apiJsonSuccess(await deleteRedisKey(key), "redis key deleted"); /* 第58天：删除 Key 后返回最新快照。 */
  } catch (error) { /* 第58天：处理 Redis 删除失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Redis delete failed"); /* 第58天：返回统一内部错误响应。 */
  } /* 第58天：结束 DELETE 异常处理。 */
} /* 第58天：结束 DELETE 接口。 */
export async function PATCH(request: Request) { /* 第58天：定义 PATCH /api/redis 设置 Key TTL 接口。 */
  try { /* 第58天：捕获 Redis TTL 设置异常。 */
    const body = (await request.json()) as { key?: string; ttlSeconds?: number }; /* 第58天：解析请求体中的 Key 和 TTL 秒数。 */
    return apiJsonSuccess(await expireRedisKey(body.key ?? "", Number(body.ttlSeconds ?? 60)), "redis key ttl updated"); /* 第58天：设置过期时间后返回最新快照。 */
  } catch (error) { /* 第58天：处理 Redis TTL 设置失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Redis expire failed"); /* 第58天：返回统一内部错误响应。 */
  } /* 第58天：结束 PATCH 异常处理。 */
} /* 第58天：结束 PATCH 接口。 */
