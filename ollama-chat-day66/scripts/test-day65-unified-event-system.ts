import assert from "node:assert/strict"; // 第65天：引入 Node.js 严格断言工具验证统一事件系统行为。
import { EVENT_TYPES, type EventType, type RuntimeEvent } from "../lib/events/event-types"; // 第65天：引入事件类型清单和测试所需事件类型。
import { MemoryEventBus } from "../lib/events/memory-event-bus"; // 第65天：引入内存事件总线进行发布、订阅和历史测试。
import { executeUnifiedEventTask } from "../lib/events/event-driven-runtime"; // 第65天：引入统一事件系统完整演示链路。

function createTestEvent(type: EventType, id: string): RuntimeEvent { // 第65天：创建供内存事件总线单元测试使用的固定事件。
  return { id, type, timestamp: Date.now(), traceId: "trace-bus-test", runtimeContextId: "req-bus-test", payload: { safe: true }, metadata: { source: "system", status: "test" } }; // 第65天：返回不含敏感信息且标识可预测的测试事件。
} // 第65天：结束固定测试事件工厂函数。

async function testMemoryEventBus(): Promise<void> { // 第65天：验证内存事件总线的核心通信协议和有限历史能力。
  const eventBus = new MemoryEventBus(2); // 第65天：创建最多保存两条历史的内存事件总线。
  let firstHandlerCalls = 0; // 第65天：记录第一个订阅者被调用的次数。
  let secondHandlerCalls = 0; // 第65天：记录第二个订阅者被调用的次数。
  const firstHandler = () => { firstHandlerCalls += 1; }; // 第65天：定义第一个工具事件订阅者。
  const unsubscribeFirst = eventBus.subscribe("tool.called", firstHandler); // 第65天：订阅工具调用事件并保存取消函数。
  const secondHandler = () => { secondHandlerCalls += 1; }; // 第65天：定义第二个工具事件订阅者。
  eventBus.subscribe("tool.called", secondHandler); // 第65天：验证同一事件类型支持多个订阅者。
  assert.equal(eventBus.listenerCount("tool.called"), 2); // 第65天：验证工具调用事件当前有两个订阅者。
  await eventBus.publish(createTestEvent("tool.called", "evt-bus-1")); // 第65天：发布第一条工具调用事件。
  assert.equal(firstHandlerCalls, 1); // 第65天：验证第一个订阅者收到事件。
  assert.equal(secondHandlerCalls, 1); // 第65天：验证第二个订阅者收到同一事件。
  unsubscribeFirst(); // 第65天：通过订阅返回值取消第一个订阅者。
  assert.equal(eventBus.listenerCount("tool.called"), 1); // 第65天：验证取消后只剩一个工具事件订阅者。
  await eventBus.publish(createTestEvent("tool.called", "evt-bus-2")); // 第65天：发布第二条工具调用事件。
  assert.equal(firstHandlerCalls, 1); // 第65天：验证已取消订阅者不再收到事件。
  assert.equal(secondHandlerCalls, 2); // 第65天：验证保留的订阅者继续收到事件。
  eventBus.unsubscribe("tool.called", secondHandler); // 第65天：使用显式接口取消第二个订阅者。
  await eventBus.publish(createTestEvent("runtime.started", "evt-bus-3")); // 第65天：发布第三条事件触发有限历史裁剪。
  const history = eventBus.getHistory(); // 第65天：读取事件总线历史快照。
  assert.equal(history.length, 2); // 第65天：验证事件历史没有超过配置容量。
  assert.deepEqual(history.map((event) => event.id), ["evt-bus-2", "evt-bus-3"]); // 第65天：验证历史裁剪时删除最早事件并保留顺序。
  assert.ok(history.every((event) => event.deliveryStatus === "processed")); // 第65天：验证没有异常的事件均标记为处理完成。
  const failingBus = new MemoryEventBus(); // 第65天：创建独立事件总线验证订阅异常处理。
  failingBus.subscribe("error.occurred", () => { throw new Error("订阅者测试失败"); }); // 第65天：注册一个主动抛错的测试订阅者。
  await assert.rejects(() => failingBus.publish(createTestEvent("error.occurred", "evt-failed")), AggregateError); // 第65天：验证发布方会收到聚合后的订阅处理错误。
  assert.equal(failingBus.getHistory()[0]?.deliveryStatus, "failed"); // 第65天：验证失败事件历史被标记为 failed。
  assert.equal(failingBus.getHistory()[0]?.errors[0], "订阅者测试失败"); // 第65天：验证事件历史保存安全错误摘要。
} // 第65天：结束内存事件总线核心能力测试。

async function testUnifiedEventRuntime(): Promise<void> { // 第65天：验证 Agent、Tool、Trace、Usage 与 Evaluation 的完整事件链路。
  const snapshot = await executeUnifiedEventTask({ requestId: "req-day65-test", traceId: "trace-day65-test", sessionId: "session-day65-test" }); // 第65天：使用固定标识执行完整统一事件任务。
  assert.equal(snapshot.consistent, true); // 第65天：验证全部事件共享同一统一上下文和追踪标识。
  assert.equal(snapshot.events.length, 13); // 第65天：验证完整成功链路发布十三条运行时事件。
  assert.equal(snapshot.traceTimeline.length, snapshot.events.length); // 第65天：验证 Trace Subscriber 监听到全部事件。
  assert.ok(snapshot.events.every((event) => event.traceId === "trace-day65-test")); // 第65天：验证全部事件复用固定 Trace ID。
  assert.ok(snapshot.events.every((event) => event.runtimeContextId === "req-day65-test")); // 第65天：验证全部事件使用 Request ID 关联统一上下文。
  assert.ok(snapshot.events.every((event) => event.deliveryStatus === "processed")); // 第65天：验证完整成功链路中的事件均处理完成。
  const eventTypes = snapshot.events.map((event) => event.type); // 第65天：提取完整链路事件类型便于验证。
  assert.ok(eventTypes.includes("runtime.started")); // 第65天：验证运行时开始事件已发布。
  assert.ok(eventTypes.includes("agent.started")); // 第65天：验证智能体开始事件已发布。
  assert.ok(eventTypes.includes("agent.completed")); // 第65天：验证智能体完成事件已发布。
  assert.ok(eventTypes.includes("tool.called")); // 第65天：验证工具调用事件已发布。
  assert.ok(eventTypes.includes("tool.completed")); // 第65天：验证工具完成事件已发布。
  assert.ok(eventTypes.includes("model.completed")); // 第65天：验证模型完成事件已发布。
  assert.ok(eventTypes.includes("evaluation.completed")); // 第65天：验证评估完成事件由订阅者自动发布。
  assert.ok(eventTypes.indexOf("agent.completed") < eventTypes.indexOf("evaluation.completed")); // 第65天：验证智能体完成后才触发评估完成事件。
  assert.equal(snapshot.usage.modelEvents, 1); // 第65天：验证 Usage Subscriber 处理一次模型完成事件。
  assert.equal(snapshot.usage.promptTokens, 168); // 第65天：验证自动统计输入令牌数量。
  assert.equal(snapshot.usage.completionTokens, 82); // 第65天：验证自动统计输出令牌数量。
  assert.equal(snapshot.usage.totalTokens, 250); // 第65天：验证自动计算总令牌数量。
  assert.equal(snapshot.usage.cost, 0.0025); // 第65天：验证自动统计模型估算成本。
  assert.equal(snapshot.usage.latencyMs, 320); // 第65天：验证自动统计模型调用延迟。
  assert.equal(snapshot.evaluations.length, 1); // 第65天：验证智能体完成事件自动创建一个评估任务。
  assert.equal(snapshot.evaluations[0]?.status, "passed"); // 第65天：验证自动评估任务通过质量阈值。
  assert.equal(snapshot.evaluations[0]?.promptVersion, "research.v65"); // 第65天：验证评估任务关联 Day65 提示词版本。
  assert.equal(snapshot.evaluations[0]?.model, "mimo-v2-flash"); // 第65天：验证评估任务关联模型名称。
  assert.equal(snapshot.evaluations[0]?.usage.totalTokens, 250); // 第65天：验证评估任务关联事件聚合用量。
  assert.equal(JSON.stringify(snapshot.events).includes("XIAOMI_MIMO_API_KEY"), false); // 第65天：验证事件及载荷没有复制密钥引用或明文。
  assert.equal(JSON.stringify(snapshot.events).toLowerCase().includes("apikey"), false); // 第65天：验证事件载荷没有 API Key 字段。
} // 第65天：结束统一事件运行时完整链路测试。

async function main(): Promise<void> { // 第65天：定义串行执行全部 Day65 自动化测试的主函数。
  assert.equal(EVENT_TYPES.length, 14); // 第65天：验证事件类型联合至少覆盖任务要求的十四种事件。
  assert.ok(EVENT_TYPES.includes("error.occurred")); // 第65天：验证统一错误事件类型已经注册。
  await testMemoryEventBus(); // 第65天：执行内存事件总线单元测试。
  await testUnifiedEventRuntime(); // 第65天：执行统一事件系统集成测试。
  console.log("Day65 Unified Event System 测试全部通过。"); // 第65天：输出便于命令行确认的测试结论。
} // 第65天：结束 Day65 自动化测试主函数。

void main(); // 第65天：启动测试并让断言失败自然终止进程。
