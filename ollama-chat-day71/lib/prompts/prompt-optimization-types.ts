import type { PromptBlock, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第55天：引入提示词块和构建结果类型，供优化器描述输入输出。 */
export type PromptTaskType = "chat" | "research" | "planning" | "reflection" | "evaluation"; /* 第55天：定义动态提示词优化可识别的任务类型。 */
export type PromptComplexity = "low" | "medium" | "high"; /* 第55天：定义任务复杂度，用于决定是否加入高成本块。 */
export type PromptStrategy = "fast" | "balanced" | "quality"; /* 第55天：定义提示词策略，分别面向速度、平衡和质量。 */
export type PromptOptimizationContext = { /* 第55天：定义提示词优化上下文，用来回答当前任务需要什么块。 */
  taskType: PromptTaskType; /* 第55天：保存任务类型，例如 research、reflection 或 evaluation。 */
  hasMemory: boolean; /* 第55天：保存当前请求是否存在可用长期记忆。 */
  hasWorkspace: boolean; /* 第55天：保存当前请求是否存在共享工作空间。 */
  hasKnowledge: boolean; /* 第55天：保存当前请求是否存在知识库证据。 */
  requiresJson: boolean; /* 第55天：保存当前请求是否要求 JSON 结构化输出。 */
  requiresCitation: boolean; /* 第55天：保存当前请求是否要求引用或证据来源。 */
  complexity: PromptComplexity; /* 第55天：保存任务复杂度，影响反思和知识块启用。 */
  userIntent?: string; /* 第55天：可选保存用户意图摘要，便于推荐文案解释。 */
}; /* 第55天：结束提示词优化上下文定义。 */
export type PromptRule = { /* 第55天：定义提示词块规则，用条件描述应该开关哪些块。 */
  id: string; /* 第55天：保存规则唯一标识，便于调试命中原因。 */
  description: string; /* 第55天：保存规则说明，便于策略浏览器展示。 */
  when: (context: PromptOptimizationContext, strategy: PromptStrategy) => boolean; /* 第55天：保存规则条件函数，用上下文和策略判断是否命中。 */
  enableBlocks: string[]; /* 第55天：保存规则命中时需要启用的块 ID。 */
  disableBlocks: string[]; /* 第55天：保存规则命中时需要禁用的块 ID。 */
}; /* 第55天：结束提示词规则定义。 */
export type PromptEvaluationSignal = { /* 第55天：定义评估反馈信号，用弱点反向推动优化器。 */
  taskType: PromptTaskType; /* 第55天：保存评估反馈对应的任务类型。 */
  weakness: string; /* 第55天：保存评估系统发现的弱点，例如缺少引用。 */
  suggestedBlockId: string; /* 第55天：保存评估弱点建议开启的提示词块。 */
}; /* 第55天：结束评估反馈信号定义。 */
export type PromptRecommendation = { /* 第55天：定义提示词推荐结果。 */
  id: string; /* 第55天：保存推荐唯一标识。 */
  taskType: PromptTaskType; /* 第55天：保存推荐适用的任务类型。 */
  message: string; /* 第55天：保存面向用户的推荐说明。 */
  blockIds: string[]; /* 第55天：保存推荐涉及的提示词块 ID。 */
  expectedImpact: "speed" | "cost" | "quality" | "format"; /* 第55天：保存推荐预期改善方向。 */
}; /* 第55天：结束提示词推荐结果定义。 */
export type PromptOptimizationResult = { /* 第55天：定义一次 PromptOptimizer 输出结果。 */
  context: PromptOptimizationContext; /* 第55天：保存本次优化使用的上下文。 */
  strategy: PromptStrategy; /* 第55天：保存本次优化使用的策略。 */
  blocks: PromptBlock[]; /* 第55天：保存优化后可交给 PromptBuilder 的块列表。 */
  enabledBlockIds: string[]; /* 第55天：保存优化后启用的块 ID。 */
  disabledBlockIds: string[]; /* 第55天：保存优化后禁用的块 ID。 */
  appliedRuleIds: string[]; /* 第55天：保存本次命中的规则 ID。 */
  recommendations: PromptRecommendation[]; /* 第55天：保存优化器生成的推荐说明。 */
  estimatedTokens: number; /* 第55天：保存优化后启用块的估算词元数。 */
  estimatedCost: number; /* 第55天：保存优化后启用块的估算成本。 */
  optimizationTimeMs: number; /* 第55天：保存优化器本身耗时。 */
}; /* 第55天：结束优化结果定义。 */
export type PromptStrategyPreview = { /* 第55天：定义前端策略浏览器的一条策略预览。 */
  strategy: PromptStrategy; /* 第55天：保存策略名称。 */
  blocks: PromptBlock[]; /* 第55天：保存该策略启用的块列表。 */
  enabledBlockIds: string[]; /* 第55天：保存该策略启用的块 ID。 */
  estimatedTokens: number; /* 第55天：保存该策略估算词元数。 */
  estimatedCost: number; /* 第55天：保存该策略估算成本。 */
  recommendations: PromptRecommendation[]; /* 第55天：保存该策略产生的推荐。 */
}; /* 第55天：结束策略预览定义。 */
export type PromptOptimizationMetrics = { /* 第55天：定义提示词优化指标。 */
  avgPromptLength: number; /* 第55天：保存平均提示词长度。 */
  avgBlocks: number; /* 第55天：保存平均启用块数量。 */
  avgOptimizationTime: number; /* 第55天：保存平均优化耗时。 */
  recommendationHitRate: number; /* 第55天：保存推荐命中率，用于观察推荐是否被策略采纳。 */
  strategyUsage: Record<PromptStrategy, number>; /* 第55天：保存策略使用分布。 */
}; /* 第55天：结束提示词优化指标定义。 */
export type PromptOptimizationPreview = { /* 第55天：定义 Prompt Explorer 使用的动态优化预览。 */
  context: PromptOptimizationContext; /* 第55天：保存用于展示的样例上下文。 */
  strategyPreviews: PromptStrategyPreview[]; /* 第55天：保存三种策略的横向对比。 */
  selectedStrategy: PromptStrategy; /* 第55天：保存当前重点展示的策略。 */
  selectedResult: PromptOptimizationResult; /* 第55天：保存当前重点策略的完整优化结果。 */
  buildPreview: PromptBuildResult; /* 第55天：保存优化后再经 PromptBuilder 组合的预览。 */
  metrics: PromptOptimizationMetrics; /* 第55天：保存优化器整体观测指标。 */
  evaluationSignals: PromptEvaluationSignal[]; /* 第55天：保存评估系统反向提供给优化器的弱点信号。 */
}; /* 第55天：结束动态优化预览定义。 */
