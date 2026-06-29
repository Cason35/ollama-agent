import type { PromptBlock, PromptBlockRenderRecord, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入提示词块与构建结果类型。 */
import { sortBlocks } from "@/lib/prompts/prompt-block-registry"; /* 第54天：复用注册表排序规则，保证 UI 与运行时顺序一致。 */
import { extractTemplateVariables } from "@/lib/prompts/prompt-renderer"; /* 第54天：复用已有变量提取器，避免新旧模板语法不一致。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第54天：复用词元估算能力，为 Block Metrics 提供 token 数据。 */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g; /* 第54天：定义 PromptBlock 模板变量匹配规则。 */
type PromptVariables = Record<string, string | number | boolean | undefined | null>; /* 第54天：定义 PromptBuilder 接收的运行时变量字典。 */
function hasValue(value: string | number | boolean | undefined | null): boolean { /* 第54天：定义条件块变量是否存在的判断函数。 */
  if (value == null) return false; /* 第54天：null 和 undefined 视为缺失。 */
  if (typeof value === "string") return value.trim().length > 0; /* 第54天：空字符串视为缺失，非空字符串视为存在。 */
  return true; /* 第54天：数字和布尔值都视为有效上下文。 */
} /* 第54天：结束变量存在性判断函数。 */
function stringifyValue(value: string | number | boolean | undefined | null): string { /* 第54天：定义变量值转字符串函数。 */
  return value == null ? "" : String(value); /* 第54天：空值渲染为空字符串，其余值按字符串写入模板。 */
} /* 第54天：结束变量值转字符串函数。 */
function requiredVariables(block: PromptBlock): string[] { /* 第54天：定义读取块必需变量的函数。 */
  return block.requiredVariables?.length ? block.requiredVariables : extractTemplateVariables(block.template); /* 第54天：优先使用显式声明，未声明时从模板占位符提取。 */
} /* 第54天：结束读取块必需变量的函数。 */
function missingVariables(block: PromptBlock, variables: PromptVariables): string[] { /* 第54天：定义计算块缺失变量的函数。 */
  return requiredVariables(block).filter((variable) => !hasValue(variables[variable])); /* 第54天：过滤出运行时变量中不存在或为空的必需变量。 */
} /* 第54天：结束计算块缺失变量的函数。 */
function canSkip(block: PromptBlock): boolean { /* 第54天：定义提示词块是否允许条件跳过的函数。 */
  return block.skipIfMissing === true || block.type === "memory" || block.type === "workspace" || block.type === "tool"; /* 第54天：显式可跳过或上下文型块缺失时允许跳过。 */
} /* 第54天：结束条件跳过判断函数。 */
function renderTemplate(template: string, variables: PromptVariables): string { /* 第54天：定义模板变量替换函数。 */
  return template.replace(VARIABLE_PATTERN, (_match, name: string) => stringifyValue(variables[name])); /* 第54天：把每个 {{variable}} 替换成运行时变量。 */
} /* 第54天：结束模板变量替换函数。 */
function sectionTitle(block: PromptBlock): string { /* 第54天：定义组合后每个块的标题格式。 */
  return `## ${block.name}（${block.type}）`; /* 第54天：用块名称和块类型标出组合边界，便于调试最终 Prompt。 */
} /* 第54天：结束块标题格式函数。 */
function renderRecord(block: PromptBlock, renderedText: string, skipped: boolean, skipReason: string | undefined, missing: string[]): PromptBlockRenderRecord { /* 第54天：定义生成单块渲染记录的函数。 */
  return { blockId: block.id, blockName: block.name, blockType: block.type, enabled: block.enabled, skipped, skipReason, missingVariables: missing, renderedText, length: renderedText.length, estimatedTokens: estimateTokenCount(renderedText) }; /* 第54天：返回包含长度和 token 估算的完整记录。 */
} /* 第54天：结束单块渲染记录生成函数。 */
export class PromptBuilder { /* 第54天：定义 PromptBuilder（提示词构建器）。 */
  buildPrompt(blocks: PromptBlock[], variables: PromptVariables): string { /* 第54天：定义符合任务要求的 buildPrompt(blocks, variables) 字符串入口。 */
    return this.buildPromptWithReport(blocks, variables).text; /* 第54天：复用可观测构建入口并只返回最终 Prompt 正文。 */
  } /* 第54天：结束 buildPrompt 字符串入口。 */
  buildPromptWithReport(blocks: PromptBlock[], variables: PromptVariables): PromptBuildResult { /* 第54天：定义带渲染报告的提示词构建入口。 */
    const records: PromptBlockRenderRecord[] = []; /* 第54天：初始化每个提示词块的处理记录数组。 */
    for (const block of [...blocks].sort(sortBlocks)) { /* 第54天：按 order 稳定遍历全部提示词块。 */
      if (!block.enabled) { records.push(renderRecord(block, "", true, "block disabled", [])); continue; } /* 第54天：禁用块直接跳过并记录原因。 */
      const missing = missingVariables(block, variables); /* 第54天：计算当前块缺失的变量。 */
      if (missing.length > 0 && canSkip(block)) { records.push(renderRecord(block, "", true, `missing variables: ${missing.join(", ")}`, missing)); continue; } /* 第54天：条件块缺少上下文时自动跳过。 */
      const rendered = renderTemplate(block.template, variables).trim(); /* 第54天：渲染当前块模板并清理首尾空白。 */
      records.push(renderRecord(block, rendered, false, undefined, missing)); /* 第54天：记录正常渲染块，即使非条件块有缺失变量也会显式记录。 */
    } /* 第54天：结束提示词块遍历。 */
    const usedRecords = records.filter((record) => !record.skipped); /* 第54天：筛选实际参与最终 Prompt 的块。 */
    const text = usedRecords.map((record) => `${sectionTitle({ id: record.blockId, name: record.blockName, type: record.blockType, template: record.renderedText, enabled: record.enabled, order: 0 })}\n${record.renderedText}`).join("\n\n"); /* 第54天：把命中块按标题和正文组合成最终 Prompt。 */
    return { text, usedBlockIds: usedRecords.map((record) => record.blockId), skippedBlockIds: records.filter((record) => record.skipped).map((record) => record.blockId), records }; /* 第54天：返回最终 Prompt 与完整块处理报告。 */
  } /* 第54天：结束带渲染报告的提示词构建入口。 */
} /* 第54天：结束 PromptBuilder（提示词构建器）。 */
export const promptBuilder = new PromptBuilder(); /* 第54天：导出共享 PromptBuilder 单例，方便运行时和看板复用。 */
