/**
 * 第19天：Workflow 前端持久化（localStorage）。
 * 每行带中文行尾注释；浏览器端专用，服务端 route 通过 confirm 的 resumeContext 对齐。
 */

import type {
  Memory,
  MemoryItem,
  Workflow,
  WorkflowState,
  WorkflowStateListItem,
  WorkflowPersistedStatus,
  WorkflowStep,
  WorkflowTimelineEvent,
} from "@/lib/workflow-types"; // 持久化相关类型

/** 当前持久化 schema 版本（任务 7）。 */
export const WORKFLOW_STATE_VERSION = 1 as const; // 仅支持 version===1

/** 过期清理阈值：7 天（任务 8）。 */
export const WORKFLOW_STATE_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000; // 毫秒

/** 单条 workflow 存储键前缀。 */
const WORKFLOW_KEY_PREFIX = "workflow:" as const; // 完整键 workflow:{id}

/** 索引键：记录所有 workflowId 便于列表与清理。 */
const WORKFLOW_INDEX_KEY = "workflow:index" as const; // JSON 字符串数组

/** 是否运行在浏览器（SSR 时 localStorage 不可用）。 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"; // 客户端判定
} // isBrowser 结束

/** 生成 localStorage 键名。 */
function storageKey(workflowId: string): string {
  return `${WORKFLOW_KEY_PREFIX}${workflowId}`; // 例如 workflow:uuid
} // storageKey 结束

/** 从步骤列表提取已成功步骤的 output 字典（任务 1 stepOutputs）。 */
export function buildStepOutputsFromSteps(steps: WorkflowStep[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}; // 初始化空字典
  for (const s of steps) {
    if (s.status !== "success") continue; // 仅 success 写入，避免重复执行
    if (s.output !== undefined) out[s.id] = s.output; // 记录该步输出
  } // for 结束
  return out; // 返回快照
} // buildStepOutputsFromSteps 结束

/** 将 API 返回的 workflow 映射为持久化 status。 */
function derivePersistedStatus(
  workflow: Workflow, // 服务端工作流
  paused?: boolean // HITL 暂停标记
): WorkflowPersistedStatus {
  if (paused) return "paused"; // 暂停优先于 running
  if (workflow.status === "cancelled") return "cancelled"; // 用户取消
  if (workflow.status === "failed") return "failed"; // 失败
  if (workflow.status === "success") return "success"; // 成功
  if (workflow.status === "running") return "running"; // 仍在跑（少见持久化）
  return "pending"; // 默认 pending
} // derivePersistedStatus 结束

/** 从 Workflow + 上下文组装 WorkflowState（任务 1、3）。 */
export function buildWorkflowState(args: {
  workflow: Workflow; // 当前工作流
  memory: Memory; // 完整记忆
  paused?: boolean; // 是否 HITL 暂停
  waitingStepId?: string; // 待确认 id
  finalSummary?: string; // 卡片摘要
  timeline?: WorkflowTimelineEvent[]; // 时间线（缺省用 workflow.executionTimeline）
  existingCreatedAt?: number; // 续写时保留 createdAt
}): WorkflowState {
  const timeline = args.timeline ?? args.workflow.executionTimeline ?? []; // 合并 timeline 来源
  const now = Date.now(); // 当前时间戳
  return {
    version: WORKFLOW_STATE_VERSION, // 固定 version 1
    workflowId: args.workflow.id, // 主键
    status: derivePersistedStatus(args.workflow, args.paused), // 持久化状态
    goal: args.workflow.goal, // 目标
    steps: args.workflow.steps, // 全量步骤
    memorySnapshot: args.memory.items, // 长期记忆条目
    stepOutputs: buildStepOutputsFromSteps(args.workflow.steps), // 已成功输出
    timeline, // 时间线数组
    createdAt: args.existingCreatedAt ?? now, // 首次或沿用
    updatedAt: now, // 每次保存刷新
    finalSummary: args.finalSummary, // UI 文案
    paused: args.paused, // HITL
    waitingStepId: args.waitingStepId, // 待确认
    memory: args.memory, // 完整 memory 供 confirm
    executionBatches: args.workflow.executionBatches, // 批次可选
  }; // WorkflowState 对象
} // buildWorkflowState 结束

/** 将 WorkflowState 还原为页面 Workflow 气泡所需字段。 */
export function workflowStateToBubbleFields(state: WorkflowState): {
  workflow: Workflow; // 卡片 workflow
  finalSummary: string; // 摘要
  paused?: boolean; // 暂停
  waitingStepId?: string; // 待确认
  memory: Memory; // 记忆
} {
  const workflow: Workflow = {
    id: state.workflowId, // id
    goal: state.goal, // 目标
    steps: state.steps, // 步骤（含 success / waiting_confirmation）
    status:
      state.status === "paused"
        ? "running" // 后端 Workflow 无 paused：暂停时仍标 running
        : state.status === "cancelled"
          ? "cancelled"
          : state.status === "failed"
            ? "failed"
            : state.status === "success"
              ? "success"
              : "running", // pending/running 映射
    executionTimeline: state.timeline, // 恢复 timeline
    executionBatches: state.executionBatches, // 恢复批次
  }; // Workflow 组装
  const memory: Memory =
    state.memory ??
    ({
      shortTerm: [], // 刷新后 shortTerm 可空
      items: state.memorySnapshot ?? [], // 用快照兜底
    } as Memory); // Memory 兜底
  return {
    workflow, // workflow
    finalSummary: state.finalSummary ?? "（已从本地恢复工作流状态）", // 默认文案
    paused: state.paused ?? state.status === "paused", // 暂停标记
    waitingStepId: state.waitingStepId, // 待确认 id
    memory, // memory
  }; // 返回
} // workflowStateToBubbleFields 结束

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

/** 写入索引（按 updatedAt 排序在 list 时处理）。 */
function writeIndex(ids: string[]): void {
  if (!isBrowser()) return; // SSR 跳过
  window.localStorage.setItem(WORKFLOW_INDEX_KEY, JSON.stringify(ids)); // 序列化索引
} // writeIndex 结束

/** 保存完整 WorkflowState（任务 2、3）。 */
export function saveWorkflowState(state: WorkflowState): void {
  if (!isBrowser()) return; // 仅浏览器
  if (state.version !== WORKFLOW_STATE_VERSION) return; // 版本不匹配则拒绝写入
  state.updatedAt = Date.now(); // 刷新更新时间
  window.localStorage.setItem(storageKey(state.workflowId), JSON.stringify(state)); // 写入单条
  const ids = readIndex(); // 读索引
  if (!ids.includes(state.workflowId)) {
    ids.push(state.workflowId); // 新 id 入索引
    writeIndex(ids); // 写回索引
  } // 新 id 分支
} // saveWorkflowState 结束

/** 按 id 加载 WorkflowState；不存在或版本不对返回 null（任务 7）。 */
export function loadWorkflowState(workflowId: string): WorkflowState | null {
  if (!isBrowser()) return null; // SSR
  const raw = window.localStorage.getItem(storageKey(workflowId)); // 读单条
  if (!raw) return null; // 不存在
  try {
    const parsed = JSON.parse(raw) as WorkflowState; // 反序列化
    if (parsed.version !== WORKFLOW_STATE_VERSION) return null; // 版本校验失败
    return parsed; // 成功
  } catch {
    return null; // JSON 损坏
  } // try/catch
} // loadWorkflowState 结束

/** 列出历史摘要，按 updatedAt 降序（任务 4）。 */
export function listWorkflowStateSummaries(): WorkflowStateListItem[] {
  if (!isBrowser()) return []; // SSR
  const items: WorkflowStateListItem[] = []; // 结果数组
  for (const id of readIndex()) {
    const state = loadWorkflowState(id); // 加载每条
    if (!state) continue; // 跳过损坏项
    const waiting = state.paused
      ? state.steps.find(
          (s) =>
            s.status === "waiting_confirmation" ||
            s.id === state.waitingStepId
        )
      : undefined; // 找等待步
    items.push({
      workflowId: state.workflowId, // id
      goal: state.goal, // 目标
      status: state.status, // 状态
      updatedAt: state.updatedAt, // 时间
      waitingStepName: waiting?.name, // 等待步名称
    }); // push 摘要
  } // for
  items.sort((a, b) => b.updatedAt - a.updatedAt); // 最近更新在前
  return items; // 返回列表
} // listWorkflowStateSummaries 结束

/** 删除单条持久化记录。 */
export function deleteWorkflowState(workflowId: string): void {
  if (!isBrowser()) return; // SSR
  window.localStorage.removeItem(storageKey(workflowId)); // 删单条
  writeIndex(readIndex().filter((id) => id !== workflowId)); // 从索引移除
} // deleteWorkflowState 结束

/** 清理超过 EXPIRE_MS 的记录（任务 8）。 */
export function purgeExpiredWorkflowStates(): number {
  if (!isBrowser()) return 0; // SSR
  const now = Date.now(); // 当前时间
  let removed = 0; // 计数
  const kept: string[] = []; // 保留的 id
  for (const id of readIndex()) {
    const state = loadWorkflowState(id); // 加载
    if (!state) {
      removed += 1; // 损坏视为删除
      continue; // 不保留
    } // 损坏
    if (now - state.updatedAt > WORKFLOW_STATE_EXPIRE_MS) {
      window.localStorage.removeItem(storageKey(id)); // 过期删除
      removed += 1; // 计数
    } else {
      kept.push(id); // 保留
    } // 未过期
  } // for
  writeIndex(kept); // 写回索引
  return removed; // 返回删除条数
} // purgeExpiredWorkflowStates 结束

/** 便捷：从 API 响应直接持久化。 */
export function persistWorkflowFromApi(args: {
  workflow: Workflow; // 工作流
  memory: Memory; // 记忆
  paused?: boolean; // 暂停
  waitingStepId?: string; // 待确认
  finalSummary?: string; // 摘要
}): WorkflowState {
  const prev = loadWorkflowState(args.workflow.id); // 读取旧记录以保留 createdAt
  const state = buildWorkflowState({
    workflow: args.workflow, // workflow
    memory: args.memory, // memory
    paused: args.paused, // paused
    waitingStepId: args.waitingStepId, // waiting
    finalSummary: args.finalSummary, // summary
    timeline: args.workflow.executionTimeline, // timeline
    existingCreatedAt: prev?.createdAt, // createdAt
  }); // build
  saveWorkflowState(state); // 写入 localStorage
  return state; // 返回状态供调用方使用
} // persistWorkflowFromApi 结束

/** 加载所有可恢复的 paused 状态（任务 5）。 */
export function loadResumablePausedStates(): WorkflowState[] {
  return listWorkflowStateSummaries() // 先列摘要
    .filter((s) => s.status === "paused") // 仅 paused
    .map((s) => loadWorkflowState(s.workflowId)) // 加载完整
    .filter((x): x is WorkflowState => x !== null); // 过滤 null
} // loadResumablePausedStates 结束
