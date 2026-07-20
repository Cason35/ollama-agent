export type LockToken = { // 第60天：定义锁令牌结构，用于释放和续期时校验持有者。 
  key: string; // 第60天：保存锁的逻辑 Key。 
  owner: string; // 第60天：保存锁持有者标识，必须足够唯一。 
  expiresAt: number; // 第60天：保存锁预计过期时间戳。 
}; // 第60天：结束 LockToken 类型定义。 

export type AcquireLockInput = { // 第60天：定义获取锁所需输入。 
  key: string; // 第60天：保存要保护的资源 Key。 
  owner: string; // 第60天：保存当前 Worker 或调用方唯一标识。 
  ttlMs?: number; // 第60天：允许覆盖锁的 TTL 毫秒数。 
}; // 第60天：结束获取锁输入类型。 

export type ExtendLockInput = { // 第60天：定义锁续期输入。 
  ttlMs?: number; // 第60天：允许覆盖续期后的 TTL 毫秒数。 
}; // 第60天：结束锁续期输入类型。 

export type LockInfo = { // 第60天：定义 Lock Explorer 展示的单把锁信息。 
  key: string; // 第60天：保存锁 Key。 
  owner: string; // 第60天：保存锁持有者。 
  ttlMs: number; // 第60天：保存 Redis 返回的剩余 TTL 毫秒数。 
  createdAt: number; // 第60天：保存锁创建时间。 
  expiresAt: number; // 第60天：保存锁预计过期时间。 
  renewCount: number; // 第60天：保存锁续期次数。 
}; // 第60天：结束锁信息类型。 

export type LockOperationName = "acquire" | "release" | "extend" | "forceUnlock" | "inspect"; // 第60天：定义锁操作追踪名称。 

export type LockOperationTrace = { // 第60天：定义单条锁操作追踪记录。 
  id: string; // 第60天：保存追踪记录唯一 ID。 
  operation: LockOperationName; // 第60天：保存操作类型。 
  key: string; // 第60天：保存本次操作的锁 Key。 
  owner?: string; // 第60天：保存本次操作的锁持有者。 
  status: "success" | "failed"; // 第60天：保存操作是否成功。 
  note: string; // 第60天：保存中文可读说明。 
  latencyMs: number; // 第60天：保存操作耗时毫秒数。 
  createdAt: number; // 第60天：保存操作发生时间。 
}; // 第60天：结束锁操作追踪类型。 

export type LockMetrics = { // 第60天：定义分布式锁指标结构。 
  totalLocks: number; // 第60天：保存当前活跃锁数量。 
  acquireSuccess: number; // 第60天：累计获取锁成功次数。 
  acquireFailure: number; // 第60天：累计获取锁失败次数。 
  avgWaitTime: number; // 第60天：保存平均获取锁等待耗时。 
  renewCount: number; // 第60天：累计续期成功次数。 
  expiredLocks: number; // 第60天：累计检测到的过期锁数量。 
}; // 第60天：结束锁指标类型。 

export type LockExplorerSnapshot = { // 第60天：定义 Lock Explorer 完整快照。 
  backend: "redis-string"; // 第60天：标记锁后端使用 Redis String。 
  namespace: string; // 第60天：保存 Redis 命名空间。 
  locks: LockInfo[]; // 第60天：保存当前活跃锁列表。 
  metrics: LockMetrics; // 第60天：保存锁指标。 
  operations: LockOperationTrace[]; // 第60天：保存最近锁操作追踪。 
  generatedAt: number; // 第60天：保存快照生成时间。 
}; // 第60天：结束 Lock Explorer 快照类型。 

export interface LockProvider { // 第60天：定义统一锁提供者接口，业务层不直接依赖 Redis 命令。 
  acquire(input: AcquireLockInput): Promise<LockToken | null>; // 第60天：尝试获取锁，成功返回令牌，失败返回 null。 
  release(token: LockToken): Promise<boolean>; // 第60天：释放锁，必须校验 owner。 
  extend(token: LockToken, input?: ExtendLockInput): Promise<LockToken | null>; // 第60天：续期锁，必须校验 owner。 
  isLocked(key: string): Promise<boolean>; // 第60天：检查指定 Key 是否已被锁住。 
  forceUnlock(key: string): Promise<boolean>; // 第60天：强制解锁，供 Lock Explorer 谨慎使用。 
  snapshot(): Promise<LockExplorerSnapshot>; // 第60天：读取 Lock Explorer 快照。 
} // 第60天：结束 LockProvider 接口。 
