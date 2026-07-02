export type RedisOperationName = "GET" | "SET" | "DEL" | "EXPIRE" | "EXISTS" | "KEYS" | "TTL" | "TYPE" | "MEMORY" | "PING"; /* 第58天：定义 Redis 操作名称，覆盖本日要求观测的基础命令。 */
export type RedisOperationStatus = "success" | "failed"; /* 第58天：定义 Redis 操作结果状态，用于 Trace（追踪记录）展示成功或失败。 */
export type RedisOperationTrace = { /* 第58天：定义单次 Redis Operation（Redis 操作）的追踪记录结构。 */
  id: string; /* 第58天：保存 Redis 操作追踪记录唯一标识。 */
  operation: RedisOperationName; /* 第58天：保存本次执行的 Redis 命令名称。 */
  key?: string; /* 第58天：保存本次操作涉及的逻辑 Key（键），KEYS 等批量操作可为空。 */
  status: RedisOperationStatus; /* 第58天：保存本次 Redis 操作是否成功。 */
  hit?: boolean; /* 第58天：保存 GET/EXISTS 等读操作是否命中。 */
  latencyMs: number; /* 第58天：保存本次 Redis 操作耗时毫秒数。 */
  error?: string; /* 第58天：保存失败时的错误信息，避免 Explorer 只能看到失败状态。 */
  createdAt: number; /* 第58天：保存 Redis 操作发生时间戳。 */
}; /* 第58天：结束 Redis 操作追踪记录类型定义。 */
export type RedisMetrics = { /* 第58天：定义 Redis Metrics（Redis 指标），用于观察共享状态中心健康度。 */
  totalKeys: number; /* 第58天：保存当前命名空间下的 Key（键）总数。 */
  hitRate: number; /* 第58天：保存 Redis 读取命中率。 */
  missRate: number; /* 第58天：保存 Redis 读取未命中率。 */
  avgLatency: number; /* 第58天：保存 Redis 操作平均延迟毫秒数。 */
  memoryUsage: number; /* 第58天：保存当前命名空间估算内存占用字节数。 */
}; /* 第58天：结束 Redis Metrics（Redis 指标）类型定义。 */
export type RedisHealthSnapshot = { /* 第58天：定义 Redis Health Check（健康检查）快照。 */
  healthy: boolean; /* 第58天：保存 Redis 当前是否可用。 */
  ping: string; /* 第58天：保存 PING 命令返回值，正常一般为 PONG。 */
  checkedAt: number; /* 第58天：保存健康检查发生时间戳。 */
  error?: string; /* 第58天：保存健康检查失败原因。 */
}; /* 第58天：结束 Redis 健康检查快照类型定义。 */
export type RedisKeySummary = { /* 第58天：定义 Redis Explorer（Redis 浏览器）展示用 Key 摘要。 */
  key: string; /* 第58天：保存逻辑 Key（键）名称。 */
  ttl: number; /* 第58天：保存 TTL（过期时间）秒数，-1 表示永不过期，-2 表示不存在。 */
  type: string; /* 第58天：保存 Redis 数据类型，例如 string、list 或 none。 */
  size: number; /* 第58天：保存该 Key（键）估算内存占用字节数。 */
}; /* 第58天：结束 Redis Key 摘要类型定义。 */
export type RedisExplorerSnapshot = { /* 第58天：定义 Redis Explorer（Redis 浏览器）的完整快照。 */
  health: RedisHealthSnapshot; /* 第58天：保存 Redis 健康检查结果。 */
  keys: RedisKeySummary[]; /* 第58天：保存当前命名空间下的 Key（键）列表。 */
  metrics: RedisMetrics; /* 第58天：保存 Redis 指标快照。 */
  operations: RedisOperationTrace[]; /* 第58天：保存最近 Redis 操作追踪记录。 */
  namespace: string; /* 第58天：保存当前 RedisClient 使用的 Key Prefix（键前缀）。 */
  generatedAt: number; /* 第58天：保存快照生成时间戳。 */
}; /* 第58天：结束 Redis Explorer 快照类型定义。 */
