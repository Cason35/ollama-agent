import type { PromptBlock, PromptBlockMetrics, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入提示词块、构建结果和指标类型。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第54天：复用词元估算函数，保持和 Usage 模块口径一致。 */
function round(value: number, digits = 4): number { /* 第54天：定义指标小数格式化函数。 */
  return Number(value.toFixed(digits)); /* 第54天：按指定精度返回数字，避免页面展示长小数。 */
} /* 第54天：结束指标小数格式化函数。 */
export function calculatePromptBlockMetrics(blocks: PromptBlock[], buildResults: PromptBuildResult[] = []): PromptBlockMetrics { /* 第54天：定义 Prompt Block Metrics（提示词块指标）计算入口。 */
  const renderCount = Math.max(1, buildResults.length); /* 第54天：读取样例组合次数，最少按一次计算避免除零。 */
  const hitCounts = new Map(blocks.map((block) => [block.id, 0])); /* 第54天：为每个块初始化命中次数。 */
  for (const result of buildResults) for (const blockId of result.usedBlockIds) hitCounts.set(blockId, (hitCounts.get(blockId) ?? 0) + 1); /* 第54天：统计每次组合中真正使用的提示词块。 */
  const enabledBlocks = blocks.filter((block) => block.enabled).length; /* 第54天：统计启用中的块数量。 */
  const blockMetrics = blocks.map((block) => { const length = block.template.length; const estimatedTokens = estimateTokenCount(block.template); const hitCount = hitCounts.get(block.id) ?? 0; return { blockId: block.id, blockName: block.name, type: block.type, enabled: block.enabled, order: block.order, weight: block.weight, length, estimatedTokens, hitCount, renderCount, hitRate: round(hitCount / renderCount) }; }); /* 第55天：逐块计算长度、token、权重、命中次数和命中率。 */
  const totalLength = blockMetrics.reduce((sum, block) => sum + block.length, 0); /* 第54天：汇总全部块模板长度。 */
  const totalTokens = blockMetrics.reduce((sum, block) => sum + block.estimatedTokens, 0); /* 第54天：汇总全部块估算词元数。 */
  return { totalBlocks: blocks.length, enabledBlocks, enabledRate: round(enabledBlocks / Math.max(1, blocks.length)), averageLength: round(totalLength / Math.max(1, blocks.length), 2), averageTokens: round(totalTokens / Math.max(1, blocks.length), 2), blocks: blockMetrics }; /* 第54天：返回聚合指标和逐块指标。 */
} /* 第54天：结束 Prompt Block Metrics 计算入口。 */
