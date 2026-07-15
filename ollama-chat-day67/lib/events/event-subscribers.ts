import { randomUUID } from "node:crypto"; // 第65天：引入 UUID 生成器，为自动创建的评估任务生成唯一标识。
import { EVENT_TYPES, type EvaluationTask, type EventBus, type EventHandler, type EventType, type EventUsageSnapshot, type RuntimeEvent, type TraceTimelineItem, type Unsubscribe } from "@/lib/events/event-types"; // 第65天：引入事件协议、订阅处理器和各订阅者输出类型。

type EvaluationEventFactory = (type: EventType, payload: unknown, status: string) => RuntimeEvent; // 第65天：定义 Evaluation Subscriber 发布后续事件所需的工厂签名。

function readPayload(event: RuntimeEvent): Record<string, unknown> { // 第65天：把未知事件载荷安全收窄为可读取的普通对象。
  return typeof event.payload === "object" && event.payload !== null && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {}; // 第65天：非对象载荷统一转换为空对象，避免订阅者读取时报错。
} // 第65天：结束事件载荷安全读取函数。

function readNumber(payload: Record<string, unknown>, key: string): number { // 第65天：从事件载荷读取有限数值字段。
  const value = payload[key]; // 第65天：读取指定键对应的未知值。
  return typeof value === "number" && Number.isFinite(value) ? value : 0; // 第65天：仅接受有限数值，其余情况使用零。
} // 第65天：结束数值载荷读取函数。

function readString(payload: Record<string, unknown>, key: string, fallback = "unknown"): string { // 第65天：从事件载荷读取安全字符串字段。
  const value = payload[key]; // 第65天：读取指定键对应的未知值。
  return typeof value === "string" && value.trim() ? value : fallback; // 第65天：仅接受非空字符串，其余情况使用回退值。
} // 第65天：结束字符串载荷读取函数。

export class TraceSubscriber { // 第65天：实现通过事件监听生成调用链时间线的 Trace Subscriber。
  private readonly timeline: TraceTimelineItem[] = []; // 第65天：保存按事件到达顺序生成的链路时间线。
  private readonly unsubscribes: Unsubscribe[] = []; // 第65天：保存全部事件类型对应的取消订阅函数。

  constructor(private readonly eventBus: EventBus) {} // 第65天：注入事件总线而不依赖具体业务运行时。

  connect(): void { // 第65天：订阅统一事件系统中的全部事件类型。
    if (this.unsubscribes.length > 0) return; // 第65天：已经连接时直接返回，避免重复记录时间线。
    for (const type of EVENT_TYPES) { // 第65天：遍历全部已注册运行时事件类型。
      const handler: EventHandler = (event) => { // 第65天：为当前事件类型创建统一追踪处理器。
        this.timeline.push({ eventId: event.id, type: event.type, source: String(event.metadata?.source ?? "unknown"), timestamp: event.timestamp, traceId: event.traceId, runtimeContextId: event.runtimeContextId, status: String(event.metadata?.status ?? "observed") }); // 第65天：把事件转换为不含敏感载荷的追踪时间线条目。
      }; // 第65天：结束当前追踪事件处理器定义。
      this.unsubscribes.push(this.eventBus.subscribe(type, handler)); // 第65天：注册追踪处理器并保存取消函数。
    } // 第65天：结束全部事件类型订阅遍历。
  } // 第65天：结束 Trace Subscriber 连接方法。

  disconnect(): void { // 第65天：取消 Trace Subscriber 的全部事件订阅。
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe(); // 第65天：逐个调用并移除已保存的取消订阅函数。
  } // 第65天：结束 Trace Subscriber 断开方法。

  getTimeline(): TraceTimelineItem[] { // 第65天：读取当前链路追踪时间线快照。
    return this.timeline.map((item) => ({ ...item })); // 第65天：返回条目拷贝，保护订阅者内部状态。
  } // 第65天：结束链路时间线读取方法。
} // 第65天：结束 Trace Subscriber 实现。

export class UsageSubscriber { // 第65天：实现通过模型完成事件自动统计令牌、成本和延迟的 Usage Subscriber。
  private snapshot: EventUsageSnapshot = { modelEvents: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, latencyMs: 0 }; // 第65天：初始化空的事件用量聚合快照。
  private unsubscribe?: Unsubscribe; // 第65天：保存模型完成事件的取消订阅函数。

  constructor(private readonly eventBus: EventBus) {} // 第65天：注入事件总线并与模型运行时解耦。

  connect(): void { // 第65天：开始监听模型完成事件。
    if (this.unsubscribe) return; // 第65天：已经连接时直接返回，避免用量被重复累计。
    this.unsubscribe = this.eventBus.subscribe("model.completed", (event) => { // 第65天：订阅模型调用完成事件并执行自动统计。
      const payload = readPayload(event); // 第65天：安全读取模型完成事件载荷。
      const promptTokens = readNumber(payload, "promptTokens"); // 第65天：读取本次模型调用的输入令牌数量。
      const completionTokens = readNumber(payload, "completionTokens"); // 第65天：读取本次模型调用的输出令牌数量。
      this.snapshot = { modelEvents: this.snapshot.modelEvents + 1, promptTokens: this.snapshot.promptTokens + promptTokens, completionTokens: this.snapshot.completionTokens + completionTokens, totalTokens: this.snapshot.totalTokens + promptTokens + completionTokens, cost: this.snapshot.cost + readNumber(payload, "cost"), latencyMs: this.snapshot.latencyMs + readNumber(payload, "latencyMs"), provider: readString(payload, "provider"), model: readString(payload, "model"), traceId: event.traceId }; // 第65天：把本次模型事件增量合并到统一用量快照。
    }); // 第65天：结束模型完成事件订阅注册。
  } // 第65天：结束 Usage Subscriber 连接方法。

  disconnect(): void { // 第65天：停止监听模型完成事件。
    this.unsubscribe?.(); // 第65天：存在订阅时调用取消函数。
    this.unsubscribe = undefined; // 第65天：清空取消函数以允许后续重新连接。
  } // 第65天：结束 Usage Subscriber 断开方法。

  getSnapshot(): EventUsageSnapshot { // 第65天：读取当前自动聚合的用量快照。
    return { ...this.snapshot }; // 第65天：返回快照拷贝，避免调用方修改内部统计。
  } // 第65天：结束用量快照读取方法。
} // 第65天：结束 Usage Subscriber 实现。

export class EvaluationSubscriber { // 第65天：实现由智能体完成事件自动触发评估任务的 Evaluation Subscriber。
  private readonly tasks: EvaluationTask[] = []; // 第65天：保存本次运行链路自动创建的评估任务。
  private unsubscribe?: Unsubscribe; // 第65天：保存智能体完成事件的取消订阅函数。

  constructor(private readonly eventBus: EventBus, private readonly createEvent: EvaluationEventFactory, private readonly getUsage: () => EventUsageSnapshot) {} // 第65天：注入事件总线、事件工厂和只读用量查询能力。

  connect(): void { // 第65天：开始监听智能体完成事件。
    if (this.unsubscribe) return; // 第65天：已经连接时直接返回，避免创建重复评估任务。
    this.unsubscribe = this.eventBus.subscribe("agent.completed", async (event) => { // 第65天：订阅智能体完成事件并异步创建评估任务。
      const payload = readPayload(event); // 第65天：安全读取智能体完成事件载荷。
      const agentOutput = readString(payload, "outputSummary", "无输出摘要"); // 第65天：读取经过脱敏和截断的智能体输出摘要。
      const score = agentOutput === "无输出摘要" ? 0.4 : 0.96; // 第65天：根据是否存在输出构造教学演示评估分数。
      const task: EvaluationTask = { id: `eval_${randomUUID()}`, runtimeContextId: event.runtimeContextId, traceId: event.traceId, promptVersion: readString(payload, "promptVersion"), model: readString(payload, "model"), usage: this.getUsage(), agentOutput, score, status: score >= 0.8 ? "passed" : "failed", createdAt: Date.now() }; // 第65天：创建关联上下文、提示词、模型、用量、追踪与输出的评估任务。
      this.tasks.push(task); // 第65天：保存自动创建的评估任务。
      await this.eventBus.publish(this.createEvent("evaluation.completed", { evaluationId: task.id, score: task.score, status: task.status, promptVersion: task.promptVersion, model: task.model }, "completed")); // 第65天：发布评估完成事件，让 Trace 和后续模块继续监听。
    }); // 第65天：结束智能体完成事件订阅注册。
  } // 第65天：结束 Evaluation Subscriber 连接方法。

  disconnect(): void { // 第65天：停止监听智能体完成事件。
    this.unsubscribe?.(); // 第65天：存在订阅时调用取消函数。
    this.unsubscribe = undefined; // 第65天：清空取消函数以允许后续重新连接。
  } // 第65天：结束 Evaluation Subscriber 断开方法。

  getTasks(): EvaluationTask[] { // 第65天：读取由事件自动创建的评估任务快照。
    return this.tasks.map((task) => ({ ...task, usage: { ...task.usage } })); // 第65天：返回包含用量拷贝的任务列表，保护订阅者内部状态。
  } // 第65天：结束评估任务读取方法。
} // 第65天：结束 Evaluation Subscriber 实现。
