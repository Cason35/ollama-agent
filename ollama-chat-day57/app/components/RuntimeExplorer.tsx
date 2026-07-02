"use client"; /* 第57天：声明为客户端组件，用于在浏览器中拉取运行时决策看板。 */

import { useEffect, useState } from "react"; /* 第57天：引入 React 状态和副作用 Hook。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第57天：引入统一 API 解析工具。 */
import type { RuntimeDashboardSnapshot, RuntimeDecision, RuntimeMetrics } from "@/lib/runtime/runtime-types"; /* 第57天：引入 Runtime Explorer 所需类型。 */

function formatMoney(value: number): string { /* 第57天：定义估算成本格式化函数。 */
  return `$${value.toFixed(6)}`; /* 第57天：把成本格式化为六位小数美元文本。 */
} /* 第57天：结束成本格式化函数。 */

function MetricCard({ label, value }: { label: string; value: number | string }) { /* 第57天：定义运行时指标卡片组件。 */
  return ( /* 第57天：返回指标卡片视图。 */
    <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/70 px-2 py-2 text-center dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 第57天：定义指标卡片容器。 */}
      <p className="text-[10px] text-cyan-700 dark:text-cyan-300">{label}</p> {/* 第57天：展示指标名称。 */}
      <p className="font-mono text-sm font-semibold text-cyan-950 dark:text-cyan-100">{value}</p> {/* 第57天：展示指标值。 */}
    </div> /* 第57天：结束指标卡片容器。 */
  ); /* 第57天：结束指标卡片返回。 */
} /* 第57天：结束 MetricCard 组件。 */

function StrategyPills({ decision }: { decision: RuntimeDecision }) { /* 第57天：定义决策策略标签组件。 */
  const items = [decision.promptStrategy, decision.modelStrategy, decision.collaborationStrategy, decision.cacheStrategy, decision.retrievalStrategy, decision.memoryStrategy]; /* 第57天：收集需要展示的策略值。 */
  return ( /* 第57天：返回策略标签列表。 */
    <div className="mt-2 flex flex-wrap gap-1"> {/* 第57天：定义策略标签容器。 */}
      {items.map((item) => ( /* 第57天：遍历每个策略。 */
        <span key={item} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[9px] text-cyan-800 ring-1 ring-cyan-200 dark:bg-zinc-950/40 dark:text-cyan-200 dark:ring-cyan-900/50">{item}</span> /* 第57天：展示单个策略标签。 */
      ))} {/* 第57天：结束策略遍历。 */}
    </div> /* 第57天：结束策略标签容器。 */
  ); /* 第57天：结束策略标签返回。 */
} /* 第57天：结束 StrategyPills 组件。 */

function MetricsPanel({ metrics }: { metrics: RuntimeMetrics }) { /* 第57天：定义运行时指标面板。 */
  return ( /* 第57天：返回指标面板视图。 */
    <div className="mt-3 grid grid-cols-2 gap-2"> {/* 第57天：定义两列指标网格。 */}
      <MetricCard label="Fast（快速）" value={metrics.fastStrategyUsage} /> {/* 第57天：展示快速策略次数。 */}
      <MetricCard label="Balanced（平衡）" value={metrics.balancedUsage} /> {/* 第57天：展示平衡策略次数。 */}
      <MetricCard label="Quality（质量）" value={metrics.qualityUsage} /> {/* 第57天：展示质量策略次数。 */}
      <MetricCard label="Decision（决策耗时）" value={`${metrics.avgDecisionTime}ms`} /> {/* 第57天：展示平均决策耗时。 */}
      <MetricCard label="Cost（成本）" value={formatMoney(metrics.avgEstimatedCost)} /> {/* 第57天：展示平均估算成本。 */}
      <MetricCard label="Latency（延迟）" value={`${metrics.avgEstimatedLatency}ms`} /> {/* 第57天：展示平均估算延迟。 */}
    </div> /* 第57天：结束指标网格。 */
  ); /* 第57天：结束指标面板返回。 */
} /* 第57天：结束 MetricsPanel 组件。 */

export function RuntimeExplorer() { /* 第57天：导出 Runtime Explorer（运行时浏览器）组件。 */
  const [snapshot, setSnapshot] = useState<RuntimeDashboardSnapshot | null>(null); /* 第57天：保存 API 返回的看板快照。 */
  const [error, setError] = useState(""); /* 第57天：保存加载错误提示。 */

  useEffect(() => { /* 第57天：组件挂载后加载运行时决策看板。 */
    let cancelled = false; /* 第57天：定义取消标记，避免卸载后更新状态。 */
    (async () => { /* 第57天：定义异步加载函数。 */
      try { /* 第57天：捕获加载异常。 */
        const res = await fetch("/api/runtime/decision"); /* 第57天：请求运行时决策看板接口。 */
        const data = await readApiData<RuntimeDashboardSnapshot>(res); /* 第57天：解析统一响应包。 */
        if (!cancelled) setSnapshot(data); /* 第57天：未取消时写入快照。 */
      } catch (err) { /* 第57天：处理加载失败。 */
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : "加载 Day57 Runtime Decision Explorer 失败"); /* 第57天：写入用户可读错误。 */
      } /* 第57天：结束异常处理。 */
    })(); /* 第57天：立即执行加载函数。 */
    return () => { cancelled = true; }; /* 第57天：卸载时标记取消。 */
  }, []); /* 第57天：仅挂载时加载一次。 */

  return ( /* 第57天：返回 Runtime Explorer 视图。 */
    <div className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 第57天：定义运行时浏览器外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第57天：定义标题和徽标布局。 */}
        <div> {/* 第57天：定义标题文本容器。 */}
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Runtime Decision Explorer（运行时决策浏览器）</h2> {/* 第57天：展示运行时决策浏览器标题。 */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第57天：Adaptive Runtime Decision Engine 会根据 RuntimeContext 自动选择 Prompt、Model、Collaboration、Cache、Retrieval 和 Memory 策略。</p> {/* 第57天：说明本面板用途。 */}
        </div> {/* 第57天：结束标题文本容器。 */}
        <span className="shrink-0 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-800 ring-1 ring-cyan-500/25 dark:text-cyan-200">Day 57</span> {/* 第57天：展示当前日徽标。 */}
      </div> {/* 第57天：结束标题和徽标布局。 */}

      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第57天：按需展示错误提示。 */}

      {snapshot ? ( /* 第57天：判断是否已加载看板快照。 */
        <> {/* 第57天：使用片段包裹已加载内容。 */}
          <MetricsPanel metrics={snapshot.metrics} /> {/* 第57天：展示运行时指标。 */}
          <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/70 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 第57天：定义典型场景预览容器。 */}
            <p className="text-[11px] font-semibold text-cyan-950 dark:text-cyan-100">Decision Rules（决策规则预览）</p> {/* 第57天：展示预览标题。 */}
            <ol className="mt-2 space-y-2"> {/* 第57天：定义预览列表。 */}
              {snapshot.previews.map((preview) => ( /* 第57天：遍历典型决策预览。 */
                <li key={preview.label} className="rounded-md border border-cyan-100 bg-cyan-50/70 px-2 py-2 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 第57天：定义单条预览卡片。 */}
                  <p className="font-semibold text-cyan-950 dark:text-cyan-100">{preview.label}</p> {/* 第57天：展示预览场景名称。 */}
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">{preview.context.taskType} / {preview.context.complexity} / {preview.context.latencyPreference} / budget {preview.context.budgetLevel}</p> {/* 第57天：展示输入上下文摘要。 */}
                  <StrategyPills decision={preview.decision} /> {/* 第57天：展示策略标签。 */}
                  <p className="mt-1 font-mono text-[9px] text-cyan-800 dark:text-cyan-200">cost {formatMoney(preview.decision.estimatedCost)} · latency {preview.decision.estimatedLatencyMs}ms</p> {/* 第57天：展示估算成本和延迟。 */}
                </li> /* 第57天：结束单条预览卡片。 */
              ))} {/* 第57天：结束预览遍历。 */}
            </ol> {/* 第57天：结束预览列表。 */}
          </div> {/* 第57天：结束典型场景预览容器。 */}
          <div className="mt-3 rounded-lg border border-cyan-200/70 bg-white/70 px-2 py-2 dark:border-cyan-900/40 dark:bg-zinc-950/25"> {/* 第57天：定义决策回放容器。 */}
            <p className="text-[11px] font-semibold text-cyan-950 dark:text-cyan-100">Decision Replay（决策回放）</p> {/* 第57天：展示回放标题。 */}
            <ol className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1"> {/* 第57天：定义回放记录列表。 */}
              {snapshot.records.length === 0 ? ( /* 第57天：判断是否暂无历史记录。 */
                <li className="rounded-md border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">暂无真实请求决策；发送聊天、打开 Agent 面板或调用 POST /api/runtime/decision 后会出现。</li> /* 第57天：展示空状态。 */
              ) : snapshot.records.map((record) => ( /* 第57天：遍历历史决策记录。 */
                <li key={record.decisionId} className="rounded-md border border-cyan-100 bg-cyan-50/70 px-2 py-2 text-[10px] dark:border-cyan-900/40 dark:bg-cyan-950/20"> {/* 第57天：定义单条历史记录卡片。 */}
                  <p className="break-all font-mono font-semibold text-cyan-950 dark:text-cyan-100">{record.decisionId}</p> {/* 第57天：展示决策 ID。 */}
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">{record.source} · {new Date(record.createdAt).toLocaleTimeString("zh-CN")} · trace {record.traceId ?? "-"}</p> {/* 第57天：展示来源、时间和 Trace。 */}
                  <StrategyPills decision={record.decision} /> {/* 第57天：展示回放策略标签。 */}
                  <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">{record.decision.reasons.join("；")}</p> {/* 第57天：展示可解释规则命中。 */}
                </li> /* 第57天：结束历史记录卡片。 */
              ))} {/* 第57天：结束历史记录遍历。 */}
            </ol> {/* 第57天：结束回放记录列表。 */}
          </div> {/* 第57天：结束决策回放容器。 */}
        </> /* 第57天：结束已加载片段。 */
      ) : ( /* 第57天：未加载时展示占位。 */
        <p className="mt-3 rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">Day57 Runtime Decision Explorer 加载中...</p> /* 第57天：展示加载占位。 */
      )} {/* 第57天：结束加载状态判断。 */}
    </div> /* 第57天：结束运行时浏览器外层容器。 */
  ); /* 第57天：结束 Runtime Explorer 返回。 */
} /* 第57天：结束 RuntimeExplorer 组件。 */
