"use client"; // 第60天：声明 Lock Explorer 是客户端组件，支持强制解锁按钮交互。
import type { LockExplorerSnapshot, LockInfo, LockOperationTrace } from "@/lib/lock/lock-types"; // 第60天：引入锁快照、锁详情和锁操作追踪类型。

const DASH = "-"; // 第60天：定义空值占位符。
const forceButtonClass = "rounded-md border border-red-300 bg-white px-2 py-1 text-[10px] font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-zinc-950/40 dark:text-red-200 dark:hover:bg-red-950/30"; // 第60天：定义强制解锁按钮样式。

type LockExplorerProps = { // 第60天：定义 Lock Explorer 组件参数。
  snapshot?: LockExplorerSnapshot; // 第60天：接收后端返回的锁快照。
  loading: boolean; // 第60天：接收队列或锁操作加载状态。
  handleForceUnlock: (lockKey: string) => Promise<void>; // 第60天：接收强制解锁回调。
}; // 第60天：结束组件参数类型。

function formatTtl(ttlMs: number): string { // 第60天：定义 TTL 展示格式化函数。
  if (ttlMs < 0) return DASH; // 第60天：Redis 返回负数时展示占位符。
  if (ttlMs < 1000) return `${ttlMs}ms`; // 第60天：不足一秒时直接展示毫秒。
  return `${Math.ceil(ttlMs / 1000)}s`; // 第60天：超过一秒时向上取整展示秒数。
} // 第60天：结束 TTL 格式化函数。

function formatTime(value?: number): string { // 第60天：定义时间戳展示格式化函数。
  if (!value) return DASH; // 第60天：没有时间戳时返回占位符。
  return new Date(value).toLocaleTimeString("zh-CN"); // 第60天：返回中文本地时间。
} // 第60天：结束时间格式化函数。

function LockRow({ lock, loading, handleForceUnlock }: { lock: LockInfo; loading: boolean; handleForceUnlock: (lockKey: string) => Promise<void> }) { // 第60天：定义单行锁详情组件。
  return ( // 第60天：返回单把锁的展示行。
    <li className="rounded-lg border border-cyan-100 bg-white/75 px-2 py-2 text-[10px] dark:border-cyan-900/40 dark:bg-zinc-950/30"> {/* 第60天：定义单把锁行容器。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第60天：排列锁信息和操作按钮。 */}
        <div className="min-w-0"> {/* 第60天：定义锁文本区域。 */}
          <p className="truncate font-mono font-semibold text-cyan-950 dark:text-cyan-100" title={lock.key}>{lock.key}</p> {/* 第60天：展示锁 Key。 */}
          <p className="mt-1 break-all font-mono text-cyan-800 dark:text-cyan-200">owner（持有者）: {lock.owner}</p> {/* 第60天：展示 owner。 */}
          <p className="mt-0.5 text-zinc-500 dark:text-zinc-400">TTL（剩余）: {formatTtl(lock.ttlMs)} | renew（续期）: {lock.renewCount} | created（创建）: {formatTime(lock.createdAt)} | expires（过期）: {formatTime(lock.expiresAt)}</p> {/* 第60天：展示 TTL、续期次数、创建时间和过期时间。 */}
        </div> {/* 第60天：结束锁文本区域。 */}
        <button type="button" disabled={loading} onClick={() => void handleForceUnlock(lock.key)} className={forceButtonClass}>Force Unlock（强制解锁）</button> {/* 第60天：提供强制解锁按钮。 */}
      </div> {/* 第60天：结束锁信息和操作按钮布局。 */}
    </li> /* 第60天：结束单把锁行容器。 */
  ); // 第60天：结束单把锁行返回。
} // 第60天：结束 LockRow 组件。

function OperationRow({ op }: { op: LockOperationTrace }) { // 第60天：定义单条锁操作追踪组件。
  return ( // 第60天：返回单条锁操作追踪。
    <li className="rounded border border-cyan-100 bg-white/70 px-2 py-1 text-[10px] dark:border-cyan-900/40 dark:bg-zinc-950/30"> {/* 第60天：定义追踪行容器。 */}
      <p className="font-mono font-semibold text-cyan-950 dark:text-cyan-100">{op.operation} · {op.status} · {op.latencyMs}ms</p> {/* 第60天：展示操作名称、状态和耗时。 */}
      <p className="break-words text-cyan-800 dark:text-cyan-200">key（锁）: {op.key} | owner（持有者）: {op.owner ?? DASH}</p> {/* 第60天：展示锁 Key 和 owner。 */}
      <p className="break-words text-zinc-500 dark:text-zinc-400">{op.note} · {formatTime(op.createdAt)}</p> {/* 第60天：展示中文说明和时间。 */}
    </li> /* 第60天：结束追踪行容器。 */
  ); // 第60天：结束追踪行返回。
} // 第60天：结束 OperationRow 组件。

export function LockExplorer({ snapshot, loading, handleForceUnlock }: LockExplorerProps) { // 第60天：导出 Lock Explorer 组件。
  const metrics = snapshot?.metrics; // 第60天：读取锁指标。
  const locks = snapshot?.locks ?? []; // 第60天：读取锁列表，缺省为空数组。
  const operations = snapshot?.operations ?? []; // 第60天：读取锁操作追踪，缺省为空数组。
  return ( // 第60天：返回 Lock Explorer UI。
    <div className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 第60天：定义 Lock Explorer 外层容器。 */}
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Lock Explorer（锁浏览器）Day 61</h2> {/* 第60天：展示锁浏览器标题。 */}
      <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第60天：Production Infrastructure V3（生产基础设施第3版），使用 Redis SET key value NX PX 构建 Distributed Lock（分布式锁），观察 Lock Key、Owner、TTL、Renew Count、Heartbeat Renewal 和 Force Unlock。</p> {/* 第60天：展示锁浏览器说明。 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"> {/* 第60天：定义锁指标网格。 */}
        <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 px-2 py-1.5 dark:border-cyan-900/40 dark:bg-cyan-950/20">total locks（当前锁）: {metrics?.totalLocks ?? 0}</div> {/* 第60天：展示当前活跃锁数量。 */}
        <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-2 py-1.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">acquire ok（获取成功）: {metrics?.acquireSuccess ?? 0}</div> {/* 第60天：展示获取锁成功次数。 */}
        <div className="rounded-lg border border-red-200/70 bg-red-50/60 px-2 py-1.5 dark:border-red-900/40 dark:bg-red-950/20">acquire fail（获取失败）: {metrics?.acquireFailure ?? 0}</div> {/* 第60天：展示获取锁失败次数。 */}
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">renew（续期）: {metrics?.renewCount ?? 0}</div> {/* 第60天：展示续期次数。 */}
        <div className="rounded-lg border border-violet-200/70 bg-violet-50/60 px-2 py-1.5 dark:border-violet-900/40 dark:bg-violet-950/20">avg wait（平均等待）: {metrics?.avgWaitTime ?? 0}ms</div> {/* 第60天：展示平均获取锁耗时。 */}
        <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/60 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/20">expired（过期观测）: {metrics?.expiredLocks ?? 0}</div> {/* 第60天：展示过期锁观测次数。 */}
      </div> {/* 第60天：结束锁指标网格。 */}
      <p className="mt-2 font-mono text-[10px] text-cyan-900 dark:text-cyan-100">backend（后端）: {snapshot?.backend ?? "redis-string"} | namespace（命名空间）: {snapshot?.namespace ?? "Redis 未连接"}</p> {/* 第60天：展示锁后端和 Redis 命名空间。 */}
      <div className="mt-3 rounded-lg border border-cyan-200/70 bg-cyan-50/40 px-2 py-2 dark:border-cyan-900/40 dark:bg-cyan-950/15"> {/* 第60天：定义当前锁列表面板。 */}
        <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Active Locks（活跃锁）</h3> {/* 第60天：展示活跃锁标题。 */}
        <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto"> {/* 第60天：定义活跃锁列表。 */}
          {locks.length === 0 ? <li className="rounded border border-dashed border-cyan-200 px-2 py-3 text-center text-[11px] text-cyan-700 dark:border-cyan-900/50 dark:text-cyan-300">暂无活跃锁；创建 Workflow Job 或带 resourceKey 的任务后会出现。</li> : null} {/* 第60天：展示空状态。 */}
          {locks.map((lock) => <LockRow key={lock.key} lock={lock} loading={loading} handleForceUnlock={handleForceUnlock} />)} {/* 第60天：渲染每一把活跃锁。 */}
        </ul> {/* 第60天：结束活跃锁列表。 */}
      </div> {/* 第60天：结束当前锁列表面板。 */}
      <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/60 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 第60天：定义锁操作追踪面板。 */}
        <h3 className="text-xs font-semibold text-cyan-950 dark:text-cyan-100">Lock Operation Trace（锁操作追踪）</h3> {/* 第60天：展示锁操作追踪标题。 */}
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto"> {/* 第60天：定义锁操作追踪列表。 */}
          {operations.length === 0 ? <li className="text-[11px] text-zinc-400">暂无 Lock Trace；获取锁、续期、释放或强制解锁后会出现。</li> : null} {/* 第60天：展示追踪空状态。 */}
          {operations.slice(0, 12).map((op) => <OperationRow key={op.id} op={op} />)} {/* 第60天：展示最近 12 条锁操作。 */}
        </ul> {/* 第60天：结束锁操作追踪列表。 */}
      </div> {/* 第60天：结束锁操作追踪面板。 */}
    </div> /* 第60天：结束 Lock Explorer 外层容器。 */
  ); // 第60天：结束 Lock Explorer 返回。
} // 第60天：结束 LockExplorer 组件。
