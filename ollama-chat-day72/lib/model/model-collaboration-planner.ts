import { modelRegistry } from "@/lib/model/default-models"; /* 第56天：引入共享模型注册表，作为默认协作模型团队来源。 */
import type { CollaborationPlan, CollaborationStage, CollaborationTask } from "@/lib/model/model-collaboration-types"; /* 第56天：引入协作任务、阶段和计划类型。 */
import type { ModelComplexity, ModelProfile, ModelRole } from "@/lib/model/model-profile-types"; /* 第56天：引入模型复杂度、档案和角色类型。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第56天：引入模型注册表类型，便于测试注入隔离团队。 */

const DEFAULT_COMPLEXITY: ModelComplexity = "medium"; /* 第56天：定义未显式传入复杂度时的默认复杂度。 */

export class ModelCollaborationPlanner { /* 第56天：定义 ModelCollaborationPlanner（模型协作规划器），负责把一个任务拆成多个模型角色阶段。 */
  constructor(private readonly registry: ModelRegistry = modelRegistry) {} /* 第56天：默认使用共享模型注册表，同时允许测试传入独立注册表。 */

  planModels(task: CollaborationTask): CollaborationPlan { /* 第56天：定义规划主入口，根据任务自动生成多模型协作计划。 */
    const normalized = this.normalizeTask(task); /* 第56天：补齐复杂度、并行偏好和目标格式等默认值。 */
    const stages = this.planStages(normalized); /* 第56天：按任务类型生成具体模型阶段列表。 */
    return { taskId: normalized.taskId, stages, strategy: this.inferStrategy(stages), reason: this.describePlan(normalized, stages), createdAt: Date.now() }; /* 第56天：返回包含阶段、策略和理由的完整协作计划。 */
  } /* 第56天：结束规划主入口。 */

  private normalizeTask(task: CollaborationTask): CollaborationTask { /* 第56天：定义任务规范化方法，避免规划规则到处处理缺省值。 */
    const complexity = task.complexity ?? DEFAULT_COMPLEXITY; /* 第56天：读取任务复杂度，缺省按 medium 处理。 */
    const allowParallel = task.allowParallel ?? (task.taskType === "research" && complexity === "high"); /* 第56天：高复杂度研究任务默认允许并行探索。 */
    const targetFormat = task.targetFormat ?? (task.requiresJson || task.taskType === "json" ? "json" : "markdown"); /* 第56天：根据 JSON 需求推导默认输出格式。 */
    return { ...task, complexity, allowParallel, targetFormat }; /* 第56天：返回补齐默认字段后的任务副本。 */
  } /* 第56天：结束任务规范化方法。 */

  private planStages(task: CollaborationTask): CollaborationStage[] { /* 第56天：定义按任务类型生成阶段的规则入口。 */
    if (task.taskType === "embedding") return [this.stage("embedding", "embedding", "向量化任务只需要 Embedding（嵌入）模型生成向量。")]; /* 第56天：嵌入任务固定使用单个嵌入阶段。 */
    if (task.taskType === "evaluation" || task.taskType === "reflection") return [this.stage("evaluation", "evaluation", "评估或反思任务交给 Evaluation（评估）模型保证审慎检查。")]; /* 第56天：评估类任务固定使用评估模型。 */
    if (task.taskType === "json" || task.requiresJson) return this.planJsonTask(task); /* 第56天：结构化任务使用推理加 JSON 输出的流水线。 */
    if (task.taskType === "summary") return [this.stage("summary", "summary", "总结任务优先交给 Summary（摘要）角色以降低成本。")]; /* 第56天：总结任务使用摘要角色。 */
    if (task.taskType === "research" || task.taskType === "planning") return this.planResearchLikeTask(task); /* 第56天：研究或规划任务使用推理、写作与评估协作。 */
    return [this.stage("writing", "writing", "普通聊天任务使用 Writing（写作）角色直接生成回复。")]; /* 第56天：默认聊天任务使用写作角色单阶段完成。 */
  } /* 第56天：结束按任务类型生成阶段的规则入口。 */

  private planJsonTask(task: CollaborationTask): CollaborationStage[] { /* 第56天：定义 JSON 结构化任务的协作计划。 */
    const reasoning = this.stage("reasoning", "reasoning", "先由 Reasoning（推理）模型澄清字段、约束和边界。"); /* 第56天：创建前置推理阶段。 */
    const json = this.stage("json", "json", "再由 JSON（结构化）模型把推理结论整理成稳定 JSON。", [reasoning.id]); /* 第56天：创建依赖推理阶段的 JSON 输出阶段。 */
    return task.complexity === "high" ? [...[reasoning, json], this.stage("evaluation", "evaluation", "高复杂度 JSON 输出追加 Evaluation（评估）模型检查结构和遗漏。", [json.id])] : [reasoning, json]; /* 第56天：高复杂度时追加评估阶段，否则保持两阶段协作。 */
  } /* 第56天：结束 JSON 结构化任务协作计划。 */

  private planResearchLikeTask(task: CollaborationTask): CollaborationStage[] { /* 第56天：定义研究与规划类任务的协作计划。 */
    if (task.allowParallel) return this.planParallelResearchTask(task); /* 第56天：允许并行时生成多模型并行探索计划。 */
    const reasoning = this.stage("reasoning", "reasoning", "先由 Reasoning（推理）模型拆解问题、形成论证骨架。"); /* 第56天：创建串行推理阶段。 */
    const writing = this.stage("writing", "writing", "再由 Writing（写作）模型把推理骨架整理成用户可读答案。", [reasoning.id]); /* 第56天：创建依赖推理结果的写作阶段。 */
    const stages = [reasoning, writing]; /* 第56天：初始化研究类任务的基础流水线。 */
    if (task.complexity === "high") stages.push(this.stage("evaluation", "evaluation", "高复杂度任务最后由 Evaluation（评估）模型检查遗漏、偏差和可执行性。", [writing.id])); /* 第56天：高复杂度任务追加评估阶段。 */
    return stages; /* 第56天：返回串行研究类协作计划。 */
  } /* 第56天：结束研究与规划类任务协作计划。 */

  private planParallelResearchTask(task: CollaborationTask): CollaborationStage[] { /* 第56天：定义并行研究任务的协作计划。 */
    const reasoning = this.stage("reasoning", "reasoning", "并行探索一：Reasoning（推理）模型负责建立因果链和关键判断。", undefined, "parallel-research"); /* 第56天：创建并行推理阶段。 */
    const summary = this.stage("summary", "summary", "并行探索二：Summary（摘要）模型负责提炼背景信息和用户目标。", undefined, "parallel-research"); /* 第56天：创建并行摘要阶段。 */
    const writing = this.stage("writing", "writing", "Writing（写作）模型合并并行探索结果，形成统一答案。", [reasoning.id, summary.id]); /* 第56天：创建依赖两个并行阶段的写作阶段。 */
    const stages = [reasoning, summary, writing]; /* 第56天：初始化并行研究计划阶段列表。 */
    if (task.complexity === "high") stages.push(this.stage("evaluation", "evaluation", "Evaluation（评估）模型检查并行结果合并后的完整性与一致性。", [writing.id])); /* 第56天：高复杂度并行研究追加评估阶段。 */
    return stages; /* 第56天：返回并行研究协作计划。 */
  } /* 第56天：结束并行研究任务协作计划。 */

  private stage(id: string, role: ModelRole, reason: string, inputFrom?: string[], parallelGroup?: string): CollaborationStage { /* 第56天：定义创建阶段对象的帮助方法。 */
    const model = this.pickModelForRole(role); /* 第56天：根据角色从注册表中选择最合适的模型。 */
    return { id, role, modelId: model.id, inputFrom, parallelGroup, reason }; /* 第56天：返回携带模型、依赖、并行组和理由的阶段。 */
  } /* 第56天：结束创建阶段帮助方法。 */

  private pickModelForRole(role: ModelRole): ModelProfile { /* 第56天：定义按角色选择模型的方法。 */
    const candidates = this.registry.list().filter((model) => model.roles.includes(role)); /* 第56天：从注册表中筛选声明可承担该角色的模型。 */
    const sorted = candidates.sort((left, right) => this.scoreRoleModel(right, role) - this.scoreRoleModel(left, role)); /* 第56天：按角色匹配分排序，分数越高越优先。 */
    const chosen = sorted[0] ?? this.registry.list()[0]; /* 第56天：没有角色匹配时回退注册表首个模型，保证教学流程不中断。 */
    if (!chosen) throw new Error(`没有可用于角色 ${role} 的模型档案。`); /* 第56天：注册表为空时抛出明确错误。 */
    return chosen; /* 第56天：返回最终选择的模型档案。 */
  } /* 第56天：结束按角色选择模型方法。 */

  private scoreRoleModel(model: ModelProfile, role: ModelRole): number { /* 第56天：定义角色到模型的轻量评分函数。 */
    const roleScore = model.roles.includes(role) ? 100 : 0; /* 第56天：明确声明该角色是最高优先级。 */
    const qualityScore = role === "reasoning" && model.quality === "reasoning" ? 30 : model.quality === "strong" ? 15 : 5; /* 第56天：推理角色偏好 reasoning 质量档，其余角色偏好 strong。 */
    const speedScore = role === "summary" || role === "writing" ? (model.speed === "fast" ? 20 : model.speed === "medium" ? 12 : 4) : 0; /* 第56天：写作和摘要角色额外偏好低延迟模型。 */
    const costScore = Math.max(0, 10 - model.cost.inputPer1K * 1000); /* 第56天：成本越低得分越高，避免简单角色总是占用大模型。 */
    return roleScore + qualityScore + speedScore + costScore; /* 第56天：返回综合角色匹配分。 */
  } /* 第56天：结束角色模型评分函数。 */

  private inferStrategy(stages: CollaborationStage[]): CollaborationPlan["strategy"] { /* 第56天：定义根据阶段列表推导计划策略的方法。 */
    if (stages.length <= 1) return "single"; /* 第56天：只有一个阶段时视为单模型计划。 */
    if (stages.some((stage) => Boolean(stage.parallelGroup))) return "parallel"; /* 第56天：任意阶段带并行分组时视为并行协作计划。 */
    return "pipeline"; /* 第56天：多个阶段且无并行组时视为流水线协作计划。 */
  } /* 第56天：结束计划策略推导方法。 */

  private describePlan(task: CollaborationTask, stages: CollaborationStage[]): string { /* 第56天：定义计划级中文说明生成方法。 */
    const rolePath = stages.map((stage) => `${stage.role}:${stage.modelId}`).join(" -> "); /* 第56天：把角色和模型串成可读协作路径。 */
    return `任务 ${task.taskType} 使用 ${stages.length} 个阶段协作：${rolePath}。`; /* 第56天：返回简短计划说明。 */
  } /* 第56天：结束计划级中文说明生成方法。 */
} /* 第56天：结束 ModelCollaborationPlanner（模型协作规划器）。 */

export const modelCollaborationPlanner = new ModelCollaborationPlanner(); /* 第56天：导出共享模型协作规划器，供 API、测试和前端快照复用。 */
