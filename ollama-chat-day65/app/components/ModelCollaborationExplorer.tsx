"use client"; /* 第56天：声明为客户端组件，用于加载协作快照并切换查看标签页。 */

import { useCallback, useEffect, useMemo, useState } from "react"; /* 第56天：引入 React Hooks，用于请求、状态和派生数据。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第56天：引入统一 API 响应解析工具。 */
import type { CollaborationDashboardSnapshot, CollaborationPreview, CollaborationStageResult } from "@/lib/model/model-collaboration-types"; /* 第56天：引入模型协作看板、预览和阶段结果类型。 */

type CollaborationTab = "overview" | "plans" | "results"; /* 第56天：定义模型协作浏览器内部标签页类型。 */

const tabs: Array<{ id: CollaborationTab; label: string }> = [ /* 第56天：定义模型协作浏览器标签页配置。 */
  { id: "overview", label: "团队" }, /* 第56天：团队标签页展示角色覆盖和模型团队。 */
  { id: "plans", label: "计划" }, /* 第56天：计划标签页展示不同任务的协作阶段。 */
  { id: "results", label: "结果" }, /* 第56天：结果标签页展示阶段输出、合并结果和成本。 */
]; /* 第56天：结束标签页配置。 */

const roleLabels: Record<string, string> = { /* 第56天：定义协作角色的中文标签映射。 */
  reasoning: "推理", /* 第56天：reasoning 对应推理角色。 */
  writing: "写作", /* 第56天：writing 对应写作角色。 */
  evaluation: "评估", /* 第56天：evaluation 对应评估角色。 */
  json: "JSON", /* 第56天：json 对应结构化输出角色。 */
  embedding: "向量", /* 第56天：embedding 对应向量化角色。 */
  summary: "摘要", /* 第56天：summary 对应摘要角色。 */
}; /* 第56天：结束协作角色中文标签映射。 */

function formatCost(value: number): string { /* 第56天：定义成本格式化函数。 */
  return value === 0 ? "$0" : `$${value.toFixed(6)}`; /* 第56天：零成本显示为 $0，非零成本保留六位小数。 */
} /* 第56天：结束成本格式化函数。 */

function formatDuration(value: number): string { /* 第56天：定义耗时格式化函数。 */
  return `${Math.max(0, Math.round(value))}ms`; /* 第56天：把耗时四舍五入成毫秒字符串。 */
} /* 第56天：结束耗时格式化函数。 */

function stageBadge(stage: CollaborationStageResult): string { /* 第56天：定义阶段徽标文案函数。 */
  return `${roleLabels[stage.role] ?? stage.role} / ${stage.modelId}`; /* 第56天：组合中文角色和实际模型 ID。 */
} /* 第56天：结束阶段徽标文案函数。 */

function PreviewHeader({ preview }: { preview: CollaborationPreview }) { /* 第56天：定义协作预览卡片头部组件。 */
  return ( /* 第56天：返回协作预览头部视图。 */
    <div className="flex items-start justify-between gap-3"> {/* 第56天：排列预览标题和策略徽标。 */}
      <div className="min-w-0"> {/* 第56天：定义标题文本容器。 */}
        <p className="truncate text-xs font-semibold text-zinc-950 dark:text-zinc-50">{preview.label}</p> {/* 第56天：展示预览场景名称。 */}
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{preview.plan.reason}</p> {/* 第56天：展示规划器给出的中文计划理由。 */}
      </div> {/* 第56天：结束标题文本容器。 */}
      <span className="shrink-0 rounded-md bg-cyan-50 px-2 py-1 font-mono text-[10px] font-semibold text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-950/35 dark:text-cyan-200 dark:ring-cyan-900/60">{preview.plan.strategy}</span> {/* 第56天：展示 single、pipeline 或 parallel 策略。 */}
    </div> /* 第56天：结束协作预览头部布局。 */
  ); /* 第56天：结束协作预览头部返回。 */
} /* 第56天：结束协作预览卡片头部组件。 */

function StageTimeline({ preview }: { preview: CollaborationPreview }) { /* 第56天：定义协作阶段时间线组件。 */
  return ( /* 第56天：返回阶段时间线视图。 */
    <ol className="mt-3 space-y-2"> {/* 第56天：用有序列表展示模型协作阶段。 */}
      {preview.plan.stages.map((stage, index) => ( /* 第56天：遍历计划中的每个协作阶段。 */
        <li key={stage.id} className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-2.5 py-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-900/60"> {/* 第56天：定义单个阶段卡片。 */}
          <div className="flex items-start justify-between gap-2"> {/* 第56天：排列阶段角色和模型信息。 */}
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">#{index + 1} {roleLabels[stage.role] ?? stage.role}</p> {/* 第56天：展示阶段顺序和角色。 */}
            <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">{stage.modelId}</span> {/* 第56天：展示该阶段模型 ID。 */}
          </div> {/* 第56天：结束阶段角色和模型布局。 */}
          <p className="mt-1 leading-relaxed text-zinc-500 dark:text-zinc-400">{stage.reason}</p> {/* 第56天：展示该阶段选择理由。 */}
          <p className="mt-1 font-mono text-[10px] text-zinc-400">from: {(stage.inputFrom ?? ["user"]).join(", ")} {stage.parallelGroup ? `· parallel: ${stage.parallelGroup}` : ""}</p> {/* 第56天：展示阶段依赖和并行分组。 */}
        </li> /* 第56天：结束单个阶段卡片。 */
      ))} {/* 第56天：结束阶段遍历。 */}
    </ol> /* 第56天：结束阶段时间线列表。 */
  ); /* 第56天：结束阶段时间线返回。 */
} /* 第56天：结束协作阶段时间线组件。 */

function StageResultList({ preview }: { preview: CollaborationPreview }) { /* 第56天：定义阶段执行结果列表组件。 */
  return ( /* 第56天：返回阶段执行结果列表。 */
    <div className="mt-3 space-y-2"> {/* 第56天：定义阶段结果外层容器。 */}
      {preview.execution.stageResults.map((stage) => ( /* 第56天：遍历执行后的阶段结果。 */
        <article key={stage.stageId} className="rounded-lg border border-zinc-200 bg-white p-2.5 text-[11px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第56天：定义单个阶段结果卡片。 */}
          <div className="flex items-start justify-between gap-2"> {/* 第56天：排列阶段徽标和成功状态。 */}
            <p className="min-w-0 truncate font-semibold text-zinc-950 dark:text-zinc-50">{stageBadge(stage)}</p> {/* 第56天：展示角色和实际模型。 */}
            <span className={stage.success ? "rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-200 dark:ring-emerald-900/60" : "rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/35 dark:text-amber-200 dark:ring-amber-900/60"}>{stage.success ? "ok" : "fallback"}</span> {/* 第56天：展示阶段是否真实成功。 */}
          </div> {/* 第56天：结束阶段徽标和成功状态布局。 */}
          <p className="mt-1 line-clamp-3 leading-relaxed text-zinc-500 dark:text-zinc-400">{stage.output}</p> {/* 第56天：展示阶段输出摘要。 */}
          <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px] text-zinc-500"> {/* 第56天：展示阶段用量和成本标签。 */}
            <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">{formatDuration(stage.durationMs)}</span> {/* 第56天：展示阶段耗时。 */}
            <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">{stage.usage.totalTokens} tokens</span> {/* 第56天：展示阶段总词元。 */}
            <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">{formatCost(stage.usage.estimatedCost)}</span> {/* 第56天：展示阶段估算成本。 */}
          </div> {/* 第56天：结束阶段用量和成本标签。 */}
        </article> /* 第56天：结束单个阶段结果卡片。 */
      ))} {/* 第56天：结束阶段结果遍历。 */}
    </div> /* 第56天：结束阶段结果外层容器。 */
  ); /* 第56天：结束阶段执行结果列表返回。 */
} /* 第56天：结束阶段执行结果列表组件。 */

export function ModelCollaborationExplorer() { /* 第56天：定义 Model Collaboration Explorer（模型协作浏览器）主组件。 */
  const [snapshot, setSnapshot] = useState<CollaborationDashboardSnapshot | null>(null); /* 第56天：保存后端返回的协作看板快照。 */
  const [activeTab, setActiveTab] = useState<CollaborationTab>("overview"); /* 第56天：保存当前激活的内部标签页。 */
  const [loading, setLoading] = useState(true); /* 第56天：保存快照加载状态。 */
  const [error, setError] = useState(""); /* 第56天：保存快照加载错误。 */

  const loadSnapshot = useCallback(async () => { /* 第56天：定义加载协作看板快照的方法。 */
    setLoading(true); /* 第56天：开始加载时打开加载态。 */
    setError(""); /* 第56天：开始加载时清空旧错误。 */
    try { /* 第56天：捕获网络或 API 解析错误。 */
      const response = await fetch("/api/model/collaboration", { method: "GET" }); /* 第56天：请求模型协作看板快照接口。 */
      setSnapshot(await readApiData<CollaborationDashboardSnapshot>(response)); /* 第56天：解析统一响应并写入快照状态。 */
    } catch (loadError) { /* 第56天：处理加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载模型协作数据失败"); /* 第56天：写入用户可读错误信息。 */
    } finally { /* 第56天：无论成功失败都关闭加载态。 */
      setLoading(false); /* 第56天：结束加载态。 */
    } /* 第56天：结束 finally。 */
  }, []); /* 第56天：加载函数无外部依赖。 */

  useEffect(() => { /* 第56天：组件挂载后自动加载一次快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(), 0); /* 第56天：延迟到事件循环后发起请求，避免 effect 同步更新状态。 */
    return () => window.clearTimeout(timer); /* 第56天：卸载时清理延迟定时器。 */
  }, [loadSnapshot]); /* 第56天：依赖稳定的加载函数。 */

  const metricCards = useMemo(() => { /* 第56天：定义从快照派生指标卡片的方法。 */
    if (!snapshot) return []; /* 第56天：没有快照时返回空指标列表。 */
    return [ /* 第56天：返回四个核心协作指标。 */
      { label: "团队模型", value: snapshot.metrics.teamSize }, /* 第56天：展示团队去重模型数量。 */
      { label: "角色覆盖", value: snapshot.metrics.roleCoverage }, /* 第56天：展示覆盖的协作角色数量。 */
      { label: "并行计划", value: snapshot.metrics.parallelPlanCount }, /* 第56天：展示并行协作计划数量。 */
      { label: "均成本", value: formatCost(snapshot.metrics.avgEstimatedCost) }, /* 第56天：展示平均估算成本。 */
    ]; /* 第56天：结束核心指标数组。 */
  }, [snapshot]); /* 第56天：快照变化时重新计算指标卡片。 */

  return ( /* 第56天：返回模型协作浏览器界面。 */
    <section className="space-y-3"> {/* 第56天：定义协作浏览器外层容器。 */}
      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第56天：定义顶部标题和刷新区域。 */}
        <div className="flex items-start justify-between gap-3"> {/* 第56天：排列标题说明和刷新按钮。 */}
          <div className="min-w-0"> {/* 第56天：定义标题文本容器。 */}
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Model Collaboration Explorer</p> {/* 第56天：展示协作浏览器标题。 */}
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第56天：展示模型团队、协作计划、并行阶段、Trace/Usage 与结果合并。</p> {/* 第56天：展示功能说明。 */}
          </div> {/* 第56天：结束标题文本容器。 */}
          <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="h-8 shrink-0 rounded-md bg-cyan-600 px-3 text-[11px] font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "加载" : "刷新"}</button> {/* 第56天：提供刷新协作快照按钮。 */}
        </div> {/* 第56天：结束标题说明和刷新按钮布局。 */}
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="Day 56 模型协作分析"> {/* 第56天：定义内部标签页列表。 */}
          {tabs.map((tab) => ( /* 第56天：遍历内部标签页配置。 */
            <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`h-8 rounded-md px-2 text-[11px] font-semibold transition ${activeTab === tab.id ? "bg-white text-cyan-700 shadow-sm dark:bg-zinc-800 dark:text-cyan-200" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}>{tab.label}</button> /* 第56天：渲染单个内部标签按钮。 */
          ))} {/* 第56天：结束内部标签页遍历。 */}
        </div> {/* 第56天：结束内部标签页列表。 */}
      </div> {/* 第56天：结束顶部标题和刷新区域。 */}

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第56天：按需展示加载错误。 */}
      {!snapshot ? <div className="rounded-lg border border-dashed border-zinc-300 bg-white/70 px-3 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/20 dark:text-zinc-400">正在读取模型协作快照...</div> : null} {/* 第56天：快照未返回前展示占位提示。 */}

      {snapshot && activeTab === "overview" ? ( /* 第56天：团队概览标签页内容。 */
        <div className="space-y-3"> {/* 第56天：定义团队概览布局。 */}
          <div className="grid grid-cols-2 gap-2"> {/* 第56天：定义指标卡片网格。 */}
            {metricCards.map((metric) => ( /* 第56天：遍历指标卡片。 */
              <div key={metric.label} className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-cyan-950 dark:border-cyan-900/60 dark:bg-cyan-950/35 dark:text-cyan-50"> {/* 第56天：定义单个指标卡片。 */}
                <p className="text-[10px] font-semibold uppercase opacity-70">{metric.label}</p> {/* 第56天：展示指标名称。 */}
                <p className="mt-1 truncate font-mono text-xl font-bold">{metric.value}</p> {/* 第56天：展示指标值。 */}
              </div> /* 第56天：结束单个指标卡片。 */
            ))} {/* 第56天：结束指标卡片遍历。 */}
          </div> {/* 第56天：结束指标卡片网格。 */}
          <div className="space-y-2"> {/* 第56天：定义模型团队列表容器。 */}
            {snapshot.team.map((member) => ( /* 第56天：遍历团队成员。 */
              <article key={`${member.role}-${member.model.id}`} className="rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第56天：定义团队成员卡片。 */}
                <div className="flex items-start justify-between gap-2"> {/* 第56天：排列角色和模型 ID。 */}
                  <p className="font-semibold text-zinc-950 dark:text-zinc-50">{roleLabels[member.role] ?? member.role}</p> {/* 第56天：展示协作角色中文名称。 */}
                  <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{member.model.id}</span> {/* 第56天：展示承担角色的模型 ID。 */}
                </div> {/* 第56天：结束角色和模型 ID 布局。 */}
                <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{member.model.provider} / {member.model.model}</p> {/* 第56天：展示模型提供方和底层模型名。 */}
              </article> /* 第56天：结束团队成员卡片。 */
            ))} {/* 第56天：结束团队成员遍历。 */}
          </div> {/* 第56天：结束模型团队列表容器。 */}
        </div> /* 第56天：结束团队概览标签页内容。 */
      ) : null} {/* 第56天：结束团队概览条件渲染。 */}

      {snapshot && activeTab === "plans" ? ( /* 第56天：协作计划标签页内容。 */
        <div className="space-y-2"> {/* 第56天：定义协作计划列表容器。 */}
          {snapshot.previews.map((preview) => ( /* 第56天：遍历典型协作预览。 */
            <article key={preview.task.taskId} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第56天：定义协作计划卡片。 */}
              <PreviewHeader preview={preview} /> {/* 第56天：渲染协作预览头部。 */}
              <StageTimeline preview={preview} /> {/* 第56天：渲染阶段时间线。 */}
            </article> /* 第56天：结束协作计划卡片。 */
          ))} {/* 第56天：结束典型协作预览遍历。 */}
        </div> /* 第56天：结束协作计划列表容器。 */
      ) : null} {/* 第56天：结束协作计划条件渲染。 */}

      {snapshot && activeTab === "results" ? ( /* 第56天：协作结果标签页内容。 */
        <div className="space-y-2"> {/* 第56天：定义协作结果列表容器。 */}
          {snapshot.previews.map((preview) => ( /* 第56天：遍历执行结果预览。 */
            <article key={preview.task.taskId} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第56天：定义执行结果卡片。 */}
              <PreviewHeader preview={preview} /> {/* 第56天：复用预览头部。 */}
              <StageResultList preview={preview} /> {/* 第56天：展示每个阶段执行结果。 */}
              <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50/70 p-2.5 text-[11px] dark:border-cyan-900/50 dark:bg-cyan-950/25"> {/* 第56天：定义最终合并结果区域。 */}
                <p className="font-semibold text-cyan-950 dark:text-cyan-100">Merged Result（合并结果）</p> {/* 第56天：展示合并结果标题。 */}
                <p className="mt-1 line-clamp-4 whitespace-pre-line leading-relaxed text-cyan-900/80 dark:text-cyan-100/80">{preview.execution.merged.finalOutput}</p> {/* 第56天：展示最终合并输出摘要。 */}
                <p className="mt-2 font-mono text-[10px] text-cyan-800 dark:text-cyan-200">cost {formatCost(preview.execution.totalCost)} · duration {formatDuration(preview.execution.totalDurationMs)} · trace spans {preview.execution.trace?.spans.length ?? 0}</p> {/* 第56天：展示总成本、总耗时和 Trace span 数。 */}
              </div> {/* 第56天：结束最终合并结果区域。 */}
            </article> /* 第56天：结束执行结果卡片。 */
          ))} {/* 第56天：结束执行结果预览遍历。 */}
        </div> /* 第56天：结束协作结果列表容器。 */
      ) : null} {/* 第56天：结束协作结果条件渲染。 */}
    </section> /* 第56天：结束模型协作浏览器外层容器。 */
  ); /* 第56天：结束模型协作浏览器返回。 */
} /* 第56天：结束 Model Collaboration Explorer 主组件。 */

