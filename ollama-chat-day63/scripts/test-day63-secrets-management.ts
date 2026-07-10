import assert from "node:assert/strict"; // 第63天：引入 Node.js 严格断言工具。
import { TraceManager } from "@/lib/agents/trace-manager"; // 第63天：引入 TraceManager，用于验证 Trace 元数据脱敏。
import { MIMO_MODEL_IDS } from "@/lib/model/mimo-models"; // 第63天：引入 MiMo 模型 ID 列表，用于构建合法运行时。
import { buildModelRuntime } from "@/lib/model/model-runtime"; // 第63天：引入模型运行时构造器，用于验证 Runtime 接入 SecretsManager。
import { maskSecretObject } from "@/lib/secrets/secret-masking"; // 第63天：引入通用脱敏工具，用于单元验证。
import { getMemorySecretProvider, secretsManager } from "@/lib/secrets/secrets-runtime"; // 第63天：引入共享密钥管理器和测试用内存 Provider。

async function run() { // 第63天：定义测试主函数。
  await secretsManager.resetRuntimeSecrets(); // 第63天：测试开始前清空运行时内存密钥和指标。
  const memoryProvider = getMemorySecretProvider(); // 第63天：读取内存 Provider，便于验证底层保存值为密文。
  const testKey = "DAY63_TEST_SECRET"; // 第63天：定义独立测试密钥名称，避免污染真实业务 key。
  const firstValue = "day63-secret-value-1234567890"; // 第63天：定义首次写入密钥值。
  const secondValue = "day63-rotated-value-0987654321"; // 第63天：定义轮换后的新密钥值。
  const metadata = await secretsManager.set({ key: testKey, value: firstValue, category: "auth" }); // 第63天：写入测试密钥并加密保存。
  assert.equal(metadata.key, testKey, "写入后应返回密钥 key 元数据。"); // 第63天：验证返回 key。
  assert.equal(metadata.encrypted, true, "内存 Provider 保存的密钥应标记为已加密。"); // 第63天：验证加密标记。
  const encryptedValue = memoryProvider.debugReadEncryptedValue(testKey); // 第63天：读取测试专用密文值。
  assert.ok(encryptedValue?.startsWith("day63:v1."), "密文应带有 Day63 加密版本前缀。"); // 第63天：验证密文格式。
  assert.ok(!encryptedValue?.includes(firstValue), "底层保存值不应包含明文密钥。"); // 第63天：验证明文没有落入存储。
  const readBack = await secretsManager.get(testKey); // 第63天：通过 SecretsManager 读取真实密钥。
  assert.equal(readBack, firstValue, "SecretsManager.get 应能解密并返回真实密钥。"); // 第63天：验证解密读取。
  const snapshotAfterSet = await secretsManager.snapshot(); // 第63天：读取写入后的安全快照。
  assert.ok(!JSON.stringify(snapshotAfterSet).includes(firstValue), "SecretsSnapshot 不应包含真实密钥值。"); // 第63天：验证快照不泄露明文。
  assert.ok(snapshotAfterSet.metrics.encryptedCount >= 1, "SecretsMetrics 应统计已加密密钥数量。"); // 第63天：验证加密指标。
  assert.equal("listValues" in memoryProvider, false, "SecretProvider 不应提供 listValues 能力。"); // 第63天：验证 Provider 没有批量泄露真实值的接口。
  const rotation = await secretsManager.rotateSecret(testKey, secondValue); // 第63天：执行密钥轮换。
  assert.equal(rotation.key, testKey, "轮换记录应包含密钥 key。"); // 第63天：验证轮换 key。
  assert.notEqual(rotation.oldVersionId, rotation.newVersionId, "轮换后新旧版本 ID 应不同。"); // 第63天：验证版本变化。
  assert.equal(await secretsManager.get(testKey), secondValue, "轮换后读取应返回新密钥值。"); // 第63天：验证旧值失效、新值生效。
  assert.ok(!JSON.stringify(await secretsManager.snapshot()).includes(secondValue), "轮换后快照仍不应包含真实密钥值。"); // 第63天：验证轮换值不泄露。
  await secretsManager.set({ key: "DAY63_EXPIRED_SECRET", value: "expired-value", category: "auth", expiresAt: Date.now() - 1000 }); // 第63天：写入一个已过期密钥用于指标验证。
  assert.equal(await secretsManager.get("DAY63_EXPIRED_SECRET"), undefined, "已过期密钥不应再被读取。"); // 第63天：验证过期密钥读取为空。
  assert.ok((await secretsManager.snapshot()).metrics.expiredSecrets >= 1, "SecretsMetrics 应统计过期密钥数量。"); // 第63天：验证过期指标。
  await secretsManager.set({ key: "XIAOMI_MIMO_API_KEY", value: "day63-mimo-runtime-secret", category: "model" }); // 第63天：写入 MiMo 运行时所需密钥。
  const { rt, errorResponse } = await buildModelRuntime("mimo", MIMO_MODEL_IDS[0]); // 第63天：构建 MiMo 运行时并触发 SecretsManager 读取。
  assert.equal(errorResponse, null, "配置了 MiMo 密钥后不应返回错误响应。"); // 第63天：验证运行时没有配置错误。
  assert.equal(rt?.mimoApiKey, "day63-mimo-runtime-secret", "ModelRuntime 应从 SecretsManager 读取 MiMo API Key。"); // 第63天：验证运行时密钥来源。
  const masked = maskSecretObject({ apiKey: "sk-live-leak", nested: { password: "plain-password" }, note: "Bearer abcdefghijklmnop" }); // 第63天：构造包含敏感字段和疑似 token 的对象。
  const maskedText = JSON.stringify(masked); // 第63天：序列化脱敏结果用于断言。
  assert.ok(!maskedText.includes("sk-live-leak"), "脱敏对象不应包含 API Key 明文。"); // 第63天：验证 API Key 脱敏。
  assert.ok(!maskedText.includes("plain-password"), "脱敏对象不应包含 Password 明文。"); // 第63天：验证密码脱敏。
  assert.ok(maskedText.includes("************"), "脱敏结果应使用统一掩码。"); // 第63天：验证统一掩码。
  const traceManager = new TraceManager(); // 第63天：创建追踪管理器。
  const trace = traceManager.startTrace("day63-secret-masking-test"); // 第63天：开启一条测试 Trace。
  const spanId = traceManager.startSpan(trace.traceId, { name: "secret-span", type: "tool", metadata: { apiKey: "sk-trace-leak", nested: { token: "Bearer trace-token-value-123456" } } }); // 第63天：写入包含敏感字段的 Span 元数据。
  traceManager.endSpan(trace.traceId, spanId, "success", { password: "trace-password-leak" }); // 第63天：结束 Span 并追加敏感元数据。
  const traceText = JSON.stringify(traceManager.getTrace(trace.traceId)); // 第63天：读取 Trace 并序列化。
  assert.ok(!traceText.includes("sk-trace-leak"), "Trace 不应包含 API Key 明文。"); // 第63天：验证 Trace API Key 脱敏。
  assert.ok(!traceText.includes("trace-password-leak"), "Trace 不应包含 Password 明文。"); // 第63天：验证 Trace 密码脱敏。
  assert.ok(traceText.includes("************"), "Trace 应保留统一脱敏占位符。"); // 第63天：验证 Trace 掩码存在。
  const deleted = await secretsManager.delete(testKey); // 第63天：删除测试密钥。
  assert.equal(deleted, true, "删除运行时密钥应返回 true。"); // 第63天：验证删除结果。
  assert.equal(await secretsManager.get(testKey), undefined, "删除后测试密钥不应再能读取。"); // 第63天：验证删除后不可读。
  await secretsManager.resetRuntimeSecrets(); // 第63天：测试结束后清空运行时内存密钥。
  console.log("Day63 Secrets Management tests passed."); // 第63天：输出测试通过提示。
} // 第63天：结束测试主函数。

run().catch((error) => { // 第63天：执行测试并捕获未处理异常。
  console.error(error); // 第63天：打印错误便于定位失败原因。
  process.exitCode = 1; // 第63天：设置非零退出码通知 npm 测试失败。
}); // 第63天：结束测试执行入口。
