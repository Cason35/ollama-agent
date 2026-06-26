import type { CircuitBreakerState, ModelHealthSnapshot, ModelHealthState } from "@/lib/model/model-profile-types"; /* 第51天：引入熔断器与健康仪表盘类型。 */

export type CircuitBreakerOptions = { /* 第51天：定义熔断器管理器可配置参数。 */
  failureThreshold?: number; /* 第51天：保存连续失败多少次后打开熔断。 */
  openIntervalMs?: number; /* 第51天：保存熔断打开后多久进入 half_open 试探。 */
  now?: () => number; /* 第51天：允许测试注入当前时间函数以稳定验证半开恢复。 */
}; /* 第51天：结束熔断器配置类型定义。 */

type InternalCircuitState = ModelHealthState; /* 第51天：内部状态直接复用模型健康状态结构。 */

const DEFAULT_FAILURE_THRESHOLD = 3; /* 第51天：默认连续失败 3 次后打开熔断。 */
const DEFAULT_OPEN_INTERVAL_MS = 30000; /* 第51天：默认熔断 30 秒后进入 half_open 试探。 */

export class CircuitBreakerManager { /* 第51天：定义 CircuitBreakerManager（熔断器管理器）。 */
  private readonly states = new Map<string, InternalCircuitState>(); /* 第51天：按模型 id 保存熔断器状态。 */
  private readonly failureThreshold: number; /* 第51天：保存实例级失败阈值。 */
  private readonly openIntervalMs: number; /* 第51天：保存实例级熔断冷却时间。 */
  private readonly now: () => number; /* 第51天：保存获取当前时间的函数。 */

  constructor(options: CircuitBreakerOptions = {}) { /* 第51天：创建熔断器管理器并接受可选配置。 */
    this.failureThreshold = Math.max(1, Math.floor(options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD)); /* 第51天：规范化失败阈值，至少为 1。 */
    this.openIntervalMs = Math.max(1, Math.floor(options.openIntervalMs ?? DEFAULT_OPEN_INTERVAL_MS)); /* 第51天：规范化熔断冷却时间，至少为 1 毫秒。 */
    this.now = options.now ?? Date.now; /* 第51天：未注入时间函数时使用系统时间。 */
  } /* 第51天：结束构造函数。 */

  canCall(modelId: string): boolean { /* 第51天：判断某个模型当前是否允许被调用。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型的状态。 */
    this.refreshHalfOpen(state); /* 第51天：如果熔断冷却期已过则自动切到 half_open。 */
    if (state.state === "open") return false; /* 第51天：open 状态仍在冷却期内时禁止调用。 */
    return true; /* 第51天：closed 或 half_open 状态允许调用。 */
  } /* 第51天：结束可调用判断。 */

  recordSuccess(modelId: string): void { /* 第51天：记录一次模型成功调用。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    state.requestCount += 1; /* 第51天：累计参与健康统计的请求次数。 */
    state.successCount += 1; /* 第51天：累计成功次数。 */
    state.failureCount = 0; /* 第51天：成功后清空连续失败计数。 */
    state.state = "closed"; /* 第51天：成功后无论 closed 还是 half_open 都恢复为正常闭合。 */
    state.openedAt = undefined; /* 第51天：清空熔断开启时间。 */
    state.lastSuccessAt = this.now(); /* 第51天：记录最近成功时间。 */
    state.successRate = this.calculateSuccessRate(state); /* 第51天：刷新成功率。 */
  } /* 第51天：结束成功记录。 */

  recordFailure(modelId: string): void { /* 第51天：记录一次模型失败调用。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    state.requestCount += 1; /* 第51天：累计参与健康统计的请求次数。 */
    state.failureCount += 1; /* 第51天：累计连续失败次数。 */
    state.lastFailureAt = this.now(); /* 第51天：记录最近失败时间。 */
    if (state.state === "half_open" || state.failureCount >= this.failureThreshold) this.open(state); /* 第51天：半开失败或达到阈值时打开熔断。 */
    state.successRate = this.calculateSuccessRate(state); /* 第51天：刷新成功率。 */
  } /* 第51天：结束失败记录。 */

  recordSkipped(modelId: string): void { /* 第51天：记录一次模型因熔断被跳过。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    state.skippedCount += 1; /* 第51天：累计被跳过次数。 */
  } /* 第51天：结束跳过记录。 */

  recordFallbackUsed(modelId: string): void { /* 第51天：记录某个主模型触发了备用链。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    state.fallbackUsedCount += 1; /* 第51天：累计备用链触发次数。 */
  } /* 第51天：结束备用链记录。 */

  getState(modelId: string): CircuitBreakerState { /* 第51天：读取某个模型的基础熔断器状态。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    this.refreshHalfOpen(state); /* 第51天：读取前刷新半开状态，保证展示状态及时。 */
    return { modelId: state.modelId, state: state.state, failureCount: state.failureCount, openedAt: state.openedAt, lastFailureAt: state.lastFailureAt }; /* 第51天：返回不含内部统计字段的基础状态副本。 */
  } /* 第51天：结束读取基础状态。 */

  getHealth(modelId: string): ModelHealthState { /* 第51天：读取某个模型的完整健康状态。 */
    const state = this.ensure(modelId); /* 第51天：读取或创建目标模型状态。 */
    this.refreshHalfOpen(state); /* 第51天：读取前刷新半开状态。 */
    return { ...state }; /* 第51天：返回健康状态副本，避免外部直接改内部状态。 */
  } /* 第51天：结束读取健康状态。 */

  snapshot(modelIds: string[]): ModelHealthSnapshot { /* 第51天：生成 Model Health Dashboard（模型健康仪表盘）快照。 */
    const models = modelIds.map((modelId) => this.getHealth(modelId)); /* 第51天：按传入模型顺序读取每个模型健康状态。 */
    const openModelCount = models.filter((model) => model.state === "open").length; /* 第51天：统计当前 open 熔断模型数量。 */
    const fallbackUsedCount = models.reduce((sum, model) => sum + model.fallbackUsedCount, 0); /* 第51天：统计全部备用链触发次数。 */
    return { models, openModelCount, fallbackUsedCount, generatedAt: this.now() }; /* 第51天：返回健康快照。 */
  } /* 第51天：结束健康快照生成。 */

  clear(): void { /* 第51天：清空全部熔断器状态，供测试隔离或演示重置使用。 */
    this.states.clear(); /* 第51天：移除所有模型健康状态。 */
  } /* 第51天：结束清空状态。 */

  private ensure(modelId: string): InternalCircuitState { /* 第51天：确保指定模型有一条状态记录。 */
    const existing = this.states.get(modelId); /* 第51天：从状态表读取已有记录。 */
    if (existing) return existing; /* 第51天：已有记录时直接返回。 */
    const created: InternalCircuitState = { modelId, state: "closed", failureCount: 0, requestCount: 0, successCount: 0, skippedCount: 0, fallbackUsedCount: 0, successRate: 0 }; /* 第51天：创建默认 closed 健康状态。 */
    this.states.set(modelId, created); /* 第51天：把新状态写入状态表。 */
    return created; /* 第51天：返回新创建的状态。 */
  } /* 第51天：结束确保状态记录。 */

  private open(state: InternalCircuitState): void { /* 第51天：把指定模型状态切换为 open 熔断。 */
    state.state = "open"; /* 第51天：写入 open 状态。 */
    state.openedAt = this.now(); /* 第51天：记录熔断开启时间。 */
  } /* 第51天：结束打开熔断。 */

  private refreshHalfOpen(state: InternalCircuitState): void { /* 第51天：根据冷却时间刷新 open 到 half_open 的过渡。 */
    if (state.state !== "open") return; /* 第51天：非 open 状态无需刷新。 */
    const openedAt = state.openedAt ?? this.now(); /* 第51天：缺失 openedAt 时用当前时间兜底。 */
    if (this.now() - openedAt < this.openIntervalMs) return; /* 第51天：冷却期未满时保持 open。 */
    state.state = "half_open"; /* 第51天：冷却期已满时进入 half_open 试探状态。 */
  } /* 第51天：结束半开刷新。 */

  private calculateSuccessRate(state: InternalCircuitState): number { /* 第51天：计算模型调用成功率。 */
    if (state.requestCount === 0) return 0; /* 第51天：没有请求时成功率为 0。 */
    return Number((state.successCount / state.requestCount).toFixed(4)); /* 第51天：返回保留四位小数的成功率。 */
  } /* 第51天：结束成功率计算。 */
} /* 第51天：结束 CircuitBreakerManager（熔断器管理器）。 */

export const circuitBreakerManager = new CircuitBreakerManager(); /* 第51天：导出进程内共享熔断器管理器供路由器、执行器和仪表盘复用。 */
