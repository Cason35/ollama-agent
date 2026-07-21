"use client"; /* 第49天：声明交互式长期记忆浏览器为客户端组件。 */

import { useCallback, useEffect, useState } from "react"; /* 第49天：引入加载、标签切换与副作用所需 React Hooks。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第49天：引入统一 API 响应解析与错误类型。 */
import type { MemoryItemType, MemorySnapshot } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入长期记忆看板快照与类型。 */

type MemoryTab = "overview" | "memories" | "retrieval"; /* 第49天：定义记忆浏览器三个标签页。 */

type TypeFilter = "all" | MemoryItemType; /* 第49天：定义类型筛选选项，包含全部与五种记忆类型。 */

const TYPE_LABELS: Record<MemoryItemType, string> = { fact: "事实", preference: "偏好", experience: "经验", decision: "决策", lesson: "教训" }; /* 第49天：定义记忆类型的中文标签。 */

function formatTime(value: number): string { /* 第49天：定义时间戳格式化函数。 */
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false }); /* 第49天：以 24 小时制展示时分秒。 */
} /* 第49天：结束时间格式化函数。 */

export function MemoryExplorerV2() { /* 第49天：定义 Memory Explorer V2（记忆浏览器第 2 版）主组件。 */
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null); /* 第49天：保存接口返回的完整记忆快照。 */
  const [activeTab, setActiveTab] = useState<MemoryTab>("overview"); /* 第49天：保存当前选中的标签页。 */
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all"); /* 第49天：保存当前选中的类型筛选。 */
  const [loading, setLoading] = useState(true); /* 第49天：保存首次加载与操作进行状态。 */
  const [error, setError] = useState(""); /* 第49天：保存用户可读错误信息。 */

  const loadSnapshot = useCallback(async (force: boolean) => { /* 第49天：定义读取或强制重跑记忆演示的函数。 */
    setLoading(true); /* 第49天：进入加载状态并禁用按钮。 */
    setError(""); /* 第49天：清空上一次错误信息。 */
    try { /* 第49天：捕获网络与响应解析异常。 */
      const response = await fetch("/api/memory", { method: force ? "POST" : "GET" }); /* 第49天：按需读取记忆或强制运行新的记忆演示。 */
      setSnapshot(await readApiData<MemorySnapshot>(response)); /* 第49天：解析并保存记忆看板快照。 */
    } catch (loadError) { /* 第49天：处理记忆接口加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Day 49 长期记忆数据失败"); /* 第49天：写入统一用户可读错误。 */
    } finally { /* 第49天：确保请求结束后恢复交互状态。 */
      setLoading(false); /* 第49天：退出加载状态。 */
    } /* 第49天：结束接口异常处理。 */
  }, []); /* 第49天：保持加载函数引用稳定。 */

  const mutateMemory = useCallback(async (method: "PATCH" | "DELETE", payload: { id: string; pinned?: boolean }) => { /* 第49天：定义编辑、置顶或删除单条记忆的函数。 */
    setLoading(true); /* 第49天：进入加载状态。 */
    setError(""); /* 第49天：清空错误信息。 */
    try { /* 第49天：捕获请求异常。 */
      const response = method === "DELETE" ? await fetch(`/api/memory?id=${encodeURIComponent(payload.id)}`, { method: "DELETE" }) : await fetch("/api/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); /* 第49天：根据动作调用删除或更新接口。 */
      setSnapshot(await readApiData<MemorySnapshot>(response)); /* 第49天：用操作后的快照刷新视图。 */
    } catch (mutateError) { /* 第49天：处理请求失败。 */
      setError(mutateError instanceof ApiClientError ? mutateError.message : "更新记忆条目失败"); /* 第49天：写入统一用户可读错误。 */
    } finally { /* 第49天：恢复交互状态。 */
      setLoading(false); /* 第49天：退出加载状态。 */
    } /* 第49天：结束请求异常处理。 */
  }, []); /* 第49天：保持操作函数引用稳定。 */

  useEffect(() => { /* 第49天：组件挂载后自动加载最近一次记忆快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第49天：延迟触发请求以避免副作用主体同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第49天：组件卸载时清理首次加载定时器。 */
  }, [loadSnapshot]); /* 第49天：依赖稳定的快照加载函数。 */

  const tabs: Array<{ id: MemoryTab; label: string }> = [{ id: "overview", label: "记忆概览" }, { id: "memories", label: "记忆条目" }, { id: "retrieval", label: "经验检索" }]; /* 第49天：定义与任务目标对应的三个标签页。 */
  const typeFilters: TypeFilter[] = ["all", "lesson", "decision", "experience", "fact", "preference"]; /* 第49天：定义类型筛选顺序，优先展示教训与决策。 */
  const visibleItems = snapshot ? snapshot.items.filter((item) => typeFilter === "all" || item.type === typeFilter) : []; /* 第49天：按当前类型筛选记忆条目。 */

  return ( /* 第49天：返回记忆浏览器完整视图。 */
    <section className="shrink-0 border-b border-sky-200/70 px-4 py-3 dark:border-sky-900/40"> {/* 第49天：定义记忆浏览器外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第49天：排列标题说明与重新运行按钮。 */}
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Memory Explorer V2（长期记忆浏览器）</p><p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 49 · Advanced Optimization V2：从历史任务提取 Experience（经验），用综合打分检索复用，并支持 Consolidation（整合）、Importance Decay（重要性衰减）与置顶。</p></div> {/* 第49天：展示看板名称与能力摘要。 */}
        <button type="button" onClick={() => void loadSnapshot(true)} disabled={loading} className="shrink-0 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "运行中..." : "重新运行"}</button> {/* 第49天：提供重新生成完整记忆演示链路的入口。 */}
      </div> {/* 第49天：结束标题与按钮布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第49天：按需展示接口错误。 */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 49 长期记忆分析标签页"> {/* 第49天：定义三栏标签页导航。 */}
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-md px-1 py-1 text-[10px] font-semibold transition ${activeTab === tab.id ? "bg-white text-sky-700 shadow-sm dark:bg-zinc-800 dark:text-sky-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第49天：渲染可切换且带可访问状态的标签按钮。 */}
      </div> {/* 第49天：结束标签页导航。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-sky-200 py-5 text-center text-[11px] text-sky-700 dark:border-sky-900/50 dark:text-sky-300">正在生成 Day 49 长期记忆账本...</p> : null} {/* 第49天：快照未就绪时展示加载占位。 */}
      {snapshot && activeTab === "overview" ? <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-1.5"><div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/25"><p className="text-[9px] text-sky-700">Total Memories（记忆总数）</p><p className="mt-0.5 font-mono text-base font-semibold">{snapshot.metrics.totalMemories}</p></div><div className="rounded-lg bg-sky-50 p-2 dark:bg-sky-950/25"><p className="text-[9px] text-sky-700">Retrieval Hit Rate（检索命中率）</p><p className="mt-0.5 font-mono text-base font-semibold">{(snapshot.metrics.retrievalHitRate * 100).toFixed(1)}%</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Avg Importance（平均重要性）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.avgImportance.toFixed(3)}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Avg Access（平均访问次数）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.avgAccessCount.toFixed(2)}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Consolidation Ratio（整合压缩比）</p><p className="mt-0.5 font-mono text-xs font-semibold">{(snapshot.metrics.consolidationRatio * 100).toFixed(1)}%</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Decay Count（衰减条目数）</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.decayCount}</p></div></div><div className="flex flex-wrap gap-1.5">{(Object.keys(TYPE_LABELS) as MemoryItemType[]).map((type) => <span key={type} className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{TYPE_LABELS[type]} {snapshot.metrics.typeDistribution[type]}</span>)}</div>{snapshot.consolidation ? <p className="rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-300">整合：{snapshot.consolidation.before} 条 → {snapshot.consolidation.after} 条，合并 {snapshot.consolidation.mergedGroups} 组、删除 {snapshot.consolidation.removed} 条重复经验。</p> : null}</div> : null} {/* 第49天：展示记忆总数、命中率、平均重要性、整合压缩比、衰减条目数与类型分布。 */}
      {snapshot && activeTab === "memories" ? <div className="mt-3 space-y-2"><div className="flex flex-wrap gap-1">{typeFilters.map((filter) => <button type="button" key={filter} onClick={() => setTypeFilter(filter)} className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition ${typeFilter === filter ? "bg-sky-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"}`}>{filter === "all" ? "全部" : TYPE_LABELS[filter]}</button>)}</div>{visibleItems.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-[10px] text-zinc-400 dark:border-zinc-700">暂无该类型记忆</p> : visibleItems.map((item) => <div key={item.id} className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"><div className="flex items-center justify-between gap-2"><span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-300">{TYPE_LABELS[item.type]}{item.pinned ? " · 置顶" : ""}{item.consolidatedFrom > 1 ? ` · 整合×${item.consolidatedFrom}` : ""}</span><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void mutateMemory("PATCH", { id: item.id, pinned: !item.pinned })} disabled={loading} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-300">{item.pinned ? "取消置顶" : "置顶"}</button><button type="button" onClick={() => void mutateMemory("DELETE", { id: item.id })} disabled={loading} className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 transition hover:bg-red-500/25 disabled:opacity-50 dark:text-red-300">删除</button></div></div><p className="mt-1 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">{item.content}</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-zinc-500"><span>重要性 {item.importance.toFixed(3)}</span><span>置信度 {item.confidence.toFixed(3)}</span><span>访问 {item.accessCount} 次</span><span>更新 {formatTime(item.lastAccessedAt)}</span>{item.sourceAgentId ? <span>来源 {item.sourceAgentId}</span> : null}</div></div>)}</div> : null} {/* 第49天：展示类型筛选、每条记忆的类型、重要性、置信度、访问次数与最近访问时间，并支持置顶与删除。 */}
      {snapshot && activeTab === "retrieval" ? <div className="mt-3 space-y-2">{!snapshot.retrieval ? <p className="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-[10px] text-zinc-400 dark:border-zinc-700">暂无检索预览</p> : <><p className="rounded-lg bg-sky-500/10 px-2 py-1.5 text-[10px] text-sky-700 dark:text-sky-300">检索查询：{snapshot.retrieval.query}（综合分 = 0.5×语义 + 0.3×重要性 + 0.2×新近度）</p>{snapshot.retrieval.hits.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-200 py-4 text-center text-[10px] text-zinc-400 dark:border-zinc-700">该查询未命中任何经验</p> : snapshot.retrieval.hits.map((hit) => <div key={hit.id} className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"><div className="flex items-center justify-between gap-2"><span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-300">{TYPE_LABELS[hit.type]}</span><span className="font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-300">综合 {hit.score.toFixed(3)}</span></div><p className="mt-1 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">{hit.content}</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-zinc-500"><span>语义 {hit.semantic.toFixed(3)}</span><span>重要性 {hit.importance.toFixed(3)}</span><span>新近度 {hit.recency.toFixed(3)}</span></div></div>)}</>}</div> : null} {/* 第49天：展示“如何学习 Agent”检索预览的综合打分与各分量。 */}
    </section> /* 第49天：结束记忆浏览器外层容器。 */
  ); /* 第49天：结束记忆浏览器返回。 */
} /* 第49天：结束 MemoryExplorerV2（记忆浏览器第 2 版）组件。 */

