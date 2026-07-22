import { randomUUID } from "node:crypto"; // 第71天：引入 UUID 生成器创建评估运行、结果、反馈、坏案例和事件标识。
import { TraceManager } from "@/lib/agents/trace-manager"; // 第71天：引入 TraceManager 自动记录评估运行和单案例跨度。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第71天：引入内存事件总线发布评估、质量门禁和坏案例事件。
import type { EventType, RuntimeEvent } from "@/lib/events/event-types"; // 第71天：引入统一事件类型和事件结构。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第71天：引入历史统一注册中心作为生产评估平台能力底座。
import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第71天：引入统一注册中心类型供依赖注入和能力发现。
import { runtimeContextBuilder, type RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第71天：引入统一运行时上下文构建器并注入 evaluationContext。
import { EvaluationDatasetProviderV2 } from "@/lib/evaluation/evaluation-dataset-provider-v2"; // 第71天：引入平台级评估数据集提供者。
import { createDefaultEvaluationStrategyRegistry, type EvaluationStrategyRegistry } from "@/lib/evaluation/evaluation-strategy-registry"; // 第71天：引入包含六类评估器的默认策略注册中心。
import { evaluateQualityGateV2 } from "@/lib/evaluation/quality-gate-v2"; // 第71天：引入多维 Quality Gate V2 判断函数。
import type { EvaluationBadCaseV2, EvaluationCaseResultV2, EvaluationCaseV2, EvaluationExecution, EvaluationMetrics, EvaluationPlatformSnapshot, EvaluationRun, EvaluationRunType, EvaluationScore, EvaluationStrategyOutput, EvaluationUsage, QualityGateResultV2, RegressionComparisonV2, UserFeedbackV2 } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入生产评估平台运行、评分、回归、反馈、坏案例和快照类型。

type RunEvaluationInput = { // 第71天：定义 Evaluation Runner V2 的统一运行入口参数。
  type: EvaluationRunType; // 第71天：指定在线、离线、回归或实验运行类型。
  datasetId: string; // 第71天：指定平台级评估数据集稳定标识。
  datasetVersion?: number; // 第71天：按需冻结具体数据集版本。
  label: string; // 第71天：指定本次运行的版本或场景可读标签。
  agentId?: string; // 第71天：按需关联被评估的 Agent 标识。
  taskId?: string; // 第71天：按需关联被评估的任务标识。
  executeCase: (evaluationCase: EvaluationCaseV2) => Promise<EvaluationExecution> | EvaluationExecution; // 第71天：注入真实业务运行时或确定性测试夹具。
}; // 第71天：结束 Evaluation Runner V2 统一入口参数定义。

type OnlineEvaluationInput = { // 第71天：定义在线采样和风险触发评估入口参数。
  requestId: string; // 第71天：保存生产请求标识用于确定性采样。
  datasetId: string; // 第71天：指定在线评估使用的数据集。
  label: string; // 第71天：保存在线生产请求场景标签。
  sampleRate: number; // 第71天：保存零到一之间的基础采样比例。
  latencyMs: number; // 第71天：保存生产请求实际延迟供风险触发判断。
  latencyThresholdMs: number; // 第71天：保存高延迟风险阈值。
  userFeedback?: number; // 第71天：按需保存一到五分的即时用户反馈。
  executeCase: RunEvaluationInput["executeCase"]; // 第71天：复用统一业务案例执行函数。
}; // 第71天：结束在线评估入口参数定义。

const SCORE_DIMENSIONS = ["correctness", "relevance", "completeness", "safety", "latency", "cost"] as const; // 第71天：声明需要聚合的六个基础评分维度。

function emptyScore(): EvaluationScore { // 第71天：定义创建七维零分对象的辅助函数。
  return { correctness: 0, relevance: 0, completeness: 0, safety: 0, latency: 0, cost: 0, overall: 0 }; // 第71天：返回正确性、相关性、完整性、安全、延迟、成本和综合分零值。
} // 第71天：结束七维零分对象创建函数。

function emptyUsage(): EvaluationUsage { // 第71天：定义创建空用量对象的辅助函数。
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, cost: 0 }; // 第71天：返回令牌、延迟和成本零值。
} // 第71天：结束空用量对象创建函数。

function clampScore(value: number): number { return Number(Math.min(10, Math.max(0, value)).toFixed(2)); } // 第71天：限制评分范围为零到十分并保留两位小数。
function average(values: number[]): number { return values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)); } // 第71天：计算数字列表平均值并安全处理空列表。
function sum(values: number[]): number { return Number(values.reduce((total, value) => total + value, 0).toFixed(6)); } // 第71天：计算令牌或成本总和并限制浮点误差。

function evaluatorVersions(outputs: EvaluationStrategyOutput[]): Record<string, string> { // 第71天：把评估器输出转换为 Trace 和 RuntimeContext 使用的版本映射。
  return Object.fromEntries(outputs.map((output) => [output.evaluatorId, output.evaluatorVersion])); // 第71天：按评估器标识保存实际执行版本。
} // 第71天：结束评估器版本映射函数。

function scoreLatency(usage: EvaluationUsage, evaluationCase: EvaluationCaseV2): number { // 第71天：把实际延迟相对案例阈值换算为十分制评分。
  const threshold = typeof evaluationCase.metadata.latencyThresholdMs === "number" ? evaluationCase.metadata.latencyThresholdMs : 1000; // 第71天：读取案例延迟阈值并在缺失时使用一秒默认值。
  if (usage.latencyMs <= 0) return 10; // 第71天：没有延迟或同步夹具视为满分。
  return clampScore((threshold / Math.max(usage.latencyMs, threshold)) * 10); // 第71天：阈值内得满分，超出后按反比例降低评分。
} // 第71天：结束延迟评分函数。

function scoreCost(usage: EvaluationUsage, evaluationCase: EvaluationCaseV2): number { // 第71天：把实际成本相对案例预算换算为十分制评分。
  const budget = typeof evaluationCase.metadata.costBudget === "number" ? evaluationCase.metadata.costBudget : 0.02; // 第71天：读取案例成本预算并在缺失时使用默认预算。
  if (usage.cost <= 0) return 10; // 第71天：没有模型成本的确定性运行视为满分。
  return clampScore((budget / Math.max(usage.cost, budget)) * 10); // 第71天：预算内得满分，超出后按反比例降低评分。
} // 第71天：结束成本评分函数。

function mergeScores(outputs: EvaluationStrategyOutput[], execution: EvaluationExecution, evaluationCase: EvaluationCaseV2): EvaluationScore { // 第71天：合并多个可插拔评估器输出并补充延迟和成本维度。
  const buckets = Object.fromEntries(SCORE_DIMENSIONS.map((dimension) => [dimension, [] as number[]])) as Record<(typeof SCORE_DIMENSIONS)[number], number[]>; // 第71天：为六个基础维度创建评分收集桶。
  for (const output of outputs) for (const dimension of SCORE_DIMENSIONS) { const value = output.scores[dimension]; if (typeof value === "number") buckets[dimension].push(value); } // 第71天：收集每个评估器实际负责的全部维度评分。
  buckets.latency.push(scoreLatency(execution.usage, evaluationCase)); // 第71天：把实际延迟换算评分加入延迟维度。
  buckets.cost.push(scoreCost(execution.usage, evaluationCase)); // 第71天：把实际成本换算评分加入成本维度。
  const score = { correctness: average(buckets.correctness), relevance: average(buckets.relevance), completeness: average(buckets.completeness), safety: average(buckets.safety), latency: average(buckets.latency), cost: average(buckets.cost), overall: 0 }; // 第71天：计算六个基础维度的平均评分。
  score.overall = clampScore(score.correctness * 0.24 + score.relevance * 0.16 + score.completeness * 0.18 + score.safety * 0.18 + score.latency * 0.12 + score.cost * 0.12); // 第71天：按生产质量权重计算综合评分并兼顾正确性、安全、延迟和成本。
  return score; // 第71天：返回完整七维评估评分。
} // 第71天：结束多评估器评分合并函数。

function aggregateRunScore(results: EvaluationCaseResultV2[]): EvaluationScore { // 第71天：聚合单案例结果生成 EvaluationRun 多维评分。
  if (results.length === 0) return emptyScore(); // 第71天：空运行返回七维零分避免除零。
  return { correctness: average(results.map((item) => item.scores.correctness)), relevance: average(results.map((item) => item.scores.relevance)), completeness: average(results.map((item) => item.scores.completeness)), safety: average(results.map((item) => item.scores.safety)), latency: average(results.map((item) => item.scores.latency)), cost: average(results.map((item) => item.scores.cost)), overall: average(results.map((item) => item.scores.overall)) }; // 第71天：返回全部案例在七个维度上的平均评分。
} // 第71天：结束 EvaluationRun 多维评分聚合函数。

function aggregateRunUsage(results: EvaluationCaseResultV2[]): EvaluationUsage { // 第71天：聚合单案例用量生成 EvaluationRun 用量摘要。
  return { promptTokens: sum(results.map((item) => item.usage.promptTokens)), completionTokens: sum(results.map((item) => item.usage.completionTokens)), totalTokens: sum(results.map((item) => item.usage.totalTokens)), latencyMs: average(results.map((item) => item.usage.latencyMs)), cost: average(results.map((item) => item.usage.cost)) }; // 第71天：累计令牌并计算平均延迟和平均成本供质量门禁比较。
} // 第71天：结束 EvaluationRun 用量聚合函数。

function stableSample(requestId: string, sampleRate: number): boolean { // 第71天：定义无需随机数且可重复验证的在线请求采样函数。
  const bucket = Array.from(requestId).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 10000, 0); // 第71天：把生产请求标识稳定映射到零到九千九百九十九分桶。
  return bucket < Math.min(1, Math.max(0, sampleRate)) * 10000; // 第71天：根据采样比例判断当前请求是否进入自动评估。
} // 第71天：结束确定性在线采样函数。

export class EvaluationPlatformRuntime { // 第71天：实现贯穿运行时、追踪、评估器、反馈、回归和质量门禁的生产评估平台核心。
  readonly registry: UnifiedRegistry; // 第71天：公开统一注册中心供页面和测试验证能力发现。
  readonly datasetProvider = new EvaluationDatasetProviderV2(); // 第71天：创建平台级 Evaluation Dataset V2 提供者。
  readonly eventBus = new MemoryEventBus(500); // 第71天：创建保存最近五百条评估生命周期事件的内存事件总线。
  readonly traceManager = new TraceManager(); // 第71天：创建评估运行和案例共享的 Trace 管理器。
  readonly strategyRegistry: EvaluationStrategyRegistry; // 第71天：保存包含六类默认评估器的策略注册中心。
  private readonly runs = new Map<string, EvaluationRun>(); // 第71天：按运行标识保存全部 EvaluationRun。
  private readonly results = new Map<string, EvaluationCaseResultV2>(); // 第71天：按结果标识保存全部单案例评估结果。
  private readonly runtimeContexts = new Map<string, RuntimeContextV2>(); // 第71天：按请求标识保存已注入 evaluationContext 的运行时上下文。
  private readonly regressions: RegressionComparisonV2[] = []; // 第71天：保存全部基线与候选版本回归比较摘要。
  private readonly qualityGates: QualityGateResultV2[] = []; // 第71天：保存全部 Quality Gate V2 判断结果。
  private readonly feedback: UserFeedbackV2[] = []; // 第71天：保存点赞、点踩、评分和文字评论。
  private readonly badCases: EvaluationBadCaseV2[] = []; // 第71天：保存低分或负向反馈沉淀的坏案例。
  private evaluatorUsage = 0; // 第71天：累计全部可插拔评估器调用次数。

  constructor(registry: UnifiedRegistry = createDay66UnifiedRegistry()) { // 第71天：允许注入统一注册中心并默认继承历史平台能力。
    this.registry = registry; // 第71天：保存统一注册中心实例。
    this.strategyRegistry = createDefaultEvaluationStrategyRegistry(registry); // 第71天：注册六类评估器和 Runner、QualityGate、DatasetProvider 核心能力。
  } // 第71天：结束生产评估平台运行时构造函数。

  async runEvaluation(input: RunEvaluationInput): Promise<EvaluationRun> { // 第71天：执行 Input、Runtime、Trace、Evaluator 到 Evaluation Result 的统一流程。
    const dataset = this.datasetProvider.get(input.datasetId, input.datasetVersion); // 第71天：读取并冻结本次运行使用的平台级数据集版本。
    if (!dataset) throw new Error(`Evaluation Dataset V2 不存在：${input.datasetId}`); // 第71天：数据集不存在时阻止创建无法追踪的评估运行。
    const strategies = this.strategyRegistry.list(dataset.type); // 第71天：通过 Evaluation Strategy Registry 发现支持当前业务类型的评估器。
    const versionMap = Object.fromEntries(strategies.map((strategy) => [strategy.id, strategy.version])); // 第71天：提前记录本次运行计划使用的评估器版本。
    const trace = this.traceManager.startTrace(`evaluation:${input.type}:${dataset.id}`); // 第71天：为完整 EvaluationRun 创建独立 Trace。
    const context = runtimeContextBuilder.build({ agentId: input.agentId, taskId: input.taskId, traceId: trace.traceId, evaluationContext: { runId: "", datasetId: dataset.id, evaluatorVersions: versionMap, scores: emptyScore() }, metadata: { day: 71, evaluationType: input.type, datasetVersion: dataset.version } }); // 第71天：创建关联数据集、评估器版本和 Trace 的统一 RuntimeContext。
    const run: EvaluationRun = { id: `eval_run_${randomUUID()}`, type: input.type, datasetId: dataset.id, status: "created", runtimeContextId: context.requestId, traceIds: [trace.traceId], score: 0, scores: emptyScore(), resultIds: [], label: input.label, usage: emptyUsage(), startedAt: Date.now() }; // 第71天：创建任务要求的独立 EvaluationRun 运行实例。
    context.evaluationContext = { runId: run.id, datasetId: dataset.id, evaluatorVersions: versionMap, scores: emptyScore() }; // 第71天：把真实评估运行标识写回统一运行时上下文。
    this.runtimeContexts.set(context.requestId, context); // 第71天：保存可由 Evaluation Explorer 展示的运行时上下文。
    this.runs.set(run.id, structuredClone(run)); // 第71天：先保存 created 状态以形成完整运行生命周期。
    run.status = "running"; // 第71天：把评估运行推进到执行中状态。
    this.runs.set(run.id, structuredClone(run)); // 第71天：保存 running 状态供并发观察和故障诊断。
    await this.publish("evaluation.started", context, trace.traceId, { runId: run.id, datasetId: dataset.id, datasetVersion: dataset.version, type: run.type, evaluatorVersions: versionMap }); // 第71天：发布 evaluation.started 事件并关联上下文与追踪。
    const rootSpanId = this.traceManager.startSpan(trace.traceId, { name: `evaluation-run:${run.id}`, type: "evaluation", metadata: { datasetId: dataset.id, datasetVersion: dataset.version, type: run.type } }); // 第71天：为完整评估运行创建根评估跨度。
    try { // 第71天：隔离运行级异常并确保失败状态、Trace 和事件都被保存。
      const runResults: EvaluationCaseResultV2[] = []; // 第71天：收集本次 EvaluationRun 的全部案例结果。
      for (const evaluationCase of dataset.cases) { // 第71天：按数据集顺序执行每一个 Agent、Workflow、Prompt、RAG 或 Memory 案例。
        const caseSpanId = this.traceManager.startSpan(trace.traceId, { parentSpanId: rootSpanId, name: `evaluation-case:${evaluationCase.id}`, type: "evaluation", metadata: { caseId: evaluationCase.id, priority: evaluationCase.priority } }); // 第71天：为单个案例创建关联优先级的评估跨度。
        const execution = await input.executeCase(evaluationCase); // 第71天：调用注入的真实业务运行时或确定性测试夹具生成实际输出。
        const outputs = await Promise.all(strategies.map((strategy) => strategy.evaluate({ dataset, evaluationCase, execution }))); // 第71天：并行执行当前数据集类型支持的全部可插拔评估器。
        this.evaluatorUsage += outputs.length; // 第71天：累计本次单案例实际调用的评估器数量。
        const scores = mergeScores(outputs, execution, evaluationCase); // 第71天：合并策略评分并补充延迟、成本和综合评分。
        const result: EvaluationCaseResultV2 = { id: `eval_result_${randomUUID()}`, runId: run.id, datasetId: dataset.id, caseId: evaluationCase.id, input: evaluationCase.input, output: execution.output, expected: evaluationCase.expectedOutput, scores, passed: scores.overall >= evaluationCase.passThreshold, traceId: trace.traceId, usage: { ...execution.usage }, citations: [...(execution.citations ?? [])], evaluatorOutputs: outputs.map((output) => structuredClone(output)), metadata: structuredClone(execution.metadata ?? {}), completedAt: Date.now() }; // 第71天：创建包含输入、输出、期望、多维评分、Trace、引用和诊断的案例结果。
        this.results.set(result.id, structuredClone(result)); // 第71天：持久化单案例评估结果供案例分析和反馈闭环使用。
        runResults.push(result); // 第71天：把当前案例结果加入本次运行聚合列表。
        run.resultIds.push(result.id); // 第71天：把单案例结果标识关联到 EvaluationRun。
        this.traceManager.endSpan(trace.traceId, caseSpanId, result.passed ? "success" : "failed", { resultId: result.id, scores: result.scores, passed: result.passed, evaluatorVersions: evaluatorVersions(outputs) }); // 第71天：结束案例跨度并写入评分、通过状态和评估器版本。
        await this.publish("evaluation.case_completed", context, trace.traceId, { runId: run.id, resultId: result.id, caseId: evaluationCase.id, scores: result.scores, passed: result.passed }); // 第71天：发布单案例评估完成事件供 Trace 和观察页面消费。
      } // 第71天：结束数据集全部案例执行循环。
      run.scores = aggregateRunScore(runResults); // 第71天：聚合全部案例生成 EvaluationRun 七维评分。
      run.score = run.scores.overall; // 第71天：同步任务要求的单值综合评分字段。
      run.usage = aggregateRunUsage(runResults); // 第71天：聚合累计令牌、平均延迟和平均成本。
      run.status = "completed"; // 第71天：把 EvaluationRun 推进到完成状态。
      run.completedAt = Date.now(); // 第71天：记录评估运行完成时间戳。
      context.usageContext = { promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens, totalTokens: run.usage.totalTokens, latencyMs: run.usage.latencyMs, cost: run.usage.cost }; // 第71天：把评估运行用量和成本同步回统一 RuntimeContext。
      context.evaluationContext = { runId: run.id, datasetId: dataset.id, evaluatorVersions: versionMap, scores: run.scores }; // 第71天：把最终多维评分和评估器版本同步回 evaluationContext。
      this.traceManager.attachEvaluation(trace.traceId, { evaluationRunId: run.id, score: run.scores, evaluatorVersions: versionMap }); // 第71天：把 EvaluationRun、多维评分和评估器版本自动关联到 Trace。
      this.traceManager.endSpan(trace.traceId, rootSpanId, "success", { runId: run.id, score: run.score, resultCount: run.resultIds.length }); // 第71天：结束评估运行根跨度并写入综合分和案例数量。
      this.traceManager.endTrace(trace.traceId); // 第71天：结束完整评估运行 Trace。
      this.runs.set(run.id, structuredClone(run)); // 第71天：保存 completed 状态的完整 EvaluationRun。
      this.runtimeContexts.set(context.requestId, structuredClone(context)); // 第71天：保存包含最终评分与用量的 RuntimeContext 快照。
      await this.publish("evaluation.completed", context, trace.traceId, { runId: run.id, status: run.status, scores: run.scores, usage: run.usage, evaluatorVersions: versionMap }); // 第71天：发布 evaluation.completed 事件形成完整评估生命周期。
      return structuredClone(run); // 第71天：返回已完成且可独立保存、追踪和比较的 EvaluationRun。
    } catch (error) { // 第71天：捕获业务运行时、评估器或聚合过程异常。
      run.status = "failed"; // 第71天：把 EvaluationRun 推进到失败状态。
      run.completedAt = Date.now(); // 第71天：记录失败终态时间戳。
      run.error = error instanceof Error ? error.message : "未知评估运行错误"; // 第71天：保存安全且可展示的运行失败摘要。
      this.traceManager.endSpan(trace.traceId, rootSpanId, "failed", { runId: run.id, error: run.error }); // 第71天：结束根跨度并写入失败摘要。
      this.traceManager.endTrace(trace.traceId); // 第71天：确保失败运行的 Trace 同样完整关闭。
      this.runs.set(run.id, structuredClone(run)); // 第71天：保存 failed 状态 EvaluationRun 供诊断和指标统计。
      await this.publish("evaluation.completed", context, trace.traceId, { runId: run.id, status: run.status, error: run.error }); // 第71天：发布失败完成事件供观察平台记录。
      throw error; // 第71天：把异常继续交给 API 或自动化测试处理。
    } // 第71天：结束 EvaluationRun 运行级异常处理。
  } // 第71天：结束 Evaluation Runner V2 统一执行方法。

  async runOnlineEvaluation(input: OnlineEvaluationInput): Promise<{ evaluated: boolean; reason: "sampled" | "latency-risk" | "feedback-risk" | "skipped"; run?: EvaluationRun }> { // 第71天：实现基础采样和风险条件共同驱动的在线评估。
    const sampled = stableSample(input.requestId, input.sampleRate); // 第71天：按生产请求标识执行可重复验证的基础采样。
    const latencyRisk = input.latencyMs > input.latencyThresholdMs; // 第71天：判断实际延迟是否超过风险阈值。
    const feedbackRisk = typeof input.userFeedback === "number" && input.userFeedback < 3; // 第71天：判断即时用户反馈是否低于三分。
    const reason = feedbackRisk ? "feedback-risk" : latencyRisk ? "latency-risk" : sampled ? "sampled" : "skipped"; // 第71天：按反馈、延迟、采样优先级确定在线评估触发原因。
    if (reason === "skipped") return { evaluated: false, reason }; // 第71天：没有命中采样或风险条件时跳过自动评估。
    const run = await this.runEvaluation({ type: "online", datasetId: input.datasetId, label: input.label, executeCase: input.executeCase }); // 第71天：命中采样或风险条件后自动执行在线 EvaluationRun。
    return { evaluated: true, reason, run }; // 第71天：返回已执行标志、触发原因和在线评估运行。
  } // 第71天：结束 Online Evaluation 方法。

  async compareRegression(baselineRunId: string, candidateRunId: string): Promise<{ comparison: RegressionComparisonV2; qualityGate: QualityGateResultV2 }> { // 第71天：比较基线和候选运行并自动执行 Quality Gate V2。
    const baseline = this.runs.get(baselineRunId); // 第71天：读取基线 EvaluationRun。
    const candidate = this.runs.get(candidateRunId); // 第71天：读取候选 EvaluationRun。
    if (!baseline || !candidate) throw new Error("回归比较的 Baseline 或 Candidate EvaluationRun 不存在"); // 第71天：缺少任一运行时阻止无效回归比较。
    if (!baseline.datasetId || baseline.datasetId !== candidate.datasetId) throw new Error("回归比较要求 Baseline 与 Candidate 使用同一 Evaluation Dataset V2"); // 第71天：确保两个版本在同一固定数据集上比较。
    const dataset = this.datasetProvider.get(baseline.datasetId); // 第71天：读取回归比较使用的平台级数据集。
    if (!dataset) throw new Error(`回归数据集不存在：${baseline.datasetId}`); // 第71天：数据集缺失时阻止无法解释的回归结论。
    const baselineResults = baseline.resultIds.map((id) => this.results.get(id)).filter((item): item is EvaluationCaseResultV2 => Boolean(item)); // 第71天：读取基线运行全部单案例结果。
    const candidateResults = candidate.resultIds.map((id) => this.results.get(id)).filter((item): item is EvaluationCaseResultV2 => Boolean(item)); // 第71天：读取候选运行全部单案例结果。
    const baselineByCase = new Map(baselineResults.map((item) => [item.caseId, item])); // 第71天：建立基线案例标识到结果的快速查找表。
    const improvedCases = candidateResults.filter((item) => item.scores.overall > (baselineByCase.get(item.caseId)?.scores.overall ?? 0)).map((item) => item.caseId); // 第71天：收集候选综合分高于基线的改进案例。
    const regressedCases = candidateResults.filter((item) => item.scores.overall < (baselineByCase.get(item.caseId)?.scores.overall ?? 0)).map((item) => item.caseId); // 第71天：收集候选综合分低于基线的退化案例。
    const failedCases = candidateResults.filter((item) => !item.passed).map((item) => item.caseId); // 第71天：收集候选版本仍未达到阈值的失败案例。
    const qualityGate = evaluateQualityGateV2({ baseline, candidate, dataset, candidateResults }); // 第71天：执行综合分、正确性、高优先级通过率和成本增长四项门禁。
    const scoreDeltas: EvaluationScore = { correctness: Number((candidate.scores.correctness - baseline.scores.correctness).toFixed(2)), relevance: Number((candidate.scores.relevance - baseline.scores.relevance).toFixed(2)), completeness: Number((candidate.scores.completeness - baseline.scores.completeness).toFixed(2)), safety: Number((candidate.scores.safety - baseline.scores.safety).toFixed(2)), latency: Number((candidate.scores.latency - baseline.scores.latency).toFixed(2)), cost: Number((candidate.scores.cost - baseline.scores.cost).toFixed(2)), overall: Number((candidate.scores.overall - baseline.scores.overall).toFixed(2)) }; // 第71天：计算候选减基线的七维评分变化。
    const comparison: RegressionComparisonV2 = { id: `regression_${randomUUID()}`, baselineRunId, candidateRunId, improvedCases, regressedCases, failedCases, scoreDeltas, qualityGateId: qualityGate.id, createdAt: Date.now() }; // 第71天：创建 Evaluation Explorer V2 使用的回归比较摘要。
    this.regressions.push(structuredClone(comparison)); // 第71天：保存回归比较供指标和浏览器展示。
    this.qualityGates.push(structuredClone(qualityGate)); // 第71天：保存质量门禁结论供晋级审计。
    const context = this.runtimeContexts.get(candidate.runtimeContextId ?? ""); // 第71天：读取候选运行关联的统一 RuntimeContext。
    if (context) await this.publish(qualityGate.status === "passed" ? "quality_gate.passed" : "quality_gate.failed", context, candidate.traceIds[0] ?? context.traceId, { comparisonId: comparison.id, qualityGate }); // 第71天：发布 PASS 或 FAIL 质量门禁事件并关联候选 Trace。
    return { comparison: structuredClone(comparison), qualityGate: structuredClone(qualityGate) }; // 第71天：返回回归比较和质量门禁完整结论。
  } // 第71天：结束 Prompt、Model 或 Workflow 回归比较方法。

  async submitFeedback(input: { resultId: string; sentiment: "positive" | "negative"; rating: number; comment?: string }): Promise<UserFeedbackV2> { // 第71天：保存用户点赞、点踩、评分和文字评论并驱动反馈闭环。
    const result = this.results.get(input.resultId); // 第71天：读取反馈对应的单案例评估结果。
    if (!result) throw new Error(`Evaluation Result 不存在：${input.resultId}`); // 第71天：阻止反馈关联到不存在的评估结果。
    const run = this.runs.get(result.runId); // 第71天：读取反馈结果所属 EvaluationRun。
    if (!run) throw new Error(`EvaluationRun 不存在：${result.runId}`); // 第71天：阻止反馈失去评估运行质量链路。
    const feedback: UserFeedbackV2 = { id: `feedback_${randomUUID()}`, runId: run.id, resultId: result.id, sentiment: input.sentiment, rating: Math.min(5, Math.max(1, Math.round(input.rating))), comment: input.comment?.trim() ?? "", createdAt: Date.now() }; // 第71天：创建范围受控且可追踪的用户反馈记录。
    this.feedback.push(structuredClone(feedback)); // 第71天：保存用户反馈供 Evaluation Explorer 展示。
    if (feedback.sentiment === "negative" || feedback.rating < 3) await this.createBadCaseFromFeedback(result, feedback); // 第71天：点踩或低于三分时自动沉淀坏案例并进入回归数据集。
    return structuredClone(feedback); // 第71天：返回已保存的用户反馈记录。
  } // 第71天：结束用户反馈闭环入口方法。

  getRun(id: string): EvaluationRun | undefined { const run = this.runs.get(id); return run ? structuredClone(run) : undefined; } // 第71天：按标识读取 EvaluationRun 防御性副本。
  getResult(id: string): EvaluationCaseResultV2 | undefined { const result = this.results.get(id); return result ? structuredClone(result) : undefined; } // 第71天：按标识读取单案例评估结果防御性副本。
  getRuntimeContext(id: string): RuntimeContextV2 | undefined { const context = this.runtimeContexts.get(id); return context ? structuredClone(context) : undefined; } // 第71天：按请求标识读取 evaluationContext 运行时上下文副本。

  getMetrics(): EvaluationMetrics { // 第71天：计算任务要求的 Evaluation Metrics V2。
    const runs = Array.from(this.runs.values()); // 第71天：读取全部评估运行用于指标聚合。
    const completedRuns = runs.filter((run) => run.status === "completed"); // 第71天：筛选已经成功完成的评估运行。
    return { totalRuns: runs.length, successRate: runs.length === 0 ? 0 : Number((completedRuns.length / runs.length).toFixed(4)), avgScore: average(completedRuns.map((run) => run.score)), avgLatency: average(completedRuns.map((run) => run.usage.latencyMs)), avgCost: average(completedRuns.map((run) => run.usage.cost)), regressionCount: this.regressions.length, badCaseCount: this.badCases.length, qualityGateFailCount: this.qualityGates.filter((gate) => gate.status === "failed").length, evaluatorUsage: this.evaluatorUsage }; // 第71天：返回运行、成功率、评分、延迟、成本、回归、坏案例、门禁失败和评估器调用指标。
  } // 第71天：结束 Evaluation Metrics V2 计算方法。

  getSnapshot(): EvaluationPlatformSnapshot { // 第71天：生成 Evaluation Explorer V2、API 和自动化测试共用的平台快照。
    return { datasets: this.datasetProvider.list(), runs: Array.from(this.runs.values()).map((item) => structuredClone(item)).sort((left, right) => right.startedAt - left.startedAt), results: Array.from(this.results.values()).map((item) => structuredClone(item)).sort((left, right) => right.completedAt - left.completedAt), regressions: structuredClone(this.regressions).reverse(), qualityGates: structuredClone(this.qualityGates).reverse(), feedback: structuredClone(this.feedback).reverse(), badCases: structuredClone(this.badCases).reverse(), traces: structuredClone(this.traceManager.listTraces()).reverse(), runtimeContexts: structuredClone(Array.from(this.runtimeContexts.values())).reverse(), events: this.eventBus.getHistory().reverse(), registryItems: this.registry.list("evaluation").filter((item) => item.version === "day71.v2"), metrics: this.getMetrics(), generatedAt: Date.now() }; // 第71天：返回数据集、运行、案例、回归、门禁、反馈、坏案例、Trace、Context、Event、Registry 和 Metrics 完整快照。
  } // 第71天：结束生产评估平台快照生成方法。

  private async createBadCaseFromFeedback(result: EvaluationCaseResultV2, feedback: UserFeedbackV2): Promise<void> { // 第71天：把线上负向反馈自动转换为坏案例并追加到评估数据集。
    const dataset = this.datasetProvider.get(result.datasetId); // 第71天：读取需要接收反馈案例的平台级数据集。
    if (!dataset) throw new Error(`反馈目标数据集不存在：${result.datasetId}`); // 第71天：目标数据集不存在时阻止形成孤立坏案例。
    const originalCase = dataset.cases.find((item) => item.id === result.caseId); // 第71天：查找反馈结果对应的原始案例定义。
    if (!originalCase) throw new Error(`反馈原始案例不存在：${result.caseId}`); // 第71天：原始案例不存在时阻止生成无法回归的复制案例。
    const evaluationCaseId = `feedback_case_${feedback.id}`; // 第71天：生成自动进入数据集的反馈回归案例标识。
    const regressionCase: EvaluationCaseV2 = { ...originalCase, id: evaluationCaseId, name: `Feedback Regression（反馈回归）· ${originalCase.name}`, input: result.input, expectedOutput: result.expected, expectedKeywords: [...originalCase.expectedKeywords], priority: feedback.rating === 1 ? "critical" : "high", source: "user_feedback", metadata: { ...structuredClone(originalCase.metadata), sourceRunId: result.runId, sourceResultId: result.id, feedbackId: feedback.id, feedbackComment: feedback.comment } }; // 第71天：创建携带原始输入、期望、优先级和反馈来源的回归案例。
    this.datasetProvider.appendCase(dataset.id, regressionCase, dataset.version); // 第71天：把线上失败追加到 Evaluation Dataset V2 形成后续必须通过的测试案例。
    const badCase: EvaluationBadCaseV2 = { id: `bad_case_${randomUUID()}`, datasetId: dataset.id, evaluationCaseId, sourceResultId: result.id, feedbackId: feedback.id, reason: feedback.comment || `用户${feedback.sentiment === "negative" ? "点踩" : "低分"}，评分 ${feedback.rating}/5`, createdAt: Date.now() }; // 第71天：创建关联反馈和回归案例的坏案例记录。
    this.badCases.push(structuredClone(badCase)); // 第71天：保存坏案例供持续改进指标和浏览器展示。
    const context = this.runtimeContexts.get(this.runs.get(result.runId)?.runtimeContextId ?? ""); // 第71天：读取原评估运行关联的统一 RuntimeContext。
    if (context) await this.publish("bad_case.created", context, result.traceId, { badCase, feedback, regressionCaseId: evaluationCaseId }); // 第71天：发布坏案例创建事件形成线上失败到回归数据集的事件链路。
  } // 第71天：结束反馈坏案例沉淀方法。

  private async publish(type: EventType, context: RuntimeContextV2, traceId: string, payload: unknown): Promise<void> { // 第71天：定义生产评估平台统一事件发布辅助方法。
    const event: RuntimeEvent = { id: `event_${randomUUID()}`, type, timestamp: Date.now(), traceId, runtimeContextId: context.requestId, payload: structuredClone(payload), metadata: { source: type.startsWith("quality_gate") ? "evaluation" : "evaluation", status: type.endsWith("failed") ? "failed" : "completed", version: "day71.v2" } }; // 第71天：创建关联 Trace、RuntimeContext、来源、状态和版本的统一事件。
    await this.eventBus.publish(event); // 第71天：通过 Day65 EventBus 发布评估生命周期事件。
  } // 第71天：结束生产评估平台统一事件发布方法。
} // 第71天：结束 Production Evaluation Platform V2 运行时实现。
