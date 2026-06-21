export type UsageComponentType = "agent" | "tool" | "reflection" | "evaluation"; /* 第47天：定义可参与用量与成本核算的组件类型。 */

export type UsageRecord = { /* 第47天：定义单次组件执行产生的统一用量记录。 */
  traceId: string; /* 第47天：关联一次完整任务的 Trace（追踪记录）标识。 */
  spanId: string; /* 第47天：关联 Trace 内具体执行阶段的 Span（跨度）标识。 */
  componentType: UsageComponentType; /* 第47天：区分智能体、工具、反思和评估组件。 */
  componentId: string; /* 第47天：保存具体智能体或工具的稳定标识。 */
  inputTokens: number; /* 第47天：保存本次执行消费的输入词元数。 */
  outputTokens: number; /* 第47天：保存本次执行生成的输出词元数。 */
  totalTokens: number; /* 第47天：保存输入与输出词元之和。 */
  estimatedCost: number; /* 第47天：保存按组件价格模型估算的美元费用。 */
  durationMs: number; /* 第47天：保存组件执行耗时毫秒数。 */
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
  promptROI: PromptROIResult; /* 第47天：保存提示词 ROI 对比结果。 */
  generatedAt: number; /* 第47天：保存快照生成时间。 */
}; /* 第47天：结束 Usage Explorer 快照类型定义。 */
