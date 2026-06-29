import type { ModelCapability, ModelProfile, ModelRoutingDecision, ModelRoutingInput, ModelTaskType } from "@/lib/model/model-profile-types"; /* 第51天：引入模型路由相关的全部类型。 */
import { CircuitBreakerManager, circuitBreakerManager } from "@/lib/model/circuit-breaker-manager"; /* 第51天：引入熔断器管理器，让路由器避开不可用模型。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第51天：引入模型注册表类型用于依赖注入。 */
import { modelRegistry } from "@/lib/model/default-models"; /* 第51天：引入共享默认模型注册表作为路由数据源。 */

const TASK_CAPABILITY: Record<ModelTaskType, ModelCapability> = { /* 第51天：定义任务类型到所需能力的映射，用于按能力兜底匹配。 */
  chat: "chat", /* 第51天：闲聊任务需要 chat 能力。 */
  summary: "summary", /* 第51天：总结任务需要 summary 能力。 */
  planning: "planning", /* 第51天：规划任务需要 planning 能力。 */
  reflection: "reflection", /* 第51天：反思任务需要 reflection 能力。 */
  evaluation: "evaluation", /* 第51天：评估任务需要 evaluation 能力。 */
  embedding: "embedding", /* 第51天：嵌入任务需要 embedding 能力。 */
  json: "json", /* 第51天：JSON 任务需要 json 能力。 */
}; /* 第51天：结束任务能力映射定义。 */

export class ModelRouter { /* 第51天：定义 ModelRouter（模型路由器），按任务诉求选择算力并避开熔断模型。 */
  constructor(private readonly registry: ModelRegistry = modelRegistry, private readonly circuitBreaker: CircuitBreakerManager = circuitBreakerManager) {} /* 第51天：默认使用共享模型注册表与共享熔断器，并支持测试注入。 */

  route(input: ModelRoutingInput): ModelProfile { /* 第51天：定义路由主入口，返回最终选中的 ModelProfile。 */
    return this.routeWithReason(input).model; /* 第51天：复用带理由的路由实现并只取模型档案。 */
  } /* 第51天：结束路由主入口。 */

  routeWithReason(input: ModelRoutingInput): ModelRoutingDecision { /* 第51天：定义带规则、理由与熔断跳过信息的完整路由决策方法。 */
    const candidates = this.registry.list().map((model) => model.id); /* 第51天：收集参与本次路由的全部候选模型 id。 */
    const decide = (id: string, matchedRule: string, reason: string): ModelRoutingDecision => this.decideWithCircuit(id, matchedRule, reason, candidates); /* 第51天：定义生成带熔断判断的决策工具。 */
    if (input.taskType === "embedding") return decide("embedding", "embedding", "任务为 Embedding（向量嵌入），固定路由到 embedding（嵌入模型）。"); /* 第51天：规则一——嵌入任务优先路由到嵌入模型。 */
    if (input.requiresJson || input.taskType === "json") return decide("json-structured", "requires-json", "任务要求结构化 JSON 输出，路由到 json-structured（结构化 JSON 模型）。"); /* 第51天：规则二——需要 JSON 时优先路由到结构化 JSON 模型。 */
    if (input.taskType === "evaluation" || input.taskType === "reflection") return decide("evaluation", "evaluation", "任务为 Evaluation/Reflection（评估或反思），路由到 evaluation（评估模型）保证稳定。"); /* 第51天：规则三——评估或反思任务优先路由到评估模型。 */
    if (input.complexity === "high" || input.taskType === "planning") return decide("large-reasoning", "complexity-high", "任务为高复杂度或规划，路由到 large-reasoning（大型推理模型）。"); /* 第51天：规则四——高复杂度或规划任务优先路由到大型推理模型。 */
    if (input.latencyPreference === "fast") return decide("small-chat", "latency-fast", "任务偏好低延迟，路由到 small-chat（小型对话模型）。"); /* 第51天：规则五——偏好低延迟时优先路由到小型对话模型。 */
    if (input.latencyPreference === "quality") return decide("large-reasoning", "latency-quality", "任务偏好高质量，路由到 large-reasoning（大型推理模型）。"); /* 第51天：规则六——偏好高质量时优先路由到大型推理模型。 */
    if (input.taskType === "summary") return decide("small-chat", "summary-default", "任务为简单总结，默认路由到 small-chat（小型对话模型）以省钱省时。"); /* 第51天：规则七——总结任务默认优先路由到小型对话模型。 */
    return this.routeByCapabilityFallback(input, candidates); /* 第51天：兜底规则——按任务能力匹配可用模型。 */
  } /* 第51天：结束完整路由决策方法。 */

  private decideWithCircuit(id: string, matchedRule: string, reason: string, candidates: string[]): ModelRoutingDecision { /* 第51天：定义在首选模型基础上追加熔断检查与备用模型选择的方法。 */
    const preferred = this.resolve(id); /* 第51天：解析规则链选出的首选模型。 */
    const chain = this.unique([preferred.id, ...(preferred.fallbackModelIds ?? []), ...candidates.filter((candidate) => candidate !== preferred.id)]); /* 第51天：生成首选模型、备用模型和剩余候选模型组成的去重链路。 */
    const skippedByCircuit: string[] = []; /* 第51天：初始化因熔断被跳过的模型列表。 */
    const selectedId = this.pickCallableModelId(chain, skippedByCircuit) ?? preferred.id; /* 第51天：从链路中选择第一个可调用模型，全部不可用时回退首选模型。 */
    const selected = this.resolve(selectedId); /* 第51天：解析最终选中的模型档案。 */
    const circuitReason = selected.id === preferred.id ? reason : `${reason} 但 ${preferred.id} 当前不可用或已熔断，自动切换到 ${selected.id}（${selected.name}）。`; /* 第51天：生成包含熔断降级说明的中文理由。 */
    const rule = selected.id === preferred.id ? matchedRule : `${matchedRule}-circuit-fallback`; /* 第51天：如果发生熔断切换则标记规则为 circuit fallback。 */
    return { model: selected, matchedRule: rule, reason: circuitReason, candidates, skippedByCircuit }; /* 第51天：返回完整路由决策。 */
  } /* 第51天：结束熔断路由决策方法。 */

  private routeByCapabilityFallback(input: ModelRoutingInput, candidates: string[]): ModelRoutingDecision { /* 第51天：定义按能力匹配的兜底路由方法。 */
    const needed = TASK_CAPABILITY[input.taskType]; /* 第51天：读取当前任务类型所需的能力标签。 */
    const matched = this.registry.findByCapability(needed); /* 第51天：找出声明了该能力的全部模型。 */
    const affordable = typeof input.maxCost === "number" ? matched.filter((model) => model.cost.inputPer1K <= (input.maxCost as number)) : matched; /* 第51天：若设定成本上限则过滤掉过贵的模型。 */
    const pool = affordable.length > 0 ? affordable : matched; /* 第51天：成本过滤后为空时回退到全部匹配模型。 */
    const skippedByCircuit: string[] = []; /* 第51天：初始化因熔断被跳过的模型列表。 */
    const chosenId = this.pickCallableModelId(pool.map((model) => model.id), skippedByCircuit) ?? pool[0]?.id ?? "small-chat"; /* 第51天：优先选择可调用匹配模型，全部不可用时回退首个匹配或小模型。 */
    const chosen = this.resolve(chosenId); /* 第51天：解析最终兜底模型档案。 */
    return { model: chosen, matchedRule: "capability-fallback", reason: `按任务能力「${needed}」兜底匹配到 ${chosen.id}（${chosen.name}）。`, candidates, skippedByCircuit }; /* 第51天：返回兜底路由决策。 */
  } /* 第51天：结束兜底路由方法。 */

  private pickCallableModelId(ids: string[], skippedByCircuit: string[]): string | null { /* 第51天：从候选模型 id 链中选择第一个未熔断模型。 */
    for (const id of ids) { /* 第51天：按优先级顺序遍历候选模型。 */
      if (!this.registry.has(id)) continue; /* 第51天：注册表不存在的模型直接跳过。 */
      if (this.circuitBreaker.canCall(id)) return id; /* 第51天：closed 或 half_open 状态允许调用并立即返回。 */
      skippedByCircuit.push(id); /* 第51天：记录被 open 熔断状态跳过的模型。 */
      this.circuitBreaker.recordSkipped(id); /* 第51天：把跳过次数写入健康统计。 */
    } /* 第51天：结束候选模型遍历。 */
    return null; /* 第51天：没有可调用模型时返回空值。 */
  } /* 第51天：结束可调用模型选择方法。 */

  private resolve(id: string): ModelProfile { /* 第51天：定义按 id 解析模型并在缺失时安全兜底的方法。 */
    const model = this.registry.get(id); /* 第51天：从注册表读取目标模型。 */
    if (model) return model; /* 第51天：命中时直接返回。 */
    const fallback = this.registry.list()[0]; /* 第51天：未命中时回退到注册表中的首个模型。 */
    if (fallback) return fallback; /* 第51天：存在任意模型时返回兜底模型。 */
    throw new Error("ModelRegistry（模型注册表）为空，无法完成模型路由。"); /* 第51天：注册表为空时抛出明确错误。 */
  } /* 第51天：结束模型解析方法。 */

  private unique(ids: string[]): string[] { /* 第51天：定义保持顺序的字符串数组去重工具。 */
    return Array.from(new Set(ids)); /* 第51天：用 Set 去重并保留首次出现顺序。 */
  } /* 第51天：结束去重工具。 */
} /* 第51天：结束 ModelRouter（模型路由器）类定义。 */

export const modelRouter = new ModelRouter(); /* 第51天：导出进程内共享模型路由器供运行时、接口与前端复用。 */
