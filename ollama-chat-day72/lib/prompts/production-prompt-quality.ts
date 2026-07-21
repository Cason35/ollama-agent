import type { PromptPromotionEvidence, PromptQualityGate, PromptQualityInput, PromptQualityScore } from "@/lib/prompts/production-prompt-types"; // 第67天：引入质量评分、晋级证据和质量门禁类型。

function clamp(value: number): number { // 第67天：定义把质量分限制在零到一百范围的函数。
  return Math.min(100, Math.max(0, value)); // 第67天：避免异常输入产生越界评分。
} // 第67天：结束质量分范围限制函数。

function round(value: number, digits = 2): number { // 第67天：定义统一小数精度处理函数。
  return Number(value.toFixed(digits)); // 第67天：返回便于界面和测试稳定比较的数值。
} // 第67天：结束小数精度处理函数。

function efficiencyScore(actual: number, budget: number): number { // 第67天：定义把越低越好的原始指标转换成越高越好的效率分。
  if (actual <= 0) return 100; // 第67天：零成本或零延迟直接视为满分效率。
  if (budget <= 0) return 0; // 第67天：无有效预算时返回最低效率分。
  return clamp((budget / actual) * 100); // 第67天：按预算与实际值比例进行归一化。
} // 第67天：结束原始指标效率归一化函数。

export function calculatePromptQualityScore(input: PromptQualityInput): PromptQualityScore { // 第67天：实现提示词质量评分计算入口。
  const correctness = round(clamp(input.correctness)); // 第67天：标准化正确性分数。
  const relevance = round(clamp(input.relevance)); // 第67天：标准化相关性分数。
  const cost = round(efficiencyScore(input.costUsd, input.costBudgetUsd)); // 第67天：把原始成本转换为成本效率分。
  const latency = round(efficiencyScore(input.latencyMs, input.latencyBudgetMs)); // 第67天：把原始延迟转换为延迟表现分。
  const overall = round(correctness * 0.35 + relevance * 0.35 + cost * 0.15 + latency * 0.15); // 第67天：按质量优先权重计算综合评分。
  return { correctness, relevance, cost, latency, overall }; // 第67天：返回五维提示词质量评分。
} // 第67天：结束提示词质量评分计算入口。

export function averagePromptQualityScores(scores: PromptQualityScore[]): PromptQualityScore { // 第67天：定义实验候选版本平均质量评分函数。
  if (scores.length === 0) return { correctness: 0, relevance: 0, cost: 0, latency: 0, overall: 0 }; // 第67天：空样本返回全零评分避免除零。
  const average = (key: keyof PromptQualityScore) => round(scores.reduce((sum, score) => sum + score[key], 0) / scores.length); // 第67天：定义按维度求平均值的局部函数。
  return { correctness: average("correctness"), relevance: average("relevance"), cost: average("cost"), latency: average("latency"), overall: average("overall") }; // 第67天：返回全部评分维度的平均值。
} // 第67天：结束实验平均质量评分函数。

export function evaluatePromptQualityGate(evidence: PromptPromotionEvidence): PromptQualityGate { // 第67天：实现生产提示词发布质量门禁。
  const checks = [ // 第67天：创建正确性、相关性、成本、延迟、回归和样本量检查列表。
    { id: "correctness", label: "正确性不低于 85 分", passed: evidence.score.correctness >= 85, detail: `实际 ${evidence.score.correctness} 分` }, // 第67天：检查正确性最低阈值。
    { id: "relevance", label: "相关性不低于 82 分", passed: evidence.score.relevance >= 82, detail: `实际 ${evidence.score.relevance} 分` }, // 第67天：检查相关性最低阈值。
    { id: "cost", label: "成本不超过预算", passed: evidence.actualCostUsd <= evidence.maxCostUsd, detail: `实际 $${evidence.actualCostUsd.toFixed(5)} / 预算 $${evidence.maxCostUsd.toFixed(5)}` }, // 第67天：检查单次模型成本预算。
    { id: "latency", label: "延迟不超过预算", passed: evidence.actualLatencyMs <= evidence.maxLatencyMs, detail: `实际 ${evidence.actualLatencyMs}ms / 预算 ${evidence.maxLatencyMs}ms` }, // 第67天：检查单次链路延迟预算。
    { id: "regression", label: "高优先级案例无退步", passed: evidence.highPriorityRegressionCount === 0, detail: `退步案例 ${evidence.highPriorityRegressionCount} 个` }, // 第67天：阻止高优先级失败案例退步。
    { id: "sample-size", label: "实验样本不少于 3 个", passed: evidence.sampleSize >= 3, detail: `实际样本 ${evidence.sampleSize} 个` }, // 第67天：检查实验最小样本量。
  ]; // 第67天：结束质量门禁检查列表定义。
  const failureReasons = checks.filter((check) => !check.passed).map((check) => `${check.label}：${check.detail}`); // 第67天：收集所有未通过检查的阻断原因。
  return { passed: failureReasons.length === 0, checks, failureReasons }; // 第67天：返回可解释的质量门禁结果。
} // 第67天：结束生产提示词发布质量门禁实现。
