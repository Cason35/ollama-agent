import { createDefaultPromptRegistry } from "@/lib/prompts/default-prompts"; // 第67天：引入兼容旧提示词能力的默认注册表工厂。
import { PromptPromotionService } from "@/lib/prompts/prompt-promotion-service"; // 第67天：引入提示词发布、回滚、归档和审计服务。
import { PromptRuntimeService } from "@/lib/prompts/prompt-runtime-service"; // 第67天：引入生产提示词完整运行链路服务。
import { registerDefaultProductionPrompts } from "@/lib/prompts/production-prompt-defaults"; // 第67天：引入三类智能体默认生产提示词版本。
import { ProductionPromptExperimentService } from "@/lib/prompts/production-prompt-experiment-service"; // 第67天：引入通用生产提示词实验管理服务。
import type { ProductionPromptComparison, ProductionPromptPlatformSnapshot, PromptPromotionEvidence, PromptRuntimeResult } from "@/lib/prompts/production-prompt-types"; // 第67天：引入平台快照、比较、证据和运行结果类型。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第67天：复用第66天完整统一注册中心作为生产平台基础。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第67天：引入统一运行时上下文构建器。

export type ProductionPromptAction = "approve" | "promote" | "rollback" | "archive"; // 第67天：定义 Prompt Explorer V2 可触发的生产生命周期动作。

const GOOD_EVIDENCE: PromptPromotionEvidence = { score: { correctness: 94, relevance: 93, cost: 96, latency: 95, overall: 93.95 }, sampleSize: 3, highPriorityRegressionCount: 0, maxCostUsd: 0.004, maxLatencyMs: 900, actualCostUsd: 0.0012, actualLatencyMs: 420 }; // 第67天：定义通过质量门禁的稳定教学发布证据。
const BLOCKED_EVIDENCE: PromptPromotionEvidence = { score: { correctness: 76, relevance: 78, cost: 99, latency: 99, overall: 82.1 }, sampleSize: 3, highPriorityRegressionCount: 1, maxCostUsd: 0.004, maxLatencyMs: 900, actualCostUsd: 0.0004, actualLatencyMs: 230 }; // 第67天：定义验证质量门禁阻断能力的失败证据。

export class ProductionPromptPlatform { // 第67天：组合注册、运行、实验、评分、晋级和运营控制台所需能力。
  readonly unifiedRegistry = createDay66UnifiedRegistry(); // 第67天：创建继承全部历史能力的统一注册中心。
  readonly promptRegistry = registerDefaultProductionPrompts(createDefaultPromptRegistry(this.unifiedRegistry)); // 第67天：把旧提示词和生产提示词版本统一接入注册中心。
  readonly runtime = new PromptRuntimeService(this.promptRegistry, this.unifiedRegistry); // 第67天：创建通过统一注册协议加载版本的提示词运行服务。
  readonly promotion = new PromptPromotionService(this.promptRegistry); // 第67天：创建带质量门禁和审计日志的发布服务。
  readonly experiments = new ProductionPromptExperimentService(this.promptRegistry, this.runtime); // 第67天：创建跨 Agent、数据集和版本的通用实验服务。

  getSnapshot(): ProductionPromptPlatformSnapshot { // 第67天：生成 Prompt Explorer V2 和 API 共用的平台快照。
    const runtimeDemos = [this.runDemo("research", "研究生产提示词平台的统一注册与追踪"), this.runDemo("writer", "把第67天实现整理为可执行发布说明"), this.runDemo("critic", "审查提示词质量门禁、回滚和归档流程")]; // 第67天：运行 Research、Writer 和 Critic 三条完整生产提示词链路。
    const experiments = this.experiments.runAll(); // 第67天：运行三个通用 A/B 测试实验并生成优胜选择结果。
    const registryItems = this.unifiedRegistry.list("prompt").filter((item) => Boolean(item.metadata.promptId)); // 第67天：只读取统一注册中心中的生产提示词版本注册项。
    return { prompts: this.promptRegistry.listProduction(), registryItems, runtimeDemos, experiments, metrics: this.runtime.listMetrics(), audits: this.promotion.listAudits(), generatedAt: Date.now() }; // 第67天：返回版本、注册项、运行链路、实验、指标和审计日志。
  } // 第67天：结束生产提示词平台快照生成方法。

  performAction(action: ProductionPromptAction, agentId: string, version: string): ProductionPromptPlatformSnapshot { // 第67天：定义运营控制台统一生命周期动作入口。
    const evidence = this.evidenceFor(agentId, version); // 第67天：读取目标版本最近一次稳定实验和质量门禁证据。
    if (action === "approve") this.promotion.approve(agentId, version, evidence); // 第67天：对 testing 版本执行质量审批。
    if (action === "promote") this.promotion.promote(agentId, version, evidence); // 第67天：对 approved 版本执行生产晋级。
    if (action === "rollback") this.promotion.rollback(agentId, version); // 第67天：重新启用历史版本完成快速回滚。
    if (action === "archive") this.promotion.archive(agentId, version); // 第67天：把目标版本归档为 deprecated。
    return this.getSnapshot(); // 第67天：动作完成后返回最新运营控制台快照。
  } // 第67天：结束运营控制台生命周期动作入口。

  discoverPromptDependencies(agentId: string) { // 第67天：定义 Agent 和 Workflow 通过统一注册中心发现依赖提示词的方法。
    return this.unifiedRegistry.discoverCapability(agentId, "prompt"); // 第67天：返回已启用生产提示词版本和可解释命中原因。
  } // 第67天：结束生产提示词依赖发现方法。

  compare(leftId: string, rightId: string): ProductionPromptComparison { // 第67天：定义 Prompt Explorer V2 的版本比较能力。
    const left = this.promptRegistry.getProductionById(leftId); // 第67天：读取左侧生产提示词版本。
    const right = this.promptRegistry.getProductionById(rightId); // 第67天：读取右侧生产提示词版本。
    if (!left || !right) throw new Error("比较的 ProductionPrompt 版本不存在"); // 第67天：任一版本缺失时阻止生成错误比较结果。
    const leftBlocks = new Set(left.blocks.map((block) => block.id.split(".").slice(-1)[0])); // 第67天：提取左侧版本逻辑提示词块标识。
    const rightBlocks = new Set(right.blocks.map((block) => block.id.split(".").slice(-1)[0])); // 第67天：提取右侧版本逻辑提示词块标识。
    return { leftId, rightId, addedBlockIds: Array.from(rightBlocks).filter((id) => !leftBlocks.has(id)), removedBlockIds: Array.from(leftBlocks).filter((id) => !rightBlocks.has(id)), strategyChanged: left.strategy !== right.strategy }; // 第67天：返回新增块、移除块和策略变化结果。
  } // 第67天：结束生产提示词版本比较方法。

  private runDemo(agentId: string, task: string): PromptRuntimeResult { // 第67天：定义三类智能体完整生产链路演示函数。
    const runtimeContext = runtimeContextBuilder.build({ agentId, taskId: `${agentId}-day67-demo`, memoryContext: { summary: `${agentId} 的历史经验` }, workspace: { upstream: "Day67 共享工作空间结果" }, retrievalContext: { knowledge: "Production Prompt Platform、Unified Registry、Trace、Evaluation", citations: ["knowledge://day67/production-prompt"] }, promptContext: { task, userIntent: task, strategy: agentId === "research" ? "quality" : "balanced" }, modelContext: { provider: "mimo", model: "mimo-v2-flash" }, metadata: { task, userIntent: task } }); // 第67天：构建同时提供记忆、工作区、知识、策略和用户意图的统一上下文。
    return this.runtime.renderPrompt({ agentId, runtimeContext }); // 第67天：执行 Agent、Prompt、Model 和 Evaluation 完整链路。
  } // 第67天：结束三类智能体完整生产链路演示函数。

  private evidenceFor(agentId: string, version: string): PromptPromotionEvidence { // 第67天：定义按目标版本选择质量门禁证据的方法。
    return agentId === "critic" && version === "v2" ? BLOCKED_EVIDENCE : GOOD_EVIDENCE; // 第67天：让 critic.v2 稳定验证门禁失败，其余候选使用通过证据。
  } // 第67天：结束目标版本质量门禁证据选择方法。
} // 第67天：结束 ProductionPromptPlatform 组合实现。

const globalPlatform = globalThis as typeof globalThis & { day67ProductionPromptPlatform?: ProductionPromptPlatform }; // 第67天：扩展全局对象类型以在开发热更新期间复用平台状态。
export const productionPromptPlatform = globalPlatform.day67ProductionPromptPlatform ?? new ProductionPromptPlatform(); // 第67天：创建或复用进程级生产提示词平台单例。
globalPlatform.day67ProductionPromptPlatform = productionPromptPlatform; // 第67天：保存平台单例以让 API 生命周期动作保持状态。
