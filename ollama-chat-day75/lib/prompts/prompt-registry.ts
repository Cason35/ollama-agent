import { validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第52天增强：引入模板校验器，避免错误变量被保存或激活。 */
import type { PromptRegistryMetrics, PromptTemplate } from "@/lib/prompts/prompt-types"; /* 第52天：引入提示词模板与注册表指标类型。 */
import type { ProductionPrompt, ProductionPromptStatus } from "@/lib/prompts/production-prompt-types"; // 第67天：引入生产提示词资产与生命周期状态类型。
import { syncProductionPromptToUnifiedRegistry, syncPromptToUnifiedRegistry } from "@/lib/registry/registry-adapters"; /* 第67天：引入教学提示词和生产提示词统一注册同步适配器。 */
import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; /* 第66天：引入可选统一注册中心类型以保持提示词调用兼容。 */

function promptKey(componentId: string, version: string): string { /* 第52天：定义组件与版本组合键生成函数。 */
  return `${componentId}::${version}`; /* 第52天：使用稳定分隔符避免 componentId 和 version 混淆。 */
} /* 第52天：结束组合键生成函数。 */

function clonePrompt(prompt: PromptTemplate): PromptTemplate { /* 第52天：定义提示词模板浅克隆函数。 */
  return { ...prompt, variables: [...prompt.variables] }; /* 第52天：复制变量数组，避免调用方修改注册表内部状态。 */
} /* 第52天：结束提示词克隆函数。 */

function productionPromptKey(agentId: string, version: string): string { // 第67天：定义生产提示词的智能体版本组合键。
  return `${agentId}::${version}`; // 第67天：使用稳定分隔符支持每个智能体多版本共存。
} // 第67天：结束生产提示词组合键函数。

function cloneProductionPrompt(prompt: ProductionPrompt): ProductionPrompt { // 第67天：定义生产提示词防御性复制函数。
  return { ...prompt, capabilities: [...prompt.capabilities], blocks: prompt.blocks.map((block) => ({ ...block, requiredVariables: block.requiredVariables ? [...block.requiredVariables] : undefined })) }; // 第67天：复制能力列表、提示词块和变量数组避免污染注册表内部状态。
} // 第67天：结束生产提示词防御性复制函数。

export class PromptRegistry { /* 第52天：定义 PromptRegistry（提示词注册表）。 */
  private readonly prompts = new Map<string, PromptTemplate>(); /* 第52天：使用内存 Map 保存教学项目中的提示词版本。 */
  private readonly productionPrompts = new Map<string, ProductionPrompt>(); // 第67天：使用独立 Map 保存生产提示词资产并保持旧接口兼容。

  constructor(private readonly unifiedRegistry?: UnifiedRegistry) {} /* 第66天：允许可选注入统一注册中心且保留历史无参构造。 */

  register(prompt: PromptTemplate): void { /* 第52天：定义注册提示词版本的方法。 */
    this.assertValidPrompt(prompt, false); /* 第52天增强：注册前校验变量契约，归档遗留版本允许保留。 */
    const key = promptKey(prompt.componentId, prompt.version); /* 第52天：生成组件版本组合键。 */
    if (this.prompts.has(key)) throw new Error(`Prompt 已存在：${prompt.componentId}.${prompt.version}`); /* 第52天：阻止同组件同版本重复注册。 */
    if (prompt.status === "active") this.deactivateOtherVersions(prompt.componentId, prompt.version); /* 第52天：注册 active 版本时确保同组件只有一个 active。 */
    this.prompts.set(key, clonePrompt(prompt)); /* 第52天：把模板副本写入注册表。 */
    syncPromptToUnifiedRegistry(prompt, this.unifiedRegistry); /* 第66天：同步提示词组件、版本、状态、变量和依赖发现元数据。 */
  } /* 第52天：结束注册方法。 */

  upsert(prompt: PromptTemplate): void { /* 第52天增强：定义新增或编辑提示词版本的方法。 */
    this.assertValidPrompt(prompt, false); /* 第52天增强：保存前校验变量契约，归档版本允许作为历史记录保留。 */
    const key = promptKey(prompt.componentId, prompt.version); /* 第52天增强：生成组件版本组合键。 */
    if (prompt.status === "active") this.deactivateOtherVersions(prompt.componentId, prompt.version); /* 第52天增强：保存 active 版本时保持同组件唯一 active。 */
    this.prompts.set(key, clonePrompt(prompt)); /* 第52天增强：写入新版本或覆盖已有版本。 */
    syncPromptToUnifiedRegistry(prompt, this.unifiedRegistry); /* 第66天：编辑后覆盖同步统一注册项并刷新启用状态。 */
  } /* 第52天增强：结束新增或编辑提示词版本方法。 */

  getActive(componentId: string): PromptTemplate | null { /* 第52天：定义读取某组件 active（启用中）版本的方法。 */
    const match = this.list(componentId).find((prompt) => prompt.status === "active") ?? null; /* 第52天：在该组件全部版本中查找 active。 */
    return match ? clonePrompt(match) : null; /* 第52天：返回副本或空值。 */
  } /* 第52天：结束 active 版本读取方法。 */

  getVersion(componentId: string, version: string): PromptTemplate | null { /* 第52天：定义按组件与版本读取提示词的方法。 */
    const prompt = this.prompts.get(promptKey(componentId, version)); /* 第52天：按组合键从注册表读取。 */
    return prompt ? clonePrompt(prompt) : null; /* 第52天：返回副本或空值。 */
  } /* 第52天：结束指定版本读取方法。 */

  list(componentId?: string): PromptTemplate[] { /* 第52天：定义列出全部或某组件提示词版本的方法。 */
    return Array.from(this.prompts.values()).filter((prompt) => !componentId || prompt.componentId === componentId).map(clonePrompt).sort(this.sortPrompts); /* 第52天：筛选、克隆并按组件与版本排序。 */
  } /* 第52天：结束列出提示词方法。 */

  activate(componentId: string, version: string): void { /* 第52天：定义激活指定提示词版本的方法。 */
    const key = promptKey(componentId, version); /* 第52天：生成目标版本组合键。 */
    const target = this.prompts.get(key); /* 第52天：读取目标提示词版本。 */
    if (!target) throw new Error(`无法激活不存在的 Prompt：${componentId}.${version}`); /* 第52天：目标不存在时抛出明确错误。 */
    this.assertValidPrompt(target, true); /* 第52天增强：激活前严格校验模板变量，阻止 {{task1}} 这类错误上线。 */
    this.deactivateOtherVersions(componentId, version); /* 第52天：先把同组件其他 active 版本归档。 */
    this.prompts.set(key, { ...target, status: "active", updatedAt: Date.now() }); /* 第52天：把目标版本切换为 active 并刷新更新时间。 */
    syncPromptToUnifiedRegistry({ ...target, status: "active", updatedAt: Date.now() }, this.unifiedRegistry); /* 第66天：把新激活版本同步为可被能力发现的注册项。 */
  } /* 第52天：结束激活方法。 */

  archive(componentId: string, version: string): void { /* 第52天：定义归档指定提示词版本的方法。 */
    const key = promptKey(componentId, version); /* 第52天：生成目标版本组合键。 */
    const target = this.prompts.get(key); /* 第52天：读取目标提示词版本。 */
    if (!target) throw new Error(`无法归档不存在的 Prompt：${componentId}.${version}`); /* 第52天：目标不存在时抛出明确错误。 */
    this.prompts.set(key, { ...target, status: "archived", updatedAt: Date.now() }); /* 第52天：写回 archived（已归档）状态。 */
    syncPromptToUnifiedRegistry({ ...target, status: "archived", updatedAt: Date.now() }, this.unifiedRegistry); /* 第66天：把归档版本同步为禁用注册项以保留版本可见性。 */
  } /* 第52天：结束归档方法。 */

  rollback(componentId: string, version: string): void { /* 第52天：定义 Prompt Rollback（提示词回滚）方法。 */
    this.activate(componentId, version); /* 第52天：回滚在内存注册表中等价于重新激活旧版本。 */
  } /* 第52天：结束回滚方法。 */

  registerProduction(prompt: ProductionPrompt): void { // 第67天：定义注册独立生产提示词版本的方法。
    const agentId = prompt.agentId?.trim() || prompt.id; // 第67天：优先使用关联智能体标识并为通用提示词提供稳定回退值。
    const key = productionPromptKey(agentId, prompt.version); // 第67天：生成生产提示词智能体版本组合键。
    if (!prompt.id.trim() || !prompt.version.trim() || prompt.blocks.length === 0) throw new Error("ProductionPrompt 需要 id、version 和至少一个 PromptBlock"); // 第67天：阻止不完整生产提示词进入注册表。
    if (this.productionPrompts.has(key)) throw new Error(`ProductionPrompt 已存在：${agentId}.${prompt.version}`); // 第67天：阻止同智能体同版本重复注册。
    if (prompt.status === "active") this.deactivateOtherProductionVersions(agentId, prompt.version); // 第67天：注册启用版本时保持同智能体只有一个 active 版本。
    this.productionPrompts.set(key, cloneProductionPrompt(prompt)); // 第67天：把生产提示词防御性副本写入注册表。
    syncProductionPromptToUnifiedRegistry(prompt, this.unifiedRegistry); // 第67天：把版本、状态、策略和块元数据同步到统一注册中心。
  } // 第67天：结束生产提示词注册方法。

  upsertProduction(prompt: ProductionPrompt): void { // 第67天：定义生产提示词新增或更新方法。
    const agentId = prompt.agentId?.trim() || prompt.id; // 第67天：标准化生产提示词关联智能体标识。
    if (prompt.status === "active") this.deactivateOtherProductionVersions(agentId, prompt.version); // 第67天：更新为启用状态时先禁用同智能体其他版本。
    this.productionPrompts.set(productionPromptKey(agentId, prompt.version), cloneProductionPrompt(prompt)); // 第67天：新增或覆盖生产提示词版本。
    syncProductionPromptToUnifiedRegistry(prompt, this.unifiedRegistry); // 第67天：同步统一注册中心中的生产提示词状态。
  } // 第67天：结束生产提示词新增或更新方法。

  getProductionVersion(agentId: string, version: string): ProductionPrompt | null { // 第67天：定义按智能体和版本读取生产提示词的方法。
    const prompt = this.productionPrompts.get(productionPromptKey(agentId, version)); // 第67天：从生产提示词 Map 读取目标版本。
    return prompt ? cloneProductionPrompt(prompt) : null; // 第67天：返回防御性副本或空值。
  } // 第67天：结束指定生产提示词版本读取方法。

  getProductionById(promptId: string): ProductionPrompt | null { // 第67天：定义按生产提示词唯一标识读取版本的方法。
    const prompt = Array.from(this.productionPrompts.values()).find((item) => item.id === promptId) ?? null; // 第67天：在全部生产提示词版本中查找目标标识。
    return prompt ? cloneProductionPrompt(prompt) : null; // 第67天：返回目标生产提示词副本或空值。
  } // 第67天：结束按唯一标识读取生产提示词方法。

  getActiveProduction(agentId: string): ProductionPrompt | null { // 第67天：定义读取智能体当前启用生产提示词的方法。
    const prompt = this.listProduction(agentId).find((item) => item.status === "active") ?? null; // 第67天：查找该智能体唯一 active 版本。
    return prompt ? cloneProductionPrompt(prompt) : null; // 第67天：返回启用版本副本或空值。
  } // 第67天：结束启用生产提示词读取方法。

  listProduction(agentId?: string): ProductionPrompt[] { // 第67天：定义列出全部或指定智能体生产提示词版本的方法。
    return Array.from(this.productionPrompts.values()).filter((prompt) => !agentId || prompt.agentId === agentId).map(cloneProductionPrompt).sort((left, right) => `${left.agentId}.${left.version}`.localeCompare(`${right.agentId}.${right.version}`, "zh-CN")); // 第67天：筛选、复制并稳定排序生产提示词版本。
  } // 第67天：结束生产提示词列表方法。

  setProductionStatus(agentId: string, version: string, status: ProductionPromptStatus): ProductionPrompt { // 第67天：定义统一修改生产提示词生命周期状态的方法。
    const key = productionPromptKey(agentId, version); // 第67天：生成目标生产提示词组合键。
    const target = this.productionPrompts.get(key); // 第67天：读取目标生产提示词版本。
    if (!target) throw new Error(`无法更新不存在的 ProductionPrompt：${agentId}.${version}`); // 第67天：目标不存在时抛出明确错误。
    if (status === "active") this.deactivateOtherProductionVersions(agentId, version); // 第67天：启用新版本前自动弃用其他 active 版本。
    const updated = { ...target, status, updatedAt: Date.now() }; // 第67天：创建带新状态和更新时间的生产提示词。
    this.productionPrompts.set(key, updated); // 第67天：把新生命周期状态写回生产提示词 Map。
    syncProductionPromptToUnifiedRegistry(updated, this.unifiedRegistry); // 第67天：确保 Prompt Status 与统一注册项 enabled 保持一致。
    return cloneProductionPrompt(updated); // 第67天：返回更新后的防御性副本。
  } // 第67天：结束生产提示词生命周期状态更新方法。

  getMetrics(): PromptRegistryMetrics { /* 第52天：定义注册表指标读取方法。 */
    const prompts = this.list(); /* 第52天：读取全部提示词版本副本。 */
    const componentCount = new Set(prompts.map((prompt) => prompt.componentId)).size; /* 第52天：统计被管理组件数量。 */
    return { totalPrompts: prompts.length, activePrompts: prompts.filter((prompt) => prompt.status === "active").length, draftPrompts: prompts.filter((prompt) => prompt.status === "draft").length, archivedPrompts: prompts.filter((prompt) => prompt.status === "archived").length, componentCount }; /* 第52天：返回各状态数量与组件覆盖度。 */
  } /* 第52天：结束注册表指标方法。 */

  private deactivateOtherVersions(componentId: string, activeVersion: string): void { /* 第52天：定义同组件旧 active 版本降级方法。 */
    for (const [key, prompt] of this.prompts.entries()) { /* 第52天：遍历注册表内部全部版本。 */
      if (prompt.componentId !== componentId || prompt.version === activeVersion || prompt.status !== "active") continue; /* 第52天：只处理同组件且非目标版本的 active 记录。 */
      this.prompts.set(key, { ...prompt, status: "archived", updatedAt: Date.now() }); /* 第52天：把旧 active 版本归档，便于后续回滚。 */
      syncPromptToUnifiedRegistry({ ...prompt, status: "archived", updatedAt: Date.now() }, this.unifiedRegistry); /* 第66天：同步旧激活版本为禁用状态避免能力发现返回过期版本。 */
    } /* 第52天：结束注册表遍历。 */
  } /* 第52天：结束旧版本降级方法。 */

  private deactivateOtherProductionVersions(agentId: string, activeVersion: string): void { // 第67天：定义同智能体其他生产提示词版本自动弃用方法。
    for (const [key, prompt] of this.productionPrompts.entries()) { // 第67天：遍历当前注册的全部生产提示词版本。
      if (prompt.agentId !== agentId || prompt.version === activeVersion || prompt.status !== "active") continue; // 第67天：只处理同智能体且非目标版本的 active 记录。
      const deprecated = { ...prompt, status: "deprecated" as const, updatedAt: Date.now() }; // 第67天：把旧启用版本转换为已弃用状态以支持回滚。
      this.productionPrompts.set(key, deprecated); // 第67天：写回旧版本生命周期状态。
      syncProductionPromptToUnifiedRegistry(deprecated, this.unifiedRegistry); // 第67天：同步旧版本为禁用统一注册项。
    } // 第67天：结束生产提示词版本遍历。
  } // 第67天：结束其他生产提示词版本自动弃用方法。

  private sortPrompts(left: PromptTemplate, right: PromptTemplate): number { /* 第52天：定义提示词列表稳定排序方法。 */
    return `${left.componentId}.${left.version}`.localeCompare(`${right.componentId}.${right.version}`, "zh-CN"); /* 第52天：先按组件再按版本排序，保证 UI 与测试输出稳定。 */
  } /* 第52天：结束提示词排序方法。 */

  private assertValidPrompt(prompt: PromptTemplate, strict: boolean): void { /* 第52天增强：定义注册表级提示词模板校验守卫。 */
    const validation = validatePromptTemplate(prompt); /* 第52天增强：执行变量契约校验。 */
    if (!strict && prompt.status === "archived") return; /* 第52天增强：归档遗留版本可以保留，用于 Diff 和回滚前检查。 */
    if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join("；")); /* 第52天增强：校验失败时抛出全部问题，便于 API 和 UI 展示。 */
  } /* 第52天增强：结束注册表级模板校验守卫。 */
} /* 第52天：结束 PromptRegistry（提示词注册表）。 */
