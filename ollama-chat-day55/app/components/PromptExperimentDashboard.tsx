"use client"; /* 第53天：声明提示词实验仪表盘为客户端组件。 */

import { useCallback, useEffect, useMemo, useState } from "react"; /* 第53天：引入状态、副作用、缓存和回调 Hooks。 */
import Link from "next/link"; /* 第53天：引入 Next.js 页面导航组件。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第53天：引入统一 API 响应解析工具。 */
import type { PromptExperimentCaseScore, PromptExperimentDashboardSnapshot, PromptExperimentResult } from "@/lib/prompts/prompt-experiment-types"; /* 第53天：引入实验仪表盘展示类型。 */

type ExperimentTab = "overview" | "cases" | "results" | "timeline"; /* 第53天增强：定义实验仪表盘内部标签页，并新增评估用例对比页。 */

function formatPercent(value: number): string { /* 第53天：定义通过率和成本增长比例格式化函数。 */
  return `${(value * 100).toFixed(1)}%`; /* 第53天：把 0 到 1 的小数转换为百分比文本。 */
} /* 第53天：结束百分比格式化函数。 */

function resultTone(result: PromptExperimentResult): string { /* 第53天：定义版本结果视觉语义函数。 */
  if (result.highPriorityRegressionCount > 0) return "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20"; /* 第53天：高优先级退步使用阻断色。 */
  if (result.averageScore >= 90) return "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20"; /* 第53天：高分版本使用通过色。 */
  return "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/25"; /* 第53天：普通版本使用中性样式。 */
} /* 第53天：结束版本结果视觉语义函数。 */

function ResultCard({ result, winner }: { result: PromptExperimentResult; winner: boolean }) { /* 第53天：定义单个版本实验结果卡片。 */
  return ( /* 第53天：返回单个版本实验结果视图。 */
    <li className={`rounded-lg border p-3 text-xs ${resultTone(result)}`}> {/* 第53天：定义结果卡片容器。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第53天：排列版本标题和 winner 徽标。 */}
        <div className="min-w-0"> {/* 第53天：限制文本宽度防止长 ID 溢出。 */}
          <p className="font-semibold text-zinc-950 dark:text-zinc-50">{result.promptId}</p> {/* 第53天：展示提示词 ID。 */}
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">version {result.promptVersion}</p> {/* 第53天：展示提示词版本。 */}
        </div> {/* 第53天：结束版本标题区域。 */}
        {winner ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">Winner</span> : null} {/* 第53天：获胜版本展示 Winner 徽标。 */}
      </div> {/* 第53天：结束版本标题布局。 */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-center"> {/* 第53天：定义分数、通过率、成本和延迟网格。 */}
        <div className="rounded-md bg-white/75 p-2 dark:bg-zinc-900/60"><p className="text-[10px] text-zinc-500">Score</p><p className="font-mono text-base font-semibold">{result.averageScore}</p></div> {/* 第53天：展示平均分。 */}
        <div className="rounded-md bg-white/75 p-2 dark:bg-zinc-900/60"><p className="text-[10px] text-zinc-500">Pass Rate</p><p className="font-mono text-base font-semibold">{formatPercent(result.passRate)}</p></div> {/* 第53天：展示通过率。 */}
        <div className="rounded-md bg-white/75 p-2 dark:bg-zinc-900/60"><p className="text-[10px] text-zinc-500">Cost</p><p className="font-mono text-base font-semibold">${result.averageCost.toFixed(5)}</p></div> {/* 第53天：展示平均成本。 */}
        <div className="rounded-md bg-white/75 p-2 dark:bg-zinc-900/60"><p className="text-[10px] text-zinc-500">Latency</p><p className="font-mono text-base font-semibold">{result.averageLatencyMs}ms</p></div> {/* 第53天：展示平均延迟。 */}
      </div> {/* 第53天：结束核心指标网格。 */}
      <p className="mt-2 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">cost Δ {formatPercent(result.costIncrease)} · regressions {result.regressionCount} · high {result.highPriorityRegressionCount}</p> {/* 第53天：展示成本增长和退步计数。 */}
      <p className="mt-1 text-[10px] text-zinc-500">Best: {result.bestCases.join("、")}</p> {/* 第53天：展示最佳案例。 */}
      <p className="mt-1 text-[10px] text-zinc-500">Worst: {result.worstCases.join("、")}</p> {/* 第53天：展示最差案例。 */}
    </li> /* 第53天：结束单个版本实验结果卡片。 */
  ); /* 第53天：结束单个版本实验结果返回。 */
} /* 第53天：结束单个版本实验结果组件。 */

function deltaText(value: number): string { /* 第53天增强：定义案例分数变化文本格式化函数。 */
  return value > 0 ? `+${value}` : String(value); /* 第53天增强：正向变化补加号，负向和零值保持原样。 */
} /* 第53天增强：结束案例分数变化文本格式化函数。 */

function CaseScoreCell({ score }: { score?: PromptExperimentCaseScore }) { /* 第53天增强：定义单个版本在单个 Evaluation Case 上的结果格。 */
  if (!score) return <div className="rounded-md border border-dashed border-zinc-200 p-2 text-[10px] text-zinc-400 dark:border-zinc-800">未运行</div>; /* 第53天增强：缺少案例结果时展示未运行占位。 */
  return ( /* 第53天增强：返回案例结果格视图。 */
    <div className={`rounded-md border p-2 ${score.regressed ? "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20" : score.passed ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"}`}> {/* 第53天增强：按通过和退步状态选择单元格颜色。 */}
      <div className="flex items-center justify-between gap-2"> {/* 第53天增强：排列分数和变化值。 */}
        <span className="font-mono text-sm font-semibold text-zinc-950 dark:text-zinc-50">{score.score}</span> {/* 第53天增强：展示该版本在该案例上的 Score。 */}
        <span className={`font-mono text-[10px] ${score.scoreDelta < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{deltaText(score.scoreDelta)}</span> {/* 第53天增强：展示相对 active 基线的分数变化。 */}
      </div> {/* 第53天增强：结束分数行。 */}
      <div className="mt-1 flex flex-wrap gap-1"> {/* 第53天增强：排列通过和回归状态标签。 */}
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${score.passed ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{score.passed ? "Pass" : "Fail"}</span> {/* 第53天增强：展示 Pass Rate 的单案例来源。 */}
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${score.regressed ? "bg-red-600 text-white" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>{score.regressed ? "Regression" : "No Regression"}</span> {/* 第53天增强：展示该案例是否退步。 */}
      </div> {/* 第53天增强：结束状态标签行。 */}
      <p className="mt-1 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">${score.cost.toFixed(5)} · {score.latencyMs}ms</p> {/* 第53天增强：展示该案例的成本和延迟。 */}
    </div> /* 第53天增强：结束案例结果格容器。 */
  ); /* 第53天增强：结束案例结果格返回。 */
} /* 第53天增强：结束单案例结果格组件。 */

function CaseComparisonTable({ snapshot }: { snapshot: PromptExperimentDashboardSnapshot }) { /* 第53天增强：定义同一批评估用例横向对比表。 */
  const sameDataset = snapshot.run.batchRuns.every((run) => run.datasetId === snapshot.run.dataset.id && run.datasetVersion === snapshot.run.dataset.version && run.caseCount === snapshot.run.dataset.cases.length); /* 第53天增强：验证每个版本的批量运行都绑定同一个数据集和案例数。 */
  return ( /* 第53天增强：返回评估用例对比视图。 */
    <div className="mt-3 space-y-3"> {/* 第53天增强：定义评估用例对比内容区域。 */}
      <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/70 p-3 text-xs text-fuchsia-950 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/20 dark:text-fuchsia-100"> {/* 第53天增强：定义同一批案例说明块。 */}
        <p className="font-semibold">同一批 Evaluation Cases（评估用例）横向对比</p> {/* 第53天增强：展示对比场景标题。 */}
        <p className="mt-1 leading-relaxed">Dataset（数据集）：{snapshot.run.dataset.name} v{snapshot.run.dataset.version} · 共 {snapshot.run.dataset.cases.length} 个 case；{sameDataset ? "v1 / v2 / v3 都跑了这一批相同案例。" : "存在版本未完整绑定同一批案例，需要检查实验配置。"}</p> {/* 第53天增强：明确每个版本是否使用同一套数据集。 */}
      </div> {/* 第53天增强：结束同一批案例说明块。 */}
      <div className="grid gap-2 md:grid-cols-3"> {/* 第53天增强：定义批量运行证据卡片网格。 */}
        {snapshot.run.batchRuns.map((run) => <div key={run.id} className="rounded-lg border border-zinc-200 bg-white/70 p-2 text-[10px] dark:border-zinc-800 dark:bg-zinc-950/25"><p className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{run.version.promptVersion}</p><p className="mt-1 text-zinc-500">datasetId: {run.datasetId}</p><p className="mt-0.5 text-zinc-500">caseCount: {run.caseCount} · concurrency: {run.concurrency}</p></div>)} {/* 第53天增强：逐版本展示 batch run 绑定的是同一数据集和同一案例数。 */}
      </div> {/* 第53天增强：结束批量运行证据卡片网格。 */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/25"> {/* 第53天增强：定义可横向滚动的案例矩阵容器，表格内部不放 JSX 空白注释以避免 hydration 警告。 */}
        <table className="min-w-[58rem] w-full border-collapse text-left text-xs">
          <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="w-56 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Evaluation Case</th>
              {snapshot.run.results.map((result) => <th key={result.promptId} className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">{result.promptId}</th>)}
            </tr>
          </thead>
          <tbody>
            {snapshot.run.dataset.cases.map((item) => <tr key={item.id} className="align-top">
              <td className="border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
                <p className="font-semibold text-zinc-950 dark:text-zinc-50">{item.name}</p> {/* 第53天增强：展示案例名称。 */}
                <p className="mt-1 font-mono text-[10px] text-zinc-500">{item.id}</p> {/* 第53天增强：展示案例 ID。 */}
                <div className="mt-2 flex flex-wrap gap-1"><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{item.priority}</span><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{item.kind}</span></div> {/* 第53天增强：展示案例优先级和类型。 */}
              </td>
              {snapshot.run.results.map((result) => <td key={`${item.id}-${result.promptId}`} className="border-b border-zinc-100 px-3 py-3 dark:border-zinc-800"><CaseScoreCell score={result.caseScores.find((score) => score.caseId === item.id)} /></td>)}
            </tr>)}
          </tbody>
        </table>
      </div> {/* 第53天增强：结束案例矩阵容器。 */}
    </div> /* 第53天增强：结束评估用例对比内容区域。 */
  ); /* 第53天增强：结束评估用例对比返回。 */
} /* 第53天增强：结束同一批评估用例横向对比表。 */

export function PromptExperimentDashboard() { /* 第53天：定义 Prompt Experiment Dashboard（提示词实验仪表盘）主组件。 */
  const [snapshot, setSnapshot] = useState<PromptExperimentDashboardSnapshot | null>(null); /* 第53天：保存后端实验快照。 */
  const [activeTab, setActiveTab] = useState<ExperimentTab>("overview"); /* 第53天：保存当前仪表盘标签页。 */
  const [loading, setLoading] = useState(true); /* 第53天：保存加载、重新运行和 Promote 状态。 */
  const [message, setMessage] = useState(""); /* 第53天：保存成功提示。 */
  const [error, setError] = useState(""); /* 第53天：保存错误提示。 */

  const loadSnapshot = useCallback(async (force: boolean) => { /* 第53天：定义读取或重新运行实验快照函数。 */
    setLoading(true); /* 第53天：进入加载状态。 */
    setError(""); /* 第53天：清空旧错误。 */
    setMessage(""); /* 第53天：清空旧成功提示。 */
    try { /* 第53天：捕获接口错误。 */
      const response = force ? await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) }) : await fetch("/api/experiments"); /* 第53天：按需强制重新运行或读取缓存。 */
      const data = await readApiData<PromptExperimentDashboardSnapshot>(response); /* 第53天：解析统一 API 响应。 */
      setSnapshot(data); /* 第53天：写入最新实验快照。 */
      if (force) setMessage("实验已重新运行。"); /* 第53天：重新运行时展示成功提示。 */
    } catch (loadError) { /* 第53天：处理读取或运行失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Prompt Experiment 失败"); /* 第53天：写入用户可读错误。 */
    } finally { /* 第53天：无论成功失败都恢复交互状态。 */
      setLoading(false); /* 第53天：退出加载状态。 */
    } /* 第53天：结束异常处理。 */
  }, []); /* 第53天：保持读取函数引用稳定。 */

  useEffect(() => { /* 第53天：组件挂载后自动读取实验快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(false), 0); /* 第53天：延迟读取，避免 effect 主体同步触发状态更新。 */
    return () => window.clearTimeout(timer); /* 第53天：组件卸载时清理定时器。 */
  }, [loadSnapshot]); /* 第53天：依赖稳定的读取函数。 */

  const winner = useMemo(() => snapshot?.run.results.find((result) => result.promptVersion === snapshot.run.winnerVersion) ?? null, [snapshot]); /* 第53天：派生获胜版本结果。 */
  const tabs: Array<{ id: ExperimentTab; label: string }> = [{ id: "overview", label: "概览" }, { id: "cases", label: "评估用例" }, { id: "results", label: "版本结果" }, { id: "timeline", label: "时间线" }]; /* 第53天增强：定义仪表盘标签页配置，并暴露同一批评估用例对比页。 */

  const promoteWinner = useCallback(async () => { /* 第53天：定义一键 Promote 获胜版本函数。 */
    if (!snapshot?.run.winnerVersion) return; /* 第53天：没有 winner 时直接跳过。 */
    setLoading(true); /* 第53天：进入 Promote 加载状态。 */
    setError(""); /* 第53天：清空旧错误。 */
    setMessage(""); /* 第53天：清空旧提示。 */
    try { /* 第53天：捕获 Promote 请求异常。 */
      const response = await fetch("/api/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "promote", experimentId: snapshot.run.experiment.id }) }); /* 第53天：请求后端执行质量门禁后的 Promote。 */
      const data = await readApiData<PromptExperimentDashboardSnapshot>(response); /* 第53天：解析 Promote 后的最新快照。 */
      setSnapshot(data); /* 第53天：写入包含 active 版本的快照。 */
      setMessage(`已将 ${data.run.promotedVersion} 提升为 active 版本。`); /* 第53天：展示 Promote 成功提示。 */
    } catch (promoteError) { /* 第53天：处理 Promote 失败。 */
      setError(promoteError instanceof ApiClientError ? promoteError.message : "Promote 失败"); /* 第53天：写入用户可读错误。 */
    } finally { /* 第53天：确保 Promote 后恢复交互。 */
      setLoading(false); /* 第53天：退出 Promote 加载状态。 */
    } /* 第53天：结束 Promote 异常处理。 */
  }, [snapshot]); /* 第53天：依赖当前实验快照。 */

  return ( /* 第53天：返回提示词实验仪表盘视图。 */
    <section className="h-full min-h-0 overflow-y-auto border-b border-fuchsia-200/70 px-4 py-3 dark:border-fuchsia-900/40"> {/* 第53天增强：定义可在工作区内部滚动的仪表盘外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第53天：排列标题说明和操作按钮。 */}
        <div> {/* 第53天：定义标题区域。 */}
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Prompt Experiment Dashboard（提示词实验仪表盘）</p> {/* 第53天：展示仪表盘标题。 */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 55 · 兼容保留 Day53 实验视图，用来对照 Prompt Version 实验结果与新的 Dynamic Prompt Optimization 能力。</p> {/* 第55天：展示实验兼容视图定位。 */}
        </div> {/* 第53天：结束标题区域。 */}
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row"> {/* 第53天：定义操作按钮组。 */}
          <button type="button" onClick={() => void loadSnapshot(true)} disabled={loading} className="rounded-lg border border-fuchsia-300 px-2.5 py-1.5 text-[10px] font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-40 dark:border-fuchsia-800 dark:text-fuchsia-200 dark:hover:bg-fuchsia-950/30">{loading ? "运行中..." : "重新运行"}</button> {/* 第53天：提供重新运行实验入口。 */}
          <button type="button" onClick={() => void promoteWinner()} disabled={loading || !winner || snapshot?.run.qualityGate.status !== "passed"} className="rounded-lg bg-fuchsia-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40">Promote</button> {/* 第53天：提供一键 Promote 获胜版本入口。 */}
        </div> {/* 第53天：结束操作按钮组。 */}
      </div> {/* 第53天：结束标题操作布局。 */}
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]"> {/* 第53天：定义跨页面导航区域。 */}
        <Link href="/experiments" className="rounded-md border border-fuchsia-300 px-2 py-1 font-semibold text-fuchsia-700 dark:border-fuchsia-800 dark:text-fuchsia-200">实验专页</Link> {/* 第53天：跳转到完整实验页面。 */}
        <Link href="/prompts" className="rounded-md border border-teal-300 px-2 py-1 font-semibold text-teal-700 dark:border-teal-800 dark:text-teal-200">提示词控制台</Link> {/* 第53天：跳转到提示词版本管理页面。 */}
      </div> {/* 第53天：结束跨页面导航区域。 */}
      {message ? <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200">{message}</p> : null} {/* 第53天：展示成功提示。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第53天：展示错误提示。 */}
      <div className="mt-3 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 55 Prompt Optimization Experiment 兼容标签页"> {/* 第55天：定义仪表盘标签页导航。 */}
        {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.id} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition ${activeTab === tab.id ? "bg-white text-fuchsia-700 shadow-sm dark:bg-zinc-800 dark:text-fuchsia-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button>)} {/* 第53天：渲染三个可切换标签页。 */}
      </div> {/* 第53天：结束仪表盘标签页导航。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-fuchsia-200 py-5 text-center text-[11px] text-fuchsia-700 dark:border-fuchsia-900/50 dark:text-fuchsia-300">正在准备 Prompt Experiment...</p> : null} {/* 第53天：未加载完成时展示占位。 */}
      {snapshot && activeTab === "overview" ? ( /* 第53天：按需渲染实验概览标签页。 */
        <div className="mt-3 space-y-3"> {/* 第53天：定义实验概览内容区域。 */}
          <div className="rounded-lg border border-zinc-200 bg-white/70 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/25"> {/* 第53天：定义实验定义摘要块。 */}
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-zinc-950 dark:text-zinc-50">{snapshot.run.experiment.name}</p><p className="mt-1 text-zinc-500">Component: {snapshot.run.experiment.componentId} · Dataset: {snapshot.run.dataset.name} v{snapshot.run.dataset.version}</p></div><span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 font-mono text-[10px] text-fuchsia-800 dark:text-fuchsia-200">{snapshot.run.experiment.status}</span></div> {/* 第53天：展示实验名称、组件、数据集和状态。 */}
            <p className="mt-2 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">Versions: {snapshot.run.experiment.candidateVersions.join(" / ")} · baseline active: {snapshot.run.baselineVersion}</p> {/* 第53天：展示候选版本和 active 基线。 */}
          </div> {/* 第53天：结束实验定义摘要块。 */}
          <div className="grid grid-cols-3 gap-2 text-center"> {/* 第53天：定义核心指标网格。 */}
            <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/25"><p className="text-[10px] text-emerald-700">Winner</p><p className="font-mono text-sm font-semibold">{snapshot.run.winnerVersion ?? "none"}</p></div> {/* 第53天：展示获胜版本。 */}
            <div className="rounded-lg bg-fuchsia-50 p-2 dark:bg-fuchsia-950/25"><p className="text-[10px] text-fuchsia-700">Gate</p><p className="font-mono text-sm font-semibold">{snapshot.run.qualityGate.status}</p></div> {/* 第53天：展示质量门禁状态。 */}
            <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[10px] text-zinc-500">Cases</p><p className="font-mono text-sm font-semibold">{snapshot.run.dataset.cases.length}</p></div> {/* 第53天：展示评估用例数量。 */}
          </div> {/* 第53天：结束核心指标网格。 */}
          <div className={`rounded-lg border p-3 text-xs ${snapshot.run.qualityGate.status === "passed" ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20" : "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/20"}`}> {/* 第53天：定义质量门禁明细块。 */}
            <p className="font-semibold">Quality Gate（质量门禁）</p> {/* 第53天：展示门禁标题。 */}
            <ul className="mt-2 space-y-1">{snapshot.run.qualityGate.checks.map((check) => <li key={check.id} className="flex items-start gap-1.5 text-[10px]"><span className={check.passed ? "text-emerald-700" : "text-red-700"}>{check.passed ? "通过" : "阻断"}</span><span className="text-zinc-600 dark:text-zinc-300">{check.label} · {check.detail}</span></li>)}</ul> {/* 第53天：逐项展示门禁证据。 */}
          </div> {/* 第53天：结束质量门禁明细块。 */}
          {winner ? <ResultCard result={winner} winner /> : null} {/* 第53天：概览页突出展示获胜版本。 */}
          {snapshot.activePromptAfterPromotion ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200">当前 active：{snapshot.activePromptAfterPromotion.id}</p> : null} {/* 第53天：Promote 后展示当前 active 提示词。 */}
        </div> /* 第53天：结束实验概览内容区域。 */
      ) : null} {/* 第53天：结束实验概览条件渲染。 */}
      {snapshot && activeTab === "results" ? ( /* 第53天：按需渲染版本结果标签页。 */
        <ul className="mt-3 space-y-2"> {/* 第53天：定义版本结果列表。 */}
          {snapshot.run.results.map((result) => <ResultCard key={result.promptId} result={result} winner={result.promptVersion === snapshot.run.winnerVersion} />)} {/* 第53天：逐个展示候选版本实验指标。 */}
        </ul> /* 第53天：结束版本结果列表。 */
      ) : null} {/* 第53天：结束版本结果条件渲染。 */}
      {snapshot && activeTab === "cases" ? <CaseComparisonTable snapshot={snapshot} /> : null} {/* 第53天增强：按需渲染同一批 Evaluation Cases 的横向对比矩阵。 */}
      {snapshot && activeTab === "timeline" ? ( /* 第53天：按需渲染实验时间线标签页。 */
        <ol className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1"> {/* 第53天：定义实验时间线列表。 */}
          {snapshot.run.timeline.map((event) => <li key={event.id} className="rounded-lg border border-violet-200 bg-violet-50/60 px-2 py-1.5 text-[10px] dark:border-violet-900/50 dark:bg-violet-950/20"><span className="font-mono text-violet-700 dark:text-violet-300">{event.taskId}</span> · {event.label}</li>)} {/* 第53天：逐条展示实验创建、版本运行、获胜选择和 Promote 事件。 */}
        </ol> /* 第53天：结束实验时间线列表。 */
      ) : null} {/* 第53天：结束实验时间线条件渲染。 */}
    </section> /* 第53天：结束提示词实验仪表盘外层容器。 */
  ); /* 第53天：结束提示词实验仪表盘返回。 */
} /* 第53天：结束 Prompt Experiment Dashboard 主组件。 */
