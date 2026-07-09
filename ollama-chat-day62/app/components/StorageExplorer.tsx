"use client"; // 第62天：Storage Explorer 需要浏览器端拉取快照、复制链接和触发删除操作。

import { useCallback, useEffect, useState } from "react"; // 第62天：引入 React Hooks 管理对象存储面板状态。
import { readApiData } from "@/lib/api/api-client"; // 第62天：引入统一 API Envelope 解析工具。
import type { StorageSnapshot } from "@/lib/storage/storage-types"; // 第62天：引入对象存储快照类型。

type StorageActionResult = { // 第62天：定义对象存储操作返回结果。
  snapshot?: StorageSnapshot; // 第62天：部分 POST 动作会把快照包在 snapshot 字段中。
  provider?: StorageSnapshot["provider"]; // 第62天：GET 动作直接返回快照时包含 provider。
  bucket?: string; // 第62天：GET 动作直接返回快照时包含 bucket。
  objects?: StorageSnapshot["objects"]; // 第62天：GET 动作直接返回快照时包含对象列表。
  metrics?: StorageSnapshot["metrics"]; // 第62天：GET 动作直接返回快照时包含指标。
}; // 第62天：结束 StorageActionResult 类型定义。

export function StorageExplorer() { // 第62天：定义 Storage Explorer（对象存储浏览器）组件。
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null); // 第62天：保存对象存储快照。
  const [loading, setLoading] = useState(false); // 第62天：保存请求加载状态。
  const [errorText, setErrorText] = useState(""); // 第62天：保存面板错误提示。
  const refresh = useCallback(async () => { // 第62天：定义刷新对象存储快照的方法。
    setLoading(true); // 第62天：进入加载状态。
    setErrorText(""); // 第62天：清空旧错误。
    try { // 第62天：捕获 API 错误。
      const res = await fetch("/api/storage"); // 第62天：请求对象存储快照。
      const data = await readApiData<StorageSnapshot>(res); // 第62天：解析成功响应。
      setSnapshot(data); // 第62天：写入快照状态。
    } catch (err) { // 第62天：处理刷新失败。
      setErrorText(err instanceof Error ? err.message : "加载对象存储失败"); // 第62天：展示错误消息。
    } finally { // 第62天：无论成功失败都退出加载状态。
      setLoading(false); // 第62天：结束加载状态。
    } // 第62天：结束 finally。
  }, []); // 第62天：刷新函数无外部依赖。

  useEffect(() => { // 第62天：组件挂载后自动加载快照。
    const timer = window.setTimeout(() => void refresh(), 0); // 第62天：延迟触发首次刷新，避免 effect 主体同步 setState。
    return () => window.clearTimeout(timer); // 第62天：组件卸载时清理首次刷新定时器。
  }, [refresh]); // 第62天：依赖稳定刷新函数。

  async function runAction(action: "upload-demo" | "workspace-export" | "trace-attachment", content?: string) { // 第62天：触发对象存储演示链路。
    setLoading(true); // 第62天：进入加载状态。
    setErrorText(""); // 第62天：清空旧错误。
    try { // 第62天：捕获操作失败。
      const res = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, content }) }); // 第62天：发送对象存储动作请求。
      const data = await readApiData<StorageActionResult>(res); // 第62天：解析动作响应。
      setSnapshot(data.snapshot ?? (data as StorageSnapshot)); // 第62天：写入返回快照。
    } catch (err) { // 第62天：处理动作失败。
      setErrorText(err instanceof Error ? err.message : "对象存储操作失败"); // 第62天：展示错误消息。
    } finally { // 第62天：无论成功失败都退出加载状态。
      setLoading(false); // 第62天：结束加载状态。
    } // 第62天：结束 finally。
  } // 第62天：结束 runAction 方法。

  async function deleteObject(bucket: string, objectKey: string) { // 第62天：删除指定对象。
    setLoading(true); // 第62天：进入加载状态。
    setErrorText(""); // 第62天：清空旧错误。
    try { // 第62天：捕获删除失败。
      const res = await fetch("/api/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", bucket, objectKey }) }); // 第62天：发送删除请求。
      const data = await readApiData<StorageSnapshot>(res); // 第62天：解析删除后的快照。
      setSnapshot(data); // 第62天：更新对象列表。
    } catch (err) { // 第62天：处理删除失败。
      setErrorText(err instanceof Error ? err.message : "删除对象失败"); // 第62天：展示错误消息。
    } finally { // 第62天：无论成功失败都退出加载状态。
      setLoading(false); // 第62天：结束加载状态。
    } // 第62天：结束 finally。
  } // 第62天：结束 deleteObject 方法。

  async function copyUrl(url: string) { // 第62天：复制对象 URL。
    await navigator.clipboard?.writeText(url); // 第62天：把 URL 写入剪贴板。
  } // 第62天：结束 copyUrl 方法。

  const metrics = snapshot?.metrics; // 第62天：读取对象存储指标。
  const objects = snapshot?.objects ?? []; // 第62天：读取对象列表，未加载时使用空数组。

  return ( // 第62天：返回 Storage Explorer 视图。
    <section className="space-y-3"> {/* 第62天：定义面板整体间距。 */}
      <div className="rounded-lg border border-teal-200/80 bg-teal-50/70 px-3 py-3 dark:border-teal-900/50 dark:bg-teal-950/20"> {/* 第62天：定义对象存储概览区域。 */}
        <div className="flex items-start justify-between gap-3"> {/* 第62天：排列标题和刷新按钮。 */}
          <div> {/* 第62天：定义标题文案容器。 */}
            <h2 className="text-sm font-semibold text-teal-950 dark:text-teal-100">Storage Explorer（对象存储浏览器）</h2> {/* 第62天：展示面板标题。 */}
            <p className="mt-1 text-xs leading-relaxed text-teal-800/80 dark:text-teal-200/80">Day 62：Object Storage（对象存储）统一管理 Knowledge、Workspace Export 与 Trace Attachment。</p> {/* 第62天：展示对象存储主题说明。 */}
          </div> {/* 第62天：结束标题文案容器。 */}
          <button type="button" disabled={loading} onClick={() => void refresh()} className="shrink-0 rounded-md border border-teal-300 bg-white px-2 py-1 text-[11px] font-semibold text-teal-800 disabled:opacity-50 dark:border-teal-800 dark:bg-zinc-950/50 dark:text-teal-100">刷新</button> {/* 第62天：刷新快照按钮。 */}
        </div> {/* 第62天：结束标题行。 */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3"> {/* 第62天：定义指标网格。 */}
          <Metric label="provider" value={snapshot?.provider ?? "loading"} /> {/* 第62天：展示 Provider 类型。 */}
          <Metric label="bucket" value={snapshot?.bucket ?? "-"} /> {/* 第62天：展示默认 Bucket。 */}
          <Metric label="objects" value={String(metrics?.totalObjects ?? 0)} /> {/* 第62天：展示对象总数。 */}
          <Metric label="size" value={`${formatSize(metrics?.totalSize ?? 0)}`} /> {/* 第62天：展示对象总大小。 */}
          <Metric label="uploads" value={String(metrics?.uploadCount ?? 0)} /> {/* 第62天：展示上传次数。 */}
          <Metric label="avg upload" value={`${metrics?.avgUploadTime ?? 0}ms`} /> {/* 第62天：展示平均上传耗时。 */}
        </div> {/* 第62天：结束指标网格。 */}
        {errorText ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{errorText}</p> : null} {/* 第62天：按需展示错误提示。 */}
      </div> {/* 第62天：结束对象存储概览区域。 */}
      <div className="grid grid-cols-3 gap-2"> {/* 第62天：定义演示动作按钮区。 */}
        <button type="button" disabled={loading} onClick={() => void runAction("upload-demo", "Day62 Knowledge PDF upload chain demo")} className="rounded-md bg-teal-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">上传</button> {/* 第62天：触发通用上传演示。 */}
        <button type="button" disabled={loading} onClick={() => void runAction("workspace-export")} className="rounded-md bg-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">导出</button> {/* 第62天：触发 Workspace Export 演示。 */}
        <button type="button" disabled={loading} onClick={() => void runAction("trace-attachment")} className="rounded-md bg-amber-600 px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">附件</button> {/* 第62天：触发 Trace Attachment 演示。 */}
      </div> {/* 第62天：结束演示动作按钮区。 */}
      <ul className="max-h-[36rem] space-y-2 overflow-y-auto pr-1"> {/* 第62天：定义对象列表。 */}
        {objects.length === 0 ? ( // 第62天：判断当前是否没有对象。
          <li className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700">暂无对象；点击上传、导出或附件生成 Day62 测试对象。</li> // 第62天：展示空状态。
        ) : ( // 第62天：存在对象时展示列表。
          objects.map((object) => { // 第62天：遍历对象摘要。
            const url = object.signedUrl || `/api/storage/object?bucket=${encodeURIComponent(object.bucket)}&objectKey=${encodeURIComponent(object.objectKey)}`; // 第62天：生成预览和复制用 URL。
            return ( // 第62天：返回单个对象列表项。
              <li key={`${object.bucket}/${object.objectKey}`} className="rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-[10px] shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"> {/* 第62天：定义对象卡片。 */}
                <p className="break-all font-mono font-semibold text-zinc-950 dark:text-zinc-50">{object.objectKey}</p> {/* 第62天：展示对象键。 */}
                <p className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">bucket: {object.bucket} · type: {object.type} · size: {formatSize(object.size)}</p> {/* 第62天：展示 Bucket、类型和大小。 */}
                <p className="mt-1 font-mono text-zinc-500 dark:text-zinc-400">etag: {object.etag.slice(0, 16)} · {new Date(object.lastModified).toLocaleString("zh-CN")}</p> {/* 第62天：展示 ETag 和最后修改时间。 */}
                <div className="mt-2 flex flex-wrap gap-1.5"> {/* 第62天：定义对象操作按钮区。 */}
                  <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 font-semibold text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-100">Preview</a> {/* 第62天：对象预览链接。 */}
                  <button type="button" onClick={() => void copyUrl(url)} className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">Copy URL</button> {/* 第62天：复制对象 URL。 */}
                  <button type="button" disabled={loading} onClick={() => void deleteObject(object.bucket, object.objectKey)} className="rounded-md border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">Delete</button> {/* 第62天：删除对象。 */}
                </div> {/* 第62天：结束对象操作按钮区。 */}
              </li> // 第62天：结束对象列表项。
            ); // 第62天：结束 return。
          }) // 第62天：结束对象遍历。
        )} {/* 第62天：结束对象列表条件渲染。 */}
      </ul> {/* 第62天：结束对象列表。 */}
    </section> // 第62天：结束面板。
  ); // 第62天：结束组件返回。
} // 第62天：结束 StorageExplorer 组件。

function Metric({ label, value }: { label: string; value: string }) { // 第62天：定义小型指标卡组件。
  return ( // 第62天：返回指标卡。
    <div className="rounded-md border border-teal-200/70 bg-white/75 px-2 py-1.5 dark:border-teal-900/40 dark:bg-zinc-950/30"> {/* 第62天：定义指标卡外观。 */}
      <p className="font-mono text-[9px] uppercase text-teal-700/70 dark:text-teal-300/70">{label}</p> {/* 第62天：展示指标标签。 */}
      <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-teal-950 dark:text-teal-50">{value}</p> {/* 第62天：展示指标值。 */}
    </div> // 第62天：结束指标卡。
  ); // 第62天：结束 Metric 返回。
} // 第62天：结束 Metric 组件。

function formatSize(size: number): string { // 第62天：格式化对象大小。
  if (size < 1024) return `${size} B`; // 第62天：小于 1KB 时显示字节。
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; // 第62天：小于 1MB 时显示 KB。
  return `${(size / 1024 / 1024).toFixed(1)} MB`; // 第62天：其余显示 MB。
} // 第62天：结束 formatSize 函数。

