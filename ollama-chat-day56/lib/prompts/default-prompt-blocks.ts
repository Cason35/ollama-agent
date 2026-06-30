import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第54天：引入旧版 PromptTemplate，用于把 active 版本迁移成 system block。 */
import type { PromptBlock } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入 PromptBlock 类型，定义默认提示词块集合。 */
import { PromptBlockRegistry } from "@/lib/prompts/prompt-block-registry"; /* 第54天：引入 PromptBlockRegistry 注册默认块。 */
import { extractTemplateVariables } from "@/lib/prompts/prompt-renderer"; /* 第54天：复用模板变量提取器，为 system block 自动声明变量。 */
const DEFAULT_BLOCKS: PromptBlock[] = [ /* 第55天：定义全局默认 PromptBlock 列表，并加入动态优化所需的权重与新块。 */
  { id: "system.runtime-role", name: "Runtime Role", type: "system", order: 5, weight: 100, enabled: true, template: "你正在使用 Day55 Dynamic Prompt Optimization（动态提示词优化）运行时。", requiredVariables: [], description: "提供动态提示词优化运行时的系统身份说明。" }, /* 第55天：注册通用系统身份块。 */
  { id: "memory.context", name: "Memory Context", type: "memory", order: 20, weight: 82, enabled: true, template: "长期记忆：{{memory}}", requiredVariables: ["memory"], skipIfMissing: true, description: "当存在记忆上下文时注入 Memory Block。" }, /* 第55天：注册可由优化器动态启用或跳过的记忆块。 */
  { id: "memory.context.v2", name: "Memory Context V2", type: "memory", order: 21, weight: 84, enabled: true, template: "长期记忆摘要：{{memory}}\n请只吸收与当前任务直接相关的事实。", requiredVariables: ["memory"], skipIfMissing: true, description: "用于 Block Diff 演示的增强版记忆块。" }, /* 第55天：注册增强版记忆块，用于展示 Block Diff 和权重变化。 */
  { id: "workspace.context", name: "Workspace Context", type: "workspace", order: 30, weight: 74, enabled: true, template: "共享工作空间：{{workspace}}", requiredVariables: ["workspace"], skipIfMissing: true, description: "当存在共享工作空间时注入 Workspace Block。" }, /* 第55天：注册可由优化器按 hasWorkspace 决策的工作空间块。 */
  { id: "knowledge.context", name: "Knowledge Context", type: "knowledge", order: 35, weight: 68, enabled: true, template: "知识库证据：{{knowledge}}", requiredVariables: ["knowledge"], skipIfMissing: true, description: "当任务需要知识库证据时注入 Knowledge Block。" }, /* 第55天：注册知识块，用于研究和高质量策略。 */
  { id: "tool.context", name: "Tool Context", type: "tool", order: 40, weight: 62, enabled: true, template: "可用工具：{{tools}}", requiredVariables: ["tools"], skipIfMissing: true, description: "当 Agent 声明工具时注入 Tool Block。" }, /* 第55天：注册工具块，供动态优化时保留真实可用工具。 */
  { id: "citation.requirements", name: "Citation Requirements", type: "citation", order: 45, weight: 58, enabled: false, template: "引用要求：回答中必须给出关键依据；可用来源：{{citations}}", requiredVariables: ["citations"], skipIfMissing: true, description: "当任务要求引用时注入 Citation Block。" }, /* 第55天：注册引用块，默认关闭并由 requiresCitation 或评估弱点开启。 */
  { id: "task.goal", name: "Task Goal", type: "task", order: 50, weight: 54, enabled: true, template: "当前任务：{{task}}", requiredVariables: ["task"], skipIfMissing: false, description: "注入当前用户任务，是组合提示词的核心任务块。" }, /* 第55天：注册任务块，缺少 task 时不自动跳过。 */
  { id: "reflection.checklist", name: "Reflection Checklist", type: "reflection", order: 55, weight: 46, enabled: false, template: "反思要求：在最终回答前检查完整性、事实依据、遗漏风险和下一步行动。", requiredVariables: [], description: "当任务复杂或策略偏质量时注入 Reflection Block。" }, /* 第55天：注册反思块，默认关闭以避免快速策略成本过高。 */
  { id: "evaluation.rubric", name: "Evaluation Rubric", type: "evaluation", order: 57, weight: 44, enabled: false, template: "评估标准：从完整性、正确性、相关性、覆盖度四个维度检查输出质量。", requiredVariables: [], description: "当任务类型为 evaluation 时注入评估标准块。" }, /* 第55天：注册评估块，让评估任务有明确质量维度。 */
  { id: "output.schema-json", name: "JSON Output Schema", type: "schema", order: 62, weight: 38, enabled: false, template: "结构化输出：请返回 JSON，字段包含 summary、evidence、risks、nextSteps。", requiredVariables: [], description: "当任务要求 JSON 时注入输出结构块。" }, /* 第55天：注册 JSON 结构块，默认关闭并由 requiresJson 开启。 */
  { id: "output.format", name: "Output Format", type: "output", order: 65, weight: 34, enabled: true, template: "输出要求：先给结论，再给依据、风险和下一步。", requiredVariables: [], description: "约束最终回答结构，降低 Agent 输出漂移。" }, /* 第55天：注册输出格式块，作为所有策略的兜底输出约束。 */
]; /* 第54天：结束全局默认 PromptBlock 列表。 */
function activePromptBlock(componentId: string, prompt: PromptTemplate | null, fallback: string): PromptBlock { /* 第54天：定义把 active PromptTemplate 包装成 system block 的函数。 */
  const template = prompt?.template?.trim() || fallback; /* 第54天：优先使用注册表 active 模板，缺失时使用旧系统提示词兜底。 */
  return { id: `${componentId}.active-system`, name: `${componentId} Active Prompt`, type: "system", componentId, order: 10, weight: 96, enabled: true, template, requiredVariables: extractTemplateVariables(template), skipIfMissing: false, sourcePromptId: prompt?.id, description: "由当前 active Prompt Version 派生的系统块。" }; /* 第55天：返回可被 PromptBuilder 组合且带权重的系统块。 */
} /* 第54天：结束 active PromptTemplate 包装函数。 */
export function createDefaultPromptBlockRegistry(): PromptBlockRegistry { /* 第54天：定义创建默认提示词块注册表的工厂函数。 */
  const registry = new PromptBlockRegistry(); /* 第54天：创建空的提示词块注册表。 */
  DEFAULT_BLOCKS.forEach((block) => registry.register(block)); /* 第54天：逐个注册默认提示词块。 */
  return registry; /* 第54天：返回已初始化完成的提示词块注册表。 */
} /* 第54天：结束默认提示词块注册表工厂函数。 */
export function buildRuntimePromptBlocks(componentId: string, prompt: PromptTemplate | null, fallback: string, registry: PromptBlockRegistry = promptBlockRegistry): PromptBlock[] { /* 第54天：定义 Agent Runtime 生成组合块列表的入口。 */
  const contextBlocks = registry.list(componentId).filter((block) => block.id !== "system.runtime-role" && block.id !== "memory.context.v2"); /* 第55天：读取通用上下文块，并排除只用于 Diff 展示的 v2 记忆块。 */
  return [activePromptBlock(componentId, prompt, fallback), ...contextBlocks.filter((block) => block.type !== "system")]; /* 第54天：把 active system block 放在首位，再拼接上下文、任务和输出块。 */
} /* 第54天：结束 Agent Runtime 组合块列表入口。 */
export const promptBlockRegistry = createDefaultPromptBlockRegistry(); /* 第54天：导出进程内共享 PromptBlockRegistry 单例。 */
