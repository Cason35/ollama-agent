"use client"; // 第74天：声明生产仪表盘需要标签页、刷新和功能开关交互。
import Link from "next/link"; // 第74天：引入 Next.js 客户端导航组件。
import { useCallback, useEffect, useState } from "react"; // 第74天：引入快照加载、标签页和交互状态 Hooks。
import type { FeatureFlagMode, ProductionSnapshot } from "@/lib/production/types"; // 第74天：引入生产平台快照和功能开关模式类型。

type ProductionTab = "overview" | "health" | "release" | "flags" | "backup" | "checklist"; // 第74天：定义生产总览、健康、发布、开关、备份和验收六个标签页。
const TABS: { id: ProductionTab; label: string; description: string }[] = [ // 第74天：声明 Day74 Production Dashboard 标签页。
  { id: "overview", label: "Day74 Overview（总览）", description: "Users、Requests、Quality与Security" }, // 第74天：定义生产总览标签页。
  { id: "health", label: "System Health（健康）", description: "MySQL、Redis、MinIO与Registry" }, // 第74天：定义系统健康标签页。
  { id: "release", label: "Release（发布）", description: "Config、Version与Startup" }, // 第74天：定义发布版本标签页。
  { id: "flags", label: "Feature Flags（开关）", description: "Disabled、Enabled与Gradual" }, // 第74天：定义功能开关标签页。
  { id: "backup", label: "Backup & Restore（备份）", description: "MySQL、Redis与MinIO" }, // 第74天：定义备份恢复标签页。
  { id: "checklist", label: "Acceptance（验收）", description: "Day74十四项任务" }, // 第74天：定义任务验收标签页。
]; // 第74天：结束生产仪表盘标签页列表。

const ACCEPTANCE_ITEMS = [ // 第74天：定义 Day74 十四项代码与环境验收清单。
  ["Production Config（生产配置）", "代码已完成"], // 第74天：记录生产配置完成状态。
  ["Dockerization（Docker容器化）", "代码已完成，待本机Docker验证"], // 第74天：记录 Docker 化完成状态。
  ["Database Migration（数据库迁移）", "代码已完成，待MySQL执行"], // 第74天：记录迁移系统完成状态。
  ["Health Check（健康检查）", "代码已完成，待全环境验证"], // 第74天：记录健康检查完成状态。
  ["Startup Validation（启动校验）", "代码已完成，待容器启动验证"], // 第74天：记录启动校验完成状态。
  ["CI Pipeline（持续集成）", "代码已完成，待GitHub Actions运行"], // 第74天：记录 CI 流水线完成状态。
  ["Automated Test Pipeline（自动测试）", "代码已完成"], // 第74天：记录统一测试流水线完成状态。
  ["Backup & Restore（备份恢复）", "代码已完成，待真实数据演练"], // 第74天：记录备份恢复完成状态。
  ["Release Version（发布版本）", "代码已完成"], // 第74天：记录发布版本完成状态。
  ["Feature Flag（功能开关）", "代码已完成"], // 第74天：记录功能开关完成状态。
  ["Production Dashboard（生产仪表盘）", "代码已完成"], // 第74天：记录生产仪表盘完成状态。
  ["Architecture Documentation（架构文档）", "代码已完成"], // 第74天：记录架构文档完成状态。
  ["Final Demo Scenario（最终演示）", "脚本与文档已准备，待Ollama运行"], // 第74天：记录最终演示准备状态。
  ["Load & Failure Test（压测与故障测试）", "脚本已完成，待Docker环境执行"], // 第74天：记录压力与故障测试准备状态。
] as const; // 第74天：结束 Day74 验收清单。

function formatNumber(value: number, digits = 0): string { // 第74天：定义生产指标数字格式化函数。
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value); // 第74天：按中文格式返回有限小数文本。
} // 第74天：结束生产指标数字格式化函数。

function stateClass(state: string): string { // 第74天：定义健康与任务状态颜色映射函数。
  return state === "healthy" || state === "ready" || state.includes("已完成") ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : state === "unhealthy" || state === "failed" ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100"; // 第74天：返回成功、失败或待验证三类样式。
} // 第74天：结束状态颜色映射函数。

export function ProductionDashboard() { // 第74天：定义生产配置、基础设施、发布和验收一体化仪表盘。
  const [snapshot, setSnapshot] = useState<ProductionSnapshot | null>(null); // 第74天：保存最近一次生产平台完整快照。
  const [activeTab, setActiveTab] = useState<ProductionTab>("overview"); // 第74天：保存当前激活标签页。
  const [loading, setLoading] = useState(true); // 第74天：保存生产快照加载状态。
  const [error, setError] = useState(""); // 第74天：保存用户可读请求错误。
  const refresh = useCallback(async () => { // 第74天：定义刷新生产快照的稳定动作。
    setLoading(true); // 第74天：进入加载状态。
    setError(""); // 第74天：清理旧错误。
    try { // 第74天：捕获生产快照请求异常。
      const response = await fetch("/api/production", { cache: "no-store" }); // 第74天：请求实时生产平台快照。
      const payload = await response.json() as ProductionSnapshot & { error?: string }; // 第74天：解析生产快照或错误对象。
      if (!response.ok) throw new Error(payload.error ?? "加载 Day74 生产平台快照失败"); // 第74天：把非成功响应转换为异常。
      setSnapshot(payload); // 第74天：保存最新生产平台快照。
    } catch (caught) { // 第74天：处理网络或服务端异常。
      setError(caught instanceof Error ? caught.message : String(caught)); // 第74天：展示可读错误信息。
    } finally { // 第74天：进入加载状态清理阶段。
      setLoading(false); // 第74天：结束加载状态。
    } // 第74天：结束生产快照请求异常处理。
  }, []); // 第74天：生产快照刷新动作没有外部依赖。
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]); // 第74天：组件挂载后加载快照并在卸载时清理定时器。
  const updateFlag = async (key: string, mode: FeatureFlagMode, rolloutPercentage?: number) => { // 第74天：定义更新功能开关的交互动作。
    setLoading(true); // 第74天：进入功能开关更新状态。
    try { // 第74天：捕获功能开关更新异常。
      const response = await fetch("/api/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_feature_flag", key, mode, rolloutPercentage }) }); // 第74天：提交功能开关模式与灰度比例。
      const payload = await response.json() as { snapshot?: ProductionSnapshot; error?: string }; // 第74天：解析更新后的生产快照。
      if (!response.ok || !payload.snapshot) throw new Error(payload.error ?? "功能开关更新失败"); // 第74天：把非法响应转换为异常。
      setSnapshot(payload.snapshot); // 第74天：保存更新后的生产平台快照。
    } catch (caught) { // 第74天：处理功能开关更新失败。
      setError(caught instanceof Error ? caught.message : String(caught)); // 第74天：展示功能开关错误。
    } finally { // 第74天：进入功能开关更新清理阶段。
      setLoading(false); // 第74天：结束功能开关更新状态。
    } // 第74天：结束功能开关异常处理。
  }; // 第74天：结束功能开关交互动作。
  const overviewCards = snapshot ? [ // 第74天：整理生产平台七项核心总览卡片。
    ["Users（用户）", snapshot.overview.users], // 第74天：展示启用用户数量。
    ["Tenants（租户）", snapshot.overview.tenants], // 第74天：展示租户数量。
    ["Requests（请求）", snapshot.overview.requests], // 第74天：展示可观测请求数量。
    ["Cost（成本）", `$${formatNumber(snapshot.overview.cost, 4)}`], // 第74天：展示累计模型成本。
    ["Errors（错误）", snapshot.overview.errors], // 第74天：展示聚合错误数量。
    ["Avg Latency（平均延迟）", `${formatNumber(snapshot.overview.averageLatency)} ms`], // 第74天：展示平均请求延迟。
    ["P95 Latency（P95延迟）", `${formatNumber(snapshot.overview.p95Latency)} ms`], // 第74天：展示第九十五百分位延迟。
  ] : []; // 第74天：结束生产总览指标卡片。
  return ( // 第74天：返回深色生产发布仪表盘完整视图。
    <main className="h-full min-h-screen overflow-y-auto bg-[#070b14] text-slate-100"> {/* 第74天：定义可独立滚动的生产仪表盘页面。 */}
      <div className="mx-auto w-full max-w-[1720px] p-4 sm:p-6"> {/* 第74天：定义响应式页面内容容器。 */}
        <header className="rounded-3xl border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_35%),linear-gradient(135deg,#101b32,#070b14_55%,#172554)] p-5 shadow-2xl shadow-black/30"> {/* 第74天：定义生产发布渐变标题区。 */}
          <div className="flex flex-wrap items-start justify-between gap-4"> {/* 第74天：排列标题、徽标和操作按钮。 */}
            <div className="flex items-center gap-4"> {/* 第74天：排列 Day74 徽标和标题。 */}
              <div className="flex size-14 flex-col items-center justify-center rounded-2xl bg-cyan-300 text-slate-950"><span className="text-[9px] font-black uppercase">Day</span><span className="font-mono text-2xl font-black">74</span></div> {/* 第74天：展示 Day74 日期徽标。 */}
              <div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Production Release Candidate</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Agent Platform Production Delivery & Release</h1><p className="mt-2 text-sm text-slate-400">智能体平台生产交付与发布 · Docker → Migration → Health → Backup → Release</p></div> {/* 第74天：展示生产交付主标题与核心链路。 */}
            </div> {/* 第74天：结束 Day74 徽标和标题区域。 */}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-xl border border-cyan-300/30 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/10 disabled:opacity-50">刷新Day74快照</button><Link href="/" className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/5">返回Day74对话工作台</Link></div> {/* 第74天：提供刷新与返回主工作台动作。 */}
          </div> {/* 第74天：结束标题操作布局。 */}
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{overviewCards.map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-slate-950/55 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-2 font-mono text-xl font-black text-cyan-200">{value}</p></article>)}</div> {/* 第74天：展示用户、租户、请求、成本、错误和延迟指标。 */}
        </header> {/* 第74天：结束生产发布标题区。 */}
        {error ? <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-100">{error}</p> : null} {/* 第74天：按需展示生产平台错误。 */}
        <nav className="mt-4 grid gap-2 rounded-3xl border border-white/10 bg-slate-950/70 p-2 md:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label="Day 74 Production Delivery标签页">{TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`rounded-2xl px-4 py-3 text-left transition ${activeTab === tab.id ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><span className="block text-sm font-black">{tab.label}</span><span className={`mt-1 block text-[11px] ${activeTab === tab.id ? "text-slate-700" : "text-slate-600"}`}>{tab.description}</span></button>)}</nav> {/* 第74天：渲染六个生产交付标签页。 */}
        {!snapshot ? <div className="mt-4 rounded-3xl border border-dashed border-cyan-300/25 py-24 text-center text-cyan-200">正在聚合Config、Health、Release、Feature Flags、Governance、Observability与Evaluation…</div> : null} {/* 第74天：快照未就绪时展示初始化占位。 */}
        {snapshot && activeTab === "overview" ? <section className="mt-4 grid gap-4 xl:grid-cols-3"><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Production Flow（生产交付链路）</h2><div className="mt-4 space-y-2">{["Development 开发", "Docker 容器化", "CI/CD 持续交付", "Production 生产环境", "Monitoring 监控", "Backup 备份", "Release 发布"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3"><span className="flex size-7 items-center justify-center rounded-full bg-cyan-300/10 font-mono text-xs text-cyan-200">{index + 1}</span><span className="text-sm font-bold">{item}</span></div>)}</div></article><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">AI Quality（人工智能质量）</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-violet-300/5 p-4"><p className="text-xs text-slate-500">Evaluation Score</p><p className="mt-2 font-mono text-2xl font-black text-violet-200">{formatNumber(snapshot.aiQuality.evaluationScore, 3)}</p></div><div className="rounded-2xl bg-violet-300/5 p-4"><p className="text-xs text-slate-500">Bad Cases</p><p className="mt-2 font-mono text-2xl font-black text-violet-200">{snapshot.aiQuality.badCases}</p></div><div className="rounded-2xl bg-violet-300/5 p-4"><p className="text-xs text-slate-500">Regressions</p><p className="mt-2 font-mono text-2xl font-black text-violet-200">{snapshot.aiQuality.regressions}</p></div><div className="rounded-2xl bg-violet-300/5 p-4"><p className="text-xs text-slate-500">Prompt Version</p><p className="mt-2 font-mono text-sm font-black text-violet-200">{snapshot.aiQuality.promptVersion}</p></div></div></article><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Security（安全治理）</h2><div className="mt-4 space-y-3">{[["Audit Events（审计事件）", snapshot.security.auditEvents], ["Permission Denied（权限拒绝）", snapshot.security.permissionDenied], ["Quota Exceeded（配额拒绝）", snapshot.security.quotaExceeded]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between rounded-2xl bg-white/[0.03] p-4"><span className="text-sm text-slate-400">{label}</span><span className="font-mono text-xl font-black text-emerald-200">{value}</span></div>)}</div><p className={`mt-4 rounded-2xl border p-4 text-sm ${stateClass(snapshot.security.productionReady ? "ready" : "failed")}`}>{snapshot.security.productionReady ? "平台治理与基础设施均达到生产就绪演示状态。" : "代码已完成，但仍需启动真实基础设施完成最终就绪验证。"}</p></article></section> : null} {/* 第74天：展示生产链路、AI质量与安全治理总览。 */}
        {snapshot && activeTab === "health" ? <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{snapshot.health.services.map((service) => <article key={service.name} className={`rounded-3xl border p-5 ${stateClass(service.state)}`}><div className="flex items-center justify-between"><h2 className="text-lg font-black uppercase">{service.name}</h2><span className="rounded-full bg-black/20 px-3 py-1 text-[10px] font-black">{service.state}</span></div><p className="mt-4 text-sm leading-6 opacity-80">{service.message}</p><p className="mt-4 font-mono text-xs opacity-60">latency：{service.latencyMs}ms · required：{String(service.required)}</p></article>)}<article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Probe Endpoints（探针接口）</h2><div className="mt-4 space-y-2 font-mono text-sm text-cyan-200"><p>/api/health · 综合健康</p><p>/api/ready · 就绪探针</p><p>/api/live · 存活探针</p></div><p className="mt-4 text-xs leading-6 text-slate-500">Kubernetes可直接把ready和live接口配置为Readiness Probe与Liveness Probe。</p></article></section> : null} {/* 第74天：展示基础设施健康状态和探针接口。 */}
        {snapshot && activeTab === "release" ? <section className="mt-4 grid gap-4 xl:grid-cols-2"><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Platform Release（平台发布版本）</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{[["Version", snapshot.release.version], ["Git Commit", snapshot.release.gitCommit], ["Database Version", snapshot.release.databaseVersion], ["Deployment ID", snapshot.release.deploymentId]].map(([label, value]) => <div key={label} className="rounded-2xl bg-white/[0.03] p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-2 break-all font-mono text-sm font-black text-cyan-200">{value}</dd></div>)}</dl><ul className="mt-4 space-y-2 text-sm text-slate-400">{snapshot.release.changelog.map((item) => <li key={item}>• {item}</li>)}</ul></article><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Config & Startup Validation（配置与启动校验）</h2><p className={`mt-4 rounded-2xl border p-4 text-sm ${stateClass(snapshot.validation.valid ? "ready" : "failed")}`}>Environment：{snapshot.environment.environment} · Config：{snapshot.validation.valid ? "VALID" : "INVALID"} · Startup：{snapshot.startup.status}</p><div className="mt-4 space-y-2">{snapshot.validation.issues.length === 0 ? <p className="rounded-2xl bg-emerald-300/5 p-4 text-sm text-emerald-200">没有发现配置问题。</p> : snapshot.validation.issues.map((issue) => <div key={`${issue.key}-${issue.message}`} className={`rounded-2xl border p-4 text-sm ${stateClass(issue.severity === "error" ? "failed" : "pending")}`}><p className="font-mono text-xs font-black">{issue.key}</p><p className="mt-2 opacity-80">{issue.message}</p></div>)}</div></article></section> : null} {/* 第74天：展示发布版本、环境配置和启动校验结果。 */}
        {snapshot && activeTab === "flags" ? <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{snapshot.featureFlags.map((flag) => <article key={flag.key} className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><p className="font-mono text-xs font-black text-cyan-300">{flag.key}</p><h2 className="mt-2 text-lg font-black">{flag.name}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{flag.description}</p><div className="mt-4 flex flex-wrap gap-2">{(["disabled", "enabled", "gradual"] as FeatureFlagMode[]).map((mode) => <button key={mode} type="button" disabled={loading} onClick={() => void updateFlag(flag.key, mode, mode === "gradual" ? 25 : undefined)} className={`rounded-xl border px-3 py-2 text-xs font-black ${flag.mode === mode ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/10 text-slate-400 hover:bg-white/5"}`}>{mode}</button>)}</div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${flag.rolloutPercentage}%` }} /></div><p className="mt-2 text-right font-mono text-xs text-slate-500">rollout {flag.rolloutPercentage}%</p></article>)}</section> : null} {/* 第74天：展示并操作关闭、开启和灰度发布功能开关。 */}
        {snapshot && activeTab === "backup" ? <section className="mt-4 grid gap-4 xl:grid-cols-[0.55fr_0.45fr]"><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Backup Jobs（备份任务）</h2>{snapshot.backupJobs.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">尚未执行真实备份；启动Docker环境后运行 npm run backup。</p> : <div className="mt-4 space-y-3">{snapshot.backupJobs.map((job) => <div key={job.id} className={`rounded-2xl border p-4 ${stateClass(job.status)}`}><div className="flex items-center justify-between"><span className="font-black uppercase">{job.kind}</span><span className="text-xs">{job.status}</span></div><p className="mt-2 break-all font-mono text-[10px] opacity-70">{job.target}</p></div>)}</div>}</article><article className="rounded-3xl border border-white/10 bg-slate-950/70 p-5"><h2 className="text-lg font-black">Backup Commands（备份命令）</h2><div className="mt-4 space-y-3 font-mono text-xs text-cyan-200"><p className="rounded-2xl bg-black/25 p-4">npm run backup</p><p className="rounded-2xl bg-black/25 p-4">npm run restore -- backups/&lt;timestamp&gt;</p></div><p className="mt-4 text-sm leading-6 text-slate-500">备份程序会导出MySQL SQL、Redis RDB和MinIO对象目录，并生成manifest.json清单。</p></article></section> : null} {/* 第74天：展示备份任务与恢复命令。 */}
        {snapshot && activeTab === "checklist" ? <section className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ACCEPTANCE_ITEMS.map(([name, status], index) => <article key={name} className={`rounded-2xl border p-4 ${stateClass(status)}`}><p className="text-[10px] font-black opacity-60">TASK {index + 1}</p><h2 className="mt-2 text-sm font-black">{name}</h2><p className="mt-3 text-xs leading-5 opacity-75">{status}</p></article>)}</section> : null} {/* 第74天：展示十四项代码完成与环境待验证状态。 */}
      </div> {/* 第74天：结束响应式生产仪表盘内容容器。 */}
    </main> // 第74天：结束生产交付仪表盘页面。
  ); // 第74天：结束 ProductionDashboard 视图返回。
} // 第74天：结束生产交付仪表盘组件。
