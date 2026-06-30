"use client"; /* 第52天增强：声明完整提示词工作台为客户端交互组件。 */

import { useCallback, useEffect, useMemo, useState } from "react"; /* 第52天增强：引入状态、缓存和副作用 Hooks。 */
import Link from "next/link"; /* 第52天增强：引入 Next.js 内部页面导航组件。 */
import { ApiClientError, readApiData } from "@/lib/api/api-client"; /* 第52天增强：引入统一 API 响应解析工具。 */
import { buildPromptId, buildPromptTemplateFromInput, buildSamplePromptVariables, estimatePromptCost, getPromptVariableContract, normalizePromptVariables, validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第53天增强：引入提示词构造、样例变量、成本估算、契约和校验工具。 */
import { comparePromptTemplates } from "@/lib/prompts/prompt-diff"; /* 第52天增强：引入提示词差异对比函数。 */
import { extractTemplateVariables, renderPrompt } from "@/lib/prompts/prompt-renderer"; /* 第52天增强：引入变量提取和提示词渲染函数。 */
import type { PromptExperimentDashboardSnapshot } from "@/lib/prompts/prompt-experiment-types"; /* 第53天增强：引入提示词实验快照类型，用于把实验分数和成本回填到表单。 */
import type { PromptComponentType, PromptDashboardSnapshot, PromptMutationInput, PromptStatus, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天增强：引入提示词工作台所需类型。 */

type LifecycleAction = "activate" | "archive" | "rollback"; /* 第52天增强：定义前端生命周期动作类型。 */

const statusOptions: PromptStatus[] = ["draft", "active", "archived"]; /* 第52天增强：定义提示词状态下拉选项。 */

const componentTypeOptions: PromptComponentType[] = ["agent", "tool", "reflection", "evaluation", "supervisor"]; /* 第52天增强：定义组件类型下拉选项。 */

function emptyPromptInput(): PromptMutationInput { /* 第52天增强：定义空白提示词表单构造函数。 */
  return { name: "新建提示词草稿", componentType: "agent", componentId: "research", version: "v4", template: "你是研究型 Agent。\n任务：{{task}}\n可用工具：{{tools}}\n长期记忆：{{memory}}\n共享工作空间：{{workspace}}\n请输出关键发现、证据来源、风险和下一步。", variables: ["task", "tools", "memory", "workspace"], status: "draft", source: "prompt-console" }; /* 第52天增强：返回默认研究提示词草稿。 */
} /* 第52天增强：结束空白提示词表单构造函数。 */

function toPromptInput(prompt: PromptTemplate): PromptMutationInput { /* 第52天增强：定义把已保存模板转换为表单输入的函数。 */
  return { id: prompt.id, name: prompt.name, componentType: prompt.componentType, componentId: prompt.componentId, version: prompt.version, template: prompt.template, variables: [...prompt.variables], status: prompt.status, source: prompt.source, score: prompt.score, costEstimate: prompt.costEstimate }; /* 第52天增强：复制可编辑字段并保留版本元数据。 */
} /* 第52天增强：结束模板转表单函数。 */

function nextVersion(version: string): string { /* 第52天增强：定义版本号自增函数。 */
  const match = /^v(\d+)$/i.exec(version.trim()); /* 第52天增强：匹配 v1、v2 这类教学项目版本格式。 */
  return match ? `v${Number(match[1]) + 1}` : `${version.trim()}-draft`; /* 第52天增强：标准版本加一，非标准版本追加 draft 后缀。 */
} /* 第52天增强：结束版本号自增函数。 */

function nextAvailableVersion(componentId: string, prompts: PromptTemplate[], fallbackVersion: string): string { /* 第53天增强：定义某组件下一个可用版本号计算函数。 */
  const usedNumbers = prompts.filter((prompt) => prompt.componentId === componentId).map((prompt) => /^v(\d+)$/i.exec(prompt.version.trim())?.[1]).filter((value): value is string => Boolean(value)).map(Number); /* 第53天增强：收集该组件已有标准版本号数字。 */
  const fallbackNumber = /^v(\d+)$/i.exec(fallbackVersion.trim())?.[1]; /* 第53天增强：读取默认草稿版本号数字。 */
  const maxUsed = Math.max(0, ...usedNumbers, fallbackNumber ? Number(fallbackNumber) - 1 : 0); /* 第53天增强：把默认版本也纳入下一个版本的下限。 */
  return `v${maxUsed + 1}`; /* 第53天增强：返回不会和已保存版本冲突的新版本号。 */
} /* 第53天增强：结束某组件下一个可用版本号计算函数。 */

function draftFromPrompt(prompt: PromptTemplate): PromptMutationInput { /* 第52天增强：定义基于已有版本创建新草稿的函数。 */
  return { ...toPromptInput(prompt), id: undefined, name: `${prompt.name} 草稿`, version: nextVersion(prompt.version), status: "draft", source: "prompt-console" }; /* 第52天增强：复制模板正文并生成下一版本草稿。 */
} /* 第52天增强：结束基于已有版本创建草稿函数。 */

function statusClass(status: PromptStatus): string { /* 第52天增强：定义状态徽标样式函数。 */
  if (status === "active") return "bg-emerald-500/15 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"; /* 第52天增强：active 使用绿色样式。 */
  if (status === "draft") return "bg-amber-500/15 text-amber-700 ring-amber-500/20 dark:text-amber-300"; /* 第52天增强：draft 使用琥珀色样式。 */
  return "bg-zinc-500/10 text-zinc-500 ring-zinc-500/15 dark:text-zinc-400"; /* 第52天增强：archived 使用低强调样式。 */
} /* 第52天增强：结束状态徽标样式函数。 */

function formatTime(value: number): string { /* 第52天增强：定义时间格式化函数。 */
  return new Date(value).toLocaleString("zh-CN"); /* 第52天增强：使用中文本地化时间格式。 */
} /* 第52天增强：结束时间格式化函数。 */

function VariableChipList({ variables, tone }: { variables: string[]; tone: "required" | "used" }) { /* 第53天增强：定义变量标签列表组件，避免右侧校验卡片挤压变形。 */
  const chipClass = tone === "required" ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"; /* 第53天增强：按变量类型选择标签颜色。 */
  if (!variables.length) return <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">无</span>; /* 第53天增强：没有变量时展示稳定占位。 */
  return <>{variables.map((variable) => <span key={variable} className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold ${chipClass}`}>{variable}</span>)}</>; /* 第53天增强：把变量拆成可换行标签，避免长文本撑出面板。 */
} /* 第53天增强：结束变量标签列表组件。 */

function PromptListItem({ prompt, selected, onSelect, onClone, onLifecycle, disabled }: { prompt: PromptTemplate; selected: boolean; onSelect: (prompt: PromptTemplate) => void; onClone: (prompt: PromptTemplate) => void; onLifecycle: (action: LifecycleAction, prompt: PromptTemplate) => void; disabled: boolean }) { /* 第52天增强：定义提示词版本列表项组件。 */
  return ( /* 第52天增强：返回提示词列表项视图。 */
    <li className={`rounded-md border p-2 text-[11px] ${selected ? "border-teal-400 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-950/25" : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/40"}`}> {/* 第52天增强：根据选中状态切换列表项样式。 */}
      <button type="button" onClick={() => onSelect(prompt)} className="block w-full text-left"> {/* 第52天增强：点击列表项进入编辑。 */}
        <div className="flex items-start justify-between gap-2"> {/* 第52天增强：排列名称和状态。 */}
          <div className="min-w-0"> {/* 第52天增强：限制文本宽度防止溢出。 */}
            <p className="truncate font-semibold text-zinc-950 dark:text-zinc-50">{prompt.name}</p> {/* 第52天增强：展示提示词名称。 */}
            <p className="mt-0.5 font-mono text-[9px] text-teal-700 dark:text-teal-300">{prompt.id} · {prompt.componentType}</p> {/* 第52天增强：展示提示词 ID 和组件类型。 */}
          </div> {/* 第52天增强：结束名称区域。 */}
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-semibold ring-1 ${statusClass(prompt.status)}`}>{prompt.status}</span> {/* 第52天增强：展示状态徽标。 */}
        </div> {/* 第52天增强：结束标题行。 */}
      </button> {/* 第52天增强：结束选择按钮。 */}
      <div className="mt-2 flex flex-wrap gap-1"> {/* 第52天增强：排列快捷操作按钮。 */}
        <button type="button" disabled={disabled} onClick={() => onClone(prompt)} className="rounded border border-zinc-300 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">复制草稿</button> {/* 第52天增强：基于当前版本创建新草稿。 */}
        <button type="button" disabled={disabled || prompt.status === "active"} onClick={() => onLifecycle("activate", prompt)} className="rounded bg-teal-600 px-1.5 py-0.5 text-[9px] font-semibold text-white disabled:opacity-40">激活</button> {/* 第52天增强：激活该提示词版本。 */}
        <button type="button" disabled={disabled || prompt.status === "archived"} onClick={() => onLifecycle("archive", prompt)} className="rounded border border-zinc-300 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">归档</button> {/* 第52天增强：归档该提示词版本。 */}
        <button type="button" disabled={disabled || prompt.status === "active"} onClick={() => onLifecycle("rollback", prompt)} className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 disabled:opacity-40 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">回滚</button> {/* 第52天增强：回滚到该提示词版本。 */}
      </div> {/* 第52天增强：结束快捷操作按钮组。 */}
      <p className="mt-1 font-mono text-[8px] text-zinc-500">更新：{formatTime(prompt.updatedAt)}</p> {/* 第52天增强：展示更新时间。 */}
    </li> /* 第52天增强：结束提示词列表项。 */
  ); /* 第52天增强：结束提示词列表项返回。 */
} /* 第52天增强：结束 PromptListItem 组件。 */

function LocalDraftListItem({ prompt }: { prompt: PromptTemplate }) { /* 第53天增强：定义未保存本地草稿在左侧列表中的展示组件。 */
  return ( /* 第53天增强：返回未保存草稿卡片。 */
    <li className="rounded-md border border-dashed border-amber-300 bg-amber-50/80 p-2 text-[11px] dark:border-amber-900/60 dark:bg-amber-950/25"> {/* 第53天增强：用虚线和琥珀色提示这是未保存草稿。 */}
      <div className="flex items-start justify-between gap-2"> {/* 第53天增强：排列草稿名称和未保存徽标。 */}
        <div className="min-w-0"> {/* 第53天增强：限制标题宽度，避免长名称撑开列表。 */}
          <p className="truncate font-semibold text-amber-950 dark:text-amber-100">{prompt.name}</p> {/* 第53天增强：展示草稿名称。 */}
          <p className="mt-0.5 font-mono text-[9px] text-amber-700 dark:text-amber-300">{prompt.id} · {prompt.componentType}</p> {/* 第53天增强：展示草稿 ID 和组件类型。 */}
        </div> {/* 第53天增强：结束草稿标题区域。 */}
        <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">未保存</span> {/* 第53天增强：展示未保存状态徽标。 */}
      </div> {/* 第53天增强：结束草稿标题布局。 */}
      <p className="mt-2 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">这是本地草稿，点击右侧保存按钮后才会进入 Prompt Registry（提示词注册表）。</p> {/* 第53天增强：解释草稿为什么还没进入真实列表。 */}
    </li> /* 第53天增强：结束未保存草稿卡片。 */
  ); /* 第53天增强：结束未保存草稿返回。 */
} /* 第53天增强：结束 LocalDraftListItem 组件。 */

export function PromptWorkbench() { /* 第52天增强：定义完整提示词管理工作台组件。 */
  const [snapshot, setSnapshot] = useState<PromptDashboardSnapshot | null>(null); /* 第52天增强：保存后端提示词快照。 */
  const [form, setForm] = useState<PromptMutationInput>(() => emptyPromptInput()); /* 第52天增强：保存当前编辑表单。 */
  const [selectedPromptId, setSelectedPromptId] = useState<string>(""); /* 第52天增强：保存当前选中的已保存提示词 ID。 */
  const [loading, setLoading] = useState(true); /* 第52天增强：保存加载和保存状态。 */
  const [message, setMessage] = useState(""); /* 第52天增强：保存成功或提示信息。 */
  const [error, setError] = useState(""); /* 第52天增强：保存错误信息。 */

  const loadSnapshot = useCallback(async () => { /* 第52天增强：定义读取提示词快照函数。 */
    setLoading(true); /* 第52天增强：进入加载状态。 */
    setError(""); /* 第52天增强：清空旧错误。 */
    try { /* 第52天增强：捕获请求异常。 */
      const response = await fetch("/api/prompts"); /* 第52天增强：请求提示词注册表快照。 */
      const data = await readApiData<PromptDashboardSnapshot>(response); /* 第52天增强：解析统一 API 响应。 */
      setSnapshot(data); /* 第52天增强：保存最新快照。 */
      if (!selectedPromptId) { /* 第52天增强：首次加载时选择默认研究提示词。 */
        const initial = data.prompts.find((prompt) => prompt.id === "research.v3") ?? data.activePrompts[0] ?? data.prompts[0]; /* 第52天增强：优先选择 research.v3，否则选择第一个 active。 */
        if (initial) { /* 第52天增强：确认存在可编辑提示词。 */
          setSelectedPromptId(initial.id); /* 第52天增强：保存选中 ID。 */
          setForm(toPromptInput(initial)); /* 第52天增强：把提示词写入表单。 */
        } /* 第52天增强：结束默认提示词存在判断。 */
      } /* 第52天增强：结束首次加载选择逻辑。 */
    } catch (loadError) { /* 第52天增强：处理加载失败。 */
      setError(loadError instanceof ApiClientError ? loadError.message : "加载 Prompt Registry 失败"); /* 第52天增强：写入用户可读错误。 */
    } finally { /* 第52天增强：确保恢复交互状态。 */
      setLoading(false); /* 第52天增强：退出加载状态。 */
    } /* 第52天增强：结束异常处理。 */
  }, [selectedPromptId]); /* 第52天增强：依赖当前选中提示词 ID。 */

  useEffect(() => { /* 第52天增强：组件挂载后读取提示词快照。 */
    const timer = window.setTimeout(() => void loadSnapshot(), 0); /* 第52天增强：延迟启动异步加载，避免 Effect 同步触发状态级联。 */
    return () => window.clearTimeout(timer); /* 第52天增强：组件卸载时清理延迟加载定时器。 */
  }, [loadSnapshot]); /* 第52天增强：依赖稳定的加载函数。 */

  const prompts = useMemo(() => snapshot?.prompts ?? [], [snapshot]); /* 第52天增强：稳定派生全部提示词列表，避免 Hook 依赖每次渲染变化。 */
  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId) ?? null; /* 第52天增强：读取当前选中的已保存提示词。 */
  const activePrompt = snapshot?.activePrompts.find((prompt) => prompt.componentId === form.componentId) ?? null; /* 第52天增强：读取当前组件 active 提示词作为默认对比基线。 */
  const draftPrompt = useMemo(() => buildPromptTemplateFromInput(form, selectedPrompt), [form, selectedPrompt]); /* 第52天增强：把表单内容转换为待校验草稿模板。 */
  const isUnsavedDraft = !selectedPromptId; /* 第53天增强：记录当前表单是否是尚未保存到注册表的本地草稿。 */
  const visiblePrompts = useMemo(() => prompts.filter((prompt) => prompt.componentId === form.componentId), [prompts, form.componentId]); /* 第53天增强：派生当前组件左侧列表中的已保存版本。 */
  const validation = useMemo(() => validatePromptTemplate(draftPrompt), [draftPrompt]); /* 第52天增强：实时校验当前草稿模板。 */
  const contract = useMemo(() => getPromptVariableContract(form.componentId, form.componentType), [form.componentId, form.componentType]); /* 第52天增强：读取当前组件变量契约。 */
  const comparisonBase = selectedPrompt ?? activePrompt; /* 第52天增强：优先与正在编辑的原版本对比，新建时与 active 版本对比。 */
  const comparison = useMemo(() => comparisonBase ? comparePromptTemplates(comparisonBase, draftPrompt) : null, [comparisonBase, draftPrompt]); /* 第52天增强：实时生成编辑前后或 active 到草稿的 Prompt Diff。 */
  const renderedPreview = useMemo(() => { /* 第52天增强：实时生成渲染预览。 */
    if (!validation.valid) return ""; /* 第52天增强：校验不通过时不渲染，避免误导用户。 */
    try { /* 第52天增强：捕获渲染异常。 */
      return renderPrompt(draftPrompt, buildSamplePromptVariables(draftPrompt)); /* 第52天增强：用样例变量渲染完整提示词。 */
    } catch (previewError) { /* 第52天增强：处理预览失败。 */
      return previewError instanceof Error ? previewError.message : "预览渲染失败"; /* 第52天增强：返回可读失败原因。 */
    } /* 第52天增强：结束渲染异常处理。 */
  }, [draftPrompt, validation.valid]); /* 第52天增强：依赖草稿和校验状态。 */
  const estimatedCost = useMemo(() => estimatePromptCost(form.template), [form.template]); /* 第53天增强：根据当前模板实时计算保存时会采用的成本估算。 */

  const fillEstimatedCost = useCallback(() => { /* 第53天增强：定义把系统成本估算写入表单的方法。 */
    const nextCost = estimatePromptCost(form.template); /* 第53天增强：按当前模板正文重新计算成本。 */
    setForm((current) => ({ ...current, costEstimate: nextCost })); /* 第53天增强：把估算结果填入成本字段，用户仍可手动覆盖。 */
    setMessage(`已按当前模板长度填入成本估算：$${nextCost.toFixed(5)}。`); /* 第53天增强：提示估算已经写入表单。 */
    setError(""); /* 第53天增强：清空旧错误提示。 */
  }, [form.template]); /* 第53天增强：依赖当前模板正文。 */

  const componentIds = useMemo(() => Array.from(new Set([...(snapshot?.contracts.map((item) => item.componentId) ?? []), ...prompts.map((prompt) => prompt.componentId)])), [snapshot, prompts]); /* 第52天增强：合并内置契约组件和已有提示词组件。 */

  const updateTemplate = useCallback((template: string) => { /* 第52天增强：定义模板正文更新函数。 */
    setForm((current) => ({ ...current, template, variables: normalizePromptVariables(extractTemplateVariables(template)) })); /* 第52天增强：更新正文时自动同步变量声明，减少手写变量出错。 */
  }, []); /* 第52天增强：保持模板更新函数稳定。 */

  const insertVariable = useCallback((variable: string) => { /* 第52天增强：定义变量标签插入函数。 */
    setForm((current) => { /* 第52天增强：基于当前表单更新模板。 */
      const suffix = current.template.endsWith("\n") || current.template.length === 0 ? "" : "\n"; /* 第52天增强：决定是否需要先补换行。 */
      const template = `${current.template}${suffix}{{${variable}}}`; /* 第52天增强：把变量占位符插入到模板末尾。 */
      return { ...current, template, variables: normalizePromptVariables(extractTemplateVariables(template)) }; /* 第52天增强：同步模板正文和变量声明。 */
    }); /* 第52天增强：结束表单更新。 */
  }, []); /* 第52天增强：保持变量插入函数稳定。 */

  const selectPrompt = useCallback((prompt: PromptTemplate) => { /* 第52天增强：定义选择已有提示词进入编辑的函数。 */
    setSelectedPromptId(prompt.id); /* 第52天增强：保存选中提示词 ID。 */
    setForm(toPromptInput(prompt)); /* 第52天增强：把该提示词写入表单。 */
    setMessage(""); /* 第52天增强：清空旧成功提示。 */
    setError(""); /* 第52天增强：清空旧错误提示。 */
  }, []); /* 第52天增强：保持选择函数稳定。 */

  const createBlank = useCallback(() => { /* 第52天增强：定义新建空白草稿函数。 */
    const draft = emptyPromptInput(); /* 第53天增强：先创建默认空白草稿。 */
    draft.version = nextAvailableVersion(draft.componentId, prompts, draft.version); /* 第53天增强：根据已保存版本自动生成不冲突的新版本号。 */
    setSelectedPromptId(""); /* 第52天增强：清空已保存提示词选择。 */
    setForm(draft); /* 第53天增强：把不冲突的新草稿写入表单。 */
    setMessage("已创建本地草稿，保存后会进入 Prompt Registry，并写入 .data/prompts.json。"); /* 第53天增强：提示用户草稿当前还没持久化。 */
    setError(""); /* 第52天增强：清空旧错误。 */
  }, [prompts]); /* 第53天增强：依赖已保存提示词列表以计算新版本号。 */

  const clonePrompt = useCallback((prompt: PromptTemplate) => { /* 第52天增强：定义复制已有版本为新草稿函数。 */
    const draft = draftFromPrompt(prompt); /* 第52天增强：生成下一版本草稿。 */
    draft.version = nextAvailableVersion(prompt.componentId, prompts, draft.version); /* 第53天增强：复制草稿时跳过已经存在的版本号。 */
    setSelectedPromptId(""); /* 第52天增强：清空已保存提示词选择，表示将创建新版本。 */
    setForm(draft); /* 第52天增强：把草稿写入表单。 */
    setMessage(`已基于 ${prompt.id} 创建 ${draft.componentId}.${draft.version} 本地草稿，保存后才会进入注册表。`); /* 第53天增强：提示草稿来源、版本号和未保存状态。 */
    setError(""); /* 第52天增强：清空旧错误。 */
  }, [prompts]); /* 第53天增强：依赖已保存提示词列表以避免复制版本冲突。 */

  const savePrompt = useCallback(async (statusOverride?: PromptStatus) => { /* 第52天增强：定义保存提示词函数。 */
    const body: PromptMutationInput = { ...form, status: statusOverride ?? form.status }; /* 第52天增强：按按钮覆盖或沿用当前表单状态。 */
    setMessage(""); /* 第53天增强：保存一开始就清空旧成功提示，避免本地校验失败时混淆状态。 */
    const localPrompt = buildPromptTemplateFromInput(body, selectedPrompt); /* 第52天增强：构造本地草稿用于保存前校验。 */
    const localValidation = validatePromptTemplate(localPrompt); /* 第52天增强：执行保存前本地校验。 */
    if (!localValidation.valid) { /* 第52天增强：发现校验错误时阻止请求。 */
      setError(localValidation.issues.map((issue) => issue.message).join("；")); /* 第52天增强：展示全部校验问题。 */
      return; /* 第52天增强：停止保存流程。 */
    } /* 第52天增强：结束本地校验判断。 */
    setLoading(true); /* 第52天增强：进入保存状态。 */
    setError(""); /* 第52天增强：清空旧错误。 */
    try { /* 第52天增强：捕获保存请求异常。 */
      const response = await fetch("/api/prompts", { method: selectedPrompt ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); /* 第52天增强：已有版本走 PUT，新版本走 POST。 */
      const data = await readApiData<PromptDashboardSnapshot>(response); /* 第52天增强：解析保存后的最新快照。 */
      const savedId = body.id?.trim() || buildPromptId(body.componentId.trim(), body.version.trim()); /* 第52天增强：计算保存后的提示词 ID。 */
      setSnapshot(data); /* 第52天增强：刷新提示词快照。 */
      setSelectedPromptId(savedId); /* 第52天增强：选择刚保存的版本。 */
      setForm(toPromptInput(data.prompts.find((prompt) => prompt.id === savedId) ?? localPrompt)); /* 第52天增强：用服务端数据回填表单。 */
      setMessage(statusOverride === "active" ? "保存并激活成功。" : "保存成功。"); /* 第52天增强：展示保存成功信息。 */
    } catch (saveError) { /* 第52天增强：处理保存失败。 */
      setError(saveError instanceof ApiClientError ? saveError.message : "保存 Prompt 失败"); /* 第52天增强：展示统一错误信息。 */
    } finally { /* 第52天增强：确保恢复交互状态。 */
      setLoading(false); /* 第52天增强：退出保存状态。 */
    } /* 第52天增强：结束保存异常处理。 */
  }, [form, selectedPrompt]); /* 第52天增强：依赖当前表单和选中版本。 */

  const applyExperimentMetrics = useCallback(async () => { /* 第53天增强：定义从 Prompt Experiment 回填评分和成本的方法。 */
    setLoading(true); /* 第53天增强：进入实验指标读取状态。 */
    setError(""); /* 第53天增强：清空旧错误。 */
    setMessage(""); /* 第53天增强：清空旧提示。 */
    try { /* 第53天增强：捕获实验接口读取异常。 */
      const response = await fetch("/api/experiments"); /* 第53天增强：读取默认提示词实验仪表盘快照。 */
      const data = await readApiData<PromptExperimentDashboardSnapshot>(response); /* 第53天增强：解析统一 API 响应。 */
      const match = data.run.results.find((result) => data.run.experiment.componentId === form.componentId && result.promptVersion === form.version.trim()); /* 第53天增强：查找当前组件和版本对应的实验结果。 */
      if (!match) { /* 第53天增强：当前版本没有参与默认实验时提示用户。 */
        setError(`当前版本 ${form.componentId}.${form.version} 没有实验结果；默认实验只覆盖 ${data.run.experiment.componentId}.${data.run.experiment.candidateVersions.join(" / ")}。`); /* 第53天增强：展示没有结果的原因。 */
        return; /* 第53天增强：停止回填流程。 */
      } /* 第53天增强：结束实验结果存在判断。 */
      setForm((current) => ({ ...current, score: match.averageScore, costEstimate: match.averageCost, source: current.source?.trim() || "prompt-experiment" })); /* 第53天增强：把实验平均分和平均成本写回表单。 */
      setMessage(`已从实验结果回填 ${form.componentId}.${form.version}：分数 ${match.averageScore}，成本 $${match.averageCost.toFixed(5)}；点击保存后才会写入注册表。`); /* 第53天增强：提示用户回填后仍需保存。 */
    } catch (metricsError) { /* 第53天增强：处理实验指标读取失败。 */
      setError(metricsError instanceof ApiClientError ? metricsError.message : "读取实验指标失败"); /* 第53天增强：展示统一错误信息。 */
    } finally { /* 第53天增强：确保恢复交互状态。 */
      setLoading(false); /* 第53天增强：退出实验指标读取状态。 */
    } /* 第53天增强：结束实验指标读取异常处理。 */
  }, [form.componentId, form.version]); /* 第53天增强：依赖当前组件和版本。 */

  const runLifecycle = useCallback(async (action: LifecycleAction, prompt: PromptTemplate) => { /* 第52天增强：定义生命周期动作函数。 */
    setLoading(true); /* 第52天增强：进入动作执行状态。 */
    setError(""); /* 第52天增强：清空旧错误。 */
    setMessage(""); /* 第53天增强：清空旧成功提示，避免生命周期失败时混淆状态。 */
    try { /* 第52天增强：捕获生命周期请求异常。 */
      const response = await fetch("/api/prompts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, componentId: prompt.componentId, version: prompt.version }) }); /* 第52天增强：发送激活、归档或回滚请求。 */
      const data = await readApiData<PromptDashboardSnapshot>(response); /* 第52天增强：解析动作后的最新快照。 */
      const updated = data.prompts.find((item) => item.componentId === prompt.componentId && item.version === prompt.version) ?? prompt; /* 第52天增强：读取动作后的目标版本。 */
      setSnapshot(data); /* 第52天增强：刷新提示词快照。 */
      setSelectedPromptId(updated.id); /* 第52天增强：保持目标版本选中。 */
      setForm(toPromptInput(updated)); /* 第52天增强：用动作后状态回填表单。 */
      setMessage(`Prompt ${action} 完成。`); /* 第52天增强：展示动作成功信息。 */
    } catch (actionError) { /* 第52天增强：处理生命周期动作失败。 */
      setError(actionError instanceof ApiClientError ? actionError.message : "Prompt 生命周期操作失败"); /* 第52天增强：展示统一错误信息。 */
    } finally { /* 第52天增强：确保恢复交互状态。 */
      setLoading(false); /* 第52天增强：退出动作状态。 */
    } /* 第52天增强：结束生命周期异常处理。 */
  }, []); /* 第52天增强：保持生命周期函数稳定。 */

  return ( /* 第52天增强：返回完整提示词工作台页面。 */
    <main className="h-screen overflow-hidden bg-zinc-50 px-4 py-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50"> {/* 第53天增强：定义固定视口工作台容器，避免表单掉出可视范围。 */}
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-4"> {/* 第53天增强：让页头、提示条和三栏区域共同占满当前屏幕。 */}
        <header className="shrink-0 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between"> {/* 第53天增强：固定页头高度，不参与三栏内部滚动。 */}
          <div> {/* 第52天增强：定义标题区域。 */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Day 55 Prompt Optimization Console</p> {/* 第55天：展示页面英文标签。 */}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">动态提示词优化与策略控制台</h1> {/* 第55天：展示页面主标题。 */}
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">维护 Prompt Version，同时通过 Prompt Block、PromptOptimizer、Strategy Explorer、Recommendation 和动态渲染预览观察智能提示词决策。</p> {/* 第55天：说明本页服务于提示词版本、策略和动态块优化管理。 */}
          </div> {/* 第52天增强：结束标题区域。 */}
          <div className="flex flex-wrap gap-2"> {/* 第52天增强：定义页头操作按钮组。 */}
            <Link href="/" className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">返回聊天页</Link> {/* 第52天增强：提供返回主应用入口。 */}
            <button type="button" onClick={createBlank} className="rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-500">新建提示词</button> {/* 第52天增强：提供新建提示词入口。 */}
            <button type="button" onClick={() => void loadSnapshot()} disabled={loading} className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 disabled:opacity-40 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-950/30">{loading ? "同步中..." : "刷新注册表"}</button> {/* 第52天增强：提供刷新提示词快照入口。 */}
          </div> {/* 第52天增强：结束页头操作按钮组。 */}
        </header> {/* 第52天增强：结束提示词控制台页头。 */}
        {message ? <p className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200">{message}</p> : null} {/* 第53天增强：展示成功提示并固定在工作台顶部。 */}
        {error ? <p className="shrink-0 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null} {/* 第53天增强：展示错误提示并固定在工作台顶部。 */}
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto xl:grid-cols-[290px_minmax(0,1fr)_360px] xl:overflow-hidden"> {/* 第53天增强：桌面端三栏各自滚动，小屏端整体滚动，避免元素超出可视范围。 */}
          <aside className="flex min-h-[18rem] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 xl:min-h-0"> {/* 第53天增强：定义左侧版本列表栏并限制在视口内滚动。 */}
            <div className="flex items-center justify-between gap-2"> {/* 第52天增强：排列列表标题和计数。 */}
              <h2 className="text-sm font-semibold">版本列表</h2> {/* 第52天增强：展示版本列表标题。 */}
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800">{prompts.length + (isUnsavedDraft ? 1 : 0)}</span> {/* 第53天增强：展示已保存版本数量，并把当前本地草稿也计入可见数量。 */}
            </div> {/* 第52天增强：结束列表标题行。 */}
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1"> {/* 第52天增强：定义组件快速筛选区域。 */}
              {componentIds.map((componentId) => <button type="button" key={componentId} onClick={() => setForm((current) => ({ ...current, componentId, componentType: getPromptVariableContract(componentId, current.componentType).componentType }))} className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold ${form.componentId === componentId ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{componentId}</button>)} {/* 第52天增强：渲染组件筛选按钮。 */}
            </div> {/* 第52天增强：结束组件快速筛选区域。 */}
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1"> {/* 第53天增强：版本列表在左栏内部滚动，避免撑高整页。 */}
              {isUnsavedDraft ? <LocalDraftListItem prompt={draftPrompt} /> : null} {/* 第53天增强：当前为本地草稿时立刻在左侧列表顶部展示。 */}
              {visiblePrompts.map((prompt) => <PromptListItem key={prompt.id} prompt={prompt} selected={prompt.id === selectedPromptId} onSelect={selectPrompt} onClone={clonePrompt} onLifecycle={runLifecycle} disabled={loading} />)} {/* 第53天增强：渲染当前组件的已保存提示词版本。 */}
            </ul> {/* 第52天增强：结束版本列表。 */}
          </aside> {/* 第52天增强：结束左侧版本列表栏。 */}
          <section className="min-h-[30rem] overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 xl:min-h-0"> {/* 第53天增强：中间编辑区独立滚动，让模板正文和保存按钮始终可访问。 */}
            <div className="grid gap-3 md:grid-cols-2"> {/* 第52天增强：定义基础字段网格。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">名称<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label> {/* 第52天增强：编辑提示词名称。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">组件 ID<input value={form.componentId} onChange={(event) => setForm((current) => ({ ...current, componentId: event.target.value.trim() || current.componentId }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label> {/* 第52天增强：编辑组件 ID。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">组件类型<select value={form.componentType} onChange={(event) => setForm((current) => ({ ...current, componentType: event.target.value as PromptComponentType }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50">{componentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select></label> {/* 第52天增强：编辑组件类型。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">版本<input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label> {/* 第52天增强：编辑版本号。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">状态<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PromptStatus }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50">{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label> {/* 第52天增强：编辑生命周期状态。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">来源<input value={form.source ?? ""} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label> {/* 第52天增强：编辑提示词来源。 */}
            </div> {/* 第52天增强：结束基础字段网格。 */}
            <div className="mt-3 grid gap-3 md:grid-cols-2"> {/* 第52天增强：定义质量和成本字段网格。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">评估分<input type="number" value={form.score ?? ""} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value === "" ? undefined : Number(event.target.value) }))} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /><span className="mt-1 block text-[10px] font-normal leading-relaxed text-zinc-500 dark:text-zinc-400">不会在保存时自动打分；来自 Prompt Experiment（提示词实验）回填，或你手动录入人工评审分。</span></label> {/* 第53天增强：说明评估分的来源，避免误以为系统会凭空计算质量。 */}
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">成本估算<div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input type="number" step="0.00001" value={form.costEstimate ?? ""} onChange={(event) => setForm((current) => ({ ...current, costEstimate: event.target.value === "" ? undefined : Number(event.target.value) }))} className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm font-normal text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /><button type="button" onClick={fillEstimatedCost} className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-950/30">估算</button></div><span className="mt-1 block text-[10px] font-normal leading-relaxed text-zinc-500 dark:text-zinc-400">留空保存时系统会自动估算；当前模板估算为 ${estimatedCost.toFixed(5)}，也可以手动覆盖。</span></label> {/* 第53天增强：说明成本估算的自动计算时机并提供即时填入按钮。 */}
            </div> {/* 第52天增强：结束质量和成本字段网格。 */}
            <div className="sticky top-3 z-10 mt-3 rounded-lg border border-teal-200 bg-teal-50/95 p-3 shadow-sm backdrop-blur dark:border-teal-900/60 dark:bg-teal-950/80"> {/* 第53天增强：定义首屏可见的保存操作区，避免保存按钮藏在模板底部。 */}
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4"> {/* 第53天增强：让按钮独占整行网格，不再和说明文字并排挤压。 */}
                  <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt("draft")} className="rounded-md border border-teal-300 bg-white px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-800 dark:bg-zinc-950 dark:text-teal-200 dark:hover:bg-teal-950/30">保存为草稿</button> {/* 第53天增强：首屏保存为 draft 版本。 */}
                  <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt()} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800">按当前状态保存</button> {/* 第53天增强：首屏按表单状态保存。 */}
                  <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt("active")} className="rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40">保存并激活</button> {/* 第53天增强：首屏保存并切换 active。 */}
                  <button type="button" disabled={loading} onClick={() => void applyExperimentMetrics()} className="rounded-md border border-fuchsia-300 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-fuchsia-800 dark:bg-zinc-950 dark:text-fuchsia-200 dark:hover:bg-fuchsia-950/30">从实验结果填入评分/成本</button> {/* 第53天增强：从 Prompt Experiment 结果回填 score 和 costEstimate。 */}
              </div> {/* 第53天增强：结束首屏保存和指标回填按钮组。 */}
              <p className="mt-3 border-t border-teal-200 pt-2 text-[11px] leading-relaxed text-teal-900 dark:border-teal-900/60 dark:text-teal-100">{isUnsavedDraft ? "当前是本地草稿：还没有写入 Prompt Registry。保存后会出现在左侧版本列表，并持久化到 .data/prompts.json。" : `正在编辑已保存版本：${selectedPromptId}。修改评分、成本或模板后仍需要点击保存。`}</p> {/* 第53天增强：把编辑状态说明放到按钮下方，避免与按钮同排拥挤。 */}
            </div> {/* 第53天增强：结束首屏保存操作区。 */}
            <div className="mt-4"> {/* 第52天增强：定义变量插入区域。 */}
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">变量契约</p> {/* 第52天增强：展示变量契约标题。 */}
              <div className="mt-2 flex flex-wrap gap-1.5"> {/* 第52天增强：排列变量标签按钮。 */}
                {[...contract.requiredVariables, ...contract.optionalVariables].map((variable) => <button type="button" key={variable} onClick={() => insertVariable(variable)} className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold ${contract.requiredVariables.includes(variable) ? "bg-teal-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{`{{${variable}}}`}</button>)} {/* 第52天增强：点击变量标签插入占位符，避免手打拼错。 */}
              </div> {/* 第52天增强：结束变量标签按钮组。 */}
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{contract.description}</p> {/* 第52天增强：展示当前组件变量契约说明。 */}
            </div> {/* 第52天增强：结束变量插入区域。 */}
            <label className="mt-4 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">模板正文<textarea value={form.template} onChange={(event) => updateTemplate(event.target.value)} rows={15} className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-3 font-mono text-sm font-normal leading-relaxed text-zinc-950 outline-none focus:border-teal-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50" /></label> {/* 第52天增强：编辑提示词模板正文。 */}
            <div className="mt-3 flex flex-wrap items-center gap-2"> {/* 第52天增强：定义编辑操作按钮组。 */}
              <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt("draft")} className="rounded-md border border-teal-300 px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-950/30">保存为草稿</button> {/* 第52天增强：保存为 draft 版本。 */}
              <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt()} className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">按当前状态保存</button> {/* 第52天增强：按表单状态保存。 */}
              <button type="button" disabled={loading || !validation.valid} onClick={() => void savePrompt("active")} className="rounded-md bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-40">保存并激活</button> {/* 第52天增强：保存并上线为 active 版本。 */}
              <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${validation.valid ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-red-500/15 text-red-700 dark:text-red-300"}`}>{validation.valid ? "校验通过" : "校验未通过"}</span> {/* 第52天增强：展示实时校验状态。 */}
            </div> {/* 第52天增强：结束编辑操作按钮组。 */}
          </section> {/* 第52天增强：结束中间编辑区域。 */}
          <aside className="min-h-[24rem] space-y-4 overflow-y-auto overflow-x-hidden pr-1 xl:min-h-0"> {/* 第53天增强：右侧校验、Diff 和预览区域独立滚动。 */}
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"> {/* 第52天增强：定义变量校验面板。 */}
              <h2 className="text-sm font-semibold">变量校验</h2> {/* 第52天增强：展示变量校验标题。 */}
              <div className="mt-3 space-y-3 text-[10px]"> {/* 第53天增强：使用纵向摘要区域，避免右侧窄栏内两列卡片挤压。 */}
                <div> {/* 第53天增强：定义必需变量摘要行。 */}
                  <p className="font-semibold text-teal-700 dark:text-teal-300">必需变量</p> {/* 第53天增强：展示必需变量标题。 */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5"><VariableChipList variables={validation.requiredVariables} tone="required" /></div> {/* 第53天增强：用可换行标签展示必需变量。 */}
                </div> {/* 第53天增强：结束必需变量摘要行。 */}
                <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800"> {/* 第53天增强：定义模板已用变量摘要行并用细线分隔。 */}
                  <p className="font-semibold text-zinc-600 dark:text-zinc-300">模板已用变量</p> {/* 第53天增强：展示模板已用变量标题。 */}
                  <div className="mt-1.5 flex flex-wrap gap-1.5"><VariableChipList variables={validation.templateVariables} tone="used" /></div> {/* 第53天增强：用可换行标签展示模板实际变量。 */}
                </div> {/* 第53天增强：结束模板已用变量摘要行。 */}
              </div> {/* 第53天增强：结束变量摘要区域。 */}
              {validation.issues.length ? <ul className="mt-3 space-y-1.5">{validation.issues.map((issue) => <li key={`${issue.code}-${issue.variable ?? issue.message}`} className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-200">{issue.message}</li>)}</ul> : <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200">模板变量与组件契约一致，可以保存或激活。</p>} {/* 第52天增强：展示校验问题或通过状态。 */}
            </section> {/* 第52天增强：结束变量校验面板。 */}
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"> {/* 第52天增强：定义 Prompt Diff 面板。 */}
              <h2 className="text-sm font-semibold">Prompt Diff（提示词差异）</h2> {/* 第52天增强：展示差异标题。 */}
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{comparisonBase ? `${comparisonBase.id} → ${draftPrompt.id}` : "当前组件没有可对比版本。"}</p> {/* 第52天增强：展示对比双方。 */}
              <div className="mt-2 max-h-72 overflow-auto rounded-md bg-zinc-50 p-2 font-mono text-[10px] leading-relaxed dark:bg-zinc-950"> {/* 第52天增强：定义 Diff 行容器。 */}
                {comparison?.diff.map((line, index) => <p key={`${line.kind}-${line.lineNumber ?? index}-${line.text}`} className={line.kind === "added" ? "text-emerald-700 dark:text-emerald-300" : line.kind === "removed" ? "text-red-700 dark:text-red-300" : "text-zinc-500"}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}{line.text || " "}</p>) ?? <p className="text-zinc-500">暂无差异。</p>} {/* 第52天增强：逐行展示新增、删除和未变化内容。 */}
              </div> {/* 第52天增强：结束 Diff 行容器。 */}
            </section> {/* 第52天增强：结束 Prompt Diff 面板。 */}
            <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"> {/* 第52天增强：定义渲染预览面板。 */}
              <h2 className="text-sm font-semibold">Rendered Preview（渲染预览）</h2> {/* 第52天增强：展示渲染预览标题。 */}
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 font-mono text-[10px] leading-relaxed text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">{renderedPreview || "校验通过后会用样例 task、memory、workspace、tools、agentId 渲染完整 Prompt。"}</pre> {/* 第53天增强：展示完整提示词渲染结果，并说明 agentId 也会注入样例值。 */}
            </section> {/* 第52天增强：结束渲染预览面板。 */}
          </aside> {/* 第52天增强：结束右侧校验、Diff 和预览区域。 */}
        </div> {/* 第52天增强：结束三栏工作台布局。 */}
      </div> {/* 第52天增强：结束页面内容宽度容器。 */}
    </main> /* 第52天增强：结束页面主容器。 */
  ); /* 第52天增强：结束工作台返回。 */
} /* 第52天增强：结束 PromptWorkbench 组件。 */
