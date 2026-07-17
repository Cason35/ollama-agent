import type { PromptBlock, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第55天：引入提示词块和构建结果类型。 */
import { sortBlocks } from "@/lib/prompts/prompt-block-registry"; /* 第55天：复用权重优先的提示词块排序规则。 */
import { promptBuilder } from "@/lib/prompts/prompt-builder"; /* 第55天：引入 PromptBuilder，便于优化后立即构建预览。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第55天：引入词元估算函数，用于策略成本预估。 */
import type { PromptEvaluationSignal, PromptOptimizationContext, PromptOptimizationMetrics, PromptOptimizationResult, PromptRecommendation, PromptRule, PromptStrategy } from "@/lib/prompts/prompt-optimization-types"; /* 第55天：引入动态提示词优化所需类型。 */
const TOKEN_COST_RATE = 0.000002; /* 第55天：定义演示用单词元成本，便于前端比较策略成本。 */
const DEFAULT_PROMPT_RULES: PromptRule[] = [ /* 第55天：定义默认提示词规则列表。 */
  { id: "memory-enabled", description: "有记忆时启用 Memory Block", when: (context) => context.hasMemory, enableBlocks: ["memory.context"], disableBlocks: [] }, /* 第55天：有记忆上下文时保留记忆块。 */
  { id: "memory-disabled", description: "无记忆时关闭 Memory Block", when: (context) => !context.hasMemory, enableBlocks: [], disableBlocks: ["memory.context", "memory.context.v2"] }, /* 第55天：没有记忆上下文时关闭记忆块。 */
  { id: "workspace-enabled", description: "有工作空间时启用 Workspace Block", when: (context) => context.hasWorkspace, enableBlocks: ["workspace.context"], disableBlocks: [] }, /* 第55天：有工作空间上下文时保留工作空间块。 */
  { id: "workspace-disabled", description: "无工作空间时关闭 Workspace Block", when: (context) => !context.hasWorkspace, enableBlocks: [], disableBlocks: ["workspace.context"] }, /* 第55天：没有工作空间时关闭工作空间块。 */
  { id: "knowledge-enabled", description: "研究或高复杂任务启用 Knowledge Block", when: (context, strategy) => context.hasKnowledge && (context.taskType === "research" || context.complexity === "high" || strategy === "quality"), enableBlocks: ["knowledge.context"], disableBlocks: [] }, /* 第55天：研究、高复杂度或质量策略启用知识块。 */
  { id: "knowledge-disabled", description: "无知识证据时关闭 Knowledge Block", when: (context) => !context.hasKnowledge, enableBlocks: [], disableBlocks: ["knowledge.context"] }, /* 第55天：没有知识证据时关闭知识块。 */
  { id: "json-enabled", description: "需要 JSON 时启用结构化输出块", when: (context) => context.requiresJson, enableBlocks: ["output.schema-json"], disableBlocks: [] }, /* 第55天：结构化输出需求开启 JSON Schema 块。 */
  { id: "json-disabled", description: "不需要 JSON 时关闭结构化输出块", when: (context) => !context.requiresJson, enableBlocks: [], disableBlocks: ["output.schema-json"] }, /* 第55天：非结构化任务关闭 JSON Schema 块。 */
  { id: "citation-enabled", description: "需要引用时启用 Citation Block", when: (context) => context.requiresCitation, enableBlocks: ["citation.requirements"], disableBlocks: [] }, /* 第55天：引用需求开启引用块。 */
  { id: "citation-disabled", description: "不需要引用时关闭 Citation Block", when: (context, strategy) => !context.requiresCitation && strategy !== "quality", enableBlocks: [], disableBlocks: ["citation.requirements"] }, /* 第55天：非引用任务在非质量策略下关闭引用块。 */
  { id: "reflection-enabled", description: "高复杂度或反思任务启用 Reflection Block", when: (context, strategy) => context.taskType === "reflection" || context.complexity === "high" || strategy === "quality", enableBlocks: ["reflection.checklist"], disableBlocks: [] }, /* 第55天：复杂任务和质量策略开启反思块。 */
  { id: "reflection-fast-disabled", description: "快速策略关闭 Reflection Block", when: (_context, strategy) => strategy === "fast", enableBlocks: [], disableBlocks: ["reflection.checklist"] }, /* 第55天：快速策略关闭高成本反思块。 */
  { id: "evaluation-enabled", description: "评估任务启用 Evaluation Rubric", when: (context) => context.taskType === "evaluation", enableBlocks: ["evaluation.rubric"], disableBlocks: [] }, /* 第55天：评估任务开启评估标准块。 */
  { id: "evaluation-disabled", description: "非评估任务关闭 Evaluation Rubric", when: (context) => context.taskType !== "evaluation", enableBlocks: [], disableBlocks: ["evaluation.rubric"] }, /* 第55天：非评估任务关闭评估标准块。 */
]; /* 第55天：结束默认提示词规则列表。 */
function round(value: number, digits = 4): number { /* 第55天：定义小数格式化函数，避免指标出现过长小数。 */
  return Number(value.toFixed(digits)); /* 第55天：按指定精度返回数字。 */
} /* 第55天：结束小数格式化函数。 */
function setBlockEnabled(blocks: Map<string, PromptBlock>, blockId: string, enabled: boolean): void { /* 第55天：定义安全开关块的工具函数。 */
  const block = blocks.get(blockId); /* 第55天：读取目标块。 */
  if (!block) return; /* 第55天：目标块不存在时保持优化器容错。 */
  blocks.set(blockId, { ...block, enabled }); /* 第55天：用不可变更新写回启用状态。 */
} /* 第55天：结束安全开关块工具函数。 */
function enabledTokens(blocks: PromptBlock[]): number { /* 第55天：定义启用块词元估算函数。 */
  return estimateTokenCount(blocks.filter((block) => block.enabled).map((block) => block.template).join("\n")); /* 第55天：只统计启用块模板正文的估算词元。 */
} /* 第55天：结束启用块词元估算函数。 */
function enabledPromptLength(blocks: PromptBlock[]): number { /* 第55天：定义启用块提示词长度估算函数。 */
  return blocks.filter((block) => block.enabled).reduce((sum, block) => sum + block.template.length, 0); /* 第55天：累计启用块模板长度。 */
} /* 第55天：结束启用块提示词长度估算函数。 */
function uniqueRecommendations(recommendations: PromptRecommendation[]): PromptRecommendation[] { /* 第55天：定义推荐去重函数。 */
  return Array.from(new Map(recommendations.map((recommendation) => [recommendation.id, recommendation])).values()); /* 第55天：按推荐 ID 去重并保留最后一次解释。 */
} /* 第55天：结束推荐去重函数。 */
export class PromptOptimizer { /* 第55天：定义 PromptOptimizer（提示词优化器）。 */
  constructor(private readonly rules: PromptRule[] = DEFAULT_PROMPT_RULES) {} /* 第55天：允许测试注入自定义规则，默认使用内置规则。 */
  optimize(blocks: PromptBlock[], context: PromptOptimizationContext, strategy: PromptStrategy = "balanced", evaluationSignals: PromptEvaluationSignal[] = []): PromptOptimizationResult { /* 第55天：定义根据上下文、策略和评估信号优化块列表的入口。 */
    const startedAt = Date.now(); /* 第55天：记录优化开始时间。 */
    const blockMap = new Map(blocks.map((block) => [block.id, { ...block, requiredVariables: [...(block.requiredVariables ?? [])] }])); /* 第55天：复制输入块，避免污染注册表或调用方状态。 */
    const appliedRuleIds: string[] = []; /* 第55天：初始化命中规则列表。 */
    for (const rule of this.rules) { /* 第55天：逐条检查规则是否命中。 */
      if (!rule.when(context, strategy)) continue; /* 第55天：规则未命中时跳过。 */
      appliedRuleIds.push(rule.id); /* 第55天：记录命中规则 ID。 */
      rule.enableBlocks.forEach((blockId) => setBlockEnabled(blockMap, blockId, true)); /* 第55天：执行规则声明的启用动作。 */
      rule.disableBlocks.forEach((blockId) => setBlockEnabled(blockMap, blockId, false)); /* 第55天：执行规则声明的禁用动作。 */
    } /* 第55天：结束规则遍历。 */
    for (const signal of evaluationSignals) { /* 第55天：遍历评估系统反馈的弱点信号。 */
      if (signal.taskType !== context.taskType) continue; /* 第55天：只采纳当前任务类型对应的评估信号。 */
      setBlockEnabled(blockMap, signal.suggestedBlockId, true); /* 第55天：按评估建议反向开启对应提示词块。 */
    } /* 第55天：结束评估信号遍历。 */
    const optimizedBlocks = Array.from(blockMap.values()).sort(sortBlocks); /* 第55天：按权重优先规则排序优化后的块。 */
    const enabledBlockIds = optimizedBlocks.filter((block) => block.enabled).map((block) => block.id); /* 第55天：收集启用块 ID。 */
    const disabledBlockIds = optimizedBlocks.filter((block) => !block.enabled).map((block) => block.id); /* 第55天：收集禁用块 ID。 */
    const estimatedTokens = enabledTokens(optimizedBlocks); /* 第55天：估算启用块词元数。 */
    const recommendations = this.recommend(context, strategy, enabledBlockIds, evaluationSignals); /* 第55天：生成面向用户的提示词推荐。 */
    return { context, strategy, blocks: optimizedBlocks, enabledBlockIds, disabledBlockIds, appliedRuleIds, recommendations, estimatedTokens, estimatedCost: round(estimatedTokens * TOKEN_COST_RATE, 6), optimizationTimeMs: Math.max(1, Date.now() - startedAt) }; /* 第55天：返回完整优化结果和观测指标。 */
  } /* 第55天：结束 optimize 入口。 */
  optimizeAndBuild(blocks: PromptBlock[], variables: Record<string, string | number | boolean | undefined | null>, context: PromptOptimizationContext, strategy: PromptStrategy = "balanced", evaluationSignals: PromptEvaluationSignal[] = []): { optimization: PromptOptimizationResult; build: PromptBuildResult } { /* 第55天：定义优化后立即构建提示词的便捷入口。 */
    const optimization = this.optimize(blocks, context, strategy, evaluationSignals); /* 第55天：先根据上下文完成块选择。 */
    const build = promptBuilder.buildPromptWithReport(optimization.blocks, variables); /* 第55天：再把优化后的块交给 PromptBuilder 渲染。 */
    return { optimization, build }; /* 第55天：返回优化结果和构建预览。 */
  } /* 第55天：结束优化并构建入口。 */
  recommend(context: PromptOptimizationContext, strategy: PromptStrategy, enabledBlockIds: string[], evaluationSignals: PromptEvaluationSignal[] = []): PromptRecommendation[] { /* 第55天：定义提示词推荐生成入口。 */
    const recommendations: PromptRecommendation[] = []; /* 第55天：初始化推荐列表。 */
    if (context.taskType === "research" && context.hasMemory && enabledBlockIds.includes("memory.context")) recommendations.push({ id: "research-memory", taskType: "research", message: "Research 任务建议保留 Memory Block，因为历史偏好和已知事实会提升连续研究质量。", blockIds: ["memory.context"], expectedImpact: "quality" }); /* 第55天：研究任务命中记忆块时生成质量推荐。 */
    if (context.requiresJson && enabledBlockIds.includes("output.schema-json")) recommendations.push({ id: "json-schema", taskType: context.taskType, message: "当前任务要求结构化输出，建议开启 JSON Output Schema Block。", blockIds: ["output.schema-json"], expectedImpact: "format" }); /* 第55天：JSON 需求命中结构块时生成格式推荐。 */
    if (context.requiresCitation && enabledBlockIds.includes("citation.requirements")) recommendations.push({ id: "citation-required", taskType: context.taskType, message: "当前任务需要引用依据，建议开启 Citation Block。", blockIds: ["citation.requirements"], expectedImpact: "quality" }); /* 第55天：引用需求命中引用块时生成证据推荐。 */
    if (context.complexity === "high" && strategy !== "fast" && enabledBlockIds.includes("reflection.checklist")) recommendations.push({ id: "high-complexity-reflection", taskType: context.taskType, message: "高复杂度任务建议开启 Reflection Block，以降低遗漏和逻辑漂移。", blockIds: ["reflection.checklist"], expectedImpact: "quality" }); /* 第55天：高复杂度任务命中反思块时生成质量推荐。 */
    for (const signal of evaluationSignals) if (signal.taskType === context.taskType && enabledBlockIds.includes(signal.suggestedBlockId)) recommendations.push({ id: `evaluation-${signal.suggestedBlockId}`, taskType: signal.taskType, message: `Evaluation 弱点“${signal.weakness}”建议开启 ${signal.suggestedBlockId}。`, blockIds: [signal.suggestedBlockId], expectedImpact: "quality" }); /* 第55天：把评估弱点转换为提示词优化推荐。 */
    return uniqueRecommendations(recommendations); /* 第55天：返回去重后的推荐列表。 */
  } /* 第55天：结束推荐生成入口。 */
  calculateMetrics(results: PromptOptimizationResult[]): PromptOptimizationMetrics { /* 第55天：定义优化器指标聚合入口。 */
    const total = Math.max(1, results.length); /* 第55天：计算样本总数并避免除零。 */
    const strategyUsage = { fast: 0, balanced: 0, quality: 0 } satisfies Record<PromptStrategy, number>; /* 第55天：初始化三种策略的使用次数。 */
    results.forEach((result) => { strategyUsage[result.strategy] += 1; }); /* 第55天：统计策略使用分布。 */
    const recommendationTotal = results.reduce((sum, result) => sum + result.recommendations.length, 0); /* 第55天：统计推荐总数。 */
    const recommendationHits = results.reduce((sum, result) => sum + result.recommendations.filter((recommendation) => recommendation.blockIds.some((blockId) => result.enabledBlockIds.includes(blockId))).length, 0); /* 第55天：统计推荐涉及块已被启用的次数。 */
    const avgPromptLength = round(results.reduce((sum, result) => sum + enabledPromptLength(result.blocks), 0) / total, 2); /* 第55天：计算平均启用提示词长度。 */
    const avgBlocks = round(results.reduce((sum, result) => sum + result.enabledBlockIds.length, 0) / total, 2); /* 第55天：计算平均启用块数量。 */
    const avgOptimizationTime = round(results.reduce((sum, result) => sum + result.optimizationTimeMs, 0) / total, 2); /* 第55天：计算平均优化耗时。 */
    const recommendationHitRate = recommendationTotal === 0 ? 0 : round(recommendationHits / recommendationTotal, 4); /* 第55天：计算推荐命中率。 */
    return { avgPromptLength, avgBlocks, avgOptimizationTime, recommendationHitRate, strategyUsage }; /* 第55天：返回动态提示词优化指标。 */
  } /* 第55天：结束优化器指标聚合入口。 */
} /* 第55天：结束 PromptOptimizer 类定义。 */
export const promptOptimizer = new PromptOptimizer(); /* 第55天：导出共享 PromptOptimizer 单例，供运行时、看板和测试复用。 */
