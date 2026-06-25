export type ModelProfileProvider = "ollama" | "openai" | "anthropic" | "local"; /* 第51天：沿用 ModelProfile（模型档案）支持的提供方枚举。 */

export type ModelSpeed = "fast" | "medium" | "slow"; /* 第51天：沿用模型速度档位，用于按延迟偏好与备用模型选择。 */

export type ModelQuality = "basic" | "strong" | "reasoning"; /* 第51天：沿用模型质量档位，用于按复杂度与降级策略路由。 */

export type ModelCapability = "chat" | "summary" | "reasoning" | "planning" | "json" | "embedding" | "evaluation" | "reflection"; /* 第51天：沿用模型能力标签集合，供路由与备用模型链复用。 */

export type ModelCost = { /* 第51天：定义模型按每千词元计费的成本结构。 */
  inputPer1K: number; /* 第51天：保存每千输入词元的美元单价。 */
  outputPer1K: number; /* 第51天：保存每千输出词元的美元单价。 */
}; /* 第51天：结束模型成本结构定义。 */

export type ModelLimits = { /* 第51天：定义模型的上下文与输出限制结构。 */
  contextWindow: number; /* 第51天：保存模型支持的最大上下文窗口词元数。 */
  maxOutputTokens: number; /* 第51天：保存模型单次允许生成的最大输出词元数。 */
}; /* 第51天：结束模型限制结构定义。 */

export type ModelProfile = { /* 第51天：定义 ModelProfile（模型档案），描述一个可路由且可降级的逻辑模型。 */
  id: string; /* 第51天：保存逻辑模型的唯一标识，例如 small-chat。 */
  name: string; /* 第51天：保存模型的可读展示名称。 */
  provider: ModelProfileProvider; /* 第51天：保存模型提供方，例如 ollama 或 openai。 */
  model: string; /* 第51天：保存实际调用时使用的底层模型名，例如 qwen2.5:14b。 */
  capabilities: ModelCapability[]; /* 第51天：保存模型擅长的能力标签列表。 */
  cost: ModelCost; /* 第51天：保存模型的输入与输出计费单价。 */
  limits: ModelLimits; /* 第51天：保存模型的上下文窗口与最大输出限制。 */
  speed: ModelSpeed; /* 第51天：保存模型的速度档位。 */
  quality: ModelQuality; /* 第51天：保存模型的质量档位。 */
  fallbackModelIds?: string[]; /* 第51天：保存当前模型失败后按顺序尝试的备用模型 id 列表。 */
  timeoutMs?: number; /* 第51天：保存单次模型调用的超时毫秒数，未设置时使用执行器默认值。 */
  maxRetries?: number; /* 第51天：保存同一模型失败后的最大重试次数，未设置时使用执行器默认值。 */
}; /* 第51天：结束 ModelProfile（模型档案）类型定义。 */

export type ModelCallResult = { /* 第51天：定义 ModelCallResult（模型调用结果），统一描述主模型、备用模型与降级响应。 */
  modelId: string; /* 第51天：保存最终返回结果或最终降级归属的模型 id。 */
  success: boolean; /* 第51天：标记本次模型调用是否获得真实模型成功响应。 */
  output?: string; /* 第51天：保存成功输出或降级响应文本。 */
  error?: string; /* 第51天：保存最后一次失败的错误信息。 */
  fallbackUsed?: boolean; /* 第51天：标记本次调用是否从主模型切换到了备用模型。 */
  fallbackChain?: string[]; /* 第51天：保存本次调用实际尝试或跳过的模型链路。 */
  durationMs: number; /* 第51天：保存本次调用从开始到返回的总耗时。 */
}; /* 第51天：结束 ModelCallResult（模型调用结果）类型定义。 */

export type CircuitState = "closed" | "open" | "half_open"; /* 第51天：定义熔断器状态，closed 正常、open 熔断、half_open 试探恢复。 */

export type CircuitBreakerState = { /* 第51天：定义 CircuitBreakerState（熔断器状态）基础结构。 */
  modelId: string; /* 第51天：保存该状态所属的模型 id。 */
  state: CircuitState; /* 第51天：保存当前熔断状态。 */
  failureCount: number; /* 第51天：保存连续失败次数，用于达到阈值后打开熔断。 */
  openedAt?: number; /* 第51天：保存最近一次进入 open（熔断开启）的时间戳。 */
  lastFailureAt?: number; /* 第51天：保存最近一次失败时间戳。 */
}; /* 第51天：结束 CircuitBreakerState（熔断器状态）基础结构。 */

export type ModelHealthState = CircuitBreakerState & { /* 第51天：定义 ModelHealthState（模型健康状态），扩展熔断器基础状态用于仪表盘展示。 */
  requestCount: number; /* 第51天：保存参与健康统计的调用次数。 */
  successCount: number; /* 第51天：保存成功调用次数。 */
  skippedCount: number; /* 第51天：保存因熔断而被路由器或执行器跳过的次数。 */
  fallbackUsedCount: number; /* 第51天：保存该模型触发备用链的次数。 */
  successRate: number; /* 第51天：保存成功率，取值 0 到 1。 */
  lastSuccessAt?: number; /* 第51天：保存最近一次成功时间戳。 */
}; /* 第51天：结束 ModelHealthState（模型健康状态）定义。 */

export type ModelHealthSnapshot = { /* 第51天：定义 Model Health Dashboard（模型健康仪表盘）快照。 */
  models: ModelHealthState[]; /* 第51天：保存所有模型的健康状态列表。 */
  openModelCount: number; /* 第51天：保存当前处于 open 熔断状态的模型数量。 */
  fallbackUsedCount: number; /* 第51天：保存所有模型累计触发备用链的次数。 */
  generatedAt: number; /* 第51天：保存健康快照生成时间戳。 */
}; /* 第51天：结束模型健康快照定义。 */

export type ModelTaskType = "chat" | "summary" | "planning" | "reflection" | "evaluation" | "embedding" | "json"; /* 第51天：沿用 ModelRoutingInput（模型路由输入）支持的任务类型。 */

export type ModelComplexity = "low" | "medium" | "high"; /* 第50天：定义任务复杂度档位，用于驱动大小模型选择。 */

export type LatencyPreference = "fast" | "balanced" | "quality"; /* 第50天：定义延迟偏好，用于在速度与质量之间权衡。 */

export type ModelRoutingInput = { /* 第50天：定义 ModelRoutingInput（模型路由输入），描述一次任务的路由诉求。 */
  taskType: ModelTaskType; /* 第50天：保存当前任务类型，是路由的首要依据。 */
  complexity?: ModelComplexity; /* 第50天：保存任务复杂度，缺省按 medium 处理。 */
  requiresJson?: boolean; /* 第50天：标记任务是否要求严格结构化 JSON 输出。 */
  maxCost?: number; /* 第50天：保存任务可接受的每千词元成本上限。 */
  latencyPreference?: LatencyPreference; /* 第50天：保存任务的延迟偏好。 */
}; /* 第50天：结束 ModelRoutingInput（模型路由输入）类型定义。 */

export type ModelRoutingDecision = { /* 第50天：定义一次路由的完整决策结果，便于解释与观测。 */
  model: ModelProfile; /* 第50天：保存最终被选中的模型档案。 */
  matchedRule: string; /* 第50天：保存命中的路由规则标识，例如 embedding 或 complexity-high。 */
  reason: string; /* 第50天：保存可供前端展示的中文路由理由。 */
  candidates: string[]; /* 第50天：保存参与本次路由的候选模型 id 列表。 */
  skippedByCircuit?: string[]; /* 第51天：保存因 Circuit Breaker（熔断器）开启而被跳过的模型 id。 */
}; /* 第50天：结束模型路由决策类型定义。 */

export type ModelProfileSummary = ModelProfile & { /* 第50天：定义 Model Explorer（模型浏览器）展示用的模型摘要。 */
  capabilityCount: number; /* 第50天：保存模型能力数量，方便前端快速展示。 */
}; /* 第50天：结束模型摘要类型定义。 */

export type ModelRoutingPreview = { /* 第50天：定义 Model Explorer 展示的一次路由预览。 */
  label: string; /* 第50天：保存路由场景的中文标签，例如“简单总结”。 */
  input: ModelRoutingInput; /* 第50天：保存触发本次路由的输入。 */
  decision: ModelRoutingDecision; /* 第50天：保存本次路由的决策结果。 */
}; /* 第50天：结束模型路由预览类型定义。 */

export type ModelRegistryMetrics = { /* 第50天：定义 ModelRegistry（模型注册表）的统计指标。 */
  totalModels: number; /* 第50天：保存注册表中的模型总数。 */
  providerDistribution: Record<string, number>; /* 第50天：保存各提供方的模型数量分布。 */
  capabilityCoverage: number; /* 第50天：保存注册表覆盖的去重能力数量。 */
  speedDistribution: Record<ModelSpeed, number>; /* 第50天：保存各速度档位的模型数量分布。 */
  qualityDistribution: Record<ModelQuality, number>; /* 第50天：保存各质量档位的模型数量分布。 */
  cheapestModelId: string | null; /* 第50天：保存输入单价最低的模型标识。 */
  fastestModelCount: number; /* 第50天：保存速度为 fast 的模型数量。 */
}; /* 第50天：结束模型注册表指标定义。 */

export type ModelSnapshot = { /* 第50天：定义 Model Explorer（模型浏览器）的一次完整快照。 */
  models: ModelProfileSummary[]; /* 第50天：保存全部模型档案摘要。 */
  metrics: ModelRegistryMetrics; /* 第50天：保存模型注册表指标。 */
  routingPreviews: ModelRoutingPreview[]; /* 第50天：保存若干典型任务的路由预览。 */
  health: ModelHealthSnapshot; /* 第51天：保存 Model Health Dashboard（模型健康仪表盘）需要的熔断与备用链快照。 */
  generatedAt: number; /* 第50天：保存快照生成时间戳。 */
}; /* 第50天：结束模型快照定义。 */
