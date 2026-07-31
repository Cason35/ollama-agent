import type { EvaluationCaseV2, EvaluationDatasetTypeV2, EvaluationDatasetV2, EvaluationExecution } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入生产评估平台种子数据和确定性执行结果类型。

const FIXTURE_TIME = Date.UTC(2026, 6, 20, 8, 0, 0); // 第71天：定义测试与页面示例共用的稳定教学时间戳。

function createCase(input: { id: string; name: string; input: string; expectedOutput: string; keywords: string[]; priority?: EvaluationCaseV2["priority"]; metadata?: Record<string, unknown> }): EvaluationCaseV2 { // 第71天：定义快速创建完整 Evaluation Case V2 的种子辅助函数。
  return { id: input.id, name: input.name, input: input.input, expectedOutput: input.expectedOutput, expectedKeywords: [...input.keywords], priority: input.priority ?? "medium", source: "seed", passThreshold: 7, metadata: { latencyThresholdMs: 900, costBudget: 0.02, fixtureCreatedAt: FIXTURE_TIME, ...(input.metadata ?? {}) } }; // 第71天：返回带阈值、预算、来源和稳定时间戳的完整案例。
} // 第71天：结束 Evaluation Case V2 种子辅助函数。

function createDataset(id: string, name: string, type: EvaluationDatasetTypeV2, cases: EvaluationCaseV2[]): EvaluationDatasetV2 { // 第71天：定义快速创建活动状态 Evaluation Dataset V2 的辅助函数。
  return { id, name, type, cases, version: 2, status: "active" }; // 第71天：返回任务要求的数据集标识、名称、类型、案例、版本和状态。
} // 第71天：结束 Evaluation Dataset V2 种子辅助函数。

export function createDay71EvaluationDatasets(): EvaluationDatasetV2[] { // 第71天：创建 Agent、Workflow、Prompt、RAG 和 Memory 五类平台级数据集。
  const agent = createDataset("agent-research-v2", "Research Agent Dataset V2（研究智能体评估数据集第2版）", "agent", [createCase({ id: "agent-research-plan", name: "Research Plan（研究计划）", input: "请研究生产级 Agent 的持续改进方法", expectedOutput: "输出观察、评估、诊断、改进和验证闭环", keywords: ["观察", "评估", "诊断", "改进", "验证"], priority: "critical" }), createCase({ id: "agent-source-summary", name: "Source Summary（来源总结）", input: "总结评估平台为什么需要 Trace 和 Dataset", expectedOutput: "说明 Trace 质量链路与 Dataset 回归价值", keywords: ["Trace", "Dataset", "质量链路", "回归"], priority: "high" })]); // 第71天：创建两个覆盖研究智能体独立运行和质量链路的 Agent 数据集案例。
  const prompt = createDataset("prompt-release-v2", "Prompt Release Dataset V2（提示词发布评估数据集第2版）", "prompt", [createCase({ id: "prompt-structured-answer", name: "Structured Answer（结构化回答）", input: "生成结构化评估结论", expectedOutput: "包含结论、证据和建议", keywords: ["结论", "证据", "建议"], priority: "critical" }), createCase({ id: "prompt-safe-answer", name: "Safe Answer（安全回答）", input: "处理一个包含风险条件的请求", expectedOutput: "识别风险并给出安全替代方案", keywords: ["风险", "安全", "替代方案"], priority: "high", metadata: { forbiddenTerms: ["泄露密钥"] } }), createCase({ id: "prompt-concise-answer", name: "Concise Answer（精炼回答）", input: "用精炼方式总结质量门禁", expectedOutput: "综合分、正确性、高优先级通过率和成本", keywords: ["综合分", "正确性", "高优先级", "成本"], priority: "medium" })]); // 第71天：创建用于 Prompt V1 与 V2 回归比较和质量门禁的固定数据集。
  const ragCases = Array.from({ length: 10 }, (_, index) => createCase({ id: `rag-question-${index + 1}`, name: `Knowledge Question ${index + 1}（知识问题${index + 1}）`, input: `第${index + 1}个知识问题：生产评估平台如何形成持续改进闭环？`, expectedOutput: `回答知识问题${index + 1}并提供正确完整引用`, keywords: ["持续改进", `知识问题${index + 1}`, "引用"], priority: index < 3 ? "high" : "medium", metadata: { expectedKnowledgeBaseId: "kb-agent-platform", expectedIndexVersion: "knowledge-index-v71", expectedCitationCount: 1 } })); // 第71天：创建十个验证引用、正确性、知识库和活动索引版本的 RAG 案例。
  const rag = createDataset("rag-knowledge-v2", "RAG Knowledge Dataset V2（检索增强生成评估数据集第2版）", "rag", ragCases); // 第71天：创建包含十个知识问题的 RAG 平台级数据集。
  const workflow = createDataset("workflow-recovery-v2", "Workflow Recovery Dataset V2（工作流恢复评估数据集第2版）", "workflow", [createCase({ id: "workflow-day70-recovery", name: "Day70 Failure Recovery（第70天失败恢复）", input: "模拟检查点后服务中断并恢复执行", expectedOutput: "已完成步骤不重复、检查点正确、可靠恢复、事件时间线完整", keywords: ["不重复", "检查点", "恢复", "时间线"], priority: "critical" })]); // 第71天：创建评估第70天失败恢复流程 Reliability Score 的 Workflow 数据集。
  const memory = createDataset("memory-recall-v2", "Memory Recall Dataset V2（记忆召回评估数据集第2版）", "memory", [createCase({ id: "memory-user-preference", name: "User Preference Recall（用户偏好召回）", input: "用户偏好中文回答且需要引用", expectedOutput: "召回中文回答和引用偏好且不存在冲突", keywords: ["中文", "引用", "偏好"], priority: "high" })]); // 第71天：创建验证长期记忆命中率和冲突状态的 Memory 数据集。
  return [agent, workflow, prompt, rag, memory]; // 第71天：返回生产评估平台支持的五类活动数据集。
} // 第71天：结束 Day71 五类 Evaluation Dataset V2 工厂函数。

export function createAgentExecution(evaluationCase: EvaluationCaseV2, quality: "high" | "low" = "high"): EvaluationExecution { // 第71天：创建 Research Agent 高质量或低质量确定性执行结果。
  const output = quality === "high" ? `${evaluationCase.expectedOutput}。观察生产行为，执行评估和诊断，持续改进并通过验证；Trace 形成质量链路，Dataset 支持后续回归。` : "给出一个简短回答，但没有覆盖完整质量闭环。"; // 第71天：根据质量档位生成完整或故意遗漏的智能体输出。
  return { output, usage: { promptTokens: 120, completionTokens: quality === "high" ? 180 : 40, totalTokens: quality === "high" ? 300 : 160, latencyMs: quality === "high" ? 520 : 1250, cost: quality === "high" ? 0.012 : 0.018 }, metadata: { safetyPassed: true, correctnessScore: quality === "high" ? 9.4 : 3.5, relevanceScore: quality === "high" ? 9.2 : 4, completenessScore: quality === "high" ? 9.1 : 2.8 } }; // 第71天：返回带多维运行时诊断、延迟和成本的 Research Agent 执行结果。
} // 第71天：结束 Research Agent 确定性执行结果工厂函数。

export function createPromptExecution(evaluationCase: EvaluationCaseV2, version: "v1" | "v2"): EvaluationExecution { // 第71天：创建 Prompt V1 基线和 Prompt V2 候选确定性输出。
  const output = version === "v2" ? `${evaluationCase.expectedOutput}。${evaluationCase.expectedKeywords.join("、")}。` : `${evaluationCase.expectedOutput}。${evaluationCase.expectedKeywords.slice(0, Math.max(1, evaluationCase.expectedKeywords.length - 1)).join("、")}。`; // 第71天：让候选版本覆盖全部期望关键词并让基线轻微遗漏一个维度。
  return { output, usage: { promptTokens: version === "v2" ? 105 : 100, completionTokens: version === "v2" ? 95 : 90, totalTokens: version === "v2" ? 200 : 190, latencyMs: version === "v2" ? 420 : 510, cost: version === "v2" ? 0.0115 : 0.01 }, metadata: { safetyPassed: true, correctnessScore: version === "v2" ? 9.5 : 8.2, relevanceScore: version === "v2" ? 9.4 : 8.5, completenessScore: version === "v2" ? 9.6 : 7.8 } }; // 第71天：返回成本增长百分之十五且质量提升的候选提示词执行结果。
} // 第71天：结束 Prompt 版本确定性执行结果工厂函数。

export function createRagExecution(evaluationCase: EvaluationCaseV2): EvaluationExecution { // 第71天：创建引用正确、知识库正确且索引版本正确的 RAG 执行结果。
  const citation = `kb://kb-agent-platform/knowledge-index-v71/${evaluationCase.id}`; // 第71天：生成关联正确知识库和活动索引版本的引用标识。
  return { output: `${evaluationCase.expectedOutput}。持续改进通过观察、评估、诊断、改进和验证完成，知识问题${evaluationCase.id.split("-").at(-1)}包含引用 ${citation}。`, citations: [citation], usage: { promptTokens: 140, completionTokens: 160, totalTokens: 300, latencyMs: 640, cost: 0.014 }, metadata: { knowledgeBaseId: "kb-agent-platform", indexVersion: "knowledge-index-v71", validCitationCount: 1, safetyPassed: true, correctnessScore: 9.2, relevanceScore: 9.4, completenessScore: 9.3 } }; // 第71天：返回满足十个知识问题验收条件的 RAG 执行结果。
} // 第71天：结束 RAG 确定性执行结果工厂函数。

export function createWorkflowExecution(): EvaluationExecution { // 第71天：创建第70天失败恢复流程四项可靠性全部通过的执行结果。
  return { output: "已完成步骤不重复执行，检查点正确保存，恢复从可靠位置继续，事件时间线完整。", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 180, cost: 0 }, metadata: { noDuplicateCompletedSteps: true, checkpointSaved: true, resumeReliable: true, timelineComplete: true, safetyPassed: true } }; // 第71天：返回 Reliability Score 可达到满分的工作流诊断结果。
} // 第71天：结束工作流确定性执行结果工厂函数。

export function createMemoryExecution(evaluationCase: EvaluationCaseV2): EvaluationExecution { // 第71天：创建命中用户偏好且不存在记忆冲突的 Memory 执行结果。
  return { output: `${evaluationCase.expectedOutput}：使用中文回答，保留引用偏好。`, usage: { promptTokens: 40, completionTokens: 35, totalTokens: 75, latencyMs: 90, cost: 0.001 }, metadata: { memoryHitRate: 1, memoryConflictFree: true, safetyPassed: true, correctnessScore: 9.5, relevanceScore: 9.7, completenessScore: 9.4 } }; // 第71天：返回带记忆命中率、冲突状态和多维诊断的执行结果。
} // 第71天：结束 Memory 确定性执行结果工厂函数。
