import { CONFIG_SCHEMAS } from "@/lib/config/config-defaults"; // 第62天：引入配置 Schema，用于给环境变量配置补齐分类和说明。
import type { ConfigItem, ConfigProvider, ConfigSetInput, ConfigValueType } from "@/lib/config/config-types"; // 第62天：引入配置类型和 Provider 接口。
type EnvMapping = { envKey: string; configKey: string; type: ConfigValueType }; // 第62天：定义环境变量键到配置中心键的映射结构。
const ENV_MAPPINGS: EnvMapping[] = [ // 第62天：定义 Day62 支持读取的环境变量映射表。
  { envKey: "OLLAMA_MODEL", configKey: "model.default", type: "string" }, // 第62天：映射默认 Ollama 模型。
  { envKey: "OLLAMA_API_URL", configKey: "model.ollamaApiUrl", type: "string" }, // 第62天：映射 Ollama Chat API 地址。
  { envKey: "XIAOMI_MIMO_BASE_URL", configKey: "model.mimoBaseUrl", type: "string" }, // 第62天：映射 MiMo Base URL。
  { envKey: "MODEL_REQUEST_TIMEOUT_MS", configKey: "model.requestTimeoutMs", type: "number" }, // 第62天：映射模型请求超时。
  { envKey: "RAG_RECALL_K", configKey: "retrieval.recallK", type: "number" }, // 第62天：映射检索召回数量。
  { envKey: "RAG_TOP_K", configKey: "retrieval.topK", type: "number" }, // 第62天：映射检索返回数量。
  { envKey: "RAG_MIN_SCORE", configKey: "retrieval.minScore", type: "number" }, // 第62天：映射检索最低分阈值。
  { envKey: "RAG_MAX_QUERIES", configKey: "retrieval.maxQueries", type: "number" }, // 第62天：映射查询改写数量。
  { envKey: "RUNTIME_MAX_WORKERS", configKey: "runtime.maxWorkers", type: "number" }, // 第62天：映射 Worker 最大并发。
  { envKey: "JOB_TIMEOUT_MS", configKey: "runtime.jobTimeoutMs", type: "number" }, // 第62天：映射默认 Job 超时。
  { envKey: "MYSQL_HOST", configKey: "database.mysqlHost", type: "string" }, // 第62天：映射 MySQL 主机。
  { envKey: "MYSQL_PORT", configKey: "database.mysqlPort", type: "number" }, // 第62天：映射 MySQL 端口。
  { envKey: "MYSQL_DATABASE", configKey: "database.mysqlDatabase", type: "string" }, // 第62天：映射 MySQL 数据库名。
  { envKey: "REDIS_URL", configKey: "redis.url", type: "string" }, // 第62天：映射 Redis URL。
  { envKey: "REDIS_KEY_PREFIX", configKey: "redis.keyPrefix", type: "string" }, // 第62天：映射 Redis Key Prefix。
  { envKey: "REDIS_TIMEOUT_MS", configKey: "redis.timeoutMs", type: "number" }, // 第62天：映射 Redis 超时。
  { envKey: "QUEUE_VISIBILITY_TIMEOUT_MS", configKey: "redis.queueVisibilityTimeoutMs", type: "number" }, // 第62天：映射队列可见性超时。
  { envKey: "LOCK_TTL_MS", configKey: "redis.lockTtlMs", type: "number" }, // 第62天：映射分布式锁 TTL。
  { envKey: "OBJECT_STORAGE_PROVIDER", configKey: "storage.provider", type: "string" }, // 第62天：映射对象存储 Provider。
  { envKey: "OBJECT_STORAGE_BUCKET", configKey: "storage.bucket", type: "string" }, // 第62天：映射对象存储 Bucket。
  { envKey: "MINIO_ENDPOINT", configKey: "storage.minioEndpoint", type: "string" }, // 第62天：映射 MinIO Endpoint。
  { envKey: "MINIO_PORT", configKey: "storage.minioPort", type: "number" }, // 第62天：映射 MinIO 端口。
  { envKey: "MINIO_USE_SSL", configKey: "storage.minioUseSsl", type: "boolean" }, // 第62天：映射 MinIO SSL 开关。
  { envKey: "CACHE_STORE", configKey: "feature.cacheStore", type: "string" }, // 第62天：映射缓存后端选择。
]; // 第62天：结束环境变量映射表。
export class EnvConfigProvider implements ConfigProvider { // 第62天：定义环境变量配置 Provider。
  readonly source = "env" as const; // 第62天：声明 Provider 来源为 env。
  private items = new Map<string, ConfigItem>(); // 第62天：缓存当前环境变量解析后的配置项。
  constructor() { // 第62天：构造时立即读取一次环境变量。
    this.loadFromEnv(); // 第62天：执行环境变量扫描。
  } // 第62天：结束构造函数。
  get<T = unknown>(key: string): T | undefined { // 第62天：按 key 读取环境变量配置值。
    return this.items.get(key)?.value as T | undefined; // 第62天：命中则返回值，否则返回 undefined。
  } // 第62天：结束 get 方法。
  async set<T = unknown>(_input: ConfigSetInput<T>): Promise<void> { // 第62天：环境变量 Provider 不支持运行时写入。
    void _input; // 第62天：显式消费参数，避免 lint 报未使用参数。
    throw new Error("EnvConfigProvider 不支持 set，请通过 database Provider 写入覆盖值。"); // 第62天：提示调用方改用数据库配置。
  } // 第62天：结束 set 方法。
  has(key: string): boolean { // 第62天：判断环境变量 Provider 是否持有某个 key。
    return this.items.has(key); // 第62天：返回 Map 命中结果。
  } // 第62天：结束 has 方法。
  list(): ConfigItem[] { // 第62天：列出环境变量 Provider 当前配置项。
    return Array.from(this.items.values()).sort((a, b) => a.key.localeCompare(b.key)); // 第62天：按 key 排序后返回。
  } // 第62天：结束 list 方法。
  async reload(): Promise<void> { // 第62天：重新读取环境变量，用于热更新。
    this.loadFromEnv(); // 第62天：刷新内部配置项缓存。
  } // 第62天：结束 reload 方法。
  private loadFromEnv(): void { // 第62天：定义环境变量扫描方法。
    const next = new Map<string, ConfigItem>(); // 第62天：创建新的配置项 Map，避免旧值残留。
    for (const mapping of ENV_MAPPINGS) { // 第62天：遍历环境变量映射表。
      const raw = process.env[mapping.envKey]; // 第62天：读取真实环境变量值。
      if (raw === undefined || raw === "") continue; // 第62天：跳过未设置或空字符串。
      const schema = CONFIG_SCHEMAS.find((item) => item.key === mapping.configKey); // 第62天：查找配置 Schema。
      if (!schema) continue; // 第62天：没有 Schema 的映射直接跳过。
      next.set(mapping.configKey, { key: mapping.configKey, value: parseEnvValue(raw, mapping.type), category: schema.category, description: schema.description, editable: schema.editable, source: this.source, updatedAt: Date.now() }); // 第62天：写入解析后的环境变量配置项。
    } // 第62天：结束环境变量映射遍历。
    this.items = next; // 第62天：一次性替换配置项缓存。
  } // 第62天：结束环境变量扫描方法。
} // 第62天：结束 EnvConfigProvider 类。
function parseEnvValue(raw: string, type: ConfigValueType): string | number | boolean { // 第62天：定义环境变量字符串到配置值的转换函数。
  if (type === "number") return Number(raw); // 第62天：数字配置转为 number。
  if (type === "boolean") return raw === "true" || raw === "1" || raw.toLowerCase() === "yes"; // 第62天：布尔配置兼容 true、1 和 yes。
  return raw; // 第62天：字符串配置保持原始文本。
} // 第62天：结束环境变量值转换函数。
