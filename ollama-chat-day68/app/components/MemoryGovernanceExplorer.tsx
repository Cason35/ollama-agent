"use client"; // 第68天：声明生产记忆治理浏览器需要状态、事件处理和浏览器请求能力。
import { useCallback, useEffect, useMemo, useState } from "react"; // 第68天：引入治理台加载、筛选、标签和操作所需 React Hooks。
import Link from "next/link"; // 第68天：引入 Next.js Link 组件实现返回聊天主页的客户端导航。
import { ApiClientError, readApiData } from "@/lib/api/api-client"; // 第68天：引入统一 API 响应解析和客户端错误类型。
import { PRODUCTION_MEMORY_SCOPES, PRODUCTION_MEMORY_TYPES, type MemoryConflictResolution, type ProductionMemoryItem, type ProductionMemoryPlatformSnapshot, type ProductionMemoryScope, type ProductionMemoryType } from "@/lib/memory/production-memory-types"; // 第68天：引入治理台快照、记忆条目、作用域、类型和冲突处理类型。
type GovernanceTab = "overview" | "memories" | "retrieval" | "conflicts" | "events"; // 第68天：定义生产记忆治理台五个标签页。
type ScopeFilter = "all" | ProductionMemoryScope; // 第68天：定义包含全部选项的作用域筛选类型。
type TypeFilter = "all" | ProductionMemoryType; // 第68天：定义包含全部选项的记忆类型筛选类型。
const SCOPE_LABELS: Record<ProductionMemoryScope, string> = { session: "会话", user: "用户", workspace: "工作空间", agent: "智能体", global: "全局" }; // 第68天：定义生产记忆作用域中文标签。
const TYPE_LABELS: Record<ProductionMemoryType, string> = { fact: "事实", preference: "偏好", experience: "经验", decision: "决策", lesson: "教训", summary: "摘要", task_state: "任务状态" }; // 第68天：定义生产记忆类型中文标签。
const TABS: Array<{ id: GovernanceTab; label: string }> = [{ id: "overview", label: "治理概览" }, { id: "memories", label: "记忆资产" }, { id: "retrieval", label: "统一检索" }, { id: "conflicts", label: "冲突审核" }, { id: "events", label: "事件审计" }]; // 第68天：定义覆盖任务验收能力的标签页导航。
function formatTime(value?: number): string { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; } // 第68天：把可选时间戳格式化为中文二十四小时制文本。
function sourceTrace(item: ProductionMemoryItem): string { return [item.source.requestId, item.source.traceId, item.source.sessionId, item.source.workspaceId, item.source.agentId].filter(Boolean).join(" · ") || "无来源链路"; } // 第68天：把请求、Trace、会话、工作空间和智能体来源拼接为可读链路。
function statusClass(status: ProductionMemoryItem["status"]): string { return status === "active" ? "bg-emerald-400/15 text-emerald-200" : status === "archived" ? "bg-amber-400/15 text-amber-200" : status === "consolidated" ? "bg-cyan-400/15 text-cyan-200" : "bg-rose-400/15 text-rose-200"; } // 第68天：根据记忆生命周期状态返回对应颜色样式。
export function MemoryGovernanceExplorer() { // 第68天：定义 Production Memory Platform 主治理页面组件。
  const [snapshot, setSnapshot] = useState<ProductionMemoryPlatformSnapshot | null>(null); // 第68天：保存生产记忆平台完整治理快照。
  const [activeTab, setActiveTab] = useState<GovernanceTab>("overview"); // 第68天：保存当前选中的治理标签页。
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all"); // 第68天：保存记忆资产作用域筛选条件。
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all"); // 第68天：保存记忆资产业务类型筛选条件。
  const [loading, setLoading] = useState(true); // 第68天：保存首次加载和治理动作进行状态。
  const [error, setError] = useState(""); // 第68天：保存用户可读错误信息。
  const [query, setQuery] = useState("我现在数据库用的是什么？"); // 第68天：保存统一记忆检索调试问题。
  const [sessionId, setSessionId] = useState("day68-session-a"); // 第68天：保存检索使用的当前会话标识。
  const [userId, setUserId] = useState("day68-user"); // 第68天：保存检索使用的用户长期记忆标识。
  const [workspaceId, setWorkspaceId] = useState("research-day68"); // 第68天：保存检索和工作空间归档使用的标识。
  const [agentId, setAgentId] = useState("chat"); // 第68天：保存检索使用的智能体标识。
  const [primaryId, setPrimaryId] = useState(""); // 第68天：保存手动合并操作选择的主记忆标识。
  const [secondaryId, setSecondaryId] = useState(""); // 第68天：保存手动合并操作选择的次记忆标识。
  const loadSnapshot = useCallback(async () => { // 第68天：定义读取生产记忆治理快照的稳定回调。
    setLoading(true); // 第68天：进入加载状态并临时禁用治理动作。
    setError(""); // 第68天：清空上一次用户可读错误。
    try { const response = await fetch("/api/production-memory", { cache: "no-store" }); setSnapshot(await readApiData<ProductionMemoryPlatformSnapshot>(response)); } catch (caught) { setError(caught instanceof ApiClientError ? caught.message : "加载第68天生产记忆平台失败"); } finally { setLoading(false); } // 第68天：请求治理快照、解析统一响应并确保恢复交互状态。
  }, []); // 第68天：保持治理快照加载回调引用稳定。
  const requestAction = useCallback(async (method: "POST" | "PATCH", body: Record<string, unknown>) => { // 第68天：定义生产记忆写入、检索和治理动作通用请求函数。
    setLoading(true); // 第68天：治理动作开始时进入加载状态。
    setError(""); // 第68天：治理动作开始时清空历史错误。
    try { const response = await fetch("/api/production-memory", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setSnapshot(await readApiData<ProductionMemoryPlatformSnapshot>(response)); } catch (caught) { setError(caught instanceof ApiClientError ? caught.message : "生产记忆治理操作失败"); } finally { setLoading(false); } // 第68天：发送 JSON 动作、刷新快照并统一处理客户端错误。
  }, []); // 第68天：保持通用治理动作函数引用稳定。
  useEffect(() => { const timer = window.setTimeout(() => void loadSnapshot(), 0); return () => window.clearTimeout(timer); }, [loadSnapshot]); // 第68天：组件挂载后异步加载治理快照并在卸载时清理定时器。
  const visibleItems = useMemo(() => snapshot?.items.filter((item) => (scopeFilter === "all" || item.scope === scopeFilter) && (typeFilter === "all" || item.type === typeFilter)) ?? [], [snapshot, scopeFilter, typeFilter]); // 第68天：按当前作用域和类型筛选生产记忆资产。
  const mergeCandidates = useMemo(() => snapshot?.items.filter((item) => item.status === "active") ?? [], [snapshot]); // 第68天：只允许活动状态记忆进入手动合并选择框。
  const resolveConflict = useCallback(async (conflictId: string, resolution: Exclude<MemoryConflictResolution, "manual_review">) => { await requestAction("PATCH", { action: "resolve_conflict", conflictId, resolution }); }, [requestAction]); // 第68天：定义人工确认冲突处理结论的便捷回调。
  return ( // 第68天：返回生产记忆治理浏览器完整页面。
    <main className="min-h-screen bg-[#07111f] text-slate-100"> {/* 第68天：定义深色生产控制台页面背景。 */}
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8"> {/* 第68天：定义响应式治理页面内容宽度和边距。 */}
        <header className="overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/60 shadow-2xl shadow-cyan-950/30"> {/* 第68天：定义生产记忆平台主题页头卡片。 */}
          <div className="flex flex-col gap-6 px-6 py-7 lg:flex-row lg:items-end lg:justify-between"> {/* 第68天：排列标题说明、状态徽标和返回入口。 */}
            <div className="max-w-4xl"> {/* 第68天：定义标题和平台说明区域。 */}
              <div className="flex items-center gap-3"> {/* 第68天：排列 Day 编号和生产升级标签。 */}
                <span className="rounded-xl bg-cyan-300 px-3 py-1 font-mono text-sm font-black text-slate-950">DAY 68</span> {/* 第68天：展示当前项目日编号。 */}
                <span className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300/80">Production Upgrade V5</span> {/* 第68天：展示生产化升级第五版标签。 */}
              </div> {/* 第68天：结束 Day 编号和升级标签布局。 */}
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Production Memory Platform <span className="text-cyan-300">生产级记忆平台</span></h1> {/* 第68天：展示页面主标题及中文说明。 */}
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">统一管理 Session Memory（会话记忆）、Long-Term Memory（长期记忆）与 Workspace Memory（工作空间记忆），覆盖持久化、语义检索、生命周期、去重、冲突、归档、运行时注入和审计。</p> {/* 第68天：概括生产记忆平台核心能力。 */}
            </div> {/* 第68天：结束标题和平台说明区域。 */}
            <div className="flex flex-wrap items-center gap-2"> {/* 第68天：排列平台状态与导航按钮。 */}
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100">MySQL + VectorStore</span> {/* 第68天：展示长期记忆存储组合。 */}
              <span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-xs text-violet-100">Redis Session TTL</span> {/* 第68天：展示会话记忆 TTL 能力。 */}
              <Link href="/" className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-100">返回聊天主页</Link> {/* 第68天：提供返回继承业务聊天主页的客户端导航入口。 */}
            </div> {/* 第68天：结束平台状态与导航按钮布局。 */}
          </div> {/* 第68天：结束页头主内容布局。 */}
        </header> {/* 第68天：结束生产记忆平台主题页头。 */}
        {error ? <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null} {/* 第68天：按需展示接口或治理动作错误。 */}
        <nav className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 p-2" role="tablist" aria-label="第68天生产记忆治理标签页"> {/* 第68天：定义五标签治理导航。 */}
          {TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${activeTab === tab.id ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>{tab.label}</button>)} {/* 第68天：渲染可访问且可切换的治理标签按钮。 */}
        </nav> {/* 第68天：结束五标签治理导航。 */}
        {!snapshot ? <div className="mt-5 rounded-3xl border border-dashed border-cyan-300/25 py-24 text-center text-cyan-200">正在初始化 Redis、MySQL、VectorStore 与生产记忆治理数据…</div> : null} {/* 第68天：快照未就绪时展示平台初始化占位。 */}
        {snapshot && activeTab === "overview" ? ( // 第68天：按需渲染生产记忆治理概览标签页。
          <section className="mt-5 space-y-5"> {/* 第68天：定义治理概览纵向布局。 */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"> {/* 第68天：定义核心生产记忆指标卡片网格。 */}
              {[{ label: "Total Memories（记忆总数）", value: snapshot.metrics.totalMemories }, { label: "Retrieval Hit Rate（检索命中率）", value: `${(snapshot.metrics.retrievalHitRate * 100).toFixed(1)}%` }, { label: "Conflicts（冲突数）", value: snapshot.metrics.conflictCount }, { label: "Deduplication（去重数）", value: snapshot.metrics.deduplicationCount }, { label: "Archive（归档数）", value: snapshot.metrics.archiveCount }, { label: "Provider Errors（降级数）", value: snapshot.metrics.providerErrors }, { label: "Avg Retrieval（平均检索）", value: `${snapshot.metrics.avgRetrievalDurationMs}ms` }, { label: "Used Memories（实际使用）", value: snapshot.metrics.usedMemoryCount }].map((metric) => <article key={metric.label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs text-slate-400">{metric.label}</p><p className="mt-2 font-mono text-2xl font-black text-cyan-200">{metric.value}</p></article>)} {/* 第68天：展示任务要求及实际使用次数扩展指标。 */}
            </div> {/* 第68天：结束核心生产记忆指标卡片网格。 */}
            <div className="grid gap-4 lg:grid-cols-2"> {/* 第68天：排列 Provider 状态与统一注册中心能力。 */}
              <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"> {/* 第68天：定义 Provider 健康状态卡片。 */}
                <h2 className="text-lg font-black">Memory Providers（记忆提供者）</h2> {/* 第68天：展示 Provider 状态区域标题。 */}
                <div className="mt-4 space-y-3 text-sm"> {/* 第68天：定义两类 Provider 状态列表。 */}
                  <div className="rounded-2xl border border-violet-300/15 bg-violet-300/5 p-4"><p className="font-bold text-violet-200">{snapshot.providers.session.name}</p><p className="mt-2 text-slate-400">Backend（后端）：{snapshot.providers.session.backend} · TTL：{snapshot.providers.session.ttlSeconds}s</p><p className="mt-1 break-all font-mono text-xs text-violet-300/80">{snapshot.providers.session.keyPattern}</p></div> {/* 第68天：展示 Redis 会话 Provider、后端、TTL 与键约定。 */}
                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4"><p className="font-bold text-cyan-200">{snapshot.providers.longTerm.name}</p><p className="mt-2 text-slate-400">Metadata（元数据）：{snapshot.providers.longTerm.metadataBackend} · Vector（向量）：{snapshot.providers.longTerm.vectorCount}</p><p className="mt-1 text-xs text-cyan-300/80">{snapshot.providers.longTerm.vectorBackend}</p></div> {/* 第68天：展示长期 Provider、MySQL 状态和向量数量。 */}
                </div> {/* 第68天：结束两类 Provider 状态列表。 */}
              </article> {/* 第68天：结束 Provider 健康状态卡片。 */}
              <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"> {/* 第68天：定义统一注册中心记忆能力卡片。 */}
                <h2 className="text-lg font-black">Unified Registry（统一注册中心）</h2> {/* 第68天：展示注册中心区域标题。 */}
                <ul className="mt-4 space-y-3"> {/* 第68天：定义生产记忆注册项列表。 */}
                  {snapshot.registryItems.map((item) => <li key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-3"><p className="font-bold text-slate-100">{item.name}</p><span className="rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-200">{item.version}</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{String(item.metadata.description ?? "")}</p></li>)} {/* 第68天：展示两类 Provider、统一服务与合并策略注册项。 */}
                </ul> {/* 第68天：结束生产记忆注册项列表。 */}
              </article> {/* 第68天：结束统一注册中心记忆能力卡片。 */}
            </div> {/* 第68天：结束 Provider 状态与统一注册中心布局。 */}
          </section> // 第68天：结束生产记忆治理概览标签页。
        ) : null} {/* 第68天：结束治理概览条件渲染。 */}
        {snapshot && activeTab === "memories" ? ( // 第68天：按需渲染生产记忆资产标签页。
          <section className="mt-5 space-y-4"> {/* 第68天：定义生产记忆资产纵向布局。 */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 xl:flex-row xl:items-center xl:justify-between"> {/* 第68天：排列筛选、整合和工作空间归档操作。 */}
              <div className="flex flex-wrap gap-2"> {/* 第68天：定义作用域与类型筛选控件组。 */}
                <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as ScopeFilter)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"><option value="all">全部作用域</option>{PRODUCTION_MEMORY_SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}</select> {/* 第68天：按 Scope 筛选生产记忆。 */}
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"><option value="all">全部类型</option>{PRODUCTION_MEMORY_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}</select> {/* 第68天：按业务类型筛选生产记忆。 */}
              </div> {/* 第68天：结束作用域与类型筛选控件组。 */}
              <div className="flex flex-wrap gap-2"> {/* 第68天：定义整合和工作空间归档按钮组。 */}
                <button type="button" disabled={loading} onClick={() => void requestAction("PATCH", { action: "consolidate" })} className="rounded-xl border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-300/10 disabled:opacity-50">Consolidate（整合）</button> {/* 第68天：触发全平台重复扫描与冲突发现。 */}
                <button type="button" disabled={loading} onClick={() => void requestAction("POST", { action: "archive_workspace", workspaceId, targetUserId: userId })} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">Archive Workspace（归档工作空间）</button> {/* 第68天：筛选高价值工作空间条目并沉淀到用户长期记忆。 */}
              </div> {/* 第68天：结束整合和工作空间归档按钮组。 */}
            </div> {/* 第68天：结束筛选、整合和工作空间归档布局。 */}
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"> {/* 第68天：定义手动合并记忆操作区。 */}
              <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"> {/* 第68天：排列主记忆、次记忆与合并按钮。 */}
                <select value={primaryId} onChange={(event) => setPrimaryId(event.target.value)} className="min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs"><option value="">选择主记忆</option>{mergeCandidates.map((item) => <option key={`primary-${item.id}`} value={item.id}>{item.scope}/{item.scopeId} · {item.content.slice(0, 40)}</option>)}</select> {/* 第68天：选择合并后保留的主记忆。 */}
                <select value={secondaryId} onChange={(event) => setSecondaryId(event.target.value)} className="min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs"><option value="">选择次记忆</option>{mergeCandidates.map((item) => <option key={`secondary-${item.id}`} value={item.id}>{item.scope}/{item.scopeId} · {item.content.slice(0, 40)}</option>)}</select> {/* 第68天：选择合并后归档的次记忆。 */}
                <button type="button" disabled={loading || !primaryId || !secondaryId || primaryId === secondaryId} onClick={() => void requestAction("PATCH", { action: "merge", primaryId, secondaryId })} className="rounded-xl bg-violet-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">Merge（合并）</button> {/* 第68天：执行同作用域生产记忆手动合并。 */}
              </div> {/* 第68天：结束手动合并控件布局。 */}
            </div> {/* 第68天：结束手动合并记忆操作区。 */}
            <div className="grid gap-3 xl:grid-cols-2"> {/* 第68天：定义生产记忆资产卡片网格。 */}
              {visibleItems.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-bold text-cyan-200">{SCOPE_LABELS[item.scope]} · {item.scopeId}</span><span className="rounded-full bg-violet-300/10 px-2 py-1 text-[10px] font-bold text-violet-200">{TYPE_LABELS[item.type]}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass(item.status)}`}>{item.status}</span>{item.pinned ? <span className="rounded-full bg-amber-300/15 px-2 py-1 text-[10px] font-bold text-amber-200">PINNED</span> : null}</div><span className="font-mono text-xs text-slate-500">v{item.version}</span></div><p className="mt-3 text-sm leading-6 text-slate-200">{item.content}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-4"><span>Importance {item.importance.toFixed(2)}</span><span>Confidence {item.confidence.toFixed(2)}</span><span>Access {item.accessCount}</span><span>合并来源 {item.consolidatedFrom.length}</span></div><div className="mt-3 rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-slate-500"><p>Source Trace：{sourceTrace(item)}</p><p>Last Accessed：{formatTime(item.lastAccessedAt)}</p><p>Expires At：{formatTime(item.expiresAt)}</p></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={loading || item.status === "deleted"} onClick={() => void requestAction("PATCH", { action: "pin", id: item.id, pinned: !item.pinned })} className="rounded-lg border border-amber-300/25 px-2.5 py-1.5 text-[10px] font-bold text-amber-200 disabled:opacity-40">{item.pinned ? "Unpin（取消固定）" : "Pin（固定）"}</button><button type="button" disabled={loading || item.status !== "active"} onClick={() => void requestAction("PATCH", { action: "archive", id: item.id })} className="rounded-lg border border-cyan-300/25 px-2.5 py-1.5 text-[10px] font-bold text-cyan-200 disabled:opacity-40">Archive（归档）</button><button type="button" disabled={loading || item.status === "deleted"} onClick={() => void requestAction("PATCH", { action: "forget", id: item.id })} className="rounded-lg border border-rose-300/25 px-2.5 py-1.5 text-[10px] font-bold text-rose-200 disabled:opacity-40">Forget（遗忘）</button></div></article>)} {/* 第68天：展示作用域、类型、正文、分数、状态、版本、来源、访问、过期和治理动作。 */}
              {visibleItems.length === 0 ? <p className="col-span-full rounded-2xl border border-dashed border-white/15 py-14 text-center text-slate-500">当前筛选条件没有生产记忆。</p> : null} {/* 第68天：筛选无结果时展示空状态。 */}
            </div> {/* 第68天：结束生产记忆资产卡片网格。 */}
          </section> // 第68天：结束生产记忆资产标签页。
        ) : null} {/* 第68天：结束生产记忆资产条件渲染。 */}
        {snapshot && activeTab === "retrieval" ? ( // 第68天：按需渲染统一记忆检索标签页。
          <section className="mt-5 grid gap-4 xl:grid-cols-[420px_1fr]"> {/* 第68天：排列检索参数与评分结果区域。 */}
            <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"> {/* 第68天：定义统一检索调试表单卡片。 */}
              <h2 className="text-lg font-black">Memory Retrieval Pipeline（记忆检索管线）</h2> {/* 第68天：展示统一检索管线标题。 */}
              <p className="mt-2 text-xs leading-5 text-slate-400">Session + Long-Term + Workspace → Unified Scoring → Deduplication → Sorting → RuntimeContext Injection</p> {/* 第68天：展示三路检索与运行时注入流程。 */}
              <div className="mt-4 space-y-3"> {/* 第68天：定义检索问题与作用域输入列表。 */}
                <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={4} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" placeholder="输入记忆检索问题" /> {/* 第68天：输入统一检索问题。 */}
                <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" placeholder="Session ID（会话标识）" /> {/* 第68天：输入会话记忆作用域标识。 */}
                <input value={userId} onChange={(event) => setUserId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" placeholder="User ID（用户标识）" /> {/* 第68天：输入用户长期记忆作用域标识。 */}
                <input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" placeholder="Workspace ID（工作空间标识）" /> {/* 第68天：输入工作空间记忆作用域标识。 */}
                <input value={agentId} onChange={(event) => setAgentId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm" placeholder="Agent ID（智能体标识）" /> {/* 第68天：输入智能体专属记忆作用域标识。 */}
                <button type="button" disabled={loading || !query.trim()} onClick={() => void requestAction("POST", { action: "retrieve", search: { query, sessionId, userId, workspaceId, agentId, topK: 8, minScore: 0.12, includeSession: true, includeLongTerm: true, includeWorkspace: true } })} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">运行统一检索</button> {/* 第68天：执行 Redis、MySQL 与 VectorStore 三路统一检索。 */}
              </div> {/* 第68天：结束检索问题与作用域输入列表。 */}
            </article> {/* 第68天：结束统一检索调试表单卡片。 */}
            <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5"> {/* 第68天：定义最近统一检索评分结果卡片。 */}
              <h2 className="text-lg font-black">Unified Scoring（统一评分）</h2> {/* 第68天：展示统一评分结果标题。 */}
              <p className="mt-2 text-xs text-slate-400">final = semantic×0.45 + importance×0.20 + recency×0.15 + confidence×0.10 + access×0.10</p> {/* 第68天：展示任务文档规定的生产记忆评分公式。 */}
              <div className="mt-4 space-y-3"> {/* 第68天：定义最近检索命中结果列表。 */}
                {snapshot.lastRetrieval?.results.map((result, index) => <div key={result.item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-200">#{index + 1} · {result.provider}</span><span className="rounded-full bg-violet-300/10 px-2 py-1 text-[10px] text-violet-200">{result.item.scope}/{result.item.scopeId}</span></div><span className="font-mono text-lg font-black text-cyan-200">{result.finalScore.toFixed(4)}</span></div><p className="mt-3 text-sm leading-6 text-slate-200">{result.item.content}</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-400 sm:grid-cols-5"><span>semantic {result.semanticScore.toFixed(3)}</span><span>importance {result.importanceScore.toFixed(3)}</span><span>recency {result.recencyScore.toFixed(3)}</span><span>confidence {result.confidenceScore.toFixed(3)}</span><span>access {result.accessScore.toFixed(3)}</span></div></div>)} {/* 第68天：展示每条命中的 Provider、作用域、正文、最终分和五个评分分量。 */}
                {!snapshot.lastRetrieval || snapshot.lastRetrieval.results.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-slate-500">暂无合格检索结果，请调整问题或作用域标识。</p> : null} {/* 第68天：最近检索没有命中时展示空状态。 */}
              </div> {/* 第68天：结束最近检索命中结果列表。 */}
            </article> {/* 第68天：结束最近统一检索评分结果卡片。 */}
          </section> // 第68天：结束统一记忆检索标签页。
        ) : null} {/* 第68天：结束统一记忆检索条件渲染。 */}
        {snapshot && activeTab === "conflicts" ? ( // 第68天：按需渲染记忆冲突人工审核标签页。
          <section className="mt-5 space-y-3"> {/* 第68天：定义冲突审核记录列表。 */}
            {snapshot.conflicts.map((conflict) => <article key={conflict.id} className={`rounded-2xl border p-4 ${conflict.status === "pending" ? "border-amber-300/25 bg-amber-300/5" : "border-white/10 bg-slate-900/70"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-rose-300/10 px-2 py-1 text-[10px] font-bold text-rose-200">{conflict.type}</span><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300">{conflict.status}</span><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-200">{conflict.resolution}</span></div><span className="font-mono text-[10px] text-slate-500">{formatTime(conflict.createdAt)}</span></div><p className="mt-3 text-sm leading-6 text-slate-200">{conflict.reason}</p><div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-2"><p className="rounded-xl bg-black/20 p-3">Existing：{conflict.existingMemoryId}</p><p className="rounded-xl bg-black/20 p-3">Candidate：{conflict.candidateMemoryId}</p></div>{conflict.status === "pending" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void resolveConflict(conflict.id, "keep_existing")} className="rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200">保留已有</button><button type="button" disabled={loading} onClick={() => void resolveConflict(conflict.id, "replace")} className="rounded-lg border border-violet-300/25 px-3 py-2 text-xs font-bold text-violet-200">采用候选</button><button type="button" disabled={loading} onClick={() => void resolveConflict(conflict.id, "merge")} className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950">合并两条</button></div> : null}</article>)} {/* 第68天：展示冲突双方、类型、原因、状态和三种人工处理操作。 */}
            {snapshot.conflicts.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 py-20 text-center text-slate-500">当前没有重复或矛盾记忆冲突。</p> : null} {/* 第68天：没有冲突记录时展示空状态。 */}
          </section> // 第68天：结束记忆冲突人工审核标签页。
        ) : null} {/* 第68天：结束记忆冲突人工审核条件渲染。 */}
        {snapshot && activeTab === "events" ? ( // 第68天：按需渲染生产记忆事件审计标签页。
          <section className="mt-5 rounded-3xl border border-white/10 bg-slate-900/70 p-5"> {/* 第68天：定义生产记忆事件审计卡片。 */}
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">Memory Event Audit（记忆事件审计）</h2><p className="mt-1 text-xs text-slate-400">memory.read / write / consolidated / conflict_detected / archived / deleted</p></div><button type="button" disabled={loading} onClick={() => void loadSnapshot()} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">刷新</button></div> {/* 第68天：展示事件审计标题、事件类型和刷新操作。 */}
            <div className="mt-4 overflow-x-auto"> {/* 第68天：定义可横向滚动的事件审计表格容器。 */}
              <table className="min-w-full text-left text-xs"> {/* 第68天：定义生产记忆事件审计表格。 */}
                <thead className="text-slate-500"><tr><th className="px-3 py-2">时间</th><th className="px-3 py-2">事件</th><th className="px-3 py-2">Trace</th><th className="px-3 py-2">Runtime Context</th><th className="px-3 py-2">投递</th><th className="px-3 py-2">Payload（安全摘要）</th></tr></thead> {/* 第68天：展示事件审计表头。 */}
                <tbody>{snapshot.events.slice().reverse().map((event) => <tr key={event.id} className="border-t border-white/5"><td className="whitespace-nowrap px-3 py-3 text-slate-400">{formatTime(event.timestamp)}</td><td className="whitespace-nowrap px-3 py-3 font-bold text-cyan-200">{event.type}</td><td className="max-w-48 truncate px-3 py-3 font-mono text-slate-400">{event.traceId}</td><td className="max-w-48 truncate px-3 py-3 font-mono text-slate-400">{event.runtimeContextId}</td><td className="px-3 py-3 text-emerald-200">{event.deliveryStatus}</td><td className="max-w-xl truncate px-3 py-3 font-mono text-[10px] text-slate-500">{JSON.stringify(event.payload)}</td></tr>)}</tbody> {/* 第68天：展示事件时间、类型、Trace、上下文、投递状态和安全载荷摘要。 */}
              </table> {/* 第68天：结束生产记忆事件审计表格。 */}
            </div> {/* 第68天：结束事件审计表格滚动容器。 */}
          </section> // 第68天：结束生产记忆事件审计标签页。
        ) : null} {/* 第68天：结束生产记忆事件审计条件渲染。 */}
      </div> {/* 第68天：结束响应式治理页面内容容器。 */}
    </main> // 第68天：结束生产记忆治理浏览器页面背景。
  ); // 第68天：结束生产记忆治理浏览器返回。
} // 第68天：结束 MemoryGovernanceExplorer 组件。
