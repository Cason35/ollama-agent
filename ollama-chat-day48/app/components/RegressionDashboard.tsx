"use client"; // 第46天：声明回归评估看板为客户端交互组件。

import { useCallback, useEffect, useState } from "react"; /* 第46天：引入加载、状态与副作用 Hooks。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第46天：引入统一 API 响应解析工具。 */
import type { BadCaseRecord, BatchEvaluationRun, BaselineSnapshot, RegressionCaseChange, RegressionDashboardSnapshot } from "@/lib/evaluation/regression-types"; /* 第46天：引入看板展示所需持续评估类型。 */

type DashboardTab = "overview" | "bad-cases" | "observability"; /* 第46天：定义看板三个可交互标签页。 */

function formatPercent(value: number): string { /* 第46天：定义小数通过率格式化函数。 */
  return `${(value * 100).toFixed(1)}%`; /* 第46天：把零到一的小数转换为百分比文本。 */
} /* 第46天：结束通过率格式化函数。 */

function VersionCard({ title, run }: { title: string; run: BaselineSnapshot | BatchEvaluationRun }) { /* 第46天：定义基线或候选版本指标卡。 */
  return ( /* 第46天：返回版本指标卡视图。 */
    <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/60 p-2.5 dark:border-cyan-900/50 dark:bg-cyan-950/20"> {/* 第46天：定义版本指标卡容器。 */}
      <div className="flex items-center justify-between gap-2"> {/* 第46天：排列版本标题和标签。 */}
        <p className="text-[11px] font-semibold text-cyan-950 dark:text-cyan-100">{title}</p> {/* 第46天：展示版本卡标题。 */}
        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 font-mono text-[9px] text-cyan-800 dark:text-cyan-200">{run.version.label}</span> {/* 第46天：展示版本标签。 */}
      </div> {/* 第46天：结束版本标题布局。 */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center"> {/* 第46天：定义版本核心指标网格。 */}
        <div className="rounded-md bg-white/80 p-1.5 dark:bg-zinc-950/30"><p className="text-[9px] text-zinc-500">平均分</p><p className="font-mono text-sm font-semibold">{run.summary.averageScore}</p></div> {/* 第46天：展示版本平均分。 */}
        <div className="rounded-md bg-white/80 p-1.5 dark:bg-zinc-950/30"><p className="text-[9px] text-zinc-500">通过率</p><p className="font-mono text-sm font-semibold">{formatPercent(run.summary.passRate)}</p></div> {/* 第46天：展示版本通过率。 */}
        <div className="rounded-md bg-white/80 p-1.5 dark:bg-zinc-950/30"><p className="text-[9px] text-zinc-500">耗时</p><p className="font-mono text-sm font-semibold">{run.summary.totalDurationMs}ms</p></div> {/* 第46天：展示版本总耗时。 */}
      </div> {/* 第46天：结束版本核心指标网格。 */}
      <p className="mt-2 break-words font-mono text-[9px] text-cyan-800 dark:text-cyan-200">{run.version.model} · {run.version.promptVersion} · {run.version.workflowVersion}</p> {/* 第46天：展示模型、提示词和工作流版本。 */}
    </div> /* 第46天：结束版本指标卡容器。 */
  ); /* 第46天：结束版本指标卡返回。 */
} /* 第46天：结束版本指标卡组件。 */

function CaseChangeList({ title, items, tone }: { title: string; items: RegressionCaseChange[]; tone: "good" | "bad" }) { /* 第46天：定义改进或退步案例列表。 */
  const style = tone === "good" ? "border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100" : "border-red-200 bg-red-50/60 text-red-950 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100"; /* 第46天：根据案例变化方向选择视觉语义。 */
  return ( /* 第46天：返回案例变化列表。 */
    <div className={`rounded-lg border p-2 ${style}`}> {/* 第46天：定义案例变化列表容器。 */}
      <p className="text-[11px] font-semibold">{title} · {items.length}</p> {/* 第46天：展示列表标题与数量。 */}
      <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto pr-1"> {/* 第46天：定义可滚动案例列表。 */}
        {items.length === 0 ? <li className="text-[10px] opacity-70">暂无案例</li> : items.map((item) => ( /* 第46天：按是否有数据渲染占位或案例。 */
          <li key={item.caseId} className="rounded-md bg-white/60 px-2 py-1.5 text-[10px] dark:bg-zinc-950/25"> {/* 第46天：定义单个变化案例卡片。 */}
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.caseName}</span><span className="font-mono">{item.scoreDelta > 0 ? "+" : ""}{item.scoreDelta}</span></div> {/* 第46天：展示案例名称与分数变化。 */}
            <p className="mt-0.5 opacity-80">{item.reason}</p> {/* 第46天：展示变化或退步原因。 */}
            <p className="mt-0.5 line-clamp-2 font-mono text-[9px] opacity-65">{item.outputDiff}</p> {/* 第46天：展示基线与候选输出差异。 */}
          </li> /* 第46天：结束单个变化案例卡片。 */
        ))} {/* 第46天：结束变化案例映射。 */}
      </ul> {/* 第46天：结束可滚动案例列表。 */}
    </div> /* 第46天：结束案例变化列表容器。 */
  ); /* 第46天：结束案例变化列表返回。 */
} /* 第46天：结束案例变化列表组件。 */

function BadCaseCard({ item }: { item: BadCaseRecord }) { /* 第46天：定义单个失败案例管理卡片。 */
  return ( /* 第46天：返回失败案例卡片。 */
    <li className="rounded-lg border border-amber-200/70 bg-amber-50/60 p-2 text-[10px] dark:border-amber-900/50 dark:bg-amber-950/20"> {/* 第46天：定义失败案例卡片容器。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第46天：排列失败类型与修复状态。 */}
        <div><p className="font-semibold text-amber-950 dark:text-amber-100">{item.evaluationCaseId}</p><p className="font-mono text-[9px] text-amber-700 dark:text-amber-300">{item.failureType} · {item.severity}</p></div> {/* 第46天：展示失败案例 ID、类型和严重度。 */}
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${item.regressionPassed ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}`}>{item.regressionPassed ? "已修复并回归通过" : "待修复"}</span> {/* 第46天：展示修复与回归验证状态。 */}
      </div> {/* 第46天：结束失败类型与状态布局。 */}
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">{item.description}</p> {/* 第46天：展示失败现象说明。 */}
      <p className="mt-1 font-mono text-[9px] text-zinc-500">{item.agentId} · {item.promptVersion} · {item.traceId}</p> {/* 第46天：展示智能体、提示词版本和追踪 ID。 */}
      <p className="mt-0.5 text-[9px] text-zinc-500">影响范围：{item.impactScope}</p> {/* 第46天：展示失败影响范围。 */}
    </li> /* 第46天：结束失败案例卡片容器。 */
  ); /* 第46天：结束失败案例卡片返回。 */
} /* 第46天：结束失败案例管理卡片组件。 */

export function RegressionDashboard() { /* 第46天：定义持续评估回归看板。 */
  const [snapshot, setSnapshot] = useState<RegressionDashboardSnapshot | null>(null); /* 第46天：保存回归评估完整快照。 */
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview"); /* 第46天：保存当前标签页。 */
  const [loading, setLoading] = useState(true); /* 第46天：保存首次加载或重新运行状态。 */
  const [error, setError] = useState(""); /* 第46天：保存用户可读错误文本。 */

  const loadSnapshot = useCallback(async (force: boolean) => { /* 第46天：定义读取或重新运行回归评估的函数。 */
    setLoading(true); /* 第46天：进入加载状态。 */
    setError(""); /* 第46天：清空旧错误。 */
    try { /* 第46天：捕获接口加载异常。 */
      const response = await fetch("/api/regression", { method: force ? "POST" : "GET" }); /* 第46天：按需读取缓存或强制重新运行。 */
      setSnapshot(await readApiData<RegressionDashboardSnapshot>(response)); /* 第46天：解析并保存完整回归快照。 */
    } catch (loadError) { /* 第46天：处理回归评估接口异常。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Day 47 继承的回归评估失败"); /* 第47天：更新统一错误文本。 */
    } finally { /* 第46天：确保请求结束后恢复按钮状态。 */
      setLoading(false); /* 第46天：退出加载状态。 */
    } /* 第46天：结束接口加载异常处理。 */
  }, []); /* 第46天：保持加载函数引用稳定。 */

  useEffect(() => { /* 第46天：组件挂载后加载回归评估快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第46天：延迟读取快照，避免在副作用主体同步触发状态更新。 */
    return () => window.clearTimeout(timer); /* 第46天：组件卸载时清理首次加载定时器。 */
  }, [loadSnapshot]); /* 第46天：依赖稳定的加载函数。 */

  const tabs: Array<{ id: DashboardTab; label: string }> = [{ id: "overview", label: "回归概览" }, { id: "bad-cases", label: "失败案例" }, { id: "observability", label: "运行记录" }]; /* 第46天：定义三个看板标签页。 */

  return ( /* 第46天：返回回归评估看板视图。 */
    <section className="shrink-0 border-b border-cyan-200/70 px-4 py-3 dark:border-cyan-900/40"> {/* 第46天：定义回归看板外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第46天：排列看板标题与重新运行按钮。 */}
        <div><p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Regression Dashboard（回归评估看板）</p><p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">固定数据集批量比较 Baseline（基线）与 Candidate（候选），并通过 Quality Gate（质量门禁）阻止质量回退。</p></div> {/* 第46天：展示看板标题与用途说明。 */}
        <button type="button" onClick={() => void loadSnapshot(true)} disabled={loading} className="shrink-0 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "运行中..." : "重新运行"}</button> {/* 第46天：提供可交互的重新运行入口。 */}
      </div> {/* 第46天：结束看板标题布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第46天：按需展示接口错误。 */}
      <div className="mt-3 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"> {/* 第46天：定义看板标签页导航。 */}
        {tabs.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${activeTab === tab.id ? "bg-white text-cyan-700 shadow-sm dark:bg-zinc-800 dark:text-cyan-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第46天：渲染可切换的标签页按钮。 */}
      </div> {/* 第46天：结束标签页导航。 */}

      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-cyan-200 py-5 text-center text-[11px] text-cyan-700 dark:border-cyan-900/50 dark:text-cyan-300">正在准备 Day 47 继承的固定数据集与回归报告...</p> : null} {/* 第47天：快照未就绪时展示加载占位。 */}

      {snapshot && activeTab === "overview" ? ( /* 第46天：判断是否展示回归概览标签页。 */
        <div className="mt-3 space-y-2"> {/* 第46天：定义回归概览内容容器。 */}
          <div className="rounded-lg border border-zinc-200 bg-white/70 p-2 text-[10px] dark:border-zinc-800 dark:bg-zinc-950/25"> {/* 第46天：定义数据集摘要卡片。 */}
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{snapshot.dataset.name}</span><span className="font-mono text-cyan-700">v{snapshot.dataset.version}</span></div> {/* 第46天：展示数据集名称与版本。 */}
            <p className="mt-1 text-zinc-500">{snapshot.dataset.cases.length} 个案例 · 正常 {snapshot.dataset.cases.filter((item) => item.kind === "normal").length} · 失败 {snapshot.dataset.cases.filter((item) => item.kind === "bad_case").length} · 边界 {snapshot.dataset.cases.filter((item) => item.kind === "edge_case").length}</p> {/* 第46天：展示数据集案例分布。 */}
          </div> {/* 第46天：结束数据集摘要卡片。 */}
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2"><VersionCard title="Baseline（基线）" run={snapshot.baseline} /><VersionCard title="Candidate（候选）" run={snapshot.candidate} /></div> {/* 第46天：并列展示基线与候选指标。 */}
          <div className={`rounded-lg border p-2.5 ${snapshot.qualityGate.status === "passed" ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-red-300 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20"}`}> {/* 第46天：根据门禁结果选择通过或阻断视觉。 */}
            <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold">Quality Gate（质量门禁）</p><span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase dark:bg-zinc-950/30">{snapshot.qualityGate.status}</span></div> {/* 第46天：展示质量门禁状态。 */}
            <ul className="mt-1.5 space-y-1">{snapshot.qualityGate.checks.map((check) => <li key={check.id} className="flex items-start gap-1.5 text-[10px]"><span className={check.passed ? "text-emerald-600" : "text-red-600"}>{check.passed ? "通过" : "阻断"}</span><span className="text-zinc-600 dark:text-zinc-300">{check.label} · {check.detail}</span></li>)}</ul> {/* 第46天：展示全部门禁检查及证据。 */}
          </div> {/* 第46天：结束质量门禁卡片。 */}
          <div className="rounded-lg border border-zinc-200 bg-white/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/25"> {/* 第46天：定义四维分数对比卡片。 */}
            <p className="text-[11px] font-semibold">Dimension Comparison（评分维度对比）</p> {/* 第46天：展示维度对比标题。 */}
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">{(["completeness", "correctness", "relevance", "coverage"] as const).map((dimension) => <div key={dimension} className="rounded-md bg-zinc-100 p-1.5 dark:bg-zinc-900"><p className="truncate text-[8px] text-zinc-500">{dimension}</p><p className="font-mono text-[10px] font-semibold">{snapshot.baseline.summary.dimensionScores[dimension]} → {snapshot.candidate.summary.dimensionScores[dimension]}</p><p className={`font-mono text-[9px] ${snapshot.comparison.dimensionDeltas[dimension] >= 0 ? "text-emerald-600" : "text-red-600"}`}>{snapshot.comparison.dimensionDeltas[dimension] >= 0 ? "+" : ""}{snapshot.comparison.dimensionDeltas[dimension]}</p></div>)}</div> {/* 第46天：展示四个维度的基线、候选和变化。 */}
          </div> {/* 第46天：结束四维分数对比卡片。 */}
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2"><CaseChangeList title="Improved Cases（改进案例）" items={snapshot.comparison.improvedCases} tone="good" /><CaseChangeList title="Regressed Cases（退步案例）" items={snapshot.comparison.regressedCases} tone="bad" /></div> {/* 第46天：并列展示改进和退步案例。 */}
        </div> /* 第46天：结束回归概览内容容器。 */
      ) : null} {/* 第46天：结束回归概览条件渲染。 */}

      {snapshot && activeTab === "bad-cases" ? ( /* 第46天：判断是否展示失败案例管理标签页。 */
        <div className="mt-3"> {/* 第46天：定义失败案例管理内容容器。 */}
          <div className="grid grid-cols-3 gap-1 text-center"> {/* 第46天：定义失败案例统计网格。 */}
            <div className="rounded-md bg-amber-50 p-2 dark:bg-amber-950/20"><p className="text-[9px] text-amber-700">总记录</p><p className="font-mono text-sm font-semibold">{snapshot.badCases.length}</p></div> {/* 第46天：展示失败案例总数。 */}
            <div className="rounded-md bg-emerald-50 p-2 dark:bg-emerald-950/20"><p className="text-[9px] text-emerald-700">已回归通过</p><p className="font-mono text-sm font-semibold">{snapshot.badCases.filter((item) => item.regressionPassed).length}</p></div> {/* 第46天：展示已修复并回归通过数量。 */}
            <div className="rounded-md bg-red-50 p-2 dark:bg-red-950/20"><p className="text-[9px] text-red-700">待修复</p><p className="font-mono text-sm font-semibold">{snapshot.badCases.filter((item) => !item.regressionPassed).length}</p></div> {/* 第46天：展示待修复数量。 */}
          </div> {/* 第46天：结束失败案例统计网格。 */}
          <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">{snapshot.badCases.map((item) => <BadCaseCard key={item.id} item={item} />)}</ul> {/* 第46天：展示可滚动失败案例记录。 */}
        </div> /* 第46天：结束失败案例管理内容容器。 */
      ) : null} {/* 第46天：结束失败案例管理条件渲染。 */}

      {snapshot && activeTab === "observability" ? ( /* 第46天：判断是否展示运行记录标签页。 */
        <div className="mt-3 space-y-2"> {/* 第46天：定义运行记录内容容器。 */}
          <div className="grid grid-cols-3 gap-1 text-center"> {/* 第46天：定义可观测性指标网格。 */}
            <div className="rounded-md bg-violet-50 p-2 dark:bg-violet-950/20"><p className="text-[9px] text-violet-700">Workspace</p><p className="font-mono text-sm font-semibold">{snapshot.workspace.entries.length}</p></div> {/* 第46天：展示工作空间条目数。 */}
            <div className="rounded-md bg-violet-50 p-2 dark:bg-violet-950/20"><p className="text-[9px] text-violet-700">Timeline</p><p className="font-mono text-sm font-semibold">{snapshot.timeline.length}</p></div> {/* 第46天：展示时间线事件数。 */}
            <div className="rounded-md bg-violet-50 p-2 dark:bg-violet-950/20"><p className="text-[9px] text-violet-700">Trace Spans</p><p className="font-mono text-sm font-semibold">{snapshot.trace.spans.length}</p></div> {/* 第46天：展示追踪跨度数。 */}
          </div> {/* 第46天：结束可观测性指标网格。 */}
          <div className="rounded-lg border border-violet-200/70 bg-violet-50/50 p-2 dark:border-violet-900/50 dark:bg-violet-950/20"><p className="text-[11px] font-semibold">Timeline（时间线）</p><ol className="mt-1.5 max-h-48 space-y-1 overflow-y-auto">{snapshot.timeline.map((event) => <li key={event.id} className="rounded bg-white/60 px-2 py-1 text-[9px] dark:bg-zinc-950/25"><span className="font-mono text-violet-700">{event.taskId}</span> · {event.label}</li>)}</ol></div> {/* 第46天：展示批量评估执行顺序。 */}
          <div className="rounded-lg border border-violet-200/70 bg-violet-50/50 p-2 dark:border-violet-900/50 dark:bg-violet-950/20"><p className="text-[11px] font-semibold">Workspace（工作空间）</p><ul className="mt-1.5 space-y-1">{snapshot.workspace.entries.map((entry) => <li key={entry.id} className="rounded bg-white/60 px-2 py-1 text-[9px] dark:bg-zinc-950/25"><span className="font-mono text-violet-700">{entry.type}</span> · {entry.content}</li>)}</ul></div> {/* 第46天：展示沉淀的评估结论与待修复问题。 */}
        </div> /* 第46天：结束运行记录内容容器。 */
      ) : null} {/* 第46天：结束运行记录条件渲染。 */}
    </section> /* 第46天：结束回归看板外层容器。 */
  ); /* 第46天：结束回归评估看板返回。 */
} /* 第46天：结束持续评估回归看板组件。 */
