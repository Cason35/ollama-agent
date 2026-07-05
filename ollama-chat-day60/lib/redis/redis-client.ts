import Redis from "ioredis"; /* 第58天：引入 ioredis 客户端，作为 Node.js 访问 Redis 的底层驱动。 */
import type { RedisMetrics, RedisOperationName, RedisOperationTrace } from "@/lib/redis/redis-types"; /* 第58天：引入 Redis 指标与操作追踪类型。 */
type RedisClientOptions = { /* 第58天：定义 RedisClient（Redis 客户端封装）的可选配置。 */
  url?: string; /* 第58天：保存 Redis 连接地址，默认从 REDIS_URL 或本机 6379 读取。 */
  keyPrefix?: string; /* 第58天：保存逻辑命名空间前缀，避免 Day58 示例污染其他 Redis 数据。 */
  operationTimeoutMs?: number; /* 第58天：保存单次 Redis 操作超时时间，避免本机未启动 Redis 时请求长时间挂起。 */
}; /* 第58天：结束 RedisClient 配置类型定义。 */
export class RedisClient { /* 第58天：定义统一 RedisClient（Redis 客户端封装），业务代码不直接调用 ioredis。 */
  private connection: Redis | null = null; /* 第58天：保存懒加载 ioredis 连接实例。 */
  private readonly url: string; /* 第58天：保存最终 Redis 连接地址。 */
  private readonly keyPrefix: string; /* 第59天：保存统一 Key Prefix（键前缀），隔离 Redis Cache 与 Redis Queue 数据。 */
  private readonly operationTimeoutMs: number; /* 第58天：保存 Redis 操作超时时间。 */
  private readonly operations: RedisOperationTrace[] = []; /* 第58天：保存最近 Redis Operation Trace（操作追踪）。 */
  private sequence = 0; /* 第58天：保存 Redis 操作追踪 ID 递增序号。 */
  private totalOperations = 0; /* 第58天：累计 Redis 操作次数。 */
  private totalLatencyMs = 0; /* 第58天：累计 Redis 操作延迟。 */
  private hitCount = 0; /* 第58天：累计 Redis 读取命中次数。 */
  private missCount = 0; /* 第58天：累计 Redis 读取未命中次数。 */
  constructor(options: RedisClientOptions = {}) { /* 第58天：构造 RedisClient 并只保存配置，不在模块加载时立即连接 Redis。 */
    this.url = options.url ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379"; /* 第58天：优先使用显式配置，其次读取环境变量，最后使用本机默认 Redis。 */
    this.keyPrefix = options.keyPrefix ?? process.env.REDIS_KEY_PREFIX ?? "ollama:day60:"; /* 第60天：设置 Day60 默认命名空间，隔离 Redis Queue 与 Redis Lock 数据。 */
    this.operationTimeoutMs = options.operationTimeoutMs ?? Number(process.env.REDIS_TIMEOUT_MS ?? 800); /* 第58天：设置 Redis 操作超时，默认 800ms。 */
  } /* 第58天：结束 RedisClient 构造函数。 */
  getNamespace(): string { /* 第58天：定义读取当前 Redis 命名空间的方法。 */
    return this.keyPrefix; /* 第58天：返回当前 Key Prefix（键前缀）。 */
  } /* 第58天：结束命名空间读取方法。 */
  async ping(): Promise<string> { /* 第58天：定义 Redis PING（连通性检查）方法。 */
    return await this.perform("PING", undefined, async (redis) => await redis.ping()); /* 第58天：执行 PING 并记录操作追踪。 */
  } /* 第58天：结束 PING 方法。 */
  async get(key: string): Promise<string | null> { /* 第58天：定义 Redis GET（读取）方法。 */
    return await this.perform("GET", key, async (redis) => await redis.get(this.toRedisKey(key)), (value) => value !== null); /* 第58天：读取字符串值并根据 null 判断 Hit/Miss。 */
  } /* 第58天：结束 GET 方法。 */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> { /* 第58天：定义 Redis SET（写入）方法。 */
    await this.perform("SET", key, async (redis) => { if (ttlSeconds && ttlSeconds > 0) await redis.set(this.toRedisKey(key), value, "EX", Math.ceil(ttlSeconds)); else await redis.set(this.toRedisKey(key), value); }); /* 第58天：按需附带 EX 过期时间写入字符串值。 */
  } /* 第58天：结束 SET 方法。 */
  async setNxPx(key: string, value: string, ttlMs: number): Promise<boolean> { /* 第60天：定义 Redis SET key value NX PX，用于原子获取分布式锁。 */
    const result = await this.perform("SET_NX_PX", key, async (redis) => await redis.call("SET", this.toRedisKey(key), value, "PX", Math.max(1, Math.ceil(ttlMs)), "NX")); /* 第60天：通过通用 call 执行 SET NX PX，避免 ioredis 重载签名差异。 */
    return result === "OK"; /* 第60天：Redis 返回 OK 表示获取锁成功。 */
  } /* 第60天：结束 SET NX PX 方法。 */
  async del(key: string): Promise<number> { /* 第58天：定义 Redis DEL（删除）方法。 */
    return await this.perform("DEL", key, async (redis) => await redis.del(this.toRedisKey(key))); /* 第58天：删除指定 Key（键）并返回删除数量。 */
  } /* 第58天：结束 DEL 方法。 */
  async expire(key: string, ttlSeconds: number): Promise<boolean> { /* 第58天：定义 Redis EXPIRE（设置过期时间）方法。 */
    const result = await this.perform("EXPIRE", key, async (redis) => await redis.expire(this.toRedisKey(key), Math.max(1, Math.ceil(ttlSeconds)))); /* 第58天：把秒数归一为至少一秒并调用 EXPIRE。 */
    return result === 1; /* 第58天：返回是否成功设置过期时间。 */
  } /* 第58天：结束 EXPIRE 方法。 */
  async compareAndDelete(key: string, value: string): Promise<boolean> { /* 第60天：定义 owner 校验后删除锁的原子 Lua 操作。 */
    const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"; /* 第60天：Lua 脚本确保只能释放自己持有的锁。 */
    const result = await this.perform("EVAL", key, async (redis) => await redis.eval(script, 1, this.toRedisKey(key), value)); /* 第60天：执行 Lua 脚本并传入真实 Redis Key 与 owner。 */
    return Number(result) === 1; /* 第60天：返回是否成功删除锁。 */
  } /* 第60天：结束 owner 校验删除方法。 */
  async compareAndPexpire(key: string, value: string, ttlMs: number): Promise<boolean> { /* 第60天：定义 owner 校验后刷新锁 TTL 的原子 Lua 操作。 */
    const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end"; /* 第60天：Lua 脚本确保只能续期自己持有的锁。 */
    const result = await this.perform("PEXPIRE", key, async (redis) => await redis.eval(script, 1, this.toRedisKey(key), value, String(Math.max(1, Math.ceil(ttlMs))))); /* 第60天：执行 Lua 脚本并刷新毫秒级 TTL。 */
    return Number(result) === 1; /* 第60天：返回是否成功续期锁。 */
  } /* 第60天：结束 owner 校验续期方法。 */
  async exists(key: string): Promise<boolean> { /* 第58天：定义 Redis EXISTS（存在性检查）方法。 */
    const result = await this.perform("EXISTS", key, async (redis) => await redis.exists(this.toRedisKey(key)), (value) => value === 1); /* 第58天：检查 Key 是否存在并记录 Hit/Miss。 */
    return result === 1; /* 第58天：把 Redis 数字结果转换为布尔值。 */
  } /* 第58天：结束 EXISTS 方法。 */
  async keys(pattern = "*"): Promise<string[]> { /* 第58天：定义 Redis KEYS（键扫描）方法，教学项目里保留简单实现。 */
    const redisPattern = `${this.keyPrefix}${pattern}`; /* 第58天：把逻辑 pattern 拼接为真实 Redis 命名空间 pattern。 */
    const keys = await this.perform("KEYS", undefined, async (redis) => await redis.keys(redisPattern)); /* 第58天：读取当前命名空间下匹配的真实 Key 列表。 */
    return keys.map((key) => this.fromRedisKey(key)).sort(); /* 第58天：去掉命名空间前缀并按字母序返回。 */
  } /* 第58天：结束 KEYS 方法。 */
  async ttl(key: string): Promise<number> { /* 第58天：定义 Redis TTL（过期时间读取）方法。 */
    return await this.perform("TTL", key, async (redis) => await redis.ttl(this.toRedisKey(key))); /* 第58天：返回 Redis TTL 秒数。 */
  } /* 第58天：结束 TTL 方法。 */
  async pttl(key: string): Promise<number> { /* 第60天：定义 Redis PTTL（毫秒级过期时间读取）方法，用于 Lock Explorer。 */
    return await this.perform("PTTL", key, async (redis) => await redis.pttl(this.toRedisKey(key))); /* 第60天：返回 Redis PTTL 毫秒数。 */
  } /* 第60天：结束 PTTL 方法。 */
  async type(key: string): Promise<string> { /* 第58天：定义 Redis TYPE（数据类型读取）方法。 */
    return await this.perform("TYPE", key, async (redis) => await redis.type(this.toRedisKey(key))); /* 第58天：返回 Redis 数据类型。 */
  } /* 第58天：结束 TYPE 方法。 */
  async memoryUsage(key: string): Promise<number> { /* 第58天：定义 Redis MEMORY USAGE（内存占用估算）方法。 */
    const result = await this.perform("MEMORY", key, async (redis) => await redis.call("MEMORY", "USAGE", this.toRedisKey(key))); /* 第58天：通过通用 call 调用 MEMORY USAGE 以兼容类型定义。 */
    return typeof result === "number" ? result : Number(result ?? 0); /* 第58天：把 Redis 返回值规整为数字字节数。 */
  } /* 第58天：结束 MEMORY USAGE 方法。 */
  async lpush(key: string, value: string): Promise<number> { /* 第59天：定义 Redis LPUSH（左侧入队）方法，用于把 Job 写入等待队列或处理中队列。 */
    return await this.perform("LPUSH", key, async (redis) => await redis.lpush(this.toRedisKey(key), value)); /* 第59天：执行 LPUSH 并记录队列写入追踪。 */
  } /* 第59天：结束 LPUSH 方法。 */
  async rpush(key: string, value: string): Promise<number> { /* 第59天：定义 Redis RPUSH（右侧追加）方法，用于保存完成队列和死信队列历史。 */
    return await this.perform("RPUSH", key, async (redis) => await redis.rpush(this.toRedisKey(key), value)); /* 第59天：执行 RPUSH 并记录队列归档追踪。 */
  } /* 第59天：结束 RPUSH 方法。 */
  async lrange(key: string, start: number, stop: number): Promise<string[]> { /* 第59天：定义 Redis LRANGE（读取列表区间）方法，用于 Queue Explorer 和候选任务选择。 */
    return await this.perform("LRANGE", key, async (redis) => await redis.lrange(this.toRedisKey(key), start, stop)); /* 第59天：执行 LRANGE 并返回指定区间内的序列化 Job。 */
  } /* 第59天：结束 LRANGE 方法。 */
  async lrem(key: string, count: number, value: string): Promise<number> { /* 第59天：定义 Redis LREM（从列表移除指定元素）方法，用于 ACK、Retry、Delete 和并发认领去重。 */
    return await this.perform("LREM", key, async (redis) => await redis.lrem(this.toRedisKey(key), count, value)); /* 第59天：执行 LREM 并返回移除数量。 */
  } /* 第59天：结束 LREM 方法。 */
  async llen(key: string): Promise<number> { /* 第59天：定义 Redis LLEN（列表长度）方法，用于统计 Waiting、Processing、Completed 和 Dead Letter 数量。 */
    return await this.perform("LLEN", key, async (redis) => await redis.llen(this.toRedisKey(key))); /* 第59天：执行 LLEN 并返回列表长度。 */
  } /* 第59天：结束 LLEN 方法。 */
  async estimateNamespaceMemoryUsage(keys?: string[]): Promise<number> { /* 第58天：定义估算当前命名空间总内存的方法。 */
    const logicalKeys = keys ?? await this.keys("*"); /* 第58天：优先使用传入 Key 列表，否则现场读取命名空间 Key。 */
    const sizes = await Promise.all(logicalKeys.map(async (key) => await this.memoryUsage(key).catch(() => 0))); /* 第58天：并发读取每个 Key 的估算内存，单 Key 失败时记为零。 */
    return sizes.reduce((sum, value) => sum + value, 0); /* 第58天：汇总全部 Key 的估算内存占用。 */
  } /* 第58天：结束命名空间内存估算方法。 */
  async getMetrics(keys?: string[]): Promise<RedisMetrics> { /* 第58天：定义 Redis Metrics（Redis 指标）快照读取方法。 */
    const logicalKeys = keys ?? await this.keys("*").catch(() => []); /* 第58天：读取当前命名空间 Key 数量，失败时返回空列表。 */
    const readTotal = this.hitCount + this.missCount; /* 第58天：计算 GET/EXISTS 等读操作总数。 */
    const hitRate = readTotal > 0 ? Number((this.hitCount / readTotal).toFixed(4)) : 0; /* 第58天：计算读取命中率并防御除零。 */
    const missRate = readTotal > 0 ? Number((this.missCount / readTotal).toFixed(4)) : 0; /* 第58天：计算读取未命中率并防御除零。 */
    const avgLatency = this.totalOperations > 0 ? Number((this.totalLatencyMs / this.totalOperations).toFixed(2)) : 0; /* 第58天：计算平均 Redis 操作延迟。 */
    const memoryUsage = await this.estimateNamespaceMemoryUsage(logicalKeys).catch(() => 0); /* 第58天：估算命名空间内存占用，失败时返回零。 */
    return { totalKeys: logicalKeys.length, hitRate, missRate, avgLatency, memoryUsage }; /* 第58天：返回符合任务要求的 Redis 指标结构。 */
  } /* 第58天：结束 Redis Metrics 方法。 */
  getOperationTraces(): RedisOperationTrace[] { /* 第58天：定义读取最近 Redis 操作追踪的方法。 */
    return [...this.operations].sort((a, b) => b.createdAt - a.createdAt); /* 第58天：返回按时间倒序排列的操作追踪副本。 */
  } /* 第58天：结束 Redis 操作追踪读取方法。 */
  resetOperationTraces(): void { /* 第58天：定义清空 Redis 操作追踪与指标的方法，供测试隔离使用。 */
    this.operations.length = 0; /* 第58天：清空最近操作列表。 */
    this.totalOperations = 0; /* 第58天：重置操作次数。 */
    this.totalLatencyMs = 0; /* 第58天：重置累计延迟。 */
    this.hitCount = 0; /* 第58天：重置命中次数。 */
    this.missCount = 0; /* 第58天：重置未命中次数。 */
  } /* 第58天：结束 Redis 操作追踪重置方法。 */
  async disconnect(): Promise<void> { /* 第58天：定义主动断开 Redis 连接的方法。 */
    if (!this.connection) return; /* 第58天：没有连接时直接返回。 */
    this.connection.disconnect(); /* 第58天：调用 ioredis 断开连接，避免测试进程悬挂。 */
    this.connection = null; /* 第58天：清空本地连接引用。 */
  } /* 第58天：结束 Redis 断开连接方法。 */
  private async perform<T>(operation: RedisOperationName, key: string | undefined, action: (redis: Redis) => Promise<T>, hitResolver?: (value: T) => boolean): Promise<T> { /* 第58天：定义统一操作包装器，集中处理连接、超时、Trace 与 Metrics。 */
    const startedAt = Date.now(); /* 第58天：记录 Redis 操作开始时间。 */
    try { /* 第58天：捕获 Redis 连接或命令执行异常。 */
      const redis = await this.getConnection(); /* 第58天：懒加载并复用 Redis 连接。 */
      const result = await this.withTimeout(action(redis)); /* 第58天：执行真实 Redis 命令并套用超时保护。 */
      this.recordOperation(operation, key, "success", Date.now() - startedAt, hitResolver ? hitResolver(result) : undefined); /* 第58天：记录成功操作、耗时和可选 Hit/Miss。 */
      return result; /* 第58天：返回 Redis 命令执行结果。 */
    } catch (error) { /* 第58天：处理 Redis 操作失败。 */
      this.recordOperation(operation, key, "failed", Date.now() - startedAt, undefined, error instanceof Error ? error.message : String(error)); /* 第58天：记录失败操作和错误信息。 */
      throw error; /* 第58天：把错误继续抛给上层，由 Store 或 API 决定是否降级。 */
    } /* 第58天：结束 Redis 操作异常处理。 */
  } /* 第58天：结束统一操作包装器。 */
  private async getConnection(): Promise<Redis> { /* 第58天：定义懒加载 Redis 连接的方法。 */
    if (!this.connection || this.connection.status === "end") this.connection = this.createConnection(); /* 第58天：连接不存在或已结束时重新创建。 */
    if (this.connection.status === "wait") await this.withTimeout(this.connection.connect()); /* 第58天：懒连接状态下显式连接 Redis。 */
    return this.connection; /* 第58天：返回可用或正在被 ioredis 管理的连接。 */
  } /* 第58天：结束懒加载连接方法。 */
  private createConnection(): Redis { /* 第58天：定义创建 ioredis 连接实例的方法。 */
    const redis = new Redis(this.url, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false, connectTimeout: this.operationTimeoutMs, retryStrategy: () => null }); /* 第58天：创建短超时、无离线队列、无无限重试的 Redis 连接。 */
    redis.on("error", () => undefined); /* 第58天：吞掉连接级 error 事件，避免未启动 Redis 时触发未处理异常。 */
    return redis; /* 第58天：返回创建好的 ioredis 实例。 */
  } /* 第58天：结束 ioredis 连接创建方法。 */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> { /* 第58天：定义通用 Promise 超时保护。 */
    let timer: ReturnType<typeof setTimeout> | undefined; /* 第58天：保存超时定时器句柄。 */
    try { /* 第58天：确保成功或失败后都会清理定时器。 */
      return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Redis operation timeout after ${this.operationTimeoutMs}ms`)), this.operationTimeoutMs); })]); /* 第58天：在真实操作和超时错误之间竞争。 */
    } finally { /* 第58天：清理超时定时器。 */
      if (timer) clearTimeout(timer); /* 第58天：如果定时器已创建则取消。 */
    } /* 第58天：结束超时清理。 */
  } /* 第58天：结束 Promise 超时保护。 */
  private recordOperation(operation: RedisOperationName, key: string | undefined, status: "success" | "failed", latencyMs: number, hit?: boolean, error?: string): void { /* 第58天：定义 Redis 操作追踪写入方法。 */
    this.totalOperations += 1; /* 第58天：累计一次 Redis 操作。 */
    this.totalLatencyMs += latencyMs; /* 第58天：累计 Redis 操作延迟。 */
    if (hit === true) this.hitCount += 1; /* 第58天：读操作命中时累计命中次数。 */
    if (hit === false) this.missCount += 1; /* 第58天：读操作未命中时累计未命中次数。 */
    this.sequence += 1; /* 第58天：递增操作追踪序号。 */
    this.operations.unshift({ id: `redis-op-${Date.now()}-${this.sequence}`, operation, key, status, hit, latencyMs, error, createdAt: Date.now() }); /* 第58天：把本次操作写入最近追踪列表头部。 */
    if (this.operations.length > 80) this.operations.pop(); /* 第58天：只保留最近 80 条，避免教学项目内存无限增长。 */
  } /* 第58天：结束 Redis 操作追踪写入方法。 */
  private toRedisKey(key: string): string { /* 第58天：定义逻辑 Key 到真实 Redis Key 的转换方法。 */
    return key.startsWith(this.keyPrefix) ? key : `${this.keyPrefix}${key}`; /* 第58天：避免重复添加命名空间前缀。 */
  } /* 第58天：结束真实 Redis Key 转换方法。 */
  private fromRedisKey(key: string): string { /* 第58天：定义真实 Redis Key 到逻辑 Key 的转换方法。 */
    return key.startsWith(this.keyPrefix) ? key.slice(this.keyPrefix.length) : key; /* 第58天：展示给业务和前端时去掉命名空间前缀。 */
  } /* 第58天：结束逻辑 Key 转换方法。 */
} /* 第58天：结束 RedisClient（Redis 客户端封装）类定义。 */
export const redisClient = new RedisClient(); /* 第58天：导出共享 RedisClient 单例，供 Store、HealthCheck 和 Explorer 复用。 */
