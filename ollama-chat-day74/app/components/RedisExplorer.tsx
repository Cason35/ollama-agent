"use client"; /* 第58天：声明 Redis Explorer 为客户端组件，支持刷新、删除和设置过期时间。 */
import { useCallback, useEffect, useState } from "react"; /* 第58天：引入 React Hooks 管理快照、标签页和加载状态。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第58天：引入统一 API 响应解析与错误类型。 */
import type { RedisExplorerSnapshot } from "@/lib/redis/redis-types"; /* 第58天：引入 Redis Explorer 快照类型。 */
type RedisExplorerTab = "overview" | "keys" | "operations"; /* 第58天：定义 Redis Explorer 三个标签页。 */
function formatBytes(value: number): string { /* 第58天：定义字节数格式化函数。 */
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`; /* 第58天：超过 MB 时按 MB 展示。 */
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`; /* 第58天：超过 KB 时按 KB 展示。 */
  return `${value} B`; /* 第58天：不足 KB 时按字节展示。 */
} /* 第58天：结束字节数格式化函数。 */
function formatTtl(value: number): string { /* 第58天：定义 TTL（过期时间）格式化函数。 */
  if (value === -2) return "不存在"; /* 第58天：Redis TTL=-2 表示 Key 不存在。 */
  if (value === -1) return "永不过期"; /* 第58天：Redis TTL=-1 表示 Key 存在但未设置过期时间。 */
  if (value >= 3600) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`; /* 第58天：超过一小时按小时分钟展示。 */
  if (value >= 60) return `${Math.floor(value / 60)}m ${value % 60}s`; /* 第58天：超过一分钟按分钟秒展示。 */
  return `${value}s`; /* 第58天：不足一分钟按秒展示。 */
} /* 第58天：结束 TTL 格式化函数。 */
function formatTime(value: number): string { /* 第58天：定义时间戳格式化函数。 */
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false }); /* 第58天：以中文 24 小时制展示 Redis 操作发生时间。 */
} /* 第58天：结束时间格式化函数。 */
export function RedisExplorer() { /* 第58天：定义 Redis Explorer（Redis 浏览器）主组件。 */
  const [snapshot, setSnapshot] = useState<RedisExplorerSnapshot | null>(null); /* 第58天：保存 Redis Explorer 完整快照。 */
  const [activeTab, setActiveTab] = useState<RedisExplorerTab>("overview"); /* 第58天：保存当前选中的标签页。 */
  const [loading, setLoading] = useState(true); /* 第58天：保存接口加载状态。 */
  const [error, setError] = useState(""); /* 第58天：保存用户可读错误信息。 */
  const loadSnapshot = useCallback(async (seed: boolean) => { /* 第58天：定义读取或写入演示 Key 后刷新快照的函数。 */
    setLoading(true); /* 第58天：进入加载状态。 */
    setError(""); /* 第58天：清空历史错误。 */
    try { /* 第58天：捕获 Redis API 请求异常。 */
      const response = await fetch("/api/redis", { method: seed ? "POST" : "GET" }); /* 第58天：seed=true 时写入演示 Key，否则只读取快照。 */
      setSnapshot(await readApiData<RedisExplorerSnapshot>(response)); /* 第58天：解析 API 响应并保存快照。 */
    } catch (loadError) { /* 第58天：处理 Redis API 加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Redis Explorer 失败"); /* 第58天：写入用户可读错误信息。 */
    } finally { /* 第58天：确保请求完成后恢复交互。 */
      setLoading(false); /* 第58天：退出加载状态。 */
    } /* 第58天：结束 Redis API 请求处理。 */
  }, []); /* 第58天：保持快照加载函数引用稳定。 */
  const deleteKey = useCallback(async (key: string) => { /* 第58天：定义删除指定 Redis Key 的函数。 */
    setLoading(true); /* 第58天：删除期间进入加载状态。 */
    setError(""); /* 第58天：清空历史错误。 */
    try { /* 第58天：捕获删除请求异常。 */
      const response = await fetch(`/api/redis?key=${encodeURIComponent(key)}`, { method: "DELETE" }); /* 第58天：调用 DELETE 接口删除逻辑 Key。 */
      setSnapshot(await readApiData<RedisExplorerSnapshot>(response)); /* 第58天：用删除后的快照刷新页面。 */
    } catch (deleteError) { /* 第58天：处理 Redis Key 删除失败。 */
      setError(deleteError instanceof ApiClientError ? deleteError.message : "删除 Redis Key 失败"); /* 第58天：写入用户可读删除错误。 */
    } finally { /* 第58天：恢复交互状态。 */
      setLoading(false); /* 第58天：退出加载状态。 */
    } /* 第58天：结束删除请求处理。 */
  }, []); /* 第58天：保持删除函数引用稳定。 */
  const expireKey = useCallback(async (key: string) => { /* 第58天：定义给指定 Redis Key 设置 60 秒 TTL 的函数。 */
    setLoading(true); /* 第58天：设置 TTL 期间进入加载状态。 */
    setError(""); /* 第58天：清空历史错误。 */
    try { /* 第58天：捕获 TTL 设置请求异常。 */
      const response = await fetch("/api/redis", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, ttlSeconds: 60 }) }); /* 第58天：调用 PATCH 接口把 Key 过期时间设置为 60 秒。 */
      setSnapshot(await readApiData<RedisExplorerSnapshot>(response)); /* 第58天：用设置 TTL 后的快照刷新页面。 */
    } catch (expireError) { /* 第58天：处理 Redis TTL 设置失败。 */
      setError(expireError instanceof ApiClientError ? expireError.message : "设置 Redis TTL 失败"); /* 第58天：写入用户可读 TTL 错误。 */
    } finally { /* 第58天：恢复交互状态。 */
      setLoading(false); /* 第58天：退出加载状态。 */
    } /* 第58天：结束 TTL 设置请求处理。 */
  }, []); /* 第58天：保持 TTL 设置函数引用稳定。 */
  useEffect(() => { /* 第58天：组件挂载后自动读取 Redis 快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第58天：延迟到下一轮任务加载，避免副作用主体同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第58天：卸载时清理首次加载定时器。 */
  }, [loadSnapshot]); /* 第58天：依赖稳定的快照加载函数。 */
  const tabs: Array<{ id: RedisExplorerTab; label: string }> = [{ id: "overview", label: "概览" }, { id: "keys", label: "Key" }, { id: "operations", label: "Trace" }]; /* 第58天：定义 Redis Explorer 标签页导航。 */
  return ( /* 第58天：返回 Redis Explorer 完整视图。 */
    <section className="shrink-0 border-b border-emerald-200/70 px-4 py-3 dark:border-emerald-900/40"> {/* 第58天：定义 Redis Explorer 外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第58天：排列标题说明与操作按钮。 */}
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Redis Explorer（Redis 浏览器）Day 62</p><p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 62 · Production Infrastructure V2：观察 Redis Queue 与共享状态中心使用的 Key、TTL、Type、Size、命中率、延迟和操作 Trace。</p></div> {/* 第60天：展示 Redis Explorer 标题和能力摘要。 */}
        <div className="flex shrink-0 gap-1"><button type="button" onClick={() => void loadSnapshot(false)} disabled={loading} className="rounded-lg border border-emerald-200 px-2 py-1.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/30">刷新</button><button type="button" onClick={() => void loadSnapshot(true)} disabled={loading || snapshot?.health.healthy === false} className="rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">演示</button></div> {/* 第58天：提供刷新和写入演示 Key 的入口。 */}
      </div> {/* 第58天：结束标题与按钮布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第58天：按需展示接口错误。 */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 62 Redis Explorer 标签页"> {/* 第60天：定义三栏标签页导航。 */}
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-md px-1 py-1 text-[10px] font-semibold transition ${activeTab === tab.id ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-800 dark:text-emerald-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第58天：渲染 Redis Explorer 可切换标签页。 */}
      </div> {/* 第58天：结束标签页导航。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-emerald-200 py-5 text-center text-[11px] text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-300">正在检查 Redis 共享状态中心...</p> : null} {/* 第58天：快照未就绪时展示加载占位。 */}
      {snapshot && activeTab === "overview" ? <div className="mt-3 grid grid-cols-2 gap-1.5"><div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/25"><p className="text-[9px] text-emerald-700">Health（健康）</p><p className="mt-0.5 text-xs font-semibold">{snapshot.health.healthy ? "PONG · 可用" : "不可用"}</p></div><div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/25"><p className="text-[9px] text-emerald-700">Keys（键数）</p><p className="mt-0.5 font-mono text-base font-semibold">{snapshot.metrics.totalKeys}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Hit / Miss（命中/未命中）</p><p className="mt-0.5 font-mono text-xs font-semibold">{(snapshot.metrics.hitRate * 100).toFixed(1)}% / {(snapshot.metrics.missRate * 100).toFixed(1)}%</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Avg Latency（平均延迟）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.avgLatency}ms</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Memory（内存）</p><p className="mt-0.5 font-mono text-xs font-semibold">{formatBytes(snapshot.metrics.memoryUsage)}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Namespace（命名空间）</p><p className="mt-0.5 truncate font-mono text-[10px] font-semibold" title={snapshot.namespace}>{snapshot.namespace}</p></div>{snapshot.health.error ? <p className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">{snapshot.health.error}</p> : null}</div> : null} {/* 第58天：展示 Redis 健康、键数、命中率、延迟、内存和命名空间。 */}
      {snapshot && activeTab === "keys" ? <div className="mt-3 space-y-2">{snapshot.keys.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-[10px] text-zinc-400 dark:border-zinc-700">暂无 Redis Key；启动 Redis 后点击“演示”可写入示例数据。</p> : snapshot.keys.map((item) => <div key={item.key} className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"><div className="flex items-center justify-between gap-2"><p className="truncate font-mono text-[10px] font-semibold" title={item.key}>{item.key}</p><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void expireKey(item.key)} disabled={loading} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-300">60s</button><button type="button" onClick={() => void deleteKey(item.key)} disabled={loading} className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 transition hover:bg-red-500/25 disabled:opacity-50 dark:text-red-300">删除</button></div></div><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-zinc-500"><span>TTL {formatTtl(item.ttl)}</span><span>Type {item.type}</span><span>Size {formatBytes(item.size)}</span></div></div>)}</div> : null} {/* 第58天：展示 Redis Key、TTL、Type、Size，并支持删除和设置 60 秒过期。 */}
      {snapshot && activeTab === "operations" ? <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"><table className="w-full min-w-[520px] text-left text-[9px]"><thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900"><tr><th className="px-2 py-1.5">Operation</th><th className="px-2 py-1.5">Key</th><th className="px-2 py-1.5">Hit</th><th className="px-2 py-1.5">Latency</th><th className="px-2 py-1.5">Time</th></tr></thead><tbody>{snapshot.operations.length === 0 ? <tr><td colSpan={5} className="px-2 py-5 text-center text-zinc-400">暂无 Redis 操作记录</td></tr> : snapshot.operations.map((operation) => <tr key={operation.id} className="border-t border-zinc-100 dark:border-zinc-800"><td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 font-semibold ${operation.status === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>{operation.operation}</span></td><td className="max-w-44 px-2 py-1.5 font-mono"><p className="truncate" title={operation.key ?? operation.error}>{operation.key ?? operation.error ?? "—"}</p></td><td className="px-2 py-1.5 font-mono">{operation.hit === undefined ? "—" : operation.hit ? "hit" : "miss"}</td><td className="px-2 py-1.5 font-mono">{operation.latencyMs}ms</td><td className="px-2 py-1.5 font-mono">{formatTime(operation.createdAt)}</td></tr>)}</tbody></table></div> : null} {/* 第58天：展示 Redis GET/SET/DELETE/EXPIRE 等操作追踪。 */}
    </section> /* 第58天：结束 Redis Explorer 外层容器。 */
  ); /* 第58天：结束 Redis Explorer 返回。 */
} /* 第58天：结束 RedisExplorer（Redis 浏览器）组件。 */

