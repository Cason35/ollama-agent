import type { ConfigItem, ConfigProvider, ConfigSetInput, ConfigSource } from "@/lib/config/config-types"; // 第62天：引入配置项、Provider 接口和写入输入类型。
export class MemoryConfigProvider implements ConfigProvider { // 第62天：定义内存配置 Provider，可模拟 default 或 database 配置来源。
  readonly source: ConfigSource; // 第62天：保存当前 Provider 的来源名称。
  private readonly items = new Map<string, ConfigItem>(); // 第62天：使用 Map 保存配置项，便于按 key 覆盖。
  constructor(source: ConfigSource, initialItems: ConfigItem[] = []) { // 第62天：构造 Provider 时允许传入来源和初始配置项。
    this.source = source; // 第62天：记录 Provider 来源。
    for (const item of initialItems) this.items.set(item.key, { ...item, source }); // 第62天：把初始配置项写入 Map，并统一修正来源。
  } // 第62天：结束构造函数。
  get<T = unknown>(key: string): T | undefined { // 第62天：按 key 读取配置值。
    return this.items.get(key)?.value as T | undefined; // 第62天：命中则返回 value，否则返回 undefined。
  } // 第62天：结束 get 方法。
  async set<T = unknown>(input: ConfigSetInput<T>): Promise<void> { // 第62天：写入或覆盖单个配置项。
    this.items.set(input.key, { ...input, source: this.source, updatedAt: Date.now() }); // 第62天：保存带来源和更新时间的配置项。
  } // 第62天：结束 set 方法。
  has(key: string): boolean { // 第62天：判断当前 Provider 是否持有配置键。
    return this.items.has(key); // 第62天：直接返回 Map 命中结果。
  } // 第62天：结束 has 方法。
  list(): ConfigItem[] { // 第62天：列出当前 Provider 的全部配置项。
    return Array.from(this.items.values()).sort((a, b) => a.key.localeCompare(b.key)); // 第62天：返回按 key 排序的配置项副本。
  } // 第62天：结束 list 方法。
  async reload(): Promise<void> { // 第62天：内存 Provider 无外部数据源，reload 保持当前状态。
    return undefined; // 第62天：返回空 Promise，保持 Provider 接口一致。
  } // 第62天：结束 reload 方法。
  async delete(key: string): Promise<boolean> { // 第62天：删除单个配置覆盖值，用于 Reset 回退优先级。
    return this.items.delete(key); // 第62天：返回是否删除成功。
  } // 第62天：结束 delete 方法。
  async reset(): Promise<void> { // 第62天：清空当前 Provider 的全部配置项。
    this.items.clear(); // 第62天：清空内存 Map。
  } // 第62天：结束 reset 方法。
} // 第62天：结束 MemoryConfigProvider 类。
