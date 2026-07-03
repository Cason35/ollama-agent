import type { AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 第53天：引入时间线事件类型用于记录实验可观测过程。 */
import { runBatchEvaluation } from "@/lib/evaluation/batch-evaluation-runner"; /* 第53天：复用第46天批量评估运行器执行同一套用例。 */
import type { BatchCaseExecution, BatchEvaluationCaseResult, BatchEvaluationRun, EvaluationCase, EvaluationDataset, EvaluationVersion } from "@/lib/evaluation/regression-types"; /* 第53天：引入批量评估执行与案例类型。 */
import type { PromptRegistry } from "@/lib/prompts/prompt-registry"; /* 第53天：引入提示词注册表类型用于读取候选版本。 */
import { renderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第53天：引入提示词渲染器，确保实验真实使用 Prompt Template。 */
import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第53天：引入提示词模板类型。 */
import type { PromptExperiment, PromptExperimentQualityGate, PromptExperimentResult, PromptExperimentRun, WinnerRule } from "@/lib/prompts/prompt-experiment-types"; /* 第53天：引入提示词实验核心类型。 */

const HIGH_PRIORITY_SET = new Set(["high", "critical"]); /* 第53天：定义质量门禁关注的高优先级集合。 */

function unique(values: string[]): string[] { /* 第53天：定义字符串数组去重工具。 */
  return Array.from(new Set(values.filter(Boolean))); /* 第53天：过滤空字符串并保留首次出现顺序。 */
} /* 第53天：结束字符串数组去重工具。 */

function round(value: number, digits = 2): number { /* 第53天：定义稳定小数格式化函数。 */
  return Number(value.toFixed(digits)); /* 第53天：用固定小数位避免仪表盘和测试出现浮点噪声。 */
} /* 第53天：结束稳定小数格式化函数。 */

function timelineEvent(taskId: string, label: string): AgentTimelineEvent { /* 第53天：定义实验时间线事件创建函数。 */
  return { id: `day53-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, agentId: "prompt-experiment-runner", taskId, label, timestamp: new Date().toISOString() }; /* 第53天：返回包含唯一 ID、执行者、任务和时间戳的事件。 */
} /* 第53天：结束实验时间线事件创建函数。 */

function promptCost(prompt: PromptTemplate): number { /* 第53天：定义提示词成本估算读取函数。 */
  return prompt.costEstimate ?? 0.005; /* 第53天：缺少成本时使用教学项目默认单案例成本。 */
} /* 第53天：结束提示词成本估算读取函数。 */

function estimateLatency(prompt: PromptTemplate, caseIndex: number): number { /* 第53天：定义稳定延迟估算函数。 */
  return Math.round(320 + prompt.template.length * 1.6 + caseIndex * 9); /* 第53天：用模板长度和案例序号模拟版本延迟差异。 */
} /* 第53天：结束稳定延迟估算函数。 */

function buildCaseVariables(item: EvaluationCase, prompt: PromptTemplate): Record<string, string> { /* 第53天：定义实验案例渲染变量构造函数。 */
  const base: Record<string, string> = { task: item.input || "空输入案例需要澄清。", workspace: `评估案例：${item.name}；标签：${item.tags.join("、")}`, memory: "历史回归要求：关键案例不能退步，输出要覆盖参考答案和风险边界。", tools: "retrieval, weather, calculator, checklist", agentId: prompt.componentId, output: item.expectedOutput ?? item.referenceAnswer ?? "无参考输出", threshold: String(item.rubric.passThreshold), agents: "research, planner, writer, critic" }; /* 第53天：准备内置变量样例值。 */
  return Object.fromEntries(prompt.variables.map((variable) => [variable, base[variable] ?? `实验变量 ${variable}`])); /* 第53天：只返回当前提示词声明需要的变量。 */
} /* 第53天：结束实验案例渲染变量构造函数。 */

function allRequiredTerms(item: EvaluationCase): string[] { /* 第53天：定义从评分规则中提取全部必需术语的函数。 */
  return unique(Object.values(item.rubric.dimensions).flatMap((dimension) => dimension.requiredTerms)); /* 第53天：合并四个维度的关键术语作为满分输出覆盖词。 */
} /* 第53天：结束必需术语提取函数。 */

function baselineTerms(item: EvaluationCase): string[] { /* 第53天：定义当前 active 基线版本覆盖的术语集合。 */
  const terms = allRequiredTerms(item); /* 第53天：读取该案例全部关键术语。 */
  if (HIGH_PRIORITY_SET.has(item.priority)) return terms; /* 第53天：基线对高优先级案例保持完整覆盖，避免实验基准过弱。 */
  return unique([...item.rubric.dimensions.completeness.requiredTerms, ...item.rubric.dimensions.correctness.requiredTerms, ...item.rubric.dimensions.relevance.requiredTerms]); /* 第53天：普通案例基线故意少覆盖边界词，给候选改进空间。 */
} /* 第53天：结束基线术语集合函数。 */

function termsForVersion(item: EvaluationCase, version: string): string[] { /* 第53天：定义不同 Prompt Version 的确定性输出覆盖策略。 */
  if (version === "v3") return allRequiredTerms(item); /* 第53天：v3 覆盖所有评分术语，代表更完整的候选提示词。 */
  if (version === "v2") return baselineTerms(item); /* 第53天：v2 作为 active 基线，覆盖核心信息但不总是覆盖边界项。 */
  return unique([...item.rubric.dimensions.completeness.requiredTerms.slice(0, 1), ...item.rubric.dimensions.relevance.requiredTerms.slice(0, 1)]); /* 第53天：v1 代表旧提示词，输出较短且容易遗漏。 */
} /* 第53天：结束不同版本输出覆盖策略。 */

function buildExperimentOutput(item: EvaluationCase, prompt: PromptTemplate, caseIndex: number): string { /* 第53天：定义实验中某版本对某案例的模拟输出。 */
  const rendered = renderPrompt(prompt, buildCaseVariables(item, prompt)); /* 第53天：真实渲染候选提示词，验证变量契约和模板正文可用。 */
  const reference = prompt.version === "v3" ? item.expectedOutput ?? item.referenceAnswer ?? "请补充具体问题、目标或上下文。" : prompt.version === "v2" ? "结构化回答，覆盖核心事实、动作和任务相关信息。" : "简短回答，先给出最小可用结论。"; /* 第53天：仅 v3 使用完整参考答案，避免旧版本被参考答案意外抬满分。 */
  const terms = termsForVersion(item, prompt.version); /* 第53天：按版本策略选择要覆盖的评分术语。 */
  const latency = estimateLatency(prompt, caseIndex); /* 第53天：生成稳定延迟指标并写入输出便于追踪。 */
  return `${reference}\n覆盖要点：${terms.join("、")}\n实验版本：${prompt.id}\n延迟估算：${latency}ms\n提示词摘要：${rendered.slice(0, 180)}`; /* 第53天：返回可被评分器稳定评估的案例输出。 */
} /* 第53天：结束实验案例输出构造函数。 */

function evaluationVersion(prompt: PromptTemplate): EvaluationVersion { /* 第53天：定义批量评估所需的版本描述。 */
  return { label: `prompt-experiment-${prompt.componentId}-${prompt.version}`, model: "deterministic-fixture", promptVersion: prompt.id, workflowVersion: "day53-prompt-experiment-v1" }; /* 第53天：返回绑定 Prompt Version 的评估版本。 */
} /* 第53天：结束评估版本描述函数。 */

function scoreOf(result: BatchEvaluationCaseResult): number { /* 第53天：定义案例结果分数读取函数。 */
  return result.evaluation?.score ?? 0; /* 第53天：失败或跳过案例按零分参与退步判断。 */
} /* 第53天：结束案例结果分数读取函数。 */

function costIncrease(candidateCost: number, baselineCost: number): number { /* 第53天：定义成本增长比例计算函数。 */
  if (baselineCost <= 0) return 0; /* 第53天：防止基线成本异常导致除零。 */
  return round((candidateCost - baselineCost) / baselineCost, 4); /* 第53天：返回相对增长比例，例如 0.2 表示增长 20%。 */
} /* 第53天：结束成本增长比例计算函数。 */

function summarizeResult(experiment: PromptExperiment, prompt: PromptTemplate, baselinePrompt: PromptTemplate, runResults: BatchEvaluationCaseResult[], baselineResults: BatchEvaluationCaseResult[]): PromptExperimentResult { /* 第53天：定义单个候选版本的实验结果汇总函数。 */
  const baselineScores = new Map(baselineResults.map((result) => [result.caseId, scoreOf(result)])); /* 第53天：按案例 ID 保存 active 基线分数。 */
  const caseScores = runResults.map((result, index) => { const score = scoreOf(result); const baselineScore = baselineScores.get(result.caseId) ?? 0; return { caseId: result.caseId, caseName: result.caseName, priority: result.priority, score, scoreDelta: round(score - baselineScore), passed: result.passed, cost: round(promptCost(prompt), 5), latencyMs: estimateLatency(prompt, index), regressed: score < baselineScore }; }); /* 第53天：生成案例级分数、成本、延迟和退步标记。 */
  const sortedBest = [...caseScores].sort((left, right) => right.score - left.score || left.caseId.localeCompare(right.caseId)); /* 第53天：按分数降序生成最佳案例列表。 */
  const sortedWorst = [...caseScores].sort((left, right) => left.score - right.score || left.caseId.localeCompare(right.caseId)); /* 第53天：按分数升序生成最差案例列表。 */
  const averageCost = round(promptCost(prompt), 5); /* 第53天：读取并格式化候选版本平均成本。 */
  const baselineCost = promptCost(baselinePrompt); /* 第53天：读取 active 基线平均成本。 */
  return { experimentId: experiment.id, promptVersion: prompt.version, promptId: prompt.id, averageScore: round(runResults.reduce((sum, result) => sum + scoreOf(result), 0) / Math.max(1, runResults.length)), passRate: round(runResults.filter((result) => result.passed).length / Math.max(1, runResults.length), 4), averageCost, costIncrease: costIncrease(averageCost, baselineCost), averageLatencyMs: round(runResults.reduce((sum, _result, index) => sum + estimateLatency(prompt, index), 0) / Math.max(1, runResults.length)), regressionCount: caseScores.filter((item) => item.regressed).length, highPriorityRegressionCount: caseScores.filter((item) => item.regressed && HIGH_PRIORITY_SET.has(item.priority)).length, bestCases: sortedBest.slice(0, 3).map((item) => item.caseId), worstCases: sortedWorst.slice(0, 3).map((item) => item.caseId), caseScores }; /* 第53天：返回完整实验聚合结果。 */
} /* 第53天：结束单版本实验结果汇总函数。 */

function balancedValue(result: PromptExperimentResult): number { /* 第53天：定义平衡模式下的综合价值分。 */
  return result.averageScore - result.averageCost * 1000 - result.averageLatencyMs / 120 - result.regressionCount * 25; /* 第53天：同时惩罚成本、延迟和退步案例。 */
} /* 第53天：结束平衡综合价值分函数。 */

function passesWinnerRule(result: PromptExperimentResult, rule: WinnerRule): boolean { /* 第53天：定义候选版本是否满足获胜硬约束的函数。 */
  if (rule.minScore != null && result.averageScore < rule.minScore) return false; /* 第53天：平均分低于阈值时不能获胜。 */
  if (rule.maxCostIncrease != null && result.costIncrease > rule.maxCostIncrease) return false; /* 第53天：成本增长超过阈值时不能获胜。 */
  if (rule.requireNoHighPriorityRegression && result.highPriorityRegressionCount > 0) return false; /* 第53天：存在高优先级退步时不能获胜。 */
  return true; /* 第53天：全部硬约束通过后允许进入排序。 */
} /* 第53天：结束获胜硬约束判断函数。 */

function selectWinner(results: PromptExperimentResult[], rule: WinnerRule): PromptExperimentResult | null { /* 第53天：定义 Winner Selection（获胜版本选择）函数。 */
  const eligible = results.filter((result) => passesWinnerRule(result, rule)); /* 第53天：先筛出满足硬约束的候选版本。 */
  if (eligible.length === 0) return null; /* 第53天：没有候选满足门禁时返回空。 */
  if (rule.optimizeFor === "cost") return [...eligible].sort((left, right) => left.averageCost - right.averageCost || right.averageScore - left.averageScore)[0]; /* 第53天：成本优先时先比成本再比分数。 */
  if (rule.optimizeFor === "score") return [...eligible].sort((left, right) => right.averageScore - left.averageScore || left.averageCost - right.averageCost)[0]; /* 第53天：质量优先时先比分数再比成本。 */
  return [...eligible].sort((left, right) => balancedValue(right) - balancedValue(left) || right.averageScore - left.averageScore)[0]; /* 第53天：平衡模式按综合价值分排序。 */
} /* 第53天：结束获胜版本选择函数。 */

function evaluateExperimentQualityGate(winner: PromptExperimentResult | null, rule: WinnerRule): PromptExperimentQualityGate { /* 第53天：定义获胜版本质量门禁函数。 */
  const checks = [ /* 第53天：开始构造质量门禁检查项。 */
    { id: "winner-exists", label: "存在满足规则的获胜版本", passed: Boolean(winner), detail: winner ? `获胜版本为 ${winner.promptVersion}` : "没有候选版本满足 Winner Rule" }, /* 第53天：检查是否选出了获胜版本。 */
    { id: "minimum-score", label: "平均分达到阈值", passed: !winner || rule.minScore == null || winner.averageScore >= rule.minScore, detail: winner ? `平均分 ${winner.averageScore}，阈值 ${rule.minScore ?? "未设置"}` : "无获胜版本可检查" }, /* 第53天：检查平均分阈值。 */
    { id: "cost-increase", label: "成本增长在允许范围内", passed: !winner || rule.maxCostIncrease == null || winner.costIncrease <= rule.maxCostIncrease, detail: winner ? `成本增长 ${(winner.costIncrease * 100).toFixed(1)}%，上限 ${rule.maxCostIncrease == null ? "未设置" : `${(rule.maxCostIncrease * 100).toFixed(1)}%`}` : "无获胜版本可检查" }, /* 第53天：检查成本增长阈值。 */
    { id: "priority-regression", label: "高优先级案例无退步", passed: !winner || !rule.requireNoHighPriorityRegression || winner.highPriorityRegressionCount === 0, detail: winner ? `高优先级退步 ${winner.highPriorityRegressionCount} 个` : "无获胜版本可检查" }, /* 第53天：检查高优先级退步。 */
  ]; /* 第53天：结束质量门禁检查项构造。 */
  const failureReasons = checks.filter((check) => !check.passed).map((check) => `${check.label}：${check.detail}`); /* 第53天：收集未通过检查作为阻断原因。 */
  return { status: failureReasons.length === 0 ? "passed" : "failed", checks, failureReasons }; /* 第53天：返回最终质量门禁结果。 */
} /* 第53天：结束获胜版本质量门禁函数。 */

export class PromptExperimentRunner { /* 第53天：定义 PromptExperimentRunner（提示词实验运行器）。 */
  constructor(private readonly registry: PromptRegistry, private readonly experiments: PromptExperiment[], private readonly datasets: EvaluationDataset[]) {} /* 第53天：注入 PromptRegistry、实验定义和评估数据集。 */

  async runExperiment(experimentId: string): Promise<PromptExperimentRun> { /* 第53天：定义按实验 ID 运行完整提示词实验的方法。 */
    const experiment = this.experiments.find((item) => item.id === experimentId); /* 第53天：从实验列表读取目标实验。 */
    if (!experiment) throw new Error(`实验不存在：${experimentId}`); /* 第53天：实验不存在时抛出明确错误。 */
    const dataset = this.datasets.find((item) => item.id === experiment.datasetId); /* 第53天：读取实验绑定的评估数据集。 */
    if (!dataset) throw new Error(`实验数据集不存在：${experiment.datasetId}`); /* 第53天：数据集不存在时阻止运行。 */
    const baselinePrompt = this.registry.getActive(experiment.componentId); /* 第53天：读取实验开始时的 active 提示词作为基线。 */
    if (!baselinePrompt) throw new Error(`组件没有 active Prompt：${experiment.componentId}`); /* 第53天：没有 active 基线时不能判断退步和成本增长。 */
    const prompts = experiment.candidateVersions.map((version) => this.registry.getVersion(experiment.componentId, version)); /* 第53天：按版本列表读取候选提示词模板。 */
    if (prompts.some((prompt) => !prompt)) throw new Error(`实验候选版本缺失：${experiment.candidateVersions.join(", ")}`); /* 第53天：任一候选版本缺失时阻止实验。 */
    const validPrompts = prompts.filter((prompt): prompt is PromptTemplate => Boolean(prompt)); /* 第53天：把候选列表收窄为有效模板数组。 */
    const timeline: AgentTimelineEvent[] = [timelineEvent(experiment.id, "Experiment Created（实验已创建）")]; /* 第53天：初始化实验时间线。 */
    const batchRuns: BatchEvaluationRun[] = []; /* 第53天：创建批量评估运行结果数组。 */
    for (const prompt of validPrompts) { /* 第53天：逐个候选版本执行同一套评估用例。 */
      timeline.push(timelineEvent(`${prompt.version}-started`, `Version ${prompt.version} Started（${prompt.version} 版本开始测试）`)); /* 第53天：记录候选版本开始事件。 */
      const run = await runBatchEvaluation({ dataset, version: evaluationVersion(prompt), concurrency: 2, executeCase: async (item): Promise<BatchCaseExecution> => ({ output: buildExperimentOutput(item, prompt, dataset.cases.findIndex((caseItem) => caseItem.id === item.id)), modelCallCount: 1 }) }); /* 第53天：执行候选版本的确定性批量评估。 */
      batchRuns.push(run); /* 第53天：保存该版本批量评估结果。 */
      timeline.push(timelineEvent(`${prompt.version}-completed`, `Version ${prompt.version} Completed（${prompt.version} 版本测试完成）：score ${run.summary.averageScore}`)); /* 第53天：记录候选版本完成事件。 */
    } /* 第53天：结束候选版本批量评估循环。 */
    const baselineRun = batchRuns.find((run) => run.version.promptVersion === baselinePrompt.id) ?? batchRuns[0]; /* 第53天：找到 active 基线对应的批量评估结果。 */
    const results = validPrompts.map((prompt, index) => summarizeResult(experiment, prompt, baselinePrompt, batchRuns[index].results, baselineRun.results)); /* 第53天：汇总每个版本相对基线的分数、成本、延迟和退步。 */
    const winner = selectWinner(results, experiment.winnerRule); /* 第53天：根据 Winner Rule 选择获胜版本。 */
    const qualityGate = evaluateExperimentQualityGate(winner, experiment.winnerRule); /* 第53天：对获胜版本执行质量门禁。 */
    timeline.push(timelineEvent("winner-selected", winner ? `Winner Selected（已选出获胜版本）：${winner.promptVersion}` : "Winner Selection Failed（未选出获胜版本）")); /* 第53天：记录获胜选择事件。 */
    return { experiment: { ...experiment, status: qualityGate.status === "passed" ? "completed" : "failed", updatedAt: Date.now() }, dataset, prompts: validPrompts, baselineVersion: baselinePrompt.version, batchRuns, results, winnerVersion: winner?.promptVersion ?? null, winnerReason: winner ? `${experiment.winnerRule.optimizeFor} 策略选择 ${winner.promptVersion}，平均分 ${winner.averageScore}，成本 $${winner.averageCost.toFixed(5)}，延迟 ${winner.averageLatencyMs}ms。` : "没有候选版本满足最低分、成本增长或高优先级退步约束。", qualityGate, timeline, generatedAt: Date.now() }; /* 第53天：返回完整提示词实验运行快照。 */
  } /* 第53天：结束按实验 ID 运行完整提示词实验的方法。 */
} /* 第53天：结束 PromptExperimentRunner（提示词实验运行器）。 */
