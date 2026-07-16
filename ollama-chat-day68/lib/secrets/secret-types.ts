export type SecretCategory = "model" | "database" | "storage" | "redis" | "auth"; // 第63天：定义密钥分类，覆盖模型、数据库、存储、Redis 和认证场景。
export type SecretSource = "env" | "memory"; // 第63天：定义密钥来源，区分环境变量和运行时内存密钥库。
export type SecretItem = { // 第63天：定义完整密钥项，真实 value 只允许在 Provider 和 Manager 内部流转。
  id: string; // 第63天：保存密钥版本唯一标识，轮换后会生成新的版本 ID。
  key: string; // 第63天：保存密钥名称，例如 OPENAI_API_KEY 或 MYSQL_PASSWORD。
  value: string; // 第63天：保存密钥真实值，持久化前必须经过加密处理。
  category: SecretCategory; // 第63天：保存密钥用途分类，便于浏览器按域筛选。
  encrypted: boolean; // 第63天：标记当前保存值是否已经加密。
  createdAt: number; // 第63天：记录密钥首次创建时间。
  updatedAt: number; // 第63天：记录密钥最近更新时间。
}; // 第63天：结束 SecretItem 类型定义。
export type SecretMetadata = Omit<SecretItem, "value"> & { // 第63天：定义可返回前端的密钥元数据，明确剔除真实 value。
  source: SecretSource; // 第63天：保存密钥来源，帮助用户区分 env 和 memory。
  expiresAt?: number; // 第63天：保存可选过期时间，用于统计过期密钥。
  maskedValue: string; // 第63天：保存固定脱敏展示值，永不暴露真实密钥。
}; // 第63天：结束 SecretMetadata 类型定义。
export type SecretSetInput = { // 第63天：定义写入密钥时的输入结构。
  key: string; // 第63天：保存待写入密钥名称。
  value: string; // 第63天：保存待写入密钥真实值。
  category: SecretCategory; // 第63天：保存待写入密钥分类。
  expiresAt?: number; // 第63天：保存可选过期时间。
  forceNewVersion?: boolean; // 第63天：轮换密钥时强制生成新的版本 ID。
}; // 第63天：结束 SecretSetInput 类型定义。
export type SecretRotationRecord = { // 第63天：定义密钥轮换历史记录。
  key: string; // 第63天：保存被轮换的密钥名称。
  rotatedAt: number; // 第63天：保存轮换发生时间。
  oldVersionId?: string; // 第63天：保存旧版本 ID，首次写入时可以为空。
  newVersionId: string; // 第63天：保存新版本 ID。
}; // 第63天：结束 SecretRotationRecord 类型定义。
export type SecretsMetrics = { // 第63天：定义密钥管理指标结构。
  totalSecrets: number; // 第63天：记录当前可见密钥总数。
  rotateCount: number; // 第63天：记录密钥轮换次数。
  accessCount: number; // 第63天：记录密钥读取次数。
  encryptedCount: number; // 第63天：记录已加密保存的密钥数量。
  expiredSecrets: number; // 第63天：记录已经过期的密钥数量。
}; // 第63天：结束 SecretsMetrics 类型定义。
export type SecretsSnapshot = { // 第63天：定义 Secrets Explorer 和测试脚本使用的快照结构。
  items: SecretMetadata[]; // 第63天：保存只含元数据的密钥列表。
  metrics: SecretsMetrics; // 第63天：保存密钥管理指标。
  rotationHistory: SecretRotationRecord[]; // 第63天：保存最近的密钥轮换历史。
}; // 第63天：结束 SecretsSnapshot 类型定义。
export interface SecretProvider { // 第63天：定义密钥提供者接口，禁止提供 listValues 这种泄露真实值的能力。
  readonly source: SecretSource; // 第63天：声明 Provider 对应的密钥来源。
  get(key: string): Promise<string | undefined>; // 第63天：按密钥名称读取真实密钥值。
  set(input: SecretSetInput): Promise<void>; // 第63天：写入或覆盖单个密钥。
  delete(key: string): Promise<boolean>; // 第63天：删除单个密钥并返回是否删除成功。
  exists(key: string): Promise<boolean>; // 第63天：判断某个密钥是否存在。
  listKeys(): Promise<string[]>; // 第63天：只允许列出密钥名称，不允许列出真实密钥值。
  metadata?(key: string): Promise<SecretMetadata | undefined>; // 第63天：可选返回单个密钥的脱敏元数据。
  listMetadata?(): Promise<SecretMetadata[]>; // 第63天：可选返回全部脱敏元数据，仍然不包含真实 value。
  getSync?(key: string): string | undefined; // 第63天：为 MySQL 连接池等同步初始化场景提供同步读取能力。
  reset?(): Promise<void>; // 第63天：为测试脚本提供清空运行时密钥库的能力。
}; // 第63天：结束 SecretProvider 接口定义。
