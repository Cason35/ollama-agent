import type { RuntimeBudgetLevel, RuntimeCacheStrategy, RuntimeCollaborationStrategy, RuntimeComplexity, RuntimeContext, RuntimeDecision, RuntimeLatencyPreference, RuntimeMemoryStrategy, RuntimeModelStrategy, RuntimePromptStrategy, RuntimeRetrievalStrategy, RuntimeTaskType } from "@/lib/runtime/runtime-types"; /* 第57天：引入运行时上下文、决策和策略类型。 */

export type RuntimeTextInput = { /* 第57天：定义从自然语言任务推导 RuntimeContext 的输入结构。 */
  text: string; /* 第57天：保存用户任务文本。 */
  hasKnowledge?: boolean; /* 第57天：允许调用方显式声明是否有知识库上下文。 */
  hasWorkspace?: boolean; /* 第57天：允许调用方显式声明是否有工作空间上下文。 */
  hasMemory?: boolean; /* 第57天：允许调用方显式声明是否有记忆上下文。 */
  requiresJson?: boolean; /* 第57天：允许调用方显式声明是否要求 JSON。 */
  latencyPreference?: RuntimeLatencyPreference; /* 第57天：允许调用方覆盖速度偏好。 */
  budgetLevel?: RuntimeBudgetLevel; /* 第57天：允许调用方覆盖预算等级。 */
}; /* 第57天：结束 RuntimeTextInput 类型定义。 */

export class RuntimeDecisionEngine { /* 第57天：定义 RuntimeDecisionEngine（运行时决策引擎）。 */
  decide(context: RuntimeContext): RuntimeDecision { /* 第57天：根据 RuntimeContext 输出 RuntimeDecision。 */
    const startedAt = Date.now(); /* 第57天：记录决策开始时间。 */
    const reasons: string[] = []; /* 第57天：收集规则命中原因，保证决策可解释。 */
    const promptStrategy = this.pickPromptStrategy(context, reasons); /* 第57天：选择提示词策略。 */
    const modelStrategy = this.pickModelStrategy(context, promptStrategy, reasons); /* 第57天：选择模型策略。 */
    const collaborationStrategy = this.pickCollaborationStrategy(context, modelStrategy, reasons); /* 第57天：选择协作策略。 */
    const cacheStrategy = this.pickCacheStrategy(context, promptStrategy, reasons); /* 第57天：选择缓存策略。 */
    const retrievalStrategy = this.pickRetrievalStrategy(context, reasons); /* 第57天：选择检索策略。 */
    const memoryStrategy = this.pickMemoryStrategy(context, reasons); /* 第57天：选择记忆策略。 */
    const estimatedCost = this.estimateCost(promptStrategy, modelStrategy, collaborationStrategy, retrievalStrategy, memoryStrategy); /* 第57天：估算本次运行成本。 */
    const estimatedLatencyMs = this.estimateLatency(promptStrategy, modelStrategy, collaborationStrategy, retrievalStrategy, memoryStrategy); /* 第57天：估算本次运行延迟。 */
    const decisionTimeMs = Math.max(1, Date.now() - startedAt); /* 第57天：计算决策引擎耗时并至少记为 1ms。 */
    return { promptStrategy, modelStrategy, collaborationStrategy, cacheStrategy, retrievalStrategy, memoryStrategy, estimatedCost, estimatedLatencyMs, decisionTimeMs, reasons }; /* 第57天：返回完整运行时决策。 */
  } /* 第57天：结束 decide 方法。 */

  private pickPromptStrategy(context: RuntimeContext, reasons: string[]): RuntimePromptStrategy { /* 第57天：定义提示词策略规则。 */
    if (context.requiresJson) { reasons.push("requiresJson=true，优先启用 JSON Prompt。"); return "json"; } /* 第57天：结构化输出需求优先级最高。 */
    if (context.budgetLevel === "low" && context.latencyPreference !== "quality") { reasons.push("budgetLevel=low，优先压低提示词长度和生成成本。"); return "fast"; } /* 第57天：低预算且非质量优先时走快速提示词。 */
    if (context.complexity === "high" || context.latencyPreference === "quality") { reasons.push("高复杂度或质量优先任务启用 Quality Prompt。"); return "quality"; } /* 第57天：高复杂度或质量偏好启用质量策略。 */
    if (context.latencyPreference === "fast" || context.complexity === "low") { reasons.push("低复杂度或速度优先任务启用 Fast Prompt。"); return "fast"; } /* 第57天：低复杂度或速度优先启用快速策略。 */
    reasons.push("未命中特殊规则，启用 Balanced Prompt。"); return "balanced"; /* 第57天：默认走平衡提示词。 */
  } /* 第57天：结束提示词策略规则。 */

  private pickModelStrategy(context: RuntimeContext, promptStrategy: RuntimePromptStrategy, reasons: string[]): RuntimeModelStrategy { /* 第57天：定义模型策略规则。 */
    if (promptStrategy === "json") { reasons.push("JSON Prompt 需要 JSON Model 保证结构稳定。"); return "json"; } /* 第57天：JSON 提示词配套结构化模型。 */
    if (context.budgetLevel === "low" || promptStrategy === "fast") { reasons.push("低预算或快速提示词优先选择 Small Model。"); return "small"; } /* 第57天：快速和低预算走小模型。 */
    if (context.complexity === "high" && (context.taskType === "research" || context.taskType === "planning")) { reasons.push("高复杂研究/规划任务需要 Multi Model 协作。"); return "multi"; } /* 第57天：复杂研究规划启用多模型策略。 */
    if (context.complexity === "high") { reasons.push("高复杂任务至少需要 Reasoning Model。"); return "reasoning"; } /* 第57天：其他高复杂任务走推理模型。 */
    reasons.push("中等复杂度任务选择 Balanced Model。"); return "balanced"; /* 第57天：默认走平衡模型。 */
  } /* 第57天：结束模型策略规则。 */

  private pickCollaborationStrategy(context: RuntimeContext, modelStrategy: RuntimeModelStrategy, reasons: string[]): RuntimeCollaborationStrategy { /* 第57天：定义协作策略规则。 */
    if (context.taskType === "chat" && context.complexity === "low" && modelStrategy === "small") { reasons.push("普通低复杂聊天直接回答即可。"); return "direct"; } /* 第57天：短聊天避免启动重型协作。 */
    if (modelStrategy === "multi") { reasons.push("Multi Model Strategy 触发模型协作链。"); return "model-collaboration"; } /* 第57天：多模型策略进入模型协作。 */
    if (context.complexity === "high") { reasons.push("高复杂任务启用 Agent DAG 做分工。"); return "agent-dag"; } /* 第57天：高复杂任务走多智能体 DAG。 */
    if (context.requiresJson || context.hasWorkspace || context.hasMemory) { reasons.push("结构化、工作空间或记忆上下文任务由单 Agent 统一整理。"); return "single-agent"; } /* 第57天：中等上下文任务由单 Agent 承接。 */
    reasons.push("默认采用 Direct Runtime。"); return "direct"; /* 第57天：默认直接回答。 */
  } /* 第57天：结束协作策略规则。 */

  private pickCacheStrategy(context: RuntimeContext, promptStrategy: RuntimePromptStrategy, reasons: string[]): RuntimeCacheStrategy { /* 第57天：定义缓存策略规则。 */
    if (context.requiresJson) { reasons.push("JSON 任务避免缓存污染，默认 bypass。"); return "bypass"; } /* 第57天：结构化输出先绕过语义缓存。 */
    if (context.budgetLevel === "low" || promptStrategy === "fast") { reasons.push("低预算或快速策略优先查缓存。"); return "cache-first"; } /* 第57天：快速和低预算优先缓存。 */
    reasons.push("默认采用 read-through 缓存，未命中后写回。"); return "read-through"; /* 第57天：平衡和质量策略使用读穿缓存。 */
  } /* 第57天：结束缓存策略规则。 */

  private pickRetrievalStrategy(context: RuntimeContext, reasons: string[]): RuntimeRetrievalStrategy { /* 第57天：定义检索策略规则。 */
    if (!context.hasKnowledge) { reasons.push("无知识库上下文，关闭 Retrieval。"); return "none"; } /* 第57天：没有知识库时不检索。 */
    if (context.complexity === "high" || context.taskType === "research") { reasons.push("高复杂或研究任务启用 Deep RAG。"); return "deep-rag"; } /* 第57天：复杂研究任务使用深度检索。 */
    if (context.latencyPreference === "fast") { reasons.push("速度优先但有知识库时采用 Keyword Retrieval。"); return "keyword"; } /* 第57天：速度优先时用关键词检索降低延迟。 */
    reasons.push("默认采用 Hybrid Retrieval。"); return "hybrid"; /* 第57天：默认使用混合检索。 */
  } /* 第57天：结束检索策略规则。 */

  private pickMemoryStrategy(context: RuntimeContext, reasons: string[]): RuntimeMemoryStrategy { /* 第57天：定义记忆策略规则。 */
    if (!context.hasMemory) { reasons.push("无可用记忆，Memory Strategy=none。"); return "none"; } /* 第57天：没有记忆时关闭记忆层。 */
    if (context.hasWorkspace) { reasons.push("存在 Workspace 时优先使用 workspace 记忆策略。"); return "workspace"; } /* 第57天：工作空间上下文优先级高于长期记忆。 */
    if (context.complexity === "high" || context.latencyPreference === "quality") { reasons.push("高复杂或质量优先任务启用 Long Term Memory。"); return "long-term"; } /* 第57天：复杂任务启用长期记忆。 */
    reasons.push("默认使用 Short Term Memory。"); return "short-term"; /* 第57天：默认使用短期记忆。 */
  } /* 第57天：结束记忆策略规则。 */

  private estimateCost(promptStrategy: RuntimePromptStrategy, modelStrategy: RuntimeModelStrategy, collaborationStrategy: RuntimeCollaborationStrategy, retrievalStrategy: RuntimeRetrievalStrategy, memoryStrategy: RuntimeMemoryStrategy): number { /* 第57天：定义成本估算规则。 */
    const promptCost = promptStrategy === "quality" ? 0.0012 : promptStrategy === "json" ? 0.0008 : promptStrategy === "balanced" ? 0.0006 : 0.0003; /* 第57天：根据提示词策略估算输入成本。 */
    const modelCost = modelStrategy === "multi" ? 0.003 : modelStrategy === "reasoning" ? 0.002 : modelStrategy === "json" ? 0.0011 : modelStrategy === "balanced" ? 0.001 : 0.0004; /* 第57天：根据模型策略估算生成成本。 */
    const collaborationCost = collaborationStrategy === "model-collaboration" ? 0.002 : collaborationStrategy === "agent-dag" ? 0.0015 : collaborationStrategy === "single-agent" ? 0.0005 : 0.0001; /* 第57天：根据协作策略估算编排成本。 */
    const retrievalCost = retrievalStrategy === "deep-rag" ? 0.001 : retrievalStrategy === "hybrid" ? 0.0006 : retrievalStrategy === "keyword" ? 0.0002 : 0; /* 第57天：根据检索策略估算检索成本。 */
    const memoryCost = memoryStrategy === "workspace" ? 0.0005 : memoryStrategy === "long-term" ? 0.0004 : memoryStrategy === "short-term" ? 0.0001 : 0; /* 第57天：根据记忆策略估算记忆成本。 */
    return Number((promptCost + modelCost + collaborationCost + retrievalCost + memoryCost).toFixed(6)); /* 第57天：返回稳定精度的总成本。 */
  } /* 第57天：结束成本估算规则。 */

  private estimateLatency(promptStrategy: RuntimePromptStrategy, modelStrategy: RuntimeModelStrategy, collaborationStrategy: RuntimeCollaborationStrategy, retrievalStrategy: RuntimeRetrievalStrategy, memoryStrategy: RuntimeMemoryStrategy): number { /* 第57天：定义延迟估算规则。 */
    const promptLatency = promptStrategy === "quality" ? 360 : promptStrategy === "json" ? 220 : promptStrategy === "balanced" ? 160 : 80; /* 第57天：估算提示词构建延迟。 */
    const modelLatency = modelStrategy === "multi" ? 2600 : modelStrategy === "reasoning" ? 1800 : modelStrategy === "json" ? 900 : modelStrategy === "balanced" ? 1000 : 420; /* 第57天：估算模型调用延迟。 */
    const collaborationLatency = collaborationStrategy === "model-collaboration" ? 1200 : collaborationStrategy === "agent-dag" ? 900 : collaborationStrategy === "single-agent" ? 240 : 60; /* 第57天：估算协作编排延迟。 */
    const retrievalLatency = retrievalStrategy === "deep-rag" ? 680 : retrievalStrategy === "hybrid" ? 380 : retrievalStrategy === "keyword" ? 140 : 0; /* 第57天：估算检索延迟。 */
    const memoryLatency = memoryStrategy === "workspace" ? 220 : memoryStrategy === "long-term" ? 180 : memoryStrategy === "short-term" ? 40 : 0; /* 第57天：估算记忆读取延迟。 */
    return promptLatency + modelLatency + collaborationLatency + retrievalLatency + memoryLatency; /* 第57天：返回总估算延迟。 */
  } /* 第57天：结束延迟估算规则。 */
} /* 第57天：结束 RuntimeDecisionEngine 类定义。 */

export function inferRuntimeContextFromText(input: RuntimeTextInput): RuntimeContext { /* 第57天：定义从任务文本推导 RuntimeContext 的工具函数。 */
  const text = input.text.trim(); /* 第57天：标准化任务文本。 */
  const taskType = inferTaskType(text); /* 第57天：根据关键词推导任务类型。 */
  const requiresJson = input.requiresJson ?? /json|结构化|schema|只返回|字段|object/i.test(text); /* 第57天：推导是否要求 JSON 或结构化输出。 */
  const complexity = inferComplexity(text, taskType, requiresJson); /* 第57天：推导复杂度。 */
  const latencyPreference = input.latencyPreference ?? inferLatencyPreference(text, complexity); /* 第57天：推导速度偏好。 */
  const budgetLevel = input.budgetLevel ?? inferBudgetLevel(text, latencyPreference); /* 第57天：推导预算等级。 */
  const hasKnowledge = input.hasKnowledge ?? /知识|检索|资料|引用|来源|rag|论文|报告/i.test(text); /* 第57天：推导是否需要知识库。 */
  const hasWorkspace = input.hasWorkspace ?? /工作区|workspace|项目|代码库|文件|仓库/i.test(text); /* 第57天：推导是否需要工作空间。 */
  const hasMemory = input.hasMemory ?? /记住|记忆|上次|历史|继续|复盘/i.test(text); /* 第57天：推导是否需要记忆。 */
  return { taskType, complexity, latencyPreference, budgetLevel, hasKnowledge, hasWorkspace, hasMemory, requiresJson }; /* 第57天：返回完整 RuntimeContext。 */
} /* 第57天：结束 RuntimeContext 推导函数。 */

function inferTaskType(text: string): RuntimeTaskType { /* 第57天：定义任务类型推导规则。 */
  if (/评估|打分|review|评价|检查|evaluation/i.test(text)) return "evaluation"; /* 第57天：评估关键词命中 evaluation。 */
  if (/计划|规划|拆解|路线图|planning|plan/i.test(text)) return "planning"; /* 第57天：规划关键词命中 planning。 */
  if (/研究|调研|分析|报告|论文|research/i.test(text)) return "research"; /* 第57天：研究关键词命中 research。 */
  return "chat"; /* 第57天：默认按普通聊天处理。 */
} /* 第57天：结束任务类型推导规则。 */

function inferComplexity(text: string, taskType: RuntimeTaskType, requiresJson: boolean): RuntimeComplexity { /* 第57天：定义复杂度推导规则。 */
  if (text.length > 120 || taskType === "research" || taskType === "planning") return "high"; /* 第57天：长文本、研究和规划默认高复杂。 */
  if (text.length > 40 || taskType === "evaluation" || requiresJson) return "medium"; /* 第57天：中长文本、评估和 JSON 默认中等复杂。 */
  return "low"; /* 第57天：短文本默认低复杂。 */
} /* 第57天：结束复杂度推导规则。 */

function inferLatencyPreference(text: string, complexity: RuntimeComplexity): RuntimeLatencyPreference { /* 第57天：定义速度偏好推导规则。 */
  if (/快|快速|立刻|马上|fast/i.test(text)) return "fast"; /* 第57天：速度关键词命中 fast。 */
  if (/高质量|严谨|完整|深入|quality/i.test(text) || complexity === "high") return "quality"; /* 第57天：质量关键词或高复杂任务命中 quality。 */
  return "balanced"; /* 第57天：默认使用 balanced。 */
} /* 第57天：结束速度偏好推导规则。 */

function inferBudgetLevel(text: string, latencyPreference: RuntimeLatencyPreference): RuntimeBudgetLevel { /* 第57天：定义预算等级推导规则。 */
  if (/省钱|低成本|便宜|low budget/i.test(text) || latencyPreference === "fast") return "low"; /* 第57天：省钱或速度优先默认低预算。 */
  if (/高预算|不计成本|最好|high budget/i.test(text) || latencyPreference === "quality") return "high"; /* 第57天：高质量或高预算关键词默认高预算。 */
  return "medium"; /* 第57天：默认中等预算。 */
} /* 第57天：结束预算等级推导规则。 */

export const runtimeDecisionEngine = new RuntimeDecisionEngine(); /* 第57天：导出共享 RuntimeDecisionEngine 单例。 */
