"use client"; // 侧栏包含输入框、按钮和动态列表，需要客户端渲染

import type { Dispatch, SetStateAction } from "react"; // 引入 React 状态 setter 类型
import type { KnowledgeMetricsSnapshot, QueryRewriteDebug, RetrievalMode, RetrievedChunkHit } from "@/lib/knowledge-types"; // 引入 RAG 类型
import type { ToolDescriptor, ToolMetricsSnapshot } from "@/lib/tool-registry"; // 引入工具描述与指标类型
import type { WorkflowStorageMode } from "@/lib/workflow-store"; // 引入工作流存储模式类型
import type { WorkflowStateListItem } from "@/lib/workflow-types"; // 引入工作流历史摘要类型

/** 侧栏展示所需的长期记忆条目。 */
type SidebarMemoryItem = {
  content: string; // 记忆正文
  importance: "high" | "low"; // 记忆重要程度
};

/** 侧栏展示所需的记忆结构。 */
type SidebarMemory = {
  shortTerm: unknown[]; // 短期消息只需要数量
  items: SidebarMemoryItem[]; // 长期记忆条目
};

/** KnowledgeSidebar 组件参数。 */
type KnowledgeSidebarProps = {
  registeredTools: ToolDescriptor[]; // 已注册工具列表
  toolMetrics: Record<string, ToolMetricsSnapshot>; // 工具运行指标
  knowledgeMetrics: KnowledgeMetricsSnapshot | null; // 知识库指标
  knowledgeImportTitle: string; // 导入知识标题
  setKnowledgeImportTitle: Dispatch<SetStateAction<string>>; // 标题 setter
  knowledgeImportText: string; // 导入知识正文
  setKnowledgeImportText: Dispatch<SetStateAction<string>>; // 正文 setter
  knowledgeLoading: boolean; // 知识库相关请求加载状态
  handleImportKnowledge: () => Promise<void>; // 导入知识动作
  knowledgeDocCount: number; // 已导入文档数
  ragDebugQuery: string; // RAG 调试查询
  setRagDebugQuery: Dispatch<SetStateAction<string>>; // 查询 setter
  ragDebugMode: RetrievalMode; // 检索模式
  setRagDebugMode: Dispatch<SetStateAction<RetrievalMode>>; // 检索模式 setter
  ragDebugRecallK: number; // 召回数量
  setRagDebugRecallK: Dispatch<SetStateAction<number>>; // 召回数量 setter
  ragDebugTopK: number; // 最终返回数量
  setRagDebugTopK: Dispatch<SetStateAction<number>>; // topK setter
  ragDebugMinScore: number; // 最低分阈值
  setRagDebugMinScore: Dispatch<SetStateAction<number>>; // 最低分 setter
  handleRagDebugRetrieve: () => Promise<void>; // 手动检索动作
  ragDebugHits: RetrievedChunkHit[]; // 最近检索结果
  ragDebugRewrite: QueryRewriteDebug | null; // 第28天：Query Rewrite 调试信息
  storageMode: WorkflowStorageMode; // 当前存储模式
  workflowHistory: WorkflowStateListItem[]; // 工作流历史
  handleRestoreWorkflowFromHistory: (workflowId: string) => void; // 恢复历史工作流动作
  memory: SidebarMemory; // 记忆数据
};

/** 右侧工具、知识库、RAG 调试、历史和记忆侧栏。 */
export function KnowledgeSidebar({
  registeredTools,
  toolMetrics,
  knowledgeMetrics,
  knowledgeImportTitle,
  setKnowledgeImportTitle,
  knowledgeImportText,
  setKnowledgeImportText,
  knowledgeLoading,
  handleImportKnowledge,
  knowledgeDocCount,
  ragDebugQuery,
  setRagDebugQuery,
  ragDebugMode,
  setRagDebugMode,
  ragDebugRecallK,
  setRagDebugRecallK,
  ragDebugTopK,
  setRagDebugTopK,
  ragDebugMinScore,
  setRagDebugMinScore,
  handleRagDebugRetrieve,
  ragDebugHits,
  ragDebugRewrite,
  storageMode,
  workflowHistory,
  handleRestoreWorkflowFromHistory,
  memory,
}: KnowledgeSidebarProps) {
  return (
    <aside className="flex min-h-[260px] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/70 shadow-lg shadow-zinc-900/5 ring-1 ring-white/50 backdrop-blur-md dark:border-zinc-800/90 dark:bg-zinc-900/65 dark:shadow-black/30 dark:ring-zinc-700/40 lg:h-[calc(100dvh-11rem)] lg:w-[300px] xl:w-[320px]">
      <div className="border-b border-emerald-200/70 px-4 py-4 dark:border-emerald-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Tool Explorer</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          第28天：retrieval / ragAnswer（RAG V5：Memory-aware Pipeline + Query Rewrite + Multi-Query + Rerank）。
        </p>
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {registeredTools.length === 0 ? (
            <li className="rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
              加载中或暂无工具…
            </li>
          ) : (
            registeredTools.map((tool) => {
              const m = tool.metrics ?? toolMetrics[tool.name]; // 优先使用工具描述中的指标
              return (
                <li
                  key={tool.name}
                  className="rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-2 text-xs dark:border-emerald-800/50 dark:bg-emerald-950/25"
                >
                  <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-100">{tool.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/90 dark:text-emerald-200/90">
                    {tool.description}
                  </p>
                  {tool.capabilities?.length ? (
                    <p className="mt-1 text-[10px] text-emerald-800/90 dark:text-emerald-200/90">
                      能力: {tool.capabilities.join(", ")}
                    </p>
                  ) : null}
                  {tool.dependencies?.length ? (
                    <div className="mt-1 font-mono text-[10px] text-emerald-700/90 dark:text-emerald-300/90">
                      <p>{tool.name}</p>
                      {tool.dependencies.map((dep) => (
                        <p key={dep} className="pl-3">
                          ├─ {dep}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {tool.subTools?.length ? (
                    <p className="mt-0.5 font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      组合: {tool.subTools.join(" → ")}
                    </p>
                  ) : null}
                  {m ? (
                    <p className="mt-1 font-mono text-[10px] text-amber-800/90 dark:text-amber-200/90">
                      calls: {m.totalCalls}, ok: {m.successCalls}, fail: {m.failedCalls}, avg: {m.avgDurationMs}ms
                    </p>
                  ) : null}
                  {tool.inputSchema ? (
                    <p className="mt-1 font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      in: {JSON.stringify(tool.inputSchema)}
                    </p>
                  ) : null}
                  {tool.outputSchema ? (
                    <p className="font-mono text-[10px] text-emerald-700/80 dark:text-emerald-300/80">
                      out: {JSON.stringify(tool.outputSchema)}
                    </p>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className="border-b border-sky-200/70 px-4 py-4 dark:border-sky-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">RAG 知识库</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          第28天：RAG V5 · Memory-aware Query Rewrite · Pipeline · vector/keyword/hybrid · Rerank。
        </p>
        {knowledgeMetrics ? (
          <p className="mt-2 font-mono text-[10px] text-sky-800/90 dark:text-sky-200/90">
            docs: {knowledgeMetrics.documents}, chunks: {knowledgeMetrics.chunks}, avg size:{" "}
            {knowledgeMetrics.avgChunkSize}, queries:{" "}
            {knowledgeMetrics.retrieval?.queryCount ?? knowledgeMetrics.retrievalCount}, avgTop:{" "}
          {knowledgeMetrics.retrieval?.avgTopScore ?? 0}, noHit: {knowledgeMetrics.retrieval?.noResultCount ?? 0}
            , rewrite: {knowledgeMetrics.queryRewrite?.rewriteCount ?? 0}, avgQ:{" "}
            {knowledgeMetrics.queryRewrite?.avgGeneratedQueries ?? 0}, hitRate:{" "}
            {knowledgeMetrics.queryRewrite?.multiQueryHitRate ?? 0}, improvedTop1:{" "}
            {knowledgeMetrics.queryRewrite?.improvedTop1Count ?? 0}, fallback:{" "}
            {knowledgeMetrics.queryRewrite?.fallbackTriggeredCount ?? 0}, avgMs:{" "}
            {knowledgeMetrics.queryRewrite?.avgRetrievalDurationMs ?? 0}
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-400">指标加载中…</p>
        )}
        <input
          type="text"
          value={knowledgeImportTitle}
          onChange={(e) => setKnowledgeImportTitle(e.target.value)}
          placeholder="标题（可选）"
          className="mt-2 w-full rounded-lg border border-sky-200/80 bg-white/80 px-2 py-1.5 text-xs dark:border-sky-800/50 dark:bg-zinc-950/40"
        />
        <textarea
          value={knowledgeImportText}
          onChange={(e) => setKnowledgeImportText(e.target.value)}
          placeholder="粘贴笔记正文，点击 Import 导入知识库…"
          rows={4}
          className="mt-2 w-full resize-y rounded-lg border border-sky-200/80 bg-white/80 px-2 py-1.5 text-xs leading-relaxed dark:border-sky-800/50 dark:bg-zinc-950/40"
        />
        <button
          type="button"
          disabled={knowledgeLoading}
          onClick={() => void handleImportKnowledge()}
          className="mt-2 w-full rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {knowledgeLoading ? "处理中…" : "Import 导入"}
        </button>
        <p className="mt-2 text-[11px] text-zinc-500">已导入 {knowledgeDocCount} 篇文档</p>
      </div>

      <div className="border-b border-amber-200/70 px-4 py-4 dark:border-amber-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">RAG Debug Panel</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          第28天：Original Query · Ambiguous · Rewrite Mode · Memory/Recent/Topics · Pipeline Metrics
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="text"
            value={ragDebugQuery}
            onChange={(e) => setRagDebugQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-amber-200/80 bg-white/80 px-2 py-1 text-xs dark:border-amber-800/50 dark:bg-zinc-950/40"
            placeholder="Query"
          />
          <select
            value={ragDebugMode}
            onChange={(e) => setRagDebugMode(e.target.value as RetrievalMode)}
            className="w-20 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-xs dark:border-amber-800/50 dark:bg-zinc-950/40"
            title="retrieval mode"
          >
            <option value="vector">vector</option>
            <option value="keyword">keyword</option>
            <option value="hybrid">hybrid</option>
          </select>
          <input
            type="number"
            min={1}
            max={50}
            value={ragDebugRecallK}
            onChange={(e) => setRagDebugRecallK(Number(e.target.value) || 20)}
            className="w-14 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="recallK"
          />
          <input
            type="number"
            min={1}
            max={20}
            value={ragDebugTopK}
            onChange={(e) => setRagDebugTopK(Number(e.target.value) || 5)}
            className="w-12 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="topK"
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={ragDebugMinScore}
            onChange={(e) => setRagDebugMinScore(Number(e.target.value) || 0.3)}
            className="w-14 rounded-lg border border-amber-200/80 bg-white/80 px-1 py-1 text-center text-xs dark:border-amber-800/50"
            title="minScore"
          />
        </div>
        <button
          type="button"
          disabled={knowledgeLoading}
          onClick={() => void handleRagDebugRetrieve()}
          className="mt-2 w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          检索
        </button>
        <p className="mt-2 font-mono text-[10px] text-amber-900 dark:text-amber-100">
          Query: {ragDebugQuery || "—"} · mode: {ragDebugMode} · recallK: {ragDebugRecallK} · topK:{" "}
          {ragDebugTopK} · minScore: {ragDebugMinScore} · hits: {ragDebugHits.length}
        </p>
        {ragDebugRewrite ? (
          <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-2 py-2 text-[10px] dark:border-amber-800/40 dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Original Query: {ragDebugRewrite.originalQuery}
            </p>
            <p className="mt-1 break-words font-mono text-[9px] text-amber-800 dark:text-amber-200">
              ambiguous: {String(ragDebugRewrite.ambiguous ?? false)} · rewriteMode:{" "}
              {ragDebugRewrite.rewriteMode ?? "rule"} · memory: {ragDebugRewrite.usedMemory ? "yes" : "no"} · recent:{" "}
              {ragDebugRewrite.usedRecentMessages ? "yes" : "no"} · topics:{" "}
              {(ragDebugRewrite.knowledgeTopicsUsed ?? []).join(" | ") || "none"}
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-amber-800 dark:text-amber-200">
              {ragDebugRewrite.rewrittenQueries.map((query) => (
                <li key={query} className="break-words">
                  {query}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
          {ragDebugHits.length === 0 ? (
            <li className="text-[11px] text-zinc-400">
              无合格检索结果（可能未 Import、或 score 低于 minScore）；ragAnswer 将走 fallback。
            </li>
          ) : (
            ragDebugHits.map((hit, i) => (
              <li
                key={`${hit.chunkId}-${i}`}
                className="rounded-lg border border-amber-200/60 bg-amber-50/50 px-2 py-1.5 text-[10px] dark:border-amber-800/40 dark:bg-amber-950/20"
              >
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  #{hit.finalRank ?? i + 1} · mode: {hit.retrievalMode ?? ragDebugMode} · chunk #{hit.chunkIndex} ·
                  offset {hit.startOffset}-{hit.endOffset}
                </p>
                <p className="font-mono text-amber-900/90 dark:text-amber-100/90">
                  vector: {hit.vectorScore ?? hit.score} · keyword: {hit.keywordScore ?? 0} · hybrid:{" "}
                  {hit.hybridScore ?? hit.score} · rerank: {hit.rerankScore ?? hit.score}
                </p>
                <p className="text-amber-800/90 dark:text-amber-200/90">
                  doc: {hit.documentTitle} ({hit.documentId})
                </p>
                {hit.matchedQueries?.length ? (
                  <p className="mt-0.5 break-words font-mono text-[9px] text-amber-700/90 dark:text-amber-300/90">
                    matched: {hit.matchedQueries.join(" | ")}
                  </p>
                ) : null}
                <p className="mt-0.5 line-clamp-3 text-zinc-600 dark:text-zinc-400">{hit.text}</p>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-b border-violet-200/70 px-4 py-4 dark:border-violet-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">历史 Workflow</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          经 WorkflowStore（{storageMode}）持久化；点击条目可恢复到对话区（含 paused 确认按钮）。
        </p>
        <ul className="mt-3 max-h-36 space-y-2 overflow-y-auto">
          {workflowHistory.length === 0 ? (
            <li className="rounded-lg border border-dashed border-zinc-200 px-2 py-3 text-center text-[11px] text-zinc-400 dark:border-zinc-700">
              暂无记录；开启 Workflow 发送后会出现在此。
            </li>
          ) : (
            workflowHistory.map((item) => (
              <li key={item.workflowId}>
                <button
                  type="button"
                  onClick={() => handleRestoreWorkflowFromHistory(item.workflowId)}
                  className="w-full rounded-lg border border-violet-200/80 bg-violet-50/80 px-2.5 py-2 text-left text-xs transition hover:bg-violet-100/90 dark:border-violet-800/50 dark:bg-violet-950/30 dark:hover:bg-violet-900/40"
                >
                  <span className="line-clamp-2 font-medium text-violet-950 dark:text-violet-50">{item.goal}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] text-violet-700/90 dark:text-violet-300/90">
                    <span
                      className={
                        item.status === "paused"
                          ? "rounded bg-sky-500/20 px-1 text-sky-800 dark:text-sky-200"
                          : item.status === "success"
                            ? "rounded bg-emerald-500/20 px-1 text-emerald-800 dark:text-emerald-200"
                            : "rounded bg-zinc-500/15 px-1"
                      }
                    >
                      {item.status}
                    </span>
                    <span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                    {item.waitingStepName ? <span>⏸ {item.waitingStepName}</span> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="border-b border-zinc-200/70 px-4 py-4 dark:border-zinc-800/80">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">长期记忆</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          服务端返回的 Memory，便于观察路由与压缩效果。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            short {memory.shortTerm.length}
          </span>
          <span className="rounded-lg bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            items {memory.items.length}
          </span>
        </div>
      </div>

      <ul className="flex-1 min-h-0 space-y-2 overflow-y-auto px-3 py-3">
        {memory.items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
            暂无条目；多聊几句或触发总结后会出现。
          </li>
        ) : (
          memory.items.map((item, i) => (
            <li
              key={`${item.content}-${i}`}
              className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                item.importance === "high"
                  ? "border border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-50"
                  : "border border-zinc-200/70 bg-zinc-50/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200"
              }`}
            >
              <span
                className={`mb-1 inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                  item.importance === "high"
                    ? "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                    : "bg-zinc-200/80 text-zinc-600 dark:bg-zinc-600/50 dark:text-zinc-300"
                }`}
              >
                {item.importance}
              </span>
              <p className="mt-1">{item.content}</p>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}
