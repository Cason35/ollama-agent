import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第48天：引入统一 API 成功与错误响应包装器。 */
import { clearCache, getCacheDashboardSnapshot, invalidateCacheEntry } from "@/lib/cache/cache-dashboard-runtime"; /* 第48天：引入缓存看板快照、手动失效与清空能力。 */

export async function GET() { /* 第48天：定义 GET /api/cache 读取最近缓存快照接口。 */
  try { /* 第48天：捕获演示运行与摘要生成阶段可能出现的异常。 */
    return apiJsonSuccess(await getCacheDashboardSnapshot(false)); /* 第48天：返回缓存条目、指标与事件快照。 */
  } catch (error) { /* 第48天：处理缓存快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Cache snapshot failed"); /* 第48天：返回统一内部错误响应。 */
  } /* 第48天：结束 GET 异常处理。 */
} /* 第48天：结束 GET /api/cache 接口。 */

export async function POST() { /* 第48天：定义 POST /api/cache 强制重新运行缓存演示接口。 */
  try { /* 第48天：捕获重新运行期间可能出现的异常。 */
    return apiJsonSuccess(await getCacheDashboardSnapshot(true), "semantic cache demo rerun completed"); /* 第48天：清空旧缓存、重新执行并返回最新快照。 */
  } catch (error) { /* 第48天：处理重新运行失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Cache rerun failed"); /* 第48天：返回统一内部错误响应。 */
  } /* 第48天：结束 POST 异常处理。 */
} /* 第48天：结束 POST /api/cache 接口。 */

export async function DELETE(request: Request) { /* 第48天：定义 DELETE /api/cache 手动失效或清空缓存接口。 */
  try { /* 第48天：捕获失效与清空阶段可能出现的异常。 */
    const id = new URL(request.url).searchParams.get("id"); /* 第48天：读取要失效的缓存条目 ID，缺省表示清空全部。 */
    if (id) await invalidateCacheEntry(id); /* 第58天：传入 ID 时异步失效内存与 Redis 中的对应缓存。 */
    else await clearCache(); /* 第58天：未传 ID 时异步清空内存与 Redis 缓存。 */
    return apiJsonSuccess(await getCacheDashboardSnapshot(false), id ? "cache entry invalidated" : "cache cleared"); /* 第48天：返回失效或清空后的最新快照。 */
  } catch (error) { /* 第48天：处理失效或清空失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Cache invalidate failed"); /* 第48天：返回统一内部错误响应。 */
  } /* 第48天：结束 DELETE 异常处理。 */
} /* 第48天：结束 DELETE /api/cache 接口。 */
