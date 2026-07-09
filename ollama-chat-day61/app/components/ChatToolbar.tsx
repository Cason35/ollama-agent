"use client"; // 聊天工具栏包含受控表单控件

import type { ChangeEvent, Dispatch, SetStateAction } from "react"; // 引入事件和 setter 类型
import { MIMO_MODEL_OPTIONS } from "@/lib/model/mimo-models"; // 引入 MiMo 模型下拉选项
import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store"; // 引入存储模式类型

/** 聊天顶部工具栏参数。 */
type ChatToolbarProps = {
  useWorkflow: boolean; // 是否启用多步工作流
  setUseWorkflow: Dispatch<SetStateAction<boolean>>; // 工作流开关 setter
  loading: boolean; // 是否正在请求
  provider: "local" | "mimo"; // 当前模型提供方
  setProvider: Dispatch<SetStateAction<"local" | "mimo">>; // 模型提供方 setter
  mimoModel: string; // 当前 MiMo 模型
  setMimoModel: Dispatch<SetStateAction<string>>; // MiMo 模型 setter
  storageMode: WorkflowStorageMode; // 当前存储模式
  handleStorageModeChange: (mode: WorkflowStorageMode) => void; // 存储模式切换动作
};

/** 主聊天区顶部的 Workflow / Provider / Storage 控制栏。 */
export function ChatToolbar({
  useWorkflow,
  setUseWorkflow,
  loading,
  provider,
  setProvider,
  mimoModel,
  setMimoModel,
  storageMode,
  handleStorageModeChange,
}: ChatToolbarProps) {
  const selectFieldClass =
    "h-9 rounded-md border-0 bg-white px-3 text-sm text-zinc-800 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:bg-zinc-950/40 dark:text-zinc-100 dark:ring-zinc-700"; // 下拉控件统一样式

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/80 bg-zinc-50/70 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/70">
      <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-md bg-white px-3 text-sm text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950/40 dark:text-zinc-300 dark:ring-zinc-700">
        <input
          type="checkbox"
          className="size-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
          checked={useWorkflow}
          onChange={(e) => setUseWorkflow(e.target.checked)}
          disabled={loading}
        />
        多步 Workflow（工作流）
      </label>

      <div className="hidden h-6 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" aria-hidden />

      <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">后端</span>
        <select
          className={selectFieldClass}
          value={provider}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setProvider(e.target.value === "mimo" ? "mimo" : "local")}
          disabled={loading}
        >
          <option value="local">Ollama</option>
          <option value="mimo">小米 MiMo</option>
        </select>
      </label>

      {provider === "mimo" ? (
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-zinc-600 sm:max-w-[280px] dark:text-zinc-400">
          <span className="shrink-0 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">模型</span>
          <select
            className={`${selectFieldClass} min-w-0 flex-1 truncate`}
            value={mimoModel}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setMimoModel(e.target.value)}
            disabled={loading}
          >
            {MIMO_MODEL_OPTIONS.map(({ apiId, label }) => (
              <option key={apiId} value={apiId}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="hidden h-6 w-px bg-zinc-200 dark:bg-zinc-700 sm:block" aria-hidden />

      <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">Storage</span>
        <select
          className={selectFieldClass}
          value={storageMode}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            handleStorageModeChange(e.target.value === "backend" ? "backend" : "local")
          }
          disabled={loading}
        >
          <option value="local">local（本地）</option>
          <option value="backend">backend（后端）</option>
        </select>
      </label>
    </div>
  );
}

