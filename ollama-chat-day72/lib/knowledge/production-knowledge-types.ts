import type { RuntimeEventRecord } from "@/lib/events/event-types"; // 第69天：引入统一事件历史类型供知识治理快照展示完整事件链。
import type { RegistryItem } from "@/lib/registry/registry-types"; // 第69天：引入统一注册项类型供知识能力注册结果展示。
import type { RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第69天：引入统一运行时上下文第二版作为生产检索输入。
import type { StorageObjectMetadata } from "@/lib/storage/storage-types"; // 第69天：引入对象存储元数据描述原始知识文档位置。
export const KNOWLEDGE_SCOPES = ["user", "workspace", "team", "global"] as const; // 第69天：声明生产知识库支持的四种隔离作用域。
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number]; // 第69天：从作用域常量推导知识作用域联合类型。
export type KnowledgeBaseStatus = "active" | "disabled" | "archived" | "deleting"; // 第69天：定义知识库从活动到删除中的完整生命周期状态。
export type KnowledgeDocumentStatus = "uploaded" | "queued" | "indexing" | "ready" | "failed" | "updating" | "deleting" | "deleted"; // 第69天：定义生产知识文档真实反映索引进度的生命周期状态。
export type IndexVersionStatus = "building" | "ready" | "failed" | "superseded"; // 第69天：定义索引版本的构建、就绪、失败与替代状态。
export type KnowledgeJobType = "knowledge.index" | "knowledge.delete"; // 第69天：定义 Redis Queue 中的索引和两阶段删除任务类型。
export type KnowledgeJobStatus = "queued" | "running" | "success" | "failed"; // 第69天：定义知识异步任务的等待、运行和终态。
export type RetrievalStrategy = "fast" | "balanced" | "quality"; // 第69天：定义生产检索管线的速度、平衡与质量策略。
export type ProductionKnowledgeBase = { // 第69天：定义可治理、可隔离、可版本化的生产知识库资源。
  id: string; // 第69天：保存知识库唯一标识。
  name: string; // 第69天：保存知识库展示名称。
  description?: string; // 第69天：保存可选的知识库用途说明。
  scope: KnowledgeScope; // 第69天：保存知识库归属的隔离作用域。
  scopeId: string; // 第69天：保存用户、工作空间、团队或全局作用域标识。
  status: KnowledgeBaseStatus; // 第69天：保存知识库当前治理状态。
  embeddingModelId: string; // 第69天：保存当前使用的向量模型标识。
  chunkStrategyId: string; // 第69天：保存当前使用的切块策略标识。
  retrievalStrategyId: string; // 第69天：保存当前使用的检索策略标识。
  activeIndexVersion?: number; // 第69天：保存知识库内已发布的最高活动索引版本。
  createdAt: number; // 第69天：保存知识库创建时间。
  updatedAt: number; // 第69天：保存知识库最近更新时间。
  createdBy?: string; // 第69天：保存可选创建者标识用于审计。
}; // 第69天：结束生产知识库结构定义。
export type ProductionKnowledgeDocument = { // 第69天：定义连接对象存储、索引版本和错误信息的生产知识文档。
  id: string; // 第69天：保存文档唯一标识。
  knowledgeBaseId: string; // 第69天：保存所属知识库标识。
  title: string; // 第69天：保存文档展示标题。
  mimeType: string; // 第69天：保存原始文件 MIME 类型。
  storage: StorageObjectMetadata; // 第69天：保存原始文件在对象存储中的稳定引用。
  status: KnowledgeDocumentStatus; // 第69天：保存文档真实索引生命周期状态。
  contentHash: string; // 第69天：保存正文哈希用于幂等与增量索引。
  version: number; // 第69天：保存文档内容版本。
  activeIndexVersion?: number; // 第69天：保存当前对外检索的活动索引版本。
  error?: { code: string; message: string }; // 第69天：保存索引失败的稳定错误代码和安全消息。
  createdAt: number; // 第69天：保存文档创建时间。
  updatedAt: number; // 第69天：保存文档最近更新时间。
  indexedAt?: number; // 第69天：保存最近成功发布索引的时间。
  deletedAt?: number; // 第69天：保存两阶段删除最终完成时间。
}; // 第69天：结束生产知识文档结构定义。
export type IndexManifest = { // 第69天：定义每个文档版本对应的完整索引清单。
  id: string; // 第69天：保存索引清单唯一标识。
  knowledgeBaseId: string; // 第69天：保存索引所属知识库标识。
  documentId: string; // 第69天：保存索引所属文档标识。
  version: number; // 第69天：保存索引版本号。
  status: IndexVersionStatus; // 第69天：保存索引版本当前生命周期状态。
  contentHash: string; // 第69天：保存本次索引对应的文档正文哈希。
  embeddingModelId: string; // 第69天：保存本次索引使用的向量模型。
  embeddingDimension: number; // 第69天：保存本次索引向量维度。
  chunkStrategyId: string; // 第69天：保存本次索引使用的切块策略。
  chunkCount: number; // 第69天：保存本次索引产生的片段数量。
  createdChunkIds: string[]; // 第69天：保存本次新创建的片段标识。
  reusedChunkIds: string[]; // 第69天：保存通过哈希复用向量缓存的旧片段标识。
  deletedChunkIds: string[]; // 第69天：保存本次版本替代后等待清理的旧片段标识。
  startedAt: number; // 第69天：保存索引构建开始时间。
  completedAt?: number; // 第69天：保存索引构建完成时间。
  error?: string; // 第69天：保存索引失败的安全错误摘要。
}; // 第69天：结束索引清单结构定义。
export type ProductionKnowledgeChunk = { // 第69天：定义带知识库、文档和索引版本过滤信息的生产片段。
  id: string; // 第69天：保存片段唯一标识。
  knowledgeBaseId: string; // 第69天：保存片段所属知识库标识。
  documentId: string; // 第69天：保存片段所属文档标识。
  indexVersion: number; // 第69天：保存片段所属索引版本。
  text: string; // 第69天：保存片段正文。
  chunkHash: string; // 第69天：保存片段正文哈希用于向量缓存复用。
  index: number; // 第69天：保存片段在文档中的顺序。
  startOffset: number; // 第69天：保存片段在文档中的起始偏移。
  endOffset: number; // 第69天：保存片段在文档中的结束偏移。
  section?: string; // 第69天：保存可选章节名称用于标准引用。
  page?: number; // 第69天：保存可选页码用于标准引用。
  status: "active" | "superseded" | "deleted"; // 第69天：保存片段是否属于活动索引。
}; // 第69天：结束生产知识片段结构定义。
export type ProductionKnowledgeVector = { // 第69天：定义可按知识库和活动版本过滤的生产向量记录。
  id: string; // 第69天：保存向量记录唯一标识。
  chunkId: string; // 第69天：保存对应片段标识。
  knowledgeBaseId: string; // 第69天：保存所属知识库标识。
  documentId: string; // 第69天：保存所属文档标识。
  indexVersion: number; // 第69天：保存所属索引版本。
  embedding: number[]; // 第69天：保存确定性教学向量或真实 Provider 返回向量。
  status: "active" | "superseded" | "deleted"; // 第69天：保存向量当前治理状态。
}; // 第69天：结束生产知识向量结构定义。
export type KnowledgeIndexJobPayload = { // 第69天：定义异步索引任务的稳定载荷。
  knowledgeBaseId: string; // 第69天：保存目标知识库标识。
  documentId: string; // 第69天：保存目标文档标识。
  targetVersion: number; // 第69天：保存待构建的目标索引版本。
  forceRebuild?: boolean; // 第69天：标记是否忽略已就绪清单并强制重建。
  embeddingModelId: string; // 第69天：保存任务使用的向量模型。
  chunkStrategyId: string; // 第69天：保存任务使用的切块策略。
}; // 第69天：结束异步索引任务载荷定义。
export type KnowledgeDeleteJobPayload = { // 第69天：定义两阶段删除异步任务载荷。
  knowledgeBaseId: string; // 第69天：保存待清理资源所属知识库标识。
  documentId: string; // 第69天：保存待删除文档标识。
}; // 第69天：结束删除任务载荷定义。
export type KnowledgeJob = { // 第69天：定义 Redis Queue 与治理台共享的知识任务结构。
  id: string; // 第69天：保存任务唯一标识。
  type: KnowledgeJobType; // 第69天：保存索引或删除任务类型。
  status: KnowledgeJobStatus; // 第69天：保存任务当前状态。
  payload: KnowledgeIndexJobPayload | KnowledgeDeleteJobPayload; // 第69天：保存与任务类型对应的业务载荷。
  idempotencyKey: string; // 第69天：保存重复投递检查使用的幂等键。
  attempts: number; // 第69天：保存任务已执行次数。
  createdAt: number; // 第69天：保存任务创建时间。
  updatedAt: number; // 第69天：保存任务最近更新时间。
  startedAt?: number; // 第69天：保存任务开始执行时间。
  completedAt?: number; // 第69天：保存任务完成时间。
  error?: string; // 第69天：保存任务失败的安全错误摘要。
  result?: { idempotent?: boolean; manifestId?: string; deleted?: boolean }; // 第69天：保存任务幂等、索引清单或删除结果摘要。
}; // 第69天：结束知识异步任务结构定义。
export type KnowledgeAccessContext = { // 第69天：定义知识权限过滤使用的访问上下文。
  userId?: string; // 第69天：保存当前用户标识。
  workspaceId?: string; // 第69天：保存当前工作空间标识。
  teamIds?: string[]; // 第69天：保存当前用户所属团队标识列表。
  isAdmin?: boolean; // 第69天：标记是否允许访问全部活动知识库。
}; // 第69天：结束知识访问上下文定义。
export type KnowledgeCitation = { // 第69天：定义可定位文档、片段和索引版本的标准知识引用。
  id: string; // 第69天：保存引用唯一标识供 Trace 关联。
  knowledgeBaseId: string; // 第69天：保存引用所属知识库标识。
  documentId: string; // 第69天：保存引用所属文档标识。
  documentTitle: string; // 第69天：保存引用文档标题。
  chunkId: string; // 第69天：保存引用片段标识。
  indexVersion: number; // 第69天：保存引用使用的活动索引版本。
  quote?: string; // 第69天：保存可选引用摘录。
  score: number; // 第69天：保存引用对应检索得分。
  location?: { page?: number; section?: string; startOffset?: number; endOffset?: number }; // 第69天：保存页码、章节和偏移定位信息。
  storageObjectKey?: string; // 第69天：保存原始对象存储键便于追溯来源。
}; // 第69天：结束标准知识引用结构定义。
export type ProductionRetrievalInput = { // 第69天：定义生产检索管线第二版输入。
  query: string; // 第69天：保存用户原始查询。
  runtimeContext: RuntimeContextV2; // 第69天：保存统一运行时上下文用于决策、记忆和 Trace 注入。
  accessContext: KnowledgeAccessContext; // 第69天：保存权限隔离所需访问上下文。
  knowledgeBaseIds?: string[]; // 第69天：允许调用方显式限定知识库范围。
  strategy?: RetrievalStrategy; // 第69天：允许选择快速、平衡或质量策略。
  topK?: number; // 第69天：允许覆盖最终返回数量。
  recallK?: number; // 第69天：允许覆盖第一阶段召回数量。
  minScore?: number; // 第69天：允许覆盖最低得分阈值。
  requireCitations?: boolean; // 第69天：标记是否必须为命中构建标准引用。
  allowGlobalKnowledge?: boolean; // 第69天：标记是否允许检索全局公共知识库。
}; // 第69天：结束生产检索输入定义。
export type ProductionRetrievalHit = { // 第69天：定义生产检索命中及可解释评分结构。
  chunkId: string; // 第69天：保存命中片段标识。
  documentId: string; // 第69天：保存命中文档标识。
  knowledgeBaseId: string; // 第69天：保存命中知识库标识。
  documentTitle: string; // 第69天：保存命中文档标题。
  text: string; // 第69天：保存命中片段正文。
  indexVersion: number; // 第69天：保存命中活动索引版本。
  vectorScore: number; // 第69天：保存向量相似度评分。
  keywordScore: number; // 第69天：保存关键词匹配评分。
  rerankScore: number; // 第69天：保存生产重排序评分。
  score: number; // 第69天：保存最终综合得分。
  citation: KnowledgeCitation; // 第69天：保存该命中的标准知识引用。
}; // 第69天：结束生产检索命中结构定义。
export type ProductionRetrievalResult = { // 第69天：定义生产检索管线第二版输出。
  query: string; // 第69天：回显原始查询。
  rewrittenQueries: string[]; // 第69天：保存记忆感知和多查询改写结果。
  accessibleKnowledgeBaseIds: string[]; // 第69天：保存权限过滤后的可访问知识库列表。
  permissionFilteredKnowledgeBaseIds: string[]; // 第69天：保存被权限过滤但不泄漏内容的知识库标识。
  strategy: RetrievalStrategy; // 第69天：保存实际采用的检索策略。
  hits: ProductionRetrievalHit[]; // 第69天：保存排序、去重后的检索命中。
  citations: KnowledgeCitation[]; // 第69天：保存稳定可追溯的引用列表。
  durationMs: number; // 第69天：保存检索管线耗时。
}; // 第69天：结束生产检索结果结构定义。
export type ProductionKnowledgeMetrics = { // 第69天：定义生产知识平台治理与质量指标。
  knowledgeBaseCount: number; // 第69天：保存知识库总数。
  documentCount: number; // 第69天：保存未删除文档总数。
  readyDocumentCount: number; // 第69天：保存可检索文档数量。
  failedDocumentCount: number; // 第69天：保存索引失败文档数量。
  indexingDocumentCount: number; // 第69天：保存等待、索引或更新中的文档数量。
  totalChunkCount: number; // 第69天：保存活动片段总数。
  totalVectorCount: number; // 第69天：保存活动向量总数。
  indexJobCount: number; // 第69天：保存知识异步任务总数。
  indexFailureRate: number; // 第69天：保存索引任务失败率。
  avgIndexDurationMs: number; // 第69天：保存成功索引任务平均耗时。
  retrievalCount: number; // 第69天：保存生产检索次数。
  retrievalHitRate: number; // 第69天：保存检索命中率。
  noResultRate: number; // 第69天：保存无结果率。
  avgRetrievalDurationMs: number; // 第69天：保存生产检索平均耗时。
  citationCoverageRate: number; // 第69天：保存命中结果具有标准引用的覆盖率。
  permissionDeniedCount: number; // 第69天：保存权限过滤发生次数。
  orphanChunkCount: number; // 第69天：保存孤儿片段数量。
  orphanVectorCount: number; // 第69天：保存孤儿向量数量。
  staleIndexCount: number; // 第69天：保存失效索引数量。
}; // 第69天：结束生产知识指标结构定义。
export type KnowledgeConsistencyReport = { // 第69天：定义知识元数据、对象、片段、向量和索引一致性报告。
  missingStorageObjects: string[]; // 第69天：保存元数据存在但对象文件缺失的文档标识。
  orphanChunks: string[]; // 第69天：保存所属文档不存在或已删除的片段标识。
  orphanVectors: string[]; // 第69天：保存找不到对应片段的向量标识。
  staleIndexVersions: string[]; // 第69天：保存活动指针指向非就绪版本的索引标识。
  documentsWithoutActiveIndex: string[]; // 第69天：保存已就绪但没有活动索引的文档标识。
  activeIndexesWithoutDocument: string[]; // 第69天：保存活动清单存在但文档不存在的索引标识。
  repairedItems: string[]; // 第69天：保存安全自动修复动作列表。
  generatedAt: number; // 第69天：保存一致性扫描生成时间。
}; // 第69天：结束知识一致性报告结构定义。
export type ProductionKnowledgePlatformSnapshot = { // 第69天：定义治理浏览器和测试共享的完整平台快照。
  knowledgeBases: ProductionKnowledgeBase[]; // 第69天：保存全部生产知识库。
  documents: ProductionKnowledgeDocument[]; // 第69天：保存全部生产知识文档。
  manifests: IndexManifest[]; // 第69天：保存全部索引版本清单。
  jobs: KnowledgeJob[]; // 第69天：保存索引与删除异步任务。
  metrics: ProductionKnowledgeMetrics; // 第69天：保存生产知识指标。
  consistency: KnowledgeConsistencyReport; // 第69天：保存最近一次一致性扫描结果。
  lastRetrieval?: ProductionRetrievalResult; // 第69天：保存最近一次检索调试结果。
  events: RuntimeEventRecord[]; // 第69天：保存知识生命周期与检索事件审计历史。
  registryItems: RegistryItem[]; // 第69天：保存统一注册中心中的知识能力。
  queueBackend: string; // 第69天：保存 Redis Queue 或内存降级后端说明。
  generatedAt: number; // 第69天：保存平台快照生成时间。
}; // 第69天：结束生产知识平台快照结构定义。
