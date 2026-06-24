import type { ModelCapability, ModelProfile, ModelRoutingDecision, ModelRoutingInput, ModelTaskType } from "@/lib/model/model-profile-types"; /* 第50天：引入模型路由相关的全部类型。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第50天：引入模型注册表类型用于依赖注入。 */
import { modelRegistry } from "@/lib/model/default-models"; /* 第50天：引入共享默认模型注册表作为路由数据源。 */

const TASK_CAPABILITY: Record<ModelTaskType, ModelCapability> = { /* 第50天：定义任务类型到所需能力的映射，用于按能力兜底匹配。 */
  chat: "chat", /* 第50天：闲聊任务需要 chat 能力。 */
  summary: "summary", /* 第50天：总结任务需要 summary 能力。 */
  planning: "planning", /* 第50天：规划任务需要 planning 能力。 */
  reflection: "reflection", /* 第50天：反思任务需要 reflection 能力。 */
  evaluation: "evaluation", /* 第50天：评估任务需要 evaluation 能力。 */
  embedding: "embedding", /* 第50天：嵌入任务需要 embedding 能力。 */
  json: "json", /* 第50天：JSON 任务需要 json 能力。 */
}; /* 第50天：结束任务能力映射定义。 */

export class ModelRouter { /* 第50天：定义 ModelRouter（模型路由器），按任务诉求选择算力。 */
  constructor(private readonly registry: ModelRegistry = modelRegistry) {} /* 第50天：默认使用共享模型注册表并支持测试注入。 */

  route(input: ModelRoutingInput): ModelProfile { /* 第50天：定义路由主入口，返回最终选中的 ModelProfile。 */
    return this.routeWithReason(input).model; /* 第50天：复用带理由的路由实现并只取模型档案。 */
  } /* 第50天：结束路由主入口。 */

  routeWithReason(input: ModelRoutingInput): ModelRoutingDecision { /* 第50天：定义带规则与理由的完整路由决策方法。 */
    const candidates = this.registry.list().map((model) => model.id); /* 第50天：收集参与本次路由的全部候选模型 id。 */
    const decide = (id: string, matchedRule: string, reason: string): ModelRoutingDecision => ({ model: this.resolve(id), matchedRule, reason, candidates }); /* 第50天：定义生成决策结果的内联工具。 */
    if (input.taskType === "embedding") return decide("embedding", "embedding", "任务为 Embedding（向量嵌入），固定路由到 embedding（嵌入模型）。"); /* 第50天：规则一——嵌入任务路由到嵌入模型。 */
    if (input.requiresJson || input.taskType === "json") return decide("json-structured", "requires-json", "任务要求结构化 JSON 输出，路由到 json-structured（结构化 JSON 模型）。"); /* 第50天：规则二——需要 JSON 时路由到结构化 JSON 模型。 */
    if (input.taskType === "evaluation" || input.taskType === "reflection") return decide("evaluation", "evaluation", "任务为 Evaluation/Reflection（评估或反思），路由到 evaluation（评估模型）保证稳定。"); /* 第50天：规则三——评估或反思任务路由到评估模型。 */
    if (input.complexity === "high" || input.taskType === "planning") return decide("large-reasoning", "complexity-high", "任务为高复杂度或规划，路由到 large-reasoning（大型推理模型）。"); /* 第50天：规则四——高复杂度或规划任务路由到大型推理模型。 */
    if (input.latencyPreference === "fast") return decide("small-chat", "latency-fast", "任务偏好低延迟，路由到 small-chat（小型对话模型）。"); /* 第50天：规则五——偏好低延迟时路由到小型对话模型。 */
    if (input.latencyPreference === "quality") return decide("large-reasoning", "latency-quality", "任务偏好高质量，路由到 large-reasoning（大型推理模型）。"); /* 第50天：规则六——偏好高质量时路由到大型推理模型。 */
    if (input.taskType === "summary") return decide("small-chat", "summary-default", "任务为简单总结，默认路由到 small-chat（小型对话模型）以省钱省时。"); /* 第50天：规则七——总结任务默认路由到小型对话模型。 */
    return this.routeByCapabilityFallback(input, candidates); /* 第50天：兜底规则——按任务能力匹配可用模型。 */
  } /* 第50天：结束完整路由决策方法。 */

  private routeByCapabilityFallback(input: ModelRoutingInput, candidates: string[]): ModelRoutingDecision { /* 第50天：定义按能力匹配的兜底路由方法。 */
    const needed = TASK_CAPABILITY[input.taskType]; /* 第50天：读取当前任务类型所需的能力标签。 */
    const matched = this.registry.findByCapability(needed); /* 第50天：找出声明了该能力的全部模型。 */
    const affordable = typeof input.maxCost === "number" ? matched.filter((model) => model.cost.inputPer1K <= (input.maxCost as number)) : matched; /* 第50天：若设定成本上限则过滤掉过贵的模型。 */
    const pool = affordable.length > 0 ? affordable : matched; /* 第50天：成本过滤后为空时回退到全部匹配模型。 */
    const chosen = pool[0] ?? this.resolve("small-chat"); /* 第50天：选择首个匹配模型，仍为空时回退小型对话模型。 */
    return { model: chosen, matchedRule: "capability-fallback", reason: `按任务能力「${needed}」兜底匹配到 ${chosen.id}（${chosen.name}）。`, candidates }; /* 第50天：返回兜底路由决策。 */
  } /* 第50天：结束兜底路由方法。 */

  private resolve(id: string): ModelProfile { /* 第50天：定义按 id 解析模型并在缺失时安全兜底的方法。 */
    const model = this.registry.get(id); /* 第50天：从注册表读取目标模型。 */
    if (model) return model; /* 第50天：命中时直接返回。 */
    const fallback = this.registry.list()[0]; /* 第50天：未命中时回退到注册表中的首个模型。 */
    if (fallback) return fallback; /* 第50天：存在任意模型时返回兜底模型。 */
    throw new Error("ModelRegistry（模型注册表）为空，无法完成模型路由。"); /* 第50天：注册表为空时抛出明确错误。 */
  } /* 第50天：结束模型解析方法。 */
} /* 第50天：结束 ModelRouter（模型路由器）类定义。 */

export const modelRouter = new ModelRouter(); /* 第50天：导出进程内共享模型路由器供运行时、接口与前端复用。 */
