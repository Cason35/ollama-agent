import type { BadCaseRecord, BatchEvaluationRun, EvaluationDataset, QualityGateCheck, QualityGateConfig, QualityGateResult, RegressionComparison } from "./regression-types"; /* 第46天：引入质量门禁所需数据类型。 */

export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = { /* 第46天：定义默认最小验收标准。 */
  minimumAverageScoreDelta: 0, /* 第46天：要求整体平均分不能低于基线。 */
  maximumPassRateDrop: 0, /* 第46天：要求通过率不能下降。 */
  maximumCorrectnessDrop: 2, /* 第46天：允许正确性平均分最多下降两分。 */
  blockHighPriorityRegression: true, /* 第46天：阻止高优先级和关键案例退步。 */
  requireCriticalBadCasesPass: true, /* 第46天：要求严重失败案例全部回归通过。 */
}; /* 第46天：结束默认质量门禁配置。 */

export type QualityGateInput = { /* 第46天：定义质量门禁执行入参。 */
  comparison: RegressionComparison; /* 第46天：保存回归对比报告。 */
  candidate: BatchEvaluationRun; /* 第46天：保存候选版本运行结果。 */
  dataset: EvaluationDataset; /* 第46天：保存评估数据集。 */
  badCases: BadCaseRecord[]; /* 第46天：保存失败案例记录。 */
  config?: QualityGateConfig; /* 第46天：保存可选门禁配置。 */
}; /* 第46天：结束质量门禁执行入参。 */

export function evaluateQualityGate(input: QualityGateInput): QualityGateResult { /* 第46天：执行全部质量门禁规则。 */
  const config = input.config ?? DEFAULT_QUALITY_GATE_CONFIG; /* 第46天：读取调用方配置或默认配置。 */
  const highPriorityRegressions = input.comparison.regressedCases.filter((item) => item.priority === "high" || item.priority === "critical"); /* 第46天：筛选不可接受的高优先级退步案例。 */
  const criticalBadCaseIds = new Set(input.badCases.filter((item) => item.severity === "critical").map((item) => item.evaluationCaseId)); /* 第46天：收集严重历史失败案例 ID。 */
  const failedCriticalBadCases = input.candidate.results.filter((item) => criticalBadCaseIds.has(item.caseId) && !item.passed); /* 第46天：筛选候选版本仍未通过的严重失败案例。 */
  const checks: QualityGateCheck[] = [ /* 第46天：开始创建门禁检查清单。 */
    { id: "average-score", label: "平均分不低于基线", passed: input.comparison.averageScoreDelta >= config.minimumAverageScoreDelta, detail: `平均分变化 ${input.comparison.averageScoreDelta.toFixed(2)}，最低允许 ${config.minimumAverageScoreDelta.toFixed(2)}` }, /* 第46天：检查全局平均分。 */
    { id: "pass-rate", label: "通过率下降不超过阈值", passed: input.comparison.passRateDelta >= -config.maximumPassRateDrop, detail: `通过率变化 ${(input.comparison.passRateDelta * 100).toFixed(1)}%，最多允许下降 ${(config.maximumPassRateDrop * 100).toFixed(1)}%` }, /* 第46天：检查通过率下降幅度。 */
    { id: "correctness", label: "正确性分数无明显下降", passed: input.comparison.dimensionDeltas.correctness >= -config.maximumCorrectnessDrop, detail: `正确性变化 ${input.comparison.dimensionDeltas.correctness.toFixed(2)}，最多允许下降 ${config.maximumCorrectnessDrop.toFixed(2)}` }, /* 第46天：检查正确性维度。 */
    { id: "priority-regression", label: "高优先级案例不得退步", passed: !config.blockHighPriorityRegression || highPriorityRegressions.length === 0, detail: highPriorityRegressions.length === 0 ? "没有高优先级案例退步" : `退步案例：${highPriorityRegressions.map((item) => item.caseId).join("、")}` }, /* 第46天：检查高优先级案例退步。 */
    { id: "critical-bad-case", label: "严重失败案例必须通过", passed: !config.requireCriticalBadCasesPass || failedCriticalBadCases.length === 0, detail: failedCriticalBadCases.length === 0 ? "严重失败案例全部通过" : `未通过：${failedCriticalBadCases.map((item) => item.caseId).join("、")}` }, /* 第46天：检查严重历史失败回归结果。 */
  ]; /* 第46天：结束门禁检查清单。 */
  const failureReasons = checks.filter((check) => !check.passed).map((check) => `${check.label}：${check.detail}`); /* 第46天：收集所有未通过检查的阻断原因。 */
  return { status: failureReasons.length === 0 ? "passed" : "failed", checks, failureReasons }; /* 第46天：返回质量门禁最终结果。 */
} /* 第46天：结束质量门禁执行函数。 */
