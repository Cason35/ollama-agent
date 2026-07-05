import assert from "node:assert/strict"; /* 第57天：引入 Node.js 严格断言工具。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第57天：引入已接入 RuntimeDecision 的 Agent Runtime。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第57天：引入默认智能体注册表。 */
import { MemoryWorkspaceStore } from "../lib/agents/workspace-store"; /* 第57天：引入内存工作空间存储，保证测试隔离。 */
import { RuntimeDecisionEngine, inferRuntimeContextFromText } from "../lib/runtime/runtime-decision-engine"; /* 第57天：引入运行时决策引擎和上下文推导工具。 */
import { RuntimeDecisionStore, runtimeDecisionStore } from "../lib/runtime/runtime-decision-store"; /* 第57天：引入独立和共享决策仓库。 */
import { getRuntimeDashboardSnapshot } from "../lib/runtime/runtime-dashboard-runtime"; /* 第57天：引入 Runtime Explorer 看板快照函数。 */
import type { RuntimeContext } from "../lib/runtime/runtime-types"; /* 第57天：引入 RuntimeContext 类型用于测试样例。 */

const engine = new RuntimeDecisionEngine(); /* 第57天：创建独立决策引擎，避免测试依赖共享状态。 */

function testRuntimeContextInference(): void { /* 第57天：定义 RuntimeContext 推导测试。 */
  const context = inferRuntimeContextFromText({ text: "请深入研究 LangGraph，并引用资料生成完整报告", hasMemory: true }); /* 第57天：从研究型用户文本推导上下文。 */
  assert.equal(context.taskType, "research", "研究关键词应识别为 research 任务"); /* 第57天：验证任务类型识别。 */
  assert.equal(context.complexity, "high", "研究任务应被识别为高复杂度"); /* 第57天：验证复杂度识别。 */
  assert.equal(context.latencyPreference, "quality", "高复杂任务应倾向质量优先"); /* 第57天：验证延迟偏好识别。 */
  assert.equal(context.hasKnowledge, true, "引用资料应触发知识库上下文"); /* 第57天：验证知识库上下文识别。 */
  assert.equal(context.hasMemory, true, "显式传入记忆时应保留 hasMemory=true"); /* 第57天：验证记忆上下文覆盖。 */
} /* 第57天：结束 RuntimeContext 推导测试。 */

function testDecisionRules(): void { /* 第57天：定义核心决策规则测试。 */
  const fastChat: RuntimeContext = { taskType: "chat", complexity: "low", latencyPreference: "fast", budgetLevel: "low", hasKnowledge: false, hasWorkspace: false, hasMemory: false, requiresJson: false }; /* 第57天：构造普通快速聊天上下文。 */
  const fastDecision = engine.decide(fastChat); /* 第57天：执行普通聊天决策。 */
  assert.equal(fastDecision.promptStrategy, "fast", "普通快速聊天应启用 Fast Prompt"); /* 第57天：验证快速提示词策略。 */
  assert.equal(fastDecision.modelStrategy, "small", "普通快速聊天应选择 Small Model"); /* 第57天：验证小模型策略。 */
  assert.equal(fastDecision.collaborationStrategy, "direct", "普通快速聊天应直接回答"); /* 第57天：验证直答协作策略。 */
  assert.equal(fastDecision.cacheStrategy, "cache-first", "低预算快速任务应缓存优先"); /* 第57天：验证缓存优先策略。 */
  const research: RuntimeContext = { taskType: "research", complexity: "high", latencyPreference: "quality", budgetLevel: "high", hasKnowledge: true, hasWorkspace: true, hasMemory: true, requiresJson: false }; /* 第57天：构造复杂研究上下文。 */
  const researchDecision = engine.decide(research); /* 第57天：执行复杂研究决策。 */
  assert.equal(researchDecision.promptStrategy, "quality", "复杂研究应启用 Quality Prompt"); /* 第57天：验证质量提示词策略。 */
  assert.equal(researchDecision.modelStrategy, "multi", "复杂研究应启用 Multi Model"); /* 第57天：验证多模型策略。 */
  assert.equal(researchDecision.collaborationStrategy, "model-collaboration", "复杂研究应进入模型协作策略"); /* 第57天：验证模型协作策略。 */
  assert.equal(researchDecision.retrievalStrategy, "deep-rag", "复杂研究且有知识库应启用 Deep RAG"); /* 第57天：验证深度检索策略。 */
  assert.equal(researchDecision.memoryStrategy, "workspace", "存在 Workspace 时应优先使用 workspace 记忆策略"); /* 第57天：验证工作空间记忆策略。 */
  const jsonContext: RuntimeContext = { taskType: "planning", complexity: "medium", latencyPreference: "balanced", budgetLevel: "medium", hasKnowledge: false, hasWorkspace: false, hasMemory: false, requiresJson: true }; /* 第57天：构造结构化输出上下文。 */
  const jsonDecision = engine.decide(jsonContext); /* 第57天：执行结构化输出决策。 */
  assert.equal(jsonDecision.promptStrategy, "json", "requiresJson 应启用 JSON Prompt"); /* 第57天：验证 JSON 提示词策略。 */
  assert.equal(jsonDecision.modelStrategy, "json", "requiresJson 应启用 JSON Model"); /* 第57天：验证 JSON 模型策略。 */
  assert.equal(jsonDecision.cacheStrategy, "bypass", "JSON 任务应默认绕过缓存"); /* 第57天：验证 JSON 缓存策略。 */
} /* 第57天：结束核心决策规则测试。 */

function testDecisionStoreMetricsAndReplay(): void { /* 第57天：定义 Runtime Metrics 与 Decision Replay 测试。 */
  const store = new RuntimeDecisionStore(); /* 第57天：创建独立决策仓库。 */
  const fastContext: RuntimeContext = { taskType: "chat", complexity: "low", latencyPreference: "fast", budgetLevel: "low", hasKnowledge: false, hasWorkspace: false, hasMemory: false, requiresJson: false }; /* 第57天：准备快速上下文。 */
  const qualityContext: RuntimeContext = { taskType: "research", complexity: "high", latencyPreference: "quality", budgetLevel: "high", hasKnowledge: true, hasWorkspace: false, hasMemory: true, requiresJson: false }; /* 第57天：准备质量上下文。 */
  const fastRecord = store.record({ context: fastContext, decision: engine.decide(fastContext), source: "test-fast" }); /* 第57天：写入快速决策记录。 */
  const qualityRecord = store.record({ context: qualityContext, decision: engine.decide(qualityContext), source: "test-quality", traceId: "trace-day57" }); /* 第57天：写入质量决策记录。 */
  const metrics = store.getMetrics(); /* 第57天：读取运行时指标。 */
  assert.equal(store.listRecords().length, 2, "应保存两条可回放决策记录"); /* 第57天：验证回放记录数量。 */
  assert.equal(store.listRecords()[0]?.decisionId, qualityRecord.decisionId, "最新记录应排在 Decision Replay 前面"); /* 第57天：验证最新优先排序。 */
  assert.ok(fastRecord.decisionId.length > 0, "决策记录应生成稳定 ID"); /* 第57天：验证记录 ID。 */
  assert.ok(metrics.fastStrategyUsage >= 1, "指标应统计快速策略使用次数"); /* 第57天：验证快速策略指标。 */
  assert.ok(metrics.qualityUsage >= 1, "指标应统计质量策略使用次数"); /* 第57天：验证质量策略指标。 */
  assert.ok(metrics.avgDecisionTime >= 1, "平均决策耗时应可计算"); /* 第57天：验证平均决策耗时。 */
  assert.ok(metrics.avgEstimatedCost > 0, "平均估算成本应大于 0"); /* 第57天：验证平均估算成本。 */
} /* 第57天：结束 Runtime Metrics 与 Decision Replay 测试。 */

function testRuntimeDashboardSnapshot(): void { /* 第57天：定义 Runtime Explorer 快照测试。 */
  const store = new RuntimeDecisionStore(); /* 第57天：创建独立决策仓库。 */
  const context: RuntimeContext = { taskType: "evaluation", complexity: "medium", latencyPreference: "balanced", budgetLevel: "medium", hasKnowledge: false, hasWorkspace: false, hasMemory: true, requiresJson: false }; /* 第57天：准备评估上下文。 */
  store.record({ context, decision: engine.decide(context), source: "dashboard-test" }); /* 第57天：写入一条用于快照回放的决策。 */
  const snapshot = getRuntimeDashboardSnapshot(engine, store); /* 第57天：生成运行时看板快照。 */
  assert.ok(snapshot.previews.length >= 4, "看板应包含至少四个典型决策预览"); /* 第57天：验证典型场景数量。 */
  assert.equal(snapshot.records.length, 1, "看板应返回决策回放记录"); /* 第57天：验证回放记录接入。 */
  assert.ok(snapshot.metrics.avgEstimatedLatency > 0, "看板应返回运行时指标"); /* 第57天：验证指标接入。 */
} /* 第57天：结束 Runtime Explorer 快照测试。 */

async function testAgentRuntimeDecisionTrace(): Promise<void> { /* 第57天：定义 Agent Runtime 接入运行时决策测试。 */
  runtimeDecisionStore.reset(); /* 第57天：清空共享决策仓库，避免历史记录影响断言。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore()); /* 第57天：创建带默认决策引擎的 Agent Runtime。 */
  const snapshot = await runtime.runSupervisorCollaboration("研究 LangGraph 的生产落地方案，并评估风险与下一步"); /* 第57天：执行高复杂研究任务，触发自适应运行时决策。 */
  const decisionSpans = snapshot.trace.spans.filter((span) => span.type === "decision"); /* 第57天：收集 Trace 中的运行时决策 Span。 */
  const replayRecords = runtimeDecisionStore.listRecords(); /* 第57天：读取共享 Decision Replay 记录。 */
  assert.ok(snapshot.runtimeContext, "协作快照应包含 RuntimeContext"); /* 第57天：验证快照保存运行时上下文。 */
  assert.ok(snapshot.runtimeDecision, "协作快照应包含 RuntimeDecision"); /* 第57天：验证快照保存运行时决策。 */
  assert.ok(decisionSpans.length >= 1, "Trace 应记录 decision span"); /* 第57天：验证 Trace 接入决策跨度。 */
  assert.ok(decisionSpans[0]?.metadata?.collaborationStrategy, "decision span 应记录协作策略"); /* 第57天：验证决策元数据。 */
  assert.ok(snapshot.traceMetrics.avgDecisionDuration >= 0, "Trace Metrics 应包含决策耗时"); /* 第57天：验证追踪指标新增决策耗时。 */
  assert.ok(replayRecords.some((record) => record.traceId === snapshot.trace.traceId), "Decision Replay 应关联 Agent Trace ID"); /* 第57天：验证回放记录关联 Trace。 */
} /* 第57天：结束 Agent Runtime 决策接入测试。 */

async function main(): Promise<void> { /* 第57天：定义自动化验收主入口。 */
  testRuntimeContextInference(); /* 第57天：执行 RuntimeContext 推导测试。 */
  testDecisionRules(); /* 第57天：执行核心决策规则测试。 */
  testDecisionStoreMetricsAndReplay(); /* 第57天：执行指标与回放测试。 */
  testRuntimeDashboardSnapshot(); /* 第57天：执行 Runtime Explorer 快照测试。 */
  await testAgentRuntimeDecisionTrace(); /* 第57天：执行 Agent Runtime + Trace 接入测试。 */
  console.log("Day 57 Adaptive Runtime Decision Engine tests passed."); /* 第57天：输出测试通过信息。 */
} /* 第57天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第57天：启动测试并捕获异步错误。 */
  console.error(error); /* 第57天：输出失败原因。 */
  process.exitCode = 1; /* 第57天：设置非零退出码。 */
}); /* 第57天：结束错误处理。 */
