# Day 35 测试用例：Queue Runtime V5 Rate Limit + Resource Control

本文档用于验证 `ollama-chat-day35` 是否完成第35天任务：`resourceType`、`ResourceLimiter`、`RateLimiter`、`blockedReason`、Resource Usage、Rate Limit Metrics 与资源限制压测。

## 测试前准备

1. 进入项目目录：`cd ollama-chat-day35`
2. 安装依赖：`npm install`
3. 启动开发服务：`npm run dev`
4. 打开浏览器：`http://localhost:3000`
5. 观察右侧 `Queue Runtime V5` 看板

## 用例 1：基础页面标题与标签页

**操作**

1. 打开首页。
2. 查看浏览器标签页。
3. 查看页面顶部标题。

**预期**

1. 浏览器标签页包含 `Day 35 - Queue Runtime V5`。
2. 页面顶部显示 `Day 35`。
3. 页面主标题显示 `Queue Runtime V5 · Rate Limit + Resource Control`。

## 用例 2：Job 自动写入 resourceType

**操作**

1. 点击 `High Chat P10`。
2. 点击 `Workflow P8`。
3. 点击 `Retrieval DB P5`。
4. 点击 `Reindex Embedding`。

**预期**

1. `chat` 任务的 `Resource` 显示为 `llm`。
2. `workflow` 任务的 `Resource` 显示为 `workflow`。
3. `retrieval` 任务的 `Resource` 显示为 `database`。
4. `reindex` 任务的 `Resource` 显示为 `embedding`。

## 用例 3：embedding 并发资源限制

**操作**

1. 点击 `Create 10 Embedding Jobs`。
2. 观察 `Resource Usage` 面板中的 `embedding`。
3. 观察任务表格中的 `running` 任务数量。

**预期**

1. `embedding` 资源占用最多显示 `2 / 2`。
2. 同一时间最多只有 2 个 `embedding` 任务处于 `running`。
3. 其余等待任务的 `Blocked` 显示 `waiting embedding` 或保持排队等待。
4. `blocked` 指标会增加。

## 用例 4：llm 每秒速率限制

**操作**

1. 点击 `Burst 5 Chat Jobs`。
2. 观察 `Rate Limit Window` 面板中的 `llm`。
3. 观察任务表格中的 `Blocked` 列。

**预期**

1. `llm` 每秒最多放行 2 个任务。
2. 超出速率窗口的 `chat` 任务会暂时显示 `rate limited llm`。
3. 下一秒速率窗口刷新后，被阻塞任务会继续被认领。
4. `Rate Limit Metrics` 中 `blocked` 会增加。

## 用例 5：资源限制不阻塞其他资源任务

**操作**

1. 点击 `Create 10 Embedding Jobs`。
2. 在 embedding 任务排队时点击 `High Chat P10`。
3. 观察 chat 任务是否能被认领。

**预期**

1. embedding 资源满载时不会卡住 llm 资源。
2. `chat` 任务仍可以在 llm 资源和速率允许时运行。
3. 队列会跳过当前被资源限制挡住的任务，继续尝试其他可运行任务。

## 用例 6：blockedReason 持久化展示

**操作**

1. 触发 embedding 或 llm 限制。
2. 等待看板刷新。
3. 查看任务表格 `Blocked` 列。

**预期**

1. 被资源并发限制挡住的任务记录 `resource_limit`。
2. 被速率限制挡住的任务记录 `rate_limit`。
3. UI 显示可读文本，例如 `waiting embedding` 或 `rate limited llm`。

## 用例 7：重试和死信兼容

**操作**

1. 点击 `Unstable Retry`。
2. 点击 `AlwaysFail DLQ`。
3. 等待任务执行完成或进入死信。

**预期**

1. `unstable` 失败后仍会进入 `retrying` 并按退避重新入队。
2. `alwaysFail` 达到最大尝试次数后进入 `dead_letter`。
3. 死信任务仍可点击 `Requeue` 重新入队。
4. 任务结束后对应资源占用会释放。

## 用例 8：Resource Usage 看板

**操作**

1. 创建不同类型任务。
2. 观察 `Resource Usage`。

**预期**

1. 看板稳定展示 `llm`、`embedding`、`database`、`workflow`、`tool`。
2. 每项展示格式为 `active / limit`。
3. 任务完成、重试或死信后，`active` 会回落。

## 用例 9：Rate Limit Metrics 看板

**操作**

1. 点击 `Burst 5 Chat Jobs`。
2. 观察顶部指标中的 `allowed` 和 `blocked`。

**预期**

1. 成功认领任务会增加 `allowed`。
2. 被限制器挡住的任务会增加 `blocked`。
3. `Rate Limit Window` 能显示当前窗口使用量。

## 用例 10：API 手动测试

**操作**

```bash
curl -X POST http://localhost:3000/api/queue ^
  -H "Content-Type: application/json" ^
  -d "{\"type\":\"chat\",\"priority\":10}"
```

**预期**

1. API 返回成功响应。
2. 返回的 `created.resourceType` 为 `llm`。
3. 返回快照包含 `resourceUsage`、`rateLimitUsage` 和 `rateLimitMetrics`。

## 验收清单

1. Job 是否支持 `resourceType`：是
2. 是否实现 `ResourceLimiter`：是
3. `claimNextJob` 是否检查资源限制：是
4. 是否实现 `inferResourceType`：是
5. 是否实现 `RateLimiter`：是
6. `claimNextJob` 是否检查 rate limit：是
7. Dashboard 是否展示 Resource Usage：是
8. 是否增加 Rate Limit Metrics：是
9. 是否记录 `blockedReason`：是
10. 是否完成资源限制压测入口：是
