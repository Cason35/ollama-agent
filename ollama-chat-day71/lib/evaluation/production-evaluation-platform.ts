import { EvaluationPlatformRuntime } from "@/lib/evaluation/evaluation-platform-runtime"; // 第71天：引入生产评估平台核心运行时。
import { createAgentExecution, createDay71EvaluationDatasets, createMemoryExecution, createPromptExecution, createRagExecution, createWorkflowExecution } from "@/lib/evaluation/evaluation-fixtures"; // 第71天：引入五类数据集和生产验收示例执行夹具。
import type { EvaluationPlatformSnapshot, UserFeedbackV2 } from "@/lib/evaluation/evaluation-platform-types"; // 第71天：引入 Evaluation Explorer V2 快照和用户反馈类型。

export class ProductionEvaluationPlatform { // 第71天：组合 Evaluation Runner V2、数据集、回归、门禁、在线评估和反馈闭环示例。
  readonly runtime = new EvaluationPlatformRuntime(); // 第71天：创建继承 RuntimeContext、EventBus 和 UnifiedRegistry 的评估运行时。
  private seedPromise?: Promise<void>; // 第71天：保存幂等示例初始化任务避免并发 GET 重复创建运行。
  constructor() { for (const dataset of createDay71EvaluationDatasets()) this.runtime.datasetProvider.register(dataset); } // 第71天：注册 Agent、Workflow、Prompt、RAG 和 Memory 五类活动数据集。
  async ensureDemoData(): Promise<void> { // 第71天：幂等执行任务清单要求的生产评估示例。
    this.seedPromise ??= this.seed(); // 第71天：首次调用创建示例运行，后续调用复用同一初始化任务。
    await this.seedPromise; // 第71天：等待示例平台完成全部评估、回归、门禁和反馈闭环。
  } // 第71天：结束幂等示例数据初始化方法。
  async getSnapshot(): Promise<EvaluationPlatformSnapshot> { await this.ensureDemoData(); return this.runtime.getSnapshot(); } // 第71天：返回 Evaluation Explorer V2 所需完整平台快照。
  async submitFeedback(input: { resultId: string; sentiment: "positive" | "negative"; rating: number; comment?: string }): Promise<{ feedback: UserFeedbackV2; snapshot: EvaluationPlatformSnapshot }> { await this.ensureDemoData(); const feedback = await this.runtime.submitFeedback(input); return { feedback, snapshot: this.runtime.getSnapshot() }; } // 第71天：保存页面提交的用户反馈并返回更新后的坏案例闭环快照。
  private async seed(): Promise<void> { // 第71天：执行 Agent、Prompt、RAG、Workflow、Memory、Online 和 Bad Case Loop 示例。
    await this.runtime.runEvaluation({ type: "offline", datasetId: "agent-research-v2", label: "Research Agent Production Evaluation", agentId: "research-agent", taskId: "day71-agent-evaluation", executeCase: (evaluationCase) => createAgentExecution(evaluationCase, "high") }); // 第71天：Case 1 运行 Research Agent 并生成独立 EvaluationRun、RuntimeContext 和 Trace。
    const baseline = await this.runtime.runEvaluation({ type: "offline", datasetId: "prompt-release-v2", label: "Prompt V1 Baseline", taskId: "day71-prompt-v1", executeCase: (evaluationCase) => createPromptExecution(evaluationCase, "v1") }); // 第71天：Case 2 在固定数据集上执行 Prompt V1 基线评估。
    await this.runtime.runEvaluation({ type: "experiment", datasetId: "prompt-release-v2", label: "Prompt V2 Experiment", taskId: "day71-prompt-experiment", executeCase: (evaluationCase) => createPromptExecution(evaluationCase, "v2") }); // 第71天：创建 Prompt V2 实验评估运行覆盖 experiment 类型。
    const candidate = await this.runtime.runEvaluation({ type: "regression", datasetId: "prompt-release-v2", label: "Prompt V2 Candidate", taskId: "day71-prompt-v2", executeCase: (evaluationCase) => createPromptExecution(evaluationCase, "v2") }); // 第71天：Case 2 创建 Prompt V2 候选回归运行并保存多维评分。
    await this.runtime.compareRegression(baseline.id, candidate.id); // 第71天：比较 Prompt V1 与 V2 并执行 Quality Gate V2。
    await this.runtime.runEvaluation({ type: "offline", datasetId: "rag-knowledge-v2", label: "RAG 10 Knowledge Questions", taskId: "day71-rag-evaluation", executeCase: createRagExecution }); // 第71天：Case 3 运行十个知识问题并验证引用、知识库和活动索引版本。
    await this.runtime.runEvaluation({ type: "offline", datasetId: "workflow-recovery-v2", label: "Day70 Workflow Reliability", taskId: "day71-workflow-evaluation", executeCase: () => createWorkflowExecution() }); // 第71天：Case 4 评估第70天失败恢复流程并生成 Reliability Score。
    await this.runtime.runEvaluation({ type: "offline", datasetId: "memory-recall-v2", label: "Production Memory Recall", taskId: "day71-memory-evaluation", executeCase: createMemoryExecution }); // 第71天：补充 Memory Dataset V2 生产记忆召回评估运行。
    const online = await this.runtime.runOnlineEvaluation({ requestId: "production-request-feedback-risk", datasetId: "agent-research-v2", label: "Online Evaluation · Feedback Risk", sampleRate: 0.05, latencyMs: 1280, latencyThresholdMs: 900, userFeedback: 2, executeCase: (evaluationCase) => createAgentExecution(evaluationCase, "low") }); // 第71天：Case 5 通过低反馈和高延迟风险自动触发在线评估。
    const firstResultId = online.run?.resultIds[0]; // 第71天：读取低分在线评估的首个案例结果标识。
    if (firstResultId) await this.runtime.submitFeedback({ resultId: firstResultId, sentiment: "negative", rating: 2, comment: "线上回答遗漏持续改进闭环，需要进入后续回归测试。" }); // 第71天：把线上低分输出自动沉淀为 Bad Case 和 Dataset 回归案例。
  } // 第71天：结束生产评估平台示例初始化方法。
} // 第71天：结束 Production Evaluation Platform 组合实现。

export const productionEvaluationPlatform = new ProductionEvaluationPlatform(); // 第71天：导出进程级生产评估平台单例供 API Route Handler 复用。
