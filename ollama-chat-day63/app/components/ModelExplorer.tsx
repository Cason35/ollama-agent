"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, readApiData } from "@/lib/api/api-client";
import type { ModelProfileSummary, ModelSnapshot } from "@/lib/model/model-profile-types";

type ModelTab = "overview" | "models" | "routing";

const SPEED_LABELS: Record<string, string> = {
  fast: "快速",
  medium: "均衡",
  slow: "深度",
};

const QUALITY_LABELS: Record<string, string> = {
  basic: "基础",
  strong: "强",
  reasoning: "推理",
};

const tabs: Array<{ id: ModelTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "models", label: "档案" },
  { id: "routing", label: "路由" },
];

function formatCost(value: number) {
  return value === 0 ? "0" : value.toFixed(4);
}

function ModelCard({ model }: { model: ModelProfileSummary }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-950 dark:text-zinc-50">{model.name}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">
            {model.provider} / {model.model}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-violet-50 px-2 py-1 font-mono text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-900/60">
          {model.id}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {model.capabilities.map((capability) => (
          <span
            key={capability}
            className="rounded-md bg-zinc-100 px-1.5 py-1 font-mono text-[9px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {capability}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] text-zinc-500">
        <div>
          <dt className="text-zinc-400">speed</dt>
          <dd className="font-semibold text-zinc-700 dark:text-zinc-200">{SPEED_LABELS[model.speed] ?? model.speed}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">quality</dt>
          <dd className="font-semibold text-zinc-700 dark:text-zinc-200">{QUALITY_LABELS[model.quality] ?? model.quality}</dd>
        </div>
        <div>
          <dt className="text-zinc-400">input</dt>
          <dd className="font-semibold text-zinc-700 dark:text-zinc-200">${formatCost(model.cost.inputPer1K)}/1K</dd>
        </div>
        <div>
          <dt className="text-zinc-400">window</dt>
          <dd className="font-semibold text-zinc-700 dark:text-zinc-200">{model.limits.contextWindow}</dd>
        </div>
      </dl>
    </article>
  );
}

export function ModelExplorer() {
  const [snapshot, setSnapshot] = useState<ModelSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ModelTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/model", { method: "GET" });
      setSnapshot(await readApiData<ModelSnapshot>(response));
    } catch (loadError) {
      setError(loadError instanceof ApiClientError ? loadError.message : "加载模型路由数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const metricCards = useMemo(() => {
    if (!snapshot) return [];
    return [
      { label: "模型总数", value: snapshot.metrics.totalModels },
      { label: "能力覆盖", value: snapshot.metrics.capabilityCoverage },
      { label: "快速模型", value: snapshot.metrics.fastestModelCount },
      { label: "最低成本", value: snapshot.metrics.cheapestModelId ?? "暂无" },
    ];
  }, [snapshot]);

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Model Explorer</p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              按任务类型、复杂度、JSON 约束和延迟偏好选择模型，并展示路由理由。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            className="h-8 shrink-0 rounded-md bg-violet-600 px-3 text-[11px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "加载" : "刷新"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-900" role="tablist" aria-label="模型路由分析">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-8 rounded-md px-2 text-[11px] font-semibold transition ${
                activeTab === tab.id
                  ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-800 dark:text-violet-200"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {!snapshot ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white/70 px-3 py-8 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/20 dark:text-zinc-400">
          正在读取模型路由快照...
        </div>
      ) : null}

      {snapshot && activeTab === "overview" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {metricCards.map((metric, index) => (
              <div
                key={metric.label}
                className={`rounded-lg border p-3 ${
                  index < 2
                    ? "border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/35 dark:text-violet-50"
                    : "border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/35 dark:text-zinc-50"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{metric.label}</p>
                <p className="mt-1 truncate font-mono text-xl font-bold">{metric.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/35">
            <p className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">Provider Distribution</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(snapshot.metrics.providerDistribution).map(([provider, count]) => (
                <span
                  key={provider}
                  className="rounded-md bg-emerald-50 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/60"
                >
                  {provider} {count}
                </span>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] text-zinc-400">
              updated {new Date(snapshot.generatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
            </p>
          </div>
        </div>
      ) : null}

      {snapshot && activeTab === "models" ? (
        <div className="space-y-2">
          {snapshot.models.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>
      ) : null}

      {snapshot && activeTab === "routing" ? (
        <div className="space-y-2">
          {snapshot.routingPreviews.map((preview) => (
            <article
              key={preview.label}
              className="rounded-lg border border-zinc-200 bg-white p-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-950 dark:text-zinc-50">{preview.label}</p>
                  <p className="mt-1 line-clamp-3 leading-relaxed text-zinc-500 dark:text-zinc-400">{preview.decision.reason}</p>
                </div>
                <span className="shrink-0 rounded-md bg-sky-50 px-2 py-1 font-mono text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/35 dark:text-sky-200 dark:ring-sky-900/60">
                  {preview.decision.model.id}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px] text-zinc-500">
                <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">rule {preview.decision.matchedRule}</span>
                <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">task {preview.input.taskType}</span>
                {preview.input.complexity ? (
                  <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">complexity {preview.input.complexity}</span>
                ) : null}
                {preview.input.requiresJson ? <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">JSON</span> : null}
                {preview.input.latencyPreference ? (
                  <span className="rounded-md bg-zinc-100 px-1.5 py-1 dark:bg-zinc-800">latency {preview.input.latencyPreference}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

