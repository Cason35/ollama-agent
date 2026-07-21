import type { EventSource, EventType, EventUsageSnapshot, UnifiedEventSnapshot } from "@/lib/events/event-types"; // 第65天：引入统一事件来源、类型、用量和快照类型。
import { createRuntimeEvent } from "@/lib/events/event-factory"; // 第65天：引入关联统一上下文的事件工厂。
import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第65天：引入教学和本地开发使用的内存事件总线。
import { EvaluationSubscriber, TraceSubscriber, UsageSubscriber } from "@/lib/events/event-subscribers"; // 第65天：引入链路追踪、用量和评估事件订阅者。
import { authContextMiddleware, memoryContextMiddleware, runContextMiddleware, traceContextMiddleware } from "@/lib/runtime/context-middleware"; // 第65天：复用 Day64 统一上下文中间件链。
import type { RuntimeContextRequest, RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第65天：引入统一上下文请求与结果类型。

type PublishRuntimeEvent = (type: EventType, source: EventSource, payload: unknown, status: string) => Promise<void>; // 第65天：定义各运行时模块共享的事件发布函数签名。

async function executeEventDrivenToolRuntime(publish: PublishRuntimeEvent): Promise<{ resultSummary: string; latencyMs: number }> { // 第65天：模拟只通过事件通知 Trace、Usage 等模块的工具运行时。
  const startedAt = Date.now(); // 第65天：记录工具开始时间以计算执行时长。
  await publish("tool.called", "tool", { toolName: "knowledge.search", argumentsSummary: "query=统一事件系统" }, "running"); // 第65天：发布不含密码、令牌和接口密钥的工具调用事件。
  const resultSummary = "命中 3 条统一事件系统知识片段"; // 第65天：构造适合事件载荷展示的脱敏工具结果摘要。
  const latencyMs = Math.max(1, Date.now() - startedAt + 18); // 第65天：生成稳定大于零的教学演示工具耗时。
  await publish("tool.completed", "tool", { toolName: "knowledge.search", resultSummary, latencyMs, success: true }, "completed"); // 第65天：发布工具完成事件并附带摘要、耗时和成功状态。
  return { resultSummary, latencyMs }; // 第65天：向智能体主流程返回正常业务结果。
} // 第65天：结束事件驱动工具运行时演示函数。

async function executeEventDrivenAgentRuntime(context: RuntimeContextV2, publish: PublishRuntimeEvent, getUsage: () => EventUsageSnapshot): Promise<string> { // 第65天：模拟接入 EventBus 的智能体完整执行流程。
  await publish("agent.started", "agent", { agentId: context.agentId, taskId: context.taskId, requestId: context.requestId }, "running"); // 第65天：智能体开始时发布关联同一请求和追踪标识的事件。
  await publish("memory.read", "memory", { source: "unified-runtime", itemCount: 2, query: "统一事件系统" }, "completed"); // 第65天：发布记忆读取事件供追踪和分析模块监听。
  await publish("retrieval.completed", "retrieval", { strategy: context.retrievalContext?.strategy ?? "hybrid", hitCount: 3, topScore: 0.94 }, "completed"); // 第65天：发布检索完成事件并只携带安全摘要。
  await publish("prompt.rendered", "prompt", { version: context.promptContext?.version ?? "research.v65", strategy: context.promptContext?.strategy ?? "quality", characterCount: 428 }, "completed"); // 第65天：发布提示词渲染完成事件并关联版本。
  const toolResult = await executeEventDrivenToolRuntime(publish); // 第65天：执行接入同一事件总线的工具运行时。
  await publish("model.called", "model", { provider: context.modelContext?.provider ?? "mimo", model: context.modelContext?.model ?? "mimo-v2-flash", promptVersion: context.promptContext?.version ?? "research.v65" }, "running"); // 第65天：发布模型开始调用事件且不复制密钥引用或明文。
  await publish("model.completed", "model", { provider: context.modelContext?.provider ?? "mimo", model: context.modelContext?.model ?? "mimo-v2-flash", promptTokens: 168, completionTokens: 82, cost: 0.0025, latencyMs: 320, success: true }, "completed"); // 第65天：发布模型完成事件供 Usage Subscriber 自动统计。
  const outputSummary = `已基于${toolResult.resultSummary}生成统一事件系统说明`; // 第65天：构造经过摘要的智能体输出，避免事件载荷保存完整敏感内容。
  await publish("agent.completed", "agent", { agentId: context.agentId, taskId: context.taskId, outputSummary, promptVersion: context.promptContext?.version ?? "research.v65", model: context.modelContext?.model ?? "mimo-v2-flash", usage: getUsage() }, "completed"); // 第65天：发布智能体完成事件并触发 Evaluation Subscriber 自动评估。
  return outputSummary; // 第65天：返回正常业务输出摘要。
} // 第65天：结束事件驱动智能体运行时演示函数。

export async function executeUnifiedEventTask(input: RuntimeContextRequest = {}): Promise<UnifiedEventSnapshot> { // 第65天：执行统一事件系统完整演示链路并生成 Event Explorer 快照。
  const context = await runContextMiddleware({ userId: "day65-user", taskId: "event-research-task", agentId: "event-researcher", memoryContext: { query: "统一事件系统" }, retrievalContext: { strategy: "hybrid" }, promptContext: { strategy: "quality", version: "research.v65" }, modelContext: { provider: "mimo", model: "mimo-v2-flash", secretRef: "XIAOMI_MIMO_API_KEY" }, ...input }, [authContextMiddleware, traceContextMiddleware, memoryContextMiddleware]); // 第65天：复用 Day64 能力创建所有事件共享的统一运行时上下文。
  const eventBus = new MemoryEventBus(64); // 第65天：为本次请求创建隔离且容量受限的内存事件总线。
  const traceSubscriber = new TraceSubscriber(eventBus); // 第65天：创建通过事件监听工作的链路追踪订阅者。
  const usageSubscriber = new UsageSubscriber(eventBus); // 第65天：创建通过模型完成事件统计用量的订阅者。
  const publish = async (type: EventType, source: EventSource, payload: unknown, status: string) => eventBus.publish(createRuntimeEvent(context, type, source, payload, status)); // 第65天：创建自动关联统一上下文的事件发布函数。
  const evaluationSubscriber = new EvaluationSubscriber(eventBus, (type, payload, status) => createRuntimeEvent(context, type, "evaluation", payload, status), () => usageSubscriber.getSnapshot()); // 第65天：创建由智能体完成事件自动触发的评估订阅者。
  traceSubscriber.connect(); // 第65天：先连接 Trace Subscriber 以捕获后续全部事件。
  usageSubscriber.connect(); // 第65天：连接 Usage Subscriber 以监听模型完成事件。
  evaluationSubscriber.connect(); // 第65天：连接 Evaluation Subscriber 以监听智能体完成事件。
  try { // 第65天：捕获完整运行时链路异常并转换为统一错误事件。
    await publish("runtime.started", "runtime", { requestId: context.requestId, sessionId: context.sessionId, taskId: context.taskId }, "running"); // 第65天：发布统一运行时开始事件。
    const outputSummary = await executeEventDrivenAgentRuntime(context, publish, () => usageSubscriber.getSnapshot()); // 第65天：执行 Agent、Tool、Prompt、Retrieval 和 Model 的事件驱动演示链路。
    await publish("memory.write", "memory", { itemCount: 1, summary: outputSummary, importance: "high" }, "completed"); // 第65天：发布智能体结果写入记忆的完成事件。
    await publish("runtime.completed", "runtime", { requestId: context.requestId, success: true, outputSummary }, "completed"); // 第65天：发布统一运行时完成事件。
  } catch (error) { // 第65天：捕获业务链路或订阅者处理异常。
    await publish("error.occurred", "system", { message: error instanceof Error ? error.message : "未知运行时错误", retryable: false }, "failed").catch(() => undefined); // 第65天：尽最大努力发布不含堆栈和敏感数据的错误事件。
    throw error; // 第65天：保留原始失败语义交给 API 或测试调用方处理。
  } // 第65天：结束完整运行时链路异常处理。
  const events = eventBus.getHistory(); // 第65天：读取按发布时间排序的有限事件历史。
  const usage = usageSubscriber.getSnapshot(); // 第65天：读取由模型完成事件自动聚合的用量结果。
  const evaluations = evaluationSubscriber.getTasks(); // 第65天：读取由智能体完成事件自动创建的评估任务。
  const traceTimeline = traceSubscriber.getTimeline(); // 第65天：读取由事件监听自动生成的链路时间线。
  const consistent = events.length > 0 && events.every((event) => event.traceId === context.traceId && event.runtimeContextId === context.requestId); // 第65天：验证全部事件共享同一 Trace ID 和 Runtime Context ID。
  context.usageContext = { ...context.usageContext, ...usage }; // 第65天：把事件订阅聚合结果同步回统一上下文快照供观察。
  context.evaluationContext = { ...context.evaluationContext, latest: evaluations.at(-1) ?? null, count: evaluations.length }; // 第65天：把事件触发评估结果同步回统一上下文快照供观察。
  traceSubscriber.disconnect(); // 第65天：快照完成后释放 Trace Subscriber 的全部订阅。
  usageSubscriber.disconnect(); // 第65天：快照完成后释放 Usage Subscriber 的模型事件订阅。
  evaluationSubscriber.disconnect(); // 第65天：快照完成后释放 Evaluation Subscriber 的智能体事件订阅。
  return { context, events, traceTimeline, usage, evaluations, consistent, generatedAt: Date.now() }; // 第65天：返回 Event Explorer、API 和自动化测试共享的完整事件快照。
} // 第65天：结束统一事件系统完整演示函数。
