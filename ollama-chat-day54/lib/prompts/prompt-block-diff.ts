import type { PromptBlock, PromptBlockComparison, PromptBlockFieldChange } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入提示词块与块差异结果类型。 */
function splitLines(template: string): string[] { /* 第54天：定义模板正文拆行函数。 */
  return template.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); /* 第54天：按换行拆分、清理空白并去掉空行，生成可读 Diff 行。 */
} /* 第54天：结束模板正文拆行函数。 */
function changed(field: PromptBlockFieldChange["field"], before: string | number | boolean, after: string | number | boolean): PromptBlockFieldChange | null { /* 第54天：定义字段变化生成函数。 */
  return before === after ? null : { field, before, after }; /* 第54天：字段相同返回空，不同则返回变化记录。 */
} /* 第54天：结束字段变化生成函数。 */
export function comparePromptBlocks(baseline: PromptBlock, candidate: PromptBlock): PromptBlockComparison { /* 第54天：定义 PromptBlock Diff（提示词块差异）入口。 */
  const changes = [changed("name", baseline.name, candidate.name), changed("type", baseline.type, candidate.type), changed("template", baseline.template, candidate.template), changed("enabled", baseline.enabled, candidate.enabled), changed("order", baseline.order, candidate.order)].filter((item): item is PromptBlockFieldChange => Boolean(item)); /* 第54天：收集名称、类型、正文、启用状态和顺序变化。 */
  const baselineLines = splitLines(baseline.template); /* 第54天：读取基线块模板行。 */
  const candidateLines = splitLines(candidate.template); /* 第54天：读取候选块模板行。 */
  const addedLines = candidateLines.filter((line) => !baselineLines.includes(line)); /* 第54天：计算候选块新增行。 */
  const removedLines = baselineLines.filter((line) => !candidateLines.includes(line)); /* 第54天：计算候选块删除行。 */
  return { baselineBlockId: baseline.id, candidateBlockId: candidate.id, changes, addedLines, removedLines }; /* 第54天：返回完整提示词块差异结果。 */
} /* 第54天：结束 PromptBlock Diff 入口。 */
