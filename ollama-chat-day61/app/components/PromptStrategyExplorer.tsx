import type { PromptDashboardSnapshot } from "@/lib/prompts/prompt-types"; /* 第55天：引入 Prompt Dashboard 快照类型，用于读取优化预览。 */
type PromptStrategyExplorerProps = { snapshot: PromptDashboardSnapshot }; /* 第55天：定义策略浏览器组件属性。 */
function strategyLabel(strategy: string): string { /* 第55天：定义策略英文值到中文标签的转换函数。 */
  if (strategy === "fast") return "Fast（快速）"; /* 第55天：快速策略标签。 */
  if (strategy === "quality") return "Quality（质量优先）"; /* 第55天：质量策略标签。 */
  return "Balanced（平衡）"; /* 第55天：默认返回平衡策略标签。 */
} /* 第55天：结束策略标签转换函数。 */
function formatCost(value: number): string { /* 第55天：定义成本格式化函数。 */
  return `$${value.toFixed(6)}`; /* 第55天：用 6 位小数展示估算成本。 */
} /* 第55天：结束成本格式化函数。 */
export function PromptStrategyExplorer({ snapshot }: PromptStrategyExplorerProps) { /* 第55天：定义 Prompt Strategy Explorer 前端组件。 */
  const preview = snapshot.optimizationPreview; /* 第55天：读取后端生成的动态优化预览。 */
  return ( /* 第55天：返回策略浏览器视图。 */
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/70 p-2.5 text-[10px] text-cyan-950 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-cyan-100"> {/* 第55天：定义策略浏览器外层卡片。 */}
      <div className="flex flex-wrap items-start justify-between gap-2"> {/* 第55天：排列标题区和上下文摘要。 */}
        <div> {/* 第55天：定义标题文本区域。 */}
          <p className="text-[11px] font-semibold">Prompt Strategy Explorer（提示词策略浏览器）</p> {/* 第55天：展示策略浏览器标题。 */}
          <p className="mt-1 text-[9px] leading-relaxed text-cyan-800 dark:text-cyan-200">Day 58：在 Redis Production Infrastructure 中继续为 RuntimeDecision 选择 Fast、Balanced、Quality 或 JSON PromptBlock。</p> {/* 第58天：说明本区展示运行时决策提示词优化能力。 */}
        </div> {/* 第55天：结束标题文本区域。 */}
        <span className="rounded-full bg-white/75 px-2 py-1 font-mono text-[9px] font-semibold text-cyan-800 dark:bg-zinc-950/30 dark:text-cyan-200">{preview.context.taskType} / {preview.context.complexity}</span> {/* 第55天：展示当前优化上下文的任务类型与复杂度。 */}
      </div> {/* 第55天：结束标题区和上下文摘要布局。 */}
      <div className="mt-2 grid grid-cols-4 gap-1 text-center"> {/* 第55天：定义优化器指标网格。 */}
        <div className="rounded bg-white/75 p-1.5 dark:bg-zinc-950/30"><p className="text-[8px] text-cyan-700">Avg Len</p><p className="font-mono text-[10px] font-semibold">{preview.metrics.avgPromptLength}</p></div> {/* 第55天：展示平均提示词长度。 */}
        <div className="rounded bg-white/75 p-1.5 dark:bg-zinc-950/30"><p className="text-[8px] text-cyan-700">Avg Blocks</p><p className="font-mono text-[10px] font-semibold">{preview.metrics.avgBlocks}</p></div> {/* 第55天：展示平均启用块数量。 */}
        <div className="rounded bg-white/75 p-1.5 dark:bg-zinc-950/30"><p className="text-[8px] text-cyan-700">Opt Time</p><p className="font-mono text-[10px] font-semibold">{preview.metrics.avgOptimizationTime}ms</p></div> {/* 第55天：展示平均优化耗时。 */}
        <div className="rounded bg-white/75 p-1.5 dark:bg-zinc-950/30"><p className="text-[8px] text-cyan-700">Hit Rate</p><p className="font-mono text-[10px] font-semibold">{Math.round(preview.metrics.recommendationHitRate * 100)}%</p></div> {/* 第55天：展示推荐命中率。 */}
      </div> {/* 第55天：结束优化器指标网格。 */}
      <div className="mt-2 grid gap-1.5 lg:grid-cols-3"> {/* 第55天：定义三种策略对比网格。 */}
        {preview.strategyPreviews.map((strategy) => ( /* 第55天：遍历每个策略预览。 */
          <div key={strategy.strategy} className="rounded bg-white/80 p-2 dark:bg-zinc-950/30"> {/* 第55天：定义单个策略卡片。 */}
            <div className="flex items-center justify-between gap-2"> {/* 第55天：排列策略名和成本。 */}
              <p className="font-semibold">{strategyLabel(strategy.strategy)}</p> {/* 第55天：展示策略名称。 */}
              <span className="font-mono text-[8px]">{formatCost(strategy.estimatedCost)}</span> {/* 第55天：展示策略估算成本。 */}
            </div> {/* 第55天：结束策略名和成本布局。 */}
            <p className="mt-1 font-mono text-[8px] text-cyan-700 dark:text-cyan-200">tokens {strategy.estimatedTokens} · blocks {strategy.enabledBlockIds.length}</p> {/* 第55天：展示估算 token 和启用块数量。 */}
            <div className="mt-1 flex flex-wrap gap-1"> {/* 第55天：定义启用块标签容器。 */}
              {strategy.enabledBlockIds.map((blockId) => <span key={blockId} className="rounded bg-cyan-100 px-1.5 py-0.5 font-mono text-[8px] text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100">{blockId}</span>)} {/* 第55天：逐个展示该策略启用的提示词块。 */}
            </div> {/* 第55天：结束启用块标签容器。 */}
          </div> /* 第55天：结束单个策略卡片。 */
        ))} {/* 第55天：结束策略预览遍历。 */}
      </div> {/* 第55天：结束三种策略对比网格。 */}
      <div className="mt-2 rounded bg-white/80 p-2 dark:bg-zinc-950/30"> {/* 第55天：定义推荐列表区域。 */}
        <p className="font-semibold">Prompt Recommendation（提示词推荐）</p> {/* 第55天：展示推荐区标题。 */}
        <ul className="mt-1 space-y-1"> {/* 第55天：定义推荐列表。 */}
          {preview.selectedResult.recommendations.map((recommendation) => <li key={recommendation.id} className="rounded bg-cyan-100/70 px-2 py-1 text-[9px] leading-relaxed text-cyan-950 dark:bg-cyan-900/40 dark:text-cyan-100">{recommendation.message}</li>)} {/* 第55天：逐条展示优化器推荐。 */}
        </ul> {/* 第55天：结束推荐列表。 */}
      </div> {/* 第55天：结束推荐列表区域。 */}
      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-white p-2 font-mono text-[9px] leading-relaxed text-cyan-900 dark:bg-zinc-900 dark:text-cyan-100">{preview.buildPreview.text}</pre> {/* 第55天：展示质量优先策略生成的动态提示词预览。 */}
    </div> /* 第55天：结束策略浏览器外层卡片。 */
  ); /* 第55天：结束策略浏览器返回。 */
} /* 第55天：结束 Prompt Strategy Explorer 组件。 */
