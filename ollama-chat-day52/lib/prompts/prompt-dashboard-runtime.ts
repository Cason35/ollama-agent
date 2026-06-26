import { comparePromptTemplates } from "@/lib/prompts/prompt-diff"; /* 第52天：引入提示词版本差异对比能力。 */
import { promptVariableContracts, validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第52天增强：引入变量契约和模板校验能力。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第52天：引入共享 PromptRegistry（提示词注册表）。 */
import { renderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第52天：引入 Prompt Renderer（提示词渲染器）。 */
import type { PromptDashboardSnapshot, PromptRegressionLink, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天：引入 Prompt Explorer 快照、回归关联与模板类型。 */

function buildDefaultComparison() { /* 第52天：定义默认提示词差异对比构造函数。 */
  const baseline = promptRegistry.getVersion("research", "v2"); /* 第52天：读取研究提示词 v2 作为基线。 */
  const candidate = promptRegistry.getVersion("research", "v3"); /* 第52天：读取研究提示词 v3 作为候选。 */
  if (!baseline || !candidate) throw new Error("缺少 research.v2 或 research.v3，无法生成 Prompt Diff。"); /* 第52天：缺少默认版本时阻止生成错误快照。 */
  return comparePromptTemplates(baseline, candidate); /* 第52天：返回行级 diff 对比结果。 */
} /* 第52天：结束默认提示词差异构造函数。 */

function buildRegressionLinks(): PromptRegressionLink[] { /* 第52天：定义提示词与回归评估关联构造函数。 */
  const researchV2 = promptRegistry.getVersion("research", "v2"); /* 第52天：读取研究提示词 v2。 */
  const researchV3 = promptRegistry.getVersion("research", "v3"); /* 第52天：读取研究提示词 v3。 */
  if (!researchV2 || !researchV3) return []; /* 第52天：缺少版本时返回空关联，保持接口可用。 */
  const scoreDelta = Number(((researchV3.score ?? 0) - (researchV2.score ?? 0)).toFixed(2)); /* 第52天：计算候选版本相对基线的评分变化。 */
  const baselineCost = researchV2.costEstimate || 1; /* 第52天：读取基线成本并避免除零。 */
  const candidateCost = researchV3.costEstimate || baselineCost; /* 第52天：读取候选成本，缺失时使用基线成本。 */
  const costDeltaPercent = Number(((candidateCost - baselineCost) / baselineCost * 100).toFixed(2)); /* 第52天：计算成本变化百分比。 */
  return [{ componentId: "research", baselinePromptId: researchV2.id, candidatePromptId: researchV3.id, baselineVersion: researchV2.version, candidateVersion: researchV3.version, result: scoreDelta >= 0 ? "passed" : "failed", scoreDelta, costDeltaPercent }]; /* 第52天：返回可展示的提示词回归关联。 */
} /* 第52天：结束提示词回归关联构造函数。 */

function buildRenderedPreview(): string { /* 第52天：定义提示词渲染预览构造函数。 */
  const activeResearch = promptRegistry.getActive("research"); /* 第52天：读取当前 active 的研究提示词。 */
  if (!activeResearch) return "当前没有 active research Prompt。"; /* 第52天：没有 active 版本时返回可读占位。 */
  return renderPrompt(activeResearch, { task: "分析 Day 52 Prompt Registry 的价值", memory: "Day 51 已具备 Model Fallback 与 Circuit Breaker。", workspace: "工作空间中已有 usage、trace、regression 结果。", tools: "retrieval, ragAnswer, summary" }); /* 第52天：使用真实变量渲染一条研究提示词预览。 */
} /* 第52天：结束提示词渲染预览构造函数。 */

export async function getPromptDashboardSnapshot(): Promise<PromptDashboardSnapshot> { /* 第52天：定义 Prompt Explorer（提示词浏览器）快照入口。 */
  const prompts = promptRegistry.list(); /* 第52天：读取全部提示词版本。 */
  const componentIds = Array.from(new Set(prompts.map((prompt) => prompt.componentId))); /* 第52天：收集所有组件 ID。 */
  const activePrompts = componentIds.map((componentId) => promptRegistry.getActive(componentId)).filter((prompt): prompt is PromptTemplate => Boolean(prompt)); /* 第52天：读取每个组件当前 active 版本。 */
  const validationResults = Object.fromEntries(prompts.map((prompt) => [prompt.id, validatePromptTemplate(prompt)])); /* 第52天增强：为每个提示词版本生成变量契约校验结果。 */
  return { prompts, activePrompts, metrics: promptRegistry.getMetrics(), comparison: buildDefaultComparison(), contracts: promptVariableContracts, validationResults, regressionLinks: buildRegressionLinks(), renderedPreview: buildRenderedPreview(), generatedAt: Date.now() }; /* 第52天：返回完整 Prompt Explorer 快照。 */
} /* 第52天：结束 Prompt Explorer 快照入口。 */
