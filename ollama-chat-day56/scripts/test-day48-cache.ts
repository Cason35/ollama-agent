import assert from "node:assert/strict"; /* 第48天：引入 Node 严格断言用于自动化验收。 */
import { AgentRuntime } from "../lib/agents/agent-runtime"; /* 第48天：引入已接入语义缓存的 Agent Runtime。 */
import { createDefaultAgentRegistry } from "../lib/agents/default-agents"; /* 第48天：引入默认智能体注册表。 */
import { MemoryWorkspaceStore } from "../lib/agents/workspace-store"; /* 第48天：引入内存工作空间存储以隔离测试。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第48天：引入独立用量管理器避免污染共享单例。 */
import { SemanticCache } from "../lib/cache/semantic-cache"; /* 第48天：引入待验收的语义缓存。 */
import { cleanQuery, computeQueryEmbedding, cosineSimilarity } from "../lib/cache/query-embedding"; /* 第48天：引入查询清洗、向量计算与相似度函数。 */

function testQueryEmbeddingAndSimilarity(): void { /* 第48天：定义 Query Embedding 与 Similarity Search 测试。 */
  assert.equal(cleanQuery("介绍 LangGraph"), "langgraph", "应剥离疑问与填充词得到核心语义"); /* 第48天：验证查询清洗归一化。 */
  const base = computeQueryEmbedding("LangGraph 是什么"); /* 第48天：计算基准查询向量。 */
  const similar = computeQueryEmbedding("介绍 LangGraph"); /* 第48天：计算近义查询向量。 */
  const different = computeQueryEmbedding("Redis 是什么"); /* 第48天：计算无关查询向量。 */
  assert.ok(cosineSimilarity(base, similar) >= 0.9, "近义查询相似度应达到命中阈值"); /* 第48天：验证近义查询高相似度。 */
  assert.ok(cosineSimilarity(base, different) < 0.9, "无关查询相似度应低于命中阈值"); /* 第48天：验证无关查询低相似度。 */
} /* 第48天：结束查询向量与相似度测试。 */

function testSemanticCacheHitMiss(): void { /* 第48天：定义对应任务验收的四案例命中测试。 */
  const cache = new SemanticCache(); /* 第48天：创建独立语义缓存。 */
  cache.add({ query: "LangGraph 是什么", answer: "LangGraph 是用于构建有状态大语言模型工作流的图式框架。", score: 90, genDurationMs: 8000 }); /* 第48天：写入首次未命中查询的答案。 */
  assert.equal(cache.search("LangGraph 是什么").hit, true, "完全相同查询应命中缓存"); /* 第48天：验证相同查询命中。 */
  assert.equal(cache.search("介绍 LangGraph").hit, true, "近义查询应命中缓存"); /* 第48天：验证第二条近义查询命中。 */
  assert.equal(cache.search("LangGraph 有什么作用").hit, true, "另一种近义问法应命中缓存"); /* 第48天：验证第三条近义查询命中。 */
  assert.equal(cache.search("Redis 是什么").hit, false, "无关查询应未命中缓存"); /* 第48天：验证第四条无关查询未命中。 */
} /* 第48天：结束语义缓存命中测试。 */

function testCacheMetrics(): void { /* 第48天：定义 Cache Metrics（缓存指标）测试。 */
  const cache = new SemanticCache(); /* 第48天：创建独立语义缓存。 */
  cache.add({ query: "LangGraph 是什么", answer: "LangGraph 是图式工作流框架。", score: 88, genDurationMs: 6000 }); /* 第48天：写入一条缓存。 */
  cache.search("介绍 LangGraph"); /* 第48天：触发一次命中。 */
  cache.search("Redis 是什么"); /* 第48天：触发一次未命中。 */
  const metrics = cache.getMetrics(); /* 第48天：读取缓存指标。 */
  assert.equal(metrics.hitCount, 1, "应统计一次命中"); /* 第48天：验证命中次数。 */
  assert.equal(metrics.missCount, 1, "应统计一次未命中"); /* 第48天：验证未命中次数。 */
  assert.equal(metrics.hitRate, 0.5, "命中率应为 0.5"); /* 第48天：验证命中率。 */
  assert.ok(metrics.savedTokens > 0 && metrics.savedCost > 0, "命中应累计节省词元与费用"); /* 第48天：验证节省统计。 */
  assert.ok(metrics.avgLatencyReduction > 0, "命中应记录平均延迟降低"); /* 第48天：验证延迟降低统计。 */
} /* 第48天：结束缓存指标测试。 */

function testCacheTTLAndLRU(): void { /* 第48天：定义 TTL 失效与 LRU 淘汰测试。 */
  let clock = 1_000_000; /* 第48天：定义可控时间起点。 */
  const ttlCache = new SemanticCache({ defaultTtlPolicy: "24h", now: () => clock }); /* 第48天：注入可控时钟构造缓存。 */
  ttlCache.add({ query: "LangGraph 是什么", answer: "图式工作流框架。", genDurationMs: 5000 }); /* 第48天：写入一条 24 小时 TTL 缓存。 */
  assert.equal(ttlCache.search("介绍 LangGraph").hit, true, "未过期前近义查询应命中"); /* 第48天：验证未过期命中。 */
  clock += 25 * 60 * 60 * 1000; /* 第48天：把时钟前进 25 小时使条目过期。 */
  assert.equal(ttlCache.search("介绍 LangGraph").hit, false, "超过 TTL 后应判定未命中"); /* 第48天：验证 TTL 过期失效。 */
  const lruCache = new SemanticCache({ maxEntries: 2 }); /* 第48天：构造容量为二的缓存以触发 LRU。 */
  lruCache.add({ query: "LangGraph 是什么", answer: "A" }); /* 第48天：写入第一条缓存。 */
  lruCache.add({ query: "Redis 是什么", answer: "B" }); /* 第48天：写入第二条缓存。 */
  lruCache.search("Redis 是什么"); /* 第48天：访问第二条使其成为最近使用。 */
  lruCache.add({ query: "Kafka 是什么", answer: "C" }); /* 第48天：写入第三条触发 LRU 淘汰。 */
  assert.equal(lruCache.search("LangGraph 是什么").hit, false, "最近最少使用的条目应被 LRU 淘汰"); /* 第48天：验证 LRU 淘汰最久未访问条目。 */
  assert.equal(lruCache.search("Kafka 是什么").hit, true, "新写入条目应保留在缓存中"); /* 第48天：验证新条目保留。 */
} /* 第48天：结束 TTL 与 LRU 测试。 */

async function testAgentRuntimeCacheIntegration(): Promise<void> { /* 第48天：定义 Agent Runtime 接入缓存与 Trace cache span 测试。 */
  const cache = new SemanticCache(); /* 第48天：创建测试专用语义缓存。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore(), new UsageManager(), cache); /* 第48天：注入独立工作空间、用量管理器与缓存。 */
  const first = await runtime.answerWithCache("LangGraph 是什么"); /* 第48天：首次查询应未命中并真实执行智能体。 */
  assert.equal(first.cacheStatus, "miss", "首次查询应未命中缓存"); /* 第48天：验证首次未命中。 */
  assert.ok(first.answer.length > 0, "未命中查询应返回真实生成答案"); /* 第48天：验证生成答案非空。 */
  const second = await runtime.answerWithCache("介绍 LangGraph"); /* 第48天：第二次近义查询应命中缓存。 */
  assert.equal(second.cacheStatus, "hit", "近义查询应命中缓存"); /* 第48天：验证命中。 */
  assert.equal(second.savedFromCache, true, "命中答案应直接来自缓存复用"); /* 第48天：验证答案来自缓存。 */
  assert.ok(second.durationMs <= first.durationMs, "命中耗时应不高于首次生成耗时"); /* 第48天：验证缓存降低延迟。 */
  const cacheSpans = runtime.listTraces().flatMap((trace) => trace.spans).filter((span) => span.type === "cache"); /* 第48天：收集全部 cache span（缓存跨度）。 */
  assert.ok(cacheSpans.length >= 2, "每次查询都应在 Trace 中产生 cache span"); /* 第48天：验证 Trace 接入缓存跨度。 */
  assert.ok(cacheSpans.some((span) => span.metadata?.cacheStatus === "hit"), "应存在命中状态的 cache span"); /* 第48天：验证命中跨度状态。 */
  assert.ok(cacheSpans.some((span) => span.metadata?.cacheStatus === "miss"), "应存在未命中状态的 cache span"); /* 第48天：验证未命中跨度状态。 */
} /* 第48天：结束 Agent Runtime 缓存接入测试。 */

async function main(): Promise<void> { /* 第48天：定义 Day 48 自动化验收主入口。 */
  testQueryEmbeddingAndSimilarity(); /* 第48天：执行查询向量与相似度测试。 */
  testSemanticCacheHitMiss(); /* 第48天：执行四案例命中测试。 */
  testCacheMetrics(); /* 第48天：执行缓存指标测试。 */
  testCacheTTLAndLRU(); /* 第48天：执行 TTL 与 LRU 测试。 */
  await testAgentRuntimeCacheIntegration(); /* 第48天：执行 Agent Runtime 缓存接入测试。 */
  console.log("Day 48 Semantic Cache Runtime tests passed."); /* 第48天：输出自动化验收成功提示。 */
} /* 第48天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第48天：启动测试并捕获异步断言或运行时错误。 */
  console.error(error); /* 第48天：输出失败原因以便定位具体测试。 */
  process.exitCode = 1; /* 第48天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第48天：结束自动化测试错误处理。 */
