import assert from "node:assert/strict"; /* 第52天：引入 Node.js 严格断言工具。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第52天：引入已接入 PromptRegistry 的 Agent Runtime。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第52天：引入默认 Agent 注册表。 */
import { buildPromptTemplateFromInput, validatePromptTemplate } from "../lib/prompts/prompt-contracts"; /* 第52天增强：引入提示词输入构造和变量契约校验函数。 */
import { comparePromptTemplates } from "../lib/prompts/prompt-diff"; /* 第52天：引入 Prompt Diff（提示词差异对比）函数。 */
import { createDefaultPromptRegistry } from "../lib/prompts/default-prompts"; /* 第52天：引入默认 PromptRegistry 工厂。 */
import { getPromptDashboardSnapshot } from "../lib/prompts/prompt-dashboard-runtime"; /* 第52天：引入 Prompt Explorer 快照运行时。 */
import { PromptRenderError, renderPrompt } from "../lib/prompts/prompt-renderer"; /* 第52天：引入 Prompt Renderer 和缺参错误类型。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第52天：引入独立 UsageManager 便于测试隔离。 */

async function main(): Promise<void> { /* 第52天：定义测试入口函数。 */
  const registry = createDefaultPromptRegistry(); /* 第52天：创建隔离的默认提示词注册表。 */
  assert.equal(registry.getActive("research")?.version, "v3"); /* 第52天：验证默认 research active 版本为 v3。 */
  registry.activate("research", "v2"); /* 第52天：模拟手动激活旧版本。 */
  assert.equal(registry.getActive("research")?.version, "v2"); /* 第52天：验证 active 已切换到 v2。 */
  registry.rollback("research", "v3"); /* 第52天：模拟回滚到候选稳定版本 v3。 */
  assert.equal(registry.getActive("research")?.version, "v3"); /* 第52天：验证回滚后 active 为 v3。 */
  registry.archive("research", "v2"); /* 第52天：模拟归档旧版本 v2。 */
  assert.equal(registry.getVersion("research", "v2")?.status, "archived"); /* 第52天：验证 v2 已归档。 */
  const activeResearch = registry.getActive("research"); /* 第52天：读取当前 active 研究提示词。 */
  assert.ok(activeResearch); /* 第52天：确认 active 研究提示词存在。 */
  const rendered = renderPrompt(activeResearch, { task: "验证提示词渲染", memory: "已有 Day 51 容错能力", workspace: "工作空间含 Trace 与 Usage", tools: "retrieval, ragAnswer" }); /* 第52天：使用完整变量渲染 active 模板。 */
  assert.match(rendered, /验证提示词渲染/); /* 第52天：验证任务变量被替换进提示词。 */
  assert.throws(() => renderPrompt(activeResearch, { task: "缺变量测试", memory: "记忆", tools: "工具" }), PromptRenderError); /* 第52天：验证缺少 workspace 时会明确报错。 */
  const baseline = registry.getVersion("research", "v2"); /* 第52天：读取 research.v2 基线版本。 */
  const candidate = registry.getVersion("research", "v3"); /* 第52天：读取 research.v3 候选版本。 */
  assert.ok(baseline && candidate); /* 第52天：确认两个对比版本都存在。 */
  const comparison = comparePromptTemplates(baseline, candidate); /* 第52天：生成提示词行级差异。 */
  assert.ok(comparison.addedLines.some((line) => line.includes("证据来源"))); /* 第52天：验证 v3 新增了证据来源要求。 */
  const invalidPrompt = buildPromptTemplateFromInput({ name: "错误变量草稿", componentType: "agent", componentId: "research", version: "v4", template: "你是研究型 Agent。\n任务：{{task1}}\n可用工具：{{tools}}", variables: ["task1", "tools"], status: "draft", source: "test-invalid" }); /* 第52天增强：构造把 {{task}} 错写成 {{task1}} 的草稿。 */
  const invalidValidation = validatePromptTemplate(invalidPrompt); /* 第52天增强：执行错误变量草稿校验。 */
  assert.equal(invalidValidation.valid, false); /* 第52天增强：验证错误变量草稿不能通过校验。 */
  assert.ok(invalidValidation.issues.some((issue) => issue.code === "unknown-variable" && issue.variable === "task1")); /* 第52天增强：验证校验器能识别未知变量 task1。 */
  assert.ok(invalidValidation.issues.some((issue) => issue.code === "missing-required-variable" && issue.variable === "task")); /* 第52天增强：验证校验器能识别缺少必需变量 task。 */
  assert.throws(() => registry.upsert(invalidPrompt), /未知变量|缺少必需变量/); /* 第52天增强：验证注册表拒绝保存错误变量草稿。 */
  const validDraft = buildPromptTemplateFromInput({ name: "Research v4 安全草稿", componentType: "agent", componentId: "research", version: "v4", template: "你是研究型 Agent。\n任务：{{task}}\n可用工具：{{tools}}\n长期记忆：{{memory}}\n共享工作空间：{{workspace}}\n请给出证据、风险和下一步。", variables: ["task", "tools", "memory", "workspace"], status: "draft", source: "test-valid" }); /* 第52天增强：构造合法的新研究提示词草稿。 */
  registry.upsert(validDraft); /* 第52天增强：保存合法草稿到隔离注册表。 */
  assert.equal(registry.getVersion("research", "v4")?.status, "draft"); /* 第52天增强：验证合法草稿已保存。 */
  registry.activate("research", "v4"); /* 第52天增强：激活合法草稿验证上线门禁。 */
  assert.equal(registry.getActive("research")?.version, "v4"); /* 第52天增强：验证合法新版本可以成为 active。 */
  const usage = new UsageManager(); /* 第52天：创建独立用量管理器。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), undefined, usage, undefined, undefined, undefined, registry); /* 第52天：创建注入隔离 PromptRegistry 与 UsageManager 的运行时。 */
  const collaboration = await runtime.runSupervisorCollaboration("测试 Prompt Registry 记录 promptVersion。"); /* 第52天：无真实模型运行一次规则型多 Agent 协作。 */
  const records = usage.listRecords(); /* 第52天：读取本次协作产生的用量记录。 */
  assert.ok(records.some((record) => record.promptId && record.promptVersion)); /* 第52天：验证 UsageRecord 已记录 promptId 与 promptVersion。 */
  assert.ok(collaboration.trace.spans.some((span) => span.metadata?.promptVersion)); /* 第52天：验证 Trace Span Metadata 已记录 promptVersion。 */
  const evaluation = await runtime.evaluateOutput({ id: "eval-test", goal: "验证 Evaluation Prompt Version", assignedAgentId: "writer" }, "完整性、正确性、相关性、覆盖度均已覆盖。"); /* 第52天：单独运行规则型 Evaluation。 */
  assert.equal(evaluation.promptVersion, "v2"); /* 第52天：验证 EvaluationResult 已记录提示词版本。 */
  const snapshot = await getPromptDashboardSnapshot(); /* 第52天：读取 Prompt Explorer 快照。 */
  assert.ok(snapshot.metrics.totalPrompts >= 10); /* 第52天：验证默认注册表有足够多组件版本。 */
  assert.equal(snapshot.comparison.componentId, "research"); /* 第52天：验证默认 diff 对比的是 research 组件。 */
  assert.ok(snapshot.regressionLinks[0]?.candidatePromptId === "research.v3"); /* 第52天：验证回归关联指向 research.v3。 */
  console.log("Day 52 Prompt Registry tests passed."); /* 第52天：输出测试通过信息。 */
} /* 第52天：结束测试入口函数。 */

main().catch((error) => { /* 第52天：捕获未处理异常并以失败码退出。 */
  console.error(error); /* 第52天：输出失败原因。 */
  process.exitCode = 1; /* 第52天：设置进程失败状态码。 */
}); /* 第52天：结束异常兜底。 */
