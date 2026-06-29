import type { ModelCapability, ModelProfile, ModelProfileSummary, ModelRegistryMetrics, ModelQuality, ModelSpeed } from "@/lib/model/model-profile-types"; /* 第50天：引入模型档案、摘要与指标类型。 */

export class ModelRegistry { /* 第50天：定义 ModelRegistry（模型注册表），负责登记与查询逻辑模型。 */
  private readonly models = new Map<string, ModelProfile>(); /* 第50天：使用 Map 按 id 保存模型档案，保证查找为 O(1)。 */

  register(model: ModelProfile): ModelProfile { /* 第50天：定义注册单个模型档案的方法。 */
    this.models.set(model.id, { ...model, capabilities: [...model.capabilities], fallbackModelIds: model.fallbackModelIds ? [...model.fallbackModelIds] : undefined }); /* 第51天：写入模型副本并复制备用链数组，避免外部引用被意外修改。 */
    return this.get(model.id) as ModelProfile; /* 第50天：返回已登记的模型副本。 */
  } /* 第50天：结束注册模型方法。 */

  registerAll(models: ModelProfile[]): void { /* 第50天：定义批量注册模型的方法。 */
    models.forEach((model) => this.register(model)); /* 第50天：逐个登记传入的模型档案。 */
  } /* 第50天：结束批量注册方法。 */

  get(id: string): ModelProfile | undefined { /* 第50天：定义按 id 读取模型档案的方法。 */
    const model = this.models.get(id); /* 第50天：从 Map 中读取目标模型。 */
    return model ? { ...model, capabilities: [...model.capabilities], fallbackModelIds: model.fallbackModelIds ? [...model.fallbackModelIds] : undefined } : undefined; /* 第51天：命中时返回含备用链副本的模型档案，未命中时返回 undefined。 */
  } /* 第50天：结束读取模型方法。 */

  list(): ModelProfile[] { /* 第50天：定义列出全部模型档案的方法。 */
    return Array.from(this.models.values()).map((model) => ({ ...model, capabilities: [...model.capabilities], fallbackModelIds: model.fallbackModelIds ? [...model.fallbackModelIds] : undefined })); /* 第51天：返回按注册顺序排列且备用链已复制的模型副本数组。 */
  } /* 第50天：结束列出模型方法。 */

  findByCapability(capability: ModelCapability): ModelProfile[] { /* 第50天：定义按能力标签筛选模型的方法。 */
    return this.list().filter((model) => model.capabilities.includes(capability)); /* 第50天：返回所有声明了该能力的模型。 */
  } /* 第50天：结束按能力查询方法。 */

  has(id: string): boolean { /* 第50天：定义判断模型是否已注册的方法。 */
    return this.models.has(id); /* 第50天：返回注册表是否包含目标 id。 */
  } /* 第50天：结束判断方法。 */

  clear(): void { /* 第50天：定义清空注册表的方法，便于测试隔离。 */
    this.models.clear(); /* 第50天：移除全部已登记模型。 */
  } /* 第50天：结束清空方法。 */

  summaries(): ModelProfileSummary[] { /* 第50天：定义生成 Model Explorer 展示用模型摘要的方法。 */
    return this.list().map((model) => ({ ...model, capabilityCount: model.capabilities.length })); /* 第50天：在模型档案上补齐能力数量字段。 */
  } /* 第50天：结束生成模型摘要方法。 */

  stats(): ModelRegistryMetrics { /* 第50天：定义计算 ModelRegistry（模型注册表）指标的方法。 */
    const models = this.list(); /* 第50天：读取全部模型用于统计。 */
    const providerDistribution = models.reduce<Record<string, number>>((acc, model) => ({ ...acc, [model.provider]: (acc[model.provider] ?? 0) + 1 }), {}); /* 第50天：统计各提供方的模型数量。 */
    const speedDistribution = models.reduce<Record<ModelSpeed, number>>((acc, model) => ({ ...acc, [model.speed]: (acc[model.speed] ?? 0) + 1 }), { fast: 0, medium: 0, slow: 0 }); /* 第50天：统计各速度档位的模型数量。 */
    const qualityDistribution = models.reduce<Record<ModelQuality, number>>((acc, model) => ({ ...acc, [model.quality]: (acc[model.quality] ?? 0) + 1 }), { basic: 0, strong: 0, reasoning: 0 }); /* 第50天：统计各质量档位的模型数量。 */
    const capabilityCoverage = new Set(models.flatMap((model) => model.capabilities)).size; /* 第50天：统计去重后的能力覆盖数量。 */
    const cheapest = models.slice().sort((left, right) => left.cost.inputPer1K - right.cost.inputPer1K)[0]; /* 第50天：按输入单价升序找出最便宜模型。 */
    const fastestModelCount = models.filter((model) => model.speed === "fast").length; /* 第50天：统计速度为 fast 的模型数量。 */
    return { totalModels: models.length, providerDistribution, capabilityCoverage, speedDistribution, qualityDistribution, cheapestModelId: cheapest?.id ?? null, fastestModelCount }; /* 第50天：返回完整的模型注册表指标。 */
  } /* 第50天：结束计算注册表指标方法。 */
} /* 第50天：结束 ModelRegistry（模型注册表）类定义。 */
