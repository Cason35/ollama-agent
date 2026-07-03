import type { Trace } from "@/lib/agents/agent-types"; /* 第56天：引入 Trace（追踪记录）类型，用于把协作执行链路暴露给前端。 */
import type { ModelCallResult, ModelComplexity, ModelProfile, ModelRole, ModelTaskType } from "@/lib/model/model-profile-types"; /* 第56天：引入模型调用、复杂度、档案、角色和任务类型。 */
import type { UsageRecord } from "@/lib/usage/usage-types"; /* 第56天：引入 UsageRecord（用量记录）类型，用于展示每个协作阶段的成本归因。 */

export type CollaborationTask = { /* 第56天：定义多模型协作任务输入，用于规划器判断应该组建怎样的模型团队。 */
  taskId: string; /* 第56天：保存任务唯一标识，后续计划、Trace 和 Usage 都用它关联。 */
  taskType: ModelTaskType; /* 第56天：保存任务类型，例如 research、json 或 evaluation。 */
  prompt: string; /* 第56天：保存用户原始任务文本，所有阶段都从它或上游输出派生输入。 */
  complexity?: ModelComplexity; /* 第56天：保存任务复杂度，影响是否加入评估阶段和并行阶段。 */
  requiresJson?: boolean; /* 第56天：标记任务是否要求结构化 JSON 输出。 */
  allowParallel?: boolean; /* 第56天：标记规划器是否可以为同一任务生成并行模型阶段。 */
  targetFormat?: string; /* 第56天：保存可选目标输出格式，例如 markdown、json 或 executive-summary。 */
}; /* 第56天：结束多模型协作任务输入定义。 */

export type CollaborationStage = { /* 第56天：定义协作计划中的单个模型阶段。 */
  id: string; /* 第56天：保存阶段唯一标识，用于依赖、Trace 和结果回填。 */
  role: ModelRole; /* 第56天：保存该阶段承担的模型角色，例如 reasoning、writing 或 evaluation。 */
  modelId: string; /* 第56天：保存该阶段计划调用的逻辑模型 ID。 */
  inputFrom?: string[]; /* 第56天：保存该阶段依赖的上游阶段 ID，缺省表示直接使用用户原始任务。 */
  parallelGroup?: string; /* 第56天：保存可选并行分组，同组且依赖满足的阶段会并行执行。 */
  reason: string; /* 第56天：保存规划器选择该角色和模型的中文理由。 */
}; /* 第56天：结束协作计划阶段定义。 */

export type CollaborationPlan = { /* 第56天：定义多模型协作计划，描述多个模型如何按阶段共同完成一个任务。 */
  taskId: string; /* 第56天：保存计划对应的任务 ID。 */
  stages: CollaborationStage[]; /* 第56天：保存按执行顺序排列的协作阶段列表。 */
  strategy: "single" | "pipeline" | "parallel"; /* 第56天：保存本次计划采用单模型、流水线还是并行协作策略。 */
  reason: string; /* 第56天：保存整个计划的中文解释。 */
  createdAt: number; /* 第56天：保存计划生成时间戳。 */
}; /* 第56天：结束多模型协作计划定义。 */

export type CollaborationStageUsage = { /* 第56天：定义单个协作阶段的轻量用量摘要。 */
  inputTokens: number; /* 第56天：保存该阶段估算输入词元数。 */
  outputTokens: number; /* 第56天：保存该阶段估算输出词元数。 */
  totalTokens: number; /* 第56天：保存该阶段输入与输出词元总数。 */
  estimatedCost: number; /* 第56天：保存该阶段按模型档案估算的美元成本。 */
}; /* 第56天：结束协作阶段用量摘要定义。 */

export type CollaborationStageResult = { /* 第56天：定义单个协作阶段的执行结果。 */
  stageId: string; /* 第56天：保存结果对应的阶段 ID。 */
  role: ModelRole; /* 第56天：保存阶段承担的模型角色。 */
  modelId: string; /* 第56天：保存阶段实际返回结果归属的模型 ID。 */
  plannedModelId: string; /* 第56天：保存阶段原计划调用的模型 ID，便于观察 fallback。 */
  input: string; /* 第56天：保存传给该阶段模型的最终输入文本。 */
  output: string; /* 第56天：保存该阶段模型输出或降级输出。 */
  success: boolean; /* 第56天：标记该阶段是否获得真实模型成功响应。 */
  fallbackUsed?: boolean; /* 第56天：标记该阶段是否触发备用模型链。 */
  fallbackChain?: string[]; /* 第56天：保存该阶段实际尝试或跳过的模型链。 */
  durationMs: number; /* 第56天：保存该阶段执行耗时毫秒数。 */
  usage: CollaborationStageUsage; /* 第56天：保存该阶段估算用量和成本。 */
  error?: string; /* 第56天：保存阶段失败时的错误说明。 */
}; /* 第56天：结束协作阶段执行结果定义。 */

export type CollaborationMergedResult = { /* 第56天：定义多个模型阶段结果合并后的最终答案结构。 */
  finalOutput: string; /* 第56天：保存合并后的最终输出文本。 */
  sourceStageIds: string[]; /* 第56天：保存参与合并的阶段 ID 列表。 */
  consensus: string; /* 第56天：保存用于解释合并策略的共识说明。 */
}; /* 第56天：结束模型结果合并结构定义。 */

export type CollaborationExecutionResult = { /* 第56天：定义一次协作计划执行后的完整结果。 */
  plan: CollaborationPlan; /* 第56天：保存本次执行采用的协作计划。 */
  stageResults: CollaborationStageResult[]; /* 第56天：保存每个模型阶段的执行结果。 */
  merged: CollaborationMergedResult; /* 第56天：保存最终合并结果。 */
  totalDurationMs: number; /* 第56天：保存整次协作耗时，包含并行执行后的真实墙钟时间。 */
  totalCost: number; /* 第56天：保存全部阶段估算成本之和。 */
  trace?: Trace; /* 第56天：保存可选 Trace（追踪记录）快照。 */
  usageRecords?: UsageRecord[]; /* 第56天：保存可选 Usage（用量记录）快照。 */
}; /* 第56天：结束协作执行完整结果定义。 */

export type CollaborationPreview = { /* 第56天：定义前端 Explorer 展示的一组典型协作预览。 */
  label: string; /* 第56天：保存预览场景中文标签。 */
  task: CollaborationTask; /* 第56天：保存触发该预览的任务输入。 */
  plan: CollaborationPlan; /* 第56天：保存规划器生成的协作计划。 */
  execution: CollaborationExecutionResult; /* 第56天：保存使用演示调用器执行后的协作结果。 */
}; /* 第56天：结束协作预览定义。 */

export type CollaborationTeamMember = { /* 第56天：定义模型团队成员摘要，用于展示角色到模型的映射。 */
  role: ModelRole; /* 第56天：保存团队成员承担的协作角色。 */
  model: ModelProfile; /* 第56天：保存承担该角色的默认模型档案。 */
}; /* 第56天：结束模型团队成员摘要定义。 */

export type CollaborationDashboardMetrics = { /* 第56天：定义多模型协作看板的整体指标。 */
  teamSize: number; /* 第56天：保存默认模型团队中去重模型数量。 */
  roleCoverage: number; /* 第56天：保存默认模型团队覆盖的角色数量。 */
  previewCount: number; /* 第56天：保存当前看板内置预览数量。 */
  parallelPlanCount: number; /* 第56天：保存采用并行协作策略的预览数量。 */
  avgStageCount: number; /* 第56天：保存每个预览平均包含的协作阶段数。 */
  avgEstimatedCost: number; /* 第56天：保存每个预览的平均估算成本。 */
}; /* 第56天：结束多模型协作看板指标定义。 */

export type CollaborationDashboardSnapshot = { /* 第56天：定义 Model Collaboration Explorer（模型协作浏览器）的完整快照。 */
  team: CollaborationTeamMember[]; /* 第56天：保存默认模型团队成员列表。 */
  previews: CollaborationPreview[]; /* 第56天：保存典型任务的计划和演示执行结果。 */
  metrics: CollaborationDashboardMetrics; /* 第56天：保存看板聚合指标。 */
  generatedAt: number; /* 第56天：保存快照生成时间戳。 */
}; /* 第56天：结束模型协作浏览器快照定义。 */

export type ModelCollaborationCallResult = Pick<ModelCallResult, "modelId" | "success" | "output" | "error" | "fallbackUsed" | "fallbackChain" | "durationMs">; /* 第56天：定义协作执行器关心的最小模型调用结果，便于测试注入模拟执行器。 */
