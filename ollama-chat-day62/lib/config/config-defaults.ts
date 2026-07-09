import type { ConfigItem, ConfigSchema } from "@/lib/config/config-types"; // 第62天：引入配置项和配置 Schema 类型。
const now = Date.now(); // 第62天：给默认配置项提供统一更新时间，便于快照稳定展示。
export const CONFIG_SCHEMAS: ConfigSchema[] = [ // 第62天：定义配置中心的结构约束列表。
  { key: "model.default", required: true, type: "string", category: "model", description: "默认 Ollama 模型名称。", editable: true }, // 第62天：校验默认模型配置。
  { key: "model.ollamaApiUrl", required: true, type: "string", category: "model", description: "本地 Ollama Chat API 地址。", editable: true }, // 第62天：校验 Ollama API 地址。
  { key: "model.mimoBaseUrl", required: true, type: "string", category: "model", description: "小米 MiMo 兼容 OpenAI 接口地址。", editable: true }, // 第62天：校验 MiMo API 地址。
  { key: "model.mimoApiKey", required: false, type: "string", category: "model", description: "小米 MiMo API Key，Day63 会升级到 Secrets。", editable: false }, // 第62天：校验 MiMo API Key 占位配置。
  { key: "model.requestTimeoutMs", required: true, type: "number", category: "model", description: "模型请求超时时间，单位毫秒。", editable: true }, // 第62天：校验模型请求超时配置。
  { key: "prompt.systemPolicy", required: true, type: "string", category: "prompt", description: "平台级系统提示词策略说明。", editable: true }, // 第62天：校验提示词策略配置。
  { key: "runtime.maxWorkers", required: true, type: "number", category: "runtime", description: "WorkerPool 最大并发 Worker 数。", editable: true }, // 第62天：校验运行时最大 Worker 数。
  { key: "runtime.jobTimeoutMs", required: true, type: "number", category: "runtime", description: "默认任务超时时间，单位毫秒。", editable: true }, // 第62天：校验默认任务超时配置。
  { key: "retrieval.recallK", required: true, type: "number", category: "runtime", description: "检索第一阶段召回候选数量。", editable: true }, // 第62天：校验检索召回数量。
  { key: "retrieval.topK", required: true, type: "number", category: "runtime", description: "检索最终返回片段数量。", editable: true }, // 第62天：校验检索 TopK 配置。
  { key: "retrieval.minScore", required: true, type: "number", category: "runtime", description: "检索结果最低分数阈值。", editable: true }, // 第62天：校验检索最低分阈值。
  { key: "retrieval.maxQueries", required: true, type: "number", category: "runtime", description: "Query Rewrite 最大扩展查询数量。", editable: true }, // 第62天：校验查询改写数量。
  { key: "database.mysqlHost", required: false, type: "string", category: "database", description: "MySQL 主机地址。", editable: true }, // 第62天：校验 MySQL 主机配置。
  { key: "database.mysqlPort", required: true, type: "number", category: "database", description: "MySQL 端口。", editable: true }, // 第62天：校验 MySQL 端口配置。
  { key: "database.mysqlDatabase", required: false, type: "string", category: "database", description: "MySQL 数据库名称。", editable: true }, // 第62天：校验 MySQL 数据库名配置。
  { key: "redis.url", required: true, type: "string", category: "redis", description: "Redis 连接地址。", editable: true }, // 第62天：校验 Redis URL。
  { key: "redis.keyPrefix", required: true, type: "string", category: "redis", description: "Redis 逻辑命名空间前缀。", editable: true }, // 第62天：校验 Redis Key Prefix。
  { key: "redis.timeoutMs", required: true, type: "number", category: "redis", description: "Redis 单次操作超时时间。", editable: true }, // 第62天：校验 Redis 超时。
  { key: "redis.queueVisibilityTimeoutMs", required: true, type: "number", category: "redis", description: "Redis 队列 Processing 可见性超时。", editable: true }, // 第62天：校验队列可见性超时。
  { key: "redis.lockTtlMs", required: true, type: "number", category: "redis", description: "Redis 分布式锁默认 TTL。", editable: true }, // 第62天：校验锁 TTL。
  { key: "storage.provider", required: true, type: "string", category: "storage", description: "对象存储 Provider，支持 local 或 minio。", editable: true }, // 第62天：校验对象存储 Provider。
  { key: "storage.bucket", required: true, type: "string", category: "storage", description: "对象存储默认 Bucket。", editable: true }, // 第62天：校验对象存储 Bucket。
  { key: "storage.minioEndpoint", required: true, type: "string", category: "storage", description: "MinIO 服务地址。", editable: true }, // 第62天：校验 MinIO Endpoint。
  { key: "storage.minioPort", required: true, type: "number", category: "storage", description: "MinIO 服务端口。", editable: true }, // 第62天：校验 MinIO 端口。
  { key: "storage.minioUseSsl", required: true, type: "boolean", category: "storage", description: "MinIO 是否使用 SSL。", editable: true }, // 第62天：校验 MinIO SSL 开关。
  { key: "storage.minioAccessKey", required: true, type: "string", category: "storage", description: "MinIO Access Key，Day63 会升级到 Secrets。", editable: false }, // 第62天：校验 MinIO Access Key。
  { key: "storage.minioSecretKey", required: true, type: "string", category: "storage", description: "MinIO Secret Key，Day63 会升级到 Secrets。", editable: false }, // 第62天：校验 MinIO Secret Key。
  { key: "feature.enableQueue", required: true, type: "boolean", category: "feature", description: "是否启用队列能力。", editable: true }, // 第62天：校验队列功能开关。
  { key: "feature.enableObjectStorage", required: true, type: "boolean", category: "feature", description: "是否启用对象存储能力。", editable: true }, // 第62天：校验对象存储功能开关。
  { key: "feature.enableConfigExplorer", required: true, type: "boolean", category: "feature", description: "是否启用配置浏览器。", editable: true }, // 第62天：校验配置浏览器开关。
  { key: "feature.enableHotReload", required: true, type: "boolean", category: "feature", description: "是否启用配置热更新通知。", editable: true }, // 第62天：校验热更新开关。
  { key: "feature.cacheStore", required: true, type: "string", category: "feature", description: "缓存存储后端，支持 redis 或 memory。", editable: true }, // 第62天：校验缓存后端配置。
]; // 第62天：结束配置 Schema 列表。
function item<T>(key: string, value: T): ConfigItem<T> { // 第62天：定义根据 Schema 快速创建默认配置项的工具函数。
  const schema = CONFIG_SCHEMAS.find((entry) => entry.key === key); // 第62天：根据配置键查找对应 Schema。
  if (!schema) throw new Error(`缺少配置 Schema：${key}`); // 第62天：没有 Schema 时立即暴露开发错误。
  return { key, value, category: schema.category, description: schema.description, editable: schema.editable, source: "default", updatedAt: now }; // 第62天：返回带默认来源的配置项。
} // 第62天：结束默认配置项创建函数。
export const DEFAULT_CONFIG_ITEMS: ConfigItem[] = [ // 第62天：定义默认配置 Provider 的初始数据。
  item("model.default", "qwen2.5:14b"), // 第62天：默认本地聊天模型。
  item("model.ollamaApiUrl", "http://localhost:11434/api/chat"), // 第62天：默认 Ollama Chat API。
  item("model.mimoBaseUrl", "https://token-plan-cn.xiaomimimo.com/v1"), // 第62天：默认 MiMo Base URL。
  item("model.mimoApiKey", ""), // 第62天：默认 MiMo Key 为空。
  item("model.requestTimeoutMs", 30000), // 第62天：默认模型请求 30 秒超时。
  item("prompt.systemPolicy", "代码负责逻辑，配置负责策略。"), // 第62天：默认提示词策略说明。
  item("runtime.maxWorkers", 3), // 第62天：默认 WorkerPool 并发数。
  item("runtime.jobTimeoutMs", 30000), // 第62天：默认 Job 超时。
  item("retrieval.recallK", 20), // 第62天：默认召回 20 个候选片段。
  item("retrieval.topK", 5), // 第62天：默认返回 5 个最终片段。
  item("retrieval.minScore", 0.3), // 第62天：默认最低分 0.3。
  item("retrieval.maxQueries", 5), // 第62天：默认最多生成 5 条查询。
  item("database.mysqlHost", ""), // 第62天：默认 MySQL 主机为空。
  item("database.mysqlPort", 3306), // 第62天：默认 MySQL 端口。
  item("database.mysqlDatabase", "agent_runtime"), // 第62天：默认数据库名。
  item("redis.url", "redis://127.0.0.1:6379"), // 第62天：默认 Redis 地址。
  item("redis.keyPrefix", "ollama:day62:"), // 第62天：默认 Day62 Redis 命名空间。
  item("redis.timeoutMs", 800), // 第62天：默认 Redis 操作超时。
  item("redis.queueVisibilityTimeoutMs", 15000), // 第62天：默认队列可见性超时。
  item("redis.lockTtlMs", 15000), // 第62天：默认分布式锁 TTL。
  item("storage.provider", "local"), // 第62天：默认使用本地对象存储 Provider。
  item("storage.bucket", "agent-platform"), // 第62天：默认对象存储 Bucket。
  item("storage.minioEndpoint", "127.0.0.1"), // 第62天：默认 MinIO 地址。
  item("storage.minioPort", 9000), // 第62天：默认 MinIO 端口。
  item("storage.minioUseSsl", false), // 第62天：默认 MinIO 不启用 SSL。
  item("storage.minioAccessKey", "minioadmin"), // 第62天：默认 MinIO Access Key。
  item("storage.minioSecretKey", "minioadmin"), // 第62天：默认 MinIO Secret Key。
  item("feature.enableQueue", true), // 第62天：默认启用队列。
  item("feature.enableObjectStorage", true), // 第62天：默认启用对象存储。
  item("feature.enableConfigExplorer", true), // 第62天：默认启用配置浏览器。
  item("feature.enableHotReload", true), // 第62天：默认启用热更新通知。
  item("feature.cacheStore", "redis"), // 第62天：默认缓存后端为 Redis。
]; // 第62天：结束默认配置项列表。
