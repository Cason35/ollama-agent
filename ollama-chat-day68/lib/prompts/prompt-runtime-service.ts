import { PromptBuilder, promptBuilder } from "@/lib/prompts/prompt-builder"; // 第67天：引入提示词块组合与渲染构建器。
import type { PromptBlock } from "@/lib/prompts/prompt-block-types"; // 第67天：引入运行时优化后的提示词块类型。
import { PromptRegistry } from "@/lib/prompts/prompt-registry"; // 第67天：引入深化后的提示词注册表。
import { calculatePromptQualityScore } from "@/lib/prompts/production-prompt-quality"; // 第67天：引入归一化提示词质量评分函数。
import type { ProductionPrompt, PromptRuntimeMetrics, PromptRuntimeRequest, PromptRuntimeResult } from "@/lib/prompts/production-prompt-types"; // 第67天：引入生产提示词运行请求、结果和指标类型。
import type { PromptStrategy } from "@/lib/prompts/prompt-optimization-types"; // 第67天：引入运行时提示词策略类型。
import { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第67天：引入统一注册中心以通过统一协议加载目标版本。
import { estimateTokenCount } from "@/lib/usage/token-accounting"; // 第67天：引入提示词词元估算工具。

function stringifyContextValue(value: unknown): string { // 第67天：定义运行时上下文值安全字符串化函数。
  if (typeof value === "string") return value; // 第67天：字符串上下文直接返回。
  if (value == null) return ""; // 第67天：空上下文转换为空字符串供条件块跳过。
  try { return JSON.stringify(value); } catch { return String(value); } // 第67天：对象优先序列化并在循环引用时回退为普通字符串。
} // 第67天：结束运行时上下文值字符串化函数。

function round(value: number, digits = 5): number { // 第67天：定义运行指标稳定小数精度函数。
  return Number(value.toFixed(digits)); // 第67天：返回适合测试和看板展示的数值。
} // 第67天：结束运行指标精度处理函数。

function runtimeStrategy(prompt: ProductionPrompt, request: PromptRuntimeRequest): PromptStrategy { // 第67天：定义从 RuntimeContext 和版本默认值选择提示词策略的函数。
  const strategy = request.runtimeContext.promptContext?.strategy; // 第67天：读取统一运行时上下文中的策略覆盖值。
  return strategy === "fast" || strategy === "balanced" || strategy === "quality" ? strategy : prompt.strategy; // 第67天：合法覆盖值优先，否则使用生产提示词默认策略。
} // 第67天：结束运行时提示词策略选择函数。

export class PromptRuntimeService { // 第67天：实现生产提示词选择、加载、优化、渲染、追踪和指标服务。
  private readonly metrics = new Map<string, PromptRuntimeMetrics>(); // 第67天：按提示词版本保存进程内运行指标。

  constructor(private readonly promptRegistry: PromptRegistry, private readonly unifiedRegistry: UnifiedRegistry, private readonly builder: PromptBuilder = promptBuilder) {} // 第67天：注入提示词注册表、统一注册中心和块构建器。

  renderPrompt(request: PromptRuntimeRequest): PromptRuntimeResult { // 第67天：执行完整生产提示词运行链路。
    const startedAt = Date.now(); // 第67天：记录运行开始时间用于延迟指标。
    const registryItem = this.selectRegistryItem(request); // 第67天：通过统一注册协议选择智能体依赖的提示词版本。
    const prompt = this.promptRegistry.getProductionVersion(request.agentId, registryItem.version); // 第67天：从深化版 PromptRegistry 加载统一注册项指向的生产资产。
    if (!prompt) throw new Error(`统一注册项缺少 ProductionPrompt 资产：${registryItem.id}`); // 第67天：注册项与资产不一致时阻止继续运行。
    const strategy = runtimeStrategy(prompt, request); // 第67天：解析本次运行实际采用的提示词策略。
    const variables = this.contextVariables(request, strategy); // 第67天：从 RuntimeContext 统一提取全部提示词变量。
    const optimizedBlocks = this.optimizeBlocks(prompt.blocks, strategy, variables); // 第67天：根据策略和上下文动态优化提示词块。
    const build = this.builder.buildPromptWithReport(optimizedBlocks, variables); // 第67天：组合并渲染提示词块且保留可观测报告。
    const trace = { traceId: request.runtimeContext.traceId, promptId: prompt.id, version: prompt.version, blocks: [...build.usedBlockIds], strategy, renderedAt: Date.now() }; // 第67天：自动把提示词版本、块和策略绑定到 Trace。
    const modelResult = this.simulateModelCall(request, prompt, build.text, build.usedBlockIds.length); // 第67天：执行与提示词指标关联的教学模型调用链路。
    const quality = this.evaluatePrompt(build.text, build.usedBlockIds, modelResult.costUsd, modelResult.latencyMs); // 第67天：在 Evaluation 阶段生成 PromptQualityScore。
    const metrics = this.recordMetrics(prompt, modelResult.model, modelResult.promptTokens, modelResult.costUsd, Math.max(modelResult.latencyMs, Date.now() - startedAt)); // 第67天：记录提示词和模型调用关联指标。
    const runtimeContext = { ...request.runtimeContext, promptContext: { ...(request.runtimeContext.promptContext ?? {}), promptId: prompt.id, version: prompt.version, blocks: [...build.usedBlockIds], strategy, trace }, usageContext: { ...(request.runtimeContext.usageContext ?? {}), promptTokens: modelResult.promptTokens, completionTokens: modelResult.completionTokens, cost: modelResult.costUsd, promptMetrics: metrics }, evaluationContext: { ...(request.runtimeContext.evaluationContext ?? {}), promptQualityScore: quality, promptId: prompt.id, version: prompt.version }, metadata: { ...request.runtimeContext.metadata, promptTrace: trace } }; // 第67天：把 Prompt、Usage、Evaluation 和 Trace 信息写回同一 RuntimeContext。
    return { prompt, renderedPrompt: build.text, build, trace, metrics, modelResult, quality, runtimeContext }; // 第67天：返回 Agent 到 Prompt、Model 和 Evaluation 的完整链路结果。
  } // 第67天：结束生产提示词完整运行链路。

  listMetrics(): PromptRuntimeMetrics[] { // 第67天：定义读取全部提示词运行指标的方法。
    return Array.from(this.metrics.values()).map((metric) => ({ ...metric })).sort((left, right) => left.promptId.localeCompare(right.promptId, "zh-CN")); // 第67天：复制并稳定排序指标避免调用方修改内部状态。
  } // 第67天：结束提示词运行指标读取方法。

  private selectRegistryItem(request: PromptRuntimeRequest) { // 第67天：定义通过 UnifiedRegistry 加载目标提示词版本的方法。
    const candidates = this.unifiedRegistry.list("prompt").filter((item) => item.metadata.agentId === request.agentId && item.metadata.promptId); // 第67天：从统一注册中心筛选指定智能体的生产提示词版本。
    const selected = request.version ? candidates.find((item) => item.version === request.version && (request.allowNonActive || item.enabled)) : candidates.find((item) => item.enabled); // 第67天：复现和实验按版本加载，正常运行只选择 enabled 版本。
    if (!selected) throw new Error(`未发现可用 ProductionPrompt：${request.agentId}${request.version ? `.${request.version}` : ""}`); // 第67天：没有符合状态约束的版本时返回明确错误。
    return selected; // 第67天：返回统一注册协议选择出的提示词注册项。
  } // 第67天：结束统一注册协议提示词选择方法。

  private contextVariables(request: PromptRuntimeRequest, strategy: PromptStrategy): Record<string, string> { // 第67天：定义从 RuntimeContext 读取提示词渲染变量的方法。
    const promptContext = request.runtimeContext.promptContext ?? {}; // 第67天：读取提示词相关运行时上下文。
    const retrievalContext = request.runtimeContext.retrievalContext ?? {}; // 第67天：读取知识检索相关运行时上下文。
    return { memory: stringifyContextValue(request.runtimeContext.memoryContext), workspace: stringifyContextValue(request.runtimeContext.workspace), knowledge: stringifyContextValue(retrievalContext.knowledge ?? retrievalContext.hits ?? retrievalContext), strategy, userIntent: stringifyContextValue(promptContext.userIntent ?? request.runtimeContext.metadata.userIntent ?? request.runtimeContext.taskId), task: stringifyContextValue(promptContext.task ?? request.runtimeContext.metadata.task ?? request.runtimeContext.taskId), citations: stringifyContextValue(retrievalContext.citations ?? retrievalContext.sources) }; // 第67天：返回 Memory、Workspace、Knowledge、Strategy、User Intent 和任务变量。
  } // 第67天：结束统一运行时上下文变量提取方法。

  private optimizeBlocks(blocks: PromptBlock[], strategy: PromptStrategy, variables: Record<string, string>): PromptBlock[] { // 第67天：定义生产提示词块动态优化方法。
    return blocks.map((block) => { // 第67天：逐个复制并按策略调整提示词块启用状态。
      const contextAvailable = (block.requiredVariables ?? []).every((name) => Boolean(variables[name]?.trim())); // 第67天：判断当前块依赖的 RuntimeContext 变量是否可用。
      const expensive = block.type === "reflection" || block.type === "evaluation" || block.type === "citation"; // 第67天：识别快速策略可关闭的高成本质量块。
      const enabled = strategy === "fast" && expensive ? false : block.enabled && (contextAvailable || !block.skipIfMissing); // 第67天：快速策略关闭高成本块且上下文型块缺值时提前禁用。
      return { ...block, enabled, weight: strategy === "quality" && expensive ? block.weight + 10 : block.weight, requiredVariables: block.requiredVariables ? [...block.requiredVariables] : undefined }; // 第67天：质量策略提高关键块权重并返回防御性副本。
    }); // 第67天：结束生产提示词块动态优化遍历。
  } // 第67天：结束生产提示词块动态优化方法。

  private simulateModelCall(request: PromptRuntimeRequest, prompt: ProductionPrompt, renderedPrompt: string, usedBlocks: number) { // 第67天：定义不依赖外部模型服务的完整链路教学模拟调用。
    const model = stringifyContextValue(request.runtimeContext.modelContext?.model) || "mimo-v2-flash"; // 第67天：从统一模型上下文读取模型名称并提供稳定默认值。
    const promptTokens = estimateTokenCount(renderedPrompt); // 第67天：估算本次渲染提示词词元数。
    const completionTokens = 36 + usedBlocks * 7; // 第67天：按实际提示词块数量生成稳定输出词元估算。
    const costUsd = round((promptTokens + completionTokens) * 0.000002); // 第67天：把提示词与输出词元关联到模型成本指标。
    const latencyMs = Math.round(120 + promptTokens * 0.7 + (prompt.strategy === "quality" ? 90 : prompt.strategy === "balanced" ? 45 : 10)); // 第67天：按词元和策略生成稳定链路延迟估算。
    const output = `${prompt.agentId ?? "shared"} 已使用 ${prompt.id} 生成包含 ${usedBlocks} 个提示词块的结果`; // 第67天：生成可验证 Agent、Prompt 和 Model 关联关系的输出摘要。
    return { model, output, promptTokens, completionTokens, costUsd, latencyMs }; // 第67天：返回模型结果、用量、成本和延迟。
  } // 第67天：结束教学模型调用函数。

  private evaluatePrompt(renderedPrompt: string, usedBlockIds: string[], costUsd: number, latencyMs: number) { // 第67天：定义从渲染内容和模型指标生成质量评分的方法。
    const correctness = Math.min(98, 72 + usedBlockIds.length * 2.4 + (renderedPrompt.includes("证据") ? 4 : 0) + (renderedPrompt.includes("检查") ? 3 : 0)); // 第67天：按上下文覆盖、证据和反思块计算正确性教学分。
    const relevance = Math.min(98, 74 + usedBlockIds.length * 2.1 + (renderedPrompt.includes("用户意图") ? 5 : 0) + (renderedPrompt.includes("当前任务") ? 4 : 0)); // 第67天：按任务、意图和有效块覆盖计算相关性教学分。
    return calculatePromptQualityScore({ correctness, relevance, costUsd, costBudgetUsd: 0.004, latencyMs, latencyBudgetMs: 900 }); // 第67天：归一化成本和延迟后生成五维质量评分。
  } // 第67天：结束提示词质量评估方法。

  private recordMetrics(prompt: ProductionPrompt, model: string, promptTokens: number, costUsd: number, latencyMs: number): PromptRuntimeMetrics { // 第67天：定义提示词运行指标累计方法。
    const previous = this.metrics.get(prompt.id); // 第67天：读取该提示词版本上一份累计指标。
    const usageCount = (previous?.usageCount ?? 0) + 1; // 第67天：累计该版本运行次数。
    const totalPromptTokens = (previous?.totalPromptTokens ?? 0) + promptTokens; // 第67天：累计该版本提示词词元数。
    const totalCostUsd = round((previous?.totalCostUsd ?? 0) + costUsd); // 第67天：累计该版本模型成本。
    const averageLatencyMs = Math.round((((previous?.averageLatencyMs ?? 0) * (usageCount - 1)) + latencyMs) / usageCount); // 第67天：增量计算该版本平均链路延迟。
    const metrics = { promptId: prompt.id, version: prompt.version, usageCount, promptTokens, totalPromptTokens, latencyMs, averageLatencyMs, costUsd, totalCostUsd, model }; // 第67天：创建与模型调用关联的提示词指标快照。
    this.metrics.set(prompt.id, metrics); // 第67天：写回提示词版本累计指标。
    return { ...metrics }; // 第67天：返回防御性复制后的指标结果。
  } // 第67天：结束提示词运行指标累计方法。
} // 第67天：结束 PromptRuntimeService 实现。
