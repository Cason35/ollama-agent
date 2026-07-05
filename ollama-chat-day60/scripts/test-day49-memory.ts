import assert from "node:assert/strict"; /* 第49天：引入 Node 严格断言用于自动化验收。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第49天：引入已接入长期记忆的 Agent Runtime。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第49天：引入默认智能体注册表。 */
import { MemoryWorkspaceStore } from "../lib/agents/workspace-store"; /* 第49天：引入内存工作空间存储以隔离测试。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第49天：引入独立用量管理器避免污染共享单例。 */
import { SemanticCache } from "../lib/cache/semantic-cache"; /* 第49天：引入独立语义缓存避免污染共享单例。 */
import { LongTermMemoryStore } from "../lib/memory/long-term-memory-store"; /* 第49天：引入待验收的长期记忆存储。 */
import { extractExperiences, deriveTopic } from "../lib/memory/experience-extraction"; /* 第49天：引入经验提取与主题提炼函数。 */

function testMemoryStoreCrud(): void { /* 第49天：定义 MemoryItemV2 与 LongTermMemoryStore 基础增删改查测试。 */
  const store = new LongTermMemoryStore(); /* 第49天：创建独立长期记忆存储。 */
  const item = store.add({ type: "fact", content: "LangGraph 是图式工作流框架" }); /* 第49天：新增一条事实记忆。 */
  assert.equal(item.type, "fact", "记忆类型应被正确写入"); /* 第49天：验证类型写入。 */
  assert.ok(item.embedding.length > 0, "记忆应生成向量用于语义检索"); /* 第49天：验证向量生成。 */
  assert.ok(store.update(item.id, { importance: 0.95 }), "更新已存在记忆应成功"); /* 第49天：验证更新成功。 */
  assert.equal(store.list()[0].importance, 0.95, "更新后的重要性应生效"); /* 第49天：验证更新生效。 */
  assert.equal(store.stats().totalMemories, 1, "统计应反映记忆总数"); /* 第49天：验证统计总数。 */
  assert.equal(store.delete(item.id), true, "删除已存在记忆应返回成功"); /* 第49天：验证删除成功。 */
  assert.equal(store.stats().totalMemories, 0, "删除后记忆总数应归零"); /* 第49天：验证删除后归零。 */
} /* 第49天：结束基础增删改查测试。 */

function testExperienceExtraction(): void { /* 第49天：定义 Experience Extraction（经验提取）测试。 */
  assert.equal(deriveTopic("研究 LangGraph"), "LangGraph", "应从任务目标提炼出核心主题"); /* 第49天：验证主题提炼。 */
  const experiences = extractExperiences({ goal: "研究 LangGraph", topAgents: ["research:92"], evaluations: [{ agentId: "research", score: 92 }], reflectionSuggestions: ["补充关键概念与边界条件"] }); /* 第49天：从任务结果提取经验。 */
  assert.ok(experiences.some((item) => item.type === "lesson"), "应至少生成一条教训记忆"); /* 第49天：验证生成教训。 */
  assert.ok(experiences.some((item) => item.content.includes("LangGraph")), "经验内容应包含任务主题"); /* 第49天：验证经验包含主题。 */
  assert.ok(experiences.some((item) => item.type === "decision"), "应生成一条协作策略决策记忆"); /* 第49天：验证生成决策。 */
} /* 第49天：结束经验提取测试。 */

function testMemoryRetrievalV2(): void { /* 第49天：定义 Memory Retrieval V2（综合打分检索）测试。 */
  const store = new LongTermMemoryStore(); /* 第49天：创建独立长期记忆存储。 */
  store.add({ type: "lesson", content: "LangGraph 是图式工作流框架，适合编排有状态智能体流程", importance: 0.9 }); /* 第49天：写入与查询相关的高重要性教训。 */
  store.add({ type: "fact", content: "Redis 是内存数据库", importance: 0.5 }); /* 第49天：写入无关的低重要性事实。 */
  const hits = store.retrieve("介绍 LangGraph", { topK: 2 }); /* 第49天：执行综合打分检索。 */
  assert.ok(hits.length > 0, "检索应返回结果"); /* 第49天：验证检索有结果。 */
  assert.ok(hits[0].item.content.includes("LangGraph"), "最相关记忆应排在首位"); /* 第49天：验证语义最相关排首位。 */
  assert.ok(hits[0].score >= 0.5 * hits[0].semantic + 0.3 * hits[0].importance, "综合分应包含语义与重要性分量"); /* 第49天：验证综合公式生效。 */
} /* 第49天：结束记忆检索测试。 */

function testMemoryConsolidation(): void { /* 第49天：定义 Memory Consolidation（记忆整合）测试。 */
  const store = new LongTermMemoryStore(); /* 第49天：创建独立长期记忆存储。 */
  for (let i = 0; i < 5; i += 1) store.add({ type: "lesson", content: "LangGraph DAG（有向无环图）很重要" }); /* 第49天：写入五条重复教训。 */
  assert.equal(store.stats().totalMemories, 5, "整合前应有五条重复记忆"); /* 第49天：验证整合前数量。 */
  const result = store.consolidateMemories(); /* 第49天：执行记忆整合。 */
  assert.equal(result.after, 1, "重复经验应被整合压缩为一条"); /* 第49天：验证整合后数量。 */
  assert.equal(result.removed, 4, "应删除四条重复记忆"); /* 第49天：验证删除条数。 */
  assert.equal(store.list()[0].consolidatedFrom, 5, "整合记忆应记录来源条数"); /* 第49天：验证整合来源计数。 */
} /* 第49天：结束记忆整合测试。 */

function testImportanceDecay(): void { /* 第49天：定义 Importance Decay（重要性衰减）测试。 */
  const store = new LongTermMemoryStore(); /* 第49天：创建独立长期记忆存储。 */
  store.add({ type: "lesson", content: "LangGraph 图式工作流框架", importance: 0.8 }); /* 第49天：写入低访问量记忆。 */
  store.add({ type: "fact", content: "Redis 内存数据库系统", importance: 0.8 }); /* 第49天：写入将被高频访问的记忆。 */
  for (let i = 0; i < 10; i += 1) store.retrieve("Redis 内存数据库系统", { topK: 1 }); /* 第49天：多次检索抬高 Redis 记忆访问次数。 */
  const decayed = store.importanceDecay(); /* 第49天：执行重要性衰减。 */
  assert.ok(decayed > 0, "衰减应作用于至少一条记忆"); /* 第49天：验证衰减发生。 */
  const items = store.list(); /* 第49天：读取衰减后的记忆。 */
  const redis = items.find((item) => item.content.includes("Redis")); /* 第49天：找到高访问量记忆。 */
  const langgraph = items.find((item) => item.content.includes("LangGraph")); /* 第49天：找到低访问量记忆。 */
  assert.ok(redis && langgraph && redis.importance > langgraph.importance, "访问越多的记忆衰减越慢，重要性应更高"); /* 第49天：验证访问频率减缓衰减。 */
} /* 第49天：结束重要性衰减测试。 */

async function testAgentRuntimeMemoryIntegration(): Promise<void> { /* 第49天：定义 Agent Runtime 接入长期记忆与 Trace memory span 测试。 */
  const store = new LongTermMemoryStore(); /* 第49天：创建测试专用长期记忆存储。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore(), new UsageManager(), new SemanticCache(), store); /* 第49天：注入独立工作空间、用量、缓存与记忆。 */
  await runtime.answerWithLongTermMemory("研究 LangGraph"); /* 第49天：研究 LangGraph 并写回经验。 */
  await runtime.answerWithLongTermMemory("研究 CrewAI"); /* 第49天：研究 CrewAI 并写回经验。 */
  await runtime.answerWithLongTermMemory("研究 MCP（Model Context Protocol，模型上下文协议）"); /* 第49天：研究 MCP 并写回经验。 */
  assert.ok(store.list().some((item) => item.type === "lesson"), "完成多次研究后应自动生成教训记忆"); /* 第49天：验证自动生成 lessons。 */
  const answer = await runtime.answerWithLongTermMemory("如何学习 Agent（智能体）？"); /* 第49天：提问学习路径并复用历史经验。 */
  assert.ok(answer.retrievedExperiences.length > 0, "提问时应能检索并复用历史经验记忆"); /* 第49天：验证复用经验记忆。 */
  assert.ok(answer.answer.length > 0, "记忆增强后应返回非空答案"); /* 第49天：验证返回答案非空。 */
  const memorySpans = runtime.listTraces().flatMap((trace) => trace.spans).filter((span) => span.type === "memory"); /* 第49天：收集全部 memory span（记忆跨度）。 */
  assert.ok(memorySpans.length >= 2, "每次记忆增强查询都应在 Trace 中产生 memory span"); /* 第49天：验证 Trace 接入记忆跨度。 */
} /* 第49天：结束 Agent Runtime 记忆接入测试。 */

async function main(): Promise<void> { /* 第49天：定义 Day 49 自动化验收主入口。 */
  testMemoryStoreCrud(); /* 第49天：执行记忆存储增删改查测试。 */
  testExperienceExtraction(); /* 第49天：执行经验提取测试。 */
  testMemoryRetrievalV2(); /* 第49天：执行综合打分检索测试。 */
  testMemoryConsolidation(); /* 第49天：执行记忆整合测试。 */
  testImportanceDecay(); /* 第49天：执行重要性衰减测试。 */
  await testAgentRuntimeMemoryIntegration(); /* 第49天：执行 Agent Runtime 记忆接入测试。 */
  console.log("Day 49 Long-Term Memory V2 tests passed."); /* 第49天：输出自动化验收成功提示。 */
} /* 第49天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第49天：启动测试并捕获异步断言或运行时错误。 */
  console.error(error); /* 第49天：输出失败原因以便定位具体测试。 */
  process.exitCode = 1; /* 第49天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第49天：结束自动化测试错误处理。 */
