import { redisClient, type RedisClient } from "@/lib/redis/redis-client"; /* 第58天：引入 RedisClient 封装，RedisCacheStore 只依赖统一客户端。 */
export type CacheStoreBackend = "memory" | "redis"; /* 第58天：定义缓存存储后端类型，便于 Explorer 和 Trace 展示。 */
export interface CacheStore<TValue> { /* 第58天：定义 CacheStore（缓存存储接口），让业务不直接依赖 Redis 或 Map。 */
  readonly backend: CacheStoreBackend; /* 第58天：保存当前缓存实现后端。 */
  get(key: string): Promise<TValue | null>; /* 第58天：定义异步读取缓存值的方法。 */
  set(key: string, value: TValue, ttlSeconds?: number): Promise<void>; /* 第58天：定义异步写入缓存值并可设置 TTL 的方法。 */
  delete(key: string): Promise<boolean>; /* 第58天：定义异步删除单个缓存键的方法。 */
  clear(): Promise<void>; /* 第58天：定义异步清空当前 Store 命名空间的方法。 */
  keys(): Promise<string[]>; /* 第58天：定义异步列出当前 Store 下所有逻辑 Key 的方法。 */
} /* 第58天：结束 CacheStore（缓存存储接口）定义。 */
type MemoryCacheRecord<TValue> = { value: TValue; expiresAt: number | null }; /* 第58天：定义 MemoryCacheStore 内部记录结构。 */
export class MemoryCacheStore<TValue> implements CacheStore<TValue> { /* 第58天：定义 MemoryCache（内存缓存）实现，供开发、测试和 Redis 降级使用。 */
  readonly backend = "memory" as const; /* 第58天：声明当前 Store 后端为 memory。 */
  private readonly records = new Map<string, MemoryCacheRecord<TValue>>(); /* 第58天：使用 Map 保存内存缓存记录。 */
  constructor(private readonly now: () => number = () => Date.now()) {} /* 第58天：允许注入时钟函数，便于 TTL 测试。 */
  async get(key: string): Promise<TValue | null> { /* 第58天：实现 CacheStore.get 读取内存缓存。 */
    const record = this.records.get(key); /* 第58天：从 Map 中读取目标记录。 */
    if (!record) return null; /* 第58天：不存在时返回未命中。 */
    if (record.expiresAt !== null && this.now() >= record.expiresAt) { this.records.delete(key); return null; } /* 第58天：过期时删除记录并返回未命中。 */
    return record.value; /* 第58天：返回缓存值。 */
  } /* 第58天：结束内存缓存读取方法。 */
  async set(key: string, value: TValue, ttlSeconds?: number): Promise<void> { /* 第58天：实现 CacheStore.set 写入内存缓存。 */
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? this.now() + ttlSeconds * 1000 : null; /* 第58天：根据 TTL 秒数计算过期时间。 */
    this.records.set(key, { value, expiresAt }); /* 第58天：写入 Map 缓存记录。 */
  } /* 第58天：结束内存缓存写入方法。 */
  async delete(key: string): Promise<boolean> { /* 第58天：实现 CacheStore.delete 删除内存缓存。 */
    return this.records.delete(key); /* 第58天：删除指定 Key 并返回是否真的删除。 */
  } /* 第58天：结束内存缓存删除方法。 */
  async clear(): Promise<void> { /* 第58天：实现 CacheStore.clear 清空内存缓存。 */
    this.records.clear(); /* 第58天：清空全部 Map 记录。 */
  } /* 第58天：结束内存缓存清空方法。 */
  async keys(): Promise<string[]> { /* 第58天：实现 CacheStore.keys 列出内存缓存 Key。 */
    await Promise.all([...this.records.keys()].map(async (key) => await this.get(key))); /* 第58天：读取每个 Key 以顺便清理过期记录。 */
    return [...this.records.keys()].sort(); /* 第58天：返回排序后的 Key 列表。 */
  } /* 第58天：结束内存缓存 Key 列表方法。 */
} /* 第58天：结束 MemoryCacheStore（内存缓存存储）实现。 */
export class RedisCacheStore<TValue> implements CacheStore<TValue> { /* 第58天：定义 RedisCache（Redis 缓存）实现。 */
  readonly backend = "redis" as const; /* 第58天：声明当前 Store 后端为 redis。 */
  constructor(private readonly namespace: string, private readonly client: RedisClient = redisClient) {} /* 第58天：保存 Store 命名空间和 RedisClient。 */
  async get(key: string): Promise<TValue | null> { /* 第58天：实现 CacheStore.get 从 Redis 读取 JSON 值。 */
    const raw = await this.client.get(this.scopedKey(key)); /* 第58天：通过 RedisClient GET 读取字符串。 */
    if (raw === null) return null; /* 第58天：Redis 未命中时返回空值。 */
    return JSON.parse(raw) as TValue; /* 第58天：把 JSON 字符串反序列化为业务值。 */
  } /* 第58天：结束 Redis 缓存读取方法。 */
  async set(key: string, value: TValue, ttlSeconds?: number): Promise<void> { /* 第58天：实现 CacheStore.set 向 Redis 写入 JSON 值。 */
    await this.client.set(this.scopedKey(key), JSON.stringify(value), ttlSeconds); /* 第58天：序列化业务值并通过统一 RedisClient 写入。 */
  } /* 第58天：结束 Redis 缓存写入方法。 */
  async delete(key: string): Promise<boolean> { /* 第58天：实现 CacheStore.delete 删除 Redis 缓存。 */
    return await this.client.del(this.scopedKey(key)) > 0; /* 第58天：调用 Redis DEL 并返回是否删除成功。 */
  } /* 第58天：结束 Redis 缓存删除方法。 */
  async clear(): Promise<void> { /* 第58天：实现 CacheStore.clear 清空当前 Redis Store 命名空间。 */
    const keys = await this.keys(); /* 第58天：读取当前 Store 的所有逻辑 Key。 */
    await Promise.all(keys.map(async (key) => await this.delete(key))); /* 第58天：逐个删除当前 Store 下的 Key。 */
  } /* 第58天：结束 Redis 缓存清空方法。 */
  async keys(): Promise<string[]> { /* 第58天：实现 CacheStore.keys 列出当前 Redis Store 的逻辑 Key。 */
    const keys = await this.client.keys(`${this.namespace}:*`); /* 第58天：读取当前 Store 命名空间下的 Redis 逻辑 Key。 */
    return keys.map((key) => key.slice(`${this.namespace}:`.length)).sort(); /* 第58天：去掉 Store 内部前缀并排序。 */
  } /* 第58天：结束 Redis 缓存 Key 列表方法。 */
  private scopedKey(key: string): string { /* 第58天：定义 Store 内部 Key 组装方法。 */
    return `${this.namespace}:${key}`; /* 第58天：用 namespace 隔离不同业务缓存。 */
  } /* 第58天：结束 Store 内部 Key 组装方法。 */
} /* 第58天：结束 RedisCacheStore（Redis 缓存存储）实现。 */
export function createDefaultCacheStore<TValue>(namespace: string): CacheStore<TValue> { /* 第58天：定义默认缓存 Store 工厂。 */
  return process.env.CACHE_STORE === "memory" ? new MemoryCacheStore<TValue>() : new RedisCacheStore<TValue>(namespace); /* 第58天：默认使用 Redis，可通过 CACHE_STORE=memory 显式切回内存。 */
} /* 第58天：结束默认缓存 Store 工厂。 */
