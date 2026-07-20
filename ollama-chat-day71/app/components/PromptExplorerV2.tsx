"use client"; // 第67天：声明 Prompt Explorer V2 为支持状态、请求和操作按钮的客户端组件。

import { useCallback, useEffect, useMemo, useState } from "react"; // 第67天：引入加载、派生数据和交互状态所需 React Hooks。
import { ApiClientError, readApiData } from "@/lib/api/api-client"; // 第67天：引入统一 API 响应解析与错误类型。
import type { ProductionPromptAction } from "@/lib/prompts/production-prompt-platform"; // 第67天：引入运营控制台允许触发的生命周期动作。
import type { ProductionPrompt, ProductionPromptComparison, ProductionPromptPlatformSnapshot, ProductionPromptStatus } from "@/lib/prompts/production-prompt-types"; // 第67天：引入生产提示词、比较和平台快照类型。

const AGENT_LABELS: Record<string, string> = { research: "Research Agent（研究智能体）", writer: "Writer Agent（写作智能体）", critic: "Critic Agent（审查智能体）" }; // 第67天：定义三类验收智能体中文标签。

function statusClass(status: ProductionPromptStatus): string { // 第67天：定义生产提示词生命周期状态徽标样式。
  if (status === "active") return "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200"; // 第67天：启用版本使用绿色强调。
  if (status === "approved") return "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-950/50 dark:text-sky-200"; // 第67天：已批准版本使用蓝色强调。
  if (status === "testing") return "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200"; // 第67天：测试中版本使用琥珀色强调。
  if (status === "draft") return "bg-violet-100 text-violet-800 ring-violet-300 dark:bg-violet-950/50 dark:text-violet-200"; // 第67天：草稿版本使用紫色强调。
  return "bg-zinc-100 text-zinc-600 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"; // 第67天：已弃用版本使用低强调中性色。
} // 第67天：结束生命周期状态徽标样式函数。

function formatTime(value: number): string { // 第67天：定义审计日志中文时间格式化函数。
  return new Date(value).toLocaleString("zh-CN", { hour12: false }); // 第67天：使用中文二十四小时制展示时间。
} // 第67天：结束审计日志时间格式化函数。

function actionLabel(action: ProductionPromptAction): string { // 第67天：定义生命周期操作按钮中文标签。
  return action === "approve" ? "批准" : action === "promote" ? "晋级" : action === "rollback" ? "回滚" : "归档"; // 第67天：把动作代码转换为用户可读中文文案。
} // 第67天：结束生命周期操作按钮标签函数。

export function PromptExplorerV2() { // 第67天：定义生产级提示词运营控制台主组件。
  const [snapshot, setSnapshot] = useState<ProductionPromptPlatformSnapshot | null>(null); // 第67天：保存生产提示词平台完整快照。
  const [activeAgent, setActiveAgent] = useState("research"); // 第67天：保存当前智能体标签页。
  const [selectedIds, setSelectedIds] = useState<string[]>([]); // 第67天：保存待比较的两个提示词版本标识。
  const [comparison, setComparison] = useState<ProductionPromptComparison | null>(null); // 第67天：保存服务端提示词版本比较结果。
  const [loading, setLoading] = useState(true); // 第67天：保存快照和生命周期动作加载状态。
  const [error, setError] = useState(""); // 第67天：保存用户可读平台错误信息。

  const loadSnapshot = useCallback(async () => { // 第67天：定义读取生产提示词平台快照的稳定函数。
    setLoading(true); // 第67天：请求开始前禁用重复操作。
    setError(""); // 第67天：清空上一轮错误信息。
    try { // 第67天：捕获网络、响应解析和平台运行异常。
      const response = await fetch("/api/production-prompts", { cache: "no-store" }); // 第67天：请求不使用浏览器缓存的最新运营快照。
      const data = await readApiData<ProductionPromptPlatformSnapshot>(response); // 第67天：解析统一 API 响应包中的平台数据。
      setSnapshot(data); // 第67天：保存版本、实验、指标、链路和审计快照。
    } catch (caught) { // 第67天：处理平台快照加载失败。
      setError(caught instanceof ApiClientError ? caught.message : "加载 Production Prompt Platform 失败"); // 第67天：展示统一错误消息而不暴露内部堆栈。
    } finally { // 第67天：确保请求结束后恢复控制台交互。
      setLoading(false); // 第67天：结束平台加载状态。
    } // 第67天：结束平台快照加载异常处理。
  }, []); // 第67天：保持平台快照加载函数引用稳定。

  useEffect(() => { // 第67天：组件挂载后自动读取生产提示词平台快照。
    const timer = window.setTimeout(() => void loadSnapshot(), 0); // 第67天：把异步状态更新放入定时回调避免副作用主体同步更新。
    return () => window.clearTimeout(timer); // 第67天：组件卸载时清理首次加载定时器。
  }, [loadSnapshot]); // 第67天：依赖稳定的平台快照加载函数。

  const agents = useMemo(() => Array.from(new Set((snapshot?.prompts ?? []).map((prompt) => prompt.agentId).filter((agentId): agentId is string => Boolean(agentId)))), [snapshot]); // 第67天：从生产提示词版本派生智能体标签页列表。
  const visiblePrompts = useMemo(() => (snapshot?.prompts ?? []).filter((prompt) => prompt.agentId === activeAgent), [snapshot, activeAgent]); // 第67天：派生当前智能体的全部提示词版本。

  const runAction = useCallback(async (action: ProductionPromptAction, prompt: ProductionPrompt) => { // 第67天：定义批准、晋级、回滚和归档动作函数。
    setLoading(true); // 第67天：生命周期动作开始前禁用重复点击。
    setError(""); // 第67天：清空旧生命周期错误。
    try { // 第67天：捕获质量门禁失败和非法状态跳转。
      const response = await fetch("/api/production-prompts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, agentId: prompt.agentId, version: prompt.version }) }); // 第67天：发送生产提示词生命周期动作请求。
      setSnapshot(await readApiData<ProductionPromptPlatformSnapshot>(response)); // 第67天：动作成功后刷新版本状态、指标和审计日志。
    } catch (caught) { // 第67天：处理质量门禁或生命周期动作失败。
      setError(caught instanceof ApiClientError ? caught.message : `Production Prompt ${action} 失败`); // 第67天：展示质量门禁阻断原因。
    } finally { // 第67天：确保动作结束后恢复交互。
      setLoading(false); // 第67天：结束生命周期动作加载状态。
    } // 第67天：结束生产提示词生命周期动作异常处理。
  }, []); // 第67天：保持生命周期动作函数引用稳定。

  const toggleCompare = (promptId: string) => { // 第67天：定义版本比较选择切换函数。
    setSelectedIds((current) => current.includes(promptId) ? current.filter((id) => id !== promptId) : [...current.slice(-1), promptId]); // 第67天：最多保留两个待比较版本并支持再次点击取消。
    setComparison(null); // 第67天：选择变化时清空旧比较结果。
  }; // 第67天：结束版本比较选择切换函数。

  const runCompare = useCallback(async () => { // 第67天：定义服务端生产提示词版本比较函数。
    if (selectedIds.length !== 2) return; // 第67天：未选择两个版本时不发起比较请求。
    setLoading(true); // 第67天：比较开始前禁用重复操作。
    setError(""); // 第67天：清空旧比较错误。
    try { // 第67天：捕获目标版本缺失和响应解析异常。
      const response = await fetch("/api/production-prompts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leftId: selectedIds[0], rightId: selectedIds[1] }) }); // 第67天：发送左右提示词版本标识到比较接口。
      setComparison(await readApiData<ProductionPromptComparison>(response)); // 第67天：保存新增块、移除块和策略变化结果。
    } catch (caught) { // 第67天：处理生产提示词版本比较失败。
      setError(caught instanceof ApiClientError ? caught.message : "比较 Production Prompt 失败"); // 第67天：展示统一版本比较错误信息。
    } finally { // 第67天：确保比较结束后恢复交互。
      setLoading(false); // 第67天：结束版本比较加载状态。
    } // 第67天：结束生产提示词版本比较异常处理。
  }, [selectedIds]); // 第67天：版本比较函数依赖当前两个选择标识。

  return ( // 第67天：返回 Prompt Explorer V2 完整生产运营控制台。
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8"> {/* 第67天：定义深色生产运营控制台页面背景。 */}
      <div className="mx-auto max-w-7xl space-y-6"> {/* 第67天：限制控制台内容宽度并统一垂直间距。 */}
        <header className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/20 via-slate-900 to-cyan-500/10 p-6 shadow-2xl shadow-violet-950/40"> {/* 第67天：定义第67天生产提示词平台标题卡片。 */}
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"> {/* 第67天：排列标题说明和平台指标。 */}
            <div> {/* 第67天：定义标题文案区域。 */}
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-300">Day 68 · Inherited Production Prompt Platform</p> {/* 第68天：说明当前项目完整继承第67天生产提示词平台。 */}
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Production Prompt Platform <span className="text-cyan-300">生产级提示词平台</span></h1> {/* 第67天：展示 Prompt Explorer V2 页面主标题。 */}
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">把 Prompt 从代码字符串升级为可版本、可实验、可评估、可晋级、可回滚、可审计的 Agent Platform 核心资产。</p> {/* 第67天：说明生产提示词平台的核心目标。 */}
            </div> {/* 第67天：结束标题文案区域。 */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs"> {/* 第67天：定义版本、启用版本和实验数量指标。 */}
              <div className="rounded-2xl bg-white/5 p-3"><p className="text-slate-400">版本</p><p className="mt-1 text-2xl font-black text-white">{snapshot?.prompts.length ?? 0}</p></div> {/* 第67天：展示生产提示词版本总数。 */}
              <div className="rounded-2xl bg-white/5 p-3"><p className="text-slate-400">Active</p><p className="mt-1 text-2xl font-black text-emerald-300">{snapshot?.prompts.filter((prompt) => prompt.status === "active").length ?? 0}</p></div> {/* 第67天：展示当前启用版本数量。 */}
              <div className="rounded-2xl bg-white/5 p-3"><p className="text-slate-400">实验</p><p className="mt-1 text-2xl font-black text-cyan-300">{snapshot?.experiments.length ?? 0}</p></div> {/* 第67天：展示生产提示词实验数量。 */}
            </div> {/* 第67天：结束平台核心指标区域。 */}
          </div> {/* 第67天：结束标题和指标布局。 */}
        </header> {/* 第67天：结束第67天平台标题卡片。 */}

        {error ? <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p> : null} {/* 第67天：按需展示质量门禁或接口错误。 */}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"> {/* 第67天：定义提示词版本运营主区域。 */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"> {/* 第67天：排列智能体标签页、比较和刷新按钮。 */}
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Production Prompt Agent tabs"> {/* 第67天：定义三类智能体标签页。 */}
              {agents.map((agentId) => <button key={agentId} type="button" role="tab" aria-selected={activeAgent === agentId} onClick={() => { setActiveAgent(agentId); setSelectedIds([]); setComparison(null); }} className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeAgent === agentId ? "bg-violet-400 text-slate-950" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{AGENT_LABELS[agentId] ?? agentId}</button>)} {/* 第67天：渲染 Research、Writer 和 Critic 智能体标签页。 */}
            </div> {/* 第67天：结束智能体标签页。 */}
            <div className="flex gap-2"> {/* 第67天：定义版本比较和快照刷新按钮组。 */}
              <button type="button" onClick={() => void runCompare()} disabled={loading || selectedIds.length !== 2} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Compare（比较）</button> {/* 第67天：比较用户选择的两个提示词版本。 */}
              <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 disabled:opacity-40">{loading ? "处理中..." : "刷新"}</button> {/* 第67天：手动刷新生产提示词平台快照。 */}
            </div> {/* 第67天：结束版本比较和刷新按钮组。 */}
          </div> {/* 第67天：结束版本运营工具栏。 */}

          <div className="mt-5 grid gap-4 lg:grid-cols-2"> {/* 第67天：定义当前智能体提示词版本卡片网格。 */}
            {visiblePrompts.map((prompt) => { const metric = snapshot?.metrics.find((item) => item.promptId === prompt.id); const experiment = snapshot?.experiments.find((item) => item.experiment.agentId === prompt.agentId); const candidate = experiment?.candidates.find((item) => item.version === prompt.version); return ( // 第67天：为每个版本派生用量和实验评分并开始渲染卡片。
              <article key={prompt.id} className={`rounded-2xl border p-4 ${selectedIds.includes(prompt.id) ? "border-cyan-300 bg-cyan-400/10" : "border-white/10 bg-slate-900/70"}`}> {/* 第67天：定义可选择比较的生产提示词版本卡片。 */}
                <div className="flex items-start justify-between gap-3"> {/* 第67天：排列提示词名称、版本和状态。 */}
                  <div><p className="font-bold text-white">{prompt.name}</p><p className="mt-1 font-mono text-xs text-cyan-300">{prompt.id} · {prompt.version} · {prompt.agentId}</p></div> {/* 第67天：展示 Prompt、Version 和关联 Agent。 */}
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${statusClass(prompt.status)}`}>{prompt.status}</span> {/* 第67天：展示生产提示词生命周期状态。 */}
                </div> {/* 第67天：结束提示词标题和状态布局。 */}
                <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"> {/* 第67天：定义 Blocks、Strategy、Score 和 Usage 指标网格。 */}
                  <div className="rounded-xl bg-white/5 p-2"><p className="text-slate-500">Blocks</p><p className="mt-1 font-mono font-bold text-white">{prompt.blocks.length}</p></div> {/* 第67天：展示生产提示词块数量。 */}
                  <div className="rounded-xl bg-white/5 p-2"><p className="text-slate-500">Strategy</p><p className="mt-1 font-mono font-bold text-violet-300">{prompt.strategy}</p></div> {/* 第67天：展示生产提示词策略。 */}
                  <div className="rounded-xl bg-white/5 p-2"><p className="text-slate-500">Score</p><p className="mt-1 font-mono font-bold text-emerald-300">{candidate?.averageScore.overall ?? "—"}</p></div> {/* 第67天：展示通用实验生成的综合评分。 */}
                  <div className="rounded-xl bg-white/5 p-2"><p className="text-slate-500">Usage</p><p className="mt-1 font-mono font-bold text-cyan-300">{metric?.usageCount ?? 0}</p></div> {/* 第67天：展示与模型调用关联的运行次数。 */}
                </div> {/* 第67天：结束生产提示词版本指标网格。 */}
                <div className="mt-3 flex flex-wrap gap-1.5"> {/* 第67天：定义提示词块标签列表。 */}
                  {prompt.blocks.map((block) => <span key={block.id} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300">{block.name}</span>)} {/* 第67天：逐块展示 PromptBlock 组成。 */}
                </div> {/* 第67天：结束提示词块标签列表。 */}
                <div className="mt-4 flex flex-wrap gap-2"> {/* 第67天：定义 Compare、Approve、Promote、Rollback 和 Archive 操作按钮。 */}
                  <button type="button" onClick={() => toggleCompare(prompt.id)} className="rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs font-bold text-cyan-200">{selectedIds.includes(prompt.id) ? "取消比较" : "选择比较"}</button> {/* 第67天：选择或取消当前提示词版本比较。 */}
                  {prompt.status === "testing" ? <button type="button" disabled={loading} onClick={() => void runAction("approve", prompt)} className="rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950">{actionLabel("approve")}</button> : null} {/* 第67天：测试版本提供质量审批操作。 */}
                  {prompt.status === "approved" ? <button type="button" disabled={loading} onClick={() => void runAction("promote", prompt)} className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950">{actionLabel("promote")}</button> : null} {/* 第67天：已批准版本提供生产晋级操作。 */}
                  {prompt.status === "deprecated" ? <button type="button" disabled={loading} onClick={() => void runAction("rollback", prompt)} className="rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-black text-slate-950">{actionLabel("rollback")}</button> : null} {/* 第67天：历史版本提供快速回滚操作。 */}
                  {prompt.status !== "deprecated" ? <button type="button" disabled={loading} onClick={() => void runAction("archive", prompt)} className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-xs font-bold text-rose-200">{actionLabel("archive")}</button> : null} {/* 第67天：非归档版本提供归档操作。 */}
                </div> {/* 第67天：结束生产提示词生命周期操作按钮组。 */}
              </article> // 第67天：结束单个生产提示词版本卡片。
            ); })} {/* 第67天：结束当前智能体提示词版本遍历。 */}
          </div> {/* 第67天：结束当前智能体提示词版本卡片网格。 */}

          {comparison ? <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm"><p className="font-bold text-cyan-200">版本比较：{comparison.leftId} → {comparison.rightId}</p><p className="mt-2 text-slate-300">新增 Blocks：{comparison.addedBlockIds.join("、") || "无"}</p><p className="mt-1 text-slate-300">移除 Blocks：{comparison.removedBlockIds.join("、") || "无"}</p><p className="mt-1 text-slate-300">策略变化：{comparison.strategyChanged ? "是" : "否"}</p></div> : null} {/* 第67天：按需展示提示词块和策略差异比较结果。 */}
        </section> {/* 第67天：结束提示词版本运营主区域。 */}

        <section className="grid gap-5 xl:grid-cols-2"> {/* 第67天：定义运行链路和实验结果双栏区域。 */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"> {/* 第67天：定义 Agent 到 Evaluation 完整链路区域。 */}
            <h2 className="text-lg font-black">ProductionPromptTest（生产提示词链路）</h2> {/* 第67天：展示三类智能体验收链路标题。 */}
            <div className="mt-4 space-y-3"> {/* 第67天：定义 Research、Writer 和 Critic 运行链路列表。 */}
              {(snapshot?.runtimeDemos ?? []).map((demo) => <article key={demo.prompt.agentId} className="rounded-2xl bg-slate-900/70 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-white">{AGENT_LABELS[demo.prompt.agentId ?? ""] ?? demo.prompt.agentId}</p><span className="font-mono text-xs text-cyan-300">{demo.prompt.id}</span></div><p className="mt-2 text-xs text-slate-400">Agent → Prompt → Model（{demo.modelResult.model}）→ Evaluation</p><p className="mt-2 text-xs text-slate-300">Trace：{demo.trace.traceId} · Blocks：{demo.trace.blocks.length} · Overall：{demo.quality.overall}</p><p className="mt-2 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-400">{demo.renderedPrompt}</p></article>)} {/* 第67天：展示版本进入 Trace、块组合、模型指标和质量评分。 */}
            </div> {/* 第67天：结束三类智能体运行链路列表。 */}
          </div> {/* 第67天：结束 Agent 到 Evaluation 完整链路区域。 */}

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"> {/* 第67天：定义通用提示词实验区域。 */}
            <h2 className="text-lg font-black">PromptExperiment（生产化 A/B 测试）</h2> {/* 第67天：展示通用实验平台标题。 */}
            <div className="mt-4 space-y-3"> {/* 第67天：定义三个智能体实验结果列表。 */}
              {(snapshot?.experiments ?? []).map((run) => <article key={run.experiment.id} className="rounded-2xl bg-slate-900/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">{run.experiment.name}</p><p className="mt-1 text-xs text-slate-500">Dataset：{run.dataset.name} · Samples：{run.dataset.cases.length}</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-300">Winner {run.winnerVersion ?? "—"}</span></div><div className="mt-3 grid grid-cols-2 gap-2">{run.candidates.map((candidate) => <div key={candidate.version} className="rounded-xl bg-white/5 p-3 text-xs"><p className="font-mono font-bold text-cyan-300">{candidate.version}</p><p className="mt-1 text-slate-300">Overall {candidate.averageScore.overall}</p><p className={candidate.qualityGate.passed ? "text-emerald-300" : "text-rose-300"}>{candidate.qualityGate.passed ? "Quality Gate 通过" : `阻断 ${candidate.qualityGate.failureReasons.length} 项`}</p></div>)}</div></article>)} {/* 第67天：展示候选评分、优胜版本和质量门禁状态。 */}
            </div> {/* 第67天：结束生产提示词实验结果列表。 */}
          </div> {/* 第67天：结束通用提示词实验区域。 */}
        </section> {/* 第67天：结束运行链路和实验结果双栏区域。 */}

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"> {/* 第67天：定义提示词发布审计日志区域。 */}
          <h2 className="text-lg font-black">Audit Log（发布审计日志）</h2> {/* 第67天：展示晋级、回滚和归档审计标题。 */}
          <div className="mt-4 space-y-2"> {/* 第67天：定义审计记录列表。 */}
            {(snapshot?.audits ?? []).map((audit) => <p key={audit.id} className="rounded-xl bg-slate-900/70 px-4 py-3 text-xs text-slate-300"><span className="font-bold text-violet-300">{audit.action}</span><span className="mx-2 font-mono text-cyan-300">{audit.promptId}</span>{audit.fromStatus} → {audit.toStatus}<span className="ml-2 text-slate-500">{formatTime(audit.createdAt)} · {audit.reason}</span></p>)} {/* 第67天：展示每次提示词生命周期变化和操作原因。 */}
            {snapshot && snapshot.audits.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-500">尚无操作记录，请在版本卡片中执行批准、晋级、回滚或归档。</p> : null} {/* 第67天：无审计记录时展示操作引导。 */}
          </div> {/* 第67天：结束提示词发布审计记录列表。 */}
        </section> {/* 第67天：结束提示词发布审计日志区域。 */}
      </div> {/* 第67天：结束生产提示词控制台内容容器。 */}
    </main> // 第67天：结束 Prompt Explorer V2 页面根节点。
  ); // 第67天：结束生产提示词运营控制台返回。
} // 第67天：结束 PromptExplorerV2 组件。
