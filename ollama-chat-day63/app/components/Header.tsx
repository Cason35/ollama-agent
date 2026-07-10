"use client"; // 第62天：声明 Header 是客户端组件，便于展示交互状态徽标。
import type { WorkflowStorageMode } from "@/lib/workflow/workflow-store"; // 第62天：引入工作流存储模式类型。
import type { WorkflowStateListItem } from "@/lib/workflow/workflow-types"; // 第62天：引入工作流历史摘要类型。

type HeaderProps = { // 第62天：定义页头组件参数类型。
  provider: "local" | "mimo"; // 第62天：保存当前模型提供方。
  useWorkflow: boolean; // 第62天：保存是否启用 Workflow 模式。
  storageMode: WorkflowStorageMode; // 第62天：保存当前工作流存储模式。
  restoredFromDisk: boolean; // 第62天：保存是否已恢复历史工作流。
  workflowHistory: WorkflowStateListItem[]; // 第62天：保存工作流历史摘要列表。
}; // 第62天：结束页头组件参数类型。

const day63Description = "第63天：Production Infrastructure V6（生产基础设施第6版）。系统新增 Secrets Management（密钥管理），通过 SecretItem、SecretProvider、SecretsManager、AES-256-GCM 加密、Secret Rotation、Secret Masking 和 Secrets Explorer 隔离、加密、轮换并脱敏所有敏感凭证。"; // 第63天：定义页头说明文案。

export function Header({ provider, useWorkflow, storageMode, restoredFromDisk, workflowHistory }: HeaderProps) { // 第62天：定义主页面页头组件。
  const hasPausedWorkflow = workflowHistory.some((item) => item.status === "paused"); // 第62天：判断是否存在可恢复的暂停工作流。
  return ( // 第62天：返回页头视图。
    <header className="shrink-0"> {/* 第62天：定义页头外层容器。 */}
      <div className="flex min-h-[72px] flex-col justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white/90 px-4 py-3 shadow-sm shadow-zinc-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/85 sm:flex-row sm:items-center"> {/* 第62天：定义页头内容卡片。 */}
        <div className="flex min-w-0 items-center gap-3"> {/* 第62天：排列日期徽标和标题区域。 */}
          <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-950 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-950"> {/* 第62天：定义 Day 编号徽标。 */}
            <span className="text-[9px] font-semibold uppercase leading-none text-white/65 dark:text-zinc-500">Day</span> {/* 第62天：展示 Day 标签。 */}
            <span className="mt-0.5 font-mono text-lg font-black leading-none">63</span> {/* 第63天：展示当前项目日编号。 */}
          </div> {/* 第62天：结束 Day 编号徽标。 */}
          <div className="min-w-0"> {/* 第62天：定义标题文本容器。 */}
            <div className="flex items-center gap-2"> {/* 第62天：排列能力标签和说明按钮。 */}
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">Production Infrastructure V6</p> {/* 第63天：展示顶部能力标签。 */}
              <div className="group relative z-20"> {/* 第62天：定义说明浮层容器。 */}
                <button type="button" aria-label="查看第63天说明" className="flex size-6 items-center justify-center rounded-full border border-rose-200 bg-rose-50 font-mono text-[11px] font-bold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">i</button> {/* 第63天：展示说明按钮。 */}
                <div className="pointer-events-none absolute left-0 top-8 hidden w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-xl shadow-zinc-900/12 group-hover:block group-focus-within:block dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{day63Description}</div> {/* 第63天：展示悬浮说明文案。 */}
              </div> {/* 第62天：结束说明浮层容器。 */}
            </div> {/* 第62天：结束能力标签和说明按钮布局。 */}
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-2xl">Secrets Management <span className="ml-2 text-zinc-500 dark:text-zinc-400">密钥管理</span></h1> {/* 第63天：展示主标题和中文副标题。 */}
          </div> {/* 第62天：结束标题文本容器。 */}
        </div> {/* 第62天：结束日期徽标和标题区域。 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"> {/* 第62天：排列右侧状态徽标。 */}
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">{provider === "local" ? "本地推理" : "云端 MiMo"}</span> {/* 第62天：展示模型提供方状态。 */}
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">Workflow Store: {storageMode}</span> {/* 第62天：展示当前工作流存储模式。 */}
          {useWorkflow ? <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">Workflow 开</span> : null} {/* 第62天：按需展示 Workflow 启用状态。 */}
          {restoredFromDisk && hasPausedWorkflow ? <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">有暂停任务</span> : null} {/* 第62天：按需展示暂停任务提示。 */}
        </div> {/* 第62天：结束右侧状态徽标。 */}
      </div> {/* 第62天：结束页头内容卡片。 */}
    </header> /* 第62天：结束页头外层容器。 */
  ); // 第62天：结束页头返回。
} // 第62天：结束 Header 组件。

