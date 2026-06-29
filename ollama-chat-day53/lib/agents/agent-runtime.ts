import type { AgentCallEdge, AgentCollaborationSnapshot, AgentContext, AgentDAGMetrics, AgentPlan, AgentPlanStep, AgentPlanValidation, AgentResult, AgentTask, AgentTimelineEvent, EvaluationMetrics, EvaluationRecord, EvaluationResult, PromptABTestResult, ReflectionAttempt, ReflectionMetrics, ReflectionResult, Trace, TraceSpanType, Workspace, WorkspaceEntryType } from "@/lib/agents/agent-types"; /* 第45天：引入 DAG、Workspace（工作空间）、Reflection（反思）、Trace（追踪）和 Evaluation（评估）运行时需要的类型。 */
import { AgentRegistry } from "@/lib/agents/agent-registry"; /* 引入智能体注册表用于查找执行目标。 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime"; /* 引入统一模型调用能力和模型运行时类型。 */
import { createWorkspace, MemoryWorkspaceStore, type WorkspaceStore } from "@/lib/agents/workspace-store"; /* 第43天：引入共享工作空间创建函数和默认内存存储。 */
import { TraceManager } from "@/lib/agents/trace-manager"; /* 第44天：引入 TraceManager（追踪管理器）用于记录生产运行时链路。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第47天：引入稳定词元估算函数，为各运行阶段核算输入与输出用量。 */
import { usageManager, type UsageManager } from "@/lib/usage/usage-manager"; /* 第47天：引入共享 UsageManager（用量管理器）并支持测试注入。 */
import type { UsageComponentType, UsageRecord } from "@/lib/usage/usage-types"; /* 第47天：引入用量组件与记录类型。 */
import { semanticCache, type SemanticCache } from "@/lib/cache/semantic-cache"; /* 第48天：引入共享语义缓存并支持测试注入。 */
import type { CacheAwareAnswer } from "@/lib/cache/cache-types"; /* 第48天：引入缓存感知答案类型。 */
import { longTermMemory, type LongTermMemoryStore } from "@/lib/memory/long-term-memory-store"; /* 第49天：引入共享长期记忆存储并支持测试注入。 */
import { extractExperiencesFromSnapshot } from "@/lib/memory/experience-extraction"; /* 第49天：引入从协作快照提取经验的能力。 */
import type { MemoryAugmentedAnswer } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入记忆增强答案类型。 */
import { ModelRouter, modelRouter } from "@/lib/model/model-router"; /* 第50天：引入模型路由器并支持测试注入，让运行时按任务选择算力。 */
import type { ModelProfile, ModelRoutingInput } from "@/lib/model/model-profile-types"; /* 第50天：引入模型档案与路由输入类型。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第52天：引入共享 PromptRegistry（提示词注册表）。 */
import type { PromptRegistry } from "@/lib/prompts/prompt-registry"; /* 第52天：引入 PromptRegistry 类型以支持测试注入。 */
import { safeRenderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第52天：引入安全 Prompt Renderer（提示词渲染器）。 */

type ResolvedPrompt = { promptId?: string; promptVersion?: string; text: string }; /* 第52天：定义运行时解析后的提示词元数据与正文。 */

type RuntimeMetrics = { /* 定义运行时内部指标结构。 */
  executedTasks: number; /* 记录已经执行的任务数量。 */
  delegatedTasks: number; /* 记录已经委派的任务数量。 */
  totalDuration: number; /* 记录全部任务耗时总和。 */
  successfulTasks: number; /* 记录成功完成的任务数量。 */
}; /* 结束 RuntimeMetrics 类型定义。 */

export class AgentRuntime { /* 定义第40天基于 Supervisor 的智能体运行时。 */
  private readonly callGraph: AgentCallEdge[] = []; /* 保存本次运行产生的智能体调用图。 */
  private readonly timeline: AgentTimelineEvent[] = []; /* 保存本次运行产生的智能体计划时间线。 */
  private readonly metrics: RuntimeMetrics = { executedTasks: 0, delegatedTasks: 0, totalDuration: 0, successfulTasks: 0 }; /* 初始化运行时指标。 */
  private readonly reflectionAttempts: ReflectionAttempt[] = []; /* 第43天：保存所有 Reflection（反思）评审尝试，供前端时间线和指标面板使用。 */
  private readonly evaluationRecords: EvaluationRecord[] = []; /* 第45天：保存所有 Evaluation（评估）记录，供前端质量面板和趋势指标使用。 */
  private readonly reflectionThreshold = 80; /* 第43天：定义 Reflection（反思）通过阈值，低于该分数会考虑重试。 */
  private readonly maxReflectionRetries = 2; /* 第43天：定义每个 Agent 最多允许的 Reflection Retry（反思重试）次数。 */
  private readonly traceManager = new TraceManager(); /* 第44天：创建 TraceManager（追踪管理器）以保存 Trace 和 Span。 */
  private activeTraceId = ""; /* 第44天：保存当前协作请求正在使用的 Trace（追踪记录）ID。 */

  constructor(private readonly registry: AgentRegistry, private readonly workspaceStore: WorkspaceStore = new MemoryWorkspaceStore(), private readonly usageStore: UsageManager = usageManager, private readonly cacheStore: SemanticCache = semanticCache, private readonly memoryStore: LongTermMemoryStore = longTermMemory, private readonly modelRouterStore: ModelRouter = modelRouter, private readonly promptRegistryStore: PromptRegistry = promptRegistry) {} /* 第52天：在第51天依赖注入基础上追加共享提示词注册表，让运行时按组件读取 active Prompt 版本。 */

  async answerWithLongTermMemory(query: string, context?: AgentContext, rt?: ModelRuntime): Promise<MemoryAugmentedAnswer> { /* 第49天：定义先检索长期经验、注入提示词执行、再把新经验写回记忆的入口。 */
    const startedAt = Date.now(); /* 第49天：记录本次查询开始时间。 */
    const trace = this.ensureTrace(`Memory-Augmented Request（记忆增强请求）：${query}`); /* 第49天：为本次查询确保存在 Trace（追踪记录）。 */
    const retrieveSpanId = this.traceManager.startSpan(trace.traceId, { name: "long-term-memory-retrieve", type: "memory", metadata: { query } }); /* 第49天：在 Trace 中创建 memory span（记忆跨度）记录经验检索。 */
    const hits = this.memoryStore.retrieve(query, { topK: 5 }); /* 第49天：检索与当前查询最相关的历史经验。 */
    const retrievedExperiences = hits.map((hit) => ({ id: hit.item.id, type: hit.item.type, content: hit.item.content, score: hit.score })); /* 第49天：整理检索命中的经验明细。 */
    this.traceManager.endSpan(trace.traceId, retrieveSpanId, "success", { retrievedCount: retrievedExperiences.length, topScore: retrievedExperiences[0]?.score ?? 0 }); /* 第49天：结束记忆检索跨度并记录命中数量与最高分。 */
    const memoryContext: AgentContext = { memory: { longTermExperiences: retrievedExperiences.map((experience) => experience.content), ...(typeof context?.memory === "object" && context?.memory ? context.memory : {}) }, workflow: context?.workflow, tools: context?.tools, workspace: context?.workspace, trace: context?.trace }; /* 第49天：把检索到的长期经验注入 AgentContext，供 Research Agent 在提示词中使用。 */
    const collaboration = await this.runSupervisorCollaboration(query, memoryContext, rt); /* 第49天：携带长期经验执行多智能体协作链路。 */
    const writeSpanId = this.traceManager.startSpan(trace.traceId, { name: "long-term-memory-write", type: "memory", metadata: { goal: query } }); /* 第49天：创建 memory span（记忆跨度）记录经验写回。 */
    const newExperiences = extractExperiencesFromSnapshot(query, collaboration, { agentId: "experience-extractor" }); /* 第49天：从协作快照中提取本次任务的新经验。 */
    for (const experience of newExperiences) this.memoryStore.add(experience); /* 第49天：把新经验逐条写回长期记忆。 */
    this.traceManager.endSpan(trace.traceId, writeSpanId, "success", { newExperienceCount: newExperiences.length }); /* 第49天：结束记忆写回跨度并记录新经验数量。 */
    return { query, answer: collaboration.result.output, traceId: trace.traceId, durationMs: Math.max(1, Date.now() - startedAt), retrievedExperiences, newExperienceCount: newExperiences.length }; /* 第49天：返回结合长期经验的最终答案与经验明细。 */
  } /* 第49天：结束 answerWithLongTermMemory 方法。 */

  async answerWithCache(query: string, context?: AgentContext, rt?: ModelRuntime): Promise<CacheAwareAnswer> { /* 第48天：定义先查语义缓存、命中直接返回、未命中再执行智能体的入口。 */
    const startedAt = Date.now(); /* 第48天：记录本次查询开始时间，用于对比命中与未命中的耗时差异。 */
    const trace = this.ensureTrace(`Cached Request（缓存请求）：${query}`); /* 第48天：为本次查询确保存在 Trace（追踪记录）。 */
    const cacheSpanId = this.traceManager.startSpan(trace.traceId, { name: "semantic-cache-lookup", type: "cache", metadata: { query } }); /* 第48天：在 Trace 中创建 cache span（缓存跨度）记录命中查找。 */
    const search = this.cacheStore.search(query); /* 第48天：在语义缓存中执行相似度检索。 */
    if (search.hit && search.entry) { /* 第48天：相似度达到阈值时判定缓存命中。 */
      this.traceManager.endSpan(trace.traceId, cacheSpanId, "success", { cacheStatus: "hit", similarity: search.similarity, cacheEntryId: search.entry.id }); /* 第48天：结束 cache span 并标记为命中。 */
      this.closeActiveTrace(); /* 第48天：命中后直接关闭 Trace，跳过全部智能体执行。 */
      return { query, answer: search.entry.answer, cacheStatus: "hit", similarity: search.similarity, traceId: trace.traceId, durationMs: Math.max(1, Date.now() - startedAt), savedFromCache: true }; /* 第48天：直接返回缓存答案，避免重复思考。 */
    } /* 第48天：结束缓存命中分支。 */
    this.traceManager.endSpan(trace.traceId, cacheSpanId, "success", { cacheStatus: "miss", similarity: search.similarity }); /* 第48天：未命中时结束 cache span 并标记为未命中。 */
    const generationStartedAt = Date.now(); /* 第48天：记录真实生成开始时间用于缓存延迟节省统计。 */
    const collaboration = await this.runSupervisorCollaboration(query, context, rt); /* 第48天：未命中时复用第40天 Supervisor 协作链路正常执行。 */
    const genDurationMs = Math.max(1, Date.now() - generationStartedAt); /* 第48天：计算真实生成耗时。 */
    this.cacheStore.add({ query, answer: collaboration.result.output, traceId: trace.traceId, score: collaboration.evaluationMetrics?.averageScore ?? 0, genDurationMs }); /* 第48天：把首次生成结果写入语义缓存供后续命中。 */
    return { query, answer: collaboration.result.output, cacheStatus: "miss", similarity: search.similarity, traceId: trace.traceId, durationMs: Math.max(1, Date.now() - startedAt), savedFromCache: false }; /* 第48天：返回新生成答案并标记为未命中。 */
  } /* 第48天：结束 answerWithCache 方法。 */

  async executeAgent(agentId: string, task: AgentTask, context?: AgentContext, rt?: ModelRuntime): Promise<AgentResult> { /* 定义执行单个智能体任务的方法。 */
    const startedAt = Date.now(); /* 记录任务开始时间戳。 */
    const assignedTask = { ...task, assignedAgentId: task.assignedAgentId ?? agentId }; /* 确保任务带有被分配的智能体 ID。 */
    const standaloneTrace = !this.activeTraceId; /* 第44天：判断当前是否是单 Agent 独立调用。 */
    const trace = this.ensureTrace(`Agent Request（智能体请求）：${assignedTask.goal}`); /* 第44天：确保存在当前 Trace（追踪记录）。 */
    const traceId = context?.trace?.traceId ?? trace.traceId; /* 第44天：优先使用上下文传入的 Trace ID。 */
    const agentSpanId = this.traceManager.startSpan(traceId, { parentSpanId: context?.trace?.parentSpanId, name: agentId, type: "agent", metadata: { taskId: assignedTask.id, assignedAgentId: assignedTask.assignedAgentId } }); /* 第44天：为当前 Agent 执行创建 agent span（智能体跨度）。 */
    const agent = this.registry.get(agentId); /* 从注册表查找目标智能体。 */
    this.pushTimeline(agentId, assignedTask.id, `${agentId} started`); /* 记录智能体开始执行事件。 */
    this.metrics.executedTasks += 1; /* 累加已经执行的任务数量。 */
    try { /* 第44天：捕获 Agent 执行异常并写入 failed span。 */
      if (!agent) { /* 判断目标智能体是否不存在。 */
        this.pushTimeline(agentId, assignedTask.id, `${agentId} failed`); /* 记录智能体失败事件。 */
        this.traceManager.endSpan(traceId, agentSpanId, "failed", { error: `未找到 Agent：${agentId}` }); /* 第44天：把缺失 Agent 记录为失败跨度。 */
        if (standaloneTrace) this.closeActiveTrace(); /* 第44天：独立调用结束时关闭 Trace（追踪记录）。 */
        return { taskId: assignedTask.id, agentId, output: `未找到 Agent：${agentId}`, metadata: { ok: false } }; /* 返回找不到智能体的结构化结果。 */
      } /* 结束智能体缺失判断。 */
      let output = ""; /* 第43天：保存当前轮 Agent 输出，后续可能被重试结果覆盖。 */
      let finalReflection: ReflectionResult | undefined; /* 第43天：保存最终采用输出对应的 Reflection（反思）结果。 */
      let finalAgentPrompt: ResolvedPrompt | undefined; /* 第52天：保存最终采用输出对应的 Agent Prompt（提示词）版本。 */
      let attempt = 0; /* 第43天：记录当前 Agent 已经生成了多少轮输出。 */
      while (attempt <= this.maxReflectionRetries) { /* 第43天：执行生成、反思、必要时重试的闭环。 */
        attempt += 1; /* 第43天：进入新一轮 Agent 输出尝试。 */
        const prompt = await this.buildAgentUserPrompt(assignedTask, context, attempt, finalReflection); /* 第43天：构造包含任务、前置结果、Workspace 和上一轮反思建议的用户提示词。 */
        const resolvedAgentPrompt = this.resolvePrompt(agentId, agent.systemPrompt, this.buildPromptVariables(assignedTask, context, agent.tools, agentId)); /* 第52天：从 PromptRegistry 读取当前 Agent 的 active 系统提示词版本。 */
        finalAgentPrompt = resolvedAgentPrompt; /* 第52天：记录当前尝试使用的 Agent Prompt，供最终 Trace Span 写入元数据。 */
        const generationStartedAt = Date.now(); /* 第47天：记录本轮 Agent 生成开始时间，用于核算真实阶段耗时。 */
        output = rt ? await this.invokeAgentModel(resolvedAgentPrompt.text, prompt, rt) : this.buildSimulatedOutput(agent.name, assignedTask, agent.capabilities, agent.tools, context, attempt, finalReflection); /* 第52天：有模型时使用注册表提示词真实生成，无模型时继续使用可演示反思改进的兜底输出。 */
        this.recordComponentUsage(traceId, agentSpanId, "agent", agentId, `${resolvedAgentPrompt.text}\n${prompt}`, output, generationStartedAt, resolvedAgentPrompt); /* 第52天：记录本轮 Agent 输入、输出、费用、模型和提示词版本。 */
        await this.recordDeclaredToolSpans(traceId, agentSpanId, agentId, agent.tools, assignedTask.id, attempt); /* 第44天：把 Agent 声明的工具和检索动作写入 Trace（追踪记录）。 */
        this.pushTimeline("reflection", assignedTask.id, `Reflection Started for ${agentId} attempt ${attempt}`); /* 第43天：记录 Reflection（反思）开始事件。 */
        const reflectionSpanId = this.traceManager.startSpan(traceId, { parentSpanId: agentSpanId, name: `reflection:${agentId}:attempt-${attempt}`, type: "reflection", metadata: { agentId, taskId: assignedTask.id, attempt } }); /* 第44天：为当前反思评审创建 reflection span（反思跨度）。 */
        const reflectionStartedAt = Date.now(); /* 第47天：记录 Reflection（反思）阶段开始时间。 */
        finalReflection = await this.reflectResult(assignedTask, output, agentId, rt); /* 第43天：使用 Reflection Agent（反思智能体）评审当前输出质量。 */
        const shouldRetry = finalReflection.shouldRetry && attempt <= this.maxReflectionRetries; /* 第43天：判断本轮是否需要并且仍然允许重试。 */
        const reflectionPromptInfo = { promptId: finalReflection.promptId, promptVersion: finalReflection.promptVersion, text: "" }; /* 第52天：从反思结果中提取提示词版本元数据。 */
        const reflectionUsage = this.recordComponentUsage(traceId, reflectionSpanId, "reflection", "reflection", `${assignedTask.goal}\n${output}`, JSON.stringify(finalReflection), reflectionStartedAt, reflectionPromptInfo); /* 第52天：记录反思输入输出、费用和提示词版本。 */
        this.traceManager.endSpan(traceId, reflectionSpanId, "success", { score: finalReflection.score, shouldRetry, issuesCount: finalReflection.issues.length, suggestionsCount: finalReflection.suggestions.length, totalTokens: reflectionUsage.totalTokens, estimatedCost: reflectionUsage.estimatedCost, promptId: finalReflection.promptId, promptVersion: finalReflection.promptVersion }); /* 第52天：结束反思跨度并写入质量判断、用量摘要和提示词版本。 */
        this.recordReflectionAttempt(agentId, assignedTask.id, attempt, output, finalReflection, shouldRetry); /* 第43天：记录本轮反思评分、问题和是否重试。 */
        await this.writeReflectionWorkspaceEntry(agentId, assignedTask.id, attempt, finalReflection, context); /* 第43天：把反思结论写入 Workspace（工作空间）。 */
        this.pushTimeline("reflection", assignedTask.id, shouldRetry ? `Reflection Failed for ${agentId}; retry ${attempt}` : `Reflection Passed for ${agentId}`); /* 第43天：记录反思通过或触发重试的时间线事件。 */
        if (!shouldRetry) break; /* 第43天：反思通过或达到重试边界时退出闭环。 */
        this.pushTimeline(agentId, assignedTask.id, `Retry ${agentId} after reflection`); /* 第43天：记录业务 Agent 因反思建议而重试。 */
      } /* 第43天：结束生成、反思、重试闭环。 */
      this.pushTimeline("evaluation", assignedTask.id, `Evaluation Started for ${agentId}`); /* 第45天：记录 Evaluation（评估）开始事件。 */
      const evaluationSpanId = this.traceManager.startSpan(traceId, { parentSpanId: agentSpanId, name: `evaluation:${agentId}`, type: "evaluation", metadata: { agentId, taskId: assignedTask.id } }); /* 第45天：为当前最终输出创建 evaluation span（评估跨度）。 */
      const evaluationStartedAt = Date.now(); /* 第47天：记录 Evaluation（评估）阶段开始时间。 */
      const finalEvaluation = await this.evaluateOutput(assignedTask, output, agentId, rt); /* 第45天：对最终采用的 Agent 输出执行量化评估。 */
      const evaluationPromptInfo = { promptId: finalEvaluation.promptId, promptVersion: finalEvaluation.promptVersion, text: "" }; /* 第52天：从评估结果中提取提示词版本元数据。 */
      const evaluationUsage = this.recordComponentUsage(traceId, evaluationSpanId, "evaluation", "evaluation", `${assignedTask.goal}\n${output}`, JSON.stringify(finalEvaluation), evaluationStartedAt, evaluationPromptInfo); /* 第52天：记录评估输入输出、费用和提示词版本。 */
      this.traceManager.endSpan(traceId, evaluationSpanId, "success", { score: finalEvaluation.score, completeness: finalEvaluation.dimensions.completeness, correctness: finalEvaluation.dimensions.correctness, relevance: finalEvaluation.dimensions.relevance, coverage: finalEvaluation.dimensions.coverage, suggestionsCount: finalEvaluation.suggestions.length, totalTokens: evaluationUsage.totalTokens, estimatedCost: evaluationUsage.estimatedCost, promptId: finalEvaluation.promptId, promptVersion: finalEvaluation.promptVersion }); /* 第52天：结束评估跨度并写入分数、用量摘要和提示词版本。 */
      this.recordEvaluation(agentId, assignedTask.id, output, finalEvaluation); /* 第45天：把本次 Evaluation（评估）写入运行时历史。 */
      await this.writeEvaluationWorkspaceEntry(agentId, assignedTask.id, finalEvaluation, context); /* 第45天：把评估结果写入 Workspace（工作空间）。 */
      this.pushTimeline("evaluation", assignedTask.id, `Evaluation Finished for ${agentId} score ${finalEvaluation.score}`); /* 第45天：记录 Evaluation（评估）完成事件和评分。 */
      const duration = Math.max(1, Date.now() - startedAt); /* 计算至少 1 毫秒的任务耗时。 */
      this.metrics.totalDuration += duration; /* 累加任务耗时。 */
      this.metrics.successfulTasks += 1; /* 累加成功任务数量。 */
      await this.writeWorkspaceEntry(agentId, assignedTask.id, output, context); /* 第43天：把当前 Agent 的输出沉淀到共享工作空间。 */
      this.pushTimeline(agentId, assignedTask.id, `${agentId} success`); /* 记录智能体成功事件。 */
      const agentUsage = this.usageStore.getSpanUsage(traceId, agentSpanId); /* 第47天：读取当前 Agent Span 下全部生成尝试的累计用量。 */
      this.traceManager.endSpan(traceId, agentSpanId, "success", { duration, reflectionScore: finalReflection?.score, evaluationScore: finalEvaluation.score, totalTokens: agentUsage.totalTokens, estimatedCost: agentUsage.estimatedCost, promptId: finalAgentPrompt?.promptId, promptVersion: finalAgentPrompt?.promptVersion }); /* 第52天：结束 Agent Span 并写入质量分、用量成本和提示词版本摘要。 */
      if (standaloneTrace) this.closeActiveTrace(); /* 第44天：独立调用结束时关闭 Trace（追踪记录）。 */
      return { taskId: assignedTask.id, agentId, output, metadata: { ok: true, duration, assignedAgentId: assignedTask.assignedAgentId, reflection: finalReflection, evaluation: finalEvaluation, traceId } }; /* 第45天：返回带 Reflection（反思）、Evaluation（评估）和 Trace（追踪）元数据的结构化执行结果。 */
    } catch (error) { /* 第44天：处理 Agent 执行异常。 */
      this.traceManager.endSpan(traceId, agentSpanId, "failed", { error: this.describeError(error) }); /* 第44天：把异常写入 Agent span（智能体跨度）。 */
      if (standaloneTrace) this.closeActiveTrace(); /* 第44天：独立调用失败时也关闭 Trace（追踪记录）。 */
      throw error; /* 第44天：继续向上抛出异常，保持原有错误语义。 */
    } /* 第44天：结束 Agent 异常处理。 */
  } /* 结束 executeAgent 方法。 */

  async delegateTask(fromAgentId: string, targetAgentId: string, task: AgentTask, context?: AgentContext, rt?: ModelRuntime): Promise<AgentResult> { /* 定义智能体之间的任务委派方法。 */
    const delegatedTask = { ...task, assignedAgentId: targetAgentId }; /* 将任务标记为分配给目标智能体。 */
    this.metrics.delegatedTasks += 1; /* 累加委派任务数量。 */
    this.callGraph.push({ fromAgentId, toAgentId: targetAgentId, taskId: delegatedTask.id }); /* 记录调用图边。 */
    this.pushTimeline(fromAgentId, delegatedTask.id, `${fromAgentId} delegated to ${targetAgentId}`); /* 记录委派时间线事件。 */
    return this.executeAgent(targetAgentId, delegatedTask, context, rt); /* 调用目标智能体执行被委派任务。 */
  } /* 结束 delegateTask 方法。 */

  aggregateResults(rootResult: AgentResult, childResults: AgentResult[]): AgentResult { /* 定义聚合上游与下游结果的方法。 */
    const outputs = [rootResult.output, ...childResults.map((result) => result.output)]; /* 收集根结果和子结果输出。 */
    return { ...rootResult, output: outputs.join("\n\n"), childResults }; /* 返回带嵌套子结果的聚合结果。 */
  } /* 结束 aggregateResults 方法。 */

  async planAgents(goal: string, rt?: ModelRuntime): Promise<AgentPlan> { /* 定义 Supervisor Agent 根据目标生成智能体计划的方法。 */
    if (!rt) return this.createRuleBasedPlan(goal, "未提供模型运行时，使用规则型 Supervisor 兜底计划。"); /* 没有模型运行时时使用规则计划兜底。 */
    const supervisor = this.registry.get("supervisor"); /* 从注册表读取 Supervisor Agent。 */
    const prompt = this.buildSupervisorPrompt(goal); /* 构造包含可用 Agent 列表的 Supervisor 提示词。 */
    const resolvedSupervisorPrompt = this.resolvePrompt("supervisor", supervisor?.systemPrompt ?? "你是一个多智能体调度器。", { task: goal, agents: this.describeAvailableAgents(), memory: "Supervisor 阶段不直接使用记忆。", workspace: "Supervisor 阶段尚未创建工作空间。", tools: "Agent Registry" }); /* 第52天：从 PromptRegistry 读取 Supervisor active 系统提示词。 */
    const result = await invokeChatModel(rt, [{ role: "system", content: resolvedSupervisorPrompt.text }, { role: "user", content: prompt }]); /* 第52天：使用带版本的 Supervisor Prompt 调用模型生成 AgentPlan。 */
    if (!result.ok || !result.text.trim()) return this.createRuleBasedPlan(goal, "Supervisor 模型规划失败，使用规则型兜底计划。"); /* 模型失败时使用规则计划兜底。 */
    const parsed = this.parseAgentPlanFromText(result.text, goal); /* 解析模型返回的 AgentPlan。 */
    return parsed ?? this.createRuleBasedPlan(goal, "Supervisor 返回内容无法解析为 AgentPlan，使用规则型兜底计划。"); /* 解析失败时使用规则计划兜底。 */
  } /* 结束 planAgents 方法。 */

  validateAgentPlan(plan: AgentPlan): AgentPlanValidation { /* 定义 AgentPlan 校验器。 */
    const errors: string[] = []; /* 初始化错误列表。 */
    const existingAgents = new Set(this.registry.list().map((agent) => agent.id)); /* 收集注册表中存在的智能体 ID。 */
    const selectedAgents = new Set(plan.selectedAgents); /* 收集计划中选择的智能体 ID。 */
    plan.selectedAgents.forEach((agentId) => { if (!existingAgents.has(agentId)) errors.push(`selectedAgents 包含不存在的 Agent：${agentId}`); }); /* 校验 selectedAgents 是否存在。 */
    plan.steps.forEach((step) => { if (!existingAgents.has(step.agentId)) errors.push(`steps 包含不存在的 Agent：${step.agentId}`); }); /* 校验步骤中的智能体是否存在。 */
    plan.steps.forEach((step) => { if (!step.task.trim()) errors.push(`步骤 ${step.id} 的 task 不能为空`); }); /* 校验步骤任务描述不能为空。 */
    plan.steps.forEach((step) => { if (!selectedAgents.has(step.agentId)) errors.push(`步骤 ${step.id} 使用了未被 selectedAgents 声明的 Agent：${step.agentId}`); }); /* 校验步骤智能体是否已被选择。 */
    const stepIds = new Set(plan.steps.map((step) => step.id)); /* 收集所有步骤 ID。 */
    if (stepIds.size !== plan.steps.length) errors.push("AgentPlan 包含重复的步骤 ID"); /* 校验 DAG 中每个步骤 ID 必须唯一。 */
    plan.steps.forEach((step) => step.dependsOn?.forEach((dep) => { if (!stepIds.has(dep)) errors.push(`步骤 ${step.id} 依赖不存在的步骤：${dep}`); })); /* 校验 dependsOn 是否合法。 */
    if (this.hasDependencyCycle(plan.steps)) errors.push("AgentPlan 出现循环依赖"); /* 校验步骤之间是否存在循环依赖。 */
    this.findOrphanSteps(plan.steps).forEach((stepId) => errors.push(`步骤 ${stepId} 是孤儿节点，既不依赖其他步骤，也不被最终链路使用`)); /* 校验是否存在与整体 DAG 无关的孤儿节点。 */
    return { ok: errors.length === 0, errors }; /* 返回校验结果。 */
  } /* 结束 validateAgentPlan 方法。 */

  async executeAgentPlan(plan: AgentPlan, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义按 AgentPlan DAG 并行执行智能体的方法。 */
    const trace = this.ensureTrace(`User Request（用户请求）：${plan.goal}`); /* 第44天：确保本次 AgentPlan 执行拥有完整 Trace（追踪记录）。 */
    const workflowSpanId = this.traceManager.startSpan(trace.traceId, { parentSpanId: context?.trace?.parentSpanId, name: "agent-dag-executor", type: "workflow", metadata: { goal: plan.goal, stepCount: plan.steps.length } }); /* 第44天：为 DAG 执行器创建 workflow span（工作流跨度）。 */
    const validation = this.validateAgentPlan(plan); /* 先校验 Supervisor 产出的计划。 */
    const safePlan = validation.ok ? plan : this.createFallbackPlan(plan.goal, validation.errors); /* 校验失败时降级为可运行兜底计划。 */
    const safeValidation = validation.ok ? validation : this.validateAgentPlan(safePlan); /* 为实际执行计划生成校验结果。 */
    const validationSpanId = this.traceManager.startSpan(trace.traceId, { parentSpanId: workflowSpanId, name: "supervisor-plan-validation", type: "agent", metadata: { validationOk: validation.ok, errorCount: validation.errors.length } }); /* 第44天：把 Supervisor 计划校验记录为 agent span（智能体跨度）。 */
    this.traceManager.endSpan(trace.traceId, validationSpanId, safeValidation.ok ? "success" : "failed", { safeValidationOk: safeValidation.ok }); /* 第44天：结束计划校验跨度并写入安全计划校验结果。 */
    const workspace = context?.workspace ?? createWorkspace(safePlan.goal); /* 第43天：为本次多 Agent 协作创建共享工作空间。 */
    await this.workspaceStore.create(workspace); /* 第43天：把工作空间写入存储，供后续 Agent 读写。 */
    const workspaceContext: AgentContext = { memory: context?.memory, workflow: context?.workflow, tools: context?.tools, workspace, trace: { traceId: trace.traceId, parentSpanId: workflowSpanId } }; /* 第44天：把共享工作空间和 Trace（追踪记录）注入 AgentContext。 */
    this.pushTimeline("supervisor", "day46-evaluation-plan-task", validation.ok ? "supervisor planned evaluable workspace DAG" : "supervisor fallback planned evaluable workspace DAG"); /* 第46天：记录兼容 Evaluation（评估）的工作空间 DAG 规划事件。 */
    const resultsByStepId = new Map<string, AgentResult>(); /* 保存每个步骤的执行结果。 */
    const orderedResults: AgentResult[] = []; /* 保存按执行顺序排列的结果。 */
    const pendingSteps = new Map(safePlan.steps.map((step) => [step.id, step])); /* 保存尚未执行的 DAG 节点。 */
    while (pendingSteps.size > 0) { /* 循环寻找当前批次可运行节点，直到所有节点完成。 */
      const runnableSteps = Array.from(pendingSteps.values()).filter((step) => (step.dependsOn ?? []).every((dep) => resultsByStepId.has(dep))); /* 找出所有依赖已经完成的可运行节点。 */
      if (runnableSteps.length === 0) break; /* 如果没有可运行节点，说明安全计划仍有异常，退出避免死循环。 */
      this.pushTimeline("supervisor", `day46-evaluation-batch-${orderedResults.length + 1}`, `parallel evaluable workspace batch: ${runnableSteps.map((step) => step.id).join(", ")}`); /* 第46天：记录本轮兼容 Evaluation（评估）的并行批次。 */
      const batchSpanId = this.traceManager.startSpan(trace.traceId, { parentSpanId: workflowSpanId, name: `parallel-batch-${orderedResults.length + 1}`, type: "queue", metadata: { stepIds: runnableSteps.map((step) => step.id) } }); /* 第44天：把当前并行批次记录为 queue span（队列跨度）。 */
      const batchContext: AgentContext = { ...workspaceContext, trace: { traceId: trace.traceId, parentSpanId: batchSpanId } }; /* 第44天：让本批次中的 Agent span 挂到 queue span（队列跨度）下。 */
      const batchResults = await Promise.all(runnableSteps.map((step) => this.executeDAGStep(step, resultsByStepId, batchContext, rt))); /* 第44天：使用带共享工作空间和 Trace（追踪）的上下文并行执行当前批次节点。 */
      this.traceManager.endSpan(trace.traceId, batchSpanId, "success", { completedStepIds: batchResults.map(({ step }) => step.id) }); /* 第44天：结束当前 queue span（队列跨度）并记录完成步骤。 */
      batchResults.forEach(({ step, result }) => { resultsByStepId.set(step.id, result); orderedResults.push(result); pendingSteps.delete(step.id); }); /* 将本批次结果写入 Agent Result Store 并解锁后续节点。 */
    } /* 结束 DAG 执行循环。 */
    const finalResults = this.getFinalResults(safePlan.steps, resultsByStepId); /* 收集没有下游依赖的最终节点结果。 */
    const rootResult = finalResults[0] ?? orderedResults[0] ?? await this.executeAgent("writer", { id: "day46-empty-evaluation-fallback", goal: safePlan.goal, assignedAgentId: "writer" }, workspaceContext, rt); /* 第46天：获取最终结果或空 DAG 兜底结果。 */
    const result = this.aggregateResults(rootResult, finalResults.length ? finalResults.slice(1) : orderedResults.slice(1)); /* 聚合所有最终节点或执行结果。 */
    const abSpanId = this.traceManager.startSpan(trace.traceId, { parentSpanId: workflowSpanId, name: "prompt-ab-test", type: "evaluation", metadata: { goal: safePlan.goal } }); /* 第45天：把 Prompt A/B Test（提示词 A/B 测试）记录为评估跨度。 */
    const abStartedAt = Date.now(); /* 第47天：记录 Prompt ROI 测试阶段开始时间。 */
    const promptABTest = this.runPromptABTest(safePlan.goal, result.output); /* 第45天：基于最终输出运行规则型 Prompt A/B Test（提示词 A/B 测试）。 */
    const abUsage = this.recordComponentUsage(trace.traceId, abSpanId, "evaluation", "prompt-roi-test", `${promptABTest.promptVersionA}\n${promptABTest.promptVersionB}\n${safePlan.goal}`, JSON.stringify(promptABTest), abStartedAt); /* 第47天：记录提示词对比本身消耗的词元、费用和耗时。 */
    this.traceManager.endSpan(trace.traceId, abSpanId, "success", { scoreA: promptABTest.scoreA, scoreB: promptABTest.scoreB, winner: promptABTest.winner, totalTokens: abUsage.totalTokens, estimatedCost: abUsage.estimatedCost }); /* 第47天：结束 A/B 测试跨度并附加 ROI 核算用量。 */
    await this.writePromptABTestWorkspaceEntry(workspace.id, promptABTest); /* 第45天：把 A/B 测试结论写入 Workspace（工作空间）。 */
    this.pushTimeline("evaluation", "day46-prompt-ab-test", `Prompt A/B Test winner ${promptABTest.winner}`); /* 第46天：把兼容的提示词 A/B 测试结果写入时间线。 */
    await this.summarizeWorkspace(workspace.id); /* 第43天：在协作结束后把工作空间压缩为摘要条目。 */
    const resultStore = Object.fromEntries(resultsByStepId.entries()); /* 将 Map 结果存储转换为可序列化对象。 */
    const dagMetrics = this.calculateDAGMetrics(safePlan.steps); /* 第43天：计算 Agent Workspace DAG 指标。 */
    const finalWorkspace = await this.workspaceStore.get(workspace.id) ?? workspace; /* 第43天：读取包含全部 Agent 写入内容的最终工作空间快照。 */
    const workspaceMetrics = await this.workspaceStore.getMetrics(workspace.id); /* 第43天：计算共享工作空间指标。 */
    this.traceManager.endSpan(trace.traceId, workflowSpanId, "success", { resultCount: orderedResults.length, workspaceEntries: finalWorkspace.entries.length }); /* 第44天：结束 workflow span（工作流跨度）并记录结果数量和工作空间条目数量。 */
    const finalTrace = this.closeActiveTrace() ?? trace; /* 第44天：关闭当前 Trace（追踪记录）并得到最终链路快照。 */
    return { result, callGraph: this.callGraph, timeline: this.timeline, metrics: this.getRuntimeMetrics(), dagMetrics, resultStore, workspace: finalWorkspace, workspaceMetrics, reflectionAttempts: this.reflectionAttempts, reflectionMetrics: this.getReflectionMetrics(), evaluations: this.evaluationRecords, evaluationMetrics: this.getEvaluationMetrics(), promptABTest, trace: finalTrace, traces: this.traceManager.listTraces(), traceMetrics: this.traceManager.getMetrics(), plan: safePlan, validation: safeValidation }; /* 第45天：返回包含 Workspace、Reflection、Evaluation 和 Trace（追踪）指标的 DAG 计划执行快照。 */
  } /* 结束 executeAgentPlan 方法。 */

  private async executeDAGStep(step: AgentPlanStep, resultsByStepId: Map<string, AgentResult>, context?: AgentContext, rt?: ModelRuntime): Promise<{ step: AgentPlanStep; result: AgentResult }> { /* 定义执行单个 DAG 节点并返回步骤配对结果的方法。 */
    const parentResults = (step.dependsOn ?? []).map((dep) => resultsByStepId.get(dep)).filter((result): result is AgentResult => Boolean(result)); /* 按 dependsOn 收集当前节点所有父级结果。 */
    const fromAgentId = parentResults.at(-1)?.agentId ?? "supervisor"; /* 使用最后一个父级 Agent 或 Supervisor 作为主要委派来源。 */
    parentResults.slice(0, -1).forEach((result) => this.callGraph.push({ fromAgentId: result.agentId, toAgentId: step.agentId, taskId: step.id })); /* 为多个父节点补充调用图边。 */
    const task: AgentTask = { id: step.id, goal: step.task, parentTaskId: parentResults.at(-1)?.taskId, context: { previousResults: parentResults, parentResults } }; /* 创建包含 previousResults 和 parentResults 的 DAG 上下文。 */
    const workspace = context?.workspace ? await this.refreshWorkspace(context.workspace) : undefined; /* 第43天：执行节点前刷新共享工作空间，让下游 Agent 读取最新条目。 */
    const nextContext = context && workspace ? { ...context, workspace } : context; /* 第43天：把刷新后的工作空间重新注入当前节点上下文。 */
    const result = await this.delegateTask(fromAgentId, step.agentId, task, nextContext, rt); /* 第43天：通过带工作空间的委派入口执行当前 DAG 节点。 */
    return { step, result }; /* 返回步骤和执行结果，便于外层写入 Result Store。 */
  } /* 结束 executeDAGStep 方法。 */

  private getFinalResults(steps: AgentPlanStep[], resultsByStepId: Map<string, AgentResult>): AgentResult[] { /* 定义收集 DAG 出口节点结果的方法。 */
    const dependedIds = new Set(steps.flatMap((step) => step.dependsOn ?? [])); /* 收集所有被其他节点依赖的步骤 ID。 */
    return steps.filter((step) => !dependedIds.has(step.id)).map((step) => resultsByStepId.get(step.id)).filter((result): result is AgentResult => Boolean(result)); /* 返回没有下游依赖的最终节点结果。 */
  } /* 结束 getFinalResults 方法。 */

  async runSupervisorCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义第40天 Supervisor 协作入口。 */
    const trace = this.ensureTrace(`User Request（用户请求）：${goal}`); /* 第44天：为完整 Supervisor 协作启动 Trace（追踪记录）。 */
    const supervisorSpanId = this.traceManager.startSpan(trace.traceId, { name: "supervisor-plan", type: "agent", metadata: { goal } }); /* 第44天：为 Supervisor 规划阶段创建 agent span（智能体跨度）。 */
    try { /* 第44天：捕获 Supervisor 规划异常并写入 Trace（追踪记录）。 */
      const plan = await this.planAgents(goal, rt); /* 由 Supervisor 生成智能体计划。 */
      this.traceManager.endSpan(trace.traceId, supervisorSpanId, "success", { selectedAgents: plan.selectedAgents, stepCount: plan.steps.length }); /* 第44天：结束 Supervisor 规划跨度并记录选择的 Agent。 */
      return this.executeAgentPlan(plan, context, rt); /* 执行并返回计划协作快照。 */
    } catch (error) { /* 第44天：处理 Supervisor 规划异常。 */
      this.traceManager.endSpan(trace.traceId, supervisorSpanId, "failed", { error: this.describeError(error) }); /* 第44天：把规划异常写入 Supervisor span。 */
      this.closeActiveTrace(); /* 第44天：规划失败时关闭当前 Trace（追踪记录）。 */
      throw error; /* 第44天：继续抛出异常保持原有错误语义。 */
    } /* 第44天：结束 Supervisor 规划异常处理。 */
  } /* 结束 runSupervisorCollaboration 方法。 */

  async runFixedCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义兼容 Day39 的固定链路入口。 */
    const trace = this.ensureTrace(`Fixed Collaboration（固定协作）：${goal}`); /* 第44天：为固定协作链启动 Trace（追踪记录）。 */
    const fixedPlanSpanId = this.traceManager.startSpan(trace.traceId, { name: "fixed-plan", type: "workflow", metadata: { goal } }); /* 第44天：把固定计划构建记录为 workflow span（工作流跨度）。 */
    const plan: AgentPlan = { goal, selectedAgents: ["research", "planner", "critic", "writer"], reason: "兼容 Day39 固定协作链。", steps: this.buildPlanSteps(goal, ["research", "planner", "critic", "writer"]) }; /* 构建固定链路计划。 */
    this.traceManager.endSpan(trace.traceId, fixedPlanSpanId, "success", { stepCount: plan.steps.length }); /* 第44天：结束固定计划构建跨度并记录步骤数量。 */
    return this.executeAgentPlan(plan, context, rt); /* 复用第40天计划执行器。 */
  } /* 结束 runFixedCollaboration 方法。 */

  listTraces(): Trace[] { /* 第48天：定义读取全部 Trace（追踪记录）的方法，便于校验 cache span（缓存跨度）接入。 */
    return this.traceManager.listTraces(); /* 第48天：返回当前 TraceManager 保存的全部追踪记录。 */
  } /* 第48天：结束 listTraces 方法。 */

  getRuntimeMetrics(): AgentCollaborationSnapshot["metrics"] { /* 定义读取运行时指标的方法。 */
    const avgTaskDuration = this.metrics.executedTasks ? Number((this.metrics.totalDuration / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算平均任务耗时。 */
    const successRate = this.metrics.executedTasks ? Number((this.metrics.successfulTasks / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算任务成功率。 */
    return { executedTasks: this.metrics.executedTasks, delegatedTasks: this.metrics.delegatedTasks, avgTaskDuration, successRate }; /* 返回运行时指标快照。 */
  } /* 结束 getRuntimeMetrics 方法。 */

  private ensureTrace(rootOperation: string): Trace { /* 第44天：确保当前运行时拥有可写入的 Trace（追踪记录）。 */
    const activeTrace = this.activeTraceId ? this.traceManager.getTrace(this.activeTraceId) : undefined; /* 第44天：读取当前激活的 Trace（追踪记录）。 */
    if (activeTrace) return activeTrace; /* 第44天：已有激活 Trace 时直接复用，保证整条链路连续。 */
    const trace = this.traceManager.startTrace(rootOperation); /* 第44天：没有激活 Trace 时创建一条新的追踪记录。 */
    this.activeTraceId = trace.traceId; /* 第44天：把新 Trace ID 保存为当前激活链路。 */
    return trace; /* 第44天：返回可写入的 Trace（追踪记录）。 */
  } /* 第44天：结束 ensureTrace 方法。 */

  private closeActiveTrace(): Trace | undefined { /* 第44天：关闭当前激活的 Trace（追踪记录）。 */
    if (!this.activeTraceId) return undefined; /* 第44天：没有激活 Trace 时返回空值。 */
    const trace = this.traceManager.endTrace(this.activeTraceId); /* 第44天：结束当前 Trace 并兜底关闭所有运行中的 Span。 */
    this.activeTraceId = ""; /* 第44天：清空激活 Trace ID，避免后续请求误用旧链路。 */
    return trace; /* 第44天：返回结束后的 Trace（追踪记录）。 */
  } /* 第44天：结束 closeActiveTrace 方法。 */

  private recordComponentUsage(traceId: string, spanId: string, componentType: UsageComponentType, componentId: string, inputText: string, outputText: string, startedAt: number, promptInfo?: ResolvedPrompt): UsageRecord { /* 第52天：定义各运行阶段共享的用量写入方法并支持提示词版本。 */
    const model = this.routeComponentModel(componentType, componentId); /* 第50天：先用 ModelRouter 为当前组件选择最合适的模型。 */
    return this.usageStore.addRecord({ traceId, spanId, componentType, componentId, inputTokens: estimateTokenCount(inputText), outputTokens: estimateTokenCount(outputText), durationMs: Math.max(1, Date.now() - startedAt), modelId: model.id, provider: model.provider, modelName: model.model, promptId: promptInfo?.promptId, promptVersion: promptInfo?.promptVersion }); /* 第52天：写入模型信息和提示词版本，实现 Prompt Version 成本归因。 */
  } /* 第47天：结束运行阶段用量写入方法。 */

  private routeComponentModel(componentType: UsageComponentType, componentId: string): ModelProfile { /* 第50天：定义把运行阶段映射为模型路由输入并选择模型的方法。 */
    if (componentType === "reflection") return this.modelRouterStore.route({ taskType: "reflection", complexity: "medium" }); /* 第50天：反思阶段路由到评估模型保证稳定。 */
    if (componentType === "evaluation") return this.modelRouterStore.route({ taskType: "evaluation", complexity: "medium" }); /* 第50天：评估阶段路由到评估模型保证稳定。 */
    if (componentType === "tool") return this.modelRouterStore.route(this.toolRoutingInput(componentId)); /* 第50天：工具阶段按工具名称推导路由输入。 */
    return this.modelRouterStore.route(this.agentRoutingInput(componentId)); /* 第50天：智能体阶段按智能体职责推导路由输入。 */
  } /* 第50天：结束运行阶段模型路由方法。 */

  private agentRoutingInput(agentId: string): ModelRoutingInput { /* 第50天：定义把智能体职责映射为模型路由输入的方法。 */
    if (agentId === "planner" || agentId === "supervisor") return { taskType: "planning", complexity: "high", latencyPreference: "quality" }; /* 第50天：规划与调度需要大型推理模型。 */
    if (agentId === "critic") return { taskType: "evaluation", complexity: "medium" }; /* 第50天：审查智能体复用评估模型做质量把关。 */
    if (agentId === "writer") return { taskType: "summary", complexity: "low", latencyPreference: "fast" }; /* 第50天：写作总结类任务路由到小型对话模型。 */
    return { taskType: "chat", complexity: "medium" }; /* 第50天：其余智能体默认按中等复杂度的对话任务路由。 */
  } /* 第50天：结束智能体路由输入推导方法。 */

  private toolRoutingInput(toolName: string): ModelRoutingInput { /* 第50天：定义把工具名称映射为模型路由输入的方法。 */
    if (/retrieval|rag|embed/i.test(toolName)) return { taskType: "embedding" }; /* 第50天：检索与嵌入类工具路由到嵌入模型。 */
    if (/rewrite|json|structur/i.test(toolName)) return { taskType: "json", requiresJson: true }; /* 第50天：查询改写与结构化工具路由到 JSON 模型。 */
    if (/summary|summar/i.test(toolName)) return { taskType: "summary", complexity: "low" }; /* 第50天：总结类工具路由到小型对话模型。 */
    return { taskType: "chat", complexity: "medium" }; /* 第50天：其余工具默认按对话任务路由。 */
  } /* 第50天：结束工具路由输入推导方法。 */

  private async recordDeclaredToolSpans(traceId: string, parentSpanId: string, agentId: string, tools: string[], taskId: string, attempt: number): Promise<void> { /* 第44天：把 Agent 声明工具记录成可观测 Tool Span（工具跨度）。 */
    for (const toolName of tools) { /* 第44天：遍历当前 Agent 声明的工具名称。 */
      const spanType = this.getToolSpanType(toolName); /* 第44天：根据工具名称决定是 tool span 还是 retrieval span。 */
      const resolvedToolPrompt = this.resolvePrompt(toolName, `${toolName} 工具为 ${agentId} 处理任务 ${taskId}。`, { task: `${agentId}/${taskId}/attempt-${attempt}`, memory: "工具声明式演示无额外记忆。", workspace: "工具声明式演示无额外工作空间。", tools: toolName }); /* 第52天：从 PromptRegistry 读取工具提示词版本，缺失时使用安全兜底文案。 */
      const toolSpanId = this.traceManager.startSpan(traceId, { parentSpanId, name: toolName, type: spanType, metadata: { agentId, taskId, attempt, simulated: true, promptId: resolvedToolPrompt.promptId, promptVersion: resolvedToolPrompt.promptVersion } }); /* 第52天：创建工具或检索跨度并写入提示词版本。 */
      const toolStartedAt = Date.now(); /* 第47天：记录声明式工具阶段开始时间。 */
      const toolOutput = `${toolName} 已为 ${agentId} 完成任务 ${taskId} 的第 ${attempt} 次工具处理。`; /* 第47天：构造可核算且可解释的工具执行摘要。 */
      const toolUsage = this.recordComponentUsage(traceId, toolSpanId, "tool", toolName, resolvedToolPrompt.text, toolOutput, toolStartedAt, resolvedToolPrompt); /* 第52天：把声明式工具统一接入 Usage 并记录提示词版本。 */
      this.traceManager.endSpan(traceId, toolSpanId, "success", { note: "当前演示运行时记录声明式工具链路，真实 ToolRegistry 调用也支持 Trace 接入。", totalTokens: toolUsage.totalTokens, estimatedCost: toolUsage.estimatedCost, promptId: resolvedToolPrompt.promptId, promptVersion: resolvedToolPrompt.promptVersion }); /* 第52天：结束工具跨度并附加词元、费用和提示词版本摘要。 */
    } /* 第44天：结束工具名称遍历。 */
  } /* 第44天：结束 recordDeclaredToolSpans 方法。 */

  private getToolSpanType(toolName: string): TraceSpanType { /* 第44天：把工具名称映射为 TraceSpanType（追踪跨度类型）。 */
    return /retrieval|rag/i.test(toolName) ? "retrieval" : "tool"; /* 第44天：检索和 RAG 工具归为 retrieval，其余工具归为 tool。 */
  } /* 第44天：结束 getToolSpanType 方法。 */

  private describeError(error: unknown): string { /* 第44天：把未知异常转换为可写入 metadata 的字符串。 */
    return error instanceof Error ? error.message : String(error); /* 第44天：优先使用 Error.message，否则使用字符串化结果。 */
  } /* 第44天：结束 describeError 方法。 */

  private resolvePrompt(componentId: string, fallback: string, variables: Record<string, string | number | boolean | undefined | null>): ResolvedPrompt { /* 第52天：定义从注册表解析 active Prompt 并安全渲染的方法。 */
    const template = this.promptRegistryStore.getActive(componentId); /* 第52天：读取组件当前 active（启用中）提示词模板。 */
    const text = safeRenderPrompt(template, variables, fallback); /* 第52天：渲染模板，变量缺失时回退到旧提示词。 */
    return { promptId: template?.id, promptVersion: template?.version, text }; /* 第52天：返回提示词元数据和最终正文。 */
  } /* 第52天：结束提示词解析方法。 */

  private buildPromptVariables(task: AgentTask, context: AgentContext | undefined, tools: string[] = [], agentId = task.assignedAgentId ?? "unknown", output = ""): Record<string, string> { /* 第52天：定义运行时提示词变量构造方法。 */
    return { task: task.goal, memory: this.describePromptMemory(context), workspace: this.describePromptWorkspace(context), tools: tools.join(", ") || "无可用工具", agentId, output: output || "暂无输出", threshold: String(this.reflectionThreshold), agents: this.describeAvailableAgents() }; /* 第52天：返回 PromptTemplate 可能用到的统一变量集合。 */
  } /* 第52天：结束提示词变量构造方法。 */

  private describePromptMemory(context?: AgentContext): string { /* 第52天：定义 Memory（记忆）变量摘要方法。 */
    if (!context?.memory) return "暂无记忆上下文。"; /* 第52天：没有记忆时返回明确占位。 */
    try { return JSON.stringify(context.memory).slice(0, 800); } catch { return "记忆上下文无法序列化。"; } /* 第52天：尽量序列化记忆并限制长度，失败时返回安全文案。 */
  } /* 第52天：结束记忆变量摘要方法。 */

  private describePromptWorkspace(context?: AgentContext): string { /* 第52天：定义 Workspace（工作空间）变量摘要方法。 */
    if (!context?.workspace) return "暂无共享工作空间。"; /* 第52天：没有工作空间时返回明确占位。 */
    const entries = context.workspace.entries.slice(-5).map((entry) => `${entry.type}:${entry.content}`).join("\n"); /* 第52天：只取最近五条工作空间记录，避免提示词过长。 */
    return entries || `工作空间 ${context.workspace.id} 暂无条目。`; /* 第52天：返回最近条目或空工作空间提示。 */
  } /* 第52天：结束工作空间变量摘要方法。 */

  private describeAvailableAgents(): string { /* 第52天：定义可用 Agent 列表变量摘要方法。 */
    return this.registry.list().map((agent) => `${agent.id}: ${agent.description}`).join("\n"); /* 第52天：把注册表中的 Agent 压缩成调度提示词可用文本。 */
  } /* 第52天：结束可用 Agent 摘要方法。 */

  private buildSupervisorPrompt(goal: string): string { /* 定义 Supervisor 模型规划提示词生成方法。 */
    const agents = this.registry.list().filter((agent) => agent.id !== "supervisor"); /* 读取除 Supervisor 外的可调度业务智能体。 */
    const agentList = agents.map((agent) => `- ${agent.id}: ${agent.description}\n  capabilities: ${agent.capabilities.join(", ")}`).join("\n"); /* 将可用 Agent 列表格式化进提示词。 */
    return `可用 Agent：\n${agentList}\n\n请根据用户目标选择必要 Agent，并生成第45天 Production Runtime V2 Evaluation Agent Plan。\n要求：\n1. 只选择必要业务 Agent，不要所有任务都用全量 Agent。\n2. selectedAgents 和 steps.agentId 只能使用上方 Agent id。\n3. steps 表示 DAG 节点，不要求线性串行，但每个节点必须有稳定 id。\n4. 可以并行的步骤必须写相同的上游 dependsOn，例如 concept 和 roadmap 同时依赖 research。\n5. dependsOn 只能引用已经存在的 step.id，不能出现循环依赖，不能出现无意义孤儿节点。\n6. 最终 writer 节点应依赖所有需要汇总的上游结果，并把最终内容沉淀到 Shared Workspace，运行时会自动记录 Trace、Reflection 和 Evaluation。\n7. 只返回 JSON，不要 Markdown。\n\nJSON 格式：\n{\n  "goal": "...",\n  "selectedAgents": ["..."],\n  "reason": "...",\n  "steps": [\n    { "id": "research", "agentId": "research", "task": "...", "dependsOn": [] },\n    { "id": "concept", "agentId": "writer", "task": "...", "dependsOn": ["research"] },\n    { "id": "roadmap", "agentId": "planner", "task": "...", "dependsOn": ["research"] },\n    { "id": "writer", "agentId": "writer", "task": "...", "dependsOn": ["concept", "roadmap"] }\n  ]\n}\n\n用户目标：${goal}`; /* 第45天：返回完整 Supervisor 可评估 DAG 提示词。 */
  } /* 结束 buildSupervisorPrompt 方法。 */

  private parseAgentPlanFromText(text: string, goal: string): AgentPlan | null { /* 定义从模型文本中解析 AgentPlan 的方法。 */
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text; /* 优先提取首个 JSON 对象文本。 */
    try { /* 捕获 JSON 解析错误。 */
      const parsed = JSON.parse(jsonText) as Partial<AgentPlan>; /* 将文本解析为宽松 AgentPlan。 */
      if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) return null; /* 没有步骤时视为无效计划。 */
      const steps = parsed.steps.map((step, index) => this.normalizePlanStep(step as Partial<AgentPlanStep>, index)); /* 标准化每个计划步骤。 */
      const selectedAgents = Array.isArray(parsed.selectedAgents) ? parsed.selectedAgents.filter((agentId): agentId is string => typeof agentId === "string") : Array.from(new Set(steps.map((step) => step.agentId))); /* 标准化 selectedAgents。 */
      return { goal: typeof parsed.goal === "string" && parsed.goal.trim() ? parsed.goal.trim() : goal, selectedAgents, reason: typeof parsed.reason === "string" ? parsed.reason : "Supervisor 根据用户目标生成计划。", steps }; /* 返回标准 AgentPlan。 */
    } catch { /* 处理 JSON 解析失败。 */
      return null; /* 解析失败时返回 null。 */
    } /* 结束 catch。 */
  } /* 结束 parseAgentPlanFromText 方法。 */

  private normalizePlanStep(step: Partial<AgentPlanStep>, index: number): AgentPlanStep { /* 定义计划步骤标准化方法。 */
    const fallbackId = `day46-step-${index + 1}-${typeof step.agentId === "string" ? step.agentId : "agent"}`; /* 第46天：生成缺省步骤 ID。 */
    return { id: typeof step.id === "string" && step.id.trim() ? step.id.trim() : fallbackId, agentId: typeof step.agentId === "string" ? step.agentId.trim() : "", task: typeof step.task === "string" ? step.task.trim() : "", dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.filter((dep): dep is string => typeof dep === "string") : [] }; /* 返回标准化后的步骤。 */
  } /* 结束 normalizePlanStep 方法。 */

  private createRuleBasedPlan(goal: string, reasonPrefix: string): AgentPlan { /* 定义规则型 Supervisor 兜底计划。 */
    const normalizedGoal = goal.toLowerCase(); /* 将目标转成小写用于规则匹配。 */
    const hasResearchIntent = /研究|学习|资料|检索|搜索|rag|langgraph|报告/i.test(normalizedGoal); /* 判断是否需要研究智能体。 */
    const hasPlanIntent = /计划|规划|路线|三天|workflow|拆解|学习/i.test(normalizedGoal); /* 判断是否需要规划智能体。 */
    const hasCriticIntent = /检查|审查|漏洞|风险|问题|评审|报告/i.test(normalizedGoal); /* 判断是否需要审查智能体。 */
    const writerOnlyIntent = /总结|润色|改写|输出|表达|文字/i.test(normalizedGoal) && !hasResearchIntent && !hasPlanIntent && !hasCriticIntent; /* 判断是否属于仅写作任务。 */
    const selectedAgents = writerOnlyIntent ? ["writer"] : [...(hasResearchIntent ? ["research"] : []), ...(hasPlanIntent ? ["planner"] : []), ...(hasCriticIntent ? ["critic"] : []), "writer"]; /* 生成必要智能体列表并默认保留最终写作。 */
    const uniqueAgents = Array.from(new Set(selectedAgents)); /* 对智能体列表去重并保持顺序。 */
    const steps = this.buildPlanSteps(goal, uniqueAgents); /* 根据已选智能体构建执行步骤。 */
    return { goal, selectedAgents: uniqueAgents, reason: `${reasonPrefix}${this.describeSupervisorReason(uniqueAgents)}`, steps }; /* 返回规则型 Supervisor 决策计划。 */
  } /* 结束 createRuleBasedPlan 方法。 */

  private buildPlanSteps(goal: string, selectedAgents: string[]): AgentPlanStep[] { /* 定义根据智能体列表生成计划步骤的方法。 */
    if (selectedAgents.includes("research") && selectedAgents.includes("planner") && selectedAgents.includes("writer")) { /* 判断是否适合生成 Research 后并行 Concept 与 Roadmap 的 DAG。 */
      const conceptNeeded = selectedAgents.includes("critic"); /* 判断是否需要额外审查分支参与并行。 */
      return [{ id: "research", agentId: "research", task: this.buildTaskForAgent("research", goal), dependsOn: [] }, { id: "concept", agentId: "writer", task: `总结核心概念并形成可汇总材料：${goal}`, dependsOn: ["research"] }, { id: "roadmap", agentId: "planner", task: this.buildTaskForAgent("planner", goal), dependsOn: ["research"] }, ...(conceptNeeded ? [{ id: "critic", agentId: "critic", task: this.buildTaskForAgent("critic", goal), dependsOn: ["research"] }] : []), { id: "writer", agentId: "writer", task: this.buildTaskForAgent("writer", goal), dependsOn: conceptNeeded ? ["concept", "roadmap", "critic"] : ["concept", "roadmap"] }]; /* 返回带并行分支和最终汇总节点的 DAG 步骤。 */
    } /* 结束 DAG 兜底计划分支。 */
    return selectedAgents.map((agentId, index) => ({ id: `day46-step-${index + 1}-${agentId}`, agentId, task: this.buildTaskForAgent(agentId, goal), dependsOn: index === 0 ? [] : [`day46-step-${index}-${selectedAgents[index - 1]}`] })); /* 第46天：对简单任务保留可执行的线性 Evaluable Workspace DAG。 */
  } /* 结束 buildPlanSteps 方法。 */

  private buildTaskForAgent(agentId: string, goal: string): string { /* 定义为不同智能体生成任务文案的方法。 */
    if (agentId === "research") return `围绕用户目标收集和整理资料：${goal}`; /* 返回研究任务。 */
    if (agentId === "planner") return `基于已有信息制定可执行计划：${goal}`; /* 返回规划任务。 */
    if (agentId === "critic") return `审查当前方案的漏洞、风险和遗漏：${goal}`; /* 返回审查任务。 */
    return `整合前置结果并生成面向用户的最终输出：${goal}`; /* 返回写作任务。 */
  } /* 结束 buildTaskForAgent 方法。 */

  private describeSupervisorReason(selectedAgents: string[]): string { /* 定义 Supervisor 决策原因生成方法。 */
    const labels: Record<string, string> = { research: "需要资料检索或背景整理", planner: "需要步骤拆解或学习计划", critic: "需要风险审查或质量检查", writer: "需要最终总结和表达输出" }; /* 定义智能体原因映射。 */
    return selectedAgents.map((agentId) => labels[agentId] ?? `${agentId} 参与调度`).join("；"); /* 返回可读的调度原因。 */
  } /* 结束 describeSupervisorReason 方法。 */

  private createFallbackPlan(goal: string, errors: string[]): AgentPlan { /* 定义计划校验失败时的兜底计划。 */
    return { goal, selectedAgents: ["writer"], reason: `原计划校验失败，降级为 Writer Agent 兜底输出：${errors.join("；")}`, steps: [{ id: "day46-fallback-writer", agentId: "writer", task: `整理用户目标并输出可读结果：${goal}`, dependsOn: [] }] }; /* 第46天：返回 Writer 兜底计划并交给 Evaluation（评估）量化质量。 */
  } /* 结束 createFallbackPlan 方法。 */

  private hasDependencyCycle(steps: AgentPlanStep[]): boolean { /* 定义检测步骤循环依赖的方法。 */
    const graph = new Map(steps.map((step) => [step.id, step.dependsOn ?? []])); /* 将步骤依赖转换为图结构。 */
    const visiting = new Set<string>(); /* 保存当前递归栈中的步骤。 */
    const visited = new Set<string>(); /* 保存已经完成检查的步骤。 */
    const visit = (id: string): boolean => { /* 定义深度优先搜索函数。 */
      if (visiting.has(id)) return true; /* 再次遇到递归栈节点说明有环。 */
      if (visited.has(id)) return false; /* 已检查节点不重复处理。 */
      visiting.add(id); /* 将当前节点加入递归栈。 */
      const hasCycle = (graph.get(id) ?? []).some(visit); /* 递归检查依赖节点。 */
      visiting.delete(id); /* 当前节点检查结束后移出递归栈。 */
      visited.add(id); /* 标记当前节点已经检查。 */
      return hasCycle; /* 返回是否发现循环依赖。 */
    }; /* 结束 visit 函数定义。 */
    return steps.some((step) => visit(step.id)); /* 检查任意步骤是否存在循环依赖。 */
  } /* 结束 hasDependencyCycle 方法。 */

  private findOrphanSteps(steps: AgentPlanStep[]): string[] { /* 第43天：定义孤儿节点检测方法。 */
    if (steps.length <= 1) return []; /* 单节点计划天然不是孤儿 DAG。 */
    const dependedIds = new Set(steps.flatMap((step) => step.dependsOn ?? [])); /* 收集所有被下游节点依赖的步骤 ID。 */
    return steps.filter((step) => (step.dependsOn ?? []).length === 0 && !dependedIds.has(step.id)).map((step) => step.id); /* 返回既无入边也无出边的孤立步骤。 */
  } /* 结束 findOrphanSteps 方法。 */

  private calculateDAGMetrics(steps: AgentPlanStep[]): AgentDAGMetrics { /* 第43天：定义 Workspace DAG 指标计算方法。 */
    const depthMemo = new Map<string, number>(); /* 保存每个节点深度，避免重复计算。 */
    const stepMap = new Map(steps.map((step) => [step.id, step])); /* 将步骤列表转换为按 ID 查找的 Map。 */
    const depthOf = (stepId: string): number => { /* 定义递归计算节点深度的函数。 */
      if (depthMemo.has(stepId)) return depthMemo.get(stepId) ?? 1; /* 命中缓存时直接返回深度。 */
      const step = stepMap.get(stepId); /* 读取当前步骤。 */
      const parentDepths = (step?.dependsOn ?? []).map(depthOf); /* 递归计算所有父节点深度。 */
      const depth = parentDepths.length ? Math.max(...parentDepths) + 1 : 1; /* 没有父节点时深度为 1，否则为父节点最大深度加 1。 */
      depthMemo.set(stepId, depth); /* 缓存当前节点深度。 */
      return depth; /* 返回当前节点深度。 */
    }; /* 结束 depthOf 函数定义。 */
    const depths = steps.map((step) => depthOf(step.id)); /* 计算所有节点深度。 */
    const widthByDepth = depths.reduce<Record<number, number>>((acc, depth) => ({ ...acc, [depth]: (acc[depth] ?? 0) + 1 }), {}); /* 统计每一层包含多少节点。 */
    const parallelSteps = steps.filter((step) => (widthByDepth[depthOf(step.id)] ?? 0) > 1).length; /* 统计处在多节点层级中的可并行步骤数量。 */
    const maxDepth = depths.length ? Math.max(...depths) : 0; /* 计算 DAG 最大深度。 */
    return { totalSteps: steps.length, parallelSteps, maxDepth, criticalPathLength: maxDepth }; /* 返回 DAG 指标快照。 */
  } /* 结束 calculateDAGMetrics 方法。 */

  private async buildAgentUserPrompt(task: AgentTask, context?: AgentContext, attempt = 1, previousReflection?: ReflectionResult): Promise<string> { /* 第43天：定义包含 Reflection（反思）建议的 Agent 用户提示词生成方法。 */
    const previousResults = this.extractPreviousResults(task.context); /* 提取前置 Agent 输出。 */
    const previousText = previousResults.length ? previousResults.map((result) => `【${result.agentId} / ${result.taskId}】\n${result.output}`).join("\n\n") : "无"; /* 格式化前置结果文本。 */
    const workspaceEntries = context?.workspace ? await this.workspaceStore.listEntries(context.workspace.id) : []; /* 第43天：读取共享工作空间已有条目。 */
    const workspaceText = workspaceEntries.length ? workspaceEntries.map((entry) => `[${entry.type}] ${entry.agentId}: ${entry.content}`).join("\n\n") : "无"; /* 第43天：格式化共享工作空间条目文本。 */
    const reflectionText = previousReflection ? `上一轮 Reflection（反思）评分：${previousReflection.score}；问题：${previousReflection.issues.join("；") || "无"}；建议：${previousReflection.suggestions.join("；") || "无"}` : "当前是首次生成，暂无上一轮反思建议。"; /* 第43天：格式化上一轮反思建议，供重试时定向修正。 */
    const experienceText = this.describeLongTermExperience(context?.memory); /* 第49天：从上下文记忆中提取长期经验文本。 */
    return `当前任务：\n${task.goal}\n\n前置 Agent 输出：\n${previousText}\n\n共享工作空间：\n${workspaceText}\n\nLong-Term Experience（长期经验）：\n${experienceText}\n\nReflection Context（反思上下文）：\n第 ${attempt} 轮生成；${reflectionText}\n\n请只完成当前 Agent 职责范围内的工作；如果存在相关长期经验，请优先复用；如果这是重试，请优先修正 Reflection 指出的问题。`; /* 第49天：在第43天提示词基础上追加长期经验段落，把 Prompt 升级为 Prompt + Long-Term Experience。 */
  } /* 结束 buildAgentUserPrompt 方法。 */

  private describeLongTermExperience(memory?: unknown): string { /* 第49天：定义从上下文记忆中渲染长期经验文本的方法。 */
    if (!memory || typeof memory !== "object") return "暂无可复用的长期经验。"; /* 第49天：记忆为空或非对象时返回占位说明。 */
    const experiences = (memory as { longTermExperiences?: unknown }).longTermExperiences; /* 第49天：读取注入的长期经验数组。 */
    if (!Array.isArray(experiences) || experiences.length === 0) return "暂无可复用的长期经验。"; /* 第49天：没有经验时返回占位说明。 */
    return experiences.filter((item): item is string => typeof item === "string").map((item, index) => `${index + 1}. ${item}`).join("\n"); /* 第49天：把长期经验编号后逐条拼接为提示词文本。 */
  } /* 第49天：结束 describeLongTermExperience 方法。 */

  private extractPreviousResults(taskContext?: unknown): AgentResult[] { /* 定义从任务上下文提取前置结果的方法。 */
    if (!taskContext || typeof taskContext !== "object") return []; /* 上下文为空或非对象时返回空数组。 */
    const parentResults = (taskContext as { parentResults?: unknown }).parentResults; /* 第43天：读取 DAG parentResults 字段并配合 Workspace 使用。 */
    if (Array.isArray(parentResults)) return parentResults.filter((item): item is AgentResult => Boolean(item) && typeof item === "object" && typeof (item as AgentResult).output === "string"); /* 优先返回合法父级依赖结果数组。 */
    const previousResults = (taskContext as { previousResults?: unknown }).previousResults; /* 读取 previousResults 字段。 */
    return Array.isArray(previousResults) ? previousResults.filter((item): item is AgentResult => Boolean(item) && typeof item === "object" && typeof (item as AgentResult).output === "string") : []; /* 返回合法前置结果数组。 */
  } /* 结束 extractPreviousResults 方法。 */

  private async invokeAgentModel(systemPrompt: string, userPrompt: string, rt: ModelRuntime): Promise<string> { /* 定义单个 Agent 真实模型调用方法。 */
    const result = await invokeChatModel(rt, [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]); /* 使用 Agent systemPrompt 和任务上下文调用模型。 */
    return result.ok && result.text.trim() ? result.text.trim() : "模型暂时不可用，当前 Agent 未获得有效输出。"; /* 返回模型输出或失败兜底文本。 */
  } /* 结束 invokeAgentModel 方法。 */

  private buildSimulatedOutput(agentName: string, task: AgentTask, capabilities: string[], tools: string[], context?: AgentContext, attempt = 1, previousReflection?: ReflectionResult): string { /* 第43天：定义无模型运行时时可演示 Reflection 改进的输出方法。 */
    const contextText = this.describeContext(context, task.context); /* 生成上下文状态描述。 */
    const retryText = previousReflection ? `本轮根据反思建议补充：${previousReflection.suggestions.join("；") || "保持结构清晰"}。` : ""; /* 第43天：生成重试时展示的反思修正说明。 */
    const coverageText = attempt === 1 ? "初稿只给出简短结论和少量上下文，还没有展开关键概念、边界条件和下一步行动。" : "修正版补充完整性、准确性、逻辑性、覆盖度、关键概念、风险和下一步行动。"; /* 第43天：让模拟输出在重试后明显变好，便于测试反思指标。 */
    return `${agentName} 已处理任务 ${task.id}：${task.goal}。${coverageText}${retryText}能力：${capabilities.join(", ")}。工具：${tools.join(", ") || "无"}。上下文：${contextText}。`; /* 第43天：返回带尝试轮次差异的演示输出文本。 */
  } /* 结束 buildSimulatedOutput 方法。 */

  private describeContext(context?: AgentContext, taskContext?: unknown): string { /* 定义上下文说明生成方法。 */
    const memoryReady = context?.memory ? "已接收记忆上下文" : "暂无记忆上下文"; /* 生成记忆上下文状态。 */
    const workflowReady = context?.workflow ? "已接收工作流上下文" : "暂无工作流上下文"; /* 生成工作流上下文状态。 */
    const toolsReady = context?.tools ? "已接收工具上下文" : "暂无工具上下文"; /* 生成工具上下文状态。 */
    const taskReady = taskContext ? "已接收 previousResults 前置结果" : "暂无前置结果"; /* 生成任务上下文状态。 */
    const workspaceReady = context?.workspace ? `已接收共享工作空间 ${context.workspace.id}` : "暂无共享工作空间"; /* 第43天：生成共享工作空间上下文状态。 */
    return `${memoryReady}，${workflowReady}，${toolsReady}，${taskReady}，${workspaceReady}`; /* 第43天：返回合并后的上下文说明。 */
  } /* 结束 describeContext 方法。 */

  private async reflectResult(task: AgentTask, output: string, agentId: string, rt?: ModelRuntime): Promise<ReflectionResult> { /* 第43天：定义 Reflection（反思）评审入口，根据任务和输出生成质量判断。 */
    const reflectionAgent = this.registry.get("reflection"); /* 第43天：从注册表读取 Reflection Agent（反思智能体）。 */
    const resolvedPrompt = this.resolvePrompt("reflection", this.buildReflectionPrompt(task, output, agentId), { ...this.buildPromptVariables(task, undefined, reflectionAgent?.tools ?? [], agentId, output), output }); /* 第52天：从 PromptRegistry 读取并渲染 Reflection Prompt。 */
    if (!rt || !reflectionAgent) return { ...this.createRuleBasedReflection(task, output), promptId: resolvedPrompt.promptId, promptVersion: resolvedPrompt.promptVersion }; /* 第52天：没有模型或没有反思智能体时使用规则评审并保留提示词版本。 */
    const result = await invokeChatModel(rt, [{ role: "system", content: reflectionAgent.systemPrompt }, { role: "user", content: resolvedPrompt.text }]); /* 第52天：调用 Reflection Agent（反思智能体）审查业务 Agent 输出。 */
    const parsed = result.ok ? this.parseReflectionFromText(result.text) : null; /* 第43天：尝试解析模型返回的 ReflectionResult（反思结果）。 */
    return { ...(parsed ?? this.createRuleBasedReflection(task, output)), promptId: resolvedPrompt.promptId, promptVersion: resolvedPrompt.promptVersion }; /* 第52天：解析失败时回退规则型反思，并写入提示词版本。 */
  } /* 第43天：结束 reflectResult（反思结果）方法。 */

  async evaluateOutput(task: AgentTask, output: string, agentId = task.assignedAgentId ?? "unknown", rt?: ModelRuntime): Promise<EvaluationResult> { /* 第45天：实现 evaluateOutput（评估输出）函数，输入任务和输出并返回评估结果。 */
    const evaluationAgent = this.registry.get("evaluation"); /* 第45天：从注册表读取 Evaluation Agent（评估智能体）。 */
    const resolvedPrompt = this.resolvePrompt("evaluation", this.buildEvaluationPrompt(task, output, agentId), { ...this.buildPromptVariables(task, undefined, evaluationAgent?.tools ?? [], agentId, output), output }); /* 第52天：从 PromptRegistry 读取并渲染 Evaluation Prompt。 */
    if (!rt || !evaluationAgent) return { ...this.createRuleBasedEvaluation(task, output), promptId: resolvedPrompt.promptId, promptVersion: resolvedPrompt.promptVersion }; /* 第52天：没有模型或评估智能体时使用规则评估并保留提示词版本。 */
    const result = await invokeChatModel(rt, [{ role: "system", content: evaluationAgent.systemPrompt }, { role: "user", content: resolvedPrompt.text }]); /* 第52天：调用 Evaluation Agent（评估智能体）量化业务 Agent 输出。 */
    const parsed = result.ok ? this.parseEvaluationFromText(result.text) : null; /* 第45天：尝试解析模型返回的 EvaluationResult（评估结果）。 */
    return { ...(parsed ?? this.createRuleBasedEvaluation(task, output)), promptId: resolvedPrompt.promptId, promptVersion: resolvedPrompt.promptVersion }; /* 第52天：解析失败时回退规则型评估，并写入提示词版本。 */
  } /* 第45天：结束 evaluateOutput（评估输出）函数。 */

  private buildEvaluationPrompt(task: AgentTask, output: string, agentId: string): string { /* 第45天：定义 Evaluation Prompt（评估提示词）生成方法。 */
    return `请评估 ${agentId} 针对任务的最终输出质量。\n\n任务：\n${task.goal}\n\n输出：\n${output}\n\n请从 Completeness（完整性）、Correctness（正确性）、Relevance（相关性）、Coverage（覆盖度）四个维度给出 0 到 100 分，并只返回 JSON：{"score":number,"dimensions":{"completeness":number,"correctness":number,"relevance":number,"coverage":number},"strengths":string[],"weaknesses":string[],"suggestions":string[]}。`; /* 第45天：返回严格 JSON 格式的评估提示词。 */
  } /* 第45天：结束 buildEvaluationPrompt（评估提示词）方法。 */

  private parseEvaluationFromText(text: string): EvaluationResult | null { /* 第45天：定义从模型文本中解析 EvaluationResult（评估结果）的方法。 */
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0]; /* 第45天：提取文本中的 JSON 对象片段。 */
    if (!jsonText) return null; /* 第45天：没有 JSON 片段时返回空值。 */
    try { /* 第45天：捕获 JSON 解析异常，避免模型格式漂移导致运行失败。 */
      const parsed = JSON.parse(jsonText) as Partial<EvaluationResult>; /* 第45天：解析模型返回的 JSON 内容。 */
      const dimensions = (parsed.dimensions ?? {}) as Partial<EvaluationResult["dimensions"]>; /* 第45天：读取模型返回的维度评分对象。 */
      const completeness = this.clampScore(typeof dimensions.completeness === "number" ? dimensions.completeness : 0); /* 第45天：规范化完整性评分。 */
      const correctness = this.clampScore(typeof dimensions.correctness === "number" ? dimensions.correctness : 0); /* 第45天：规范化正确性评分。 */
      const relevance = this.clampScore(typeof dimensions.relevance === "number" ? dimensions.relevance : 0); /* 第45天：规范化相关性评分。 */
      const coverage = this.clampScore(typeof dimensions.coverage === "number" ? dimensions.coverage : 0); /* 第45天：规范化覆盖度评分。 */
      const score = this.clampScore(typeof parsed.score === "number" ? parsed.score : (completeness + correctness + relevance + coverage) / 4); /* 第45天：规范化综合评分并在缺失时取维度平均。 */
      const strengths = this.normalizeStringArray(parsed.strengths); /* 第45天：规范化优势列表。 */
      const weaknesses = this.normalizeStringArray(parsed.weaknesses); /* 第45天：规范化不足列表。 */
      const suggestions = this.normalizeStringArray(parsed.suggestions); /* 第45天：规范化建议列表。 */
      return { score, dimensions: { completeness, correctness, relevance, coverage }, strengths, weaknesses, suggestions }; /* 第45天：返回规范化后的 EvaluationResult（评估结果）。 */
    } catch { /* 第45天：处理 JSON 解析失败。 */
      return null; /* 第45天：解析失败时交给上层使用规则兜底。 */
    } /* 第45天：结束异常处理。 */
  } /* 第45天：结束 parseEvaluationFromText 方法。 */

  private createRuleBasedEvaluation(task: AgentTask, output: string): EvaluationResult { /* 第45天：定义规则型 Evaluation（评估）兜底评分。 */
    const goalAnchor = task.goal.slice(0, Math.min(10, task.goal.length)); /* 第45天：截取任务目标前缀作为相关性锚点。 */
    const mentionsGoal = Boolean(goalAnchor) && output.includes(goalAnchor); /* 第45天：判断输出是否显式回应任务目标。 */
    const dimensionHits = ["完整性", "准确性", "正确性", "相关性", "覆盖度", "风险", "下一步", "评估", "指标"].filter((keyword) => output.includes(keyword)).length; /* 第45天：统计输出中出现的评估维度关键词数量。 */
    const technicalHits = ["LangGraph", "Workflow", "Agent", "RAG", "Trace", "Reflection", "Evaluation", "Benchmark", "Prompt"].filter((keyword) => output.toLowerCase().includes(keyword.toLowerCase())).length; /* 第45天：统计输出中出现的关键技术词数量。 */
    const lengthBonus = Math.min(24, Math.floor(output.length / 80)); /* 第45天：根据输出长度给予有限完整性加分。 */
    const completeness = this.clampScore(62 + lengthBonus + (mentionsGoal ? 8 : -6)); /* 第45天：计算完整性分数。 */
    const correctness = this.clampScore(70 + technicalHits * 4 - (output.includes("模型暂时不可用") ? 18 : 0)); /* 第45天：计算正确性分数。 */
    const relevance = this.clampScore(mentionsGoal ? 90 : 72 + Math.min(10, technicalHits * 2)); /* 第45天：计算相关性分数。 */
    const coverage = this.clampScore(64 + dimensionHits * 5 + (output.length > 260 ? 8 : 0)); /* 第45天：计算覆盖度分数。 */
    const score = this.clampScore(Number(((completeness + correctness + relevance + coverage) / 4).toFixed(2))); /* 第45天：计算综合评估分数。 */
    const strengths = [`综合得分 ${score}，输出已覆盖 ${dimensionHits} 个质量关键词。`, mentionsGoal ? "输出与任务目标存在明确关联。" : "输出保留了可继续优化的任务上下文。"]; /* 第45天：生成规则型优势说明。 */
    const weaknesses = [mentionsGoal ? "仍可补充更细的事实依据或边界条件。" : "输出需要更明确地点明原始任务目标。", coverage < 80 ? "覆盖度仍有提升空间，可补充评估维度、风险和下一步。" : "可以继续压缩表达并提高可执行性。"]; /* 第45天：生成规则型不足说明。 */
    const suggestions = ["继续围绕完整性、正确性、相关性和覆盖度做定量对比。", "把低分维度写入后续 Prompt 优化清单。"]; /* 第45天：生成规则型改进建议。 */
    return { score, dimensions: { completeness, correctness, relevance, coverage }, strengths, weaknesses, suggestions }; /* 第45天：返回规则型 EvaluationResult（评估结果）。 */
  } /* 第45天：结束 createRuleBasedEvaluation 方法。 */

  private normalizeStringArray(value: unknown): string[] { /* 第45天：定义字符串数组规范化工具。 */
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; /* 第45天：只保留数组中的字符串项。 */
  } /* 第45天：结束 normalizeStringArray 工具。 */

  private clampScore(value: number): number { /* 第45天：定义评分边界裁剪工具。 */
    return Math.max(0, Math.min(100, Number(value.toFixed(2)))); /* 第45天：把分数限制在 0 到 100 并保留两位小数。 */
  } /* 第45天：结束 clampScore 工具。 */

  private buildReflectionPrompt(task: AgentTask, output: string, agentId: string): string { /* 第43天：定义 Reflection Prompt（反思提示词）生成方法。 */
    return `请审查 ${agentId} 针对任务的输出质量。\n\n任务：\n${task.goal}\n\n输出：\n${output}\n\n请从 Completeness（完整性）、Accuracy（准确性）、Logic（逻辑性）、Coverage（覆盖度）评分，并只返回 JSON：{"score":number,"issues":string[],"suggestions":string[],"shouldRetry":boolean}。低于 ${this.reflectionThreshold} 分时 shouldRetry 为 true。`; /* 第43天：返回严格 JSON 格式的反思提示词。 */
  } /* 第43天：结束 buildReflectionPrompt（反思提示词）方法。 */

  private parseReflectionFromText(text: string): ReflectionResult | null { /* 第43天：定义从模型文本中解析 ReflectionResult（反思结果）的方法。 */
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0]; /* 第43天：提取文本中的 JSON 对象片段。 */
    if (!jsonText) return null; /* 第43天：没有 JSON 片段时返回空值。 */
    try { /* 第43天：捕获 JSON 解析异常，避免模型格式漂移导致运行失败。 */
      const parsed = JSON.parse(jsonText) as Partial<ReflectionResult>; /* 第43天：解析模型返回的 JSON 内容。 */
      const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, parsed.score)) : 0; /* 第43天：把评分限制在 0 到 100 之间。 */
      const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((item): item is string => typeof item === "string") : []; /* 第43天：规范化问题列表。 */
      const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item): item is string => typeof item === "string") : []; /* 第43天：规范化建议列表。 */
      const shouldRetry = typeof parsed.shouldRetry === "boolean" ? parsed.shouldRetry : score < this.reflectionThreshold; /* 第43天：优先使用模型判断，否则根据阈值推导。 */
      return { score, issues, suggestions, shouldRetry }; /* 第43天：返回规范化后的 ReflectionResult（反思结果）。 */
    } catch { /* 第43天：处理 JSON 解析失败。 */
      return null; /* 第43天：解析失败时交给上层使用规则兜底。 */
    } /* 第43天：结束异常处理。 */
  } /* 第43天：结束 parseReflectionFromText 方法。 */

  private createRuleBasedReflection(task: AgentTask, output: string): ReflectionResult { /* 第43天：定义规则型 Reflection（反思）兜底评审。 */
    const issues: string[] = []; /* 第43天：初始化问题列表。 */
    const suggestions: string[] = []; /* 第43天：初始化改进建议列表。 */
    if (output.includes("初稿只给出")) { issues.push("当前只是初稿，缺少充分展开。"); suggestions.push("根据反思要求补充关键概念、检查维度和下一步行动。"); } /* 第43天：让无模型演示初稿稳定触发一次反思重试。 */
    if (output.length < 160) { issues.push("输出过短，可能没有覆盖任务目标。"); suggestions.push("补充背景、关键结论和可执行步骤。"); } /* 第43天：检查输出长度是否过短。 */
    if (!/完整性|准确性|逻辑性|覆盖度|风险|下一步|Checkpoint|检查点|StateGraph|Conditional Edge/i.test(output)) { issues.push("缺少关键检查维度或领域关键词。"); suggestions.push("补充完整性、准确性、逻辑性、覆盖度以及关键概念说明。"); } /* 第43天：检查是否包含反思要求关注的核心维度。 */
    if (!output.includes(task.goal.slice(0, Math.min(12, task.goal.length)))) { issues.push("输出和原始任务目标的显式关联不足。"); suggestions.push("在回答中重新点明任务目标并对齐结论。"); } /* 第43天：检查输出是否明显回应当前任务。 */
    const penalty = issues.length * 18; /* 第43天：根据问题数量计算扣分。 */
    const score = Math.max(55, Math.min(96, 92 - penalty + Math.min(12, Math.floor(output.length / 120)))); /* 第43天：生成稳定可解释的规则评分。 */
    const shouldRetry = score < this.reflectionThreshold; /* 第43天：根据阈值判断是否应该重试。 */
    return { score, issues, suggestions, shouldRetry }; /* 第43天：返回规则型 ReflectionResult（反思结果）。 */
  } /* 第43天：结束 createRuleBasedReflection 方法。 */

  private recordReflectionAttempt(agentId: string, taskId: string, attempt: number, output: string, reflection: ReflectionResult, retried: boolean): void { /* 第43天：记录一次完整的反思尝试。 */
    this.reflectionAttempts.push({ attempt, agentId, taskId, output, reflection, retried, createdAt: Date.now() }); /* 第43天：把反思尝试写入内存快照。 */
  } /* 第43天：结束 recordReflectionAttempt 方法。 */

  private async writeReflectionWorkspaceEntry(agentId: string, taskId: string, attempt: number, reflection: ReflectionResult, context?: AgentContext): Promise<void> { /* 第43天：把 Reflection（反思）结果写入 Workspace（工作空间）。 */
    if (!context?.workspace) return; /* 第43天：没有工作空间时保持兼容旧调用。 */
    const content = `Reflection（反思）评审 ${agentId}/${taskId} 第 ${attempt} 轮：score=${reflection.score}；shouldRetry=${reflection.shouldRetry}；issues=${reflection.issues.join("；") || "无"}；suggestions=${reflection.suggestions.join("；") || "无"}`; /* 第43天：生成可读的反思记录正文。 */
    await this.workspaceStore.addEntry(context.workspace.id, { id: `${taskId}-${agentId}-reflection-${attempt}-${Date.now()}`, type: "decision", agentId: "reflection", content, tags: ["reflection", agentId, taskId, `attempt-${attempt}`], createdAt: Date.now() }); /* 第43天：把反思结论作为 decision（决策）条目写入工作空间。 */
  } /* 第43天：结束 writeReflectionWorkspaceEntry 方法。 */

  private recordEvaluation(agentId: string, taskId: string, output: string, evaluation: EvaluationResult): void { /* 第45天：记录一次完整的 Evaluation（评估）结果。 */
    this.evaluationRecords.push({ id: `${taskId}-${agentId}-evaluation-${Date.now()}`, agentId, taskId, output, evaluation, createdAt: Date.now() }); /* 第45天：把评估结果写入内存历史。 */
  } /* 第45天：结束 recordEvaluation 方法。 */

  private async writeEvaluationWorkspaceEntry(agentId: string, taskId: string, evaluation: EvaluationResult, context?: AgentContext): Promise<void> { /* 第45天：把 Evaluation（评估）结果写入 Workspace（工作空间）。 */
    if (!context?.workspace) return; /* 第45天：没有工作空间时保持兼容旧调用。 */
    const content = `Evaluation（评估）${agentId}/${taskId}：score=${evaluation.score}；completeness=${evaluation.dimensions.completeness}；correctness=${evaluation.dimensions.correctness}；relevance=${evaluation.dimensions.relevance}；coverage=${evaluation.dimensions.coverage}；weaknesses=${evaluation.weaknesses.join("；") || "无"}；suggestions=${evaluation.suggestions.join("；") || "无"}`; /* 第45天：生成可读的评估记录正文。 */
    await this.workspaceStore.addEntry(context.workspace.id, { id: `${taskId}-${agentId}-evaluation-${Date.now()}`, type: "decision", agentId: "evaluation", content, tags: ["evaluation", agentId, taskId], createdAt: Date.now() }); /* 第45天：把评估结论作为 decision（决策）条目写入工作空间。 */
  } /* 第45天：结束 writeEvaluationWorkspaceEntry 方法。 */

  private async writePromptABTestWorkspaceEntry(workspaceId: string, result: PromptABTestResult): Promise<void> { /* 第45天：把 Prompt A/B Test（提示词 A/B 测试）写入 Workspace（工作空间）。 */
    const content = `Prompt A/B Test（提示词 A/B 测试）：A=${result.scoreA}；B=${result.scoreB}；winner=${result.winner}；B版策略=${result.promptVersionB}`; /* 第45天：生成 A/B 测试记录正文。 */
    await this.workspaceStore.addEntry(workspaceId, { id: `${result.taskId}-prompt-ab-${Date.now()}`, type: "decision", agentId: "evaluation", content, tags: ["evaluation", "prompt-ab-test"], createdAt: Date.now() }); /* 第45天：把 A/B 测试结论写入工作空间。 */
  } /* 第45天：结束 writePromptABTestWorkspaceEntry 方法。 */

  private runPromptABTest(goal: string, output: string): PromptABTestResult { /* 第45天：运行规则型 Prompt A/B Test（提示词 A/B 测试）。 */
    const task: AgentTask = { id: "day46-prompt-ab-test", goal, assignedAgentId: "evaluation" }; /* 第46天：构造用于兼容 A/B 测试的虚拟评估任务。 */
    const promptVersionA = "A：保持原始任务提示词，只要求最终答案可读。"; /* 第45天：定义 A 版提示词策略。 */
    const promptVersionB = "B：在提示词中显式加入完整性、正确性、相关性、覆盖度、风险和下一步。"; /* 第45天：定义 B 版提示词策略。 */
    const outputA = `${output.slice(0, Math.max(120, Math.floor(output.length * 0.55)))}\n\nPrompt Version A（提示词版本 A）：保留较短原始输出作为基线。`; /* 第45天：构造较短的 A 版基线输出。 */
    const outputB = `${output}\n\nPrompt Version B（提示词版本 B）：补充完整性、正确性、相关性、覆盖度、风险、下一步和评估指标。`; /* 第45天：构造 B 版可评估输出。 */
    const evaluationA = this.createRuleBasedEvaluation(task, outputA); /* 第45天：对 A 版输出进行规则型评估。 */
    const evaluationB = this.createRuleBasedEvaluation(task, outputB); /* 第45天：对 B 版输出进行规则型评估。 */
    const winner = evaluationA.score === evaluationB.score ? "tie" : evaluationA.score > evaluationB.score ? "A" : "B"; /* 第45天：根据综合分判断胜出提示词版本。 */
    return { taskId: task.id, promptVersionA, promptVersionB, scoreA: evaluationA.score, scoreB: evaluationB.score, winner, evaluationA, evaluationB }; /* 第45天：返回完整 A/B 测试结果。 */
  } /* 第45天：结束 runPromptABTest 方法。 */

  private getReflectionMetrics(): ReflectionMetrics { /* 第43天：计算 Reflection Metrics（反思指标）。 */
    if (this.reflectionAttempts.length === 0) return { averageScore: 0, retryCount: 0, passRate: 0, improvementRate: 0 }; /* 第43天：没有反思记录时返回空指标。 */
    const scores = this.reflectionAttempts.map((item) => item.reflection.score); /* 第43天：收集所有反思评分。 */
    const averageScore = Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)); /* 第43天：计算平均反思评分。 */
    const retryCount = this.reflectionAttempts.filter((item) => item.retried).length; /* 第43天：统计触发重试的次数。 */
    const passRate = Number((this.reflectionAttempts.filter((item) => item.reflection.score >= this.reflectionThreshold).length / this.reflectionAttempts.length).toFixed(2)); /* 第43天：计算通过率。 */
    const firstScores = new Map<string, number>(); /* 第43天：保存每个任务的首次评分。 */
    const improvements: number[] = []; /* 第43天：保存每个重试任务的最终提升幅度。 */
    this.reflectionAttempts.forEach((item) => { const key = `${item.agentId}:${item.taskId}`; if (!firstScores.has(key)) firstScores.set(key, item.reflection.score); else improvements.push(item.reflection.score - (firstScores.get(key) ?? item.reflection.score)); }); /* 第43天：对比同一任务后续评分和首次评分。 */
    const improvementRate = improvements.length ? Number((improvements.reduce((sum, value) => sum + value, 0) / improvements.length).toFixed(2)) : 0; /* 第43天：计算平均改进幅度。 */
    return { averageScore, retryCount, passRate, improvementRate }; /* 第43天：返回 Reflection Metrics（反思指标）。 */
  } /* 第43天：结束 getReflectionMetrics 方法。 */

  private getEvaluationMetrics(): EvaluationMetrics { /* 第45天：计算 Evaluation Metrics（评估指标）。 */
    if (this.evaluationRecords.length === 0) return { averageScore: 0, scoreDistribution: {}, topAgents: [], lowScoreTasks: [], improvementTrend: [] }; /* 第45天：没有评估记录时返回空指标。 */
    const scores = this.evaluationRecords.map((item) => item.evaluation.score); /* 第45天：收集全部评估综合分。 */
    const averageScore = Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)); /* 第45天：计算平均综合评分。 */
    const scoreDistribution = scores.reduce<Record<string, number>>((acc, score) => ({ ...acc, [this.getScoreBucket(score)]: (acc[this.getScoreBucket(score)] ?? 0) + 1 }), {}); /* 第45天：按分数桶统计评分分布。 */
    const byAgent = this.evaluationRecords.reduce<Record<string, number[]>>((acc, item) => ({ ...acc, [item.agentId]: [...(acc[item.agentId] ?? []), item.evaluation.score] }), {}); /* 第45天：按 Agent 收集评估分数。 */
    const topAgents = Object.entries(byAgent).map(([agentId, values]) => `${agentId}:${Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))}`).sort((a, b) => Number(b.split(":")[1]) - Number(a.split(":")[1])).slice(0, 3); /* 第45天：生成平均分最高的 Agent 列表。 */
    const lowScoreTasks = this.evaluationRecords.filter((item) => item.evaluation.score < 80).map((item) => `${item.agentId}/${item.taskId}:${item.evaluation.score}`); /* 第45天：记录低于 80 分的任务。 */
    const improvementTrend = scores.slice(-10); /* 第45天：保留最近十次评估作为趋势。 */
    return { averageScore, scoreDistribution, topAgents, lowScoreTasks, improvementTrend }; /* 第45天：返回 Evaluation Metrics（评估指标）。 */
  } /* 第45天：结束 getEvaluationMetrics 方法。 */

  private getScoreBucket(score: number): string { /* 第45天：把评分映射到分布桶。 */
    if (score >= 90) return "90-100"; /* 第45天：返回优秀分布桶。 */
    if (score >= 80) return "80-89"; /* 第45天：返回良好分布桶。 */
    if (score >= 70) return "70-79"; /* 第45天：返回待优化分布桶。 */
    return "0-69"; /* 第45天：返回低分分布桶。 */
  } /* 第45天：结束 getScoreBucket 方法。 */

  private async refreshWorkspace(workspace: Workspace): Promise<Workspace> { /* 第43天：定义刷新共享工作空间快照的方法。 */
    return await this.workspaceStore.get(workspace.id) ?? workspace; /* 第43天：优先返回存储中的最新工作空间。 */
  } /* 第43天：结束 refreshWorkspace 方法。 */

  private async writeWorkspaceEntry(agentId: string, taskId: string, output: string, context?: AgentContext): Promise<void> { /* 第43天：定义 Agent 写入共享工作空间的方法。 */
    if (!context?.workspace) return; /* 第43天：没有工作空间时保持兼容旧调用。 */
    await this.workspaceStore.addEntry(context.workspace.id, { id: `${taskId}-${agentId}-${Date.now()}`, type: this.getWorkspaceEntryType(agentId, taskId), agentId, content: output, tags: [agentId, taskId], createdAt: Date.now() }); /* 第43天：把 Agent 输出保存为工作空间条目。 */
  } /* 第43天：结束 writeWorkspaceEntry 方法。 */

  private getWorkspaceEntryType(agentId: string, taskId: string): WorkspaceEntryType { /* 第43天：定义 Agent 到工作空间条目类型的映射。 */
    if (agentId === "research") return "finding"; /* 第43天：Research Agent 输出记录为研究发现。 */
    if (agentId === "planner") return "draft"; /* 第43天：Planner Agent 输出记录为草稿。 */
    if (agentId === "critic") return taskId.includes("question") ? "question" : "decision"; /* 第43天：Critic Agent 输出记录为决策或问题。 */
    if (agentId === "writer") return "final"; /* 第43天：Writer Agent 输出记录为最终结果。 */
    return "note"; /* 第43天：其他 Agent 输出记录为普通笔记。 */
  } /* 第43天：结束 getWorkspaceEntryType 方法。 */

  private async summarizeWorkspace(workspaceId: string): Promise<void> { /* 第43天：定义共享工作空间摘要器。 */
    const entries = await this.workspaceStore.listEntries(workspaceId); /* 第43天：读取当前工作空间全部条目。 */
    if (entries.length === 0) return; /* 第43天：没有条目时不生成摘要。 */
    const byType = entries.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.type]: (acc[entry.type] ?? 0) + 1 }), {}); /* 第43天：统计摘要需要的条目类型分布。 */
    const summary = `Workspace Summary（工作空间摘要）：共 ${entries.length} 条记录；类型分布 ${Object.entries(byType).map(([type, count]) => `${type}:${count}`).join("，")}；最终协作目标已沉淀到共享工作空间。`; /* 第43天：生成短摘要文本，避免后续 prompt 过长。 */
    await this.workspaceStore.addEntry(workspaceId, { id: `workspace-summary-${Date.now()}`, type: "note", agentId: "workspace-summarizer", content: summary, tags: ["workspace", "summary"], createdAt: Date.now() }); /* 第43天：把摘要作为 note 条目写回工作空间。 */
  } /* 第43天：结束 summarizeWorkspace 方法。 */

  private pushTimeline(agentId: string, taskId: string, label: string): void { /* 定义追加时间线事件的方法。 */
    this.timeline.push({ id: `${this.timeline.length + 1}-${agentId}-${taskId}`, agentId, taskId, label, timestamp: new Date().toISOString() }); /* 写入一个新的时间线事件。 */
  } /* 结束 pushTimeline 方法。 */
} /* 结束 AgentRuntime 类定义。 */
