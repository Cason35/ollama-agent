import { CONFIG_SCHEMAS } from "@/lib/config/config-defaults"; // 第62天：引入配置 Schema 列表，用于校验与类型转换。
import type { ConfigCategory, ConfigChangeEvent, ConfigChangeListener, ConfigItem, ConfigMetrics, ConfigProvider, ConfigSchema, ConfigSnapshot, ConfigValidationError, ConfigValueType } from "@/lib/config/config-types"; // 第62天：引入配置中心核心类型。
const CATEGORY_ORDER: Record<ConfigCategory, number> = { model: 1, prompt: 2, runtime: 3, database: 4, redis: 5, storage: 6, feature: 7 }; // 第62天：定义 Config Explorer 展示分类顺序。
export class ConfigManager { // 第62天：定义配置管理器，统一合并、校验、读取和热更新配置。
  private items = new Map<string, ConfigItem>(); // 第62天：保存最终合并后的运行时配置。
  private validationErrors: ConfigValidationError[] = []; // 第62天：保存最近一次配置校验错误。
  private readonly listeners = new Set<ConfigChangeListener>(); // 第62天：保存观察者回调集合，用于 Hot Reload。
  private version = 1; // 第62天：保存配置版本号，配置变化时递增。
  private hotReloadCount = 0; // 第62天：保存热更新触发次数。
  constructor(private readonly providers: ConfigProvider[], private readonly databaseProvider: ConfigProvider) { // 第62天：通过 Provider 列表和数据库 Provider 构造管理器。
    this.mergeProviders(); // 第62天：构造时执行一次同步合并，保证首次读取有配置。
    this.validationErrors = this.validate(); // 第62天：构造时执行一次配置校验。
  } // 第62天：结束构造函数。
  get<T = unknown>(key: string, fallback?: T): T { // 第62天：按 key 读取最终生效配置值。
    const value = this.items.get(key)?.value; // 第62天：从合并结果中读取配置值。
    return (value === undefined ? fallback : value) as T; // 第62天：未命中时返回调用方给定兜底值。
  } // 第62天：结束 get 方法。
  getString(key: string, fallback = ""): string { // 第62天：按字符串类型读取配置值。
    const value = this.get<unknown>(key, fallback); // 第62天：读取原始配置值。
    return typeof value === "string" ? value : String(value ?? fallback); // 第62天：把非字符串值安全转换为字符串。
  } // 第62天：结束 getString 方法。
  getNumber(key: string, fallback = 0): number { // 第62天：按数字类型读取配置值。
    const value = this.get<unknown>(key, fallback); // 第62天：读取原始配置值。
    const numberValue = typeof value === "number" ? value : Number(value); // 第62天：把字符串数字转换为 number。
    return Number.isFinite(numberValue) ? numberValue : fallback; // 第62天：非法数字时返回兜底值。
  } // 第62天：结束 getNumber 方法。
  getBoolean(key: string, fallback = false): boolean { // 第62天：按布尔类型读取配置值。
    const value = this.get<unknown>(key, fallback); // 第62天：读取原始配置值。
    if (typeof value === "boolean") return value; // 第62天：布尔值直接返回。
    if (typeof value === "string") return value === "true" || value === "1" || value.toLowerCase() === "yes"; // 第62天：字符串布尔值兼容 true、1 和 yes。
    return Boolean(value); // 第62天：其他类型按 JavaScript 真值规则转换。
  } // 第62天：结束 getBoolean 方法。
  list(): ConfigItem[] { // 第62天：列出最终合并后的配置项。
    return sortItems(Array.from(this.items.values())); // 第62天：按分类和 key 排序返回。
  } // 第62天：结束 list 方法。
  snapshot(): ConfigSnapshot { // 第62天：读取 Config Explorer 使用的完整快照。
    return { items: this.list(), metrics: this.metrics(), validationErrors: this.validationErrors, version: this.version }; // 第62天：返回配置项、指标、校验错误和版本号。
  } // 第62天：结束 snapshot 方法。
  metrics(): ConfigMetrics { // 第62天：读取配置中心指标。
    const envConfigs = this.providers.find((provider) => provider.source === "env")?.list().length ?? 0; // 第62天：统计环境变量配置数量。
    const dbConfigs = this.databaseProvider.list().length; // 第62天：统计数据库配置数量。
    return { totalConfigs: this.items.size, envConfigs, dbConfigs, hotReloadCount: this.hotReloadCount, validationErrors: this.validationErrors.length }; // 第62天：返回指标快照。
  } // 第62天：结束 metrics 方法。
  async set(key: string, rawValue: unknown): Promise<ConfigItem> { // 第62天：通过数据库 Provider 写入运行时覆盖配置。
    const schema = this.schemaFor(key); // 第62天：读取配置键对应的 Schema。
    const current = this.items.get(key); // 第62天：读取当前生效配置项。
    if (current && !current.editable) throw new Error(`配置 ${key} 不允许在 Config Explorer 中编辑。`); // 第62天：禁止编辑敏感或只读配置。
    const value = this.coerceValue(rawValue, schema.type); // 第62天：按 Schema 类型转换输入值。
    await this.databaseProvider.set({ key, value, category: schema.category, description: schema.description, editable: schema.editable }); // 第62天：写入数据库 Provider 覆盖值。
    await this.reload(key); // 第62天：重新合并配置并通知观察者。
    return this.items.get(key) as ConfigItem; // 第62天：返回写入后的最终生效配置项。
  } // 第62天：结束 set 方法。
  async reset(key: string): Promise<boolean> { // 第62天：删除数据库覆盖值，让配置回退到 env 或 default。
    const deleted = this.databaseProvider.delete ? await this.databaseProvider.delete(key) : false; // 第62天：调用数据库 Provider 的可选 delete 能力。
    await this.reload(key); // 第62天：重新合并配置并通知观察者。
    return deleted; // 第62天：返回是否实际删除了覆盖值。
  } // 第62天：结束 reset 方法。
  async resetDatabaseOverrides(): Promise<void> { // 第62天：清空所有数据库覆盖配置，主要用于测试。
    if (this.databaseProvider.reset) await this.databaseProvider.reset(); // 第62天：如果 Provider 支持 reset 就清空它。
    await this.reload(); // 第62天：重新合并配置并通知观察者。
  } // 第62天：结束 resetDatabaseOverrides 方法。
  async reload(changedKey?: string): Promise<ConfigSnapshot> { // 第62天：重新加载所有 Provider 并触发热更新通知。
    for (const provider of this.providers) await provider.reload(); // 第62天：按 Provider 顺序刷新数据源。
    this.mergeProviders(); // 第62天：按 default -> env -> database 优先级重新合并。
    this.validationErrors = this.validate(); // 第62天：重新执行配置校验。
    this.version += 1; // 第62天：配置版本号递增。
    this.hotReloadCount += 1; // 第62天：热更新次数递增。
    this.emit({ key: changedKey, item: changedKey ? this.items.get(changedKey) : undefined, version: this.version }); // 第62天：通知所有观察者配置已变化。
    return this.snapshot(); // 第62天：返回最新快照。
  } // 第62天：结束 reload 方法。
  subscribe(listener: ConfigChangeListener): () => void { // 第62天：注册配置热更新观察者。
    this.listeners.add(listener); // 第62天：把回调加入观察者集合。
    return () => this.listeners.delete(listener); // 第62天：返回取消订阅函数。
  } // 第62天：结束 subscribe 方法。
  coerceValueForKey(key: string, rawValue: unknown): unknown { // 第62天：给 API 和测试脚本暴露按 key 转换值的工具。
    return this.coerceValue(rawValue, this.schemaFor(key).type); // 第62天：读取 Schema 并执行类型转换。
  } // 第62天：结束 coerceValueForKey 方法。
  schemaFor(key: string): ConfigSchema { // 第62天：按 key 读取配置 Schema。
    const schema = CONFIG_SCHEMAS.find((item) => item.key === key); // 第62天：从 Schema 列表中查找。
    if (!schema) throw new Error(`未知配置项：${key}`); // 第62天：未知配置禁止写入，避免随意扩散配置键。
    return schema; // 第62天：返回命中的 Schema。
  } // 第62天：结束 schemaFor 方法。
  private mergeProviders(): void { // 第62天：按 Provider 顺序合并配置。
    const next = new Map<string, ConfigItem>(); // 第62天：创建新的合并结果 Map。
    for (const provider of this.providers) { // 第62天：依次遍历 default、env、database Provider。
      for (const item of provider.list()) next.set(item.key, item); // 第62天：后出现的 Provider 覆盖前面的配置项。
    } // 第62天：结束 Provider 遍历。
    this.items = next; // 第62天：一次性替换最终配置。
  } // 第62天：结束 mergeProviders 方法。
  private validate(): ConfigValidationError[] { // 第62天：校验最终配置完整性和类型。
    const errors: ConfigValidationError[] = []; // 第62天：创建错误列表。
    for (const schema of CONFIG_SCHEMAS) { // 第62天：遍历所有 Schema。
      const item = this.items.get(schema.key); // 第62天：读取对应配置项。
      if (!item && schema.required) errors.push({ key: schema.key, message: "缺少必填配置。" }); // 第62天：必填项缺失时报错。
      if (item && !this.matchesType(item.value, schema.type)) errors.push({ key: schema.key, message: `配置类型错误，应为 ${schema.type}。` }); // 第62天：类型不匹配时报错。
    } // 第62天：结束 Schema 遍历。
    return errors; // 第62天：返回校验错误列表。
  } // 第62天：结束 validate 方法。
  private matchesType(value: unknown, type: ConfigValueType): boolean { // 第62天：判断配置值是否满足 Schema 类型。
    if (type === "number") return typeof value === "number" && Number.isFinite(value); // 第62天：数字类型必须是有限 number。
    if (type === "boolean") return typeof value === "boolean"; // 第62天：布尔类型必须是 boolean。
    return typeof value === "string"; // 第62天：字符串类型必须是 string。
  } // 第62天：结束 matchesType 方法。
  private coerceValue(value: unknown, type: ConfigValueType): string | number | boolean { // 第62天：把 API 输入值转换成 Schema 类型。
    if (type === "number") return this.coerceNumber(value); // 第62天：数字配置走数字转换。
    if (type === "boolean") return this.coerceBoolean(value); // 第62天：布尔配置走布尔转换。
    return String(value ?? ""); // 第62天：字符串配置把空值规整为空字符串。
  } // 第62天：结束 coerceValue 方法。
  private coerceNumber(value: unknown): number { // 第62天：把输入转换成有效数字。
    const numberValue = typeof value === "number" ? value : Number(value); // 第62天：兼容字符串数字。
    if (!Number.isFinite(numberValue)) throw new Error("配置值必须是有效数字。"); // 第62天：非法数字直接抛错。
    return numberValue; // 第62天：返回有效数字。
  } // 第62天：结束 coerceNumber 方法。
  private coerceBoolean(value: unknown): boolean { // 第62天：把输入转换成布尔值。
    if (typeof value === "boolean") return value; // 第62天：布尔值直接返回。
    if (typeof value === "string") return value === "true" || value === "1" || value.toLowerCase() === "yes"; // 第62天：字符串兼容 true、1 和 yes。
    return Boolean(value); // 第62天：其他类型按真值规则转换。
  } // 第62天：结束 coerceBoolean 方法。
  private emit(event: ConfigChangeEvent): void { // 第62天：通知所有配置观察者。
    if (!this.getBoolean("feature.enableHotReload", true)) return; // 第62天：热更新开关关闭时不通知订阅者。
    for (const listener of this.listeners) listener(event); // 第62天：逐个触发观察者回调。
  } // 第62天：结束 emit 方法。
} // 第62天：结束 ConfigManager 类。
function sortItems(items: ConfigItem[]): ConfigItem[] { // 第62天：定义配置项排序工具。
  return [...items].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.key.localeCompare(b.key)); // 第62天：先按分类排序，再按 key 排序。
} // 第62天：结束排序工具函数。
