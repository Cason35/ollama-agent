import type { PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天：引入 PromptTemplate（提示词模板）类型。 */

export class PromptRenderError extends Error { /* 第52天：定义提示词渲染失败专用错误。 */
  constructor(readonly promptId: string, readonly missingVariables: string[]) { /* 第52天：保存失败模板 ID 与缺失变量列表。 */
    super(`Prompt ${promptId} 缺少变量：${missingVariables.join(", ")}`); /* 第52天：生成便于测试和 UI 展示的错误文案。 */
    this.name = "PromptRenderError"; /* 第52天：固定错误类名，方便调用方精确识别。 */
  } /* 第52天：结束渲染错误构造函数。 */
} /* 第52天：结束 PromptRenderError 定义。 */

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g; /* 第52天：定义匹配 {{variable}} 模板变量的正则。 */

export function extractTemplateVariables(template: string): string[] { /* 第52天：定义从模板正文中提取变量名的方法。 */
  const variables = new Set<string>(); /* 第52天：使用 Set 去重并保持变量集合稳定。 */
  for (const match of template.matchAll(VARIABLE_PATTERN)) variables.add(match[1]); /* 第52天：逐个读取正则捕获到的变量名。 */
  return Array.from(variables); /* 第52天：返回去重后的变量名数组。 */
} /* 第52天：结束模板变量提取方法。 */

function normalizeVariables(variables: Record<string, string | number | boolean | undefined | null>): Record<string, string> { /* 第52天：定义渲染变量规范化方法。 */
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, value == null ? "" : String(value)])); /* 第52天：把数字和布尔值转成字符串，把空值转成空串。 */
} /* 第52天：结束变量规范化方法。 */

export function renderPrompt(template: PromptTemplate, variables: Record<string, string | number | boolean | undefined | null>): string { /* 第52天：定义 Prompt Renderer（提示词渲染器）。 */
  const normalized = normalizeVariables(variables); /* 第52天：先把调用方变量统一转成字符串字典。 */
  const declared = template.variables.length ? template.variables : extractTemplateVariables(template.template); /* 第52天：优先使用显式变量列表，没有则从模板正文提取。 */
  const required = Array.from(new Set([...declared, ...extractTemplateVariables(template.template)])); /* 第52天增强：同时检查声明变量和正文占位符，避免 {{task1}} 被静默渲染为空。 */
  const missing = required.filter((name) => !normalized[name]?.trim()); /* 第52天：检查所有必需变量是否存在且非空。 */
  if (missing.length > 0) throw new PromptRenderError(template.id, missing); /* 第52天：缺失变量时显式失败，避免生成残缺 Prompt。 */
  return template.template.replace(VARIABLE_PATTERN, (_, name: string) => normalized[name] ?? ""); /* 第52天：把每个 {{变量}} 替换为运行时内容。 */
} /* 第52天：结束 Prompt Renderer（提示词渲染器）。 */

export function safeRenderPrompt(template: PromptTemplate | null, variables: Record<string, string | number | boolean | undefined | null>, fallback: string): string { /* 第52天：定义带安全兜底的提示词渲染方法。 */
  if (!template) return fallback; /* 第52天：没有可用模板时返回调用方提供的旧提示词。 */
  try { /* 第52天：捕获变量缺失或模板异常，保证业务运行时不崩溃。 */
    return renderPrompt(template, variables); /* 第52天：正常路径返回渲染后的提示词。 */
  } catch { /* 第52天：渲染异常时进入兜底。 */
    return fallback; /* 第52天：返回旧提示词作为安全文案。 */
  } /* 第52天：结束异常处理。 */
} /* 第52天：结束安全渲染方法。 */
