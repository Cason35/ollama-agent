import type { AgentCallEdge, AgentCollaborationSnapshot, AgentContext, AgentDAGMetrics, AgentPlan, AgentPlanStep, AgentPlanValidation, AgentResult, AgentTask, AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 引入第41天 DAG 计划运行时需要的类型。 */
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
    if (stepIds.size !== plan.steps.length) errors.push("AgentPlan 包含重复的步骤 ID"); /* 校验 DAG 中每个步骤 ID 必须唯一。 */
    plan.steps.forEach((step) => step.dependsOn?.forEach((dep) => { if (!stepIds.has(dep)) errors.push(`步骤 ${step.id} 依赖不存在的步骤：${dep}`); })); /* 校验 dependsOn 是否合法。 */
    if (this.hasDependencyCycle(plan.steps)) errors.push("AgentPlan 出现循环依赖"); /* 校验步骤之间是否存在循环依赖。 */
    this.findOrphanSteps(plan.steps).forEach((stepId) => errors.push(`步骤 ${stepId} 是孤儿节点，既不依赖其他步骤，也不被最终链路使用`)); /* 校验是否存在与整体 DAG 无关的孤儿节点。 */
    return { ok: errors.length === 0, errors }; /* 返回校验结果。 */
  } /* 结束 validateAgentPlan 方法。 */

  async executeAgentPlan(plan: AgentPlan, context?: AgentContext, rt?: ModelRuntime): Promise<AgentCollaborationSnapshot> { /* 定义按 AgentPlan DAG 并行执行智能体的方法。 */
    const validation = this.validateAgentPlan(plan); /* 先校验 Supervisor 产出的计划。 */
    const safePlan = validation.ok ? plan : this.createFallbackPlan(plan.goal, validation.errors); /* 校验失败时降级为可运行兜底计划。 */
    const safeValidation = validation.ok ? validation : this.validateAgentPlan(safePlan); /* 为实际执行计划生成校验结果。 */
    this.pushTimeline("supervisor", "day41-dag-plan-task", validation.ok ? "supervisor planned DAG" : "supervisor fallback planned DAG"); /* 记录 Supervisor 完成 DAG 规划事件。 */
    const resultsByStepId = new Map<string, AgentResult>(); /* 保存每个步骤的执行结果。 */
    const orderedResults: AgentResult[] = []; /* 保存按执行顺序排列的结果。 */
    const pendingSteps = new Map(safePlan.steps.map((step) => [step.id, step])); /* 保存尚未执行的 DAG 节点。 */
    while (pendingSteps.size > 0) { /* 循环寻找当前批次可运行节点，直到所有节点完成。 */
      const runnableSteps = Array.from(pendingSteps.values()).filter((step) => (step.dependsOn ?? []).every((dep) => resultsByStepId.has(dep))); /* 找出所有依赖已经完成的可运行节点。 */
      if (runnableSteps.length === 0) break; /* 如果没有可运行节点，说明安全计划仍有异常，退出避免死循环。 */
      this.pushTimeline("supervisor", `day41-dag-batch-${orderedResults.length + 1}`, `parallel batch: ${runnableSteps.map((step) => step.id).join(", ")}`); /* 记录本轮并行批次。 */
      const batchResults = await Promise.all(runnableSteps.map((step) => this.executeDAGStep(step, resultsByStepId, context, rt))); /* 使用 Promise.all 并行执行当前批次节点。 */
      batchResults.forEach(({ step, result }) => { resultsByStepId.set(step.id, result); orderedResults.push(result); pendingSteps.delete(step.id); }); /* 将本批次结果写入 Agent Result Store 并解锁后续节点。 */
    } /* 结束 DAG 执行循环。 */
    const finalResults = this.getFinalResults(safePlan.steps, resultsByStepId); /* 收集没有下游依赖的最终节点结果。 */
    const rootResult = finalResults[0] ?? orderedResults[0] ?? await this.executeAgent("writer", { id: "day41-empty-dag-fallback", goal: safePlan.goal, assignedAgentId: "writer" }, context, rt); /* 获取最终结果或空 DAG 兜底结果。 */
    const result = this.aggregateResults(rootResult, finalResults.length ? finalResults.slice(1) : orderedResults.slice(1)); /* 聚合所有最终节点或执行结果。 */
    const resultStore = Object.fromEntries(resultsByStepId.entries()); /* 将 Map 结果存储转换为可序列化对象。 */
    const dagMetrics = this.calculateDAGMetrics(safePlan.steps); /* 计算第41天 Agent DAG 指标。 */
    return { result, callGraph: this.callGraph, timeline: this.timeline, metrics: this.getRuntimeMetrics(), dagMetrics, resultStore, plan: safePlan, validation: safeValidation }; /* 返回第41天 DAG 计划执行快照。 */
  } /* 结束 executeAgentPlan 方法。 */

  private async executeDAGStep(step: AgentPlanStep, resultsByStepId: Map<string, AgentResult>, context?: AgentContext, rt?: ModelRuntime): Promise<{ step: AgentPlanStep; result: AgentResult }> { /* 定义执行单个 DAG 节点并返回步骤配对结果的方法。 */
    const parentResults = (step.dependsOn ?? []).map((dep) => resultsByStepId.get(dep)).filter((result): result is AgentResult => Boolean(result)); /* 按 dependsOn 收集当前节点所有父级结果。 */
    const fromAgentId = parentResults.at(-1)?.agentId ?? "supervisor"; /* 使用最后一个父级 Agent 或 Supervisor 作为主要委派来源。 */
    parentResults.slice(0, -1).forEach((result) => this.callGraph.push({ fromAgentId: result.agentId, toAgentId: step.agentId, taskId: step.id })); /* 为多个父节点补充调用图边。 */
    const task: AgentTask = { id: step.id, goal: step.task, parentTaskId: parentResults.at(-1)?.taskId, context: { previousResults: parentResults, parentResults } }; /* 创建包含 previousResults 和 parentResults 的 DAG 上下文。 */
    const result = await this.delegateTask(fromAgentId, step.agentId, task, context, rt); /* 通过委派入口执行当前 DAG 节点。 */
    return { step, result }; /* 返回步骤和执行结果，便于外层写入 Result Store。 */
  } /* 结束 executeDAGStep 方法。 */

  private getFinalResults(steps: AgentPlanStep[], resultsByStepId: Map<string, AgentResult>): AgentResult[] { /* 定义收集 DAG 出口节点结果的方法。 */
    const dependedIds = new Set(steps.flatMap((step) => step.dependsOn ?? [])); /* 收集所有被其他节点依赖的步骤 ID。 */
    return steps.filter((step) => !dependedIds.has(step.id)).map((step) => resultsByStepId.get(step.id)).filter((result): result is AgentResult => Boolean(result)); /* 返回没有下游依赖的最终节点结果。 */
  } /* 结束 getFinalResults 方法。 */

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
    return `可用 Agent：\n${agentList}\n\n请根据用户目标选择必要 Agent，并生成第41天 Agent DAG Plan。\n要求：\n1. 只选择必要 Agent，不要所有任务都用全量 Agent。\n2. selectedAgents 和 steps.agentId 只能使用上方 Agent id。\n3. steps 表示 DAG 节点，不要求线性串行，但每个节点必须有稳定 id。\n4. 可以并行的步骤必须写相同的上游 dependsOn，例如 concept 和 roadmap 同时依赖 research。\n5. dependsOn 只能引用已经存在的 step.id，不能出现循环依赖，不能出现无意义孤儿节点。\n6. 最终 writer 节点应依赖所有需要汇总的上游结果。\n7. 只返回 JSON，不要 Markdown。\n\nJSON 格式：\n{\n  "goal": "...",\n  "selectedAgents": ["..."],\n  "reason": "...",\n  "steps": [\n    { "id": "research", "agentId": "research", "task": "...", "dependsOn": [] },\n    { "id": "concept", "agentId": "writer", "task": "...", "dependsOn": ["research"] },\n    { "id": "roadmap", "agentId": "planner", "task": "...", "dependsOn": ["research"] },\n    { "id": "writer", "agentId": "writer", "task": "...", "dependsOn": ["concept", "roadmap"] }\n  ]\n}\n\n用户目标：${goal}`; /* 返回完整 Supervisor DAG 提示词。 */
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
    const fallbackId = `day41-step-${index + 1}-${typeof step.agentId === "string" ? step.agentId : "agent"}`; /* 生成第41天缺省步骤 ID。 */
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
    return selectedAgents.map((agentId, index) => ({ id: `day41-step-${index + 1}-${agentId}`, agentId, task: this.buildTaskForAgent(agentId, goal), dependsOn: index === 0 ? [] : [`day41-step-${index}-${selectedAgents[index - 1]}`] })); /* 对简单任务保留可执行的线性 DAG。 */
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
    return { goal, selectedAgents: ["writer"], reason: `原计划校验失败，降级为 Writer Agent 兜底输出：${errors.join("；")}`, steps: [{ id: "day41-fallback-writer", agentId: "writer", task: `整理用户目标并输出可读结果：${goal}`, dependsOn: [] }] }; /* 返回 Writer 兜底计划。 */
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

  private findOrphanSteps(steps: AgentPlanStep[]): string[] { /* 定义第41天孤儿节点检测方法。 */
    if (steps.length <= 1) return []; /* 单节点计划天然不是孤儿 DAG。 */
    const dependedIds = new Set(steps.flatMap((step) => step.dependsOn ?? [])); /* 收集所有被下游节点依赖的步骤 ID。 */
    return steps.filter((step) => (step.dependsOn ?? []).length === 0 && !dependedIds.has(step.id)).map((step) => step.id); /* 返回既无入边也无出边的孤立步骤。 */
  } /* 结束 findOrphanSteps 方法。 */

  private calculateDAGMetrics(steps: AgentPlanStep[]): AgentDAGMetrics { /* 定义第41天 DAG 指标计算方法。 */
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

  private buildAgentUserPrompt(task: AgentTask): string { /* 定义单个 Agent 的用户提示词生成方法。 */
    const previousResults = this.extractPreviousResults(task.context); /* 提取前置 Agent 输出。 */
    const previousText = previousResults.length ? previousResults.map((result) => `【${result.agentId} / ${result.taskId}】\n${result.output}`).join("\n\n") : "无"; /* 格式化前置结果文本。 */
    return `当前任务：\n${task.goal}\n\n前置 Agent 输出：\n${previousText}\n\n请只完成当前 Agent 职责范围内的工作，并把结果写清楚。`; /* 返回 Agent 执行提示词。 */
  } /* 结束 buildAgentUserPrompt 方法。 */

  private extractPreviousResults(taskContext?: unknown): AgentResult[] { /* 定义从任务上下文提取前置结果的方法。 */
    if (!taskContext || typeof taskContext !== "object") return []; /* 上下文为空或非对象时返回空数组。 */
    const parentResults = (taskContext as { parentResults?: unknown }).parentResults; /* 读取第41天 DAG parentResults 字段。 */
    if (Array.isArray(parentResults)) return parentResults.filter((item): item is AgentResult => Boolean(item) && typeof item === "object" && typeof (item as AgentResult).output === "string"); /* 优先返回合法父级依赖结果数组。 */
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
