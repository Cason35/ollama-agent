import type { AgentTimelineEvent, EvaluationResult, Trace, Workspace } from "../agents/agent-types"; /* 第46天：复用评估结果、时间线、追踪和工作空间类型。 */

export type EvaluationCaseKind = "normal" | "bad_case" | "edge_case"; /* 第46天：定义正常、失败和边界三类评估案例。 */
export type EvaluationDifficulty = "easy" | "medium" | "hard"; /* 第46天：定义评估案例难度。 */
export type EvaluationPriority = "low" | "medium" | "high" | "critical"; /* 第46天：定义评估案例优先级。 */
export type EvaluationCaseSource = "manual" | "production_failure" | "historical_regression"; /* 第46天：定义人工、线上失败和历史回归三类案例来源。 */
export type EvaluationDimension = keyof EvaluationResult["dimensions"]; /* 第46天：复用第45天四个评估维度名称。 */

export type EvaluationRubricRule = { /* 第46天：定义单个维度的稳定评分规则。 */
  criteria: string; /* 第46天：保存人类可读的评分标准。 */
  requiredTerms: string[]; /* 第46天：保存输出必须覆盖的关键术语。 */
  weight: number; /* 第46天：保存该维度对综合分的权重。 */
}; /* 第46天：结束单维度评分规则。 */

export type EvaluationRubric = { /* 第46天：定义评估案例的完整评分规则。 */
  passThreshold: number; /* 第46天：保存案例通过分数线。 */
  dimensions: Record<EvaluationDimension, EvaluationRubricRule>; /* 第46天：保存完整性、正确性、相关性和覆盖度规则。 */
}; /* 第46天：结束完整评分规则。 */

export type EvaluationCase = { /* 第46天：定义可重复执行的统一评估案例。 */
  id: string; /* 第46天：保存案例唯一标识。 */
  name: string; /* 第46天：保存案例展示名称。 */
  kind: EvaluationCaseKind; /* 第46天：保存案例类型。 */
  input: string; /* 第46天：保存输入问题或任务。 */
  expectedOutput?: string; /* 第46天：保存可选的期望输出。 */
  referenceAnswer?: string; /* 第46天：保存可选的参考答案。 */
  rubric: EvaluationRubric; /* 第46天：保存稳定评分规则。 */
  tags: string[]; /* 第46天：保存能力和问题标签。 */
  difficulty: EvaluationDifficulty; /* 第46天：保存案例难度。 */
  priority: EvaluationPriority; /* 第46天：保存案例优先级。 */
  source: EvaluationCaseSource; /* 第46天：保存案例来源。 */
}; /* 第46天：结束统一评估案例。 */

export type EvaluationDataset = { /* 第46天：定义可维护、可版本化的评估数据集。 */
  id: string; /* 第46天：保存数据集唯一标识。 */
  name: string; /* 第46天：保存数据集展示名称。 */
  version: string; /* 第46天：保存数据集版本。 */
  description: string; /* 第46天：保存数据集用途说明。 */
  cases: EvaluationCase[]; /* 第46天：保存全部评估案例。 */
}; /* 第46天：结束评估数据集。 */

export type FailureType = "factual_error" | "omission" | "off_topic" | "not_actionable" | "tool_error" | "format_error"; /* 第46天：定义失败类型。 */
export type FailureSeverity = "minor" | "major" | "critical"; /* 第46天：定义失败严重程度。 */

export type BadCaseRecord = { /* 第46天：定义沉淀后的失败案例记录。 */
  id: string; /* 第46天：保存失败记录唯一标识。 */
  evaluationCaseId: string; /* 第46天：保存对应评估案例 ID。 */
  failureType: FailureType; /* 第46天：保存失败类型。 */
  severity: FailureSeverity; /* 第46天：保存失败严重程度。 */
  impactScope: string; /* 第46天：保存失败影响范围。 */
  agentId: string; /* 第46天：保存发生失败的智能体 ID。 */
  promptVersion: string; /* 第46天：保存发生失败的提示词版本。 */
  traceId: string; /* 第46天：保存可定位问题的追踪记录 ID。 */
  fixed: boolean; /* 第46天：记录问题是否已经修复。 */
  regressionPassed: boolean; /* 第46天：记录修复后是否通过回归评估。 */
  description: string; /* 第46天：保存失败现象说明。 */
  createdAt: number; /* 第46天：保存失败记录创建时间。 */
}; /* 第46天：结束失败案例记录。 */

export type EvaluationVersion = { /* 第46天：定义一次批量评估使用的系统版本。 */
  label: string; /* 第46天：保存版本展示名称。 */
  model: string; /* 第46天：保存模型名称。 */
  promptVersion: string; /* 第46天：保存提示词版本。 */
  workflowVersion: string; /* 第46天：保存工作流版本。 */
}; /* 第46天：结束系统版本。 */

export type BatchCaseStatus = "success" | "failed" | "skipped"; /* 第46天：定义单案例运行状态。 */

export type BatchCaseExecution = { /* 第46天：定义案例执行器的标准输出。 */
  output: string; /* 第46天：保存模型或规则生成的实际输出。 */
  modelCallCount?: number; /* 第46天：保存本案例模型调用次数。 */
  skippedReason?: string; /* 第46天：保存可选的跳过原因。 */
}; /* 第46天：结束案例执行器输出。 */

export type BatchEvaluationCaseResult = { /* 第46天：定义批量评估中的单案例结果。 */
  caseId: string; /* 第46天：保存案例 ID。 */
  caseName: string; /* 第46天：保存案例名称。 */
  priority: EvaluationPriority; /* 第46天：保存案例优先级。 */
  kind: EvaluationCaseKind; /* 第46天：保存案例类型。 */
  status: BatchCaseStatus; /* 第46天：保存成功、失败或跳过状态。 */
  actualOutput: string; /* 第46天：保存实际输出。 */
  evaluation: EvaluationResult | null; /* 第46天：保存成功案例的评分结果。 */
  passed: boolean; /* 第46天：记录本案例是否达到通过分数线。 */
  durationMs: number; /* 第46天：保存单案例耗时。 */
  modelCallCount: number; /* 第46天：保存单案例模型调用次数。 */
  error?: string; /* 第46天：保存可选的失败原因。 */
}; /* 第46天：结束单案例评估结果。 */

export type EvaluationDimensionScores = Record<EvaluationDimension, number>; /* 第46天：定义四个评估维度的聚合分数。 */

export type BatchEvaluationSummary = { /* 第46天：定义批量评估汇总指标。 */
  averageScore: number; /* 第46天：保存全局平均分。 */
  passRate: number; /* 第46天：保存全部案例通过率。 */
  dimensionScores: EvaluationDimensionScores; /* 第46天：保存各评分维度平均值。 */
  totalDurationMs: number; /* 第46天：保存批量任务总耗时。 */
  modelCallCount: number; /* 第46天：保存批量任务模型调用总次数。 */
  successCount: number; /* 第46天：保存成功执行案例数。 */
  failedCount: number; /* 第46天：保存失败执行案例数。 */
  skippedCount: number; /* 第46天：保存跳过案例数。 */
}; /* 第46天：结束批量评估汇总指标。 */

export type BatchEvaluationRun = { /* 第46天：定义一次完整批量评估运行。 */
  id: string; /* 第46天：保存批量运行唯一标识。 */
  datasetId: string; /* 第46天：保存数据集 ID。 */
  datasetVersion: string; /* 第46天：保存数据集版本。 */
  caseCount: number; /* 第46天：保存案例数量。 */
  version: EvaluationVersion; /* 第46天：保存被评估系统版本。 */
  concurrency: number; /* 第46天：保存并发限制。 */
  startedAt: number; /* 第46天：保存开始时间。 */
  endedAt: number; /* 第46天：保存结束时间。 */
  results: BatchEvaluationCaseResult[]; /* 第46天：保存全部案例结果。 */
  summary: BatchEvaluationSummary; /* 第46天：保存聚合指标。 */
}; /* 第46天：结束批量评估运行。 */

export type BaselineSnapshot = BatchEvaluationRun & { /* 第46天：定义包含完整案例明细的基线快照。 */
  savedAt: number; /* 第46天：保存基线落库时间。 */
}; /* 第46天：结束基线快照。 */

export type RegressionCaseChange = { /* 第46天：定义单案例基线与候选版本的变化。 */
  caseId: string; /* 第46天：保存案例 ID。 */
  caseName: string; /* 第46天：保存案例名称。 */
  priority: EvaluationPriority; /* 第46天：保存案例优先级。 */
  baselineScore: number; /* 第46天：保存基线分数。 */
  candidateScore: number; /* 第46天：保存候选分数。 */
  scoreDelta: number; /* 第46天：保存候选相对基线的分数变化。 */
  baselinePassed: boolean; /* 第46天：保存基线是否通过。 */
  candidatePassed: boolean; /* 第46天：保存候选是否通过。 */
  outputDiff: string; /* 第46天：保存人类可读的输出差异。 */
  reason: string; /* 第46天：保存变化或退步原因。 */
}; /* 第46天：结束单案例回归变化。 */

export type RegressionComparison = { /* 第46天：定义基线版本与候选版本的完整回归报告。 */
  averageScoreDelta: number; /* 第46天：保存全局平均分变化。 */
  passRateDelta: number; /* 第46天：保存通过率变化。 */
  dimensionDeltas: EvaluationDimensionScores; /* 第46天：保存各维度分数变化。 */
  improvedCases: RegressionCaseChange[]; /* 第46天：保存改进案例。 */
  unchangedCases: RegressionCaseChange[]; /* 第46天：保存未变化案例。 */
  regressedCases: RegressionCaseChange[]; /* 第46天：保存退步案例。 */
  newFailures: string[]; /* 第46天：保存新增失败案例 ID。 */
  fixedFailures: string[]; /* 第46天：保存已经修复的失败案例 ID。 */
  unresolvedFailures: string[]; /* 第46天：保存仍未解决的失败案例 ID。 */
}; /* 第46天：结束完整回归报告。 */

export type QualityGateConfig = { /* 第46天：定义质量门禁阈值。 */
  minimumAverageScoreDelta: number; /* 第46天：保存允许的最低平均分变化。 */
  maximumPassRateDrop: number; /* 第46天：保存允许的最大通过率下降。 */
  maximumCorrectnessDrop: number; /* 第46天：保存允许的最大正确性下降。 */
  blockHighPriorityRegression: boolean; /* 第46天：记录是否阻止高优先级案例退步。 */
  requireCriticalBadCasesPass: boolean; /* 第46天：记录是否要求严重失败案例全部通过。 */
}; /* 第46天：结束质量门禁阈值。 */

export type QualityGateCheck = { /* 第46天：定义单项质量门禁检查。 */
  id: string; /* 第46天：保存检查项唯一标识。 */
  label: string; /* 第46天：保存检查项展示名称。 */
  passed: boolean; /* 第46天：保存检查是否通过。 */
  detail: string; /* 第46天：保存检查证据。 */
}; /* 第46天：结束单项质量门禁检查。 */

export type QualityGateResult = { /* 第46天：定义质量门禁最终结果。 */
  status: "passed" | "failed"; /* 第46天：保存门禁通过或阻断状态。 */
  checks: QualityGateCheck[]; /* 第46天：保存全部门禁检查。 */
  failureReasons: string[]; /* 第46天：保存所有阻断原因。 */
}; /* 第46天：结束质量门禁最终结果。 */

export type RegressionDashboardSnapshot = { /* 第46天：定义回归评估看板接口返回结构。 */
  dataset: EvaluationDataset; /* 第46天：保存数据集元数据与案例。 */
  badCases: BadCaseRecord[]; /* 第46天：保存失败案例清单。 */
  baseline: BaselineSnapshot; /* 第46天：保存基线完整结果。 */
  candidate: BatchEvaluationRun; /* 第46天：保存候选版本完整结果。 */
  comparison: RegressionComparison; /* 第46天：保存回归对比报告。 */
  qualityGate: QualityGateResult; /* 第46天：保存质量门禁结果。 */
  workspace: Workspace; /* 第46天：保存批量评估写入的工作空间。 */
  timeline: AgentTimelineEvent[]; /* 第46天：保存批量评估执行时间线。 */
  trace: Trace; /* 第46天：保存批量评估追踪记录。 */
  generatedAt: number; /* 第46天：保存看板快照生成时间。 */
}; /* 第46天：结束回归评估看板结构。 */
