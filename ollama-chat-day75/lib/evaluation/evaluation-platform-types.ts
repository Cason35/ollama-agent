export const EVALUATION_RUN_TYPES = ["online", "offline", "regression", "experiment"] as const; // 第71天：声明生产评估平台支持的四种运行类型。
export type EvaluationRunType = (typeof EVALUATION_RUN_TYPES)[number]; // 第71天：从运行类型常量推导评估运行类型联合。
export const EVALUATION_RUN_STATUSES = ["created", "running", "completed", "failed"] as const; // 第71天：声明评估运行实例完整生命周期状态。
export type EvaluationRunStatus = (typeof EVALUATION_RUN_STATUSES)[number]; // 第71天：从状态常量推导评估运行状态联合。
export const EVALUATION_DATASET_TYPES = ["agent", "workflow", "prompt", "rag", "memory"] as const; // 第71天：声明平台级评估数据集支持的五种业务类型。
export type EvaluationDatasetTypeV2 = (typeof EVALUATION_DATASET_TYPES)[number]; // 第71天：从数据集类型常量推导业务类型联合。
export const EVALUATION_DATASET_STATUSES = ["draft", "active", "archived"] as const; // 第71天：声明平台级评估数据集生命周期状态。
export type EvaluationDatasetStatusV2 = (typeof EVALUATION_DATASET_STATUSES)[number]; // 第71天：从数据集状态常量推导状态联合。
export type EvaluationPriorityV2 = "low" | "medium" | "high" | "critical"; // 第71天：定义评估案例优先级并支持质量门禁识别高优先级案例。
export type EvaluationCaseSourceV2 = "manual" | "seed" | "production_failure" | "historical_regression" | "user_feedback"; // 第71天：定义案例来自人工、种子、线上失败、历史回归或用户反馈。

export type EvaluationScore = { // 第71天：定义正确性、相关性、完整性、安全性、延迟、成本和综合分七个维度。
  correctness: number; // 第71天：保存 Correctness（正确性）评分，范围为零到十分。
  relevance: number; // 第71天：保存 Relevance（相关性）评分，范围为零到十分。
  completeness: number; // 第71天：保存 Completeness（完整性）评分，范围为零到十分。
  safety: number; // 第71天：保存 Safety（安全性）评分，范围为零到十分。
  latency: number; // 第71天：保存 Latency（响应延迟）换算评分，范围为零到十分。
  cost: number; // 第71天：保存 Cost（调用成本）换算评分，范围为零到十分。
  overall: number; // 第71天：保存按平台权重计算的 Overall Score（综合评分）。
}; // 第71天：结束多维度评估评分结构定义。

export type EvaluationCaseV2 = { // 第71天：定义可版本化、可回归、可由反馈闭环追加的平台级评估案例。
  id: string; // 第71天：保存数据集版本内唯一的案例标识。
  name: string; // 第71天：保存 Evaluation Explorer 展示的案例名称。
  input: string; // 第71天：保存提供给 Agent、Workflow、Prompt、RAG 或 Memory 的输入。
  expectedOutput: string; // 第71天：保存用于案例分析和规则评估的期望输出说明。
  expectedKeywords: string[]; // 第71天：保存确定性正确性与完整性评分所需关键词。
  priority: EvaluationPriorityV2; // 第71天：保存案例优先级供 Quality Gate V2 判断。
  source: EvaluationCaseSourceV2; // 第71天：保存案例来源以追踪反馈和线上失败闭环。
  passThreshold: number; // 第71天：保存当前案例综合分通过阈值。
  metadata: Record<string, unknown>; // 第71天：保存知识库、索引、工作流可靠性和安全约束等扩展信息。
}; // 第71天：结束平台级评估案例结构定义。

export type EvaluationDatasetV2 = { // 第71天：定义任务要求的 Evaluation Dataset V2 平台级数据集。
  id: string; // 第71天：保存跨版本稳定的数据集标识。
  name: string; // 第71天：保存数据集可读名称。
  type: EvaluationDatasetTypeV2; // 第71天：标记数据集用于智能体、工作流、提示词、RAG 或记忆评估。
  cases: EvaluationCaseV2[]; // 第71天：保存该数据集版本的全部评估案例。
  version: number; // 第71天：保存不可覆盖的正整数数据集版本。
  status: EvaluationDatasetStatusV2; // 第71天：保存草稿、活动或归档状态。
}; // 第71天：结束 Evaluation Dataset V2 结构定义。

export type EvaluationUsage = { // 第71天：定义单案例和评估运行共享的用量与成本结构。
  promptTokens: number; // 第71天：保存输入令牌数量。
  completionTokens: number; // 第71天：保存输出令牌数量。
  totalTokens: number; // 第71天：保存输入与输出令牌总数。
  latencyMs: number; // 第71天：保存实际响应延迟毫秒数。
  cost: number; // 第71天：保存本次调用估算成本。
}; // 第71天：结束评估用量结构定义。

export type EvaluationExecution = { // 第71天：定义 Evaluation Runner V2 从业务运行时收集的标准化执行结果。
  output: string; // 第71天：保存 Agent、Workflow、Prompt、RAG 或 Memory 的实际输出。
  usage: EvaluationUsage; // 第71天：保存实际输出关联的令牌、延迟和成本。
  citations?: string[]; // 第71天：保存 RAG 输出引用的知识来源标识。
  metadata?: Record<string, unknown>; // 第71天：保存运行时、检索索引、工作流恢复和安全诊断信息。
}; // 第71天：结束标准化业务执行结果定义。

export type EvaluationStrategyOutput = { // 第71天：定义单个评估策略返回的部分维度评分与解释。
  evaluatorId: string; // 第71天：保存实际执行的评估器标识。
  evaluatorVersion: string; // 第71天：保存评估器版本以支持可追踪和可回归。
  scores: Partial<Omit<EvaluationScore, "overall">>; // 第71天：保存当前评估器负责的一组评分维度。
  reasons: string[]; // 第71天：保存评分依据与诊断说明。
}; // 第71天：结束评估策略输出结构定义。

export type EvaluationStrategyInput = { // 第71天：定义所有可插拔评估器共享的统一输入协议。
  dataset: EvaluationDatasetV2; // 第71天：提供当前平台级数据集元数据。
  evaluationCase: EvaluationCaseV2; // 第71天：提供当前正在评估的单个案例。
  execution: EvaluationExecution; // 第71天：提供业务运行时产生的实际输出、引用、用量和诊断元数据。
}; // 第71天：结束评估策略统一输入结构定义。

export interface EvaluationStrategy { // 第71天：定义可注册、可替换且不修改运行时核心的评估策略协议。
  id: string; // 第71天：声明评估策略唯一标识。
  name: string; // 第71天：声明评估策略中英文展示名称。
  version: string; // 第71天：声明评估器可追踪版本。
  supportedTypes: EvaluationDatasetTypeV2[]; // 第71天：声明评估器支持的数据集业务类型。
  evaluate(input: EvaluationStrategyInput): Promise<EvaluationStrategyOutput> | EvaluationStrategyOutput; // 第71天：声明统一异步或同步评估方法。
} // 第71天：结束可插拔评估策略协议定义。

export type EvaluationCaseResultV2 = { // 第71天：定义 Evaluation Explorer V2 案例分析使用的完整结果。
  id: string; // 第71天：保存单案例评估结果唯一标识。
  runId: string; // 第71天：关联所属 EvaluationRun。
  datasetId: string; // 第71天：关联所属 Evaluation Dataset V2。
  caseId: string; // 第71天：关联原始评估案例。
  input: string; // 第71天：保存案例实际输入。
  output: string; // 第71天：保存运行时实际输出。
  expected: string; // 第71天：保存案例期望输出说明。
  scores: EvaluationScore; // 第71天：保存七个维度的最终聚合评分。
  passed: boolean; // 第71天：保存综合分是否达到案例阈值。
  traceId: string; // 第71天：关联创建该结果的 Trace。
  usage: EvaluationUsage; // 第71天：保存案例实际延迟和成本。
  citations: string[]; // 第71天：保存案例输出引用列表。
  evaluatorOutputs: EvaluationStrategyOutput[]; // 第71天：保存各评估器版本、分项评分和诊断原因。
  metadata: Record<string, unknown>; // 第71天：保存工作流可靠性、知识索引等案例诊断信息。
  completedAt: number; // 第71天：保存单案例评估完成时间戳。
}; // 第71天：结束案例分析结果结构定义。

export type EvaluationRun = { // 第71天：定义任务要求的独立、可保存、可追踪和可比较评估运行实例。
  id: string; // 第71天：保存评估运行唯一标识。
  type: EvaluationRunType; // 第71天：保存在线、离线、回归或实验类型。
  datasetId?: string; // 第71天：按需关联平台级评估数据集。
  status: EvaluationRunStatus; // 第71天：保存评估运行生命周期状态。
  runtimeContextId?: string; // 第71天：关联统一 RuntimeContext 请求标识。
  traceIds: string[]; // 第71天：保存本次运行和案例关联的 Trace 标识列表。
  score: number; // 第71天：保存任务要求的评估运行综合分。
  scores: EvaluationScore; // 第71天：保存评估运行聚合后的完整多维评分。
  resultIds: string[]; // 第71天：保存本次运行生成的单案例结果标识列表。
  label: string; // 第71天：保存版本或场景可读标签供回归比较。
  usage: EvaluationUsage; // 第71天：保存本次运行平均延迟、平均成本和累计令牌用量。
  startedAt: number; // 第71天：保存运行开始时间戳。
  completedAt?: number; // 第71天：保存运行完成或失败时间戳。
  error?: string; // 第71天：保存运行失败时可安全展示的错误摘要。
}; // 第71天：结束 EvaluationRun 结构定义。

export type EvaluationTraceLink = { // 第71天：定义 Trace 自动关联 Evaluation 的质量链路结构。
  evaluationRunId: string; // 第71天：保存关联的评估运行标识。
  score: EvaluationScore; // 第71天：保存该 Trace 最终获得的多维评分。
  evaluatorVersions: Record<string, string>; // 第71天：保存实际调用的评估器及其版本映射。
}; // 第71天：结束 Trace 评估关联结构定义。

export type EvaluationContextV2 = { // 第71天：定义写入统一运行时上下文的评估专用字段。
  runId?: string; // 第71天：关联当前 EvaluationRun 标识。
  datasetId?: string; // 第71天：关联当前 Evaluation Dataset V2 标识。
  evaluatorVersions?: Record<string, string>; // 第71天：保存当前运行实际使用的评估器版本。
  scores?: EvaluationScore; // 第71天：保存当前运行完成后的多维评分。
  [key: string]: unknown; // 第71天：兼容历史评估上下文和未来扩展字段。
}; // 第71天：结束评估运行时上下文结构定义。

export type UserFeedbackV2 = { // 第71天：定义进入持续改进闭环的用户反馈记录。
  id: string; // 第71天：保存反馈唯一标识。
  runId: string; // 第71天：关联用户反馈对应的评估运行。
  resultId: string; // 第71天：关联用户反馈对应的单案例结果。
  sentiment: "positive" | "negative"; // 第71天：保存点赞或点踩对应的正向和负向情感。
  rating: number; // 第71天：保存一到五分的用户评分。
  comment: string; // 第71天：保存用户文字评论。
  createdAt: number; // 第71天：保存反馈创建时间戳。
}; // 第71天：结束用户反馈记录结构定义。

export type EvaluationBadCaseV2 = { // 第71天：定义由低分输出或负向反馈自动沉淀的坏案例。
  id: string; // 第71天：保存坏案例唯一标识。
  datasetId: string; // 第71天：保存坏案例进入的目标数据集。
  evaluationCaseId: string; // 第71天：保存自动追加到数据集的回归案例标识。
  sourceResultId: string; // 第71天：关联触发坏案例的评估结果。
  feedbackId?: string; // 第71天：按需关联触发坏案例的用户反馈。
  reason: string; // 第71天：保存低分、点踩或文字反馈形成的失败原因。
  createdAt: number; // 第71天：保存坏案例创建时间戳。
}; // 第71天：结束反馈闭环坏案例结构定义。

export type QualityGateCheckV2 = { // 第71天：定义 Quality Gate V2 的单项多维条件检查结果。
  id: string; // 第71天：保存门禁条件稳定标识。
  label: string; // 第71天：保存门禁条件中英文可读说明。
  passed: boolean; // 第71天：保存当前条件是否通过。
  detail: string; // 第71天：保存实际值、阈值和失败原因。
}; // 第71天：结束质量门禁单项检查结构定义。

export type QualityGateResultV2 = { // 第71天：定义提示词、模型或工作流候选版本的质量门禁结论。
  id: string; // 第71天：保存质量门禁运行唯一标识。
  baselineRunId: string; // 第71天：关联基线评估运行。
  candidateRunId: string; // 第71天：关联候选评估运行。
  status: "passed" | "failed"; // 第71天：保存全部条件通过或至少一项失败的最终状态。
  checks: QualityGateCheckV2[]; // 第71天：保存综合分、正确性、高优先级通过率和成本增长检查。
  reasons: string[]; // 第71天：保存阻断候选晋级的原因列表。
  createdAt: number; // 第71天：保存质量门禁判断时间戳。
}; // 第71天：结束 Quality Gate V2 结果结构定义。

export type RegressionComparisonV2 = { // 第71天：定义 Evaluation Explorer V2 的回归比较摘要。
  id: string; // 第71天：保存回归比较唯一标识。
  baselineRunId: string; // 第71天：关联基线评估运行。
  candidateRunId: string; // 第71天：关联候选评估运行。
  improvedCases: string[]; // 第71天：保存候选版本分数提升的案例标识。
  regressedCases: string[]; // 第71天：保存候选版本分数下降的案例标识。
  failedCases: string[]; // 第71天：保存候选版本未达到通过阈值的案例标识。
  scoreDeltas: EvaluationScore; // 第71天：保存候选减基线的七维评分变化。
  qualityGateId: string; // 第71天：关联本次回归使用的质量门禁结论。
  createdAt: number; // 第71天：保存回归比较创建时间戳。
}; // 第71天：结束回归比较摘要结构定义。

export type EvaluationMetrics = { // 第71天：定义任务要求的 Evaluation Metrics V2。
  totalRuns: number; // 第71天：记录评估运行总数。
  successRate: number; // 第71天：记录已完成运行占全部运行的比例。
  avgScore: number; // 第71天：记录全部评估运行平均综合评分。
  avgLatency: number; // 第71天：记录全部评估运行平均响应延迟。
  avgCost: number; // 第71天：记录全部评估运行平均调用成本。
  regressionCount: number; // 第71天：记录回归评估和比较次数。
  badCaseCount: number; // 第71天：记录反馈闭环沉淀的坏案例数量。
  qualityGateFailCount: number; // 第71天：记录质量门禁失败次数。
  evaluatorUsage: number; // 第71天：记录所有评估器累计调用次数。
}; // 第71天：结束 Evaluation Metrics V2 结构定义。

export type EvaluationPlatformSnapshot = { // 第71天：定义 Evaluation Explorer V2 与 API 共用的平台快照。
  datasets: EvaluationDatasetV2[]; // 第71天：保存 Agent、Workflow、Prompt、RAG 和 Memory 数据集。
  runs: EvaluationRun[]; // 第71天：保存在线、离线、回归和实验评估运行列表。
  results: EvaluationCaseResultV2[]; // 第71天：保存案例分析所需输入、输出、期望、评分和 Trace。
  regressions: RegressionComparisonV2[]; // 第71天：保存基线、候选、改进、退化和失败案例摘要。
  qualityGates: QualityGateResultV2[]; // 第71天：保存 PASS、FAIL 和判断原因。
  feedback: UserFeedbackV2[]; // 第71天：保存点赞、点踩、评分和评论记录。
  badCases: EvaluationBadCaseV2[]; // 第71天：保存自动进入回归数据集的线上坏案例。
  traces: import("@/lib/agents/agent-types").Trace[]; // 第71天：保存已自动关联评估结果的 Trace 列表。
  runtimeContexts: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2[]; // 第71天：保存已注入 evaluationContext 的统一运行时上下文。
  events: import("@/lib/events/event-types").RuntimeEventRecord[]; // 第71天：保存评估、质量门禁和坏案例事件时间线。
  registryItems: import("@/lib/registry/registry-types").RegistryItem[]; // 第71天：保存 Evaluation Runner、Evaluator、QualityGate 和 DatasetProvider 注册项。
  metrics: EvaluationMetrics; // 第71天：保存生产评估平台第二版治理指标。
  generatedAt: number; // 第71天：保存平台快照生成时间戳。
}; // 第71天：结束生产评估平台快照结构定义。
