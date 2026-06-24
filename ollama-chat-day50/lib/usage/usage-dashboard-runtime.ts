import { AgentRuntime } from "@/lib/agents/agent-runtime"; /* 第47天：引入已接入 Usage 的智能体运行时。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 第47天：引入默认智能体注册表以运行成本观测演示。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第47天：引入提示词 ROI 所需的词元估算函数。 */
import { ToolUsageRuntime } from "@/lib/usage/tool-usage-runtime"; /* 第47天：引入统一工具用量包装运行时。 */
import { usageManager } from "@/lib/usage/usage-manager"; /* 第47天：引入进程内共享用量管理器。 */
import type { PromptROIResult, UsageDashboardSnapshot } from "@/lib/usage/usage-types"; /* 第47天：引入用量看板与提示词 ROI 类型。 */

let latestPromptROI: PromptROIResult | null = null; /* 第47天：缓存最近一次提示词 ROI 对比结果。 */

async function runUsageDemo(): Promise<void> { /* 第47天：定义生成完整 Agent、Tool、Reflection、Evaluation 用量链路的演示函数。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry()); /* 第47天：创建使用共享 UsageManager 的智能体运行时。 */
  const collaboration = await runtime.runSupervisorCollaboration("研究 LangGraph 的生产应用，规划落地步骤，评估质量与风险，并总结下一步；同时核算 Agent、Tool、Reflection、Evaluation 的 Token 和 Cost。 "); /* 第47天：执行覆盖研究、规划、评估和写作阶段的多智能体任务。 */
  const traceId = collaboration.trace.traceId; /* 第47天：读取完整协作任务的 Trace 标识供额外工具关联。 */
  const toolRuntime = new ToolUsageRuntime(); /* 第47天：创建统一工具用量运行时。 */
  await toolRuntime.execute({ traceId, spanId: `${traceId}-retrieval-tool`, toolId: "retrieval", input: "检索 LangGraph 生产实践与状态图资料" }, async () => "已召回 12 个候选片段并重排出 5 个高相关结果。 "); /* 第47天：演示 Retrieval Tool（检索工具）的成本记录。 */
  await toolRuntime.execute({ traceId, spanId: `${traceId}-summary-tool`, toolId: "summary", input: "将检索结果压缩为面向工程落地的摘要" }, async () => "摘要覆盖状态管理、检查点、人工确认、可观测性和部署边界。 "); /* 第47天：演示 Summary Tool（摘要工具）的成本记录。 */
  await toolRuntime.execute({ traceId, spanId: `${traceId}-weather-tool`, toolId: "weather", input: "查询上海当前天气用于验证外部接口成本" }, async () => "上海当前 26°C，工具调用成功，外部接口资源已纳入统一核算。 "); /* 第47天：演示 Weather Tool（天气工具）的成本记录。 */
  const promptAB = collaboration.promptABTest; /* 第47天：读取 Day 45 保留的提示词质量 A/B 对比结果。 */
  latestPromptROI = usageManager.comparePromptROI({ version: "A", description: promptAB.promptVersionA, score: promptAB.scoreA, inputTokens: estimateTokenCount(promptAB.promptVersionA), outputTokens: estimateTokenCount(collaboration.result.output.slice(0, Math.max(120, Math.floor(collaboration.result.output.length * 0.55)))) }, { version: "B", description: promptAB.promptVersionB, score: promptAB.scoreB, inputTokens: estimateTokenCount(promptAB.promptVersionB), outputTokens: estimateTokenCount(collaboration.result.output) }); /* 第47天：在质量分基础上补充费用与 Cost/Score Ratio 对比。 */
} /* 第47天：结束用量演示运行函数。 */

export async function getUsageDashboardSnapshot(force = false): Promise<UsageDashboardSnapshot> { /* 第47天：定义读取或强制重跑 Usage Explorer 快照的入口。 */
  if (force) { usageManager.clear(); latestPromptROI = null; } /* 第47天：强制运行时清空旧记录与 ROI 缓存，保证新快照独立。 */
  if (usageManager.listRecords().length === 0 || !latestPromptROI) await runUsageDemo(); /* 第47天：首次访问或缓存不完整时生成一条完整演示链路。 */
  const promptROI = latestPromptROI ?? usageManager.comparePromptROI({ version: "A", description: "简洁基线提示词", score: 80, inputTokens: 120, outputTokens: 360 }, { version: "B", description: "带质量维度的结构化提示词", score: 90, inputTokens: 180, outputTokens: 420 }); /* 第47天：提供理论不可达情况下的稳定 ROI 兜底。 */
  return { records: usageManager.listRecords(), traceUsage: usageManager.listTraceUsage(), agentUsage: usageManager.getAgentUsage(), toolUsage: usageManager.getToolUsage(), metrics: usageManager.getMetrics(), costBreakdown: usageManager.getCostBreakdown(), modelUsage: usageManager.getModelUsage(), promptROI, generatedAt: Date.now() }; /* 第47天：返回调用明细、分组汇总、指标、成本构成、模型用量（第50天）和提示词 ROI。 */
} /* 第47天：结束 Usage Explorer 快照入口。 */
