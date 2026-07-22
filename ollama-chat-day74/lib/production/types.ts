export type PlatformEnvironment = "development" | "staging" | "production"; // 第74天：定义平台支持的开发、预发布和生产三种运行环境。
export type ServiceHealthState = "healthy" | "unhealthy" | "disabled"; // 第74天：定义依赖服务健康、异常和未启用三种状态。
export type ServiceHealthName = "database" | "redis" | "storage" | "queue" | "registry"; // 第74天：定义生产健康检查覆盖的五类服务。
export type EnvironmentConfig = { // 第74天：定义生产环境配置聚合结构，配置对象只保存密钥引用而不保存真实密钥。
  environment: PlatformEnvironment; // 第74天：保存当前运行环境。
  database: { host: string; port: number; database: string; user: string; passwordRef: string }; // 第74天：保存 MySQL 非敏感连接信息和密码引用。
  redis: { url: string; keyPrefix: string; timeoutMs: number }; // 第74天：保存 Redis 连接地址、命名空间和超时。
  storage: { provider: "local" | "minio"; bucket: string; endpoint: string; port: number; useSsl: boolean; accessKeyRef: string; secretKeyRef: string }; // 第74天：保存对象存储连接信息和凭证引用。
  security: { jwtSecretRef: string }; // 第74天：保存 JWT 密钥引用。
  observability: { samplingRate: number }; // 第74天：保存生产链路采样率。
  release: { version: string; gitCommit: string; databaseVersion: string; deploymentId: string }; // 第74天：保存平台、代码、数据库和部署版本信息。
}; // 第74天：结束生产环境配置结构。
export type EnvironmentValidationIssue = { key: string; message: string; severity: "error" | "warning" }; // 第74天：定义启动配置校验问题结构。
export type EnvironmentValidationResult = { valid: boolean; issues: EnvironmentValidationIssue[] }; // 第74天：定义启动配置校验结果。
export type ServiceHealthResult = { // 第74天：定义单项生产依赖健康检查结果。
  name: ServiceHealthName; // 第74天：保存依赖服务名称。
  state: ServiceHealthState; // 第74天：保存服务当前状态。
  latencyMs: number; // 第74天：保存健康检查耗时。
  checkedAt: number; // 第74天：保存检查完成时间。
  message: string; // 第74天：保存面向开发者的中文状态说明。
  required: boolean; // 第74天：标记该服务是否影响就绪状态。
}; // 第74天：结束单项健康检查结果结构。
export type HealthSnapshot = { status: "healthy" | "degraded" | "unhealthy"; services: ServiceHealthResult[]; checkedAt: number }; // 第74天：定义综合健康检查快照。
export type StartupValidationSnapshot = { status: "not_started" | "validating" | "ready" | "failed"; config: EnvironmentValidationResult; health?: HealthSnapshot; checkedAt?: number; error?: string }; // 第74天：定义启动校验生命周期快照。
export type FeatureFlagMode = "disabled" | "enabled" | "gradual"; // 第74天：定义功能关闭、全量开启和灰度发布三种模式。
export type FeatureFlag = { key: string; name: string; description: string; mode: FeatureFlagMode; rolloutPercentage: number; updatedAt: number }; // 第74天：定义生产功能开关结构。
export type FeatureFlagDecision = { key: string; enabled: boolean; mode: FeatureFlagMode; subjectId: string; bucket: number; reason: string }; // 第74天：定义功能开关对单个用户或租户的稳定决策结果。
export type PlatformRelease = { version: string; gitCommit: string; databaseVersion: string; deploymentId: string; createdAt: number; changelog: string[] }; // 第74天：定义平台发布版本结构。
export type BackupKind = "mysql" | "redis" | "minio"; // 第74天：定义 MySQL、Redis 和 MinIO 三类备份。
export type BackupJobStatus = "planned" | "running" | "completed" | "failed"; // 第74天：定义备份任务生命周期状态。
export type BackupJob = { id: string; kind: BackupKind; status: BackupJobStatus; target: string; createdAt: number; completedAt?: number; error?: string }; // 第74天：定义可追踪的备份任务结构。
export type ProductionOverview = { users: number; tenants: number; requests: number; cost: number; errors: number; averageLatency: number; p95Latency: number }; // 第74天：定义生产仪表盘用户、租户、请求、成本、错误和延迟总览。
export type ProductionAiQuality = { evaluationScore: number; badCases: number; regressions: number; qualityGateFailures: number; promptVersion: string }; // 第74天：定义人工智能质量总览。
export type ProductionSecurity = { auditEvents: number; permissionDenied: number; quotaExceeded: number; productionReady: boolean }; // 第74天：定义安全治理总览。
export type ProductionSnapshot = { // 第74天：定义生产仪表盘与 API 共用的完整快照。
  environment: EnvironmentConfig; // 第74天：保存脱敏生产环境配置。
  validation: EnvironmentValidationResult; // 第74天：保存生产配置校验结果。
  health: HealthSnapshot; // 第74天：保存 MySQL、Redis、MinIO、队列和注册中心健康状态。
  startup: StartupValidationSnapshot; // 第74天：保存启动校验状态。
  release: PlatformRelease; // 第74天：保存统一发布版本。
  featureFlags: FeatureFlag[]; // 第74天：保存全部生产功能开关。
  backupJobs: BackupJob[]; // 第74天：保存最近备份任务。
  overview: ProductionOverview; // 第74天：保存生产平台核心业务与可观测指标。
  aiQuality: ProductionAiQuality; // 第74天：保存评估、坏案例、回归和提示词版本指标。
  security: ProductionSecurity; // 第74天：保存审计、权限拒绝、配额拒绝和治理就绪指标。
  generatedAt: number; // 第74天：保存快照生成时间。
}; // 第74天：结束生产平台完整快照结构。
