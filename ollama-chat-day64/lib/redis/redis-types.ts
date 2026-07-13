export type RedisOperationName = "GET" | "SET" | "SET_NX_PX" | "DEL" | "EXPIRE" | "PEXPIRE" | "EXISTS" | "KEYS" | "TTL" | "PTTL" | "TYPE" | "MEMORY" | "PING" | "EVAL" | "LPUSH" | "RPUSH" | "LRANGE" | "LREM" | "LLEN"; /* 第60天：定义 Redis 操作名称，并加入分布式锁需要的 SET NX PX、PEXPIRE、PTTL 和 EVAL。 */
export type RedisOperationStatus = "success" | "failed"; /* 第60天：定义 Redis 操作结果状态，用于 Trace 展示成功或失败。 */
export type RedisOperationTrace = { /* 第60天：定义单次 Redis 操作追踪记录结构。 */
  id: string; /* 第60天：保存 Redis 操作追踪唯一标识。 */
  operation: RedisOperationName; /* 第60天：保存本次执行的 Redis 命令名称。 */
  key?: string; /* 第60天：保存本次操作涉及的逻辑 Key。 */
  status: RedisOperationStatus; /* 第60天：保存本次 Redis 操作是否成功。 */
  hit?: boolean; /* 第60天：保存 GET/EXISTS 等读取操作是否命中。 */
  latencyMs: number; /* 第60天：保存本次 Redis 操作耗时毫秒数。 */
  error?: string; /* 第60天：保存失败时的错误信息。 */
  createdAt: number; /* 第60天：保存 Redis 操作发生时间戳。 */
}; /* 第60天：结束 Redis 操作追踪记录类型。 */
export type RedisMetrics = { /* 第60天：定义 Redis 指标结构。 */
  totalKeys: number; /* 第60天：保存当前命名空间下的 Key 总数。 */
  hitRate: number; /* 第60天：保存 Redis 读取命中率。 */
  missRate: number; /* 第60天：保存 Redis 读取未命中率。 */
  avgLatency: number; /* 第60天：保存 Redis 操作平均延迟毫秒数。 */
  memoryUsage: number; /* 第60天：保存当前命名空间估算内存占用字节数。 */
}; /* 第60天：结束 Redis 指标类型。 */
export type RedisHealthSnapshot = { /* 第60天：定义 Redis 健康检查快照。 */
  healthy: boolean; /* 第60天：保存 Redis 当前是否可用。 */
  ping: string; /* 第60天：保存 PING 命令返回值。 */
  checkedAt: number; /* 第60天：保存健康检查发生时间戳。 */
  error?: string; /* 第60天：保存健康检查失败原因。 */
}; /* 第60天：结束 Redis 健康检查快照。 */
export type RedisKeySummary = { /* 第60天：定义 Redis Explorer 展示的 Key 摘要。 */
  key: string; /* 第60天：保存逻辑 Key 名称。 */
  ttl: number; /* 第60天：保存 TTL 秒数。 */
  type: string; /* 第60天：保存 Redis 数据类型。 */
  size: number; /* 第60天：保存该 Key 估算内存占用字节数。 */
}; /* 第60天：结束 Redis Key 摘要类型。 */
export type RedisExplorerSnapshot = { /* 第60天：定义 Redis Explorer 完整快照。 */
  health: RedisHealthSnapshot; /* 第60天：保存 Redis 健康检查结果。 */
  keys: RedisKeySummary[]; /* 第60天：保存当前命名空间下的 Key 列表。 */
  metrics: RedisMetrics; /* 第60天：保存 Redis 指标快照。 */
  operations: RedisOperationTrace[]; /* 第60天：保存最近 Redis 操作追踪记录。 */
  namespace: string; /* 第60天：保存当前 RedisClient 使用的 Key Prefix。 */
  generatedAt: number; /* 第60天：保存快照生成时间戳。 */
}; /* 第60天：结束 Redis Explorer 快照类型。 */
