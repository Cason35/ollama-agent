import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第54天：引入旧版 PromptTemplate，用于把 active 版本迁移成 system block。 */
import type { PromptBlock } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入 PromptBlock 类型，定义默认提示词块集合。 */
import { PromptBlockRegistry } from "@/lib/prompts/prompt-block-registry"; /* 第54天：引入 PromptBlockRegistry 注册默认块。 */
import { extractTemplateVariables } from "@/lib/prompts/prompt-renderer"; /* 第54天：复用模板变量提取器，为 system block 自动声明变量。 */
const DEFAULT_BLOCKS: PromptBlock[] = [ /* 第54天：定义全局默认 PromptBlock 列表。 */
  { id: "system.runtime-role", name: "Runtime Role", type: "system", order: 5, enabled: true, template: "你正在使用 Day54 Prompt Composition（提示词组合）运行时。", requiredVariables: [], description: "提供组合式提示词运行时的系统身份说明。" }, /* 第54天：注册通用系统身份块。 */
  { id: "memory.context", name: "Memory Context", type: "memory", order: 20, enabled: true, template: "长期记忆：{{memory}}", requiredVariables: ["memory"], skipIfMissing: true, description: "当存在记忆上下文时注入 Memory Block。" }, /* 第54天：注册可条件跳过的记忆块。 */
  { id: "memory.context.v2", name: "Memory Context V2", type: "memory", order: 20, enabled: true, template: "长期记忆摘要：{{memory}}\n请只吸收与当前任务直接相关的事实。", requiredVariables: ["memory"], skipIfMissing: true, description: "用于 Block Diff 演示的增强版记忆块。" }, /* 第54天：注册增强版记忆块，用于展示 Block Diff。 */
  { id: "workspace.context", name: "Workspace Context", type: "workspace", order: 30, enabled: true, template: "共享工作空间：{{workspace}}", requiredVariables: ["workspace"], skipIfMissing: true, description: "当存在共享工作空间时注入 Workspace Block。" }, /* 第54天：注册可条件跳过的工作空间块。 */
  { id: "tool.context", name: "Tool Context", type: "tool", order: 40, enabled: true, template: "可用工具：{{tools}}", requiredVariables: ["tools"], skipIfMissing: true, description: "当 Agent 声明工具时注入 Tool Block。" }, /* 第54天：注册可条件跳过的工具块。 */
  { id: "task.goal", name: "Task Goal", type: "task", order: 50, enabled: true, template: "当前任务：{{task}}", requiredVariables: ["task"], skipIfMissing: false, description: "注入当前用户任务，是组合提示词的核心任务块。" }, /* 第54天：注册任务块，缺少 task 时不自动跳过。 */
  { id: "output.format", name: "Output Format", type: "output", order: 60, enabled: true, template: "输出要求：先给结论，再给依据、风险和下一步。", requiredVariables: [], description: "约束最终回答结构，降低 Agent 输出漂移。" }, /* 第54天：注册输出格式块。 */
]; /* 第54天：结束全局默认 PromptBlock 列表。 */
function activePromptBlock(componentId: string, prompt: PromptTemplate | null, fallback: string): PromptBlock { /* 第54天：定义把 active PromptTemplate 包装成 system block 的函数。 */
  const template = prompt?.template?.trim() || fallback; /* 第54天：优先使用注册表 active 模板，缺失时使用旧系统提示词兜底。 */
  return { id: `${componentId}.active-system`, name: `${componentId} Active Prompt`, type: "system", componentId, order: 10, enabled: true, template, requiredVariables: extractTemplateVariables(template), skipIfMissing: false, sourcePromptId: prompt?.id, description: "由当前 active Prompt Version 派生的系统块。" }; /* 第54天：返回可被 PromptBuilder 组合的系统块。 */
} /* 第54天：结束 active PromptTemplate 包装函数。 */
export function createDefaultPromptBlockRegistry(): PromptBlockRegistry { /* 第54天：定义创建默认提示词块注册表的工厂函数。 */
  const registry = new PromptBlockRegistry(); /* 第54天：创建空的提示词块注册表。 */
  DEFAULT_BLOCKS.forEach((block) => registry.register(block)); /* 第54天：逐个注册默认提示词块。 */
  return registry; /* 第54天：返回已初始化完成的提示词块注册表。 */
} /* 第54天：结束默认提示词块注册表工厂函数。 */
export function buildRuntimePromptBlocks(componentId: string, prompt: PromptTemplate | null, fallback: string, registry: PromptBlockRegistry = promptBlockRegistry): PromptBlock[] { /* 第54天：定义 Agent Runtime 生成组合块列表的入口。 */
  const contextBlocks = registry.list(componentId).filter((block) => block.id !== "system.runtime-role" && block.id !== "memory.context.v2"); /* 第54天：读取通用上下文块，并排除只用于 Diff 展示的 v2 记忆块。 */
  return [activePromptBlock(componentId, prompt, fallback), ...contextBlocks.filter((block) => block.type !== "system")]; /* 第54天：把 active system block 放在首位，再拼接上下文、任务和输出块。 */
} /* 第54天：结束 Agent Runtime 组合块列表入口。 */
export const promptBlockRegistry = createDefaultPromptBlockRegistry(); /* 第54天：导出进程内共享 PromptBlockRegistry 单例。 */
