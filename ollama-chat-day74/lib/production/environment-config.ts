import type { EnvironmentConfig, EnvironmentValidationIssue, EnvironmentValidationResult, PlatformEnvironment } from "@/lib/production/types"; // 第74天：引入生产配置与校验领域类型。

type EnvironmentSource = Record<string, string | undefined>; // 第74天：定义可注入的环境变量读取源，便于测试隔离。

function text(source: EnvironmentSource, key: string, fallback: string): string { // 第74天：定义读取非空字符串环境变量的工具函数。
  const value = source[key]?.trim(); // 第74天：读取并清理指定环境变量。
  return value ? value : fallback; // 第74天：空值时返回安全默认值。
} // 第74天：结束字符串环境变量读取函数。

function numberValue(source: EnvironmentSource, key: string, fallback: number): number { // 第74天：定义读取有限数字环境变量的工具函数。
  const value = Number(source[key]); // 第74天：把环境变量文本转换为数字。
  return Number.isFinite(value) ? value : fallback; // 第74天：非法数字时返回安全默认值。
} // 第74天：结束数字环境变量读取函数。

function booleanValue(source: EnvironmentSource, key: string, fallback: boolean): boolean { // 第74天：定义读取布尔环境变量的工具函数。
  const value = source[key]?.trim().toLowerCase(); // 第74天：读取并标准化布尔环境变量。
  if (!value) return fallback; // 第74天：未配置时返回默认值。
  return value === "true" || value === "1" || value === "yes"; // 第74天：兼容三种常见真值写法。
} // 第74天：结束布尔环境变量读取函数。

function platformEnvironment(source: EnvironmentSource): PlatformEnvironment { // 第74天：定义运行环境白名单解析函数。
  const value = text(source, "APP_ENV", "development"); // 第74天：读取 APP_ENV 并默认使用开发环境。
  return value === "staging" || value === "production" ? value : "development"; // 第74天：未知环境名安全回退到 development。
} // 第74天：结束运行环境解析函数。

export function loadEnvironmentConfig(source: EnvironmentSource = process.env): EnvironmentConfig { // 第74天：从环境变量构建不含真实密钥的生产配置对象。
  const environment = platformEnvironment(source); // 第74天：解析当前运行环境。
  const containerMode = environment === "production"; // 第74天：生产环境默认使用 Docker Compose 服务名。
  return { // 第74天：返回完整生产配置。
    environment, // 第74天：写入当前运行环境。
    database: { host: text(source, "MYSQL_HOST", containerMode ? "mysql" : "127.0.0.1"), port: numberValue(source, "MYSQL_PORT", 3306), database: text(source, "MYSQL_DATABASE", "agent_runtime"), user: text(source, "MYSQL_USER", "agent"), passwordRef: "env:MYSQL_PASSWORD" }, // 第74天：写入 MySQL 非敏感配置和密码引用。
    redis: { url: text(source, "REDIS_URL", containerMode ? "redis://redis:6379" : "redis://127.0.0.1:6379"), keyPrefix: text(source, "REDIS_KEY_PREFIX", "ollama:day74:"), timeoutMs: numberValue(source, "REDIS_TIMEOUT_MS", 1000) }, // 第74天：写入 Redis 生产配置。
    storage: { provider: text(source, "OBJECT_STORAGE_PROVIDER", containerMode ? "minio" : "local") === "minio" ? "minio" : "local", bucket: text(source, "OBJECT_STORAGE_BUCKET", "agent-platform"), endpoint: text(source, "MINIO_ENDPOINT", containerMode ? "minio" : "127.0.0.1"), port: numberValue(source, "MINIO_PORT", 9000), useSsl: booleanValue(source, "MINIO_USE_SSL", false), accessKeyRef: "env:MINIO_ACCESS_KEY", secretKeyRef: "env:MINIO_SECRET_KEY" }, // 第74天：写入对象存储生产配置和凭证引用。
    security: { jwtSecretRef: text(source, "JWT_SECRET_REF", "env:JWT_SECRET") }, // 第74天：只写入 JWT 密钥引用。
    observability: { samplingRate: Math.max(0, Math.min(1, numberValue(source, "OBSERVABILITY_SAMPLING_RATE", 0.2))) }, // 第74天：把链路采样率限制在零到一之间。
    release: { version: text(source, "PLATFORM_VERSION", "1.0.0-rc.1"), gitCommit: text(source, "GIT_COMMIT", "local-development"), databaseVersion: text(source, "DATABASE_VERSION", "005_knowledge"), deploymentId: text(source, "DEPLOYMENT_VERSION", "day74-local") }, // 第74天：写入统一发布版本信息。
  }; // 第74天：结束生产配置返回对象。
} // 第74天：结束生产配置加载函数。

function isLocalAddress(value: string): boolean { // 第74天：定义生产环境本地地址识别函数。
  return value.includes("localhost") || value.includes("127.0.0.1"); // 第74天：识别两类常见本机回环地址。
} // 第74天：结束本地地址识别函数。

function secretExists(source: EnvironmentSource, reference: string): boolean { // 第74天：定义环境变量密钥引用存在性检查函数。
  if (!reference.startsWith("env:")) return true; // 第74天：非环境变量引用交给外部 Secret Manager 管理。
  const key = reference.slice("env:".length); // 第74天：提取环境变量名称。
  return Boolean(source[key]?.trim()); // 第74天：返回真实密钥环境变量是否存在且非空。
} // 第74天：结束密钥引用存在性检查函数。

export function validateEnvironmentConfig(config: EnvironmentConfig, source: EnvironmentSource = process.env): EnvironmentValidationResult { // 第74天：校验生产配置完整性和密钥引用。
  const issues: EnvironmentValidationIssue[] = []; // 第74天：创建配置问题收集数组。
  if (!config.database.host) issues.push({ key: "MYSQL_HOST", message: "MySQL 主机不能为空。", severity: "error" }); // 第74天：校验数据库主机。
  if (!config.database.database) issues.push({ key: "MYSQL_DATABASE", message: "MySQL 数据库名称不能为空。", severity: "error" }); // 第74天：校验数据库名称。
  if (!config.redis.url.startsWith("redis://") && !config.redis.url.startsWith("rediss://")) issues.push({ key: "REDIS_URL", message: "Redis 地址必须使用 redis:// 或 rediss://。", severity: "error" }); // 第74天：校验 Redis URL 协议。
  if (config.observability.samplingRate < 0 || config.observability.samplingRate > 1) issues.push({ key: "OBSERVABILITY_SAMPLING_RATE", message: "链路采样率必须位于零到一之间。", severity: "error" }); // 第74天：校验采样率范围。
  if (config.environment === "production" && isLocalAddress(config.database.host)) issues.push({ key: "MYSQL_HOST", message: "生产环境禁止把 MySQL 配置为 localhost 或 127.0.0.1。", severity: "error" }); // 第74天：禁止生产数据库硬编码为本机地址。
  if (config.environment === "production" && isLocalAddress(config.redis.url)) issues.push({ key: "REDIS_URL", message: "生产环境禁止把 Redis 配置为 localhost 或 127.0.0.1。", severity: "error" }); // 第74天：禁止生产 Redis 硬编码为本机地址。
  if (config.environment === "production" && config.storage.provider === "minio" && isLocalAddress(config.storage.endpoint)) issues.push({ key: "MINIO_ENDPOINT", message: "生产环境禁止把 MinIO 配置为 localhost 或 127.0.0.1。", severity: "error" }); // 第74天：禁止生产 MinIO 硬编码为本机地址。
  if (config.environment === "production" && !secretExists(source, config.database.passwordRef)) issues.push({ key: config.database.passwordRef, message: "生产环境缺少 MySQL 密码密钥。", severity: "error" }); // 第74天：校验 MySQL 密钥引用可解析。
  if (config.environment === "production" && !secretExists(source, config.security.jwtSecretRef)) issues.push({ key: config.security.jwtSecretRef, message: "生产环境缺少 JWT 签名密钥。", severity: "error" }); // 第74天：校验 JWT 密钥引用可解析。
  if (config.environment === "production" && config.storage.provider === "minio" && !secretExists(source, config.storage.accessKeyRef)) issues.push({ key: config.storage.accessKeyRef, message: "生产环境缺少 MinIO Access Key。", severity: "error" }); // 第74天：校验 MinIO 用户名密钥引用。
  if (config.environment === "production" && config.storage.provider === "minio" && !secretExists(source, config.storage.secretKeyRef)) issues.push({ key: config.storage.secretKeyRef, message: "生产环境缺少 MinIO Secret Key。", severity: "error" }); // 第74天：校验 MinIO 密码密钥引用。
  if (config.environment !== "production" && config.storage.provider === "local") issues.push({ key: "OBJECT_STORAGE_PROVIDER", message: "当前使用本地对象存储，适合开发但不适合作为生产备份目标。", severity: "warning" }); // 第74天：提示开发环境本地存储限制。
  return { valid: issues.every((issue) => issue.severity !== "error"), issues }; // 第74天：只要没有 error 即视为配置有效。
} // 第74天：结束生产配置校验函数。
