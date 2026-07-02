"use client"; /* 第48天：声明交互式缓存浏览器为客户端组件。 */

import { useCallback, useEffect, useState } from "react"; /* 第48天：引入加载、标签切换与副作用所需 React Hooks。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第48天：引入统一 API 响应解析与错误类型。 */
import type { CacheSnapshot } from "@/lib/cache/cache-types"; /* 第48天：引入缓存看板快照类型。 */

type CacheTab = "overview" | "entries" | "events"; /* 第48天：定义缓存浏览器三个标签页。 */

function formatCost(value: number): string { /* 第48天：定义美元费用格式化函数。 */
  return `$${value.toFixed(6)}`; /* 第48天：使用六位小数展示小额节省费用。 */
} /* 第48天：结束费用格式化函数。 */

function formatDuration(value: number): string { /* 第48天：定义毫秒耗时格式化函数。 */
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`; /* 第48天：根据耗时大小选择秒或毫秒单位。 */
} /* 第48天：结束耗时格式化函数。 */

function formatTime(value: number): string { /* 第48天：定义时间戳格式化函数。 */
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false }); /* 第48天：以 24 小时制展示时分秒。 */
} /* 第48天：结束时间格式化函数。 */

export function CacheExplorer() { /* 第48天：定义 Cache Explorer（缓存浏览器）主组件。 */
  const [snapshot, setSnapshot] = useState<CacheSnapshot | null>(null); /* 第48天：保存接口返回的完整缓存快照。 */
  const [activeTab, setActiveTab] = useState<CacheTab>("overview"); /* 第48天：保存当前选中的标签页。 */
  const [loading, setLoading] = useState(true); /* 第48天：保存首次加载与重新运行状态。 */
  const [error, setError] = useState(""); /* 第48天：保存用户可读错误信息。 */

  const loadSnapshot = useCallback(async (force: boolean) => { /* 第48天：定义读取或强制重跑缓存演示的函数。 */
    setLoading(true); /* 第48天：进入加载状态并禁用按钮。 */
    setError(""); /* 第48天：清空上一次错误信息。 */
    try { /* 第48天：捕获网络与响应解析异常。 */
      const response = await fetch("/api/cache", { method: force ? "POST" : "GET" }); /* 第48天：按需读取缓存或强制运行新的缓存演示。 */
      setSnapshot(await readApiData<CacheSnapshot>(response)); /* 第48天：解析并保存缓存看板快照。 */
    } catch (loadError) { /* 第48天：处理缓存接口加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Day 58 Redis 语义缓存数据失败"); /* 第58天：写入统一用户可读错误。 */
    } finally { /* 第48天：确保请求结束后恢复交互状态。 */
      setLoading(false); /* 第48天：退出加载状态。 */
    } /* 第48天：结束接口异常处理。 */
  }, []); /* 第48天：保持加载函数引用稳定。 */

  const invalidateEntry = useCallback(async (id: string) => { /* 第48天：定义手动失效单条缓存的函数。 */
    setLoading(true); /* 第48天：进入加载状态。 */
    setError(""); /* 第48天：清空错误信息。 */
    try { /* 第48天：捕获失效请求异常。 */
      const response = await fetch(`/api/cache?id=${encodeURIComponent(id)}`, { method: "DELETE" }); /* 第48天：调用失效接口删除指定缓存条目。 */
      setSnapshot(await readApiData<CacheSnapshot>(response)); /* 第48天：用失效后的快照刷新视图。 */
    } catch (invalidateError) { /* 第48天：处理失效请求失败。 */
      setError(invalidateError instanceof ApiClientError ? invalidateError.message : "失效缓存条目失败"); /* 第48天：写入统一用户可读错误。 */
    } finally { /* 第48天：恢复交互状态。 */
      setLoading(false); /* 第48天：退出加载状态。 */
    } /* 第48天：结束失效异常处理。 */
  }, []); /* 第48天：保持失效函数引用稳定。 */

  useEffect(() => { /* 第48天：组件挂载后自动加载最近一次缓存快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第48天：延迟触发请求以避免副作用主体同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第48天：组件卸载时清理首次加载定时器。 */
  }, [loadSnapshot]); /* 第48天：依赖稳定的快照加载函数。 */

  const tabs: Array<{ id: CacheTab; label: string }> = [{ id: "overview", label: "缓存概览" }, { id: "entries", label: "缓存条目" }, { id: "events", label: "查询事件" }]; /* 第48天：定义与任务目标对应的三个标签页。 */

  return ( /* 第48天：返回缓存浏览器完整视图。 */
    <section className="shrink-0 border-b border-violet-200/70 px-4 py-3 dark:border-violet-900/40"> {/* 第48天：定义缓存浏览器外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第48天：排列标题说明与重新运行按钮。 */}
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cache Explorer（缓存浏览器）</p><p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 58 · Redis-backed Semantic Cache：通过 CacheStore 抽象把语义缓存写入 Redis，并继续观察 Hit Rate、Saved Cost 与 TTL。</p></div> {/* 第58天：展示 Redis 语义缓存看板名称与能力摘要。 */}
        <button type="button" onClick={() => void loadSnapshot(true)} disabled={loading} className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "运行中..." : "重新运行"}</button> {/* 第48天：提供重新生成完整缓存演示链路的入口。 */}
      </div> {/* 第48天：结束标题与按钮布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第48天：按需展示接口错误。 */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 58 Redis 缓存分析标签页"> {/* 第58天：定义三栏标签页导航。 */}
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-md px-1 py-1 text-[10px] font-semibold transition ${activeTab === tab.id ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第48天：渲染可切换且带可访问状态的标签按钮。 */}
      </div> {/* 第48天：结束标签页导航。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-violet-200 py-5 text-center text-[11px] text-violet-700 dark:border-violet-900/50 dark:text-violet-300">正在生成 Day 58 Redis 语义缓存账本...</p> : null} {/* 第58天：快照未就绪时展示加载占位。 */}
      {snapshot && activeTab === "overview" ? <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-1.5"><div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/25"><p className="text-[9px] text-violet-700">Hit Rate（命中率）</p><p className="mt-0.5 font-mono text-base font-semibold">{(snapshot.metrics.hitRate * 100).toFixed(1)}%</p></div><div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/25"><p className="text-[9px] text-violet-700">Saved Cost（节省费用）</p><p className="mt-0.5 font-mono text-base font-semibold">{formatCost(snapshot.metrics.savedCost)}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Backend（后端）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.backend}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Hit / Miss（命中/未命中）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.hitCount} / {snapshot.metrics.missCount}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Saved Tokens（节省词元）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.savedTokens.toLocaleString()}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Threshold（命中阈值）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.threshold}</p></div></div></div> : null} {/* 第58天：展示命中率、节省费用、缓存后端、命中未命中次数、节省词元与阈值。 */}
      {snapshot && activeTab === "entries" ? <div className="mt-3 space-y-2">{snapshot.entries.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-[10px] text-zinc-400 dark:border-zinc-700">暂无缓存条目</p> : snapshot.entries.map((entry) => <div key={entry.id} className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"><div className="flex items-center justify-between gap-2"><p className="truncate text-[11px] font-semibold" title={entry.query}>{entry.query}</p><button type="button" onClick={() => void invalidateEntry(entry.id)} disabled={loading} className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 transition hover:bg-red-500/25 disabled:opacity-50 dark:text-red-300">失效</button></div><p className="mt-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">{entry.answerPreview}</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-zinc-500"><span>命中 {entry.hitCount} 次</span><span>节省 {formatCost(entry.savedCost)}</span><span>分数 {entry.score}</span><span>TTL {entry.ttlPolicy}</span><span className={entry.expired ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>{entry.expired ? "已过期" : entry.expiresAt ? `过期于 ${formatTime(entry.expiresAt)}` : "永不过期"}</span></div></div>)}</div> : null} {/* 第48天：展示每条缓存的查询、答案预览、命中次数、节省费用、TTL 与过期状态并支持手动失效。 */}
      {snapshot && activeTab === "events" ? <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"><table className="w-full min-w-[420px] text-left text-[9px]"><thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900"><tr><th className="px-2 py-1.5">Query（查询）</th><th className="px-2 py-1.5">状态</th><th className="px-2 py-1.5">相似度</th><th className="px-2 py-1.5">耗时</th><th className="px-2 py-1.5">节省</th></tr></thead><tbody>{snapshot.events.map((event, index) => <tr key={`${event.traceId}-${index}`} className="border-t border-zinc-100 dark:border-zinc-800"><td className="px-2 py-1.5"><p className="truncate font-semibold" title={event.query}>{event.query}</p></td><td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 font-semibold ${event.status === "hit" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{event.status === "hit" ? "命中" : "未命中"}</span></td><td className="px-2 py-1.5 font-mono">{event.similarity.toFixed(3)}</td><td className="px-2 py-1.5 font-mono">{formatDuration(event.durationMs)}</td><td className="px-2 py-1.5 font-mono text-violet-700 dark:text-violet-300">{formatCost(event.savedCost)}</td></tr>)}</tbody></table></div> : null} {/* 第48天：展示演示查询序列的命中状态、相似度、耗时与节省费用。 */}
    </section> /* 第48天：结束缓存浏览器外层容器。 */
  ); /* 第48天：结束缓存浏览器返回。 */
} /* 第48天：结束 CacheExplorer（缓存浏览器）组件。 */
