import assert from "node:assert/strict"; // 第64天：引入 Node.js 严格断言工具。
import { executeUnifiedResearchTask } from "../lib/runtime/unified-runtime-chain"; // 第64天：引入完整统一上下文测试链路。
import { runtimeContextBuilder } from "../lib/runtime/unified-runtime-context"; // 第64天：引入上下文构建器。

async function main() { // 第64天：使用异步主函数兼容 CommonJS 测试执行环境。
  const context = runtimeContextBuilder.build({ userId: "tester", sessionId: "session-fixed", modelContext: { secretRef: "XIAOMI_MIMO_API_KEY" } }); // 第64天：构建可预测的基础上下文。
  assert.ok(context.requestId.startsWith("req_")); // 第64天：验证自动生成 Request ID。
  assert.ok(context.traceId.startsWith("trace_")); // 第64天：验证自动生成 Trace ID。
  assert.equal(context.sessionId, "session-fixed"); // 第64天：验证构建器复用已有 Session ID。
  assert.equal(context.modelContext?.secretRef, "XIAOMI_MIMO_API_KEY"); // 第64天：验证模型上下文仅保存密钥引用。
  assert.equal(JSON.stringify(context).includes("real-secret"), false); // 第64天：验证上下文没有密钥明文。
  const snapshot = await executeUnifiedResearchTask({ requestId: "req-day64-test", traceId: "trace-day64-test", sessionId: "session-day64-test" }); // 第64天：执行固定标识的研究任务完整链路。
  assert.equal(snapshot.consistent, true); // 第64天：验证所有模块共享同一上下文标识。
  assert.equal(snapshot.records.length, 7); // 第64天：验证 Agent 到 Trace 的七类模块全部接入。
  assert.ok(snapshot.records.every((item) => item.requestId === "req-day64-test")); // 第64天：验证所有模块共享 Request ID。
  assert.ok(snapshot.records.every((item) => item.traceId === "trace-day64-test")); // 第64天：验证所有模块共享 Trace ID。
  assert.equal(snapshot.context.evaluationContext?.status, "passed"); // 第64天：验证 Evaluation 接入并通过链路评估。
  assert.equal(snapshot.context.promptContext?.version, "research.v64"); // 第64天：验证 Prompt Runtime 读取统一上下文版本。
  assert.equal(snapshot.context.modelContext?.secretRef, "XIAOMI_MIMO_API_KEY"); // 第64天：验证 Model Runtime 读取密钥引用。
  console.log("Day64 Unified Runtime Context 测试全部通过。"); // 第64天：输出便于命令行确认的测试结论。
} // 第64天：结束异步主函数。

void main(); // 第64天：启动测试并让断言失败自然终止进程。
