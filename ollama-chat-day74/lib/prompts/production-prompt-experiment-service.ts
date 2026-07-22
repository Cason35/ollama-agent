import { PromptRegistry } from "@/lib/prompts/prompt-registry"; // 第67天：引入生产提示词版本注册表。
import { PromptRuntimeService } from "@/lib/prompts/prompt-runtime-service"; // 第67天：引入生产提示词完整运行链路服务。
import { averagePromptQualityScores, calculatePromptQualityScore, evaluatePromptQualityGate } from "@/lib/prompts/production-prompt-quality"; // 第67天：引入实验评分聚合、归一化和质量门禁能力。
import type { ProductionPromptDataset, ProductionPromptDatasetCase, ProductionPromptExperiment, ProductionPromptExperimentCandidate, ProductionPromptExperimentRun, PromptQualityScore } from "@/lib/prompts/production-prompt-types"; // 第67天：引入通用数据集、实验和候选结果类型。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第67天：引入统一运行时上下文构建器。

const CREATED_AT = Date.UTC(2026, 6, 15, 1, 0, 0); // 第67天：使用固定实验创建时间保证快照输出稳定。

function experimentCase(id: string, name: string, priority: ProductionPromptDatasetCase["priority"], task: string, expectedKeywords: string[], agentId: string): ProductionPromptDatasetCase { // 第67天：定义生产提示词实验案例创建助手。
  return { id, name, priority, task, expectedKeywords, context: { agentId, taskId: id, memoryContext: { summary: `${name} 的历史经验与约束` }, workspace: { upstream: `${name} 的共享工作空间材料` }, retrievalContext: { knowledge: `${expectedKeywords.join("、")} 的知识证据`, citations: ["knowledge://day67/core", "workspace://day67/shared"] }, promptContext: { task, userIntent: task, strategy: "quality" }, modelContext: { provider: "mimo", model: "mimo-v2-flash" }, metadata: { task, userIntent: task } } }; // 第67天：返回同时覆盖 Memory、Workspace、Knowledge、Strategy 和 User Intent 的统一上下文案例。
} // 第67天：结束生产提示词实验案例创建助手。

export const DAY67_PRODUCTION_PROMPT_DATASETS: ProductionPromptDataset[] = [ // 第67天：定义可供不同智能体动态选择的生产提示词数据集。
  { id: "day67-research-dataset", name: "Research Agent 生产研究数据集", cases: [experimentCase("research-case-1", "多源证据研究", "critical", "研究统一注册中心与提示词平台的集成证据", ["研究", "证据", "注册"], "research"), experimentCase("research-case-2", "风险与引用分析", "high", "分析生产提示词发布风险并给出引用", ["风险", "引用", "提示词"], "research"), experimentCase("research-case-3", "可复现性检查", "normal", "说明提示词版本如何进入追踪并可复现", ["版本", "追踪", "复现"], "research")] }, // 第67天：定义 Research Agent 三案例数据集。
  { id: "day67-writer-dataset", name: "Writer Agent 生产写作数据集", cases: [experimentCase("writer-case-1", "执行摘要", "critical", "把生产提示词平台结果整理成执行摘要", ["执行", "摘要", "提示词"], "writer"), experimentCase("writer-case-2", "风险与回滚文档", "high", "输出发布风险、回滚预案和下一步", ["风险", "回滚", "下一步"], "writer"), experimentCase("writer-case-3", "证据化最终回答", "normal", "根据共享工作空间生成带依据的最终回答", ["依据", "工作空间", "回答"], "writer")] }, // 第67天：定义 Writer Agent 三案例数据集。
  { id: "day67-critic-dataset", name: "Critic Agent 生产审查数据集", cases: [experimentCase("critic-case-1", "高风险发布审查", "critical", "审查未通过质量门禁的发布请求", ["审查", "质量", "门禁"], "critic"), experimentCase("critic-case-2", "回归风险检查", "high", "检查高优先级失败案例是否退步", ["回归", "失败", "退步"], "critic"), experimentCase("critic-case-3", "成本延迟审查", "normal", "评估提示词成本与延迟是否超过预算", ["成本", "延迟", "预算"], "critic")] }, // 第67天：定义 Critic Agent 三案例数据集。
]; // 第67天：结束生产提示词实验数据集定义。

export const DAY67_PRODUCTION_PROMPT_EXPERIMENTS: ProductionPromptExperiment[] = [ // 第67天：定义三个智能体的通用 A/B 测试实验。
  { id: "day67-research-v1-v2", name: "Research Prompt V1/V2 生产实验", agentId: "research", candidateVersions: ["v1", "v2"], datasetId: "day67-research-dataset", status: "draft", createdAt: CREATED_AT }, // 第67天：定义研究智能体版本实验。
  { id: "day67-writer-v2-v3", name: "Writer Prompt V2/V3 生产实验", agentId: "writer", candidateVersions: ["v2", "v3"], datasetId: "day67-writer-dataset", status: "draft", createdAt: CREATED_AT + 1 }, // 第67天：定义写作智能体版本实验。
  { id: "day67-critic-v1-v2", name: "Critic Prompt V1/V2 生产实验", agentId: "critic", candidateVersions: ["v1", "v2"], datasetId: "day67-critic-dataset", status: "draft", createdAt: CREATED_AT + 2 }, // 第67天：定义审查智能体版本实验。
]; // 第67天：结束默认生产提示词实验定义。

export class ProductionPromptExperimentService { // 第67天：实现跨 Agent、数据集和提示词版本的通用实验管理服务。
  private readonly experiments = new Map<string, ProductionPromptExperiment>(); // 第67天：保存可动态创建和运行的实验定义。
  private readonly datasets = new Map<string, ProductionPromptDataset>(); // 第67天：保存可被多个实验复用的数据集。

  constructor(private readonly registry: PromptRegistry, private readonly runtime: PromptRuntimeService, experiments: ProductionPromptExperiment[] = DAY67_PRODUCTION_PROMPT_EXPERIMENTS, datasets: ProductionPromptDataset[] = DAY67_PRODUCTION_PROMPT_DATASETS) { // 第67天：注入生产提示词注册表、运行时服务、实验和数据集。
    experiments.forEach((experiment) => this.experiments.set(experiment.id, { ...experiment, candidateVersions: [...experiment.candidateVersions] })); // 第67天：防御性复制并注册默认实验。
    datasets.forEach((dataset) => this.datasets.set(dataset.id, { ...dataset, cases: dataset.cases.map((item) => ({ ...item, expectedKeywords: [...item.expectedKeywords], context: { ...item.context } })) })); // 第67天：防御性复制并注册默认数据集。
  } // 第67天：结束生产提示词实验服务构造函数。

  createExperiment(experiment: ProductionPromptExperiment): ProductionPromptExperiment { // 第67天：定义动态创建任意 Agent 提示词实验的方法。
    if (this.experiments.has(experiment.id)) throw new Error(`PromptExperiment 已存在：${experiment.id}`); // 第67天：阻止重复实验标识覆盖历史结果。
    if (!this.datasets.has(experiment.datasetId)) throw new Error(`实验数据集不存在：${experiment.datasetId}`); // 第67天：阻止实验引用不存在的数据集。
    if (experiment.candidateVersions.length < 2) throw new Error("PromptExperiment 至少需要两个候选版本"); // 第67天：要求 A/B 测试至少包含两个版本。
    this.experiments.set(experiment.id, { ...experiment, candidateVersions: [...experiment.candidateVersions] }); // 第67天：保存动态实验定义。
    return { ...experiment, candidateVersions: [...experiment.candidateVersions] }; // 第67天：返回新建实验的防御性副本。
  } // 第67天：结束动态创建提示词实验方法。

  runExperiment(experimentId: string): ProductionPromptExperimentRun { // 第67天：执行指定 Agent、数据集和版本组合的生产实验。
    const experiment = this.experiments.get(experimentId); // 第67天：读取目标实验定义。
    if (!experiment) throw new Error(`PromptExperiment 不存在：${experimentId}`); // 第67天：目标实验不存在时阻止运行。
    const dataset = this.datasets.get(experiment.datasetId); // 第67天：读取实验使用的数据集。
    if (!dataset) throw new Error(`实验数据集不存在：${experiment.datasetId}`); // 第67天：数据集缺失时阻止运行。
    experiment.status = "running"; // 第67天：把实验状态切换为运行中。
    try { // 第67天：捕获候选版本加载、渲染或评估异常。
      const baselineVersion = this.registry.getActiveProduction(experiment.agentId)?.version ?? experiment.candidateVersions[0]; // 第67天：选择当前 active 版本作为高优先级回归基线。
      const baselineScores = this.evaluateVersion(experiment.agentId, baselineVersion, dataset); // 第67天：先运行基线版本供候选回归对比。
      const candidates = experiment.candidateVersions.map((version) => this.evaluateCandidate(experiment.agentId, version, dataset, baselineScores)); // 第67天：动态运行每个候选版本并生成聚合结果。
      const eligible = candidates.filter((candidate) => candidate.qualityGate.passed).sort((left, right) => right.averageScore.overall - left.averageScore.overall); // 第67天：只在通过质量门禁的候选中按综合分选择优胜版本。
      const winnerVersion = eligible[0]?.version ?? null; // 第67天：读取综合分最高的合格候选版本。
      experiment.status = "completed"; // 第67天：全部候选完成后把实验状态切换为已完成。
      return { experiment: { ...experiment, candidateVersions: [...experiment.candidateVersions] }, dataset, candidates, winnerVersion, winnerReason: winnerVersion ? `${winnerVersion} 通过 Quality Gate 且综合分最高` : "没有候选版本通过 Quality Gate", generatedAt: Date.now() }; // 第67天：返回数据集、候选评分、质量门禁和优胜选择结果。
    } catch (error) { // 第67天：处理实验运行失败。
      experiment.status = "failed"; // 第67天：把实验状态切换为失败供运营控制台观察。
      throw error; // 第67天：保留原始错误语义交给平台接口处理。
    } // 第67天：结束实验运行异常处理。
  } // 第67天：结束生产提示词实验运行方法。

  runAll(): ProductionPromptExperimentRun[] { // 第67天：定义运行全部已注册生产提示词实验的方法。
    return Array.from(this.experiments.keys()).map((experimentId) => this.runExperiment(experimentId)); // 第67天：逐实验运行并返回最新快照。
  } // 第67天：结束全部生产提示词实验运行方法。

  private evaluateCandidate(agentId: string, version: string, dataset: ProductionPromptDataset, baselineScores: PromptQualityScore[]): ProductionPromptExperimentCandidate { // 第67天：定义单候选版本的实验聚合评估方法。
    const scores = this.evaluateVersion(agentId, version, dataset); // 第67天：在完整数据集上运行候选提示词版本。
    const averageScore = averagePromptQualityScores(scores); // 第67天：聚合候选版本五维平均质量评分。
    const highPriorityRegressionCount = scores.filter((score, index) => dataset.cases[index].priority !== "normal" && score.overall + 2 < baselineScores[index].overall).length; // 第67天：统计相对 active 基线退步超过两分的高优先级案例。
    const metrics = this.runtime.listMetrics().find((item) => item.promptId === `${agentId}.${version}`); // 第67天：读取候选版本最近一次提示词与模型指标。
    const qualityGate = evaluatePromptQualityGate({ score: averageScore, sampleSize: dataset.cases.length, highPriorityRegressionCount, maxCostUsd: 0.004, maxLatencyMs: 900, actualCostUsd: metrics?.costUsd ?? 0, actualLatencyMs: metrics?.latencyMs ?? 0 }); // 第67天：使用评分、样本、回归、成本和延迟执行发布门禁。
    return { version, averageScore, sampleSize: dataset.cases.length, highPriorityRegressionCount, qualityGate }; // 第67天：返回候选版本生产实验聚合结果。
  } // 第67天：结束候选版本实验聚合评估方法。

  private evaluateVersion(agentId: string, version: string, dataset: ProductionPromptDataset): PromptQualityScore[] { // 第67天：定义一个提示词版本在任意数据集上的评估方法。
    return dataset.cases.map((item) => { // 第67天：逐案例执行 Agent、Prompt、Model 和 Evaluation 完整链路。
      const runtimeContext = runtimeContextBuilder.build({ ...item.context, agentId, taskId: item.id, promptContext: { ...(item.context.promptContext ?? {}), task: item.task, userIntent: item.task }, metadata: { ...(item.context.metadata ?? {}), task: item.task, userIntent: item.task } }); // 第67天：为当前案例构建一致的统一运行时上下文。
      const result = this.runtime.renderPrompt({ agentId, version, runtimeContext, allowNonActive: true }); // 第67天：允许实验加载 testing、approved 或 deprecated 候选版本。
      const keywordCoverage = item.expectedKeywords.filter((keyword) => result.renderedPrompt.includes(keyword)).length / item.expectedKeywords.length; // 第67天：计算最终提示词对数据集期望关键词的覆盖率。
      return calculatePromptQualityScore({ correctness: result.quality.correctness - (1 - keywordCoverage) * 8, relevance: result.quality.relevance - (1 - keywordCoverage) * 12, costUsd: result.modelResult.costUsd, costBudgetUsd: 0.004, latencyMs: result.modelResult.latencyMs, latencyBudgetMs: 900 }); // 第67天：把数据集相关性信号和原始成本延迟归一化为最终实验评分。
    }); // 第67天：结束数据集案例运行遍历。
  } // 第67天：结束提示词版本数据集评估方法。
} // 第67天：结束 ProductionPromptExperimentService 实现。
