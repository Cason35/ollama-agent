import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第70天：复用包含历史能力的 UnifiedRegistry 作为平台注册基础。
import { DurableWorkflowRuntime } from "@/lib/workflow/durable-workflow-runtime"; // 第70天：引入版本化、检查点化、可恢复与可回放运行时。
import type { DurableWorkflowPlatformSnapshot, WorkflowDefinitionV2, WorkflowReplayResult } from "@/lib/workflow/durable-workflow-types"; // 第70天：引入工作流定义、回放结果和平台快照类型。
const DAY70_TIME = Date.UTC(2026, 6, 17, 8, 0, 0); // 第70天：定义示例工作流版本的稳定教学时间戳。
export function createResearchWorkflowV1(): WorkflowDefinitionV2 { // 第70天：创建可与第二版同时存在的研究工作流第一版。
  return { id: "research-flow", name: "Research Workflow（研究工作流）", version: 1, description: "第一版包含研究、草稿与发布三个步骤，用于验证旧执行不会被新定义覆盖。", status: "deprecated", owner: "Agent Platform Team", createdAt: DAY70_TIME, updatedAt: DAY70_TIME, steps: [{ id: "research", name: "Research（研究）", handler: "research" }, { id: "draft", name: "Draft（草稿）", handler: "draft", dependsOn: ["research"] }, { id: "publish", name: "Publish（发布）", handler: "publish", dependsOn: ["draft"] }] }; // 第70天：返回冻结且可审计的研究工作流第一版定义。
} // 第70天：结束研究工作流第一版定义工厂。
export function createResearchWorkflowV2(): WorkflowDefinitionV2 { // 第70天：创建增加 Critic Agent 与 HITL 的研究工作流第二版。
  return { id: "research-flow", name: "Research Workflow（研究工作流）", version: 2, description: "第二版新增 Critic Agent 与人工确认，演示版本升级、检查点恢复和 HITL Resume。", status: "active", owner: "Agent Platform Team", createdAt: DAY70_TIME + 1000, updatedAt: DAY70_TIME + 1000, steps: [{ id: "research", name: "Research（研究）", handler: "research" }, { id: "draft", name: "Draft（草稿）", handler: "draft", dependsOn: ["research"] }, { id: "critic", name: "Critic Agent（批评审查智能体）", handler: "critic", dependsOn: ["draft"] }, { id: "approval", name: "HITL Approval（人工确认）", handler: "approval", dependsOn: ["critic"], requiresConfirmation: true }, { id: "publish", name: "Publish（发布）", handler: "publish", dependsOn: ["approval"] }] }; // 第70天：返回冻结且新增审查与人工确认步骤的第二版定义。
} // 第70天：结束研究工作流第二版定义工厂。
export class DurableWorkflowPlatform { // 第70天：组合运行时、示例版本、API 动作和 Workflow Explorer V2 快照。
  readonly registry = createDay66UnifiedRegistry(); // 第70天：创建继承智能体、工具、模型、提示词、记忆与知识能力的统一注册中心。
  readonly runtime = new DurableWorkflowRuntime(this.registry); // 第70天：创建接入 RuntimeContext、EventBus 与 UnifiedRegistry 的持久化运行时。
  private seedPromise?: Promise<void>; // 第70天：保存并发请求共享的示例数据初始化 Promise。
  private lastReplay?: WorkflowReplayResult; // 第70天：保存 Replay Debug 最近一次无副作用回放结果。
  async ensureDemoData(): Promise<void> { if (!this.seedPromise) this.seedPromise = this.seedDemoData(); return await this.seedPromise; } // 第70天：确保示例版本与执行实例只初始化一次。
  private async seedDemoData(): Promise<void> { // 第70天：生成覆盖版本、恢复、HITL、回放与指标的治理台示例数据。
    this.runtime.registerDefinition(createResearchWorkflowV1()); // 第70天：注册已弃用但仍可执行和审计的第一版定义。
    this.runtime.registerDefinition(createResearchWorkflowV2()); // 第70天：注册包含 Critic Agent 与 HITL 的活动第二版定义。
    const completedV1 = await this.runtime.executeDurableWorkflow("research-flow", 1, { query: "Day70 为什么需要 Workflow Version？" }); // 第70天：创建完整成功的第一版历史执行验证旧版本不被覆盖。
    await this.runtime.executeDurableWorkflow("research-flow", 2, { query: "服务重启后怎样从检查点恢复？" }, { stopAfterStepId: "critic" }); // 第70天：在 Critic 成功检查点后模拟服务重启并保留 paused 执行。
    await this.runtime.executeDurableWorkflow("research-flow", 2, { query: "HITL 如何确认后继续发布？" }); // 第70天：运行到人工确认步骤并保留 waiting 执行。
    this.lastReplay = this.runtime.replayWorkflow(completedV1.id); // 第70天：回放第一版历史执行供 Replay Debug 首屏展示。
  } // 第70天：结束治理台示例数据初始化。
  async getSnapshot(seed = true): Promise<DurableWorkflowPlatformSnapshot> { if (seed) await this.ensureDemoData(); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：返回定义、执行、状态、事件、上下文、注册与指标完整快照。
  async startExecution(input: { workflowId?: string; workflowVersion?: number; query?: string; simulateInterruptionAfterStepId?: string }): Promise<DurableWorkflowPlatformSnapshot> { await this.ensureDemoData(); const workflowId = input.workflowId?.trim() || "research-flow"; const activeDefinition = this.runtime.definitions.list(workflowId).filter((definition) => definition.status === "active").at(-1); const workflowVersion = input.workflowVersion ?? activeDefinition?.version ?? this.runtime.definitions.list(workflowId).at(-1)?.version; if (!workflowVersion) throw new Error(`没有可执行的 Workflow Definition：${workflowId}`); await this.runtime.executeDurableWorkflow(workflowId, workflowVersion, { query: input.query?.trim() || "演示持久化工作流执行" }, { stopAfterStepId: input.simulateInterruptionAfterStepId }); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：按指定或活动版本启动执行并支持可靠检查点后模拟中断。
  async resumeExecution(executionId: string): Promise<DurableWorkflowPlatformSnapshot> { await this.ensureDemoData(); await this.runtime.resumeWorkflow(executionId); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：从最近检查点恢复 paused 或 failed 执行且不重复成功步骤。
  async approveExecution(executionId: string): Promise<DurableWorkflowPlatformSnapshot> { await this.ensureDemoData(); await this.runtime.approveAndResumeWorkflow(executionId); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：确认 HITL 当前步骤并继续运行剩余步骤。
  async cancelExecution(executionId: string): Promise<DurableWorkflowPlatformSnapshot> { await this.ensureDemoData(); await this.runtime.cancelWorkflow(executionId); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：取消运行中、暂停、等待或失败执行并保存 cancelled 终态。
  async replayExecution(executionId: string): Promise<DurableWorkflowPlatformSnapshot> { await this.ensureDemoData(); this.lastReplay = this.runtime.replayWorkflow(executionId); return this.runtime.getSnapshot(this.lastReplay); } // 第70天：无副作用回放指定执行并更新 Replay Debug 快照。
} // 第70天：结束持久化工作流平台组合实现。
const globalPlatform = globalThis as typeof globalThis & { day70DurableWorkflowPlatform?: DurableWorkflowPlatform }; // 第70天：扩展全局对象类型以在 Next.js 热更新期间复用平台状态。
export const durableWorkflowPlatform = globalPlatform.day70DurableWorkflowPlatform ?? new DurableWorkflowPlatform(); // 第70天：创建或复用进程级 Day70 持久化工作流平台单例。
globalPlatform.day70DurableWorkflowPlatform = durableWorkflowPlatform; // 第70天：保存平台单例以让 API 治理动作保持连续状态。
