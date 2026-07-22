import type { EvaluationResult } from "../agents/agent-types"; /* 第46天：复用第45天 EvaluationResult（评估结果）结构。 */
import { assertEvaluationDataset } from "./evaluation-dataset"; /* 第46天：引入批量执行前的数据集断言。 */
import type { BatchCaseExecution, BatchEvaluationCaseResult, BatchEvaluationRun, BatchEvaluationSummary, EvaluationCase, EvaluationDataset, EvaluationDimension, EvaluationVersion } from "./regression-types"; /* 第46天：引入批量评估所需类型。 */

const DIMENSIONS: EvaluationDimension[] = ["completeness", "correctness", "relevance", "coverage"]; /* 第46天：定义批量汇总使用的固定评分维度。 */

export type BatchEvaluationRunnerInput = { /* 第46天：定义批量评估运行器入参。 */
  dataset: EvaluationDataset; /* 第46天：保存本次要执行的数据集。 */
  version: EvaluationVersion; /* 第46天：保存本次被评估的系统版本。 */
  concurrency?: number; /* 第46天：保存可选并发限制。 */
  executeCase: (item: EvaluationCase, version: EvaluationVersion) => Promise<BatchCaseExecution>; /* 第46天：注入单案例执行函数，便于替换真实模型。 */
}; /* 第46天：结束批量评估运行器入参。 */

function normalizeText(value: string): string { /* 第46天：定义评分前的文本标准化函数。 */
  return value.toLowerCase().replace(/\s+/g, " ").trim(); /* 第46天：统一大小写、空白并去除首尾空格。 */
} /* 第46天：结束文本标准化函数。 */

function scoreRequiredTerms(output: string, requiredTerms: string[]): number { /* 第46天：根据必需术语覆盖率计算客观分数。 */
  if (requiredTerms.length === 0) return output.trim() ? 100 : 0; /* 第46天：无术语规则时用非空输出作为通过依据。 */
  const normalizedOutput = normalizeText(output); /* 第46天：标准化实际输出。 */
  const matchedCount = requiredTerms.filter((term) => normalizedOutput.includes(normalizeText(term))).length; /* 第46天：统计命中的关键术语数量。 */
  return Number(((matchedCount / requiredTerms.length) * 100).toFixed(2)); /* 第46天：返回百分制覆盖率。 */
} /* 第46天：结束术语覆盖率评分函数。 */

export function evaluateCaseOutput(item: EvaluationCase, output: string): EvaluationResult { /* 第46天：使用案例评分表评估实际输出。 */
  const dimensions = { completeness: 0, correctness: 0, relevance: 0, coverage: 0 }; /* 第46天：初始化四个维度分数。 */
  DIMENSIONS.forEach((dimension) => { /* 第46天：逐维度计算关键术语覆盖率。 */
    dimensions[dimension] = scoreRequiredTerms(output, item.rubric.dimensions[dimension].requiredTerms); /* 第46天：写入当前维度分数。 */
  }); /* 第46天：结束逐维度评分。 */
  const score = Number(DIMENSIONS.reduce((sum, dimension) => sum + dimensions[dimension] * item.rubric.dimensions[dimension].weight, 0).toFixed(2)); /* 第46天：按权重计算综合分。 */
  const strengths = DIMENSIONS.filter((dimension) => dimensions[dimension] >= 80).map((dimension) => `${dimension} 达标`); /* 第46天：提取高分维度作为优势。 */
  const weaknesses = DIMENSIONS.filter((dimension) => dimensions[dimension] < 70).map((dimension) => `${dimension} 仅 ${dimensions[dimension]} 分`); /* 第46天：提取低分维度作为不足。 */
  const suggestions = DIMENSIONS.filter((dimension) => dimensions[dimension] < 80).map((dimension) => `补充 ${item.rubric.dimensions[dimension].requiredTerms.join("、") || item.rubric.dimensions[dimension].criteria}`); /* 第46天：根据缺失术语生成可执行建议。 */
  return { score, dimensions, strengths, weaknesses, suggestions }; /* 第46天：返回与第45天兼容的评估结果。 */
} /* 第46天：结束案例输出评估函数。 */

function emptyDimensionScores(): Record<EvaluationDimension, number> { /* 第46天：创建四维零分汇总对象。 */
  return { completeness: 0, correctness: 0, relevance: 0, coverage: 0 }; /* 第46天：返回四个维度初始值。 */
} /* 第46天：结束四维零分对象创建函数。 */

function buildSummary(results: BatchEvaluationCaseResult[], totalDurationMs: number): BatchEvaluationSummary { /* 第46天：根据全部案例结果生成批量指标。 */
  const dimensionScores = emptyDimensionScores(); /* 第46天：初始化维度平均分。 */
  DIMENSIONS.forEach((dimension) => { /* 第46天：逐维度计算成功案例平均分。 */
    dimensionScores[dimension] = results.length === 0 ? 0 : Number((results.reduce((sum, item) => sum + (item.evaluation?.dimensions[dimension] ?? 0), 0) / results.length).toFixed(2)); /* 第46天：把失败或跳过案例按零分计入当前维度平均值。 */
  }); /* 第46天：结束维度平均分计算。 */
  const averageScore = results.length === 0 ? 0 : Number((results.reduce((sum, item) => sum + (item.evaluation?.score ?? 0), 0) / results.length).toFixed(2)); /* 第46天：把失败或跳过案例按零分计入全局综合平均分。 */
  const passRate = results.length === 0 ? 0 : Number((results.filter((item) => item.passed).length / results.length).toFixed(4)); /* 第46天：按全部案例计算通过率。 */
  return { averageScore, passRate, dimensionScores, totalDurationMs, modelCallCount: results.reduce((sum, item) => sum + item.modelCallCount, 0), successCount: results.filter((item) => item.status === "success").length, failedCount: results.filter((item) => item.status === "failed").length, skippedCount: results.filter((item) => item.status === "skipped").length }; /* 第46天：返回完整批量汇总指标。 */
} /* 第46天：结束批量指标生成函数。 */

async function executeOneCase(item: EvaluationCase, version: EvaluationVersion, executeCase: BatchEvaluationRunnerInput["executeCase"]): Promise<BatchEvaluationCaseResult> { /* 第46天：安全执行一个案例并隔离异常。 */
  const startedAt = Date.now(); /* 第46天：记录单案例开始时间。 */
  try { /* 第46天：捕获模型失败，避免中断后续案例。 */
    const execution = await executeCase(item, version); /* 第46天：调用注入的单案例执行器。 */
    const durationMs = Math.max(1, Date.now() - startedAt); /* 第46天：计算至少一毫秒的案例耗时。 */
    if (execution.skippedReason) return { caseId: item.id, caseName: item.name, priority: item.priority, kind: item.kind, status: "skipped", actualOutput: execution.output, evaluation: null, passed: false, durationMs, modelCallCount: execution.modelCallCount ?? 0, error: execution.skippedReason }; /* 第46天：返回跳过案例结果。 */
    const evaluation = evaluateCaseOutput(item, execution.output); /* 第46天：对实际输出执行稳定规则评分。 */
    return { caseId: item.id, caseName: item.name, priority: item.priority, kind: item.kind, status: "success", actualOutput: execution.output, evaluation, passed: evaluation.score >= item.rubric.passThreshold, durationMs, modelCallCount: execution.modelCallCount ?? 1 }; /* 第46天：返回成功案例结果。 */
  } catch (error) { /* 第46天：处理单案例执行异常。 */
    return { caseId: item.id, caseName: item.name, priority: item.priority, kind: item.kind, status: "failed", actualOutput: "", evaluation: null, passed: false, durationMs: Math.max(1, Date.now() - startedAt), modelCallCount: 0, error: error instanceof Error ? error.message : "未知案例执行错误" }; /* 第46天：把异常转换为失败结果并继续批任务。 */
  } /* 第46天：结束异常隔离。 */
} /* 第46天：结束单案例安全执行函数。 */

export async function runBatchEvaluation(input: BatchEvaluationRunnerInput): Promise<BatchEvaluationRun> { /* 第46天：按并发限制执行完整评估数据集。 */
  assertEvaluationDataset(input.dataset); /* 第46天：执行前验证数据集结构与评分规则。 */
  const startedAt = Date.now(); /* 第46天：记录批量评估开始时间。 */
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 2, input.dataset.cases.length)); /* 第46天：把并发数限制在一到案例数之间。 */
  const results = new Array<BatchEvaluationCaseResult>(input.dataset.cases.length); /* 第46天：预分配结果数组以保持案例顺序稳定。 */
  let nextIndex = 0; /* 第46天：保存下一个待领取案例的索引。 */
  const workers = Array.from({ length: concurrency }, async () => { /* 第46天：创建固定数量的并发工作协程。 */
    while (true) { /* 第46天：持续领取尚未执行的案例。 */
      const currentIndex = nextIndex; /* 第46天：读取当前待领取索引。 */
      nextIndex += 1; /* 第46天：推进共享索引，保证案例只被领取一次。 */
      if (currentIndex >= input.dataset.cases.length) return; /* 第46天：没有剩余案例时结束当前协程。 */
      results[currentIndex] = await executeOneCase(input.dataset.cases[currentIndex], input.version, input.executeCase); /* 第46天：执行案例并按原始位置保存结果。 */
    } /* 第46天：结束案例领取循环。 */
  }); /* 第46天：结束并发工作协程创建。 */
  await Promise.all(workers); /* 第46天：等待全部工作协程完成。 */
  const endedAt = Date.now(); /* 第46天：记录批量评估结束时间。 */
  return { id: `batch-${input.version.label}-${startedAt}`, datasetId: input.dataset.id, datasetVersion: input.dataset.version, caseCount: input.dataset.cases.length, version: input.version, concurrency, startedAt, endedAt, results, summary: buildSummary(results, Math.max(1, endedAt - startedAt)) }; /* 第46天：返回包含明细与汇总的批量评估运行。 */
} /* 第46天：结束批量评估运行器。 */
