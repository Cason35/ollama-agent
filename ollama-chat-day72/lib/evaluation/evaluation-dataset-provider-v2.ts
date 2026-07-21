import type { EvaluationCaseV2, EvaluationDatasetV2 } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入平台级评估数据集和案例类型。

function cloneDataset(dataset: EvaluationDatasetV2): EvaluationDatasetV2 { // 第71天：定义数据集防御性复制函数避免调用方修改内部状态。
  return { ...dataset, cases: dataset.cases.map((item) => ({ ...item, expectedKeywords: [...item.expectedKeywords], metadata: structuredClone(item.metadata) })) }; // 第71天：复制数据集、案例、关键词和扩展元数据。
} // 第71天：结束数据集防御性复制函数。

function assertDataset(dataset: EvaluationDatasetV2): void { // 第71天：定义平台级评估数据集写入前的完整性校验函数。
  if (!dataset.id.trim() || !dataset.name.trim()) throw new Error("Evaluation Dataset V2 的 id 和 name 不能为空"); // 第71天：阻止缺少稳定标识或名称的数据集写入。
  if (!Number.isInteger(dataset.version) || dataset.version <= 0) throw new Error(`Evaluation Dataset V2 版本必须是正整数：${dataset.id}`); // 第71天：阻止无效数据集版本写入。
  if (dataset.cases.some((item) => !item.id.trim() || !item.input.trim())) throw new Error(`Evaluation Dataset V2 存在无效案例：${dataset.id}`); // 第71天：阻止缺少案例标识或输入的数据集写入。
  if (new Set(dataset.cases.map((item) => item.id)).size !== dataset.cases.length) throw new Error(`Evaluation Dataset V2 案例标识重复：${dataset.id}`); // 第71天：阻止同一数据集版本出现重复案例标识。
} // 第71天：结束平台级评估数据集完整性校验函数。

export class EvaluationDatasetProviderV2 { // 第71天：实现 Agent、Workflow、Prompt、RAG 与 Memory 共用的数据集提供者。
  private readonly datasets = new Map<string, EvaluationDatasetV2>(); // 第71天：按数据集标识和版本组合键保存平台级数据集。
  register(dataset: EvaluationDatasetV2): EvaluationDatasetV2 { // 第71天：注册或覆盖一个隔离的教学数据集版本。
    assertDataset(dataset); // 第71天：写入前校验数据集和案例结构。
    const cloned = cloneDataset(dataset); // 第71天：创建防御性副本保护调用方原始对象。
    this.datasets.set(this.key(dataset.id, dataset.version), cloned); // 第71天：按稳定标识和版本保存数据集快照。
    return cloneDataset(cloned); // 第71天：返回已注册数据集的防御性副本。
  } // 第71天：结束平台级数据集注册方法。
  get(id: string, version?: number): EvaluationDatasetV2 | undefined { // 第71天：按稳定标识和可选版本读取数据集。
    const candidates = this.list(id); // 第71天：读取目标稳定标识下的全部版本。
    const selected = version ? candidates.find((item) => item.version === version) : candidates.filter((item) => item.status === "active").at(-1) ?? candidates.at(-1); // 第71天：优先返回指定版本，否则选择最新活动版本或最新版本。
    return selected ? cloneDataset(selected) : undefined; // 第71天：命中时返回防御性副本，未命中时返回空值。
  } // 第71天：结束平台级数据集读取方法。
  list(id?: string): EvaluationDatasetV2[] { // 第71天：列出全部数据集或某个稳定标识的全部版本。
    return Array.from(this.datasets.values()).filter((dataset) => !id || dataset.id === id).map(cloneDataset).sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version); // 第71天：筛选、复制并按标识和版本稳定排序。
  } // 第71天：结束平台级数据集列表方法。
  appendCase(datasetId: string, evaluationCase: EvaluationCaseV2, version?: number): EvaluationDatasetV2 { // 第71天：把线上失败或用户反馈追加为后续必须通过的回归案例。
    const dataset = this.get(datasetId, version); // 第71天：读取需要接收坏案例的数据集版本。
    if (!dataset) throw new Error(`Evaluation Dataset V2 不存在：${datasetId}`); // 第71天：目标数据集不存在时抛出明确错误。
    if (!dataset.cases.some((item) => item.id === evaluationCase.id)) dataset.cases.push({ ...evaluationCase, expectedKeywords: [...evaluationCase.expectedKeywords], metadata: structuredClone(evaluationCase.metadata) }); // 第71天：按案例标识幂等追加新的反馈回归案例。
    this.datasets.set(this.key(dataset.id, dataset.version), cloneDataset(dataset)); // 第71天：保存包含新回归案例的数据集快照。
    return cloneDataset(dataset); // 第71天：返回更新后的平台级数据集。
  } // 第71天：结束反馈回归案例追加方法。
  private key(id: string, version: number): string { return `${id}@${version}`; } // 第71天：生成数据集稳定标识和版本组合存储键。
} // 第71天：结束 Evaluation Dataset Provider V2 实现。
