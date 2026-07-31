export type ConfigCategory = "model" | "prompt" | "runtime" | "database" | "redis" | "storage" | "feature"; // 第62天：定义配置分类枚举，覆盖模型、提示词、运行时、数据库、Redis、存储和功能开关。
export type ConfigSource = "default" | "env" | "database"; // 第62天：定义配置来源枚举，表达默认值、环境变量和数据库配置的优先级来源。
export type ConfigValueType = "string" | "number" | "boolean"; // 第62天：定义配置校验支持的基础值类型。
export type ConfigItem<T = unknown> = { // 第62天：定义统一配置项结构，供 ConfigProvider、ConfigManager、API 和前端共同使用。
  key: string; // 第62天：保存唯一配置键，例如 runtime.maxWorkers 或 model.default。
  value: T; // 第62天：保存真实配置值，类型由 schema 或调用方约束。
  category: ConfigCategory; // 第62天：保存配置分类，方便 Config Explorer 分组展示。
  description?: string; // 第62天：保存配置用途说明，帮助学习和排查。
  editable: boolean; // 第62天：标记前端是否允许直接修改该配置项。
  source: ConfigSource; // 第62天：保存最终生效值来自 default、env 还是 database。
  updatedAt: number; // 第62天：记录配置最近更新时间戳，用于热更新观察。
}; // 第62天：结束 ConfigItem 类型定义。
export type ConfigSchema = { // 第62天：定义配置结构约束，启动和热更新时用于校验配置完整性。
  key: string; // 第62天：保存需要校验的配置键。
  required: boolean; // 第62天：标记配置是否必须存在。
  type: ConfigValueType; // 第62天：声明配置值必须满足的基础类型。
  category: ConfigCategory; // 第62天：声明配置所属分类，便于自动补齐元数据。
  description: string; // 第62天：声明配置说明，便于 Explorer 展示。
  editable: boolean; // 第62天：声明配置是否允许通过配置中心写入覆盖值。
}; // 第62天：结束 ConfigSchema 类型定义。
export type ConfigMetrics = { // 第62天：定义配置中心指标结构，供 API 和 Config Explorer 展示。
  totalConfigs: number; // 第62天：记录最终合并后的配置总数。
  envConfigs: number; // 第62天：记录来自环境变量 Provider 的配置数量。
  dbConfigs: number; // 第62天：记录来自数据库 Provider 的配置数量。
  hotReloadCount: number; // 第62天：记录配置热更新触发次数。
  validationErrors: number; // 第62天：记录最近一次校验错误数量。
}; // 第62天：结束 ConfigMetrics 类型定义。
export type ConfigValidationError = { // 第62天：定义配置校验错误结构。
  key: string; // 第62天：保存发生错误的配置键。
  message: string; // 第62天：保存面向开发者的错误说明。
}; // 第62天：结束 ConfigValidationError 类型定义。
export type ConfigSetInput<T = unknown> = { // 第62天：定义 Provider 写入配置时使用的输入结构。
  key: string; // 第62天：保存待写入配置键。
  value: T; // 第62天：保存待写入配置值。
  category: ConfigCategory; // 第62天：保存待写入配置分类。
  description?: string; // 第62天：保存待写入配置说明。
  editable: boolean; // 第62天：保存待写入配置是否可编辑。
}; // 第62天：结束 ConfigSetInput 类型定义。
export interface ConfigProvider { // 第62天：定义配置提供者接口，后续可接入内存、环境变量和 MySQL。
  readonly source: ConfigSource; // 第62天：声明 Provider 对应的配置来源。
  get<T = unknown>(key: string): T | undefined; // 第62天：按键读取单个配置值。
  set<T = unknown>(input: ConfigSetInput<T>): Promise<void>; // 第62天：写入单个配置值，环境变量 Provider 可以选择拒绝。
  has(key: string): boolean; // 第62天：判断 Provider 是否包含某个配置键。
  list(): ConfigItem[]; // 第62天：列出 Provider 当前持有的所有配置项。
  reload(): Promise<void>; // 第62天：重新加载 Provider 数据，用于热更新。
  delete?(key: string): Promise<boolean>; // 第62天：可选删除能力，用于 Reset 恢复到更低优先级配置。
  reset?(): Promise<void>; // 第62天：可选重置能力，用于测试或清空数据库覆盖值。
}; // 第62天：结束 ConfigProvider 接口定义。
export type ConfigChangeEvent = { // 第62天：定义配置热更新事件结构。
  key?: string; // 第62天：保存发生变化的配置键，整批 reload 时可以为空。
  item?: ConfigItem; // 第62天：保存变化后的配置项快照。
  version: number; // 第62天：保存配置中心版本号，方便订阅者判断是否需要刷新。
}; // 第62天：结束 ConfigChangeEvent 类型定义。
export type ConfigChangeListener = (event: ConfigChangeEvent) => void; // 第62天：定义观察者回调类型，用于 Hot Reload 通知。
export type ConfigSnapshot = { // 第62天：定义 Config Explorer 和测试脚本使用的完整快照结构。
  items: ConfigItem[]; // 第62天：保存最终合并后的配置项列表。
  metrics: ConfigMetrics; // 第62天：保存配置中心指标。
  validationErrors: ConfigValidationError[]; // 第62天：保存最近一次配置校验错误列表。
  version: number; // 第62天：保存配置中心版本号。
}; // 第62天：结束 ConfigSnapshot 类型定义。
