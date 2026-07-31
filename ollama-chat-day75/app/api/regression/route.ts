import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; /* 第46天：引入统一 API 响应工具。 */
import { getRegressionDashboardSnapshot } from "@/lib/evaluation/regression-runtime"; /* 第46天：引入持续评估看板快照运行时。 */

export async function GET() { /* 第46天：定义读取最近回归评估快照的接口。 */
  try { /* 第46天：捕获持续评估运行异常。 */
    return apiJsonSuccess(await getRegressionDashboardSnapshot(false)); /* 第46天：返回缓存或首次生成的完整看板快照。 */
  } catch (error) { /* 第46天：处理快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "回归评估运行失败"); /* 第46天：返回统一内部错误响应。 */
  } /* 第46天：结束接口异常处理。 */
} /* 第46天：结束回归评估快照读取接口。 */

export async function POST() { /* 第46天：定义重新运行基线与候选评估的接口。 */
  try { /* 第46天：捕获强制重新运行异常。 */
    return apiJsonSuccess(await getRegressionDashboardSnapshot(true), "regression evaluation rerun completed"); /* 第46天：强制执行同一数据集并返回新快照。 */
  } catch (error) { /* 第46天：处理强制运行失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "重新运行回归评估失败"); /* 第46天：返回统一内部错误响应。 */
  } /* 第46天：结束重新运行异常处理。 */
} /* 第46天：结束回归评估重新运行接口。 */

