import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; // 第66天：引入默认智能体注册表工厂验证 AgentRegistry 适配器。
import { createDefaultModelRegistry } from "@/lib/model/default-models"; // 第66天：引入默认模型注册表工厂验证 ModelRegistry 适配器。
import { createDefaultPromptRegistry } from "@/lib/prompts/default-prompts"; // 第66天：引入默认提示词注册表工厂验证 PromptRegistry 适配器。
import { REGISTRY_ITEM_TYPES, type RegistryItemType, type RegistrySnapshot } from "@/lib/registry/registry-types"; // 第66天：引入注册类型常量、过滤类型和快照类型。
import { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第66天：引入统一注册中心内存实现。
import { createWorkflowToolRegistry } from "@/lib/workflow/workflow-tools"; // 第66天：引入默认工作流工具注册表工厂验证 ToolRegistry 适配器。

const DAY66_CREATED_AT = Date.UTC(2026, 6, 14, 0, 0, 0); // 第66天：定义其他系统能力使用的稳定教学创建时间戳。

export function isRegistryItemType(value: string | null): value is RegistryItemType { // 第66天：定义接口查询参数到注册项类型的安全收窄函数。
  return Boolean(value && REGISTRY_ITEM_TYPES.includes(value as RegistryItemType)); // 第66天：只接受任务清单声明的七种注册类型。
} // 第66天：结束注册项类型安全收窄函数。

export function createDay66UnifiedRegistry(): UnifiedRegistry { // 第66天：创建包含旧注册表和平台能力的完整统一注册中心。
  const registry = new UnifiedRegistry(); // 第66天：创建空的内存统一注册中心。
  createDefaultAgentRegistry(registry); // 第66天：通过兼容 AgentRegistry 把全部默认智能体同步进统一注册中心。
  createWorkflowToolRegistry(registry); // 第66天：通过兼容 ToolRegistry 把全部工作流工具同步进统一注册中心。
  createDefaultModelRegistry(registry); // 第66天：通过兼容 ModelRegistry 把全部默认模型同步进统一注册中心。
  createDefaultPromptRegistry(registry); // 第66天：通过兼容 PromptRegistry 把全部提示词版本同步进统一注册中心。
  registry.register({ id: "memory:long-term-memory", name: "Long-term Memory（长期记忆）", type: "memory", version: "1.0.0", metadata: { description: "支持经验提取、综合检索、整合和衰减的长期记忆能力", capabilities: ["memory", "experience-extraction", "memory-retrieval"], tags: ["memory", "long-term"] }, enabled: true, createdAt: DAY66_CREATED_AT }); // 第66天：注册继承自第49天的长期记忆平台能力。
  registry.register({ id: "workflow:dag-runtime", name: "DAG Workflow Runtime（有向无环图工作流运行时）", type: "workflow", version: "1.0.0", metadata: { description: "支持计划、依赖执行、暂停恢复和工具编排的工作流能力", capabilities: ["workflow", "planning", "orchestration"], tags: ["workflow", "dag"] }, enabled: true, createdAt: DAY66_CREATED_AT }); // 第66天：注册继承自历史任务的工作流编排平台能力。
  registry.register({ id: "evaluation:quality-gate", name: "Evaluation Quality Gate（评估质量门禁）", type: "evaluation", version: "1.0.0", metadata: { description: "支持回归评估、坏案例管理和质量门禁的评估能力", capabilities: ["evaluation", "regression", "quality-gate"], tags: ["evaluation", "quality"] }, enabled: true, createdAt: DAY66_CREATED_AT }); // 第66天：注册继承自第46天的评估与质量门禁平台能力。
  return registry; // 第66天：返回已完成全部能力迁移的统一注册中心。
} // 第66天：结束完整统一注册中心工厂函数。

export function createRegistrySnapshot(input: { type?: RegistryItemType; query?: string; includeDisabled?: boolean } = {}): RegistrySnapshot { // 第66天：定义 Registry Explorer 和接口共用的快照生成函数。
  const registry = createDay66UnifiedRegistry(); // 第66天：为当前请求构建隔离且确定性的统一注册中心。
  const query = input.query?.trim() ?? ""; // 第66天：标准化可选能力发现查询词。
  const includeDisabled = input.includeDisabled ?? true; // 第66天：默认在浏览器中展示禁用版本以观察完整能力库存。
  const items = registry.list(input.type).filter((item) => includeDisabled || item.enabled); // 第66天：按类型和禁用项开关筛选可展示注册项。
  return { items, discoveries: query ? registry.discoverCapability(query, input.type) : [], metrics: registry.getMetrics(), filters: { type: input.type ?? "all", query, includeDisabled }, generatedAt: Date.now() }; // 第66天：返回列表、发现结果、全局指标、过滤条件和生成时间。
} // 第66天：结束统一注册中心快照生成函数。
