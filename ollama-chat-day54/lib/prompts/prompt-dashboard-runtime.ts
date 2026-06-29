import { comparePromptBlocks } from "@/lib/prompts/prompt-block-diff"; /* 第54天：引入 PromptBlock Diff（提示词块差异）能力。 */
import { calculatePromptBlockMetrics } from "@/lib/prompts/prompt-block-metrics"; /* 第54天：引入 PromptBlock Metrics（提示词块指标）能力。 */
import { promptBuilder } from "@/lib/prompts/prompt-builder"; /* 第54天：引入 PromptBuilder（提示词构建器）用于组合预览。 */
import { buildRuntimePromptBlocks, promptBlockRegistry } from "@/lib/prompts/default-prompt-blocks"; /* 第54天：引入默认块注册表和运行时块组装能力。 */
import { comparePromptTemplates } from "@/lib/prompts/prompt-diff"; /* 第54天：继续保留 Prompt Version Diff，兼容 Day53 控制台。 */
import { buildSamplePromptVariables, promptVariableContracts, validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第54天：继续复用样例变量、变量契约和模板校验能力。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第54天：继续使用 Prompt Registry 作为 active system block 的来源。 */
import { renderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第54天：继续提供旧版单模板渲染预览，便于对照组合式输出。 */
import type { PromptBlockComparison, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入块差异和组合预览类型。 */
import type { PromptComparison, PromptDashboardSnapshot, PromptRegressionLink, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第54天：引入 Prompt Explorer 快照、版本对比和模板类型。 */
function buildDefaultComparison(): PromptComparison { /* 第54天：定义默认 Prompt Version 差异对比构造函数。 */
  const baseline = promptRegistry.getVersion("research", "v2"); /* 第54天：读取 research.v2 作为旧版基线。 */
  const candidate = promptRegistry.getVersion("research", "v3"); /* 第54天：读取 research.v3 作为候选版本。 */
  if (!baseline || !candidate) throw new Error("缺少 research.v2 或 research.v3，无法生成 Prompt Diff。"); /* 第54天：缺少演示版本时抛出明确错误。 */
  return comparePromptTemplates(baseline, candidate); /* 第54天：返回旧版 PromptTemplate 行级 Diff。 */
} /* 第54天：结束默认 Prompt Version 差异对比构造函数。 */
function buildRegressionLinks(): PromptRegressionLink[] { /* 第54天：定义提示词版本和回归评估的演示关联。 */
  const researchV2 = promptRegistry.getVersion("research", "v2"); /* 第54天：读取 research.v2。 */
  const researchV3 = promptRegistry.getVersion("research", "v3"); /* 第54天：读取 research.v3。 */
  if (!researchV2 || !researchV3) return []; /* 第54天：缺少任一版本时返回空关联，保证接口可用。 */
  const scoreDelta = Number(((researchV3.score ?? 0) - (researchV2.score ?? 0)).toFixed(2)); /* 第54天：计算候选版本相对基线的评分变化。 */
  const baselineCost = researchV2.costEstimate || 1; /* 第54天：读取基线成本，并避免除零。 */
  const candidateCost = researchV3.costEstimate || baselineCost; /* 第54天：读取候选成本，缺失时使用基线成本。 */
  const costDeltaPercent = Number((((candidateCost - baselineCost) / baselineCost) * 100).toFixed(2)); /* 第54天：计算候选版本相对基线的成本变化百分比。 */
  return [{ componentId: "research", baselinePromptId: researchV2.id, candidatePromptId: researchV3.id, baselineVersion: researchV2.version, candidateVersion: researchV3.version, result: scoreDelta >= 0 ? "passed" : "failed", scoreDelta, costDeltaPercent }]; /* 第54天：返回可展示的回归关联结果。 */
} /* 第54天：结束提示词版本和回归评估关联构造函数。 */
function buildRenderedPreview(): string { /* 第54天：定义旧版单模板渲染预览。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第54天：读取当前 active research Prompt。 */
  if (!activeResearch) return "当前没有 active research Prompt。"; /* 第54天：没有 active 版本时返回可读占位。 */
  return renderPrompt(activeResearch, buildSamplePromptVariables(activeResearch)); /* 第54天：使用样例变量渲染旧版单字符串 Prompt。 */
} /* 第54天：结束旧版单模板渲染预览。 */
function buildCompositionPreview(): PromptBuildResult { /* 第54天：定义组合式 PromptBuilder 预览。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第54天：读取 active research Prompt 作为 system block 来源。 */
  const fallback = "你是研究型 Agent，负责收集、检索和整理资料。"; /* 第54天：定义缺少 active Prompt 时的系统块兜底文案。 */
  const sample = activeResearch ? buildSamplePromptVariables(activeResearch) : { task: "分析 Day54 Prompt Composition 的块组合能力。", memory: "长期记忆：Day53 已完成 Prompt Experiment Platform。", workspace: "共享工作空间：已有实验结果、版本 Diff 和回归风险。", tools: "retrieval, ragAnswer, summary", agentId: "research", output: "暂无输出", threshold: "80", agents: "research, planner, writer, critic" }; /* 第54天：构造组合预览所需样例变量。 */
  return promptBuilder.buildPromptWithReport(buildRuntimePromptBlocks("research", activeResearch, fallback), sample); /* 第54天：返回按 system、memory、workspace、tool、task、output 组合后的预览。 */
} /* 第54天：结束组合式 PromptBuilder 预览。 */
function buildBlockComparison(): PromptBlockComparison { /* 第54天：定义默认 PromptBlock Diff 构造函数。 */
  const baseline = promptBlockRegistry.get("memory.context"); /* 第54天：读取基础记忆块。 */
  const candidate = promptBlockRegistry.get("memory.context.v2"); /* 第54天：读取增强版记忆块。 */
  if (!baseline || !candidate) throw new Error("缺少 memory.context 或 memory.context.v2，无法生成 Block Diff。"); /* 第54天：缺少演示块时抛出明确错误。 */
  return comparePromptBlocks(baseline, candidate); /* 第54天：返回块字段和模板行级变化。 */
} /* 第54天：结束默认 PromptBlock Diff 构造函数。 */
export async function getPromptDashboardSnapshot(): Promise<PromptDashboardSnapshot> { /* 第54天：定义 Prompt Explorer（提示词浏览器）快照入口。 */
  const prompts = promptRegistry.list(); /* 第54天：读取全部 Prompt Version。 */
  const componentIds = Array.from(new Set(prompts.map((prompt) => prompt.componentId))); /* 第54天：收集全部组件 ID。 */
  const activePrompts = componentIds.map((componentId) => promptRegistry.getActive(componentId)).filter((prompt): prompt is PromptTemplate => Boolean(prompt)); /* 第54天：读取每个组件当前 active 版本。 */
  const validationResults = Object.fromEntries(prompts.map((prompt) => [prompt.id, validatePromptTemplate(prompt)])); /* 第54天：为每个 Prompt Version 生成变量契约校验结果。 */
  const blocks = promptBlockRegistry.list(); /* 第54天：读取全部 PromptBlock 注册表条目。 */
  const compositionPreview = buildCompositionPreview(); /* 第54天：生成组合式 PromptBuilder 预览。 */
  const blockMetrics = calculatePromptBlockMetrics(blocks, [compositionPreview]); /* 第54天：基于组合预览计算块长度、token、启用率和命中率。 */
  return { prompts, activePrompts, metrics: promptRegistry.getMetrics(), comparison: buildDefaultComparison(), contracts: promptVariableContracts, validationResults, regressionLinks: buildRegressionLinks(), renderedPreview: buildRenderedPreview(), blocks, compositionPreview, blockComparison: buildBlockComparison(), blockMetrics, generatedAt: Date.now() }; /* 第54天：返回包含 Prompt Version 与 Prompt Block 的完整快照。 */
} /* 第54天：结束 Prompt Explorer 快照入口。 */
