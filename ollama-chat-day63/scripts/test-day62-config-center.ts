import assert from "node:assert/strict"; // 第62天：引入 Node.js 严格断言工具。
import { DEFAULT_CONFIG_ITEMS } from "@/lib/config/config-defaults"; // 第62天：引入默认配置项，用于独立 Provider 合并测试。
import { ConfigManager } from "@/lib/config/config-manager"; // 第62天：引入配置管理器类，用于隔离测试合并优先级。
import { EnvConfigProvider } from "@/lib/config/env-config-provider"; // 第62天：引入环境变量 Provider，用于测试 Env 覆盖 Default。
import { MemoryConfigProvider } from "@/lib/config/memory-config-provider"; // 第62天：引入内存 Provider，用于模拟 Default 和 Database。
import { configManager } from "@/lib/config/config-runtime"; // 第62天：引入真实运行时配置中心单例。
import { getDefaultRetrievalTopK } from "@/lib/knowledge/knowledge-retrieval"; // 第62天：引入 RAG TopK 运行时读取函数。
async function run() { // 第62天：定义测试主函数。
  await configManager.resetDatabaseOverrides(); // 第62天：测试开始前清空数据库模拟覆盖值。
  const initial = configManager.snapshot(); // 第62天：读取初始配置快照。
  assert.ok(initial.items.length >= 20, "应加载默认配置项。"); // 第62天：验证默认配置项已加载。
  assert.equal(initial.metrics.validationErrors, 0, "默认配置不应有校验错误。"); // 第62天：验证默认配置通过校验。
  const topKBefore = getDefaultRetrievalTopK(); // 第62天：读取修改前的 RAG TopK。
  assert.equal(topKBefore, 5, "默认 retrieval.topK 应为 5。"); // 第62天：验证默认 TopK。
  let observed = 0; // 第62天：记录观察者触发次数。
  const unsubscribe = configManager.subscribe((event) => { // 第62天：注册热更新观察者。
    if (event.key === "retrieval.topK") observed += 1; // 第62天：只统计 retrieval.topK 变化事件。
  }); // 第62天：结束观察者注册。
  const updated = await configManager.set("retrieval.topK", 10); // 第62天：写入数据库覆盖值。
  assert.equal(updated.value, 10, "写入后的 retrieval.topK 应为 10。"); // 第62天：验证写入值。
  assert.equal(updated.source, "database", "数据库覆盖值应具有最高优先级。"); // 第62天：验证来源为 database。
  assert.equal(getDefaultRetrievalTopK(), 10, "RAG TopK 应无需重启立即读取新配置。"); // 第62天：验证运行时热更新生效。
  assert.ok(observed >= 1, "热更新观察者应收到配置变化通知。"); // 第62天：验证观察者模式。
  const afterSet = configManager.snapshot(); // 第62天：读取写入后的快照。
  assert.ok(afterSet.metrics.dbConfigs >= 1, "指标应统计 database 配置数量。"); // 第62天：验证 database 指标。
  assert.ok(afterSet.metrics.hotReloadCount >= 1, "指标应统计热更新次数。"); // 第62天：验证热更新指标。
  await configManager.reset("retrieval.topK"); // 第62天：重置单个数据库覆盖值。
  assert.equal(getDefaultRetrievalTopK(), 5, "重置后 retrieval.topK 应回退到默认值 5。"); // 第62天：验证 Reset 能力。
  unsubscribe(); // 第62天：取消观察者订阅，避免影响后续测试。
  assert.throws(() => configManager.coerceValueForKey("runtime.maxWorkers", "not-a-number"), /有效数字/, "数字配置应拒绝非法值。"); // 第62天：验证类型转换和校验错误。
  process.env.RAG_TOP_K = "7"; // 第62天：设置临时环境变量，用于独立合并优先级测试。
  const defaultProvider = new MemoryConfigProvider("default", DEFAULT_CONFIG_ITEMS); // 第62天：创建独立默认配置 Provider。
  const envProvider = new EnvConfigProvider(); // 第62天：创建独立环境变量 Provider。
  const dbProvider = new MemoryConfigProvider("database"); // 第62天：创建独立数据库模拟 Provider。
  const isolated = new ConfigManager([defaultProvider, envProvider, dbProvider], dbProvider); // 第62天：创建独立配置管理器。
  assert.equal(isolated.getNumber("retrieval.topK"), 7, "Env 配置应覆盖 Default 配置。"); // 第62天：验证 Env > Default。
  await isolated.set("retrieval.topK", 12); // 第62天：写入独立数据库覆盖值。
  assert.equal(isolated.getNumber("retrieval.topK"), 12, "Database 配置应覆盖 Env 配置。"); // 第62天：验证 Database > Env。
  delete process.env.RAG_TOP_K; // 第62天：清理临时环境变量。
  await configManager.resetDatabaseOverrides(); // 第62天：测试结束后清空真实配置中心覆盖值。
  console.log("Day62 Config Center tests passed."); // 第62天：输出测试通过提示。
} // 第62天：结束测试主函数。
run().catch((error) => { // 第62天：执行测试并捕获未处理异常。
  console.error(error); // 第62天：打印错误便于定位失败原因。
  process.exitCode = 1; // 第62天：设置非零退出码通知 npm 测试失败。
}); // 第62天：结束测试执行入口。
