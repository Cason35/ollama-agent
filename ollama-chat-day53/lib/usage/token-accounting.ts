import type { UsageComponentType } from "@/lib/usage/usage-types"; /* 第47天：引入组件类型以选择对应价格。 */

type ComponentPrice = { inputPerMillion: number; outputPerMillion: number }; /* 第47天：定义每百万输入与输出词元的美元价格。 */

const COMPONENT_PRICES: Record<UsageComponentType, ComponentPrice> = { /* 第47天：定义教学演示使用的组件分层估算价格。 */
  agent: { inputPerMillion: 0.15, outputPerMillion: 0.6 }, /* 第47天：设置业务智能体输入与输出价格。 */
  tool: { inputPerMillion: 0.02, outputPerMillion: 0.05 }, /* 第47天：设置工具资源折算价格。 */
  reflection: { inputPerMillion: 0.12, outputPerMillion: 0.45 }, /* 第47天：设置反思智能体输入与输出价格。 */
  evaluation: { inputPerMillion: 0.1, outputPerMillion: 0.4 }, /* 第47天：设置评估智能体输入与输出价格。 */
}; /* 第47天：结束组件价格表定义。 */

export function estimateTokenCount(text: string): number { /* 第47天：定义无需外部 tokenizer 的稳定词元估算函数。 */
  const normalized = text.trim(); /* 第47天：移除首尾空白，避免空文本产生虚假词元。 */
  if (!normalized) return 0; /* 第47天：空文本直接返回零词元。 */
  const chineseCharacters = normalized.match(/[\u3400-\u9fff]/g)?.length ?? 0; /* 第47天：统计通常接近单词元的中文字符数。 */
  const nonChineseText = normalized.replace(/[\u3400-\u9fff]/g, " "); /* 第47天：移除中文字符后单独估算英文与符号。 */
  const latinWords = nonChineseText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0; /* 第47天：统计英文词、数字和独立符号数量。 */
  return Math.max(1, chineseCharacters + Math.ceil(latinWords * 1.25)); /* 第47天：返回确定性近似词元数并保证非空文本至少为一。 */
} /* 第47天：结束词元估算函数。 */

export function estimateUsageCost(componentType: UsageComponentType, inputTokens: number, outputTokens: number): number { /* 第47天：定义按组件价格估算调用费用的函数。 */
  const price = COMPONENT_PRICES[componentType]; /* 第47天：读取目标组件的输入与输出价格。 */
  const inputCost = Math.max(0, inputTokens) / 1_000_000 * price.inputPerMillion; /* 第47天：计算输入词元费用。 */
  const outputCost = Math.max(0, outputTokens) / 1_000_000 * price.outputPerMillion; /* 第47天：计算输出词元费用。 */
  return Number((inputCost + outputCost).toFixed(8)); /* 第47天：返回保留八位小数的美元估算费用。 */
} /* 第47天：结束调用费用估算函数。 */
