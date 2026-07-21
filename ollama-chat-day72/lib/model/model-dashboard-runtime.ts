import { modelRegistry } from "@/lib/model/default-models"; /* 第50天：引入共享模型注册表读取模型档案与指标。 */
import { modelRouter } from "@/lib/model/model-router"; /* 第50天：引入共享模型路由器生成路由预览。 */
import { circuitBreakerManager } from "@/lib/model/circuit-breaker-manager"; /* 第51天：引入共享熔断器管理器生成模型健康快照。 */
import type { ModelRoutingInput, ModelRoutingPreview, ModelSnapshot } from "@/lib/model/model-profile-types"; /* 第50天：引入模型路由输入、预览与快照类型。 */

const PREVIEW_SCENARIOS: Array<{ label: string; input: ModelRoutingInput }> = [ /* 第50天：定义对应第50天验收的典型路由场景列表。 */
  { label: "帮我总结这段话", input: { taskType: "summary", complexity: "low", latencyPreference: "fast" } }, /* 第50天：简单总结应路由到小模型。 */
  { label: "帮我研究 LangGraph 教程路线", input: { taskType: "research", complexity: "high", latencyPreference: "quality" } }, /* 第56天：研究任务应路由到大型推理模型，并可交给协作规划器继续拆阶段。 */
  { label: "帮我设计多 Agent 架构", input: { taskType: "planning", complexity: "high", latencyPreference: "quality" } }, /* 第50天：复杂规划应路由到大推理模型。 */
  { label: "把结果改写成 JSON", input: { taskType: "json", requiresJson: true, complexity: "medium" } }, /* 第50天：结构化输出应路由到 JSON 模型。 */
  { label: "Evaluation（评估）任务", input: { taskType: "evaluation", complexity: "medium" } }, /* 第50天：评估任务应路由到评估模型。 */
  { label: "Embedding（向量嵌入）", input: { taskType: "embedding" } }, /* 第50天：嵌入任务应路由到嵌入模型。 */
]; /* 第50天：结束典型路由场景列表。 */

export function getModelDashboardSnapshot(): ModelSnapshot { /* 第50天：定义读取 Model Explorer（模型浏览器）快照的入口。 */
  const routingPreviews: ModelRoutingPreview[] = PREVIEW_SCENARIOS.map((scenario) => ({ label: scenario.label, input: scenario.input, decision: modelRouter.routeWithReason(scenario.input) })); /* 第50天：对每个典型场景执行路由并保存决策。 */
  const models = modelRegistry.summaries(); /* 第51天：读取全部模型摘要供档案和健康快照复用。 */
  const health = circuitBreakerManager.snapshot(models.map((model) => model.id)); /* 第51天：按模型顺序生成熔断状态与备用链使用情况。 */
  return { models, metrics: modelRegistry.stats(), routingPreviews, health, generatedAt: Date.now() }; /* 第51天：返回模型档案、注册表指标、路由预览与健康状态快照。 */
} /* 第50天：结束 Model Explorer 快照入口。 */
