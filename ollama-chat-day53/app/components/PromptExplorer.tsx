"use client"; /* 第52天：声明 Prompt Explorer（提示词浏览器）为客户端交互组件。 */

import { useCallback, useEffect, useMemo, useState } from "react"; /* 第52天：引入加载、缓存派生数据与副作用 Hooks。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第52天：引入统一 API 响应解析工具。 */
import type { PromptDashboardSnapshot, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天：引入 Prompt Explorer 展示所需类型。 */

type PromptAction = "activate" | "archive" | "rollback"; /* 第52天：定义前端可触发的提示词生命周期动作。 */

function statusClass(status: PromptTemplate["status"]): string { /* 第52天：定义提示词状态徽标样式选择器。 */
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"; /* 第52天：active 版本使用绿色强调。 */
  if (status === "draft") return "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300"; /* 第52天：draft 版本使用琥珀色提示。 */
  return "bg-zinc-500/10 text-zinc-500 ring-zinc-500/15 dark:text-zinc-400"; /* 第52天：archived 版本使用低强调样式。 */
} /* 第52天：结束状态样式选择器。 */

function formatTime(value: number): string { /* 第52天：定义时间戳格式化函数。 */
  return new Date(value).toLocaleString("zh-CN"); /* 第52天：使用中文本地化时间展示更新时间。 */
} /* 第52天：结束时间格式化函数。 */

function PromptVersionCard({ prompt, onAction, disabled }: { prompt: PromptTemplate; onAction: (action: PromptAction, prompt: PromptTemplate) => void; disabled: boolean }) { /* 第52天：定义单个提示词版本卡片。 */
  return ( /* 第52天：返回提示词版本卡片视图。 */
    <li className="rounded-lg border border-teal-200/70 bg-white/75 p-2.5 text-[10px] dark:border-teal-900/50 dark:bg-zinc-950/25"> {/* 第52天：定义卡片容器。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第52天：排列提示词名称与状态。 */}
        <div className="min-w-0"> {/* 第52天：限制标题区域宽度，避免长文本撑破布局。 */}
          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-50">{prompt.name}</p> {/* 第52天：展示提示词名称。 */}
          <p className="mt-0.5 font-mono text-[9px] text-teal-700 dark:text-teal-300">{prompt.id} · {prompt.componentType}</p> {/* 第52天：展示提示词 ID 与组件类型。 */}
        </div> {/* 第52天：结束标题区域。 */}
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold ring-1 ${statusClass(prompt.status)}`}>{prompt.status}</span> {/* 第52天：展示生命周期状态徽标。 */}
      </div> {/* 第52天：结束标题布局。 */}
      <div className="mt-2 flex flex-wrap gap-1"> {/* 第52天：定义变量标签列表。 */}
        {prompt.variables.map((variable) => <span key={variable} className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[9px] text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">{variable}</span>)} {/* 第52天：逐个展示模板变量。 */}
      </div> {/* 第52天：结束变量标签列表。 */}
      <p className="mt-2 line-clamp-4 whitespace-pre-line rounded-md bg-zinc-50 p-2 text-[9px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{prompt.template}</p> {/* 第52天：展示提示词正文预览。 */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center"> {/* 第52天：定义评分、成本和更新时间指标网格。 */}
        <div className="rounded bg-teal-50 p-1.5 dark:bg-teal-950/25"><p className="text-[8px] text-teal-700">Score</p><p className="font-mono text-[10px] font-semibold">{prompt.score ?? "—"}</p></div> {/* 第52天：展示最近评估分。 */}
        <div className="rounded bg-zinc-100 p-1.5 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Cost</p><p className="font-mono text-[10px] font-semibold">${(prompt.costEstimate ?? 0).toFixed(5)}</p></div> {/* 第52天：展示成本估算。 */}
        <div className="rounded bg-zinc-100 p-1.5 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Updated</p><p className="truncate font-mono text-[9px] font-semibold" title={formatTime(prompt.updatedAt)}>{formatTime(prompt.updatedAt)}</p></div> {/* 第52天：展示最近更新时间。 */}
      </div> {/* 第52天：结束指标网格。 */}
      <div className="mt-2 flex gap-1"> {/* 第52天：定义生命周期操作按钮组。 */}
        <button type="button" disabled={disabled || prompt.status === "active"} onClick={() => onAction("activate", prompt)} className="flex-1 rounded-md bg-teal-600 px-2 py-1 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Activate</button> {/* 第52天：激活目标版本。 */}
        <button type="button" disabled={disabled || prompt.status === "archived"} onClick={() => onAction("archive", prompt)} className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-[9px] font-semibold text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">Archive</button> {/* 第52天：归档目标版本。 */}
        <button type="button" disabled={disabled || prompt.status === "active"} onClick={() => onAction("rollback", prompt)} className="flex-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">Rollback</button> {/* 第52天：回滚到目标版本。 */}
      </div> {/* 第52天：结束操作按钮组。 */}
    </li> /* 第52天：结束提示词版本卡片。 */
  ); /* 第52天：结束卡片返回。 */
} /* 第52天：结束 PromptVersionCard 组件。 */

export function PromptExplorer() { /* 第52天：定义 Prompt Explorer（提示词浏览器）主组件。 */
  const [snapshot, setSnapshot] = useState<PromptDashboardSnapshot | null>(null); /* 第52天：保存接口返回的完整提示词快照。 */
  const [activeComponent, setActiveComponent] = useState("research"); /* 第52天：保存当前查看的组件 ID。 */
  const [loading, setLoading] = useState(true); /* 第52天：保存加载和生命周期动作状态。 */
  const [error, setError] = useState(""); /* 第52天：保存用户可读错误信息。 */

  const loadSnapshot = useCallback(async () => { /* 第52天：定义读取提示词快照的方法。 */
    setLoading(true); /* 第52天：进入加载状态。 */
    setError(""); /* 第52天：清空旧错误。 */
    try { /* 第52天：捕获接口异常。 */
      const response = await fetch("/api/prompts"); /* 第52天：请求 Prompt Registry 快照。 */
      const data = await readApiData<PromptDashboardSnapshot>(response); /* 第52天：解析统一 API 响应。 */
      setSnapshot(data); /* 第52天：保存最新快照。 */
      setActiveComponent((current) => data.prompts.some((prompt) => prompt.componentId === current) ? current : data.activePrompts[0]?.componentId ?? "research"); /* 第52天：确保当前组件在新快照中存在。 */
    } catch (loadError) { /* 第52天：处理加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Prompt Registry 失败"); /* 第52天：写入统一错误文案。 */
    } finally { /* 第52天：确保请求结束后恢复交互状态。 */
      setLoading(false); /* 第52天：退出加载状态。 */
    } /* 第52天：结束异常处理。 */
  }, []); /* 第52天：保持加载函数引用稳定。 */

  useEffect(() => { /* 第52天：组件挂载后自动读取提示词快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(), 0); /* 第52天：延迟执行，避免副作用主体同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第52天：组件卸载时清理定时器。 */
  }, [loadSnapshot]); /* 第52天：依赖稳定的加载函数。 */

  const promptsByComponent = useMemo(() => { /* 第52天：按组件 ID 派生提示词版本分组。 */
    const groups = new Map<string, PromptTemplate[]>(); /* 第52天：创建组件到模板列表的映射。 */
    for (const prompt of snapshot?.prompts ?? []) groups.set(prompt.componentId, [...(groups.get(prompt.componentId) ?? []), prompt]); /* 第52天：把每个版本追加到对应组件。 */
    return groups; /* 第52天：返回分组映射。 */
  }, [snapshot]); /* 第52天：仅在快照变化时重新分组。 */

  const componentIds = useMemo(() => Array.from(promptsByComponent.keys()), [promptsByComponent]); /* 第52天：派生组件标签页 ID 列表。 */
  const activePrompts = promptsByComponent.get(activeComponent) ?? []; /* 第52天：读取当前组件的全部提示词版本。 */

  const runAction = useCallback(async (action: PromptAction, prompt: PromptTemplate) => { /* 第52天：定义执行提示词生命周期动作的方法。 */
    setLoading(true); /* 第52天：进入动作加载状态。 */
    setError(""); /* 第52天：清空旧错误。 */
    try { /* 第52天：捕获动作请求异常。 */
      const response = await fetch("/api/prompts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, componentId: prompt.componentId, version: prompt.version }) }); /* 第52天：发送生命周期动作请求。 */
      const data = await readApiData<PromptDashboardSnapshot>(response); /* 第52天：解析动作完成后的最新快照。 */
      setSnapshot(data); /* 第52天：刷新本地快照。 */
      setActiveComponent(prompt.componentId); /* 第52天：保持用户停留在刚操作的组件。 */
    } catch (actionError) { /* 第52天：处理动作失败。 */
      setError(actionError instanceof ApiClientError ? actionError.message : "Prompt 生命周期操作失败"); /* 第52天：写入统一错误文案。 */
    } finally { /* 第52天：确保动作结束后恢复按钮。 */
      setLoading(false); /* 第52天：退出动作加载状态。 */
    } /* 第52天：结束动作异常处理。 */
  }, []); /* 第52天：保持动作函数引用稳定。 */

  return ( /* 第52天：返回 Prompt Explorer 完整视图。 */
    <section className="shrink-0 border-b border-teal-200/70 px-4 py-3 dark:border-teal-900/40"> {/* 第52天：定义提示词浏览器外层容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第52天：排列标题说明与刷新按钮。 */}
        <div> {/* 第52天：定义标题说明区域。 */}
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Prompt Explorer（提示词浏览器）</p> {/* 第52天：展示看板标题。 */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Day 53 · Prompt Registry 继续提供候选版本、diff、rollback 和 regression link，供实验平台选择 winner。</p> {/* 第53天：展示提示词注册表在实验平台中的作用。 */}
        </div> {/* 第52天：结束标题说明区域。 */}
        <div className="flex shrink-0 gap-1"> {/* 第52天增强：排列刷新和完整控制台入口。 */}
          <a href="/prompts" className="rounded-lg border border-teal-300 px-2.5 py-1.5 text-[10px] font-semibold text-teal-700 transition hover:bg-teal-50 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-950/30">管理</a> {/* 第52天增强：跳转到完整提示词管理页面。 */}
          <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "加载中..." : "刷新"}</button> {/* 第52天：提供手动刷新入口。 */}
        </div> {/* 第52天增强：结束刷新和完整控制台入口。 */}
      </div> {/* 第52天：结束标题布局。 */}
      {error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第52天：按需展示错误信息。 */}
      {!snapshot ? <p className="mt-3 rounded-lg border border-dashed border-teal-200 py-5 text-center text-[11px] text-teal-700 dark:border-teal-900/50 dark:text-teal-300">正在加载 Prompt Registry...</p> : null} {/* 第52天：快照未就绪时展示加载占位。 */}
      {snapshot ? ( /* 第52天：快照存在时渲染看板主体。 */
        <div className="mt-3 space-y-3"> {/* 第52天：定义看板主体垂直间距。 */}
          <div className="grid grid-cols-4 gap-1 text-center"> {/* 第52天：定义注册表核心指标网格。 */}
            <div className="rounded-lg bg-teal-50 p-2 dark:bg-teal-950/25"><p className="text-[8px] text-teal-700">Total</p><p className="font-mono text-sm font-semibold">{snapshot.metrics.totalPrompts}</p></div> {/* 第52天：展示提示词版本总数。 */}
            <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/25"><p className="text-[8px] text-emerald-700">Active</p><p className="font-mono text-sm font-semibold">{snapshot.metrics.activePrompts}</p></div> {/* 第52天：展示 active 数量。 */}
            <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/25"><p className="text-[8px] text-amber-700">Draft</p><p className="font-mono text-sm font-semibold">{snapshot.metrics.draftPrompts}</p></div> {/* 第52天：展示 draft 数量。 */}
            <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-900"><p className="text-[8px] text-zinc-500">Components</p><p className="font-mono text-sm font-semibold">{snapshot.metrics.componentCount}</p></div> {/* 第52天：展示组件覆盖数量。 */}
          </div> {/* 第52天：结束核心指标网格。 */}
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 53 Prompt 组件标签页"> {/* 第53天：定义组件标签页导航。 */}
            {componentIds.map((componentId) => <button type="button" role="tab" aria-selected={activeComponent === componentId} key={componentId} onClick={() => setActiveComponent(componentId)} className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold transition ${activeComponent === componentId ? "bg-white text-teal-700 shadow-sm dark:bg-zinc-800 dark:text-teal-300" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{componentId}</button>)} {/* 第52天：渲染组件切换按钮。 */}
          </div> {/* 第52天：结束组件标签页导航。 */}
          <ul className="space-y-2"> {/* 第52天：定义当前组件提示词版本列表。 */}
            {activePrompts.map((prompt) => <PromptVersionCard key={prompt.id} prompt={prompt} onAction={runAction} disabled={loading} />)} {/* 第52天：渲染当前组件所有版本卡片。 */}
          </ul> {/* 第52天：结束提示词版本列表。 */}
          <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 p-2.5 text-[10px] text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-100"> {/* 第52天：定义默认 Prompt Diff 卡片。 */}
            <p className="text-[11px] font-semibold">Prompt Diff（提示词差异） · {snapshot.comparison.componentId}.{snapshot.comparison.baselineVersion} → {snapshot.comparison.candidateVersion}</p> {/* 第52天：展示 diff 标题。 */}
            <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2"> {/* 第52天：定义新增与删除两栏。 */}
              <div><p className="font-semibold text-emerald-700 dark:text-emerald-300">新增</p><ul className="mt-1 space-y-1">{snapshot.comparison.addedLines.map((line) => <li key={line} className="rounded bg-white/70 px-2 py-1 font-mono text-[9px] dark:bg-zinc-950/30">+ {line}</li>)}</ul></div> {/* 第52天：展示候选版本新增行。 */}
              <div><p className="font-semibold text-red-700 dark:text-red-300">删除</p><ul className="mt-1 space-y-1">{snapshot.comparison.removedLines.map((line) => <li key={line} className="rounded bg-white/70 px-2 py-1 font-mono text-[9px] dark:bg-zinc-950/30">- {line}</li>)}</ul></div> {/* 第52天：展示候选版本删除行。 */}
            </div> {/* 第52天：结束新增删除两栏。 */}
          </div> {/* 第52天：结束 Prompt Diff 卡片。 */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-[10px] dark:border-zinc-800 dark:bg-zinc-950/25"> {/* 第52天：定义渲染预览卡片。 */}
            <p className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-50">Rendered Preview（渲染预览）</p> {/* 第52天：展示渲染预览标题。 */}
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 font-mono text-[9px] leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{snapshot.renderedPreview}</pre> {/* 第52天：展示 active research Prompt 渲染后的正文。 */}
          </div> {/* 第52天：结束渲染预览卡片。 */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-[10px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"> {/* 第52天：定义回归关联卡片。 */}
            <p className="text-[11px] font-semibold">Regression Link（回归关联）</p> {/* 第52天：展示回归关联标题。 */}
            {snapshot.regressionLinks.map((link) => <p key={`${link.baselinePromptId}-${link.candidatePromptId}`} className="mt-1 font-mono">{link.baselinePromptId} → {link.candidatePromptId} · {link.result} · score Δ {link.scoreDelta >= 0 ? "+" : ""}{link.scoreDelta} · cost Δ {link.costDeltaPercent >= 0 ? "+" : ""}{link.costDeltaPercent}%</p>)} {/* 第52天：展示提示词版本与回归结果关联。 */}
          </div> {/* 第52天：结束回归关联卡片。 */}
        </div> /* 第52天：结束看板主体。 */
      ) : null} {/* 第52天：结束快照条件渲染。 */}
    </section> /* 第52天：结束 Prompt Explorer 外层容器。 */
  ); /* 第52天：结束 Prompt Explorer 返回。 */
} /* 第52天：结束 Prompt Explorer 主组件。 */
