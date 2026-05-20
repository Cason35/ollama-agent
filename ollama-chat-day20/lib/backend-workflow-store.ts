/**
 * 第20天：BackendWorkflowStore — 通过 /api/workflows 访问服务端内存 Map（任务 4）。
 * 每行带中文行尾注释。
 */

import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型
import type { WorkflowStore } from "@/lib/workflow-store"; // 存储接口

/** 第20天：调用后端 mock API 的 WorkflowStore 实现。 */
export class BackendWorkflowStore implements WorkflowStore {
  /** POST /api/workflows 保存快照。 */
  async save(workflow: WorkflowState): Promise<void> {
    console.log("[WorkflowStore] save", workflow.workflowId); // 第20天 debug（与 Local 一致前缀）
    const res = await fetch("/api/workflows", {
      method: "POST", // 创建或覆盖
      headers: { "Content-Type": "application/json" }, // JSON 请求头
      body: JSON.stringify(workflow), // 序列化 WorkflowState
    }); // fetch 结束
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }; // 尝试读错误体
      throw new Error(data.error || `保存 workflow 失败: ${res.status}`); // 抛给页面展示
    } // !res.ok
  } // save 结束

  /** GET /api/workflows/:id 读取单条。 */
  async get(workflowId: string): Promise<WorkflowState | null> {
    console.log("[WorkflowStore] get", workflowId); // debug
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`); // GET 单条
    if (res.status === 404) return null; // 不存在
    if (!res.ok) {
      throw new Error(`读取 workflow 失败: ${res.status}`); // 其它错误
    } // !res.ok
    return (await res.json()) as WorkflowState; // 解析 JSON
  } // get 结束

  /** GET /api/workflows 列出全部。 */
  async list(): Promise<WorkflowState[]> {
    console.log("[WorkflowStore] list"); // debug
    const res = await fetch("/api/workflows"); // GET 列表
    if (!res.ok) {
      throw new Error(`列出 workflow 失败: ${res.status}`); // 错误
    } // !res.ok
    const data = (await res.json()) as WorkflowState[]; // 数组
    return Array.isArray(data) ? data : []; // 防御非数组
  } // list 结束

  /** DELETE /api/workflows/:id 删除。 */
  async delete(workflowId: string): Promise<void> {
    console.log("[WorkflowStore] delete", workflowId); // debug
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE", // 删除动词
    }); // fetch
    if (!res.ok && res.status !== 404) {
      throw new Error(`删除 workflow 失败: ${res.status}`); // 404 视为幂等成功
    } // !res.ok
  } // delete 结束

  /** POST /api/workflows/purge 过期清理。 */
  async purgeExpired(): Promise<number> {
    const res = await fetch("/api/workflows/purge", { method: "POST" }); // 触发服务端清理
    if (!res.ok) {
      throw new Error(`清理过期 workflow 失败: ${res.status}`); // 错误
    } // !res.ok
    const data = (await res.json()) as { removed?: number }; // 读删除条数
    return typeof data.removed === "number" ? data.removed : 0; // 默认 0
  } // purgeExpired 结束
} // BackendWorkflowStore 结束
