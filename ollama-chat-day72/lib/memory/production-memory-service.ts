import type { RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第68天：引入统一运行时上下文类型以注入结构化生产记忆。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第68天：引入上下文构建器为每个记忆事件补齐请求和追踪标识。
import type { EventType } from "@/lib/events/event-types"; // 第68天：引入统一事件类型以发布记忆治理事件。
import { createRuntimeEvent } from "@/lib/events/event-factory"; // 第68天：引入统一事件工厂关联运行时上下文。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第68天：引入内存事件总线记录可观察的记忆生命周期事件。
import type { MemoryConflict, MemoryConflictResolution, MemoryConsolidationResult, MemoryProvider, MemorySearchInput, MemorySearchResult, ProductionMemoryDraft, ProductionMemoryItem, ProductionMemoryMetrics, ProductionMemoryScope, ProductionMemoryWriteResult, ProductionRuntimeMemoryContext, WorkspaceArchiveResult } from "@/lib/memory/production-memory-types"; // 第68天：引入生产记忆服务需要的领域类型。
import { createProductionMemoryItem, normalizeMemoryContent, semanticScore } from "@/lib/memory/production-memory-utils"; // 第68天：引入生产记忆工厂、正文标准化和语义相似度工具。
import type { RedisSessionMemoryProvider } from "@/lib/memory/redis-session-memory-provider"; // 第68天：引入 Redis 会话记忆 Provider 类型。
import type { PersistentLongTermMemoryProvider } from "@/lib/memory/persistent-long-term-memory-provider"; // 第68天：引入持久化长期记忆 Provider 类型。
export type ProductionMemoryMetricCounters = { // 第68天：定义 Provider 与统一服务共享的可变累计指标容器。
  retrievalCount: number; // 第68天：累计统一检索调用次数。
  retrievalHits: number; // 第68天：累计至少命中一条记忆的检索次数。
  retrievalDurationMs: number; // 第68天：累计统一检索耗时。
  deduplicationCount: number; // 第68天：累计自动去重次数。
  conflictCount: number; // 第68天：累计检测到的矛盾和替代冲突次数。
  consolidationCount: number; // 第68天：累计执行整合的次数。
  archiveCount: number; // 第68天：累计归档条目数量。
  deleteCount: number; // 第68天：累计软删除条目数量。
  expiredCount: number; // 第68天：累计惰性清理的过期条目数量。
  providerErrors: number; // 第68天：累计 Redis 或 MySQL 故障降级次数。
  usedMemoryCount: number; // 第68天：累计真正用于最终回答的记忆数量。
}; // 第68天：结束生产记忆累计指标容器定义。
export function createProductionMemoryMetricCounters(): ProductionMemoryMetricCounters { // 第68天：定义创建零值指标容器的工厂函数。
  return { retrievalCount: 0, retrievalHits: 0, retrievalDurationMs: 0, deduplicationCount: 0, conflictCount: 0, consolidationCount: 0, archiveCount: 0, deleteCount: 0, expiredCount: 0, providerErrors: 0, usedMemoryCount: 0 }; // 第68天：返回包含全部累计指标零值的可变对象。
} // 第68天：结束生产记忆指标容器工厂函数。
const DUPLICATE_THRESHOLD = 0.92; // 第68天：定义内容被视为重复记忆的语义相似度阈值。
const ARCHIVE_TYPES = new Set<ProductionMemoryItem["type"]>(["fact", "preference", "experience", "decision", "lesson"]); // 第68天：定义工作空间允许沉淀到长期记忆的高价值类型。
const CONTRADICTION_PAIRS: Array<[string, string]> = [["简洁", "详细"], ["sqlite", "mysql"], ["开启", "关闭"], ["启用", "禁用"], ["喜欢", "不喜欢"], ["支持", "不支持"], ["同步", "异步"]]; // 第68天：定义教学平台可解释的常见相反语义词对。
const SUPERSEDE_MARKERS = ["现在", "改用", "以后", "从现在", "不再", "已经迁移", "当前使用"]; // 第68天：定义候选记忆明确表达新状态的时间与覆盖标记。
function isContradiction(existing: string, candidate: string): boolean { // 第68天：定义基于相反语义词对的可解释冲突检测函数。
  const left = normalizeMemoryContent(existing); // 第68天：标准化已有记忆正文。
  const right = normalizeMemoryContent(candidate); // 第68天：标准化候选记忆正文。
  return CONTRADICTION_PAIRS.some(([first, second]) => (left.includes(first) && right.includes(second)) || (left.includes(second) && right.includes(first))); // 第68天：任一相反语义词分别出现在两条记忆中即判定矛盾。
} // 第68天：结束记忆矛盾检测函数。
function isSupersedingContent(content: string): boolean { // 第68天：定义候选记忆是否明确覆盖旧状态的判断函数。
  return SUPERSEDE_MARKERS.some((marker) => content.includes(marker)); // 第68天：包含时间或迁移标记时允许自动归档旧版本。
} // 第68天：结束候选记忆覆盖标记判断函数。
function conflictId(): string { return `mconf_${crypto.randomUUID()}`; } // 第68天：生成带稳定前缀的记忆冲突唯一标识。
export class ProductionMemoryService { // 第68天：实现统一路由、检索、去重、冲突、归档、遗忘和上下文注入的生产记忆外观服务。
  private readonly conflicts = new Map<string, MemoryConflict>(); // 第68天：保存治理台可查看和人工处理的冲突记录。
  private lastRetrieval: { input: MemorySearchInput; results: MemorySearchResult[] } | null = null; // 第68天：保存最近一次统一检索及评分明细。
  constructor(readonly sessionProvider: RedisSessionMemoryProvider, readonly longTermProvider: PersistentLongTermMemoryProvider, readonly eventBus: MemoryEventBus, readonly counters: ProductionMemoryMetricCounters, private readonly now: () => number = () => Date.now()) {} // 第68天：通过依赖注入组合两类 Provider、事件总线、指标容器和测试时钟。
  async write(draft: ProductionMemoryDraft): Promise<ProductionMemoryWriteResult> { // 第68天：统一写入生产记忆并在持久化前执行去重与冲突处理。
    this.validateDraft(draft); // 第68天：拒绝空正文、空作用域标识和越界分数。
    const candidate = createProductionMemoryItem(draft, this.now()); // 第68天：把调用方草稿补齐为完整生产记忆条目。
    const provider = this.providerForScope(candidate.scope); // 第68天：根据 session 或长期作用域选择对应 Provider。
    const existingItems = (await provider.listByScope(candidate.scope, candidate.scopeId)).filter((item) => item.status === "active" && item.type === candidate.type); // 第68天：读取同作用域、同类型的活动记忆作为治理候选。
    const duplicate = existingItems.find((item) => normalizeMemoryContent(item.content) === normalizeMemoryContent(candidate.content) || semanticScore(item.content, candidate.content) >= DUPLICATE_THRESHOLD); // 第68天：优先按正文完全一致或高语义相似度检测重复记忆。
    if (duplicate) { // 第68天：进入重复记忆自动合并分支。
      const merged = await provider.update(duplicate.id, { confidence: Math.min(1, Math.max(duplicate.confidence, candidate.confidence) + 0.03), importance: Math.max(duplicate.importance, candidate.importance), accessCount: duplicate.accessCount + candidate.accessCount + 1, tags: Array.from(new Set([...duplicate.tags, ...candidate.tags])), source: { ...duplicate.source, ...candidate.source }, consolidatedFrom: Array.from(new Set([...duplicate.consolidatedFrom, candidate.id])), status: "active" }); // 第68天：合并置信度、重要性、访问次数、标签、来源和候选标识。
      const conflict = this.recordConflict(duplicate.id, candidate.id, "duplicate", "merge", "候选记忆与已有活动记忆高度相似，已自动合并访问、置信度、标签与来源", "resolved"); // 第68天：保存已自动解决的重复记忆冲突记录。
      this.counters.deduplicationCount += 1; // 第68天：累计一次生产记忆自动去重。
      await this.publish("memory.conflict_detected", merged, { conflict }); // 第68天：发布可追踪的重复记忆检测事件。
      await this.publish("memory.consolidated", merged, { conflict, mergedMemoryId: merged.id }); // 第68天：发布重复记忆合并完成事件。
      return { item: merged, created: false, conflict }; // 第68天：返回已有有效记忆并明确本次没有创建新条目。
    } // 第68天：结束重复记忆自动合并分支。
    const contradiction = existingItems.find((item) => isContradiction(item.content, candidate.content)); // 第68天：在非重复记忆中检测相反语义冲突。
    if (contradiction && isSupersedingContent(candidate.content)) { // 第68天：候选明确表达新状态时进入自动替代分支。
      await provider.archive(contradiction.id); // 第68天：先软归档被新状态替代的旧记忆。
      await provider.add(candidate); // 第68天：再写入仍为活动状态的新记忆。
      const conflict = this.recordConflict(contradiction.id, candidate.id, "superseded", "replace", "候选记忆包含当前或迁移标记，已归档旧状态并启用新状态", "resolved"); // 第68天：记录已自动解决的新版本覆盖冲突。
      this.counters.conflictCount += 1; // 第68天：累计一次替代冲突检测。
      this.counters.archiveCount += 1; // 第68天：累计一次旧记忆归档。
      await this.publish("memory.conflict_detected", candidate, { conflict }); // 第68天：发布新旧状态冲突检测事件。
      await this.publish("memory.archived", contradiction, { reason: "superseded", replacementMemoryId: candidate.id }); // 第68天：发布旧记忆被替代归档事件。
      await this.publish("memory.write", candidate, { provider: provider === this.sessionProvider ? "redis-session" : "persistent-long-term" }); // 第68天：发布新状态记忆写入事件。
      return { item: candidate, created: true, conflict }; // 第68天：返回成功创建的新状态记忆和替代记录。
    } // 第68天：结束候选记忆自动替代分支。
    await provider.add(candidate); // 第68天：没有重复或自动替代时把候选写入选定 Provider。
    if (contradiction) { // 第68天：无法安全自动判断的矛盾进入人工审核分支。
      const conflict = this.recordConflict(contradiction.id, candidate.id, "contradiction", "manual_review", "两条活动记忆包含相反语义且候选未明确表达覆盖时间，需要人工审核", "pending"); // 第68天：保存待治理台人工确认的矛盾冲突。
      this.counters.conflictCount += 1; // 第68天：累计一次矛盾冲突检测。
      await this.publish("memory.conflict_detected", candidate, { conflict }); // 第68天：发布待人工审核的矛盾记忆事件。
      await this.publish("memory.write", candidate, { provider: provider === this.sessionProvider ? "redis-session" : "persistent-long-term" }); // 第68天：发布候选记忆已写入但待治理事件。
      return { item: candidate, created: true, conflict }; // 第68天：返回新记忆和待人工处理冲突。
    } // 第68天：结束人工审核冲突分支。
    await this.publish("memory.write", candidate, { provider: provider === this.sessionProvider ? "redis-session" : "persistent-long-term" }); // 第68天：发布正常生产记忆写入事件。
    return { item: candidate, created: true }; // 第68天：返回没有冲突的正常写入结果。
  } // 第68天：结束生产记忆统一写入方法。
  async retrieve(input: MemorySearchInput): Promise<MemorySearchResult[]> { // 第68天：并行检索会话、长期和工作空间记忆并统一去重排序。
    const startedAt = this.now(); // 第68天：记录统一检索开始时间用于平均耗时指标。
    const normalized: MemorySearchInput = { ...input, query: input.query.trim(), topK: Math.max(1, input.topK ?? 5), minScore: input.minScore ?? 0.2, includeSession: input.includeSession ?? true, includeLongTerm: input.includeLongTerm ?? true, includeWorkspace: input.includeWorkspace ?? true }; // 第68天：补齐检索开关、阈值和返回数量默认值。
    if (!normalized.query) throw new Error("MemorySearchInput.query 不能为空"); // 第68天：阻止空问题触发无意义全库扫描。
    const sessionPromise = normalized.includeSession && normalized.sessionId ? this.sessionProvider.search(normalized) : Promise.resolve<MemorySearchResult[]>([]); // 第68天：只在存在会话标识且启用开关时检索 Redis 会话记忆。
    const persistentInput: MemorySearchInput = { ...normalized, userId: normalized.includeLongTerm ? normalized.userId : undefined, agentId: normalized.includeLongTerm ? normalized.agentId : undefined, workspaceId: normalized.includeWorkspace ? normalized.workspaceId : undefined }; // 第68天：根据长期与工作空间开关裁剪持久化 Provider 可见作用域。
    const persistentPromise = normalized.includeLongTerm || normalized.includeWorkspace ? this.longTermProvider.search(persistentInput) : Promise.resolve<MemorySearchResult[]>([]); // 第68天：启用任一路持久化记忆时执行 MySQL 与 VectorStore 检索。
    const [sessionResults, persistentResults] = await Promise.all([sessionPromise, persistentPromise]); // 第68天：并行等待会话和持久化两路检索完成。
    const scopedPersistentResults = persistentResults.filter((result) => (result.item.scope === "workspace" ? normalized.includeWorkspace : normalized.includeLongTerm)); // 第68天：过滤全局、用户、智能体和工作空间在开关组合下的可见性。
    const byContent = new Map<string, MemorySearchResult>(); // 第68天：按标准化正文保存跨 Provider 去重后的最高分命中。
    for (const result of [...sessionResults, ...scopedPersistentResults]) { const key = normalizeMemoryContent(result.item.content); const current = byContent.get(key); if (!current || result.finalScore > current.finalScore) byContent.set(key, result); } // 第68天：相同正文只保留综合评分最高的一条记忆快照。
    const results = Array.from(byContent.values()).sort((left, right) => right.finalScore - left.finalScore || right.item.updatedAt - left.item.updatedAt).slice(0, normalized.topK); // 第68天：按最终分和更新时间排序并截取统一 TopK。
    this.counters.retrievalCount += 1; // 第68天：累计一次统一记忆检索。
    if (results.length > 0) this.counters.retrievalHits += 1; // 第68天：至少命中一条时累计一次命中检索。
    this.counters.retrievalDurationMs += Math.max(0, this.now() - startedAt); // 第68天：累计统一检索耗时。
    this.lastRetrieval = { input: normalized, results }; // 第68天：保存最近一次检索输入与评分结果供治理台查看。
    await this.publish("memory.read", results[0]?.item, { query: normalized.query, retrievedMemoryIds: results.map((result) => result.item.id), hitCount: results.length, strategy: "semantic×0.45 + importance×0.20 + recency×0.15 + confidence×0.10 + access×0.10" }, normalized); // 第68天：发布不复制完整记忆正文的统一检索事件。
    return results; // 第68天：返回经过三路合并、统一评分、去重和排序的生产记忆。
  } // 第68天：结束生产记忆统一检索方法。
  async consolidate(scope?: ProductionMemoryScope, scopeId?: string): Promise<MemoryConsolidationResult> { // 第68天：扫描活动记忆并合并写入阶段以外产生的重复条目。
    const all = (await this.listAll()).filter((item) => item.status === "active" && (!scope || item.scope === scope) && (!scopeId || item.scopeId === scopeId)); // 第68天：按可选作用域筛选本次整合候选。
    const before = all.length; // 第68天：记录整合前活动记忆数量。
    const consumed = new Set<string>(); // 第68天：保存已经被合并或作为候选处理的记忆标识。
    let merged = 0; // 第68天：初始化本次合并重复记忆数量。
    let conflicts = 0; // 第68天：初始化本次发现矛盾冲突数量。
    for (let index = 0; index < all.length; index += 1) { // 第68天：逐条选择整合基准记忆。
      const primary = all[index]; // 第68天：读取当前整合基准记忆。
      if (consumed.has(primary.id)) continue; // 第68天：已经被其他基准吸收的记忆不再重复处理。
      for (let candidateIndex = index + 1; candidateIndex < all.length; candidateIndex += 1) { // 第68天：遍历基准之后的候选记忆。
        const candidate = all[candidateIndex]; // 第68天：读取当前候选记忆。
        if (consumed.has(candidate.id) || primary.scope !== candidate.scope || primary.scopeId !== candidate.scopeId || primary.type !== candidate.type) continue; // 第68天：只比较同作用域、同归属和同类型且尚未处理的记忆。
        if (semanticScore(primary.content, candidate.content) >= DUPLICATE_THRESHOLD) { await this.merge(primary.id, candidate.id); consumed.add(candidate.id); merged += 1; continue; } // 第68天：高语义相似记忆自动合并并跳过后续冲突判断。
        if (isContradiction(primary.content, candidate.content)) { this.recordConflict(primary.id, candidate.id, "contradiction", "manual_review", "整合扫描发现相反语义，需要人工审核", "pending"); this.counters.conflictCount += 1; conflicts += 1; } // 第68天：相反语义记忆只记录人工审核冲突而不擅自删除。
      } // 第68天：结束当前基准的候选记忆遍历。
    } // 第68天：结束全部整合基准遍历。
    this.counters.consolidationCount += 1; // 第68天：累计一次生产记忆整合操作。
    const after = (await this.listAll()).filter((item) => item.status === "active" && (!scope || item.scope === scope) && (!scopeId || item.scopeId === scopeId)).length; // 第68天：重新统计整合后的活动记忆数量。
    const result = { before, after, merged, conflicts }; // 第68天：组装本次整合前后数量、合并和冲突结果。
    await this.publish("memory.consolidated", all[0], result); // 第68天：发布生产记忆整合完成事件。
    return result; // 第68天：返回可观察的生产记忆整合结果。
  } // 第68天：结束生产记忆整合方法。
  async archiveWorkspace(workspaceId: string, targetUserId = "day68-user"): Promise<WorkspaceArchiveResult> { // 第68天：筛选工作空间高价值条目并沉淀到用户长期记忆。
    const entries = (await this.longTermProvider.listByScope("workspace", workspaceId)).filter((item) => item.status === "active"); // 第68天：读取当前工作空间全部活动记忆条目。
    const promotedMemoryIds: string[] = []; // 第68天：初始化成功沉淀到长期记忆的标识列表。
    let skipped = 0; // 第68天：初始化草稿、低价值和重复条目数量。
    for (const entry of entries) { // 第68天：逐条评估工作空间记忆的长期价值。
      const excludedTag = entry.tags.some((tag) => ["draft", "temporary", "log", "guess", "草稿", "临时", "日志", "猜测"].includes(tag.toLowerCase())); // 第68天：识别不应归档的草稿、临时、日志和模型猜测标签。
      const valuable = ARCHIVE_TYPES.has(entry.type) && entry.importance >= 0.65 && !excludedTag; // 第68天：只允许高价值稳定类型进入长期记忆。
      if (valuable) { const result = await this.write({ ...entry, id: undefined, scope: "user", scopeId: targetUserId, source: { ...entry.source, workspaceId }, tags: Array.from(new Set([...entry.tags, "workspace-archive"])), status: "active", expiresAt: undefined }); if (result.created) promotedMemoryIds.push(result.item.id); else skipped += 1; } else skipped += 1; // 第68天：高价值条目经统一去重冲突管线写入用户长期记忆，其余条目跳过。
      await this.longTermProvider.archive(entry.id); // 第68天：无论是否沉淀都把任务结束后的原工作空间条目标记归档。
      this.counters.archiveCount += 1; // 第68天：累计一条工作空间记忆归档。
    } // 第68天：结束工作空间条目价值评估循环。
    const result: WorkspaceArchiveResult = { workspaceId, scanned: entries.length, archived: entries.length, promoted: promotedMemoryIds.length, skipped, promotedMemoryIds }; // 第68天：组装扫描、归档、沉淀和跳过数量。
    await this.publish("memory.archived", entries[0], { ...result, archiveType: "workspace" }); // 第68天：发布工作空间记忆归档完成事件。
    return result; // 第68天：返回工作空间生产归档结果。
  } // 第68天：结束工作空间记忆归档方法。
  async forget(id: string): Promise<void> { // 第68天：统一软删除会话或长期记忆并发布治理事件。
    const item = await this.get(id); // 第68天：跨 Provider 查找目标记忆。
    if (!item) throw new Error(`生产记忆不存在：${id}`); // 第68天：目标不存在时抛出明确错误。
    await this.providerForScope(item.scope).delete(id); // 第68天：委托对应 Provider 执行软删除和向量清理。
    this.counters.deleteCount += 1; // 第68天：累计一次生产记忆软删除。
    await this.publish("memory.deleted", item, { memoryId: id }); // 第68天：发布生产记忆删除事件供审计追踪。
  } // 第68天：结束生产记忆遗忘方法。
  async archive(id: string): Promise<void> { // 第68天：统一归档会话或长期记忆并发布治理事件。
    const item = await this.get(id); // 第68天：跨 Provider 查找目标记忆。
    if (!item) throw new Error(`生产记忆不存在：${id}`); // 第68天：目标不存在时抛出明确错误。
    await this.providerForScope(item.scope).archive(id); // 第68天：委托对应 Provider 执行软归档。
    this.counters.archiveCount += 1; // 第68天：累计一次生产记忆归档。
    await this.publish("memory.archived", item, { memoryId: id, archiveType: "manual" }); // 第68天：发布人工归档事件供治理台追踪。
  } // 第68天：结束生产记忆归档方法。
  async pin(id: string, pinned: boolean): Promise<ProductionMemoryItem> { // 第68天：固定或取消固定一条重要生产记忆。
    const item = await this.get(id); // 第68天：跨 Provider 查找目标记忆。
    if (!item) throw new Error(`生产记忆不存在：${id}`); // 第68天：目标不存在时抛出明确错误。
    const tags = pinned ? Array.from(new Set([...item.tags, "pinned"])) : item.tags.filter((tag) => tag !== "pinned"); // 第68天：同步维护便于搜索和治理的 pinned 标签。
    return await this.providerForScope(item.scope).update(id, { pinned, importance: pinned ? 1 : item.importance, tags }); // 第68天：置顶时拉满重要性并返回更新后的记忆。
  } // 第68天：结束生产记忆固定操作。
  async merge(primaryId: string, secondaryId: string): Promise<ProductionMemoryItem> { // 第68天：把两条同作用域记忆合并并归档次要条目。
    const primary = await this.get(primaryId); // 第68天：读取合并后的主记忆。
    const secondary = await this.get(secondaryId); // 第68天：读取将被吸收的次要记忆。
    if (!primary || !secondary) throw new Error("合并的生产记忆不存在"); // 第68天：任一目标缺失时阻止产生不完整合并。
    if (primary.scope !== secondary.scope || primary.scopeId !== secondary.scopeId) throw new Error("只能合并同一作用域和 Scope ID 的生产记忆"); // 第68天：阻止跨用户、会话或工作空间误合并。
    const provider = this.providerForScope(primary.scope); // 第68天：选择主记忆所属 Provider。
    const merged = await provider.update(primary.id, { content: primary.content.length >= secondary.content.length ? primary.content : secondary.content, importance: Math.max(primary.importance, secondary.importance), confidence: Math.max(primary.confidence, secondary.confidence), accessCount: primary.accessCount + secondary.accessCount, tags: Array.from(new Set([...primary.tags, ...secondary.tags])), source: { ...secondary.source, ...primary.source }, consolidatedFrom: Array.from(new Set([...primary.consolidatedFrom, secondary.id, ...secondary.consolidatedFrom])) }); // 第68天：保留信息量更大正文并合并治理、访问、标签和来源信息。
    await this.providerForScope(secondary.scope).archive(secondary.id); // 第68天：软归档已经被主记忆吸收的次要条目。
    this.counters.deduplicationCount += 1; // 第68天：累计一次手动或整合阶段去重。
    this.counters.archiveCount += 1; // 第68天：累计一次被合并条目归档。
    await this.publish("memory.consolidated", merged, { primaryId, secondaryId }); // 第68天：发布两条生产记忆合并完成事件。
    return merged; // 第68天：返回合并后的主记忆。
  } // 第68天：结束生产记忆合并方法。
  async resolveConflict(conflictIdValue: string, resolution: Exclude<MemoryConflictResolution, "manual_review">): Promise<MemoryConflict> { // 第68天：由治理台人工确认待处理冲突的最终结论。
    const conflict = this.conflicts.get(conflictIdValue); // 第68天：读取目标冲突记录。
    if (!conflict) throw new Error(`记忆冲突不存在：${conflictIdValue}`); // 第68天：目标冲突不存在时抛出明确错误。
    if (conflict.status === "resolved") return { ...conflict }; // 第68天：已处理冲突保持幂等并直接返回副本。
    if (resolution === "keep_existing") await this.archive(conflict.candidateMemoryId); // 第68天：保留旧记忆时归档候选记忆。
    if (resolution === "replace") await this.archive(conflict.existingMemoryId); // 第68天：采用新记忆时归档已有记忆。
    if (resolution === "merge") await this.merge(conflict.existingMemoryId, conflict.candidateMemoryId); // 第68天：合并结论交给统一合并流程处理。
    conflict.resolution = resolution; // 第68天：保存人工选择的最终处理结论。
    conflict.status = "resolved"; // 第68天：把冲突状态更新为已解决。
    conflict.resolvedAt = this.now(); // 第68天：记录人工处理完成时间。
    return { ...conflict }; // 第68天：返回冲突记录副本供治理台刷新。
  } // 第68天：结束生产记忆冲突人工处理方法。
  async getContextForRuntime(input: MemorySearchInput, context: RuntimeContextV2): Promise<ProductionRuntimeMemoryContext> { // 第68天：检索记忆并注入统一 RuntimeContext.memoryContext。
    const results = await this.retrieve(input); // 第68天：执行会话、长期和工作空间三路统一检索。
    const memoryContext: ProductionRuntimeMemoryContext = { sessionMemories: results.filter((result) => result.item.scope === "session").map((result) => result.item), longTermMemories: results.filter((result) => result.item.scope === "user" || result.item.scope === "agent" || result.item.scope === "global").map((result) => result.item), workspaceMemories: results.filter((result) => result.item.scope === "workspace").map((result) => result.item), retrievedMemoryIds: results.map((result) => result.item.id), retrievalStrategy: "三路召回 → 五分量统一评分 → 正文去重 → TopK 排序" }; // 第68天：按任务文档结构拆分三类命中并记录策略。
    context.memoryContext = memoryContext; // 第68天：把生产记忆上下文写入全链路共享运行时上下文。
    return memoryContext; // 第68天：返回同一结构供 Agent Runtime 直接使用。
  } // 第68天：结束生产记忆运行时上下文注入方法。
  markUsed(memoryIds: string[]): void { this.counters.usedMemoryCount += new Set(memoryIds).size; } // 第68天：累计调用方确认真正用于最终回答的去重记忆数量。
  async get(id: string): Promise<ProductionMemoryItem | null> { return await this.sessionProvider.get(id) ?? await this.longTermProvider.get(id); } // 第68天：先查会话 Provider 再查长期 Provider 获取指定生产记忆。
  async listAll(): Promise<ProductionMemoryItem[]> { const [sessionItems, longTermItems] = await Promise.all([this.sessionProvider.listAll(), this.longTermProvider.listAll()]); return [...sessionItems, ...longTermItems].sort((left, right) => right.updatedAt - left.updatedAt); } // 第68天：并行合并两类 Provider 的全部生产记忆快照。
  listConflicts(): MemoryConflict[] { return Array.from(this.conflicts.values()).map((conflict) => ({ ...conflict })).sort((left, right) => right.createdAt - left.createdAt); } // 第68天：复制并按发现时间倒序返回全部冲突记录。
  getLastRetrieval(): { input: MemorySearchInput; results: MemorySearchResult[] } | null { return this.lastRetrieval ? { input: { ...this.lastRetrieval.input, types: this.lastRetrieval.input.types ? [...this.lastRetrieval.input.types] : undefined }, results: this.lastRetrieval.results.map((result) => ({ ...result, item: { ...result.item, source: { ...result.item.source }, tags: [...result.item.tags], consolidatedFrom: [...result.item.consolidatedFrom] } })) } : null; } // 第68天：返回最近统一检索及记忆条目防御性副本。
  async getMetrics(): Promise<ProductionMemoryMetrics> { // 第68天：聚合当前库存与累计操作生成生产记忆指标。
    const items = (await this.listAll()).filter((item) => item.status !== "deleted"); // 第68天：读取全部尚未软删除的生产记忆。
    return { totalMemories: items.length, sessionMemoryCount: items.filter((item) => item.scope === "session").length, longTermMemoryCount: items.filter((item) => item.scope === "user" || item.scope === "agent" || item.scope === "global").length, workspaceMemoryCount: items.filter((item) => item.scope === "workspace").length, retrievalCount: this.counters.retrievalCount, retrievalHitRate: this.counters.retrievalCount > 0 ? Number((this.counters.retrievalHits / this.counters.retrievalCount).toFixed(4)) : 0, avgRetrievalDurationMs: this.counters.retrievalCount > 0 ? Number((this.counters.retrievalDurationMs / this.counters.retrievalCount).toFixed(2)) : 0, deduplicationCount: this.counters.deduplicationCount, conflictCount: this.counters.conflictCount, consolidationCount: this.counters.consolidationCount, archiveCount: this.counters.archiveCount, deleteCount: this.counters.deleteCount, expiredCount: this.counters.expiredCount, providerErrors: this.counters.providerErrors, usedMemoryCount: this.counters.usedMemoryCount }; // 第68天：返回任务要求及实际使用次数扩展的完整生产记忆指标。
  } // 第68天：结束生产记忆指标聚合方法。
  private providerForScope(scope: ProductionMemoryScope): MemoryProvider { return scope === "session" ? this.sessionProvider : this.longTermProvider; } // 第68天：根据作用域把会话记忆路由到 Redis，其余记忆路由到长期 Provider。
  private validateDraft(draft: ProductionMemoryDraft): void { // 第68天：定义生产记忆写入前的数据完整性校验。
    if (!draft.scopeId.trim()) throw new Error("ProductionMemoryItem.scopeId 不能为空"); // 第68天：阻止没有归属标识的记忆写入。
    if (!draft.content.trim()) throw new Error("ProductionMemoryItem.content 不能为空"); // 第68天：阻止空正文记忆污染生产存储。
    if (!Number.isFinite(draft.importance) || draft.importance < 0 || draft.importance > 1) throw new Error("ProductionMemoryItem.importance 必须在 0 到 1 之间"); // 第68天：阻止越界重要性分数写入。
    if (!Number.isFinite(draft.confidence) || draft.confidence < 0 || draft.confidence > 1) throw new Error("ProductionMemoryItem.confidence 必须在 0 到 1 之间"); // 第68天：阻止越界置信度分数写入。
  } // 第68天：结束生产记忆草稿校验方法。
  private recordConflict(existingMemoryId: string, candidateMemoryId: string, type: MemoryConflict["type"], resolution: MemoryConflict["resolution"], reason: string, status: MemoryConflict["status"]): MemoryConflict { // 第68天：统一创建并保存可治理的记忆冲突记录。
    const conflict: MemoryConflict = { id: conflictId(), existingMemoryId, candidateMemoryId, type, resolution, reason, status, createdAt: this.now(), resolvedAt: status === "resolved" ? this.now() : undefined }; // 第68天：组装冲突标识、双方记忆、类型、结论、原因和状态时间。
    this.conflicts.set(conflict.id, conflict); // 第68天：把冲突保存到治理记录 Map。
    return { ...conflict }; // 第68天：返回冲突副本避免调用方修改内部状态。
  } // 第68天：结束生产记忆冲突记录创建方法。
  private async publish(type: EventType, item: ProductionMemoryItem | undefined, payload: Record<string, unknown>, searchInput?: MemorySearchInput): Promise<void> { // 第68天：统一发布关联请求、会话、工作空间和 Trace 的记忆事件。
    const source = item?.source ?? {}; // 第68天：读取记忆来源或使用空来源处理纯检索事件。
    const context = runtimeContextBuilder.build({ requestId: source.requestId, traceId: source.traceId, sessionId: source.sessionId ?? searchInput?.sessionId ?? (item?.scope === "session" ? item.scopeId : undefined), userId: searchInput?.userId ?? (item?.scope === "user" ? item.scopeId : undefined), agentId: source.agentId ?? searchInput?.agentId, memoryContext: { memoryId: item?.id, scope: item?.scope, scopeId: item?.scopeId }, workspace: { workspaceId: source.workspaceId ?? searchInput?.workspaceId }, metadata: { module: "production-memory", day: 68 } }); // 第68天：构建不含记忆正文的安全运行时上下文。
    await this.eventBus.publish(createRuntimeEvent(context, type, "memory", payload, type.endsWith("detected") ? "pending" : "completed")); // 第68天：通过统一事件总线发布治理事件并保存历史。
  } // 第68天：结束生产记忆事件发布方法。
} // 第68天：结束 ProductionMemoryService 实现。
