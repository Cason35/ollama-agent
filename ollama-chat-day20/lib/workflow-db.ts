/**
 * 第20天：服务端 Workflow 内存数据库（Map mock，任务 5）。
 * 每行带中文行尾注释；仅用于 API Route，不可在客户端 import。
 */

import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型
import {
  WORKFLOW_STATE_EXPIRE_MS,
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow-persistence-constants"; // 版本与过期常量

/** 进程内全局 Map，模拟数据库表（重启 dev server 会清空）。 */
const workflowDb = new Map<string, WorkflowState>(); // key = workflowId

/** 写入或覆盖一条 WorkflowState。 */
export function dbSaveWorkflow(state: WorkflowState): void {
  if (state.version !== WORKFLOW_STATE_VERSION) return; // 版本不对拒绝
  state.updatedAt = Date.now(); // 刷新时间戳
  workflowDb.set(state.workflowId, state); // Map 写入
} // dbSaveWorkflow 结束

/** 按 id 读取；不存在返回 undefined。 */
export function dbGetWorkflow(workflowId: string): WorkflowState | undefined {
  return workflowDb.get(workflowId); // Map 查找
} // dbGetWorkflow 结束

/** 列出全部并按 updatedAt 降序。 */
export function dbListWorkflows(): WorkflowState[] {
  const items = Array.from(workflowDb.values()); // 转数组
  items.sort((a, b) => b.updatedAt - a.updatedAt); // 最近在前
  return items; // 返回
} // dbListWorkflows 结束

/** 删除单条。 */
export function dbDeleteWorkflow(workflowId: string): boolean {
  return workflowDb.delete(workflowId); // 返回是否曾存在
} // dbDeleteWorkflow 结束

/** 清理超过 EXPIRE_MS 的记录，返回删除条数。 */
export function dbPurgeExpiredWorkflows(): number {
  const now = Date.now(); // 当前时间
  let removed = 0; // 计数
  for (const [id, state] of workflowDb.entries()) {
    if (now - state.updatedAt > WORKFLOW_STATE_EXPIRE_MS) {
      workflowDb.delete(id); // 过期删除
      removed += 1; // 计数
    } // 过期分支
  } // for
  return removed; // 返回条数
} // dbPurgeExpiredWorkflows 结束
