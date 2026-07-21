import { randomUUID } from "node:crypto"; // 第70天：引入 UUID 生成器创建检查点与事件唯一标识。
import type { WorkflowCheckpoint, WorkflowDefinitionV2, WorkflowExecutionV2, WorkflowLifecycleEvent, WorkflowLifecycleEventType, WorkflowStateV2 } from "@/lib/workflow/durable-workflow-types"; // 第70天：引入版本定义、执行、状态、检查点与事件类型。
function clone<T>(value: T): T { return structuredClone(value); } // 第70天：统一使用结构化复制隔离存储内部可变状态。
function definitionKey(id: string, version: number): string { return `${id}@${version}`; } // 第70天：生成允许同一工作流多个版本并存的稳定存储键。
function assertDefinition(definition: WorkflowDefinitionV2): void { // 第70天：定义工作流版本写入前的完整性校验。
  if (!definition.id.trim() || !definition.name.trim()) throw new Error("Workflow Definition 的 id 与 name 不能为空"); // 第70天：阻止缺少稳定标识或展示名称的定义写入。
  if (!Number.isInteger(definition.version) || definition.version <= 0) throw new Error("Workflow Version 必须是正整数"); // 第70天：阻止非法版本破坏历史版本排序。
  if (definition.steps.length === 0) throw new Error("Workflow Definition 至少需要一个步骤"); // 第70天：阻止无法执行的空工作流定义写入。
  const ids = new Set(definition.steps.map((step) => step.id)); // 第70天：收集步骤标识用于重复与依赖校验。
  if (ids.size !== definition.steps.length || definition.steps.some((step) => !step.id.trim() || !step.name.trim() || !step.handler.trim())) throw new Error("Workflow Step 的 id、name、handler 必须完整且 id 不能重复"); // 第70天：保证每个步骤都可被持久化执行器稳定定位。
  for (const step of definition.steps) for (const dependency of step.dependsOn ?? []) if (!ids.has(dependency) || dependency === step.id) throw new Error(`步骤 ${step.id} 存在非法依赖 ${dependency}`); // 第70天：阻止不存在依赖与自依赖进入定义仓储。
  const visiting = new Set<string>(); // 第70天：创建深度优先搜索访问中集合用于检测循环依赖。
  const visited = new Set<string>(); // 第70天：创建深度优先搜索已完成集合避免重复遍历。
  const byId = new Map(definition.steps.map((step) => [step.id, step])); // 第70天：建立步骤标识到定义的快速查找表。
  const visit = (stepId: string): void => { if (visiting.has(stepId)) throw new Error(`Workflow Definition 存在循环依赖：${stepId}`); if (visited.has(stepId)) return; visiting.add(stepId); for (const dependency of byId.get(stepId)?.dependsOn ?? []) visit(dependency); visiting.delete(stepId); visited.add(stepId); }; // 第70天：递归检测 DAG 循环并在发现环时拒绝保存。
  for (const step of definition.steps) visit(step.id); // 第70天：从每个步骤出发完成全部依赖图校验。
} // 第70天：结束工作流定义完整性校验函数。
export class WorkflowDefinitionStoreV2 { // 第70天：实现支持不可变多版本并存的工作流定义仓储。
  private readonly definitions = new Map<string, WorkflowDefinitionV2>(); // 第70天：按工作流标识与版本组合键保存定义快照。
  register(definition: WorkflowDefinitionV2): WorkflowDefinitionV2 { // 第70天：注册一个新工作流版本且禁止覆盖历史版本。
    assertDefinition(definition); // 第70天：保存前验证版本、步骤和 DAG 依赖合法性。
    const key = definitionKey(definition.id, definition.version); // 第70天：生成当前定义的跨版本唯一键。
    if (this.definitions.has(key)) throw new Error(`Workflow Definition 已存在且不可覆盖：${key}`); // 第70天：通过不可覆盖规则保证旧执行可长期审计。
    const snapshot = clone(definition); // 第70天：复制定义避免调用方后续修改冻结版本。
    this.definitions.set(key, snapshot); // 第70天：把冻结版本写入内存定义仓储。
    return clone(snapshot); // 第70天：返回防御性副本供调用方展示或执行。
  } // 第70天：结束工作流版本注册方法。
  get(id: string, version: number): WorkflowDefinitionV2 | undefined { const definition = this.definitions.get(definitionKey(id, version)); return definition ? clone(definition) : undefined; } // 第70天：按稳定标识与版本读取冻结定义副本。
  list(id?: string): WorkflowDefinitionV2[] { return [...this.definitions.values()].filter((definition) => !id || definition.id === id).map(clone).sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version); } // 第70天：列出全部或指定工作流的版本目录并稳定排序。
} // 第70天：结束工作流定义仓储第二版实现。
export class WorkflowStateStoreV2 { // 第70天：实现执行实例与完整状态快照的持久化存储第二版。
  private readonly executions = new Map<string, WorkflowExecutionV2>(); // 第70天：按执行标识保存执行生命周期记录。
  private readonly states = new Map<string, WorkflowStateV2>(); // 第70天：按执行标识保存步骤状态、输出与检查点快照。
  create(execution: WorkflowExecutionV2): WorkflowStateV2 { // 第70天：原子创建执行记录与初始空状态。
    if (this.executions.has(execution.id)) throw new Error(`Workflow Execution 已存在：${execution.id}`); // 第70天：阻止重复执行标识覆盖历史实例。
    const now = Date.now(); // 第70天：获取初始状态统一更新时间戳。
    const state: WorkflowStateV2 = { executionId: execution.id, currentSteps: [], completedSteps: [], failedSteps: [], outputs: {}, checkpoints: [], version: 1, updatedAt: now }; // 第70天：创建任务清单要求的完整状态第二版初始值。
    this.executions.set(execution.id, clone(execution)); // 第70天：保存执行实例防御性副本。
    this.states.set(execution.id, state); // 第70天：保存与执行实例一一对应的初始状态。
    return clone(state); // 第70天：返回初始状态副本供执行器继续处理。
  } // 第70天：结束执行实例与状态创建方法。
  getExecution(executionId: string): WorkflowExecutionV2 | undefined { const execution = this.executions.get(executionId); return execution ? clone(execution) : undefined; } // 第70天：读取指定执行实例的防御性副本。
  saveExecution(execution: WorkflowExecutionV2): WorkflowExecutionV2 { if (!this.executions.has(execution.id)) throw new Error(`Workflow Execution 不存在：${execution.id}`); const snapshot = clone(execution); this.executions.set(execution.id, snapshot); return clone(snapshot); } // 第70天：持久化执行实例最新生命周期状态并返回副本。
  getState(executionId: string): WorkflowStateV2 | undefined { const state = this.states.get(executionId); return state ? clone(state) : undefined; } // 第70天：读取指定执行的完整状态快照副本。
  saveState(state: WorkflowStateV2): WorkflowStateV2 { if (!this.states.has(state.executionId)) throw new Error(`Workflow State 不存在：${state.executionId}`); const snapshot = clone({ ...state, version: state.version + 1, updatedAt: Date.now() }); this.states.set(state.executionId, snapshot); return clone(snapshot); } // 第70天：递增状态版本并持久化当前步骤、输出和检查点。
  listExecutions(): WorkflowExecutionV2[] { return [...this.executions.values()].map(clone).sort((left, right) => right.startedAt - left.startedAt); } // 第70天：按最近启动时间列出全部执行实例。
  listStates(): WorkflowStateV2[] { return [...this.states.values()].map(clone).sort((left, right) => right.updatedAt - left.updatedAt); } // 第70天：按最近更新时间列出全部执行状态。
} // 第70天：结束工作流状态存储第二版实现。
export class CheckpointStore { // 第70天：实现与执行状态分离且可注册发现的检查点存储。
  private readonly checkpoints = new Map<string, WorkflowCheckpoint[]>(); // 第70天：按执行标识保存有序检查点列表。
  append(checkpoint: Omit<WorkflowCheckpoint, "id">): WorkflowCheckpoint { const saved = clone({ ...checkpoint, id: `checkpoint_${randomUUID()}` }); const items = this.checkpoints.get(checkpoint.executionId) ?? []; items.push(saved); this.checkpoints.set(checkpoint.executionId, items); return clone(saved); } // 第70天：创建唯一检查点并按发生顺序追加到执行历史。
  list(executionId?: string): WorkflowCheckpoint[] { const items = executionId ? this.checkpoints.get(executionId) ?? [] : [...this.checkpoints.values()].flat(); return items.map(clone).sort((left, right) => left.timestamp - right.timestamp); } // 第70天：列出指定执行或全平台检查点防御性副本。
  latestCompleted(executionId: string): WorkflowCheckpoint | undefined { return this.list(executionId).filter((checkpoint) => checkpoint.status === "completed").at(-1); } // 第70天：读取最近成功检查点作为故障恢复位置。
} // 第70天：结束检查点存储实现。
export class WorkflowEventStore { // 第70天：实现工作流生命周期事件溯源存储。
  private readonly events = new Map<string, WorkflowLifecycleEvent[]>(); // 第70天：按执行标识保存严格有序事件流。
  append(input: Omit<WorkflowLifecycleEvent, "id" | "sequence">): WorkflowLifecycleEvent { const items = this.events.get(input.executionId) ?? []; const event = clone({ ...input, id: `workflow_event_${randomUUID()}`, sequence: items.length + 1 }); items.push(event); this.events.set(input.executionId, items); return clone(event); } // 第70天：创建递增序号事件并追加到所属执行时间线。
  list(executionId?: string): WorkflowLifecycleEvent[] { const items = executionId ? this.events.get(executionId) ?? [] : [...this.events.values()].flat(); return items.map(clone).sort((left, right) => left.timestamp - right.timestamp || left.sequence - right.sequence); } // 第70天：列出指定执行或跨执行完整事件历史。
  reconstructStatus(executionId: string): WorkflowExecutionV2["status"] { const events = this.list(executionId); let status: WorkflowExecutionV2["status"] = "created"; for (const event of events) { const mapping: Partial<Record<WorkflowLifecycleEventType, WorkflowExecutionV2["status"]>> = { "workflow.created": "created", "workflow.started": "running", "workflow.paused": event.payload.reason === "hitl" ? "waiting" : "paused", "workflow.resumed": "running", "workflow.completed": "completed", "workflow.cancelled": "cancelled", "workflow.step_failed": "failed" }; status = mapping[event.type] ?? status; } return status; } // 第70天：仅依赖事件流重建执行最终状态以验证 Event Sourcing。
} // 第70天：结束工作流事件溯源存储实现。
