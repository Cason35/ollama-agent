import assert from "node:assert/strict"; /* 第51天：引入 Node 严格断言用于自动化验收。 */
import { TraceManager } from "../lib/agents/trace-manager"; /* 第51天：引入 TraceManager 验证模型执行器追踪元数据。 */
import { CircuitBreakerManager, circuitBreakerManager } from "../lib/model/circuit-breaker-manager"; /* 第51天：引入熔断器管理器和共享熔断器实例。 */
import { createDefaultModelRegistry } from "../lib/model/default-models"; /* 第51天：引入默认模型注册表工厂。 */
import { getModelDashboardSnapshot } from "../lib/model/model-dashboard-runtime"; /* 第51天：引入模型仪表盘快照入口。 */
import { ModelExecutor, type ModelCaller, type ModelTransportResult } from "../lib/model/model-executor"; /* 第51天：引入模型执行器和可注入调用器类型。 */
import { ModelRouter } from "../lib/model/model-router"; /* 第51天：引入模型路由器验证熔断跳过。 */
import { UsageManager } from "../lib/usage/usage-manager"; /* 第51天：引入独立用量管理器验证 fallback 用量字段。 */

function ok(text: string): ModelTransportResult { /* 第51天：定义构造成功模型响应的测试工具。 */
  return { ok: true, status: 200, text }; /* 第51天：返回成功传输结果。 */
} /* 第51天：结束成功响应工具。 */

function fail(text: string): ModelTransportResult { /* 第51天：定义构造失败模型响应的测试工具。 */
  return { ok: false, status: 503, text }; /* 第51天：返回失败传输结果。 */
} /* 第51天：结束失败响应工具。 */

function callerFrom(outcomes: Record<string, ModelTransportResult[]>): ModelCaller { /* 第51天：定义按模型 id 返回预设响应序列的假调用器。 */
  const indexes = new Map<string, number>(); /* 第51天：保存每个模型已经被调用到第几个响应。 */
  return async (profile) => { /* 第51天：返回符合 ModelCaller 签名的异步函数。 */
    const sequence = outcomes[profile.id] ?? [ok(`ok:${profile.id}`)]; /* 第51天：没有显式配置时默认成功。 */
    const index = indexes.get(profile.id) ?? 0; /* 第51天：读取当前模型调用序号。 */
    indexes.set(profile.id, index + 1); /* 第51天：递增当前模型调用序号。 */
    return sequence[Math.min(index, sequence.length - 1)]; /* 第51天：响应用尽后重复最后一个响应，方便模拟持续失败。 */
  }; /* 第51天：结束假调用器函数。 */
} /* 第51天：结束假调用器构造。 */

function testModelProfileFallbackConfig(): void { /* 第51天：验证 ModelProfile 已支持备用链、超时和重试配置。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const large = registry.get("large-reasoning"); /* 第51天：读取大型推理模型档案。 */
  assert.deepEqual(large?.fallbackModelIds, ["json-structured", "small-chat"], "大型推理模型应配置 JSON 与小模型备用链"); /* 第51天：验证 fallbackModelIds 配置。 */
  assert.equal(large?.timeoutMs, 30000, "大型推理模型应配置超时时间"); /* 第51天：验证 timeoutMs 配置。 */
  assert.equal(large?.maxRetries, 1, "大型推理模型应配置最大重试次数"); /* 第51天：验证 maxRetries 配置。 */
} /* 第51天：结束模型档案配置测试。 */

function testCircuitBreakerStateTransitions(): void { /* 第51天：验证熔断器 closed → open → half_open → closed 状态流转。 */
  let now = 1000; /* 第51天：初始化可控测试时间。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 3, openIntervalMs: 30000, now: () => now }); /* 第51天：创建可控时间的熔断器管理器。 */
  breaker.recordFailure("large-reasoning"); /* 第51天：记录第一次失败。 */
  breaker.recordFailure("large-reasoning"); /* 第51天：记录第二次失败。 */
  breaker.recordFailure("large-reasoning"); /* 第51天：记录第三次失败并触发 open。 */
  assert.equal(breaker.getState("large-reasoning").state, "open", "连续失败达到阈值后应打开熔断"); /* 第51天：验证 open 状态。 */
  assert.equal(breaker.canCall("large-reasoning"), false, "open 冷却期内不允许调用"); /* 第51天：验证 open 状态禁止调用。 */
  now += 30001; /* 第51天：推进时间超过冷却期。 */
  assert.equal(breaker.canCall("large-reasoning"), true, "冷却期后应允许 half_open 试探调用"); /* 第51天：验证冷却后允许调用。 */
  assert.equal(breaker.getState("large-reasoning").state, "half_open", "冷却期后状态应变为 half_open"); /* 第51天：验证 half_open 状态。 */
  breaker.recordSuccess("large-reasoning"); /* 第51天：记录半开试探成功。 */
  assert.equal(breaker.getState("large-reasoning").state, "closed", "half_open 成功后应恢复 closed"); /* 第51天：验证成功恢复 closed。 */
} /* 第51天：结束熔断状态流转测试。 */

async function testExecutorPrimarySuccess(): Promise<void> { /* 第51天：验证主模型成功时不使用 fallback。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager(); /* 第51天：创建独立熔断器。 */
  const executor = new ModelExecutor(registry, breaker, callerFrom({ "small-chat": [ok("primary ok")] })); /* 第51天：创建主模型成功的模型执行器。 */
  const result = await executor.call({ modelId: "small-chat", prompt: "你好" }); /* 第51天：调用小模型。 */
  assert.equal(result.success, true, "主模型正常时应成功"); /* 第51天：验证调用成功。 */
  assert.equal(result.modelId, "small-chat", "成功结果应归属主模型"); /* 第51天：验证最终模型。 */
  assert.equal(result.fallbackUsed, false, "主模型成功时不应使用 fallback"); /* 第51天：验证未触发备用链。 */
} /* 第51天：结束主模型成功测试。 */

async function testExecutorFallbackSuccess(): Promise<void> { /* 第51天：验证主模型失败后备用模型成功。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 5 }); /* 第51天：创建较高阈值熔断器，避免主模型一次测试中过早熔断影响链路。 */
  const usage = new UsageManager(); /* 第51天：创建独立用量管理器。 */
  const executor = new ModelExecutor(registry, breaker, callerFrom({ "large-reasoning": [fail("primary down")], "json-structured": [ok("fallback ok")] })); /* 第51天：创建主模型失败、备用模型成功的执行器。 */
  const result = await executor.call({ modelId: "large-reasoning", prompt: "规划任务", options: { usage: { manager: usage, traceId: "trace-1", spanId: "span-1", componentType: "agent", componentId: "planner" } } }); /* 第51天：执行带 Usage 记录的模型调用。 */
  assert.equal(result.success, true, "备用模型成功时整体调用应成功"); /* 第51天：验证整体成功。 */
  assert.equal(result.modelId, "json-structured", "主模型失败后应切换到第一备用模型"); /* 第51天：验证最终模型为备用模型。 */
  assert.equal(result.fallbackUsed, true, "切换到备用模型时 fallbackUsed 应为 true"); /* 第51天：验证 fallback 标记。 */
  assert.deepEqual(result.fallbackChain, ["large-reasoning", "json-structured"], "fallbackChain 应记录主模型和备用模型"); /* 第51天：验证备用链路记录。 */
  const record = usage.listRecords()[0]; /* 第51天：读取用量记录。 */
  assert.equal(record.modelId, "json-structured", "Usage 应记录最终成功模型"); /* 第51天：验证用量最终模型。 */
  assert.equal(record.fallbackUsed, true, "Usage 应记录 fallbackUsed"); /* 第51天：验证用量 fallback 标记。 */
  assert.deepEqual(record.fallbackChain, ["large-reasoning", "json-structured"], "Usage 应记录 fallbackChain"); /* 第51天：验证用量备用链。 */
  assert.equal(breaker.getHealth("large-reasoning").fallbackUsedCount, 1, "主模型应累计一次备用链触发"); /* 第51天：验证主模型备用链统计。 */
} /* 第51天：结束备用模型成功测试。 */

async function testExecutorOpensCircuitOnFailures(): Promise<void> { /* 第51天：验证连续失败会打开熔断器。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 2 }); /* 第51天：创建两次失败即熔断的管理器。 */
  const executor = new ModelExecutor(registry, breaker, callerFrom({ "large-reasoning": [fail("still down")], "json-structured": [ok("fallback ok")] })); /* 第51天：创建主模型持续失败、备用成功的执行器。 */
  const result = await executor.call({ modelId: "large-reasoning", prompt: "复杂规划" }); /* 第51天：执行一次会让主模型因重试失败达到阈值。 */
  assert.equal(result.success, true, "备用成功时调用仍应成功"); /* 第51天：验证备用成功。 */
  assert.equal(breaker.getState("large-reasoning").state, "open", "主模型连续失败后应进入 open 熔断"); /* 第51天：验证主模型打开熔断。 */
} /* 第51天：结束连续失败熔断测试。 */

function testRouterSkipsOpenCircuitModel(): void { /* 第51天：验证 ModelRouter 会避开 open 熔断模型。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 1 }); /* 第51天：创建一次失败即熔断的管理器。 */
  breaker.recordFailure("large-reasoning"); /* 第51天：让大型推理模型进入 open 状态。 */
  const router = new ModelRouter(registry, breaker); /* 第51天：创建接入该熔断器的路由器。 */
  const decision = router.routeWithReason({ taskType: "planning", complexity: "high" }); /* 第51天：请求规划任务，本应优先选择大型推理模型。 */
  assert.equal(decision.model.id, "json-structured", "大型推理模型熔断后应切到其第一备用模型"); /* 第51天：验证路由切到备用模型。 */
  assert.ok(decision.skippedByCircuit?.includes("large-reasoning"), "路由决策应记录被熔断跳过的模型"); /* 第51天：验证跳过列表。 */
  assert.equal(decision.matchedRule, "complexity-high-circuit-fallback", "路由规则应标记 circuit fallback"); /* 第51天：验证规则标识。 */
} /* 第51天：结束路由避开熔断测试。 */

async function testExecutorDegradedResponse(): Promise<void> { /* 第51天：验证全部模型失败时返回降级响应。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 10 }); /* 第51天：创建高阈值熔断器，确保链路会完整尝试。 */
  const executor = new ModelExecutor(registry, breaker, callerFrom({ "small-chat": [fail("small down")], "json-structured": [fail("json down")] })); /* 第51天：创建主模型和备用模型都失败的执行器。 */
  const result = await executor.call({ modelId: "small-chat", prompt: "请回答", options: { degradedOutput: "降级响应" } }); /* 第51天：执行失败链路并传入自定义降级文本。 */
  assert.equal(result.success, false, "全部失败时 success 应为 false"); /* 第51天：验证失败状态。 */
  assert.equal(result.output, "降级响应", "全部失败时应返回降级响应文本"); /* 第51天：验证降级输出。 */
  assert.deepEqual(result.fallbackChain, ["small-chat", "json-structured"], "降级结果仍应保留尝试链路"); /* 第51天：验证失败链路记录。 */
} /* 第51天：结束降级响应测试。 */

async function testTraceMetadata(): Promise<void> { /* 第51天：验证 Trace metadata 会记录 fallback 信息。 */
  const registry = createDefaultModelRegistry(); /* 第51天：创建默认模型注册表。 */
  const breaker = new CircuitBreakerManager({ failureThreshold: 5 }); /* 第51天：创建独立熔断器。 */
  const traceManager = new TraceManager(); /* 第51天：创建独立追踪管理器。 */
  const trace = traceManager.startTrace("day51-test"); /* 第51天：创建测试追踪记录。 */
  const executor = new ModelExecutor(registry, breaker, callerFrom({ "large-reasoning": [fail("primary down")], "json-structured": [ok("fallback ok")] })); /* 第51天：创建主模型失败、备用成功的执行器。 */
  const result = await executor.call({ modelId: "large-reasoning", prompt: "追踪测试", options: { trace: { manager: traceManager, traceId: trace.traceId, name: "model-call" } } }); /* 第51天：执行带 Trace 的模型调用。 */
  const span = traceManager.getTrace(trace.traceId)?.spans.find((item) => item.name === "model-call"); /* 第51天：读取模型执行跨度。 */
  assert.equal(result.fallbackUsed, true, "测试调用应触发 fallback"); /* 第51天：确认测试确实触发备用链。 */
  assert.equal(span?.metadata?.fallbackUsed, true, "Trace metadata 应记录 fallbackUsed"); /* 第51天：验证追踪元数据 fallbackUsed。 */
  assert.deepEqual(span?.metadata?.fallbackChain, ["large-reasoning", "json-structured"], "Trace metadata 应记录 fallbackChain"); /* 第51天：验证追踪元数据 fallbackChain。 */
} /* 第51天：结束 Trace 元数据测试。 */

function testModelHealthDashboardSnapshot(): void { /* 第51天：验证模型健康快照已接入 /api/model 数据源。 */
  circuitBreakerManager.clear(); /* 第51天：清空共享熔断器状态，避免测试污染。 */
  circuitBreakerManager.recordFailure("small-chat"); /* 第51天：制造一条可观测失败记录。 */
  const snapshot = getModelDashboardSnapshot(); /* 第51天：生成模型仪表盘快照。 */
  const small = snapshot.health.models.find((item) => item.modelId === "small-chat"); /* 第51天：读取小模型健康状态。 */
  assert.ok(snapshot.health.models.length >= 5, "健康快照应包含默认模型列表"); /* 第51天：验证健康模型数量。 */
  assert.equal(small?.failureCount, 1, "健康快照应展示模型失败次数"); /* 第51天：验证失败次数进入快照。 */
  assert.equal(typeof snapshot.health.generatedAt, "number", "健康快照应包含生成时间"); /* 第51天：验证生成时间。 */
  circuitBreakerManager.clear(); /* 第51天：测试结束后清理共享熔断器状态。 */
} /* 第51天：结束健康快照测试。 */

async function main(): Promise<void> { /* 第51天：定义 Day 51 自动化验收主入口。 */
  testModelProfileFallbackConfig(); /* 第51天：执行模型档案 fallback 配置测试。 */
  testCircuitBreakerStateTransitions(); /* 第51天：执行熔断器状态流转测试。 */
  await testExecutorPrimarySuccess(); /* 第51天：执行主模型成功测试。 */
  await testExecutorFallbackSuccess(); /* 第51天：执行备用模型成功测试。 */
  await testExecutorOpensCircuitOnFailures(); /* 第51天：执行连续失败熔断测试。 */
  testRouterSkipsOpenCircuitModel(); /* 第51天：执行路由避开熔断模型测试。 */
  await testExecutorDegradedResponse(); /* 第51天：执行降级响应测试。 */
  await testTraceMetadata(); /* 第51天：执行 Trace fallback 元数据测试。 */
  testModelHealthDashboardSnapshot(); /* 第51天：执行模型健康快照测试。 */
  console.log("Day 51 Fallback and Circuit Breaker tests passed."); /* 第51天：输出自动化验收成功提示。 */
} /* 第51天：结束自动化验收主入口。 */

void main().catch((error: unknown) => { /* 第51天：启动测试并捕获异步断言或运行时错误。 */
  console.error(error); /* 第51天：输出失败原因以便定位具体测试。 */
  process.exitCode = 1; /* 第51天：设置非零退出码让命令行和 CI 正确识别失败。 */
}); /* 第51天：结束自动化测试错误处理。 */
