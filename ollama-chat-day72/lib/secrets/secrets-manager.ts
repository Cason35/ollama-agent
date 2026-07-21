import type { SecretCategory, SecretMetadata, SecretProvider, SecretRotationRecord, SecretSetInput, SecretsMetrics, SecretsSnapshot } from "@/lib/secrets/secret-types"; // 第63天：引入密钥管理核心类型。

export class SecretsManager { // 第63天：定义密钥管理器，作为 Secret 世界的统一入口。
  private rotateCount = 0; // 第63天：记录密钥轮换次数。
  private accessCount = 0; // 第63天：记录密钥读取次数。
  private readonly rotationHistory: SecretRotationRecord[] = []; // 第63天：保存密钥轮换历史。

  constructor(private readonly providers: SecretProvider[], private readonly writableProvider: SecretProvider) {} // 第63天：通过 Provider 列表和可写 Provider 构造管理器。

  async get(key: string): Promise<string | undefined> { // 第63天：按密钥名称读取真实密钥值。
    this.accessCount += 1; // 第63天：每次读取都累计访问次数。
    for (const provider of [...this.providers].reverse()) { // 第63天：按高优先级到低优先级查找，运行时写入覆盖环境变量。
      const value = await provider.get(key); // 第63天：从当前 Provider 读取密钥。
      if (value !== undefined) return value; // 第63天：命中后立即返回真实密钥。
    } // 第63天：结束 Provider 遍历。
    return undefined; // 第63天：全部未命中时返回 undefined。
  } // 第63天：结束 get 方法。

  getSync(key: string): string | undefined { // 第63天：同步读取真实密钥值，供连接池等同步场景使用。
    this.accessCount += 1; // 第63天：同步读取同样累计访问次数。
    for (const provider of [...this.providers].reverse()) { // 第63天：按高优先级到低优先级查找。
      const value = provider.getSync?.(key); // 第63天：只调用支持同步读取的 Provider。
      if (value !== undefined) return value; // 第63天：命中后立即返回真实密钥。
    } // 第63天：结束 Provider 遍历。
    return undefined; // 第63天：全部未命中时返回 undefined。
  } // 第63天：结束 getSync 方法。

  async set(input: SecretSetInput): Promise<SecretMetadata> { // 第63天：写入或覆盖单个密钥。
    validateSecretInput(input); // 第63天：校验 key 和 value，避免写入空密钥。
    await this.writableProvider.set(input); // 第63天：真实写入只落到可写 Provider。
    const metadata = await this.writableProvider.metadata?.(input.key); // 第63天：读取写入后的脱敏元数据。
    if (!metadata) throw new Error(`密钥 ${input.key} 写入后无法读取元数据。`); // 第63天：元数据缺失时抛出明确错误。
    return metadata; // 第63天：返回安全元数据给 API 或测试脚本。
  } // 第63天：结束 set 方法。

  async rotateSecret(key: string, value: string, category?: SecretCategory): Promise<SecretRotationRecord> { // 第63天：轮换指定密钥的新值。
    if (!key.trim()) throw new Error("缺少密钥 key。"); // 第63天：校验 key 必填。
    if (!value.trim()) throw new Error("轮换密钥的新值不能为空。"); // 第63天：校验新值必填。
    const before = await this.metadataFor(key); // 第63天：读取轮换前的脱敏元数据。
    const nextCategory = category ?? before?.category ?? inferCategory(key); // 第63天：优先使用显式分类，其次沿用旧分类，最后按 key 推断。
    const after = await this.set({ key, value, category: nextCategory, forceNewVersion: true }); // 第63天：强制写入新版本密钥。
    const record: SecretRotationRecord = { key, rotatedAt: Date.now(), oldVersionId: before?.id, newVersionId: after.id }; // 第63天：生成轮换历史记录。
    this.rotateCount += 1; // 第63天：累计轮换次数。
    this.rotationHistory.unshift(record); // 第63天：把最新轮换记录放在列表前面。
    this.rotationHistory.splice(20); // 第63天：只保留最近 20 条轮换历史，避免内存无限增长。
    return record; // 第63天：返回轮换记录。
  } // 第63天：结束 rotateSecret 方法。

  async delete(key: string): Promise<boolean> { // 第63天：删除运行时可写密钥。
    if (!key.trim()) throw new Error("缺少密钥 key。"); // 第63天：校验 key 必填。
    return this.writableProvider.delete(key); // 第63天：只删除可写 Provider 中的密钥，不删除系统环境变量。
  } // 第63天：结束 delete 方法。

  async exists(key: string): Promise<boolean> { // 第63天：判断密钥是否存在。
    for (const provider of [...this.providers].reverse()) { // 第63天：按优先级遍历所有 Provider。
      if (await provider.exists(key)) return true; // 第63天：任一 Provider 命中即返回 true。
    } // 第63天：结束 Provider 遍历。
    return false; // 第63天：全部未命中时返回 false。
  } // 第63天：结束 exists 方法。

  async listKeys(): Promise<string[]> { // 第63天：列出所有可见密钥名称。
    const keys = await Promise.all(this.providers.map((provider) => provider.listKeys())); // 第63天：从所有 Provider 收集 key 列表。
    return Array.from(new Set(keys.flat())).sort(); // 第63天：合并去重并排序。
  } // 第63天：结束 listKeys 方法。

  async snapshot(): Promise<SecretsSnapshot> { // 第63天：读取 Secrets Explorer 使用的安全快照。
    const items = await this.listMetadata(); // 第63天：读取不含真实 value 的元数据列表。
    return { items, metrics: this.metricsFromItems(items), rotationHistory: [...this.rotationHistory] }; // 第63天：返回元数据、指标和轮换历史。
  } // 第63天：结束 snapshot 方法。

  async resetRuntimeSecrets(): Promise<void> { // 第63天：清空运行时写入密钥，主要供测试使用。
    if (this.writableProvider.reset) await this.writableProvider.reset(); // 第63天：可写 Provider 支持 reset 时执行清空。
    this.rotateCount = 0; // 第63天：重置轮换次数。
    this.accessCount = 0; // 第63天：重置访问次数。
    this.rotationHistory.splice(0); // 第63天：清空轮换历史。
  } // 第63天：结束 resetRuntimeSecrets 方法。

  private async listMetadata(): Promise<SecretMetadata[]> { // 第63天：汇总所有 Provider 的脱敏元数据。
    const merged = new Map<string, SecretMetadata>(); // 第63天：使用 Map 按 key 合并，后写入来源优先级更高。
    for (const provider of this.providers) { // 第63天：按低优先级到高优先级遍历 Provider。
      if (provider.listMetadata) { // 第63天：优先使用 Provider 的批量元数据能力。
        for (const item of await provider.listMetadata()) merged.set(item.key, item); // 第63天：写入脱敏元数据且覆盖低优先级来源。
      } else { // 第63天：没有批量能力时退回到 listKeys + metadata。
        for (const key of await provider.listKeys()) { // 第63天：逐个读取 key。
          const item = await provider.metadata?.(key); // 第63天：读取单个脱敏元数据。
          if (item) merged.set(item.key, item); // 第63天：存在元数据时写入合并结果。
        } // 第63天：结束 key 遍历。
      } // 第63天：结束元数据读取分支。
    } // 第63天：结束 Provider 遍历。
    return Array.from(merged.values()).sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key)); // 第63天：按分类和 key 排序返回。
  } // 第63天：结束 listMetadata 方法。

  private async metadataFor(key: string): Promise<SecretMetadata | undefined> { // 第63天：按优先级读取单个脱敏元数据。
    for (const provider of [...this.providers].reverse()) { // 第63天：从高优先级 Provider 开始查找。
      const item = await provider.metadata?.(key); // 第63天：读取当前 Provider 元数据。
      if (item) return item; // 第63天：命中后立即返回。
    } // 第63天：结束 Provider 遍历。
    return undefined; // 第63天：全部未命中时返回 undefined。
  } // 第63天：结束 metadataFor 方法。

  private metricsFromItems(items: SecretMetadata[]): SecretsMetrics { // 第63天：根据元数据计算密钥指标。
    const now = Date.now(); // 第63天：读取当前时间用于判断过期。
    return { totalSecrets: items.length, rotateCount: this.rotateCount, accessCount: this.accessCount, encryptedCount: items.filter((item) => item.encrypted).length, expiredSecrets: items.filter((item) => typeof item.expiresAt === "number" && item.expiresAt <= now).length }; // 第63天：返回完整指标快照。
  } // 第63天：结束 metricsFromItems 方法。
} // 第63天：结束 SecretsManager 类。

function validateSecretInput(input: SecretSetInput): void { // 第63天：定义密钥写入校验函数。
  if (!input.key.trim()) throw new Error("缺少密钥 key。"); // 第63天：禁止空 key。
  if (!input.value.trim()) throw new Error("密钥 value 不能为空。"); // 第63天：禁止空 value。
} // 第63天：结束 validateSecretInput 函数。

function inferCategory(key: string): SecretCategory { // 第63天：定义从密钥名称推断分类的工具函数。
  if (/MYSQL|DATABASE/i.test(key)) return "database"; // 第63天：数据库相关 key 归入 database。
  if (/MINIO|S3|STORAGE/i.test(key)) return "storage"; // 第63天：对象存储相关 key 归入 storage。
  if (/REDIS/i.test(key)) return "redis"; // 第63天：Redis 相关 key 归入 redis。
  if (/JWT|OAUTH|WEBHOOK|AUTH/i.test(key)) return "auth"; // 第63天：认证相关 key 归入 auth。
  return "model"; // 第63天：其他密钥默认归入 model。
} // 第63天：结束 inferCategory 函数。
