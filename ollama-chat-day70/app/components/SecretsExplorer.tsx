"use client"; // 第63天：声明密钥浏览器是客户端组件，因为它需要表单输入、复制 key 和调用 API。
import { useCallback, useEffect, useMemo, useState } from "react"; // 第63天：引入 React Hooks 管理快照、筛选、草稿和加载状态。
import { readApiData } from "@/lib/api/api-client"; // 第63天：引入统一 API Envelope 解析工具。
import type { SecretCategory, SecretMetadata, SecretsSnapshot } from "@/lib/secrets/secret-types"; // 第63天：引入密钥元数据、分类和快照类型。

const CATEGORY_OPTIONS: Array<SecretCategory | "all"> = ["all", "model", "database", "storage", "redis", "auth"]; // 第63天：定义密钥分类筛选项。
type SecretMutationResult = SecretsSnapshot | { snapshot: SecretsSnapshot; item?: SecretMetadata; deleted?: boolean }; // 第63天：定义写入、轮换和删除动作的返回结构。

export function SecretsExplorer() { // 第63天：定义 Secrets Explorer 密钥浏览器组件。
  const [snapshot, setSnapshot] = useState<SecretsSnapshot | null>(null); // 第63天：保存密钥管理快照。
  const [activeCategory, setActiveCategory] = useState<SecretCategory | "all">("all"); // 第63天：保存当前分类筛选。
  const [newKey, setNewKey] = useState("OPENAI_API_KEY"); // 第63天：保存新增密钥名称输入。
  const [newValue, setNewValue] = useState(""); // 第63天：保存新增密钥值输入。
  const [newCategory, setNewCategory] = useState<SecretCategory>("model"); // 第63天：保存新增密钥分类。
  const [rotationDrafts, setRotationDrafts] = useState<Record<string, string>>({}); // 第63天：保存每个密钥的轮换新值草稿。
  const [loading, setLoading] = useState(false); // 第63天：保存 API 加载状态。
  const [errorText, setErrorText] = useState(""); // 第63天：保存错误提示文案。
  const applySnapshot = useCallback((next: SecretsSnapshot) => { // 第63天：定义写入快照的方法。
    setSnapshot(next); // 第63天：保存最新密钥快照。
  }, []); // 第63天：该方法只依赖稳定的 React setter。
  const items = useMemo(() => { // 第63天：根据快照和分类计算当前展示的密钥元数据。
    const allItems = snapshot?.items ?? []; // 第63天：未加载时使用空列表。
    return activeCategory === "all" ? allItems : allItems.filter((item) => item.category === activeCategory); // 第63天：按分类筛选密钥元数据。
  }, [activeCategory, snapshot]); // 第63天：当分类或快照变化时重新计算列表。
  const refresh = useCallback(async () => { // 第63天：定义刷新密钥快照的方法。
    setLoading(true); // 第63天：进入加载状态。
    setErrorText(""); // 第63天：清空旧错误。
    try { // 第63天：开始请求密钥快照。
      const res = await fetch("/api/secrets"); // 第63天：请求 GET /api/secrets。
      const data = await readApiData<SecretsSnapshot>(res); // 第63天：解析密钥快照。
      applySnapshot(data); // 第63天：写入快照。
    } catch (error) { // 第63天：捕获刷新错误。
      setErrorText(error instanceof Error ? error.message : "加载密钥管理失败。"); // 第63天：展示错误信息。
    } finally { // 第63天：无论成功失败都结束加载。
      setLoading(false); // 第63天：退出加载状态。
    } // 第63天：结束 finally。
  }, [applySnapshot]); // 第63天：刷新函数依赖稳定的快照写入方法。
  useEffect(() => { // 第63天：组件挂载时自动加载密钥快照。
    const timer = window.setTimeout(() => void refresh(), 0); // 第63天：延迟到浏览器事件循环执行，避免同步 setState。
    return () => window.clearTimeout(timer); // 第63天：组件卸载时清理定时器。
  }, [refresh]); // 第63天：依赖稳定的刷新函数。
  async function runAction(body: Record<string, unknown>) { // 第63天：定义统一密钥动作请求函数。
    setLoading(true); // 第63天：进入加载状态。
    setErrorText(""); // 第63天：清空旧错误。
    try { // 第63天：开始发送密钥动作请求。
      const res = await fetch("/api/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); // 第63天：向密钥管理 API 发送 JSON 动作。
      const data = await readApiData<SecretMutationResult>(res); // 第63天：解析密钥动作结果。
      applySnapshot("snapshot" in data ? data.snapshot : data); // 第63天：兼容直接快照和包裹快照两种返回形态。
    } catch (error) { // 第63天：捕获密钥动作错误。
      setErrorText(error instanceof Error ? error.message : "密钥管理操作失败。"); // 第63天：展示错误信息。
    } finally { // 第63天：无论成功失败都结束加载。
      setLoading(false); // 第63天：退出加载状态。
    } // 第63天：结束 finally。
  } // 第63天：结束 runAction 方法。
  async function saveNewSecret() { // 第63天：定义新增或覆盖密钥的方法。
    if (!newKey.trim() || !newValue.trim()) { // 第63天：校验新增表单必填。
      setErrorText("请输入密钥 key 和 value。"); // 第63天：提示用户补齐输入。
      return; // 第63天：阻止空密钥提交。
    } // 第63天：结束表单校验。
    await runAction({ action: "set", key: newKey.trim(), value: newValue, category: newCategory }); // 第63天：提交新增密钥动作。
    setNewValue(""); // 第63天：提交后清空密钥值输入，避免停留在前端状态中。
  } // 第63天：结束 saveNewSecret 方法。
  async function rotateSecret(item: SecretMetadata) { // 第63天：定义轮换单个密钥的方法。
    const value = rotationDrafts[item.key]?.trim() ?? ""; // 第63天：读取当前密钥的轮换新值草稿。
    if (!value) { // 第63天：校验轮换新值必填。
      setErrorText(`请输入 ${item.key} 的新密钥值。`); // 第63天：提示用户补齐轮换值。
      return; // 第63天：阻止空值轮换。
    } // 第63天：结束轮换校验。
    await runAction({ action: "rotate", key: item.key, value, category: item.category }); // 第63天：提交轮换动作。
    setRotationDrafts((prev) => ({ ...prev, [item.key]: "" })); // 第63天：轮换后清空该 key 的草稿。
  } // 第63天：结束 rotateSecret 方法。
  async function deleteSecret(item: SecretMetadata) { // 第63天：定义删除单个运行时密钥的方法。
    await runAction({ action: "delete", key: item.key }); // 第63天：提交删除动作，环境变量来源不会被删除。
  } // 第63天：结束 deleteSecret 方法。
  function setRotationDraft(key: string, value: string) { // 第63天：定义更新单个轮换草稿的方法。
    setRotationDrafts((prev) => ({ ...prev, [key]: value })); // 第63天：只更新目标 key 的草稿值。
  } // 第63天：结束 setRotationDraft 方法。
  const metrics = snapshot?.metrics; // 第63天：读取密钥指标，未加载时为空。
  return ( // 第63天：返回密钥浏览器 UI。
    <section className="space-y-3"> {/* 第63天：定义密钥浏览器整体布局。 */}
      <div className="rounded-lg border border-rose-200/80 bg-rose-50/70 px-3 py-3 dark:border-rose-900/50 dark:bg-rose-950/20"> {/* 第63天：定义密钥管理概览区。 */}
        <div className="flex items-start justify-between gap-3"> {/* 第63天：排列标题和刷新按钮。 */}
          <div> {/* 第63天：定义标题文案容器。 */}
            <h2 className="text-sm font-semibold text-rose-950 dark:text-rose-100">Secrets Explorer（密钥管理浏览器）</h2> {/* 第63天：展示密钥管理标题。 */}
            <p className="mt-1 text-xs leading-relaxed text-rose-800/80 dark:text-rose-200/80">Day 63：Secret 永不显示真实 Value，只展示 Key、分类、来源、加密状态、轮换历史与指标。</p> {/* 第63天：展示密钥管理说明。 */}
          </div> {/* 第63天：结束标题文案容器。 */}
          <button type="button" disabled={loading} onClick={() => void refresh()} className="shrink-0 rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] font-semibold text-rose-800 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-950/50 dark:text-rose-100">Refresh</button> {/* 第63天：提供刷新按钮。 */}
        </div> {/* 第63天：结束标题和按钮行。 */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5"> {/* 第63天：定义指标网格。 */}
          <Metric label="total" value={String(metrics?.totalSecrets ?? 0)} /> {/* 第63天：展示密钥总数。 */}
          <Metric label="rotated" value={String(metrics?.rotateCount ?? 0)} /> {/* 第63天：展示轮换次数。 */}
          <Metric label="access" value={String(metrics?.accessCount ?? 0)} /> {/* 第63天：展示访问次数。 */}
          <Metric label="encrypted" value={String(metrics?.encryptedCount ?? 0)} /> {/* 第63天：展示已加密数量。 */}
          <Metric label="expired" value={String(metrics?.expiredSecrets ?? 0)} /> {/* 第63天：展示过期数量。 */}
        </div> {/* 第63天：结束指标网格。 */}
        {errorText ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{errorText}</p> : null} {/* 第63天：按需展示错误提示。 */}
      </div> {/* 第63天：结束密钥管理概览区。 */}
      <div className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-[10px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第63天：定义新增密钥表单卡片。 */}
        <p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">新增或覆盖密钥</p> {/* 第63天：展示新增表单标题。 */}
        <div className="mt-2 grid gap-1.5"> {/* 第63天：定义表单字段布局。 */}
          <input type="text" value={newKey} onChange={(event) => setNewKey(event.target.value)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900" placeholder="SECRET_KEY_NAME" /> {/* 第63天：输入密钥 key。 */}
          <input type="password" value={newValue} onChange={(event) => setNewValue(event.target.value)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] dark:border-zinc-700 dark:bg-zinc-900" placeholder="真实 value 仅提交到后端加密保存" /> {/* 第63天：输入真实密钥值但不在列表展示。 */}
          <div className="flex gap-1.5"> {/* 第63天：排列分类选择和保存按钮。 */}
            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as SecretCategory)} className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] dark:border-zinc-700 dark:bg-zinc-900"> {/* 第63天：选择密钥分类。 */}
              {CATEGORY_OPTIONS.filter((category) => category !== "all").map((category) => <option key={category} value={category}>{category}</option>)} {/* 第63天：渲染可写分类选项。 */}
            </select> {/* 第63天：结束分类选择。 */}
            <button type="button" disabled={loading} onClick={() => void saveNewSecret()} className="rounded-md bg-rose-700 px-2 py-1 font-semibold text-white disabled:opacity-50">Save</button> {/* 第63天：保存密钥。 */}
          </div> {/* 第63天：结束分类和保存按钮行。 */}
        </div> {/* 第63天：结束表单字段布局。 */}
      </div> {/* 第63天：结束新增密钥表单卡片。 */}
      <div className="flex flex-wrap gap-1.5"> {/* 第63天：定义分类筛选按钮区。 */}
        {CATEGORY_OPTIONS.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`rounded-md px-2 py-1 text-[11px] font-semibold ${activeCategory === category ? "bg-rose-700 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{category}</button>)} {/* 第63天：渲染所有分类筛选按钮。 */}
      </div> {/* 第63天：结束分类筛选按钮区。 */}
      <ul className="max-h-[34rem] space-y-2 overflow-y-auto pr-1"> {/* 第63天：定义密钥元数据列表。 */}
        {items.length === 0 ? <li className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">暂无密钥元数据。</li> : null} {/* 第63天：展示空状态。 */}
        {items.map((item) => ( // 第63天：遍历密钥元数据。
          <li key={`${item.source}-${item.key}`} className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-[10px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第63天：定义单个密钥卡片。 */}
            <div className="flex items-start justify-between gap-2"> {/* 第63天：排列 key 和来源标记。 */}
              <div className="min-w-0"> {/* 第63天：定义 key 与元信息容器。 */}
                <p className="break-all font-mono font-semibold text-zinc-950 dark:text-zinc-50">{item.key}</p> {/* 第63天：展示密钥名称。 */}
                <p className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">value: {item.maskedValue} · encrypted: {item.encrypted ? "yes" : "external"}</p> {/* 第63天：只展示脱敏值和加密状态。 */}
              </div> {/* 第63天：结束 key 与元信息容器。 */}
              <span className={sourceClass(item.source)}>{item.source}</span> {/* 第63天：展示密钥来源。 */}
            </div> {/* 第63天：结束 key 和来源标记行。 */}
            <div className="mt-2 flex gap-1.5"> {/* 第63天：定义轮换输入和操作按钮区域。 */}
              <input type="password" disabled={loading} value={rotationDrafts[item.key] ?? ""} onChange={(event) => setRotationDraft(item.key, event.target.value)} className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[10px] text-zinc-800 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="输入新 value 后 Rotate" /> {/* 第63天：轮换新密钥值输入框。 */}
              <button type="button" disabled={loading} onClick={() => void rotateSecret(item)} className="rounded-md bg-rose-700 px-2 py-1 font-semibold text-white disabled:opacity-50">Rotate</button> {/* 第63天：轮换密钥。 */}
              <button type="button" disabled={loading} onClick={() => void navigator.clipboard?.writeText(item.key)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Copy</button> {/* 第63天：复制密钥名称。 */}
              <button type="button" disabled={loading || item.source === "env"} onClick={() => void deleteSecret(item)} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">Delete</button> {/* 第63天：删除运行时密钥，环境变量来源禁用。 */}
            </div> {/* 第63天：结束轮换输入和操作按钮区域。 */}
            <p className="mt-1 font-mono text-[9px] text-zinc-400">category: {item.category} · id: {item.id} · updated: {formatTime(item.updatedAt)}</p> {/* 第63天：展示分类、版本 ID 和更新时间。 */}
          </li> // 第63天：结束单个密钥卡片。
        ))} {/* 第63天：结束密钥元数据遍历。 */}
      </ul> {/* 第63天：结束密钥元数据列表。 */}
      <div className="rounded-lg border border-zinc-200/80 bg-zinc-50 px-2.5 py-2 text-[10px] dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第63天：定义轮换历史区域。 */}
        <p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">Rotation History（轮换历史）</p> {/* 第63天：展示轮换历史标题。 */}
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto"> {/* 第63天：定义轮换历史列表。 */}
          {(snapshot?.rotationHistory ?? []).length === 0 ? <li className="text-zinc-400">暂无轮换记录。</li> : null} {/* 第63天：展示轮换历史空状态。 */}
          {(snapshot?.rotationHistory ?? []).map((record) => <li key={`${record.key}-${record.rotatedAt}`} className="font-mono text-zinc-600 dark:text-zinc-300">{record.key}: {record.oldVersionId ?? "none"} → {record.newVersionId} · {formatTime(record.rotatedAt)}</li>)} {/* 第63天：渲染轮换历史。 */}
        </ul> {/* 第63天：结束轮换历史列表。 */}
      </div> {/* 第63天：结束轮换历史区域。 */}
    </section> // 第63天：结束密钥浏览器 UI。
  ); // 第63天：结束组件返回。
} // 第63天：结束 SecretsExplorer 组件。

function Metric({ label, value }: { label: string; value: string }) { // 第63天：定义小型指标卡组件。
  return ( // 第63天：返回指标卡 JSX。
    <div className="rounded-md border border-rose-200/70 bg-white/75 px-2 py-1.5 dark:border-rose-900/40 dark:bg-zinc-950/30"> {/* 第63天：定义指标卡外观。 */}
      <p className="font-mono text-[9px] uppercase text-rose-700/70 dark:text-rose-300/70">{label}</p> {/* 第63天：展示指标标签。 */}
      <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-rose-950 dark:text-rose-50">{value}</p> {/* 第63天：展示指标值。 */}
    </div> // 第63天：结束指标卡外观。
  ); // 第63天：结束指标卡返回。
} // 第63天：结束 Metric 组件。

function sourceClass(source: SecretMetadata["source"]): string { // 第63天：定义密钥来源徽标样式函数。
  if (source === "memory") return "shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-800 dark:text-rose-200"; // 第63天：运行时内存来源使用玫红色。
  return "shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-sky-800 dark:text-sky-200"; // 第63天：环境变量来源使用蓝色。
} // 第63天：结束 sourceClass 函数。

function formatTime(value: number): string { // 第63天：定义时间展示格式化函数。
  return value > 0 ? new Date(value).toLocaleString("zh-CN") : "env"; // 第63天：环境变量来源没有应用内更新时间时显示 env。
} // 第63天：结束 formatTime 函数。
