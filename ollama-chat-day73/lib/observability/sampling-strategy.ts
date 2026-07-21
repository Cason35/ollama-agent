import type { SamplingDecision, SamplingPolicy } from "@/lib/observability/types"; // 第72天：引入采样策略和采样决策类型。

export const DEFAULT_SAMPLING_POLICY: SamplingPolicy = { mode: "ratio", samplingRate: 0.1, forceErrors: true, highValueRate: 1, highCostThreshold: 0.1, lowQualityThreshold: 6 }; // 第72天：定义普通请求百分之十且错误和高价值请求强制保留的默认策略。

type SamplingInput = { traceId: string; error?: boolean; vip?: boolean; criticalWorkflow?: boolean; estimatedCost?: number; qualityScore?: number }; // 第72天：定义错误、高价值和普通请求采样判断输入。

function stableRatio(traceId: string): number { // 第72天：把链路标识稳定映射为零到一之间的确定性比例。
  const bucket = Array.from(traceId).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 10000, 0); // 第72天：使用稳定哈希避免测试和生产请求随机漂移。
  return bucket / 10000; // 第72天：把整数分桶转换为零到一比例。
} // 第72天：结束确定性比例计算函数。

export class SamplingStrategy { // 第72天：实现全量、比例、错误强制和高价值请求采样策略。
  decide(input: SamplingInput, policy: SamplingPolicy = DEFAULT_SAMPLING_POLICY): SamplingDecision { // 第72天：根据请求特征和策略输出可解释采样决策。
    const normalRate = Math.min(1, Math.max(0, policy.samplingRate)); // 第72天：把普通采样率限制在零到一之间。
    const highValueRate = Math.min(1, Math.max(normalRate, policy.highValueRate)); // 第72天：保证高价值请求采样率不低于普通请求。
    if (input.error && policy.forceErrors) return { sampled: true, rate: 1, reason: "error-forced" }; // 第72天：错误请求无条件强制采样便于故障排查。
    if (input.vip) return { sampled: stableRatio(input.traceId) < highValueRate, rate: highValueRate, reason: "vip-high-value" }; // 第72天：高价值用户使用更高采样率。
    if (input.criticalWorkflow) return { sampled: true, rate: 1, reason: "critical-workflow" }; // 第72天：关键业务工作流强制保留完整链路。
    if ((input.estimatedCost ?? 0) >= policy.highCostThreshold) return { sampled: true, rate: 1, reason: "high-cost" }; // 第72天：超过成本阈值的请求强制保留链路。
    if (input.qualityScore !== undefined && input.qualityScore < policy.lowQualityThreshold) return { sampled: true, rate: 1, reason: "low-quality" }; // 第72天：低质量评估结果强制保留链路。
    if (policy.mode === "full") return { sampled: true, rate: 1, reason: "full" }; // 第72天：开发环境全量采样保存全部普通请求。
    return { sampled: stableRatio(input.traceId) < normalRate, rate: normalRate, reason: "ratio" }; // 第72天：普通生产请求按照确定性比例采样。
  } // 第72天：结束可解释采样决策方法。
} // 第72天：结束生产采样策略实现。
