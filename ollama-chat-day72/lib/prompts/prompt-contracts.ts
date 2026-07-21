import type { PromptComponentType, PromptMutationInput, PromptTemplate, PromptValidationIssue, PromptValidationResult, PromptVariableContract } from "@/lib/prompts/prompt-types"; /* 第52天增强：引入提示词契约、模板和校验相关类型。 */
import { extractTemplateVariables } from "@/lib/prompts/prompt-renderer"; /* 第52天增强：复用模板变量提取函数，避免校验器和渲染器规则不一致。 */

const COMMON_OPTIONAL_VARIABLES = ["memory", "workspace", "tools", "agentId", "output", "threshold", "agents"]; /* 第52天增强：定义大多数组件可选使用的通用上下文变量。 */

export const promptVariableContracts: PromptVariableContract[] = [ /* 第52天增强：定义项目内置组件的 Prompt Contract（提示词变量契约）。 */
  { componentId: "supervisor", componentType: "supervisor", requiredVariables: ["task", "agents"], optionalVariables: ["memory", "workspace", "tools"], description: "Supervisor（调度器）必须知道用户任务和可用 Agent 列表。" }, /* 第52天增强：定义调度器提示词变量契约。 */
  { componentId: "research", componentType: "agent", requiredVariables: ["task"], optionalVariables: ["tools", "memory", "workspace", "agentId"], description: "Research Agent（研究智能体）必须拿到任务，工具、记忆和工作空间是可选上下文但变量名不能拼错。" }, /* 第52天增强：定义研究智能体提示词变量契约。 */
  { componentId: "planner", componentType: "agent", requiredVariables: ["task"], optionalVariables: ["workspace", "tools", "memory", "agentId"], description: "Planner Agent（规划智能体）必须拿到任务，工作空间和工具列表可按版本选择使用。" }, /* 第52天增强：定义规划智能体提示词变量契约。 */
  { componentId: "writer", componentType: "agent", requiredVariables: ["task"], optionalVariables: ["workspace", "memory", "tools", "agentId"], description: "Writer Agent（写作智能体）必须拿到任务，上游工作空间结果可按提示词版本注入。" }, /* 第52天增强：定义写作智能体提示词变量契约。 */
  { componentId: "critic", componentType: "agent", requiredVariables: ["task"], optionalVariables: ["workspace", "memory", "tools", "agentId"], description: "Critic Agent（审查智能体）必须拿到任务，待审查工作空间可按版本注入。" }, /* 第52天增强：定义审查智能体提示词变量契约。 */
  { componentId: "reflection", componentType: "reflection", requiredVariables: ["agentId", "task", "output", "threshold"], optionalVariables: ["memory", "workspace", "tools"], description: "Reflection（反思）必须知道被审查 Agent、任务、输出和重试阈值。" }, /* 第52天增强：定义反思提示词变量契约。 */
  { componentId: "evaluation", componentType: "evaluation", requiredVariables: ["agentId", "task", "output"], optionalVariables: ["threshold", "memory", "workspace", "tools"], description: "Evaluation（评估）必须知道被评估 Agent、任务和最终输出。" }, /* 第52天增强：定义评估提示词变量契约。 */
  { componentId: "queryRewrite", componentType: "tool", requiredVariables: ["task"], optionalVariables: ["memory", "workspace", "tools"], description: "Query Rewrite（查询改写）必须拿到问题，记忆和知识库主题可按检索场景注入。" }, /* 第52天增强：定义查询改写工具提示词变量契约。 */
  { componentId: "ragAnswer", componentType: "tool", requiredVariables: ["task"], optionalVariables: ["workspace", "memory", "tools"], description: "RAG Answer（知识库问答）必须拿到用户问题，检索片段可通过 workspace 注入。" }, /* 第52天增强：定义知识库问答工具提示词变量契约。 */
  { componentId: "summary", componentType: "tool", requiredVariables: ["task"], optionalVariables: ["memory", "workspace", "tools"], description: "Summary（摘要工具）至少需要待总结文本。" }, /* 第52天增强：定义摘要工具提示词变量契约。 */
]; /* 第52天增强：结束内置组件变量契约集合。 */

function unique(values: string[]): string[] { /* 第52天增强：定义字符串数组去重函数。 */
  return Array.from(new Set(values)); /* 第52天增强：用 Set 保留首次出现顺序并去重。 */
} /* 第52天增强：结束字符串数组去重函数。 */

export function normalizePromptVariables(values: string[]): string[] { /* 第52天增强：定义提示词变量名规范化函数。 */
  return unique(values.map((value) => value.trim()).filter(Boolean)); /* 第52天增强：去掉空白变量并保持唯一变量名。 */
} /* 第52天增强：结束提示词变量名规范化函数。 */

function findDuplicateVariables(values: string[]): string[] { /* 第52天增强：定义重复变量查找函数。 */
  const seen = new Set<string>(); /* 第52天增强：保存已经出现过的变量。 */
  const duplicated = new Set<string>(); /* 第52天增强：保存重复出现的变量。 */
  for (const value of values.map((item) => item.trim()).filter(Boolean)) { /* 第52天增强：遍历非空变量名。 */
    if (seen.has(value)) duplicated.add(value); /* 第52天增强：第二次出现时记录为重复变量。 */
    seen.add(value); /* 第52天增强：记录当前变量已经出现。 */
  } /* 第52天增强：结束变量遍历。 */
  return Array.from(duplicated); /* 第52天增强：返回重复变量列表。 */
} /* 第52天增强：结束重复变量查找函数。 */

function fallbackContract(componentId: string, componentType: PromptComponentType): PromptVariableContract { /* 第52天增强：定义未知组件的保守变量契约。 */
  const requiredVariables = componentType === "supervisor" ? ["task", "agents"] : componentType === "reflection" ? ["agentId", "task", "output", "threshold"] : componentType === "evaluation" ? ["agentId", "task", "output"] : ["task"]; /* 第52天增强：根据组件类型推导最小必需变量。 */
  return { componentId, componentType, requiredVariables, optionalVariables: COMMON_OPTIONAL_VARIABLES.filter((variable) => !requiredVariables.includes(variable)), description: "自定义组件使用保守变量契约，避免拼错未知占位符。" }; /* 第52天增强：返回自定义组件的默认契约。 */
} /* 第52天增强：结束未知组件契约函数。 */

export function getPromptVariableContract(componentId: string, componentType: PromptComponentType = "agent"): PromptVariableContract { /* 第52天增强：定义读取组件变量契约的函数。 */
  return promptVariableContracts.find((contract) => contract.componentId === componentId) ?? fallbackContract(componentId, componentType); /* 第52天增强：优先返回内置契约，缺失时返回保守契约。 */
} /* 第52天增强：结束组件变量契约读取函数。 */

export function buildPromptId(componentId: string, version: string): string { /* 第52天增强：定义提示词 ID 生成函数。 */
  return `${componentId}.${version}`; /* 第52天增强：用组件 ID 和版本组成稳定提示词 ID。 */
} /* 第52天增强：结束提示词 ID 生成函数。 */

export function estimatePromptCost(template: string): number { /* 第53天增强：定义保存提示词时的自动成本估算函数。 */
  const normalizedLength = template.replace(/\s+/g, " ").trim().length; /* 第53天增强：把连续空白压缩后统计模板长度，避免换行过多夸大成本。 */
  const estimatedTokens = Math.max(1, Math.ceil(normalizedLength / 4)); /* 第53天增强：用常见字符到 token（词元）的近似比例估算输入规模。 */
  const baseCost = 0.0015; /* 第53天增强：保留一次调用的基础开销，让短提示词也有合理成本。 */
  const variableCost = estimatedTokens * 0.000012; /* 第53天增强：按估算 token 数叠加可变成本。 */
  return Number((baseCost + variableCost).toFixed(5)); /* 第53天增强：返回五位小数，和页面成本展示精度一致。 */
} /* 第53天增强：结束提示词成本估算函数。 */

export function buildPromptTemplateFromInput(input: PromptMutationInput, existing?: PromptTemplate | null): PromptTemplate { /* 第52天增强：定义把表单输入转换为 PromptTemplate 的函数。 */
  const now = Date.now(); /* 第52天增强：读取当前时间作为更新时间。 */
  const componentId = input.componentId.trim(); /* 第52天增强：规范化组件 ID。 */
  const version = input.version.trim(); /* 第52天增强：规范化版本号。 */
  const costEstimate = input.costEstimate ?? estimatePromptCost(input.template); /* 第53天增强：成本估算为空时由系统按模板长度自动计算。 */
  return { id: input.id?.trim() || buildPromptId(componentId, version), name: input.name.trim() || `${componentId} ${version} Prompt`, componentType: input.componentType, componentId, version, template: input.template, variables: normalizePromptVariables(input.variables), status: input.status, createdAt: existing?.createdAt ?? now, updatedAt: now, source: input.source?.trim() || "prompt-console", score: input.score, costEstimate }; /* 第53天增强：返回完整提示词模板对象，并带上自动估算成本。 */
} /* 第52天增强：结束表单输入转换函数。 */

export function validatePromptTemplate(prompt: PromptTemplate): PromptValidationResult { /* 第52天增强：定义提示词模板校验函数。 */
  const contract = getPromptVariableContract(prompt.componentId, prompt.componentType); /* 第52天增强：读取当前组件变量契约。 */
  const allowedVariables = unique([...contract.requiredVariables, ...contract.optionalVariables]); /* 第52天增强：合并必需变量和可选变量作为允许变量。 */
  const templateVariables = normalizePromptVariables(extractTemplateVariables(prompt.template)); /* 第52天增强：从模板正文提取实际变量。 */
  const declaredVariables = normalizePromptVariables(prompt.variables); /* 第52天增强：规范化模板声明变量。 */
  const issues: PromptValidationIssue[] = []; /* 第52天增强：初始化校验问题列表。 */
  if (!prompt.template.trim()) issues.push({ code: "empty-template", message: "模板正文不能为空。" }); /* 第52天增强：禁止空模板保存或上线。 */
  if (!prompt.version.trim()) issues.push({ code: "empty-version", message: "版本号不能为空。" }); /* 第52天增强：禁止空版本号。 */
  for (const variable of findDuplicateVariables(prompt.variables)) issues.push({ code: "duplicate-variable", variable, message: `变量 ${variable} 被重复声明。` }); /* 第52天增强：检查声明变量是否重复。 */
  for (const variable of templateVariables.filter((name) => !allowedVariables.includes(name))) issues.push({ code: "unknown-variable", variable, message: `模板中出现未知变量 {{${variable}}}，请改为允许变量。` }); /* 第52天增强：检查模板正文是否包含未知占位符。 */
  for (const variable of contract.requiredVariables.filter((name) => !templateVariables.includes(name))) issues.push({ code: "missing-required-variable", variable, message: `模板缺少必需变量 {{${variable}}}。` }); /* 第52天增强：检查必需变量是否出现在模板正文中。 */
  for (const variable of templateVariables.filter((name) => !declaredVariables.includes(name))) issues.push({ code: "undeclared-variable", variable, message: `模板使用了 {{${variable}}}，但 variables 未声明该变量。` }); /* 第52天增强：检查模板正文变量是否都被声明。 */
  for (const variable of declaredVariables.filter((name) => !templateVariables.includes(name))) issues.push({ code: "unused-declared-variable", variable, message: `variables 声明了 ${variable}，但模板正文没有使用 {{${variable}}}。` }); /* 第52天增强：检查声明变量是否真的出现在模板正文中。 */
  return { valid: issues.length === 0, componentId: prompt.componentId, allowedVariables, requiredVariables: [...contract.requiredVariables], templateVariables, declaredVariables, issues }; /* 第52天增强：返回完整校验结果。 */
} /* 第52天增强：结束提示词模板校验函数。 */

export function buildSamplePromptVariables(prompt: PromptTemplate): Record<string, string> { /* 第52天增强：定义提示词预览样例变量构造函数。 */
  const contract = getPromptVariableContract(prompt.componentId, prompt.componentType); /* 第52天增强：读取组件变量契约。 */
  const variableNames = unique([...contract.requiredVariables, ...prompt.variables]); /* 第52天增强：组合必需变量和模板声明变量。 */
  const samples: Record<string, string> = { task: "分析 Day 55 Dynamic Prompt Optimization 的策略选择能力。", tools: "retrieval, ragAnswer, summary", memory: "长期记忆：Day 54 已具备 PromptBlock、PromptBuilder、Block Diff 和 Block Metrics。", workspace: "共享工作空间：当前 step 正在验证 PromptOptimizer、PromptRule、Block Weight、Recommendation 和 Strategy Explorer。", agentId: prompt.componentId, output: "上游输出：已经完成块注册、动态优化预览、策略对比和指标整理。", threshold: "80", agents: "research, planner, writer, critic" }; /* 第55天：定义所有内置变量的样例值，并更新为 Day55 Dynamic Prompt Optimization 场景。 */
  return Object.fromEntries(variableNames.map((variable) => [variable, samples[variable] ?? `样例变量 ${variable}`])); /* 第52天增强：只返回当前模板需要的样例变量。 */
} /* 第52天增强：结束提示词预览样例变量构造函数。 */
