import type { PromptBlock, PromptBuildResult } from "@/lib/prompts/prompt-block-types"; // 第67天：引入提示词块与构建报告类型。
import type { PromptStrategy } from "@/lib/prompts/prompt-optimization-types"; // 第67天：复用快速、平衡和质量三种提示词策略。
import type { RegistryItem } from "@/lib/registry/registry-types"; // 第67天：引入统一注册项类型供平台快照展示。
import type { RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第67天：引入统一运行时上下文类型。

export const PRODUCTION_PROMPT_STATUSES = ["draft", "testing", "approved", "active", "deprecated"] as const; // 第67天：定义生产提示词完整生命周期状态。
export type ProductionPromptStatus = (typeof PRODUCTION_PROMPT_STATUSES)[number]; // 第67天：从状态常量推导生产提示词状态联合类型。

export type ProductionPrompt = { // 第67天：定义可版本化、可实验、可发布和可回滚的生产提示词资产。
  id: string; // 第67天：保存提示词版本唯一标识，例如 research.v1。
  name: string; // 第67天：保存提示词人类可读名称。
  version: string; // 第67天：保存独立注册的提示词版本。
  agentId?: string; // 第67天：保存可选关联智能体标识。
  blocks: PromptBlock[]; // 第67天：保存组成最终提示词的提示词块列表。
  strategy: PromptStrategy; // 第67天：保存当前版本默认提示词策略。
  status: ProductionPromptStatus; // 第67天：保存草稿、测试、批准、启用或弃用状态。
  capabilities: string[]; // 第67天：保存供 Agent 和 Workflow 发现的能力标签。
  createdAt: number; // 第67天：保存版本创建时间戳。
  updatedAt: number; // 第67天：保存生命周期最近更新时间戳。
}; // 第67天：结束生产提示词资产类型定义。

export type PromptTraceBinding = { // 第67天：定义提示词版本自动写入 Trace 的可复现信息。
  traceId: string; // 第67天：保存统一运行时上下文的追踪标识。
  promptId: string; // 第67天：保存本次渲染使用的提示词标识。
  version: string; // 第67天：保存本次渲染使用的提示词版本。
  blocks: string[]; // 第67天：保存实际进入最终提示词的块标识列表。
  strategy: PromptStrategy; // 第67天：保存本次渲染采用的策略。
  renderedAt: number; // 第67天：保存提示词渲染完成时间戳。
}; // 第67天：结束提示词追踪绑定类型定义。

export type PromptRuntimeMetrics = { // 第67天：定义提示词与模型调用关联的运行指标。
  promptId: string; // 第67天：保存指标所属提示词标识。
  version: string; // 第67天：保存指标所属提示词版本。
  usageCount: number; // 第67天：保存该版本累计运行次数。
  promptTokens: number; // 第67天：保存最近一次估算提示词词元数。
  totalPromptTokens: number; // 第67天：保存该版本累计提示词词元数。
  latencyMs: number; // 第67天：保存最近一次提示词与模型链路延迟。
  averageLatencyMs: number; // 第67天：保存该版本平均链路延迟。
  costUsd: number; // 第67天：保存最近一次模型成本估算。
  totalCostUsd: number; // 第67天：保存该版本累计模型成本估算。
  model: string; // 第67天：保存最近一次关联的模型名称。
}; // 第67天：结束提示词运行指标类型定义。

export type PromptQualityScore = { // 第67天：定义归一化后的提示词质量评分。
  correctness: number; // 第67天：保存正确性分数。
  relevance: number; // 第67天：保存相关性分数。
  cost: number; // 第67天：保存成本效率分数。
  latency: number; // 第67天：保存延迟表现分数。
  overall: number; // 第67天：保存四项指标加权后的综合分数。
}; // 第67天：结束提示词质量评分类型定义。

export type PromptQualityInput = { // 第67天：定义从原始成本和延迟生成质量评分的输入。
  correctness: number; // 第67天：接收零到一百的正确性原始分。
  relevance: number; // 第67天：接收零到一百的相关性原始分。
  costUsd: number; // 第67天：接收越低越好的原始成本。
  costBudgetUsd: number; // 第67天：接收用于归一化的成本预算。
  latencyMs: number; // 第67天：接收越低越好的原始延迟。
  latencyBudgetMs: number; // 第67天：接收用于归一化的延迟预算。
}; // 第67天：结束提示词质量评分输入类型定义。

export type PromptQualityGateCheck = { // 第67天：定义质量门禁单项检查结果。
  id: string; // 第67天：保存检查项稳定标识。
  label: string; // 第67天：保存检查项中文展示名称。
  passed: boolean; // 第67天：保存检查项是否通过。
  detail: string; // 第67天：保存阈值与实际值说明。
}; // 第67天：结束质量门禁检查类型定义。

export type PromptQualityGate = { // 第67天：定义发布晋级使用的完整质量门禁结果。
  passed: boolean; // 第67天：保存全部检查是否通过。
  checks: PromptQualityGateCheck[]; // 第67天：保存正确性、相关性、成本、延迟、回归和样本量检查。
  failureReasons: string[]; // 第67天：保存阻断晋级的失败原因。
}; // 第67天：结束质量门禁结果类型定义。

export type PromptPromotionEvidence = { // 第67天：定义提示词晋级所需的评估证据。
  score: PromptQualityScore; // 第67天：保存候选版本质量评分。
  sampleSize: number; // 第67天：保存实验评估样本数量。
  highPriorityRegressionCount: number; // 第67天：保存高优先级失败案例退步数量。
  maxCostUsd: number; // 第67天：保存质量门禁允许的单次最大成本。
  maxLatencyMs: number; // 第67天：保存质量门禁允许的单次最大延迟。
  actualCostUsd: number; // 第67天：保存候选版本实际成本。
  actualLatencyMs: number; // 第67天：保存候选版本实际延迟。
}; // 第67天：结束提示词晋级证据类型定义。

export type PromptAuditAction = "submit-testing" | "approve" | "promote" | "rollback" | "archive"; // 第67天：定义生产提示词审计动作类型。
export type PromptAuditLog = { // 第67天：定义发布、回滚和归档的审计日志。
  id: string; // 第67天：保存审计记录唯一标识。
  action: PromptAuditAction; // 第67天：保存本次生命周期动作。
  promptId: string; // 第67天：保存被操作的提示词标识。
  fromStatus: ProductionPromptStatus; // 第67天：保存动作前状态。
  toStatus: ProductionPromptStatus; // 第67天：保存动作后状态。
  operator: string; // 第67天：保存执行动作的操作者。
  reason: string; // 第67天：保存动作原因和质量门禁说明。
  createdAt: number; // 第67天：保存审计记录创建时间。
}; // 第67天：结束提示词审计日志类型定义。

export type PromptRuntimeRequest = { // 第67天：定义生产提示词运行服务请求。
  agentId: string; // 第67天：指定需要选择提示词的智能体。
  version?: string; // 第67天：允许实验或复现时指定目标版本。
  runtimeContext: RuntimeContextV2; // 第67天：提供统一上下文作为唯一渲染数据来源。
  allowNonActive?: boolean; // 第67天：允许实验链路加载测试或批准版本。
}; // 第67天：结束生产提示词运行请求类型定义。

export type PromptModelResult = { // 第67天：定义与提示词指标关联的模拟模型调用结果。
  model: string; // 第67天：保存被调用的模型名称。
  output: string; // 第67天：保存模型输出摘要。
  promptTokens: number; // 第67天：保存本次提示词词元数。
  completionTokens: number; // 第67天：保存本次模型输出词元数。
  costUsd: number; // 第67天：保存本次模型成本估算。
  latencyMs: number; // 第67天：保存本次模型调用延迟。
}; // 第67天：结束模拟模型调用结果类型定义。

export type PromptRuntimeResult = { // 第67天：定义 Agent 到 Prompt、Model 和 Evaluation 的完整链路结果。
  prompt: ProductionPrompt; // 第67天：保存统一注册协议选择出的生产提示词版本。
  renderedPrompt: string; // 第67天：保存由 RuntimeContext 渲染出的最终提示词正文。
  build: PromptBuildResult; // 第67天：保存提示词块组合与跳过报告。
  trace: PromptTraceBinding; // 第67天：保存自动绑定的提示词追踪信息。
  metrics: PromptRuntimeMetrics; // 第67天：保存与模型调用关联的提示词指标。
  modelResult: PromptModelResult; // 第67天：保存模型调用结果和用量。
  quality: PromptQualityScore; // 第67天：保存评估阶段生成的提示词质量评分。
  runtimeContext: RuntimeContextV2; // 第67天：保存写入 Prompt、Usage 和 Evaluation 信息后的统一上下文。
}; // 第67天：结束生产提示词运行结果类型定义。

export type ProductionPromptDatasetCase = { // 第67天：定义通用提示词实验数据集案例。
  id: string; // 第67天：保存案例唯一标识。
  name: string; // 第67天：保存案例展示名称。
  priority: "normal" | "high" | "critical"; // 第67天：保存用于回归门禁的案例优先级。
  task: string; // 第67天：保存案例用户任务。
  expectedKeywords: string[]; // 第67天：保存评估提示词相关性的期望关键词。
  context: Partial<RuntimeContextV2>; // 第67天：保存案例需要注入的运行时上下文片段。
}; // 第67天：结束生产提示词数据集案例类型定义。

export type ProductionPromptDataset = { // 第67天：定义可供不同 Agent 动态复用的实验数据集。
  id: string; // 第67天：保存数据集唯一标识。
  name: string; // 第67天：保存数据集展示名称。
  cases: ProductionPromptDatasetCase[]; // 第67天：保存数据集中的评估案例。
}; // 第67天：结束生产提示词实验数据集类型定义。

export type ProductionPromptExperiment = { // 第67天：定义可动态创建的生产提示词实验。
  id: string; // 第67天：保存实验唯一标识。
  name: string; // 第67天：保存实验展示名称。
  agentId: string; // 第67天：保存被实验的智能体标识。
  candidateVersions: string[]; // 第67天：保存参与 A/B 测试的提示词版本。
  datasetId: string; // 第67天：保存实验使用的数据集标识。
  status: "draft" | "running" | "completed" | "failed"; // 第67天：保存实验生命周期状态。
  createdAt: number; // 第67天：保存实验创建时间。
}; // 第67天：结束生产提示词实验类型定义。

export type ProductionPromptExperimentCandidate = { // 第67天：定义单个候选版本的实验聚合结果。
  version: string; // 第67天：保存候选提示词版本。
  averageScore: PromptQualityScore; // 第67天：保存全部案例的平均质量评分。
  sampleSize: number; // 第67天：保存参与评估的样本数量。
  highPriorityRegressionCount: number; // 第67天：保存高优先级案例退步数量。
  qualityGate: PromptQualityGate; // 第67天：保存候选版本的发布质量门禁结果。
}; // 第67天：结束实验候选结果类型定义。

export type ProductionPromptExperimentRun = { // 第67天：定义一次完整通用 A/B 测试运行结果。
  experiment: ProductionPromptExperiment; // 第67天：保存实验定义及完成状态。
  dataset: ProductionPromptDataset; // 第67天：保存本次使用的数据集。
  candidates: ProductionPromptExperimentCandidate[]; // 第67天：保存各候选版本聚合结果。
  winnerVersion: string | null; // 第67天：保存通过质量门禁且综合分最高的版本。
  winnerReason: string; // 第67天：保存获胜或未选出版本的原因。
  generatedAt: number; // 第67天：保存实验运行完成时间。
}; // 第67天：结束生产提示词实验运行类型定义。

export type ProductionPromptComparison = { // 第67天：定义 Prompt Explorer V2 的版本比较结果。
  leftId: string; // 第67天：保存左侧提示词标识。
  rightId: string; // 第67天：保存右侧提示词标识。
  addedBlockIds: string[]; // 第67天：保存右侧版本新增的提示词块。
  removedBlockIds: string[]; // 第67天：保存右侧版本移除的提示词块。
  strategyChanged: boolean; // 第67天：保存两个版本的策略是否变化。
}; // 第67天：结束生产提示词版本比较类型定义。

export type ProductionPromptPlatformSnapshot = { // 第67天：定义 Prompt Explorer V2 和接口共用的平台快照。
  prompts: ProductionPrompt[]; // 第67天：保存全部生产提示词版本。
  registryItems: RegistryItem[]; // 第67天：保存统一注册中心中的提示词版本注册项。
  runtimeDemos: PromptRuntimeResult[]; // 第67天：保存 Research、Writer 和 Critic 三条完整运行链路。
  experiments: ProductionPromptExperimentRun[]; // 第67天：保存通用实验平台的最新运行结果。
  metrics: PromptRuntimeMetrics[]; // 第67天：保存全部提示词版本运行指标。
  audits: PromptAuditLog[]; // 第67天：保存发布、回滚和归档审计记录。
  generatedAt: number; // 第67天：保存平台快照生成时间。
}; // 第67天：结束生产提示词平台快照类型定义。
