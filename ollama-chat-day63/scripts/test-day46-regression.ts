import assert from "node:assert/strict"; /* 第46天：引入 Node.js 严格断言工具。 */
import { runBatchEvaluation } from "../lib/evaluation/batch-evaluation-runner"; /* 第46天：引入批量评估运行器。 */
import { DAY46_EVALUATION_DATASET, validateEvaluationDataset } from "../lib/evaluation/evaluation-dataset"; /* 第46天：引入固定数据集与校验函数。 */
import { getRegressionDashboardSnapshot } from "../lib/evaluation/regression-runtime"; /* 第46天：引入完整持续评估闭环。 */

async function runDay46Tests(): Promise<void> { /* 第46天：定义自动化回归验收入口。 */
  const validationErrors = validateEvaluationDataset(DAY46_EVALUATION_DATASET); /* 第46天：校验固定评估数据集。 */
  assert.deepEqual(validationErrors, [], "评估数据集应通过完整校验"); /* 第46天：断言数据集没有结构错误。 */
  assert.ok(DAY46_EVALUATION_DATASET.cases.some((item) => item.kind === "normal"), "数据集应包含正常案例"); /* 第46天：断言存在正常案例。 */
  assert.ok(DAY46_EVALUATION_DATASET.cases.some((item) => item.kind === "bad_case"), "数据集应包含失败案例"); /* 第46天：断言存在失败案例。 */
  assert.ok(DAY46_EVALUATION_DATASET.cases.some((item) => item.kind === "edge_case"), "数据集应包含边界案例"); /* 第46天：断言存在边界案例。 */

  const isolationRun = await runBatchEvaluation({ /* 第46天：执行包含单案例异常的隔离测试。 */
    dataset: DAY46_EVALUATION_DATASET, /* 第46天：使用第46天固定数据集。 */
    version: { label: "isolation-test", model: "fixture", promptVersion: "test", workflowVersion: "test" }, /* 第46天：定义测试版本元数据。 */
    concurrency: 2, /* 第46天：使用两个并发工作协程。 */
    executeCase: async (item) => { /* 第46天：定义可控的案例执行器。 */
      if (item.id === "edge-model-timeout") throw new Error("预期的单案例异常"); /* 第46天：为一个边界案例制造隔离异常。 */
      return { output: item.expectedOutput ?? item.referenceAnswer ?? "", modelCallCount: 1 }; /* 第46天：其余案例返回稳定参考输出。 */
    }, /* 第46天：结束可控案例执行器。 */
  }); /* 第46天：结束隔离测试批量运行。 */
  assert.equal(isolationRun.results.length, DAY46_EVALUATION_DATASET.cases.length, "单案例失败后仍应得到全部案例结果"); /* 第46天：断言后续案例没有被中断。 */
  assert.equal(isolationRun.summary.failedCount, 1, "批量运行应记录一个失败案例"); /* 第46天：断言失败计数正确。 */
  assert.ok(isolationRun.results.at(-1)?.status === "failed", "预期的超时案例应被记录为失败"); /* 第46天：断言异常被转换为失败状态。 */

  const snapshot = await getRegressionDashboardSnapshot(true); /* 第46天：强制执行完整基线、候选、对比和门禁闭环。 */
  assert.equal(snapshot.baseline.datasetId, snapshot.candidate.datasetId, "基线与候选应使用同一数据集"); /* 第46天：断言版本比较的数据集一致。 */
  assert.equal(snapshot.baseline.datasetVersion, snapshot.candidate.datasetVersion, "基线与候选应使用同一数据集版本"); /* 第46天：断言数据集版本一致。 */
  assert.ok(snapshot.comparison.improvedCases.length > 0, "回归报告应识别改进案例"); /* 第46天：断言可以识别改进。 */
  assert.ok(snapshot.comparison.unchangedCases.length > 0, "回归报告应识别未变化案例"); /* 第46天：断言可以识别未变化。 */
  assert.ok(snapshot.comparison.regressedCases.length > 0, "回归报告应识别退步案例"); /* 第46天：断言可以识别退步。 */
  assert.ok(snapshot.comparison.fixedFailures.includes("bad-factual-arithmetic"), "回归报告应识别已经修复的事实错误"); /* 第46天：断言历史事实错误被识别为修复。 */
  assert.equal(snapshot.qualityGate.status, "failed", "高优先级案例退步时质量门禁应阻止通过"); /* 第46天：断言质量门禁执行阻断。 */
  assert.ok(snapshot.qualityGate.failureReasons.some((reason) => reason.includes("高优先级")), "门禁应给出高优先级退步原因"); /* 第46天：断言门禁原因可解释。 */
  assert.ok(snapshot.workspace.entries.some((entry) => entry.tags?.includes("quality-gate")), "门禁结果应写入工作空间"); /* 第46天：断言工作空间包含门禁结论。 */
  assert.ok(snapshot.timeline.some((event) => event.label.includes("Quality Gate")), "门禁结果应写入时间线"); /* 第46天：断言时间线包含门禁事件。 */
  assert.ok(snapshot.trace.spans.some((span) => span.name === "quality-gate"), "门禁结果应写入追踪记录"); /* 第46天：断言追踪记录包含门禁跨度。 */
  assert.ok(snapshot.badCases.some((item) => item.evaluationCaseId === "bad-factual-arithmetic" && item.regressionPassed), "修复后的失败案例应标记回归通过"); /* 第46天：断言失败案例状态得到更新。 */
  console.log(`Day 46 自动化测试通过：${snapshot.dataset.cases.length} 个固定案例，${snapshot.comparison.regressedCases.length} 个退步被门禁检查。`); /* 第46天：输出简洁验收摘要。 */
} /* 第46天：结束自动化回归验收入口。 */

runDay46Tests().catch((error) => { /* 第46天：捕获未通过的自动化验收。 */
  console.error("Day 46 自动化测试失败：", error); /* 第46天：输出失败原因。 */
  process.exitCode = 1; /* 第46天：设置非零退出码供 CI 判断失败。 */
}); /* 第46天：结束自动化验收异常处理。 */
