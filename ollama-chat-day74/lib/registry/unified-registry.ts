import { REGISTRY_ITEM_TYPES, type CapabilityDiscoveryResult, type RegistryItem, type RegistryItemType, type RegistryMetrics, type RegistryProvider } from "@/lib/registry/registry-types"; // 第66天：引入统一注册协议、能力发现结果和指标类型。

export type RegistryConflictReason = "duplicate_id" | "version_conflict"; // 第66天：定义重复标识和版本冲突两类注册失败原因。

export class RegistryConflictError extends Error { // 第66天：定义可供接口和测试识别的统一注册冲突异常。
  constructor(readonly itemId: string, readonly reason: RegistryConflictReason, message: string) { // 第66天：接收冲突注册项、原因代码和中文错误说明。
    super(message); // 第66天：调用原生错误构造器保存错误消息。
    this.name = "RegistryConflictError"; // 第66天：设置稳定错误名称便于日志与断言识别。
  } // 第66天：结束统一注册冲突异常构造函数。
} // 第66天：结束统一注册冲突异常定义。

function cloneRegistryItem(item: RegistryItem): RegistryItem { // 第66天：定义注册项防御性复制函数避免外部修改内部状态。
  return { ...item, metadata: structuredClone(item.metadata) }; // 第66天：复制顶层字段并深复制可变元数据对象。
} // 第66天：结束注册项防御性复制函数。

function normalize(value: unknown): string { // 第66天：定义能力发现与全文搜索共用的文本标准化函数。
  return String(value ?? "").trim().toLowerCase(); // 第66天：把未知值转换为去首尾空格的小写文本。
} // 第66天：结束文本标准化函数。

function metadataStrings(value: unknown): string[] { // 第66天：定义递归提取元数据可搜索文本的辅助函数。
  if (Array.isArray(value)) return value.flatMap((item) => metadataStrings(item)); // 第66天：数组元数据递归展开为字符串列表。
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, ...metadataStrings(item)]); // 第66天：对象元数据同时提取键名和嵌套值。
  if (value == null) return []; // 第66天：空值不参与全文搜索。
  return [String(value)]; // 第66天：基础值转换为可搜索字符串。
} // 第66天：结束元数据文本提取函数。

function searchableDocument(item: RegistryItem): string { // 第66天：定义统一注册项全文搜索文档生成函数。
  return [item.id, item.name, item.type, item.version, item.enabled ? "enabled 启用" : "disabled 禁用", ...metadataStrings(item.metadata)].join(" ").toLowerCase(); // 第66天：合并基础字段、状态中英文和全部元数据文本。
} // 第66天：结束统一搜索文档生成函数。

function assertRegistryItem(item: RegistryItem): void { // 第66天：定义写入统一注册中心前的数据完整性校验函数。
  if (!item.id.trim()) throw new Error("RegistryItem.id 不能为空"); // 第66天：阻止没有唯一标识的注册项写入。
  if (!item.name.trim()) throw new Error(`RegistryItem.name 不能为空：${item.id}`); // 第66天：阻止没有展示名称的注册项写入。
  if (!REGISTRY_ITEM_TYPES.includes(item.type)) throw new Error(`不支持的 RegistryItem.type：${String(item.type)}`); // 第66天：阻止任务清单之外的未知能力类型写入。
  if (!item.version.trim()) throw new Error(`RegistryItem.version 不能为空：${item.id}`); // 第66天：阻止没有版本信息的注册项写入。
  if (!Number.isFinite(item.createdAt) || item.createdAt <= 0) throw new Error(`RegistryItem.createdAt 非法：${item.id}`); // 第66天：阻止无效创建时间戳写入。
  if (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata)) throw new Error(`RegistryItem.metadata 必须是对象：${item.id}`); // 第66天：保证扩展元数据始终是普通对象。
} // 第66天：结束统一注册项数据完整性校验函数。

export class UnifiedRegistry implements RegistryProvider { // 第66天：实现基于内存 Map 的统一注册中心和能力发现入口。
  private readonly items = new Map<string, RegistryItem>(); // 第66天：按跨类型唯一标识保存全部注册项。

  register(item: RegistryItem): void { // 第66天：实现严格的新能力注册方法。
    assertRegistryItem(item); // 第66天：写入前校验注册项结构和必填字段。
    const existing = this.items.get(item.id); // 第66天：检查统一命名空间中是否已存在同标识能力。
    if (existing?.version === item.version) throw new RegistryConflictError(item.id, "duplicate_id", `注册项已存在：${item.id}@${item.version}`); // 第66天：同标识同版本重复注册时抛出重复标识异常。
    if (existing) throw new RegistryConflictError(item.id, "version_conflict", `注册项版本冲突：${item.id} 已是 ${existing.version}，不能注册 ${item.version}`); // 第66天：同标识不同版本写入时抛出版本冲突异常。
    this.items.set(item.id, cloneRegistryItem(item)); // 第66天：保存防御性副本完成严格注册。
  } // 第66天：结束严格的新能力注册方法。

  upsert(item: RegistryItem): void { // 第66天：提供给旧注册表适配器同步状态变化的兼容写入方法。
    assertRegistryItem(item); // 第66天：兼容写入同样执行完整的数据结构校验。
    this.items.set(item.id, cloneRegistryItem(item)); // 第66天：按标识新增或覆盖注册项以同步旧注册表生命周期。
  } // 第66天：结束适配器兼容写入方法。

  unregister(id: string): void { // 第66天：实现按标识注销统一能力的方法。
    this.items.delete(id); // 第66天：从统一命名空间删除目标注册项且允许幂等调用。
  } // 第66天：结束统一能力注销方法。

  get(id: string): RegistryItem | undefined { // 第66天：实现按唯一标识读取注册项的方法。
    const item = this.items.get(id); // 第66天：从内存 Map 查找目标注册项。
    return item ? cloneRegistryItem(item) : undefined; // 第66天：命中时返回副本，未命中时返回 undefined。
  } // 第66天：结束按唯一标识读取注册项方法。

  list(type?: RegistryItemType): RegistryItem[] { // 第66天：实现列出全部或指定类型注册项的方法。
    return Array.from(this.items.values()).filter((item) => !type || item.type === type).map(cloneRegistryItem).sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name, "zh-CN") || left.version.localeCompare(right.version)); // 第66天：筛选、复制并按类型名称版本稳定排序。
  } // 第66天：结束统一注册项列表方法。

  search(query: string): RegistryItem[] { // 第66天：实现覆盖基础字段、状态和嵌套元数据的全文搜索。
    const normalizedQuery = normalize(query); // 第66天：标准化调用方传入的搜索词。
    if (!normalizedQuery) return this.list(); // 第66天：空搜索词直接返回全部注册项。
    return this.list().filter((item) => searchableDocument(item).includes(normalizedQuery)); // 第66天：返回统一搜索文档包含完整查询词的注册项。
  } // 第66天：结束统一注册项全文搜索方法。

  setEnabled(id: string, enabled: boolean): RegistryItem { // 第66天：定义统一切换能力启用状态的方法。
    const current = this.items.get(id); // 第66天：读取需要切换状态的注册项。
    if (!current) throw new Error(`注册项不存在：${id}`); // 第66天：目标不存在时抛出明确错误。
    const next = { ...current, enabled }; // 第66天：复制注册项并写入新的启用状态。
    this.items.set(id, next); // 第66天：把状态变化保存回统一注册中心。
    return cloneRegistryItem(next); // 第66天：返回切换后的防御性副本。
  } // 第66天：结束统一启用状态切换方法。

  discoverCapability(query: string, type?: RegistryItemType): CapabilityDiscoveryResult[] { // 第66天：实现跨智能体、工具、模型和提示词的统一能力发现。
    const normalizedQuery = normalize(query); // 第66天：标准化能力查询文本。
    if (!normalizedQuery) return []; // 第66天：空能力查询不返回无意义结果。
    const tokens = normalizedQuery.split(/[^a-z0-9\u4e00-\u9fff_-]+/u).filter((token) => token && token !== "capability" && token !== "能力"); // 第66天：提取有效查询词并忽略中英文能力占位词。
    const searchTokens = tokens.length > 0 ? tokens : [normalizedQuery]; // 第66天：无法拆词时回退使用完整标准化查询。
    return this.list(type).filter((item) => item.enabled).map((item) => this.scoreDiscovery(item, searchTokens)).filter((result): result is CapabilityDiscoveryResult => Boolean(result)).sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name, "zh-CN")); // 第66天：过滤禁用项、计算相关度并按分数和名称稳定排序。
  } // 第66天：结束统一能力发现方法。

  getMetrics(): RegistryMetrics { // 第66天：实现统一注册中心规模、类型和版本指标统计。
    const items = this.list(); // 第66天：读取全部注册项快照用于聚合计算。
    const typeDistribution = Object.fromEntries(REGISTRY_ITEM_TYPES.map((type) => [type, items.filter((item) => item.type === type).length])) as Record<RegistryItemType, number>; // 第66天：统计七种能力类型各自的注册项数量。
    const enabledCount = items.filter((item) => item.enabled).length; // 第66天：统计当前启用且可被发现的能力数量。
    return { totalItems: items.length, agentCount: typeDistribution.agent, toolCount: typeDistribution.tool, modelCount: typeDistribution.model, promptCount: typeDistribution.prompt, knowledgeCount: typeDistribution.knowledge, observabilityCount: typeDistribution.observability, governanceCount: typeDistribution.governance, enabledCount, versionCount: new Set(items.map((item) => item.version)).size, disabledCount: items.length - enabledCount, typeDistribution }; // 第73天：返回包含生产治理能力数量的完整统一注册指标。
  } // 第66天：结束统一注册指标统计方法。

  private scoreDiscovery(item: RegistryItem, tokens: string[]): CapabilityDiscoveryResult | null { // 第66天：定义单个注册项的可解释能力相关度评分函数。
    const name = normalize(item.name); // 第66天：标准化注册项名称用于精确和包含匹配。
    const description = normalize(item.metadata.description); // 第66天：读取并标准化能力描述元数据。
    const capabilities = Array.isArray(item.metadata.capabilities) ? item.metadata.capabilities.map(normalize) : []; // 第66天：读取并标准化显式能力声明列表。
    const tags = Array.isArray(item.metadata.tags) ? item.metadata.tags.map(normalize) : []; // 第66天：读取并标准化标签列表。
    const document = searchableDocument(item); // 第66天：生成兜底全文搜索文档。
    let score = 0; // 第66天：初始化当前注册项相关度分数。
    const reasons = new Set<string>(); // 第66天：使用集合保存去重后的可解释命中原因。
    for (const token of tokens) { // 第66天：逐个评估查询关键词在不同字段中的命中情况。
      if (capabilities.includes(token)) { score += 100; reasons.add(`能力声明命中：${token}`); } // 第66天：显式能力完全匹配获得最高权重。
      else if (capabilities.some((capability) => capability.includes(token))) { score += 80; reasons.add(`能力声明包含：${token}`); } // 第66天：能力声明部分匹配获得高权重。
      if (tags.includes(token)) { score += 70; reasons.add(`标签命中：${token}`); } // 第66天：标签完全匹配获得较高权重。
      else if (tags.some((tag) => tag.includes(token))) { score += 55; reasons.add(`标签包含：${token}`); } // 第66天：标签部分匹配获得中高权重。
      if (name === token) { score += 65; reasons.add(`名称命中：${token}`); } // 第66天：名称完全匹配获得较高权重。
      else if (name.includes(token)) { score += 45; reasons.add(`名称包含：${token}`); } // 第66天：名称部分匹配获得中等权重。
      if (description.includes(token)) { score += 35; reasons.add(`描述包含：${token}`); } // 第66天：描述命中提供补充相关度。
      if (normalize(item.type) === token || normalize(item.version) === token) { score += 20; reasons.add(`类型或版本命中：${token}`); } // 第66天：类型或版本匹配提供基础相关度。
      if (score === 0 && document.includes(token)) { score += 15; reasons.add(`元数据命中：${token}`); } // 第66天：其他嵌套元数据命中作为兜底发现信号。
    } // 第66天：结束查询关键词逐项评分。
    return score > 0 ? { item: cloneRegistryItem(item), score, reasons: Array.from(reasons) } : null; // 第66天：只返回有实际命中的可解释能力发现结果。
  } // 第66天：结束单注册项能力相关度评分函数。
} // 第66天：结束 UnifiedRegistry（统一注册中心）实现。
