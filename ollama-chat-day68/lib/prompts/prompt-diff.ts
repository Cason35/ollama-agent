import type { PromptComparison, PromptDiffLine, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天：引入提示词对比与模板类型。 */

function splitLines(text: string): string[] { /* 第52天：定义把提示词正文切成稳定行数组的方法。 */
  return text.trim().split(/\r?\n/).map((line) => line.trimEnd()); /* 第52天：兼容 Windows 和 Unix 换行，并保留行首缩进语义。 */
} /* 第52天：结束行切分方法。 */

function createMatrix(rows: number, cols: number): number[][] { /* 第52天：定义 LCS（最长公共子序列）动态规划矩阵创建函数。 */
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0)); /* 第52天：创建指定尺寸且默认值为 0 的二维数组。 */
} /* 第52天：结束矩阵创建函数。 */

export function diffPromptText(baselineText: string, candidateText: string): PromptDiffLine[] { /* 第52天：定义行级 Prompt Diff（提示词差异对比）函数。 */
  const baseline = splitLines(baselineText); /* 第52天：读取基线版本行数组。 */
  const candidate = splitLines(candidateText); /* 第52天：读取候选版本行数组。 */
  const matrix = createMatrix(baseline.length + 1, candidate.length + 1); /* 第52天：创建 LCS 计算矩阵。 */
  for (let i = baseline.length - 1; i >= 0; i -= 1) { /* 第52天：从后往前遍历基线行。 */
    for (let j = candidate.length - 1; j >= 0; j -= 1) { /* 第52天：从后往前遍历候选行。 */
      matrix[i][j] = baseline[i] === candidate[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]); /* 第52天：相同行推进公共序列，否则取更长路径。 */
    } /* 第52天：结束候选行遍历。 */
  } /* 第52天：结束基线行遍历。 */
  const diff: PromptDiffLine[] = []; /* 第52天：初始化最终差异行列表。 */
  let i = 0; /* 第52天：初始化基线游标。 */
  let j = 0; /* 第52天：初始化候选游标。 */
  while (i < baseline.length && j < candidate.length) { /* 第52天：同时遍历两版文本。 */
    if (baseline[i] === candidate[j]) { diff.push({ kind: "unchanged", text: baseline[i], lineNumber: i + 1 }); i += 1; j += 1; continue; } /* 第52天：相同行直接记录为 unchanged。 */
    if (matrix[i + 1][j] >= matrix[i][j + 1]) { diff.push({ kind: "removed", text: baseline[i], lineNumber: i + 1 }); i += 1; continue; } /* 第52天：基线侧更优时记录删除行。 */
    diff.push({ kind: "added", text: candidate[j], lineNumber: j + 1 }); /* 第52天：候选侧更优时记录新增行。 */
    j += 1; /* 第52天：推进候选游标。 */
  } /* 第52天：结束双游标遍历。 */
  while (i < baseline.length) { diff.push({ kind: "removed", text: baseline[i], lineNumber: i + 1 }); i += 1; } /* 第52天：剩余基线行全部视为删除。 */
  while (j < candidate.length) { diff.push({ kind: "added", text: candidate[j], lineNumber: j + 1 }); j += 1; } /* 第52天：剩余候选行全部视为新增。 */
  return diff; /* 第52天：返回完整行级差异。 */
} /* 第52天：结束行级 Prompt Diff 函数。 */

export function comparePromptTemplates(baseline: PromptTemplate, candidate: PromptTemplate): PromptComparison { /* 第52天：定义提示词模板版本对比函数。 */
  const diff = diffPromptText(baseline.template, candidate.template); /* 第52天：生成基线与候选的行级差异。 */
  const addedLines = diff.filter((line) => line.kind === "added").map((line) => line.text); /* 第52天：提取新增行列表。 */
  const removedLines = diff.filter((line) => line.kind === "removed").map((line) => line.text); /* 第52天：提取删除行列表。 */
  return { componentId: candidate.componentId, baselineVersion: baseline.version, candidateVersion: candidate.version, addedLines, removedLines, diff }; /* 第52天：返回完整对比结果。 */
} /* 第52天：结束提示词模板对比函数。 */
