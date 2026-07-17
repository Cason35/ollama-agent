import assert from "node:assert/strict"; // 第68天：引入 Node.js 严格断言验证生产记忆平台端到端行为。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第68天：引入统一事件总线验证记忆生命周期事件。
import { InMemoryProductionMemoryMetadataStore, PersistentLongTermMemoryProvider, ProductionMemoryVectorStore } from "@/lib/memory/persistent-long-term-memory-provider"; // 第68天：引入长期记忆内存元数据存储、Provider 和 VectorStore 以隔离外部 MySQL。
import { InMemorySessionMemoryBackend, RedisSessionMemoryProvider } from "@/lib/memory/redis-session-memory-provider"; // 第68天：引入可控 TTL 内存后端和 Redis 会话 Provider 以隔离外部 Redis。
import { ProductionMemoryService, createProductionMemoryMetricCounters } from "@/lib/memory/production-memory-service"; // 第68天：引入生产记忆统一服务和指标容器工厂。
import { registerProductionMemoryCapabilities } from "@/lib/memory/production-memory-platform"; // 第68天：引入生产记忆能力统一注册函数。
import type { ProductionMemoryDraft } from "@/lib/memory/production-memory-types"; // 第68天：引入生产记忆草稿类型构造测试数据。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第68天：引入历史统一注册中心验证 Day68 能力增量注册。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第68天：引入运行时上下文构建器验证生产记忆注入。
function memoryDraft(input: Partial<ProductionMemoryDraft> & Pick<ProductionMemoryDraft, "scope" | "scopeId" | "type" | "content">): ProductionMemoryDraft { // 第68天：定义测试生产记忆草稿默认值工厂。
  return { scope: input.scope, scopeId: input.scopeId, type: input.type, content: input.content, importance: input.importance ?? 0.8, confidence: input.confidence ?? 0.9, source: input.source ?? {}, tags: input.tags ?? [], status: input.status ?? "active", expiresAt: input.expiresAt }; // 第68天：补齐重要性、置信度、来源、标签、状态和可选过期时间。
} // 第68天：结束测试生产记忆草稿工厂。
async function main(): Promise<void> { // 第68天：定义覆盖六个任务场景和三类平台集成的端到端测试入口。
  let now = Date.UTC(2026, 6, 15, 8, 0, 0); // 第68天：使用可控固定时间验证 TTL、新近度和审计时间。
  const counters = createProductionMemoryMetricCounters(); // 第68天：创建本次测试隔离的生产记忆累计指标。
  const sessionBackend = new InMemorySessionMemoryBackend(() => now); // 第68天：创建可随测试时间推进的 Redis 协议内存后端。
  const sessionProvider = new RedisSessionMemoryProvider({ backend: sessionBackend, ttlSeconds: 10, maxItems: 10, now: () => now, onProviderError: () => { counters.providerErrors += 1; }, onExpired: (count) => { counters.expiredCount += count; } }); // 第68天：创建十秒 TTL 且无外部 Redis 依赖的会话 Provider。
  const vectorStore = new ProductionMemoryVectorStore(); // 第68天：创建本次测试隔离的生产记忆 VectorStore。
  const longTermProvider = new PersistentLongTermMemoryProvider({ metadataStore: new InMemoryProductionMemoryMetadataStore(), vectorStore, now: () => now, onProviderError: () => { counters.providerErrors += 1; }, onExpired: (count) => { counters.expiredCount += count; } }); // 第68天：创建无外部 MySQL 依赖但保持 MySQL 接口语义的长期 Provider。
  const eventBus = new MemoryEventBus(200); // 第68天：创建本次测试隔离的记忆生命周期事件总线。
  const service = new ProductionMemoryService(sessionProvider, longTermProvider, eventBus, counters, () => now); // 第68天：组合两类 Provider、事件、指标和测试时钟形成统一服务。
  const sessionWrite = await service.write(memoryDraft({ scope: "session", scopeId: "session-a", type: "fact", content: "我当前项目使用 MySQL。", source: { sessionId: "session-a", traceId: "trace-case-1" }, expiresAt: now + 60_000 })); // 第68天：Case 1 第一轮把当前数据库事实写入会话记忆。
  assert.equal(sessionWrite.created, true, "Case 1 应创建 Redis 会话记忆"); // 第68天：断言第一轮会话事实确实创建新条目。
  const sessionKeys = await sessionBackend.keys("memory:session:session-a:*"); // 第68天：读取任务文档规定的会话 Redis 三键。
  assert.deepEqual(sessionKeys, ["memory:session:session-a:items", "memory:session:session-a:meta", "memory:session:session-a:summary"], "Case 1 应维护 items、summary、meta 三个 Redis 键"); // 第68天：断言会话 Provider 严格实现三键模型。
  const sessionHits = await service.retrieve({ query: "我现在数据库用的是什么？", sessionId: "session-a", includeSession: true, includeLongTerm: false, includeWorkspace: false, topK: 3, minScore: 0.1 }); // 第68天：Case 1 同会话追问只检索 Redis 会话记忆。
  assert.equal(sessionHits[0]?.item.id, sessionWrite.item.id, "Case 1 应优先命中同 Session 的数据库事实"); // 第68天：断言同会话追问无需长期向量记忆即可命中。
  const preferenceWrite = await service.write(memoryDraft({ scope: "user", scopeId: "user-a", type: "preference", content: "以后代码优先使用 TypeScript。", source: { sessionId: "session-a", traceId: "trace-case-2" }, tags: ["typescript"] })); // 第68天：Case 2 在 Session A 写入可跨会话复用的用户偏好。
  assert.equal(vectorStore.count() > 0, true, "Case 2 长期记忆应写入 VectorStore"); // 第68天：断言长期记忆正文已建立向量索引。
  const crossSessionHits = await service.retrieve({ query: "帮我写一个工具类。", sessionId: "session-b", userId: "user-a", includeSession: true, includeLongTerm: true, includeWorkspace: false, topK: 5, minScore: 0.1 }); // 第68天：Case 2 在全新 Session B 检索同一用户长期偏好。
  assert.equal(crossSessionHits.some((result) => result.item.id === preferenceWrite.item.id && result.item.scope === "user"), true, "Case 2 应跨 Session 命中 TypeScript 长期偏好"); // 第68天：断言新会话不依赖旧会话 Redis 也能读取长期偏好。
  await service.write(memoryDraft({ scope: "workspace", scopeId: "workspace-a", type: "fact", content: "生产记忆必须区分作用域。", importance: 0.9, source: { workspaceId: "workspace-a", agentId: "research" }, tags: ["finding"] })); // 第68天：Case 3 写入应被归档的重要研究发现。
  await service.write(memoryDraft({ scope: "workspace", scopeId: "workspace-a", type: "task_state", content: "临时第三版草稿。", importance: 0.3, source: { workspaceId: "workspace-a", agentId: "writer" }, tags: ["draft"] })); // 第68天：Case 3 写入不应沉淀的临时草稿。
  await service.write(memoryDraft({ scope: "workspace", scopeId: "workspace-a", type: "lesson", content: "冲突不确定时必须人工审核。", importance: 0.95, source: { workspaceId: "workspace-a", agentId: "critic" }, tags: ["lesson"] })); // 第68天：Case 3 写入应被归档的稳定教训。
  const workspaceArchive = await service.archiveWorkspace("workspace-a", "user-a"); // 第68天：Case 3 执行工作空间高价值记忆归档流程。
  assert.equal(workspaceArchive.scanned, 3, "Case 3 应扫描全部工作空间条目"); // 第68天：断言归档流程没有漏读工作空间条目。
  assert.equal(workspaceArchive.promoted, 2, "Case 3 只应沉淀重要发现与稳定教训"); // 第68天：断言事实和教训进入用户长期记忆。
  assert.equal(workspaceArchive.skipped, 1, "Case 3 临时草稿应被跳过"); // 第68天：断言临时任务状态不会污染长期记忆。
  assert.equal((await longTermProvider.listByScope("workspace", "workspace-a")).every((item) => item.status === "archived"), true, "Case 3 任务结束后 Workspace 条目应全部归档"); // 第68天：断言工作空间原始条目完成生命周期归档。
  const firstDuplicate = await service.write(memoryDraft({ scope: "user", scopeId: "user-a", type: "preference", content: "用户偏好中文回答。", source: { traceId: "trace-case-4-a" } })); // 第68天：Case 4 写入第一条中文回答偏好。
  const secondDuplicate = await service.write(memoryDraft({ scope: "user", scopeId: "user-a", type: "preference", content: "用户偏好中文回答。", confidence: 0.95, source: { traceId: "trace-case-4-b" } })); // 第68天：Case 4 连续写入完全相同的第二条偏好。
  assert.equal(secondDuplicate.created, false, "Case 4 重复记忆不应创建第二条活动记录"); // 第68天：断言统一写入流程自动去重。
  assert.equal(secondDuplicate.item.id, firstDuplicate.item.id, "Case 4 重复记忆应合并回已有记录"); // 第68天：断言去重后继续使用原记忆标识。
  assert.equal((await longTermProvider.listByScope("user", "user-a")).filter((item) => item.status === "active" && item.content === "用户偏好中文回答。").length, 1, "Case 4 只能保留一条活动中文偏好"); // 第68天：断言长期存储没有产生重复活动记录。
  const oldDatabase = await service.write(memoryDraft({ scope: "user", scopeId: "supersede-user", type: "fact", content: "用户以前使用 SQLite。", source: { traceId: "trace-case-4-supersede-old" } })); // 第68天：扩展 Case 4 写入等待被新状态替代的旧数据库事实。
  const newDatabase = await service.write(memoryDraft({ scope: "user", scopeId: "supersede-user", type: "fact", content: "用户现在改用 MySQL。", source: { traceId: "trace-case-4-supersede-new" } })); // 第68天：扩展 Case 4 写入包含明确时间与迁移标记的新数据库事实。
  assert.equal(newDatabase.conflict?.type, "superseded", "新数据库事实应识别为 superseded 冲突"); // 第68天：断言生产记忆服务识别新状态覆盖旧状态。
  assert.equal(newDatabase.conflict?.resolution, "replace", "明确的新状态应自动采用 replace 结论"); // 第68天：断言包含现在和改用标记时允许自动替代。
  assert.equal((await service.get(oldDatabase.item.id))?.status, "archived", "旧数据库事实应自动归档"); // 第68天：断言旧状态仍保留审计记录但不再活动。
  assert.equal((await service.get(newDatabase.item.id))?.status, "active", "新数据库事实应保持活动"); // 第68天：断言新状态成为当前有效记忆。
  const concise = await service.write(memoryDraft({ scope: "user", scopeId: "conflict-user", type: "preference", content: "用户偏好简洁回答。", source: { traceId: "trace-case-5-a" } })); // 第68天：Case 5 写入已有简洁回答偏好。
  const detailed = await service.write(memoryDraft({ scope: "user", scopeId: "conflict-user", type: "preference", content: "用户希望提供非常详细的教学步骤。", source: { traceId: "trace-case-5-b" } })); // 第68天：Case 5 写入相反的详细教学偏好。
  assert.equal(detailed.conflict?.type, "contradiction", "Case 5 应检测到相反回答风格冲突"); // 第68天：断言冲突类型为 contradiction。
  assert.equal(detailed.conflict?.resolution, "manual_review", "Case 5 不确定冲突必须进入人工审核"); // 第68天：断言模型没有擅自删除任一记忆。
  assert.equal(detailed.conflict?.status, "pending", "Case 5 人工审核前冲突状态应为 pending"); // 第68天：断言治理台可以看到待处理状态。
  await service.resolveConflict(detailed.conflict!.id, "keep_existing"); // 第68天：Case 5 模拟治理台选择保留已有简洁偏好。
  assert.equal((await service.get(concise.item.id))?.status, "active", "Case 5 保留已有结论时旧记忆应继续活动"); // 第68天：断言已有记忆未被误归档。
  assert.equal((await service.get(detailed.item.id))?.status, "archived", "Case 5 保留已有结论时候选记忆应归档"); // 第68天：断言人工结论正确更新候选生命周期。
  const ttlLongTerm = await service.write(memoryDraft({ scope: "user", scopeId: "ttl-user", type: "fact", content: "长期记忆不受会话 TTL 影响。", source: { traceId: "trace-case-6-long" } })); // 第68天：Case 6 写入不应受 Redis TTL 影响的长期记忆。
  await service.write(memoryDraft({ scope: "session", scopeId: "ttl-session", type: "fact", content: "这是十秒会话快照。", source: { sessionId: "ttl-session", traceId: "trace-case-6-session" }, expiresAt: now + 60_000 })); // 第68天：Case 6 写入由 Redis 键 TTL 管理的会话快照。
  now += 11_000; // 第68天：推进测试时钟超过会话 Provider 十秒 TTL。
  assert.equal((await sessionProvider.listByScope("session", "ttl-session")).length, 0, "Case 6 Redis 会话键到期后应清理会话记忆"); // 第68天：断言会话记忆随 Redis TTL 到期消失。
  assert.equal((await service.get(ttlLongTerm.item.id))?.status, "active", "Case 6 长期记忆不应受会话 Redis TTL 影响"); // 第68天：断言 MySQL 语义的长期记忆仍保持活动。
  const forgettable = await service.write(memoryDraft({ scope: "global", scopeId: "global", type: "fact", content: "这是一条用于验证软删除事件的临时全局记忆。", source: { traceId: "trace-forget" } })); // 第68天：写入一条专门用于验证 Forget 与 memory.deleted 的全局记忆。
  await service.forget(forgettable.item.id); // 第68天：通过统一服务软删除目标全局记忆并移除向量索引。
  assert.equal((await service.get(forgettable.item.id))?.status, "deleted", "Forget 应把目标记忆生命周期更新为 deleted"); // 第68天：断言软删除保留元数据审计记录。
  const runtimeContext = runtimeContextBuilder.build({ userId: "user-a", sessionId: "session-b", agentId: "writer", taskId: "runtime-memory-test" }); // 第68天：创建需要注入生产记忆的统一运行时上下文。
  const injected = await service.getContextForRuntime({ query: "写工具类时使用什么语言？", userId: "user-a", sessionId: "session-b", agentId: "writer", includeWorkspace: false, topK: 5, minScore: 0.1 }, runtimeContext); // 第68天：执行统一检索并写入 RuntimeContext.memoryContext。
  assert.deepEqual(runtimeContext.memoryContext, injected, "RuntimeContext 应保存统一生产记忆上下文结构"); // 第68天：断言运行时上下文与服务返回结构完全一致。
  assert.equal(injected.retrievedMemoryIds.length > 0, true, "RuntimeContext 应记录实际检索到的记忆 ID"); // 第68天：断言后续 Trace 可以回溯使用过的记忆。
  service.markUsed(injected.retrievedMemoryIds); // 第68天：模拟最终回答确认使用本次检索记忆。
  const registry = createDay66UnifiedRegistry(); // 第68天：创建继承历史能力的统一注册中心。
  registerProductionMemoryCapabilities(registry); // 第68天：向统一注册中心增量注册四类生产记忆能力。
  assert.equal(registry.list("memory").filter((item) => item.version === "day68.v1").length, 4, "UnifiedRegistry 应注册两个 Provider、服务和合并策略"); // 第68天：断言四类可替换生产记忆能力全部可发现。
  const eventTypes = new Set(eventBus.getHistory().map((event) => event.type)); // 第68天：收集本次端到端运行发布的全部记忆事件类型。
  for (const type of ["memory.read", "memory.write", "memory.consolidated", "memory.conflict_detected", "memory.archived", "memory.deleted"] as const) assert.equal(eventTypes.has(type), true, `EventBus 应发布 ${type}`); // 第68天：断言读取、写入、合并、冲突、归档和删除事件均已发布。
  const metrics = await service.getMetrics(); // 第68天：读取端到端运行后的生产记忆指标。
  assert.equal(metrics.retrievalCount >= 3, true, "Metrics 应累计会话、跨会话和 RuntimeContext 检索"); // 第68天：断言统一检索次数被正确累计。
  assert.equal(metrics.deduplicationCount >= 1, true, "Metrics 应累计重复记忆去重"); // 第68天：断言去重指标被正确累计。
  assert.equal(metrics.conflictCount >= 1, true, "Metrics 应累计矛盾记忆冲突"); // 第68天：断言冲突指标被正确累计。
  assert.equal(metrics.deleteCount >= 1, true, "Metrics 应累计生产记忆软删除"); // 第68天：断言删除指标和 memory.deleted 事件链路已生效。
  assert.equal(metrics.usedMemoryCount, new Set(injected.retrievedMemoryIds).size, "Metrics 应记录真正用于最终回答的记忆数量"); // 第68天：断言实际使用记忆扩展指标正确。
  assert.equal(counters.providerErrors, 0, "注入内存测试 Provider 时不应出现外部存储错误"); // 第68天：断言隔离测试没有误触发 Redis 或 MySQL 故障降级。
  console.log("Day68 Production Memory Platform：全部端到端测试通过"); // 第68天：输出稳定成功信息供 npm 脚本和人工验收识别。
} // 第68天：结束生产记忆平台端到端测试入口。
void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第68天：运行测试并在断言或运行时失败时设置非零退出码。
