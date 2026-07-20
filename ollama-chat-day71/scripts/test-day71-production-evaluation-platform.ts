import assert from "node:assert/strict"; // 第71天：引入 Node.js 严格断言验证生产评估平台端到端行为。
import { EvaluationPlatformRuntime } from "@/lib/evaluation/evaluation-platform-runtime"; // 第71天：引入生产评估平台核心运行时执行全部验收案例。
import { createAgentExecution, createDay71EvaluationDatasets, createPromptExecution, createRagExecution } from "@/lib/evaluation/evaluation-fixtures"; // 第71天：引入五类数据集和确定性 Agent、Prompt、RAG 执行夹具。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第71天：引入历史统一注册中心验证评估能力增量注册。
import { DurableWorkflowRuntime } from "@/lib/workflow/durable-workflow-runtime"; // 第71天：引入第70天持久化工作流运行时验证真实失败恢复流程。
import type { WorkflowDefinitionV2 } from "@/lib/workflow/durable-workflow-types"; // 第71天：引入自定义失败恢复工作流定义类型。

const TEST_TIME = Date.UTC(2026, 6, 20, 9, 0, 0); // 第71天：定义生产评估测试使用的稳定时间戳。

async function main(): Promise<void> { // 第71天：定义覆盖五个 Production Evaluation Case 和十三项验收标准的测试入口。
  const registry = createDay66UnifiedRegistry(); // 第71天：创建继承历史智能体平台能力的统一注册中心。
  const runtime = new EvaluationPlatformRuntime(registry); // 第71天：创建隔离的生产评估平台运行时并注册六类评估器与三类平台核心能力。
  for (const dataset of createDay71EvaluationDatasets()) runtime.datasetProvider.register(dataset); // 第71天：注册 Agent、Workflow、Prompt、RAG 和 Memory 五类 Evaluation Dataset V2。

  const agentRun = await runtime.runEvaluation({ type: "offline", datasetId: "agent-research-v2", label: "Research Agent Case", agentId: "research-agent", taskId: "case-1-agent", executeCase: (evaluationCase) => createAgentExecution(evaluationCase, "high") }); // 第71天：Case 1 运行 Research Agent 生产评估并创建独立 EvaluationRun。
  assert.equal(agentRun.status, "completed", "Case 1 Agent EvaluationRun 应完成"); // 第71天：断言智能体评估运行进入完成状态。
  assert.equal(agentRun.traceIds.length, 1, "Case 1 Agent EvaluationRun 应关联独立 Trace"); // 第71天：断言评估运行保存 Trace 标识。
  assert.equal(Boolean(agentRun.runtimeContextId), true, "Case 1 Agent EvaluationRun 应关联 RuntimeContext"); // 第71天：断言评估运行保存统一运行时上下文标识。
  const agentContext = runtime.getRuntimeContext(agentRun.runtimeContextId ?? ""); // 第71天：读取智能体评估关联的统一运行时上下文。
  assert.equal(agentContext?.evaluationContext?.runId, agentRun.id, "Case 1 evaluationContext 应关联 EvaluationRun"); // 第71天：断言 evaluationContext 写入真实评估运行标识。
  assert.equal(agentContext?.evaluationContext?.datasetId, "agent-research-v2", "Case 1 evaluationContext 应关联 Dataset V2"); // 第71天：断言 evaluationContext 写入平台级数据集标识。
  const agentTrace = runtime.traceManager.getTrace(agentRun.traceIds[0]); // 第71天：读取智能体评估完整 Trace。
  assert.equal(agentTrace?.evaluation?.evaluationRunId, agentRun.id, "Case 1 Trace.evaluation 应自动关联 EvaluationRun"); // 第71天：断言 Trace 自动保存评估运行标识。
  assert.equal(Boolean(agentTrace?.evaluation?.evaluatorVersions["evaluation:evaluator:correctness"]), true, "Case 1 Trace 应保存评估器版本"); // 第71天：断言 Trace 自动保存评估策略版本质量链路。

  const baseline = await runtime.runEvaluation({ type: "offline", datasetId: "prompt-release-v2", label: "Prompt V1 Baseline", taskId: "case-2-v1", executeCase: (evaluationCase) => createPromptExecution(evaluationCase, "v1") }); // 第71天：Case 2 运行 Prompt V1 基线评估。
  const candidate = await runtime.runEvaluation({ type: "regression", datasetId: "prompt-release-v2", label: "Prompt V2 Candidate", taskId: "case-2-v2", executeCase: (evaluationCase) => createPromptExecution(evaluationCase, "v2") }); // 第71天：Case 2 运行 Prompt V2 候选回归评估。
  const regression = await runtime.compareRegression(baseline.id, candidate.id); // 第71天：比较两个提示词版本并执行 Quality Gate V2。
  assert.equal(candidate.scores.correctness >= baseline.scores.correctness, true, "Case 2 Prompt V2 正确性不应低于 V1"); // 第71天：断言候选正确性维度没有下降。
  assert.equal(candidate.scores.completeness > baseline.scores.completeness, true, "Case 2 Prompt V2 完整性应高于 V1"); // 第71天：断言候选完整性维度得到改进。
  assert.equal(candidate.usage.latencyMs < baseline.usage.latencyMs, true, "Case 2 Prompt V2 延迟应低于 V1"); // 第71天：断言候选响应延迟得到改进。
  assert.equal(candidate.usage.cost <= baseline.usage.cost * 1.2, true, "Case 2 Prompt V2 成本增长不应超过百分之二十"); // 第71天：断言候选平均成本满足质量门禁预算。
  assert.equal(regression.qualityGate.status, "passed", "Case 2 Quality Gate V2 应允许 Prompt V2 晋级"); // 第71天：断言综合分、正确性、高优先级通过率和成本条件全部通过。
  assert.equal(regression.comparison.regressedCases.length, 0, "Case 2 不应存在退化案例"); // 第71天：断言候选版本没有单案例质量退化。

  const ragRun = await runtime.runEvaluation({ type: "offline", datasetId: "rag-knowledge-v2", label: "RAG 10 Questions", taskId: "case-3-rag", executeCase: createRagExecution }); // 第71天：Case 3 在十个知识问题上运行 RAG Evaluation。
  assert.equal(ragRun.resultIds.length, 10, "Case 3 RAG Evaluation 应完成十个知识问题"); // 第71天：断言十个固定知识问题全部生成评估结果。
  for (const resultId of ragRun.resultIds) { // 第71天：逐个验证十个 RAG 案例的引用和索引质量。
    const result = runtime.getResult(resultId); // 第71天：读取当前 RAG 单案例评估结果。
    assert.equal(result?.passed, true, `Case 3 ${resultId} 应通过多维评估`); // 第71天：断言当前知识问题综合评分达到阈值。
    assert.equal(result?.citations.length, 1, `Case 3 ${resultId} 应包含一个完整引用`); // 第71天：断言当前知识问题输出保存正确引用。
    assert.equal(result?.metadata.knowledgeBaseId, "kb-agent-platform", `Case 3 ${resultId} 应来自正确知识库`); // 第71天：断言检索结果来自任务要求的知识库。
    assert.equal(result?.metadata.indexVersion, "knowledge-index-v71", `Case 3 ${resultId} 应来自活动索引版本`); // 第71天：断言检索结果来自正确活动索引版本。
  } // 第71天：结束十个 RAG 案例逐项验证。

  const workflowRuntime = new DurableWorkflowRuntime(registry); // 第71天：创建真实第70天持久化工作流运行时供 Case 4 评估。
  const calls = { prepare: 0, analyze: 0, publish: 0 }; // 第71天：创建步骤调用计数器验证恢复不会重复执行已完成步骤。
  workflowRuntime.registerHandler("day71-prepare", () => { calls.prepare += 1; return { prepared: true }; }); // 第71天：注册可计数的准备步骤处理器。
  workflowRuntime.registerHandler("day71-analyze", () => { calls.analyze += 1; return { analyzed: true }; }); // 第71天：注册可计数的分析步骤处理器。
  workflowRuntime.registerHandler("day71-publish", () => { calls.publish += 1; return { published: true }; }); // 第71天：注册可计数的发布步骤处理器。
  const workflowDefinition: WorkflowDefinitionV2 = { id: "day71-recovery-flow", name: "Day71 Workflow Evaluation Fixture（第71天工作流评估夹具）", version: 1, description: "第二步骤检查点后模拟中断并从可靠位置继续。", status: "active", owner: "Day71 Test", createdAt: TEST_TIME, updatedAt: TEST_TIME, steps: [{ id: "prepare", name: "Prepare", handler: "day71-prepare" }, { id: "analyze", name: "Analyze", handler: "day71-analyze", dependsOn: ["prepare"] }, { id: "publish", name: "Publish", handler: "day71-publish", dependsOn: ["analyze"] }] }; // 第71天：定义三个步骤的真实检查点恢复测试工作流。
  workflowRuntime.registerDefinition(workflowDefinition); // 第71天：注册冻结版本的工作流评估夹具定义。
  const workflowRun = await runtime.runEvaluation({ type: "offline", datasetId: "workflow-recovery-v2", label: "Day70 Workflow Reliability", taskId: "case-4-workflow", executeCase: async () => { const interrupted = await workflowRuntime.executeDurableWorkflow(workflowDefinition.id, 1, {}, { stopAfterStepId: "analyze" }); const interruptedState = workflowRuntime.states.getState(interrupted.id); const recovered = await workflowRuntime.resumeWorkflow(interrupted.id); const replay = workflowRuntime.replayWorkflow(recovered.id); const eventTypes = new Set(replay.timeline.map((event) => event.type)); return { output: "已完成步骤不重复执行，检查点正确保存，恢复从可靠位置继续，事件时间线完整。", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 220, cost: 0 }, metadata: { noDuplicateCompletedSteps: calls.prepare === 1 && calls.analyze === 1 && calls.publish === 1, checkpointSaved: (interruptedState?.checkpoints.length ?? 0) >= 2, resumeReliable: recovered.status === "completed", timelineComplete: eventTypes.has("workflow.paused") && eventTypes.has("workflow.resumed") && eventTypes.has("workflow.completed"), safetyPassed: true } }; } }); // 第71天：Case 4 真实执行中断、检查点、恢复和回放并把诊断交给 WorkflowEvaluator。
  const workflowResult = runtime.getResult(workflowRun.resultIds[0]); // 第71天：读取工作流可靠性单案例评估结果。
  assert.equal(workflowResult?.passed, true, "Case 4 Workflow Evaluation 应通过"); // 第71天：断言工作流恢复综合评分达到通过阈值。
  assert.equal(workflowResult?.scores.correctness, 10, "Case 4 Reliability Score 应达到满分"); // 第71天：断言四项恢复可靠性条件全部通过。
  assert.deepEqual(calls, { prepare: 1, analyze: 1, publish: 1 }, "Case 4 已完成步骤不应被恢复流程重复执行"); // 第71天：断言真实第70天运行时严格跳过成功检查点步骤。

  const online = await runtime.runOnlineEvaluation({ requestId: "case-5-feedback-risk", datasetId: "agent-research-v2", label: "Low Score Online Evaluation", sampleRate: 0, latencyMs: 1600, latencyThresholdMs: 900, userFeedback: 1, executeCase: (evaluationCase) => createAgentExecution(evaluationCase, "low") }); // 第71天：Case 5 通过高延迟和低反馈风险条件触发在线低分评估。
  assert.equal(online.evaluated, true, "Case 5 风险请求应自动进入 Online Evaluation"); // 第71天：断言风险条件能够绕过零采样比例触发评估。
  assert.equal(online.reason, "feedback-risk", "Case 5 在线评估应记录低反馈触发原因"); // 第71天：断言在线评估优先记录用户反馈风险。
  const onlineResultId = online.run?.resultIds[0] ?? ""; // 第71天：读取低分在线评估首个结果标识。
  const originalCaseCount = runtime.datasetProvider.get("agent-research-v2")?.cases.length ?? 0; // 第71天：记录反馈闭环前 Agent 数据集案例数量。
  await runtime.submitFeedback({ resultId: onlineResultId, sentiment: "negative", rating: 1, comment: "低分输出遗漏持续改进关键步骤。" }); // 第71天：提交点踩、一分和文字评论触发 Bad Case Loop。
  const snapshot = runtime.getSnapshot(); // 第71天：读取覆盖 Explorer、Context、Trace、Event、Registry 和 Metrics 的完整平台快照。
  assert.equal(snapshot.badCases.length, 1, "Case 5 负向低分反馈应创建一个 Bad Case"); // 第71天：断言线上失败不只停留在日志中。
  assert.equal((runtime.datasetProvider.get("agent-research-v2")?.cases.length ?? 0) === originalCaseCount + 1, true, "Case 5 Bad Case 应自动追加到 Evaluation Dataset V2"); // 第71天：断言反馈案例进入后续固定回归数据集。
  assert.equal(snapshot.badCases[0].evaluationCaseId.startsWith("feedback_case_"), true, "Case 5 应创建可供后续 Regression Test 使用的案例标识"); // 第71天：断言坏案例生成稳定反馈回归案例标识。

  const eventTypes = new Set(snapshot.events.map((event) => event.type)); // 第71天：收集生产评估平台发布的完整事件类型。
  for (const type of ["evaluation.started", "evaluation.case_completed", "evaluation.completed", "quality_gate.passed", "bad_case.created"] as const) assert.equal(eventTypes.has(type), true, `EventBus 应包含 ${type}`); // 第71天：断言任务清单要求的评估、门禁和坏案例事件已经发布。
  const registryIds = new Set(snapshot.registryItems.map((item) => item.id)); // 第71天：收集 UnifiedRegistry 中 Day71 生产评估能力标识。
  for (const id of ["evaluation:runner:v2", "evaluation:quality-gate:v2", "evaluation:dataset-provider:v2", "evaluation:evaluator:correctness", "evaluation:evaluator:citation", "evaluation:evaluator:rag", "evaluation:evaluator:workflow", "evaluation:evaluator:memory", "evaluation:evaluator:safety"]) assert.equal(registryIds.has(id), true, `UnifiedRegistry 应注册 ${id}`); // 第71天：断言 Runner、QualityGate、DatasetProvider 和六类 Evaluator 全部可发现。
  assert.equal(snapshot.datasets.some((dataset) => dataset.type === "agent"), true, "Dataset V2 应支持 Agent 数据集"); // 第71天：断言平台级数据集支持 Agent 类型。
  assert.equal(snapshot.datasets.some((dataset) => dataset.type === "workflow"), true, "Dataset V2 应支持 Workflow 数据集"); // 第71天：断言平台级数据集支持 Workflow 类型。
  assert.equal(snapshot.datasets.some((dataset) => dataset.type === "prompt"), true, "Dataset V2 应支持 Prompt 数据集"); // 第71天：断言平台级数据集支持 Prompt 类型。
  assert.equal(snapshot.datasets.some((dataset) => dataset.type === "rag"), true, "Dataset V2 应支持 RAG 数据集"); // 第71天：断言平台级数据集支持 RAG 类型。
  assert.equal(snapshot.datasets.some((dataset) => dataset.type === "memory"), true, "Dataset V2 应支持 Memory 数据集"); // 第71天：断言平台级数据集支持 Memory 类型。
  assert.equal(snapshot.metrics.totalRuns >= 6, true, "Evaluation Metrics V2 应统计全部生产评估运行"); // 第71天：断言运行总数指标覆盖五个验收案例。
  assert.equal(snapshot.metrics.regressionCount, 1, "Evaluation Metrics V2 应统计一次 Prompt Regression"); // 第71天：断言回归次数指标正确累计。
  assert.equal(snapshot.metrics.badCaseCount, 1, "Evaluation Metrics V2 应统计反馈坏案例数量"); // 第71天：断言坏案例指标正确累计。
  assert.equal(snapshot.metrics.evaluatorUsage > 0, true, "Evaluation Metrics V2 应统计评估器调用次数"); // 第71天：断言评估器使用指标已经接入统一 Runner。
  console.log("Day71 Production Evaluation Platform V2：五个生产评估案例与十三项验收标准全部通过"); // 第71天：输出稳定成功信息供 npm 脚本和人工验收识别。
} // 第71天：结束生产评估平台端到端测试入口。

void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第71天：运行测试并在断言或运行时失败时设置非零退出码。
