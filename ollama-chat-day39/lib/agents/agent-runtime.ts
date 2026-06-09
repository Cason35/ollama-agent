import type { AgentCallEdge, AgentCollaborationSnapshot, AgentContext, AgentResult, AgentTask, AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 引入第39天协作运行时需要的类型 */
import { AgentRegistry } from "@/lib/agents/agent-registry"; /* 引入智能体注册表用于查找执行目标 */

type RuntimeMetrics = { /* 定义运行时内部指标结构 */
  executedTasks: number; /* 记录已经执行的任务数量 */
  delegatedTasks: number; /* 记录已经委派的任务数量 */
  totalDuration: number; /* 记录全部任务模拟耗时总和 */
  successfulTasks: number; /* 记录成功完成的任务数量 */
}; /* 结束 RuntimeMetrics 类型定义 */

export class AgentRuntime { /* 定义第39天智能体协作运行时 */
  private readonly callGraph: AgentCallEdge[] = []; /* 保存本次运行产生的智能体调用图 */
  private readonly timeline: AgentTimelineEvent[] = []; /* 保存本次运行产生的智能体时间线 */
  private readonly metrics: RuntimeMetrics = { executedTasks: 0, delegatedTasks: 0, totalDuration: 0, successfulTasks: 0 }; /* 初始化运行时指标 */

  constructor(private readonly registry: AgentRegistry) {} /* 注入智能体注册表 */

  executeAgent(agentId: string, task: AgentTask, context?: AgentContext): AgentResult { /* 定义执行单个智能体任务的方法 */
    const startedAt = Date.now(); /* 记录任务开始时间戳 */
    const assignedTask = { ...task, assignedAgentId: task.assignedAgentId ?? agentId }; /* 确保任务带有被分配的智能体 ID */
    const agent = this.registry.get(agentId); /* 从注册表查找目标智能体 */
    this.pushTimeline(agentId, assignedTask.id, `${agentId} started`); /* 记录智能体开始执行事件 */
    this.metrics.executedTasks += 1; /* 累加已经执行的任务数量 */
    if (!agent) { /* 判断目标智能体是否不存在 */
      this.pushTimeline(agentId, assignedTask.id, `${agentId} failed`); /* 记录智能体失败事件 */
      return { taskId: assignedTask.id, agentId, output: `未找到 Agent：${agentId}`, metadata: { ok: false } }; /* 返回找不到智能体的结构化结果 */
    } /* 结束智能体缺失判断 */
    const contextText = this.describeContext(context, assignedTask.context); /* 生成上下文状态描述 */
    const output = `${agent.name} 已处理任务 ${assignedTask.id}：${assignedTask.goal}。能力：${agent.capabilities.join(", ")}。工具：${agent.tools.join(", ")}。上下文：${contextText}。`; /* 生成模拟执行输出 */
    const duration = Math.max(1, Date.now() - startedAt); /* 计算至少 1 毫秒的任务耗时 */
    this.metrics.totalDuration += duration; /* 累加任务耗时 */
    this.metrics.successfulTasks += 1; /* 累加成功任务数量 */
    this.pushTimeline(agentId, assignedTask.id, `${agentId} finished`); /* 记录智能体完成事件 */
    return { taskId: assignedTask.id, agentId, output, metadata: { ok: true, duration, assignedAgentId: assignedTask.assignedAgentId } }; /* 返回结构化执行结果 */
  } /* 结束 executeAgent 方法 */

  delegateTask(fromAgentId: string, targetAgentId: string, task: AgentTask, context?: AgentContext): AgentResult { /* 定义智能体之间的任务委派方法 */
    const delegatedTask = { ...task, assignedAgentId: targetAgentId }; /* 将任务标记为分配给目标智能体 */
    this.metrics.delegatedTasks += 1; /* 累加委派任务数量 */
    this.callGraph.push({ fromAgentId, toAgentId: targetAgentId, taskId: delegatedTask.id }); /* 记录调用图边 */
    this.pushTimeline(fromAgentId, delegatedTask.id, `${fromAgentId} delegated to ${targetAgentId}`); /* 记录委派时间线事件 */
    return this.executeAgent(targetAgentId, delegatedTask, context); /* 调用目标智能体执行被委派任务 */
  } /* 结束 delegateTask 方法 */

  aggregateResults(rootResult: AgentResult, childResults: AgentResult[]): AgentResult { /* 定义聚合上游与下游结果的方法 */
    const outputs = [rootResult.output, ...childResults.map((result) => result.output)]; /* 收集根结果和子结果输出 */
    return { ...rootResult, output: outputs.join("\n\n"), childResults }; /* 返回带嵌套子结果的聚合结果 */
  } /* 结束 aggregateResults 方法 */

  runFixedCollaboration(goal: string, context?: AgentContext): AgentCollaborationSnapshot { /* 定义第39天固定协作链执行入口 */
    const rootTask: AgentTask = { id: "day39-root-task", goal, context: { stage: "root" }, assignedAgentId: "research" }; /* 创建研究智能体根任务 */
    const researchResult = this.executeAgent("research", rootTask, context); /* 先执行研究智能体 */
    const plannerResult = this.delegateTask("research", "planner", { id: "day39-plan-task", goal: `基于研究结果规划：${goal}`, parentTaskId: rootTask.id, context: researchResult.output }, context); /* 委派给规划智能体 */
    const criticResult = this.delegateTask("planner", "critic", { id: "day39-review-task", goal: `审查规划结果：${goal}`, parentTaskId: plannerResult.taskId, context: plannerResult.output }, context); /* 委派给审查智能体 */
    const writerResult = this.delegateTask("critic", "writer", { id: "day39-write-task", goal: `汇总最终答案：${goal}`, parentTaskId: criticResult.taskId, context: criticResult.output }, context); /* 委派给写作智能体 */
    const result = this.aggregateResults(researchResult, [plannerResult, criticResult, writerResult]); /* 聚合完整协作链结果 */
    return { result, callGraph: this.callGraph, timeline: this.timeline, metrics: this.getRuntimeMetrics() }; /* 返回协作快照 */
  } /* 结束 runFixedCollaboration 方法 */

  getRuntimeMetrics(): AgentCollaborationSnapshot["metrics"] { /* 定义读取运行时指标的方法 */
    const avgTaskDuration = this.metrics.executedTasks ? Number((this.metrics.totalDuration / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算平均任务耗时 */
    const successRate = this.metrics.executedTasks ? Number((this.metrics.successfulTasks / this.metrics.executedTasks).toFixed(2)) : 0; /* 计算任务成功率 */
    return { executedTasks: this.metrics.executedTasks, delegatedTasks: this.metrics.delegatedTasks, avgTaskDuration, successRate }; /* 返回运行时指标快照 */
  } /* 结束 getRuntimeMetrics 方法 */

  private describeContext(context?: AgentContext, taskContext?: unknown): string { /* 定义上下文说明生成方法 */
    const memoryReady = context?.memory ? "已接收记忆上下文" : "暂无记忆上下文"; /* 生成记忆上下文状态 */
    const workflowReady = context?.workflow ? "已接收工作流上下文" : "暂无工作流上下文"; /* 生成工作流上下文状态 */
    const toolsReady = context?.tools ? "已接收工具上下文" : "暂无工具上下文"; /* 生成工具上下文状态 */
    const taskReady = taskContext ? "已接收上游任务上下文" : "暂无上游任务上下文"; /* 生成任务上下文状态 */
    return `${memoryReady}，${workflowReady}，${toolsReady}，${taskReady}`; /* 返回合并后的上下文说明 */
  } /* 结束 describeContext 方法 */

  private pushTimeline(agentId: string, taskId: string, label: string): void { /* 定义追加时间线事件的方法 */
    this.timeline.push({ id: `${this.timeline.length + 1}-${agentId}-${taskId}`, agentId, taskId, label, timestamp: new Date().toISOString() }); /* 写入一个新的时间线事件 */
  } /* 结束 pushTimeline 方法 */
} /* 结束 AgentRuntime 类定义 */
