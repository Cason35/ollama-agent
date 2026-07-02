"use client"; /* 第57天：声明 Header 为客户端组件，便于展示运行状态徽标。 */
import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store"; /* 第57天：引入工作流存储模式类型。 */
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types"; /* 第57天：引入工作流历史摘要类型。 */
type HeaderProps = { /* 第57天：定义页头组件属性。 */
  provider: "local" | "mimo"; /* 第57天：保存当前模型提供方。 */
  useWorkflow: boolean; /* 第57天：保存是否启用 Workflow 模式。 */
  storageMode: WorkflowStorageMode; /* 第57天：保存当前工作流存储模式。 */
  restoredFromDisk: boolean; /* 第57天：保存是否已从本地恢复历史。 */
  workflowHistory: WorkflowStateListItem[]; /* 第57天：保存工作流历史摘要列表。 */
}; /* 第57天：结束页头组件属性定义。 */
const day58Description = "第58天：Production Infrastructure V1（生产基础设施第1版）。系统接入 Redis（内存数据结构存储 / 共享状态中心），把 Semantic Cache 从单进程内存推进到可共享的 RedisCacheStore，并展示健康检查、Key、TTL、Metrics 与 Redis Operation Trace。"; /* 第58天：定义页头说明文案。 */
export function Header({ provider, useWorkflow, storageMode, restoredFromDisk, workflowHistory }: HeaderProps) { /* 第57天：定义主页面页头组件。 */
  const hasPausedWorkflow = workflowHistory.some((item) => item.status === "paused"); /* 第57天：判断是否存在可恢复的暂停工作流。 */
  return ( /* 第57天：返回页头视图。 */
    <header className="shrink-0"> {/* 第57天：定义页头外层容器。 */}
      <div className="flex min-h-[72px] flex-col justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85 sm:flex-row sm:items-center"> {/* 第57天：定义页头内容卡片。 */}
        <div className="flex min-w-0 items-center gap-3"> {/* 第57天：排列日期徽标和标题区域。 */}
          <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-950 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-950"> {/* 第57天：定义 Day 编号徽标。 */}
            <span className="text-[9px] font-semibold uppercase leading-none text-white/65 dark:text-zinc-500">Day</span> {/* 第57天：展示 Day 标签。 */}
            <span className="mt-0.5 font-mono text-lg font-black leading-none">58</span> {/* 第58天：展示当前项目日编号。 */}
          </div> {/* 第57天：结束 Day 编号徽标。 */}
          <div className="min-w-0"> {/* 第57天：定义标题文本容器。 */}
            <div className="flex items-center gap-2"> {/* 第57天：排列能力标签和说明按钮。 */}
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">Production Infrastructure V1</p> {/* 第58天：展示顶部能力标签。 */}
              <div className="group relative z-20"> {/* 第57天：定义说明浮层容器。 */}
                <button type="button" aria-label="查看第58天说明" className="flex size-6 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 font-mono text-[11px] font-bold text-cyan-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 dark:border-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-200">i</button> {/* 第58天：展示说明按钮。 */}
                <div className="pointer-events-none absolute left-0 top-8 hidden w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-xl shadow-zinc-900/12 group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{day58Description}</div> {/* 第58天：展示悬浮说明文案。 */}
              </div> {/* 第57天：结束说明浮层容器。 */}
            </div> {/* 第57天：结束能力标签和说明按钮布局。 */}
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">Redis Production Infrastructure <span className="ml-2 text-zinc-500 dark:text-zinc-400">Redis 生产基础设施</span></h1> {/* 第58天：展示主标题和中文副标题。 */}
          </div> {/* 第57天：结束标题文本容器。 */}
        </div> {/* 第57天：结束日期徽标和标题区域。 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"> {/* 第57天：排列右侧状态徽标。 */}
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{provider === "local" ? "本地推理" : "云端 MiMo"}</span> {/* 第57天：展示模型提供方状态。 */}
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">Storage: {storageMode}</span> {/* 第57天：展示当前存储模式。 */}
          {useWorkflow ? <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">Workflow 开</span> : null} {/* 第57天：按需展示 Workflow 启用状态。 */}
          {restoredFromDisk && hasPausedWorkflow ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">有暂停任务</span> : null} {/* 第57天：按需展示暂停任务提示。 */}
        </div> {/* 第57天：结束右侧状态徽标。 */}
      </div> {/* 第57天：结束页头内容卡片。 */}
    </header> /* 第57天：结束页头外层容器。 */
  ); /* 第57天：结束页头返回。 */
} /* 第57天：结束主页面页头组件。 */
