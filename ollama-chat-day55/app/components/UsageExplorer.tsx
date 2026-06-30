"use client"; /* 第47天：声明交互式用量浏览器为客户端组件。 */

import { useCallback, useEffect, useState } from "react"; /* 第47天：引入加载、标签切换和副作用所需 React Hooks。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第47天：引入统一 API 响应解析与错误类型。 */
import type { PromptROIVariant, UsageAggregate, UsageComponentType, UsageDashboardSnapshot } from "@/lib/usage/usage-types"; /* 第47天：引入用量看板展示所需类型。 */

type UsageTab = "overview" | "records" | "breakdown" | "roi"; /* 第47天：定义用量浏览器四个标签页。 */

const componentLabels: Record<UsageComponentType, string> = { agent: "Agent（智能体）", tool: "Tool（工具）", reflection: "Reflection（反思）", evaluation: "Evaluation（评估）" }; /* 第47天：定义组件类型的中英文展示名称。 */

function formatCost(value: number): string { /* 第47天：定义美元费用格式化函数。 */
  return `$${value.toFixed(6)}`; /* 第47天：使用六位小数展示小额模型调用费用。 */
} /* 第47天：结束美元费用格式化函数。 */

function formatDuration(value: number): string { /* 第47天：定义毫秒耗时格式化函数。 */
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`; /* 第47天：根据耗时大小选择秒或毫秒单位。 */
} /* 第47天：结束耗时格式化函数。 */

function UsageSummaryList({ title, items }: { title: string; items: UsageAggregate[] }) { /* 第47天：定义 Agent 或 Tool 聚合排行列表。 */
  return ( /* 第47天：返回聚合排行卡片。 */
    <div className="rounded-lg border border-violet-200/70 bg-violet-50/55 p-2.5 dark:border-violet-900/50 dark:bg-violet-950/20"> {/* 第47天：定义聚合排行卡片容器。 */}
      <p className="text-[11px] font-semibold text-violet-950 dark:text-violet-100">{title}</p> {/* 第47天：展示排行标题。 */}
      <ul className="mt-2 space-y-1.5"> {/* 第47天：定义聚合排行列表。 */}
        {items.map((item) => <li key={item.key} className="rounded-md bg-white/75 px-2 py-1.5 text-[10px] dark:bg-zinc-950/30"><div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{item.componentId}</span><span className="font-mono text-violet-700 dark:text-violet-300">{formatCost(item.estimatedCost)}</span></div><p className="mt-0.5 text-zinc-500">{item.totalTokens.toLocaleString()} tokens · {formatDuration(item.durationMs)} · {item.recordCount} 次</p></li>)} {/* 第47天：展示每个组件的词元、费用、耗时和调用次数。 */}
      </ul> {/* 第47天：结束聚合排行列表。 */}
    </div> /* 第47天：结束聚合排行卡片容器。 */
  ); /* 第47天：结束聚合排行卡片返回。 */
} /* 第47天：结束 UsageSummaryList 组件。 */

function PromptROICard({ variant, recommended }: { variant: PromptROIVariant; recommended: boolean }) { /* 第47天：定义单个提示词 ROI 版本卡片。 */
  return ( /* 第47天：返回提示词 ROI 卡片。 */
    <div className={`rounded-lg border p-2.5 ${recommended ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-950/25" : "border-zinc-200 bg-white/70 dark:border-zinc-800 dark:bg-zinc-950/25"}`}> {/* 第47天：根据推荐状态选择语义颜色。 */}
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Prompt {variant.version}</p>{recommended ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">推荐</span> : null}</div> {/* 第47天：展示提示词版本和推荐徽标。 */}
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">{variant.description}</p> {/* 第47天：展示提示词策略说明。 */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center"><div className="rounded bg-white/70 p-1.5 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Score</p><p className="font-mono text-xs font-semibold">{variant.score}</p></div><div className="rounded bg-white/70 p-1.5 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Cost</p><p className="font-mono text-[10px] font-semibold">{formatCost(variant.estimatedCost)}</p></div><div className="rounded bg-white/70 p-1.5 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Cost/Score</p><p className="font-mono text-[10px] font-semibold">${variant.costPerScore.toFixed(8)}</p></div></div> {/* 第47天：展示质量分、费用和单位质量成本。 */}
      <p className="mt-1.5 font-mono text-[9px] text-zinc-500">{variant.inputTokens} input + {variant.outputTokens} output = {variant.totalTokens} tokens</p> {/* 第47天：展示提示词输入输出词元构成。 */}
    </div> /* 第47天：结束提示词 ROI 卡片容器。 */
  ); /* 第47天：结束提示词 ROI 卡片返回。 */
} /* 第47天：结束 PromptROICard 组件。 */

export function UsageExplorer() { /* 第47天：定义 Usage Explorer（用量浏览器）主组件。 */
  const [snapshot, setSnapshot] = useState<UsageDashboardSnapshot | null>(null); /* 第47天：保存接口返回的完整用量快照。 */
  const [activeTab, setActiveTab] = useState<UsageTab>("overview"); /* 第47天：保存当前选中的标签页。 */
  const [loading, setLoading] = useState(true); /* 第47天：保存首次加载与重新运行状态。 */
  const [error, setError] = useState(""); /* 第47天：保存用户可读错误信息。 */

  const loadSnapshot = useCallback(async (force: boolean) => { /* 第47天：定义读取或强制重跑用量演示的函数。 */
    setLoading(true); /* 第47天：进入加载状态并禁用重跑按钮。 */
    setError(""); /* 第47天：清空上一次错误信息。 */
    try { /* 第47天：捕获网络与响应解析异常。 */
      const response = await fetch("/api/usage", { method: force ? "POST" : "GET" }); /* 第47天：按需读取缓存或强制运行新的成本观测任务。 */
      setSnapshot(await readApiData<UsageDashboardSnapshot>(response)); /* 第47天：解析并保存用量看板快照。 */
    } catch (loadError) { /* 第47天：处理用量接口加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Day 47 用量与成本数据失败"); /* 第47天：写入统一用户可读错误。 */
    } finally { /* 第47天：确保请求结束后恢复交互状态。 */
      setLoading(false); /* 第47天：退出加载状态。 */
    } /* 第47天：结束接口异常处理。 */
  }, []); /* 第47天：保持加载函数引用稳定。 */

  useEffect(() => { /* 第47天：组件挂载后自动加载最近一次用量快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第47天：延迟触发请求以避免副作用主体同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第47天：组件卸载时清理首次加载定时器。 */
  }, [loadSnapshot]); /* 第47天：依赖稳定的快照加载函数。 */

  const tabs: Array<{ id: UsageTab; label: string }> = [{ id: "overview", label: "用量概览" }, { id: "records", label: "调用明细" }, { id: "breakdown", label: "成本构成" }, { id: "roi", label: "Prompt ROI" }]; /* 第47天：定义与任务目标对应的四个标签页。 */

  return ( /* 第47天：返回用量浏览器完整视图。 */
    <section className="shrink-0 border-b border-violet-200/70 px-4 py-3 dark:border-violet-900/40"> {/* 第47天：定义用量浏览器外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第47天：排列标题说明与重新运行按钮。 */}
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Usage Explorer（用量浏览器）</p><p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 47 · Production Runtime V3：追踪每个 Agent、Tool、Reflection 与 Evaluation 的 Token、Cost、Duration 和 Trace 关联。</p></div> {/* 第47天：展示看板名称与能力摘要。 */}
        <button type="button" onClick={() => void loadSnapshot(true)} disabled={loading} className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "核算中..." : "重新运行"}</button> {/* 第47天：提供重新生成完整用量链路的入口。 */}
      </div> {/* 第47天：结束标题与按钮布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第47天：按需展示接口错误。 */}
      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 47 用量分析标签页"> {/* 第47天：定义四栏标签页导航。 */}
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-md px-1 py-1 text-[9px] font-semibold transition ${activeTab === tab.id ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第47天：渲染可切换且带可访问状态的标签按钮。 */}
      </div> {/* 第47天：结束标签页导航。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-violet-200 py-5 text-center text-[11px] text-violet-700 dark:border-violet-900/50 dark:text-violet-300">正在生成 Day 47 Trace + Cost 用量账本...</p> : null} {/* 第47天：快照未就绪时展示加载占位。 */}
      {snapshot && activeTab === "overview" ? <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-1.5"><div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/25"><p className="text-[9px] text-violet-700">Total Cost（总费用）</p><p className="mt-0.5 font-mono text-base font-semibold">{formatCost(snapshot.metrics.totalCost)}</p></div><div className="rounded-lg bg-violet-50 p-2 dark:bg-violet-950/25"><p className="text-[9px] text-violet-700">Total Tokens（总词元）</p><p className="mt-0.5 font-mono text-base font-semibold">{snapshot.metrics.totalTokens.toLocaleString()}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Avg Cost / Trace</p><p className="mt-0.5 font-mono text-xs font-semibold">{formatCost(snapshot.metrics.avgCostPerTrace)}</p></div><div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[9px] text-zinc-500">Avg Tokens / Task</p><p className="mt-0.5 font-mono text-xs font-semibold">{snapshot.metrics.avgTokensPerTask.toLocaleString()}</p></div></div><div className="grid grid-cols-1 gap-2 xl:grid-cols-2"><UsageSummaryList title={`Most Expensive Agent · ${snapshot.metrics.mostExpensiveAgent?.componentId ?? "暂无"}`} items={snapshot.agentUsage} /><UsageSummaryList title={`Most Expensive Tool · ${snapshot.metrics.mostExpensiveTool?.componentId ?? "暂无"}`} items={snapshot.toolUsage} /></div></div> : null} {/* 第47天：展示总费用、总词元、平均指标以及 Agent/Tool 成本排行。 */}
      {snapshot && activeTab === "records" ? <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"><table className="w-full min-w-[700px] text-left text-[9px]"><thead className="bg-zinc-100 text-zinc-500 dark:bg-zinc-900"><tr><th className="px-2 py-1.5">Component</th><th className="px-2 py-1.5">Prompt</th><th className="px-2 py-1.5">Input</th><th className="px-2 py-1.5">Output</th><th className="px-2 py-1.5">Cost</th><th className="px-2 py-1.5">Duration</th><th className="px-2 py-1.5">Trace / Span</th></tr></thead><tbody>{snapshot.records.map((record, index) => <tr key={`${record.traceId}-${record.spanId}-${record.createdAt}-${index}`} className="border-t border-zinc-100 dark:border-zinc-800"><td className="px-2 py-1.5"><p className="font-semibold">{record.componentId}</p><p className="text-zinc-500">{componentLabels[record.componentType]}</p></td><td className="px-2 py-1.5 font-mono text-[8px] text-teal-700 dark:text-teal-300">{record.promptId ? `${record.promptId} / ${record.promptVersion}` : "未记录"}</td><td className="px-2 py-1.5 font-mono">{record.inputTokens}</td><td className="px-2 py-1.5 font-mono">{record.outputTokens}</td><td className="px-2 py-1.5 font-mono text-violet-700 dark:text-violet-300">{formatCost(record.estimatedCost)}</td><td className="px-2 py-1.5 font-mono">{formatDuration(record.durationMs)}</td><td className="max-w-48 px-2 py-1.5 font-mono text-[8px] text-zinc-500"><p className="truncate" title={record.traceId}>{record.traceId}</p><p className="truncate" title={record.spanId}>{record.spanId}</p></td></tr>)}</tbody></table></div> : null} {/* 第52天：展示每次调用的输入输出词元、费用、耗时、Trace/Span 和 Prompt Version 关联。 */}
      {snapshot && activeTab === "breakdown" ? <div className="mt-3 space-y-2">{snapshot.costBreakdown.map((item) => <div key={`${item.componentType}-${item.componentId}`} className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"><div className="flex items-center justify-between gap-2 text-[10px]"><div><span className="font-semibold">{item.componentId}</span><span className="ml-1 text-zinc-500">{componentLabels[item.componentType]}</span></div><span className="font-mono text-violet-700 dark:text-violet-300">{item.percentage.toFixed(2)}% · {formatCost(item.estimatedCost)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(1, item.percentage)}%` }} /></div></div>)}</div> : null} {/* 第47天：展示每个组件的成本占比与金额。 */}
      {snapshot && activeTab === "roi" ? <div className="mt-3 space-y-2"><div className="grid grid-cols-1 gap-2 xl:grid-cols-2">{snapshot.promptROI.variants.map((variant) => <PromptROICard key={variant.version} variant={variant} recommended={snapshot.promptROI.recommendedVersion === variant.version} />)}</div><div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-[10px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"><p className="font-semibold">推荐 Prompt {snapshot.promptROI.recommendedVersion}</p><p className="mt-1 leading-relaxed">{snapshot.promptROI.reason}</p><p className="mt-1 text-emerald-700 dark:text-emerald-300">质量胜出：{snapshot.promptROI.qualityWinner} · 成本胜出：{snapshot.promptROI.costWinner}</p></div></div> : null} {/* 第47天：展示提示词质量、成本与单位质量成本的综合对比。 */}
    </section> /* 第47天：结束用量浏览器外层容器。 */
  ); /* 第47天：结束用量浏览器返回。 */
} /* 第47天：结束 UsageExplorer（用量浏览器）组件。 */
