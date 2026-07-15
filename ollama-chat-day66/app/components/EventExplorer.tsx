"use client"; // 第65天：声明事件浏览器为需要状态、请求和点击交互的客户端组件。

import { useCallback, useEffect, useMemo, useState } from "react"; // 第65天：引入事件浏览器所需的 React Hooks。
import type { RuntimeEventRecord, UnifiedEventSnapshot } from "@/lib/events/event-types"; // 第65天：引入事件历史记录和统一事件快照类型。

type EventFilter = "all" | "agent" | "tool" | "model" | "error"; // 第65天：定义 Event Explorer 支持的事件过滤类别。

const FILTERS: Array<{ value: EventFilter; label: string }> = [ // 第65天：定义全部、智能体、工具、模型和错误过滤按钮。
  { value: "all", label: "全部" }, // 第65天：展示全部事件。
  { value: "agent", label: "Agent" }, // 第65天：仅展示智能体事件。
  { value: "tool", label: "Tool" }, // 第65天：仅展示工具事件。
  { value: "model", label: "Model" }, // 第65天：仅展示模型事件。
  { value: "error", label: "Error" }, // 第65天：仅展示错误事件。
]; // 第65天：结束事件过滤按钮定义。

function matchesFilter(event: RuntimeEventRecord, filter: EventFilter): boolean { // 第65天：判断一条事件是否符合当前过滤类别。
  if (filter === "all") return true; // 第65天：全部类别直接保留所有事件。
  if (filter === "error") return event.type === "error.occurred"; // 第65天：错误类别精确匹配统一错误事件。
  return event.type.startsWith(`${filter}.`); // 第65天：其余类别按事件类型前缀匹配。
} // 第65天：结束事件过滤判断函数。

function summarizePayload(payload: unknown): string { // 第65天：把未知事件载荷转换为适合时间线展示的短摘要。
  const serialized = JSON.stringify(payload); // 第65天：把事件载荷序列化为紧凑 JSON 文本。
  if (!serialized) return "无载荷"; // 第65天：无法序列化或空载荷时返回友好提示。
  return serialized.length > 150 ? `${serialized.slice(0, 147)}...` : serialized; // 第65天：超过展示长度时安全截断并添加省略号。
} // 第65天：结束事件载荷摘要函数。

function eventTone(type: RuntimeEventRecord["type"]): string { // 第65天：根据事件类别返回时间线圆点颜色。
  if (type.startsWith("agent.")) return "bg-violet-500"; // 第65天：智能体事件使用紫色。
  if (type.startsWith("tool.")) return "bg-emerald-500"; // 第65天：工具事件使用绿色。
  if (type.startsWith("model.")) return "bg-sky-500"; // 第65天：模型事件使用蓝色。
  if (type === "error.occurred") return "bg-rose-500"; // 第65天：错误事件使用红色。
  return "bg-amber-500"; // 第65天：其他运行时事件使用琥珀色。
} // 第65天：结束事件类别颜色函数。

export function EventExplorer() { // 第65天：定义统一事件系统可观测性入口 Event Explorer。
  const [snapshot, setSnapshot] = useState<UnifiedEventSnapshot | null>(null); // 第65天：保存最近一次事件驱动任务快照。
  const [activeFilter, setActiveFilter] = useState<EventFilter>("all"); // 第65天：保存当前事件过滤类别。
  const [loading, setLoading] = useState(true); // 第65天：保存事件 API 加载状态。
  const [error, setError] = useState(""); // 第65天：保存用户可读的加载错误提示。

  const refresh = useCallback(async () => { // 第65天：定义重新执行统一事件链路的异步动作。
    setLoading(true); // 第65天：请求开始前切换为加载状态。
    setError(""); // 第65天：清空上一轮加载错误。
    try { // 第65天：捕获网络请求和 JSON 解析异常。
      const response = await fetch("/api/runtime/events", { cache: "no-store" }); // 第65天：请求一份不使用浏览器缓存的新事件快照。
      if (!response.ok) throw new Error(`事件接口返回 ${response.status}`); // 第65天：把非成功 HTTP 状态转换为可读错误。
      setSnapshot(await response.json() as UnifiedEventSnapshot); // 第65天：解析并保存统一事件快照。
    } catch (caught) { // 第65天：捕获未知加载异常。
      setError(caught instanceof Error ? caught.message : "加载统一事件系统失败"); // 第65天：保存用户可读错误而不暴露内部堆栈。
    } finally { // 第65天：无论成功失败都恢复按钮状态。
      setLoading(false); // 第65天：结束加载状态。
    } // 第65天：结束事件快照请求异常处理。
  }, []); // 第65天：事件刷新动作不依赖组件内可变值。

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]); // 第65天：挂载后异步执行事件链路并在卸载时清理定时器，避免同步 Effect 状态更新。

  const visibleEvents = useMemo(() => snapshot?.events.filter((event) => matchesFilter(event, activeFilter)) ?? [], [activeFilter, snapshot]); // 第65天：根据当前类别计算需要展示的事件列表。

  return ( // 第65天：返回 Event Explorer 完整视图。
    <section className="space-y-3 p-3 text-xs"> {/* 第65天：定义统一事件浏览器主体容器。 */}
      <div className="flex items-start justify-between gap-3"> {/* 第65天：排列事件浏览器说明与重跑按钮。 */}
        <div> {/* 第65天：定义标题说明区域。 */}
          <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Event Explorer（事件浏览器）</h3> {/* 第65天：展示事件浏览器中英文标题。 */}
          <p className="mt-1 leading-relaxed text-zinc-500 dark:text-zinc-400">观察 Agent、Tool、Model、Trace、Usage 与 Evaluation 如何通过 EventBus 解耦协作。</p> {/* 第65天：说明统一事件系统的可观测目标。 */}
        </div> {/* 第65天：结束标题说明区域。 */}
        <button type="button" onClick={() => void refresh()} disabled={loading} className="shrink-0 rounded-md bg-violet-600 px-3 py-2 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "执行中" : "重新测试"}</button> {/* 第65天：提供重新生成事件链路的操作按钮。 */}
      </div> {/* 第65天：结束标题与按钮布局。 */}

      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null} {/* 第65天：按需展示事件接口加载错误。 */}

      {snapshot ? ( // 第65天：有快照时展示一致性、指标、过滤器和事件时间线。
        <> {/* 第65天：使用片段组合事件快照多个区域。 */}
          <div className={`rounded-lg border p-3 ${snapshot.consistent ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100"}`}> {/* 第65天：根据事件上下文一致性展示成功或失败状态卡片。 */}
            <p className="font-bold">事件上下文一致性：{snapshot.consistent ? "通过" : "失败"}</p> {/* 第65天：展示全部事件是否共享同一上下文与追踪标识。 */}
            <p className="mt-1 break-all">Trace ID：{snapshot.context.traceId}</p> {/* 第65天：展示完整事件链路追踪标识。 */}
            <p className="mt-1 break-all">Runtime Context ID：{snapshot.context.requestId}</p> {/* 第65天：展示事件关联的统一上下文标识。 */}
          </div> {/* 第65天：结束事件上下文一致性卡片。 */}

          <div className="grid grid-cols-2 gap-2"> {/* 第65天：定义统一事件系统核心指标网格。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">事件数量</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.events.length}</p></div> {/* 第65天：展示内存事件总线保存的事件数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">Trace 条目</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.traceTimeline.length}</p></div> {/* 第65天：展示 Trace Subscriber 自动生成的时间线数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">Token 用量</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.usage.totalTokens}</p></div> {/* 第65天：展示 Usage Subscriber 自动聚合的总令牌数量。 */}
            <div className="rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900"><p className="text-zinc-500">自动评估</p><p className="mt-1 font-mono text-lg font-bold">{snapshot.evaluations.length}</p></div> {/* 第65天：展示 Evaluation Subscriber 自动创建的任务数量。 */}
          </div> {/* 第65天：结束统一事件系统核心指标网格。 */}

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="事件类型过滤"> {/* 第65天：定义 Event Explorer 类别过滤按钮组。 */}
            {FILTERS.map((filter) => <button key={filter.value} type="button" onClick={() => setActiveFilter(filter.value)} className={`rounded-md px-2.5 py-1.5 font-semibold transition ${activeFilter === filter.value ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"}`}>{filter.label}</button>)} {/* 第65天：渲染全部、Agent、Tool、Model 和 Error 过滤按钮。 */}
          </div> {/* 第65天：结束事件类别过滤按钮组。 */}

          <ol className="space-y-2"> {/* 第65天：定义按发布时间排列的事件时间线列表。 */}
            {visibleEvents.map((event, index) => ( // 第65天：遍历当前过滤类别下的全部事件。
              <li key={event.id} className="relative rounded-lg border border-zinc-200 bg-white p-3 pl-8 dark:border-zinc-700 dark:bg-zinc-900"> {/* 第65天：定义单条事件时间线卡片。 */}
                <span className={`absolute left-3 top-4 size-2.5 rounded-full ${eventTone(event.type)}`} aria-hidden="true" /> {/* 第65天：展示按事件类别着色的时间线圆点。 */}
                <div className="flex flex-wrap items-center justify-between gap-2"> {/* 第65天：排列事件顺序、类型与投递状态。 */}
                  <strong className="font-mono text-[11px] text-zinc-950 dark:text-zinc-50">{String(index + 1).padStart(2, "0")} · {event.type}</strong> {/* 第65天：展示事件在当前过滤结果中的顺序和类型。 */}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${event.deliveryStatus === "processed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200" : event.deliveryStatus === "failed" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200" : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"}`}>{event.deliveryStatus}</span> {/* 第65天：展示事件发布、处理完成或失败状态。 */}
                </div> {/* 第65天：结束事件标题与状态布局。 */}
                <p className="mt-1 text-[11px] text-zinc-500">Source：{String(event.metadata?.source ?? "unknown")} · {new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour12: false })} · Handler：{event.handlerCount}</p> {/* 第65天：展示事件来源、时间戳和订阅者数量。 */}
                <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">Trace：{event.traceId}</p> {/* 第65天：展示事件关联的链路追踪标识。 */}
                <p className="mt-1 break-all font-mono text-[10px] text-zinc-400">Context：{event.runtimeContextId}</p> {/* 第65天：展示事件关联的统一运行时上下文标识。 */}
                <p className="mt-2 break-words rounded-md bg-zinc-50 p-2 font-mono text-[10px] leading-relaxed text-zinc-600 dark:bg-zinc-950/60 dark:text-zinc-300">{summarizePayload(event.payload)}</p> {/* 第65天：展示经过序列化和长度限制的事件载荷摘要。 */}
              </li> /* 第65天：结束单条事件时间线卡片。 */
            ))} {/* 第65天：结束当前过滤事件遍历。 */}
          </ol> {/* 第65天：结束事件时间线列表。 */}

          {visibleEvents.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-zinc-500 dark:border-zinc-700">当前过滤类别暂无事件。</p> : null} {/* 第65天：过滤结果为空时展示友好提示。 */}
        </> /* 第65天：结束已有事件快照内容片段。 */
      ) : <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-zinc-500 dark:border-zinc-700">正在创建 Day66 继承的 Unified Event System 事件时间线...</p>} {/* 第66天：首次加载时说明事件系统是统一注册中心继承的基础能力。 */}
    </section> /* 第65天：结束统一事件浏览器主体容器。 */
  ); // 第65天：结束 Event Explorer 视图返回。
} // 第65天：结束 Event Explorer 组件。
