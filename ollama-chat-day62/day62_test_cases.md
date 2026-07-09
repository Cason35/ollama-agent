# Day62 Configuration Center 测试用例

## 测试范围

本文档用于验收 `ollama-chat-day62` 的 Configuration Center（配置中心）能力，覆盖配置定义、Provider 合并、ConfigManager 读取、配置校验、Hot Reload（热更新）、Config Explorer（配置浏览器）、Config Metrics（配置指标）和关键 Runtime 接入。

## 用例 1：默认配置加载

- 前置条件：进入 `ollama-chat-day62` 项目。
- 操作步骤：执行 `npm run test:day62`。
- 预期结果：配置中心能加载默认配置项，配置总数大于等于 20，`validationErrors` 为 0。

## 用例 2：配置合并优先级

- 前置条件：测试脚本会临时设置 `RAG_TOP_K=7`。
- 操作步骤：脚本创建独立的 Default Provider、Env Provider 和 Database Provider。
- 预期结果：`retrieval.topK` 先被 Env 覆盖为 7，再被 Database 覆盖为 12，符合 `Database > Env > Default`。

## 用例 3：ConfigManager 统一读取

- 前置条件：默认 `retrieval.topK` 为 5。
- 操作步骤：通过 `configManager.getNumber("retrieval.topK")` 或 `getDefaultRetrievalTopK()` 读取配置。
- 预期结果：未写入数据库覆盖值时返回 5。

## 用例 4：配置写入与热更新

- 前置条件：注册 `configManager.subscribe()` 观察者。
- 操作步骤：调用 `configManager.set("retrieval.topK", 10)`。
- 预期结果：配置项来源变为 `database`，观察者收到 `retrieval.topK` 变化事件，`hotReloadCount` 增加。

## 用例 5：Retriever 即时读取新配置

- 前置条件：已将 `retrieval.topK` 写为 10。
- 操作步骤：调用 `getDefaultRetrievalTopK()`。
- 预期结果：无需重启服务，立即返回 10。

## 用例 6：Reset 回退配置

- 前置条件：`retrieval.topK` 已存在 database 覆盖值。
- 操作步骤：调用 `configManager.reset("retrieval.topK")`。
- 预期结果：database 覆盖值被删除，`retrieval.topK` 回退为默认值 5。

## 用例 7：类型校验

- 前置条件：`runtime.maxWorkers` 的 Schema 类型为 number。
- 操作步骤：调用 `configManager.coerceValueForKey("runtime.maxWorkers", "not-a-number")`。
- 预期结果：抛出“配置值必须是有效数字”的错误。

## 用例 8：Config Metrics

- 前置条件：执行一次配置写入和一次配置重置。
- 操作步骤：读取 `configManager.snapshot().metrics`。
- 预期结果：能看到 `totalConfigs`、`envConfigs`、`dbConfigs`、`hotReloadCount` 和 `validationErrors`。

## 用例 9：Config Explorer 页面

- 前置条件：启动 Next.js 开发服务。
- 操作步骤：打开首页右侧控制台的“配置”标签页。
- 预期结果：页面显示 Config Explorer，包含分类、Key、Value、Source、UpdatedAt、Reload、Save 和 Reset。

## 用例 10：标题与标签页

- 前置条件：打开 `ollama-chat-day62` 首页。
- 操作步骤：观察浏览器标签页、页头和右侧控制台徽标。
- 预期结果：浏览器标签页为 “Day 62 - Configuration Center | 配置中心”，页头显示 “Configuration Center 配置中心”，侧边栏徽标显示 “Day 62”。
