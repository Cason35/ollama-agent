export type PromptBlockType = "system" | "memory" | "workspace" | "tool" | "task" | "output"; /* 第54天：定义提示词块的业务类型，覆盖系统、记忆、工作空间、工具、任务和输出格式。 */
export type PromptBlock = { /* 第54天：定义 PromptBlock（提示词块）基础结构。 */
  id: string; /* 第54天：保存提示词块唯一标识，便于注册表、Diff 和指标引用。 */
  name: string; /* 第54天：保存提示词块展示名称，便于 Prompt Explorer 阅读。 */
  type: PromptBlockType; /* 第54天：保存提示词块类型，便于按生命周期顺序理解组合结果。 */
  template: string; /* 第54天：保存提示词块模板正文，支持 {{variable}} 变量渲染。 */
  enabled: boolean; /* 第54天：保存提示词块是否启用，禁用块会被 PromptBuilder 跳过。 */
  order: number; /* 第54天：保存提示词块排序号，PromptBuilder 会按该字段稳定组合。 */
  componentId?: string; /* 第54天：可选保存块所属组件，通用块不填写时可被多个 Agent 复用。 */
  requiredVariables?: string[]; /* 第54天：可选保存块必须依赖的变量，缺失时可触发条件跳过。 */
  skipIfMissing?: boolean; /* 第54天：保存上下文缺失时是否自动跳过，用于 memory、workspace 和 tool 这类条件块。 */
  sourcePromptId?: string; /* 第54天：可选保存块由哪个 Prompt Version 派生，便于从旧模板迁移到组合块。 */
  description?: string; /* 第54天：可选保存人类可读说明，便于在 Prompt Block Explorer 展示。 */
}; /* 第54天：结束 PromptBlock（提示词块）结构定义。 */
export type PromptBlockRenderRecord = { /* 第54天：定义单个块在一次组合中的渲染记录。 */
  blockId: string; /* 第54天：保存被处理的提示词块 ID。 */
  blockName: string; /* 第54天：保存被处理的提示词块名称。 */
  blockType: PromptBlockType; /* 第54天：保存被处理的提示词块类型。 */
  enabled: boolean; /* 第54天：保存处理时该块是否启用。 */
  skipped: boolean; /* 第54天：保存该块是否被跳过。 */
  skipReason?: string; /* 第54天：可选保存跳过原因，例如禁用或缺少变量。 */
  missingVariables: string[]; /* 第54天：保存该块缺失的变量列表，便于测试条件块。 */
  renderedText: string; /* 第54天：保存该块渲染后的正文，跳过时为空字符串。 */
  length: number; /* 第54天：保存渲染后正文长度，用于 Block Metrics。 */
  estimatedTokens: number; /* 第54天：保存渲染后正文的估算词元数，用于成本意识。 */
}; /* 第54天：结束提示词块渲染记录定义。 */
export type PromptBuildResult = { /* 第54天：定义 PromptBuilder（提示词构建器）的可观测输出。 */
  text: string; /* 第54天：保存最终组合出的完整提示词正文。 */
  usedBlockIds: string[]; /* 第54天：保存实际命中的块 ID 列表。 */
  skippedBlockIds: string[]; /* 第54天：保存被禁用或条件跳过的块 ID 列表。 */
  records: PromptBlockRenderRecord[]; /* 第54天：保存每个块的处理记录，供 Explorer 和测试使用。 */
}; /* 第54天：结束 PromptBuilder 可观测输出定义。 */
export type PromptBlockFieldChange = { /* 第54天：定义块级字段变化记录。 */
  field: "name" | "type" | "template" | "enabled" | "order"; /* 第54天：保存发生变化的字段名称。 */
  before: string | number | boolean; /* 第54天：保存基线块中的旧值。 */
  after: string | number | boolean; /* 第54天：保存候选块中的新值。 */
}; /* 第54天：结束块级字段变化记录定义。 */
export type PromptBlockComparison = { /* 第54天：定义两个 PromptBlock 的差异对比结果。 */
  baselineBlockId: string; /* 第54天：保存基线提示词块 ID。 */
  candidateBlockId: string; /* 第54天：保存候选提示词块 ID。 */
  changes: PromptBlockFieldChange[]; /* 第54天：保存名称、类型、正文、启用状态和顺序变化。 */
  addedLines: string[]; /* 第54天：保存候选块模板中新增的行。 */
  removedLines: string[]; /* 第54天：保存候选块模板中删除的行。 */
}; /* 第54天：结束 PromptBlock Diff 结果定义。 */
export type PromptBlockMetric = { /* 第54天：定义单个提示词块的指标。 */
  blockId: string; /* 第54天：保存提示词块 ID。 */
  blockName: string; /* 第54天：保存提示词块名称。 */
  type: PromptBlockType; /* 第54天：保存提示词块类型。 */
  enabled: boolean; /* 第54天：保存提示词块是否启用。 */
  order: number; /* 第54天：保存提示词块排序号。 */
  length: number; /* 第54天：保存提示词块模板长度。 */
  estimatedTokens: number; /* 第54天：保存提示词块模板估算词元数。 */
  hitCount: number; /* 第54天：保存样例组合中该块被命中的次数。 */
  renderCount: number; /* 第54天：保存样例组合总次数，用于计算命中率。 */
  hitRate: number; /* 第54天：保存该块命中率，范围 0 到 1。 */
}; /* 第54天：结束单个提示词块指标定义。 */
export type PromptBlockMetrics = { /* 第54天：定义提示词块指标聚合结果。 */
  totalBlocks: number; /* 第54天：保存提示词块总数。 */
  enabledBlocks: number; /* 第54天：保存启用中的提示词块数量。 */
  enabledRate: number; /* 第54天：保存启用率，范围 0 到 1。 */
  averageLength: number; /* 第54天：保存平均块长度。 */
  averageTokens: number; /* 第54天：保存平均估算词元数。 */
  blocks: PromptBlockMetric[]; /* 第54天：保存每个提示词块的明细指标。 */
}; /* 第54天：结束提示词块指标聚合结果定义。 */
