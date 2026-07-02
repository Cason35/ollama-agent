import assert from "node:assert/strict"; /* 第47天：引入 Node 严格断言用于自动化验收。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第47天：引入已接入用量记录的 Agent Runtime。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第47天：引入默认智能体注册表。 */
import { MemoryWorkspaceStore } from "../lib/agents/workspace-store"; /* 第47天：引入内存工作空间存储以隔离测试。 */
import { ToolUsageRuntime } from "../lib/usage/tool-usage-runtime"; /* 第47天：引入统一工具用量运行时。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第47天：引入待验收的用量管理器。 */

function testUsageManagerAggregation(): void { /* 第47天：定义用量记录、分组和指标聚合测试。 */
  const manager = new UsageManager(); /* 第47天：创建独立用量管理器避免污染共享单例。 */
  manager.addRecord({ traceId: "trace-1", spanId: "span-agent-1", componentType: "agent", componentId: "research", inputTokens: 2100, outputTokens: 980, durationMs: 8100, estimatedCost: 0.0032 }); /* 第47天：写入示例 Research Agent 用量。 */
  manager.addRecord({ traceId: "trace-1", spanId: "span-tool-1", componentType: "tool", componentId: "retrieval", inputTokens: 300, outputTokens: 120, durationMs: 320, estimatedCost: 0.0004 }); /* 第47天：写入示例 Retrieval Tool 用量。 */
  manager.addRecord({ traceId: "trace-2", spanId: "span-agent-2", componentType: "agent", componentId: "writer", inputTokens: 800, outputTokens: 500, durationMs: 2100, estimatedCost: 0.0014 }); /* 第47天：写入第二条 Trace 的 Writer Agent 用量。 */
  assert.equal(manager.listRecords().length, 3, "应保存全部 UsageRecord"); /* 第47天：验证 listRecords 返回三条记录。 */
  assert.equal(manager.getTraceUsage("trace-1").totalTokens, 3500, "Trace 应汇总 Agent 与 Tool 词元"); /* 第47天：验证 Trace 级总词元聚合。 */
  assert.equal(manager.getAgentUsage("research")[0]?.estimatedCost, 0.0032, "应按 Agent 汇总费用"); /* 第47天：验证 Agent 级费用聚合。 */
  assert.equal(manager.getToolUsage("retrieval")[0]?.totalTokens, 420, "应按 Tool 汇总词元"); /* 第47天：验证 Tool 级词元聚合。 */
  assert.equal(manager.getMetrics().totalTokens, 4800, "系统指标应累计全部词元"); /* 第47天：验证系统总词元指标。 */
  assert.equal(manager.getMetrics().mostExpensiveAgent?.componentId, "research", "应识别成本最高 Agent"); /* 第47天：验证最高成本智能体识别。 */
  assert.equal(manager.getMetrics().mostExpensiveTool?.componentId, "retrieval", "应识别成本最高 Tool"); /* 第47天：验证最高成本工具识别。 */
  const percentage = manager.getCostBreakdown().reduce((sum, item) => sum + item.percentage, 0); /* 第47天：计算成本构成百分比之和。 */
  assert.ok(Math.abs(percentage - 100) < 0.05, "成本构成占比之和应约为 100%"); /* 第47天：验证成本构成百分比精度。 */
} /* 第47天：结束用量管理器聚合测试。 */

async function testToolRuntimeUsage(): Promise<void> { /* 第47天：定义 Retrieval、Summary 与 Weather 工具接入测试。 */
  const manager = new UsageManager(); /* 第47天：创建工具测试专用用量管理器。 */
  const runtime = new ToolUsageRuntime(manager); /* 第47天：把独立管理器注入工具运行时。 */
  await runtime.execute({ traceId: "trace-tools", spanId: "span-retrieval", toolId: "retrieval", input: "检索生产资料" }, async () => "返回检索结果"); /* 第47天：执行并记录 Retrieval Tool。 */
  await runtime.execute({ traceId: "trace-tools", spanId: "span-summary", toolId: "summary", input: "总结检索结果" }, async () => "返回摘要"); /* 第47天：执行并记录 Summary Tool。 */
  await runtime.execute({ traceId: "trace-tools", spanId: "span-weather", toolId: "weather", input: "查询上海天气" }, async () => "当前 26°C"); /* 第47天：执行并记录 Weather Tool。 */
  assert.deepEqual(manager.getToolUsage().map((item) => item.componentId).sort(), ["retrieval", "summary", "weather"], "三个指定工具都应写入 Usage"); /* 第47天：验证三个指定工具完整接入。 */
  assert.ok(manager.listRecords().every((record) => record.traceId === "trace-tools" && record.spanId.length > 0), "工具记录应关联 Trace 与 Span"); /* 第47天：验证工具记录追踪关联。 */
} /* 第47天：结束工具运行时用量测试。 */

async function testAgentRuntimeUsage(): Promise<void> { /* 第47天：定义 Agent、Reflection、Evaluation 与 Tool 联动测试。 */
  const manager = new UsageManager(); /* 第47天：创建 Agent Runtime 测试专用用量管理器。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore(), manager); /* 第47天：注入独立工作空间和用量管理器。 */
  const result = await runtime.executeAgent("research", { id: "day47-agent-usage-test", goal: "研究 LangGraph 的状态管理、风险和下一步", assignedAgentId: "research" }); /* 第47天：执行会触发工具、反思和评估的研究智能体。 */
  const records = manager.listRecords(); /* 第47天：读取运行时生成的全部用量记录。 */
  const componentTypes = new Set(records.map((record) => record.componentType)); /* 第47天：收集实际出现的组件类型。 */
  assert.equal(result.metadata?.ok, true, "Research Agent 应成功执行"); /* 第47天：验证业务执行结果未被用量记录改变。 */
  assert.deepEqual([...componentTypes].sort(), ["agent", "evaluation", "reflection", "tool"], "四类运行组件都应接入 Usage"); /* 第47天：验证 Agent、Tool、Reflection 与 Evaluation 全部接入。 */
  assert.ok(records.every((record) => record.traceId.length > 0 && record.spanId.length > 0), "每条运行时用量都应关联 Trace 与 Span"); /* 第47天：验证 Trace + Cost 关联完整。 */
  assert.ok(records.every((record) => record.totalTokens === record.inputTokens + record.outputTokens), "总词元应等于输入与输出词元之和"); /* 第47天：验证 Token Accounting 公式。 */
  assert.ok(records.every((record) => record.estimatedCost >= 0 && record.durationMs >= 0), "费用与耗时不得为负数"); /* 第47天：验证费用与耗时边界。 */
} /* 第47天：结束 Agent Runtime 用量联动测试。 */

function testPromptROI(): void { /* 第47天：定义提示词投资回报率测试。 */
  const manager = new UsageManager(); /* 第47天：创建 ROI 测试专用管理器。 */
  const result = manager.comparePromptROI({ version: "A", description: "短提示词", score: 82, inputTokens: 100, outputTokens: 300 }, { version: "B", description: "结构化提示词", score: 91, inputTokens: 160, outputTokens: 360 }); /* 第47天：比较质量与成本不同的两个提示词。 */
  assert.equal(result.qualityWinner, "B", "更高质量分的 Prompt B 应成为质量胜出者"); /* 第47天：验证质量胜出版本。 */
  assert.equal(result.costWinner, "A", "词元更少的 Prompt A 应成为成本胜出者"); /* 第47天：验证成本胜出版本。 */
  assert.ok(result.variants.every((variant) => variant.costPerScore > 0), "两个提示词都应计算 Cost/Score Ratio"); /* 第47天：验证单位质量分数成本。 */
  assert.ok(["A", "B"].includes(result.recommendedVersion), "ROI 测试应给出明确推荐版本"); /* 第47天：验证综合性价比推荐。 */
} /* 第47天：结束提示词投资回报率测试。 */

async function main(): Promise<void> { /* 第47天：定义 Day 47 自动化验收主入口。 */
  testUsageManagerAggregation(); /* 第47天：执行用量管理器与成本构成测试。 */
  await testToolRuntimeUsage(); /* 第47天：执行三类指定工具用量测试。 */
  await testAgentRuntimeUsage(); /* 第47天：执行完整生产运行时用量联动测试。 */
  testPromptROI(); /* 第47天：执行 Prompt ROI 测试。 */
  console.log("Day 47 Usage & Cost Observability tests passed."); /* 第47天：输出自动化验收成功提示。 */
} /* 第47天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第47天：启动测试并捕获异步断言或运行时错误。 */
  console.error(error); /* 第47天：输出失败原因以便定位具体测试。 */
  process.exitCode = 1; /* 第47天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第47天：结束自动化测试错误处理。 */
