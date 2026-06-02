/**
 * 第20–22天：WorkflowStore 存储接口与工厂（backend 模式走 MySQL API）。
 * 每行带中文行尾注释。
 */

import type { WorkflowState } from "@/lib/workflow/workflow-types"; // 持久化快照类型
import { BackendWorkflowStore } from "@/lib/workflow/backend-workflow-store"; // 后端 MySQL API 实现
import { LocalWorkflowStore } from "@/lib/workflow/local-workflow-store"; // 浏览器 localStorage 实现

/** 第20天：可切换的存储模式（local = 浏览器；backend = 服务端 MySQL API）。 */
export type WorkflowStorageMode = "local" | "backend"; // 联合字面量

/** 第22天：backend POST 保存后服务端回传的元数据（createdAt 以库为准）。 */
export type WorkflowSaveMeta = {
  created: boolean; // true=本次 INSERT；false=ON DUPLICATE KEY UPDATE
  createdAt: number; // 毫秒时间戳，与 MySQL created_at 一致
}; // WorkflowSaveMeta 结束

/** 第20天：存储层统一接口（任务 1）；第22天 save 在 backend 可返回 WorkflowSaveMeta。 */
export type WorkflowStore = {
  save(workflow: WorkflowState): Promise<WorkflowSaveMeta | void>; // 写入；backend 返回元数据
  get(workflowId: string): Promise<WorkflowState | null>; // 按 id 读取；不存在返回 null
  list(): Promise<WorkflowState[]>; // 列出全部，由实现方决定排序
  delete(workflowId: string): Promise<void>; // 删除单条
  purgeExpired(): Promise<number>; // 清理过期项，返回删除条数
}; // WorkflowStore 接口结束

/**
 * 第20天：根据模式创建 Store 实例（任务 6）。
 * Runtime / 页面只依赖此工厂，不直接 new localStorage。
 */
export function createWorkflowStore(mode: WorkflowStorageMode): WorkflowStore {
  if (mode === "backend") {
    return new BackendWorkflowStore(); // 走 /api/workflows → MySQL
  } // backend 分支结束
  return new LocalWorkflowStore(); // 默认 localStorage
} // createWorkflowStore 结束

