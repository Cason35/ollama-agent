/**

 * 第21天：单条 Workflow API — GET / DELETE（MySQL 持久化）。

 * 每行带中文行尾注释。

 */



import {

  API_REASON,

  apiJsonGetMiss,

  apiJsonReasonError,

  apiJsonSuccess,

} from "@/lib/api/api-envelope"; // 统一响应包

import { dbDeleteWorkflow, dbGetWorkflow } from "@/lib/workflow/workflow-db"; // MySQL 委托层



type RouteContext = { params: Promise<{ id: string }> }; // Next 16 动态路由 params 为 Promise



/** GET /api/workflows/:id — 读取单条。 */

export async function GET(_request: Request, context: RouteContext) {

  const { id } = await context.params; // 解析 workflowId

  try {

    const state = await dbGetWorkflow(id); // MySQL 查找

    if (!state) {

      return apiJsonGetMiss(); // 200 + data null + msg not found

    } // 无记录

    return apiJsonSuccess(state, API_REASON.GET_HIT.msg); // 200 + WorkflowState

  } catch (err) {

    const message = err instanceof Error ? err.message : API_REASON.DB_QUERY_FAILED.msg; // 错误文案

    return apiJsonReasonError(API_REASON.DB_QUERY_FAILED, message); // 500

  } // catch

} // GET 结束



/** DELETE /api/workflows/:id — 删除单条（不存在也 200 幂等）。 */

export async function DELETE(_request: Request, context: RouteContext) {

  const { id } = await context.params; // 解析 id

  try {

    const existed = await dbDeleteWorkflow(id); // MySQL 删除

    if (!existed) {

      return apiJsonSuccess(

        { workflowId: id, deleted: false },

        API_REASON.DELETE_MISS.msg

      ); // 200 幂等：未删到

    } // 无记录

    return apiJsonSuccess(

      { workflowId: id, deleted: true },

      API_REASON.SUCCESS.msg

    ); // 成功

  } catch (err) {

    const message = err instanceof Error ? err.message : API_REASON.DB_DELETE_FAILED.msg; // 错误文案

    return apiJsonReasonError(API_REASON.DB_DELETE_FAILED, message); // 500

  } // catch

} // DELETE 结束




