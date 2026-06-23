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
            Day 49 {/* 第49天：更新页面顶部日期标记。 */}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Advanced Optimization V2（高级优化第2版） · Long-Term Memory V2（长期记忆第2版） {/* 第49天：更新页面主标题。 */}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            第49天：通过 MemoryItemV2（记忆条目第2版）、LongTermMemoryStore（长期记忆存储）、Experience Extraction（经验提取）让 Agent（智能体）从过去几十次任务中学习；执行 Research Agent（研究智能体）时把 Prompt（提示词）升级为 Prompt + Long-Term Experience（长期经验），并用 Memory Consolidation（记忆整合）、Importance Decay（重要性衰减）、Memory Retrieval V2（综合打分检索：0.5 语义 + 0.3 重要性 + 0.2 新近度）与 Memory Metrics（记忆指标）量化经验记忆。 {/* 第49天：说明长期记忆运行时闭环。 */}
            Day 48 的 Semantic Cache（语义缓存）、Usage &amp; Cost Observability（用量与成本可观测性）、Continuous Evaluation（持续评估）、Queue（队列）、Workflow（工作流）、RAG（检索增强生成）、Tool Registry（工具注册表）、WorkerPool（工作线程池）与 Quality Gate（质量门禁）继续保留；需 {/* 第49天：说明继承的原有业务能力。 */}
            Ollama{" "}
            <code className="rounded-md bg-zinc-200/70 px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              nomic-embed-text
            </code>
            。继承 Workflow（工作流）/ HITL（人在回路确认）/ Storage（存储，local·MySQL）与 MiMo，配置见{" "}
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
              Workflow（工作流）开
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200">
            Storage（存储）: {storageMode}
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

