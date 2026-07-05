import assert from "node:assert/strict"; /* 第56天：引入 Node.js 严格断言工具。 */
import { createDefaultModelRegistry } from "../lib/model/default-models"; /* 第56天：引入默认模型注册表工厂，保证测试使用隔离模型团队。 */
import { ModelCollaborationExecutor, type CollaborationExecutorClient } from "../lib/model/model-collaboration-executor"; /* 第56天：引入模型协作执行器和可注入客户端类型。 */
import { getModelCollaborationDashboardSnapshot } from "../lib/model/model-collaboration-dashboard-runtime"; /* 第56天：引入模型协作看板快照，用于验证前端数据源。 */
import { mergeResults } from "../lib/model/model-collaboration-merge"; /* 第56天：引入结果合并函数，用于单独验证 Model Result Merge。 */
import { ModelCollaborationPlanner } from "../lib/model/model-collaboration-planner"; /* 第56天：引入模型协作规划器，用于验证不同任务的协作计划。 */
import type { CollaborationStageResult, CollaborationTask, ModelCollaborationCallResult } from "../lib/model/model-collaboration-types"; /* 第56天：引入协作任务、阶段结果和模型调用结果类型。 */

const registry = createDefaultModelRegistry(); /* 第56天：创建隔离的默认模型注册表。 */
const planner = new ModelCollaborationPlanner(registry); /* 第56天：创建使用隔离注册表的模型协作规划器。 */
const fakeClient: CollaborationExecutorClient = { /* 第56天：定义假模型客户端，避免测试依赖真实 Ollama 或云端模型。 */
  async call(input): Promise<ModelCollaborationCallResult> { /* 第56天：实现与真实 ModelExecutor 兼容的调用方法。 */
    const role = input.prompt?.match(/中的 ([a-z]+) 模型阶段/)?.[1] ?? "unknown"; /* 第56天：从阶段输入中提取当前协作角色。 */
    const output = `fake-${role}-${input.modelId}-${(input.prompt ?? "").slice(0, 24)}`; /* 第56天：生成稳定可断言的假模型输出。 */
    return { modelId: input.modelId, success: true, output, fallbackUsed: false, fallbackChain: [input.modelId], durationMs: 3 }; /* 第56天：返回成功调用结果并模拟 3ms 耗时。 */
  }, /* 第56天：结束假模型调用方法。 */
}; /* 第56天：结束假模型客户端定义。 */
const executor = new ModelCollaborationExecutor(registry, fakeClient); /* 第56天：创建使用假模型客户端的协作执行器。 */

const allProfiles = registry.list(); /* 第56天：读取默认模型档案列表。 */
assert.ok(allProfiles.every((profile) => Array.isArray(profile.roles) && profile.roles.length > 0)); /* 第56天：验证每个 ModelProfile 都已经升级支持 roles。 */
assert.ok(registry.findByCapability("reasoning").some((profile) => profile.roles.includes("reasoning"))); /* 第56天：验证推理能力模型也声明了 reasoning 协作角色。 */

const researchTask: CollaborationTask = { taskId: "test-research", taskType: "research", complexity: "high", allowParallel: true, prompt: "研究 LangGraph 教程应该如何组织内容", targetFormat: "markdown" }; /* 第56天：准备高复杂研究任务，用于验证并行多模型协作。 */
const researchPlan = planner.planModels(researchTask); /* 第56天：为研究任务生成协作计划。 */
assert.equal(researchPlan.strategy, "parallel"); /* 第56天：验证高复杂研究任务采用并行策略。 */
assert.ok(researchPlan.stages.some((stage) => stage.role === "reasoning")); /* 第56天：验证研究计划包含 reasoning 阶段。 */
assert.ok(researchPlan.stages.some((stage) => stage.role === "writing")); /* 第56天：验证研究计划包含 writing 阶段。 */
assert.ok(researchPlan.stages.some((stage) => stage.role === "evaluation")); /* 第56天：验证高复杂研究计划包含 evaluation 阶段。 */
assert.ok(researchPlan.stages.filter((stage) => stage.parallelGroup === "parallel-research").length >= 2); /* 第56天：验证研究计划至少有两个并行探索阶段。 */
assert.ok(researchPlan.stages.find((stage) => stage.role === "writing")?.inputFrom?.includes("reasoning")); /* 第56天：验证写作阶段接收推理阶段结果。 */

async function main(): Promise<void> { /* 第56天：定义异步测试主入口，兼容当前 tsx 的 CJS 运行模式。 */
  const researchExecution = await executor.executePlan(researchPlan, researchTask); /* 第56天：执行研究协作计划。 */
  assert.equal(researchExecution.stageResults.length, researchPlan.stages.length); /* 第56天：验证每个计划阶段都有执行结果。 */
  assert.ok(researchExecution.stageResults.every((result) => result.success)); /* 第56天：验证假模型执行下所有阶段成功。 */
  assert.ok(researchExecution.stageResults.find((result) => result.role === "writing")?.input.includes("fake-reasoning")); /* 第56天：验证 Context Passing 把推理输出传给写作阶段。 */
  assert.ok(researchExecution.merged.finalOutput.includes("协作合并说明")); /* 第56天：验证最终输出包含结果合并说明。 */
  assert.ok((researchExecution.trace?.spans ?? []).some((span) => span.type === "collaboration")); /* 第56天：验证 Trace 已记录 collaboration 维度。 */
  assert.ok((researchExecution.usageRecords ?? []).every((record) => record.componentType === "collaboration")); /* 第56天：验证 Usage 已记录 collaboration 组件类型。 */
  assert.ok((researchExecution.usageRecords ?? []).some((record) => record.collaborationRole === "writing")); /* 第56天：验证 Usage 记录包含协作角色。 */

  const jsonTask: CollaborationTask = { taskId: "test-json", taskType: "json", complexity: "medium", requiresJson: true, prompt: "输出一个包含 steps 和 risks 的 JSON", targetFormat: "json" }; /* 第56天：准备 JSON 结构化输出任务。 */
  const jsonPlan = planner.planModels(jsonTask); /* 第56天：为 JSON 任务生成协作计划。 */
  assert.equal(jsonPlan.strategy, "pipeline"); /* 第56天：验证 JSON 任务采用流水线策略。 */
  assert.deepEqual(jsonPlan.stages.map((stage) => stage.role), ["reasoning", "json"]); /* 第56天：验证 JSON 任务由 reasoning 加 json 两个角色协作。 */
  const jsonExecution = await executor.executePlan(jsonPlan, jsonTask); /* 第56天：执行 JSON 协作计划。 */
  assert.ok(jsonExecution.stageResults.find((result) => result.role === "json")?.input.includes("fake-reasoning")); /* 第56天：验证 JSON 阶段接收推理阶段输出。 */

  const evaluationTask: CollaborationTask = { taskId: "test-evaluation", taskType: "evaluation", complexity: "medium", prompt: "检查回答是否有事实错误", targetFormat: "rubric" }; /* 第56天：准备评估任务。 */
  const evaluationPlan = planner.planModels(evaluationTask); /* 第56天：为评估任务生成协作计划。 */
  assert.equal(evaluationPlan.strategy, "single"); /* 第56天：验证评估任务采用单角色计划。 */
  assert.deepEqual(evaluationPlan.stages.map((stage) => stage.role), ["evaluation"]); /* 第56天：验证评估任务只调用 evaluation 角色。 */
  const evaluationExecution = await executor.executePlan(evaluationPlan, evaluationTask); /* 第56天：执行评估协作计划。 */
  assert.equal(evaluationExecution.stageResults[0].role, "evaluation"); /* 第56天：验证评估执行结果来自 evaluation 阶段。 */

  const merged = mergeResults(researchExecution.stageResults as CollaborationStageResult[]); /* 第56天：单独调用结果合并函数。 */
  assert.ok(merged.sourceStageIds.includes("writing")); /* 第56天：验证合并结果记录了写作阶段来源。 */
  assert.ok(merged.consensus.includes("已合并")); /* 第56天：验证合并结果包含中文共识说明。 */

  const dashboard = await getModelCollaborationDashboardSnapshot(planner, registry); /* 第56天：读取模型协作看板快照。 */
  assert.ok(dashboard.team.length >= 6); /* 第56天：验证看板展示六类协作角色覆盖。 */
  assert.ok(dashboard.previews.length >= 3); /* 第56天：验证看板包含至少三类任务预览。 */
  assert.ok(dashboard.previews.some((preview) => preview.plan.strategy === "parallel")); /* 第56天：验证看板包含并行协作计划。 */
  assert.ok(dashboard.metrics.avgStageCount > 0); /* 第56天：验证看板平均阶段数指标可计算。 */

  console.log("Day 56 Multi-Model Collaboration tests passed."); /* 第56天：输出测试通过信息。 */
} /* 第56天：结束异步测试主入口。 */

void main().catch((error: unknown) => { /* 第56天：启动测试主入口并捕获异步错误。 */
  console.error(error); /* 第56天：输出失败原因，便于定位断言或运行时错误。 */
  process.exitCode = 1; /* 第56天：设置非零退出码，让命令行和 CI 正确识别失败。 */
}); /* 第56天：结束异步测试错误处理。 */
