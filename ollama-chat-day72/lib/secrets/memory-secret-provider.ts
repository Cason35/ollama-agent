import { decryptSecretValue, encryptSecretValue } from "@/lib/secrets/secret-crypto"; // 第63天：引入密钥加密与解密工具。
import type { SecretMetadata, SecretProvider, SecretSetInput, SecretSource } from "@/lib/secrets/secret-types"; // 第63天：引入密钥 Provider 与元数据类型。

type StoredSecret = SecretMetadata & { // 第63天：定义内存中保存的密钥结构，继承可脱敏展示的元数据。
  encryptedValue: string; // 第63天：保存加密后的真实密钥值，不保存明文。
}; // 第63天：结束 StoredSecret 类型定义。

export class MemorySecretProvider implements SecretProvider { // 第63天：定义内存密钥 Provider，用于模拟数据库或 Vault 写入层。
  readonly source: SecretSource = "memory"; // 第63天：声明当前 Provider 来源为 memory。
  private readonly items = new Map<string, StoredSecret>(); // 第63天：使用 Map 按 key 保存加密密钥。

  async get(key: string): Promise<string | undefined> { // 第63天：异步读取真实密钥值。
    return this.getSync(key); // 第63天：复用同步读取逻辑，保持接口一致。
  } // 第63天：结束 get 方法。

  getSync(key: string): string | undefined { // 第63天：同步读取真实密钥值，供同步初始化场景使用。
    const item = this.items.get(key); // 第63天：从内存 Map 读取加密密钥项。
    if (!item || isExpired(item.expiresAt)) return undefined; // 第63天：不存在或已过期时不返回密钥。
    return decryptSecretValue(item.encryptedValue); // 第63天：解密后返回真实密钥值。
  } // 第63天：结束 getSync 方法。

  async set(input: SecretSetInput): Promise<void> { // 第63天：写入或覆盖单个密钥。
    const now = Date.now(); // 第63天：记录本次写入时间。
    const existing = this.items.get(input.key); // 第63天：读取已有密钥项，用于保留创建时间或旧版本信息。
    const id = !existing || input.forceNewVersion ? createSecretId(input.key) : existing.id; // 第63天：首次写入或轮换时生成新版本 ID。
    const createdAt = !existing || input.forceNewVersion ? now : existing.createdAt; // 第63天：轮换视为新版本创建，普通覆盖保留创建时间。
    this.items.set(input.key, { id, key: input.key, category: input.category, encrypted: true, createdAt, updatedAt: now, source: this.source, expiresAt: input.expiresAt, maskedValue: maskPlaceholder(), encryptedValue: encryptSecretValue(input.value) }); // 第63天：只保存密文和脱敏元数据。
  } // 第63天：结束 set 方法。

  async delete(key: string): Promise<boolean> { // 第63天：删除单个内存密钥。
    return this.items.delete(key); // 第63天：返回 Map 删除结果。
  } // 第63天：结束 delete 方法。

  async exists(key: string): Promise<boolean> { // 第63天：判断密钥是否存在且未过期。
    return this.getSync(key) !== undefined; // 第63天：复用读取逻辑，过期密钥视为不可用。
  } // 第63天：结束 exists 方法。

  async listKeys(): Promise<string[]> { // 第63天：列出密钥名称，不返回任何真实密钥值。
    return Array.from(this.items.keys()).sort(); // 第63天：返回按字典序排序的 key 列表。
  } // 第63天：结束 listKeys 方法。

  async metadata(key: string): Promise<SecretMetadata | undefined> { // 第63天：读取单个密钥的脱敏元数据。
    const item = this.items.get(key); // 第63天：从 Map 中读取密钥项。
    return item ? stripValue(item) : undefined; // 第63天：存在时移除加密值后返回。
  } // 第63天：结束 metadata 方法。

  async listMetadata(): Promise<SecretMetadata[]> { // 第63天：列出所有脱敏元数据。
    return Array.from(this.items.values()).map(stripValue).sort((a, b) => a.key.localeCompare(b.key)); // 第63天：移除密文后按 key 排序返回。
  } // 第63天：结束 listMetadata 方法。

  async reset(): Promise<void> { // 第63天：清空内存密钥库，主要供测试脚本使用。
    this.items.clear(); // 第63天：清空 Map 中的所有密钥。
  } // 第63天：结束 reset 方法。

  debugReadEncryptedValue(key: string): string | undefined { // 第63天：测试专用方法，用于验证保存值确实为密文。
    return this.items.get(key)?.encryptedValue; // 第63天：返回密文而不是明文。
  } // 第63天：结束 debugReadEncryptedValue 方法。
} // 第63天：结束 MemorySecretProvider 类。

function stripValue(item: StoredSecret): SecretMetadata { // 第63天：定义移除密文并返回元数据的工具函数。
  const { encryptedValue: _encryptedValue, ...metadata } = item; // 第63天：通过解构剔除加密值字段。
  void _encryptedValue; // 第63天：显式消费变量，避免 lint 误判。
  return metadata; // 第63天：返回不含 value 和 encryptedValue 的安全元数据。
} // 第63天：结束 stripValue 函数。

function createSecretId(key: string): string { // 第63天：定义生成密钥版本 ID 的工具函数。
  return `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; // 第63天：组合 key、时间戳和随机串生成可读 ID。
} // 第63天：结束 createSecretId 函数。

function isExpired(expiresAt?: number): boolean { // 第63天：定义判断密钥是否过期的工具函数。
  return typeof expiresAt === "number" && expiresAt <= Date.now(); // 第63天：过期时间存在且不晚于当前时间即视为过期。
} // 第63天：结束 isExpired 函数。

function maskPlaceholder(): string { // 第63天：定义统一脱敏占位符函数。
  return "************"; // 第63天：永远返回固定掩码，不泄露长度信息。
} // 第63天：结束 maskPlaceholder 函数。
