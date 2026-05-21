/**
 * 第21天：过期清理 API — POST /api/workflows/purge（MySQL DATE_SUB 7 天）。
 * 每行带中文行尾注释。
 */

import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api-envelope"; // 统一响应包
import { dbPurgeExpiredWorkflows } from "@/lib/workflow-db"; // MySQL 清理

/** POST /api/workflows/purge — 删除超过 7 天未更新的记录。 */
export async function POST() {
  try {
    const removed = await dbPurgeExpiredWorkflows(); // SQL 执行清理
    return apiJsonSuccess({ removed }, API_REASON.SUCCESS.msg); // 200 + { removed }
  } catch (err) {
    const message = err instanceof Error ? err.message : API_REASON.DB_PURGE_FAILED.msg; // 错误文案
    return apiJsonReasonError(API_REASON.DB_PURGE_FAILED, message); // 500
  } // catch
} // POST 结束
