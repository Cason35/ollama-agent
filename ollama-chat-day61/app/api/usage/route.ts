import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第47天：引入统一 API 成功与错误响应包装器。 */
import { getUsageDashboardSnapshot } from "@/lib/usage/usage-dashboard-runtime"; /* 第47天：引入用量看板快照运行时。 */

export async function GET() { /* 第47天：定义 GET /api/usage 读取最近用量快照接口。 */
  try { /* 第47天：捕获演示运行和聚合阶段可能出现的异常。 */
    return apiJsonSuccess(await getUsageDashboardSnapshot(false)); /* 第47天：返回缓存记录或首次生成的用量与成本快照。 */
  } catch (error) { /* 第47天：处理用量快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Usage snapshot failed"); /* 第47天：返回统一内部错误响应。 */
  } /* 第47天：结束 GET 异常处理。 */
} /* 第47天：结束 GET /api/usage 接口。 */

export async function POST() { /* 第47天：定义 POST /api/usage 强制重新运行用量演示接口。 */
  try { /* 第47天：捕获重新运行期间可能出现的异常。 */
    return apiJsonSuccess(await getUsageDashboardSnapshot(true), "usage and cost demo rerun completed"); /* 第47天：清空旧数据、重新执行并返回最新快照。 */
  } catch (error) { /* 第47天：处理重新运行失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Usage rerun failed"); /* 第47天：返回统一内部错误响应。 */
  } /* 第47天：结束 POST 异常处理。 */
} /* 第47天：结束 POST /api/usage 接口。 */
