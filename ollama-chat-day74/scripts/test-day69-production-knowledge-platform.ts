import assert from "node:assert/strict"; // 第69天：引入 Node.js 严格断言验证生产知识平台端到端行为。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第69天：引入统一事件总线验证知识与检索生命周期事件。
import { InMemoryKnowledgeJobQueue, InMemoryKnowledgeLockProvider, InMemoryKnowledgeObjectStorage, ProductionKnowledgeRepository } from "@/lib/knowledge/production-knowledge-infrastructure"; // 第69天：引入内存队列、锁、对象存储和仓储隔离外部基础设施。
import { registerProductionKnowledgeCapabilities } from "@/lib/knowledge/production-knowledge-platform"; // 第69天：引入生产知识能力统一注册函数。
import { ProductionKnowledgeService } from "@/lib/knowledge/production-knowledge-service"; // 第69天：引入生产知识统一服务执行全部验收场景。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第69天：引入历史统一注册中心验证 Day69 能力增量注册。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第69天：引入运行时上下文构建器验证检索上下文注入。
async function main(): Promise<void> { // 第69天：定义覆盖八个端到端案例和十五项验收标准的测试入口。
  let failEmbeddingOnce = true; // 第69天：准备只失败一次的向量生成故障注入开关。
  const repository = new ProductionKnowledgeRepository(); // 第69天：创建本次测试隔离的生产知识仓储。
  const storage = new InMemoryKnowledgeObjectStorage(); // 第69天：创建本次测试隔离的对象存储。
  const queue = new InMemoryKnowledgeJobQueue(); // 第69天：创建本次测试隔离的异步任务队列。
  const locks = new InMemoryKnowledgeLockProvider(); // 第69天：创建本次测试隔离的文档级锁提供者。
  const eventBus = new MemoryEventBus(400); // 第69天：创建容量足够覆盖全部索引与检索事件的统一事件总线。
  const service = new ProductionKnowledgeService(repository, storage, queue, locks, eventBus, { shouldFailEmbedding: (document) => { if (document.title.includes("失败") && failEmbeddingOnce) { failEmbeddingOnce = false; return true; } return false; } }); // 第69天：注入可控单次 Embedding 故障创建统一生产知识服务。
  const workspaceBase = await service.createKnowledgeBase({ name: "测试工作空间知识库", scope: "workspace", scopeId: "workspace-a", createdBy: "tester" }); // 第69天：Case 1 创建具备工作空间作用域的生产知识库。
  assert.equal(workspaceBase.scope, "workspace", "Case 1 应保存 Knowledge Scope（知识作用域）"); // 第69天：断言生产知识库不再默认全局可见。
  const document = await service.uploadDocument({ knowledgeBaseId: workspaceBase.id, title: "生产索引手册", content: "第一版规定：文档上传后进入 queued 状态，由 Redis Queue 异步索引。活动索引发布前不能把文档错误标记为 ready。" }); // 第69天：Case 1 上传文档并异步创建索引任务。
  assert.equal(document.status, "queued", "Case 1 上传后应进入 queued 而不是同步 ready"); // 第69天：断言文档生命周期真实反映异步索引进度。
  const firstJob = (await queue.list())[0]; // 第69天：读取上传动作创建的第一条 knowledge.index 任务。
  assert.equal(firstJob.type, "knowledge.index", "Case 1 应创建 knowledge.index 异步任务"); // 第69天：断言索引流程已经从请求链路迁移到异步队列。
  await service.processNextJob(); // 第69天：模拟 Indexer Worker 认领并处理第一条索引任务。
  const readyV1 = service.getDocument(document.id)!; // 第69天：读取第一版索引发布后的文档状态。
  assert.equal(readyV1.status, "ready", "Case 1 Worker 完成后文档应进入 ready"); // 第69天：断言完整状态流转最终到达可检索状态。
  assert.equal(readyV1.activeIndexVersion, 1, "Case 1 应发布 Active Index Version V1"); // 第69天：断言第一版索引已经原子发布。
  assert.equal(repository.getManifest(document.id, 1)?.status, "ready", "Case 1 应保存 ready IndexManifest"); // 第69天：断言索引清单记录模型、策略、片段和版本状态。
  const vectorCountBeforeDuplicates = repository.listVectors({ documentId: document.id }).length; // 第69天：记录重复任务前的向量数量。
  await service.enqueueIndexing(document.id, false); // 第69天：Case 2 第一次重复投递同文档同版本任务。
  await service.enqueueIndexing(document.id, false); // 第69天：Case 2 第二次重复投递同文档同版本任务。
  const duplicateResults = await service.drainJobs(); // 第69天：驱动 Worker 处理两条重复索引任务。
  assert.equal(duplicateResults.every((job) => job.result?.idempotent === true), true, "Case 2 重复任务应通过幂等检查直接结束"); // 第69天：断言 ready 清单作为幂等屏障避免重复构建。
  assert.equal(repository.listVectors({ documentId: document.id }).length, vectorCountBeforeDuplicates, "Case 2 不应产生重复向量"); // 第69天：断言同文档同版本重复投递不会污染 VectorStore。
  await service.updateDocument(document.id, { content: "第二版规定：文档更新先后台构建 Index V2，V1 在 V2 ready 前继续可检索；V2 发布后只检索活动版本并把 V1 标记 superseded。" }); // 第69天：Case 3 上传第二版文档执行安全更新。
  const updating = service.getDocument(document.id)!; // 第69天：读取第二版后台构建前的文档状态。
  assert.equal(updating.status, "updating", "Case 3 新版本构建期间文档应处于 updating"); // 第69天：断言更新流程不会假装新版本已经就绪。
  assert.equal(updating.activeIndexVersion, 1, "Case 3 V2 构建期间 V1 仍应保持活动"); // 第69天：断言旧版本在安全切换前持续提供服务。
  const runtimeBeforePublish = runtimeContextBuilder.build({ userId: "user-a", sessionId: "session-before-v2", workspace: { workspaceId: "workspace-a" } }); // 第69天：创建 V2 发布前的工作空间检索上下文。
  const beforePublish = await service.retrieve({ query: "文档上传后是什么状态？", runtimeContext: runtimeBeforePublish, accessContext: { userId: "user-a", workspaceId: "workspace-a" }, knowledgeBaseIds: [workspaceBase.id], topK: 3, minScore: 0.05, requireCitations: true }); // 第69天：在 V2 构建期间执行检索验证 V1 可用性。
  assert.equal(beforePublish.hits.every((hit) => hit.indexVersion === 1), true, "Case 3 V2 发布前只能检索 V1"); // 第69天：断言检索管线严格过滤活动索引版本。
  await service.processNextJob(); // 第69天：模拟 Worker 完成 V2 构建与发布。
  const readyV2 = service.getDocument(document.id)!; // 第69天：读取 V2 发布后的文档状态。
  assert.equal(readyV2.activeIndexVersion, 2, "Case 3 V2 就绪后应切换活动版本"); // 第69天：断言新索引版本完成原子切换。
  assert.equal(repository.getManifest(document.id, 1)?.status, "superseded", "Case 3 V1 清单应标记 superseded"); // 第69天：断言旧版本保留审计但不再参与活动检索。
  const runtimeAfterPublish = runtimeContextBuilder.build({ userId: "user-a", sessionId: "session-after-v2", workspace: { workspaceId: "workspace-a" } }); // 第69天：创建 V2 发布后的工作空间检索上下文。
  const afterPublish = await service.retrieve({ query: "V2 发布后怎样处理 V1？", runtimeContext: runtimeAfterPublish, accessContext: { userId: "user-a", workspaceId: "workspace-a" }, knowledgeBaseIds: [workspaceBase.id], topK: 3, minScore: 0.05, requireCitations: true }); // 第69天：执行 V2 发布后的活动版本检索。
  assert.equal(afterPublish.hits.length > 0 && afterPublish.hits.every((hit) => hit.indexVersion === 2), true, "Case 3 V2 发布后只能检索 V2"); // 第69天：断言旧片段和向量不会残留在活动检索结果中。
  const userABase = await service.createKnowledgeBase({ name: "用户 A 私有库", scope: "user", scopeId: "user-a" }); // 第69天：Case 4 创建用户 A 私有知识库。
  const userBBase = await service.createKnowledgeBase({ name: "用户 B 私有库", scope: "user", scopeId: "user-b" }); // 第69天：Case 4 创建用户 B 私有知识库。
  await service.uploadDocument({ knowledgeBaseId: userABase.id, title: "A 私有文档", content: "用户 A 的私人发布口令是 ALPHA，只允许用户 A 检索。" }); // 第69天：Case 4 写入用户 A 私有知识。
  await service.uploadDocument({ knowledgeBaseId: userBBase.id, title: "B 私有文档", content: "用户 B 的私人发布口令是 BETA，只允许用户 B 检索。" }); // 第69天：Case 4 写入用户 B 私有知识。
  await service.drainJobs(); // 第69天：完成两个私人知识库文档的异步索引。
  const permissionRuntime = runtimeContextBuilder.build({ userId: "user-a", sessionId: "permission-case" }); // 第69天：创建用户 A 权限隔离检索上下文。
  const permissionResult = await service.retrieve({ query: "BETA 口令是什么？", runtimeContext: permissionRuntime, accessContext: { userId: "user-a" }, knowledgeBaseIds: [userBBase.id], topK: 5, minScore: 0.01, requireCitations: true, allowGlobalKnowledge: false }); // 第69天：用户 A 显式请求用户 B 的私人知识库。
  assert.equal(permissionResult.hits.length, 0, "Case 4 用户 A 不应检索到用户 B 私有内容"); // 第69天：断言知识权限过滤器阻止跨用户数据泄漏。
  assert.deepEqual(permissionResult.permissionFilteredKnowledgeBaseIds, [userBBase.id], "Case 4 应记录 Permission Filtered 而不返回内容"); // 第69天：断言调试结果只说明被过滤而不泄漏文档正文。
  assert.equal(afterPublish.citations.length, afterPublish.hits.length, "Case 5 每个检索命中都应具有 Citation"); // 第69天：Case 5 断言核心结论拥有标准知识引用。
  assert.equal(afterPublish.citations.every((citation) => citation.documentId === document.id && citation.chunkId && citation.indexVersion === 2), true, "Case 5 Citation 应定位文档、Chunk 与活动 Index Version"); // 第69天：断言引用来源稳定且可追溯。
  assert.deepEqual(runtimeAfterPublish.retrievalContext?.citationIds, afterPublish.citations.map((citation) => citation.id), "Case 5 RuntimeContext 应记录 Citation ID"); // 第69天：断言 Trace 可以通过运行时上下文回查引用。
  await service.deleteDocument(document.id); // 第69天：Case 6 执行两阶段删除第一阶段。
  assert.equal(service.getDocument(document.id)?.status, "deleting", "Case 6 文档应先进入 deleting"); // 第69天：断言删除不会同步抹掉审计元数据。
  await service.processNextJob(); // 第69天：模拟 Delete Worker 清理文档全部关联资源。
  assert.equal(service.getDocument(document.id)?.status, "deleted", "Case 6 Worker 清理后文档应进入 deleted"); // 第69天：断言两阶段删除最终状态正确。
  assert.equal(repository.listChunks({ documentId: document.id }).length, 0, "Case 6 应清理全部 Chunks"); // 第69天：断言删除流程没有残留文本片段。
  assert.equal(repository.listVectors({ documentId: document.id }).length, 0, "Case 6 应清理全部 Vector Records"); // 第69天：断言删除流程没有残留向量记录。
  assert.equal(repository.listManifests(document.id).length, 0, "Case 6 应清理全部 Index Manifests"); // 第69天：断言删除流程没有残留索引清单。
  const deleteConsistency = await service.scanKnowledgeConsistency(false); // 第69天：删除完成后执行知识一致性扫描。
  assert.equal(deleteConsistency.orphanChunks.length + deleteConsistency.orphanVectors.length, 0, "Case 6 删除后不应产生孤儿资源"); // 第69天：断言两阶段删除保持跨存储一致性。
  const failureBase = await service.createKnowledgeBase({ name: "失败重试知识库", scope: "team", scopeId: "team-a" }); // 第69天：Case 7 创建用于模拟索引失败的团队知识库。
  const failureDocument = await service.uploadDocument({ knowledgeBaseId: failureBase.id, title: "向量生成失败演示", content: "第一次索引模拟 Embedding 失败，重试后应正常发布活动索引。" }); // 第69天：Case 7 上传会触发单次故障的文档。
  const failedJob = await service.processNextJob(); // 第69天：处理首次索引并触发可控 Embedding 故障。
  assert.equal(failedJob?.status, "failed", "Case 7 首次索引任务应失败"); // 第69天：断言异步任务保存失败终态。
  assert.equal(service.getDocument(failureDocument.id)?.status, "failed", "Case 7 文档状态应变为 failed"); // 第69天：断言文档生命周期反映真实失败状态。
  assert.equal(service.getDocument(failureDocument.id)?.error?.code, "KNOWLEDGE_INDEX_FAILED", "Case 7 应保存稳定错误代码"); // 第69天：断言失败信息可供治理台展示和重试。
  await service.retryFailedIndex(failureDocument.id); // 第69天：通过统一服务重新投递失败索引任务。
  const retriedJob = await service.processNextJob(); // 第69天：处理不再触发故障的重试任务。
  assert.equal(retriedJob?.status, "success", "Case 7 重试任务应成功"); // 第69天：断言失败后可以恢复而不需要人工修改存储。
  assert.equal(service.getDocument(failureDocument.id)?.status, "ready", "Case 7 重试成功后文档应恢复 ready"); // 第69天：断言重试成功后正常发布活动索引。
  const registry = createDay66UnifiedRegistry(); // 第69天：Case 8 创建继承历史能力的统一注册中心。
  registerProductionKnowledgeCapabilities(registry); // 第69天：把生产知识服务、策略、Provider、解析器和引用格式化器增量注册。
  assert.equal(registry.list("knowledge").filter((item) => item.version === "day69.v1").length, 6, "Case 8 UnifiedRegistry 应注册六类 Day69 知识能力"); // 第69天：断言新增能力可以被统一发现而无需修改核心服务。
  const eventTypes = new Set(eventBus.getHistory().map((event) => event.type)); // 第69天：收集端到端运行发布的全部知识与检索事件类型。
  for (const type of ["knowledge.document_uploaded", "knowledge.index_queued", "knowledge.index_started", "knowledge.index_completed", "knowledge.index_failed", "knowledge.index_published", "knowledge.document_updated", "knowledge.document_deleting", "knowledge.document_deleted", "retrieval.started", "retrieval.completed", "retrieval.permission_denied"] as const) assert.equal(eventTypes.has(type), true, `Case 8 EventBus 应发布 ${type}`); // 第69天：断言索引、更新、删除、检索和权限事件链完整。
  assert.equal(Array.isArray(runtimeAfterPublish.retrievalContext?.retrievedChunkIds), true, "Case 8 RuntimeContext 应注入检索片段标识"); // 第69天：断言统一运行时上下文记录实际检索使用的片段。
  const metrics = await service.getMetrics(); // 第69天：读取全部端到端场景后的生产知识指标。
  assert.equal(metrics.knowledgeBaseCount >= 4, true, "Metrics 应累计不同作用域的知识库"); // 第69天：断言知识库库存指标正确。
  assert.equal(metrics.indexJobCount >= 8, true, "Metrics 应累计异步索引、重复任务、重试和删除任务"); // 第69天：断言异步任务规模指标正确。
  assert.equal(metrics.permissionDeniedCount >= 1, true, "Metrics 应累计权限拒绝次数"); // 第69天：断言权限治理指标正确。
  assert.equal(metrics.citationCoverageRate > 0, true, "Metrics 应计算引用覆盖率"); // 第69天：断言生产知识平台具备引用质量指标。
  assert.equal(metrics.orphanChunkCount + metrics.orphanVectorCount, 0, "Metrics 应确认当前没有孤儿片段和向量"); // 第69天：断言一致性治理指标正确。
  console.log("Day69 Production Knowledge & RAG Platform：全部端到端测试通过"); // 第69天：输出稳定成功信息供 npm 脚本和人工验收识别。
} // 第69天：结束生产知识平台端到端测试入口。
void main().catch((error) => { console.error(error); process.exitCode = 1; }); // 第69天：运行测试并在断言或运行时失败时设置非零退出码。
