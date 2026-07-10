import { RedisLockProvider } from "@/lib/lock/redis-lock-provider"; // 第60天：引入 Redis 分布式锁实现。 
import { redisClient } from "@/lib/redis/redis-client"; // 第60天：引入共享 RedisClient 用于健康检查和断开连接。 

function assert(condition: unknown, message: string): void { // 第60天：定义轻量断言工具。 
  if (!condition) throw new Error(message); // 第60天：断言失败时抛出错误并中断测试。 
} // 第60天：结束断言工具。 

async function sleep(ms: number): Promise<void> { // 第60天：定义异步等待工具。 
  await new Promise((resolve) => setTimeout(resolve, ms)); // 第60天：通过 setTimeout 等待指定毫秒数。 
} // 第60天：结束异步等待工具。 

async function main(): Promise<void> { // 第60天：定义测试主入口。 
  const provider = new RedisLockProvider(); // 第60天：创建 RedisLockProvider 测试实例。 
  try { // 第60天：开始检查 Redis 是否可用。 
    await redisClient.ping(); // 第60天：使用 PING 确认 Redis 集成测试环境。 
  } catch (error) { // 第60天：捕获 Redis 未启动或不可达。 
    console.log("[Day60] Redis 不可用，跳过 Redis Distributed Lock 集成测试：", error instanceof Error ? error.message : String(error)); // 第60天：输出可读跳过原因。 
    return; // 第60天：Redis 不可用时安全退出，不把环境问题当成代码失败。 
  } // 第60天：结束 Redis 可用性检查。 
  const key = `test:day60:distributed-lock:${Date.now()}`; // 第60天：生成本次测试专用锁 Key。 
  const ownerA = `worker-a:${Date.now()}`; // 第60天：生成 Worker A 的唯一 owner。 
  const ownerB = `worker-b:${Date.now()}`; // 第60天：生成 Worker B 的唯一 owner。 
  const tokenA = await provider.acquire({ key, owner: ownerA, ttlMs: 2000 }); // 第60天：Worker A 尝试获取锁。 
  assert(tokenA, "Worker A 应该能获取新锁"); // 第60天：验证第一位 Worker 获取锁成功。 
  const tokenB = await provider.acquire({ key, owner: ownerB, ttlMs: 2000 }); // 第60天：Worker B 同时尝试获取同一把锁。 
  assert(tokenB === null, "Worker B 不应该获取已被持有的锁"); // 第60天：验证同一资源同一时间只能被一个 Worker 持有。 
  const wrongRelease = await provider.release({ key: tokenA!.key, owner: ownerB, expiresAt: tokenA!.expiresAt }); // 第60天：Worker B 尝试释放 Worker A 的锁。 
  assert(wrongRelease === false, "非 owner 不应该释放别人的锁"); // 第60天：验证 release 必须校验 owner。 
  const extended = await provider.extend(tokenA!, { ttlMs: 3000 }); // 第60天：Worker A 对锁做心跳续期。 
  assert(extended && extended.expiresAt > tokenA!.expiresAt, "owner 应该能成功续期锁"); // 第60天：验证续期会刷新过期时间。 
  const released = await provider.release(extended!); // 第60天：Worker A 释放续期后的锁。 
  assert(released === true, "owner 应该能释放自己的锁"); // 第60天：验证 owner 可以释放锁。 
  const lockedAfterRelease = await provider.isLocked(key); // 第60天：释放后检查锁是否仍存在。 
  assert(lockedAfterRelease === false, "释放后锁不应该继续存在"); // 第60天：验证 release 后锁被清理。 
  const crashToken = await provider.acquire({ key, owner: ownerA, ttlMs: 700 }); // 第60天：模拟 Worker A 获取短 TTL 锁后崩溃。 
  assert(crashToken, "Worker A 应该能获取短 TTL 锁"); // 第60天：验证短 TTL 锁获取成功。 
  await sleep(900); // 第60天：等待超过锁 TTL，模拟 Worker 崩溃后的自动过期。 
  const recoveredToken = await provider.acquire({ key, owner: ownerB, ttlMs: 1000 }); // 第60天：Worker B 在 TTL 结束后尝试重新获取锁。 
  assert(recoveredToken, "TTL 结束后其他 Worker 应该能重新获取锁"); // 第60天：验证锁自动过期后可恢复执行。 
  await provider.release(recoveredToken!); // 第60天：清理恢复测试中的锁。 
  const snapshot = await provider.snapshot(); // 第60天：读取锁浏览器快照。 
  assert(snapshot.metrics.acquireSuccess >= 3, "Lock Metrics 应该记录获取成功次数"); // 第60天：验证锁指标包含获取成功统计。 
  assert(snapshot.metrics.acquireFailure >= 1, "Lock Metrics 应该记录获取失败次数"); // 第60天：验证锁指标包含获取失败统计。 
  console.log("[Day60] Redis Distributed Lock 测试通过"); // 第60天：输出测试通过信息。 
} // 第60天：结束测试主入口。 

main().catch((error) => { // 第60天：捕获测试主入口中的未处理错误。 
  console.error("[Day60] Redis Distributed Lock 测试失败", error); // 第60天：输出失败原因。 
  process.exitCode = 1; // 第60天：设置进程退出码为失败。 
}).finally(async () => { // 第60天：无论成功失败都清理 Redis 连接。 
  await redisClient.disconnect().catch(() => undefined); // 第60天：断开 Redis 连接，避免测试进程悬挂。 
}); // 第60天：结束测试主入口调用。 
