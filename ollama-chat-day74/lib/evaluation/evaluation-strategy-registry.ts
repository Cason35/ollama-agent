import type { UnifiedRegistry } from "@/lib/registry/unified-registry"; // 第71天：引入统一注册中心以登记全部评估器和平台核心能力。
import type { EvaluationDatasetTypeV2, EvaluationStrategy, EvaluationStrategyInput, EvaluationStrategyOutput } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入评估器统一协议、输入输出和数据集类型。

const DAY71_CREATED_AT = Date.UTC(2026, 6, 20, 0, 0, 0); // 第71天：定义生产评估平台注册项稳定创建时间戳。

function clampScore(value: number): number { // 第71天：定义所有评估器共用的零到十分评分收敛函数。
  return Number(Math.min(10, Math.max(0, value)).toFixed(2)); // 第71天：限制评分范围并保留两位小数供回归比较。
} // 第71天：结束评分收敛函数。

function keywordCoverage(input: EvaluationStrategyInput): { matched: string[]; missing: string[]; score: number } { // 第71天：定义期望关键词覆盖率计算函数供正确性与完整性评估器复用。
  const normalizedOutput = input.execution.output.toLowerCase(); // 第71天：把实际输出标准化为小写文本以执行稳定匹配。
  const matched = input.evaluationCase.expectedKeywords.filter((keyword) => normalizedOutput.includes(keyword.toLowerCase())); // 第71天：收集实际输出已经覆盖的期望关键词。
  const missing = input.evaluationCase.expectedKeywords.filter((keyword) => !normalizedOutput.includes(keyword.toLowerCase())); // 第71天：收集实际输出仍然遗漏的期望关键词。
  const score = input.evaluationCase.expectedKeywords.length === 0 ? 10 : clampScore((matched.length / input.evaluationCase.expectedKeywords.length) * 10); // 第71天：把关键词覆盖比例换算为零到十分评分。
  return { matched, missing, score }; // 第71天：返回命中项、遗漏项和覆盖评分。
} // 第71天：结束期望关键词覆盖率计算函数。

function metadataNumber(input: EvaluationStrategyInput, key: string, fallback: number): number { // 第71天：定义从执行元数据安全读取数字诊断值的辅助函数。
  const value = input.execution.metadata?.[key]; // 第71天：读取指定执行元数据字段。
  return typeof value === "number" && Number.isFinite(value) ? value : fallback; // 第71天：合法数字直接返回，否则使用调用方提供的默认值。
} // 第71天：结束执行元数据数字读取函数。

function metadataBoolean(input: EvaluationStrategyInput, key: string, fallback: boolean): boolean { // 第71天：定义从执行元数据安全读取布尔诊断值的辅助函数。
  const value = input.execution.metadata?.[key]; // 第71天：读取指定执行元数据字段。
  return typeof value === "boolean" ? value : fallback; // 第71天：合法布尔值直接返回，否则使用调用方提供的默认值。
} // 第71天：结束执行元数据布尔读取函数。

function makeOutput(evaluator: EvaluationStrategy, scores: EvaluationStrategyOutput["scores"], reasons: string[]): EvaluationStrategyOutput { // 第71天：定义构建统一评估器输出的辅助函数。
  return { evaluatorId: evaluator.id, evaluatorVersion: evaluator.version, scores, reasons }; // 第71天：返回包含评估器版本、部分维度评分和解释的标准结果。
} // 第71天：结束统一评估器输出构建函数。

class CorrectnessEvaluator implements EvaluationStrategy { // 第71天：实现正确性、相关性和完整性基础评估器。
  readonly id = "evaluation:evaluator:correctness"; // 第71天：声明正确性评估器统一标识。
  readonly name = "CorrectnessEvaluator（正确性评估器）"; // 第71天：声明正确性评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明正确性评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["agent", "workflow", "prompt", "rag", "memory"]; // 第71天：允许基础正确性评估器服务全部数据集类型。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：根据期望关键词和输出长度计算基础多维评分。
    const coverage = keywordCoverage(input); // 第71天：计算实际输出对期望关键词的覆盖情况。
    const relevance = metadataNumber(input, "relevanceScore", Math.min(10, coverage.score + (input.execution.output.length > 0 ? 0.5 : 0))); // 第71天：优先采用运行时相关性诊断，否则从关键词覆盖和非空输出推导。
    const completeness = metadataNumber(input, "completenessScore", coverage.score); // 第71天：优先采用运行时完整性诊断，否则使用关键词覆盖评分。
    const correctness = metadataNumber(input, "correctnessScore", coverage.score); // 第71天：优先采用运行时正确性诊断，否则使用关键词覆盖评分。
    const reasons = [`命中关键词：${coverage.matched.join("、") || "无"}`, `遗漏关键词：${coverage.missing.join("、") || "无"}`]; // 第71天：生成可在案例分析页面展示的确定性评分原因。
    return makeOutput(this, { correctness: clampScore(correctness), relevance: clampScore(relevance), completeness: clampScore(completeness) }, reasons); // 第71天：返回正确性、相关性和完整性评分。
  } // 第71天：结束正确性评估方法。
} // 第71天：结束 CorrectnessEvaluator 实现。

class CitationEvaluator implements EvaluationStrategy { // 第71天：实现引用存在性、正确性和完整性评估器。
  readonly id = "evaluation:evaluator:citation"; // 第71天：声明引用质量评估器统一标识。
  readonly name = "CitationEvaluator（引用质量评估器）"; // 第71天：声明引用质量评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明引用质量评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["rag"]; // 第71天：限定引用质量评估器只服务 RAG 数据集。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：根据引用列表和正确引用比例计算相关性与完整性。
    const citations = input.execution.citations ?? []; // 第71天：读取实际输出关联的引用列表。
    const expectedCount = metadataNumber(input, "expectedCitationCount", 1); // 第71天：读取案例要求的最少引用数量。
    const validCount = metadataNumber(input, "validCitationCount", citations.length); // 第71天：读取经知识服务验证的正确引用数量。
    const completeness = expectedCount <= 0 ? 10 : clampScore((Math.min(citations.length, expectedCount) / expectedCount) * 10); // 第71天：把引用数量覆盖率换算为完整性评分。
    const correctness = citations.length === 0 ? 0 : clampScore((Math.min(validCount, citations.length) / citations.length) * 10); // 第71天：把正确引用比例换算为正确性评分。
    return makeOutput(this, { correctness, completeness, relevance: clampScore((correctness + completeness) / 2) }, [`引用数量 ${citations.length}/${expectedCount}`, `有效引用 ${validCount}/${citations.length || 1}`]); // 第71天：返回引用质量相关多维评分和诊断说明。
  } // 第71天：结束引用质量评估方法。
} // 第71天：结束 CitationEvaluator 实现。

class RAGEvaluator implements EvaluationStrategy { // 第71天：实现知识库作用域、活动索引和检索正确性评估器。
  readonly id = "evaluation:evaluator:rag"; // 第71天：声明 RAG 评估器统一标识。
  readonly name = "RAGEvaluator（检索增强生成评估器）"; // 第71天：声明 RAG 评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明 RAG 评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["rag"]; // 第71天：限定 RAG 评估器只服务检索增强生成数据集。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：验证知识库和活动索引是否与案例期望一致。
    const expectedKnowledgeBaseId = String(input.evaluationCase.metadata.expectedKnowledgeBaseId ?? ""); // 第71天：读取案例期望知识库标识。
    const expectedIndexVersion = String(input.evaluationCase.metadata.expectedIndexVersion ?? ""); // 第71天：读取案例期望活动索引版本。
    const actualKnowledgeBaseId = String(input.execution.metadata?.knowledgeBaseId ?? ""); // 第71天：读取运行时实际命中的知识库标识。
    const actualIndexVersion = String(input.execution.metadata?.indexVersion ?? ""); // 第71天：读取运行时实际使用的索引版本。
    const knowledgeBasePassed = !expectedKnowledgeBaseId || expectedKnowledgeBaseId === actualKnowledgeBaseId; // 第71天：判断检索结果是否来自正确知识库。
    const indexPassed = !expectedIndexVersion || expectedIndexVersion === actualIndexVersion; // 第71天：判断检索结果是否来自活动索引版本。
    const retrievalScore = clampScore((Number(knowledgeBasePassed) + Number(indexPassed)) * 5); // 第71天：把知识库和索引两项一致性换算为检索评分。
    return makeOutput(this, { correctness: retrievalScore, relevance: retrievalScore }, [`知识库${knowledgeBasePassed ? "正确" : "错误"}：${actualKnowledgeBaseId || "未提供"}`, `索引${indexPassed ? "正确" : "错误"}：${actualIndexVersion || "未提供"}`]); // 第71天：返回检索正确性、相关性和可解释诊断。
  } // 第71天：结束 RAG 评估方法。
} // 第71天：结束 RAGEvaluator 实现。

class WorkflowEvaluator implements EvaluationStrategy { // 第71天：实现第70天工作流失败恢复可靠性评估器。
  readonly id = "evaluation:evaluator:workflow"; // 第71天：声明工作流评估器统一标识。
  readonly name = "WorkflowEvaluator（工作流评估器）"; // 第71天：声明工作流评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明工作流评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["workflow"]; // 第71天：限定工作流评估器只服务 Workflow 数据集。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：评估无重复执行、检查点、可靠恢复和事件时间线四项能力。
    const checks = [metadataBoolean(input, "noDuplicateCompletedSteps", false), metadataBoolean(input, "checkpointSaved", false), metadataBoolean(input, "resumeReliable", false), metadataBoolean(input, "timelineComplete", false)]; // 第71天：读取第70天失败恢复流程四项可靠性诊断。
    const reliabilityScore = clampScore((checks.filter(Boolean).length / checks.length) * 10); // 第71天：把四项通过比例换算为 Reliability Score。
    const reasons = [`已完成步骤未重复执行：${checks[0] ? "是" : "否"}`, `Checkpoint 正确保存：${checks[1] ? "是" : "否"}`, `Resume 从可靠位置继续：${checks[2] ? "是" : "否"}`, `Event Timeline 完整：${checks[3] ? "是" : "否"}`]; // 第71天：生成工作流可靠性四项诊断说明。
    return makeOutput(this, { correctness: reliabilityScore, completeness: reliabilityScore, relevance: reliabilityScore }, reasons); // 第71天：返回可用于综合分和页面展示的工作流可靠性评分。
  } // 第71天：结束工作流可靠性评估方法。
} // 第71天：结束 WorkflowEvaluator 实现。

class MemoryEvaluator implements EvaluationStrategy { // 第71天：实现记忆召回命中率、冲突和上下文相关性评估器。
  readonly id = "evaluation:evaluator:memory"; // 第71天：声明记忆评估器统一标识。
  readonly name = "MemoryEvaluator（记忆评估器）"; // 第71天：声明记忆评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明记忆评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["memory"]; // 第71天：限定记忆评估器只服务 Memory 数据集。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：根据记忆命中率和冲突状态计算相关性与正确性。
    const memoryHitRate = clampScore(metadataNumber(input, "memoryHitRate", 0) * 10); // 第71天：把零到一的记忆命中率换算为十分制评分。
    const conflictFree = metadataBoolean(input, "memoryConflictFree", false); // 第71天：读取召回记忆是否不存在未解决冲突。
    const correctness = clampScore((memoryHitRate + (conflictFree ? 10 : 0)) / 2); // 第71天：综合命中率和冲突状态生成正确性评分。
    return makeOutput(this, { correctness, relevance: memoryHitRate, completeness: memoryHitRate }, [`记忆命中率：${(memoryHitRate * 10).toFixed(0)}%`, `记忆冲突：${conflictFree ? "无" : "存在"}`]); // 第71天：返回记忆评估多维评分和诊断说明。
  } // 第71天：结束记忆评估方法。
} // 第71天：结束 MemoryEvaluator 实现。

class SafetyEvaluator implements EvaluationStrategy { // 第71天：实现覆盖全部评估类型的基础安全评估器。
  readonly id = "evaluation:evaluator:safety"; // 第71天：声明安全评估器统一标识。
  readonly name = "SafetyEvaluator（安全评估器）"; // 第71天：声明安全评估器展示名称。
  readonly version = "day71.v2"; // 第71天：声明安全评估器第二版版本。
  readonly supportedTypes: EvaluationDatasetTypeV2[] = ["agent", "workflow", "prompt", "rag", "memory"]; // 第71天：允许安全评估器服务全部数据集类型。
  evaluate(input: EvaluationStrategyInput): EvaluationStrategyOutput { // 第71天：根据显式安全诊断和禁用词命中情况计算安全评分。
    const forbiddenTerms = Array.isArray(input.evaluationCase.metadata.forbiddenTerms) ? input.evaluationCase.metadata.forbiddenTerms.map(String) : []; // 第71天：读取案例声明的禁用词列表。
    const normalizedOutput = input.execution.output.toLowerCase(); // 第71天：标准化实际输出用于禁用词匹配。
    const hits = forbiddenTerms.filter((term) => normalizedOutput.includes(term.toLowerCase())); // 第71天：收集实际输出命中的全部禁用词。
    const safetyPassed = metadataBoolean(input, "safetyPassed", hits.length === 0); // 第71天：优先采用运行时安全判断，否则根据禁用词命中推导。
    const safety = safetyPassed && hits.length === 0 ? 10 : clampScore(10 - Math.max(5, hits.length * 2)); // 第71天：安全通过得满分，否则根据违规数量扣分。
    return makeOutput(this, { safety }, [safetyPassed ? "安全策略通过" : "安全策略未通过", `禁用词命中：${hits.join("、") || "无"}`]); // 第71天：返回安全评分和可解释违规原因。
  } // 第71天：结束安全评估方法。
} // 第71天：结束 SafetyEvaluator 实现。

export class EvaluationStrategyRegistry { // 第71天：实现独立评估策略注册中心并同步接入 UnifiedRegistry。
  private readonly strategies = new Map<string, EvaluationStrategy>(); // 第71天：按评估器标识保存可插拔策略实现。
  constructor(private readonly registry: UnifiedRegistry) {} // 第71天：注入统一注册中心用于跨平台能力发现。
  register(strategy: EvaluationStrategy): void { // 第71天：注册一个实现统一协议的新评估策略。
    this.strategies.set(strategy.id, strategy); // 第71天：把策略实现写入运行时评估器映射。
    this.registry.upsert({ id: strategy.id, name: strategy.name, type: "evaluation", version: strategy.version, metadata: { description: `${strategy.name} 可插拔评估策略`, capabilities: ["evaluation", "evaluator", ...strategy.supportedTypes], tags: ["day71", "evaluation", "strategy"], supportedTypes: strategy.supportedTypes }, enabled: true, createdAt: DAY71_CREATED_AT }); // 第71天：把策略版本、能力和支持类型同步到 UnifiedRegistry。
  } // 第71天：结束单个评估策略注册方法。
  get(id: string): EvaluationStrategy | undefined { return this.strategies.get(id); } // 第71天：按唯一标识读取可插拔评估策略。
  list(type?: EvaluationDatasetTypeV2): EvaluationStrategy[] { return Array.from(this.strategies.values()).filter((strategy) => !type || strategy.supportedTypes.includes(type)); } // 第71天：列出全部或支持指定数据集类型的评估策略。
} // 第71天：结束 Evaluation Strategy Registry 实现。

export function registerEvaluationPlatformCapabilities(registry: UnifiedRegistry): void { // 第71天：向 UnifiedRegistry 注册 Runner、QualityGate 和 DatasetProvider 三类平台核心能力。
  registry.upsert({ id: "evaluation:runner:v2", name: "EvaluationRunner V2（评估执行器第2版）", type: "evaluation", version: "day71.v2", metadata: { description: "统一执行 Input、Runtime、Trace、Evaluator 和 Evaluation Result", capabilities: ["evaluation-runner", "online", "offline", "regression", "experiment"], tags: ["day71", "evaluation", "runner"] }, enabled: true, createdAt: DAY71_CREATED_AT }); // 第71天：注册统一 Evaluation Runner V2 能力。
  registry.upsert({ id: "evaluation:quality-gate:v2", name: "QualityGate V2（质量门禁第2版）", type: "evaluation", version: "day71.v2", metadata: { description: "检查综合分、正确性、高优先级通过率和成本增长", capabilities: ["quality-gate", "promotion", "regression"], tags: ["day71", "evaluation", "quality-gate"] }, enabled: true, createdAt: DAY71_CREATED_AT }); // 第71天：注册多维质量门禁第二版能力。
  registry.upsert({ id: "evaluation:dataset-provider:v2", name: "DatasetProvider V2（数据集提供者第2版）", type: "evaluation", version: "day71.v2", metadata: { description: "管理 Agent、Workflow、Prompt、RAG 与 Memory 平台级评估数据集", capabilities: ["dataset-provider", "feedback-loop", "bad-case"], tags: ["day71", "evaluation", "dataset"] }, enabled: true, createdAt: DAY71_CREATED_AT }); // 第71天：注册平台级评估数据集提供者能力。
} // 第71天：结束生产评估平台核心能力注册函数。

export function createDefaultEvaluationStrategyRegistry(registry: UnifiedRegistry): EvaluationStrategyRegistry { // 第71天：创建包含任务清单要求六种评估器的默认策略注册中心。
  const strategies = new EvaluationStrategyRegistry(registry); // 第71天：创建绑定 UnifiedRegistry 的独立评估策略注册中心。
  for (const strategy of [new CorrectnessEvaluator(), new CitationEvaluator(), new RAGEvaluator(), new WorkflowEvaluator(), new MemoryEvaluator(), new SafetyEvaluator()]) strategies.register(strategy); // 第71天：注册正确性、引用、RAG、工作流、记忆和安全六种评估器。
  registerEvaluationPlatformCapabilities(registry); // 第71天：注册 Evaluation Runner、QualityGate 和 DatasetProvider 核心能力。
  return strategies; // 第71天：返回已经完成全部能力注册的策略中心。
} // 第71天：结束默认评估策略注册中心工厂函数。
