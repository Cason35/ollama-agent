import { TraceManager } from "@/lib/agents/trace-manager"; /* 第56天：引入 TraceManager（追踪管理器），用于记录协作计划与每个模型阶段。 */
import { modelRegistry } from "@/lib/model/default-models"; /* 第56天：引入共享模型注册表，用于读取模型成本和提供方信息。 */
import { mergeResults } from "@/lib/model/model-collaboration-merge"; /* 第56天：引入模型结果合并函数，用于生成最终答案。 */
import type { CollaborationExecutionResult, CollaborationPlan, CollaborationStage, CollaborationStageResult, CollaborationStageUsage, CollaborationTask, ModelCollaborationCallResult } from "@/lib/model/model-collaboration-types"; /* 第56天：引入协作计划、阶段、任务和执行结果类型。 */
import { modelExecutor, type ModelExecutorCallInput } from "@/lib/model/model-executor"; /* 第56天：引入既有模型执行器，复用 fallback、熔断和真实模型调用能力。 */
import type { ModelProfile } from "@/lib/model/model-profile-types"; /* 第56天：引入模型档案类型，用于成本估算。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第56天：引入模型注册表类型，支持测试注入隔离模型团队。 */
import type { ModelRuntime } from "@/lib/model/model-runtime"; /* 第56天：引入模型运行时类型，便于 API 透传本地或 MiMo 调用配置。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第56天：引入词元估算函数，用于协作阶段 Usage 记录。 */
import { UsageManager } from "@/lib/usage/usage-manager"; /* 第56天：引入 UsageManager（用量管理器），用于记录每个协作阶段成本。 */

export type CollaborationExecutorClient = { /* 第56天：定义协作执行器依赖的最小模型调用客户端，便于测试用假模型替换真实模型。 */
  call(input: ModelExecutorCallInput): Promise<ModelCollaborationCallResult>; /* 第56天：声明调用方法，入参与既有 ModelExecutor 保持一致。 */
}; /* 第56天：结束最小模型调用客户端定义。 */

export type ModelCollaborationExecutorOptions = { /* 第56天：定义执行协作计划时的可选配置。 */
  runtime?: ModelRuntime; /* 第56天：保存可选模型运行时配置。 */
  traceManager?: TraceManager; /* 第56天：保存可选外部 TraceManager，用于把协作链路接到更大的任务 Trace 中。 */
  usageManager?: UsageManager; /* 第56天：保存可选外部 UsageManager，用于把协作成本接到全局用量系统。 */
  degradedOutput?: string; /* 第56天：保存模型全部失败时的阶段级降级输出。 */
}; /* 第56天：结束协作执行器可选配置定义。 */

export class ModelCollaborationExecutor { /* 第56天：定义 ModelCollaborationExecutor（模型协作执行器），负责串行、并行、上下文传递和结果合并。 */
  constructor(private readonly registry: ModelRegistry = modelRegistry, private readonly client: CollaborationExecutorClient = modelExecutor) {} /* 第56天：默认使用共享模型注册表和真实模型执行器，并支持测试注入。 */

  async executePlan(plan: CollaborationPlan, task?: CollaborationTask, options: ModelCollaborationExecutorOptions = {}): Promise<CollaborationExecutionResult> { /* 第56天：定义执行协作计划入口，兼容只传 plan 或额外传 task 上下文。 */
    const startedAt = Date.now(); /* 第56天：记录整次协作开始时间。 */
    const traceManager = options.traceManager ?? new TraceManager(); /* 第56天：准备 TraceManager，未传入时为本次执行创建隔离追踪器。 */
    const usageManager = options.usageManager ?? new UsageManager(); /* 第56天：准备 UsageManager，未传入时为本次执行创建隔离用量管理器。 */
    const trace = traceManager.startTrace(`model-collaboration:${plan.taskId}`); /* 第56天：开始一条模型协作 Trace。 */
    const rootSpanId = traceManager.startSpan(trace.traceId, { name: "model-collaboration-plan", type: "collaboration", metadata: { taskId: plan.taskId, strategy: plan.strategy, stageCount: plan.stages.length } }); /* 第56天：创建协作计划根 Span。 */
    const resultStore = new Map<string, CollaborationStageResult>(); /* 第56天：创建阶段结果存储，用于依赖检查和上下文传递。 */
    const pending = [...plan.stages]; /* 第56天：复制待执行阶段列表，避免修改计划对象。 */
    const orderedResults: CollaborationStageResult[] = []; /* 第56天：保存按完成顺序追加的阶段结果。 */
    while (pending.length > 0) { /* 第56天：只要仍有未执行阶段就继续调度。 */
      const batch = this.pickRunnableBatch(pending, resultStore); /* 第56天：挑选当前可执行的一批阶段，可能是一个并行组。 */
      if (batch.length === 0) throw new Error(`协作计划 ${plan.taskId} 存在无法满足的阶段依赖。`); /* 第56天：没有可运行阶段说明依赖配置错误。 */
      const batchResults = await Promise.all(batch.map((stage) => this.executeStage(plan, stage, task, resultStore, traceManager, trace.traceId, rootSpanId, usageManager, options))); /* 第56天：并行执行当前批次中的全部阶段。 */
      batchResults.forEach((result) => { resultStore.set(result.stageId, result); orderedResults.push(result); }); /* 第56天：把批次结果写入结果存储并保持完成顺序。 */
      batch.forEach((stage) => this.removePendingStage(pending, stage.id)); /* 第56天：从待执行列表中移除已经完成的阶段。 */
    } /* 第56天：结束协作阶段调度循环。 */
    const merged = mergeResults(orderedResults); /* 第56天：把多个模型阶段输出合并成最终答案。 */
    const totalCost = this.roundCost(orderedResults.reduce((sum, result) => sum + result.usage.estimatedCost, 0)); /* 第56天：累加所有阶段的估算成本。 */
    traceManager.endSpan(trace.traceId, rootSpanId, orderedResults.every((result) => result.success) ? "success" : "failed", { totalCost, resultCount: orderedResults.length, sourceStageIds: merged.sourceStageIds }); /* 第56天：结束协作根 Span 并写入成本和结果数量。 */
    traceManager.endTrace(trace.traceId); /* 第56天：结束整条协作 Trace，兜底关闭仍在运行的 Span。 */
    return { plan, stageResults: orderedResults, merged, totalDurationMs: Math.max(1, Date.now() - startedAt), totalCost, trace: traceManager.getTrace(trace.traceId), usageRecords: usageManager.listRecords() }; /* 第56天：返回完整协作执行结果、Trace 和 Usage 快照。 */
  } /* 第56天：结束执行协作计划入口。 */

  private pickRunnableBatch(pending: CollaborationStage[], resultStore: Map<string, CollaborationStageResult>): CollaborationStage[] { /* 第56天：定义选择当前可执行阶段批次的方法。 */
    const runnable = pending.filter((stage) => this.dependenciesReady(stage, resultStore)); /* 第56天：筛出所有上游依赖已完成的阶段。 */
    const first = runnable[0]; /* 第56天：读取当前批次的第一个候选阶段。 */
    if (!first) return []; /* 第56天：没有候选阶段时返回空数组。 */
    if (!first.parallelGroup) return [first]; /* 第56天：没有并行分组时保持串行执行一个阶段。 */
    return runnable.filter((stage) => stage.parallelGroup === first.parallelGroup); /* 第56天：有并行分组时同组阶段一起执行。 */
  } /* 第56天：结束选择当前可执行阶段批次的方法。 */

  private dependenciesReady(stage: CollaborationStage, resultStore: Map<string, CollaborationStageResult>): boolean { /* 第56天：定义判断阶段依赖是否满足的方法。 */
    return (stage.inputFrom ?? []).every((stageId) => resultStore.has(stageId)); /* 第56天：所有上游阶段都有结果时才允许执行。 */
  } /* 第56天：结束阶段依赖判断方法。 */

  private async executeStage(plan: CollaborationPlan, stage: CollaborationStage, task: CollaborationTask | undefined, resultStore: Map<string, CollaborationStageResult>, traceManager: TraceManager, traceId: string, parentSpanId: string, usageManager: UsageManager, options: ModelCollaborationExecutorOptions): Promise<CollaborationStageResult> { /* 第56天：定义执行单个协作阶段的方法。 */
    const startedAt = Date.now(); /* 第56天：记录阶段开始时间。 */
    const input = this.buildStageInput(plan, stage, task, resultStore); /* 第56天：根据原始任务和上游阶段输出构造本阶段输入。 */
    const spanId = traceManager.startSpan(traceId, { parentSpanId, name: `model-stage:${stage.id}`, type: "collaboration", metadata: { taskId: plan.taskId, stageId: stage.id, role: stage.role, plannedModelId: stage.modelId, inputFrom: stage.inputFrom ?? [] } }); /* 第56天：为该模型阶段创建 collaboration Span。 */
    const callResult = await this.client.call({ modelId: stage.modelId, prompt: input, options: { runtime: options.runtime, degradedOutput: options.degradedOutput ?? `阶段 ${stage.id} 暂时无法获得真实模型输出，已返回教学降级结果。` } }); /* 第56天：调用底层模型执行器，复用 fallback、熔断和超时逻辑。 */
    const profile = this.resolveProfile(callResult.modelId || stage.modelId); /* 第56天：读取最终模型档案，用于成本估算和用量记录。 */
    const output = callResult.output ?? ""; /* 第56天：规范化阶段输出文本。 */
    const usage = this.estimateUsage(profile, input, output); /* 第56天：估算该阶段输入输出词元和成本。 */
    const result: CollaborationStageResult = { stageId: stage.id, role: stage.role, modelId: callResult.modelId, plannedModelId: stage.modelId, input, output, success: callResult.success, fallbackUsed: callResult.fallbackUsed, fallbackChain: callResult.fallbackChain, durationMs: Math.max(1, callResult.durationMs || Date.now() - startedAt), usage, error: callResult.error }; /* 第56天：组装阶段执行结果。 */
    usageManager.addRecord({ traceId, spanId: spanId || stage.id, componentType: "collaboration", componentId: `model-collaboration:${stage.role}`, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estimatedCost: usage.estimatedCost, durationMs: result.durationMs, modelId: result.modelId, provider: profile.provider, modelName: profile.model, fallbackUsed: result.fallbackUsed, fallbackChain: result.fallbackChain, collaborationId: plan.taskId, collaborationStageId: stage.id, collaborationRole: stage.role }); /* 第56天：把阶段用量写入 UsageManager 并标记协作维度。 */
    traceManager.endSpan(traceId, spanId, result.success ? "success" : "failed", { modelId: result.modelId, plannedModelId: result.plannedModelId, role: result.role, durationMs: result.durationMs, totalTokens: usage.totalTokens, estimatedCost: usage.estimatedCost, fallbackUsed: result.fallbackUsed, error: result.error }); /* 第56天：结束阶段 Trace Span 并写入模型、词元、成本和 fallback 信息。 */
    return result; /* 第56天：返回阶段执行结果。 */
  } /* 第56天：结束执行单个协作阶段的方法。 */

  private buildStageInput(plan: CollaborationPlan, stage: CollaborationStage, task: CollaborationTask | undefined, resultStore: Map<string, CollaborationStageResult>): string { /* 第56天：定义阶段输入构造方法，实现 Context Passing（上下文传递）。 */
    const basePrompt = task?.prompt?.trim() || `请完成协作任务 ${plan.taskId}。`; /* 第56天：优先使用原始任务文本，没有时用任务 ID 生成兜底提示。 */
    const format = task?.targetFormat ? `目标格式：${task.targetFormat}` : "目标格式：自然语言"; /* 第56天：读取目标输出格式说明。 */
    const upstream = (stage.inputFrom ?? []).map((stageId) => resultStore.get(stageId)).filter((result): result is CollaborationStageResult => Boolean(result)); /* 第56天：按 inputFrom 收集上游阶段结果。 */
    const upstreamText = upstream.map((result) => `【${result.stageId} / ${result.role}】\n${result.output}`).join("\n\n"); /* 第56天：把上游结果整理成清晰的上下文片段。 */
    const roleInstruction = `你是多模型协作中的 ${stage.role} 模型阶段，请只完成本阶段职责。`; /* 第56天：为当前角色生成阶段职责说明。 */
    return upstreamText ? `${roleInstruction}\n${format}\n原始任务：${basePrompt}\n\n上游阶段输出：\n${upstreamText}` : `${roleInstruction}\n${format}\n原始任务：${basePrompt}`; /* 第56天：有上游结果时附加上下文，否则只发送原始任务。 */
  } /* 第56天：结束阶段输入构造方法。 */

  private estimateUsage(profile: ModelProfile, input: string, output: string): CollaborationStageUsage { /* 第56天：定义基于模型档案估算阶段用量的方法。 */
    const inputTokens = estimateTokenCount(input); /* 第56天：估算输入词元数。 */
    const outputTokens = estimateTokenCount(output); /* 第56天：估算输出词元数。 */
    const estimatedCost = this.roundCost(inputTokens / 1000 * profile.cost.inputPer1K + outputTokens / 1000 * profile.cost.outputPer1K); /* 第56天：按模型每千词元单价估算成本。 */
    return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCost }; /* 第56天：返回完整阶段用量摘要。 */
  } /* 第56天：结束基于模型档案估算阶段用量的方法。 */

  private resolveProfile(modelId: string): ModelProfile { /* 第56天：定义读取模型档案并兜底的方法。 */
    const model = this.registry.get(modelId); /* 第56天：按模型 ID 从注册表读取档案。 */
    if (model) return model; /* 第56天：命中模型档案时直接返回。 */
    const fallback = this.registry.list()[0]; /* 第56天：未命中时读取注册表首个模型作为兜底。 */
    if (fallback) return fallback; /* 第56天：存在兜底模型时返回它。 */
    throw new Error("ModelRegistry（模型注册表）为空，无法估算协作阶段用量。"); /* 第56天：注册表为空时抛出明确错误。 */
  } /* 第56天：结束读取模型档案并兜底的方法。 */

  private removePendingStage(pending: CollaborationStage[], stageId: string): void { /* 第56天：定义从待执行列表移除阶段的方法。 */
    const index = pending.findIndex((stage) => stage.id === stageId); /* 第56天：查找目标阶段在待执行列表中的位置。 */
    if (index >= 0) pending.splice(index, 1); /* 第56天：找到后原地移除，保留其他阶段顺序。 */
  } /* 第56天：结束从待执行列表移除阶段的方法。 */

  private roundCost(value: number): number { /* 第56天：定义统一成本精度处理方法。 */
    return Number(value.toFixed(8)); /* 第56天：成本统一保留八位小数，便于测试稳定断言。 */
  } /* 第56天：结束统一成本精度处理方法。 */
} /* 第56天：结束 ModelCollaborationExecutor（模型协作执行器）。 */

export const modelCollaborationExecutor = new ModelCollaborationExecutor(); /* 第56天：导出共享模型协作执行器，供 API 与测试复用。 */
