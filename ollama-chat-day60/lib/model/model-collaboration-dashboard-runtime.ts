import { modelRegistry } from "@/lib/model/default-models"; /* 第56天：引入共享模型注册表，用于生成模型团队与角色覆盖。 */
import { ModelCollaborationExecutor, type CollaborationExecutorClient } from "@/lib/model/model-collaboration-executor"; /* 第56天：引入协作执行器和可注入模型客户端类型。 */
import { ModelCollaborationPlanner, modelCollaborationPlanner } from "@/lib/model/model-collaboration-planner"; /* 第56天：引入协作规划器，用于生成典型任务计划。 */
import type { CollaborationDashboardMetrics, CollaborationDashboardSnapshot, CollaborationPreview, CollaborationTask, CollaborationTeamMember, ModelCollaborationCallResult } from "@/lib/model/model-collaboration-types"; /* 第56天：引入协作看板、预览、任务和调用结果类型。 */
import type { ModelProfile, ModelRole } from "@/lib/model/model-profile-types"; /* 第56天：引入模型档案和协作角色类型。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第56天：引入模型注册表类型，便于辅助函数保持类型清晰。 */

const COLLABORATION_ROLES: ModelRole[] = ["reasoning", "writing", "evaluation", "json", "embedding", "summary"]; /* 第56天：定义看板需要展示的全部协作角色。 */

const DEMO_TASKS: Array<{ label: string; task: CollaborationTask }> = [ /* 第56天：定义 Model Collaboration Explorer 的典型演示任务列表。 */
  { label: "Research（研究）并行协作", task: { taskId: "day56-research-demo", taskType: "research", complexity: "high", allowParallel: true, prompt: "写一份 LangGraph 教程大纲，并说明适用场景、关键概念和风险。", targetFormat: "markdown" } }, /* 第56天：演示高复杂研究任务的并行模型团队。 */
  { label: "JSON（结构化输出）协作", task: { taskId: "day56-json-demo", taskType: "json", complexity: "medium", requiresJson: true, prompt: "把一个 Agent 工作流拆成 name、steps、risks 三个字段。", targetFormat: "json" } }, /* 第56天：演示推理模型加 JSON 模型的结构化流水线。 */
  { label: "Evaluation（评估）单角色", task: { taskId: "day56-evaluation-demo", taskType: "evaluation", complexity: "medium", prompt: "评估一段回答是否遗漏了引用、边界条件和下一步行动。", targetFormat: "rubric" } }, /* 第56天：演示评估任务只调用 Evaluation 模型。 */
]; /* 第56天：结束典型演示任务列表。 */

const demoClient: CollaborationExecutorClient = { /* 第56天：定义演示模型客户端，避免看板快照真实请求本地或云端模型。 */
  async call(input): Promise<ModelCollaborationCallResult> { /* 第56天：实现与 ModelExecutor 兼容的异步调用方法。 */
    const roleHint = input.prompt?.match(/中的 ([a-z]+) 模型阶段/)?.[1] ?? "model"; /* 第56天：从提示词中提取角色提示，用于生成稳定演示输出。 */
    const output = `【Demo ${roleHint}】模型 ${input.modelId} 已处理输入：${(input.prompt ?? "").slice(0, 80)}...`; /* 第56天：生成可预测的阶段输出，便于测试和前端展示。 */
    return { modelId: input.modelId, success: true, output, fallbackUsed: false, fallbackChain: [input.modelId], durationMs: 12 }; /* 第56天：返回稳定成功结果，并模拟 12ms 执行耗时。 */
  }, /* 第56天：结束演示调用方法。 */
}; /* 第56天：结束演示模型客户端定义。 */

export async function getModelCollaborationDashboardSnapshot(planner: ModelCollaborationPlanner = modelCollaborationPlanner, registry: ModelRegistry = modelRegistry): Promise<CollaborationDashboardSnapshot> { /* 第56天：定义生成模型协作看板快照的入口。 */
  const executor = new ModelCollaborationExecutor(registry, demoClient); /* 第56天：创建使用演示调用器的协作执行器。 */
  const previews = await Promise.all(DEMO_TASKS.map(async ({ label, task }) => buildPreview(label, task, planner, executor))); /* 第56天：并行生成所有典型任务的计划和演示执行结果。 */
  const team = buildTeam(registry); /* 第56天：生成默认模型团队角色映射。 */
  return { team, previews, metrics: calculateMetrics(team, previews), generatedAt: Date.now() }; /* 第56天：返回团队、预览、指标和生成时间。 */
} /* 第56天：结束生成模型协作看板快照入口。 */

async function buildPreview(label: string, task: CollaborationTask, planner: ModelCollaborationPlanner, executor: ModelCollaborationExecutor): Promise<CollaborationPreview> { /* 第56天：定义构建单个预览的方法。 */
  const plan = planner.planModels(task); /* 第56天：为演示任务生成协作计划。 */
  const execution = await executor.executePlan(plan, task); /* 第56天：使用演示模型客户端执行该计划。 */
  return { label, task, plan, execution }; /* 第56天：返回完整预览对象。 */
} /* 第56天：结束构建单个预览的方法。 */

function buildTeam(registry: ModelRegistry): CollaborationTeamMember[] { /* 第56天：定义构建默认模型团队的方法。 */
  return COLLABORATION_ROLES.map((role) => ({ role, model: pickRoleModel(registry, role) })).filter((member): member is CollaborationTeamMember => Boolean(member.model)); /* 第56天：为每个角色找到首个可承担模型并过滤空值。 */
} /* 第56天：结束构建默认模型团队的方法。 */

function pickRoleModel(registry: ModelRegistry, role: ModelRole): ModelProfile { /* 第56天：定义按角色读取默认模型的方法。 */
  const model = registry.list().find((item) => item.roles.includes(role)); /* 第56天：选择第一个声明该角色的模型。 */
  const fallback = registry.list()[0]; /* 第56天：准备注册表首个模型作为兜底。 */
  if (model) return model; /* 第56天：命中角色模型时直接返回。 */
  if (fallback) return fallback; /* 第56天：没有角色模型时返回兜底模型。 */
  throw new Error("ModelRegistry（模型注册表）为空，无法构建模型协作团队。"); /* 第56天：注册表为空时抛出明确错误。 */
} /* 第56天：结束按角色读取默认模型的方法。 */

function calculateMetrics(team: CollaborationTeamMember[], previews: CollaborationPreview[]): CollaborationDashboardMetrics { /* 第56天：定义模型协作看板指标计算方法。 */
  const uniqueModels = new Set(team.map((member) => member.model.id)); /* 第56天：统计团队中去重后的模型数量。 */
  const stageCounts = previews.map((preview) => preview.plan.stages.length); /* 第56天：收集每个预览的阶段数量。 */
  const totalCost = previews.reduce((sum, preview) => sum + preview.execution.totalCost, 0); /* 第56天：累加所有预览的估算成本。 */
  const avgStageCount = stageCounts.length ? round(stageCounts.reduce((sum, value) => sum + value, 0) / stageCounts.length, 2) : 0; /* 第56天：计算平均阶段数。 */
  const avgEstimatedCost = previews.length ? round(totalCost / previews.length, 8) : 0; /* 第56天：计算每个预览的平均估算成本。 */
  return { teamSize: uniqueModels.size, roleCoverage: team.length, previewCount: previews.length, parallelPlanCount: previews.filter((preview) => preview.plan.strategy === "parallel").length, avgStageCount, avgEstimatedCost }; /* 第56天：返回完整看板指标。 */
} /* 第56天：结束模型协作看板指标计算方法。 */

function round(value: number, digits: number): number { /* 第56天：定义稳定数值精度处理函数。 */
  return Number(value.toFixed(digits)); /* 第56天：按指定位数四舍五入并转回数字。 */
} /* 第56天：结束稳定数值精度处理函数。 */
