import { randomUUID } from "node:crypto"; // 第71天：引入 UUID 生成器为质量门禁创建唯一标识。
import type { EvaluationCaseResultV2, EvaluationDatasetV2, EvaluationRun, QualityGateCheckV2, QualityGateResultV2 } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入质量门禁比较所需运行、结果、数据集和结论类型。

function percent(value: number): string { return `${(value * 100).toFixed(1)}%`; } // 第71天：把零到一比例格式化为质量门禁可读百分比。

function highPriorityPassRate(dataset: EvaluationDatasetV2, results: EvaluationCaseResultV2[]): number { // 第71天：计算高优先级和关键案例通过率。
  const highPriorityIds = new Set(dataset.cases.filter((item) => item.priority === "high" || item.priority === "critical").map((item) => item.id)); // 第71天：收集需要百分之百通过的高优先级案例标识。
  if (highPriorityIds.size === 0) return 1; // 第71天：没有高优先级案例时视为门禁条件自然通过。
  const passed = results.filter((item) => highPriorityIds.has(item.caseId) && item.passed).length; // 第71天：统计候选运行中已经通过的高优先级案例数量。
  return passed / highPriorityIds.size; // 第71天：返回高优先级案例通过比例。
} // 第71天：结束高优先级案例通过率计算函数。

export function evaluateQualityGateV2(input: { baseline: EvaluationRun; candidate: EvaluationRun; dataset: EvaluationDatasetV2; candidateResults: EvaluationCaseResultV2[] }): QualityGateResultV2 { // 第71天：按综合分、正确性、高优先级通过率和成本增长执行 Quality Gate V2。
  const highPriorityRate = highPriorityPassRate(input.dataset, input.candidateResults); // 第71天：计算候选版本高优先级案例通过率。
  const costGrowth = input.baseline.usage.cost <= 0 ? 0 : (input.candidate.usage.cost - input.baseline.usage.cost) / input.baseline.usage.cost; // 第71天：计算候选版本相对基线的平均成本增长比例。
  const checks: QualityGateCheckV2[] = [ // 第71天：构建任务清单要求的四项多维质量门禁检查。
    { id: "overall", label: "Overall 不低于 Baseline（综合分不低于基线）", passed: input.candidate.scores.overall >= input.baseline.scores.overall, detail: `${input.candidate.scores.overall.toFixed(2)} >= ${input.baseline.scores.overall.toFixed(2)}` }, // 第71天：检查候选综合评分是否达到或超过基线。
    { id: "correctness", label: "Correctness 不下降（正确性不能下降）", passed: input.candidate.scores.correctness >= input.baseline.scores.correctness, detail: `${input.candidate.scores.correctness.toFixed(2)} >= ${input.baseline.scores.correctness.toFixed(2)}` }, // 第71天：检查候选正确性维度是否没有退化。
    { id: "high-priority-pass-rate", label: "High Priority Case Pass Rate = 100%（高优先级案例全部通过）", passed: highPriorityRate === 1, detail: percent(highPriorityRate) }, // 第71天：检查高优先级案例是否全部达到通过阈值。
    { id: "cost-growth", label: "Cost 增长不超过 20%（成本增长受控）", passed: costGrowth <= 0.2, detail: `${percent(costGrowth)} <= 20.0%` }, // 第71天：检查候选版本平均成本增长是否不超过百分之二十。
  ]; // 第71天：结束四项质量门禁检查列表。
  const reasons = checks.filter((item) => !item.passed).map((item) => `${item.label}：${item.detail}`); // 第71天：收集全部未通过条件作为候选晋级阻断原因。
  return { id: `gate_${randomUUID()}`, baselineRunId: input.baseline.id, candidateRunId: input.candidate.id, status: reasons.length === 0 ? "passed" : "failed", checks, reasons, createdAt: Date.now() }; // 第71天：返回 PASS、FAIL、检查明细和判断原因。
} // 第71天：结束 Quality Gate V2 评估函数。
