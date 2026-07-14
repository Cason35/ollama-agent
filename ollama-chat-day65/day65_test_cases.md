# Day65 Unified Event System 测试用例

## 测试目标

验证 RuntimeEvent（运行时事件）、EventType（事件类型）、EventBus（事件总线）、MemoryEventBus（内存事件总线）、Agent/Tool 事件发布、Trace/Usage/Evaluation 事件订阅，以及 Event Explorer（事件浏览器）是否满足第65天任务要求。

## 自动化执行

```bash
npm run test:day65
```

## 自动化测试用例

| 编号 | 场景 | 操作 | 预期结果 |
| --- | --- | --- | --- |
| TC65-01 | EventType 完整性 | 读取 `EVENT_TYPES` | 包含任务要求的 14 种事件类型，且包含 `error.occurred` |
| TC65-02 | RuntimeEvent 结构 | 创建固定测试事件 | 事件包含 id、type、timestamp、traceId、runtimeContextId、payload、metadata |
| TC65-03 | 单类型订阅 | 订阅 `tool.called` 后发布事件 | 对应 Handler 被调用一次 |
| TC65-04 | 多订阅者分发 | 为 `tool.called` 注册两个 Handler | 两个 Handler 都收到同一条事件 |
| TC65-05 | 返回函数取消订阅 | 调用 `subscribe` 返回的函数 | 被取消的 Handler 不再接收后续事件 |
| TC65-06 | 显式取消订阅 | 调用 `unsubscribe(type, handler)` | 指定 Handler 被移除 |
| TC65-07 | 有限事件历史 | 设置 historyLimit 为 2 并发布 3 条事件 | 只保留最后 2 条且顺序正确 |
| TC65-08 | 投递成功状态 | 发布无异常事件 | 历史记录状态为 `processed` |
| TC65-09 | 订阅者异常隔离 | Handler 主动抛出异常 | 事件记录为 `failed`，保存安全错误摘要并向发布方返回 AggregateError |
| TC65-10 | 统一上下文关联 | 使用固定 Request ID 与 Trace ID 执行任务 | 全部事件携带相同 runtimeContextId 与 traceId |
| TC65-11 | Runtime 事件 | 执行完整任务 | 发布 `runtime.started` 与 `runtime.completed` |
| TC65-12 | Agent Runtime 接入 | 执行完整任务 | 发布 `agent.started` 与 `agent.completed` |
| TC65-13 | Tool Runtime 接入 | 执行完整任务 | 发布 `tool.called` 与 `tool.completed` |
| TC65-14 | Model 事件 | 执行完整任务 | 发布 `model.called` 与 `model.completed` |
| TC65-15 | Trace Subscriber | 对比事件历史与 Trace Timeline | Trace 条目数量与事件数量一致 |
| TC65-16 | Usage Subscriber | 发布 `model.completed` | 自动统计 168 输入 Token、82 输出 Token、成本与延迟 |
| TC65-17 | Evaluation 事件触发 | 发布 `agent.completed` | 自动创建评估任务并随后发布 `evaluation.completed` |
| TC65-18 | Evaluation 关联信息 | 检查自动评估任务 | 关联 Context、Trace、Prompt Version、Model、Usage 与 Agent Output |
| TC65-19 | 事件顺序 | 查看事件类型数组 | `agent.completed` 位于 `evaluation.completed` 之前 |
| TC65-20 | 敏感信息边界 | 序列化全部事件历史 | 不包含 `XIAOMI_MIMO_API_KEY` 或 `apiKey` 字段 |
| TC65-21 | Event Explorer 数据 | GET `/api/runtime/events` | 返回 events、traceTimeline、usage、evaluations 与 consistent |
| TC65-22 | 自定义上下文 API | POST `/api/runtime/events` 并传固定标识 | 返回事件复用调用方传入的 Request ID、Trace ID 与 Session ID |

## Event Explorer 手工测试用例

| 编号 | 场景 | 操作 | 预期结果 |
| --- | --- | --- | --- |
| UI65-01 | 浏览器标签标题 | 打开首页 | 标签页显示 `Day 65 - Unified Event System | 统一事件系统` |
| UI65-02 | 页面主标题 | 查看顶部页头 | 显示 Day 65、Production Upgrade V2、Unified Event System 和统一事件系统 |
| UI65-03 | 默认标签页 | 打开右侧控制台 | 默认选中“事件”标签并展示 Event Explorer |
| UI65-04 | 一致性卡片 | 等待事件链路加载完成 | 显示“事件上下文一致性：通过”以及 Trace ID、Runtime Context ID |
| UI65-05 | 核心指标 | 查看事件浏览器指标区 | 展示事件数量、Trace 条目、Token 用量和自动评估数量 |
| UI65-06 | Agent 过滤 | 点击 `Agent` | 只显示 `agent.started` 与 `agent.completed` |
| UI65-07 | Tool 过滤 | 点击 `Tool` | 只显示 `tool.called` 与 `tool.completed` |
| UI65-08 | Model 过滤 | 点击 `Model` | 只显示 `model.called` 与 `model.completed` |
| UI65-09 | Error 过滤 | 点击 `Error` | 成功链路无错误时显示“当前过滤类别暂无事件” |
| UI65-10 | 事件字段展示 | 查看任一事件卡片 | 展示 Event Type、Source、Timestamp、Trace ID、Runtime Context ID、Payload Summary 和 Status |
| UI65-11 | 重新测试 | 点击“重新测试” | 生成新的 Request ID、Trace ID 与事件时间线 |
| UI65-12 | 历史能力保留 | 点击“上下文”标签 | Day64 Runtime Context Explorer 仍可正常使用 |

## 验收步骤

1. 在 `ollama-chat-day65` 目录执行 `npm install`。
2. 执行 `npm run test:day65`，确认命令输出“Day65 Unified Event System 测试全部通过”。
3. 执行 `npm run lint`，确认没有 ESLint 错误。
4. 执行 `npm run build`，确认 Next.js 生产构建成功。
5. 执行 `npm run dev` 并打开 `http://localhost:3000`。
6. 按照 UI65-01 至 UI65-12 完成 Event Explorer 手工验收。

## 验收结论

以上自动化与手工用例全部通过时，第65天 Unified Event System 的十项任务验收标准完成。
