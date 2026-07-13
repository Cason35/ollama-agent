# Day64 学习总结：Unified Runtime Context（统一运行时上下文）

## 本文记录范围

本文整理 `ollama-chat-day64` 项目的学习型对话，主要包括：

- `ollama-chat-day64` 项目做了什么。
- 项目运用了哪些关键知识。
- 对比 `ollama-chat-day63` 有哪些改进。
- 为什么需要 RuntimeContext（统一运行时上下文）。
- 一套上下文贯穿整个流程时，如何避免给 Agent（智能体）或 Tool（工具）传入过多无关信息。
- 如何结合前端 State（状态）、React Context（React 上下文）和 Redux Store（Redux 状态仓库）理解统一上下文。
- 第 64 天打卡内容。

本文不记录项目代码创建、复制、修改和命令执行过程，只保留帮助理解系统设计与运行方式的问答内容。

---

## 一、读懂 `ollama-chat-day64` 项目

### 我的提问

带我来读懂 `ollama-chat-day64` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day63` 有什么改进，为什么这样子做，并且一些英文专业术语后面补充一个括号，补充其中文名称或者中文描述。

### 回答整理

#### 1. 一句话理解 Day64

`ollama-chat-day64` 在 Day63 的完整智能体平台基础上，新增了：

```text
Unified Runtime Context（统一运行时上下文）
```

Day63 重点解决：

```text
系统如何安全保存和使用 API Key（接口密钥）、Password（密码）和 Token（令牌）
```

Day64 重点解决：

```text
Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Prompt（提示词）、
Model（模型）、Evaluation（评估）和 Trace（链路追踪）
如何共享同一次请求的用户、会话、任务与追踪信息
```

可以简单理解为：

```text
Day63：保护系统使用的敏感凭证
Day64：统一系统各模块使用的执行背景
```

#### 2. 为什么需要统一运行时上下文

项目中已经有很多相对独立的运行模块：

- Agent Runtime（智能体运行时）。
- Tool Runtime（工具运行时）。
- RAG Runtime（检索增强生成运行时）。
- Prompt Runtime（提示词运行时）。
- Model Runtime（模型运行时）。
- Memory Runtime（记忆运行时）。
- Evaluation Runtime（评估运行时）。
- Trace Runtime（链路追踪运行时）。

以前，每个模块可能维护自己的 Context（上下文），例如：

- AgentContext（智能体上下文）。
- ToolExecutionContext（工具执行上下文）。
- PromptOptimizationContext（提示词优化上下文）。
- ModelRuntime（模型运行时配置）。
- Memory（记忆）。
- Trace（链路追踪）。

这种分散结构容易产生以下问题。

##### 标识不统一

Agent（智能体）可能记录一个 `requestId`，Tool（工具）又生成另一个 `requestId`。最终排查问题时，很难确认某次模型调用是否来自某次 Agent（智能体）执行，以及是否使用了对应的 RAG（检索增强生成）结果。

##### 信息重复传递

每次调用新模块时，都可能需要手动传递：

```text
userId
sessionId
traceId
memory
workspace
usage
```

参数会越来越多，也更容易遗漏。

##### 模块之间无法关联

如果 Evaluation（评估）只拿到最终答案，却拿不到以下信息：

- Prompt Version（提示词版本）。
- Model（模型）。
- Token Usage（令牌用量）。
- Trace ID（链路追踪标识）。
- RAG Strategy（检索策略）。

那么即使评估结果很低，也难以定位问题来源。

##### 难以进行全链路观测

生产系统需要回答：

```text
某次用户请求使用了哪个 Agent（智能体）？
调用了哪些 Tool（工具）？
执行了什么检索？
使用了哪个 Prompt（提示词）？
调用了哪个 Model（模型）？
消耗了多少 Token（令牌）？
最终 Evaluation（评估）结果怎么样？
```

因此，Day64 引入 RuntimeContext V2（统一运行时上下文第二版），让所有模块共享同一份执行背景。

---

## 二、RuntimeContext V2（统一运行时上下文第二版）

核心文件：`lib/runtime/unified-runtime-context.ts`。

统一上下文包含以下主要字段：

```ts
type RuntimeContextV2 = {
  requestId: string;
  userId?: string;
  sessionId: string;

  workflowId?: string;
  agentId?: string;
  taskId?: string;

  memoryContext?: Record<string, unknown>;
  retrievalContext?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  promptContext?: Record<string, unknown>;
  modelContext?: Record<string, unknown>;

  traceId: string;
  usageContext?: Record<string, unknown>;
  evaluationContext?: Record<string, unknown>;

  metadata: Record<string, unknown>;
  createdAt: number;
};
```

这些字段可以分成五类理解。

### 1. 请求身份

#### `requestId`

Request ID（请求标识）代表一次完整请求。即使一次请求调用多个 Agent（智能体）、Tool（工具）和 Model（模型），它们仍应共享同一个 `requestId`。

#### `userId`

User ID（用户标识）用于区分请求属于哪个用户，可以支持：

- 用户数据隔离。
- 个性化记忆。
- 权限判断。
- 成本统计。
- 审计记录。

#### `sessionId`

Session ID（会话标识）用于关联多轮对话。

```text
Session（会话）
  ├─ Request 1（请求 1）
  ├─ Request 2（请求 2）
  └─ Request 3（请求 3）
```

一次会话可以包含多个请求，每个请求拥有独立的 RuntimeContext（统一运行时上下文），但可以复用相同的 `sessionId`。

### 2. 任务执行身份

#### `workflowId`

Workflow ID（工作流标识）用于关联一次工作流执行。

#### `agentId`

Agent ID（智能体标识）表示当前由哪个智能体负责处理。

#### `taskId`

Task ID（任务标识）表示本次执行的具体任务。

三者可以形成以下关系：

```text
Request（请求）
  └─ Workflow（工作流）
       └─ Task（任务）
            └─ Agent（智能体）
```

### 3. 各模块共享的业务上下文

#### `memoryContext`

Memory Context（记忆上下文）保存与当前任务有关的记忆信息。

#### `retrievalContext`

Retrieval Context（检索上下文）保存 RAG（检索增强生成）相关信息，例如 `hybrid`，即 Hybrid Retrieval（混合检索），通常表示关键词检索和向量检索结合。

#### `workspace`

Workspace（共享工作区）保存多个 Agent（智能体）或工作流步骤之间共享的数据。例如 Research Agent（研究智能体）写入研究结果，Writer Agent（写作智能体）读取结果并生成答案。

#### `promptContext`

Prompt Context（提示词上下文）保存提示词策略和版本，让 Evaluation（评估）能够知道一个答案由哪个 Prompt Version（提示词版本）生成。

#### `modelContext`

Model Context（模型上下文）保存模型选择信息，例如：

```ts
{
  provider: "mimo",
  model: "mimo-v2-flash",
  secretRef: "XIAOMI_MIMO_API_KEY"
}
```

这里有一个重要的安全设计：RuntimeContext（统一运行时上下文）只保存 Secret Reference（密钥引用），不保存真实 API Key（接口密钥）。

正确方式：

```ts
secretRef: "XIAOMI_MIMO_API_KEY"
```

不应该使用：

```ts
apiKey: "真实接口密钥"
```

需要调用模型时，再由 Day63 的 SecretsManager（密钥管理器）根据引用读取真实值。

```text
RuntimeContext（统一运行时上下文）
  └─ 保存 Secret Reference（密钥引用）
         ↓
SecretsManager（密钥管理器）
  └─ 按需读取并解密真实密钥
```

### 4. 可观测性上下文

#### `traceId`

Trace ID（链路追踪标识）用于串联整条调用链。Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Prompt（提示词）、Model（模型）和 Evaluation（评估）都应记录同一个 `traceId`。

#### `usageContext`

Usage Context（用量上下文）保存：

- `promptTokens`：输入令牌数量。
- `completionTokens`：输出令牌数量。
- `cost`：估算调用成本。

#### `evaluationContext`

Evaluation Context（评估上下文）保存完整链路的评估结果，例如：

```ts
{
  score: 1,
  status: "passed",
  promptVersion: "research.v64",
  model: "mimo-v2-flash"
}
```

评估结果因此可以关联：

```text
Evaluation Score（评估分数）
  + Prompt Version（提示词版本）
  + Model（模型）
  + Usage（用量）
  + Trace（链路追踪）
```

### 5. 扩展信息

#### `metadata`

Metadata（元数据）用于保存可安全展示的扩展信息，例如认证状态和追踪是否准备完成。

#### `createdAt`

用于保存上下文创建时间，可用于耗时计算、超时排查、请求排序和日志审计。

---

## 三、RuntimeContextBuilder（运行时上下文构建器）

核心文件：`lib/runtime/unified-runtime-context.ts`。

RuntimeContextBuilder（运行时上下文构建器）采用 Builder Pattern（构建器模式），负责统一创建复杂的上下文对象。

如果每个 API（应用程序接口）都自行生成 `requestId`、`traceId` 和 `sessionId`，容易出现：

- 某些入口忘记创建 `traceId`。
- 不同入口使用不同的 ID（标识）格式。
- 某些入口误把密钥明文放入 Model Context（模型上下文）。
- 某些入口忘记初始化 Usage Context（用量上下文）。
- 不同入口的默认值不一致。

使用构建器后，所有入口都经过同一套创建过程：

```text
所有请求入口
  -> RuntimeContextBuilder（运行时上下文构建器）
  -> 统一结构的 RuntimeContext（统一运行时上下文）
```

构建器支持两种标识处理方式：

1. 上游已经传入标识时继续复用。
2. 上游没有传入标识时自动生成。

这符合 Distributed Tracing（分布式链路追踪）的常见设计：外部网关已经有 Trace ID（链路追踪标识）时继续透传；当前应用是链路入口时再自动生成。

---

## 四、Context Middleware（上下文中间件）

核心文件：`lib/runtime/context-middleware.ts`。

Middleware（中间件）可以理解为：在真正执行 Agent（智能体）业务之前，依次补充和处理 RuntimeContext（统一运行时上下文）的函数。

当前实现包括：

### 1. Auth Context Middleware（认证上下文中间件）

它负责补齐用户身份，并记录认证状态。如果没有用户身份，可以使用 Anonymous User（匿名用户）作为默认身份。

### 2. Trace Context Middleware（链路追踪上下文中间件）

它负责标记追踪环境已经准备好。真实生产环境中还可以继续扩展：

- 解析 HTTP Header（HTTP 请求头）。
- 读取上游 Trace ID（链路追踪标识）。
- 创建 Root Span（根跨度）。
- 注入 OpenTelemetry Context（开放遥测上下文）。

### 3. Memory Context Middleware（记忆上下文中间件）

它为 Memory Context（记忆上下文）补充统一来源信息，表示记忆由统一运行时负责加载，而不是某个模块私自读取。

中间件链路为：

```text
RuntimeContextBuilder（运行时上下文构建器）
  -> Auth Middleware（认证中间件）
  -> Trace Middleware（链路追踪中间件）
  -> Memory Middleware（记忆中间件）
  -> RuntimeContext（最终统一运行时上下文）
```

这种设计实现了 Separation of Concerns（职责分离）：

- Builder（构建器）负责创建基础结构。
- Middleware（中间件）负责逐层补充信息。
- Business Runtime（业务运行时）只消费最终上下文。

---

## 五、Day64 完整链路

核心文件：`lib/runtime/unified-runtime-chain.ts`。

入口函数会模拟一个 Research Task（研究型任务），并依次让以下模块消费同一份 RuntimeContext（统一运行时上下文）：

```text
User（用户）
  -> RuntimeContext（统一运行时上下文）
  -> Agent（智能体）
  -> Tool（工具）
  -> RAG（检索增强生成）
  -> Prompt（提示词）
  -> Model（模型）
  -> Evaluation（评估）
  -> Trace（链路追踪）
```

项目会检查所有模块的 `requestId` 和 `traceId` 是否完全一致。如果一致，则：

```ts
consistent: true
```

随后写入统一的 Evaluation Context（评估上下文）和 Usage Context（用量上下文），形成可观察、可测试的完整执行快照。

需要注意：Day64 当前主要通过独立演示链路验证统一上下文设计。它尚未把 Day1 到 Day63 所有历史运行模块的函数签名全部重构成只接收 RuntimeContext V2（统一运行时上下文第二版）。这样可以降低 Regression Risk（回归风险），保留旧业务接口的兼容性。

---

## 六、Runtime Context API（运行时上下文接口）与 Explorer（浏览器面板）

### Runtime Context API（运行时上下文接口）

接口文件：`app/api/runtime/context/route.ts`。

它支持：

```text
GET /api/runtime/context
POST /api/runtime/context
```

- GET（读取请求）使用默认参数执行一次研究型任务演示。
- POST（提交请求）允许传入自定义用户、会话、请求和追踪标识。

调用方可以注入已有信息，这体现了 Dependency Injection（依赖注入）思想：调用方可以传入所需依赖，而不是内部永远强制创建新值。

### Runtime Context Explorer（运行时上下文浏览器）

组件文件：`app/components/RuntimeContextExplorer.tsx`。

面板会展示：

- Request ID（请求标识）。
- Trace ID（链路追踪标识）。
- Session ID（会话标识）。
- Agent（智能体）接入记录。
- Tool（工具）接入记录。
- RAG（检索增强生成）接入记录。
- Prompt（提示词）接入记录。
- Model（模型）接入记录。
- Evaluation（评估）接入记录。
- Trace（链路追踪）接入记录。
- 完整且不含密钥明文的 Context JSON（上下文 JSON 数据）。

如果所有模块共享相同标识，页面会显示：

```text
上下文一致性：通过
```

点击“重新测试”后，会创建新的一次请求，并产生新的 Request ID（请求标识）、Trace ID（链路追踪标识）和 Session ID（会话标识）。这可以验证：每次请求拥有独立上下文，但一次请求内部的所有模块共享同一上下文。

---

## 七、Day64 运用的关键知识

### 1. TypeScript Type System（TypeScript 类型系统）

通过 RuntimeContextV2（统一运行时上下文第二版）明确规定所有模块共享的数据结构，可以在编译阶段发现字段错误、提供代码补全，并约束密钥只使用引用。

### 2. Builder Pattern（构建器模式）

使用 RuntimeContextBuilder（运行时上下文构建器）集中构造字段多、默认值多、部分由调用方传入、部分由系统生成的复杂对象。

### 3. Middleware Pattern（中间件模式）

通过中间件逐步补充认证、追踪和记忆信息，避免所有逻辑集中在业务函数中。

### 4. Context Propagation（上下文传播）

同一个上下文沿 API（应用程序接口）、Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Prompt（提示词）、Model（模型）和 Evaluation（评估）调用链继续传递。

### 5. Correlation ID（关联标识）

`requestId` 和 `traceId` 都属于 Correlation ID（关联标识），用于把不同模块产生的日志、调用和指标关联到一起。

### 6. Distributed Tracing（分布式链路追踪）

即使当前演示主要运行在一个 Next.js（React 全栈应用框架）项目中，只要持续透传 Trace ID（链路追踪标识），设计就可以扩展到多个服务。

### 7. Observability（可观测性）

Observability（可观测性）通常包括：

- Logs（日志）。
- Metrics（指标）。
- Traces（链路追踪）。

Day64 把 Trace（链路追踪）、Usage（用量）、Evaluation（评估）和 Runtime Context（运行时上下文）放入同一条观测链路。

### 8. Security by Reference（通过引用保持安全边界）

Model Context（模型上下文）不保存真实 Secret（密钥），只保存 Secret Reference（密钥引用）。这样 RuntimeContext（统一运行时上下文）进入前端、日志、Trace（链路追踪）或调试快照时不会泄露真实 API Key（接口密钥）。

### 9. End-to-End Testing（端到端链路测试）

测试不只验证单个函数，还会检查 Builder（构建器）、Middleware（中间件）以及 Agent（智能体）到 Trace（链路追踪）的完整链路是否共享同一标识。

---

## 八、Day64 对比 Day63 的改进

| 对比项 | Day63 | Day64 |
| --- | --- | --- |
| 核心目标 | Secrets Management（密钥管理） | Unified Runtime Context（统一运行时上下文） |
| 解决的问题 | 敏感凭证如何安全存储和使用 | 多个运行模块如何共享同一次执行背景 |
| 核心对象 | SecretItem（密钥项）、SecretsManager（密钥管理器） | RuntimeContextV2（统一运行时上下文第二版）、RuntimeContextBuilder（运行时上下文构建器） |
| 设计模式 | Provider Pattern（提供者模式） | Builder Pattern（构建器模式）、Middleware Pattern（中间件模式） |
| 安全重点 | 加密、脱敏、轮换 | Context（上下文）只保存 Secret Reference（密钥引用） |
| 追踪能力 | Trace（链路追踪）中避免泄露密钥 | 使用相同 Trace ID（链路追踪标识）串联全部模块 |
| 前端面板 | Secrets Explorer（密钥管理浏览器） | Runtime Context Explorer（运行时上下文浏览器） |
| 测试重点 | 加密、解密、轮换、脱敏 | 上下文生成、传播和模块一致性 |
| 项目阶段 | Production Infrastructure V6（生产基础设施第 6 版） | Production Upgrade V1（生产化升级第 1 版） |

Day63 建立的是：

```text
凭证安全边界
```

Day64 建立的是：

```text
运行时协作边界
```

两者协作方式为：

```text
RuntimeContext.modelContext（统一上下文中的模型上下文）
  ├─ provider（模型提供方）
  ├─ model（模型名称）
  └─ secretRef（密钥引用）
             ↓
SecretsManager.get(secretRef)（密钥管理器按引用读取）
             ↓
解密真实 API Key（接口密钥）
             ↓
调用 Model（模型）
```

RuntimeContext（统一运行时上下文）负责描述本次请求需要使用什么，SecretsManager（密钥管理器）负责安全提供真实凭证。

---

## 九、一套上下文会不会影响 Agent（智能体）和 Tool（工具）的输出准确性

### 我的提问

那就是一套上下文走完整个流程，但是实际上用 A 这个 Agent（智能体）时只需要一些特定的上下文，B 工具也只需要一些特定的上下文，最后才会汇总答案返回用户。此时只有一套上下文的话，会不会因为上下文信息过多，从而影响一些 Agent（智能体）或 Tool（工具）的准确输出？

### 回答整理

这个担心是正确的。统一使用一套 RuntimeContext（统一运行时上下文），不应该等于把里面所有内容都塞给每个 Agent（智能体）、Tool（工具）或 Model（模型）。

正确理解是：

```text
一套统一上下文负责贯穿全流程
每个模块只读取自己被允许且真正需要的部分
```

统一上下文更像 Context Envelope（上下文信封）：完整信息统一保存，但不同模块获得不同的 Context View（上下文视图）。

```text
RuntimeContext（完整统一上下文）
    ├─ Agent A（智能体 A） → Agent Context View A（智能体上下文视图 A）
    ├─ Agent B（智能体 B） → Agent Context View B（智能体上下文视图 B）
    ├─ Tool A（工具 A）    → Tool Context View A（工具上下文视图 A）
    ├─ Model（模型）       → Model Context View（模型上下文视图）
    └─ Evaluation（评估）  → Evaluation Context View（评估上下文视图）
```

例如：

- Research Agent（研究智能体）主要读取任务、记忆、检索、工作区和追踪信息。
- Writer Agent（写作智能体）主要读取任务、审核后的工作区内容、提示词策略和追踪信息。
- Weather Tool（天气工具）可能只需要请求、用户、会话和追踪信息。
- Model Runtime（模型运行时）主要读取提示词、模型选择、用量和追踪信息。
- Evaluation（评估）主要读取提示词版本、模型、用量、最终输出和追踪信息。

因此，统一的是标识和数据来源，不是每个模块收到完全相同的输入。

### Control Context（控制上下文）与 Semantic Context（语义上下文）

需要区分两类上下文。

#### Control Context（控制上下文）

这类信息主要用于系统控制和观测：

```text
requestId
traceId
sessionId
usageContext
secretRef
createdAt
```

它们通常不应该进入 Prompt（提示词），因此不会直接影响模型回答。

#### Semantic Context（语义上下文）

这类信息会进入模型输入并影响回答：

```text
用户问题
长期记忆
RAG（检索增强生成）结果
前置 Agent（智能体）输出
Workspace（共享工作区）内容
System Prompt（系统提示词）
```

如果这些内容无差别全部注入，确实可能引起：

- Context Noise（上下文噪声）。
- Token Bloat（令牌膨胀）。
- Attention Dilution（注意力稀释）。
- Context Poisoning（上下文污染）。
- Instruction Conflict（指令冲突）。
- Privacy Leakage（隐私泄露）。
- Hallucination（幻觉）。

因此，真正需要谨慎管理的是 Semantic Context（语义上下文），而不是 `requestId`、`traceId` 等控制信息。

### 推荐设计：统一存储，按需投影

可以增加 Context Projector（上下文投影器）或 Selector（选择器），为每个模块挑选字段。

```text
RuntimeContext（完整上下文）
        ↓
Context Selector / Projector（上下文选择器或投影器）
        ↓
Module Context View（模块专用上下文视图）
        ↓
Agent / Tool / Model / Evaluation（智能体 / 工具 / 模型 / 评估）
```

还可以让 Agent Profile（智能体档案）显式声明自己需要哪些上下文，例如：

```text
Research Agent（研究智能体）
  -> task（任务）
  -> memory（记忆）
  -> retrieval（检索）
  -> workspace（工作区）
  -> trace（链路追踪）

Writer Agent（写作智能体）
  -> task（任务）
  -> workspace（工作区）
  -> prompt（提示词）
  -> trace（链路追踪）
```

这种方式属于 Capability-Based Context Access（基于能力的上下文访问）或 Context Scoping（上下文作用域控制）。

### 多 Agent（多智能体）输出应该放入 Workspace（共享工作区）

多个 Agent（智能体）不应该不断修改和扩充一个巨大文本对象。更合理的方式是：

```text
共享 RuntimeContext（统一运行时上下文）：保存请求身份和模块入口
共享 Workspace（共享工作区）：保存各 Agent（智能体）的结构化产物
```

例如：

```text
Workspace（共享工作区）
├─ researcher.result（研究结果）
├─ analyst.result（分析结果）
├─ reviewer.feedback（审核反馈）
└─ writer.finalAnswer（最终答案）
```

执行过程可以是：

```text
Research Agent（研究智能体）写入研究结果
  ↓
Analysis Agent（分析智能体）只读取研究结果并写入分析结果
  ↓
Reviewer Agent（审核智能体）读取研究与分析结果并写入反馈
  ↓
Writer Agent（写作智能体）只读取审核后的必要结果
  ↓
返回最终答案
```

最好使用 Typed Workspace（类型化工作区），以结构化字段保存不同阶段产物，而不是把所有历史输出拼成一大段文本。

### RAG（检索增强生成）和 Memory（记忆）也需要筛选

即使某个 Agent（智能体）有权访问记忆和检索结果，也不代表需要全部注入。

```text
完整 Memory Store（记忆仓库）
       ↓
根据当前任务检索
       ↓
相关性评分
       ↓
权限过滤
       ↓
去重
       ↓
Token Budget（令牌预算）截断
       ↓
注入 Agent Prompt（智能体提示词）
```

这类工作称为 Context Curation（上下文整理）或 Context Engineering（上下文工程）。

### 当前 Day64 实现的实际边界

Day64 当前演示链路主要验证各模块是否共享相同的 `requestId` 和 `traceId`。它并没有把 RuntimeContext（统一运行时上下文）的完整 JSON（结构化数据）全部注入每个模型的 Prompt（提示词）。

因此，Runtime Context Explorer（运行时上下文浏览器）展示完整上下文，不代表所有内容都会自动影响模型输出。

如果以后把 Day64 真正全面接入历史 Agent Runtime（智能体运行时）、Tool Registry（工具注册表）和 Model Runtime（模型运行时），应继续补充：

- ContextProjector（上下文投影器）。
- AgentContextView（智能体上下文视图）。
- ToolContextView（工具上下文视图）。
- PromptContextView（提示词上下文视图）。
- ContextPolicy（上下文访问策略）。
- TokenBudget（令牌预算）。
- RelevantContextSelector（相关上下文选择器）。

最终原则是：

```text
RuntimeContext（统一运行时上下文）应该统一管理上下文，
但不应该统一暴露上下文。

共享的是同一次执行的身份与数据来源，
每个模块消费的仍然只是最小必要信息。
```

---

## 十、结合前端 State（状态）理解统一上下文

### 我的提问

结合前端知识来理解，这个统一的上下文是不是就是一个 State（状态），让各个模块，也就是各个组件，共享信息并获取自己需要的信息？

### 回答整理

这个理解基本正确。

结合前端知识，可以把 RuntimeContext（统一运行时上下文）理解为一份全流程共享的 State（状态）：

```text
RuntimeContext（统一运行时上下文）≈ 全局 State（状态）
Agent / Tool / Model（智能体 / 工具 / 模型）≈ 各个 Component（组件）
Context View（上下文视图）≈ Selector（状态选择器）
```

整体关系类似：

```text
Global Store（全局状态仓库）
  ├─ 用户组件读取 user（用户）
  ├─ 聊天组件读取 session（会话）
  ├─ 搜索组件读取 query（查询）
  ├─ 主题组件读取 theme（主题）
  └─ 用量组件读取 usage（用量）
```

后端统一运行时则是：

```text
RuntimeContext（统一运行时上下文）
  ├─ Agent（智能体）读取 task、memory、workspace（任务、记忆、工作区）
  ├─ Tool（工具）读取 user、session、trace（用户、会话、链路追踪）
  ├─ RAG（检索增强生成）读取 query、retrievalContext（查询、检索上下文）
  ├─ Prompt（提示词）读取 memory、workspace、strategy（记忆、工作区、策略）
  ├─ Model（模型）读取 modelContext、usageContext（模型上下文、用量上下文）
  └─ Evaluation（评估）读取 prompt、model、usage、trace（提示词、模型、用量、链路追踪）
```

### 使用 React Context（React 上下文）类比

React Context（React 上下文）会在顶层通过 Provider（上下文提供者）提供共享状态，子组件再读取自己需要的信息。

Day64 的思路类似：先由 RuntimeContextBuilder（运行时上下文构建器）创建上下文，再让 Agent（智能体）、Tool（工具）和 Model（模型）沿执行链路读取。

### 更准确的类比：Redux Store（Redux 状态仓库）

相比普通 React Context（React 上下文），Day64 更像：

```text
Redux Store（Redux 状态仓库）
+ Selector（状态选择器）
+ Middleware（中间件）
```

对应关系如下：

| 前端概念 | Day64 对应概念 |
| --- | --- |
| Redux Store（Redux 状态仓库） | RuntimeContext（统一运行时上下文） |
| Initial State（初始状态） | RuntimeContextBuilder（运行时上下文构建器）创建的上下文 |
| Selector（状态选择器） | 为模块挑选需要的上下文字段 |
| Middleware（中间件） | Auth、Trace、Memory Middleware（认证、链路追踪、记忆中间件） |
| Component（组件） | Agent、Tool、RAG、Model（智能体、工具、检索增强生成、模型）等模块 |
| State Update（状态更新） | 写入 Usage、Evaluation（用量、评估）等结果 |
| DevTools（开发者工具） | Runtime Context Explorer（运行时上下文浏览器） |
| Action / Event（动作 / 事件） | Agent（智能体）执行、Tool（工具）调用、Model（模型）请求 |
| Request Scope（请求作用域） | 一次请求对应一份 RuntimeContext（统一运行时上下文） |

前端 Redux（可预测状态管理工具）中可能使用：

```text
useSelector(state => state.user)
```

后端运行时可以对应为：

```text
selectAgentContext(runtimeContext)
selectToolContext(runtimeContext)
selectModelContext(runtimeContext)
```

也就是：

```text
大家共享同一个 Store（状态仓库），
但每个模块只选择自己需要的 State Slice（状态切片）。
```

### Context Middleware（上下文中间件）对应前端 Middleware（中间件）

Day64 的链路：

```text
Request（请求）
  -> Auth Middleware（认证中间件）
  -> Trace Middleware（链路追踪中间件）
  -> Memory Middleware（记忆中间件）
  -> RuntimeContext（统一运行时上下文）
```

类似 Redux Middleware（Redux 中间件）处理 Action（动作）：

```text
Action（动作）
  -> Auth Middleware（认证中间件）
  -> Logging Middleware（日志中间件）
  -> Analytics Middleware（分析埋点中间件）
  -> Reducer（状态更新函数）
  -> New State（新状态）
```

### Runtime Context Explorer（运行时上下文浏览器）对应 Redux DevTools（Redux 开发者工具）

Redux DevTools（Redux 开发者工具）用于查看当前 State（状态）、触发了哪个 Action（动作）以及状态如何变化。

Runtime Context Explorer（运行时上下文浏览器）用于查看：

- Request ID（请求标识）。
- Trace ID（链路追踪标识）。
- Session ID（会话标识）。
- Agent（智能体）。
- Tool（工具）。
- RAG（检索增强生成）。
- Prompt（提示词）。
- Model（模型）。
- Usage（用量）。
- Evaluation（评估）。

二者目的都是 Observability（可观测性）：了解系统当前处于什么状态、哪些模块消费了该状态，以及某次执行为什么得到当前结果。

### RuntimeContext（统一运行时上下文）和前端 State（状态）的区别

#### 1. 生命周期不同

前端全局 State（状态）可能从页面打开一直存在到页面关闭。

RuntimeContext（统一运行时上下文）通常属于 Request Scoped State（请求级状态）：

```text
收到一次请求
  -> 创建 RuntimeContext（统一运行时上下文）
  -> 执行 Agent / Tool / Model（智能体 / 工具 / 模型）
  -> 返回结果
  -> 本次上下文生命周期结束
```

下一次请求通常会创建新的上下文：

```text
Request 1（请求 1） -> RuntimeContext 1（上下文 1）
Request 2（请求 2） -> RuntimeContext 2（上下文 2）
Request 3（请求 3） -> RuntimeContext 3（上下文 3）
```

同一个会话可以复用相同的 Session ID（会话标识），但不能让所有用户、所有请求共享同一个可变对象，否则可能发生数据串扰。

#### 2. 前端 State（状态）主要驱动 UI（用户界面）

前端状态更新后，React（用户界面库）会重新渲染组件。

RuntimeContext（统一运行时上下文）主要驱动执行行为，例如：

- `modelStrategy` 改变后选择不同模型。
- `retrievalStrategy` 改变后使用不同检索方式。
- `memoryContext` 改变后向 Prompt（提示词）注入不同记忆。

#### 3. RuntimeContext（统一运行时上下文）应尽量只读或受控更新

React（用户界面库）和 Redux（状态管理工具）强调 Immutability（不可变性），RuntimeContext（统一运行时上下文）也不应允许所有模块随意修改。

否则可能出现：

- Agent（智能体）修改模型选择。
- Tool（工具）覆盖 `traceId`。
- Evaluation（评估）删除用量信息。
- 多个并行 Agent（智能体）同时修改 Workspace（共享工作区）。

更合理的做法是通过 Selector（选择器）读取专用视图，或者为不同任务创建 Child Context（子上下文），同时保持核心 `requestId`、`traceId` 和 `sessionId` 不变。

### 最准确的前端类比

```text
RuntimeContext（统一运行时上下文）
就像 Request-Scoped Redux Store（请求级 Redux 状态仓库）。

Agent、Tool、RAG、Prompt、Model（智能体、工具、检索增强生成、提示词、模型）
就像不同的 Component（组件）。

它们共享同一个 Store（状态仓库），
但通过 Selector（选择器）只获取自己需要的 State Slice（状态切片）。
```

同时必须注意：它不是整个后端所有用户共同使用的 Global Singleton State（全局单例状态），而是每一次请求独立创建、只在该请求链路内部共享的 State（状态）。

---

## 十一、Day64 核心总结

Day64 最重要的一句话是：

```text
一个任务是否完整，不只取决于每个模块能否独立运行，
还取决于所有模块是否运行在同一个 RuntimeContext（统一运行时上下文）里。
```

但“统一上下文”不代表“所有内容无差别暴露”：

```text
RuntimeContext（统一运行时上下文）统一管理完整执行背景
  -> Selector / Projector（选择器 / 投影器）按模块筛选
  -> 每个模块只获得最小必要的 Context View（上下文视图）
  -> 只有经过相关性、权限与 Token Budget（令牌预算）控制的语义信息进入 Prompt（提示词）
```

Day63 到 Day64 的升级关系可以总结为：

```text
Day63：
Runtime（运行时）可以安全获得外部服务凭证。

Day64：
所有 Runtime（运行时）可以共享同一次请求的身份、记忆、检索、
提示词、模型、用量、评估和链路追踪信息。
```

最终架构为：

```text
User Request（用户请求）
        ↓
Context Middleware（上下文中间件）
        ↓
RuntimeContext V2（统一运行时上下文第二版）
        ├─ Agent Runtime（智能体运行时）
        ├─ Tool Runtime（工具运行时）
        ├─ RAG Runtime（检索增强生成运行时）
        ├─ Prompt Runtime（提示词运行时）
        ├─ Model Runtime（模型运行时）
        ├─ Evaluation Runtime（评估运行时）
        └─ Trace Runtime（链路追踪运行时）
        ↓
Runtime Context Explorer（运行时上下文浏览器）
```

---

## 十二、第 64 天打卡

【第64天打卡】

1. 是否定义 RuntimeContext V2（统一运行时上下文）：是

   说明：已在 `lib/runtime/unified-runtime-context.ts` 中定义 `RuntimeContextV2`，包含请求、用户、会话、工作流、智能体、任务、记忆、检索、工作区、提示词、模型、追踪、用量和评估等上下文信息。

2. 是否实现 RuntimeContextBuilder（上下文构建器）：是

   说明：已实现 `RuntimeContextBuilder`，能够统一创建 RuntimeContext（统一运行时上下文），自动生成或复用 Request ID（请求标识）、Trace ID（链路追踪标识）和 Session ID（会话标识），并初始化各模块上下文。

3. Agent Runtime（智能体运行时）是否接入 RuntimeContext（统一运行时上下文）：是

   说明：Day64 的 Unified Research Task（统一研究任务）演示链路已让 Agent（智能体）读取统一的请求、任务、记忆、工作区和追踪信息。当前接入采用独立统一链路，历史 Agent Runtime（智能体运行时）兼容接口尚未全部重构。

4. Tool Runtime（工具运行时）是否接入 RuntimeContext（统一运行时上下文）：是

   说明：Day64 演示链路中的 Tool Runtime（工具运行时）已共享同一次请求的用户、会话、记忆、用量和 Trace ID（链路追踪标识）。历史 Tool Registry（工具注册表）接口仍保留兼容结构。

5. Model Runtime（模型运行时）是否接入 RuntimeContext（统一运行时上下文）：是

   说明：Day64 演示链路已从 Model Context（模型上下文）读取模型提供方、模型名称和 Secret Reference（密钥引用）。真实密钥不进入 RuntimeContext（统一运行时上下文），继续由 SecretsManager（密钥管理器）按需读取。

6. Prompt Runtime（提示词运行时）是否接入 RuntimeContext（统一运行时上下文）：是

   说明：Day64 演示链路已从 Prompt Context（提示词上下文）读取 Prompt Strategy（提示词策略）和 Prompt Version（提示词版本），并与记忆、检索和工作区信息建立统一关联。

7. Evaluation（评估）是否接入 RuntimeContext（统一运行时上下文）：是

   说明：Evaluation Context（评估上下文）已关联一致性分数、评估状态、Prompt Version（提示词版本）、Model（模型）、Usage（用量）和 Trace（链路追踪）。

8. 是否实现 Context Middleware（上下文中间件）：是

   说明：已实现 Auth Context Middleware（认证上下文中间件）、Trace Context Middleware（链路追踪上下文中间件）和 Memory Context Middleware（记忆上下文中间件），并提供统一的顺序执行入口。

9. 是否实现 Runtime Context Explorer（运行时上下文浏览器）：是

   说明：已新增“上下文”标签页，展示 Request ID（请求标识）、Trace ID（链路追踪标识）、Session ID（会话标识）、七类模块接入记录、上下文一致性和安全的完整 Context JSON（上下文 JSON 数据）。

10. 是否完成 Unified Runtime Context Test（统一运行时上下文测试）：是

    说明：已提供 `scripts/test-day64-unified-runtime-context.ts` 和 `day64_test_cases.md`，覆盖标识生成、会话复用、密钥引用、上下文中间件、七类模块共享标识、提示词版本、模型信息和评估结果。自动化测试与 Next.js（React 全栈应用框架）生产构建均已通过。

11. 遇到的最大问题：

    最大的问题是理解“统一管理上下文”和“把全部上下文传给所有模块”之间的区别。统一 RuntimeContext（统一运行时上下文）的目标是让所有模块共享同一次请求的身份、数据来源和追踪关系，而不是让每个 Agent（智能体）、Tool（工具）或 Model（模型）看到所有信息。如果无差别注入 Semantic Context（语义上下文），会产生上下文噪声、令牌膨胀、注意力稀释、指令冲突和隐私泄露。因此，后续生产化升级需要继续实现 Context Selector（上下文选择器）、Context Projector（上下文投影器）、Context Policy（上下文访问策略）和 Token Budget（令牌预算），让每个模块只获得最小必要信息。同时还要兼顾历史业务接口的兼容性，避免一次性重构造成 Regression Risk（回归风险）。

12. 当前系统能力：

    当前系统已经在 Day63 的 Production Infrastructure V6（生产基础设施第 6 版）基础上进入 Day64 的 Production Upgrade V1（生产化升级第 1 版）。系统目前具备：

    - Next.js App Router（Next.js 应用路由）全栈应用能力。
    - Agent Runtime（智能体运行时）和 Agent Registry（智能体注册表）。
    - Multi-Agent Collaboration（多智能体协作）与 Agent DAG（智能体有向无环执行图）。
    - Workflow Runtime（工作流运行时）、暂停恢复、持久化和任务队列能力。
    - Tool Registry（工具注册表）、工具组合、校验、超时和调用指标。
    - RAG Pipeline（检索增强生成流水线）、知识库、文本分块、向量检索、查询改写和混合检索。
    - Memory Runtime（记忆运行时）、短期记忆、长期经验记忆、记忆检索、整合和衰减。
    - Prompt Platform（提示词平台）、提示词注册、版本、组合、实验、优化、差异比较和回滚。
    - Model Registry（模型注册表）、Model Routing（模型路由）、Fallback（备用模型）、Circuit Breaker（熔断器）和 Multi-Model Collaboration（多模型协作）。
    - Evaluation（评估）、Regression Test（回归测试）、Quality Gate（质量门禁）和 Bad Case Management（失败案例管理）。
    - Usage and Cost Observability（用量与成本可观测性）。
    - Semantic Cache（语义缓存）。
    - Redis Shared State（Redis 共享状态）、Distributed Queue（分布式队列）和 Distributed Lock（分布式锁）。
    - Object Storage（对象存储）和 Config Center（配置中心）。
    - Secrets Management（密钥管理），包括加密、解密、脱敏、轮换、密钥引用和安全快照。
    - RuntimeContext V2（统一运行时上下文第二版）和 RuntimeContextBuilder（运行时上下文构建器）。
    - Context Middleware（上下文中间件）。
    - Agent、Tool、RAG、Prompt、Model、Evaluation、Trace（智能体、工具、检索增强生成、提示词、模型、评估、链路追踪）的统一演示链路。
    - Runtime Context Explorer（运行时上下文浏览器）和 Unified Runtime Context Test（统一运行时上下文测试）。

    当前 Day64 的核心能力可以概括为：

    ```text
    一次用户请求
      -> 创建独立 RuntimeContext（统一运行时上下文）
      -> 通过 Middleware（中间件）补齐身份、追踪和记忆
      -> 让各运行模块共享同一 Request ID（请求标识）和 Trace ID（链路追踪标识）
      -> 使用 Secret Reference（密钥引用）保持安全边界
      -> 汇总 Usage（用量）与 Evaluation（评估）
      -> 通过 Explorer（浏览器面板）观察完整链路
    ```

---

## 十三、最终结论

Day64 不是简单增加一个“大对象”，而是在建立 Agent Operating System（智能体操作系统）所需的统一执行协议。

可以结合前端知识记成：

```text
RuntimeContext（统一运行时上下文）
≈ Request-Scoped Redux Store（请求级 Redux 状态仓库）

Runtime Modules（运行时模块）
≈ Components（组件）

Context Selectors（上下文选择器）
≈ State Selectors（状态选择器）

Runtime Context Explorer（运行时上下文浏览器）
≈ Redux DevTools（Redux 开发者工具）
```

最重要的设计原则是：

```text
统一管理，不等于全部暴露；
共享执行身份，不等于共享所有语义内容；
每个模块只读取完成任务所需的最小上下文。
```

---

## 十四、Day64 阶段总结：从模块组合升级为统一运行时系统

首先，恭喜完成 Day64。

Day64 完成了整个课程中一次非常关键的架构升级：

```text
从“多个能力模块组合”
升级为“统一运行时系统”
```

在 Day64 之前，系统虽然已经拥有：

- Agent（智能体）。
- Tool（工具）。
- RAG，Retrieval-Augmented Generation（检索增强生成）。
- Memory（记忆系统）。
- Prompt（提示词系统）。
- Evaluation（评估系统）。
- Model（模型系统）。

但是它们更像多个能力优秀、相对独立的模块：

```text
多个优秀模块
      ↓
拼接运行
```

Day64 之后，它们开始组成一个统一的 Runtime（运行时系统）：

```text
一个 Runtime（统一运行时）
      ↓
共享 Context（上下文）
      ↓
协同运行
```

这正是 Production-Grade Agent Framework（生产级智能体框架）与 Demo（演示项目）之间的重要区别之一。

### Day64 完成的主题

Day64 完成的是：

```text
Production Upgrade V1（生产化升级第 1 版）
Unified Runtime Context（统一运行时上下文）
```

现在，一次请求的生命周期已经升级为：

```text
User Request（用户请求）
        ↓
Context Middleware（上下文中间件）
        ↓
RuntimeContextBuilder（运行时上下文构建器）
        ↓
RuntimeContext V2（统一运行时上下文第二版）
        ↓
┌──────────────────────────────────────────────┐
│ Agent（智能体）       Tool（工具）            │
│ Prompt（提示词）      RAG（检索增强生成）      │
│ Model（模型）         Memory（记忆系统）       │
│ Evaluation（评估）    Trace（链路追踪）        │
└──────────────────────────────────────────────┘
        ↓
Final Response（最终响应）
```

### Day64 最大升级点

以前，不同模块可能拥有各自独立的上下文：

```text
Agent（智能体）
  -> AgentContext（智能体上下文）

Tool（工具）
  -> ToolContext（工具上下文）

Model（模型）
  -> ModelContext（模型上下文）
```

Day64 将它们统一关联到：

```text
RuntimeContextV2（统一运行时上下文第二版）
```

所有模块可以共享或按需读取：

- `requestId`：Request ID（请求标识）。
- `traceId`：Trace ID（链路追踪标识）。
- `sessionId`：Session ID（会话标识）。
- `workflowId`：Workflow ID（工作流标识）。
- `agentId`：Agent ID（智能体标识）。
- `memoryContext`：Memory Context（记忆上下文）。
- `retrievalContext`：Retrieval Context（检索上下文）。
- `workspace`：Workspace（共享工作区）。
- `promptContext`：Prompt Context（提示词上下文），其中可以包含 Prompt Version（提示词版本）。
- `modelContext`：Model Context（模型上下文）。
- `usageContext`：Usage Context（用量上下文）。
- `evaluationContext`：Evaluation Context（评估上下文）。

这里的“共享”仍然遵循前文提到的原则：一套 RuntimeContext（统一运行时上下文）贯穿请求，但每个模块通过 Context Selector（上下文选择器）或 Context View（上下文视图）只获取自己真正需要的信息。

这意味着以后面对任何异常结果，系统都可以尝试回答：

```text
这个结果产生于哪个 Request（请求）？
使用了哪个 Model（模型）？
使用了哪个 Prompt Version（提示词版本）？
读取了哪些 Memory（记忆）？
调用了哪个 Tool（工具）？
属于哪一条 Trace（链路追踪）？
```

这就是 Observable Agent Runtime（可观测智能体运行时）的基础。

### 当前整体进度

#### Phase 1：Agent Runtime（阶段 1：智能体运行时）

```text
Agent Runtime（智能体运行时）  ██████████████████████████ 100%
```

#### Phase 2：Infrastructure（阶段 2：基础设施）

```text
Redis（共享状态与缓存）         ██████████ 100%
Queue（任务队列）              ██████████ 100%
Lock（分布式锁）               ██████████ 100%
Storage（对象存储）            ██████████ 100%
Config（配置中心）             ██████████ 100%
Secrets（密钥管理）            ██████████ 100%
```

#### Phase 3：Production Upgrade（阶段 3：生产化升级）

```text
Unified Context（统一上下文）     ██████████ 100%
Event System（事件系统）          ░░░░░░░░░░   0%
Unified Registry（统一注册中心）  ░░░░░░░░░░   0%
Production Modules（生产级模块）  ░░░░░░░░░░   0%
```

当前课程整体进度可以理解为：

```text
约 99%
```

这里的进度表示前 64 天规划内容已基本完成，并已进入最后的系统融合阶段；后续仍需要完成统一事件、统一注册中心、生产级模块升级和集成测试。

---

## 十五、Day65 学习计划：Unified Event System（统一事件系统）

Day65 的主题是：

```text
Production Upgrade V2（生产化升级第 2 版）
Unified Event System（统一事件系统）
```

### 今日核心目标

让所有 Runtime Module（运行时模块）通过 Event（事件）进行通信，而不是继续彼此直接调用。

### 为什么需要 Event System（事件系统）

Day64 已经统一了 RuntimeContext（运行时上下文），但模块之间仍可能使用直接调用：

```text
Agent Runtime（智能体运行时）
        ↓
Tool Runtime（工具运行时）
        ↓
Trace Manager（链路追踪管理器）
```

或者：

```text
Evaluation（评估系统）
        ↓
Usage Manager（用量管理器）
```

这种方式的主要问题是 Coupling（耦合）：

- Agent Runtime（智能体运行时）必须知道 Trace Manager（链路追踪管理器）的存在。
- Tool Runtime（工具运行时）必须知道 Usage Manager（用量管理器）如何统计。
- Evaluation（评估系统）和业务执行代码容易相互依赖。
- 新增 Analytics（分析系统）或 Metrics（指标系统）时，可能需要修改原有业务模块。

真实生产系统通常会使用 Event-Driven Architecture（事件驱动架构）降低这种耦合。

升级后的通信方式为：

```text
Agent（智能体）
      ↓ publish / emit（发布事件）
Event Bus（事件总线）
      ├─ Trace（链路追踪）
      ├─ Usage（用量统计）
      ├─ Evaluation（评估系统）
      ├─ Memory（记忆系统）
      ├─ Metrics（指标系统）
      └─ Analytics（分析系统）
```

Agent（智能体）只需要声明“发生了什么”，不需要知道哪些模块会处理这件事。

### 事件驱动示例

用户发起一个 Research Task（研究型任务）时，Agent Runtime（智能体运行时）首先发布：

```json
{
  "event": "agent.started"
}
```

Event Subscriber（事件订阅者）可以分别处理：

- Trace Subscriber（链路追踪订阅者）记录开始事件。
- Usage Subscriber（用量订阅者）开始统计。
- Metrics Subscriber（指标订阅者）更新运行指标。

Agent（智能体）执行完成后，再发布：

```json
{
  "event": "agent.completed"
}
```

Evaluation Subscriber（评估订阅者）收到事件后，可以自动创建 Evaluation Task（评估任务）。

这就是 Event-Driven Architecture（事件驱动架构）：业务模块负责发布事实，订阅模块负责对事实作出响应。

### Day65 最终效果

以前的强耦合方式：

```text
Agent（智能体）
  ↓ 直接调用
Trace（链路追踪）
  ↓ 直接调用
Usage（用量统计）
  ↓ 直接调用
Evaluation（评估系统）
```

升级后的事件通信方式：

```text
                    Event Bus（事件总线）
                           ↑
Agent（智能体） ── emit（发布事件）
                           ↓
          ┌────────────────┼────────────────┐
          ↓                ↓                ↓
   Trace（链路追踪）  Usage（用量统计）  Evaluation（评估）
          ↓                ↓                ↓
   Memory（记忆）     Metrics（指标）   Analytics（分析）
```

---

## 十六、Day65 任务清单

### 任务 1：定义 RuntimeEvent（运行时事件）

新增统一事件结构：

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

字段含义：

- `id`：Event ID（事件标识），用于唯一标识一条事件。
- `type`：Event Type（事件类型），表示发生了什么。
- `timestamp`：Timestamp（时间戳），记录事件发生时间。
- `traceId`：Trace ID（链路追踪标识），用于把事件关联到完整调用链。
- `runtimeContextId`：Runtime Context ID（运行时上下文标识），用于关联 Day64 创建的统一上下文。
- `payload`：Event Payload（事件载荷），保存该事件需要传递的业务数据。
- `metadata`：Event Metadata（事件元数据），保存来源、版本等扩展信息。

事件必须携带 RuntimeContext（统一运行时上下文）的关联信息。更安全且轻量的做法是至少携带 `runtimeContextId` 和 `traceId`，需要完整上下文时再从 Runtime Context Store（运行时上下文仓库）按标识读取，避免把整个上下文和敏感信息复制到每一条事件中。

### 任务 2：设计 EventType（事件类型）

新增 EventType（事件类型）联合类型，至少包含：

```ts
type EventType =
  | "runtime.started"
  | "runtime.completed"
  | "agent.started"
  | "agent.completed"
  | "tool.called"
  | "tool.completed"
  | "model.called"
  | "model.completed"
  | "prompt.rendered"
  | "memory.read"
  | "memory.write"
  | "retrieval.completed"
  | "evaluation.completed"
  | "error.occurred";
```

对应中文含义：

- `runtime.started`：Runtime Started（运行时开始）。
- `runtime.completed`：Runtime Completed（运行时完成）。
- `agent.started`：Agent Started（智能体开始执行）。
- `agent.completed`：Agent Completed（智能体执行完成）。
- `tool.called`：Tool Called（工具开始调用）。
- `tool.completed`：Tool Completed（工具调用完成）。
- `model.called`：Model Called（模型开始调用）。
- `model.completed`：Model Completed（模型调用完成）。
- `prompt.rendered`：Prompt Rendered（提示词渲染完成）。
- `memory.read`：Memory Read（读取记忆）。
- `memory.write`：Memory Write（写入记忆）。
- `retrieval.completed`：Retrieval Completed（检索完成）。
- `evaluation.completed`：Evaluation Completed（评估完成）。
- `error.occurred`：Error Occurred（发生错误）。

### 任务 3：实现 EventBus（事件总线）接口

新增统一接口：

```ts
interface EventBus {
  publish(event: RuntimeEvent): Promise<void> | void;
  subscribe(type: EventType, handler: EventHandler): Unsubscribe;
  unsubscribe(type: EventType, handler: EventHandler): void;
}
```

职责包括：

- `publish`：Publish Event（发布事件）。
- `subscribe`：Subscribe Event（订阅事件）。
- `unsubscribe`：Unsubscribe Event（取消订阅）。

EventBus（事件总线）只定义通信协议，不绑定具体存储或消息中间件。

### 任务 4：实现 MemoryEventBus（内存事件总线）

先实现教学和本地开发使用的 MemoryEventBus（内存事件总线），支持：

- 发布事件。
- 按 Event Type（事件类型）订阅事件。
- 取消订阅。
- 将事件分发给一个或多个 Handler（处理函数）。
- 保存用于 Event Explorer（事件浏览器）展示的有限事件历史。

MemoryEventBus（内存事件总线）适合教学和单进程演示，但服务重启后事件会丢失，也无法天然支持多个服务实例。后续生产环境可以替换为 Redis Streams（Redis 流）、Kafka（分布式事件流平台）、RabbitMQ（消息队列系统）或 NATS（轻量消息系统）。

### 任务 5：Agent Runtime（智能体运行时）接入 EventBus（事件总线）

Agent（智能体）开始执行时发布：

```text
agent.started（智能体开始执行）
```

Agent（智能体）完成时发布：

```text
agent.completed（智能体执行完成）
```

事件应关联同一个 RuntimeContext（统一运行时上下文）、Request ID（请求标识）和 Trace ID（链路追踪标识）。

### 任务 6：Tool Runtime（工具运行时）接入 EventBus（事件总线）

Tool（工具）开始调用时发布：

```text
tool.called（工具开始调用）
```

Tool（工具）调用完成时发布：

```text
tool.completed（工具调用完成）
```

Event Payload（事件载荷）可以包含工具名称、调用结果摘要、执行时长和成功状态，但不应直接包含密码、Token（令牌）或 API Key（接口密钥）等敏感信息。

### 任务 7：Trace（链路追踪）改为事件监听

以前可能由业务模块直接调用：

```text
Agent（智能体）
  -> TraceManager.log()（直接写入链路追踪）
```

Day65 升级为：

```text
EventBus（事件总线）
  -> TraceSubscriber（链路追踪订阅者）
```

TraceSubscriber（链路追踪订阅者）监听运行时、智能体、工具、模型、检索、评估和错误事件，并统一生成 Trace Timeline（链路追踪时间线）。

### 任务 8：Usage（用量统计）改为事件监听

Usage Subscriber（用量订阅者）可以监听：

```text
model.completed（模型调用完成）
```

收到事件后自动统计：

- Token（令牌）数量。
- Cost（成本）。
- Latency（延迟）。
- Model（模型）。
- Provider（模型提供方）。
- Trace ID（链路追踪标识）。

业务模块不再需要直接调用 Usage Manager（用量管理器）。

### 任务 9：Evaluation（评估）支持事件触发

Evaluation Subscriber（评估订阅者）监听：

```text
agent.completed（智能体执行完成）
```

收到事件后自动创建 Evaluation Task（评估任务），并关联：

- RuntimeContext（统一运行时上下文）。
- Prompt Version（提示词版本）。
- Model（模型）。
- Usage（用量）。
- Trace（链路追踪）。
- Agent Output（智能体输出）。

这样可以把评估从业务主流程中解耦出来。

### 任务 10：实现 Event Explorer（事件浏览器）

新增前端 Event Explorer（事件浏览器），展示 Event Timeline（事件时间线），至少包括：

- Event Type（事件类型）。
- Source（事件来源）。
- Timestamp（时间戳）。
- Trace ID（链路追踪标识）。
- Runtime Context ID（运行时上下文标识）。
- Payload Summary（事件载荷摘要）。
- Status（事件状态）。

支持按以下类别过滤：

- Agent（智能体事件）。
- Tool（工具事件）。
- Model（模型事件）。
- Error（错误事件）。

Event Explorer（事件浏览器）用于观察一次请求中事件发生的先后顺序、来源和处理结果，是 Event-Driven Observability（事件驱动可观测性）的重要入口。

---

## 十七、Day65 验收标准

1. 是否定义 RuntimeEvent（运行时事件）。
2. 是否定义 EventType（事件类型）。
3. 是否实现 EventBus（事件总线）接口。
4. 是否实现 MemoryEventBus（内存事件总线）。
5. Agent Runtime（智能体运行时）是否发布事件。
6. Tool Runtime（工具运行时）是否发布事件。
7. Trace（链路追踪）是否改为事件监听。
8. Usage（用量统计）是否改为事件监听。
9. Evaluation（评估）是否支持事件触发。
10. 是否实现 Event Explorer（事件浏览器）。

---

## 十八、Day65 打卡模板

【第65天打卡】

1. 是否定义 RuntimeEvent（运行时事件）：是 / 否

2. 是否定义 EventType（事件类型）：是 / 否

3. 是否实现 EventBus（事件总线）接口：是 / 否

4. 是否实现 MemoryEventBus（内存事件总线）：是 / 否

5. Agent Runtime（智能体运行时）是否发布事件：是 / 否

6. Tool Runtime（工具运行时）是否发布事件：是 / 否

7. Trace（链路追踪）是否改为事件监听：是 / 否

8. Usage（用量统计）是否改为事件监听：是 / 否

9. Evaluation（评估）是否支持事件触发：是 / 否

10. 是否实现 Event Explorer（事件浏览器）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

---

## 十九、Day65 核心认知

Day65 最重要的一句话是：

```text
Context（上下文）解决“大家知道同一件事”，
Event（事件）解决“大家知道什么时候发生了变化”。
```

Day64 解决的是：

```text
Unified State（统一状态）
```

Day65 解决的是：

```text
Unified Communication（统一通信）
```

二者结合后，Agent Platform（智能体平台）才能同时具备：

```text
State-Driven（状态驱动）
       +
Event-Driven（事件驱动）
```

具体关系可以理解为：

```text
RuntimeContext（统一运行时上下文）
  -> 保存一次请求当前“是什么状态”

RuntimeEvent（运行时事件）
  -> 描述一次请求中“发生了什么变化”

EventBus（事件总线）
  -> 把变化通知给需要响应的模块
```

统一上下文和统一事件系统共同组成后续 Agent Operating System（智能体操作系统）的基础运行协议。

---

## 二十、Day64 到 Day73 后续路线

| Day（天数） | 学习内容 |
| --- | --- |
| Day64 | Unified Runtime Context（统一运行时上下文）✅ |
| Day65 | Unified Event System（统一事件系统） |
| Day66 | Unified Registry（统一注册中心） |
| Day67 | Production Prompt Platform（生产级提示词平台） |
| Day68 | Production Memory Upgrade（生产级记忆系统升级） |
| Day69 | Production RAG Upgrade（生产级检索增强生成升级） |
| Day70 | Production Workflow Upgrade（生产级工作流升级） |
| Day71 | Production Evaluation Platform（生产级评估平台） |
| Day72 | Observability & Monitoring（可观测性与监控） |
| Day73 | Production Integration Test（生产级集成测试） |

完成 Day73 后，项目目标是达到：

```text
Production-Ready Agent Platform v1.0（可用于生产环境的智能体平台 1.0 版）
```

现在已经进入最后九天的系统融合阶段。前 64 天积累的 Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Memory（记忆）、Prompt（提示词）、Model（模型）、Evaluation（评估）、Infrastructure（基础设施）和 Security（安全）能力，将在这一阶段通过 Context（上下文）、Event（事件）、Registry（注册中心）与 Observability（可观测性）真正融合成一个完整系统。
