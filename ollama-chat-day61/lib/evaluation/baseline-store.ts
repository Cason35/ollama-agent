import type { BaselineSnapshot, BatchEvaluationRun } from "./regression-types"; /* 第46天：引入基线和批量运行类型。 */

export interface BaselineStore { /* 第46天：定义可替换持久层的基线仓储接口。 */
  save(run: BatchEvaluationRun): Promise<BaselineSnapshot>; /* 第46天：保存完整批量结果为基线。 */
  get(datasetId: string, datasetVersion: string): Promise<BaselineSnapshot | null>; /* 第46天：按数据集和版本读取基线。 */
  list(): Promise<BaselineSnapshot[]>; /* 第46天：列出全部基线快照。 */
} /* 第46天：结束基线仓储接口。 */

export class MemoryBaselineStore implements BaselineStore { /* 第46天：实现教学项目使用的内存基线仓储。 */
  private readonly snapshots = new Map<string, BaselineSnapshot>(); /* 第46天：按数据集版本保存完整基线快照。 */

  async save(run: BatchEvaluationRun): Promise<BaselineSnapshot> { /* 第46天：实现完整基线保存。 */
    const snapshot: BaselineSnapshot = { ...run, results: run.results.map((item) => ({ ...item, evaluation: item.evaluation ? { ...item.evaluation, dimensions: { ...item.evaluation.dimensions }, strengths: [...item.evaluation.strengths], weaknesses: [...item.evaluation.weaknesses], suggestions: [...item.evaluation.suggestions] } : null })), summary: { ...run.summary, dimensionScores: { ...run.summary.dimensionScores } }, savedAt: Date.now() }; /* 第46天：深拷贝案例明细和多维评分，避免后续候选运行污染基线。 */
    this.snapshots.set(this.keyOf(run.datasetId, run.datasetVersion), snapshot); /* 第46天：按数据集版本写入基线快照。 */
    return snapshot; /* 第46天：返回已保存的基线。 */
  } /* 第46天：结束完整基线保存。 */

  async get(datasetId: string, datasetVersion: string): Promise<BaselineSnapshot | null> { /* 第46天：实现基线读取。 */
    return this.snapshots.get(this.keyOf(datasetId, datasetVersion)) ?? null; /* 第46天：返回匹配的完整快照或空值。 */
  } /* 第46天：结束基线读取。 */

  async list(): Promise<BaselineSnapshot[]> { /* 第46天：实现基线列表读取。 */
    return Array.from(this.snapshots.values()); /* 第46天：返回全部基线快照。 */
  } /* 第46天：结束基线列表读取。 */

  private keyOf(datasetId: string, datasetVersion: string): string { /* 第46天：生成稳定的基线存储键。 */
    return `${datasetId}@${datasetVersion}`; /* 第46天：组合数据集 ID 与版本。 */
  } /* 第46天：结束基线存储键生成函数。 */
} /* 第46天：结束内存基线仓储。 */
