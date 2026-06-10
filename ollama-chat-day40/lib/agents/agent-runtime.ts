import type { AgentCallEdge, AgentCollaborationSnapshot, AgentContext, AgentPlan, AgentPlanStep, AgentPlanValidation, AgentResult, AgentTask, AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 引入第40天计划运行时需要的类型。 */
import { AgentRegistry } from "@/lib/agents/agent-registry"; /* 引入智能体注册表用于查找执行目标。 */
import { invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime"; /* 引入统一模型调用能力和模型运行时类型。 */

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

  constructor(private readonly registry: AgentRegistry) {} /* 注入智能体注册表。 */

  async executeAgent(agentId: string, task: AgentTask, context?: AgentContext, rt?: ModelRuntime): Promise<AgentResult> { /* 定义执行单个智能体任务的方法。 */
    const startedAt = Date.now(); /* 记录任务开始时间戳。 */
    const assignedTask = { ...task, assignedAgentId: task.assignedAgentId ?? agentId }; /* 确保任务带有被分配的智能体 ID。 */
    const agent = this.registry.get(agentId); /* 从注册表查找目标智能体。 */
    this.pushTimeline(agentId, assignedTask.id, `${agentId} started`); /* 记录智能体开始执行事件。 */
    this.metrics.executedTasks += 1; /* 累加已经执行的任务数量。 */
    if (!agent) { /* 判断目标智能体是否不存在。 */
      this.pushTimeline(agentId, assignedTask.id, `${agentId} failed`); /* 记录智能体失败事件。 */
      return { taskId: assignedTask.id, agentId, output: `未找到 Agent：${agentId}`, metadata: { ok: false } }; /* 返回找不到智能体的结构化结果。 */
    } /* 结束智能体缺失判断。 */
    const prompt = this.buildAgentUserPrompt(assignedTask); /* 构造包含任务和前置结果的用户提示词。 */
    const output = rt ? await this.invokeAgentModel(agent.systemPrompt, prompt, rt) : this.buildSimulatedOutput(agent.name, assignedTask, agent.capabilities, agent.tools, context); /* 有模型运行时时真实调用模型，否则保留演示兜底输出。 */
    const duration = Math.max(1, Date.now() - startedAt); /* 计算至少 1 毫秒的任务耗时。 */
    this.metrics.totalDuration += duration; /* 累加任务耗时。 */
    this.metrics.successfulTasks += 1; /* 累加成功任务数量。 */
    this.pushTimeline(agentId, assignedTask.id, `${agentId} success`); /* 记录智能体成功事件。 */
    return { taskId: assignedTask.id, agentId, output, metadata: { ok: true, duration, assignedAgentId: assignedTask.assignedAgentId } }; /* 返回结构化执行结果。 */
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
    const result = await invokeChatModel(rt, [{ role: "system", content: supervisor?.systemPrompt ?? "你是一个多智能体调度器。" }, { role: "user", content: prompt }]); /* 调用模型生成 AgentPlan。 */
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
    plan.steps.forEach((step) => step.dependsOn?.forEach((dep) => { if (!stepIds.has(dep)) errors.push(`步骤 ${step.id} 依赖不存在的步骤：${dep}`); })); /* 校验 dependsOn 是否合法。 */
    if (this.hasDependencyCycle(plan.steps)) errors.push("AgentPlan 出现循环依赖"); /* 校验步骤之间是否存在循环依赖。 */
    return { ok: errors.length === 0, errors }; /* 返回校验结果。 */
  } /* 结束 validateAgentPlan 方法。 */

  async executeAgentPlan(plan: AgentPlan, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义按 AgentPlan 串行执行智能体的方法。 */
    const validation = this.validateAgentPlan(plan); /* 先校验 Supervisor 产出的计划。 */
    const safePlan = validation.ok ? plan : this.createFallbackPlan(plan.goal, validation.errors); /* 校验失败时降级为可运行兜底计划。 */
    const safeValidation = validation.ok ? validation : this.validateAgentPlan(safePlan); /* 为实际执行计划生成校验结果。 */
    this.pushTimeline("supervisor", "day40-plan-task", validation.ok ? "supervisor planned" : "supervisor fallback planned"); /* 记录 Supervisor 完成规划事件。 */
    const resultsByStepId = new Map<string, AgentResult>(); /* 保存每个步骤的执行结果。 */
    const orderedResults: AgentResult[] = []; /* 保存按执行顺序排列的结果。 */
    let fromAgentId = "supervisor"; /* 初始化第一个委派来源为 Supervisor。 */
    for (const [index, step] of safePlan.steps.entries()) { /* 逐个执行计划步骤。 */
      const dependencyResults = (step.dependsOn ?? []).map((dep) => resultsByStepId.get(dep)).filter((result): result is AgentResult => Boolean(result)); /* 收集当前步骤依赖的前置结果。 */
      const previousResults = dependencyResults.length ? dependencyResults : orderedResults.slice(-1); /* 优先传入显式依赖结果，否则传入上一个步骤结果。 */
      const task: AgentTask = { id: step.id, goal: step.task, parentTaskId: previousResults.at(-1)?.taskId, context: { previousResults } }; /* 创建带 previousResults 的任务上下文。 */
      const result = index === 0 ? await this.delegateTask("supervisor", step.agentId, task, context, rt) : await this.delegateTask(fromAgentId, step.agentId, task, context, rt); /* 通过委派方式执行当前步骤。 */
      resultsByStepId.set(step.id, result); /* 按步骤 ID 保存执行结果。 */
      orderedResults.push(result); /* 记录执行顺序结果。 */
      fromAgentId = step.agentId; /* 更新下一步委派来源。 */
    } /* 结束步骤遍历。 */
    const rootResult = orderedResults[0] ?? await this.executeAgent("writer", { id: "day40-empty-plan-fallback", goal: safePlan.goal, assignedAgentId: "writer" }, context, rt); /* 获取根结果或空计划兜底结果。 */
    const result = this.aggregateResults(rootResult, orderedResults.slice(1)); /* 聚合完整计划执行结果。 */
    return { result, callGraph: this.callGraph, timeline: this.timeline, metrics: this.getRuntimeMetrics(), plan: safePlan, validation: safeValidation }; /* 返回第40天计划执行快照。 */
  } /* 结束 executeAgentPlan 方法。 */

  async runSupervisorCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义第40天 Supervisor 协作入口。 */
    const plan = await this.planAgents(goal, rt); /* 由 Supervisor 生成智能体计划。 */
    return this.executeAgentPlan(plan, context, rt); /* 执行并返回计划协作快照。 */
  } /* 结束 runSupervisorCollaboration 方法。 */

  async runFixedCollaboration(goal: string, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义兼容 Day39 的固定链路入口。 */
    const plan: AgentPlan = { goal, selectedAgents: ["research", "planner", "critic", "writer"], reason: "兼容 Day39 固定协作链。", steps: this.buildPlanSteps(goal, ["research", "planner", "critic", "writer"]) }; /* 构建固定链路计划。 */
    return this.executeAgentPlan(plan, context, rt); /* 复用第40天计划执行器。 */
  } /* 结束 runFixedCollaboration 方法。 */

  getRuntimeMetrics(): AgentCollaborationSnapshot["metrics"] { /* 定义读取运行时指标的方法。 */
    const avgTaskDuration = this.metrics.executedTasks ? Number((this.metrics.totalDuration / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算平均任务耗时。 */
    const successRate = this.metrics.executedTasks ? Number((this.metrics.successfulTasks / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算任务成功率。 */
    return { executedTasks: this.metrics.executedTasks, delegatedTasks: this.metrics.delegatedTasks, avgTaskDuration, successRate }; /* 返回运行时指标快照。 */
  } /* 结束 getRuntimeMetrics 方法。 */

  private buildSupervisorPrompt(goal: string): string { /* 定义 Supervisor 模型规划提示词生成方法。 */
    const agents = this.registry.list().filter((agent) => agent.id !== "supervisor"); /* 读取除 Supervisor 外的可调度业务智能体。 */
    const agentList = agents.map((agent) => `- ${agent.id}: ${agent.description}\n  capabilities: ${agent.capabilities.join(", ")}`).join("\n"); /* 将可用 Agent 列表格式化进提示词。 */
    return `可用 Agent：\n${agentList}\n\n请根据用户目标选择必要 Agent 并生成可执行 AgentPlan。\n要求：\n1. 只选择必要 Agent，不要所有任务都用全量 Agent。\n2. selectedAgents 和 steps.agentId 只能使用上方 Agent id。\n3. steps 必须按执行顺序排列。\n4. 后续步骤依赖前置结果时，在 dependsOn 写前置步骤 id。\n5. 只返回 JSON，不要 Markdown。\n\nJSON 格式：\n{\n  "goal": "...",\n  "selectedAgents": ["..."],\n  "reason": "...",\n  "steps": [\n    { "id": "step-1", "agentId": "...", "task": "...", "dependsOn": [] }\n  ]\n}\n\n用户目标：${goal}`; /* 返回完整 Supervisor 提示词。 */
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
    const fallbackId = `day40-step-${index + 1}-${typeof step.agentId === "string" ? step.agentId : "agent"}`; /* 生成缺省步骤 ID。 */
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
    return selectedAgents.map((agentId, index) => ({ id: `day40-step-${index + 1}-${agentId}`, agentId, task: this.buildTaskForAgent(agentId, goal), dependsOn: index === 0 ? [] : [`day40-step-${index}-${selectedAgents[index - 1]}`] })); /* 生成串行依赖步骤。 */
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
    return { goal, selectedAgents: ["writer"], reason: `原计划校验失败，降级为 Writer Agent 兜底输出：${errors.join("；")}`, steps: [{ id: "day40-fallback-writer", agentId: "writer", task: `整理用户目标并输出可读结果：${goal}`, dependsOn: [] }] }; /* 返回 Writer 兜底计划。 */
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

  private buildAgentUserPrompt(task: AgentTask): string { /* 定义单个 Agent 的用户提示词生成方法。 */
    const previousResults = this.extractPreviousResults(task.context); /* 提取前置 Agent 输出。 */
    const previousText = previousResults.length ? previousResults.map((result) => `【${result.agentId} / ${result.taskId}】\n${result.output}`).join("\n\n") : "无"; /* 格式化前置结果文本。 */
    return `当前任务：\n${task.goal}\n\n前置 Agent 输出：\n${previousText}\n\n请只完成当前 Agent 职责范围内的工作，并把结果写清楚。`; /* 返回 Agent 执行提示词。 */
  } /* 结束 buildAgentUserPrompt 方法。 */

  private extractPreviousResults(taskContext?: unknown): AgentResult[] { /* 定义从任务上下文提取前置结果的方法。 */
    if (!taskContext || typeof taskContext !== "object") return []; /* 上下文为空或非对象时返回空数组。 */
    const previousResults = (taskContext as { previousResults?: unknown }).previousResults; /* 读取 previousResults 字段。 */
    return Array.isArray(previousResults) ? previousResults.filter((item): item is AgentResult => Boolean(item) && typeof item === "object" && typeof (item as AgentResult).output === "string") : []; /* 返回合法前置结果数组。 */
  } /* 结束 extractPreviousResults 方法。 */

  private async invokeAgentModel(systemPrompt: string, userPrompt: string, rt: ModelRuntime): Promise<string> { /* 定义单个 Agent 真实模型调用方法。 */
    const result = await invokeChatModel(rt, [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]); /* 使用 Agent systemPrompt 和任务上下文调用模型。 */
    return result.ok && result.text.trim() ? result.text.trim() : "模型暂时不可用，当前 Agent 未获得有效输出。"; /* 返回模型输出或失败兜底文本。 */
  } /* 结束 invokeAgentModel 方法。 */

  private buildSimulatedOutput(agentName: string, task: AgentTask, capabilities: string[], tools: string[], context?: AgentContext): string { /* 定义无模型运行时时的演示输出方法。 */
    const contextText = this.describeContext(context, task.context); /* 生成上下文状态描述。 */
    return `${agentName} 已处理任务 ${task.id}：${task.goal}。能力：${capabilities.join(", ")}。工具：${tools.join(", ") || "无"}。上下文：${contextText}。`; /* 返回演示输出文本。 */
  } /* 结束 buildSimulatedOutput 方法。 */

  private describeContext(context?: AgentContext, taskContext?: unknown): string { /* 定义上下文说明生成方法。 */
    const memoryReady = context?.memory ? "已接收记忆上下文" : "暂无记忆上下文"; /* 生成记忆上下文状态。 */
    const workflowReady = context?.workflow ? "已接收工作流上下文" : "暂无工作流上下文"; /* 生成工作流上下文状态。 */
    const toolsReady = context?.tools ? "已接收工具上下文" : "暂无工具上下文"; /* 生成工具上下文状态。 */
    const taskReady = taskContext ? "已接收 previousResults 前置结果" : "暂无前置结果"; /* 生成任务上下文状态。 */
    return `${memoryReady}，${workflowReady}，${toolsReady}，${taskReady}`; /* 返回合并后的上下文说明。 */
  } /* 结束 describeContext 方法。 */

  private pushTimeline(agentId: string, taskId: string, label: string): void { /* 定义追加时间线事件的方法。 */
    this.timeline.push({ id: `${this.timeline.length + 1}-${agentId}-${taskId}`, agentId, taskId, label, timestamp: new Date().toISOString() }); /* 写入一个新的时间线事件。 */
  } /* 结束 pushTimeline 方法。 */
} /* 结束 AgentRuntime 类定义。 */
