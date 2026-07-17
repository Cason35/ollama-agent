import { RedisLockProvider } from "@/lib/lock/redis-lock-provider"; // 第60天：引入 Redis 分布式锁实现。 
import type { LockProvider } from "@/lib/lock/lock-types"; // 第60天：引入统一锁提供者接口。 

const globalForLock = globalThis as typeof globalThis & { __day60LockProvider?: LockProvider }; // 第60天：扩展 globalThis 保存 Day60 锁单例。 

export function getLockRuntime(): LockProvider { // 第60天：定义获取分布式锁运行时单例的方法。 
  if (!globalForLock.__day60LockProvider) { // 第60天：判断是否已经创建锁提供者。 
    globalForLock.__day60LockProvider = new RedisLockProvider(); // 第60天：没有则创建 RedisLockProvider。 
  } // 第60天：结束锁提供者存在性判断。 
  return globalForLock.__day60LockProvider; // 第60天：返回锁提供者单例。 
} // 第60天：结束获取锁运行时方法。 
