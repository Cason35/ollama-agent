export type PromptComponentType = "agent" | "tool" | "reflection" | "evaluation" | "supervisor"; /* 第52天：定义 Prompt（提示词）所属组件类型。 */

export type PromptStatus = "draft" | "active" | "archived"; /* 第52天：定义 Prompt（提示词）生命周期状态。 */

export type PromptTemplate = { /* 第52天：定义可版本化、可渲染、可激活和可归档的提示词模板。 */
  id: string; /* 第52天：保存 Prompt（提示词）的唯一标识，例如 research.v3。 */
  name: string; /* 第52天：保存 Prompt（提示词）的人类可读名称。 */
  componentType: PromptComponentType; /* 第52天：保存使用该 Prompt（提示词）的组件类型。 */
  componentId: string; /* 第52天：保存使用该 Prompt（提示词）的组件 ID。 */
  version: string; /* 第52天：保存 Prompt Version（提示词版本），例如 v1、v2、v3。 */
  template: string; /* 第52天：保存带变量占位符的 Prompt Template（提示词模板）正文。 */
  variables: string[]; /* 第52天：保存模板要求注入的变量名列表。 */
  status: PromptStatus; /* 第52天：保存当前版本是草稿、启用中还是已归档。 */
  createdAt: number; /* 第52天：保存提示词版本创建时间戳。 */
  updatedAt: number; /* 第52天：保存提示词版本最近更新时间戳。 */
  source?: string; /* 第52天：可选保存提示词来源，便于追踪从代码、实验或人工评审而来。 */
  score?: number; /* 第52天：可选保存最近评估分，便于和回归评估建立关联。 */
  costEstimate?: number; /* 第52天：可选保存最近成本估算，便于 Prompt ROI（提示词投资回报）分析。 */
}; /* 第52天：结束 PromptTemplate（提示词模板）类型定义。 */

export type PromptDiffKind = "added" | "removed" | "unchanged"; /* 第52天：定义提示词行级差异类型。 */

export type PromptDiffLine = { /* 第52天：定义提示词 diff（差异对比）中的一行。 */
  kind: PromptDiffKind; /* 第52天：保存当前行是新增、删除还是不变。 */
  text: string; /* 第52天：保存行内容。 */
  lineNumber?: number; /* 第52天：保存原始行号，新增行可来自候选版本。 */
}; /* 第52天：结束提示词差异行类型。 */

export type PromptComparison = { /* 第52天：定义两个提示词版本的对比结果。 */
  componentId: string; /* 第52天：保存对比所属组件 ID。 */
  baselineVersion: string; /* 第52天：保存基线提示词版本。 */
  candidateVersion: string; /* 第52天：保存候选提示词版本。 */
  addedLines: string[]; /* 第52天：保存候选版本新增行。 */
  removedLines: string[]; /* 第52天：保存候选版本删除行。 */
  diff: PromptDiffLine[]; /* 第52天：保存完整行级 diff。 */
}; /* 第52天：结束提示词版本对比类型。 */

export type PromptVariableContract = { /* 第52天增强：定义组件提示词允许使用的变量契约。 */
  componentId: string; /* 第52天增强：保存契约所属组件 ID。 */
  componentType: PromptComponentType; /* 第52天增强：保存契约所属组件类型。 */
  requiredVariables: string[]; /* 第52天增强：保存模板必须出现的变量。 */
  optionalVariables: string[]; /* 第52天增强：保存模板可以按需使用的变量。 */
  description: string; /* 第52天增强：保存变量契约的人类可读说明。 */
}; /* 第52天增强：结束变量契约类型。 */

export type PromptValidationIssueCode = "unknown-variable" | "missing-required-variable" | "undeclared-variable" | "unused-declared-variable" | "duplicate-variable" | "empty-template" | "empty-version"; /* 第52天增强：定义提示词校验问题代码。 */

export type PromptValidationIssue = { /* 第52天增强：定义单条提示词校验问题。 */
  code: PromptValidationIssueCode; /* 第52天增强：保存机器可识别的问题代码。 */
  variable?: string; /* 第52天增强：保存问题关联变量。 */
  message: string; /* 第52天增强：保存用户可读的问题描述。 */
}; /* 第52天增强：结束提示词校验问题类型。 */

export type PromptValidationResult = { /* 第52天增强：定义提示词模板校验结果。 */
  valid: boolean; /* 第52天增强：保存模板是否通过校验。 */
  componentId: string; /* 第52天增强：保存被校验组件 ID。 */
  allowedVariables: string[]; /* 第52天增强：保存该组件允许使用的全部变量。 */
  requiredVariables: string[]; /* 第52天增强：保存该组件必须使用的变量。 */
  templateVariables: string[]; /* 第52天增强：保存从模板正文提取出的变量。 */
  declaredVariables: string[]; /* 第52天增强：保存 PromptTemplate.variables 声明的变量。 */
  issues: PromptValidationIssue[]; /* 第52天增强：保存全部校验问题。 */
}; /* 第52天增强：结束提示词模板校验结果类型。 */

export type PromptMutationInput = { /* 第52天增强：定义新增或编辑提示词的输入结构。 */
  id?: string; /* 第52天增强：保存可选提示词 ID，缺省时由组件和版本生成。 */
  name: string; /* 第52天增强：保存提示词名称。 */
  componentType: PromptComponentType; /* 第52天增强：保存组件类型。 */
  componentId: string; /* 第52天增强：保存组件 ID。 */
  version: string; /* 第52天增强：保存提示词版本。 */
  template: string; /* 第52天增强：保存模板正文。 */
  variables: string[]; /* 第52天增强：保存模板变量声明。 */
  status: PromptStatus; /* 第52天增强：保存期望生命周期状态。 */
  source?: string; /* 第52天增强：保存提示词来源。 */
  score?: number; /* 第52天增强：保存可选评估分。 */
  costEstimate?: number; /* 第52天增强：保存可选成本估算。 */
}; /* 第52天增强：结束提示词新增或编辑输入结构。 */

export type PromptPreviewResult = { /* 第52天增强：定义提示词编辑预览结果。 */
  draft: PromptTemplate; /* 第52天增强：保存待保存或待比较的草稿模板。 */
  validation: PromptValidationResult; /* 第52天增强：保存草稿模板校验结果。 */
  comparison: PromptComparison | null; /* 第52天增强：保存草稿与当前 active 版本的差异对比。 */
  renderedPreview: string | null; /* 第52天增强：保存使用样例变量渲染后的预览文本。 */
}; /* 第52天增强：结束提示词编辑预览结果。 */

export type PromptRegistryMetrics = { /* 第52天：定义 Prompt Registry（提示词注册表）指标。 */
  totalPrompts: number; /* 第52天：保存所有提示词版本数量。 */
  activePrompts: number; /* 第52天：保存 active（启用中）版本数量。 */
  draftPrompts: number; /* 第52天：保存 draft（草稿）版本数量。 */
  archivedPrompts: number; /* 第52天：保存 archived（已归档）版本数量。 */
  componentCount: number; /* 第52天：保存纳入注册表管理的组件数量。 */
}; /* 第52天：结束注册表指标类型。 */

export type PromptRegressionLink = { /* 第52天：定义 Prompt Regression Link（提示词回归关联）。 */
  componentId: string; /* 第52天：保存回归对比所属组件 ID。 */
  baselinePromptId: string; /* 第52天：保存基线提示词 ID。 */
  candidatePromptId: string; /* 第52天：保存候选提示词 ID。 */
  baselineVersion: string; /* 第52天：保存基线提示词版本。 */
  candidateVersion: string; /* 第52天：保存候选提示词版本。 */
  result: "passed" | "failed"; /* 第52天：保存候选版本是否通过回归。 */
  scoreDelta: number; /* 第52天：保存候选版本相对基线的评分变化。 */
  costDeltaPercent: number; /* 第52天：保存候选版本相对基线的成本变化百分比。 */
}; /* 第52天：结束提示词回归关联类型。 */

export type PromptDashboardSnapshot = { /* 第52天：定义 Prompt Explorer（提示词浏览器）接口快照。 */
  prompts: PromptTemplate[]; /* 第52天：保存全部提示词模板版本。 */
  activePrompts: PromptTemplate[]; /* 第52天：保存每个组件当前 active（启用中）版本。 */
  metrics: PromptRegistryMetrics; /* 第52天：保存注册表聚合指标。 */
  comparison: PromptComparison; /* 第52天：保存默认研究提示词 v2 与 v3 的差异对比。 */
  contracts: PromptVariableContract[]; /* 第52天增强：保存所有内置组件的变量契约。 */
  validationResults: Record<string, PromptValidationResult>; /* 第52天增强：保存每个提示词版本的模板校验结果。 */
  regressionLinks: PromptRegressionLink[]; /* 第52天：保存提示词版本与回归评估之间的关联。 */
  renderedPreview: string; /* 第52天：保存一个使用真实变量渲染后的提示词预览。 */
  generatedAt: number; /* 第52天：保存快照生成时间。 */
}; /* 第52天：结束 Prompt Explorer 快照类型。 */
