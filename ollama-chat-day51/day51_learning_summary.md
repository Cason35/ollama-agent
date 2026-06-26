# Day 51 Learning Summary（第 51 天学习总结）

## 文档范围

本文档整理围绕 `ollama-chat-day51` 项目学习与理解的对话，包含学习问题与对应回答。

按照要求，本文档不记录创建文件夹、复制项目、修改代码、安装依赖、运行测试和启动服务等项目实施过程，只保留用于理解项目设计、技术知识、版本改进和设计原因的内容。

---

## 问题 1：Day 51 项目做了什么、运用了什么知识、相比 Day 50 有什么改进、为什么这样做？

### 我问

> 带我来读懂 `ollama-chat-day51` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day50` 有什么改进，为什么这样子做（且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述）。

### 回答

#### 一句话理解 Day 51

`ollama-chat-day51` 可以这样理解：

> Day 51 在 Day 50 的 Model Router（模型路由器）基础上，补上了 Model Fallback（模型降级备用）和 Circuit Breaker（熔断器），让系统不只是“知道该用哪个模型”，还知道“这个模型坏了该怎么办”。

Day 50 的重点是：

```text
不同任务
→ 选择不同模型
```

Day 51 的重点是：

```text
模型失败
→ 自动重试
→ 自动切换备用模型
→ 连续失败后暂时熔断
→ 全部失败时返回降级响应
```

所以 Day 51 的主题是：

> Advanced Optimization V4（高级优化第 4 版）：Resilient Multi-Model Runtime（具备容错能力的多模型运行时）

#### Day 51 做了什么

Day 50 已经能按任务选模型：

- summary（总结）任务走 `small-chat`（小型对话模型）。
- planning（规划）任务走 `large-reasoning`（大型推理模型）。
- JSON（结构化数据格式）任务走 `json-structured`（结构化 JSON 模型）。
- evaluation（评估）任务走 `evaluation`（评估模型）。
- embedding（向量嵌入）任务走 `embedding`（嵌入模型）。

Day 51 在这套模型路由之上，新增了一层失败恢复能力。

核心落地能力如下：

| 能力 | 中文说明 | 主要位置 |
| --- | --- | --- |
| `fallbackModelIds` | 备用模型 ID 列表，主模型失败后按顺序尝试 | `lib/model/model-profile-types.ts`、`default-models.ts` |
| `timeoutMs` | 单次模型调用超时时间 | `ModelProfile`（模型档案） |
| `maxRetries` | 同一个模型失败后的最大重试次数 | `ModelProfile`（模型档案） |
| `ModelCallResult` | 模型调用结果，统一记录成功、失败、输出、错误、备用链和耗时 | `model-profile-types.ts` |
| `CircuitBreakerManager` | 熔断器管理器，记录模型失败次数、成功率和熔断状态 | `circuit-breaker-manager.ts` |
| `ModelExecutor` | 模型执行器，统一处理超时、重试、备用模型链和降级响应 | `model-executor.ts` |
| `ModelRouter` 避开熔断模型 | 路由时跳过 open（熔断开启）状态的模型 | `model-router.ts` |
| `Trace / Usage` | 追踪与用量统计记录 `fallbackUsed`、`fallbackChain`、`circuitState` | `usage-types.ts`、`usage-manager.ts` |
| `Model Health Dashboard` | 模型健康仪表盘，展示熔断状态、失败次数、成功率和备用链触发情况 | `ModelHealthDashboard.tsx` |
| Day 51 测试 | 自动化验证 fallback（备用模型）、circuit breaker（熔断器）和 health snapshot（健康快照） | `scripts/test-day51-fallback-circuit.ts` |

#### 核心机制

Day 51 的模型调用链路变成：

```text
ModelRouter（模型路由器）决定首选模型
→ ModelExecutor（模型执行器）真正调用
→ 如果失败：Retry（重试）
→ 仍失败：Fallback Chain（备用模型链）
→ 连续失败：Circuit Breaker Open（熔断开启）
→ 全部失败：Degraded Response（降级响应）
```

比如一个复杂规划任务，本来应该走：

```text
large-reasoning（大型推理模型）
```

但如果它失败，系统会按照备用链尝试：

```text
large-reasoning（大型推理模型）
→ json-structured（结构化 JSON 模型）
→ small-chat（小型对话模型）
```

如果 `large-reasoning` 连续失败达到阈值，Circuit Breaker（熔断器）会把它标记为 `open`（熔断开启）。之后 ModelRouter（模型路由器）会主动避开它，不再把新请求继续打到这个不稳定模型上。

#### 运用了什么知识

1. Fallback Chain（备用模型链）

主模型失败后，不是直接失败，而是按顺序尝试备用模型。

例如：

```text
primary model（主模型）
→ fallback model 1（备用模型 1）
→ fallback model 2（备用模型 2）
```

这样可以提高 Availability（可用性），让系统在局部模型异常时仍然能继续服务。

2. Circuit Breaker（熔断器）

Circuit Breaker（熔断器）是一种常见的稳定性模式。它的作用是：

> 当某个下游服务或模型连续失败时，暂时停止调用它，避免继续浪费请求和拖慢系统。

Day 51 里定义了三种状态：

| 状态 | 中文说明 |
| --- | --- |
| `closed` | 闭合状态，模型正常可用 |
| `open` | 熔断开启，模型暂时不可调用 |
| `half_open` | 半开状态，冷却期后允许少量请求试探恢复 |

状态流转大致是：

```text
closed（正常）
→ 连续失败
→ open（熔断）
→ 冷却时间结束
→ half_open（半开试探）
→ 成功则 closed（恢复正常）
→ 失败则 open（重新熔断）
```

3. Retry（重试）

Retry（重试）用于处理偶发失败，比如网络抖动、模型进程短暂繁忙、请求临时超时。

它和 fallback（备用模型）不同：

- Retry（重试）：还是调用同一个模型。
- Fallback（备用模型）：换另一个模型调用。

4. Timeout（超时控制）

Timeout（超时控制）用于避免模型长时间不返回。Day 51 中的 ModelExecutor（模型执行器）会为模型调用设置超时，超过指定时间就把这次调用视为失败。

这能避免一个慢模型把整个用户请求卡死。

5. Degraded Response（降级响应）

如果主模型和备用模型全部失败，系统不会直接崩溃，而是返回一个可控的降级文案。

例如：

```text
模型服务暂时不可用，系统已返回降级响应，请稍后重试或切换模型。
```

这属于 Graceful Degradation（优雅降级）：能力变弱，但服务仍然有明确反馈。

6. Observability（可观测性）

Day 51 不只做了失败处理，还把失败处理结果展示出来。

Model Health Dashboard（模型健康仪表盘）会展示：

- `state`（熔断状态）
- `failureCount`（连续失败次数）
- `successRate`（成功率）
- `fallbackUsedCount`（备用链触发次数）
- `lastFailureAt`（最近失败时间）
- `skippedCount`（因熔断被跳过次数）

这让系统可以回答：

```text
哪个模型最近不稳定？
哪个模型经常触发 fallback？
当前有哪些模型正在熔断？
```

7. Dependency Injection（依赖注入）

`ModelExecutor`（模型执行器）、`ModelRouter`（模型路由器）和 `CircuitBreakerManager`（熔断器管理器）都支持注入依赖。

这样测试时可以注入一个假的 ModelCaller（模型调用器），模拟模型成功、失败、超时，而不用真的请求 Ollama（本地模型运行框架）或 MiMo（小米模型服务）。

这让 Day 51 的自动化测试可以稳定验证失败恢复逻辑。

#### 相比 Day 50 有什么改进

Day 50 的核心问题是：

> 该用谁？

也就是 Model Router（模型路由器）根据任务类型、复杂度、JSON（结构化数据格式）要求、延迟偏好等条件选择模型。

Day 51 的核心问题是：

> 它坏了怎么办？

也就是模型调用失败、超时、不稳定时，系统如何继续工作。

对比如下：

| 维度 | Day 50 | Day 51 |
| --- | --- | --- |
| 主题 | Multi-Model Routing Runtime（多模型路由运行时） | Resilient Multi-Model Runtime（具备容错能力的多模型运行时） |
| 核心问题 | 不同任务该用哪个模型 | 模型失败、超时、不稳定时怎么办 |
| 核心对象 | `ModelRouter`（模型路由器） | `ModelExecutor`（模型执行器）、`CircuitBreakerManager`（熔断器管理器） |
| 模型档案 | 描述模型能力、成本、速度、质量 | 增加 fallback（备用模型）、timeout（超时）、retry（重试）配置 |
| 调用失败 | 缺少统一失败恢复层 | 自动 retry（重试）、fallback（备用模型）、degraded response（降级响应） |
| 路由行为 | 只按规则选模型 | 会避开 open（熔断开启）的模型 |
| 用量统计 | 记录 `modelId / provider / modelName` | 追加 `fallbackUsed / fallbackChain / circuitState` |
| 前端看板 | Model Explorer（模型浏览器） | 新增 Model Health Dashboard（模型健康仪表盘） |
| 测试重点 | 路由规则是否正确 | 失败、备用、熔断、半开恢复是否正确 |

一句话概括：

> Day 50 让系统会“选模型”，Day 51 让系统在“模型坏掉时还能稳住”。

#### 为什么这样做

真实系统里，模型调用一定会出现失败。

可能出现的问题包括：

- Ollama（本地模型运行框架）没启动。
- 某个本地模型没有 pull（拉取到本地）。
- 模型响应太慢。
- Cloud Provider（云端模型提供方）超时。
- 某个模型输出为空。
- JSON（结构化数据格式）模型输出漂移，导致解析失败。
- 网络临时抖动。

如果没有 Day 51 这层保护，一次模型失败就可能导致整个请求失败。

所以 Day 51 把职责拆开：

| 组件 | 负责什么 |
| --- | --- |
| ModelRouter（模型路由器） | 负责“应该选哪个模型” |
| ModelExecutor（模型执行器） | 负责“怎么安全地调用模型” |
| CircuitBreakerManager（熔断器管理器） | 负责“哪个模型最近不稳定，先别继续调用它” |
| Usage（用量统计） | 负责“记录哪次调用用了备用模型” |
| Trace（追踪记录） | 负责“记录调用链路和失败恢复过程” |
| Model Health Dashboard（模型健康仪表盘） | 负责“把模型健康状态展示出来” |

这样的拆分有几个好处：

1. 业务层更简单

业务代码只需要说：

```ts
modelExecutor.call({ modelId, prompt, options })
```

它不用自己处理超时、重试、备用模型、熔断器和降级响应。

2. 系统更稳定

某个模型坏了，不会拖垮整个系统。

3. 成本和质量可控

复杂任务优先走大模型，但大模型失败时可以先降级到中等模型，再降级到小模型。

4. 问题更容易定位

通过 fallbackChain（备用模型链）、circuitState（熔断状态）、lastFailureAt（最近失败时间），可以知道失败发生在哪里。

---

## 问题 2：ModelExecutor 是怎么安全调用的，会有什么意外吗？

### 我问

> ModelExecutor（模型执行器）：负责“怎么安全地调用”。这个是怎么安全调用的，会有什么意外吗？

### 回答

这里的“安全调用”不是指网络安全或权限安全，而是指 Runtime Safety（运行时安全）和 Fault Tolerance（故障容错）。

也就是说：

> 模型失败时，业务不会直接崩掉，而是进入一套可控的失败处理链路。

#### ModelExecutor 怎么安全调用

1. 先确定 primary model（主模型）

调用方会传入一个 `modelId`（模型 ID），例如：

```text
small-chat（小型对话模型）
large-reasoning（大型推理模型）
json-structured（结构化 JSON 模型）
```

ModelExecutor（模型执行器）先从 ModelRegistry（模型注册表）中读取这个模型的 ModelProfile（模型档案）。

2. 构造 fallback chain（备用模型链）

`buildFallbackChain`（构建备用链）会把：

```text
主模型 + fallbackModelIds（备用模型 ID 列表）
```

拼成实际调用链。

例如：

```text
large-reasoning（大型推理模型）
→ json-structured（结构化 JSON 模型）
→ small-chat（小型对话模型）
```

3. 调用前检查 Circuit Breaker（熔断器）

每次真正调用某个模型前，ModelExecutor（模型执行器）会先问 CircuitBreakerManager（熔断器管理器）：

```text
这个模型现在能不能调用？
```

如果模型处于 `open`（熔断开启）状态，就跳过它，不继续把请求打到这个坏模型上。

4. 每次调用都有 Timeout（超时控制）

ModelExecutor（模型执行器）用 `Promise.race`（Promise 竞速）做超时控制：

```text
模型调用
vs
超时定时器
```

谁先完成就采用谁。如果超过 `timeoutMs`（超时时间），这次模型调用就被视为失败。

5. 失败会 recordFailure（记录失败）

如果模型返回失败、空内容或超时，ModelExecutor（模型执行器）会调用：

```text
recordFailure（记录失败）
```

CircuitBreakerManager（熔断器管理器）会增加该模型的 `failureCount`（连续失败次数）。

当连续失败达到阈值后，模型会进入：

```text
open（熔断开启）
```

6. 成功会 recordSuccess（记录成功）

如果模型成功返回有效内容，ModelExecutor（模型执行器）会调用：

```text
recordSuccess（记录成功）
```

这会清空该模型的连续失败计数，并让模型恢复到：

```text
closed（正常闭合）
```

7. 全部失败就返回 degraded response（降级响应）

如果主模型和所有备用模型都失败，ModelExecutor（模型执行器）不会把异常直接丢给用户，而是返回一个可控结果：

```text
模型服务暂时不可用，系统已返回降级响应，请稍后重试或切换模型。
```

这就是 Degraded Response（降级响应）。

#### 会有什么意外吗？

会。Day 51 已经比 Day 50 稳很多，但它不是“永远不会失败”。

1. 备用模型也可能不可用

例如本地只安装了 `qwen2.5:14b`，但 fallback chain（备用模型链）里写了：

```text
qwen2.5:7b
qwen2.5:3b
```

如果这些模型没有 pull（拉取到本地），备用模型也会失败，最后只能走 degraded response（降级响应）。

2. fallback（备用模型）可能导致质量下降

例如：

```text
large-reasoning（大型推理模型）
→ small-chat（小型对话模型）
```

系统仍然能返回内容，但复杂推理质量可能下降。

这是 Availability（可用性）和 Quality（质量）之间的取舍。

3. 当前熔断状态是 in-memory state（内存状态）

CircuitBreakerManager（熔断器管理器）的状态保存在内存里。

这意味着：

```text
服务重启
→ 熔断状态清空
```

教学项目这样做足够简单清楚，但生产系统通常会把熔断状态或健康统计接到 Redis（远程缓存数据库）或 Database（数据库）。

4. Timeout（超时）不一定能真正杀死所有底层任务

当前默认调用 Ollama（本地模型运行框架）时，底层还有 AbortController（请求中止控制器），比较稳。

但如果将来注入一个自定义 ModelCaller（模型调用器），它不理会中止信号，那么 ModelExecutor（模型执行器）虽然已经不等它了，底层任务仍可能在后台继续跑完。

5. fallback（备用模型）不一定能力等价

例如 embedding（向量嵌入）任务理论上需要 embedding model（嵌入模型）。

如果它失败后回退到 chat model（对话模型），对话模型不能真的生成可用于向量检索的 embedding（向量嵌入），最多只能返回一段降级说明。

所以 fallback chain（备用模型链）要按任务类型谨慎配置。

6. 连续失败阈值需要调优

如果阈值太低，模型可能因为偶发错误被过早熔断。

如果阈值太高，系统会继续把请求打到已经明显不稳定的模型上。

这属于 Reliability Tuning（可靠性调优）。

#### 总结一句

ModelExecutor（模型执行器）的安全调用靠的是：

```text
Timeout（超时）
+ Retry（重试）
+ Fallback Chain（备用模型链）
+ Circuit Breaker（熔断器）
+ Degraded Response（降级响应）
+ Trace / Usage（追踪与用量统计）
```

它不能保证每次都拿到高质量模型结果，但能保证模型坏掉时系统尽量不直接崩溃。

---

## 第 51 天打卡（已完成）

```text
【第51天打卡】

1. ModelProfile（模型档案）是否支持 fallback（备用模型）配置：是
2. 是否定义 ModelCallResult（模型调用结果）：是

3. 是否实现 ModelExecutor（模型执行器）：是
4. 是否实现 fallback chain（备用模型链）：是

5. 是否实现 CircuitBreaker（熔断器）：是
6. 是否实现 CircuitBreakerManager（熔断器管理器）：是

7. ModelRouter（模型路由器）是否避开熔断模型：是
8. Trace / Usage（追踪与用量统计）是否记录 fallback（备用模型）信息：是

9. 是否实现 Model Health Dashboard（模型健康仪表盘）：是
10. 是否完成 fallback / circuit breaker（备用模型 / 熔断器）测试：是

11. 遇到的最大问题：
理解“安全调用”并不等于模型永远成功，而是把失败变成可控流程。
Day 51 最大的认知点是区分 ModelRouter（模型路由器）和 ModelExecutor（模型执行器）的职责：
ModelRouter（模型路由器）负责“该用谁”，ModelExecutor（模型执行器）负责“怎么安全地调用”。
同时还要理解 fallback（备用模型）不是无损替代，模型能力可能下降；Circuit Breaker（熔断器）也不是修复模型，只是暂时避开不稳定模型。

12. 当前系统能力：
系统升级为 Advanced Optimization V4（高级优化第 4 版）：Resilient Multi-Model Runtime（具备容错能力的多模型运行时）。
当前系统已经具备按任务选择模型、按失败自动重试、按备用链切换模型、连续失败后熔断不稳定模型、冷却后 half-open（半开状态）试探恢复、全部失败时返回 degraded response（降级响应）的能力。
同时，Usage（用量统计）和 Trace（追踪记录）可以记录 fallbackUsed（是否使用备用模型）、fallbackChain（备用模型链）和 circuitState（熔断状态），Model Health Dashboard（模型健康仪表盘）可以展示 state（状态）、failureCount（失败次数）、successRate（成功率）、fallbackUsedCount（备用链触发次数）和 lastFailureAt（最近失败时间）。
至此，系统从 Day 50 的 Multi-Model Routing Runtime（多模型路由运行时）升级为 Day 51 的 Resilient Multi-Model Runtime（具备容错能力的多模型运行时）。
```

---

## 第 51 天核心认知

记住一句话：

> ModelRouter（模型路由器）解决“该用谁”，ModelExecutor（模型执行器）解决“怎么安全地调用”，Fallback + Circuit Breaker（备用模型链 + 熔断器）解决“它坏了怎么办”。

完成第 51 天后，系统升级为：

> Advanced Optimization V4（高级优化第 4 版）：Resilient Multi-Model Runtime（具备容错能力的多模型运行时）

---

## 第 51 天补充总结与第 52 天学习计划

### 第 51 天补充总结

第 51 天完成的是：

> Advanced Optimization V4（高级优化第 4 版）：Resilient Multi-Model Runtime（具备容错能力的多模型运行时）

这一步非常关键。

Day 50 解决的是：

> 该用哪个模型？

Day 51 解决的是：

> 模型坏了怎么办？

现在系统已经具备：

| 能力 | 中文说明 |
| --- | --- |
| ModelExecutor（模型执行器） | 统一处理模型调用、超时、重试、备用模型链和降级响应。 |
| fallback chain（备用模型链） | 主模型失败后，按顺序尝试备用模型。 |
| CircuitBreaker（熔断器） | 某个模型连续失败后，暂时停止调用它。 |
| CircuitBreakerManager（熔断器管理器） | 集中维护模型的熔断状态、失败次数、成功率和恢复试探。 |
| ModelRouter（模型路由器）避开熔断模型 | 路由时跳过 open（熔断开启）状态的模型。 |
| Trace / Usage（追踪与用量统计）记录 fallback（备用模型）信息 | 记录 `fallbackUsed`（是否使用备用模型）、`fallbackChain`（备用模型链）和 `circuitState`（熔断状态）。 |
| Model Health Dashboard（模型健康仪表盘） | 展示模型状态、失败次数、成功率、最近失败时间和备用链触发次数。 |
| fallback / circuit breaker（备用模型 / 熔断器）测试 | 自动化验证主模型成功、备用模型成功、熔断打开、半开恢复和降级响应。 |

这意味着 Agent Platform（智能体平台）开始具备生产系统必需的 Disaster Recovery（容灾能力）和 Fault Tolerance（故障容错能力）。

一句话概括：

> Day 50 让系统会“选模型”，Day 51 让系统在“模型坏掉时还能稳住”。

---

### 第 52 天学习计划

第 52 天主题是：

> Advanced Optimization V5（高级优化第 5 版）：Prompt Versioning & Prompt Registry（提示词版本管理与提示词注册表）

今日核心目标：

> 让所有 Prompt（提示词）都有版本、有来源、有评估、有回滚能力。

#### 为什么第 52 天必须做

现在系统已经有：

| 已有能力 | 中文说明 |
| --- | --- |
| Model Router（模型路由器） | 按任务选择合适模型。 |
| Fallback（备用模型） | 模型失败时自动切换备用模型。 |
| Evaluation（评估） | 对输出质量进行评分和分析。 |
| Regression（回归评估） | 对比新旧版本，发现质量退步。 |
| Prompt A/B Test（提示词 A/B 测试） | 对比两套提示词的质量和成本表现。 |

但如果 Prompt（提示词）还散落在代码里，例如：

```ts
const prompt = `你是一个...`;
```

会出现几个问题：

1. 不知道当前用的是哪个 Prompt Version（提示词版本）。
2. Prompt（提示词）改坏了不好 Rollback（回滚）。
3. Evaluation（评估）没法明确比较不同版本。
4. Usage / Trace（用量统计 / 追踪记录）里看不到 prompt version（提示词版本）。
5. 多 Agent（智能体）、多 Tool（工具）、多 Model（模型）之后，Prompt Management（提示词管理）会混乱。

所以第 52 天要做：

> Prompt Registry（提示词注册表）

#### 第 52 天最终效果

系统执行时可以看到类似信息：

```text
Research Agent（研究智能体）
Prompt（提示词）：research.v3

Score（评分）：88
Cost（成本）：$0.008
Model（模型）：large-reasoning（大型推理模型）

Compared with（对比版本）：research.v2
+3 score（评分提升 3 分）
+12% cost（成本增加 12%）
```

并且可以：

- 切换到 v2（第 2 版）。
- 回滚到 v1（第 1 版）。
- 禁用 v4（第 4 版）。

---

### 任务 1：定义 PromptTemplate（提示词模板）

`PromptTemplate`（提示词模板）用于描述一条可版本化、可渲染、可激活和可归档的 Prompt（提示词）。

```ts
type PromptTemplate = {
  id: string;

  name: string;

  componentType:
    | "agent"
    | "tool"
    | "reflection"
    | "evaluation"
    | "supervisor";

  componentId: string;

  version: string;

  template: string;

  variables: string[];

  status: "draft" | "active" | "archived";

  createdAt: number;
  updatedAt: number;
};
```

字段说明：

| 字段 | 中文说明 |
| --- | --- |
| `id` | Prompt（提示词）的唯一标识。 |
| `name` | Prompt（提示词）的可读名称。 |
| `componentType` | 组件类型，例如 agent（智能体）、tool（工具）、reflection（反思）、evaluation（评估）或 supervisor（调度器）。 |
| `componentId` | 使用该 Prompt（提示词）的组件 ID。 |
| `version` | Prompt Version（提示词版本），例如 `v1`、`v2`、`v3`。 |
| `template` | Prompt Template（提示词模板）正文。 |
| `variables` | 模板变量列表。 |
| `status` | 状态：draft（草稿）、active（启用中）、archived（已归档）。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

---

### 任务 2：实现 PromptRegistry（提示词注册表）

`PromptRegistry`（提示词注册表）负责集中保存、查询、激活和归档 Prompt（提示词）。

```ts
class PromptRegistry {
  register(prompt: PromptTemplate): void;

  getActive(componentId: string): PromptTemplate | null;

  getVersion(componentId: string, version: string): PromptTemplate | null;

  list(componentId?: string): PromptTemplate[];

  activate(componentId: string, version: string): void;

  archive(componentId: string, version: string): void;
}
```

核心能力：

- `register`（注册）：登记新的 PromptTemplate（提示词模板）。
- `getActive`（获取启用版本）：获取某个组件当前 active（启用中）的 Prompt（提示词）。
- `getVersion`（获取指定版本）：按 componentId（组件 ID）和 version（版本）读取 Prompt（提示词）。
- `list`（列表）：列出全部或某个组件的 Prompt（提示词）。
- `activate`（激活）：把某个版本设为 active（启用中）。
- `archive`（归档）：把某个版本设为 archived（已归档）。

---

### 任务 3：Prompt Renderer（提示词渲染器）

新增：

```ts
renderPrompt(
  template: PromptTemplate,
  variables: Record<string, string>
);
```

Prompt Renderer（提示词渲染器）负责把模板变量替换成真实运行时内容。

支持变量：

| 变量 | 中文说明 |
| --- | --- |
| `{{task}}` | 当前任务。 |
| `{{memory}}` | Memory（记忆）上下文。 |
| `{{workspace}}` | Workspace（工作空间）上下文。 |
| `{{tools}}` | Tool（工具）列表或工具上下文。 |

如果变量缺失，需要明确报错或 fallback（兜底）到安全文案，避免生成残缺 Prompt（提示词）。

---

### 任务 4：Agent Runtime 接入 PromptRegistry

之前 Agent Runtime（智能体运行时）直接使用：

```ts
agent.systemPrompt;
```

升级为：

```ts
const promptTemplate = promptRegistry.getActive(agent.id);
const prompt = renderPrompt(promptTemplate, variables);
```

也就是：

```text
Agent（智能体）
→ 读取当前 active（启用中）的 PromptTemplate（提示词模板）
→ renderPrompt（渲染提示词）
→ 执行模型调用
```

这样 Agent（智能体）使用的 Prompt（提示词）就有了明确版本。

---

### 任务 5：Tool / Reflection / Evaluation 接入 PromptRegistry

需要把这些 Prompt（提示词）从代码里抽出来：

| Prompt（提示词） | 中文说明 |
| --- | --- |
| supervisor prompt（调度器提示词） | 用于生成多智能体协作计划。 |
| reflection prompt（反思提示词） | 用于审查输出质量并提出重试建议。 |
| evaluation prompt（评估提示词） | 用于对输出质量评分。 |
| query rewrite prompt（查询改写提示词） | 用于把用户查询改写为更适合检索的问题。 |
| rag prompt（检索增强生成提示词） | 用于结合检索结果回答问题。 |
| writer prompt（写作智能体提示词） | 用于整合前置结果并生成最终回答。 |
| critic prompt（审查智能体提示词） | 用于发现风险、漏洞和遗漏。 |

目标是让 Agent（智能体）、Tool（工具）、Reflection（反思）和 Evaluation（评估）都使用 PromptRegistry（提示词注册表）管理 Prompt（提示词）。

---

### 任务 6：Trace / Usage / Evaluation 记录 promptVersion

Trace Span Metadata（追踪跨度元数据）增加：

```ts
{
  promptId,
  promptVersion
}
```

UsageRecord（用量记录）增加：

```ts
promptId?: string;
promptVersion?: string;
```

EvaluationResult（评估结果）增加：

```ts
promptVersion?: string;
```

这样系统可以回答：

- 这次调用用了哪个 Prompt（提示词）？
- 哪个 Prompt Version（提示词版本）带来了更高评分？
- 哪个 Prompt Version（提示词版本）成本更高？
- 哪次 Regression（回归评估）是由 Prompt（提示词）变更引起的？

---

### 任务 7：Prompt Explorer（提示词浏览器）

前端新增 Prompt Explorer（提示词浏览器）。

展示字段：

| 字段 | 中文说明 |
| --- | --- |
| Component（组件） | 使用该 Prompt（提示词）的组件。 |
| Version（版本） | Prompt Version（提示词版本）。 |
| Status（状态） | draft（草稿）、active（启用中）或 archived（已归档）。 |
| Variables（变量） | Prompt Template（提示词模板）所需变量。 |
| UpdatedAt（更新时间） | 最近更新时间。 |

支持操作：

- Activate（激活）
- Archive（归档）
- Compare（比较）

---

### 任务 8：Prompt Diff（提示词差异对比）

实现简单文本 diff（差异对比）。

先比较：

```text
research.v2（研究提示词第 2 版）
research.v3（研究提示词第 3 版）
```

展示：

```text
新增：
- 请给出来源

删除：
- 简短回答即可
```

第 52 天可以先做 line-level diff（行级差异对比），也就是按行比较新增和删除内容。

---

### 任务 9：Prompt Regression Link（提示词回归关联）

把 Day 46 的 Regression Evaluation（回归评估）与 Prompt Version（提示词版本）关联。

回归报告显示：

```text
Baseline（基线版本）：research.v2
Candidate（候选版本）：research.v3
Result（结果）：passed / failed（通过 / 失败）
```

这样就能明确知道：

> 是哪个 Prompt Version（提示词版本）导致质量提升或退步。

---

### 任务 10：Prompt Rollback（提示词回滚）

如果 candidate（候选版本）失败，可以执行：

```ts
promptRegistry.activate("research", "v2");
```

前端按钮：

```text
Rollback to v2（回滚到第 2 版）
```

Prompt Rollback（提示词回滚）的价值是：

- 新版本 Prompt（提示词）改坏时可以快速恢复。
- Evaluation（评估）或 Regression（回归评估）失败时可以自动或手动回退。
- 生产系统不需要紧急改代码就能恢复旧提示词。

---

### 第 52 天验收标准

1. 是否定义 PromptTemplate（提示词模板）。
2. 是否实现 PromptRegistry（提示词注册表）。
3. 是否实现 renderPrompt（渲染提示词）。
4. Agent Runtime（智能体运行时）是否接入 PromptRegistry（提示词注册表）。
5. Tool / Reflection / Evaluation（工具 / 反思 / 评估）是否接入 PromptRegistry（提示词注册表）。
6. Trace / Usage / Evaluation（追踪 / 用量统计 / 评估）是否记录 promptVersion（提示词版本）。
7. 是否实现 Prompt Explorer（提示词浏览器）。
8. 是否实现 Prompt Diff（提示词差异对比）。
9. Regression Evaluation（回归评估）是否关联 Prompt Version（提示词版本）。
10. 是否支持 Prompt Rollback（提示词回滚）。

---

### 第 52 天打卡模板

```text
【第52天打卡】

1. 是否定义 PromptTemplate（提示词模板）：是 / 否
2. 是否实现 PromptRegistry（提示词注册表）：是 / 否

3. 是否实现 renderPrompt（渲染提示词）：是 / 否
4. Agent Runtime（智能体运行时）是否接入 PromptRegistry（提示词注册表）：是 / 否

5. Tool / Reflection / Evaluation（工具 / 反思 / 评估）是否接入 PromptRegistry（提示词注册表）：是 / 否
6. Trace / Usage / Evaluation（追踪 / 用量统计 / 评估）是否记录 promptVersion（提示词版本）：是 / 否

7. 是否实现 Prompt Explorer（提示词浏览器）：是 / 否
8. 是否实现 Prompt Diff（提示词差异对比）：是 / 否

9. Regression Evaluation（回归评估）是否关联 Prompt Version（提示词版本）：是 / 否
10. 是否支持 Prompt Rollback（提示词回滚）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

---

### 第 52 天核心认知

记住一句话：

> Model（模型）决定能力上限，Prompt（提示词）决定能力释放方式。

完成第 52 天后，系统会升级为：

> Advanced Optimization V5（高级优化第 5 版）：Prompt Lifecycle Management（提示词生命周期管理）
