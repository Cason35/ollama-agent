import type { BaselineSnapshot, BatchEvaluationCaseResult, BatchEvaluationRun, EvaluationDimension, RegressionCaseChange, RegressionComparison } from "./regression-types"; /* 第46天：引入基线、候选和回归报告类型。 */

const DIMENSIONS: EvaluationDimension[] = ["completeness", "correctness", "relevance", "coverage"]; /* 第46天：定义需要比较的固定评分维度。 */

function scoreOf(result: BatchEvaluationCaseResult | undefined): number { /* 第46天：读取案例分数并为失败案例提供零分。 */
  return result?.evaluation?.score ?? 0; /* 第46天：返回评估分或零分。 */
} /* 第46天：结束案例分数读取函数。 */

function describeReason(result: BatchEvaluationCaseResult | undefined, delta: number): string { /* 第46天：生成人类可读的变化原因。 */
  if (!result) return "候选版本缺少该案例结果"; /* 第46天：处理候选结果缺失。 */
  if (result.status === "failed") return result.error ?? "候选案例执行失败"; /* 第46天：优先返回执行失败原因。 */
  if (result.status === "skipped") return result.error ?? "候选案例被跳过"; /* 第46天：返回跳过原因。 */
  if (delta < 0) return result.evaluation?.weaknesses.join("；") || "候选版本评分下降"; /* 第46天：返回退步案例的低分维度。 */
  if (delta > 0) return result.evaluation?.strengths.join("；") || "候选版本覆盖更多评分项"; /* 第46天：返回改进案例的高分维度。 */
  return "关键评分项与基线保持一致"; /* 第46天：返回未变化说明。 */
} /* 第46天：结束变化原因生成函数。 */

function createChange(baseline: BatchEvaluationCaseResult, candidate: BatchEvaluationCaseResult | undefined): RegressionCaseChange { /* 第46天：创建单案例版本变化记录。 */
  const baselineScore = scoreOf(baseline); /* 第46天：读取基线分数。 */
  const candidateScore = scoreOf(candidate); /* 第46天：读取候选分数。 */
  const scoreDelta = Number((candidateScore - baselineScore).toFixed(2)); /* 第46天：计算候选相对基线的分数变化。 */
  const baselineOutput = baseline.actualOutput || baseline.error || "无输出"; /* 第46天：读取基线输出或错误。 */
  const candidateOutput = candidate?.actualOutput || candidate?.error || "无输出"; /* 第46天：读取候选输出或错误。 */
  return { caseId: baseline.caseId, caseName: baseline.caseName, priority: baseline.priority, baselineScore, candidateScore, scoreDelta, baselinePassed: baseline.passed, candidatePassed: candidate?.passed ?? false, outputDiff: `基线：${baselineOutput}｜候选：${candidateOutput}`, reason: describeReason(candidate, scoreDelta) }; /* 第46天：返回完整单案例变化记录。 */
} /* 第46天：结束单案例版本变化创建函数。 */

export function compareRegression(baseline: BaselineSnapshot, candidate: BatchEvaluationRun): RegressionComparison { /* 第46天：比较同一数据集上的基线与候选结果。 */
  if (baseline.datasetId !== candidate.datasetId || baseline.datasetVersion !== candidate.datasetVersion) throw new Error("基线与候选版本必须使用同一评估数据集和版本"); /* 第46天：阻止不同数据集之间的无效比较。 */
  const candidateByCase = new Map(candidate.results.map((result) => [result.caseId, result])); /* 第46天：按案例 ID 索引候选结果。 */
  const changes = baseline.results.map((result) => createChange(result, candidateByCase.get(result.caseId))); /* 第46天：为每个基线案例创建变化记录。 */
  const improvedCases = changes.filter((item) => item.scoreDelta > 0); /* 第46天：筛选改进案例。 */
  const unchangedCases = changes.filter((item) => item.scoreDelta === 0); /* 第46天：筛选未变化案例。 */
  const regressedCases = changes.filter((item) => item.scoreDelta < 0); /* 第46天：筛选退步案例。 */
  const dimensionDeltas = { completeness: 0, correctness: 0, relevance: 0, coverage: 0 }; /* 第46天：初始化维度变化对象。 */
  DIMENSIONS.forEach((dimension) => { /* 第46天：逐维度比较平均分。 */
    dimensionDeltas[dimension] = Number((candidate.summary.dimensionScores[dimension] - baseline.summary.dimensionScores[dimension]).toFixed(2)); /* 第46天：写入当前维度分数变化。 */
  }); /* 第46天：结束逐维度比较。 */
  return { averageScoreDelta: Number((candidate.summary.averageScore - baseline.summary.averageScore).toFixed(2)), passRateDelta: Number((candidate.summary.passRate - baseline.summary.passRate).toFixed(4)), dimensionDeltas, improvedCases, unchangedCases, regressedCases, newFailures: changes.filter((item) => item.baselinePassed && !item.candidatePassed).map((item) => item.caseId), fixedFailures: changes.filter((item) => !item.baselinePassed && item.candidatePassed).map((item) => item.caseId), unresolvedFailures: changes.filter((item) => !item.baselinePassed && !item.candidatePassed).map((item) => item.caseId) }; /* 第46天：返回完整回归对比报告。 */
} /* 第46天：结束回归对比函数。 */
