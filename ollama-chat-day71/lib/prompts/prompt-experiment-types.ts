import type { AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 第53天：复用统一时间线事件类型记录实验过程。 */
import type { BatchEvaluationRun, EvaluationDataset } from "@/lib/evaluation/regression-types"; /* 第53天：复用批量评估运行和数据集类型。 */
import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第53天：复用提示词模板类型作为实验候选版本。 */

export type PromptExperimentStatus = "draft" | "running" | "completed" | "failed"; /* 第53天：定义提示词实验生命周期状态。 */

export type WinnerRule = { /* 第53天：定义 Winner Selection（获胜版本选择）规则。 */
  minScore?: number; /* 第53天：保存候选版本最低可接受平均分。 */
  maxCostIncrease?: number; /* 第53天：保存相对当前 active 版本允许的最大成本增长比例。 */
  requireNoHighPriorityRegression?: boolean; /* 第53天：保存是否禁止高优先级或关键案例退步。 */
  optimizeFor: "score" | "cost" | "balanced"; /* 第53天：保存获胜策略，支持质量优先、成本优先和平衡模式。 */
}; /* 第53天：结束获胜规则类型。 */

export type PromptExperiment = { /* 第53天：定义一次针对某组件提示词版本的实验。 */
  id: string; /* 第53天：保存实验唯一 ID。 */
  name: string; /* 第53天：保存实验展示名称。 */
  componentId: string; /* 第53天：保存被实验的组件 ID，例如 writer。 */
  candidateVersions: string[]; /* 第53天：保存参与对比的提示词版本列表。 */
  datasetId: string; /* 第53天：保存本次实验使用的评估数据集 ID。 */
  status: PromptExperimentStatus; /* 第53天：保存实验当前状态。 */
  winnerRule: WinnerRule; /* 第53天：保存本次实验使用的获胜规则。 */
  createdAt: number; /* 第53天：保存实验创建时间。 */
  updatedAt: number; /* 第53天：保存实验最近更新时间。 */
}; /* 第53天：结束提示词实验类型。 */

export type PromptExperimentCaseScore = { /* 第53天：定义某版本在单个评估案例上的表现。 */
  caseId: string; /* 第53天：保存案例 ID。 */
  caseName: string; /* 第53天：保存案例名称。 */
  priority: string; /* 第53天：保存案例优先级，便于质量门禁解释。 */
  score: number; /* 第53天：保存该案例综合分。 */
  scoreDelta: number; /* 第53天：保存该案例相对 active 基线的分数变化。 */
  passed: boolean; /* 第53天：保存该案例是否达到通过阈值。 */
  cost: number; /* 第53天：保存该版本在该案例上的成本估算。 */
  latencyMs: number; /* 第53天：保存该版本在该案例上的延迟估算。 */
  regressed: boolean; /* 第53天：保存相对 active 基线是否退步。 */
}; /* 第53天：结束单案例表现类型。 */

export type PromptExperimentResult = { /* 第53天：定义某个提示词版本在实验中的聚合结果。 */
  experimentId: string; /* 第53天：保存所属实验 ID。 */
  promptVersion: string; /* 第53天：保存当前结果对应的提示词版本。 */
  promptId: string; /* 第53天：保存当前结果对应的提示词 ID。 */
  averageScore: number; /* 第53天：保存平均质量分。 */
  passRate: number; /* 第53天：保存评估用例通过率。 */
  averageCost: number; /* 第53天：保存平均成本估算。 */
  costIncrease: number; /* 第53天：保存相对 active 基线的成本增长比例。 */
  averageLatencyMs: number; /* 第53天：保存平均延迟毫秒数。 */
  regressionCount: number; /* 第53天：保存相对 active 基线退步的案例数。 */
  highPriorityRegressionCount: number; /* 第53天：保存高优先级或关键案例退步数量。 */
  bestCases: string[]; /* 第53天：保存该版本表现最好的评估案例 ID。 */
  worstCases: string[]; /* 第53天：保存该版本表现最差的评估案例 ID。 */
  caseScores: PromptExperimentCaseScore[]; /* 第53天：保存全部案例级分数，用于仪表盘展开。 */
}; /* 第53天：结束提示词实验结果类型。 */

export type PromptExperimentQualityGateCheck = { /* 第53天：定义质量门禁的单项检查。 */
  id: string; /* 第53天：保存检查项唯一 ID。 */
  label: string; /* 第53天：保存检查项展示名称。 */
  passed: boolean; /* 第53天：保存检查是否通过。 */
  detail: string; /* 第53天：保存检查依据。 */
}; /* 第53天：结束质量门禁检查类型。 */

export type PromptExperimentQualityGate = { /* 第53天：定义提示词实验质量门禁结果。 */
  status: "passed" | "failed"; /* 第53天：保存门禁最终状态。 */
  checks: PromptExperimentQualityGateCheck[]; /* 第53天：保存全部门禁检查项。 */
  failureReasons: string[]; /* 第53天：保存阻断原因列表。 */
}; /* 第53天：结束提示词实验质量门禁类型。 */

export type PromptExperimentRun = { /* 第53天：定义一次完整提示词实验运行快照。 */
  experiment: PromptExperiment; /* 第53天：保存实验定义。 */
  dataset: EvaluationDataset; /* 第53天：保存本次使用的评估数据集。 */
  prompts: PromptTemplate[]; /* 第53天：保存参与实验的提示词候选版本。 */
  baselineVersion: string; /* 第53天：保存实验开始时组件的 active 基线版本。 */
  batchRuns: BatchEvaluationRun[]; /* 第53天：保存每个提示词版本对应的批量评估运行。 */
  results: PromptExperimentResult[]; /* 第53天：保存每个提示词版本的聚合对比结果。 */
  winnerVersion: string | null; /* 第53天：保存根据 Winner Rule 选出的获胜版本。 */
  winnerReason: string; /* 第53天：保存获胜或未选出的原因说明。 */
  qualityGate: PromptExperimentQualityGate; /* 第53天：保存获胜版本质量门禁结果。 */
  timeline: AgentTimelineEvent[]; /* 第53天：保存实验创建、各版本运行和获胜选择时间线。 */
  promotedVersion?: string; /* 第53天：保存一键 Promote 后被激活的版本。 */
  generatedAt: number; /* 第53天：保存实验快照生成时间。 */
}; /* 第53天：结束提示词实验运行快照类型。 */

export type PromptExperimentDashboardSnapshot = { /* 第53天：定义前端实验仪表盘接口快照。 */
  experiments: PromptExperiment[]; /* 第53天：保存当前可展示的实验列表。 */
  activeExperiment: PromptExperiment; /* 第53天：保存当前默认打开的实验。 */
  run: PromptExperimentRun; /* 第53天：保存当前实验最新运行结果。 */
  activePromptAfterPromotion: PromptTemplate | null; /* 第53天：保存 Promote 后的 active 提示词，未 Promote 时为空。 */
  generatedAt: number; /* 第53天：保存仪表盘快照生成时间。 */
}; /* 第53天：结束前端实验仪表盘快照类型。 */
