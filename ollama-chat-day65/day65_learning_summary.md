# Day65 学习总结：Unified Event System（统一事件系统）

## 本文记录范围

本文整理 `ollama-chat-day65` 项目的学习型对话，包含：

- 项目做了什么。
- 项目运用了哪些知识。
- 对比 `ollama-chat-day64` 有哪些改进。
- 为什么需要 Unified Event System（统一事件系统）。
- 使用餐厅点餐的生活化例子理解 Event-Driven Architecture（事件驱动架构）。
- 第65天打卡结果。

本文不记录项目文件创建、代码复制、代码修改、依赖安装和命令执行等过程性聊天，只保留帮助理解系统设计的问答内容。

---

## 一、读懂 `ollama-chat-day65` 项目

### 我的提问

带我来读懂 `ollama-chat-day65` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day64` 有什么改进，为什么这样子做，并且在一些英文专业术语后面补充一个括号，补充其中文名称或者中文描述。

### 回答整理

### 1. 一句话理解 Day65

`ollama-chat-day65` 在 Day64 的 RuntimeContext（运行时上下文）基础上增加了 Unified Event System（统一事件系统）。

可以这样理解：

```text
Day64：让所有模块知道“当前是什么状态”
Day65：让所有模块知道“刚刚发生了什么变化”
```

Day64 解决 State Sharing（状态共享），Day65 解决 Event Communication（事件通信）。

### 2. 项目整体做了什么

Day65 完整保留了之前积累的能力：

- Chat（对话系统）。
- Workflow（工作流）。
- Agent（智能体）。
- Tool（工具）。
- RAG（检索增强生成）。
- Memory（记忆系统）。
- Prompt（提示词系统）。
- Model（模型系统）。
- Evaluation（评估系统）。
- Redis（分布式缓存与共享状态基础设施）。
- Queue（任务队列）。
- Lock（分布式锁）。
- Storage（对象存储）。
- Config（配置中心）。
- Secrets（密钥管理）。
- RuntimeContext（运行时上下文）。

在此基础上，项目新建 `lib/events` 目录，增加了一套事件驱动的运行链路：

```text
RuntimeContext（运行时上下文）
        ↓
Agent / Tool / Model（智能体 / 工具 / 模型）
        ↓ publish（发布事件）
MemoryEventBus（内存事件总线）
        ├─ TraceSubscriber（链路追踪订阅者）
        ├─ UsageSubscriber（用量订阅者）
        └─ EvaluationSubscriber（评估订阅者）
```

Agent（智能体）只需要声明：

```text
agent.started（智能体开始执行）
agent.completed（智能体执行完成）
```

Tool（工具）只需要声明：

```text
tool.called（工具开始调用）
tool.completed（工具调用完成）
```

至于谁需要记录 Trace（链路追踪）、统计 Usage（用量）或创建 Evaluation（评估），由 EventBus（事件总线）分发给不同 Subscriber（订阅者）。

---

## 二、RuntimeEvent（运行时事件）与 EventType（事件类型）

核心文件：`lib/events/event-types.ts`。

### 1. EventType（事件类型）

项目定义了 14 种事件：

```text
runtime.started（运行时开始）
runtime.completed（运行时完成）
agent.started（智能体开始执行）
agent.completed（智能体执行完成）
tool.called（工具开始调用）
tool.completed（工具调用完成）
model.called（模型开始调用）
model.completed（模型调用完成）
prompt.rendered（提示词渲染完成）
memory.read（记忆读取）
memory.write（记忆写入）
retrieval.completed（检索完成）
evaluation.completed（评估完成）
error.occurred（发生错误）
```

这些事件主要使用过去式或者完成式命名，因为 Event（事件）描述的是已经发生的事实。

例如：

```text
agent.completed
```

表示“智能体已经完成”，而不是命令智能体去完成。

这属于 Domain Event（领域事件）或 Runtime Event（运行时事件）的典型命名方式。

### 2. RuntimeEvent（运行时事件）

统一事件结构为：

```ts
type RuntimeEvent = {
  id: string;
  type: EventType;
  timestamp: number;
  traceId: string;
  runtimeContextId: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
};
```

各字段作用如下：

| 字段 | 作用 |
| --- | --- |
| `id` | 唯一标识一条事件 |
| `type` | 表示发生了什么 |
| `timestamp` | 表示什么时候发生 |
| `traceId` | 关联整条调用链 |
| `runtimeContextId` | 关联 Day64 的统一上下文 |
| `payload` | 保存业务数据摘要 |
| `metadata` | 保存来源、状态和版本等扩展信息 |

当前实现直接使用 `requestId` 作为 `runtimeContextId`：

```ts
runtimeContextId: context.requestId
```

这样事件不需要复制整个 RuntimeContext（运行时上下文），只保存关联标识即可。

主要好处包括：

- 减少重复数据。
- 减少敏感信息泄露风险。
- 减小事件体积。
- 降低模块之间的数据耦合。

---

## 三、EventBus（事件总线）接口

项目定义了统一通信协议：

```ts
interface EventBus {
  publish(event: RuntimeEvent): Promise<void> | void;
  subscribe(type: EventType, handler: EventHandler): Unsubscribe;
  unsubscribe(type: EventType, handler: EventHandler): void;
}
```

它提供三种核心能力：

- `publish`：Publish Event（发布事件）。
- `subscribe`：Subscribe Event（订阅事件）。
- `unsubscribe`：Unsubscribe Event（取消订阅）。

这里运用了 Interface-Based Design（基于接口的设计）。

业务代码依赖的是 `EventBus` 接口，而不是直接依赖 `MemoryEventBus`。

因此，将来可以把内存实现替换为：

- Redis Streams（Redis 流）。
- Kafka（分布式事件流平台）。
- RabbitMQ（消息队列系统）。
- NATS（轻量级消息系统）。

理想情况下，Agent（智能体）和 Tool（工具）的事件发布代码不需要改变。

这体现了 Dependency Inversion Principle（依赖倒置原则）：

```text
业务模块依赖抽象协议，
而不是依赖具体基础设施。
```

---

## 四、MemoryEventBus（内存事件总线）

核心文件：`lib/events/memory-event-bus.ts`。

MemoryEventBus（内存事件总线）是 EventBus（事件总线）的教学和单进程实现。

内部核心结构是：

```ts
Map<EventType, Set<EventHandler>>
```

可以理解为：

```text
事件类型
  └─ 对应一个处理函数集合
```

例如：

```text
model.completed（模型调用完成）
  ├─ TraceSubscriber（链路追踪订阅者）
  └─ UsageSubscriber（用量订阅者）
```

### 发布事件的流程

`publish()` 大致执行以下步骤：

1. 找到当前事件类型对应的所有 Handler（处理器）。
2. 先把事件写入 History（历史记录）。
3. 依次调用每一个 Handler（处理器）。
4. 记录处理完成时间。
5. 更新投递状态。
6. 如果处理器失败，抛出 AggregateError（聚合错误）。

事件投递状态包括：

```text
published（已发布）
processed（处理完成）
failed（处理失败）
```

### 为什么先写事件历史，再执行订阅者

代码先把事件写入历史，再通知 Subscriber（订阅者），目的是保留真实的发布时间顺序。

例如：

```text
agent.completed（智能体执行完成）
  -> EvaluationSubscriber（评估订阅者）
      -> evaluation.completed（评估完成）
```

如果先执行订阅者，再保存 `agent.completed`，就可能错误地显示为：

```text
evaluation.completed
agent.completed
```

当前设计可以保证顺序为：

```text
agent.completed
evaluation.completed
```

### 有限事件历史

MemoryEventBus（内存事件总线）支持 `historyLimit`：

```ts
new MemoryEventBus(64)
```

超过容量后删除最早的事件。

这运用了 Bounded Buffer（有界缓冲区）思想，可以避免事件历史无限增长导致内存占用持续增加。

### 异常隔离

某个 Handler（处理器）失败时，系统不会立刻停止其他 Handler（处理器）：

```ts
try {
  await handler(event);
} catch (error) {
  record.errors.push(...);
}
```

所有处理器执行结束后，再通过 AggregateError（聚合错误）统一报告失败。

这使一个订阅者失败时，其他订阅者仍然有机会收到事件，体现了 Failure Isolation（故障隔离）。

---

## 五、三个核心 Subscriber（订阅者）

核心文件：`lib/events/event-subscribers.ts`。

### 1. TraceSubscriber（链路追踪订阅者）

TraceSubscriber（链路追踪订阅者）订阅全部 14 种事件。

它把 RuntimeEvent（运行时事件）转换为 TraceTimelineItem（链路追踪时间线条目）：

```text
Event ID（事件标识）
Event Type（事件类型）
Source（事件来源）
Timestamp（时间戳）
Trace ID（链路追踪标识）
Runtime Context ID（运行时上下文标识）
Status（状态）
```

业务模块不再需要主动调用：

```text
TraceManager.log（直接记录链路）
```

而只需要发布事件。

这实现了 Event-Driven Observability（事件驱动可观测性）。

### 2. UsageSubscriber（用量订阅者）

UsageSubscriber（用量订阅者）只监听：

```text
model.completed（模型调用完成）
```

收到事件后，从 Payload（事件载荷）中读取：

- Prompt Tokens（输入令牌数量）。
- Completion Tokens（输出令牌数量）。
- Cost（成本）。
- Latency（延迟）。
- Provider（模型提供方）。
- Model（模型）。

然后自动聚合成统一用量快照。

因此，Model Runtime（模型运行时）不需要知道 Usage Manager（用量管理器）的具体实现。

模型只负责声明：

```text
模型调用完成了，
本次使用了多少 Token（令牌），
花费多少，
耗时多少。
```

UsageSubscriber（用量订阅者）负责统计。

这体现了 Separation of Concerns（职责分离）。

### 3. EvaluationSubscriber（评估订阅者）

EvaluationSubscriber（评估订阅者）监听：

```text
agent.completed（智能体执行完成）
```

收到事件后自动创建 EvaluationTask（评估任务），并关联：

- Runtime Context ID（运行时上下文标识）。
- Trace ID（链路追踪标识）。
- Prompt Version（提示词版本）。
- Model（模型）。
- Usage（用量）。
- Agent Output（智能体输出）。
- Score（评估分数）。
- Status（评估状态）。

创建完成后，它还会再次发布：

```text
evaluation.completed（评估完成）
```

由此形成一条事件因果链：

```text
agent.completed
  -> EvaluationSubscriber（评估订阅者）
      -> 创建 EvaluationTask（评估任务）
      -> evaluation.completed
```

这属于 Event Chaining（事件链式触发）。

---

## 六、Day65 完整运行流程

核心文件：`lib/events/event-driven-runtime.ts`。

入口函数是：

```text
executeUnifiedEventTask（执行统一事件任务）
```

一次完整成功执行会产生 13 条事件：

```text
1. runtime.started（运行时开始）
2. agent.started（智能体开始执行）
3. memory.read（读取记忆）
4. retrieval.completed（检索完成）
5. prompt.rendered（提示词渲染完成）
6. tool.called（工具开始调用）
7. tool.completed（工具调用完成）
8. model.called（模型开始调用）
9. model.completed（模型调用完成）
10. agent.completed（智能体执行完成）
11. evaluation.completed（评估完成）
12. memory.write（写入记忆）
13. runtime.completed（运行时完成）
```

### 第一步：继承 Day64 的 RuntimeContext（运行时上下文）

Day65 继续使用 Day64 的：

- RuntimeContextBuilder（运行时上下文构建器）。
- Auth Middleware（认证中间件）。
- Trace Middleware（链路追踪中间件）。
- Memory Middleware（记忆中间件）。

所以 Day65 并没有替换 Day64，而是建立在 Day64 之上。

### 第二步：创建 EventBus（事件总线）和订阅者

系统为当前请求创建：

```text
MemoryEventBus（内存事件总线）
TraceSubscriber（链路追踪订阅者）
UsageSubscriber（用量订阅者）
EvaluationSubscriber（评估订阅者）
```

### 第三步：连接订阅者

订阅者通过 `connect()` 注册自己关心的事件。

此时，事件发布和事件响应关系已经建立。

### 第四步：执行 Agent Runtime（智能体运行时）和 Tool Runtime（工具运行时）

Agent Runtime（智能体运行时）会发布：

```text
agent.started
memory.read
retrieval.completed
prompt.rendered
model.called
model.completed
agent.completed
```

Tool Runtime（工具运行时）会发布：

```text
tool.called
tool.completed
```

### 第五步：订阅者自动响应

当 `model.completed` 发布时：

```text
TraceSubscriber 记录时间线
UsageSubscriber 统计 Token、Cost 和 Latency
```

当 `agent.completed` 发布时：

```text
TraceSubscriber 记录时间线
EvaluationSubscriber 创建评估任务
EvaluationSubscriber 发布 evaluation.completed
```

### 第六步：生成统一事件快照

最终返回：

```text
context（统一运行时上下文）
events（事件历史）
traceTimeline（链路追踪时间线）
usage（用量统计）
evaluations（评估任务）
consistent（上下文一致性结果）
generatedAt（生成时间）
```

`consistent` 用于验证：

```text
所有事件的 Trace ID 是否相同
所有事件的 Runtime Context ID 是否相同
```

---

## 七、Event Factory（事件工厂）

核心文件：`lib/events/event-factory.ts`。

所有事件都通过 `createRuntimeEvent()` 统一创建。

它负责：

- 自动生成 Event ID（事件标识）。
- 自动写入 Timestamp（时间戳）。
- 自动关联 Trace ID（链路追踪标识）。
- 自动关联 Runtime Context ID（运行时上下文标识）。
- 自动写入 Source（来源）。
- 自动写入 Status（状态）。
- 自动写入 Version（版本）。

这里运用了 Factory Function（工厂函数）思想。

业务模块不需要反复手动填写：

```text
traceId
runtimeContextId
timestamp
version
```

同时可以避免不同模块创建出结构不一致的事件。

---

## 八、Event Explorer（事件浏览器）

核心文件：

```text
app/components/EventExplorer.tsx
app/api/runtime/events/route.ts
```

前端通过：

```text
GET /api/runtime/events
```

触发一次完整事件链路。

也可以通过：

```text
POST /api/runtime/events
```

传入固定的 Request ID（请求标识）、Trace ID（链路追踪标识）和 Session ID（会话标识），方便测试和问题复现。

Event Explorer（事件浏览器）展示：

- Event Type（事件类型）。
- Source（事件来源）。
- Timestamp（时间戳）。
- Trace ID（链路追踪标识）。
- Runtime Context ID（运行时上下文标识）。
- Payload Summary（事件载荷摘要）。
- Delivery Status（投递状态）。
- Handler Count（处理器数量）。

支持按照以下类别过滤：

```text
全部
Agent（智能体事件）
Tool（工具事件）
Model（模型事件）
Error（错误事件）
```

页面还展示四个核心指标：

- 事件数量。
- Trace（链路追踪）条目数量。
- Token（令牌）用量。
- 自动评估数量。

右侧控制台默认打开“事件”标签，但 Day64 的“上下文”标签仍然保留。

---

## 九、Day64 与 Day65 的核心区别

| 对比项 | Day64 | Day65 |
| --- | --- | --- |
| 核心主题 | Unified Runtime Context（统一运行时上下文） | Unified Event System（统一事件系统） |
| 解决的问题 | 模块共享什么信息 | 模块如何通知变化 |
| 核心对象 | `RuntimeContextV2` | `RuntimeEvent` |
| 核心机制 | Context Middleware（上下文中间件） | Publish/Subscribe（发布订阅） |
| 模块关系 | 所有模块读取同一个 Context（上下文） | 模块发布 Event（事件），Subscriber（订阅者）自动响应 |
| Trace（链路追踪） | 主链路直接生成记录 | 监听全部事件生成时间线 |
| Usage（用量） | 主链路直接写入用量 | 监听 `model.completed` 自动统计 |
| Evaluation（评估） | 主链路直接写入评估结果 | 监听 `agent.completed` 自动创建任务 |
| 可观测页面 | Runtime Context Explorer（运行时上下文浏览器） | Event Explorer（事件浏览器） |
| 扩展方式 | 修改上下文或者主链路 | 增加新的 Subscriber（订阅者） |
| 主要数据 | 当前状态 | 历史变化 |

Day64 的演示链路会直接写入：

```text
context.evaluationContext
context.usageContext
```

也就是说，主运行链路主动知道 Evaluation（评估）和 Usage（用量）的存在。

Day65 则改为：

```text
model.completed
  -> UsageSubscriber

agent.completed
  -> EvaluationSubscriber
```

主业务流程主要负责发布事实，统计和评估由订阅者完成。

---

## 十、为什么要这样改进

### 1. 降低 Coupling（耦合）

以前可能是：

```text
Agent（智能体）
  -> Trace（链路追踪）
  -> Usage（用量统计）
  -> Evaluation（评估）
```

Agent（智能体）必须知道三个模块的存在。

现在变成：

```text
Agent（智能体）
  -> EventBus（事件总线）
```

Agent（智能体）只描述“发生了什么”，不关心有多少订阅者。

这实现了 Loose Coupling（松耦合）。

### 2. 提高 Extensibility（可扩展性）

如果以后增加 MetricsSubscriber（指标订阅者），原则上只需要订阅相关事件：

```text
agent.completed
  -> MetricsSubscriber
```

还可以继续添加：

- AnalyticsSubscriber（分析订阅者）。
- AuditSubscriber（审计订阅者）。
- NotificationSubscriber（通知订阅者）。
- MemorySubscriber（记忆订阅者）。

这些新增模块不应该要求修改 Agent（智能体）的核心业务逻辑。

这体现了 Open-Closed Principle（开闭原则）：

```text
对扩展开放，
对修改关闭。
```

### 3. 提高 Observability（可观测性）

每一条事件都记录：

```text
什么时候发生
由谁发布
属于哪个请求
属于哪条 Trace
有多少处理器
处理成功还是失败
```

出现问题时，不再只能看到最终结果，而是可以查看完整变化过程。

### 4. 一个事件可以被多个模块消费

例如：

```text
model.completed
  ├─ TraceSubscriber
  ├─ UsageSubscriber
  ├─ MetricsSubscriber
  └─ AnalyticsSubscriber
```

同一件事情不需要由业务模块重复通知多次。

这就是 Publish/Subscribe Pattern（发布订阅模式）的核心优势。

### 5. 提高安全性

事件没有复制完整 RuntimeContext（运行时上下文），而是主要保存：

```text
traceId
runtimeContextId
```

Model Event（模型事件）也不会复制：

```text
API Key（接口密钥）
Password（密码）
Token（令牌）
secretRef（密钥引用）
```

测试代码还会验证事件历史不包含 `XIAOMI_MIMO_API_KEY` 和 `apiKey` 字段。

### 6. 为分布式事件系统做准备

当前使用 MemoryEventBus（内存事件总线），但业务代码依赖的是 `EventBus` 接口。

未来可以逐步替换为真正的 Message Broker（消息代理系统），为 Distributed Event System（分布式事件系统）打下接口基础。

---

## 十一、项目运用的主要知识

1. Event-Driven Architecture（事件驱动架构）。
2. Publish/Subscribe Pattern（发布订阅模式）。
3. Observer Pattern（观察者模式）。
4. Dependency Inversion（依赖倒置）。
5. Separation of Concerns（职责分离）。
6. Factory Function（工厂函数）。
7. TypeScript Literal Union（TypeScript 字面量联合类型）。
8. Asynchronous Event Dispatch（异步事件分发）。
9. Error Isolation（错误隔离）。
10. AggregateError（聚合错误）。
11. Bounded History（有限历史）。
12. Distributed Tracing（分布式链路追踪）。
13. Correlation ID（关联标识）。
14. Event-Driven Observability（事件驱动可观测性）。
15. Integration Testing（集成测试）。
16. Next.js Route Handler（Next.js 路由处理器）。
17. React Client Component（React 客户端组件）。

---

## 十二、当前实现需要正确理解的边界

Day65 当前是一套完整可运行的 Unified Event System Demo（统一事件系统演示链路），但还不是完整的生产级事件平台。

主要边界包括：

- `MemoryEventBus` 只存在于当前 Node.js（服务器运行进程）内。
- 服务重启后事件会丢失。
- 不支持多个服务实例共享事件。
- 没有 Retry（重试）机制。
- 没有 Dead Letter Queue（死信队列）。
- 没有消息确认和持久化机制。
- 当前不支持事件回放。
- 每次事件 API 请求都会创建独立的 `MemoryEventBus`。
- 历史 Agent、Tool 和 Workflow 模块还没有全部重构为只依赖 `EventBus`。
- `executeEventDrivenAgentRuntime` 仍会直接调用工具执行函数，但 Trace、Usage、Evaluation 等 Side Effect（副作用）已经事件化。

因此，当前实现不是 Event Sourcing（事件溯源）。

Event Sourcing（事件溯源）要求事件成为可持久化的事实来源，并且可以通过事件重建系统状态；当前项目只保存有限内存历史，主要用于教学、测试和观察。

---

## 十三、对 Day65 的最终理解

Day64 和 Day65 合起来构成：

```text
RuntimeContext（运行时上下文）
  -> 记录“系统当前是什么状态”

RuntimeEvent（运行时事件）
  -> 记录“系统刚刚发生了什么”

EventBus（事件总线）
  -> 把变化通知给相关模块
```

Day65 最关键的改进不是“多记录了一些日志”，而是把系统的协作方式从：

```text
业务模块直接调用其他模块
```

升级为：

```text
业务模块发布事实
订阅模块自行响应
```

这为后续增加 Registry（注册中心）、Metrics（指标）、Monitoring（监控）和真正的分布式事件基础设施打下了结构基础。

---

## 十四、使用生活中的例子理解 Day65

### 我的提问

能不能举个生活中的例子，说明一下 Day65 该设计的主要好处，以及为什么这样设计？

### 回答整理

可以把 Day65 想象成一家“使用广播系统协作的餐厅”。

### 1. Day64：一张统一订单

顾客点餐后，餐厅生成一张订单：

```text
订单号：A1024
桌号：8号桌
顾客：张先生
菜品：牛排、沙拉
备注：不要辣
```

这张订单就相当于 RuntimeContext（运行时上下文）。

它解决的问题是：

```text
服务员、厨房、收银台看到的是不是同一张订单？
```

对应到项目中：

```text
订单号       -> Request ID（请求标识）
顾客         -> User ID（用户标识）
桌号         -> Session ID（会话标识）
流水追踪号   -> Trace ID（链路追踪标识）
菜品和备注   -> Memory、Prompt、Model 等运行时上下文
```

Day64 保证所有模块共享相同的任务背景。

但是只有订单还不够，因为其他人不知道订单什么时候发生了变化。

### 2. Day65：餐厅事件广播系统

Day65 相当于餐厅增加了一个 EventBus（事件总线）。

服务员、厨房、收银台和库存系统都连接到这个广播系统。

顾客下单后，服务员只发布：

```text
order.created（订单已创建）
```

厨房收到后开始做菜，并发布：

```text
cooking.started（烹饪已开始）
```

菜做好后，厨房发布：

```text
cooking.completed（烹饪已完成）
```

不同部门根据自己关心的事件自动行动：

```text
cooking.completed
  ├─ 服务员：收到通知，准备上菜
  ├─ 库存系统：扣减食材
  ├─ 收银系统：更新账单
  ├─ 监控系统：记录做菜耗时
  └─ 评价系统：准备生成服务评价
```

厨房不需要依次联系：

```text
厨房 -> 服务员
厨房 -> 库存管理员
厨房 -> 收银员
厨房 -> 经理
厨房 -> 数据分析人员
```

厨房只需要广播：

```text
“订单 A1024 的菜已经做好了。”
```

至于谁需要处理，由 Subscriber（订阅者）自己决定。

### 3. 餐厅概念与 Day65 项目的对应关系

| 餐厅 | Day65 项目 |
| --- | --- |
| 订单 | RuntimeContext（运行时上下文） |
| 订单号 | Request ID（请求标识） |
| 餐厅流水号 | Trace ID（链路追踪标识） |
| 广播系统 | EventBus（事件总线） |
| 广播消息 | RuntimeEvent（运行时事件） |
| 服务员、收银员、库存管理员 | Subscriber（订阅者） |
| 厨房宣布菜做好 | `tool.completed`（工具调用完成） |
| 模型宣布回答完成 | `model.completed`（模型调用完成） |
| 智能体宣布任务完成 | `agent.completed`（智能体执行完成） |
| 餐厅监控记录 | TraceSubscriber（链路追踪订阅者） |
| 收银统计 | UsageSubscriber（用量订阅者） |
| 顾客满意度评价 | EvaluationSubscriber（评估订阅者） |

例如，模型调用完成后发布：

```text
model.completed（模型调用完成）
```

不同订阅者自动响应：

```text
model.completed
  ├─ TraceSubscriber：记录模型什么时候完成
  └─ UsageSubscriber：统计 Token、Cost 和 Latency
```

Agent（智能体）完成后发布：

```text
agent.completed（智能体执行完成）
```

系统自动执行：

```text
agent.completed
  ├─ TraceSubscriber：写入链路时间线
  └─ EvaluationSubscriber：创建评估任务
      └─ 发布 evaluation.completed
```

---

## 十五、餐厅例子体现出的主要好处

### 1. 降低 Coupling（耦合）

没有事件系统时，厨房可能需要知道：

- 服务员的联系方式。
- 库存系统的接口。
- 收银系统的接口。
- 监控系统的接口。
- 评价系统的接口。

对应到旧代码，Agent Runtime（智能体运行时）可能需要主动调用：

```text
Trace Manager（链路追踪管理器）
Usage Manager（用量管理器）
Evaluation Manager（评估管理器）
Metrics Manager（指标管理器）
```

增加一个模块，就需要修改 Agent（智能体）。

使用 EventBus（事件总线）以后，Agent（智能体）只需要发布：

```text
agent.completed（智能体执行完成）
```

Agent（智能体）只描述“发生了什么”，不关心谁来处理。

这就是 Loose Coupling（松耦合）。

### 2. 新增功能时不容易破坏旧代码

假设餐厅以后增加一个大屏幕，用来显示当前正在制作的订单。

没有广播系统时，需要修改厨房代码，让厨房主动通知大屏幕。

有广播系统后，只需要增加一个新的 Subscriber（订阅者）：

```text
cooking.started
  -> 大屏幕订阅者
```

厨房代码不需要修改。

对应 Day65，如果以后增加：

- MetricsSubscriber（指标订阅者）。
- AuditSubscriber（审计订阅者）。
- NotificationSubscriber（通知订阅者）。
- AnalyticsSubscriber（分析订阅者）。

只需要订阅已有事件即可，不需要修改 Agent（智能体）的核心业务流程。

### 3. 更容易知道完整过程

如果顾客问：

```text
我的菜为什么等了二十分钟？
```

只看最终订单状态：

```text
订单状态：已完成
```

很难找到原因。

如果有完整事件时间线：

```text
18:00:00 order.created（订单已创建）
18:00:01 cooking.started（烹饪已开始）
18:00:08 ingredient.missing（食材缺失）
18:15:00 ingredient.ready（食材已准备）
18:19:00 cooking.completed（烹饪已完成）
18:20:00 order.delivered（订单已送达）
```

就能发现问题出在食材缺失，而不是服务员上菜慢。

Day65 的 Event Explorer（事件浏览器）也是这个作用。

发生故障时，可以准确判断：

- 是检索慢。
- 是工具失败。
- 是模型失败。
- 是评估失败。
- 还是事件订阅者处理失败。

这就是 Observability（可观测性）。

### 4. 一条事件可以被多个模块同时消费

厨房宣布“菜做好了”以后：

```text
服务员需要知道
收银系统需要知道
库存系统需要知道
监控系统也需要知道
```

同一件事情不应该重复发送四次。

Day65 使用：

```ts
Map<EventType, Set<EventHandler>>
```

一条事件可以分发给多个 Handler（处理器）：

```text
model.completed
  ├─ TraceSubscriber
  ├─ UsageSubscriber
  ├─ MetricsSubscriber
  └─ AnalyticsSubscriber
```

这就是 Publish/Subscribe Pattern（发布订阅模式）的核心优势。

### 5. 某个订阅者失败，不一定影响其他订阅者

假设厨房广播“菜做好了”：

- 服务员成功收到。
- 收银系统成功收到。
- 数据分析系统临时故障。

不能因为数据分析系统故障，就让服务员不上菜。

Day65 的 MemoryEventBus（内存事件总线）会分别调用每个 Handler（处理器），一个 Handler（处理器）失败后，其他 Handler（处理器）仍然有机会继续处理。

最后再通过 AggregateError（聚合错误）统一报告失败。

这叫 Failure Isolation（故障隔离）。

### 6. 更容易替换基础设施

现在这家“餐厅”规模较小，所以使用 MemoryEventBus（内存事件总线）。

它相当于店内广播喇叭：

```text
只在当前餐厅有效
关闭电源后记录消失
```

以后餐厅发展成全国连锁店，可以把广播系统替换为：

- Redis Streams（Redis 流）。
- Kafka（分布式事件流平台）。
- RabbitMQ（消息队列系统）。
- NATS（轻量消息系统）。

因为业务模块依赖的是 `EventBus` 接口，而不是强依赖 `MemoryEventBus`，所以将来替换基础设施时，Agent、Tool 和 Model 的发布逻辑可以尽量保持不变。

---

## 十六、为什么 Day64 之后需要 Day65

只有 Day64，就像餐厅只有订单：

```text
大家知道订单内容，
但不知道订单什么时候发生了变化。
```

只有 Day65，没有 Day64，就像只有广播：

```text
听到“菜做好了”，
但不知道是哪一桌、哪个顾客、哪张订单。
```

所以两者必须结合：

```text
RuntimeContext（运行时上下文）
  -> 告诉系统“这件事属于谁、属于哪个请求”

RuntimeEvent（运行时事件）
  -> 告诉系统“刚刚发生了什么”

EventBus（事件总线）
  -> 告诉系统“应该把变化通知给谁”
```

最终形成：

```text
订单提供背景
事件记录变化
事件总线负责通知
订阅者负责响应
```

Day65 最主要的价值，就是把系统从：

```text
一个模块主动联系所有其他模块
```

升级为：

```text
模块只发布事实
感兴趣的模块自行订阅
```

这样系统更容易扩展、更容易排查问题，也更适合以后升级为分布式架构。

---

## 十七、第65天打卡

【第65天打卡】

1. 是否定义 RuntimeEvent（运行时事件）：是

2. 是否定义 EventType（事件类型）：是

3. 是否实现 EventBus（事件总线）接口：是

4. 是否实现 MemoryEventBus（内存事件总线）：是

5. Agent Runtime（智能体运行时）是否发布事件：是

6. Tool Runtime（工具运行时）是否发布事件：是

7. Trace（链路追踪）是否改为事件监听：是

8. Usage（用量统计）是否改为事件监听：是

9. Evaluation（评估）是否支持事件触发：是

10. 是否实现 Event Explorer（事件浏览器）：是

11. 遇到的最大问题：

在保留 Day64 Unified Runtime Context（统一运行时上下文）和历史业务兼容性的前提下，把 Trace（链路追踪）、Usage（用量统计）和 Evaluation（评估）从主业务链路中解耦出来，同时保证嵌套事件的发布时间顺序、多个 Subscriber（订阅者）的异常隔离、有限事件历史以及敏感信息不进入 Event Payload（事件载荷）。当前实现通过先写事件历史再调用处理器、使用 AggregateError（聚合错误）、限制 History（历史记录）容量，并让事件只携带 `traceId` 与 `runtimeContextId` 等关联信息解决这些问题。

12. 当前系统能力：

当前系统已经具备 RuntimeContext（运行时上下文）与 RuntimeEvent（运行时事件）结合的基础运行协议。系统能够通过 EventBus（事件总线）发布和订阅运行时事件；Agent Runtime（智能体运行时）、Tool Runtime（工具运行时）与 Model Runtime（模型运行时）能够发布开始和完成事件；TraceSubscriber（链路追踪订阅者）能够自动生成完整事件时间线；UsageSubscriber（用量订阅者）能够根据 `model.completed` 自动统计 Token（令牌）、Cost（成本）与 Latency（延迟）；EvaluationSubscriber（评估订阅者）能够根据 `agent.completed` 自动创建评估任务并发布 `evaluation.completed`；Event Explorer（事件浏览器）能够展示事件来源、时间、状态、上下文关联和载荷摘要，并支持 Agent、Tool、Model、Error 分类过滤。当前 MemoryEventBus（内存事件总线）适合单进程教学和本地演示，后续可以继续升级为 Redis Streams、Kafka、RabbitMQ 或 NATS 等持久化、分布式 Message Broker（消息代理系统）。

---

## 十八、第65天核心认知

Day65 最重要的一句话是：

```text
Context（上下文）解决“大家知道的是不是同一件事”，
Event（事件）解决“大家是否知道这件事发生了变化”。
```

Day64 提供 Unified State（统一状态），Day65 提供 Unified Communication（统一通信）。

两者结合后，系统同时具备：

```text
State-Driven（状态驱动）
       +
Event-Driven（事件驱动）
```

这为后续构建更加完整的 Agent Platform（智能体平台）和 Agent Operating System（智能体操作系统）提供了基础运行协议。

---

## 十九、第65天阶段总结

首先，恭喜完成 Day65。

现在已经进入 Production Upgrade（生产化升级）阶段的核心部分。

Day64 和 Day65 是两个非常关键的架构变化：

```text
Day64：解决“所有模块共享同一个上下文”
Day65：解决“所有模块通过统一事件通信”
```

到这里，系统已经开始从“多个相对独立的功能模块”进化为一个 Agent Operating System（智能体操作系统）。

### 1. Day65 完成的主题

Day65 完成的是：

```text
Production Upgrade V2（生产化升级第2版）
Unified Event System（统一事件系统）
```

整个系统的通信方式已经发生升级。

以前可能采用直接调用：

```text
Agent Runtime（智能体运行时）
        |
        ├─> TraceManager（链路追踪管理器）
        ├─> UsageManager（用量管理器）
        └─> EvaluationManager（评估管理器）
```

这种方式的特点是：

- Coupling（耦合）较强。
- 模块之间互相知道对方的存在。
- 新增或者修改模块时，主业务代码也可能需要修改。
- 系统规模扩大后，维护成本会越来越高。

现在升级为：

```text
Agent Runtime（智能体运行时）
Tool Runtime（工具运行时）
Model Runtime（模型运行时）
Workflow Runtime（工作流运行时）
                 |
                 | publish（发布事件）
                 v
EventBus（事件总线）
                 |
                 ├─> Trace Subscriber（链路追踪订阅者）
                 ├─> Usage Subscriber（用量订阅者）
                 ├─> Evaluation Subscriber（评估订阅者）
                 ├─> Memory Subscriber（记忆订阅者）
                 └─> Analytics Subscriber（分析订阅者）
```

### 2. Day65 最大升级点

以前，Agent（智能体）完成任务后可能需要主动执行：

```text
trace.log()（记录链路追踪）
usage.record()（记录用量）
evaluation.start()（启动评估）
```

这意味着 Agent（智能体）知道了太多外围模块和基础设施细节。

现在，Agent（智能体）只需要发布：

```ts
eventBus.publish("agent.completed");
```

剩下的工作由监听该事件的 Subscriber（订阅者）处理。

这就是 Event-Driven Architecture（事件驱动架构）：

```text
业务模块负责声明“发生了什么”，
订阅模块负责决定“收到以后做什么”。
```

类似思想被大量应用于：

- Kubernetes（容器编排平台）的控制器和资源事件机制。
- Kafka（分布式事件流平台）的事件生产与消费机制。
- AWS EventBridge（亚马逊云事件总线服务）的事件路由机制。
- Microservices Architecture（微服务架构）中的跨服务解耦通信。

需要注意：这些平台的具体实现复杂度远高于当前项目，但 Day65 学习的是它们共同采用的核心架构思想。

### 3. 当前整体进度

#### Phase 1：Agent Runtime（第一阶段：智能体运行时）

```text
Agent Runtime    ██████████████████████████ 100%
```

#### Phase 2：Infrastructure（第二阶段：基础设施）

```text
Redis（共享状态与缓存）       ██████████
Queue（任务队列）             ██████████
Lock（分布式锁）              ██████████
Storage（对象存储）           ██████████
Config（配置中心）            ██████████
Secrets（密钥管理）           ██████████
```

#### Phase 3：Production Upgrade（第三阶段：生产化升级）

```text
Runtime Context（运行时上下文）  ██████████
Event System（事件系统）          ██████████
Registry（注册中心）              ░░░░░░░░░░
Prompt Platform（提示词平台）     ░░░░░░░░░░
Memory Upgrade（记忆系统升级）    ░░░░░░░░░░
RAG Upgrade（检索增强生成升级）   ░░░░░░░░░░
```

当前完成度按该学习路线估算为：

```text
99%
```

这个百分比表示当前学习计划已经进入最后的平台化冲刺阶段，不代表系统已经达到所有真实生产环境的可靠性、安全性和运维标准。

---

## 二十、Day66 学习计划：Unified Registry（统一注册中心）

Day66 的主题是：

```text
Production Upgrade V3（生产化升级第3版）
Unified Registry（统一注册中心）
```

### 今日核心目标

把系统里的所有 Pluggable Capability（可插拔能力）统一注册和管理。

Day66 要解决的问题是：

```text
系统当前拥有哪些能力？
这些能力在哪里？
哪些能力处于启用状态？
运行时应该如何发现需要的能力？
```

### 为什么需要 Registry（注册中心）

当前系统已经有很多相对独立的 Registry（注册表）或者 Provider（提供者）：

- ToolRegistry（工具注册表）。
- AgentRegistry（智能体注册表）。
- ModelRegistry（模型注册表）。
- PromptRegistry（提示词注册表）。
- MemoryStore（记忆存储）。
- StorageProvider（存储提供者）。

这些模块目前各自管理自己的能力。

但是在生产系统中，希望所有能力都可以通过统一入口进行 Capability Discovery（能力发现）。

例如：

- Supervisor（监督智能体）想知道当前有哪些 Agent（智能体）。
- Model Router（模型路由器）想知道当前有哪些 Model（模型）。
- Prompt Runtime（提示词运行时）想知道当前有哪些 Prompt（提示词）。
- Tool Planner（工具规划器）想知道当前有哪些 Tool（工具）。

目前每个模块需要访问不同的注册表。

Day66 希望升级为：

```text
UnifiedRegistry（统一注册中心）
        |
        ├─ Agent（智能体）
        ├─ Tool（工具）
        ├─ Model（模型）
        ├─ Prompt（提示词）
        ├─ Memory（记忆能力）
        ├─ Workflow（工作流）
        ├─ Evaluation（评估能力）
        └─ Capability（其他系统能力）
```

### Day66 最终效果

以前：

```text
AgentRegistry（智能体注册表）
ToolRegistry（工具注册表）
ModelRegistry（模型注册表）
PromptRegistry（提示词注册表）
```

多个注册表之间相互独立，形成 Registry Silo（注册信息孤岛）。

以后：

```text
UnifiedRegistry（统一注册中心）
        |
        ├─────────┬─────────┐
        |         |         |
      Agent      Tool      Model
      Prompt    Memory   Workflow
      Evaluation（评估） Capability（能力）
```

统一注册中心并不一定要求立刻删除所有旧 Registry（注册表），而是让旧注册表逐步接入统一协议，同时保留 Compatibility（兼容性）。

---

## 二十一、Day66 任务清单

### 任务 1：定义 RegistryItem（注册项）

新增统一注册项结构：

```ts
type RegistryItem = {
  id: string;
  name: string;
  type:
    | "agent"
    | "tool"
    | "model"
    | "prompt"
    | "memory"
    | "workflow"
    | "evaluation";
  version: string;
  metadata: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
};
```

字段含义：

- `id`：Registry Item ID（注册项标识），用于唯一定位一项能力。
- `name`：Name（名称），用于展示和搜索能力。
- `type`：Registry Type（注册类型），用于区分智能体、工具、模型等能力。
- `version`：Version（版本），用于支持同一能力的版本管理。
- `metadata`：Metadata（元数据），用于保存描述、标签和能力特征。
- `enabled`：Enabled Status（启用状态），用于控制能力是否可以被发现和使用。
- `createdAt`：Creation Timestamp（创建时间戳），用于审计、排序和观察。

### 任务 2：定义 RegistryProvider（注册提供者）

新增统一注册协议：

```ts
interface RegistryProvider {
  register(item: RegistryItem): void | Promise<void>;
  unregister(id: string): void | Promise<void>;
  get(id: string): RegistryItem | undefined | Promise<RegistryItem | undefined>;
  list(type?: RegistryItem["type"]): RegistryItem[] | Promise<RegistryItem[]>;
  search(query: string): RegistryItem[] | Promise<RegistryItem[]>;
}
```

各方法职责：

- `register`：Register Capability（注册能力）。
- `unregister`：Unregister Capability（注销能力）。
- `get`：Get Registry Item（读取单个注册项）。
- `list`：List Registry Items（列出注册项）。
- `search`：Search Registry Items（搜索注册项）。

RegistryProvider（注册提供者）只定义协议，不绑定具体存储方式。

### 任务 3：实现 UnifiedRegistry（统一注册中心）

新增：

```text
UnifiedRegistry（统一注册中心）
```

它负责统一管理所有 Runtime Capability（运行时能力）。

注册示例：

```ts
registry.register({
  id: "agent-research-v1",
  type: "agent",
  name: "research-agent",
  version: "1.0.0",
  metadata: {
    capabilities: ["research", "retrieval"],
  },
  enabled: true,
  createdAt: Date.now(),
});
```

UnifiedRegistry（统一注册中心）需要负责：

- 注册能力。
- 注销能力。
- 按标识读取能力。
- 按类型列出能力。
- 搜索能力。
- 过滤禁用能力。
- 处理重复标识或者版本冲突。

### 任务 4：迁移 AgentRegistry（智能体注册表）

以前由 AgentRegistry（智能体注册表）单独管理智能体。

Day66 需要让 AgentRegistry 接入 UnifiedRegistry（统一注册中心），同时保持现有调用方兼容。

推荐关系：

```text
旧 AgentRegistry API（智能体注册表接口）
        ↓ Adapter（适配器）
UnifiedRegistry（统一注册中心）
```

这里可以运用 Adapter Pattern（适配器模式），避免一次性修改所有历史业务代码。

### 任务 5：迁移 ToolRegistry（工具注册表）

把已有工具统一注册进 UnifiedRegistry（统一注册中心），例如：

- `search`：搜索工具。
- `weather`：天气工具。
- `summary`：摘要工具。
- `critic`：批评与质量检查工具。

工具注册项的 Metadata（元数据）可以包含：

- Description（描述）。
- Input Schema（输入结构）。
- Output Schema（输出结构）。
- Tags（标签）。
- Timeout（超时时间）。
- Retry Policy（重试策略）。

### 任务 6：迁移 ModelRegistry（模型注册表）

把已有模型统一注册管理，例如：

- Qwen（通义千问模型系列）。
- DeepSeek（深度求索模型系列）。
- MiMo（小米大模型系列）。

模型 Metadata（元数据）可以包含：

- Provider（模型提供方）。
- Context Window（上下文窗口）。
- Capability（能力标签）。
- Cost（成本信息）。
- Latency（延迟信息）。
- Health Status（健康状态）。

### 任务 7：迁移 PromptRegistry（提示词注册表）

把提示词版本统一注册，例如：

```text
writer.v1（写作提示词第1版）
writer.v2（写作提示词第2版）
research.v1（研究提示词第1版）
```

统一注册后，可以通过 Registry（注册中心）查询：

- 当前有哪些提示词。
- 每个提示词有哪些版本。
- 哪些版本处于启用状态。
- 哪些 Agent（智能体）或者 Workflow（工作流）依赖某个提示词。

### 任务 8：实现 Capability Discovery（能力发现）

新增统一能力搜索函数：

```text
discoverCapability（发现能力）
```

例如查询：

```text
需要 research capability（研究能力）
```

可能返回：

```text
Research Agent（研究智能体）
Search Tool（搜索工具）
Knowledge Retriever（知识检索器）
```

能力发现不应该只搜索 `name`，还可以综合搜索：

- Type（类型）。
- Tags（标签）。
- Description（描述）。
- Metadata Capability（元数据中的能力声明）。
- Version（版本）。
- Enabled Status（启用状态）。

### 任务 9：实现 Registry Explorer（注册浏览器）

前端新增 Registry Explorer（注册浏览器），用于展示：

- Type（类型）。
- Name（名称）。
- Version（版本）。
- Status（状态）。
- Metadata（元数据）。

支持按照以下类别过滤：

- Agent（智能体）。
- Tool（工具）。
- Model（模型）。

还可以继续扩展：

- Prompt（提示词）。
- Memory（记忆能力）。
- Workflow（工作流）。
- Evaluation（评估能力）。

### 任务 10：增加 RegistryMetrics（注册指标）

新增注册中心指标结构：

```ts
type RegistryMetrics = {
  totalItems: number;
  agentCount: number;
  toolCount: number;
  modelCount: number;
  promptCount: number;
  enabledCount: number;
  versionCount: number;
};
```

各指标含义：

- `totalItems`：注册项总数量。
- `agentCount`：智能体数量。
- `toolCount`：工具数量。
- `modelCount`：模型数量。
- `promptCount`：提示词数量。
- `enabledCount`：当前启用的能力数量。
- `versionCount`：系统中不同版本的数量。

Registry Metrics（注册指标）可以帮助观察：

- 当前系统能力规模。
- 各类型能力占比。
- 禁用能力数量。
- 版本复杂度。
- Registry Growth（注册中心增长趋势）。

---

## 二十二、Day66 验收标准

1. 是否定义 RegistryItem（注册项）。

2. 是否定义 RegistryProvider（注册提供者）。

3. 是否实现 UnifiedRegistry（统一注册中心）。

4. AgentRegistry（智能体注册表）是否迁移。

5. ToolRegistry（工具注册表）是否迁移。

6. ModelRegistry（模型注册表）是否迁移。

7. PromptRegistry（提示词注册表）是否迁移。

8. 是否实现 Capability Discovery（能力发现）。

9. 是否实现 Registry Explorer（注册浏览器）。

10. 是否增加 Registry Metrics（注册指标）。

---

## 二十三、Day66 打卡模板

【第66天打卡】

1. 是否定义 RegistryItem（注册项）：是 / 否

2. 是否定义 RegistryProvider（注册提供者）：是 / 否

3. 是否实现 UnifiedRegistry（统一注册中心）：是 / 否

4. AgentRegistry（智能体注册表）是否迁移：是 / 否

5. ToolRegistry（工具注册表）是否迁移：是 / 否

6. ModelRegistry（模型注册表）是否迁移：是 / 否

7. PromptRegistry（提示词注册表）是否迁移：是 / 否

8. 是否实现 Capability Discovery（能力发现）：是 / 否

9. 是否实现 Registry Explorer（注册浏览器）：是 / 否

10. 是否增加 Registry Metrics（注册指标）：是 / 否

11. 遇到的最大问题：


12. 当前系统能力：


---

## 二十四、Day66 核心认知

Day66 最重要的一句话是：

```text
Registry（注册中心）解决“系统有什么能力”，
Event（事件）解决“系统发生了什么事情”。
```

三天的升级关系为：

```text
Day64：统一 Context（上下文）
Day65：统一 Communication（通信）
Day66：统一 Capability Discovery（能力发现）
```

三者组合后，Agent Platform（智能体平台）开始具备：

```text
State Unification（状态统一）
       +
Event Unification（事件统一）
       +
Capability Unification（能力统一）
```

这已经非常接近真正的 Agent Operating System Architecture（智能体操作系统架构）。

具体关系可以理解为：

```text
RuntimeContext（运行时上下文）
  -> 保存当前请求的状态和身份

RuntimeEvent（运行时事件）
  -> 描述运行过程中发生的变化

UnifiedRegistry（统一注册中心）
  -> 描述系统当前可以调用哪些能力
```

---

## 二十五、Day66 之后的学习路线

| Day（天数） | 内容 |
| --- | --- |
| Day64 | Unified Runtime Context（统一运行时上下文）✅ |
| Day65 | Unified Event System（统一事件系统）✅ |
| Day66 | Unified Registry（统一注册中心） |
| Day67 | Production Prompt Platform（生产级提示词平台） |
| Day68 | Production Memory Upgrade（生产级记忆系统升级） |
| Day69 | Production RAG Upgrade（生产级检索增强生成升级） |
| Day70 | Production Workflow Upgrade（生产级工作流升级） |
| Day71 | Production Evaluation Platform（生产级评估平台） |
| Day72 | Observability Platform（可观测性平台） |
| Day73 | Production Integration Test（生产级集成测试） |

完成 Day65 后，已经进入最后 8 天冲刺阶段。

接下来每一天都会进一步提高系统的 Platformization（平台化程度）：

```text
Day66 统一能力发现
Day67 统一提示词生产管理
Day68 升级记忆系统
Day69 升级检索增强生成系统
Day70 升级工作流系统
Day71 建立生产级评估平台
Day72 建立可观测性平台
Day73 完成生产级集成测试
```
