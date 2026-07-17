import type { SecretCategory, SecretMetadata, SecretProvider, SecretSetInput, SecretSource } from "@/lib/secrets/secret-types"; // 第63天：引入密钥分类、元数据和 Provider 类型。

type EnvSecretMapping = { // 第63天：定义环境变量密钥映射结构。
  key: string; // 第63天：保存环境变量名称，同时也是密钥名称。
  category: SecretCategory; // 第63天：保存该环境变量密钥所属分类。
}; // 第63天：结束 EnvSecretMapping 类型定义。

const ENV_SECRET_MAPPINGS: EnvSecretMapping[] = [ // 第63天：定义支持从环境变量读取的敏感凭证列表。
  { key: "OPENAI_API_KEY", category: "model" }, // 第63天：映射 OpenAI API Key。
  { key: "ANTHROPIC_API_KEY", category: "model" }, // 第63天：映射 Anthropic API Key。
  { key: "DEEPSEEK_API_KEY", category: "model" }, // 第63天：映射 DeepSeek API Key。
  { key: "XIAOMI_MIMO_API_KEY", category: "model" }, // 第63天：映射小米 MiMo API Key。
  { key: "REDIS_PASSWORD", category: "redis" }, // 第63天：映射 Redis 密码。
  { key: "MYSQL_PASSWORD", category: "database" }, // 第63天：映射 MySQL 密码。
  { key: "MINIO_ACCESS_KEY", category: "storage" }, // 第63天：映射 MinIO Access Key。
  { key: "MINIO_SECRET_KEY", category: "storage" }, // 第63天：映射 MinIO Secret Key。
  { key: "WEBHOOK_SECRET", category: "auth" }, // 第63天：映射 Webhook 签名密钥。
  { key: "JWT_SECRET", category: "auth" }, // 第63天：映射 JWT 签名密钥。
  { key: "OAUTH_CLIENT_SECRET", category: "auth" }, // 第63天：映射 OAuth 客户端密钥。
]; // 第63天：结束环境变量密钥映射列表。

export class EnvSecretProvider implements SecretProvider { // 第63天：定义环境变量密钥 Provider。
  readonly source: SecretSource = "env"; // 第63天：声明当前 Provider 来源为 env。

  async get(key: string): Promise<string | undefined> { // 第63天：异步读取环境变量密钥。
    return this.getSync(key); // 第63天：复用同步读取逻辑。
  } // 第63天：结束 get 方法。

  getSync(key: string): string | undefined { // 第63天：同步读取环境变量密钥。
    const value = process.env[key]; // 第63天：从 Node 进程环境变量中读取密钥值。
    return value === undefined || value === "" || !this.isKnownKey(key) ? undefined : value; // 第63天：只返回已登记且非空的密钥值。
  } // 第63天：结束 getSync 方法。

  async set(_input: SecretSetInput): Promise<void> { // 第63天：环境变量 Provider 不允许运行时写入。
    void _input; // 第63天：显式消费参数，避免 lint 报告未使用。
    throw new Error("EnvSecretProvider 不支持 set，请通过 MemorySecretProvider 或真实 Vault 写入密钥。"); // 第63天：提示调用方改用可写 Provider。
  } // 第63天：结束 set 方法。

  async delete(key: string): Promise<boolean> { // 第63天：环境变量 Provider 不允许运行时删除。
    void key; // 第63天：显式消费参数，避免 lint 报告未使用。
    return false; // 第63天：返回 false 表示没有删除任何环境变量。
  } // 第63天：结束 delete 方法。

  async exists(key: string): Promise<boolean> { // 第63天：判断环境变量密钥是否存在。
    return this.getSync(key) !== undefined; // 第63天：复用同步读取逻辑。
  } // 第63天：结束 exists 方法。

  async listKeys(): Promise<string[]> { // 第63天：列出已设置的环境变量密钥名称。
    return ENV_SECRET_MAPPINGS.map((mapping) => mapping.key).filter((key) => this.getSync(key) !== undefined).sort(); // 第63天：只返回存在且非空的 key。
  } // 第63天：结束 listKeys 方法。

  async metadata(key: string): Promise<SecretMetadata | undefined> { // 第63天：读取单个环境变量密钥的脱敏元数据。
    const mapping = ENV_SECRET_MAPPINGS.find((item) => item.key === key); // 第63天：查找该 key 对应的分类。
    if (!mapping || this.getSync(key) === undefined) return undefined; // 第63天：未登记或未设置时不返回元数据。
    return buildEnvMetadata(mapping, this.source); // 第63天：返回不含真实值的环境变量密钥元数据。
  } // 第63天：结束 metadata 方法。

  async listMetadata(): Promise<SecretMetadata[]> { // 第63天：列出所有已设置环境变量密钥的脱敏元数据。
    const keys = await this.listKeys(); // 第63天：先读取所有可见密钥名称。
    const rows = await Promise.all(keys.map((key) => this.metadata(key))); // 第63天：逐个转换为脱敏元数据。
    return rows.filter((row): row is SecretMetadata => Boolean(row)); // 第63天：过滤不存在的元数据。
  } // 第63天：结束 listMetadata 方法。

  private isKnownKey(key: string): boolean { // 第63天：判断某个 key 是否登记为密钥环境变量。
    return ENV_SECRET_MAPPINGS.some((mapping) => mapping.key === key); // 第63天：命中映射列表才允许读取。
  } // 第63天：结束 isKnownKey 方法。
} // 第63天：结束 EnvSecretProvider 类。

function buildEnvMetadata(mapping: EnvSecretMapping, source: SecretSource): SecretMetadata { // 第63天：定义环境变量元数据构造函数。
  return { id: `env-${mapping.key}`, key: mapping.key, category: mapping.category, encrypted: false, createdAt: 0, updatedAt: 0, source, maskedValue: "************" }; // 第63天：环境变量值不由应用加密保存，因此只返回脱敏占位元数据。
} // 第63天：结束 buildEnvMetadata 函数。
