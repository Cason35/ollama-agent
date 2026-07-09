import { runtimeDecisionEngine, type RuntimeDecisionEngine } from "@/lib/runtime/runtime-decision-engine"; /* 第57天：引入运行时决策引擎和类型。 */
import { runtimeDecisionStore, type RuntimeDecisionStore } from "@/lib/runtime/runtime-decision-store"; /* 第57天：引入运行时决策仓库和类型。 */
import type { RuntimeContext, RuntimeDashboardSnapshot, RuntimeDecisionPreview } from "@/lib/runtime/runtime-types"; /* 第57天：引入看板快照与上下文类型。 */

const DEMO_CONTEXTS: Array<{ label: string; context: RuntimeContext }> = [ /* 第57天：定义 Runtime Explorer 典型场景输入。 */
  { label: "普通聊天 Fast Strategy", context: { taskType: "chat", complexity: "low", latencyPreference: "fast", budgetLevel: "low", hasKnowledge: false, hasWorkspace: false, hasMemory: false, requiresJson: false } }, /* 第57天：普通聊天应走快速、低成本、直答路径。 */
  { label: "复杂 Research Quality Strategy", context: { taskType: "research", complexity: "high", latencyPreference: "quality", budgetLevel: "high", hasKnowledge: true, hasWorkspace: true, hasMemory: true, requiresJson: false } }, /* 第57天：复杂研究应走质量、多模型、深度检索和长期记忆路径。 */
  { label: "JSON Structured Output", context: { taskType: "planning", complexity: "medium", latencyPreference: "balanced", budgetLevel: "medium", hasKnowledge: false, hasWorkspace: false, hasMemory: false, requiresJson: true } }, /* 第57天：结构化输出应触发 JSON Prompt 和 JSON Model。 */
  { label: "Evaluation With Memory", context: { taskType: "evaluation", complexity: "medium", latencyPreference: "balanced", budgetLevel: "medium", hasKnowledge: false, hasWorkspace: false, hasMemory: true, requiresJson: false } }, /* 第57天：评估任务带记忆时应启用单 Agent 与短期记忆。 */
]; /* 第57天：结束典型场景定义。 */

export function getRuntimeDashboardSnapshot(engine: RuntimeDecisionEngine = runtimeDecisionEngine, store: RuntimeDecisionStore = runtimeDecisionStore): RuntimeDashboardSnapshot { /* 第57天：生成 Runtime Explorer 看板快照。 */
  const previews: RuntimeDecisionPreview[] = DEMO_CONTEXTS.map(({ label, context }) => ({ label, context, decision: engine.decide(context) })); /* 第57天：为每个典型场景生成稳定决策预览。 */
  return { previews, records: store.listRecords(30), metrics: store.getMetrics(), generatedAt: Date.now() }; /* 第57天：返回预览、回放、指标和生成时间。 */
} /* 第57天：结束 Runtime Explorer 快照函数。 */
