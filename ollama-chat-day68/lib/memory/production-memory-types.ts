export const PRODUCTION_MEMORY_SCOPES = ["session", "user", "workspace", "agent", "global"] as const; // 第68天：声明生产记忆支持的五种作用域。
export type ProductionMemoryScope = (typeof PRODUCTION_MEMORY_SCOPES)[number]; // 第68天：从作用域常量推导生产记忆作用域联合类型。
export const PRODUCTION_MEMORY_TYPES = ["fact", "preference", "experience", "decision", "lesson", "summary", "task_state"] as const; // 第68天：声明生产记忆支持的七种业务类型。
export type ProductionMemoryType = (typeof PRODUCTION_MEMORY_TYPES)[number]; // 第68天：从类型常量推导生产记忆类型联合类型。
export const MEMORY_LIFECYCLE_STATUSES = ["active", "consolidated", "archived", "deleted"] as const; // 第68天：声明生产记忆生命周期状态。
export type MemoryLifecycleStatus = (typeof MEMORY_LIFECYCLE_STATUSES)[number]; // 第68天：从状态常量推导生命周期联合类型。
export type ProductionMemorySource = { // 第68天：定义可追踪但不保存敏感正文的记忆来源信息。
  requestId?: string; // 第68天：关联写入记忆的请求标识。
  traceId?: string; // 第68天：关联写入记忆的链路追踪标识。
  sessionId?: string; // 第68天：关联产生记忆的会话标识。
  workspaceId?: string; // 第68天：关联产生记忆的工作空间标识。
  agentId?: string; // 第68天：关联写入记忆的智能体标识。
}; // 第68天：结束生产记忆来源结构定义。
export type ProductionMemoryItem = { // 第68天：定义可持久化、可检索、可治理的生产记忆条目。
  id: string; // 第68天：保存跨 Provider 唯一的记忆标识。
  scope: ProductionMemoryScope; // 第68天：保存记忆归属的作用域类型。
  scopeId: string; // 第68天：保存会话、用户、工作空间、智能体或全局作用域标识。
  type: ProductionMemoryType; // 第68天：保存事实、偏好、经验、决策、教训、摘要或任务状态类型。
  content: string; // 第68天：保存经过修剪的记忆正文。
  importance: number; // 第68天：保存零到一之间的重要性分数。
  confidence: number; // 第68天：保存零到一之间的置信度分数。
  source: ProductionMemorySource; // 第68天：保存可回溯到请求、会话、工作空间和智能体的来源。
  tags: string[]; // 第68天：保存用于筛选、固定和治理的标签。
  status: MemoryLifecycleStatus; // 第68天：保存记忆当前生命周期状态。
  createdAt: number; // 第68天：保存记忆创建时间戳。
  updatedAt: number; // 第68天：保存记忆最后更新时间戳。
  expiresAt?: number; // 第68天：保存会话记忆等短期数据的可选过期时间。
  lastAccessedAt?: number; // 第68天：保存最近一次被检索使用的时间。
  accessCount: number; // 第68天：保存累计访问次数以参与统一评分。
  version: number; // 第68天：保存乐观并发控制使用的版本号。
  pinned: boolean; // 第68天：保存治理台是否固定该条重要记忆。
  consolidatedFrom: string[]; // 第68天：保存去重或合并时被吸收的候选记忆标识。
}; // 第68天：结束生产记忆条目结构定义。
export type ProductionMemoryDraft = Omit<ProductionMemoryItem, "id" | "createdAt" | "updatedAt" | "lastAccessedAt" | "accessCount" | "version" | "pinned" | "consolidatedFrom"> & Partial<Pick<ProductionMemoryItem, "id" | "createdAt" | "updatedAt" | "lastAccessedAt" | "accessCount" | "version" | "pinned" | "consolidatedFrom">>; // 第68天：定义写入服务可接收并由平台补齐治理字段的记忆草稿。
export type MemorySearchInput = { // 第68天：定义统一记忆检索管线输入。
  query: string; // 第68天：保存本次检索问题。
  userId?: string; // 第68天：限制或补充用户长期记忆作用域。
  sessionId?: string; // 第68天：限制或补充当前会话记忆作用域。
  workspaceId?: string; // 第68天：限制或补充当前工作空间记忆作用域。
  agentId?: string; // 第68天：限制或补充当前智能体专属记忆作用域。
  types?: ProductionMemoryType[]; // 第68天：按需限制参与检索的记忆类型。
  topK?: number; // 第68天：保存最终返回的最大记忆条数。
  minScore?: number; // 第68天：保存统一综合评分的最低阈值。
  includeSession?: boolean; // 第68天：控制是否检索 Redis 会话记忆。
  includeLongTerm?: boolean; // 第68天：控制是否检索用户、智能体和全局长期记忆。
  includeWorkspace?: boolean; // 第68天：控制是否检索工作空间记忆。
}; // 第68天：结束统一记忆检索输入定义。
export type MemoryScoreBreakdown = { // 第68天：定义统一评分公式的五个可观察分量。
  semanticScore: number; // 第68天：保存查询与记忆正文的语义相关度。
  importanceScore: number; // 第68天：保存记忆自身重要性分数。
  recencyScore: number; // 第68天：保存按更新时间衰减得到的时效性分数。
  confidenceScore: number; // 第68天：保存记忆真实性与稳定性置信分数。
  accessScore: number; // 第68天：保存历史访问次数归一化后的价值分数。
}; // 第68天：结束统一评分分量定义。
export type MemorySearchResult = MemoryScoreBreakdown & { // 第68天：定义统一记忆检索命中结果。
  item: ProductionMemoryItem; // 第68天：保存命中的完整生产记忆条目。
  finalScore: number; // 第68天：保存五个评分分量加权后的最终分数。
  provider: "redis-session" | "persistent-long-term"; // 第68天：标记命中来自会话或长期记忆 Provider。
}; // 第68天：结束统一记忆检索结果定义。
export interface MemoryProvider { // 第68天：定义与 Redis、MySQL 和向量实现解耦的记忆提供者协议。
  add(item: ProductionMemoryItem): Promise<void>; // 第68天：声明新增生产记忆条目的能力。
  get(id: string): Promise<ProductionMemoryItem | null>; // 第68天：声明按标识读取生产记忆条目的能力。
  update(id: string, patch: Partial<ProductionMemoryItem>, expectedVersion?: number): Promise<ProductionMemoryItem>; // 第68天：声明带可选乐观锁版本的更新能力。
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>; // 第68天：声明按统一输入执行记忆搜索的能力。
  archive(id: string): Promise<void>; // 第68天：声明把生产记忆软归档的能力。
  delete(id: string): Promise<void>; // 第68天：声明把生产记忆软删除的能力。
  listByScope(scope: ProductionMemoryScope, scopeId: string): Promise<ProductionMemoryItem[]>; // 第68天：声明列出指定作用域全部记忆的能力。
  listAll(): Promise<ProductionMemoryItem[]>; // 第68天：声明治理台读取全部记忆快照的能力。
}; // 第68天：结束记忆提供者协议定义。
export type MemoryConflictType = "duplicate" | "contradiction" | "superseded"; // 第68天：定义重复、矛盾和被新版本替代三类冲突。
export type MemoryConflictResolution = "keep_existing" | "replace" | "merge" | "manual_review"; // 第68天：定义冲突可采用的四种处理结论。
export type MemoryConflict = { // 第68天：定义可由治理台查看和人工处理的记忆冲突。
  id: string; // 第68天：保存冲突记录唯一标识。
  existingMemoryId: string; // 第68天：保存已有记忆标识。
  candidateMemoryId: string; // 第68天：保存候选记忆标识。
  type: MemoryConflictType; // 第68天：保存冲突类型。
  resolution: MemoryConflictResolution; // 第68天：保存当前自动或人工处理结论。
  reason: string; // 第68天：保存可解释的冲突检测原因。
  status: "pending" | "resolved"; // 第68天：保存冲突是否仍待人工审核。
  createdAt: number; // 第68天：保存冲突发现时间。
  resolvedAt?: number; // 第68天：保存人工或自动完成处理的时间。
}; // 第68天：结束生产记忆冲突结构定义。
export type ProductionMemoryWriteResult = { // 第68天：定义生产记忆写入、去重和冲突处理结果。
  item: ProductionMemoryItem; // 第68天：保存最终有效的生产记忆条目。
  created: boolean; // 第68天：标记本次是否真的创建了新条目。
  conflict?: MemoryConflict; // 第68天：按需返回本次检测到的重复、矛盾或替代记录。
}; // 第68天：结束生产记忆写入结果定义。
export type MemoryConsolidationResult = { // 第68天：定义一次记忆整合的可观察结果。
  before: number; // 第68天：保存整合前活动记忆数量。
  after: number; // 第68天：保存整合后活动记忆数量。
  merged: number; // 第68天：保存本次合并的重复记忆数量。
  conflicts: number; // 第68天：保存本次发现的冲突数量。
}; // 第68天：结束记忆整合结果定义。
export type WorkspaceArchiveResult = { // 第68天：定义工作空间高价值记忆归档结果。
  workspaceId: string; // 第68天：保存被归档的工作空间标识。
  scanned: number; // 第68天：保存扫描的工作空间记忆数量。
  archived: number; // 第68天：保存原工作空间已归档条目数量。
  promoted: number; // 第68天：保存成功沉淀到长期记忆的高价值条目数量。
  skipped: number; // 第68天：保存草稿、低价值或重复条目数量。
  promotedMemoryIds: string[]; // 第68天：保存沉淀后的长期记忆标识列表。
}; // 第68天：结束工作空间归档结果定义。
export type ProductionRuntimeMemoryContext = { // 第68天：定义注入统一运行时上下文的生产记忆结构。
  sessionMemories: ProductionMemoryItem[]; // 第68天：保存本次命中的当前会话记忆。
  longTermMemories: ProductionMemoryItem[]; // 第68天：保存本次命中的用户、智能体与全局长期记忆。
  workspaceMemories: ProductionMemoryItem[]; // 第68天：保存本次命中的工作空间记忆。
  retrievedMemoryIds: string[]; // 第68天：保存本次实际检索出的记忆标识。
  retrievalStrategy: string; // 第68天：保存统一评分、去重和排序策略说明。
}; // 第68天：结束生产运行时记忆上下文定义。
export type ProductionMemoryMetrics = { // 第68天：定义生产记忆平台治理与质量指标。
  totalMemories: number; // 第68天：保存全部非删除记忆数量。
  sessionMemoryCount: number; // 第68天：保存会话记忆数量。
  longTermMemoryCount: number; // 第68天：保存用户、智能体与全局长期记忆数量。
  workspaceMemoryCount: number; // 第68天：保存工作空间记忆数量。
  retrievalCount: number; // 第68天：保存统一检索调用次数。
  retrievalHitRate: number; // 第68天：保存至少命中一条记忆的检索比例。
  avgRetrievalDurationMs: number; // 第68天：保存统一检索平均耗时。
  deduplicationCount: number; // 第68天：保存自动去重次数。
  conflictCount: number; // 第68天：保存检测到的矛盾与替代冲突次数。
  consolidationCount: number; // 第68天：保存执行记忆整合的次数。
  archiveCount: number; // 第68天：保存归档记忆数量。
  deleteCount: number; // 第68天：保存软删除记忆数量。
  expiredCount: number; // 第68天：保存发现并清理的过期记忆数量。
  providerErrors: number; // 第68天：保存 Redis 或 MySQL 失败并触发降级的次数。
  usedMemoryCount: number; // 第68天：保存被调用方确认真正用于最终回答的记忆数量。
}; // 第68天：结束生产记忆指标定义。
export type ProductionMemoryProviderStatus = { // 第68天：定义治理台展示的 Provider 健康与存储状态。
  session: { name: string; backend: "redis" | "memory-fallback"; ttlSeconds: number; keyPattern: string }; // 第68天：保存 Redis 会话 Provider 状态和键约定。
  longTerm: { name: string; metadataBackend: "mysql" | "memory-fallback"; vectorBackend: string; vectorCount: number }; // 第68天：保存持久化长期 Provider 状态和向量数量。
}; // 第68天：结束生产记忆 Provider 状态定义。
export type ProductionMemoryPlatformSnapshot = { // 第68天：定义 Memory Governance Explorer 与测试共享的平台快照。
  items: ProductionMemoryItem[]; // 第68天：保存全部可治理的非删除记忆条目。
  conflicts: MemoryConflict[]; // 第68天：保存待处理和已解决的冲突记录。
  metrics: ProductionMemoryMetrics; // 第68天：保存生产记忆平台累计指标。
  providers: ProductionMemoryProviderStatus; // 第68天：保存 Redis、MySQL 与向量 Provider 运行状态。
  registryItems: import("@/lib/registry/registry-types").RegistryItem[]; // 第68天：保存注册到统一注册中心的记忆能力。
  events: import("@/lib/events/event-types").RuntimeEventRecord[]; // 第68天：保存记忆读写、整合、冲突、归档和删除事件。
  lastRetrieval: { input: MemorySearchInput; results: MemorySearchResult[] } | null; // 第68天：保存最近一次统一记忆检索及其评分明细。
  generatedAt: number; // 第68天：保存治理快照生成时间。
}; // 第68天：结束生产记忆平台快照定义。
