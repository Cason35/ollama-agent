import type { PromptBlock, PromptBlockType } from "@/lib/prompts/prompt-block-types"; // 第67天：引入生产提示词默认块所需类型。
import { PromptRegistry } from "@/lib/prompts/prompt-registry"; // 第67天：引入已深化生产能力的提示词注册表。
import type { ProductionPrompt, ProductionPromptStatus } from "@/lib/prompts/production-prompt-types"; // 第67天：引入生产提示词资产和状态类型。
import type { PromptStrategy } from "@/lib/prompts/prompt-optimization-types"; // 第67天：引入生产提示词默认策略类型。

const DAY67_CREATED_AT = Date.UTC(2026, 6, 15, 0, 0, 0); // 第67天：使用固定教学时间戳保证快照和自动化测试稳定。

function createBlock(id: string, name: string, type: PromptBlockType, order: number, weight: number, template: string, requiredVariables: string[] = [], enabled = true): PromptBlock { // 第67天：定义生产提示词块创建助手。
  return { id, name, type, order, weight, template, requiredVariables, enabled, skipIfMissing: ["memory", "workspace", "knowledge", "citation"].includes(type) }; // 第67天：返回包含顺序、权重、条件变量和跳过策略的提示词块。
} // 第67天：结束生产提示词块创建助手。

function sharedContextBlocks(prefix: string): PromptBlock[] { // 第67天：定义从 RuntimeContext 统一读取上下文的共享块集合。
  return [ // 第67天：开始构建记忆、工作区、知识、策略、意图和任务块。
    createBlock(`${prefix}.memory`, "Memory Context", "memory", 20, 80, "长期记忆：{{memory}}", ["memory"]), // 第67天：从统一运行时上下文读取 Memory 信息。
    createBlock(`${prefix}.workspace`, "Workspace Context", "workspace", 30, 75, "共享工作空间：{{workspace}}", ["workspace"]), // 第67天：从统一运行时上下文读取 Workspace 信息。
    createBlock(`${prefix}.knowledge`, "Knowledge Context", "knowledge", 40, 70, "知识上下文：{{knowledge}}", ["knowledge"]), // 第67天：从统一运行时上下文读取 Knowledge 信息。
    createBlock(`${prefix}.strategy`, "Runtime Strategy", "system", 45, 65, "运行策略：{{strategy}}", ["strategy"]), // 第67天：从统一运行时上下文读取运行策略。
    createBlock(`${prefix}.intent`, "User Intent", "task", 50, 95, "用户意图：{{userIntent}}", ["userIntent"]), // 第67天：从统一运行时上下文读取用户意图。
    createBlock(`${prefix}.task`, "Task Goal", "task", 60, 100, "当前任务：{{task}}", ["task"]), // 第67天：从统一运行时上下文读取当前任务。
  ]; // 第67天：结束共享运行时上下文块集合。
} // 第67天：结束共享运行时上下文块创建函数。

function createProductionPrompt(input: { id: string; name: string; version: string; agentId: string; strategy: PromptStrategy; status: ProductionPromptStatus; capabilities: string[]; blocks: PromptBlock[]; offset: number }): ProductionPrompt { // 第67天：定义稳定创建生产提示词版本的助手。
  return { id: input.id, name: input.name, version: input.version, agentId: input.agentId, strategy: input.strategy, status: input.status, capabilities: [...input.capabilities], blocks: input.blocks, createdAt: DAY67_CREATED_AT + input.offset, updatedAt: DAY67_CREATED_AT + input.offset }; // 第67天：补齐版本、状态、能力和稳定时间戳后返回生产提示词。
} // 第67天：结束生产提示词版本创建助手。

export const DEFAULT_PRODUCTION_PROMPTS: ProductionPrompt[] = [ // 第67天：定义 Research、Writer 和 Critic 三类智能体的生产提示词版本。
  createProductionPrompt({ id: "research.v1", name: "Research Agent 生产研究提示词 V1", version: "v1", agentId: "research", strategy: "quality", status: "active", capabilities: ["research", "knowledge", "citation"], offset: 1, blocks: [createBlock("research.v1.role", "Research Role", "system", 10, 100, "你是 Research Agent（研究智能体），负责检索、验证和整理证据。"), ...sharedContextBlocks("research.v1"), createBlock("research.v1.citation", "Citation Requirements", "citation", 70, 90, "引用要求：关键结论必须标注知识来源 {{citations}}。", ["citations"]), createBlock("research.v1.output", "Research Output", "output", 90, 85, "输出结论、证据、风险和下一步，确保内容正确且相关。") ] }), // 第67天：注册任务要求的 research.v1 启用版本。
  createProductionPrompt({ id: "research.v2", name: "Research Agent 深度研究提示词 V2", version: "v2", agentId: "research", strategy: "quality", status: "testing", capabilities: ["research", "knowledge", "citation", "reflection"], offset: 2, blocks: [createBlock("research.v2.role", "Research Role", "system", 10, 100, "你是 Research Agent（研究智能体），负责多源检索、交叉验证、引用和不确定性分析。"), ...sharedContextBlocks("research.v2"), createBlock("research.v2.citation", "Citation Requirements", "citation", 70, 95, "引用要求：为每个关键结论提供来源 {{citations}}，并区分事实与推断。", ["citations"]), createBlock("research.v2.reflection", "Research Reflection", "reflection", 80, 88, "交付前检查证据覆盖度、冲突来源、遗漏风险和可复现步骤。"), createBlock("research.v2.output", "Research Output", "output", 90, 90, "输出研究结论、证据矩阵、风险、置信度和下一步。") ] }), // 第67天：注册可参与通用实验的 research.v2 测试版本。
  createProductionPrompt({ id: "writer.v1", name: "Writer Agent 快速写作提示词 V1", version: "v1", agentId: "writer", strategy: "fast", status: "deprecated", capabilities: ["writing", "summary"], offset: 3, blocks: [createBlock("writer.v1.role", "Writer Role", "system", 10, 100, "你是 Writer Agent（写作智能体），负责生成简短总结。"), createBlock("writer.v1.task", "Task Goal", "task", 60, 100, "当前任务：{{task}}", ["task"]), createBlock("writer.v1.output", "Writer Output", "output", 90, 60, "输出简短、可读的最终回答。") ] }), // 第67天：保留可回滚但默认禁用的 writer.v1 历史版本。
  createProductionPrompt({ id: "writer.v2", name: "Writer Agent 生产写作提示词 V2", version: "v2", agentId: "writer", strategy: "balanced", status: "active", capabilities: ["writing", "summary", "workspace"], offset: 4, blocks: [createBlock("writer.v2.role", "Writer Role", "system", 10, 100, "你是 Writer Agent（写作智能体），负责把上游材料整理为清晰、准确、可执行的回答。"), ...sharedContextBlocks("writer.v2"), createBlock("writer.v2.output", "Writer Output", "output", 90, 88, "输出结论、依据、风险和下一步，保持与用户意图高度相关。") ] }), // 第67天：注册任务要求的 writer.v2 启用版本。
  createProductionPrompt({ id: "writer.v3", name: "Writer Agent 质量晋级提示词 V3", version: "v3", agentId: "writer", strategy: "quality", status: "approved", capabilities: ["writing", "summary", "workspace", "reflection"], offset: 5, blocks: [createBlock("writer.v3.role", "Writer Role", "system", 10, 100, "你是 Writer Agent（写作智能体），负责生成可直接发布、事实可靠且结构完整的回答。"), ...sharedContextBlocks("writer.v3"), createBlock("writer.v3.reflection", "Writer Reflection", "reflection", 80, 92, "交付前检查正确性、相关性、证据、风险和行动项，不得遗漏高优先级要求。"), createBlock("writer.v3.output", "Writer Output", "output", 90, 95, "输出执行摘要、关键依据、风险、回滚预案和下一步。") ] }), // 第67天：注册已批准且可通过质量门禁晋级的 writer.v3 版本。
  createProductionPrompt({ id: "critic.v1", name: "Critic Agent 生产审查提示词 V1", version: "v1", agentId: "critic", strategy: "balanced", status: "active", capabilities: ["critique", "evaluation", "risk"], offset: 6, blocks: [createBlock("critic.v1.role", "Critic Role", "system", 10, 100, "你是 Critic Agent（审查智能体），负责发现遗漏、错误假设和高风险问题。"), ...sharedContextBlocks("critic.v1"), createBlock("critic.v1.evaluation", "Critic Rubric", "evaluation", 75, 90, "从正确性、相关性、完整性、证据和安全性五个维度审查。"), createBlock("critic.v1.output", "Critic Output", "output", 90, 88, "输出问题、严重度、证据、修复建议和是否允许发布。") ] }), // 第67天：注册任务要求的 critic.v1 启用版本。
  createProductionPrompt({ id: "critic.v2", name: "Critic Agent 低成本审查提示词 V2", version: "v2", agentId: "critic", strategy: "fast", status: "testing", capabilities: ["critique"], offset: 7, blocks: [createBlock("critic.v2.role", "Critic Role", "system", 10, 100, "你是 Critic Agent（审查智能体），请快速指出一个问题。"), createBlock("critic.v2.task", "Task Goal", "task", 60, 100, "当前任务：{{task}}", ["task"]), createBlock("critic.v2.output", "Critic Output", "output", 90, 55, "只输出一句审查意见。") ] }), // 第67天：注册用于验证质量门禁阻断能力的 critic.v2 测试版本。
]; // 第67天：结束默认生产提示词版本集合。

export function registerDefaultProductionPrompts(registry: PromptRegistry): PromptRegistry { // 第67天：定义把默认生产提示词注册到深化版 PromptRegistry 的函数。
  DEFAULT_PRODUCTION_PROMPTS.forEach((prompt) => registry.registerProduction(prompt)); // 第67天：逐版本注册并同步到 UnifiedRegistry。
  return registry; // 第67天：返回已完成生产化注册的提示词注册表。
} // 第67天：结束默认生产提示词注册函数。
