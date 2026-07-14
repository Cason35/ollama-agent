"use client"; // 第64天：声明浏览器面板为客户端组件。
import { useCallback, useEffect, useState } from "react"; // 第65天：引入稳定回调、状态与生命周期 Hook。
import type { UnifiedRuntimeSnapshot } from "@/lib/runtime/unified-runtime-chain"; // 第64天：引入统一运行时快照类型。

export function RuntimeContextExplorer() { // 第64天：定义统一运行时上下文浏览器。
  const [snapshot, setSnapshot] = useState<UnifiedRuntimeSnapshot | null>(null); // 第64天：保存最近一次完整链路快照。
  const [loading, setLoading] = useState(true); // 第64天：保存接口加载状态。
  const refresh = useCallback(async () => { setLoading(true); const response = await fetch("/api/runtime/context", { cache: "no-store" }); setSnapshot(await response.json()); setLoading(false); }, []); // 第65天：稳定定义继承自 Day64 的统一上下文研究任务刷新动作。
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]); // 第65天：挂载后异步执行上下文链路并在卸载时清理定时器。
  return <section className="space-y-3 p-3 text-xs"> {/* 第64天：定义上下文浏览器主体。 */}
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Runtime Context Explorer</h3><p className="mt-1 text-zinc-500">统一观察 Request、Agent、Tool、RAG、Prompt、Model、Evaluation 与 Trace。</p></div><button type="button" onClick={() => void refresh()} className="rounded-md bg-violet-600 px-3 py-2 font-semibold text-white">{loading ? "执行中" : "重新测试"}</button></div> {/* 第64天：展示面板标题与重跑按钮。 */}
    {snapshot ? <><div className={`rounded-lg border p-3 ${snapshot.consistent ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"}`}><p className="font-bold">上下文一致性：{snapshot.consistent ? "通过" : "失败"}</p><p className="mt-1 break-all">Request ID：{snapshot.context.requestId}</p><p className="mt-1 break-all">Trace ID：{snapshot.context.traceId}</p><p className="mt-1 break-all">Session ID：{snapshot.context.sessionId}</p></div><div className="grid gap-2">{snapshot.records.map((item) => <article key={item.module} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"><div className="flex items-center justify-between"><strong className="uppercase text-violet-700 dark:text-violet-300">{item.module}</strong><span className="text-[10px] text-zinc-400">同一 Trace</span></div><p className="mt-1 text-zinc-600 dark:text-zinc-300">{item.summary}</p></article>)}</div><pre className="max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-[10px] leading-relaxed text-zinc-100">{JSON.stringify(snapshot.context, null, 2)}</pre></> : <p className="rounded-lg border border-dashed p-4 text-zinc-500">正在创建 Day65 继承的 RuntimeContext...</p>} {/* 第65天：展示继承自 Day64 的链路一致性、模块记录和完整上下文。 */}
  </section>; // 第64天：结束面板视图。
} // 第64天：结束统一运行时上下文浏览器组件。
