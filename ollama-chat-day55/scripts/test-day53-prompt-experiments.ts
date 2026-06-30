import assert from "node:assert/strict"; /* 第53天：引入 Node.js 严格断言工具。 */
import { createDefaultPromptRegistry, promptRegistry } from "../lib/prompts/default-prompts"; /* 第53天：引入隔离注册表工厂和共享注册表单例。 */
import { PromptExperimentRunner } from "../lib/prompts/prompt-experiment-runner"; /* 第53天：引入提示词实验运行器。 */
import { DAY53_PROMPT_EXPERIMENT_DATASET, defaultPromptExperiments, getPromptExperimentDashboardSnapshot, promoteExperimentWinner } from "../lib/prompts/prompt-experiment-runtime"; /* 第53天：引入默认实验数据集、实验定义、仪表盘快照和 Promote 入口。 */

async function main(): Promise<void> { /* 第53天：定义测试入口函数。 */
  const isolatedRegistry = createDefaultPromptRegistry(); /* 第53天：创建隔离 PromptRegistry，避免运行器测试污染共享状态。 */
  assert.equal(isolatedRegistry.getActive("writer")?.version, "v2"); /* 第53天：验证实验开始时 Writer active 基线是 v2。 */
  assert.ok(isolatedRegistry.getVersion("writer", "v1")); /* 第53天：验证 Writer v1 候选版本存在。 */
  assert.ok(isolatedRegistry.getVersion("writer", "v2")); /* 第53天：验证 Writer v2 候选版本存在。 */
  assert.ok(isolatedRegistry.getVersion("writer", "v3")); /* 第53天：验证 Writer v3 候选版本存在。 */
  const runner = new PromptExperimentRunner(isolatedRegistry, defaultPromptExperiments, [DAY53_PROMPT_EXPERIMENT_DATASET]); /* 第53天：创建注入隔离注册表的实验运行器。 */
  const run = await runner.runExperiment(defaultPromptExperiments[0].id); /* 第53天：运行默认 Writer 三版本提示词实验。 */
  assert.equal(run.experiment.componentId, "writer"); /* 第53天：验证实验目标组件是 Writer。 */
  assert.equal(run.dataset.id, "day53-prompt-experiment-core"); /* 第53天：验证实验使用第53天评估数据集。 */
  assert.equal(run.results.length, 3); /* 第53天：验证三个候选版本都产生了实验结果。 */
  assert.equal(run.batchRuns.length, 3); /* 第53天：验证三个候选版本都执行了批量评估。 */
  assert.equal(run.baselineVersion, "v2"); /* 第53天：验证 active 基线版本记录为 v2。 */
  assert.equal(run.winnerVersion, "v3"); /* 第53天：验证 Winner Selection 选择 v3。 */
  assert.equal(run.qualityGate.status, "passed"); /* 第53天：验证获胜版本通过质量门禁。 */
  const writerV2 = run.results.find((result) => result.promptVersion === "v2"); /* 第53天：读取 Writer v2 实验结果。 */
  const writerV3 = run.results.find((result) => result.promptVersion === "v3"); /* 第53天：读取 Writer v3 实验结果。 */
  assert.ok(writerV2 && writerV3); /* 第53天：确认 v2 和 v3 结果都存在。 */
  assert.ok(writerV3.averageScore > writerV2.averageScore); /* 第53天：验证 v3 平均分高于 active 基线 v2。 */
  assert.ok(writerV3.averageCost > writerV2.averageCost); /* 第53天：验证 v3 成本更高，测试成本约束真实参与。 */
  assert.ok(writerV3.costIncrease <= defaultPromptExperiments[0].winnerRule.maxCostIncrease!); /* 第53天：验证 v3 成本增长未超过 Winner Rule 上限。 */
  assert.equal(writerV3.highPriorityRegressionCount, 0); /* 第53天：验证 v3 没有高优先级案例退步。 */
  assert.ok(writerV3.bestCases.length > 0); /* 第53天：验证实验结果记录最佳案例。 */
  assert.ok(writerV3.worstCases.length > 0); /* 第53天：验证实验结果记录最差案例。 */
  assert.ok(run.timeline.some((event) => event.label.includes("Version v1 Started"))); /* 第53天：验证时间线记录 v1 开始。 */
  assert.ok(run.timeline.some((event) => event.label.includes("Version v3 Completed"))); /* 第53天：验证时间线记录 v3 完成。 */
  const snapshot = await getPromptExperimentDashboardSnapshot(true); /* 第53天：强制生成共享运行时实验仪表盘快照。 */
  assert.equal(snapshot.run.winnerVersion, "v3"); /* 第53天：验证仪表盘快照也选出 v3。 */
  assert.equal(snapshot.run.qualityGate.status, "passed"); /* 第53天：验证仪表盘质量门禁通过。 */
  assert.equal(promptRegistry.getActive("writer")?.version, "v2"); /* 第53天：验证 Promote 前共享注册表仍保持 v2 active。 */
  const promotedSnapshot = await promoteExperimentWinner(defaultPromptExperiments[0].id); /* 第53天：执行一键 Promote 获胜版本。 */
  assert.equal(promotedSnapshot.run.promotedVersion, "v3"); /* 第53天：验证快照记录已 Promote v3。 */
  assert.equal(promotedSnapshot.activePromptAfterPromotion?.version, "v3"); /* 第53天：验证 Promote 后仪表盘返回 active v3。 */
  assert.equal(promptRegistry.getActive("writer")?.version, "v3"); /* 第53天：验证共享 PromptRegistry 的 active 版本已切换到 v3。 */
  assert.ok(promotedSnapshot.run.timeline.some((event) => event.label.includes("Promote v3"))); /* 第53天：验证时间线记录 Promote 事件。 */
  console.log("Day 53 Prompt Experiment Platform tests passed."); /* 第53天：输出测试通过信息。 */
} /* 第53天：结束测试入口函数。 */

main().catch((error) => { /* 第53天：捕获未处理异常并标记测试失败。 */
  console.error(error); /* 第53天：输出失败原因。 */
  process.exitCode = 1; /* 第53天：设置进程失败状态码。 */
}); /* 第53天：结束异常兜底。 */
