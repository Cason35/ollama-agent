import { redisClient, type RedisClient } from "@/lib/redis/redis-client"; // 第60天：引入统一 RedisClient，避免业务层直接使用 ioredis。 
import type { AcquireLockInput, ExtendLockInput, LockExplorerSnapshot, LockInfo, LockMetrics, LockOperationName, LockOperationTrace, LockProvider, LockToken } from "@/lib/lock/lock-types"; // 第60天：引入分布式锁相关类型。 

const DEFAULT_LOCK_TTL_MS = 30 * 1000; // 第60天：定义默认锁 TTL 为 30 秒。 
const MAX_LOCK_OPERATIONS = 120; // 第60天：限制 Lock Trace 最多保留 120 条。 
const LOCK_KEY_PREFIX = "locks:"; // 第60天：定义业务锁 Key 前缀。 
const LOCK_META_PREFIX = "locks:meta:"; // 第60天：定义锁元数据 Key 前缀。 

type LockMeta = { // 第60天：定义写入 Redis 的锁元数据结构。 
  key: string; // 第60天：保存锁 Key。 
  owner: string; // 第60天：保存锁持有者。 
  createdAt: number; // 第60天：保存锁创建时间。 
  expiresAt: number; // 第60天：保存锁预计过期时间。 
  renewCount: number; // 第60天：保存续期次数。 
}; // 第60天：结束锁元数据类型。 

function normalizeLockKey(key: string): string { // 第60天：定义锁 Key 归一化函数。 
  const trimmed = key.trim(); // 第60天：清理调用方传入的首尾空白。 
  return trimmed.startsWith(LOCK_KEY_PREFIX) ? trimmed : `${LOCK_KEY_PREFIX}${trimmed}`; // 第60天：确保所有锁 Key 都位于 locks 命名空间。 
} // 第60天：结束锁 Key 归一化函数。 

function toMetaKey(key: string): string { // 第60天：定义锁元数据 Key 生成函数。 
  return `${LOCK_META_PREFIX}${encodeURIComponent(key)}`; // 第60天：使用 URL 编码避免锁 Key 中的冒号影响元数据 Key。 
} // 第60天：结束锁元数据 Key 生成函数。 

function createTraceId(sequence: number): string { // 第60天：定义锁追踪 ID 生成函数。 
  return `lock-op-${Date.now()}-${sequence}`; // 第60天：用时间戳和递增序号生成可读 ID。 
} // 第60天：结束锁追踪 ID 生成函数。 

function parseMeta(raw: string | null, fallback: LockMeta): LockMeta { // 第60天：定义锁元数据解析函数。 
  if (!raw) return fallback; // 第60天：没有元数据时返回兜底值。 
  try { // 第60天：开始解析 JSON 元数据。 
    return { ...fallback, ...(JSON.parse(raw) as Partial<LockMeta>) }; // 第60天：用兜底值合并解析结果，避免字段缺失。 
  } catch { // 第60天：捕获损坏 JSON。 
    return fallback; // 第60天：元数据损坏时返回兜底值。 
  } // 第60天：结束 JSON 解析异常处理。 
} // 第60天：结束锁元数据解析函数。 

export class RedisLockProvider implements LockProvider { // 第60天：定义基于 Redis String 的分布式锁实现。 
  private readonly operations: LockOperationTrace[] = []; // 第60天：保存最近锁操作追踪。 
  private sequence = 0; // 第60天：保存锁操作递增序号。 
  private acquireSuccess = 0; // 第60天：累计获取锁成功次数。 
  private acquireFailure = 0; // 第60天：累计获取锁失败次数。 
  private totalAcquireWaitMs = 0; // 第60天：累计获取锁耗时。 
  private renewCount = 0; // 第60天：累计续期成功次数。 
  private expiredLocks = 0; // 第60天：累计发现过期锁次数。 
  constructor(private readonly client: RedisClient = redisClient, private readonly defaultTtlMs = Number(process.env.LOCK_TTL_MS ?? DEFAULT_LOCK_TTL_MS)) {} // 第60天：注入 RedisClient 并允许环境变量覆盖默认 TTL。 
  async acquire(input: AcquireLockInput): Promise<LockToken | null> { // 第60天：尝试通过 SET NX PX 获取锁。 
    const key = normalizeLockKey(input.key); // 第60天：归一化锁 Key。 
    const ttlMs = this.resolveTtl(input.ttlMs); // 第60天：解析本次锁 TTL。 
    const owner = input.owner; // 第60天：读取锁持有者。 
    const startedAt = Date.now(); // 第60天：记录获取锁开始时间。 
    return await this.traced("acquire", key, owner, async () => { // 第60天：包裹获取锁操作并写入 Trace。 
      const ok = await this.client.setNxPx(key, owner, ttlMs); // 第60天：执行 Redis SET key owner NX PX ttl。 
      const waitMs = Date.now() - startedAt; // 第60天：计算本次获取锁耗时。 
      this.totalAcquireWaitMs += waitMs; // 第60天：累计获取锁耗时。 
      if (!ok) { // 第60天：判断是否获取失败。 
        this.acquireFailure += 1; // 第60天：累计获取锁失败次数。 
        return null; // 第60天：获取失败时返回空令牌。 
      } // 第60天：结束获取失败判断。 
      this.acquireSuccess += 1; // 第60天：累计获取锁成功次数。 
      const now = Date.now(); // 第60天：记录获取成功时间。 
      const token: LockToken = { key, owner, expiresAt: now + ttlMs }; // 第60天：构造锁令牌。 
      await this.writeMeta({ key, owner, createdAt: now, expiresAt: token.expiresAt, renewCount: 0 }, ttlMs); // 第60天：写入 Lock Explorer 所需元数据。 
      return token; // 第60天：返回锁令牌。 
    }); // 第60天：结束获取锁追踪包裹。 
  } // 第60天：结束 acquire 方法。 
  async release(token: LockToken): Promise<boolean> { // 第60天：释放锁并校验 owner。 
    const key = normalizeLockKey(token.key); // 第60天：归一化令牌中的锁 Key。 
    return await this.traced("release", key, token.owner, async () => { // 第60天：包裹释放操作并写入 Trace。 
      const released = await this.client.compareAndDelete(key, token.owner); // 第60天：通过 Lua 校验 owner 后删除锁。 
      if (released) await this.client.del(toMetaKey(key)).catch(() => 0); // 第60天：释放成功后删除锁元数据。 
      return released; // 第60天：返回释放结果。 
    }); // 第60天：结束释放锁追踪包裹。 
  } // 第60天：结束 release 方法。 
  async extend(token: LockToken, input: ExtendLockInput = {}): Promise<LockToken | null> { // 第60天：续期锁并校验 owner。 
    const key = normalizeLockKey(token.key); // 第60天：归一化令牌中的锁 Key。 
    const ttlMs = this.resolveTtl(input.ttlMs); // 第60天：解析续期后的 TTL。 
    return await this.traced("extend", key, token.owner, async () => { // 第60天：包裹续期操作并写入 Trace。 
      const extended = await this.client.compareAndPexpire(key, token.owner, ttlMs); // 第60天：通过 Lua 校验 owner 后刷新锁 TTL。 
      if (!extended) return null; // 第60天：续期失败时返回空令牌。 
      this.renewCount += 1; // 第60天：累计续期成功次数。 
      const now = Date.now(); // 第60天：记录续期时间。 
      const nextToken: LockToken = { key, owner: token.owner, expiresAt: now + ttlMs }; // 第60天：构造新的锁令牌。 
      const fallback: LockMeta = { key, owner: token.owner, createdAt: now, expiresAt: nextToken.expiresAt, renewCount: 0 }; // 第60天：准备元数据兜底值。 
      const previous = parseMeta(await this.client.get(toMetaKey(key)).catch(() => null), fallback); // 第60天：读取旧元数据用于递增续期次数。 
      await this.writeMeta({ ...previous, expiresAt: nextToken.expiresAt, renewCount: previous.renewCount + 1 }, ttlMs); // 第60天：更新元数据过期时间和续期次数。 
      return nextToken; // 第60天：返回新令牌。 
    }); // 第60天：结束续期追踪包裹。 
  } // 第60天：结束 extend 方法。 
  async isLocked(key: string): Promise<boolean> { // 第60天：检查锁是否存在。 
    return await this.client.exists(normalizeLockKey(key)); // 第60天：通过 Redis EXISTS 判断锁 Key 是否存在。 
  } // 第60天：结束 isLocked 方法。 
  async forceUnlock(key: string): Promise<boolean> { // 第60天：强制解锁，不校验 owner。 
    const normalized = normalizeLockKey(key); // 第60天：归一化锁 Key。 
    return await this.traced("forceUnlock", normalized, undefined, async () => { // 第60天：包裹强制解锁操作并写入 Trace。 
      const removed = await this.client.del(normalized); // 第60天：直接删除锁 Key。 
      await this.client.del(toMetaKey(normalized)).catch(() => 0); // 第60天：同时清理元数据 Key。 
      return removed > 0; // 第60天：返回是否删除到锁。 
    }); // 第60天：结束强制解锁追踪包裹。 
  } // 第60天：结束 forceUnlock 方法。 
  async snapshot(): Promise<LockExplorerSnapshot> { // 第60天：读取 Lock Explorer 快照。 
    const keys = await this.client.keys(`${LOCK_KEY_PREFIX}*`); // 第60天：扫描当前命名空间下的锁 Key。 
    const lockKeys = keys.filter((key) => !key.startsWith(LOCK_META_PREFIX)); // 第60天：过滤掉锁元数据 Key。 
    const locks = (await Promise.all(lockKeys.map((key) => this.inspect(key)))).filter((lock): lock is LockInfo => lock !== null); // 第60天：并发读取每把锁详情并过滤空值。 
    const metrics = this.metrics(locks.length); // 第60天：计算锁指标快照。 
    return { backend: "redis-string", namespace: this.client.getNamespace(), locks, metrics, operations: this.getOperationTraces(), generatedAt: Date.now() }; // 第60天：返回完整 Lock Explorer 快照。 
  } // 第60天：结束 snapshot 方法。 
  private async inspect(key: string): Promise<LockInfo | null> { // 第60天：读取单把锁详情。 
    return await this.traced("inspect", key, undefined, async () => { // 第60天：包裹锁详情读取并写入 Trace。 
      const normalized = normalizeLockKey(key); // 第60天：归一化锁 Key。 
      const [owner, ttlMs] = await Promise.all([this.client.get(normalized), this.client.pttl(normalized)]); // 第60天：并发读取 owner 和剩余 TTL。 
      if (!owner || ttlMs < 0) { // 第60天：判断锁是否已经不存在或过期。 
        if (ttlMs < 0) this.expiredLocks += 1; // 第60天：累计过期锁观测次数。 
        return null; // 第60天：锁不存在时返回空。 
      } // 第60天：结束锁存在性判断。 
      const now = Date.now(); // 第60天：记录当前时间。 
      const fallback: LockMeta = { key: normalized, owner, createdAt: now, expiresAt: now + ttlMs, renewCount: 0 }; // 第60天：准备元数据缺失时的兜底值。 
      const meta = parseMeta(await this.client.get(toMetaKey(normalized)).catch(() => null), fallback); // 第60天：读取并解析锁元数据。 
      return { key: normalized, owner, ttlMs, createdAt: meta.createdAt, expiresAt: meta.expiresAt, renewCount: meta.renewCount }; // 第60天：返回 Lock Explorer 可展示信息。 
    }); // 第60天：结束锁详情追踪包裹。 
  } // 第60天：结束 inspect 方法。 
  private async writeMeta(meta: LockMeta, ttlMs: number): Promise<void> { // 第60天：写入锁元数据。 
    await this.client.set(toMetaKey(meta.key), JSON.stringify(meta), Math.ceil(ttlMs / 1000)); // 第60天：用与锁近似一致的 TTL 保存元数据。 
  } // 第60天：结束写入锁元数据方法。 
  private resolveTtl(ttlMs?: number): number { // 第60天：解析安全 TTL。 
    const value = Number(ttlMs ?? this.defaultTtlMs); // 第60天：优先使用调用方 TTL，否则使用默认 TTL。 
    if (!Number.isFinite(value)) return DEFAULT_LOCK_TTL_MS; // 第60天：非法数字时回退默认 TTL。 
    return Math.max(500, Math.min(10 * 60 * 1000, Math.round(value))); // 第60天：把 TTL 限制在 0.5 秒到 10 分钟之间。 
  } // 第60天：结束 TTL 解析方法。 
  private metrics(activeLocks: number): LockMetrics { // 第60天：计算锁指标快照。 
    const totalAttempts = this.acquireSuccess + this.acquireFailure; // 第60天：计算获取锁总尝试次数。 
    const avgWaitTime = totalAttempts ? Math.round(this.totalAcquireWaitMs / totalAttempts) : 0; // 第60天：计算平均等待耗时。 
    return { totalLocks: activeLocks, acquireSuccess: this.acquireSuccess, acquireFailure: this.acquireFailure, avgWaitTime, renewCount: this.renewCount, expiredLocks: this.expiredLocks }; // 第60天：返回 Lock Metrics。 
  } // 第60天：结束锁指标计算方法。 
  private getOperationTraces(): LockOperationTrace[] { // 第60天：读取锁操作追踪副本。 
    return [...this.operations].sort((a, b) => b.createdAt - a.createdAt); // 第60天：按时间倒序返回锁操作追踪。 
  } // 第60天：结束读取锁操作追踪方法。 
  private async traced<T>(operation: LockOperationName, key: string, owner: string | undefined, action: () => Promise<T>): Promise<T> { // 第60天：统一包裹锁操作追踪。 
    const startedAt = Date.now(); // 第60天：记录操作开始时间。 
    try { // 第60天：开始捕获锁操作异常。 
      const result = await action(); // 第60天：执行真实锁操作。 
      const failedByNull = result === null || result === false; // 第60天：把空结果和 false 视为业务失败。 
      this.recordOperation(operation, key, owner, failedByNull ? "failed" : "success", failedByNull ? `${operation} 未获得锁或未命中 owner` : `${operation} 执行成功`, Date.now() - startedAt); // 第60天：记录成功或业务失败追踪。 
      return result; // 第60天：返回原始操作结果。 
    } catch (error) { // 第60天：捕获 Redis 或运行时异常。 
      this.recordOperation(operation, key, owner, "failed", error instanceof Error ? error.message : String(error), Date.now() - startedAt); // 第60天：记录异常失败追踪。 
      throw error; // 第60天：继续抛出错误交给上层处理。 
    } // 第60天：结束异常捕获。 
  } // 第60天：结束锁操作追踪包裹方法。 
  private recordOperation(operation: LockOperationName, key: string, owner: string | undefined, status: "success" | "failed", note: string, latencyMs: number): void { // 第60天：写入单条锁操作追踪。 
    this.sequence += 1; // 第60天：递增锁操作序号。 
    this.operations.unshift({ id: createTraceId(this.sequence), operation, key, owner, status, note, latencyMs, createdAt: Date.now() }); // 第60天：把本次操作写入追踪列表头部。 
    if (this.operations.length > MAX_LOCK_OPERATIONS) this.operations.pop(); // 第60天：超过上限时移除最旧记录。 
  } // 第60天：结束锁操作追踪写入方法。 
} // 第60天：结束 RedisLockProvider 类。 
