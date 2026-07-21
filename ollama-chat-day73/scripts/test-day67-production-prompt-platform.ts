import assert from "node:assert/strict"; // 第67天：引入 Node.js 严格断言工具。
import { ProductionPromptPlatform } from "@/lib/prompts/production-prompt-platform"; // 第67天：引入可创建隔离实例的生产提示词平台。
import { calculatePromptQualityScore } from "@/lib/prompts/production-prompt-quality"; // 第67天：引入提示词质量评分归一化函数。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第67天：引入统一运行时上下文构建器。

function log(message: string): void { // 第67天：定义测试进度中文日志函数。
  console.log(`✓ ${message}`); // 第67天：输出单项测试通过信息。
} // 第67天：结束测试进度日志函数。

function main(): void { // 第67天：定义生产提示词平台自动化测试入口。
  const platform = new ProductionPromptPlatform(); // 第67天：创建不受 API 单例状态影响的隔离测试平台。

  const prompts = platform.promptRegistry.listProduction(); // 第67天：读取全部生产提示词版本。
  assert.ok(prompts.some((prompt) => prompt.id === "research.v1")); // 第67天：验证 Research Agent 的 research.v1 已注册。
  assert.ok(prompts.some((prompt) => prompt.id === "writer.v2")); // 第67天：验证 Writer Agent 的 writer.v2 已注册。
  assert.ok(prompts.some((prompt) => prompt.id === "critic.v1")); // 第67天：验证 Critic Agent 的 critic.v1 已注册。
  assert.equal(new Set(prompts.map((prompt) => prompt.id)).size, prompts.length); // 第67天：验证每个 Prompt Version 都以独立标识注册。
  log("ProductionPrompt 为三个 Agent 注册了独立版本"); // 第67天：记录生产提示词版本注册测试通过。

  const researchV1Item = platform.unifiedRegistry.get("prompt:research@v1"); // 第67天：从统一注册中心读取 research.v1 注册项。
  const researchV2Item = platform.unifiedRegistry.get("prompt:research@v2"); // 第67天：从统一注册中心读取 research.v2 注册项。
  assert.equal(researchV1Item?.enabled, true); // 第67天：验证 active 状态与统一注册项 enabled 一致。
  assert.equal(researchV2Item?.enabled, false); // 第67天：验证 testing 状态在统一注册中心保持禁用。
  assert.equal(researchV1Item?.metadata.agentId, "research"); // 第67天：验证统一注册元数据包含关联智能体。
  assert.ok(Array.isArray(researchV1Item?.metadata.blockIds)); // 第67天：验证统一注册元数据包含提示词块标识。
  log("PromptRegistry 与 UnifiedRegistry 保持版本和状态一致"); // 第67天：记录生产提示词统一注册集成测试通过。

  const discoveries = platform.discoverPromptDependencies("research"); // 第67天：模拟 Agent 或 Workflow 发现依赖提示词。
  assert.ok(discoveries.some((result) => result.item.id === "prompt:research@v1")); // 第67天：验证能力发现返回启用的 research.v1。
  assert.ok(discoveries.every((result) => result.item.enabled)); // 第67天：验证能力发现不会返回 testing 或 deprecated 版本。
  log("Agent 和 Workflow 可通过统一协议发现启用提示词"); // 第67天：记录生产提示词能力发现测试通过。

  const runtimeContext = runtimeContextBuilder.build({ agentId: "writer", taskId: "day67-writer-test", memoryContext: { preference: "简洁中文" }, workspace: { research: "统一注册与提示词发布资料" }, retrievalContext: { knowledge: "Trace、Quality Gate 与 Rollback", citations: ["knowledge://day67/test"] }, promptContext: { task: "生成第67天发布说明", userIntent: "获得可执行的发布说明", strategy: "balanced" }, modelContext: { model: "mimo-v2-flash" }, metadata: { task: "生成第67天发布说明", userIntent: "获得可执行的发布说明" } }); // 第67天：构建包含五类提示词上下文来源的统一运行时上下文。
  const runtimeResult = platform.runtime.renderPrompt({ agentId: "writer", runtimeContext }); // 第67天：执行 Writer Agent 生产提示词完整链路。
  assert.equal(runtimeResult.prompt.id, "writer.v2"); // 第67天：验证运行时按 Agent 自动选择 active 版本。
  assert.ok(runtimeResult.renderedPrompt.includes("长期记忆")); // 第67天：验证提示词从 RuntimeContext 读取 Memory。
  assert.ok(runtimeResult.renderedPrompt.includes("共享工作空间")); // 第67天：验证提示词从 RuntimeContext 读取 Workspace。
  assert.ok(runtimeResult.renderedPrompt.includes("知识上下文")); // 第67天：验证提示词从 RuntimeContext 读取 Knowledge。
  assert.ok(runtimeResult.renderedPrompt.includes("运行策略")); // 第67天：验证提示词从 RuntimeContext 读取 Strategy。
  assert.ok(runtimeResult.renderedPrompt.includes("用户意图")); // 第67天：验证提示词从 RuntimeContext 读取 User Intent。
  assert.equal(runtimeResult.trace.promptId, "writer.v2"); // 第67天：验证 Prompt ID 自动进入 Trace。
  assert.equal(runtimeResult.trace.version, "v2"); // 第67天：验证 Prompt Version 自动进入 Trace。
  assert.deepEqual(runtimeResult.trace.blocks, runtimeResult.build.usedBlockIds); // 第67天：验证 Trace 中的块与实际渲染块一致。
  assert.equal(runtimeResult.runtimeContext.promptContext?.version, "v2"); // 第67天：验证提示词版本写回统一运行时上下文。
  log("PromptRuntimeService 完成选择、优化、渲染和 Trace 绑定"); // 第67天：记录生产提示词运行时测试通过。

  assert.equal(runtimeResult.metrics.model, "mimo-v2-flash"); // 第67天：验证提示词指标关联模型调用。
  assert.ok(runtimeResult.metrics.promptTokens > 0); // 第67天：验证提示词指标记录词元用量。
  assert.ok(runtimeResult.metrics.costUsd > 0); // 第67天：验证提示词指标记录模型成本。
  assert.ok(runtimeResult.quality.overall > 0); // 第67天：验证 Evaluation 生成 PromptQualityScore。
  const normalized = calculatePromptQualityScore({ correctness: 90, relevance: 88, costUsd: 0.002, costBudgetUsd: 0.004, latencyMs: 300, latencyBudgetMs: 900 }); // 第67天：独立计算一组成本和延迟归一化评分。
  assert.equal(normalized.cost, 100); // 第67天：验证低于预算的成本效率被限制在满分。
  assert.equal(normalized.latency, 100); // 第67天：验证低于预算的延迟表现被限制在满分。
  log("Model Metrics 与 PromptQualityScore 已建立关联"); // 第67天：记录提示词指标和质量评分测试通过。

  const experimentRuns = platform.experiments.runAll(); // 第67天：运行 Research、Writer 和 Critic 三个通用实验。
  assert.equal(experimentRuns.length, 3); // 第67天：验证至少三个 Agent 的生产提示词实验已完成。
  assert.ok(experimentRuns.every((run) => run.dataset.cases.length >= 3)); // 第67天：验证每个实验使用至少三个数据集案例。
  assert.ok(experimentRuns.every((run) => run.candidates.length >= 2)); // 第67天：验证每个实验动态比较至少两个提示词版本。
  assert.ok(experimentRuns.every((run) => run.experiment.status === "completed")); // 第67天：验证全部生产提示词实验正常完成。
  assert.ok(experimentRuns.some((run) => run.candidates.some((candidate) => !candidate.qualityGate.passed))); // 第67天：验证实验平台能够产生被质量门禁阻断的候选版本。
  log("PromptExperiment 支持不同 Agent、数据集和版本的动态 A/B 测试"); // 第67天：记录生产提示词实验测试通过。

  assert.throws(() => platform.performAction("approve", "critic", "v2"), /Quality Gate 未通过/); // 第67天：验证未通过质量门禁的 critic.v2 禁止审批。
  assert.equal(platform.promptRegistry.getProductionVersion("critic", "v2")?.status, "testing"); // 第67天：验证审批失败后目标版本仍保持 testing 状态。
  log("未通过 Quality Gate 的版本被禁止晋级"); // 第67天：记录质量门禁阻断测试通过。

  platform.performAction("approve", "research", "v2"); // 第67天：使用通过证据把 research.v2 从 testing 切换为 approved。
  assert.equal(platform.promptRegistry.getProductionVersion("research", "v2")?.status, "approved"); // 第67天：验证审批动作正确更新生命周期状态。
  platform.performAction("promote", "research", "v2"); // 第67天：把已批准 research.v2 晋级为 active。
  assert.equal(platform.promptRegistry.getActiveProduction("research")?.version, "v2"); // 第67天：验证晋级后 research.v2 成为当前启用版本。
  assert.equal(platform.unifiedRegistry.get("prompt:research@v2")?.enabled, true); // 第67天：验证晋级同步更新统一注册项 enabled。
  assert.equal(platform.unifiedRegistry.get("prompt:research@v1")?.enabled, false); // 第67天：验证旧 active 版本在统一注册中心被禁用。
  platform.performAction("rollback", "research", "v1"); // 第67天：回滚到历史 research.v1 版本。
  assert.equal(platform.promptRegistry.getActiveProduction("research")?.version, "v1"); // 第67天：验证回滚重新启用历史版本。
  platform.performAction("archive", "writer", "v3"); // 第67天：归档已批准但未发布的 writer.v3。
  assert.equal(platform.promptRegistry.getProductionVersion("writer", "v3")?.status, "deprecated"); // 第67天：验证归档动作正确修改生命周期状态。
  assert.ok(platform.promotion.listAudits().length >= 4); // 第67天：验证审批、晋级、回滚和归档都生成审计日志。
  log("Promote、Rollback、Archive 与 Audit Log 正确工作"); // 第67天：记录生产提示词生命周期测试通过。

  const comparison = platform.compare("writer.v2", "writer.v3"); // 第67天：比较 Writer 两个生产提示词版本。
  assert.equal(comparison.leftId, "writer.v2"); // 第67天：验证比较结果保存左侧版本标识。
  assert.equal(comparison.rightId, "writer.v3"); // 第67天：验证比较结果保存右侧版本标识。
  assert.equal(comparison.strategyChanged, true); // 第67天：验证比较结果识别 balanced 到 quality 的策略变化。
  assert.ok(comparison.addedBlockIds.includes("reflection")); // 第67天：验证比较结果识别新增反思提示词块。
  log("Prompt Explorer V2 版本比较能力正确工作"); // 第67天：记录提示词版本比较测试通过。

  const snapshot = platform.getSnapshot(); // 第67天：生成最终 Prompt Explorer V2 平台快照。
  assert.equal(snapshot.runtimeDemos.length, 3); // 第67天：验证 Research、Writer 和 Critic 三条完整链路都进入快照。
  assert.ok(snapshot.registryItems.every((item) => item.type === "prompt")); // 第67天：验证平台快照只包含生产提示词统一注册项。
  assert.ok(snapshot.metrics.length >= 3); // 第67天：验证平台快照包含多个版本的运行指标。
  log("ProductionPromptTest 完整覆盖三个 Agent 的端到端链路"); // 第67天：记录三智能体完整链路测试通过。

  console.log("\nDay67 Production Prompt Platform 全部测试通过。\n"); // 第67天：输出自动化测试最终成功摘要。
} // 第67天：结束生产提示词平台自动化测试入口。

main(); // 第67天：执行生产提示词平台自动化测试。
