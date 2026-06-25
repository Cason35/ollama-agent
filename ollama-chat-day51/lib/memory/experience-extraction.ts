import type { AgentCollaborationSnapshot } from "@/lib/agents/agent-types"; /* 第49天：引入多智能体协作快照类型，作为经验提取的数据来源。 */
import type { MemoryAddInput, MemoryItemSource } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入记忆写入入参与来源类型。 */

const TOPIC_STOPWORDS = ["研究", "学习", "介绍", "了解", "如何", "怎么", "请", "帮我", "一下", "的", "是什么", "关于"]; /* 第49天：定义从任务目标提取主题时需要剥离的填充词。 */

export function deriveTopic(goal: string): string { /* 第49天：定义从任务目标中提炼核心主题的函数。 */
  let text = goal.trim(); /* 第49天：去除首尾空白。 */
  for (const word of TOPIC_STOPWORDS) text = text.split(word).join(" "); /* 第49天：逐个剥离填充词。 */
  const cleaned = text.replace(/[\s\p{P}\p{S}]+/gu, " ").trim(); /* 第49天：压缩空白与标点。 */
  return cleaned || goal.trim(); /* 第49天：返回提炼后的主题，空结果时回退原始目标。 */
} /* 第49天：结束主题提取函数。 */

export type ExperienceExtractionInput = { /* 第49天：定义经验提取所需的精简输入结构。 */
  goal: string; /* 第49天：保存本次任务目标。 */
  source?: MemoryItemSource; /* 第49天：保存记忆来源（Trace、Workspace、Agent）。 */
  evaluations?: Array<{ agentId: string; score: number }>; /* 第49天：保存各智能体的评估分数。 */
  topAgents?: string[]; /* 第49天：保存评估表现最好的智能体列表（格式 agentId:score）。 */
  reflectionSuggestions?: string[]; /* 第49天：保存反思阶段产生的改进建议。 */
}; /* 第49天：结束经验提取输入定义。 */

export function extractExperiences(input: ExperienceExtractionInput): MemoryAddInput[] { /* 第49天：定义从任务结果中自动提取经验记忆的函数。 */
  const topic = deriveTopic(input.goal); /* 第49天：先提炼任务主题。 */
  const experiences: MemoryAddInput[] = []; /* 第49天：初始化待写入记忆列表。 */
  const topAgent = (input.topAgents ?? [])[0]; /* 第49天：取评估表现最好的智能体条目。 */
  if (topAgent) { /* 第49天：存在最佳智能体时生成一条教训记忆。 */
    const [agentId, score] = topAgent.split(":"); /* 第49天：拆分智能体标识与平均分。 */
    experiences.push({ type: "lesson", content: `${agentId} 在「${topic}」这类知识密集型任务中表现最好（平均评估 ${score} 分），后续遇到同类任务应优先调用。`, importance: 0.9, confidence: 0.82, source: input.source }); /* 第49天：把“某智能体在某类任务表现最好”沉淀为教训。 */
  } /* 第49天：结束最佳智能体经验生成。 */
  for (const evaluation of input.evaluations ?? []) { /* 第49天：遍历每个智能体的评估结果。 */
    if (evaluation.score >= 85) experiences.push({ type: "experience", content: `${evaluation.agentId} 在「${topic}」任务中产出高质量结果（评估 ${evaluation.score} 分）。`, importance: 0.72, confidence: 0.75, source: input.source }); /* 第49天：高分结果沉淀为经验记忆。 */
  } /* 第49天：结束评估遍历。 */
  for (const suggestion of (input.reflectionSuggestions ?? []).slice(0, 2)) { /* 第49天：取前两条反思建议生成教训。 */
    if (suggestion.trim()) experiences.push({ type: "lesson", content: `处理「${topic}」任务的教训：${suggestion.trim()}`, importance: 0.7, confidence: 0.68, source: input.source }); /* 第49天：把反思建议沉淀为教训记忆。 */
  } /* 第49天：结束反思建议遍历。 */
  experiences.push({ type: "decision", content: `完成「${topic}」任务时采用 Supervisor 多智能体协作 DAG 编排并经过 Reflection 与 Evaluation 闭环。`, importance: 0.74, confidence: 0.7, source: input.source }); /* 第49天：把本次采用的协作策略沉淀为决策记忆。 */
  return experiences; /* 第49天：返回全部提取出的经验记忆。 */
} /* 第49天：结束经验提取函数。 */

export function extractExperiencesFromSnapshot(goal: string, snapshot: AgentCollaborationSnapshot, source?: MemoryItemSource): MemoryAddInput[] { /* 第49天：定义从协作快照适配经验提取输入的函数。 */
  const evaluations = snapshot.evaluations.map((record) => ({ agentId: record.agentId, score: record.evaluation.score })); /* 第49天：把评估记录映射为精简评估列表。 */
  const reflectionSuggestions = snapshot.reflectionAttempts.flatMap((attempt) => attempt.reflection.suggestions); /* 第49天：收集全部反思建议。 */
  return extractExperiences({ goal, source: { ...source, workspaceId: source?.workspaceId ?? snapshot.workspace.id, traceId: source?.traceId ?? snapshot.trace.traceId }, evaluations, topAgents: snapshot.evaluationMetrics.topAgents, reflectionSuggestions }); /* 第49天：基于快照字段调用通用经验提取。 */
} /* 第49天：结束快照经验提取函数。 */
