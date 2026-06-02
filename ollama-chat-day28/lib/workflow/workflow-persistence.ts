/**
 * 第19–22天：Workflow 持久化辅助（build/summary/恢复）；读写经 WorkflowStore。
 * 第22天：backend 模式保存前不再 GET，createdAt 由服务端 upsert 响应带回。
 * 每行带中文行尾注释。
 */

import type {
  Memory,
  Workflow,
  WorkflowState,
  WorkflowStateListItem,
  WorkflowPersistedStatus,
  WorkflowStep,
  WorkflowTimelineEvent,
} from "@/lib/workflow/workflow-types"; // 类型
import type {
  WorkflowSaveMeta,
  WorkflowStorageMode,
  WorkflowStore,
} from "@/lib/workflow/workflow-store"; // 存储接口与模式
import { WORKFLOW_STATE_VERSION } from "@/lib/workflow/workflow-persistence-constants"; // 版本

export {
  WORKFLOW_STATE_VERSION,
  WORKFLOW_STATE_EXPIRE_MS,
  WORKFLOW_KEY_PREFIX,
  WORKFLOW_INDEX_KEY,
  WORKFLOW_STORAGE_MODE_KEY,
} from "@/lib/workflow/workflow-persistence-constants"; // 再导出常量供页面使用

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
    finalSummary: state.finalSummary ?? "（已从存储恢复工作流状态）", // 默认文案
    paused: state.paused ?? state.status === "paused", // 暂停标记
    waitingStepId: state.waitingStepId, // 待确认 id
    memory, // memory
  }; // 返回
} // workflowStateToBubbleFields 结束

/** 将 WorkflowState[] 转为侧栏摘要列表（任务 4）。 */
export function statesToSummaries(states: WorkflowState[]): WorkflowStateListItem[] {
  const items: WorkflowStateListItem[] = []; // 结果
  for (const state of states) {
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
    }); // push
  } // for
  items.sort((a, b) => b.updatedAt - a.updatedAt); // 降序
  return items; // 返回
} // statesToSummaries 结束

/** 第20天：经 Store 列出历史摘要（不再直接读 localStorage）。 */
export async function listWorkflowStateSummaries(
  store: WorkflowStore // 可插拔存储
): Promise<WorkflowStateListItem[]> {
  const states = await store.list(); // 全量列表
  return statesToSummaries(states); // 转摘要
} // listWorkflowStateSummaries 结束

/** 第20–22天：经 Store 保存完整 WorkflowState；backend 可能返回 WorkflowSaveMeta。 */
export async function saveWorkflowState(
  store: WorkflowStore, // 存储实现
  state: WorkflowState // 快照
): Promise<WorkflowSaveMeta | void> {
  if (state.version !== WORKFLOW_STATE_VERSION) return; // 版本不匹配拒绝
  state.updatedAt = Date.now(); // 刷新时间
  return store.save(state); // 委托 Store；第22天 backend 带回 createdAt
} // saveWorkflowState 结束

/** 第20天：经 Store 按 id 加载。 */
export async function loadWorkflowState(
  store: WorkflowStore, // 存储
  workflowId: string // id
): Promise<WorkflowState | null> {
  return store.get(workflowId); // 委托 get
} // loadWorkflowState 结束

/** 第20天：经 Store 清理过期记录。 */
export async function purgeExpiredWorkflowStates(store: WorkflowStore): Promise<number> {
  return store.purgeExpired(); // 委托 purge
} // purgeExpiredWorkflowStates 结束

/** 第20–22天：从 API 响应经 Store 持久化（backend 省略保存前 GET）。 */
export async function persistWorkflowFromApi(
  store: WorkflowStore, // 存储
  args: {
    workflow: Workflow; // 工作流
    memory: Memory; // 记忆
    paused?: boolean; // 暂停
    waitingStepId?: string; // 待确认
    finalSummary?: string; // 摘要
    workflowCreatedAt?: number; // 第22天可选：Chat 下发的 createdAt
  },
  options?: { storageMode?: WorkflowStorageMode } // 第22天：区分 local / backend
): Promise<WorkflowState> {
  let existingCreatedAt = args.workflowCreatedAt; // 优先 API 附带时间
  if (options?.storageMode !== "backend") {
    const prev = await store.get(args.workflow.id); // local：仍先读以保留 createdAt
    existingCreatedAt = prev?.createdAt ?? existingCreatedAt; // 合并旧 createdAt
  } // backend：不发起 GET，createdAt 由 POST upsert 响应纠正
  const state = buildWorkflowState({
    workflow: args.workflow, // workflow
    memory: args.memory, // memory
    paused: args.paused, // paused
    waitingStepId: args.waitingStepId, // waiting
    finalSummary: args.finalSummary, // summary
    timeline: args.workflow.executionTimeline, // timeline
    existingCreatedAt, // 首次可能为 now；二次保存由 DB 保留
  }); // build
  const meta = await saveWorkflowState(store, state); // 写入 Store
  if (meta?.createdAt) {
    state.createdAt = meta.createdAt; // 第22天：用服务端权威 createdAt 更新内存快照
  } // meta 分支
  return state; // 返回（侧栏 refresh 会 list 到正确时间）
} // persistWorkflowFromApi 结束

/** 从已 list 的全量状态中筛出可恢复的 paused（与侧栏摘要同源，避免重复请求）。 */
export function pausedStatesFromList(allStates: WorkflowState[]): WorkflowState[] {
  return allStates
    .filter((s) => s.status === "paused")
    .sort((a, b) => b.updatedAt - a.updatedAt); // 与 statesToSummaries 一致：最近优先
} // pausedStatesFromList 结束

/** 第20天：加载所有可恢复的 paused 状态（任务 5）。传入 allStates 时不再 list/get。 */
export async function loadResumablePausedStates(
  store: WorkflowStore,
  allStates?: WorkflowState[]
): Promise<WorkflowState[]> {
  if (allStates) return pausedStatesFromList(allStates); // 复用单次 list 结果
  const summaries = await listWorkflowStateSummaries(store); // 摘要
  const paused = summaries.filter((s) => s.status === "paused"); // 仅 paused
  const states: WorkflowState[] = []; // 完整列表
  for (const s of paused) {
    const full = await store.get(s.workflowId); // 加载完整
    if (full) states.push(full); // 非 null 入列
  } // for
  return states.sort((a, b) => b.updatedAt - a.updatedAt); // 与 pausedStatesFromList 排序一致
} // loadResumablePausedStates 结束

/** 读取用户上次选择的 Storage Mode（仅浏览器 meta）。 */
export function loadStorageModePreference(): "local" | "backend" {
  if (typeof window === "undefined") return "local"; // SSR 默认 local
  const raw = window.localStorage.getItem("workflow:storageMode"); // 偏好键
  return raw === "backend" ? "backend" : "local"; // 归一化
} // loadStorageModePreference 结束

/** 保存 Storage Mode 偏好。 */
export function saveStorageModePreference(mode: "local" | "backend"): void {
  if (typeof window === "undefined") return; // SSR 跳过
  window.localStorage.setItem("workflow:storageMode", mode); // 写入偏好
} // saveStorageModePreference 结束

