import type { TraceSpanType } from "@/lib/agents/agent-types"; /* 第51天：引入 Trace Span 类型，便于模型执行器把 fallback 元数据写入追踪。 */
import type { TraceManager } from "@/lib/agents/trace-manager"; /* 第51天：引入 TraceManager（追踪管理器）类型用于可选链路记录。 */
import { CircuitBreakerManager, circuitBreakerManager } from "@/lib/model/circuit-breaker-manager"; /* 第51天：引入熔断器管理器用于调用前拦截与调用后记录。 */
import { DEFAULT_MIMO_BASE_URL, DEFAULT_OLLAMA_API_URL, DEFAULT_OLLAMA_MODEL, DEFAULT_MODEL_REQUEST_TIMEOUT_MS, invokeChatModel, type ModelRuntime } from "@/lib/model/model-runtime"; /* 第51天：引入既有模型运行时和底层聊天调用函数。 */
import { modelRegistry } from "@/lib/model/default-models"; /* 第51天：引入共享模型注册表作为默认模型档案来源。 */
import { ModelRegistry } from "@/lib/model/model-registry"; /* 第51天：引入模型注册表类型以支持测试注入。 */
import type { ModelCallResult, ModelProfile } from "@/lib/model/model-profile-types"; /* 第51天：引入模型档案与统一调用结果类型。 */
import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第51天：引入词元估算函数用于可选 Usage 记录。 */
import type { UsageComponentType } from "@/lib/usage/usage-types"; /* 第51天：引入用量组件类型，保证记录来源可分类。 */
import { UsageManager } from "@/lib/usage/usage-manager"; /* 第51天：引入 UsageManager（用量管理器）用于可选成本归因。 */

export type ModelExecutorMessage = { role: string; content: string }; /* 第51天：定义模型执行器接受的消息结构。 */

export type ModelTransportResult = { ok: boolean; status: number; text: string }; /* 第51天：定义底层模型调用返回的最小传输结果。 */

export type ModelCaller = (profile: ModelProfile, messages: ModelExecutorMessage[], runtime: ModelRuntime | undefined, timeoutMs: number) => Promise<ModelTransportResult>; /* 第51天：定义可注入的底层模型调用函数，便于测试模拟失败。 */

export type ModelExecutorUsageOptions = { /* 第51天：定义模型执行器写入 Usage（用量）的可选参数。 */
  manager: UsageManager; /* 第51天：保存目标用量管理器。 */
  traceId: string; /* 第51天：保存关联的 Trace（追踪记录）标识。 */
  spanId: string; /* 第51天：保存关联的 Span（跨度）标识。 */
  componentType: UsageComponentType; /* 第51天：保存组件类型，例如 agent、tool、reflection 或 evaluation。 */
  componentId: string; /* 第51天：保存组件稳定标识。 */
  inputText?: string; /* 第51天：保存可覆盖默认消息文本的输入内容。 */
  startedAt?: number; /* 第51天：保存可覆盖默认起始时间的时间戳。 */
  promptId?: string; /* 第52天：保存可选 Prompt（提示词）唯一标识。 */
  promptVersion?: string; /* 第52天：保存可选 Prompt Version（提示词版本）。 */
}; /* 第51天：结束 Usage 参数定义。 */

export type ModelExecutorTraceOptions = { /* 第51天：定义模型执行器写入 Trace（追踪）的可选参数。 */
  manager: TraceManager; /* 第51天：保存目标追踪管理器。 */
  traceId: string; /* 第51天：保存要写入的 Trace（追踪记录）标识。 */
  parentSpanId?: string; /* 第51天：保存可选父 Span（父跨度）标识。 */
  name?: string; /* 第51天：保存可选模型执行 Span 名称。 */
  type?: TraceSpanType; /* 第51天：保存可选 Span 类型，默认作为 agent 跨度记录。 */
  metadata?: Record<string, unknown>; /* 第51天：保存可选附加元数据。 */
}; /* 第51天：结束 Trace 参数定义。 */

export type ModelExecutorOptions = { /* 第51天：定义单次模型执行的可选参数。 */
  runtime?: ModelRuntime; /* 第51天：保存真实调用时使用的 Ollama 或 MiMo 运行时。 */
  timeoutMs?: number; /* 第51天：保存本次调用覆盖模型档案的超时时间。 */
  maxRetries?: number; /* 第51天：保存本次调用覆盖模型档案的重试次数。 */
  degradedOutput?: string; /* 第51天：保存全部模型失败后返回的降级响应文本。 */
  usage?: ModelExecutorUsageOptions; /* 第51天：保存可选 Usage（用量）记录参数。 */
  trace?: ModelExecutorTraceOptions; /* 第51天：保存可选 Trace（追踪）记录参数。 */
}; /* 第51天：结束执行选项定义。 */

export type ModelExecutorCallInput = { /* 第51天：定义 modelExecutor.call 的入参结构。 */
  modelId: string; /* 第51天：保存首选模型 id。 */
  prompt?: string; /* 第51天：保存单条用户提示词，和 messages 二选一。 */
  messages?: ModelExecutorMessage[]; /* 第51天：保存完整消息列表，优先级高于 prompt。 */
  options?: ModelExecutorOptions; /* 第51天：保存超时、重试、运行时、Usage 与 Trace 选项。 */
}; /* 第51天：结束模型执行器入参定义。 */

function buildDefaultRuntime(profile: ModelProfile, runtime?: ModelRuntime): ModelRuntime { /* 第51天：根据模型档案与可选运行时构造本次真实调用运行时。 */
  if (profile.provider === "ollama" || profile.provider === "local") return { provider: "local", ollamaUrl: runtime?.ollamaUrl || process.env.OLLAMA_API_URL?.trim() || DEFAULT_OLLAMA_API_URL, ollamaModel: profile.model || runtime?.ollamaModel || DEFAULT_OLLAMA_MODEL, mimoBaseUrl: runtime?.mimoBaseUrl || process.env.XIAOMI_MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL, mimoApiKey: runtime?.mimoApiKey || process.env.XIAOMI_MIMO_API_KEY?.trim() || "", mimoModel: runtime?.mimoModel || "" }; /* 第51天：Ollama 或 local 档案统一走本地运行时并切换 ollamaModel。 */
  return { provider: "mimo", ollamaUrl: runtime?.ollamaUrl || process.env.OLLAMA_API_URL?.trim() || DEFAULT_OLLAMA_API_URL, ollamaModel: runtime?.ollamaModel || DEFAULT_OLLAMA_MODEL, mimoBaseUrl: runtime?.mimoBaseUrl || process.env.XIAOMI_MIMO_BASE_URL?.trim() || DEFAULT_MIMO_BASE_URL, mimoApiKey: runtime?.mimoApiKey || process.env.XIAOMI_MIMO_API_KEY?.trim() || "", mimoModel: profile.model || runtime?.mimoModel || "" }; /* 第51天：非本地档案在教学项目中统一映射为 MiMo 兼容调用。 */
} /* 第51天：结束默认运行时构造。 */

export const defaultModelCaller: ModelCaller = async (profile, messages, runtime, timeoutMs) => { /* 第51天：定义默认底层模型调用函数。 */
  void timeoutMs; /* 第51天：默认调用器的实际超时由执行器 Promise.race 控制，此处显式标记参数已消费。 */
  const rt = buildDefaultRuntime(profile, runtime); /* 第51天：按模型档案得到本次调用运行时。 */
  return await invokeChatModel(rt, messages); /* 第51天：复用既有统一聊天调用函数执行真实请求。 */
}; /* 第51天：结束默认底层模型调用函数。 */

export class ModelExecutor { /* 第51天：定义 ModelExecutor（模型执行器），统一处理超时、重试、fallback 和熔断。 */
  constructor(private readonly registry: ModelRegistry = modelRegistry, private readonly breaker: CircuitBreakerManager = circuitBreakerManager, private readonly caller: ModelCaller = defaultModelCaller) {} /* 第51天：默认使用共享注册表、共享熔断器和真实模型调用器，并支持测试注入。 */

  async call(input: ModelExecutorCallInput): Promise<ModelCallResult> { /* 第51天：定义统一模型调用入口。 */
    const startedAt = Date.now(); /* 第51天：记录本次模型执行开始时间。 */
    const primary = this.resolve(input.modelId); /* 第51天：解析首选模型档案。 */
    const messages = this.normalizeMessages(input); /* 第51天：把 prompt 或 messages 规范成消息列表。 */
    const traceSpanId = this.startTraceSpan(input, primary); /* 第51天：按需创建模型执行追踪跨度。 */
    const fallbackChain: string[] = []; /* 第51天：初始化本次实际尝试或跳过的模型链路。 */
    let lastError = ""; /* 第51天：保存最后一次失败原因。 */
    for (const profile of this.buildFallbackChain(primary)) { /* 第51天：按主模型和备用模型顺序遍历调用链。 */
      this.pushUnique(fallbackChain, profile.id); /* 第51天：把当前模型加入本次备用链路记录。 */
      if (!this.breaker.canCall(profile.id)) { /* 第51天：调用前检查当前模型是否处于 open 熔断状态。 */
        this.breaker.recordSkipped(profile.id); /* 第51天：记录该模型被熔断跳过。 */
        lastError = `${profile.id} 当前处于 Circuit Open（熔断开启）状态。`; /* 第51天：更新最后错误说明。 */
        continue; /* 第51天：跳过该模型并尝试下一个备用模型。 */
      } /* 第51天：结束熔断跳过判断。 */
      const attempts = this.getAttemptCount(profile, input.options); /* 第51天：计算当前模型最多尝试次数。 */
      for (let attempt = 1; attempt <= attempts; attempt += 1) { /* 第51天：在当前模型内按重试次数循环调用。 */
        try { /* 第51天：捕获单次底层模型调用失败。 */
          const timeoutMs = this.getTimeoutMs(profile, input.options); /* 第51天：计算当前模型单次调用超时时间。 */
          const transport = await this.callWithTimeout(profile, messages, input.options?.runtime, timeoutMs); /* 第51天：执行带超时保护的底层模型调用。 */
          if (!transport.ok || !transport.text.trim()) throw new Error(transport.text || `模型返回 HTTP ${transport.status} 或空内容。`); /* 第51天：HTTP 失败或空输出都视为本次尝试失败。 */
          const output = transport.text.trim(); /* 第51天：规范化成功输出文本。 */
          const result = this.successResult(primary, profile, output, fallbackChain, startedAt); /* 第51天：构造成功的统一模型调用结果。 */
          this.breaker.recordSuccess(profile.id); /* 第51天：把成功写入最终模型的熔断器状态。 */
          if (result.fallbackUsed) this.breaker.recordFallbackUsed(primary.id); /* 第51天：如果使用备用模型则记录主模型触发备用链。 */
          this.recordUsage(input, profile, messages, output, result, startedAt); /* 第51天：按需写入 Usage（用量）记录。 */
          this.endTraceSpan(input, traceSpanId, "success", result); /* 第51天：按需结束 Trace Span 并写入成功元数据。 */
          return result; /* 第51天：成功后立即返回，不再尝试后续备用模型。 */
        } catch (error) { /* 第51天：处理当前模型单次调用异常。 */
          lastError = error instanceof Error ? error.message : String(error); /* 第51天：把未知错误规范成字符串。 */
          this.breaker.recordFailure(profile.id); /* 第51天：把失败写入当前模型的熔断器状态。 */
          if (!this.breaker.canCall(profile.id)) break; /* 第51天：如果当前模型因失败打开熔断，停止该模型剩余重试。 */
        } /* 第51天：结束单次调用异常处理。 */
      } /* 第51天：结束当前模型重试循环。 */
    } /* 第51天：结束备用模型链遍历。 */
    const failed = this.failureResult(primary, fallbackChain, lastError, startedAt, input.options?.degradedOutput); /* 第51天：全部模型失败后构造降级响应结果。 */
    this.recordUsage(input, primary, messages, failed.output ?? "", failed, startedAt); /* 第51天：按需把降级响应写入 Usage（用量）记录。 */
    this.endTraceSpan(input, traceSpanId, "failed", failed); /* 第51天：按需结束 Trace Span 并写入失败元数据。 */
    return failed; /* 第51天：返回降级响应，保证业务层不会直接崩溃。 */
  } /* 第51天：结束统一模型调用入口。 */

  private normalizeMessages(input: ModelExecutorCallInput): ModelExecutorMessage[] { /* 第51天：把 prompt 或 messages 规范成底层调用消息列表。 */
    if (input.messages?.length) return input.messages; /* 第51天：优先使用调用方传入的完整消息列表。 */
    return [{ role: "user", content: input.prompt ?? "" }]; /* 第51天：没有 messages 时用 prompt 构造单条用户消息。 */
  } /* 第51天：结束消息规范化。 */

  private buildFallbackChain(primary: ModelProfile): ModelProfile[] { /* 第51天：根据主模型档案构造可执行备用模型链。 */
    const ids = this.unique([primary.id, ...(primary.fallbackModelIds ?? [])]); /* 第51天：组合主模型和备用模型 id 并去重。 */
    return ids.map((id) => this.registry.get(id)).filter((model): model is ModelProfile => Boolean(model)); /* 第51天：只保留注册表中存在的模型档案。 */
  } /* 第51天：结束备用模型链构造。 */

  private getAttemptCount(profile: ModelProfile, options?: ModelExecutorOptions): number { /* 第51天：计算当前模型总尝试次数。 */
    const retries = options?.maxRetries ?? profile.maxRetries ?? 0; /* 第51天：优先使用本次调用重试配置，其次使用模型档案重试配置。 */
    return Math.max(1, Math.floor(retries) + 1); /* 第51天：总尝试次数等于首次调用加重试次数，至少为 1。 */
  } /* 第51天：结束尝试次数计算。 */

  private getTimeoutMs(profile: ModelProfile, options?: ModelExecutorOptions): number { /* 第51天：计算当前模型单次调用超时时间。 */
    const timeout = options?.timeoutMs ?? profile.timeoutMs ?? DEFAULT_MODEL_REQUEST_TIMEOUT_MS; /* 第51天：优先使用本次调用超时，其次模型档案超时，最后执行器默认超时。 */
    return Math.max(100, Math.floor(timeout)); /* 第51天：把超时规范为至少 100 毫秒的整数。 */
  } /* 第51天：结束超时时间计算。 */

  private async callWithTimeout(profile: ModelProfile, messages: ModelExecutorMessage[], runtime: ModelRuntime | undefined, timeoutMs: number): Promise<ModelTransportResult> { /* 第51天：执行带 Promise 级超时保护的底层模型调用。 */
    let timer: ReturnType<typeof setTimeout> | undefined; /* 第51天：保存超时定时器句柄以便 finally 清理。 */
    try { /* 第51天：确保成功、失败或超时后都清理定时器。 */
      return await Promise.race([this.caller(profile, messages, runtime, timeoutMs), new Promise<ModelTransportResult>((_, reject) => { timer = setTimeout(() => reject(new Error(`模型 ${profile.id} 调用超过 ${timeoutMs}ms。`)), timeoutMs); })]); /* 第51天：底层调用和超时错误谁先完成就采用谁。 */
    } finally { /* 第51天：无论调用结果如何都进入清理逻辑。 */
      if (timer) clearTimeout(timer); /* 第51天：清理仍存在的超时定时器。 */
    } /* 第51天：结束 finally。 */
  } /* 第51天：结束带超时调用。 */

  private successResult(primary: ModelProfile, finalProfile: ModelProfile, output: string, fallbackChain: string[], startedAt: number): ModelCallResult { /* 第51天：构造成功调用结果。 */
    return { modelId: finalProfile.id, success: true, output, fallbackUsed: finalProfile.id !== primary.id, fallbackChain: [...fallbackChain], durationMs: Math.max(1, Date.now() - startedAt) }; /* 第51天：返回包含最终模型、是否 fallback 和链路的成功结果。 */
  } /* 第51天：结束成功结果构造。 */

  private failureResult(primary: ModelProfile, fallbackChain: string[], error: string, startedAt: number, degradedOutput?: string): ModelCallResult { /* 第51天：构造全部失败后的降级响应结果。 */
    const output = degradedOutput ?? "模型服务暂时不可用，系统已返回降级响应，请稍后重试或切换模型。"; /* 第51天：优先使用调用方提供的降级文本，否则使用统一降级文案。 */
    return { modelId: primary.id, success: false, output, error: error || "全部模型链路均未获得成功响应。", fallbackUsed: fallbackChain.length > 1, fallbackChain: [...fallbackChain], durationMs: Math.max(1, Date.now() - startedAt) }; /* 第51天：返回失败结果但保留可展示的降级输出。 */
  } /* 第51天：结束失败结果构造。 */

  private recordUsage(input: ModelExecutorCallInput, profile: ModelProfile, messages: ModelExecutorMessage[], output: string, result: ModelCallResult, startedAt: number): void { /* 第51天：按需把模型执行结果写入 Usage（用量）。 */
    const usage = input.options?.usage; /* 第51天：读取可选用量记录配置。 */
    if (!usage) return; /* 第51天：未传 Usage 配置时不写入记录，保持执行器纯调用能力。 */
    const inputText = usage.inputText ?? messages.map((message) => `${message.role}: ${message.content}`).join("\n"); /* 第51天：生成用于词元估算的输入文本。 */
    usage.manager.addRecord({ traceId: usage.traceId, spanId: usage.spanId, componentType: usage.componentType, componentId: usage.componentId, inputTokens: estimateTokenCount(inputText), outputTokens: estimateTokenCount(output), durationMs: Math.max(1, Date.now() - (usage.startedAt ?? startedAt)), modelId: profile.id, provider: profile.provider, modelName: profile.model, fallbackUsed: result.fallbackUsed, fallbackChain: result.fallbackChain, circuitState: this.breaker.getState(profile.id).state, promptId: usage.promptId, promptVersion: usage.promptVersion }); /* 第52天：写入模型、fallback 链路、熔断状态和可选提示词版本。 */
  } /* 第51天：结束 Usage 记录。 */

  private startTraceSpan(input: ModelExecutorCallInput, primary: ModelProfile): string { /* 第51天：按需创建模型执行 Trace Span。 */
    const trace = input.options?.trace; /* 第51天：读取可选追踪配置。 */
    if (!trace) return ""; /* 第51天：未传 Trace 配置时返回空 id。 */
    return trace.manager.startSpan(trace.traceId, { parentSpanId: trace.parentSpanId, name: trace.name ?? `model-executor:${primary.id}`, type: trace.type ?? "agent", metadata: { ...(trace.metadata ?? {}), modelId: primary.id, fallbackModelIds: primary.fallbackModelIds ?? [], circuitState: this.breaker.getState(primary.id).state } }); /* 第51天：创建追踪跨度并写入初始模型与熔断状态。 */
  } /* 第51天：结束 Trace Span 创建。 */

  private endTraceSpan(input: ModelExecutorCallInput, spanId: string, status: "success" | "failed", result: ModelCallResult): void { /* 第51天：按需结束模型执行 Trace Span。 */
    const trace = input.options?.trace; /* 第51天：读取可选追踪配置。 */
    if (!trace || !spanId) return; /* 第51天：缺少追踪配置或 spanId 时不做任何操作。 */
    trace.manager.endSpan(trace.traceId, spanId, status, { modelId: result.modelId, fallbackUsed: result.fallbackUsed, fallbackChain: result.fallbackChain, circuitState: this.breaker.getState(result.modelId).state, error: result.error }); /* 第51天：结束跨度并写入最终模型、备用链和熔断状态。 */
  } /* 第51天：结束 Trace Span 关闭。 */

  private resolve(modelId: string): ModelProfile { /* 第51天：按 id 解析模型档案。 */
    const model = this.registry.get(modelId); /* 第51天：从注册表读取目标模型。 */
    if (model) return model; /* 第51天：命中时返回模型档案。 */
    throw new Error(`未找到模型档案：${modelId}`); /* 第51天：模型不存在时抛出明确错误。 */
  } /* 第51天：结束模型解析。 */

  private pushUnique(items: string[], value: string): void { /* 第51天：按顺序向数组追加不重复值。 */
    if (!items.includes(value)) items.push(value); /* 第51天：只有尚未出现时才追加。 */
  } /* 第51天：结束唯一追加工具。 */

  private unique(items: string[]): string[] { /* 第51天：定义保持顺序的数组去重工具。 */
    return Array.from(new Set(items)); /* 第51天：用 Set 去重并保留首次出现顺序。 */
  } /* 第51天：结束数组去重工具。 */
} /* 第51天：结束 ModelExecutor（模型执行器）。 */

export const modelExecutor = new ModelExecutor(); /* 第51天：导出进程内共享模型执行器供业务运行时复用。 */
