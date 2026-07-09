"use client"; /* 第51天：声明为客户端组件，允许拉取模型健康快照并刷新状态。 */

import { useCallback, useEffect, useMemo, useState } from "react"; /* 第51天：引入 React Hooks 管理加载、错误、快照和派生指标。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第51天：引入统一 API 响应解析工具。 */
import type { ModelHealthState, ModelSnapshot } from "@/lib/model/model-profile-types"; /* 第51天：引入模型快照与健康状态类型。 */

const STATE_LABELS: Record<string, string> = { closed: "正常", open: "熔断", half_open: "试探" }; /* 第51天：定义熔断状态中文标签。 */
const STATE_CLASS: Record<string, string> = { closed: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100", open: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100", half_open: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100" }; /* 第51天：定义不同熔断状态对应的语义色样式。 */

function formatPercent(value: number): string { /* 第51天：定义成功率格式化函数。 */
  return `${Math.round(value * 100)}%`; /* 第51天：把 0 到 1 的成功率转换为百分比文本。 */
} /* 第51天：结束成功率格式化函数。 */

function formatTime(value?: number): string { /* 第51天：定义时间戳格式化函数。 */
  if (!value) return "暂无"; /* 第51天：没有时间戳时返回占位文案。 */
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false }); /* 第51天：使用中文地区且 24 小时制展示时间。 */
} /* 第51天：结束时间戳格式化函数。 */

function HealthCard({ item }: { item: ModelHealthState }) { /* 第51天：定义单个模型健康卡片组件。 */
  const stateClass = STATE_CLASS[item.state] ?? STATE_CLASS.closed; /* 第51天：根据状态选择卡片语义颜色。 */
  return ( /* 第51天：返回模型健康卡片 JSX。 */
    <article className={`rounded-lg border p-3 text-xs shadow-sm ${stateClass}`}> {/* 第51天：渲染带状态色的健康卡片容器。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第51天：创建模型 id 与状态徽标布局。 */}
        <div className="min-w-0"> {/* 第51天：包裹模型 id 和调用统计，避免文本溢出。 */}
          <p className="truncate font-mono text-[11px] font-bold">{item.modelId}</p> {/* 第51天：展示模型逻辑 id。 */}
          <p className="mt-1 text-[10px] opacity-75">requests {item.requestCount} · skipped {item.skippedCount}</p> {/* 第51天：展示请求次数与熔断跳过次数。 */}
        </div> {/* 第51天：结束模型 id 区域。 */}
        <span className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-[10px] font-semibold text-current ring-1 ring-current/10 dark:bg-zinc-950/30">{STATE_LABELS[item.state] ?? item.state}</span> {/* 第51天：展示当前熔断状态。 */}
      </div> {/* 第51天：结束卡片头部。 */}
      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px]"> {/* 第51天：用定义列表展示关键健康指标。 */}
        <div> {/* 第51天：成功率指标容器。 */}
          <dt className="opacity-65">successRate</dt> {/* 第51天：展示成功率字段名。 */}
          <dd className="font-bold">{formatPercent(item.successRate)}</dd> {/* 第51天：展示成功率值。 */}
        </div> {/* 第51天：结束成功率指标。 */}
        <div> {/* 第51天：连续失败指标容器。 */}
          <dt className="opacity-65">failures</dt> {/* 第51天：展示连续失败字段名。 */}
          <dd className="font-bold">{item.failureCount}</dd> {/* 第51天：展示连续失败次数。 */}
        </div> {/* 第51天：结束连续失败指标。 */}
        <div> {/* 第51天：备用链触发指标容器。 */}
          <dt className="opacity-65">fallback</dt> {/* 第51天：展示备用链触发字段名。 */}
          <dd className="font-bold">{item.fallbackUsedCount}</dd> {/* 第51天：展示备用链触发次数。 */}
        </div> {/* 第51天：结束备用链触发指标。 */}
        <div> {/* 第51天：最近失败时间指标容器。 */}
          <dt className="opacity-65">lastFail</dt> {/* 第51天：展示最近失败字段名。 */}
          <dd className="font-bold">{formatTime(item.lastFailureAt)}</dd> {/* 第51天：展示最近失败时间。 */}
        </div> {/* 第51天：结束最近失败指标。 */}
      </dl> {/* 第51天：结束指标定义列表。 */}
    </article> /* 第51天：结束模型健康卡片。 */
  ); /* 第51天：返回 JSX 结束。 */
} /* 第51天：结束 HealthCard 组件。 */

export function ModelHealthDashboard() { /* 第51天：定义 Model Health Dashboard（模型健康仪表盘）主组件。 */
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null); /* 第51天：保存模型接口返回的完整快照。 */
  const [loading, setLoading] = useState(true); /* 第51天：保存刷新按钮和占位状态。 */
  const [error, setError] = useState(""); /* 第51天：保存接口错误文本。 */

  const loadSnapshot = useCallback(async () => { /* 第51天：定义刷新模型健康快照的异步函数。 */
    setLoading(true); /* 第51天：进入加载状态。 */
    setError(""); /* 第51天：清空旧错误。 */
    try { /* 第51天：捕获接口请求或解析错误。 */
      const response = await fetch("/api/model", { method: "GET" }); /* 第51天：读取模型档案、路由和健康状态快照。 */
      setSnapshot(await readApiData<ModelSnapshot>(response)); /* 第51天：解析统一响应并写入状态。 */
    } catch (loadError) { /* 第51天：处理加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载模型健康状态失败"); /* 第51天：写入可展示错误信息。 */
    } finally { /* 第51天：无论成功失败都结束加载状态。 */
      setLoading(false); /* 第51天：退出加载状态。 */
    } /* 第51天：结束 finally。 */
  }, []); /* 第51天：刷新函数无外部依赖。 */

  useEffect(() => { /* 第51天：组件挂载后自动加载一次健康快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(), 0); /* 第51天：延迟到事件循环后发起请求，避免 effect 同步更新。 */
    return () => window.clearTimeout(timer); /* 第51天：卸载时清理定时器。 */
  }, [loadSnapshot]); /* 第51天：依赖稳定刷新函数。 */

  const metricCards = useMemo(() => { /* 第51天：根据健康快照派生顶部指标卡片。 */
    if (!snapshot) return []; /* 第51天：快照未加载时返回空指标。 */
    return [{ label: "模型总数", value: snapshot.models.length }, { label: "熔断中", value: snapshot.health.openModelCount }, { label: "备用触发", value: snapshot.health.fallbackUsedCount }, { label: "更新时间", value: new Date(snapshot.health.generatedAt).toLocaleTimeString("zh-CN", { hour12: false }) }]; /* 第51天：返回模型总数、熔断数量、备用链次数和更新时间。 */
  }, [snapshot]); /* 第51天：仅在快照变化时重新计算指标。 */

  return ( /* 第51天：返回模型健康仪表盘 JSX。 */
    <section className="space-y-3"> {/* 第51天：创建健康仪表盘分区。 */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第51天：创建标题与刷新按钮容器。 */}
        <div className="flex items-start justify-between gap-3"> {/* 第51天：左右分布标题说明和按钮。 */}
          <div className="min-w-0"> {/* 第51天：标题区域允许收缩。 */}
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Model Health Dashboard</p> {/* 第51天：展示英文仪表盘标题。 */}
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 51：观察 fallback（备用链）、Circuit Breaker（熔断器）、successRate（成功率）与 lastFailureAt（最近失败）。</p> {/* 第51天：展示本日能力说明。 */}
          </div> {/* 第51天：结束标题区域。 */}
          <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="h-8 shrink-0 rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "加载" : "刷新"}</button> {/* 第51天：提供手动刷新健康状态入口。 */}
        </div> {/* 第51天：结束标题行。 */}
        <div className="mt-3 grid grid-cols-2 gap-2"> {/* 第51天：创建顶部指标卡片网格。 */}
          {metricCards.map((metric, index) => <div key={metric.label} className={`rounded-lg p-2 ${index === 1 && Number(metric.value) > 0 ? "bg-red-50 text-red-900 dark:bg-red-950/25 dark:text-red-100" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"}`}><p className="text-[9px] font-semibold opacity-65">{metric.label}</p><p className="mt-0.5 truncate font-mono text-base font-bold">{metric.value}</p></div>)} {/* 第51天：渲染模型总数、熔断数量、备用触发和更新时间。 */}
        </div> {/* 第51天：结束指标网格。 */}
      </div> {/* 第51天：结束标题与指标容器。 */}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第51天：按需展示接口错误。 */}
      {!snapshot ? <div className="rounded-lg border border-dashed border-zinc-300 bg-white/70 px-3 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/20 dark:text-zinc-400">正在读取模型健康快照...</div> : null} {/* 第51天：快照未就绪时展示加载占位。 */}
      {snapshot ? <div className="space-y-2">{snapshot.health.models.map((item) => <HealthCard key={item.modelId} item={item} />)}</div> : null} {/* 第51天：快照就绪后展示每个模型健康卡片。 */}
    </section> /* 第51天：结束健康仪表盘分区。 */
  ); /* 第51天：返回 JSX 结束。 */
} /* 第51天：结束 ModelHealthDashboard 主组件。 */
