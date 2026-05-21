/**
 * 第20–21天：BackendWorkflowStore — 通过 /api/workflows 访问服务端 MySQL（第21天替换 Map）。
 * 每行带中文行尾注释。
 */

import { assertApiOk, readApiData, readApiDataOrNull } from "@/lib/api-client"; // 解析统一响应包
import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型
import type { WorkflowStore } from "@/lib/workflow-store"; // 存储接口

/** 第20–21天：调用后端 MySQL API 的 WorkflowStore 实现。 */
export class BackendWorkflowStore implements WorkflowStore {
  /** POST /api/workflows 保存快照。 */
  async save(workflow: WorkflowState): Promise<void> {
    console.log("[WorkflowStore] save", workflow.workflowId); // 第20天 debug（与 Local 一致前缀）
    const res = await fetch("/api/workflows", {
      method: "POST", // 创建或覆盖
      headers: { "Content-Type": "application/json" }, // JSON 请求头
      body: JSON.stringify(workflow), // 序列化 WorkflowState
    }); // fetch 结束
    await assertApiOk(res); // 200 + ok true
  } // save 结束

  /** GET /api/workflows/:id 读取单条。 */
  async get(workflowId: string): Promise<WorkflowState | null> {
    console.log("[WorkflowStore] get", workflowId); // debug
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`); // GET 单条
    return readApiDataOrNull<WorkflowState>(res); // 无记录 → null
  } // get 结束

  /** GET /api/workflows 列出全部。 */
  async list(): Promise<WorkflowState[]> {
    console.log("[WorkflowStore] list"); // debug
    const res = await fetch("/api/workflows"); // GET 列表
    const data = await readApiData<WorkflowState[]>(res); // 空数组合法
    return Array.isArray(data) ? data : []; // 防御非数组
  } // list 结束

  /** DELETE /api/workflows/:id 删除。 */
  async delete(workflowId: string): Promise<void> {
    console.log("[WorkflowStore] delete", workflowId); // debug
    const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE", // 删除动词
    }); // fetch
    await assertApiOk(res); // 含「不存在」幂等 200
  } // delete 结束

  /** POST /api/workflows/purge 过期清理。 */
  async purgeExpired(): Promise<number> {
    const res = await fetch("/api/workflows/purge", { method: "POST" }); // 触发服务端清理
    const data = await readApiData<{ removed: number }>(res); // 读删除条数
    return typeof data.removed === "number" ? data.removed : 0; // 默认 0
  } // purgeExpired 结束
} // BackendWorkflowStore 结束
