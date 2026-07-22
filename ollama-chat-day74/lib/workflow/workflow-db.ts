/**
 * 第21–22天：服务端 Workflow 数据访问层 — 委托 MySQLWorkflowStore。
 * 第22天：dbSaveWorkflow 返回 created / createdAt 供 POST 响应。
 * 每行带中文行尾注释；仅用于 API Route，不可在客户端 import。
 */

import {
  mysqlWorkflowStore,
  type MySQLWorkflowSaveResult,
} from "@/lib/workflow/mysql-workflow-store"; // MySQL 实现与 save 结果类型
import type { WorkflowState } from "@/lib/workflow/workflow-types"; // 快照类型
import {
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow/workflow-persistence-constants"; // 版本常量

/** 第22天：写入或覆盖一条 WorkflowState，返回 upsert 元数据。 */
export async function dbSaveWorkflow(
  state: WorkflowState
): Promise<MySQLWorkflowSaveResult> {
  if (state.version !== WORKFLOW_STATE_VERSION) {
    const now = Date.now(); // 版本不对时的兜底
    return { created: false, createdAt: state.createdAt ?? now }; // 与 save 早退语义一致
  } // 版本校验
  state.updatedAt = Date.now(); // 刷新客户端 updatedAt（DB updated_at 由 ON UPDATE 维护）
  return mysqlWorkflowStore.save(state); // 委托 MySQL；created_at 仅 INSERT 写入
} // dbSaveWorkflow 结束

/** 按 id 读取；不存在返回 undefined。 */
export async function dbGetWorkflow(
  workflowId: string
): Promise<WorkflowState | undefined> {
  const row = await mysqlWorkflowStore.get(workflowId); // SELECT 单条
  return row ?? undefined; // null → undefined 与 day20 API 一致
} // dbGetWorkflow 结束

/** 列出全部并按 updatedAt 降序（与 MySQL ORDER BY updated_at DESC 一致）。 */
export async function dbListWorkflows(): Promise<WorkflowState[]> {
  return mysqlWorkflowStore.list(); // SELECT 全表
} // dbListWorkflows 结束

/** 删除单条，返回是否曾存在。 */
export async function dbDeleteWorkflow(workflowId: string): Promise<boolean> {
  return mysqlWorkflowStore.delete(workflowId); // DELETE
} // dbDeleteWorkflow 结束

/** 清理超过 7 天未更新的记录，返回删除条数。 */
export async function dbPurgeExpiredWorkflows(): Promise<number> {
  return mysqlWorkflowStore.purgeExpired(); // SQL DATE_SUB 7 DAY
} // dbPurgeExpiredWorkflows 结束

