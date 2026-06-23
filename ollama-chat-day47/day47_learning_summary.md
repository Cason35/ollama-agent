# Day 47 Learning Summary（第 47 天学习总结）

## 文档范围

本文档整理围绕 `ollama-chat-day47` 项目学习与理解的对话，包含学习问题与对应回答。

按照要求，本文档不记录创建文件夹、复制项目、修改代码、安装依赖、运行测试和检查页面等项目实施过程，只保留用于理解项目设计、技术知识、版本改进和设计原因的内容。

---

## 问题 1：Day 47 项目做了什么、使用了什么知识、相比 Day 46 有什么改进？

### 我问

> 带我来读懂 `ollama-chat-day47` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day46` 有什么改进，为什么这样子做（对于一些英文术语后面加上括号，并用中文翻译或描述下）。

### 回答

## 一句话理解 Day 47

`ollama-chat-day47` 在 Day 46 的 Continuous Evaluation System（持续评估系统）基础上，增加了 Usage & Cost Observability（用量与成本可观测性）。

Day 46 主要回答：

> 系统改完以后，质量有没有退步？

Day 47 继续回答：

> 完成这些任务使用了多少 Token（词元）、花费了多少钱、哪个 Agent（智能体）成本最高、系统应该从哪里开始优化？

---

## 整体运行流程

```text
用户任务
  ↓
Agent Runtime（智能体运行时）
  ↓
Agent（智能体）/ Tool（工具）/ Reflection（反思）/ Evaluation（评估）
  ↓
UsageRecord（用量记录）
  ↓
UsageManager（用量管理器）
  ├─ Usage Metrics（用量指标）
  ├─ Cost Breakdown（成本构成分析）
  └─ Prompt ROI（提示词投资回报率）
  ↓
/api/usage（用量接口）
  ↓
Usage Explorer（用量浏览器）
```

例如执行“研究 LangGraph（用于构建有状态大语言模型工作流的图式框架）”时，可能产生：

```text
Trace（完整任务追踪记录）
├─ Research Agent（研究智能体）
│  ├─ Retrieval Tool（检索工具）
│  ├─ Summary Tool（摘要工具）
│  ├─ Reflection（反思）
│  └─ Evaluation（评估）
├─ Planner Agent（规划智能体）
├─ Critic Agent（审查智能体）
└─ Writer Agent（写作智能体）
```

Day 47 会为这些阶段分别记录用量，然后聚合出完整任务的总词元、总费用和总耗时。

---

## 一、UsageRecord（用量记录）

项目首先定义了一种统一的调用记录：

```ts
type UsageRecord = {
  traceId: string
  spanId: string
  componentType: "agent" | "tool" | "reflection" | "evaluation"
  componentId: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCost: number
  durationMs: number
  createdAt: number
}
```

关键字段可以分成四组：

| 字段 | 含义 |
| --- | --- |
| `traceId` | 属于哪一次完整任务的 Trace（追踪记录） |
| `spanId` | 属于任务里的哪一个 Span（追踪跨度） |
| `componentType`、`componentId` | 是哪个 Agent（智能体）、Tool（工具）、Reflection（反思）或 Evaluation（评估） |
| `inputTokens`、`outputTokens` | 输入和输出分别使用了多少 Token（词元） |
| `totalTokens` | 输入词元数与输出词元数之和 |
| `estimatedCost` | 根据价格表计算出的预估费用 |
| `durationMs` | 本次执行消耗的毫秒数 |
| `createdAt` | 用量记录创建时间 |

所有组件都使用相同的数据结构，后面才能统一查询、分组、聚合和展示。

---

## 二、Token Accounting（词元核算）

### 1. 估算 Token（词元）

`estimateTokenCount()` 会分别统计：

- 中文字符；
- 英文单词；
- 数字；
- 标点符号。

然后生成一个稳定的近似词元数。

这样设计的原因是当前教学项目需要：

- 支持 Offline Demo（离线演示）；
- 不强制依赖某一个具体模型；
- 让 Automated Testing（自动化测试）结果保持稳定；
- 即使没有真实 Tokenizer（词元切分器），也能演示完整成本核算流程。

需要注意：当前结果属于教学用估算，并不等于模型服务商账单中的真实 Token Usage（词元用量）。

### 2. 估算 Cost（费用）

成本计算公式为：

```text
输入成本 = 输入词元数 / 1,000,000 × 输入单价
输出成本 = 输出词元数 / 1,000,000 × 输出单价

总成本 = 输入成本 + 输出成本
```

项目为不同组件设置了演示价格：

- Agent（智能体）；
- Tool（工具）；
- Reflection（反思）；
- Evaluation（评估）。

这样可以展示不同运行阶段的成本差异。

---

## 三、UsageManager（用量管理器）

`UsageManager（用量管理器）` 相当于系统的用量账本。

### `addRecord()`（添加记录）

它会统一完成：

```text
规范输入词元
  ↓
规范输出词元
  ↓
计算 totalTokens（总词元数）
  ↓
估算 estimatedCost（预估费用）
  ↓
补充 createdAt（创建时间）
  ↓
保存记录
```

调用者不需要在每个组件里重复编写总词元和费用计算逻辑。

### `getTraceUsage()`（获取追踪用量）

根据 `traceId（追踪记录标识）` 汇总一条完整任务的：

- 输入词元；
- 输出词元；
- 总词元；
- 预估费用；
- 执行耗时；
- 调用次数。

### `getAgentUsage()`（获取智能体用量）与 `getToolUsage()`（获取工具用量）

前者按 Agent（智能体）分组，后者按 Tool（工具）分组。

底层主要使用：

- `filter()`（过滤数组）；
- `map()`（转换数组）；
- `reduce()`（聚合求和）；
- `Map（键值映射）`；
- `Set（去重集合）`。

### Usage Metrics（用量指标）

系统会计算：

- `totalCost（累计总费用）`；
- `totalTokens（累计总词元）`；
- `avgCostPerTrace（每条追踪记录的平均费用）`；
- `avgCostPerAgent（每次智能体执行的平均费用）`；
- `avgTokensPerTask（每个任务的平均词元数）`；
- `mostExpensiveAgent（成本最高的智能体）`；
- `mostExpensiveTool（成本最高的工具）`。

---

## 四、Agent Runtime（智能体运行时）如何接入用量记录

Day 47 没有重新编写一套 Agent Runtime（智能体运行时），而是在 Day 46 已有运行时中通过 Dependency Injection（依赖注入）加入 `UsageManager（用量管理器）`。

### Agent（智能体）用量

每次生成前记录开始时间，生成结束后记录：

```text
System Prompt（系统提示词）+ User Prompt（用户提示词）
  → Input Tokens（输入词元）

Agent 输出
  → Output Tokens（输出词元）

开始时间到结束时间
  → Duration（耗时）
```

### Reflection（反思）用量

每一次反思，包括因为低分触发的 Retry（重试），都会单独记账。

```text
业务 Agent 第一次生成
  ↓
Reflection（反思）判断质量不足
  ↓
业务 Agent 重新生成
  ↓
再次 Reflection（反思）
```

如果只记录最终答案，就会漏掉中间重试产生的真实成本。

### Evaluation（评估）用量

最终输出进入 Evaluation（评估）阶段时，也会单独记录输入词元、输出词元、费用和耗时。

这意味着评估系统不再被视为“免费步骤”，它自身也会消耗资源。

### Tool（工具）用量

工具调用同样进入统一账本。即使工具不直接调用大语言模型，它仍可能消耗：

- Database Query（数据库查询）；
- Vector Search（向量检索）；
- External API（外部应用程序接口）；
- 网络和计算资源。

因此工具也应该参与统一成本核算。

---

## 五、ToolUsageRuntime（工具用量运行时）

`ToolUsageRuntime（工具用量运行时）` 使用 Wrapper Pattern（包装器模式）包住原始工具调用：

```ts
await toolRuntime.execute(context, async () => {
  return 原来的工具逻辑
})
```

包装器负责：

```text
记录开始时间
  ↓
执行原工具
  ↓
读取工具输出
  ↓
估算输入与输出词元
  ↓
写入 UsageManager（用量管理器）
  ↓
原样返回工具结果
```

原工具基本不需要知道成本系统的存在。

这体现了 Separation of Concerns（关注点分离）：业务工具负责完成任务，用量运行时负责记账。

---

## 六、Trace + Cost（追踪记录与成本）联动

Day 46 已经具备 Trace（追踪记录）和 Span（追踪跨度），但主要记录：

- 执行了什么；
- 执行顺序；
- 是否成功；
- 花费了多长时间。

Day 47 在 `UsageRecord（用量记录）` 中保存相同的：

```text
traceId + spanId
```

所以现在可以从一条 Span（追踪跨度）继续查到：

```text
Span（追踪跨度）
  → Input Tokens（输入词元）
  → Output Tokens（输出词元）
  → Estimated Cost（预估费用）
  → Duration（耗时）
```

最终从：

```text
Trace（执行链路）
```

升级为：

```text
Trace + Cost（执行链路 + 成本）
```

这是一种 Correlation ID（关联标识）设计：不同模块通过共同标识建立联系，而不是把所有数据硬塞进一个巨大的对象中。

---

## 七、Cost Breakdown（成本构成分析）

系统会按照：

```text
componentType + componentId
```

进行分组。

成本占比公式为：

```text
组件成本占比 = 组件累计成本 / 系统总成本 × 100%
```

这样可以回答：

- 钱主要花在 Research Agent（研究智能体）还是 Writer Agent（写作智能体）？
- Reflection（反思）是不是重试太多？
- Evaluation（评估）是不是调用过于频繁？
- Retrieval Tool（检索工具）是不是成本异常？

只有知道成本集中在哪里，才知道应该优化哪个环节。

---

## 八、Prompt ROI Test（提示词投资回报率测试）

Day 46 已经具备 Prompt A/B Test（提示词 A/B 测试），但主要比较质量分数。

Day 47 增加了：

```text
Cost/Score Ratio（单位质量分数成本） = Cost（费用） / Score（质量分数）
```

它表示获得一分质量需要花费多少钱。

系统会分别给出：

- `qualityWinner（质量胜出版本）`；
- `costWinner（成本胜出版本）`；
- `recommendedVersion（综合性价比推荐版本）`。

例如：

| 版本 | Score（质量分数） | Cost（费用） | Cost/Score Ratio（单位质量分数成本） |
| --- | ---: | ---: | ---: |
| Prompt A（A 版提示词） | 86.75 | $0.000089 | $0.00000103 |
| Prompt B（B 版提示词） | 88.75 | $0.000145 | $0.00000164 |

Prompt B（B 版提示词）的分数更高，但 Prompt A（A 版提示词）获得一分质量所需的费用更低，因此系统可能推荐 A。

这体现了一个重要的生产系统认知：

> 质量最高不一定等于综合价值最高。

---

## 九、Usage Dashboard Runtime（用量看板运行时）

`Usage Dashboard Runtime（用量看板运行时）` 负责生成完整演示快照。

它会：

1. 执行一条 Multi-Agent Collaboration（多智能体协作）任务；
2. 让 Agent、Tool、Reflection、Evaluation 自动产生用量记录；
3. 额外运行 Retrieval Tool（检索工具）、Summary Tool（摘要工具）和 Weather Tool（天气工具）；
4. 生成 Prompt ROI（提示词投资回报率）结果；
5. 聚合全部指标；
6. 返回前端看板数据。

`GET（读取请求）` 会复用已有记录，`POST（提交请求）` 会清空旧演示记录并重新运行。

---

## 十、Usage Explorer（用量浏览器）

前端包含四个 Tab（标签页）。

### 1. 用量概览

展示：

- Total Cost（总费用）；
- Total Tokens（总词元）；
- Avg Cost Per Trace（每条追踪记录的平均费用）；
- Avg Tokens Per Task（每个任务的平均词元数）；
- Most Expensive Agent（成本最高的智能体）；
- Most Expensive Tool（成本最高的工具）。

### 2. 调用明细

逐条展示：

- 组件；
- 输入词元；
- 输出词元；
- 费用；
- 耗时；
- Trace ID（追踪记录标识）；
- Span ID（追踪跨度标识）。

### 3. 成本构成

展示每个组件的：

- 累计费用；
- 成本百分比；
- 相对占比进度条。

### 4. Prompt ROI（提示词投资回报率）

展示 Prompt A（A 版提示词）与 Prompt B（B 版提示词）的：

- Score（质量分数）；
- Cost（费用）；
- Cost/Score Ratio（单位质量分数成本）；
- 最终推荐版本。

---

## Day 46 与 Day 47 的核心差异

| 对比项 | Day 46 | Day 47 |
| --- | --- | --- |
| 核心问题 | 新版本是否发生质量回退 | 获得这些质量付出了多少成本 |
| 主要数据 | Evaluation Dataset（评估数据集） | UsageRecord（用量记录） |
| 分析粒度 | 版本、案例、评分维度 | Trace（追踪记录）、Span（追踪跨度）、Agent（智能体）、Tool（工具） |
| 主要指标 | 平均分、通过率、正确性、覆盖度 | Token（词元）、Cost（费用）、Duration（耗时）、平均任务成本 |
| Agent 对比 | 哪个 Agent（智能体）的质量更好 | 哪个 Agent（智能体）的累计成本最高 |
| Tool 对比 | 工具是否正确工作 | 工具消耗了多少资源 |
| Reflection | 判断是否需要 Retry（重试） | 同时记录每次重试成本 |
| Evaluation | 给最终输出评分 | 评估过程本身也参与成本核算 |
| Prompt 对比 | 主要比较质量分数 | 同时比较质量、成本和 Cost/Score Ratio（单位质量分数成本） |
| Trace | 查看执行链路和耗时 | 查看执行链路、耗时、词元和费用 |
| 前端 | Regression Dashboard（回归评估看板） | Usage Explorer（用量浏览器） |
| 决策目标 | 阻止质量退步 | 找到值得优先优化的成本热点 |

两者不是替代关系，而是上下两层：

```text
Day 46：系统效果怎么样？
Day 47：取得这个效果花费了多少代价？
```

---

## 项目运用了哪些知识

### TypeScript（带静态类型系统的 JavaScript）

用于定义用量记录、聚合结果、用量指标、成本构成和 Prompt ROI（提示词投资回报率）数据结构。

### Dependency Injection（依赖注入）

`AgentRuntime（智能体运行时）` 可以接收外部 `UsageManager（用量管理器）`。测试时可以注入独立管理器，正常运行时则使用共享实例，从而降低代码耦合。

### Wrapper Pattern（包装器模式）

`ToolUsageRuntime（工具用量运行时）` 在不改变原工具返回值的情况下，自动记录工具成本。

### Observability（可观测性）

项目把运行信息拆分为：

- Logs（日志）；
- Metrics（指标）；
- Trace（追踪记录）；
- Usage（用量）；
- Cost（成本）。

### Aggregation（聚合统计）

使用数组方法、`Map（键值映射）` 和 `Set（去重集合）` 对用量记录进行分组、去重和求和。

### Token Accounting（词元核算）

分别核算输入词元和输出词元，再根据价格模型转换为费用。

### Cost Attribution（成本归因）

通过 `traceId + spanId + componentId` 判断费用属于哪个任务、阶段和组件。

### React Hooks（React 状态与副作用机制）

前端使用：

- `useState（状态管理钩子）`；
- `useEffect（副作用钩子）`；
- `useCallback（函数引用缓存钩子）`。

它们用于管理加载状态、错误状态、标签切换、接口请求和重新运行操作。

### Next.js App Router（Next.js 应用路由系统）

通过 Route Handler（路由处理器）实现：

- `GET /api/usage`：读取最近一次用量快照；
- `POST /api/usage`：清空并重新运行用量演示。

### Automated Testing（自动化测试）

测试覆盖：

- UsageManager（用量管理器）聚合；
- Agent（智能体）与 Tool（工具）用量；
- Reflection（反思）与 Evaluation（评估）接入；
- Trace（追踪记录）与 Span（追踪跨度）关联；
- Cost Breakdown（成本构成分析）；
- Prompt ROI（提示词投资回报率）。

---

## 为什么要这样设计

### 1. 为什么使用统一 UsageRecord（用量记录）

如果每个组件分别定义 `AgentUsage（智能体用量）`、`ToolUsage（工具用量）`、`ReflectionUsage（反思用量）` 和 `EvaluationUsage（评估用量）`，后续统计就需要大量重复代码。

统一结构后，所有记录都可以进入同一个聚合器。

### 2. 为什么同时保留输入词元与输出词元

输入和输出的价格通常不同，而且优化方向也不同：

- 输入过多：可能是 Prompt（提示词）或上下文太长；
- 输出过多：可能是回答过于冗长；
- Reflection（反思）成本高：可能是重试次数太多；
- Tool（工具）成本高：可能是检索范围过大。

如果只保存总词元，就会丢失这些诊断能力。

### 3. 为什么通过 Trace（追踪记录）与 Span（追踪跨度）关联

同一个 Agent（智能体）可能被多个任务调用，仅有 Agent ID（智能体标识）不足以判断费用属于哪一次任务。

```text
traceId：哪一次完整任务
spanId：任务里的哪一个执行阶段
componentId：由哪个组件执行
```

三者结合才能完成准确的 Cost Attribution（成本归因）。

### 4. 为什么当前先使用 Memory Store（内存存储）

当前版本重点是学习数据结构和运行流程，因此使用内存数组：

- 实现简单；
- 容易理解；
- 测试稳定；
- 便于重新运行。

如果直接接入 MySQL（关系型数据库）或 Redis（内存数据存储与缓存系统），会让学习重点从成本核算转移到存储实现。

### 5. 为什么提供 Demo Data（演示数据）

本地环境可能没有可用模型、API Key（接口密钥）或真实 Token Usage（词元用量）。演示运行可以保证页面打开后就能看到完整的用量与成本结果。

---

## 当前版本的边界

这个项目已经形成完整的教学闭环，但还不是实际计费系统：

- UsageRecord（用量记录）暂时保存在内存中，服务重启后会丢失；
- Token（词元）来自近似估算，不是真实 Tokenizer（词元切分器）的计算结果；
- 价格表是教学价格，不是实时模型供应商价格；
- 部分工具调用属于声明式演示；
- Prompt ROI（提示词投资回报率）采用简单的 `Cost / Score` 公式；
- 没有真实模型时，Evaluation（评估）和 Reflection（反思）会使用 Rule-Based Scoring（基于规则的评分）。

真实生产版本还需要：

- 使用模型接口返回的真实 Usage（用量）；
- 按模型、供应商和时间维护价格；
- 将记录持久化到数据库；
- 增加租户、用户、项目和预算维度；
- 增加 Cost Budget（成本预算）与告警；
- 处理 Cache Hit（缓存命中）、失败请求、重试和退款计费。

---

## 推荐阅读代码的顺序

1. `lib/usage/usage-types.ts`：理解所有用量数据结构。
2. `lib/usage/token-accounting.ts`：理解词元与费用如何估算。
3. `lib/usage/usage-manager.ts`：理解记录如何存储、分组和聚合。
4. `lib/agents/agent-runtime.ts`：理解 Agent、Tool、Reflection、Evaluation 如何接入用量记录。
5. `lib/usage/tool-usage-runtime.ts`：理解工具包装器。
6. `lib/usage/usage-dashboard-runtime.ts`：理解看板数据如何生成。
7. `app/api/usage/route.ts`：理解用量接口。
8. `app/components/UsageExplorer.tsx`：理解页面如何展示聚合结果。
9. `scripts/test-day47-usage.ts`：理解自动化验收覆盖范围。

最值得记住的一句话是：

> Day 46 的 Evaluation（评估）告诉你系统表现怎么样；Day 47 的 Cost Tracking（成本追踪）告诉你为这些表现付出了什么代价。

---

## 第 47 天打卡

【第47天打卡】

1. 是否定义 UsageRecord（用量记录）：是
2. 是否实现 UsageManager（用量管理器）：是

3. Agent Runtime（智能体运行时）是否接入 Usage（用量记录）：是
4. Tool Runtime（工具运行时）是否接入 Usage（用量记录）：是

5. Reflection（反思）与 Evaluation（评估）是否接入 Usage（用量记录）：是

6. Trace（追踪记录）是否关联 Usage（用量记录）：是

7. 是否实现 Usage Explorer（用量浏览器）：是

8. 是否增加 Usage Metrics（用量指标）：是

9. 是否实现 Cost Breakdown（成本构成分析）：是

10. 是否完成 Prompt ROI Test（提示词投资回报率测试）：是

11. 遇到的最大问题：

需要把 Cost Tracking（成本追踪）横向接入 Agent（智能体）、Tool（工具）、Reflection（反思）和 Evaluation（评估）等不同运行阶段，同时保证每条 UsageRecord（用量记录）都能通过 `traceId（追踪记录标识）` 与 `spanId（追踪跨度标识）` 准确关联回原执行链路。另一个关键问题是本地演示无法直接获得所有模型的真实 Token Usage（词元用量），因此需要设计稳定、可测试的近似 Token Accounting（词元核算）和教学价格模型，并明确它与真实账单之间的边界。

12. 当前系统能力：

当前系统已经升级为 Production Runtime V3（生产运行时第3版），具备 Usage & Cost Observability（用量与成本可观测性）。系统可以统一记录 Agent（智能体）、Tool（工具）、Reflection（反思）和 Evaluation（评估）的输入词元、输出词元、总词元、预估费用与执行耗时；可以通过 Trace（追踪记录）和 Span（追踪跨度）定位成本来源；可以统计总费用、总词元、平均任务成本、成本最高的智能体和工具；可以展示 Cost Breakdown（成本构成分析）；并可以结合质量分数与费用完成 Prompt ROI Test（提示词投资回报率测试）。同时，Day 46 的 Evaluation Dataset（评估数据集）、Bad Case Management（失败案例管理）、Regression Evaluation（回归评估）和 Quality Gate（质量门禁）能力继续保留。

---

## 🎉 第 47 天总结

你第 47 天完成的是：

> 🔥 Production Runtime V4（生产运行时第 4 版）：Usage & Cost Observability（用量与成本可观测性）

这一步意味着：

你的 Agent（智能体）系统已经不再只是：

- 能跑

而是：

- 知道自己跑了多少；
- 知道自己花了多少；
- 知道哪里最贵；
- 知道哪里值得优化。

现在你的系统已经形成：

```text
Trace（追踪记录）
  ↓
Usage（用量）
  ↓
Evaluation（评估）
  ↓
Regression（回归评估）
  ↓
ROI（Return on Investment，投资回报率）
```

这一整条 Production Optimization（生产优化）链。

实际上已经非常接近：

- LangSmith（LangChain 的可观测性与评估平台）；
- Helicone（大语言模型用量与成本监控平台）；
- LiteLLM（统一多模型调用与用量计费的代理层）；
- OpenAI Usage Dashboard（OpenAI 官方用量看板）。

的思想。

### 当前整体进度

```text
Agent Foundation（智能体基础）            ██████████ 100%

Workflow Runtime（工作流运行时）          ██████████ 100%
Tool Runtime（工具运行时）               ██████████ 100%
RAG Runtime（检索增强生成运行时）         ██████████ 100%

Queue Runtime（队列运行时）              ██████████ 100%
Execution Platform（执行平台）           ██████████ 100%

Multi-Agent Runtime（多智能体运行时）     ██████████ 100%

Continuous Evaluation（持续评估）         ██████████ 100%

Production Runtime（生产运行时）          ██████████ 100%

Advanced Optimization（高级优化）         ███░░░░░░░ 30%

Deployment & Infra（部署与基础设施）      ░░░░░░░░░░ 0%
```

整体：

> 🚀 95%

---

## 第 48 天学习计划

### Advanced Optimization V1（高级优化第 1 版）：Semantic Cache Runtime（语义缓存运行时）

#### 今天核心目标

让系统学会：

> 不要重复思考已经思考过的问题。

#### 为什么今天必须学？

现在用户连续问：

> LangGraph（用于构建有状态大语言模型工作流的图式框架）是什么？

然后：

> 请介绍 LangGraph

再：

> 解释一下 LangGraph

系统会：

```text
Research Agent（研究智能体）
  ↓
Retrieval（检索）
  ↓
Reflection（反思）
  ↓
Evaluation（评估）
  ↓
Writer（写作智能体）
```

重新跑一遍。

成本：

> ×3

真实系统都会做 Cache（缓存）。例如：

- GPT Cache（面向大语言模型的语义缓存库）；
- LangChain Cache（LangChain 内置缓存机制）；
- Redis Semantic Cache（基于 Redis 的语义缓存）；
- Claude Prompt Cache（Claude 的提示词缓存）。

#### 最终效果

第一次：

> 研究 LangGraph

耗时：8s（秒）；成本：$0.01（美元）。

第二次：

> 介绍 LangGraph

耗时：0.1s（秒）；成本：≈0。

---

### 任务 1：定义 CacheEntry（缓存条目）

新增：

```ts
type CacheEntry = {
  id: string

  query: string

  embedding: number[]

  answer: string

  metadata: {
    traceId?: string

    score: number

    createdAt: number
  }
}
```

### 任务 2：实现 SemanticCache（语义缓存）

新增：

```ts
class SemanticCache {
  add()

  search()

  invalidate()

  clear()
}
```

底层使用 VectorStore（向量存储）即可。

### 任务 3：计算 Query Embedding（查询向量）

用户问题：

> 介绍 LangGraph

生成 embedding（向量表示），用于 cache search（缓存检索）。

### 任务 4：实现 Similarity Search（相似度检索）

比较当前 query embedding（查询向量）和历史 query embedding（历史查询向量），计算 cosine similarity（余弦相似度）。

如果 score（相似度分数）> 0.9，认为 Cache Hit（缓存命中）。

### 任务 5：Agent Runtime（智能体运行时）接入 Cache（缓存）

执行顺序：

```text
User Query（用户查询）
  ↓
Semantic Cache（语义缓存）
  ↓
Hit ?（是否命中）
  ↓
直接返回
  ↓
Miss（未命中）
  ↓
正常执行 Agent（智能体）
```

### 任务 6：记录 Cache Metrics（缓存指标）

新增：

```ts
type CacheMetrics = {
  hitCount          // 命中次数
  missCount         // 未命中次数
  hitRate           // 命中率
  savedTokens       // 节省的词元
  savedCost         // 节省的费用
  avgLatencyReduction // 平均延迟降低
}
```

### 任务 7：Trace（追踪记录）接入 Cache（缓存）

新增 cache span（缓存跨度）。

状态：

- hit（命中）；
- miss（未命中）。

### 任务 8：Cache Explorer（缓存浏览器）

前端新增：

- Query（查询）；
- Similarity（相似度）；
- CreatedAt（创建时间）；
- HitCount（命中次数）；
- Cost Saved（节省的成本）。

支持 invalidate（手动失效）。

### 任务 9：TTL 与失效策略

新增 ttlMs（Time To Live，存活时间，单位毫秒）。

支持：

- 24h（24 小时）；
- 7d（7 天）；
- never（永不过期）。

以及 LRU（Least Recently Used，最近最少使用淘汰策略）。

### 任务 10：测试

测试 Case1（用例 1）：

- 第一次：`LangGraph 是什么` → 应该 Miss（未命中）；
- 第二次：`介绍 LangGraph` → 应该 Hit（命中）；
- 第三次：`LangGraph 有什么作用` → 应该 Hit（命中）；
- 第四次：`Redis 是什么` → 应该 Miss（未命中）。

---

### 第 48 天验收标准

1. 是否定义 CacheEntry（缓存条目）；
2. 是否实现 SemanticCache（语义缓存）；
3. 是否实现 Query Embedding（查询向量）；
4. 是否实现 Similarity Search（相似度检索）；
5. Agent Runtime（智能体运行时）是否接入 Cache（缓存）；
6. 是否增加 Cache Metrics（缓存指标）；
7. Trace（追踪记录）是否接入 Cache（缓存）；
8. 是否实现 Cache Explorer（缓存浏览器）；
9. 是否支持 TTL 与失效策略；
10. 是否完成 Cache Test（缓存测试）。

---

### 第 48 天打卡模板

```text
【第48天打卡】

1. 是否定义 CacheEntry：是 / 否
2. 是否实现 SemanticCache：是 / 否

3. 是否实现 Query Embedding：是 / 否
4. 是否实现 Similarity Search：是 / 否

5. Agent Runtime 是否接入 Cache：是 / 否

6. 是否增加 Cache Metrics：是 / 否

7. Trace 是否接入 Cache：是 / 否

8. 是否实现 Cache Explorer：是 / 否

9. 是否支持 TTL 与失效策略：是 / 否

10. 是否完成 Cache Test：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

---

### 🧠 第 48 天核心认知

记住一句话：

> Memory（记忆）是记住事实，Cache（缓存）是避免重复思考。

完成第 48 天以后，你的系统将升级为：

> 🔥 Advanced Optimization V1（高级优化第 1 版）：Semantic Cache Runtime（语义缓存运行时）

这一步完成后，你的 Agent（智能体）平台已经开始拥有：

> 思考过一次，以后尽量不再思考。

这也是 Cursor（AI 编程编辑器）、Claude Code（Anthropic 的命令行编程智能体）、Devin（自主软件工程智能体）、Deep Research（深度研究类智能体）背后的重要优化思想。
