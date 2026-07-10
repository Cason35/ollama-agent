import { AgentRuntime } from "@/lib/agents/agent-runtime"; /* 第48天：引入已接入语义缓存的智能体运行时。 */
import { createDefaultAgentRegistry } from "@/lib/agents/default-agents"; /* 第48天：引入默认智能体注册表以运行缓存演示。 */
import { MemoryWorkspaceStore } from "@/lib/agents/workspace-store"; /* 第48天：引入内存工作空间存储，隔离演示运行状态。 */
import { semanticCache } from "@/lib/cache/semantic-cache"; /* 第48天：引入进程内共享语义缓存供接口与前端复用。 */
import type { CacheEvent, CacheSnapshot } from "@/lib/cache/cache-types"; /* 第48天：引入缓存事件与快照类型。 */

const DEMO_QUERIES = ["LangGraph 是什么", "介绍 LangGraph", "LangGraph 有什么作用", "Redis 是什么"]; /* 第48天：定义对应任务验收的四条演示查询，期望产生 Miss、Hit、Hit、Miss。 */

let latestEvents: CacheEvent[] = []; /* 第48天：缓存最近一次演示生成的查询事件序列。 */

async function runCacheDemo(): Promise<void> { /* 第48天：定义运行完整缓存命中演示链路的函数。 */
  const runtime = new AgentRuntime(createDefaultAgentRegistry(), new MemoryWorkspaceStore()); /* 第48天：创建复用共享语义缓存的智能体运行时。 */
  const events: CacheEvent[] = []; /* 第48天：初始化本次演示的事件列表。 */
  for (const query of DEMO_QUERIES) { /* 第48天：按顺序依次执行四条演示查询。 */
    const answer = await runtime.answerWithCache(query); /* 第48天：通过缓存感知入口执行查询，第二、三条应命中缓存。 */
    events.push({ query: answer.query, status: answer.cacheStatus, similarity: answer.similarity, traceId: answer.traceId, durationMs: answer.durationMs, savedCost: answer.savedFromCache ? await estimateSavedCostForHit() : 0 }); /* 第58天：记录每条查询的命中状态、相似度、耗时与 Redis 共享缓存节省费用。 */
  } /* 第48天：结束演示查询循环。 */
  latestEvents = events; /* 第48天：保存最近一次演示事件序列供快照复用。 */
} /* 第48天：结束缓存演示运行函数。 */

async function estimateSavedCostForHit(): Promise<number> { /* 第58天：定义读取最近一次命中节省费用的异步辅助函数，支持 RedisCacheStore 水合。 */
  const summaries = await semanticCache.summariesAsync(); /* 第58天：读取当前缓存条目摘要，Redis 可用时先从共享缓存加载。 */
  return summaries.reduce((max, item) => (item.savedCost > max ? item.savedCost : max), 0); /* 第48天：以条目中最大的单条节省费用近似代表命中节省。 */
} /* 第48天：结束命中节省费用辅助函数。 */

export async function getCacheDashboardSnapshot(force = false): Promise<CacheSnapshot> { /* 第48天：定义读取或强制重跑 Cache Explorer 快照的入口。 */
  if (force) { await semanticCache.clearAsync(); latestEvents = []; } /* 第58天：强制运行时清空 Redis/Memory 缓存与事件，保证新快照独立。 */
  if ((await semanticCache.listAsync()).length === 0 || latestEvents.length === 0) await runCacheDemo(); /* 第58天：缓存为空或缺少事件时生成一次完整演示链路，Redis 可用时会写入共享缓存。 */
  return { entries: await semanticCache.summariesAsync(), metrics: semanticCache.getMetrics(), events: latestEvents, threshold: semanticCache.getThreshold(), backend: semanticCache.getBackendName(), generatedAt: Date.now() }; /* 第58天：返回缓存条目、指标、事件、命中阈值与后端类型。 */
} /* 第48天：结束 Cache Explorer 快照入口。 */

export async function invalidateCacheEntry(id: string): Promise<boolean> { /* 第58天：定义供接口调用的异步手动失效单条缓存方法。 */
  return await semanticCache.invalidateAsync(id); /* 第58天：同时失效内存索引与 RedisCacheStore 中的指定缓存条目。 */
} /* 第48天：结束手动失效方法。 */

export async function clearCache(): Promise<void> { /* 第58天：定义供接口调用的异步清空全部缓存方法。 */
  await semanticCache.clearAsync(); /* 第58天：清空全部内存缓存条目与 RedisCacheStore 条目。 */
  latestEvents = []; /* 第48天：同时清空事件缓存。 */
} /* 第48天：结束清空缓存方法。 */
