export const REGISTRY_ITEM_TYPES = ["agent", "tool", "model", "prompt", "memory", "knowledge", "workflow", "evaluation"] as const; // 第69天：扩展统一注册中心以支持生产知识能力类型。

export type RegistryItemType = (typeof REGISTRY_ITEM_TYPES)[number]; // 第66天：从能力类型常量推导注册项类型联合。

export type RegistryItem = { // 第66天：定义所有可插拔能力共用的统一注册项结构。
  id: string; // 第66天：保存跨类型唯一的注册项标识。
  name: string; // 第66天：保存用于展示和搜索的能力名称。
  type: RegistryItemType; // 第66天：标记能力属于智能体、工具、模型或其他注册类别。
  version: string; // 第66天：保存能力版本并用于冲突检测与版本统计。
  metadata: Record<string, unknown>; // 第66天：保存描述、标签、能力声明和运行特征等扩展元数据。
  enabled: boolean; // 第66天：标记能力当前是否允许被能力发现流程返回。
  createdAt: number; // 第66天：保存能力首次创建时间戳用于排序和审计。
}; // 第66天：结束统一注册项结构定义。

export interface RegistryProvider { // 第66天：定义与具体存储实现无关的统一注册提供者协议。
  register(item: RegistryItem): void | Promise<void>; // 第66天：声明注册一项新能力的方法。
  unregister(id: string): void | Promise<void>; // 第66天：声明按唯一标识注销能力的方法。
  get(id: string): RegistryItem | undefined | Promise<RegistryItem | undefined>; // 第66天：声明按唯一标识读取能力的方法。
  list(type?: RegistryItemType): RegistryItem[] | Promise<RegistryItem[]>; // 第66天：声明列出全部或指定类型能力的方法。
  search(query: string): RegistryItem[] | Promise<RegistryItem[]>; // 第66天：声明跨名称、版本和元数据搜索能力的方法。
} // 第66天：结束统一注册提供者协议定义。

export type RegistryMetrics = { // 第66天：定义统一注册中心规模、启用状态和版本复杂度指标。
  totalItems: number; // 第66天：记录全部注册项数量。
  agentCount: number; // 第66天：记录智能体注册项数量。
  toolCount: number; // 第66天：记录工具注册项数量。
  modelCount: number; // 第66天：记录模型注册项数量。
  promptCount: number; // 第66天：记录提示词注册项数量。
  knowledgeCount: number; // 第69天：记录生产知识服务、策略、解析器和引用格式化器数量。
  enabledCount: number; // 第66天：记录当前启用的注册项数量。
  versionCount: number; // 第66天：记录去重后的版本数量。
  disabledCount: number; // 第66天：记录当前被禁用的注册项数量。
  typeDistribution: Record<RegistryItemType, number>; // 第66天：记录七种能力类型各自的注册数量。
}; // 第66天：结束统一注册指标结构定义。

export type CapabilityDiscoveryResult = { // 第66天：定义一次能力发现命中的排序结果结构。
  item: RegistryItem; // 第66天：保存命中的已启用注册项。
  score: number; // 第66天：保存名称、标签和能力元数据综合计算的相关度分数。
  reasons: string[]; // 第66天：保存命中名称、标签或能力声明等可解释原因。
}; // 第66天：结束能力发现结果结构定义。

export type RegistrySnapshot = { // 第66天：定义 Registry Explorer 和测试共用的注册中心快照结构。
  items: RegistryItem[]; // 第66天：保存当前过滤条件下可展示的注册项。
  discoveries: CapabilityDiscoveryResult[]; // 第66天：保存当前能力查询的已启用命中结果。
  metrics: RegistryMetrics; // 第66天：保存全局统一注册指标。
  filters: { type: RegistryItemType | "all"; query: string; includeDisabled: boolean }; // 第66天：回显服务端实际使用的类型、查询词和禁用项过滤条件。
  generatedAt: number; // 第66天：保存快照生成时间戳。
}; // 第66天：结束统一注册中心快照结构定义。
