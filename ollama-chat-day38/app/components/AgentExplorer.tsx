"use client"; /* 当前组件需要在浏览器端拉取 Agent Registry 快照 */

import { useEffect, useMemo, useState } from "react"; /* 引入 React Hooks 用于状态、派生值和副作用 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 引入统一 API 解析工具 */
import type { Agent, AgentMetrics, AgentResult } from "@/lib/agents/agent-types"; /* 引入智能体、指标和执行结果类型 */

type AgentExplorerPayload = { /* 定义 /api/agents 返回的数据结构 */
  agents: Agent[]; /* 保存智能体列表 */
  metrics: AgentMetrics; /* 保存智能体指标 */
  routes: Record<string, string | null>; /* 保存能力路由测试结果 */
  demoResult: AgentResult; /* 保存单智能体执行示例结果 */
}; /* 结束 AgentExplorerPayload 类型定义 */

export function AgentExplorer() { /* 导出第38天智能体浏览器组件 */
  const [payload, setPayload] = useState<AgentExplorerPayload | null>(null); /* 保存接口返回的智能体快照 */
  const [search, setSearch] = useState("research"); /* 保存能力搜索输入值 */
  const [error, setError] = useState(""); /* 保存加载错误文本 */

  useEffect(() => { /* 在组件挂载后加载智能体注册表 */
    let cancelled = false; /* 定义取消标记，避免卸载后更新状态 */
    (async () => { /* 定义并立即执行异步加载函数 */
      try { /* 捕获接口加载异常 */
        const res = await fetch("/api/agents"); /* 请求第38天智能体接口 */
        const data = await readApiData<AgentExplorerPayload>(res); /* 使用统一 Envelope 解析响应 */
        if (!cancelled) setPayload(data); /* 未取消时写入智能体快照 */
      } catch (err) { /* 处理接口异常 */
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : "加载 Agent Registry 失败"); /* 写入用户可读错误 */
      } /* 结束 catch */
    })(); /* 立即执行异步函数 */
    return () => { /* 返回清理函数 */
      cancelled = true; /* 卸载时标记取消 */
    }; /* 结束清理函数 */
  }, []); /* 仅在挂载时执行一次 */

  const matchedAgents = useMemo(() => { /* 根据输入能力派生匹配智能体列表 */
    const normalized = search.trim().toLowerCase(); /* 标准化能力搜索词 */
    if (!payload || !normalized) return []; /* 无数据或空查询时返回空列表 */
    return payload.agents.filter((agent) => agent.capabilities.some((capability) => capability.toLowerCase() === normalized)); /* 返回能力完全匹配的智能体 */
  }, [payload, search]); /* 依赖 payload 和 search */

  return ( /* 返回 Agent Explorer 视图 */
    <div className="shrink-0 border-b border-fuchsia-200/70 px-4 py-3 dark:border-fuchsia-900/40"> {/* 定义第38天模块容器 */}
      <div className="flex items-start justify-between gap-3"> {/* 定义标题与指标的横向布局 */}
        <div> {/* 定义标题文本容器 */}
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Agent Explorer</h2> {/* 展示模块标题 */}
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">第38天：Multi-Agent Runtime V1，先完成 Agent Registry、能力搜索、指标和单 Agent 执行。</p> {/* 展示模块说明 */}
        </div> {/* 结束标题文本容器 */}
        <span className="shrink-0 rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-800 ring-1 ring-fuchsia-500/25 dark:text-fuchsia-200">Day 38</span> {/* 展示第38天标记 */}
      </div> {/* 结束标题与指标布局 */}

      {error ? ( /* 判断是否存在加载错误 */
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> /* 展示加载错误 */
      ) : null} {/* 无错误时不渲染错误条 */}

      {payload ? ( /* 判断是否已加载到智能体数据 */
        <> {/* 使用片段包裹已加载内容 */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center"> {/* 定义三项指标网格 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义智能体总数指标卡 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Agents</p> {/* 展示指标名称 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.totalAgents}</p> {/* 展示智能体总数 */}
            </div> {/* 结束智能体总数指标卡 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义能力数量指标卡 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Caps</p> {/* 展示指标名称 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.capabilityCount}</p> {/* 展示能力数量 */}
            </div> {/* 结束能力数量指标卡 */}
            <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义工具覆盖指标卡 */}
              <p className="text-[10px] text-fuchsia-700 dark:text-fuchsia-300">Tools</p> {/* 展示指标名称 */}
              <p className="font-mono text-sm font-semibold text-fuchsia-950 dark:text-fuchsia-100">{payload.metrics.toolCoverage}</p> {/* 展示工具覆盖数量 */}
            </div> {/* 结束工具覆盖指标卡 */}
          </div> {/* 结束三项指标网格 */}

          <div className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 dark:border-fuchsia-900/40 dark:bg-zinc-950/25"> {/* 定义能力搜索区域 */}
            <label className="text-[11px] font-semibold text-fuchsia-950 dark:text-fuchsia-100">Capability Search</label> {/* 展示能力搜索标签 */}
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 w-full rounded-lg border border-fuchsia-200/80 bg-white/80 px-2 py-1.5 text-xs dark:border-fuchsia-800/50 dark:bg-zinc-950/40" placeholder="research / plan / review / write" /> {/* 输入要搜索的能力 */}
            <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">匹配：{matchedAgents.length ? matchedAgents.map((agent) => agent.name).join(", ") : "暂无匹配"}</p> {/* 展示能力搜索结果 */}
            <p className="mt-1 font-mono text-[10px] text-fuchsia-800 dark:text-fuchsia-200">route research: {payload.routes.research ?? "-"} · route plan: {payload.routes.plan ?? "-"}</p> {/* 展示内置路由测试结果 */}
          </div> {/* 结束能力搜索区域 */}

          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1"> {/* 定义智能体列表 */}
            {payload.agents.map((agent) => ( /* 遍历所有注册智能体 */
              <li key={agent.id} className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-2.5 py-2 text-xs dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20"> {/* 定义单个智能体卡片 */}
                <p className="font-semibold text-fuchsia-950 dark:text-fuchsia-100">{agent.name}</p> {/* 展示智能体名称 */}
                <p className="mt-0.5 leading-snug text-fuchsia-800/90 dark:text-fuchsia-200/90">{agent.description}</p> {/* 展示智能体职责 */}
                <p className="mt-1 break-words font-mono text-[10px] text-fuchsia-700 dark:text-fuchsia-300">capabilities: {agent.capabilities.join(", ")}</p> {/* 展示能力列表 */}
                <p className="mt-0.5 break-words font-mono text-[10px] text-fuchsia-700 dark:text-fuchsia-300">tools: {agent.tools.join(", ")}</p> {/* 展示工具列表 */}
                <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">Prompt: {agent.systemPrompt}</p> {/* 展示系统提示词 */}
              </li> /* 结束单个智能体卡片 */
            ))} {/* 结束智能体遍历 */}
          </ul> {/* 结束智能体列表 */}

          <p className="mt-3 rounded-lg border border-fuchsia-200/70 bg-white/70 px-2 py-2 text-[10px] leading-relaxed text-zinc-600 dark:border-fuchsia-900/40 dark:bg-zinc-950/25 dark:text-zinc-300">{payload.demoResult.output}</p> {/* 展示单 Agent 执行示例 */}
        </> /* 结束已加载内容片段 */
      ) : ( /* 未加载完成时展示占位 */
        <p className="mt-3 rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">Agent Registry 加载中…</p> /* 展示加载占位 */
      )} {/* 结束加载状态判断 */}
    </div> /* 结束 Agent Explorer 容器 */
  ); /* 结束返回 */
} /* 结束 AgentExplorer 组件 */
