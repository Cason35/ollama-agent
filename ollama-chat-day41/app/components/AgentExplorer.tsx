"use client"; /* 当前组件需要在浏览器端拉取第40天 Supervisor 协作快照。 */

import { useEffect, useMemo, useState } from "react"; /* 引入 React Hooks 用于状态、副作用和派生数据。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 引入统一 API 解析工具。 */
import type { Agent, AgentCallEdge, AgentCollaborationSnapshot, AgentMetrics, AgentPlan, AgentResult, AgentTimelineEvent } from "@/lib/agents/agent-types"; /* 引入第40天智能体面板需要的类型。 */

type AgentExplorerPayload = { /* 定义 /api/agents 返回的数据结构。 */
  agents: Agent[]; /* 保存智能体列表。 */
  metrics: AgentMetrics; /* 保存智能体注册表与计划运行时指标。 */
  routes: Record<string, string | null>; /* 保存能力路由测试结果。 */
  demoResult: AgentResult; /* 保存单智能体执行示例结果。 */
  collaboration: AgentCollaborationSnapshot; /* 保存第40天 Supervisor 协作执行快照。 */
}; /* 结束 AgentExplorerPayload 类型定义。 */

function formatRate(rate: number): string { /* 定义成功率格式化函数。 */
  return `${Math.round(rate * 100)}%`; /* 将 0 到 1 的成功率转换为百分比文本。 */
} /* 结束 formatRate 函数。 */

function SupervisorDecision({ plan }: { plan: AgentPlan }) { /* 定义 Supervisor 决策展示组件。 */
  return ( /* 返回 Supervisor 决策视图。 */
    <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义决策面板容器。 */}
      <p className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Supervisor Decision</p> {/* 展示决策标题。 */}
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">Goal: {plan.goal}</p> {/* 展示用户目标。 */}
      <p className="mt-1 font-mono text-[10px] text-fuchsia-800 dark:text-fuchsia-200">Selected Agents: {plan.selectedAgents.join(", ")}</p> {/* 展示已选择智能体。 */}
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">Reason: {plan.reason}</p> {/* 展示 Supervisor 决策原因。 */}
    </div> /* 结束决策面板容器。 */
  ); /* 结束返回。 */
} /* 结束 SupervisorDecision 组件。 */

function AgentPlanSteps({ plan }: { plan: AgentPlan }) { /* 定义智能体计划步骤展示组件。 */
  return ( /* 返回计划步骤视图。 */
    <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义步骤面板容器。 */}
      <p className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Agent Plan Steps</p> {/* 展示步骤标题。 */}
      <ol className="mt-2 space-y-1"> {/* 定义步骤列表。 */}
        {plan.steps.map((step, index) => ( /* 遍历计划步骤。 */
          <li key={step.id} className="rounded-md border border-fuchsia-100 bg-fuchsia-50/70 px-2 py-1 text-[10px] dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义单个步骤卡片。 */}
            <p className="font-mono font-semibold text-fuchsia-900 dark:text-fuchsia-100">{index + 1}. {step.agentId}</p> {/* 展示步骤序号和智能体。 */}
            <p className="mt-0.5 leading-relaxed text-zinc-600 dark:text-zinc-300">{step.task}</p> {/* 展示步骤任务。 */}
            <p className="mt-0.5 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">dependsOn: {(step.dependsOn ?? []).join(", ") || "-"}</p> {/* 展示步骤依赖。 */}
          </li> /* 结束单个步骤卡片。 */
        ))} {/* 结束计划步骤遍历。 */}
      </ol> {/* 结束步骤列表。 */}
    </div> /* 结束步骤面板容器。 */
  ); /* 结束返回。 */
} /* 结束 AgentPlanSteps 组件。 */

function AgentDAGVisualizer({ plan }: { plan: AgentPlan }) { /* 定义第41天 Agent DAG 可视化组件。 */
  const layers = plan.steps.reduce<Record<number, typeof plan.steps>>((acc, step) => { const depth = getStepDepth(step.id, plan.steps); return { ...acc, [depth]: [...(acc[depth] ?? []), step] }; }, {}); /* 按依赖深度把 DAG 节点分层。 */
  return ( /* 返回 DAG 可视化视图。 */
    <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义 DAG 面板容器。 */}
      <p className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Agent DAG Visualizer</p> {/* 展示 DAG 可视化标题。 */}
      <div className="mt-2 space-y-2"> {/* 定义 DAG 层级容器。 */}
        {Object.entries(layers).map(([depth, steps]) => ( /* 遍历每一层 DAG 节点。 */
          <div key={depth} className="rounded-md border border-fuchsia-100 bg-fuchsia-50/70 px-2 py-1 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义单层 DAG 容器。 */}
            <p className="font-mono text-[9px] text-zinc-500 dark:text-zinc-400">depth {depth}</p> {/* 展示当前层级深度。 */}
            <div className="mt-1 flex flex-wrap gap-1"> {/* 定义当前层级节点列表。 */}
              {steps.map((step) => ( /* 遍历当前层级的步骤。 */
                <span key={step.id} className="rounded-md bg-white px-2 py-1 font-mono text-[10px] text-fuchsia-800 ring-1 ring-fuchsia-200 dark:bg-zinc-950/40 dark:text-fuchsia-200 dark:ring-fuchsia-900/50">{step.id} / {step.agentId}</span> /* 展示 DAG 节点名称和 Agent。 */
              ))} {/* 结束当前层级步骤遍历。 */}
            </div> {/* 结束当前层级节点列表。 */}
          </div> /* 结束单层 DAG 容器。 */
        ))} {/* 结束 DAG 层级遍历。 */}
      </div> {/* 结束 DAG 层级容器。 */}
    </div> /* 结束 DAG 面板容器。 */
  ); /* 结束返回。 */
} /* 结束 AgentDAGVisualizer 组件。 */

function getStepDepth(stepId: string, steps: AgentPlan["steps"]): number { /* 定义根据 dependsOn 计算步骤深度的工具函数。 */
  const step = steps.find((item) => item.id === stepId); /* 查找目标步骤。 */
  const parentDepths = (step?.dependsOn ?? []).map((dep) => getStepDepth(dep, steps)); /* 递归计算父节点深度。 */
  return parentDepths.length ? Math.max(...parentDepths) + 1 : 1; /* 返回入口为 1 的 DAG 深度。 */
} /* 结束 getStepDepth 函数。 */

function AgentCallGraph({ edges }: { edges: AgentCallEdge[] }) { /* 定义智能体调用图展示组件。 */
  return ( /* 返回调用图视图。 */
    <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义调用图容器。 */}
      <p className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Agent Call Graph</p> {/* 展示调用图标题。 */}
      <div className="mt-2 space-y-1"> {/* 定义调用边列表。 */}
        {edges.map((edge) => ( /* 遍历调用图边。 */
          <div key={`${edge.fromAgentId}-${edge.toAgentId}-${edge.taskId}`} className="flex items-center gap-1.5 rounded-md bg-fuchsia-50 px-2 py-1 font-mono text-[10px] text-fuchsia-800 dark:bg-fuchsia-950/30 dark:text-fuchsia-200"> {/* 定义单条调用边。 */}
            <span>{edge.fromAgentId}</span> {/* 展示上游智能体。 */}
            <span className="text-zinc-400">-&gt;</span> {/* 展示委派箭头。 */}
            <span>{edge.toAgentId}</span> {/* 展示下游智能体。 */}
            <span className="ml-auto text-[9px] text-zinc-500 dark:text-zinc-400">{edge.taskId}</span> {/* 展示关联任务 ID。 */}
          </div> /* 结束单条调用边。 */
        ))} {/* 结束调用图边遍历。 */}
      </div> {/* 结束调用边列表。 */}
    </div> /* 结束调用图容器。 */
  ); /* 结束返回。 */
} /* 结束 AgentCallGraph 组件。 */

function AgentTimeline({ events }: { events: AgentTimelineEvent[] }) { /* 定义智能体计划时间线展示组件。 */
  return ( /* 返回时间线视图。 */
    <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义时间线容器。 */}
      <p className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Agent Plan Timeline</p> {/* 展示时间线标题。 */}
      <ol className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1"> {/* 定义时间线事件列表。 */}
        {events.map((event) => ( /* 遍历时间线事件。 */
          <li key={event.id} className="rounded-md border border-fuchsia-100 bg-fuchsia-50/70 px-2 py-1 text-[10px] dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义单个时间线事件。 */}
            <p className="font-mono font-semibold text-fuchsia-900 dark:text-fuchsia-100">{event.label}</p> {/* 展示事件标签。 */}
            <p className="mt-0.5 font-mono text-[9px] text-zinc-500 dark:text-zinc-400">{event.taskId} · {event.timestamp}</p> {/* 展示任务与时间戳。 */}
          </li> /* 结束单个时间线事件。 */
        ))} {/* 结束时间线事件遍历。 */}
      </ol> {/* 结束时间线事件列表。 */}
    </div> /* 结束时间线容器。 */
  ); /* 结束返回。 */
} /* 结束 AgentTimeline 组件。 */

export function AgentExplorer() { /* 导出第40天 Supervisor 协作看板组件。 */
  const [payload, setPayload] = useState<AgentExplorerPayload | null>(null); /* 保存接口返回的智能体快照。 */
  const [search, setSearch] = useState("supervise"); /* 保存能力搜索输入值。 */
  const [error, setError] = useState(""); /* 保存加载错误文本。 */

  useEffect(() => { /* 在组件挂载后加载智能体注册表与协作快照。 */
    let cancelled = false; /* 定义取消标记，避免卸载后更新状态。 */
    (async () => { /* 定义并立即执行异步加载函数。 */
      try { /* 捕获接口加载异常。 */
        const res = await fetch("/api/agents"); /* 请求第40天智能体接口。 */
        const data = await readApiData<AgentExplorerPayload>(res); /* 使用统一 Envelope 解析响应。 */
        if (!cancelled) setPayload(data); /* 未取消时写入智能体快照。 */
      } catch (err) { /* 处理接口异常。 */
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : "加载 Day 41 Agent DAG Runtime 失败"); /* 写入用户可读错误。 */
      } /* 结束 catch。 */
    })(); /* 立即执行异步函数。 */
    return () => { /* 返回清理函数。 */
      cancelled = true; /* 卸载时标记取消。 */
    }; /* 结束清理函数。 */
  }, []); /* 仅在挂载时执行一次。 */

  const matchedAgents = useMemo(() => { /* 根据输入能力派生匹配智能体列表。 */
    const normalized = search.trim().toLowerCase(); /* 标准化能力搜索词。 */
    if (!payload || !normalized) return []; /* 无数据或空查询时返回空列表。 */
    return payload.agents.filter((agent) => agent.capabilities.some((capability) => capability.toLowerCase() === normalized)); /* 返回能力完全匹配的智能体。 */
  }, [payload, search]); /* 依赖 payload 和 search。 */

  return ( /* 返回 Supervisor Runtime Dashboard 视图。 */
    <div className="shrink-0 border-b border-fuchsia-200/70 px-4 py-3 dark:border-fuchsia-900/40"> {/* 定义第40天模块容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 定义标题与徽标的横向布局。 */}
        <div> {/* 定义标题文本容器。 */}
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Agent DAG Runtime Dashboard</h2> {/* 展示第41天模块标题。 */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第41天：Supervisor Agent 生成 DAG 依赖图，并让可并行节点同时执行后再汇总。</p> {/* 展示第41天模块说明。 */}
        </div> {/* 结束标题文本容器。 */}
        <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-800 ring-1 ring-fuchsia-500/25 dark:text-fuchsia-200">Day 41</span> {/* 展示第41天标记。 */}
      </div> {/* 结束标题与徽标布局。 */}

      {error ? ( /* 判断是否存在加载错误。 */
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> /* 展示加载错误。 */
      ) : null} {/* 无错误时不渲染错误条。 */}

      {payload ? ( /* 判断是否已经加载到智能体数据。 */
        <> {/* 使用片段包裹已加载内容。 */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center"> {/* 定义运行时指标网格。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义执行任务指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Executed</p> {/* 展示指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.executedTasks}</p> {/* 展示执行任务数量。 */}
            </div> {/* 结束执行任务指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义委派任务指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Delegated</p> {/* 展示指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.delegatedTasks}</p> {/* 展示委派任务数量。 */}
            </div> {/* 结束委派任务指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义成功率指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Success</p> {/* 展示指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{formatRate(payload.metrics.successRate)}</p> {/* 展示成功率。 */}
            </div> {/* 结束成功率指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义平均耗时指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Avg ms</p> {/* 展示指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.avgTaskDuration}</p> {/* 展示平均任务耗时。 */}
            </div> {/* 结束平均耗时指标卡。 */}
          </div> {/* 结束运行时指标网格。 */}

          <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义能力搜索区域。 */}
            <label className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Capability Search</label> {/* 展示能力搜索标签。 */}
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-fuchsia-200/80 bg-white/80 px-2 py-1.5 text-xs dark:border-fuchsia-800/50 dark:bg-zinc-950/40" placeholder="supervise / research / plan / review / write" /> {/* 输入要搜索的能力。 */}
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">匹配：{matchedAgents.length ? matchedAgents.map((agent) => agent.name).join(", ") : "暂无匹配"}</p> {/* 展示能力搜索结果。 */}
            <p className="mt-1 font-mono text-[10px] text-fuchsia-800 dark:text-fuchsia-200">route supervise: {payload.routes.supervise ?? "-"} · route research: {payload.routes.research ?? "-"}</p> {/* 展示内置路由测试结果。 */}
          </div> {/* 结束能力搜索区域。 */}

          <SupervisorDecision plan={payload.collaboration.plan} /> {/* 展示 Supervisor 决策。 */}
          <AgentPlanSteps plan={payload.collaboration.plan} /> {/* 展示 AgentPlan 执行步骤。 */}
          <AgentDAGVisualizer plan={payload.collaboration.plan} /> {/* 展示第41天 Agent DAG 可视化。 */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center"> {/* 定义第41天 DAG 指标网格。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义总步骤指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">DAG Steps</p> {/* 展示总步骤指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.collaboration.dagMetrics.totalSteps}</p> {/* 展示 DAG 总步骤数量。 */}
            </div> {/* 结束总步骤指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义并行步骤指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Parallel</p> {/* 展示并行步骤指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.collaboration.dagMetrics.parallelSteps}</p> {/* 展示可并行步骤数量。 */}
            </div> {/* 结束并行步骤指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义最大深度指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Max Depth</p> {/* 展示最大深度指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.collaboration.dagMetrics.maxDepth}</p> {/* 展示 DAG 最大深度。 */}
            </div> {/* 结束最大深度指标卡。 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义关键路径指标卡。 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Critical</p> {/* 展示关键路径指标名称。 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.collaboration.dagMetrics.criticalPathLength}</p> {/* 展示关键路径长度。 */}
            </div> {/* 结束关键路径指标卡。 */}
          </div> {/* 结束第41天 DAG 指标网格。 */}
          <AgentCallGraph edges={payload.collaboration.callGraph} /> {/* 展示第41天智能体调用图。 */}
          <AgentTimeline events={payload.collaboration.timeline} /> {/* 展示第41天智能体计划时间线。 */}

          <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1"> {/* 定义智能体列表。 */}
            {payload.agents.map((agent) => ( /* 遍历所有注册智能体。 */
              <li key={agent.id} className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-2.5 py-2 text-xs dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义单个智能体卡片。 */}
                <p className="font-semibold text-fuchsia-950 dark:text-fuchsia-100">{agent.name}</p> {/* 展示智能体名称。 */}
                <p className="mt-0.5 leading-snug text-fuchsia-800/90 dark:text-fuchsia-200/90">{agent.description}</p> {/* 展示智能体职责。 */}
                <p className="mt-1 break-words font-mono text-[10px] text-fuchsia-700 dark:text-fuchsia-300">capabilities: {agent.capabilities.join(", ")}</p> {/* 展示能力列表。 */}
                <p className="mt-0.5 break-words font-mono text-[10px] text-fuchsia-700 dark:text-fuchsia-300">tools: {agent.tools.join(", ") || "none"}</p> {/* 展示工具列表。 */}
              </li> /* 结束单个智能体卡片。 */
            ))} {/* 结束智能体遍历。 */}
          </ul> {/* 结束智能体列表。 */}

          <p className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 text-[10px] leading-relaxed text-zinc-600 dark:border-fuchsia-900/40 dark:bg-zinc-950/25 dark:text-zinc-300">{payload.collaboration.result.childResults?.at(-1)?.output ?? payload.demoResult.output}</p> {/* 展示最终 Writer Agent 输出或示例输出。 */}
        </> /* 结束已加载内容片段。 */
      ) : ( /* 未加载完成时展示占位。 */
        <p className="mt-3 rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">Day 41 Agent DAG Runtime 加载中...</p> /* 展示加载占位。 */
      )} {/* 结束加载状态判断。 */}
    </div> /* 结束 Agent Explorer 容器。 */
  ); /* 结束返回。 */
} /* 结束 AgentExplorer 组件。 */
