import type { PromptBlock } from "@/lib/prompts/prompt-block-types"; /* 第54天：引入提示词块类型，作为注册表存储单元。 */
function cloneBlock(block: PromptBlock): PromptBlock { /* 第54天：定义提示词块浅克隆函数，防止外部修改注册表内部状态。 */
  return { ...block, requiredVariables: [...(block.requiredVariables ?? [])] }; /* 第54天：复制数组字段并保留其余不可变字段。 */
} /* 第54天：结束提示词块浅克隆函数。 */
export class PromptBlockRegistry { /* 第54天：定义 PromptBlockRegistry（提示词块注册表）。 */
  private readonly blocks = new Map<string, PromptBlock>(); /* 第54天：使用 Map 按块 ID 保存全部提示词块。 */
  register(block: PromptBlock): void { /* 第54天：定义注册提示词块的方法。 */
    if (this.blocks.has(block.id)) throw new Error(`PromptBlock 已存在：${block.id}`); /* 第54天：阻止重复 ID 覆盖已有提示词块。 */
    this.blocks.set(block.id, cloneBlock(block)); /* 第54天：写入提示词块副本，保护注册表状态。 */
  } /* 第54天：结束注册提示词块的方法。 */
  get(id: string): PromptBlock | null { /* 第54天：定义按 ID 读取提示词块的方法。 */
    const block = this.blocks.get(id); /* 第54天：从 Map 中读取目标提示词块。 */
    return block ? cloneBlock(block) : null; /* 第54天：命中时返回副本，未命中时返回空值。 */
  } /* 第54天：结束按 ID 读取提示词块的方法。 */
  list(componentId?: string): PromptBlock[] { /* 第54天：定义列出全部或指定组件提示词块的方法。 */
    return Array.from(this.blocks.values()).filter((block) => !componentId || !block.componentId || block.componentId === componentId).map(cloneBlock).sort(sortBlocks); /* 第54天：按组件过滤、克隆并按 order 稳定排序。 */
  } /* 第54天：结束列出提示词块的方法。 */
  enable(id: string): void { /* 第54天：定义启用提示词块的方法。 */
    const block = this.blocks.get(id); /* 第54天：读取目标提示词块。 */
    if (!block) throw new Error(`无法启用不存在的 PromptBlock：${id}`); /* 第54天：目标不存在时抛出明确错误。 */
    this.blocks.set(id, { ...block, enabled: true }); /* 第54天：把目标块标记为启用。 */
  } /* 第54天：结束启用提示词块的方法。 */
  disable(id: string): void { /* 第54天：定义禁用提示词块的方法。 */
    const block = this.blocks.get(id); /* 第54天：读取目标提示词块。 */
    if (!block) throw new Error(`无法禁用不存在的 PromptBlock：${id}`); /* 第54天：目标不存在时抛出明确错误。 */
    this.blocks.set(id, { ...block, enabled: false }); /* 第54天：把目标块标记为禁用。 */
  } /* 第54天：结束禁用提示词块的方法。 */
} /* 第54天：结束 PromptBlockRegistry（提示词块注册表）。 */
export function sortBlocks(left: PromptBlock, right: PromptBlock): number { /* 第54天：定义提示词块稳定排序函数。 */
  return left.order - right.order || left.id.localeCompare(right.id, "zh-CN"); /* 第54天：优先按 order 排序，相同顺序时按 ID 排序保证可复现。 */
} /* 第54天：结束提示词块稳定排序函数。 */
