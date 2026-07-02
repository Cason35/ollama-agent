import assert from "node:assert/strict"; /* 第55天：引入 Node.js 严格断言工具。 */
import { promptBuilder } from "../lib/prompts/prompt-builder"; /* 第55天：引入 PromptBuilder，用于验证优化后的动态提示词可构建。 */
import { buildRuntimePromptBlocks, createDefaultPromptBlockRegistry } from "../lib/prompts/default-prompt-blocks"; /* 第55天：引入默认提示词块注册表和运行时块组装函数。 */
import { createDefaultPromptRegistry } from "../lib/prompts/default-prompts"; /* 第55天：引入默认 Prompt Registry，用于读取 active Prompt。 */
import { promptOptimizer } from "../lib/prompts/prompt-optimizer"; /* 第55天：引入 PromptOptimizer 测试目标。 */
import type { PromptEvaluationSignal, PromptOptimizationContext } from "../lib/prompts/prompt-optimization-types"; /* 第55天：引入优化上下文和评估信号类型。 */
const promptRegistry = createDefaultPromptRegistry(); /* 第55天：创建隔离 PromptRegistry，避免污染共享单例。 */
const blockRegistry = createDefaultPromptBlockRegistry(); /* 第55天：创建隔离 PromptBlockRegistry，避免测试互相影响。 */
const activeResearch = promptRegistry.getActive("research"); /* 第55天：读取 research 当前 active Prompt。 */
assert.ok(activeResearch); /* 第55天：确认默认 research active Prompt 存在。 */
const baseBlocks = buildRuntimePromptBlocks("research", activeResearch, "你是研究型 Agent。", blockRegistry); /* 第55天：基于 Day54 组合能力生成运行时块列表。 */
const sampleVariables = { task: "分析一份研究报告并输出带引用的结论", memory: "用户偏好中文短结论", workspace: "已有 Day54 PromptBlock 设计记录", tools: "retrieval, summary", knowledge: "报告指出动态提示词优化可提升复杂任务质量", citations: "day54_learning_summary.md#Day55学习计划", agentId: "research", output: "暂无输出", threshold: "80", agents: "research, planner, writer, critic" }; /* 第55天：准备覆盖新增块变量的样例输入。 */
const evaluationSignals: PromptEvaluationSignal[] = [{ taskType: "research", weakness: "缺少引用", suggestedBlockId: "citation.requirements" }]; /* 第55天：准备 Evaluation 反向推动优化器的弱点信号。 */
const chatContext: PromptOptimizationContext = { taskType: "chat", hasMemory: false, hasWorkspace: false, hasKnowledge: false, requiresJson: false, requiresCitation: false, complexity: "low", userIntent: "打个招呼" }; /* 第55天：定义普通聊天任务上下文。 */
const researchContext: PromptOptimizationContext = { taskType: "research", hasMemory: true, hasWorkspace: true, hasKnowledge: true, requiresJson: false, requiresCitation: true, complexity: "high", userIntent: "分析研究报告" }; /* 第55天：定义研究任务上下文。 */
const jsonContext: PromptOptimizationContext = { taskType: "planning", hasMemory: false, hasWorkspace: true, hasKnowledge: false, requiresJson: true, requiresCitation: false, complexity: "medium", userIntent: "输出 JSON 计划" }; /* 第55天：定义 JSON 结构化输出任务上下文。 */
const reflectionContext: PromptOptimizationContext = { taskType: "reflection", hasMemory: true, hasWorkspace: false, hasKnowledge: false, requiresJson: false, requiresCitation: false, complexity: "high", userIntent: "复盘输出质量" }; /* 第55天：定义反思任务上下文。 */
const evaluationContext: PromptOptimizationContext = { taskType: "evaluation", hasMemory: false, hasWorkspace: false, hasKnowledge: false, requiresJson: true, requiresCitation: false, complexity: "high", userIntent: "评估模型回答质量" }; /* 第55天：定义评估任务上下文。 */
const chatFast = promptOptimizer.optimize(baseBlocks, chatContext, "fast"); /* 第55天：对普通聊天任务运行快速策略。 */
assert.ok(!chatFast.enabledBlockIds.includes("memory.context")); /* 第55天：验证无记忆时 Memory Block 被关闭。 */
assert.ok(!chatFast.enabledBlockIds.includes("workspace.context")); /* 第55天：验证无工作空间时 Workspace Block 被关闭。 */
assert.ok(!chatFast.enabledBlockIds.includes("reflection.checklist")); /* 第55天：验证快速策略关闭 Reflection Block。 */
const researchQuality = promptOptimizer.optimize(baseBlocks, researchContext, "quality"); /* 第55天：对研究任务运行质量优先策略。 */
assert.ok(researchQuality.enabledBlockIds.includes("memory.context")); /* 第55天：验证研究任务保留 Memory Block。 */
assert.ok(researchQuality.enabledBlockIds.includes("workspace.context")); /* 第55天：验证研究任务保留 Workspace Block。 */
assert.ok(researchQuality.enabledBlockIds.includes("knowledge.context")); /* 第55天：验证研究任务启用 Knowledge Block。 */
assert.ok(researchQuality.enabledBlockIds.includes("citation.requirements")); /* 第55天：验证研究任务启用 Citation Block。 */
assert.ok(researchQuality.enabledBlockIds.includes("reflection.checklist")); /* 第55天：验证高复杂度质量策略启用 Reflection Block。 */
assert.ok(researchQuality.recommendations.some((recommendation) => recommendation.id === "research-memory")); /* 第55天：验证研究任务产生 Memory 推荐。 */
const jsonBalanced = promptOptimizer.optimize(baseBlocks, jsonContext, "balanced"); /* 第55天：对 JSON 任务运行平衡策略。 */
assert.ok(jsonBalanced.enabledBlockIds.includes("output.schema-json")); /* 第55天：验证 JSON 任务启用输出结构块。 */
const reflectionFast = promptOptimizer.optimize(baseBlocks, reflectionContext, "fast"); /* 第55天：对反思任务运行快速策略。 */
assert.ok(!reflectionFast.enabledBlockIds.includes("reflection.checklist")); /* 第55天：验证快速策略优先关闭高成本反思块。 */
const reflectionQuality = promptOptimizer.optimize(baseBlocks, reflectionContext, "quality"); /* 第55天：对反思任务运行质量策略。 */
assert.ok(reflectionQuality.enabledBlockIds.includes("reflection.checklist")); /* 第55天：验证质量策略恢复 Reflection Block。 */
const evaluationBalanced = promptOptimizer.optimize(baseBlocks, evaluationContext, "balanced"); /* 第55天：对评估任务运行平衡策略。 */
assert.ok(evaluationBalanced.enabledBlockIds.includes("evaluation.rubric")); /* 第55天：验证评估任务启用 Evaluation Rubric。 */
assert.ok(evaluationBalanced.enabledBlockIds.includes("output.schema-json")); /* 第55天：验证评估任务可同时启用 JSON Schema。 */
const signalResult = promptOptimizer.optimize(baseBlocks, { ...researchContext, requiresCitation: false }, "balanced", evaluationSignals); /* 第55天：用评估弱点信号推动引用块开启。 */
assert.ok(signalResult.enabledBlockIds.includes("citation.requirements")); /* 第55天：验证 Evaluation 弱点可以反向开启 Citation Block。 */
assert.ok(signalResult.recommendations.some((recommendation) => recommendation.id === "evaluation-citation.requirements")); /* 第55天：验证评估弱点会生成 Prompt Recommendation。 */
const built = promptBuilder.buildPromptWithReport(researchQuality.blocks, sampleVariables); /* 第55天：用优化后的块构建最终动态提示词。 */
assert.ok(built.text.includes("Knowledge Context")); /* 第55天：验证最终提示词包含知识块标题。 */
assert.ok(built.text.includes("Citation Requirements")); /* 第55天：验证最终提示词包含引用块标题。 */
assert.equal(built.usedBlockIds[0]?.endsWith("active-system"), true); /* 第55天：验证高权重 system block 排在最前面。 */
const metrics = promptOptimizer.calculateMetrics([chatFast, researchQuality, jsonBalanced, reflectionQuality, evaluationBalanced, signalResult]); /* 第55天：聚合多策略优化指标。 */
assert.ok(metrics.avgBlocks > 0); /* 第55天：验证平均启用块数量为正。 */
assert.ok(metrics.strategyUsage.fast >= 1); /* 第55天：验证策略分布记录 fast 使用次数。 */
assert.ok(metrics.strategyUsage.quality >= 2); /* 第55天：验证策略分布记录 quality 使用次数。 */
assert.ok(metrics.recommendationHitRate >= 0); /* 第55天：验证推荐命中率可以稳定计算。 */
console.log("Day 55 Dynamic Prompt Optimization tests passed."); /* 第55天：输出测试通过信息。 */
