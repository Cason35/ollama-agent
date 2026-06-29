import assert from "node:assert/strict"; /* 第50天：引入 Node 严格断言用于自动化验收。 */
import { ModelRegistry } from "../lib/model/model-registry"; /* 第50天：引入待验收的模型注册表。 */
import { ModelRouter } from "../lib/model/model-router"; /* 第50天：引入待验收的模型路由器。 */
import { createDefaultModelRegistry, DEFAULT_MODEL_PROFILES } from "../lib/model/default-models"; /* 第50天：引入默认模型注册工厂与默认模型档案列表。 */
import { getModelDashboardSnapshot } from "../lib/model/model-dashboard-runtime"; /* 第50天：引入 Model Explorer 快照入口。 */
import type { ModelProfile } from "../lib/model/model-profile-types"; /* 第50天：引入模型档案类型用于构造测试数据。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第50天：引入已接入模型路由的智能体运行时。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第50天：引入默认智能体注册表。 */
import { MemoryWorkspaceStore } from "../lib/agents/workspace-store"; /* 第50天：引入内存工作空间存储以隔离测试。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第50天：引入独立用量管理器避免污染共享单例。 */
import { SemanticCache } from "../lib/cache/semantic-cache"; /* 第50天：引入独立语义缓存避免污染共享单例。 */
import { LongTermMemoryStore } from "../lib/memory/long-term-memory-store"; /* 第50天：引入独立长期记忆避免污染共享单例。 */
import { ToolUsageRuntime } from "../lib/usage/tool-usage-runtime"; /* 第50天：引入已接入模型路由的工具用量运行时。 */

function buildSampleModel(): ModelProfile { /* 第50天：定义构造一个示例模型档案的工具函数。 */
  return { id: "unit-chat", name: "Unit Chat", provider: "ollama", model: "demo:1b", capabilities: ["chat", "summary"], cost: { inputPer1K: 0.0001, outputPer1K: 0.0002 }, limits: { contextWindow: 4096, maxOutputTokens: 512 }, speed: "fast", quality: "basic" }; /* 第50天：返回一条用于单元测试的模型档案。 */
} /* 第50天：结束示例模型构造函数。 */

function testModelRegistry(): void { /* 第50天：定义 ModelProfile 与 ModelRegistry 基础能力测试。 */
  const registry = new ModelRegistry(); /* 第50天：创建独立模型注册表。 */
  const model = registry.register(buildSampleModel()); /* 第50天：注册一条示例模型。 */
  assert.equal(model.id, "unit-chat", "注册后应返回模型档案"); /* 第50天：验证注册返回值。 */
  assert.equal(registry.get("unit-chat")?.model, "demo:1b", "应能按 id 读取模型档案"); /* 第50天：验证按 id 读取。 */
  assert.equal(registry.list().length, 1, "list 应返回全部已注册模型"); /* 第50天：验证列表数量。 */
  assert.equal(registry.findByCapability("summary").length, 1, "findByCapability 应能按能力筛选模型"); /* 第50天：验证按能力查询。 */
  assert.equal(registry.findByCapability("embedding").length, 0, "未声明的能力应筛选不到模型"); /* 第50天：验证不匹配能力。 */
} /* 第50天：结束模型注册表测试。 */

function testDefaultModelsRegistered(): void { /* 第50天：定义默认模型档案注册测试。 */
  const registry = createDefaultModelRegistry(); /* 第50天：创建默认模型注册表。 */
  assert.equal(registry.list().length, DEFAULT_MODEL_PROFILES.length, "默认注册表应包含全部默认模型"); /* 第50天：验证默认模型数量。 */
  for (const id of ["small-chat", "large-reasoning", "json-structured", "embedding", "evaluation"]) assert.ok(registry.has(id), `默认注册表应包含 ${id}`); /* 第50天：验证五个逻辑模型均已注册。 */
  assert.equal(registry.stats().cheapestModelId, "embedding", "嵌入模型应为输入单价最低的模型"); /* 第50天：验证最便宜模型统计。 */
} /* 第50天：结束默认模型注册测试。 */

function testModelRouterRules(): void { /* 第50天：定义 ModelRouter（模型路由器）核心规则测试，对应第50天验收的五个用例。 */
  const router = new ModelRouter(createDefaultModelRegistry()); /* 第50天：创建基于默认注册表的模型路由器。 */
  assert.equal(router.route({ taskType: "summary", complexity: "low", latencyPreference: "fast" }).id, "small-chat", "简单总结应路由到小模型"); /* 第50天：用例一——简单总结→小模型。 */
  assert.equal(router.route({ taskType: "planning", complexity: "high" }).id, "large-reasoning", "复杂规划应路由到大推理模型"); /* 第50天：用例二——复杂规划→大推理模型。 */
  assert.equal(router.route({ taskType: "json", requiresJson: true }).id, "json-structured", "JSON 输出应路由到 JSON 模型"); /* 第50天：用例三——JSON 输出→JSON 模型。 */
  assert.equal(router.route({ taskType: "evaluation", complexity: "medium" }).id, "evaluation", "评估应路由到评估模型"); /* 第50天：用例四——评估→评估模型。 */
  assert.equal(router.route({ taskType: "embedding" }).id, "embedding", "向量嵌入应路由到嵌入模型"); /* 第50天：用例五——嵌入→嵌入模型。 */
} /* 第50天：结束模型路由规则测试。 */

function testModelRouterPriority(): void { /* 第50天：定义模型路由规则优先级测试。 */
  const router = new ModelRouter(createDefaultModelRegistry()); /* 第50天：创建模型路由器。 */
  assert.equal(router.route({ taskType: "embedding", requiresJson: true }).id, "embedding", "嵌入规则优先级应高于 JSON 规则"); /* 第50天：验证嵌入优先于 JSON。 */
  assert.equal(router.routeWithReason({ taskType: "json", requiresJson: true }).matchedRule, "requires-json", "JSON 路由应命中 requires-json 规则"); /* 第50天：验证命中规则可解释。 */
  assert.equal(router.route({ taskType: "chat", latencyPreference: "quality" }).id, "large-reasoning", "高质量偏好应路由到大推理模型"); /* 第50天：验证质量偏好路由。 */
} /* 第50天：结束路由优先级测试。 */

async function testAgentRuntimeModelRouting(): Promise<void> { /* 第50天：定义 Agent Runtime 接入 ModelRouter 与 Usage 记录模型信息测试。 */
  const usage = new UsageManager(); /* 第50天：创建独立用量管理器。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore(), usage, new SemanticCache(), new LongTermMemoryStore(), new ModelRouter(createDefaultModelRegistry())); /* 第50天：注入独立工作空间、用量、缓存、记忆与模型路由器。 */
  await runtime.runSupervisorCollaboration("研究 LangGraph 并规划落地步骤，评估质量并总结"); /* 第50天：执行覆盖研究、规划、评估与写作阶段的协作。 */
  const records = usage.listRecords(); /* 第50天：读取本次协作产生的用量记录。 */
  assert.ok(records.length > 0, "协作后应产生用量记录"); /* 第50天：验证有用量记录。 */
  assert.ok(records.every((record) => typeof record.modelId === "string" && record.modelId.length > 0), "每条用量记录都应标注路由出的模型 id"); /* 第50天：验证用量记录均含 modelId。 */
  assert.ok(records.some((record) => record.componentType === "evaluation" && record.modelId === "evaluation"), "评估阶段应被路由到评估模型"); /* 第50天：验证评估阶段路由正确。 */
  const modelUsage = usage.getModelUsage(); /* 第50天：按模型聚合用量。 */
  assert.ok(modelUsage.length > 0 && modelUsage.every((item) => item.recordCount > 0), "应能按模型聚合出成本归因"); /* 第50天：验证模型级成本归因。 */
} /* 第50天：结束 Agent Runtime 模型路由测试。 */

async function testToolRuntimeModelRouting(): Promise<void> { /* 第50天：定义 Tool Runtime 接入 ModelRouter 测试。 */
  const usage = new UsageManager(); /* 第50天：创建独立用量管理器。 */
  const toolRuntime = new ToolUsageRuntime(usage, new ModelRouter(createDefaultModelRegistry())); /* 第50天：注入独立用量与模型路由器的工具运行时。 */
  await toolRuntime.execute({ traceId: "t1", spanId: "s1", toolId: "retrieval", input: "检索 LangGraph 资料" }, async () => "已召回片段"); /* 第50天：执行检索工具应路由到嵌入模型。 */
  await toolRuntime.execute({ traceId: "t1", spanId: "s2", toolId: "queryRewrite", input: "改写查询为 JSON" }, async () => "{\"queries\":[]}"); /* 第50天：执行查询改写工具应路由到 JSON 模型。 */
  const records = usage.listRecords(); /* 第50天：读取工具用量记录。 */
  assert.equal(records.find((record) => record.componentId === "retrieval")?.modelId, "embedding", "检索工具应路由到嵌入模型"); /* 第50天：验证检索工具路由。 */
  assert.equal(records.find((record) => record.componentId === "queryRewrite")?.modelId, "json-structured", "查询改写工具应路由到 JSON 模型"); /* 第50天：验证查询改写工具路由。 */
} /* 第50天：结束 Tool Runtime 模型路由测试。 */

function testModelDashboardSnapshot(): void { /* 第50天：定义 Model Explorer 快照测试。 */
  const snapshot = getModelDashboardSnapshot(); /* 第50天：生成模型浏览器快照。 */
  assert.equal(snapshot.models.length, DEFAULT_MODEL_PROFILES.length, "快照应包含全部模型档案"); /* 第50天：验证快照模型数量。 */
  assert.ok(snapshot.routingPreviews.length >= 5, "快照应至少包含五个路由预览"); /* 第50天：验证路由预览数量。 */
  const embeddingPreview = snapshot.routingPreviews.find((preview) => preview.input.taskType === "embedding"); /* 第50天：找到嵌入路由预览。 */
  assert.equal(embeddingPreview?.decision.model.id, "embedding", "嵌入路由预览应选中嵌入模型"); /* 第50天：验证预览路由结果。 */
} /* 第50天：结束模型快照测试。 */

async function main(): Promise<void> { /* 第50天：定义 Day 50 自动化验收主入口。 */
  testModelRegistry(); /* 第50天：执行模型注册表测试。 */
  testDefaultModelsRegistered(); /* 第50天：执行默认模型注册测试。 */
  testModelRouterRules(); /* 第50天：执行模型路由规则测试。 */
  testModelRouterPriority(); /* 第50天：执行路由优先级测试。 */
  await testAgentRuntimeModelRouting(); /* 第50天：执行 Agent Runtime 模型路由测试。 */
  await testToolRuntimeModelRouting(); /* 第50天：执行 Tool Runtime 模型路由测试。 */
  testModelDashboardSnapshot(); /* 第50天：执行模型快照测试。 */
  console.log("Day 50 Model Router tests passed."); /* 第50天：输出自动化验收成功提示。 */
} /* 第50天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第50天：启动测试并捕获异步断言或运行时错误。 */
  console.error(error); /* 第50天：输出失败原因以便定位具体测试。 */
  process.exitCode = 1; /* 第50天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第50天：结束自动化测试错误处理。 */
