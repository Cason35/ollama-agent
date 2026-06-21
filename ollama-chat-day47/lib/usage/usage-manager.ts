import { estimateUsageCost } from "@/lib/usage/token-accounting"; /* 第47天：引入统一费用估算函数。 */
import type { CostBreakdownItem, PromptROIResult, PromptROIVariant, PromptROIVariantInput, UsageAggregate, UsageComponentType, UsageMetrics, UsageRecord, UsageRecordInput } from "@/lib/usage/usage-types"; /* 第47天：引入用量管理器需要的全部结构类型。 */

function round(value: number, digits = 8): number { /* 第47天：定义统一数值精度处理函数。 */
  return Number(value.toFixed(digits)); /* 第47天：按指定小数位返回稳定数值。 */
} /* 第47天：结束数值精度处理函数。 */

export class UsageManager { /* 第47天：定义用量记录、聚合、指标和成本分析管理器。 */
  private readonly records: UsageRecord[] = []; /* 第47天：使用内存数组保存教学项目中的用量记录。 */

  addRecord(input: UsageRecordInput): UsageRecord { /* 第47天：定义写入并规范化单条用量记录的方法。 */
    const inputTokens = Math.max(0, Math.round(input.inputTokens)); /* 第47天：把输入词元规范为非负整数。 */
    const outputTokens = Math.max(0, Math.round(input.outputTokens)); /* 第47天：把输出词元规范为非负整数。 */
    const record: UsageRecord = { ...input, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCost: input.estimatedCost ?? estimateUsageCost(input.componentType, inputTokens, outputTokens), durationMs: Math.max(0, Math.round(input.durationMs)), createdAt: input.createdAt ?? Date.now() }; /* 第47天：统一补齐总词元、费用、耗时和创建时间。 */
    this.records.push(record); /* 第47天：把规范化记录追加到内存存储。 */
    return { ...record }; /* 第47天：返回副本以避免外部直接修改内部状态。 */
  } /* 第47天：结束添加用量记录方法。 */

  listRecords(): UsageRecord[] { /* 第47天：定义读取全部用量记录的方法。 */
    return this.records.map((record) => ({ ...record })); /* 第47天：返回按写入顺序排列的记录副本。 */
  } /* 第47天：结束列出用量记录方法。 */

  clear(): void { /* 第47天：定义清空演示用量的方法，供重新运行和测试隔离。 */
    this.records.splice(0, this.records.length); /* 第47天：原地清空数组以保留单例引用。 */
  } /* 第47天：结束清空用量记录方法。 */

  getTraceUsage(traceId: string): UsageAggregate { /* 第47天：定义汇总单条 Trace 用量的方法。 */
    return this.aggregate(traceId, this.records.filter((record) => record.traceId === traceId)); /* 第47天：筛选目标 Trace 并计算聚合结果。 */
  } /* 第47天：结束获取 Trace 用量方法。 */

  listTraceUsage(): UsageAggregate[] { /* 第47天：定义列出全部 Trace 用量汇总的方法。 */
    return this.groupBy(this.records, (record) => record.traceId).map(([traceId, records]) => this.aggregate(traceId, records)); /* 第47天：按 Trace 标识分组并聚合。 */
  } /* 第47天：结束列出 Trace 用量方法。 */

  getSpanUsage(traceId: string, spanId: string): UsageAggregate { /* 第47天：定义汇总指定 Trace Span 用量的方法。 */
    return this.aggregate(spanId, this.records.filter((record) => record.traceId === traceId && record.spanId === spanId)); /* 第47天：通过 Trace 与 Span 双重标识保证关联准确。 */
  } /* 第47天：结束获取 Span 用量方法。 */

  getAgentUsage(agentId?: string): UsageAggregate[] { /* 第47天：定义按智能体统计词元、费用和耗时的方法。 */
    return this.getComponentUsage("agent", agentId); /* 第47天：复用组件聚合器统计 Agent 用量。 */
  } /* 第47天：结束获取智能体用量方法。 */

  getToolUsage(toolId?: string): UsageAggregate[] { /* 第47天：定义按工具统计词元、费用和耗时的方法。 */
    return this.getComponentUsage("tool", toolId); /* 第47天：复用组件聚合器统计 Tool 用量。 */
  } /* 第47天：结束获取工具用量方法。 */

  getMetrics(): UsageMetrics { /* 第47天：定义计算系统级 Usage Metrics（用量指标）的方法。 */
    const allUsage = this.aggregate("all", this.records); /* 第47天：汇总系统中的全部用量记录。 */
    const traceCount = new Set(this.records.map((record) => record.traceId)).size; /* 第47天：统计独立任务 Trace 数量。 */
    const agentRecords = this.records.filter((record) => record.componentType === "agent"); /* 第47天：筛选智能体执行记录用于平均成本计算。 */
    const agentUsage = this.getAgentUsage(); /* 第47天：读取按智能体分组后的累计用量。 */
    const toolUsage = this.getToolUsage(); /* 第47天：读取按工具分组后的累计用量。 */
    return { totalCost: allUsage.estimatedCost, totalTokens: allUsage.totalTokens, avgCostPerTrace: traceCount ? round(allUsage.estimatedCost / traceCount) : 0, avgCostPerAgent: agentRecords.length ? round(agentRecords.reduce((sum, record) => sum + record.estimatedCost, 0) / agentRecords.length) : 0, avgTokensPerTask: traceCount ? round(allUsage.totalTokens / traceCount, 2) : 0, mostExpensiveAgent: this.mostExpensive(agentUsage), mostExpensiveTool: this.mostExpensive(toolUsage) }; /* 第47天：返回完整系统级用量指标。 */
  } /* 第47天：结束计算 Usage Metrics 方法。 */

  getCostBreakdown(): CostBreakdownItem[] { /* 第47天：定义按具体组件计算费用占比的方法。 */
    const totalCost = this.records.reduce((sum, record) => sum + record.estimatedCost, 0); /* 第47天：计算所有组件的总费用。 */
    const groups = this.groupBy(this.records, (record) => `${record.componentType}:${record.componentId}`); /* 第47天：按组件类型与标识组合键分组。 */
    return groups.map(([, records]) => { const first = records[0]; const estimatedCost = round(records.reduce((sum, record) => sum + record.estimatedCost, 0)); return { componentType: first.componentType, componentId: first.componentId, estimatedCost, percentage: totalCost ? round(estimatedCost / totalCost * 100, 2) : 0 }; }).sort((left, right) => right.estimatedCost - left.estimatedCost); /* 第47天：计算每个组件费用和占比并按成本降序返回。 */
  } /* 第47天：结束计算成本构成方法。 */

  comparePromptROI(left: PromptROIVariantInput, right: PromptROIVariantInput): PromptROIResult { /* 第47天：定义对比 A、B 提示词质量与费用投资回报的方法。 */
    const variants = [left, right].map((variant) => this.enrichPromptVariant(variant)) as [PromptROIVariant, PromptROIVariant]; /* 第47天：为两个提示词版本补齐总词元、费用和单位分数成本。 */
    const [variantA, variantB] = variants; /* 第47天：按 A、B 顺序解构提示词结果。 */
    const qualityWinner = variantA.score === variantB.score ? "tie" : variantA.score > variantB.score ? "A" : "B"; /* 第47天：根据质量分数判断质量胜出版本。 */
    const costWinner = variantA.estimatedCost === variantB.estimatedCost ? "tie" : variantA.estimatedCost < variantB.estimatedCost ? "A" : "B"; /* 第47天：根据预估费用判断成本胜出版本。 */
    const recommendedVersion = variantA.costPerScore <= variantB.costPerScore ? "A" : "B"; /* 第47天：选择单位质量分数成本更低的提示词。 */
    const recommended = recommendedVersion === "A" ? variantA : variantB; /* 第47天：读取最终推荐版本明细。 */
    return { variants, qualityWinner, costWinner, recommendedVersion, reason: `Prompt ${recommendedVersion} 的 Cost/Score Ratio（单位质量分数成本）为 $${recommended.costPerScore.toFixed(8)}，综合性价比更优。` }; /* 第47天：返回可解释的提示词 ROI 结论。 */
  } /* 第47天：结束提示词 ROI 对比方法。 */

  private getComponentUsage(componentType: UsageComponentType, componentId?: string): UsageAggregate[] { /* 第47天：定义可复用的组件分组聚合方法。 */
    const matches = this.records.filter((record) => record.componentType === componentType && (!componentId || record.componentId === componentId)); /* 第47天：按组件类型和可选标识筛选记录。 */
    return this.groupBy(matches, (record) => record.componentId).map(([key, records]) => ({ ...this.aggregate(key, records), componentType, componentId: key })).sort((left, right) => right.estimatedCost - left.estimatedCost); /* 第47天：返回按累计成本降序排列的组件聚合结果。 */
  } /* 第47天：结束组件分组聚合方法。 */

  private aggregate(key: string, records: UsageRecord[]): UsageAggregate { /* 第47天：定义统一的记录求和聚合器。 */
    return { key, recordCount: records.length, inputTokens: records.reduce((sum, record) => sum + record.inputTokens, 0), outputTokens: records.reduce((sum, record) => sum + record.outputTokens, 0), totalTokens: records.reduce((sum, record) => sum + record.totalTokens, 0), estimatedCost: round(records.reduce((sum, record) => sum + record.estimatedCost, 0)), durationMs: records.reduce((sum, record) => sum + record.durationMs, 0) }; /* 第47天：对词元、费用、耗时和记录数执行稳定求和。 */
  } /* 第47天：结束记录求和聚合器。 */

  private groupBy<T>(items: T[], keyOf: (item: T) => string): Array<[string, T[]]> { /* 第47天：定义无外部依赖的通用分组工具。 */
    const groups = new Map<string, T[]>(); /* 第47天：创建保持首次出现顺序的分组映射。 */
    items.forEach((item) => { const key = keyOf(item); groups.set(key, [...(groups.get(key) ?? []), item]); }); /* 第47天：把每个项目追加到对应分组。 */
    return Array.from(groups.entries()); /* 第47天：把映射转换为便于链式处理的数组。 */
  } /* 第47天：结束通用分组工具。 */

  private mostExpensive(items: UsageAggregate[]): UsageMetrics["mostExpensiveAgent"] { /* 第47天：定义从聚合结果中选择成本最高组件的方法。 */
    const item = items[0]; /* 第47天：读取已按成本降序排列的首项。 */
    return item?.componentId ? { componentId: item.componentId, estimatedCost: item.estimatedCost } : null; /* 第47天：返回成本摘要或空值。 */
  } /* 第47天：结束选择成本最高组件方法。 */

  private enrichPromptVariant(variant: PromptROIVariantInput): PromptROIVariant { /* 第47天：定义补齐单个提示词 ROI 派生字段的方法。 */
    const totalTokens = variant.inputTokens + variant.outputTokens; /* 第47天：计算提示词版本总词元数。 */
    const estimatedCost = estimateUsageCost("agent", variant.inputTokens, variant.outputTokens); /* 第47天：按业务智能体价格估算提示词执行费用。 */
    const costPerScore = variant.score > 0 ? round(estimatedCost / variant.score) : Number.POSITIVE_INFINITY; /* 第47天：计算单位质量分数成本并处理零分边界。 */
    return { ...variant, totalTokens, estimatedCost, costPerScore }; /* 第47天：返回完整提示词 ROI 结果。 */
  } /* 第47天：结束补齐提示词 ROI 派生字段方法。 */
} /* 第47天：结束 UsageManager（用量管理器）类定义。 */

export const usageManager = new UsageManager(); /* 第47天：导出进程内共享用量管理器供运行时与 API 复用。 */
