import type { AgentTimelineEvent, WorkspaceEntry } from "../agents/agent-types"; /* 第46天：引入时间线与工作空间条目类型。 */
import { TraceManager } from "../agents/trace-manager"; /* 第46天：复用第44天追踪管理器。 */
import { createWorkspace, MemoryWorkspaceStore } from "../agents/workspace-store"; /* 第46天：复用第43天工作空间存储。 */
import { MemoryBadCaseStore, createSeedBadCases } from "./bad-case-store"; /* 第46天：引入失败案例仓储与历史数据。 */
import { MemoryBaselineStore } from "./baseline-store"; /* 第46天：引入完整基线仓储。 */
import { runBatchEvaluation } from "./batch-evaluation-runner"; /* 第46天：引入批量评估运行器。 */
import { DAY46_EVALUATION_DATASET } from "./evaluation-dataset"; /* 第46天：引入固定回归数据集。 */
import { evaluateQualityGate } from "./quality-gate"; /* 第46天：引入质量门禁。 */
import { compareRegression } from "./regression-comparison"; /* 第46天：引入基线与候选回归对比。 */
import type { BadCaseRecord, BatchCaseExecution, BatchEvaluationCaseResult, EvaluationCase, EvaluationVersion, FailureType, RegressionDashboardSnapshot } from "./regression-types"; /* 第46天：引入持续评估运行时类型。 */

const BASELINE_VERSION: EvaluationVersion = { label: "baseline-v45", model: "qwen2.5:7b", promptVersion: "prompt-v45", workflowVersion: "workflow-v45" }; /* 第46天：定义第45天稳定基线版本。 */
const CANDIDATE_VERSION: EvaluationVersion = { label: "candidate-v46", model: "qwen2.5:7b", promptVersion: "prompt-v46", workflowVersion: "workflow-v46" }; /* 第46天：定义第46天候选版本。 */

const BASELINE_OUTPUTS: Record<string, string> = { /* 第46天：定义可重复的基线输出夹具。 */
  "normal-knowledge-capital": "法国的首都是巴黎。", /* 第46天：保存知识问答基线输出。 */
  "normal-plan-release": "发布前运行测试，然后发布并监控。", /* 第46天：保存规划基线输出。 */
  "normal-tool-weather": "查询天气：weather(location=上海, date=明天)，若降雨则建议携带雨具。", /* 第46天：保存工具调用基线输出。 */
  "bad-factual-arithmetic": "2 + 2 = 5", /* 第46天：保留历史事实错误用于验证修复识别。 */
  "bad-deploy-rollback": "生产发布前检查测试、备份、监控并执行发布。", /* 第46天：保留遗漏回滚的历史输出。 */
  "edge-empty-input": "请补充具体问题、目标或上下文。", /* 第46天：保存空输入基线输出。 */
  "edge-model-timeout": "对长文本限制长度，记录超时，并继续执行后续案例。", /* 第46天：保存超时降级基线输出。 */
}; /* 第46天：结束基线输出夹具。 */

const CANDIDATE_OUTPUTS: Record<string, string> = { /* 第46天：定义第46天候选版本输出夹具。 */
  "normal-knowledge-capital": "法国的首都是巴黎。", /* 第46天：保持知识问答案例不变。 */
  "normal-plan-release": "先运行测试，再灰度发布，最后持续监控并准备回滚。", /* 第46天：补齐发布计划步骤。 */
  "normal-tool-weather": "查询上海明天天气，再给出出行建议。", /* 第46天：故意遗漏工具名和参数以演示高优先级退步阻断。 */
  "bad-factual-arithmetic": "2 + 2 = 4", /* 第46天：修复历史事实错误。 */
  "bad-deploy-rollback": "生产发布前检查测试、备份、监控，采用灰度发布并准备回滚预案。", /* 第46天：修复历史回滚遗漏。 */
  "edge-empty-input": "请补充具体问题、目标或上下文。", /* 第46天：保持空输入澄清行为不变。 */
}; /* 第46天：结束候选版本输出夹具。 */

const baselineStore = new MemoryBaselineStore(); /* 第46天：创建可读写完整结果的基线仓储。 */
let cachedSnapshot: RegressionDashboardSnapshot | null = null; /* 第46天：缓存最近一次回归看板快照。 */
let runningSnapshot: Promise<RegressionDashboardSnapshot> | null = null; /* 第46天：合并并发到达的看板生成请求。 */

function timelineEvent(agentId: string, taskId: string, label: string): AgentTimelineEvent { /* 第46天：创建统一时间线事件。 */
  return { id: `timeline-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, agentId, taskId, label, timestamp: new Date().toISOString() }; /* 第46天：返回带唯一标识和时间戳的事件。 */
} /* 第46天：结束时间线事件创建函数。 */

function workspaceEntry(type: WorkspaceEntry["type"], content: string, tags: string[]): WorkspaceEntry { /* 第46天：创建批量评估工作空间条目。 */
  return { id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, agentId: "regression-evaluator", content, tags, createdAt: Date.now() }; /* 第46天：返回带标签和时间戳的工作空间条目。 */
} /* 第46天：结束工作空间条目创建函数。 */

async function executeFixture(item: EvaluationCase, version: EvaluationVersion): Promise<BatchCaseExecution> { /* 第46天：用确定性夹具模拟同一案例在不同版本上的模型输出。 */
  if (version.label === CANDIDATE_VERSION.label && item.id === "edge-model-timeout") throw new Error("候选版本长文本处理超时，已隔离该案例并继续批任务"); /* 第46天：模拟单案例失败并验证批任务不中断。 */
  const source = version.label === BASELINE_VERSION.label ? BASELINE_OUTPUTS : CANDIDATE_OUTPUTS; /* 第46天：按版本选择固定输出映射。 */
  return { output: source[item.id] ?? "请补充更多上下文后重试。", modelCallCount: 1 }; /* 第46天：返回可重复执行的模型输出与调用次数。 */
} /* 第46天：结束确定性案例执行器。 */

function inferFailureType(result: BatchEvaluationCaseResult): FailureType { /* 第46天：根据失败结果推断失败分类。 */
  if (result.status === "failed") return "tool_error"; /* 第46天：把执行异常归类为工具或运行错误。 */
  if ((result.evaluation?.dimensions.correctness ?? 100) < 70) return "factual_error"; /* 第46天：把低正确性归类为事实错误。 */
  if ((result.evaluation?.dimensions.completeness ?? 100) < 70) return "omission"; /* 第46天：把低完整性归类为遗漏。 */
  if ((result.evaluation?.dimensions.relevance ?? 100) < 70) return "off_topic"; /* 第46天：把低相关性归类为跑题。 */
  return "format_error"; /* 第46天：其余低分归类为格式错误。 */
} /* 第46天：结束失败分类推断函数。 */

async function addCaseTraceSpans(traceManager: TraceManager, traceId: string, parentSpanId: string, runLabel: string, results: BatchEvaluationCaseResult[], timeline: AgentTimelineEvent[]): Promise<void> { /* 第46天：把每个案例结果接入 Trace 与 Timeline。 */
  results.forEach((result) => { /* 第46天：遍历批量评估案例结果。 */
    const spanId = traceManager.startSpan(traceId, { parentSpanId, name: `${runLabel}:${result.caseId}`, type: "evaluation", metadata: { caseId: result.caseId, priority: result.priority, status: result.status } }); /* 第46天：为单案例创建评估跨度。 */
    traceManager.endSpan(traceId, spanId, result.status === "failed" ? "failed" : "success", { score: result.evaluation?.score ?? 0, passed: result.passed, durationMs: result.durationMs }); /* 第46天：写入案例分数、通过状态和耗时。 */
    timeline.push(timelineEvent("regression-evaluator", result.caseId, `${runLabel} case ${result.status} / score ${result.evaluation?.score ?? 0}`)); /* 第46天：把单案例执行结果写入时间线。 */
  }); /* 第46天：结束案例结果遍历。 */
} /* 第46天：结束案例追踪与时间线写入函数。 */

async function buildRegressionSnapshot(): Promise<RegressionDashboardSnapshot> { /* 第46天：执行一次完整持续评估闭环。 */
  const timeline: AgentTimelineEvent[] = []; /* 第46天：创建批量评估时间线。 */
  const workspaceStore = new MemoryWorkspaceStore(); /* 第46天：创建本次评估使用的工作空间仓储。 */
  const workspace = createWorkspace("Day 46 Bad Case Management & Regression Evaluation"); /* 第46天：创建持续评估工作空间。 */
  await workspaceStore.create(workspace); /* 第46天：保存新工作空间。 */
  const traceManager = new TraceManager(); /* 第46天：创建本次批量评估追踪管理器。 */
  const trace = traceManager.startTrace("day46-regression-evaluation"); /* 第46天：开始完整回归评估追踪记录。 */
  const rootSpanId = traceManager.startSpan(trace.traceId, { name: "batch-regression-evaluation", type: "evaluation", metadata: { datasetId: DAY46_EVALUATION_DATASET.id, datasetVersion: DAY46_EVALUATION_DATASET.version } }); /* 第46天：开始批量回归根跨度。 */
  timeline.push(timelineEvent("regression-evaluator", "batch-start", "Batch Evaluation Started（批量评估开始）")); /* 第46天：记录批量评估开始事件。 */
  await workspaceStore.addEntry(workspace.id, workspaceEntry("note", `开始执行 ${DAY46_EVALUATION_DATASET.name} ${DAY46_EVALUATION_DATASET.version}，共 ${DAY46_EVALUATION_DATASET.cases.length} 个案例。`, ["batch-evaluation", "dataset"])); /* 第46天：把批量评估开始写入工作空间。 */
  const baselineRun = await runBatchEvaluation({ dataset: DAY46_EVALUATION_DATASET, version: BASELINE_VERSION, concurrency: 2, executeCase: executeFixture }); /* 第46天：在固定数据集上运行第45天基线版本。 */
  const savedBaseline = await baselineStore.save(baselineRun); /* 第46天：保存包含全部案例明细的基线。 */
  const baseline = await baselineStore.get(DAY46_EVALUATION_DATASET.id, DAY46_EVALUATION_DATASET.version); /* 第46天：从仓储重新读取基线以验证可读性。 */
  if (!baseline) throw new Error("保存后的 Baseline 无法读取"); /* 第46天：基线读取失败时阻止无参照的回归比较。 */
  if (baseline.id !== savedBaseline.id) throw new Error("读取到的 Baseline 与保存结果不一致"); /* 第46天：校验读取基线与保存结果一致。 */
  const baselineSpanId = traceManager.startSpan(trace.traceId, { parentSpanId: rootSpanId, name: "baseline-run", type: "evaluation", metadata: { version: baseline.version.label } }); /* 第46天：创建基线运行追踪跨度。 */
  await addCaseTraceSpans(traceManager, trace.traceId, baselineSpanId, "Baseline", baseline.results, timeline); /* 第46天：写入基线单案例追踪与时间线。 */
  traceManager.endSpan(trace.traceId, baselineSpanId, "success", { averageScore: baseline.summary.averageScore, passRate: baseline.summary.passRate }); /* 第46天：结束基线运行追踪跨度。 */
  const candidate = await runBatchEvaluation({ dataset: DAY46_EVALUATION_DATASET, version: CANDIDATE_VERSION, concurrency: 3, executeCase: executeFixture }); /* 第46天：在同一固定数据集上运行第46天候选版本。 */
  const candidateSpanId = traceManager.startSpan(trace.traceId, { parentSpanId: rootSpanId, name: "candidate-run", type: "evaluation", metadata: { version: candidate.version.label } }); /* 第46天：创建候选运行追踪跨度。 */
  await addCaseTraceSpans(traceManager, trace.traceId, candidateSpanId, "Candidate", candidate.results, timeline); /* 第46天：写入候选单案例追踪与时间线。 */
  traceManager.endSpan(trace.traceId, candidateSpanId, candidate.summary.failedCount > 0 ? "failed" : "success", { averageScore: candidate.summary.averageScore, passRate: candidate.summary.passRate }); /* 第46天：结束候选运行追踪跨度。 */
  const comparison = compareRegression(baseline, candidate); /* 第46天：生成基线与候选回归报告。 */
  timeline.push(timelineEvent("regression-evaluator", "comparison", `Regression Comparison Finished（回归对比完成）：改进 ${comparison.improvedCases.length}，退步 ${comparison.regressedCases.length}`)); /* 第46天：记录版本对比完成事件。 */
  await workspaceStore.addEntry(workspace.id, workspaceEntry("decision", `候选版本平均分变化 ${comparison.averageScoreDelta}，通过率变化 ${(comparison.passRateDelta * 100).toFixed(1)}%，发现 ${comparison.regressedCases.length} 个退步案例。`, ["regression-comparison", "candidate-v46"])); /* 第46天：把版本对比结论写入工作空间。 */
  const badCaseStore = new MemoryBadCaseStore(); /* 第46天：创建本次评估使用的失败案例仓储。 */
  for (const record of createSeedBadCases()) await badCaseStore.upsert(record); /* 第46天：载入历史失败案例。 */
  for (const fixedCaseId of comparison.fixedFailures) await badCaseStore.markRegression(fixedCaseId, true, true); /* 第46天：标记已经修复并通过回归的历史失败。 */
  for (const regressed of comparison.regressedCases) { /* 第46天：把候选版本退步沉淀为新的失败案例。 */
    const result = candidate.results.find((item) => item.caseId === regressed.caseId); /* 第46天：读取退步案例的候选执行结果。 */
    if (!result) continue; /* 第46天：候选结果缺失时跳过自动沉淀。 */
    const record: BadCaseRecord = { id: `bad-record-${regressed.caseId}`, evaluationCaseId: regressed.caseId, failureType: inferFailureType(result), severity: regressed.priority === "critical" ? "critical" : regressed.priority === "high" ? "major" : "minor", impactScope: `评估标签：${DAY46_EVALUATION_DATASET.cases.find((item) => item.id === regressed.caseId)?.tags.join("、") ?? "未分类"}`, agentId: "regression-evaluator", promptVersion: CANDIDATE_VERSION.promptVersion, traceId: trace.traceId, fixed: false, regressionPassed: false, description: regressed.reason, createdAt: Date.now() }; /* 第46天：创建包含类型、严重度、版本和追踪 ID 的失败记录。 */
    await badCaseStore.upsert(record); /* 第46天：保存新发现的退步失败案例。 */
    await workspaceStore.addEntry(workspace.id, workspaceEntry("finding", `退步案例 ${regressed.caseId}：${regressed.reason}`, ["bad-case", inferFailureType(result)])); /* 第46天：把待修复退步写入工作空间。 */
  } /* 第46天：结束退步案例沉淀。 */
  const badCases = await badCaseStore.list(); /* 第46天：读取包含修复状态和新退步的失败案例列表。 */
  const qualityGate = evaluateQualityGate({ comparison, candidate, dataset: DAY46_EVALUATION_DATASET, badCases }); /* 第46天：执行平均分、通过率、优先级和严重失败门禁。 */
  const gateSpanId = traceManager.startSpan(trace.traceId, { parentSpanId: rootSpanId, name: "quality-gate", type: "evaluation", metadata: { checkCount: qualityGate.checks.length } }); /* 第46天：创建质量门禁追踪跨度。 */
  traceManager.endSpan(trace.traceId, gateSpanId, qualityGate.status === "passed" ? "success" : "failed", { status: qualityGate.status, failureReasons: qualityGate.failureReasons }); /* 第46天：写入门禁状态和阻断原因。 */
  timeline.push(timelineEvent("quality-gate", "quality-gate", `Quality Gate ${qualityGate.status.toUpperCase()}（质量门禁${qualityGate.status === "passed" ? "通过" : "阻断"}）`)); /* 第46天：记录质量门禁最终事件。 */
  await workspaceStore.addEntry(workspace.id, workspaceEntry("final", `Quality Gate（质量门禁）${qualityGate.status === "passed" ? "通过" : "未通过"}：${qualityGate.failureReasons.join("；") || "全部验收条件满足"}`, ["quality-gate", qualityGate.status])); /* 第46天：把门禁结论写入工作空间。 */
  traceManager.endSpan(trace.traceId, rootSpanId, qualityGate.status === "passed" ? "success" : "failed", { averageScoreDelta: comparison.averageScoreDelta, passRateDelta: comparison.passRateDelta, gateStatus: qualityGate.status }); /* 第46天：结束批量回归根跨度。 */
  traceManager.endTrace(trace.traceId); /* 第46天：结束完整回归评估追踪记录。 */
  const storedWorkspace = await workspaceStore.get(workspace.id); /* 第46天：读取沉淀后的工作空间快照。 */
  if (!storedWorkspace) throw new Error("Regression Workspace 写入失败"); /* 第46天：工作空间读取失败时抛出明确错误。 */
  return { dataset: DAY46_EVALUATION_DATASET, badCases, baseline, candidate, comparison, qualityGate, workspace: storedWorkspace, timeline, trace: traceManager.getTrace(trace.traceId) ?? trace, generatedAt: Date.now() }; /* 第46天：返回回归看板所需的完整快照。 */
} /* 第46天：结束持续评估闭环执行函数。 */

export async function getRegressionDashboardSnapshot(force = false): Promise<RegressionDashboardSnapshot> { /* 第46天：读取或重新生成回归评估看板快照。 */
  if (!force && cachedSnapshot) return cachedSnapshot; /* 第46天：非强制模式优先复用最近快照。 */
  if (!force && runningSnapshot) return runningSnapshot; /* 第46天：已有生成任务时复用同一个 Promise。 */
  runningSnapshot = buildRegressionSnapshot(); /* 第46天：启动一次完整持续评估闭环。 */
  try { /* 第46天：确保缓存与运行状态一致更新。 */
    cachedSnapshot = await runningSnapshot; /* 第46天：等待并缓存最新快照。 */
    return cachedSnapshot; /* 第46天：返回最新回归评估快照。 */
  } finally { /* 第46天：无论成功失败都清理运行标记。 */
    runningSnapshot = null; /* 第46天：允许后续强制重新运行。 */
  } /* 第46天：结束缓存状态维护。 */
} /* 第46天：结束回归看板快照读取函数。 */
