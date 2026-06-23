/**
 * 第18天：服务端暂存「因 HITL 暂停」的工作流上下文，供 POST /api/workflow/confirm 恢复执行。
 * 每行带中文行尾注释；进程内 Map（开发/demo 足够，生产应换 Redis 等持久化）。
 */

import type { Memory } from "@/lib/workflow/workflow-types"; // 记忆结构类型（与 chat route 共享）

/** 暂停时需保留的执行续跑上下文（不含密钥，confirm 请求会重建 ModelRuntime）。 */
export type PausedWorkflowContext = {
  workflow: import("@/lib/workflow/workflow-types").Workflow; // 含 waiting_confirmation 步骤的完整工作流快照
  memory: Memory; // 本轮对话记忆：续跑时注入工具链
  timeline: import("@/lib/workflow/workflow-types").WorkflowTimelineEvent[]; // 与 executionTimeline 共享引用，便于追加 HITL 事件
  defaultStepRetries: number; // 全局默认步骤重试次数，与首次 execute 一致
}; // PausedWorkflowContext 结束

/** Next 会把不同 route 打成独立 chunk，模块级 Map 会各有一份；挂 globalThis 保证读写同一表。 */
const PAUSE_STORE_KEY = "__ollamaWorkflowPauseStore" as const; // globalThis 上的键名

type PauseStoreHost = typeof globalThis & {
  [PAUSE_STORE_KEY]?: Map<string, PausedWorkflowContext>; // 可选：首次访问时创建
}; // PauseStoreHost 结束

function getPausedMap(): Map<string, PausedWorkflowContext> {
  const host = globalThis as PauseStoreHost; // 进程内单例宿主
  if (!host[PAUSE_STORE_KEY]) host[PAUSE_STORE_KEY] = new Map(); // 懒初始化共享 Map
  return host[PAUSE_STORE_KEY]!; // 非空：上一行已赋值
} // getPausedMap 结束

/** 写入暂停上下文（覆盖同 id 旧值）。 */
export function savePausedWorkflow(ctx: PausedWorkflowContext): void {
  getPausedMap().set(ctx.workflow.id, ctx); // 以 workflow.id 为键保存可续跑状态
} // savePausedWorkflow 结束

/** 读取暂停上下文；不存在返回 undefined。 */
export function loadPausedWorkflow(workflowId: string): PausedWorkflowContext | undefined {
  return getPausedMap().get(workflowId); // O(1) 查找
} // loadPausedWorkflow 结束

/** 确认或取消完成后删除，避免重复提交。 */
export function deletePausedWorkflow(workflowId: string): void {
  getPausedMap().delete(workflowId); // 释放内存条目
} // deletePausedWorkflow 结束

