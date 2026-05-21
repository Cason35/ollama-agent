/**
 * 第21天：Workflow 列表与保存 API — GET list / POST save（MySQL 持久化）。
 * 每行带中文行尾注释。
 */

import {
  API_REASON,
  apiJsonReasonError,
  apiJsonSuccess,
} from "@/lib/api-envelope"; // 统一响应包
import {
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow-persistence-constants"; // 版本常量
import { dbListWorkflows, dbSaveWorkflow } from "@/lib/workflow-db"; // MySQL 委托层
import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型

/** GET /api/workflows — 返回全部 WorkflowState[]（空数组而非 null）。 */
export async function GET() {
  try {
    const list = await dbListWorkflows(); // 从 MySQL 读取
    return apiJsonSuccess(list, API_REASON.SUCCESS.msg); // 200 + data: []
  } catch (err) {
    const message = err instanceof Error ? err.message : API_REASON.DB_QUERY_FAILED.msg; // 错误文案
    return apiJsonReasonError(API_REASON.DB_QUERY_FAILED, message); // 500
  } // catch
} // GET 结束

/** POST /api/workflows — 保存或覆盖一条 WorkflowState。 */
export async function POST(request: Request) {
  let body: unknown; // 原始请求体
  try {
    body = await request.json(); // 解析 JSON
  } catch {
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID); // 400
  } // catch
  const state = body as WorkflowState; // 断言类型
  if (!state?.workflowId || typeof state.workflowId !== "string") {
    return apiJsonReasonError(API_REASON.WORKFLOW_ID_MISSING); // 校验 id
  } // 无 id
  if (state.version !== WORKFLOW_STATE_VERSION) {
    return apiJsonReasonError(API_REASON.WORKFLOW_VERSION_UNSUPPORTED); // 版本
  } // version
  try {
    await dbSaveWorkflow(state); // 写入 MySQL
    return apiJsonSuccess(
      { workflowId: state.workflowId },
      API_REASON.SUCCESS.msg
    ); // 成功
  } catch (err) {
    const message = err instanceof Error ? err.message : API_REASON.DB_SAVE_FAILED.msg; // 错误文案
    return apiJsonReasonError(API_REASON.DB_SAVE_FAILED, message); // 500
  } // catch
} // POST 结束
