import { comparePromptBlocks } from "@/lib/prompts/prompt-block-diff"; /* 第55天：引入 PromptBlock Diff（提示词块差异）能力。 */
import { calculatePromptBlockMetrics } from "@/lib/prompts/prompt-block-metrics"; /* 第55天：引入 PromptBlock Metrics（提示词块指标）能力。 */
import { promptBuilder } from "@/lib/prompts/prompt-builder"; /* 第55天：引入 PromptBuilder（提示词构建器）用于组合预览。 */
import { buildRuntimePromptBlocks, promptBlockRegistry } from "@/lib/prompts/default-prompt-blocks"; /* 第55天：引入默认块注册表和运行时块组装能力。 */
import { comparePromptTemplates } from "@/lib/prompts/prompt-diff"; /* 第55天：继续保留 Prompt Version Diff，兼容 Day53 控制台。 */
import { buildSamplePromptVariables, promptVariableContracts, validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第55天：继续复用样例变量、变量契约和模板校验能力。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第55天：继续使用 Prompt Registry 作为 active system block 的来源。 */
import { promptOptimizer } from "@/lib/prompts/prompt-optimizer"; /* 第55天：引入 PromptOptimizer，为看板生成动态策略预览。 */
import { renderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第55天：继续提供旧版单模板渲染预览，便于对照动态组合输出。 */
import type { PromptBlockComparison, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第55天：引入块差异和组合预览类型。 */
import type { PromptEvaluationSignal, PromptOptimizationContext, PromptOptimizationPreview, PromptStrategy, PromptStrategyPreview } from "@/lib/prompts/prompt-optimization-types"; /* 第55天：引入动态优化上下文、策略和预览类型。 */
import type { PromptComparison, PromptDashboardSnapshot, PromptRegressionLink, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第55天：引入 Prompt Explorer 快照、版本对比和模板类型。 */
const DAY55_EVALUATION_SIGNALS: PromptEvaluationSignal[] = [ /* 第55天：定义评估系统反向提供给优化器的样例弱点信号。 */
  { taskType: "research", weakness: "缺少引用来源", suggestedBlockId: "citation.requirements" }, /* 第55天：研究任务缺少引用时建议开启引用块。 */
  { taskType: "evaluation", weakness: "缺少评估维度", suggestedBlockId: "evaluation.rubric" }, /* 第55天：评估任务缺少维度时建议开启评估标准块。 */
]; /* 第55天：结束评估弱点信号定义。 */
function buildDefaultComparison(): PromptComparison { /* 第55天：定义默认 Prompt Version 差异对比构造函数。 */
  const baseline = promptRegistry.getVersion("research", "v2"); /* 第55天：读取 research.v2 作为旧版基线。 */
  const candidate = promptRegistry.getVersion("research", "v3"); /* 第55天：读取 research.v3 作为候选版本。 */
  if (!baseline || !candidate) throw new Error("缺少 research.v2 或 research.v3，无法生成 Prompt Diff。"); /* 第55天：缺少演示版本时抛出明确错误。 */
  return comparePromptTemplates(baseline, candidate); /* 第55天：返回旧版 PromptTemplate 行级 Diff。 */
} /* 第55天：结束默认 Prompt Version 差异对比构造函数。 */
function buildRegressionLinks(): PromptRegressionLink[] { /* 第55天：定义提示词版本和回归评估的演示关联。 */
  const researchV2 = promptRegistry.getVersion("research", "v2"); /* 第55天：读取 research.v2。 */
  const researchV3 = promptRegistry.getVersion("research", "v3"); /* 第55天：读取 research.v3。 */
  if (!researchV2 || !researchV3) return []; /* 第55天：缺少任一版本时返回空关联，保证接口可用。 */
  const scoreDelta = Number(((researchV3.score ?? 0) - (researchV2.score ?? 0)).toFixed(2)); /* 第55天：计算候选版本相对基线的评分变化。 */
  const baselineCost = researchV2.costEstimate || 1; /* 第55天：读取基线成本，并避免除零。 */
  const candidateCost = researchV3.costEstimate || baselineCost; /* 第55天：读取候选成本，缺失时使用基线成本。 */
  const costDeltaPercent = Number((((candidateCost - baselineCost) / baselineCost) * 100).toFixed(2)); /* 第55天：计算候选版本相对基线的成本变化百分比。 */
  return [{ componentId: "research", baselinePromptId: researchV2.id, candidatePromptId: researchV3.id, baselineVersion: researchV2.version, candidateVersion: researchV3.version, result: scoreDelta >= 0 ? "passed" : "failed", scoreDelta, costDeltaPercent }]; /* 第55天：返回可展示的回归关联结果。 */
} /* 第55天：结束提示词版本和回归评估关联构造函数。 */
function buildRenderedPreview(): string { /* 第55天：定义旧版单模板渲染预览。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第55天：读取当前 active research Prompt。 */
  if (!activeResearch) return "当前没有 active research Prompt。"; /* 第55天：没有 active 版本时返回可读占位。 */
  return renderPrompt(activeResearch, buildSamplePromptVariables(activeResearch)); /* 第55天：使用样例变量渲染旧版单字符串 Prompt。 */
} /* 第55天：结束旧版单模板渲染预览。 */
function buildDay55Context(): PromptOptimizationContext { /* 第55天：定义策略浏览器使用的样例优化上下文。 */
  return { taskType: "research", hasMemory: true, hasWorkspace: true, hasKnowledge: true, requiresJson: false, requiresCitation: true, complexity: "high", userIntent: "分析一份研究报告并给出带引用的结论" }; /* 第55天：返回覆盖 Memory、Workspace、Knowledge、Citation 和高复杂度的研究上下文。 */
} /* 第55天：结束样例优化上下文构造函数。 */
function buildDay55Variables(activeResearch: PromptTemplate | null): Record<string, string> { /* 第55天：定义动态提示词预览使用的样例变量。 */
  const base = activeResearch ? buildSamplePromptVariables(activeResearch) : { task: "分析 Day55 Dynamic Prompt Optimization 的策略选择能力。", memory: "长期记忆：用户偏好中文、短结论、关注工程实现。", workspace: "共享工作空间：已有 Day54 PromptBlock、PromptBuilder、Block Metrics。", tools: "retrieval, ragAnswer, summary", agentId: "research", output: "暂无输出", threshold: "80", agents: "research, planner, writer, critic" }; /* 第55天：复用 active Prompt 变量，缺失时使用教学样例兜底。 */
  return { ...base, knowledge: "知识库证据：Day55 要根据任务上下文自动选择 Memory、Knowledge、Citation 和 JSON Schema 等块。", citations: "day54_learning_summary.md#Day55学习计划；scripts/test-day55-dynamic-prompt-optimization.ts" }; /* 第55天：补充 Knowledge 和 Citation 变量，让新增块可被渲染。 */
} /* 第55天：结束动态提示词预览样例变量构造函数。 */
function buildStrategyPreviews(blocks: ReturnType<typeof buildRuntimePromptBlocks>, context: PromptOptimizationContext, strategies: PromptStrategy[]): PromptStrategyPreview[] { /* 第55天：定义三种策略预览构造函数。 */
  return strategies.map((strategy) => { const result = promptOptimizer.optimize(blocks, context, strategy, DAY55_EVALUATION_SIGNALS); return { strategy, blocks: result.blocks.filter((block) => block.enabled), enabledBlockIds: result.enabledBlockIds, estimatedTokens: result.estimatedTokens, estimatedCost: result.estimatedCost, recommendations: result.recommendations }; }); /* 第55天：逐个策略运行优化器并整理前端展示字段。 */
} /* 第55天：结束策略预览构造函数。 */
function buildOptimizationPreview(): PromptOptimizationPreview { /* 第55天：定义 Dynamic Prompt Optimization 看板预览构造函数。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第55天：读取 active research Prompt 作为 system block 来源。 */
  const fallback = "你是研究型 Agent，负责收集、检索、引用和整理资料。"; /* 第55天：定义缺少 active Prompt 时的系统块兜底文案。 */
  const blocks = buildRuntimePromptBlocks("research", activeResearch, fallback); /* 第55天：先从 Day54 组合基础设施拿到运行时块。 */
  const context = buildDay55Context(); /* 第55天：构造样例优化上下文。 */
  const variables = buildDay55Variables(activeResearch); /* 第55天：构造可渲染新增块的变量集合。 */
  const strategies: PromptStrategy[] = ["fast", "balanced", "quality"]; /* 第55天：定义策略浏览器展示顺序。 */
  const strategyResults = strategies.map((strategy) => promptOptimizer.optimize(blocks, context, strategy, DAY55_EVALUATION_SIGNALS)); /* 第55天：为三种策略分别运行优化器。 */
  const selectedResult = strategyResults.find((result) => result.strategy === "quality") ?? strategyResults[0]; /* 第55天：默认重点展示质量优先策略。 */
  const buildPreview = promptBuilder.buildPromptWithReport(selectedResult.blocks, variables); /* 第55天：把优化后的块交给 PromptBuilder 生成动态提示词预览。 */
  return { context, strategyPreviews: buildStrategyPreviews(blocks, context, strategies), selectedStrategy: selectedResult.strategy, selectedResult, buildPreview, metrics: promptOptimizer.calculateMetrics(strategyResults), evaluationSignals: DAY55_EVALUATION_SIGNALS }; /* 第55天：返回策略、推荐、构建结果和优化指标。 */
} /* 第55天：结束 Dynamic Prompt Optimization 预览构造函数。 */
function buildCompositionPreview(optimizationPreview: PromptOptimizationPreview): PromptBuildResult { /* 第55天：定义组合式 PromptBuilder 预览。 */
  return optimizationPreview.buildPreview; /* 第55天：复用优化后的构建结果，让 Day54 组合预览升级为 Day55 动态组合预览。 */
} /* 第55天：结束组合式 PromptBuilder 预览。 */
function buildBlockComparison(): PromptBlockComparison { /* 第55天：定义默认 PromptBlock Diff 构造函数。 */
  const baseline = promptBlockRegistry.get("memory.context"); /* 第55天：读取基础记忆块。 */
  const candidate = promptBlockRegistry.get("memory.context.v2"); /* 第55天：读取增强版记忆块。 */
  if (!baseline || !candidate) throw new Error("缺少 memory.context 或 memory.context.v2，无法生成 Block Diff。"); /* 第55天：缺少演示块时抛出明确错误。 */
  return comparePromptBlocks(baseline, candidate); /* 第55天：返回块字段、权重和模板行级变化。 */
} /* 第55天：结束默认 PromptBlock Diff 构造函数。 */
export async function getPromptDashboardSnapshot(): Promise<PromptDashboardSnapshot> { /* 第55天：定义 Prompt Explorer（提示词浏览器）快照入口。 */
  const prompts = promptRegistry.list(); /* 第55天：读取全部 Prompt Version。 */
  const componentIds = Array.from(new Set(prompts.map((prompt) => prompt.componentId))); /* 第55天：收集全部组件 ID。 */
  const activePrompts = componentIds.map((componentId) => promptRegistry.getActive(componentId)).filter((prompt): prompt is PromptTemplate => Boolean(prompt)); /* 第55天：读取每个组件当前 active 版本。 */
  const validationResults = Object.fromEntries(prompts.map((prompt) => [prompt.id, validatePromptTemplate(prompt)])); /* 第55天：为每个 Prompt Version 生成变量契约校验结果。 */
  const blocks = promptBlockRegistry.list(); /* 第55天：读取全部 PromptBlock 注册表条目。 */
  const optimizationPreview = buildOptimizationPreview(); /* 第55天：生成 PromptOptimizer 策略预览。 */
  const compositionPreview = buildCompositionPreview(optimizationPreview); /* 第55天：生成动态组合后的 PromptBuilder 预览。 */
  const blockMetrics = calculatePromptBlockMetrics(blocks, [compositionPreview, optimizationPreview.buildPreview]); /* 第55天：基于动态组合预览计算块长度、token、启用率和命中率。 */
  return { prompts, activePrompts, metrics: promptRegistry.getMetrics(), comparison: buildDefaultComparison(), contracts: promptVariableContracts, validationResults, regressionLinks: buildRegressionLinks(), renderedPreview: buildRenderedPreview(), blocks, compositionPreview, blockComparison: buildBlockComparison(), blockMetrics, optimizationPreview, generatedAt: Date.now() }; /* 第55天：返回包含 Prompt Version、Prompt Block 和 PromptOptimizer 的完整快照。 */
} /* 第55天：结束 Prompt Explorer 快照入口。 */
