import assert from "node:assert/strict"; // 第66天：引入 Node.js 严格断言工具验证统一注册中心行为。
import { readFile } from "node:fs/promises"; // 第66天：引入异步文件读取工具验证标题和逐行中文注释要求。
import { AgentRegistry } from "../lib/agents/agent-registry"; // 第66天：引入旧智能体注册表验证兼容适配器。
import { createDefaultModelRegistry } from "../lib/model/default-models"; // 第66天：引入默认模型工厂验证模型能力迁移。
import { createDefaultPromptRegistry } from "../lib/prompts/default-prompts"; // 第66天：引入默认提示词工厂验证多版本和启用状态迁移。
import { createDay66UnifiedRegistry, createRegistrySnapshot } from "../lib/registry/registry-runtime"; // 第66天：引入完整能力目录和 Explorer 快照工厂。
import type { RegistryItem, RegistryProvider } from "../lib/registry/registry-types"; // 第66天：引入统一注册项和提供者协议用于契约测试。
import { RegistryConflictError, UnifiedRegistry } from "../lib/registry/unified-registry"; // 第66天：引入统一注册中心实现和冲突异常。
import { ToolRegistry, type Tool } from "../lib/tools/tool-registry"; // 第66天：引入旧工具注册表和工具类型验证兼容适配器。

const CREATED_AT = Date.UTC(2026, 6, 14, 0, 0, 0); // 第66天：使用固定创建时间保证测试数据稳定可复现。

function item(overrides: Partial<RegistryItem> = {}): RegistryItem { // 第66天：定义统一注册中心单元测试使用的注册项工厂。
  return { id: "tool:test-search", name: "Test Search Tool", type: "tool", version: "1.0.0", metadata: { description: "测试搜索工具", capabilities: ["research", "search"], tags: ["test", "retrieval"] }, enabled: true, createdAt: CREATED_AT, ...overrides }; // 第66天：返回包含能力、标签和启用状态的默认测试注册项。
} // 第66天：结束测试注册项工厂函数。

function testRegistryProviderContract(): void { // 第66天：验证 RegistryProvider 协议和 UnifiedRegistry 核心增删查搜能力。
  const registry = new UnifiedRegistry(); // 第66天：创建隔离的内存统一注册中心。
  const provider: RegistryProvider = registry; // 第66天：验证 UnifiedRegistry 满足抽象注册提供者协议。
  provider.register(item()); // 第66天：通过抽象协议注册一项测试工具能力。
  assert.equal(registry.get("tool:test-search")?.name, "Test Search Tool"); // 第66天：验证可以按跨类型唯一标识读取注册项。
  assert.equal(registry.list("tool").length, 1); // 第66天：验证可以按类型列出工具注册项。
  assert.equal(registry.search("retrieval").length, 1); // 第66天：验证搜索可以命中嵌套标签元数据。
  const copy = registry.get("tool:test-search") as RegistryItem; // 第66天：读取注册项副本验证防御性复制。
  (copy.metadata.capabilities as string[]).push("mutated"); // 第66天：主动修改返回副本的能力数组。
  assert.equal((registry.get("tool:test-search")?.metadata.capabilities as string[]).includes("mutated"), false); // 第66天：验证外部修改不会污染统一注册中心内部状态。
  assert.throws(() => registry.register(item()), (error) => error instanceof RegistryConflictError && error.reason === "duplicate_id"); // 第66天：验证同标识同版本重复注册触发重复标识冲突。
  assert.throws(() => registry.register(item({ version: "2.0.0" })), (error) => error instanceof RegistryConflictError && error.reason === "version_conflict"); // 第66天：验证同标识不同版本触发版本冲突。
  registry.unregister("tool:test-search"); // 第66天：注销测试工具能力。
  assert.equal(registry.get("tool:test-search"), undefined); // 第66天：验证注销后无法继续读取目标注册项。
} // 第66天：结束统一注册提供者核心契约测试。

function testCapabilityDiscovery(): void { // 第66天：验证能力发现综合名称、标签、描述、能力声明和启用状态。
  const registry = new UnifiedRegistry(); // 第66天：创建隔离能力发现测试注册中心。
  registry.register(item()); // 第66天：注册包含 research 能力声明的启用工具。
  registry.register(item({ id: "agent:disabled-research", name: "Disabled Research Agent", type: "agent", enabled: false })); // 第66天：注册同样匹配但已禁用的研究智能体。
  registry.register(item({ id: "model:summary", name: "Summary Model", type: "model", metadata: { description: "快速摘要模型", capabilities: ["summary"], tags: ["writing"] } })); // 第66天：注册只提供摘要能力的模型。
  const research = registry.discoverCapability("research capability"); // 第66天：使用包含英文占位词的研究能力查询执行统一发现。
  assert.equal(research.length, 1); // 第66天：验证禁用智能体被过滤且只返回启用研究工具。
  assert.equal(research[0]?.item.id, "tool:test-search"); // 第66天：验证显式能力声明命中的工具排序第一。
  assert.ok((research[0]?.score ?? 0) >= 100); // 第66天：验证能力声明完全匹配获得高相关度分数。
  assert.ok(research[0]?.reasons.some((reason) => reason.includes("能力声明命中"))); // 第66天：验证能力发现返回可解释命中原因。
  assert.equal(registry.discoverCapability("summary")[0]?.item.type, "model"); // 第66天：验证能力发现可以跨类型返回模型能力。
  registry.setEnabled("tool:test-search", false); // 第66天：禁用原本可发现的研究工具。
  assert.equal(registry.discoverCapability("research").length, 0); // 第66天：验证能力发现不会返回任何禁用注册项。
} // 第66天：结束统一能力发现测试。

function testLegacyRegistryAdapters(): void { // 第66天：验证 Agent、Tool、Model 和 Prompt 旧 API 接入统一注册中心且保持兼容。
  const registry = new UnifiedRegistry(); // 第66天：创建四类旧注册表共用的统一注册中心。
  const agents = new AgentRegistry(registry); // 第66天：使用新增可选参数创建兼容智能体注册表。
  agents.register({ id: "adapter-agent", name: "Adapter Agent", description: "验证智能体适配", capabilities: ["adapter-test"], systemPrompt: "测试", tools: ["adapter-tool"] }); // 第66天：通过旧 AgentRegistry API 注册测试智能体。
  assert.equal(agents.get("adapter-agent")?.id, "adapter-agent"); // 第66天：验证旧智能体读取 API 保持可用。
  assert.equal(registry.get("agent:adapter-agent")?.type, "agent"); // 第66天：验证智能体自动同步为统一注册项。
  agents.unregister("adapter-agent"); // 第66天：通过旧智能体注册表执行兼容注销。
  assert.equal(registry.get("agent:adapter-agent"), undefined); // 第66天：验证智能体注销同步删除统一注册项。
  const tools = new ToolRegistry(registry); // 第66天：使用新增可选参数创建兼容工具注册表。
  const adapterTool: Tool = { name: "adapter-tool", description: "验证工具适配", capabilities: ["adapter-test"], inputSchema: { input: "string" }, outputSchema: { output: "string" }, async execute() { return "ok"; } }; // 第66天：定义满足旧工具接口的最小测试工具。
  tools.register(adapterTool); // 第66天：通过旧 ToolRegistry API 注册测试工具。
  assert.equal(tools.get("adapter-tool"), adapterTool); // 第66天：验证旧工具读取 API 保持可用。
  assert.equal(registry.get("tool:adapter-tool")?.metadata.timeoutMs, 30_000); // 第66天：验证工具超时、Schema 和重试策略元数据已迁移。
  tools.unregister("adapter-tool"); // 第66天：通过旧工具注册表执行兼容注销。
  assert.equal(registry.get("tool:adapter-tool"), undefined); // 第66天：验证工具注销同步删除统一注册项。
  createDefaultModelRegistry(registry); // 第66天：通过旧模型工厂批量登记默认模型。
  assert.ok(registry.list("model").length >= 5); // 第66天：验证默认模型全部同步到统一注册中心。
  assert.ok(registry.list("model").every((model) => Boolean(model.metadata.provider) && Boolean(model.metadata.contextWindow))); // 第66天：验证模型提供方和上下文窗口元数据完整。
  createDefaultPromptRegistry(registry); // 第66天：通过旧提示词工厂登记默认多版本提示词。
  assert.ok(registry.list("prompt").length >= 10); // 第66天：验证提示词各组件版本全部同步到统一注册中心。
  assert.ok(registry.list("prompt").some((prompt) => !prompt.enabled && prompt.metadata.status === "archived")); // 第66天：验证归档提示词保留可见但不会参与能力发现。
  assert.ok(registry.list("prompt").some((prompt) => prompt.enabled && prompt.metadata.status === "active")); // 第66天：验证激活提示词被标记为可发现能力。
} // 第66天：结束四类旧注册表兼容适配测试。

function testDay66InventoryAndMetrics(): void { // 第66天：验证完整 Day66 能力目录、类型覆盖、发现结果和注册指标。
  const registry = createDay66UnifiedRegistry(); // 第66天：创建包含全部旧注册表和平台能力的统一目录。
  for (const type of ["agent", "tool", "model", "prompt", "memory", "workflow", "evaluation"] as const) assert.ok(registry.list(type).length > 0, `${type} 类型必须至少注册一项能力`); // 第66天：验证任务清单要求的七种能力类型全部完成注册。
  const discoveries = registry.discoverCapability("research capability"); // 第66天：在完整能力目录中发现研究能力提供者。
  assert.ok(discoveries.some((result) => result.item.type === "agent")); // 第66天：验证研究能力发现可以返回 Research Agent。
  assert.ok(discoveries.some((result) => result.item.type === "tool")); // 第66天：验证研究能力发现可以返回 Research Tool。
  assert.ok(discoveries.every((result) => result.item.enabled)); // 第66天：验证完整目录发现结果全部处于启用状态。
  const metrics = registry.getMetrics(); // 第66天：读取统一注册中心指标快照。
  assert.equal(metrics.totalItems, registry.list().length); // 第66天：验证总注册项指标与真实列表数量一致。
  assert.equal(metrics.enabledCount + metrics.disabledCount, metrics.totalItems); // 第66天：验证启用与禁用数量完整覆盖全部注册项。
  assert.equal(metrics.agentCount, registry.list("agent").length); // 第66天：验证智能体数量指标准确。
  assert.equal(metrics.toolCount, registry.list("tool").length); // 第66天：验证工具数量指标准确。
  assert.equal(metrics.modelCount, registry.list("model").length); // 第66天：验证模型数量指标准确。
  assert.equal(metrics.promptCount, registry.list("prompt").length); // 第66天：验证提示词数量指标准确。
  assert.ok(metrics.versionCount >= 3); // 第66天：验证统一注册中心能够观察多个不同版本。
  const modelSnapshot = createRegistrySnapshot({ type: "model", query: "summary", includeDisabled: false }); // 第66天：创建 Registry Explorer 模型过滤和摘要能力查询快照。
  assert.ok(modelSnapshot.items.length > 0 && modelSnapshot.items.every((entry) => entry.type === "model" && entry.enabled)); // 第66天：验证快照类型过滤和禁用项过滤同时生效。
  assert.ok(modelSnapshot.discoveries.some((result) => result.item.type === "model")); // 第66天：验证 Explorer 快照包含模型能力发现结果。
} // 第66天：结束完整能力目录和指标测试。

async function testDay66TitlesAndComments(): Promise<void> { // 第66天：验证浏览器标题、页面标题和新增任务代码逐行中文注释要求。
  const layout = await readFile("app/layout.tsx", "utf8"); // 第66天：读取根布局元数据源文件。
  const header = await readFile("app/components/Header.tsx", "utf8"); // 第66天：读取页面页头标题源文件。
  const sidebar = await readFile("app/components/KnowledgeSidebar.tsx", "utf8"); // 第66天：读取侧边栏标签页源文件。
  assert.ok(layout.includes("Day 67 - Production Prompt Platform") && layout.includes("生产级提示词平台")); // 第67天：验证继承统一注册中心后的浏览器标签页已升级为第67天生产提示词平台。
  assert.ok(header.includes(">67</span>") && header.includes("Production Prompt Platform") && header.includes("Production Upgrade V4")); // 第67天：验证页面日期徽标、主标题和生产化升级版本均已更新。
  assert.ok(sidebar.includes("Day 67") && sidebar.includes("RegistryExplorer") && sidebar.includes("提示V2")); // 第67天：验证控制台保留注册浏览器并默认突出生产提示词标签页。
  const commentedFiles = ["lib/registry/registry-types.ts", "lib/registry/unified-registry.ts", "lib/registry/registry-adapters.ts", "lib/registry/registry-runtime.ts", "app/api/registry/route.ts", "app/components/RegistryExplorer.tsx"]; // 第66天：列出本日新增且必须逐行包含中文注释的代码文件。
  for (const file of commentedFiles) { // 第66天：逐个检查第66天新增核心代码文件。
    const lines = (await readFile(file, "utf8")).split(/\r?\n/u); // 第66天：读取文件并按跨平台换行符拆分为代码行。
    const uncommented = lines.map((line, index) => ({ line, number: index + 1 })).filter(({ line }) => line.trim() && !/第66天|中文|能力|注册|统一/u.test(line)); // 第66天：找出既非空又不含任何中文任务注释提示的代码行。
    assert.deepEqual(uncommented, [], `${file} 存在缺少中文注释的代码行`); // 第66天：要求每一个新增代码行都保留可学习的中文说明。
  } // 第66天：结束新增核心代码文件逐行注释检查。
} // 第66天：结束标题和逐行中文注释测试。

async function main(): Promise<void> { // 第66天：定义串行执行全部统一注册中心测试的主函数。
  testRegistryProviderContract(); // 第66天：执行统一注册提供者核心契约测试。
  testCapabilityDiscovery(); // 第66天：执行跨类型能力发现与禁用过滤测试。
  testLegacyRegistryAdapters(); // 第66天：执行四类旧注册表兼容适配测试。
  testDay66InventoryAndMetrics(); // 第66天：执行完整能力目录、过滤和注册指标测试。
  await testDay66TitlesAndComments(); // 第66天：执行标题更新和逐行中文注释合规测试。
  console.log("Day66 Unified Registry 测试全部通过。"); // 第66天：输出便于命令行确认的测试结论。
} // 第66天：结束统一注册中心自动化测试主函数。

void main(); // 第66天：启动测试并让断言失败自然终止进程。
