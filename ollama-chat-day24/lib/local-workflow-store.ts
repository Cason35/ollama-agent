/**
 * 第20天：LocalWorkflowStore — 将第19天 localStorage 逻辑封装为 WorkflowStore（任务 2）。
 * 每行带中文行尾注释。
 */

import type { WorkflowState } from "@/lib/workflow-types"; // 快照类型
import type { WorkflowStore } from "@/lib/workflow-store"; // 存储接口
import {
  WORKFLOW_INDEX_KEY,
  WORKFLOW_KEY_PREFIX,
  WORKFLOW_STATE_EXPIRE_MS,
  WORKFLOW_STATE_VERSION,
} from "@/lib/workflow-persistence-constants"; // 常量

/** 是否运行在浏览器（SSR 时 localStorage 不可用）。 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"; // 客户端判定
} // isBrowser 结束

/** 生成 localStorage 键名。 */
function storageKey(workflowId: string): string {
  return `${WORKFLOW_KEY_PREFIX}${workflowId}`; // 例如 workflow:uuid
} // storageKey 结束

/** 读取索引中的 workflowId 列表。 */
function readIndex(): string[] {
  if (!isBrowser()) return []; // SSR 返回空
  const raw = window.localStorage.getItem(WORKFLOW_INDEX_KEY); // 读索引
  if (!raw) return []; // 无索引
  try {
    const parsed = JSON.parse(raw) as unknown; // 解析 JSON
    if (!Array.isArray(parsed)) return []; // 非法则空
    return parsed.filter((x): x is string => typeof x === "string"); // 仅保留字符串 id
  } catch {
    return []; // 解析失败
  } // try/catch
} // readIndex 结束

/** 写入索引。 */
function writeIndex(ids: string[]): void {
  if (!isBrowser()) return; // SSR 跳过
  window.localStorage.setItem(WORKFLOW_INDEX_KEY, JSON.stringify(ids)); // 序列化索引
} // writeIndex 结束

/** 第20天：浏览器端 WorkflowStore 实现。 */
export class LocalWorkflowStore implements WorkflowStore {
  /** 保存快照并维护索引（任务 2 + debug 任务 7）。 */
  async save(workflow: WorkflowState): Promise<void> {
    if (!isBrowser()) return; // 仅浏览器
    if (workflow.version !== WORKFLOW_STATE_VERSION) return; // 版本不匹配拒绝写入
    workflow.updatedAt = Date.now(); // 刷新更新时间
    console.log("[WorkflowStore] save", workflow.workflowId); // 第20天 debug 日志
    window.localStorage.setItem(storageKey(workflow.workflowId), JSON.stringify(workflow)); // 写入单条
    const ids = readIndex(); // 读索引
    if (!ids.includes(workflow.workflowId)) {
      ids.push(workflow.workflowId); // 新 id 入索引
      writeIndex(ids); // 写回索引
    } // 新 id 分支
  } // save 结束

  /** 按 id 加载；不存在或版本不对返回 null。 */
  async get(workflowId: string): Promise<WorkflowState | null> {
    if (!isBrowser()) return null; // SSR
    console.log("[WorkflowStore] get", workflowId); // debug
    const raw = window.localStorage.getItem(storageKey(workflowId)); // 读单条
    if (!raw) return null; // 不存在
    try {
      const parsed = JSON.parse(raw) as WorkflowState; // 反序列化
      if (parsed.version !== WORKFLOW_STATE_VERSION) return null; // 版本校验失败
      return parsed; // 成功
    } catch {
      return null; // JSON 损坏
    } // try/catch
  } // get 结束

  /** 列出全部快照，按 updatedAt 降序（任务 2 list）。 */
  async list(): Promise<WorkflowState[]> {
    if (!isBrowser()) return []; // SSR
    console.log("[WorkflowStore] list"); // debug
    const items: WorkflowState[] = []; // 结果数组
    for (const id of readIndex()) {
      const state = await this.get(id); // 复用 get 做版本校验
      if (state) items.push(state); // 跳过 null
    } // for 结束
    items.sort((a, b) => b.updatedAt - a.updatedAt); // 最近更新在前
    return items; // 返回
  } // list 结束

  /** 删除单条并更新索引。 */
  async delete(workflowId: string): Promise<void> {
    if (!isBrowser()) return; // SSR
    console.log("[WorkflowStore] delete", workflowId); // debug
    window.localStorage.removeItem(storageKey(workflowId)); // 删单条
    writeIndex(readIndex().filter((id) => id !== workflowId)); // 从索引移除
  } // delete 结束

  /** 清理超过 7 天的记录（任务 8）。 */
  async purgeExpired(): Promise<number> {
    if (!isBrowser()) return 0; // SSR
    const now = Date.now(); // 当前时间
    let removed = 0; // 计数
    const kept: string[] = []; // 保留的 id
    for (const id of readIndex()) {
      const state = await this.get(id); // 加载
      if (!state) {
        window.localStorage.removeItem(storageKey(id)); // 损坏项物理删除
        removed += 1; // 计数
        continue; // 不保留
      } // 损坏
      if (now - state.updatedAt > WORKFLOW_STATE_EXPIRE_MS) {
        await this.delete(state.workflowId); // 过期删除
        removed += 1; // 计数
      } else {
        kept.push(id); // 保留（delete 已更新索引，此处 kept 用于一致性；索引在 delete 内维护）
      } // 未过期
    } // for
    writeIndex(
      kept.filter((id) => {
        const s = window.localStorage.getItem(storageKey(id)); // 二次确认键仍存在
        return s !== null; // 存在则保留
      })
    ); // 写回索引兜底
    return removed; // 返回删除条数
  } // purgeExpired 结束
} // LocalWorkflowStore 结束
