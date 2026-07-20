"use client"; // 第66天：声明注册浏览器需要状态、生命周期和用户交互能力。

import { useCallback, useEffect, useState } from "react"; // 第66天：引入加载快照、过滤和搜索所需的 React Hooks。
import { REGISTRY_ITEM_TYPES, type RegistryItemType, type RegistrySnapshot } from "@/lib/registry/registry-types"; // 第66天：引入注册类型常量、类型和接口快照结构。

type RegistryFilter = RegistryItemType | "all"; // 第66天：定义 Registry Explorer 支持的全部过滤值。

const TYPE_LABELS: Record<RegistryFilter, string> = { all: "全部", agent: "Agent", tool: "Tool", model: "Model", prompt: "Prompt", memory: "Memory", knowledge: "Knowledge", workflow: "Workflow", evaluation: "Evaluation" }; // 第69天：扩展注册类型过滤按钮以展示生产知识能力。

function statusClass(enabled: boolean): string { // 第66天：定义注册项启用状态对应的样式选择函数。
  return enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"; // 第66天：启用使用绿色，禁用使用中性灰色。
} // 第66天：结束注册项状态样式函数。

export function RegistryExplorer() { // 第66天：定义展示统一能力库存、发现结果和指标的注册浏览器组件。
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null); // 第66天：保存最近一次统一注册中心接口快照。
  const [activeType, setActiveType] = useState<RegistryFilter>("all"); // 第66天：保存当前注册类型过滤条件。
  const [query, setQuery] = useState("research"); // 第66天：保存能力发现查询词并默认演示研究能力。
  const [includeDisabled, setIncludeDisabled] = useState(true); // 第66天：保存是否展示归档提示词等禁用注册项。
  const [loading, setLoading] = useState(true); // 第66天：保存注册中心接口加载状态。
  const [error, setError] = useState(""); // 第66天：保存用户可读的注册中心加载错误。

  const refresh = useCallback(async (type: RegistryFilter, discoveryQuery: string, showDisabled: boolean) => { // 第66天：定义按过滤条件加载统一注册快照的稳定异步动作。
    setLoading(true); // 第66天：请求开始前切换注册浏览器为加载状态。
    setError(""); // 第66天：清空上一轮接口错误提示。
    try { // 第66天：捕获网络请求和 JSON 解析过程中可能出现的异常。
      const params = new URLSearchParams({ query: discoveryQuery.trim(), includeDisabled: String(showDisabled) }); // 第66天：构建能力查询词和禁用项开关参数。
      if (type !== "all") params.set("type", type); // 第66天：选择具体类型时追加服务端类型过滤参数。
      const response = await fetch(`/api/registry?${params.toString()}`, { cache: "no-store" }); // 第66天：请求不使用浏览器缓存的最新统一注册中心快照。
      if (!response.ok) throw new Error(`注册中心接口返回 ${response.status}`); // 第66天：把非成功 HTTP 状态转换为用户可读异常。
      setSnapshot(await response.json() as RegistrySnapshot); // 第66天：解析并保存注册项、发现结果和指标快照。
    } catch (caught) { // 第66天：捕获未知注册中心加载异常。
      setError(caught instanceof Error ? caught.message : "加载统一注册中心失败"); // 第66天：保存安全错误摘要而不暴露内部堆栈。
    } finally { // 第66天：无论请求成功失败都恢复按钮可用状态。
      setLoading(false); // 第66天：结束注册浏览器加载状态。
    } // 第66天：结束注册中心接口异常处理。
  }, []); // 第66天：注册中心刷新动作不依赖组件内可变闭包值。

  useEffect(() => { const timer = window.setTimeout(() => void refresh("all", "research", true), 0); return () => window.clearTimeout(timer); }, [refresh]); // 第66天：组件挂载后异步加载默认研究能力快照并在卸载时清理定时器。

  const changeType = (type: RegistryFilter) => { setActiveType(type); void refresh(type, query, includeDisabled); }; // 第66天：切换类型时立即加载对应能力库存和发现结果。
  const changeDisabledVisibility = () => { const next = !includeDisabled; setIncludeDisabled(next); void refresh(activeType, query, next); }; // 第66天：切换禁用项可见性并同步刷新服务端过滤结果。

  return ( // 第66天：返回 Registry Explorer 的指标、搜索、过滤和注册项列表视图。
    <section className="space-y-3 p-3 text-xs"> {/* 第66天：定义统一注册浏览器主体容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第66天：排列注册浏览器标题说明和刷新按钮。 */}
        <div> {/* 第66天：定义注册浏览器标题说明区域。 */}
          <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Registry Explorer（注册浏览器）</h3> {/* 第66天：展示统一注册浏览器中英文标题。 */}
          <p className="mt-1 leading-relaxed text-zinc-500 dark:text-zinc-400">统一查看 Agent、Tool、Model、Prompt 与平台能力，并通过元数据执行 Capability Discovery（能力发现）。</p> {/* 第66天：说明统一能力库存和发现目标。 */}
        </div> {/* 第66天：结束注册浏览器标题说明区域。 */}
        <button type="button" onClick={() => void refresh(activeType, query, includeDisabled)} disabled={loading} className="shrink-0 rounded-md bg-violet-600 px-3 py-2 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "加载中" : "刷新"}</button> {/* 第66天：提供按当前条件重新读取注册中心快照的按钮。 */}
      </div> {/* 第66天：结束注册浏览器标题与刷新按钮布局。 */}

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null} {/* 第66天：按需展示统一注册中心接口加载错误。 */}

      {snapshot ? ( // 第66天：快照可用时展示指标、能力发现和注册项明细。
        <> {/* 第66天：使用片段组合注册中心的多个可视化区域。 */}
          <div className="grid grid-cols-2 gap-2"> {/* 第66天：定义任务清单要求的 Registry Metrics 指标网格。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">注册项总数</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.totalItems}</p></div> {/* 第66天：展示全部统一注册项数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">当前启用</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.enabledCount}</p></div> {/* 第66天：展示当前允许能力发现的启用项数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">不同版本</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.versionCount}</p></div> {/* 第66天：展示统一能力库存的版本复杂度。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">Agent / Tool</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.agentCount} / {snapshot.metrics.toolCount}</p></div> {/* 第66天：展示智能体和工具注册数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">Model / Prompt</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.modelCount} / {snapshot.metrics.promptCount}</p></div> {/* 第66天：展示模型和提示词版本注册数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">禁用能力</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.metrics.disabledCount}</p></div> {/* 第66天：展示归档或草稿等禁用注册项数量。 */}
          </div> {/* 第66天：结束统一注册指标网格。 */}

          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/20"> {/* 第66天：定义 Capability Discovery 查询控制区。 */}
            <label className="font-semibold text-violet-900 dark:text-violet-100" htmlFor="registry-capability-query">Capability Discovery（能力发现）</label> {/* 第66天：展示能力发现输入框标签。 */}
            <div className="mt-2 flex gap-2"> {/* 第66天：排列能力查询输入框和执行按钮。 */}
              <input id="registry-capability-query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void refresh(activeType, query, includeDisabled); }} placeholder="例如：research、summary、evaluation" className="min-w-0 flex-1 rounded-md border border-violet-200 bg-white px-3 py-2 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-violet-800 dark:bg-zinc-950" /> {/* 第66天：接收名称、标签、描述或元数据能力查询词。 */}
              <button type="button" onClick={() => void refresh(activeType, query, includeDisabled)} disabled={loading} className="rounded-md bg-violet-600 px-3 py-2 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60">发现</button> {/* 第66天：触发服务端统一能力发现评分。 */}
            </div> {/* 第66天：结束能力查询输入和按钮布局。 */}
            <div className="mt-2 space-y-1"> {/* 第66天：定义能力发现结果摘要列表。 */}
              {snapshot.discoveries.slice(0, 6).map((result) => <p key={result.item.id} className="rounded-md bg-white/80 px-2 py-1.5 text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-200"><strong>{result.item.name}</strong><span className="ml-2 font-mono text-violet-700 dark:text-violet-300">{result.score} 分</span><span className="ml-2 text-zinc-500">{result.reasons.join("；")}</span></p>)} {/* 第66天：展示前六个已启用命中能力及可解释评分原因。 */}
              {snapshot.filters.query && snapshot.discoveries.length === 0 ? <p className="rounded-md border border-dashed border-violet-300 p-2 text-violet-700 dark:border-violet-800 dark:text-violet-200">没有发现匹配的已启用能力。</p> : null} {/* 第66天：查询没有命中时展示明确空状态。 */}
            </div> {/* 第66天：结束能力发现结果摘要列表。 */}
          </div> {/* 第66天：结束能力发现查询控制区。 */}

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="注册项类型过滤"> {/* 第66天：定义全部七类能力过滤按钮组。 */}
            {(["all", ...REGISTRY_ITEM_TYPES] as RegistryFilter[]).map((type) => <button key={type} type="button" onClick={() => changeType(type)} className={`rounded-md px-2.5 py-1.5 font-semibold transition ${activeType === type ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}>{TYPE_LABELS[type]}</button>)} {/* 第66天：渲染 Agent、Tool、Model、Prompt 和平台能力过滤按钮。 */}
          </div> {/* 第66天：结束注册项类型过滤按钮组。 */}
          <label className="flex cursor-pointer items-center gap-2 text-zinc-600 dark:text-zinc-300"><input type="checkbox" checked={includeDisabled} onChange={changeDisabledVisibility} className="accent-violet-600" />显示禁用版本</label> {/* 第66天：允许观察归档提示词版本或只查看当前可用能力。 */}

          <div className="space-y-2"> {/* 第66天：定义当前过滤条件下的注册项卡片列表。 */}
            {snapshot.items.map((item) => ( // 第66天：遍历展示统一协议下的全部注册项字段。
              <article key={item.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"> {/* 第66天：定义单个注册项详情卡片。 */}
                <div className="flex flex-wrap items-start justify-between gap-2"> {/* 第66天：排列注册项名称、类型、版本和状态。 */}
                  <div><strong className="text-zinc-950 dark:text-zinc-50">{item.name}</strong><p className="mt-1 break-all font-mono text-[10px] text-zinc-400">{item.id}</p></div> {/* 第66天：展示注册项可读名称和跨类型唯一标识。 */}
                  <div className="flex items-center gap-1.5"><span className="rounded-full bg-violet-100 px-2 py-0.5 font-mono text-[10px] text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">{item.type}</span><span className="rounded-full bg-sky-100 px-2 py-0.5 font-mono text-[10px] text-sky-700 dark:bg-sky-950/50 dark:text-sky-200">{item.version}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(item.enabled)}`}>{item.enabled ? "enabled" : "disabled"}</span></div> {/* 第66天：展示类型、版本和启用状态徽标。 */}
                </div> {/* 第66天：结束注册项标题和状态布局。 */}
                <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-2 font-mono text-[10px] leading-relaxed text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-300">{JSON.stringify(item.metadata, null, 2)}</pre> {/* 第66天：展示描述、标签、能力声明和运行特征等元数据。 */}
              </article> // 第66天：结束单个统一注册项详情卡片。
            ))} {/* 第66天：结束当前过滤注册项遍历。 */}
          </div> {/* 第66天：结束统一注册项卡片列表。 */}
          {snapshot.items.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-zinc-500 dark:border-zinc-700">当前过滤条件暂无注册项。</p> : null} {/* 第66天：过滤结果为空时展示友好提示。 */}
        </> // 第66天：结束已有注册中心快照内容片段。
      ) : <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-zinc-500 dark:border-zinc-700">正在创建 Day67 Production Prompt Platform 能力目录...</p>} {/* 第67天：首次加载时展示包含生产提示词版本的统一注册中心占位提示。 */}
    </section> // 第66天：结束统一注册浏览器主体容器。
  ); // 第66天：结束 Registry Explorer 视图返回。
} // 第66天：结束 RegistryExplorer 组件。
