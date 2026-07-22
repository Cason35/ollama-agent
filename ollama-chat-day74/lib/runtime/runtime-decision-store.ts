import type { RuntimeContext, RuntimeDecision, RuntimeDecisionRecord, RuntimeMetrics } from "@/lib/runtime/runtime-types"; /* 第57天：引入决策记录和指标类型。 */

type RecordDecisionInput = { /* 第57天：定义写入决策记录的输入结构。 */
  context: RuntimeContext; /* 第57天：保存本次决策输入上下文。 */
  decision: RuntimeDecision; /* 第57天：保存本次决策输出。 */
  source: string; /* 第57天：保存调用来源。 */
  traceId?: string; /* 第57天：保存可选追踪 ID。 */
}; /* 第57天：结束写入输入类型定义。 */

export class RuntimeDecisionStore { /* 第57天：定义内存型 RuntimeDecisionStore（运行时决策仓库）。 */
  private records: RuntimeDecisionRecord[] = []; /* 第57天：保存最近决策记录，用于 Decision Replay（决策回放）。 */
  private sequence = 0; /* 第57天：保存递增序号，保证记录 ID 稳定唯一。 */

  record(input: RecordDecisionInput): RuntimeDecisionRecord { /* 第57天：写入一条决策记录。 */
    this.sequence += 1; /* 第57天：递增本地序号。 */
    const record: RuntimeDecisionRecord = { decisionId: `runtime-decision-${Date.now()}-${this.sequence}`, context: input.context, decision: input.decision, source: input.source, traceId: input.traceId, createdAt: Date.now() }; /* 第57天：组装可回放的决策记录。 */
    this.records = [record, ...this.records].slice(0, 80); /* 第57天：把最新记录放到最前，并限制最多保留 80 条。 */
    return record; /* 第57天：返回刚写入的记录。 */
  } /* 第57天：结束写入方法。 */

  listRecords(limit = 20): RuntimeDecisionRecord[] { /* 第57天：读取最近的决策回放记录。 */
    return this.records.slice(0, limit); /* 第57天：返回前 limit 条记录。 */
  } /* 第57天：结束读取记录方法。 */

  getMetrics(): RuntimeMetrics { /* 第57天：计算运行时决策指标。 */
    if (this.records.length === 0) return { fastStrategyUsage: 0, balancedUsage: 0, qualityUsage: 0, avgDecisionTime: 0, avgEstimatedCost: 0, avgEstimatedLatency: 0 }; /* 第57天：没有历史时返回零指标。 */
    const fastStrategyUsage = this.records.filter((record) => record.decision.promptStrategy === "fast" || record.decision.cacheStrategy === "cache-first").length; /* 第57天：统计快速策略或缓存优先次数。 */
    const balancedUsage = this.records.filter((record) => record.decision.promptStrategy === "balanced").length; /* 第57天：统计平衡提示词次数。 */
    const qualityUsage = this.records.filter((record) => record.decision.promptStrategy === "quality" || record.decision.modelStrategy === "multi").length; /* 第57天：统计质量优先或多模型次数。 */
    const avgDecisionTime = this.average(this.records.map((record) => record.decision.decisionTimeMs)); /* 第57天：计算平均决策耗时。 */
    const avgEstimatedCost = this.average(this.records.map((record) => record.decision.estimatedCost), 6); /* 第57天：计算平均估算成本。 */
    const avgEstimatedLatency = this.average(this.records.map((record) => record.decision.estimatedLatencyMs)); /* 第57天：计算平均估算延迟。 */
    return { fastStrategyUsage, balancedUsage, qualityUsage, avgDecisionTime, avgEstimatedCost, avgEstimatedLatency }; /* 第57天：返回完整指标。 */
  } /* 第57天：结束指标计算方法。 */

  reset(): void { /* 第57天：提供测试隔离用的清空方法。 */
    this.records = []; /* 第57天：清空所有历史记录。 */
    this.sequence = 0; /* 第57天：重置序号。 */
  } /* 第57天：结束清空方法。 */

  private average(values: number[], digits = 2): number { /* 第57天：定义平均值工具函数。 */
    if (values.length === 0) return 0; /* 第57天：空数组返回 0。 */
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits)); /* 第57天：按指定位数返回平均值。 */
  } /* 第57天：结束平均值工具函数。 */
} /* 第57天：结束 RuntimeDecisionStore 类定义。 */

export const runtimeDecisionStore = new RuntimeDecisionStore(); /* 第57天：导出共享 RuntimeDecisionStore 单例。 */
