"use client"; // 第62天：声明配置浏览器是客户端组件，因为它需要拉取 API、编辑输入框并触发热更新。
import { useCallback, useEffect, useMemo, useState } from "react"; // 第62天：引入 React Hooks 管理快照、筛选和编辑草稿。
import { readApiData } from "@/lib/api/api-client"; // 第62天：引入统一 API Envelope 解析工具。
import type { ConfigCategory, ConfigItem, ConfigSnapshot } from "@/lib/config/config-types"; // 第62天：引入配置中心快照和配置项类型。
const CATEGORY_OPTIONS: Array<ConfigCategory | "all"> = ["all", "model", "prompt", "runtime", "database", "redis", "storage", "feature"]; // 第62天：定义配置分类筛选项。
type ConfigMutationResult = ConfigSnapshot | { snapshot: ConfigSnapshot; item?: ConfigItem; deleted?: boolean }; // 第62天：定义配置写入、重载和重置动作的返回结构。
export function ConfigExplorer() { // 第62天：定义 Config Explorer 配置浏览器组件。
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null); // 第62天：保存配置中心快照。
  const [activeCategory, setActiveCategory] = useState<ConfigCategory | "all">("all"); // 第62天：保存当前分类筛选。
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // 第62天：保存每个配置项的输入草稿。
  const [loading, setLoading] = useState(false); // 第62天：保存 API 加载状态。
  const [errorText, setErrorText] = useState(""); // 第62天：保存错误提示文案。
  const applySnapshot = useCallback((next: ConfigSnapshot) => { // 第62天：定义写入快照并生成输入草稿的方法。
    setSnapshot(next); // 第62天：保存最新配置快照。
    setDrafts(Object.fromEntries(next.items.map((item) => [item.key, valueToDraft(item.value)]))); // 第62天：把配置值转换成文本草稿。
  }, []); // 第62天：该方法只依赖稳定的 React setter。
  const items = useMemo(() => { // 第62天：根据快照和分类计算当前展示的配置项。
    const allItems = snapshot?.items ?? []; // 第62天：未加载时使用空列表。
    return activeCategory === "all" ? allItems : allItems.filter((item) => item.category === activeCategory); // 第62天：按分类筛选配置项。
  }, [activeCategory, snapshot]); // 第62天：当分类或快照变化时重新计算列表。
  const refresh = useCallback(async () => { // 第62天：定义刷新配置中心快照的方法。
    setLoading(true); // 第62天：进入加载状态。
    setErrorText(""); // 第62天：清空旧错误。
    try { // 第62天：开始请求配置中心快照。
      const res = await fetch("/api/config"); // 第62天：请求 GET /api/config。
      const data = await readApiData<ConfigSnapshot>(res); // 第62天：解析配置中心快照。
      applySnapshot(data); // 第62天：写入快照并同步输入草稿。
    } catch (error) { // 第62天：捕获刷新错误。
      setErrorText(error instanceof Error ? error.message : "加载配置中心失败。"); // 第62天：展示错误信息。
    } finally { // 第62天：无论成功失败都结束加载。
      setLoading(false); // 第62天：退出加载状态。
    } // 第62天：结束 finally。
  }, [applySnapshot]); // 第62天：刷新函数依赖稳定的快照写入方法。
  useEffect(() => { // 第62天：组件挂载时自动加载配置中心快照。
    const timer = window.setTimeout(() => void refresh(), 0); // 第62天：延迟到浏览器事件循环执行，避免同步 setState。
    return () => window.clearTimeout(timer); // 第62天：组件卸载时清理定时器。
  }, [refresh]); // 第62天：依赖稳定的刷新函数。
  async function runAction(body: Record<string, unknown>) { // 第62天：定义统一配置动作请求函数。
    setLoading(true); // 第62天：进入加载状态。
    setErrorText(""); // 第62天：清空旧错误。
    try { // 第62天：开始发送配置动作请求。
      const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); // 第62天：向配置中心发送 JSON 动作。
      const data = await readApiData<ConfigMutationResult>(res); // 第62天：解析配置动作结果。
      applySnapshot("snapshot" in data ? data.snapshot : data); // 第62天：兼容直接快照和包裹快照两种返回形态。
    } catch (error) { // 第62天：捕获配置动作错误。
      setErrorText(error instanceof Error ? error.message : "配置中心操作失败。"); // 第62天：展示错误信息。
    } finally { // 第62天：无论成功失败都结束加载。
      setLoading(false); // 第62天：退出加载状态。
    } // 第62天：结束 finally。
  } // 第62天：结束 runAction 方法。
  function setDraft(key: string, value: string) { // 第62天：定义更新单个配置草稿的方法。
    setDrafts((prev) => ({ ...prev, [key]: value })); // 第62天：只更新目标 key 的草稿值。
  } // 第62天：结束 setDraft 方法。
  async function saveItem(item: ConfigItem) { // 第62天：定义保存单个配置项的方法。
    await runAction({ action: "set", key: item.key, value: drafts[item.key] ?? valueToDraft(item.value) }); // 第62天：把草稿值提交给配置中心。
  } // 第62天：结束 saveItem 方法。
  async function resetItem(item: ConfigItem) { // 第62天：定义重置单个配置项的方法。
    await runAction({ action: "reset", key: item.key }); // 第62天：删除数据库覆盖值并回退到 env 或 default。
  } // 第62天：结束 resetItem 方法。
  const metrics = snapshot?.metrics; // 第62天：读取配置中心指标，未加载时为空。
  return ( // 第62天：返回配置浏览器 UI。
    <section className="space-y-3"> {/* 第62天：定义配置浏览器整体布局。 */}
      <div className="rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-3 dark:border-violet-900/50 dark:bg-violet-950/20"> {/* 第62天：定义配置中心概览区。 */}
        <div className="flex items-start justify-between gap-3"> {/* 第62天：排列标题和操作按钮。 */}
          <div> {/* 第62天：定义标题文案容器。 */}
            <h2 className="text-sm font-semibold text-violet-950 dark:text-violet-100">Config Explorer（配置中心浏览器）</h2> {/* 第62天：展示配置中心标题。 */}
            <p className="mt-1 text-xs leading-relaxed text-violet-800/80 dark:text-violet-200/80">Day 62：统一管理 Model、Prompt、Runtime、Redis、Database、Storage 和 Feature Flags。</p> {/* 第62天：展示配置中心说明。 */}
          </div> {/* 第62天：结束标题文案容器。 */}
          <button type="button" disabled={loading} onClick={() => void runAction({ action: "reload" })} className="shrink-0 rounded-md border border-violet-300 bg-white px-2 py-1 text-[11px] font-semibold text-violet-800 disabled:opacity-50 dark:border-violet-800 dark:bg-zinc-950/50 dark:text-violet-100">Reload</button> {/* 第62天：提供重新加载按钮。 */}
        </div> {/* 第62天：结束标题和操作按钮行。 */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3"> {/* 第62天：定义指标网格。 */}
          <Metric label="total" value={String(metrics?.totalConfigs ?? 0)} /> {/* 第62天：展示配置总数。 */}
          <Metric label="env" value={String(metrics?.envConfigs ?? 0)} /> {/* 第62天：展示环境变量配置数量。 */}
          <Metric label="database" value={String(metrics?.dbConfigs ?? 0)} /> {/* 第62天：展示数据库覆盖配置数量。 */}
          <Metric label="hot reload" value={String(metrics?.hotReloadCount ?? 0)} /> {/* 第62天：展示热更新次数。 */}
          <Metric label="errors" value={String(metrics?.validationErrors ?? 0)} /> {/* 第62天：展示校验错误数量。 */}
          <Metric label="version" value={String(snapshot?.version ?? "-")} /> {/* 第62天：展示配置版本号。 */}
        </div> {/* 第62天：结束指标网格。 */}
        {errorText ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{errorText}</p> : null} {/* 第62天：按需展示错误提示。 */}
        {snapshot?.validationErrors.length ? <ul className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">{snapshot.validationErrors.map((error) => <li key={error.key}>{error.key}: {error.message}</li>)}</ul> : null} {/* 第62天：展示配置校验错误列表。 */}
      </div> {/* 第62天：结束配置中心概览区。 */}
      <div className="flex flex-wrap gap-1.5"> {/* 第62天：定义分类筛选按钮区。 */}
        {CATEGORY_OPTIONS.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${activeCategory === category ? "bg-violet-700 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{category}</button>)} {/* 第62天：渲染所有分类筛选按钮。 */}
      </div> {/* 第62天：结束分类筛选按钮区。 */}
      <ul className="max-h-[38rem] space-y-2 overflow-y-auto pr-1"> {/* 第62天：定义配置项列表。 */}
        {items.length === 0 ? <li className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">暂无配置项。</li> : null} {/* 第62天：展示空状态。 */}
        {items.map((item) => ( // 第62天：遍历配置项。
          <li key={item.key} className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-[10px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第62天：定义单个配置项卡片。 */}
            <div className="flex items-start justify-between gap-2"> {/* 第62天：排列 key 和来源标记。 */}
              <div className="min-w-0"> {/* 第62天：定义 key 与描述容器。 */}
                <p className="break-all font-mono font-semibold text-zinc-950 dark:text-zinc-50">{item.key}</p> {/* 第62天：展示配置键。 */}
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">{item.description ?? "无描述"}</p> {/* 第62天：展示配置说明。 */}
              </div> {/* 第62天：结束 key 与描述容器。 */}
              <span className={sourceClass(item.source)}>{item.source}</span> {/* 第62天：展示配置来源。 */}
            </div> {/* 第62天：结束 key 和来源标记行。 */}
            <div className="mt-2 flex gap-1.5"> {/* 第62天：定义编辑输入和操作按钮区域。 */}
              <input type="text" disabled={!item.editable || loading} value={drafts[item.key] ?? valueToDraft(item.value)} onChange={(event) => setDraft(item.key, event.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-800 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" /> {/* 第62天：展示可编辑配置值输入框。 */}
              <button type="button" disabled={!item.editable || loading} onClick={() => void saveItem(item)} className="rounded-md bg-violet-700 px-2 py-1 font-semibold text-white disabled:opacity-50">Save</button> {/* 第62天：保存数据库覆盖值。 */}
              <button type="button" disabled={loading || item.source !== "database"} onClick={() => void resetItem(item)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Reset</button> {/* 第62天：重置数据库覆盖值。 */}
            </div> {/* 第62天：结束编辑输入和操作按钮区域。 */}
            <p className="mt-1 font-mono text-[9px] text-zinc-400">category: {item.category} · type: {typeof item.value} · updated: {new Date(item.updatedAt).toLocaleString("zh-CN")}</p> {/* 第62天：展示分类、值类型和更新时间。 */}
          </li> // 第62天：结束单个配置项卡片。
        ))} {/* 第62天：结束配置项遍历。 */}
      </ul> {/* 第62天：结束配置项列表。 */}
    </section> // 第62天：结束配置浏览器 UI。
  ); // 第62天：结束组件返回。
} // 第62天：结束 ConfigExplorer 组件。
function Metric({ label, value }: { label: string; value: string }) { // 第62天：定义小型指标卡组件。
  return ( // 第62天：返回指标卡 JSX。
    <div className="rounded-md border border-violet-200/70 bg-white/75 px-2 py-1.5 dark:border-violet-900/40 dark:bg-zinc-950/30"> {/* 第62天：定义指标卡外观。 */}
      <p className="font-mono text-[9px] uppercase text-violet-700/70 dark:text-violet-300/70">{label}</p> {/* 第62天：展示指标标签。 */}
      <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-violet-950 dark:text-violet-50">{value}</p> {/* 第62天：展示指标值。 */}
    </div> // 第62天：结束指标卡外观。
  ); // 第62天：结束指标卡返回。
} // 第62天：结束 Metric 组件。
function valueToDraft(value: unknown): string { // 第62天：定义配置值转输入框文本的工具函数。
  if (typeof value === "string") return value; // 第62天：字符串原样返回。
  if (typeof value === "number" || typeof value === "boolean") return String(value); // 第62天：数字和布尔值转字符串。
  return JSON.stringify(value); // 第62天：其他值序列化为 JSON 文本。
} // 第62天：结束 valueToDraft 函数。
function sourceClass(source: ConfigItem["source"]): string { // 第62天：定义配置来源徽标样式函数。
  if (source === "database") return "shrink-0 rounded bg-fuchsia-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-fuchsia-800 dark:text-fuchsia-200"; // 第62天：数据库来源使用紫红色。
  if (source === "env") return "shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-sky-800 dark:text-sky-200"; // 第62天：环境变量来源使用蓝色。
  return "shrink-0 rounded bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-700 dark:text-zinc-200"; // 第62天：默认来源使用中性色。
} // 第62天：结束 sourceClass 函数。

