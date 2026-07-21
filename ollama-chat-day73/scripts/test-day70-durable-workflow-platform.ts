import assert from "node:assert/strict"; // 第70天：引入 Node.js 严格断言验证持久化工作流端到端行为。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第70天：引入历史统一注册中心验证工作流能力增量注册。
import { createResearchWorkflowV1, createResearchWorkflowV2 } from "@/lib/workflow/durable-workflow-platform"; // 第70天：引入研究工作流第一版与第二版定义工厂。
import { DurableWorkflowRuntime } from "@/lib/workflow/durable-workflow-runtime"; // 第70天：引入持久化工作流运行时执行全部验收案例。
import type { WorkflowDefinitionV2 } from "@/lib/workflow/durable-workflow-types"; // 第70天：引入自定义恢复与重试工作流定义类型。
const TEST_TIME = Date.UTC(2026, 6, 17, 9, 0, 0); // 第70天：定义测试工作流使用的稳定时间戳。
async function main(): Promise<void> { // 第70天：定义覆盖六个 Durable Workflow Case 与十四项验收标准的测试入口。
  const registry = createDay66UnifiedRegistry(); // 第70天：创建继承历史智能体平台能力的统一注册中心。
  const runtime = new DurableWorkflowRuntime(registry); // 第70天：创建隔离的持久化工作流运行时与四类核心注册能力。
  const v1 = runtime.registerDefinition(createResearchWorkflowV1()); // 第70天：Case 1 注册研究工作流第一版冻结定义。
  const v2 = runtime.registerDefinition(createResearchWorkflowV2()); // 第70天：Case 1 注册新增 Critic 与 HITL 的第二版冻结定义。
  assert.equal(runtime.definitions.list("research-flow").length, 2, "Case 1 research-flow V1 与 V2 应同时存在"); // 第70天：断言新版本不会覆盖旧版本定义。
  assert.equal(v1.steps.some((step) => step.id === "critic"), false, "Case 1 V1 不应被 V2 的 Critic 步骤污染"); // 第70天：断言第一版冻结步骤保持不变。
  assert.equal(v2.steps.some((step) => step.id === "critic"), true, "Case 1 V2 应包含新增 Critic Agent"); // 第70天：断言第二版升级内容已经注册。
  const oldExecution = await runtime.executeDurableWorkflow("research-flow", 1, { query: "旧执行应继续使用 V1" }); // 第70天：启动第一版执行验证新定义不会改变旧实例语义。
  assert.equal(oldExecution.status, "completed", "Case 1 V1 执行应正常完成"); // 第70天：断言弃用版本仍可供历史执行恢复和审计。
  assert.equal(oldExecution.workflowVersion, 1, "Case 1 旧执行必须冻结 Workflow Version 1"); // 第70天：断言执行实例不会自动切换到活动第二版。
  const counters = { step1: 0, step2: 0, step3: 0, fragile: 0, tail: 0 }; // 第70天：准备验证恢复过程不会重复执行成功步骤的调用计数器。
  runtime.registerHandler("case-step-1", () => { counters.step1 += 1; return { step: 1, count: counters.step1 }; }); // 第70天：注册可计数的恢复案例第一步骤处理器。
  runtime.registerHandler("case-step-2", () => { counters.step2 += 1; return { step: 2, count: counters.step2 }; }); // 第70天：注册可计数的恢复案例第二步骤处理器。
  runtime.registerHandler("case-step-3", () => { counters.step3 += 1; return { step: 3, count: counters.step3 }; }); // 第70天：注册可计数的恢复案例第三步骤处理器。
  const recoveryDefinition: WorkflowDefinitionV2 = { id: "recovery-flow", name: "Interrupted Recovery Flow（中断恢复工作流）", version: 1, description: "在第二步骤检查点后模拟服务重启。", status: "active", owner: "Day70 Test", createdAt: TEST_TIME, updatedAt: TEST_TIME, steps: [{ id: "step-1", name: "Step 1", handler: "case-step-1" }, { id: "step-2", name: "Step 2", handler: "case-step-2", dependsOn: ["step-1"] }, { id: "step-3", name: "Step 3", handler: "case-step-3", dependsOn: ["step-2"] }] }; // 第70天：定义三个步骤的中断恢复测试工作流。
  runtime.registerDefinition(recoveryDefinition); // 第70天：Case 2 注册中断恢复测试工作流。
  const interrupted = await runtime.executeDurableWorkflow("recovery-flow", 1, {}, { stopAfterStepId: "step-2" }); // 第70天：Case 2 在第二步骤成功检查点后模拟服务重启。
  assert.equal(interrupted.status, "paused", "Case 2 中断后执行状态应为 paused"); // 第70天：断言可靠检查点后执行实例进入可恢复暂停状态。
  assert.deepEqual(runtime.states.getState(interrupted.id)?.completedSteps, ["step-1", "step-2"], "Case 2 中断前两个步骤应保存为已完成"); // 第70天：断言服务重启前完成状态已经持久化。
  const recovered = await runtime.resumeWorkflow(interrupted.id); // 第70天：Case 2 从最近成功检查点恢复执行剩余步骤。
  assert.equal(recovered.status, "completed", "Case 2 恢复后工作流应完成"); // 第70天：断言恢复调度能够完成剩余步骤。
  assert.deepEqual({ step1: counters.step1, step2: counters.step2, step3: counters.step3 }, { step1: 1, step2: 1, step3: 1 }, "Case 2 恢复不应重复执行 Step 1 或 Step 2"); // 第70天：断言只执行检查点之后的 Step 3。
  runtime.registerHandler("case-fragile", () => { counters.fragile += 1; if (counters.fragile === 1) throw new Error("模拟 Step 2 首次失败"); return { recovered: true, attempts: counters.fragile }; }); // 第70天：注册首次失败、第二次成功的可控故障处理器。
  runtime.registerHandler("case-tail", () => { counters.tail += 1; return { tail: true }; }); // 第70天：注册失败恢复后才会执行的尾部处理器。
  const retryDefinition: WorkflowDefinitionV2 = { id: "checkpoint-retry-flow", name: "Checkpoint Retry Flow（检查点重试工作流）", version: 1, description: "Step 1 成功、Step 2 首次失败，恢复时不得重跑 Step 1。", status: "active", owner: "Day70 Test", createdAt: TEST_TIME + 1, updatedAt: TEST_TIME + 1, steps: [{ id: "stable", name: "Stable Step", handler: "case-step-1" }, { id: "fragile", name: "Fragile Step", handler: "case-fragile", dependsOn: ["stable"] }, { id: "tail", name: "Tail Step", handler: "case-tail", dependsOn: ["fragile"] }] }; // 第70天：定义检查点失败恢复测试工作流。
  runtime.registerDefinition(retryDefinition); // 第70天：Case 3 注册检查点恢复测试工作流。
  const failed = await runtime.executeDurableWorkflow("checkpoint-retry-flow", 1); // 第70天：Case 3 首次执行在 Fragile Step 产生可控失败。
  assert.equal(failed.status, "failed", "Case 3 首次执行应进入 failed"); // 第70天：断言执行实例保存失败终态等待恢复。
  assert.deepEqual(runtime.states.getState(failed.id)?.completedSteps, ["stable"], "Case 3 Step 1 成功检查点必须保留"); // 第70天：断言失败不会丢失已经成功的步骤状态。
  const stableCountBeforeRetry = counters.step1; // 第70天：记录重试前稳定步骤实际执行次数。
  const retried = await runtime.resumeWorkflow(failed.id); // 第70天：Case 3 从失败状态恢复并重试未完成步骤。
  assert.equal(retried.status, "completed", "Case 3 重试后工作流应完成"); // 第70天：断言可控故障消失后能够继续到完成终态。
  assert.equal(counters.step1, stableCountBeforeRetry, "Case 3 Retry 不应重复执行已完成 Step 1"); // 第70天：断言恢复调度严格跳过成功检查点步骤。
  assert.equal(counters.fragile, 2, "Case 3 失败步骤应恰好执行两次"); // 第70天：断言只有失败步骤被重试一次。
  assert.equal(counters.tail, 1, "Case 3 下游步骤应在恢复成功后执行一次"); // 第70天：断言下游步骤没有提前执行或重复执行。
  const waiting = await runtime.executeDurableWorkflow("research-flow", 2, { query: "等待人工确认后发布" }); // 第70天：Case 4 执行第二版直到 HITL 人工确认步骤。
  assert.equal(waiting.status, "waiting", "Case 4 HITL 步骤前应进入 waiting"); // 第70天：断言人工参与闭环不会被误标为失败。
  assert.equal(waiting.currentStepId, "approval", "Case 4 应明确记录等待确认的步骤"); // 第70天：断言 Workflow State 与执行实例可以定位人工等待点。
  const approved = await runtime.approveAndResumeWorkflow(waiting.id); // 第70天：Case 4 模拟用户确认并恢复剩余步骤。
  assert.equal(approved.status, "completed", "Case 4 用户确认后应继续运行到完成"); // 第70天：断言 HITL Resume 能执行确认步骤与发布步骤。
  assert.equal(runtime.states.getState(waiting.id)?.completedSteps.includes("approval"), true, "Case 4 应为人工确认步骤保存成功检查点"); // 第70天：断言确认结果成为可恢复的持久化状态。
  const callsBeforeReplay = Object.values(counters).reduce((sum, count) => sum + count, 0); // 第70天：记录回放前全部自定义步骤处理器调用次数。
  const replay = runtime.replayWorkflow(approved.id); // 第70天：Case 5 仅从 Event Log、Checkpoint 与输出回放历史执行。
  const callsAfterReplay = Object.values(counters).reduce((sum, count) => sum + count, 0); // 第70天：记录回放后步骤处理器调用次数。
  assert.equal(callsAfterReplay, callsBeforeReplay, "Case 5 Replay 不应重新调用步骤处理器或模型"); // 第70天：断言回放无额外费用且避免非确定性输出。
  assert.equal(replay.timeline.length > 0, true, "Case 5 Replay 应返回完整 Event Timeline"); // 第70天：断言事件溯源历史可供调试和审计。
  assert.equal(replay.checkpoints.length >= 5, true, "Case 5 Replay 应返回全部步骤与等待检查点"); // 第70天：断言回放结果包含可靠恢复位置列表。
  assert.equal(Object.keys(replay.outputs).length, 5, "Case 5 Replay 应直接复用五个历史 Step Output"); // 第70天：断言回放输出来自持久化状态而非重新计算。
  const cancellable = await runtime.executeDurableWorkflow("recovery-flow", 1, {}, { stopAfterStepId: "step-1" }); // 第70天：Case 6 创建一个第一步骤后暂停的可取消执行。
  const cancelled = await runtime.cancelWorkflow(cancellable.id); // 第70天：Case 6 对暂停执行发起取消治理动作。
  assert.equal(cancelled.status, "cancelled", "Case 6 最终状态必须为 cancelled"); // 第70天：断言取消动作保存任务要求的终态。
  assert.equal(runtime.states.getState(cancellable.id)?.completedSteps.includes("step-1"), true, "Case 6 取消后仍应保留已有检查点供审计"); // 第70天：断言取消不会抹除历史执行证据。
  const day70RegistryItems = registry.list("workflow").filter((item) => item.version === "day70.v1"); // 第70天：读取持久化执行器、检查点、回放与状态存储注册项。
  assert.equal(day70RegistryItems.length, 4, "UnifiedRegistry 应注册四类 Day70 核心工作流能力"); // 第70天：断言任务要求的四类能力均可统一发现。
  assert.equal(registry.get("workflow:definition:research-flow:v1")?.metadata.status, "deprecated", "UnifiedRegistry 应保留 V1 定义状态"); // 第70天：断言版本化工作流定义已接入统一注册中心。
  assert.equal(registry.get("workflow:definition:research-flow:v2")?.metadata.status, "active", "UnifiedRegistry 应发现活动 V2 定义"); // 第70天：断言同一工作流两个版本可以同时注册发现。
  const snapshot = runtime.getSnapshot(replay); // 第70天：读取覆盖 Explorer、Context、Registry 与 Metrics 的完整平台快照。
  const approvedContext = snapshot.runtimeContexts.find((context) => context.workflowContext?.executionId === approved.id); // 第70天：查找 HITL 完成执行关联的统一运行时上下文。
  assert.equal(approvedContext?.workflowContext?.version, 2, "RuntimeContext 应注入冻结 Workflow Version"); // 第70天：断言统一上下文包含任务要求的工作流版本。
  assert.equal(Boolean(approvedContext?.workflowContext?.checkpointId), true, "RuntimeContext 应注入最近 Checkpoint ID"); // 第70天：断言跨模块 Trace 可以定位最近可靠恢复点。
  const eventTypes = new Set(snapshot.events.map((event) => event.type)); // 第70天：收集端到端运行产生的工作流事件类型。
  for (const type of ["workflow.created", "workflow.started", "workflow.step_started", "workflow.step_completed", "workflow.step_failed", "workflow.paused", "workflow.resumed", "workflow.completed", "workflow.cancelled"] as const) assert.equal(eventTypes.has(type), true, `Event Sourcing 应包含 ${type}`); // 第70天：断言任务清单要求的完整生命周期事件链已经发布并保存。
  const busTypes = new Set(runtime.eventBus.getHistory().map((event) => event.type)); // 第70天：读取统一 EventBus 保存的工作流事件历史。
  assert.equal(busTypes.has("workflow.resumed"), true, "EventBus 应接收 workflow.resumed 生命周期事件"); // 第70天：断言工作流事件已真正接入 Day65 统一事件总线。
  assert.equal(snapshot.metrics.totalExecutions >= 5, true, "Workflow Metrics V2 应统计全部测试执行实例"); // 第70天：断言五个真实执行实例覆盖版本、恢复、重试、HITL、回放与取消案例。
  assert.equal(snapshot.metrics.resumeCount >= 3, true, "Workflow Metrics V2 应累计中断、失败与 HITL 恢复次数"); // 第70天：断言恢复指标正确累计三类恢复场景。
  assert.equal(snapshot.metrics.retryCount >= 1, true, "Workflow Metrics V2 应累计失败重试次数"); // 第70天：断言失败恢复被单独计入重试指标。
  assert.equal(snapshot.metrics.replayCount >= 1, true, "Workflow Metrics V2 应累计回放次数"); // 第70天：断言无副作用历史回放计入治理指标。
  assert.equal(snapshot.metrics.checkpointCount >= 16, true, "Workflow Metrics V2 应累计成功、失败与等待检查点"); // 第70天：断言检查点规模指标覆盖全部生命周期类型。
  console.log("Day70 Durable Agent Workflow Platform：六个验收案例与十四项标准全部通过"); // 第70天：输出稳定成功信息供 npm 脚本和人工验收识别。
} // 第70天：结束持久化工作流端到端测试入口。
void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第70天：运行测试并在断言或运行时失败时设置非零退出码。
