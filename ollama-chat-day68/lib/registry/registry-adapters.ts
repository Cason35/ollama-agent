import type { Agent } from "@/lib/agents/agent-types"; // 第66天：引入旧 AgentRegistry 管理的智能体业务类型。
import type { ModelProfile } from "@/lib/model/model-profile-types"; // 第66天：引入旧 ModelRegistry 管理的模型档案类型。
import type { PromptTemplate } from "@/lib/prompts/prompt-types"; // 第66天：引入旧 PromptRegistry 管理的提示词版本类型。
import type { ProductionPrompt } from "@/lib/prompts/production-prompt-types"; // 第67天：引入生产提示词资产类型以深化统一注册集成。
import type { RegistryItem } from "@/lib/registry/registry-types"; // 第66天：引入适配器需要生成的统一注册项类型。
import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第66天：引入统一注册中心类型用于兼容同步。
import type { Tool } from "@/lib/tools/tool-registry"; // 第66天：只引入旧 ToolRegistry 工具类型以避免适配器产生运行时循环依赖。

const DAY66_CREATED_AT = Date.UTC(2026, 6, 14, 0, 0, 0); // 第66天：使用固定教学时间戳保证注册快照和测试输出稳定。

export function agentRegistryItemId(agentId: string): string { // 第66天：定义智能体在统一命名空间中的稳定标识生成函数。
  return `agent:${agentId}`; // 第66天：使用类型前缀避免不同旧注册表出现同名冲突。
} // 第66天：结束智能体统一标识生成函数。

export function toolRegistryItemId(toolName: string): string { // 第66天：定义工具在统一命名空间中的稳定标识生成函数。
  return `tool:${toolName}`; // 第66天：使用工具类型前缀构建跨类型唯一标识。
} // 第66天：结束工具统一标识生成函数。

export function modelRegistryItemId(modelId: string): string { // 第66天：定义模型在统一命名空间中的稳定标识生成函数。
  return `model:${modelId}`; // 第66天：使用模型类型前缀构建跨类型唯一标识。
} // 第66天：结束模型统一标识生成函数。

export function promptRegistryItemId(prompt: Pick<PromptTemplate, "componentId" | "version">): string { // 第66天：定义提示词组件版本的稳定统一标识生成函数。
  return `prompt:${prompt.componentId}@${prompt.version}`; // 第66天：把组件和版本都纳入标识以支持同组件多版本共存。
} // 第66天：结束提示词统一标识生成函数。

export function productionPromptRegistryItemId(prompt: Pick<ProductionPrompt, "agentId" | "id" | "version">): string { // 第67天：定义生产提示词版本的稳定统一注册标识。
  return `prompt:${prompt.agentId ?? prompt.id}@${prompt.version}`; // 第67天：把关联智能体和独立版本纳入统一命名空间。
} // 第67天：结束生产提示词统一标识生成函数。

export function agentToRegistryItem(agent: Agent): RegistryItem { // 第66天：把旧智能体业务对象适配为统一注册项。
  return { id: agentRegistryItemId(agent.id), name: agent.name, type: "agent", version: "1.0.0", metadata: { description: agent.description, capabilities: [...agent.capabilities], tools: [...agent.tools], tags: ["agent", ...agent.capabilities] }, enabled: true, createdAt: DAY66_CREATED_AT }; // 第66天：保留智能体描述、能力、工具和标签元数据。
} // 第66天：结束智能体注册项适配函数。

export function toolToRegistryItem(tool: Tool): RegistryItem { // 第66天：把旧工具业务对象适配为统一注册项。
  return { id: toolRegistryItemId(tool.name), name: tool.name, type: "tool", version: "1.0.0", metadata: { description: tool.description, capabilities: [...(tool.capabilities ?? [])], tags: ["tool", ...(tool.capabilities ?? [])], dependencies: [...(tool.dependencies ?? [])], inputSchema: tool.inputSchema ?? {}, outputSchema: tool.outputSchema ?? {}, timeoutMs: 30_000, retryPolicy: { maxRetries: 1, strategy: "fixed" } }, enabled: true, createdAt: DAY66_CREATED_AT }; // 第66天：保留工具结构、依赖、三十秒沙箱和固定重试策略元数据。
} // 第66天：结束工具注册项适配函数。

export function modelToRegistryItem(model: ModelProfile): RegistryItem { // 第66天：把旧模型档案适配为统一注册项。
  return { id: modelRegistryItemId(model.id), name: model.name, type: "model", version: "1.0.0", metadata: { description: `${model.provider} 提供的 ${model.model} 逻辑模型`, provider: model.provider, model: model.model, capabilities: [...model.capabilities], tags: ["model", model.provider, ...model.capabilities], roles: [...model.roles], contextWindow: model.limits.contextWindow, maxOutputTokens: model.limits.maxOutputTokens, cost: { ...model.cost }, latency: model.speed, healthStatus: "healthy", fallbackModelIds: [...(model.fallbackModelIds ?? [])] }, enabled: true, createdAt: DAY66_CREATED_AT }; // 第66天：保留模型提供方、能力、成本、延迟、健康和降级链元数据。
} // 第66天：结束模型注册项适配函数。

export function promptToRegistryItem(prompt: PromptTemplate): RegistryItem { // 第66天：把旧提示词版本适配为统一注册项。
  return { id: promptRegistryItemId(prompt), name: prompt.name, type: "prompt", version: prompt.version, metadata: { description: `${prompt.componentId} 的 ${prompt.version} 提示词版本`, componentId: prompt.componentId, componentType: prompt.componentType, capabilities: [prompt.componentId, prompt.componentType], tags: ["prompt", prompt.componentId, prompt.status], status: prompt.status, variables: [...prompt.variables], source: prompt.source, score: prompt.score, costEstimate: prompt.costEstimate }, enabled: prompt.status === "active", createdAt: prompt.createdAt }; // 第66天：保留提示词组件、状态、变量、来源、评分和成本元数据。
} // 第66天：结束提示词注册项适配函数。

export function productionPromptToRegistryItem(prompt: ProductionPrompt): RegistryItem { // 第67天：把生产提示词资产适配为统一注册项。
  return { id: productionPromptRegistryItemId(prompt), name: prompt.name, type: "prompt", version: prompt.version, metadata: { description: `${prompt.agentId ?? "通用"} 智能体的生产提示词 ${prompt.version}`, promptId: prompt.id, agentId: prompt.agentId, capabilities: [...prompt.capabilities], tags: ["prompt", "production", prompt.agentId ?? "shared", prompt.status, prompt.strategy], status: prompt.status, strategy: prompt.strategy, blockIds: prompt.blocks.map((block) => block.id), blocks: prompt.blocks.length }, enabled: prompt.status === "active", createdAt: prompt.createdAt }; // 第67天：保留智能体、能力、策略、块和生命周期元数据并让状态与 enabled 一致。
} // 第67天：结束生产提示词注册项适配函数。

export function syncAgentToUnifiedRegistry(agent: Agent, registry?: UnifiedRegistry): void { // 第66天：定义旧 AgentRegistry 写操作的可选同步入口。
  registry?.upsert(agentToRegistryItem(agent)); // 第66天：存在统一注册中心时新增或更新智能体注册项。
} // 第66天：结束智能体注册同步入口。

export function syncToolToUnifiedRegistry(tool: Tool, registry?: UnifiedRegistry): void { // 第66天：定义旧 ToolRegistry 写操作的可选同步入口。
  registry?.upsert(toolToRegistryItem(tool)); // 第66天：存在统一注册中心时新增或更新工具注册项。
} // 第66天：结束工具注册同步入口。

export function syncModelToUnifiedRegistry(model: ModelProfile, registry?: UnifiedRegistry): void { // 第66天：定义旧 ModelRegistry 写操作的可选同步入口。
  registry?.upsert(modelToRegistryItem(model)); // 第66天：存在统一注册中心时新增或更新模型注册项。
} // 第66天：结束模型注册同步入口。

export function syncPromptToUnifiedRegistry(prompt: PromptTemplate, registry?: UnifiedRegistry): void { // 第66天：定义旧 PromptRegistry 生命周期变化的可选同步入口。
  registry?.upsert(promptToRegistryItem(prompt)); // 第66天：存在统一注册中心时新增或更新提示词版本注册项。
} // 第66天：结束提示词注册同步入口。

export function syncProductionPromptToUnifiedRegistry(prompt: ProductionPrompt, registry?: UnifiedRegistry): void { // 第67天：定义生产提示词版本和生命周期状态的统一注册同步入口。
  registry?.upsert(productionPromptToRegistryItem(prompt)); // 第67天：存在统一注册中心时新增或覆盖生产提示词注册项。
} // 第67天：结束生产提示词统一注册同步入口。
