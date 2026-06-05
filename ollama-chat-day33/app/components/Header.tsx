"use client"; // 当前组件需要接收客户端状态并渲染动态徽标

import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store"; // 引入存储模式类型
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types"; // 引入工作流历史摘要类型

/** 顶部标题区组件参数。 */
type HeaderProps = {
  provider: "local" | "mimo"; // 当前模型提供方
  useWorkflow: boolean; // 是否开启 Workflow 模式
  storageMode: WorkflowStorageMode; // 当前 Workflow 存储模式
  restoredFromDisk: boolean; // 是否完成过本地恢复
  workflowHistory: WorkflowStateListItem[]; // 历史工作流列表
};

/** 顶部项目说明与状态徽标。 */
export function Header({
  provider,
  useWorkflow,
  storageMode,
  restoredFromDisk,
  workflowHistory,
}: HeaderProps) {
  const hasPausedWorkflow = workflowHistory.some((h) => h.status === "paused"); // 判断是否存在暂停工作流

  return (
    <header className="shrink-0 border-b border-zinc-200/70 pb-5 dark:border-zinc-800/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-violet-600 dark:text-violet-400">
            Day 33
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Queue Runtime V3 · Priority Queue + Scheduling
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            第33天：在 day32 的 Queue Runtime V2 基础上升级 Queue Runtime V3，支持 priority 优先级、scheduledAt 定时调度、
            Reminder Job、Scheduler Timeline 与 Priority Metrics，同时保留 retry / backoff / DLQ。侧栏仍可 Import 笔记、观察向量写入并调试检索；需
            Ollama{" "}
            <code className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              nomic-embed-text
            </code>
            。继承 Workflow / HITL / Storage（local·MySQL）与 MiMo，配置见{" "}
            <code className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              .env.local
            </code>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/80 backdrop-blur dark:bg-zinc-900/80 dark:text-zinc-300 dark:ring-zinc-700">
            {provider === "local" ? "本地推理" : "云端 MiMo"}
          </span>
          {useWorkflow ? (
            <span className="inline-flex items-center rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-500/25 dark:text-violet-200">
              Workflow 开
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200">
            Storage: {storageMode}
          </span>
          {restoredFromDisk && hasPausedWorkflow ? (
            <span className="inline-flex items-center rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-500/25 dark:text-sky-200">
              已从存储恢复暂停 Workflow
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

