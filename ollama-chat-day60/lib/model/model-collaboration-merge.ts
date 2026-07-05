import type { CollaborationMergedResult, CollaborationStageResult } from "@/lib/model/model-collaboration-types"; /* 第56天：引入协作阶段结果与合并结果类型。 */

export function mergeResults(results: CollaborationStageResult[]): CollaborationMergedResult { /* 第56天：定义 Model Result Merge（模型结果合并）入口。 */
  const usable = results.filter((result) => result.output.trim().length > 0); /* 第56天：只保留有输出文本的阶段，避免空结果污染最终答案。 */
  const reversed = usable.slice().reverse(); /* 第56天：复制并反转结果列表，兼容较低 ES 目标环境而不用 findLast。 */
  const finalStage = reversed.find((result) => result.role === "evaluation") ?? reversed.find((result) => result.role === "writing" || result.role === "json") ?? reversed[0]; /* 第56天：优先采用评估阶段，其次写作或 JSON 阶段，最后回退最后一个有效阶段。 */
  const sourceStageIds = usable.map((result) => result.stageId); /* 第56天：记录所有参与合并的阶段 ID。 */
  const consensus = buildConsensus(usable); /* 第56天：生成描述合并依据的中文共识说明。 */
  const finalOutput = finalStage ? decorateFinalOutput(finalStage.output, usable, consensus) : "暂无可合并的模型输出。"; /* 第56天：生成最终答案，保留主要阶段输出并补充协作摘要。 */
  return { finalOutput, sourceStageIds, consensus }; /* 第56天：返回最终合并结果。 */
} /* 第56天：结束模型结果合并入口。 */

function buildConsensus(results: CollaborationStageResult[]): string { /* 第56天：定义协作共识说明生成函数。 */
  if (results.length === 0) return "没有阶段产出可供合并。"; /* 第56天：空结果时返回兜底说明。 */
  const roles = Array.from(new Set(results.map((result) => result.role))); /* 第56天：收集参与合并的去重角色列表。 */
  const failed = results.filter((result) => !result.success).length; /* 第56天：统计失败或降级阶段数量。 */
  const parallelCount = results.filter((result) => result.stageId.includes("reasoning") || result.stageId.includes("summary")).length; /* 第56天：粗略统计研究探索阶段数量，便于说明并行覆盖。 */
  const health = failed === 0 ? "全部阶段成功" : `${failed} 个阶段使用降级结果`; /* 第56天：生成执行健康摘要。 */
  return `已合并 ${roles.join("、")} 角色输出，${health}，探索阶段数量 ${parallelCount}。`; /* 第56天：返回用户可读的合并共识说明。 */
} /* 第56天：结束协作共识说明生成函数。 */

function decorateFinalOutput(primaryOutput: string, results: CollaborationStageResult[], consensus: string): string { /* 第56天：定义最终输出装饰函数，让前端能直接展示合并后的文本。 */
  const roleLines = results.map((result) => `- ${result.role} / ${result.modelId}: ${shorten(result.output)}`); /* 第56天：为每个阶段生成简短来源摘要。 */
  return `${primaryOutput}\n\n---\n协作合并说明：${consensus}\n阶段摘要：\n${roleLines.join("\n")}`; /* 第56天：返回带合并说明和阶段摘要的最终文本。 */
} /* 第56天：结束最终输出装饰函数。 */

function shorten(text: string): string { /* 第56天：定义阶段摘要截断函数。 */
  const normalized = text.replace(/\s+/g, " ").trim(); /* 第56天：压缩空白，避免阶段摘要过长或换行打断布局。 */
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized; /* 第56天：超过 120 字符时截断并追加省略号。 */
} /* 第56天：结束阶段摘要截断函数。 */
