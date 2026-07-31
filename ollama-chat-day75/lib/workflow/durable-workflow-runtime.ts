import { randomUUID } from "node:crypto"; // 第70天：引入 UUID 生成器创建执行实例标识。
import { createRuntimeEvent } from "@/lib/events/event-factory"; // 第70天：引入统一事件工厂把工作流生命周期接入 EventBus。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第70天：引入内存事件总线保存可观察的工作流事件历史。
import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第70天：引入统一注册中心类型发现工作流能力。
import { runtimeContextBuilder, type RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第70天：引入统一运行时上下文并注入 workflowContext。
import { CheckpointStore, WorkflowDefinitionStoreV2, WorkflowEventStore, WorkflowStateStoreV2 } from "@/lib/workflow/durable-workflow-store"; // 第70天：引入定义、状态、检查点和事件溯源存储。
import type { DurableWorkflowPlatformSnapshot, DurableWorkflowStep, WorkflowDefinitionV2, WorkflowExecutionV2, WorkflowLifecycleEventType, WorkflowMetricsV2, WorkflowReplayResult, WorkflowStateV2 } from "@/lib/workflow/durable-workflow-types"; // 第70天：引入持久化执行器、回放、指标和平台快照类型。
export type WorkflowStepHandlerContext = { // 第70天：定义步骤处理器接收的稳定执行上下文。
  definition: WorkflowDefinitionV2; // 第70天：提供本次执行冻结的工作流定义版本。
  execution: WorkflowExecutionV2; // 第70天：提供当前执行实例快照。
  step: DurableWorkflowStep; // 第70天：提供当前正在执行的步骤定义。
  input: Record<string, unknown>; // 第70天：提供执行级输入与定义级输入组合结果。
  previousOutputs: Record<string, unknown>; // 第70天：提供已经检查点确认的历史步骤输出。
  runtimeContext: RuntimeContextV2; // 第70天：提供包含 workflowContext 的统一运行时上下文。
}; // 第70天：结束步骤处理器上下文结构定义。
export type WorkflowStepHandler = (context: WorkflowStepHandlerContext) => Promise<unknown> | unknown; // 第70天：定义同步或异步步骤处理器统一签名。
export type DurableExecutionOptions = { stopAfterStepId?: string }; // 第70天：定义测试服务重启时使用的可靠检查点中断选项。
const DAY70_CREATED_AT = Date.UTC(2026, 6, 17, 0, 0, 0); // 第70天：定义持久化工作流能力注册使用的稳定教学时间戳。
const DEFAULT_HANDLERS: Record<string, WorkflowStepHandler> = { // 第70天：定义无需外部模型即可稳定测试恢复与回放的默认处理器。
  research: ({ input }) => ({ query: String(input.query ?? "持久化工作流"), sources: ["运行手册", "事件时间线", "检查点快照"], conclusion: "已完成可恢复研究" }), // 第70天：模拟研究步骤并返回可审计资料来源。
  draft: ({ previousOutputs }) => ({ title: "Durable Workflow Draft", basedOn: Object.keys(previousOutputs), content: "根据已完成步骤输出生成可恢复草稿。" }), // 第70天：模拟草稿步骤并证明可以读取已持久化上游输出。
  critic: ({ previousOutputs }) => ({ score: 0.92, issues: [], reviewedSteps: Object.keys(previousOutputs), decision: "pass" }), // 第70天：模拟新增到第二版定义的批评审查智能体步骤。
  approval: ({ execution }) => ({ approved: true, executionId: execution.id, approver: "day70-human-reviewer" }), // 第70天：模拟用户确认后才会实际执行的 HITL 步骤。
  publish: ({ execution, previousOutputs }) => ({ published: true, executionId: execution.id, artifactCount: Object.keys(previousOutputs).length + 1 }), // 第70天：模拟最终发布并记录复用的历史输出数量。
  echo: ({ input }) => ({ ...input }), // 第70天：提供测试自定义工作流使用的确定性回显处理器。
}; // 第70天：结束默认步骤处理器集合定义。
export function registerDurableWorkflowCapabilities(registry: UnifiedRegistry): void { // 第70天：向 UnifiedRegistry 注册任务要求的四类核心持久化能力。
  registry.upsert({ id: "workflow:executor:durable-v1", name: "DurableWorkflowExecutor（持久化工作流执行器）", type: "workflow", version: "day70.v1", metadata: { description: "读取 Workflow State V2 与 Checkpoint，从最近可靠位置继续执行未完成步骤", capabilities: ["durable-execution", "resume", "retry", "hitl"], tags: ["workflow", "executor", "day70"] }, enabled: true, createdAt: DAY70_CREATED_AT }); // 第70天：注册持久化执行器能力。
  registry.upsert({ id: "workflow:store:checkpoint-v1", name: "CheckpointStore（检查点存储）", type: "workflow", version: "day70.v1", metadata: { description: "保存步骤结果、失败点、人工等待点与最近可靠恢复位置", capabilities: ["checkpoint", "recovery", "state-store-v2"], tags: ["workflow", "checkpoint", "day70"] }, enabled: true, createdAt: DAY70_CREATED_AT }); // 第70天：注册检查点存储能力。
  registry.upsert({ id: "workflow:engine:replay-v1", name: "WorkflowReplayEngine（工作流回放引擎）", type: "workflow", version: "day70.v1", metadata: { description: "基于事件时间线与历史步骤输出回放执行过程且不重复调用模型", capabilities: ["replay", "event-sourcing", "audit"], tags: ["workflow", "replay", "day70"] }, enabled: true, createdAt: DAY70_CREATED_AT }); // 第70天：注册回放引擎能力。
  registry.upsert({ id: "workflow:state-store:v2", name: "WorkflowStateStoreV2（工作流状态存储第2版）", type: "workflow", version: "day70.v1", metadata: { description: "持久化当前步骤、完成步骤、失败步骤、输出、检查点与状态版本", capabilities: ["workflow-state", "persistence", "recovery"], tags: ["workflow", "state-store", "day70"] }, enabled: true, createdAt: DAY70_CREATED_AT }); // 第70天：注册工作流状态存储第二版能力。
} // 第70天：结束持久化工作流核心能力注册函数。
export class DurableWorkflowRuntime { // 第70天：实现版本化、检查点化、可恢复、可回放的持久化工作流运行时。
  readonly definitions = new WorkflowDefinitionStoreV2(); // 第70天：创建支持多个不可覆盖版本并存的定义仓储。
  readonly states = new WorkflowStateStoreV2(); // 第70天：创建执行实例与状态存储第二版。
  readonly checkpoints = new CheckpointStore(); // 第70天：创建独立检查点存储作为可靠恢复来源。
  readonly eventStore = new WorkflowEventStore(); // 第70天：创建工作流生命周期事件溯源存储。
  readonly eventBus = new MemoryEventBus(600); // 第70天：创建容量足够覆盖演示与测试的统一事件总线。
  private readonly handlers = new Map<string, WorkflowStepHandler>(Object.entries(DEFAULT_HANDLERS)); // 第70天：保存可替换步骤处理器注册表。
  private readonly runtimeContexts = new Map<string, RuntimeContextV2>(); // 第70天：按执行标识保存带 workflowContext 的统一上下文。
  constructor(readonly registry: UnifiedRegistry) { registerDurableWorkflowCapabilities(registry); } // 第70天：构造运行时时立即接入 UnifiedRegistry 四类核心能力。
  registerHandler(name: string, handler: WorkflowStepHandler): void { if (!name.trim()) throw new Error("Workflow Step Handler 名称不能为空"); this.handlers.set(name, handler); } // 第70天：允许测试或业务注册确定性、模型或工具步骤处理器。
  registerDefinition(definition: WorkflowDefinitionV2): WorkflowDefinitionV2 { // 第70天：注册冻结工作流版本并同步到 UnifiedRegistry。
    const saved = this.definitions.register(definition); // 第70天：先通过定义仓储完成版本与 DAG 合法性校验。
    this.registry.upsert({ id: `workflow:definition:${saved.id}:v${saved.version}`, name: `${saved.name} V${saved.version}`, type: "workflow", version: String(saved.version), metadata: { description: saved.description ?? "版本化持久工作流定义", capabilities: saved.steps.map((step) => step.handler), tags: ["workflow-definition", saved.status, "day70"], workflowId: saved.id, owner: saved.owner, status: saved.status }, enabled: saved.status !== "deprecated", createdAt: saved.createdAt }); // 第70天：按版本唯一标识注册工作流定义以支持多个版本同时发现。
    return saved; // 第70天：返回已冻结的工作流定义副本。
  } // 第70天：结束工作流定义注册与统一发现方法。
  private context(executionId: string): RuntimeContextV2 { const context = this.runtimeContexts.get(executionId); if (!context) throw new Error(`RuntimeContext 不存在：${executionId}`); return context; } // 第70天：读取执行实例关联的统一运行时上下文。
  private async emit(execution: WorkflowExecutionV2, type: WorkflowLifecycleEventType, payload: Record<string, unknown>, stepId?: string): Promise<void> { // 第70天：同时写入事件溯源存储与统一 EventBus。
    const context = this.context(execution.id); // 第70天：读取本次事件共享的运行时上下文与 Trace。
    this.eventStore.append({ executionId: execution.id, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, type, stepId, payload: structuredClone(payload), timestamp: Date.now(), traceId: execution.traceId, runtimeContextId: execution.runtimeContextId }); // 第70天：追加不可变工作流事件用于回放与审计。
    await this.eventBus.publish(createRuntimeEvent(context, type, "workflow", { executionId: execution.id, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, stepId, ...payload }, String(payload.status ?? type))); // 第70天：发布统一生命周期事件供 Trace 与订阅者消费。
  } // 第70天：结束工作流双写事件发布方法。
  private updateExecution(execution: WorkflowExecutionV2, patch: Partial<WorkflowExecutionV2>): WorkflowExecutionV2 { return this.states.saveExecution({ ...execution, ...patch, updatedAt: Date.now() }); } // 第70天：统一更新时间并持久化执行实例状态变化。
  private updateState(state: WorkflowStateV2, patch: Partial<WorkflowStateV2>): WorkflowStateV2 { return this.states.saveState({ ...state, ...patch }); } // 第70天：统一递增状态版本并持久化步骤状态变化。
  async executeDurableWorkflow(workflowId: string, workflowVersion: number, input: Record<string, unknown> = {}, options: DurableExecutionOptions = {}): Promise<WorkflowExecutionV2> { // 第70天：创建并启动一个冻结版本的持久化执行实例。
    const definition = this.definitions.get(workflowId, workflowVersion); // 第70天：读取指定版本而不是自动切换到最新版本。
    if (!definition) throw new Error(`Workflow Definition 不存在：${workflowId}@${workflowVersion}`); // 第70天：阻止执行不存在或未注册的工作流版本。
    const executionId = `workflow_execution_${randomUUID()}`; // 第70天：生成全局唯一工作流执行实例标识。
    const workflowContext = { workflowId, executionId, version: workflowVersion }; // 第70天：创建任务要求的工作流运行时上下文字段。
    const context = runtimeContextBuilder.build({ workflowId, workflowContext, taskId: `durable-workflow:${workflowId}`, sessionId: `workflow-session:${executionId}`, metadata: { platform: "day70", durable: true } }); // 第70天：构建统一上下文并注入定义、执行与版本信息。
    const now = Date.now(); // 第70天：获取执行实例创建与启动时间戳。
    const execution: WorkflowExecutionV2 = { id: executionId, workflowId, workflowVersion, status: "created", runtimeContextId: context.requestId, traceId: context.traceId, input: structuredClone(input), approvedStepIds: [], retryCount: 0, resumeCount: 0, replayCount: 0, startedAt: now, updatedAt: now }; // 第70天：创建任务要求且可治理的完整执行实例。
    this.runtimeContexts.set(executionId, context); // 第70天：保存执行实例与统一上下文一一对应关系。
    this.states.create(execution); // 第70天：原子创建执行记录和 Workflow State V2 初始快照。
    await this.emit(execution, "workflow.created", { status: "created", inputKeys: Object.keys(input) }); // 第70天：发布执行实例已创建生命周期事件。
    return await this.run(executionId, options); // 第70天：进入持久化调度循环并返回最新执行状态。
  } // 第70天：结束持久化工作流创建与执行入口。
  private nextRunnableStep(definition: WorkflowDefinitionV2, state: WorkflowStateV2): DurableWorkflowStep | undefined { return definition.steps.find((step) => !state.completedSteps.includes(step.id) && (step.dependsOn ?? []).every((dependency) => state.completedSteps.includes(dependency))); } // 第70天：查找依赖均已检查点完成且自身尚未完成的下一步骤。
  private async run(executionId: string, options: DurableExecutionOptions = {}): Promise<WorkflowExecutionV2> { // 第70天：从状态存储与检查点继续执行未完成步骤。
    let execution = this.states.getExecution(executionId); // 第70天：读取执行实例最新持久化状态。
    let state = this.states.getState(executionId); // 第70天：读取步骤、输出与检查点完整状态。
    if (!execution || !state) throw new Error(`Workflow Execution 或 State 不存在：${executionId}`); // 第70天：阻止在状态不完整时继续执行。
    const definition = this.definitions.get(execution.workflowId, execution.workflowVersion); // 第70天：严格读取执行实例冻结的工作流版本。
    if (!definition) throw new Error(`冻结的 Workflow Definition 不存在：${execution.workflowId}@${execution.workflowVersion}`); // 第70天：阻止旧执行被错误切换到新版本。
    if (execution.status === "created") { execution = this.updateExecution(execution, { status: "running" }); await this.emit(execution, "workflow.started", { status: "running" }); } // 第70天：首次运行时保存 running 状态并发布开始事件。
    while (execution.status === "running") { // 第70天：持续调度直到完成、失败、暂停、等待或取消。
      state = this.states.getState(executionId)!; // 第70天：每轮从持久化存储重新读取最新状态模拟跨进程恢复。
      const step = this.nextRunnableStep(definition, state); // 第70天：仅选择尚未完成且依赖已完成的步骤。
      if (!step) { // 第70天：没有可运行步骤时判断全部完成或依赖状态异常。
        if (state.completedSteps.length !== definition.steps.length) throw new Error(`Workflow 无可运行步骤但尚未完成：${executionId}`); // 第70天：对不一致状态快速失败避免执行器空转。
        execution = this.updateExecution(execution, { status: "completed", currentStepId: undefined, completedAt: Date.now(), error: undefined }); // 第70天：把全部步骤完成的执行实例保存为 completed 终态。
        await this.emit(execution, "workflow.completed", { status: "completed", completedSteps: state.completedSteps.length }); // 第70天：发布工作流完成生命周期事件。
        return execution; // 第70天：返回持久化后的完成执行实例。
      } // 第70天：结束无可运行步骤处理分支。
      if (step.requiresConfirmation && !execution.approvedStepIds.includes(step.id)) { // 第70天：检测尚未人工确认的 HITL 步骤。
        const alreadyWaiting = this.checkpoints.list(executionId).some((checkpoint) => checkpoint.stepId === step.id && checkpoint.status === "waiting"); // 第70天：检查是否已经为相同步骤保存等待检查点避免重复写入。
        if (!alreadyWaiting) this.checkpoints.append({ executionId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, stepId: step.id, status: "waiting", timestamp: Date.now(), stateVersion: state.version }); // 第70天：首次进入人工等待时保存可审计等待检查点。
        state = this.updateState(state, { currentSteps: [step.id], checkpoints: this.checkpoints.list(executionId) }); // 第70天：持久化当前等待步骤与完整检查点列表。
        execution = this.updateExecution(execution, { status: "waiting", currentStepId: step.id }); // 第70天：把执行实例迁移为任务要求的 waiting 状态。
        await this.emit(execution, "workflow.paused", { status: "waiting", reason: "hitl", checkpointId: this.checkpoints.list(executionId).at(-1)?.id }, step.id); // 第70天：发布 HITL 暂停事件供前端确认后恢复。
        return execution; // 第70天：立即返回等待中的执行实例且不执行确认步骤。
      } // 第70天：结束 HITL 人工等待处理分支。
      execution = this.updateExecution(execution, { currentStepId: step.id }); // 第70天：保存当前正在运行的步骤标识。
      state = this.updateState(state, { currentSteps: [step.id], failedSteps: state.failedSteps.filter((id) => id !== step.id) }); // 第70天：保存当前步骤并清理本步骤旧失败标记。
      await this.emit(execution, "workflow.step_started", { status: "running", handler: step.handler }, step.id); // 第70天：发布步骤开始生命周期事件。
      try { // 第70天：隔离步骤处理器异常并转换为可恢复失败状态。
        const handler = this.handlers.get(step.handler); // 第70天：从可替换处理器注册表发现步骤执行能力。
        if (!handler) throw new Error(`Workflow Step Handler 未注册：${step.handler}`); // 第70天：缺少处理器时产生稳定失败而不是静默跳过。
        const runtimeContext = this.context(executionId); // 第70天：读取包含工作流版本和检查点的统一上下文。
        const combinedInput = { ...execution.input, stepInput: structuredClone(step.input) }; // 第70天：组合执行级输入与定义级静态步骤输入。
        const output = await handler({ definition, execution, step, input: combinedInput, previousOutputs: structuredClone(state.outputs), runtimeContext }); // 第70天：调用当前步骤处理器并等待确定性或异步结果。
        const checkpoint = this.checkpoints.append({ executionId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, stepId: step.id, status: "completed", output: structuredClone(output), timestamp: Date.now(), stateVersion: state.version }); // 第70天：步骤成功后立即保存包含输出的可靠检查点。
        runtimeContext.workflowContext = { workflowId: execution.workflowId, executionId, version: execution.workflowVersion, checkpointId: checkpoint.id }; // 第70天：把最近检查点写回统一运行时上下文支持跨模块追踪。
        this.runtimeContexts.set(executionId, runtimeContext); // 第70天：持久化更新后的工作流运行时上下文。
        state = this.updateState(state, { currentSteps: [], completedSteps: [...new Set([...state.completedSteps, step.id])], failedSteps: state.failedSteps.filter((id) => id !== step.id), outputs: { ...state.outputs, [step.id]: structuredClone(output) }, checkpoints: this.checkpoints.list(executionId) }); // 第70天：原子保存完成步骤、输出与完整检查点列表。
        await this.emit(execution, "workflow.step_completed", { status: "completed", checkpointId: checkpoint.id, stateVersion: state.version }, step.id); // 第70天：发布步骤完成与检查点标识事件。
        if (options.stopAfterStepId === step.id) { execution = this.updateExecution(execution, { status: "paused", currentStepId: undefined }); await this.emit(execution, "workflow.paused", { status: "paused", reason: "interruption", checkpointId: checkpoint.id }, step.id); return execution; } // 第70天：在可靠检查点后模拟服务重启并返回 paused 状态。
      } catch (caught) { // 第70天：捕获步骤执行、能力发现或输出保存异常。
        const error = caught instanceof Error ? caught.message : "未知工作流步骤错误"; // 第70天：生成安全且稳定的步骤失败摘要。
        const checkpoint = this.checkpoints.append({ executionId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, stepId: step.id, status: "failed", error, timestamp: Date.now(), stateVersion: state.version }); // 第70天：保存失败检查点以支持审计和定点重试。
        state = this.updateState(state, { currentSteps: [], failedSteps: [...new Set([...state.failedSteps, step.id])], checkpoints: this.checkpoints.list(executionId) }); // 第70天：持久化失败步骤并保留此前全部成功步骤与输出。
        execution = this.updateExecution(execution, { status: "failed", currentStepId: step.id, completedAt: Date.now(), error }); // 第70天：把执行实例迁移为可恢复失败终态。
        await this.emit(execution, "workflow.step_failed", { status: "failed", checkpointId: checkpoint.id, error }, step.id); // 第70天：发布步骤失败生命周期事件。
        return execution; // 第70天：返回失败实例等待显式 resume 重试。
      } // 第70天：结束步骤执行异常处理。
    } // 第70天：结束持久化调度循环。
    return execution; // 第70天：返回暂停、等待、取消或其他非 running 状态实例。
  } // 第70天：结束从状态与检查点继续执行的核心调度方法。
  async resumeWorkflow(executionId: string, input: { approvedStepId?: string } = {}): Promise<WorkflowExecutionV2> { // 第70天：从服务重启、Worker Crash、失败或 HITL 等待状态恢复执行。
    let execution = this.states.getExecution(executionId); // 第70天：读取需要恢复的执行实例最新状态。
    let state = this.states.getState(executionId); // 第70天：读取已完成步骤、失败步骤与检查点快照。
    if (!execution || !state) throw new Error(`Workflow Execution 不存在：${executionId}`); // 第70天：目标执行不存在时返回明确错误。
    if (!(["paused", "waiting", "failed"] as const).includes(execution.status as "paused" | "waiting" | "failed")) throw new Error(`当前状态不能恢复：${execution.status}`); // 第70天：只允许从明确可恢复状态继续执行。
    const wasFailed = execution.status === "failed"; // 第70天：记录本次恢复是否属于失败重试以计算指标。
    const approvedStepIds = input.approvedStepId ? [...new Set([...execution.approvedStepIds, input.approvedStepId])] : execution.approvedStepIds; // 第70天：按需保存 HITL 已确认步骤并保证幂等。
    execution = this.updateExecution(execution, { status: "running", approvedStepIds, resumeCount: execution.resumeCount + 1, retryCount: execution.retryCount + (wasFailed ? 1 : 0), completedAt: undefined, error: undefined }); // 第70天：递增恢复与重试指标并迁移回 running 状态。
    if (wasFailed) state = this.updateState(state, { failedSteps: [], currentSteps: [] }); // 第70天：失败重试时仅清理失败标记而保留已完成步骤和输出。
    const recoveryCheckpoint = this.checkpoints.latestCompleted(executionId); // 第70天：读取最近成功检查点作为本次恢复位置。
    await this.emit(execution, "workflow.resumed", { status: "running", recoveryCheckpointId: recoveryCheckpoint?.id, approvedStepId: input.approvedStepId }); // 第70天：发布恢复事件并记录可靠恢复检查点。
    return await this.run(executionId); // 第70天：重新进入调度器且已完成步骤不会再次执行。
  } // 第70天：结束工作流恢复执行方法。
  async approveAndResumeWorkflow(executionId: string): Promise<WorkflowExecutionV2> { const execution = this.states.getExecution(executionId); if (!execution?.currentStepId) throw new Error(`没有等待确认的步骤：${executionId}`); return await this.resumeWorkflow(executionId, { approvedStepId: execution.currentStepId }); } // 第70天：确认当前 HITL 步骤并从等待检查点继续剩余执行。
  async cancelWorkflow(executionId: string): Promise<WorkflowExecutionV2> { // 第70天：取消一个尚未完成的持久化工作流执行实例。
    let execution = this.states.getExecution(executionId); // 第70天：读取目标执行实例最新状态。
    if (!execution) throw new Error(`Workflow Execution 不存在：${executionId}`); // 第70天：取消不存在执行时返回明确错误。
    if (["completed", "cancelled"].includes(execution.status)) return execution; // 第70天：完成或已取消实例执行幂等返回且不重复发布事件。
    execution = this.updateExecution(execution, { status: "cancelled", completedAt: Date.now(), currentStepId: undefined, error: undefined }); // 第70天：持久化 cancelled 终态与完成时间。
    const state = this.states.getState(executionId)!; // 第70天：读取状态以清理当前运行步骤显示。
    this.updateState(state, { currentSteps: [] }); // 第70天：取消后清空当前步骤且保留检查点与审计输出。
    await this.emit(execution, "workflow.cancelled", { status: "cancelled" }); // 第70天：发布工作流取消生命周期事件。
    return execution; // 第70天：返回已持久化的取消执行实例。
  } // 第70天：结束工作流取消方法。
  replayWorkflow(executionId: string): WorkflowReplayResult { // 第70天：基于事件时间线和历史输出执行无副作用回放。
    let execution = this.states.getExecution(executionId); // 第70天：读取需要回放的历史执行实例。
    const state = this.states.getState(executionId); // 第70天：读取步骤输出与检查点快照。
    if (!execution || !state) throw new Error(`Workflow Execution 不存在：${executionId}`); // 第70天：目标历史不存在时返回明确错误。
    execution = this.updateExecution(execution, { replayCount: execution.replayCount + 1 }); // 第70天：递增回放指标且不改变执行终态。
    const timeline = this.eventStore.list(executionId); // 第70天：读取完整有序事件时间线重建执行过程。
    const recoveryCheckpoint = this.checkpoints.latestCompleted(executionId); // 第70天：读取最近成功检查点作为回放恢复点。
    return { executionId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, reconstructedStatus: this.eventStore.reconstructStatus(executionId), recoveryCheckpointId: recoveryCheckpoint?.id, timeline, checkpoints: this.checkpoints.list(executionId), outputs: structuredClone(state.outputs), replayedAt: Date.now() }; // 第70天：返回不重新调用处理器的时间线、检查点、输出与重建状态。
  } // 第70天：结束工作流历史回放方法。
  getMetrics(): WorkflowMetricsV2 { // 第70天：计算任务要求的工作流指标第二版。
    const executions = this.states.listExecutions(); // 第70天：读取全部执行实例快照用于聚合。
    const totalExecutions = executions.length; // 第70天：统计执行实例总数。
    const terminalDurations = executions.filter((execution) => execution.completedAt).map((execution) => Math.max(0, execution.completedAt! - execution.startedAt)); // 第70天：收集完成、失败与取消执行的非负持续时间。
    return { totalExecutions, successRate: totalExecutions ? executions.filter((execution) => execution.status === "completed").length / totalExecutions : 0, failureRate: totalExecutions ? executions.filter((execution) => execution.status === "failed").length / totalExecutions : 0, averageDuration: terminalDurations.length ? Math.round(terminalDurations.reduce((sum, duration) => sum + duration, 0) / terminalDurations.length) : 0, retryCount: executions.reduce((sum, execution) => sum + execution.retryCount, 0), resumeCount: executions.reduce((sum, execution) => sum + execution.resumeCount, 0), replayCount: executions.reduce((sum, execution) => sum + execution.replayCount, 0), checkpointCount: this.checkpoints.list().length, activeExecutions: executions.filter((execution) => ["created", "running", "paused", "waiting"].includes(execution.status)).length }; // 第70天：返回成功率、失败率、时长、重试、恢复、回放、检查点与活动执行指标。
  } // 第70天：结束工作流指标第二版计算方法。
  getSnapshot(lastReplay?: WorkflowReplayResult): DurableWorkflowPlatformSnapshot { return { definitions: this.definitions.list(), executions: this.states.listExecutions(), states: this.states.listStates(), events: this.eventStore.list(), runtimeContexts: [...this.runtimeContexts.values()].map((context) => structuredClone(context)), registryItems: this.registry.list("workflow").filter((item) => item.version === "day70.v1" || String(item.metadata.tags ?? "").includes("day70")), metrics: this.getMetrics(), lastReplay: lastReplay ? structuredClone(lastReplay) : undefined, generatedAt: Date.now() }; } // 第70天：生成 Catalog、Execution、Replay、Context、Registry 与 Metrics 完整快照。
} // 第70天：结束持久化工作流运行时实现。
