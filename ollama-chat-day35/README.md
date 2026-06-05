# Ollama Chat Day 35

Day 35 在 `ollama-chat-day34` 的 Queue Runtime V4 基础上，升级为 Queue Runtime V5：Rate Limit（速率限制）+ Resource Control（资源控制）。

## 本日重点

- Queue Runtime V5：在 WorkerPool 并发基础上增加资源并发限制和速率限制。
- resourceType：任务可显式或自动推断资源类型，包括 llm、embedding、database、workflow、tool。
- ResourceLimiter：控制同一资源同时运行的任务数量，例如 embedding 最多同时 2 个。
- RateLimiter：控制单位时间内任务认领次数，例如 llm 每秒最多 2 个。
- blockedReason：当任务被资源或速率限制挡住时，看板展示 resource_limit 或 rate_limit。
- Rate Limit Metrics：展示 allowed / blocked、Resource Usage 与 Rate Limit Window。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，在右侧 `Queue Runtime V5` 中创建任务，观察资源占用、速率窗口、阻塞原因与时间线变化。

## 测试用例

测试用例见 `day35_test_cases.md`。
