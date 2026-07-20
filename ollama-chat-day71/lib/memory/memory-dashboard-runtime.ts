import { AgentRuntime } from "@/lib/agents/agent-runtime"; /* 第49天：引入已接入长期记忆的智能体运行时。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 第49天：引入默认智能体注册表以运行记忆演示。 */
import { MemoryWorkspaceStore } from "@/lib/agents/workspace-store"; /* 第49天：引入内存工作空间存储，隔离演示运行状态。 */
import { longTermMemory } from "@/lib/memory/long-term-memory-store"; /* 第49天：引入进程内共享长期记忆供接口与前端复用。 */
import type { MemoryConsolidationResult, MemoryRetrievalPreview, MemorySnapshot, MemoryUpdateInput } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入记忆整合、检索预览、快照与更新类型。 */

const DEMO_RESEARCH_GOALS = ["研究 LangGraph", "研究 CrewAI", "研究 MCP（Model Context Protocol，模型上下文协议）"]; /* 第49天：定义对应任务验收的三条研究任务，用于积累经验记忆。 */
const DEMO_QUERY = "如何学习 Agent（智能体）？"; /* 第49天：定义验证“能否复用历史经验”的检索查询。 */
const DUPLICATE_LESSON = "LangGraph DAG（有向无环图）很重要"; /* 第49天：定义用于演示记忆整合的重复经验。 */

let lastRetrieval: MemoryRetrievalPreview | null = null; /* 第49天：缓存最近一次演示的检索预览。 */
let lastConsolidation: MemoryConsolidationResult | null = null; /* 第49天：缓存最近一次整合结果。 */

async function runMemoryDemo(): Promise<void> { /* 第49天：定义运行完整长期记忆演示链路的函数。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore()); /* 第49天：创建复用共享长期记忆单例的智能体运行时。 */
  for (const goal of DEMO_RESEARCH_GOALS) await runtime.answerWithLongTermMemory(goal); /* 第49天：依次执行三条研究任务，自动检索并写回经验。 */
  for (let i = 0; i < 5; i += 1) longTermMemory.add({ type: "lesson", content: DUPLICATE_LESSON, source: { agentId: "research" } }); /* 第49天：写入五条重复教训以演示记忆整合。 */
  lastConsolidation = longTermMemory.consolidateMemories(); /* 第49天：执行记忆整合压缩重复经验。 */
  const hits = longTermMemory.retrieve(DEMO_QUERY, { topK: 5 }); /* 第49天：检索与“如何学习 Agent”最相关的历史经验。 */
  lastRetrieval = { query: DEMO_QUERY, hits: hits.map((hit) => ({ id: hit.item.id, type: hit.item.type, content: hit.item.content, score: hit.score, semantic: hit.semantic, importance: hit.importance, recency: hit.recency })) }; /* 第49天：保存检索预览供前端展示综合打分。 */
} /* 第49天：结束长期记忆演示运行函数。 */

export async function getMemoryDashboardSnapshot(force = false): Promise<MemorySnapshot> { /* 第49天：定义读取或强制重跑 Memory Explorer V2 快照的入口。 */
  if (force) { longTermMemory.clear(); lastRetrieval = null; lastConsolidation = null; } /* 第49天：强制运行时清空记忆与演示状态，保证新快照独立。 */
  if (longTermMemory.list().length === 0) await runMemoryDemo(); /* 第49天：记忆为空时生成一次完整演示链路。 */
  return { items: longTermMemory.summaries(), metrics: longTermMemory.stats(), retrieval: lastRetrieval, consolidation: lastConsolidation, generatedAt: Date.now() }; /* 第49天：返回记忆条目、指标、检索预览与整合结果快照。 */
} /* 第49天：结束 Memory Explorer V2 快照入口。 */

export function deleteMemoryItem(id: string): boolean { /* 第49天：定义供接口调用的删除单条记忆方法。 */
  return longTermMemory.delete(id); /* 第49天：删除指定记忆并返回是否成功。 */
} /* 第49天：结束删除记忆方法。 */

export function updateMemoryItem(id: string, patch: MemoryUpdateInput): boolean { /* 第49天：定义供接口调用的更新或置顶记忆方法。 */
  return longTermMemory.update(id, patch) !== null; /* 第49天：更新记忆并返回是否命中目标条目。 */
} /* 第49天：结束更新记忆方法。 */

export function clearMemory(): void { /* 第49天：定义供接口调用的清空全部记忆方法。 */
  longTermMemory.clear(); /* 第49天：清空全部记忆条目与统计。 */
  lastRetrieval = null; /* 第49天：清空检索预览。 */
  lastConsolidation = null; /* 第49天：清空整合结果。 */
} /* 第49天：结束清空记忆方法。 */
