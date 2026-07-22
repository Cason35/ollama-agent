export type UsageComponentType = "agent" | "tool" | "reflection" | "evaluation" | "collaboration"; /* 第56天：扩展 collaboration（模型协作）组件类型，用于记录多模型阶段成本。 */

export type UsageRecord = { /* 第51天：定义单次组件执行产生的统一用量记录。 */
  traceId: string; /* 第47天：关联一次完整任务的 Trace（追踪记录）标识。 */
  spanId: string; /* 第47天：关联 Trace 内具体执行阶段的 Span（跨度）标识。 */
  componentType: UsageComponentType; /* 第47天：区分智能体、工具、反思和评估组件。 */
  componentId: string; /* 第47天：保存具体智能体或工具的稳定标识。 */
  inputTokens: number; /* 第47天：保存本次执行消费的输入词元数。 */
  outputTokens: number; /* 第47天：保存本次执行生成的输出词元数。 */
  totalTokens: number; /* 第47天：保存输入与输出词元之和。 */
  estimatedCost: number; /* 第47天：保存按组件价格模型估算的美元费用。 */
  durationMs: number; /* 第47天：保存组件执行耗时毫秒数。 */
  modelId?: string; /* 第50天：保存本次执行经 ModelRouter 路由出的逻辑模型 id，用于成本归因。 */
  provider?: string; /* 第50天：保存本次执行使用模型的提供方，例如 ollama。 */
  modelName?: string; /* 第50天：保存本次执行使用的底层模型名，例如 qwen2.5:14b。 */
  fallbackUsed?: boolean; /* 第51天：保存本次执行是否触发备用模型链。 */
  fallbackChain?: string[]; /* 第51天：保存本次执行实际尝试或跳过的备用模型链路。 */
  circuitState?: string; /* 第51天：保存记录写入时最终模型的熔断器状态。 */
  promptId?: string; /* 第52天：保存本次调用使用的 Prompt（提示词）唯一标识。 */
  promptVersion?: string; /* 第52天：保存本次调用使用的 Prompt Version（提示词版本）。 */
  collaborationId?: string; /* 第56天：保存本次用量所属的模型协作任务 ID。 */
  collaborationStageId?: string; /* 第56天：保存本次用量所属的模型协作阶段 ID。 */
  collaborationRole?: string; /* 第56天：保存本次用量所属的模型协作角色。 */
  createdAt: number; /* 第47天：保存用量记录创建时间戳。 */
}; /* 第47天：结束 UsageRecord（用量记录）类型定义。 */

export type UsageRecordInput = Omit<UsageRecord, "totalTokens" | "estimatedCost" | "createdAt"> & Partial<Pick<UsageRecord, "totalTokens" | "estimatedCost" | "createdAt">>; /* 第47天：允许管理器统一补齐派生字段与时间戳。 */

export type UsageAggregate = { /* 第47天：定义一组用量记录的聚合结果。 */
  key: string; /* 第47天：保存 Trace 或组件的分组键。 */
  componentType?: UsageComponentType; /* 第47天：按组件聚合时保存组件类型。 */
  componentId?: string; /* 第47天：按组件聚合时保存组件标识。 */
  recordCount: number; /* 第47天：保存参与聚合的记录数量。 */
  inputTokens: number; /* 第47天：保存聚合输入词元数。 */
  outputTokens: number; /* 第47天：保存聚合输出词元数。 */
  totalTokens: number; /* 第47天：保存聚合总词元数。 */
  estimatedCost: number; /* 第47天：保存聚合预估费用。 */
  durationMs: number; /* 第47天：保存聚合耗时。 */
}; /* 第47天：结束 UsageAggregate（用量聚合）类型定义。 */

export type ExpensiveComponent = { /* 第47天：定义成本最高组件摘要。 */
  componentId: string; /* 第47天：保存成本最高组件标识。 */
  estimatedCost: number; /* 第47天：保存该组件累计费用。 */
}; /* 第47天：结束成本最高组件摘要类型定义。 */

export type ModelUsageAggregate = { /* 第50天：定义按模型聚合的用量结果，用于模型级成本归因与性价比分析。 */
  modelId: string; /* 第50天：保存被聚合的逻辑模型 id。 */
  provider: string; /* 第50天：保存该模型的提供方。 */
  modelName: string; /* 第50天：保存该模型的底层模型名。 */
  recordCount: number; /* 第50天：保存使用该模型的记录数量。 */
  totalTokens: number; /* 第50天：保存该模型累计消耗的总词元数。 */
  estimatedCost: number; /* 第50天：保存该模型累计预估费用。 */
  durationMs: number; /* 第50天：保存该模型累计执行耗时。 */
  fallbackUsedCount: number; /* 第51天：保存该模型相关记录中触发备用链的次数。 */
}; /* 第50天：结束按模型聚合的用量类型定义。 */

export type PromptUsageAggregate = { /* 第52天：定义按提示词版本聚合的用量结果。 */
  promptId: string; /* 第52天：保存提示词唯一标识。 */
  promptVersion: string; /* 第52天：保存提示词版本。 */
  recordCount: number; /* 第52天：保存使用该提示词的记录数量。 */
  totalTokens: number; /* 第52天：保存该提示词累计消耗词元。 */
  estimatedCost: number; /* 第52天：保存该提示词累计预估费用。 */
  durationMs: number; /* 第52天：保存该提示词累计耗时。 */
}; /* 第52天：结束提示词用量聚合类型定义。 */

export type UsageMetrics = { /* 第47天：定义系统级用量指标。 */
  totalCost: number; /* 第47天：保存系统累计预估费用。 */
  totalTokens: number; /* 第47天：保存系统累计词元数。 */
  avgCostPerTrace: number; /* 第47天：保存每条 Trace 的平均费用。 */
  avgCostPerAgent: number; /* 第47天：保存每次 Agent 执行的平均费用。 */
  avgTokensPerTask: number; /* 第47天：保存每个任务的平均词元数。 */
  mostExpensiveAgent: ExpensiveComponent | null; /* 第47天：保存累计成本最高的智能体。 */
  mostExpensiveTool: ExpensiveComponent | null; /* 第47天：保存累计成本最高的工具。 */
}; /* 第47天：结束 UsageMetrics（用量指标）类型定义。 */

export type CostBreakdownItem = { /* 第47天：定义成本构成中的单个项目。 */
  componentType: UsageComponentType; /* 第47天：保存成本项目的组件类型。 */
  componentId: string; /* 第47天：保存成本项目的组件标识。 */
  estimatedCost: number; /* 第47天：保存组件累计费用。 */
  percentage: number; /* 第47天：保存组件费用占总费用的百分比。 */
}; /* 第47天：结束成本构成项目类型定义。 */

export type PromptROIVariantInput = { /* 第47天：定义提示词 ROI 对比输入。 */
  version: "A" | "B"; /* 第47天：保存提示词版本。 */
  description: string; /* 第47天：保存提示词策略说明。 */
  score: number; /* 第47天：保存提示词输出质量分数。 */
  inputTokens: number; /* 第47天：保存提示词输入词元数。 */
  outputTokens: number; /* 第47天：保存提示词输出词元数。 */
}; /* 第47天：结束提示词 ROI 输入类型定义。 */

export type PromptROIVariant = PromptROIVariantInput & { /* 第47天：定义包含费用派生值的提示词 ROI 结果。 */
  totalTokens: number; /* 第47天：保存该提示词版本总词元数。 */
  estimatedCost: number; /* 第47天：保存该提示词版本预估费用。 */
  costPerScore: number; /* 第47天：保存获得一分质量所需费用。 */
}; /* 第47天：结束单个提示词 ROI 结果类型定义。 */

export type PromptROIResult = { /* 第47天：定义 Prompt ROI Test（提示词投资回报率测试）结果。 */
  variants: [PromptROIVariant, PromptROIVariant]; /* 第47天：保存 A、B 两个提示词版本结果。 */
  qualityWinner: "A" | "B" | "tie"; /* 第47天：保存质量分数胜出版本。 */
  costWinner: "A" | "B" | "tie"; /* 第47天：保存费用更低版本。 */
  recommendedVersion: "A" | "B"; /* 第47天：保存单位质量分数成本更优的推荐版本。 */
  reason: string; /* 第47天：保存可供前端解释推荐结论的原因。 */
}; /* 第47天：结束 Prompt ROI Test 结果类型定义。 */

export type UsageDashboardSnapshot = { /* 第47天：定义 Usage Explorer（用量浏览器）完整快照。 */
  records: UsageRecord[]; /* 第47天：保存全部调用级用量明细。 */
  traceUsage: UsageAggregate[]; /* 第47天：保存按 Trace 汇总的任务用量。 */
  agentUsage: UsageAggregate[]; /* 第47天：保存按 Agent 汇总的用量。 */
  toolUsage: UsageAggregate[]; /* 第47天：保存按 Tool 汇总的用量。 */
  metrics: UsageMetrics; /* 第47天：保存系统级用量指标。 */
  costBreakdown: CostBreakdownItem[]; /* 第47天：保存组件成本构成。 */
  modelUsage: ModelUsageAggregate[]; /* 第50天：保存按模型聚合的用量与成本归因。 */
  promptUsage: PromptUsageAggregate[]; /* 第52天：保存按提示词版本聚合的用量与成本归因。 */
  promptROI: PromptROIResult; /* 第47天：保存提示词 ROI 对比结果。 */
  generatedAt: number; /* 第47天：保存快照生成时间。 */
}; /* 第47天：结束 Usage Explorer 快照类型定义。 */
