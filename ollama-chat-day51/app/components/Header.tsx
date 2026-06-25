"use client";

import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store";
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types";

type HeaderProps = {
  provider: "local" | "mimo";
  useWorkflow: boolean;
  storageMode: WorkflowStorageMode;
  restoredFromDisk: boolean;
  workflowHistory: WorkflowStateListItem[];
};

const day51Description =
  "第51天：在 ModelRouter（模型路由器）基础上加入 ModelExecutor（模型执行器）、Fallback Chain（备用模型链）与 Circuit Breaker（熔断器）。当主模型超时或失败时自动尝试备用模型；当某个模型连续失败时暂时熔断并避开它；冷却后进入 half-open（半开）试探恢复，同时在 Usage（用量）与 Model Health Dashboard（模型健康仪表盘）中展示 fallbackUsed、fallbackChain、successRate 和 lastFailureAt。";

export function Header({
  provider,
  useWorkflow,
  storageMode,
  restoredFromDisk,
  workflowHistory,
}: HeaderProps) {
  const hasPausedWorkflow = workflowHistory.some((item) => item.status === "paused");

  return (
    <header className="shrink-0">
      <div className="flex min-h-[72px] flex-col justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-950 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-950">
            <span className="text-[9px] font-semibold uppercase leading-none text-white/65 dark:text-zinc-500">Day</span>
            <span className="mt-0.5 font-mono text-lg font-black leading-none">51</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                Advanced Optimization V4
              </p>
              <div className="group relative z-20">
                <button
                  type="button"
                  aria-label="查看第51天说明"
                  className="flex size-6 items-center justify-center rounded-full border border-violet-200 bg-violet-50 font-mono text-[11px] font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                >
                  i
                </button>
                <div className="pointer-events-none absolute left-0 top-8 hidden w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-xl shadow-zinc-900/12 group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  {day51Description}
                </div>
              </div>
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">
              Resilient Multi-Model Runtime
              <span className="ml-2 text-zinc-500 dark:text-zinc-400">具备容错能力的多模型运行时</span>
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {provider === "local" ? "本地推理" : "云端 MiMo"}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Storage: {storageMode}
          </span>
          {useWorkflow ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
              Workflow 开
            </span>
          ) : null}
          {restoredFromDisk && hasPausedWorkflow ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              有暂停任务
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
