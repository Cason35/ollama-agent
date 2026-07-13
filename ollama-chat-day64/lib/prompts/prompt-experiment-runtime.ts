import { DAY46_EVALUATION_DATASET } from "@/lib/evaluation/evaluation-dataset"; /* 第53天：复用同一套固定评估案例作为提示词实验数据集来源。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第53天：引入共享 PromptRegistry，实验和 Promote 都基于真实注册表。 */
import { PromptExperimentRunner } from "@/lib/prompts/prompt-experiment-runner"; /* 第53天：引入提示词实验运行器。 */
import type { PromptExperiment, PromptExperimentDashboardSnapshot, PromptExperimentRun } from "@/lib/prompts/prompt-experiment-types"; /* 第53天：引入实验定义、运行和仪表盘快照类型。 */

const CREATED_AT = 1_782_500_800_000; /* 第53天：使用固定时间戳让默认实验数据和测试快照稳定。 */

export const DAY53_PROMPT_EXPERIMENT_DATASET = { /* 第53天：定义第53天提示词实验数据集。 */
  ...DAY46_EVALUATION_DATASET, /* 第53天：继承第46天已验证的数据集结构和案例评分规则。 */
  id: "day53-prompt-experiment-core", /* 第53天：设置提示词实验数据集 ID。 */
  name: "Day 53 Prompt Experiment Core", /* 第53天：设置提示词实验数据集展示名称。 */
  version: "53.1.0", /* 第53天：设置提示词实验数据集版本。 */
  description: "同一批 Evaluation Cases（评估用例）用于比较多个 Prompt Version 的质量、成本、延迟和回归风险。", /* 第53天：说明该数据集服务于提示词版本实验。 */
}; /* 第53天：结束第53天提示词实验数据集定义。 */

export const defaultPromptExperiments: PromptExperiment[] = [ /* 第53天：定义默认提示词实验列表。 */
  { id: "writer-prompt-quality-cost-latency", name: "Writer Prompt v1/v2/v3 质量成本延迟实验", componentId: "writer", candidateVersions: ["v1", "v2", "v3"], datasetId: DAY53_PROMPT_EXPERIMENT_DATASET.id, status: "draft", winnerRule: { minScore: 88, maxCostIncrease: 0.35, requireNoHighPriorityRegression: true, optimizeFor: "balanced" }, createdAt: CREATED_AT, updatedAt: CREATED_AT }, /* 第53天：定义 Writer 组件三版本对比实验。 */
]; /* 第53天：结束默认提示词实验列表。 */

let cachedRun: PromptExperimentRun | null = null; /* 第53天：缓存最近一次实验运行，避免仪表盘重复计算。 */
let runningSnapshot: Promise<PromptExperimentRun> | null = null; /* 第53天：合并并发到达的实验运行请求。 */

export function createDefaultPromptExperimentRunner(): PromptExperimentRunner { /* 第53天：定义默认实验运行器工厂函数。 */
  return new PromptExperimentRunner(promptRegistry, defaultPromptExperiments, [DAY53_PROMPT_EXPERIMENT_DATASET]); /* 第53天：把共享注册表、默认实验和默认数据集注入运行器。 */
} /* 第53天：结束默认实验运行器工厂函数。 */

async function runDefaultExperiment(force = false): Promise<PromptExperimentRun> { /* 第53天：定义默认实验运行入口。 */
  if (!force && cachedRun) return cachedRun; /* 第53天：非强制模式优先返回缓存结果。 */
  if (!force && runningSnapshot) return runningSnapshot; /* 第53天：已有运行任务时复用同一个 Promise。 */
  const runner = createDefaultPromptExperimentRunner(); /* 第53天：创建一次隔离运行器。 */
  runningSnapshot = runner.runExperiment(defaultPromptExperiments[0].id); /* 第53天：启动默认 Writer Prompt 实验。 */
  try { /* 第53天：保证运行状态在成功或失败后都能正确清理。 */
    cachedRun = await runningSnapshot; /* 第53天：等待实验完成并写入缓存。 */
    return cachedRun; /* 第53天：返回最新实验运行结果。 */
  } finally { /* 第53天：执行运行状态清理。 */
    runningSnapshot = null; /* 第53天：允许后续强制重新运行。 */
  } /* 第53天：结束运行状态清理。 */
} /* 第53天：结束默认实验运行入口。 */

function snapshotFromRun(run: PromptExperimentRun): PromptExperimentDashboardSnapshot { /* 第53天：定义运行结果转仪表盘快照函数。 */
  const activePromptAfterPromotion = run.promotedVersion ? promptRegistry.getActive(run.experiment.componentId) : null; /* 第53天：Promote 后读取当前 active 提示词，否则为空。 */
  return { experiments: defaultPromptExperiments, activeExperiment: defaultPromptExperiments[0], run, activePromptAfterPromotion, generatedAt: Date.now() }; /* 第53天：返回前端需要的完整仪表盘快照。 */
} /* 第53天：结束运行结果转仪表盘快照函数。 */

export async function getPromptExperimentDashboardSnapshot(force = false): Promise<PromptExperimentDashboardSnapshot> { /* 第53天：定义读取提示词实验仪表盘快照入口。 */
  const run = await runDefaultExperiment(force); /* 第53天：读取缓存或重新运行默认实验。 */
  return snapshotFromRun(run); /* 第53天：返回转换后的仪表盘快照。 */
} /* 第53天：结束读取提示词实验仪表盘快照入口。 */

export async function promoteExperimentWinner(experimentId: string): Promise<PromptExperimentDashboardSnapshot> { /* 第53天：定义一键 Promote 获胜提示词版本入口。 */
  const run = cachedRun?.experiment.id === experimentId ? cachedRun : await runDefaultExperiment(true); /* 第53天：优先使用同实验缓存，否则强制运行一次。 */
  if (run.experiment.id !== experimentId) throw new Error(`无法 Promote 非默认实验：${experimentId}`); /* 第53天：当前教学项目只允许 Promote 默认实验。 */
  if (!run.winnerVersion) throw new Error("没有可 Promote 的获胜版本。"); /* 第53天：未选出 winner 时禁止 Promote。 */
  if (run.qualityGate.status !== "passed") throw new Error(`Quality Gate 未通过：${run.qualityGate.failureReasons.join("；")}`); /* 第53天：质量门禁未通过时禁止上线。 */
  promptRegistry.activate(run.experiment.componentId, run.winnerVersion); /* 第53天：调用 Day 52 PromptRegistry.activate 切换 active 版本。 */
  cachedRun = { ...run, promotedVersion: run.winnerVersion, generatedAt: Date.now(), timeline: [...run.timeline, { id: `day53-promote-${Date.now()}`, agentId: "prompt-experiment-runner", taskId: "promote", label: `Promote ${run.winnerVersion} to active（将 ${run.winnerVersion} 提升为启用版本）`, timestamp: new Date().toISOString() }] }; /* 第53天：把 Promote 事件写回缓存时间线。 */
  return snapshotFromRun(cachedRun); /* 第53天：返回包含 active 版本的最新仪表盘快照。 */
} /* 第53天：结束一键 Promote 获胜提示词版本入口。 */
