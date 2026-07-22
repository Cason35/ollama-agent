export type RuntimeTaskType = "chat" | "research" | "planning" | "evaluation"; /* 第57天：定义运行时任务类型，聚焦聊天、研究、规划与评估四类入口。 */
export type RuntimeComplexity = "low" | "medium" | "high"; /* 第57天：定义运行时复杂度等级。 */
export type RuntimeLatencyPreference = "fast" | "balanced" | "quality"; /* 第57天：定义用户或系统对速度、平衡、质量的偏好。 */
export type RuntimeBudgetLevel = "low" | "medium" | "high"; /* 第57天：定义本次任务可接受的预算等级。 */
export type RuntimePromptStrategy = "fast" | "balanced" | "quality" | "json"; /* 第57天：定义 Prompt Strategy（提示词策略）枚举。 */
export type RuntimeModelStrategy = "small" | "balanced" | "reasoning" | "json" | "multi"; /* 第57天：定义 Model Strategy（模型策略）枚举。 */
export type RuntimeCollaborationStrategy = "direct" | "single-agent" | "agent-dag" | "model-collaboration"; /* 第57天：定义协作策略枚举。 */
export type RuntimeCacheStrategy = "cache-first" | "read-through" | "bypass"; /* 第57天：定义缓存策略枚举。 */
export type RuntimeRetrievalStrategy = "none" | "keyword" | "hybrid" | "deep-rag"; /* 第57天：定义检索策略枚举。 */
export type RuntimeMemoryStrategy = "none" | "short-term" | "long-term" | "workspace"; /* 第57天：定义记忆策略枚举。 */

export type RuntimeContext = { /* 第57天：定义 RuntimeContext（运行时上下文），描述当前任务环境。 */
  taskType: RuntimeTaskType; /* 第57天：保存当前任务类型。 */
  complexity: RuntimeComplexity; /* 第57天：保存当前任务复杂度。 */
  latencyPreference: RuntimeLatencyPreference; /* 第57天：保存速度、平衡或质量偏好。 */
  budgetLevel: RuntimeBudgetLevel; /* 第57天：保存预算等级。 */
  hasKnowledge: boolean; /* 第57天：标记是否存在知识库或检索证据。 */
  hasWorkspace: boolean; /* 第57天：标记是否存在工作空间上下文。 */
  hasMemory: boolean; /* 第57天：标记是否存在可用记忆。 */
  requiresJson: boolean; /* 第57天：标记是否要求 JSON 或结构化输出。 */
}; /* 第57天：结束 RuntimeContext 类型定义。 */

export type RuntimeDecision = { /* 第57天：定义 RuntimeDecision（运行时决策），描述系统最终选择的运行配置。 */
  promptStrategy: RuntimePromptStrategy; /* 第57天：保存提示词策略。 */
  modelStrategy: RuntimeModelStrategy; /* 第57天：保存模型策略。 */
  collaborationStrategy: RuntimeCollaborationStrategy; /* 第57天：保存协作策略。 */
  cacheStrategy: RuntimeCacheStrategy; /* 第57天：保存缓存策略。 */
  retrievalStrategy: RuntimeRetrievalStrategy; /* 第57天：保存检索策略。 */
  memoryStrategy: RuntimeMemoryStrategy; /* 第57天：保存记忆策略。 */
  estimatedCost: number; /* 第57天：保存本次决策的估算成本。 */
  estimatedLatencyMs: number; /* 第57天：保存本次决策的估算延迟毫秒数。 */
  decisionTimeMs: number; /* 第57天：保存决策引擎自身耗时。 */
  reasons: string[]; /* 第57天：保存可解释的规则命中说明。 */
}; /* 第57天：结束 RuntimeDecision 类型定义。 */

export type RuntimeDecisionRecord = { /* 第57天：定义 Decision Replay（决策回放）中的单条历史记录。 */
  decisionId: string; /* 第57天：保存决策记录唯一标识。 */
  context: RuntimeContext; /* 第57天：保存当时输入的运行时上下文。 */
  decision: RuntimeDecision; /* 第57天：保存当时输出的运行时决策。 */
  source: string; /* 第57天：保存决策来源，例如 api、chat-api 或 agent-runtime。 */
  traceId?: string; /* 第57天：保存可选 Trace ID，用于把决策和链路追踪关联起来。 */
  createdAt: number; /* 第57天：保存决策产生时间戳。 */
}; /* 第57天：结束 RuntimeDecisionRecord 类型定义。 */

export type RuntimeMetrics = { /* 第57天：定义 Runtime Metrics（运行时指标）。 */
  fastStrategyUsage: number; /* 第57天：统计 fast 或 cache-first 倾向的使用次数。 */
  balancedUsage: number; /* 第57天：统计 balanced 策略使用次数。 */
  qualityUsage: number; /* 第57天：统计 quality 或 multi 策略使用次数。 */
  avgDecisionTime: number; /* 第57天：统计平均决策耗时。 */
  avgEstimatedCost: number; /* 第57天：统计平均估算成本。 */
  avgEstimatedLatency: number; /* 第57天：统计平均估算延迟。 */
}; /* 第57天：结束 RuntimeMetrics 类型定义。 */

export type RuntimeDecisionPreview = { /* 第57天：定义 Runtime Explorer 中的典型决策预览。 */
  label: string; /* 第57天：保存预览场景名称。 */
  context: RuntimeContext; /* 第57天：保存预览输入上下文。 */
  decision: RuntimeDecision; /* 第57天：保存预览输出决策。 */
}; /* 第57天：结束 RuntimeDecisionPreview 类型定义。 */

export type RuntimeDashboardSnapshot = { /* 第57天：定义 Runtime Explorer 的完整看板快照。 */
  previews: RuntimeDecisionPreview[]; /* 第57天：保存典型场景决策预览。 */
  records: RuntimeDecisionRecord[]; /* 第57天：保存最近决策回放记录。 */
  metrics: RuntimeMetrics; /* 第57天：保存运行时决策指标。 */
  generatedAt: number; /* 第57天：保存看板快照生成时间。 */
}; /* 第57天：结束 RuntimeDashboardSnapshot 类型定义。 */
