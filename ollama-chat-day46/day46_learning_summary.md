# Day 46 Learning Summary（第46天学习总结）

## 文档范围

本文档整理围绕 `ollama-chat-day46` 项目学习与理解的对话，包含学习问题和对应回答。

按照要求，本文档不记录创建文件夹、复制项目、修改代码、运行测试和检查页面等项目实施过程的聊天，只保留用于理解项目设计、技术知识、版本改进和设计原因的内容。

---

## 问题 1：Day 46 项目做了什么

### 我问

```text
带我来读懂 ollama-chat-day46 这个文件夹中的项目做了什么，运用了什么知识，对比 ollama-chat-day45 有什么改进，为什么这样子做（对于一些英文术语后面加上括号，并用中文翻译或描述下）。
```

### 回答

## 一句话理解

`ollama-chat-day46` 把第45天的“判断一次回答好不好”，升级成了“使用固定测试集判断一次系统改动有没有造成质量退步”。

核心流程如下：

```text
Evaluation（单次评估）
  ↓
Evaluation Dataset（固定评估数据集）
  ↓
Baseline（基线版本）与 Candidate（候选版本）
  ↓
Regression Comparison（回归对比）
  ↓
Quality Gate（质量门禁）
  ↓
决定候选版本能不能通过
```

## 项目具体做了什么

### 1. 建立固定 Evaluation Dataset（评估数据集）

项目在 `lib/evaluation/evaluation-dataset.ts` 中建立了一套固定数据集，目前包含 7 个案例：

- 正常知识问答。
- 版本发布规划。
- 天气工具调用。
- 历史事实错误。
- 部署计划遗漏回滚。
- 空输入处理。
- 长文本超时隔离。

案例被分成三类：

- `Normal Case（正常案例）`。
- `Bad Case（失败案例）`。
- `Edge Case（边界案例）`。

每个 `EvaluationCase（评估案例）` 都会保存：

- 唯一标识。
- 输入问题或任务。
- 期望输出或参考答案。
- `Rubric（评分规则）`。
- 标签。
- 难度。
- 优先级。
- 案例来源。

这样做是因为不同版本必须回答同一批问题，比较结果才公平。如果每次使用不同问题测试，那么分数高低就没有稳定的可比性。

### 2. 使用稳定规则评分

项目会根据答案是否覆盖评分规则要求的关键词，计算四个维度：

- `Completeness（完整性）`。
- `Correctness（正确性）`。
- `Relevance（相关性）`。
- `Coverage（覆盖度）`。

四个维度按照各自的权重合成为综合分。

当前实现属于 `Rule-Based Evaluation（基于规则的评估）`。它的优点是：

- 结果稳定。
- 可以重复执行。
- 不依赖外部模型也能测试。
- 容易判断测试为什么通过或失败。

它的局限是只能检查关键词覆盖情况，暂时不能像真正的大语言模型一样理解完整语义。

### 3. 实现 Batch Evaluation Runner（批量评估运行器）

`runBatchEvaluation（运行批量评估）` 会负责：

- 批量执行数据集里的全部案例。
- 限制 `Concurrency（并发数量）`。
- 保存实际输出、分数、状态、耗时和模型调用次数。
- 统计平均分、通过率和各维度平均分。
- 捕获单个案例异常并继续执行后续案例。

这里使用了：

- `Promise.all（并行等待多个异步任务完成）`。
- 固定数量的 `Worker（工作协程）`。
- `Fault Isolation（故障隔离）`。

单案例异常隔离非常重要。例如 7 个案例中的第 4 个失败时，后面 3 个案例仍然应该继续运行，不能因为一个失败就丢失整批评估结果。

### 4. 保存 Baseline（基线版本）

项目使用 `BaselineStore（基线仓储）` 保存稳定版本的完整评估结果，包括：

- 模型版本。
- `Prompt Version（提示词版本）`。
- `Workflow Version（工作流版本）`。
- 数据集版本。
- 每个案例的实际输出。
- 每个案例的评分和耗时。
- 全局平均分。
- 通过率。
- 各评分维度平均值。

基线不能只保存一个总分。

如果候选版本分数下降，系统必须能够继续回答：

```text
到底是哪个案例发生了退步？
哪个评分维度发生了下降？
基线输出和候选输出有什么区别？
```

因此，保存完整案例明细比只保存总分更有解释能力。

### 5. 比较 Baseline（基线版本）与 Candidate（候选版本）

`Regression Comparison（回归对比）` 会把案例分为：

- `Improved Cases（改进案例）`。
- `Unchanged Cases（未变化案例）`。
- `Regressed Cases（退步案例）`。

它还会识别：

- `New Failures（新增失败）`。
- `Fixed Failures（已修复失败）`。
- `Unresolved Failures（仍未解决的失败）`。

每个退步案例都会记录：

- 基线分数。
- 候选分数。
- 分数变化。
- 基线输出。
- 候选输出。
- 输出差异。
- 退步原因。

这使开发者不只能看到“总分下降了”，还可以直接定位具体问题。

### 6. 实现 Bad Case Management（失败案例管理）

`BadCaseStore（失败案例仓储）` 会记录：

- 失败类型。
- 失败严重程度。
- 影响范围。
- 对应的 `Agent（智能体）`。
- `Prompt Version（提示词版本）`。
- `Trace ID（追踪记录标识）`。
- 问题是否已经修复。
- 修复后是否通过回归评估。

这样，过去出现的问题就不再只是日志中的一条错误，而会转化成可以长期保留和重复验证的测试案例。

这里体现了一项重要的工程思想：

```text
每发现一次线上问题，就补充一个回归案例，防止相同问题再次出现。
```

### 7. 增加 Quality Gate（质量门禁）

默认的 `Quality Gate（质量门禁）` 会检查：

- 整体平均分不能低于基线。
- 通过率不能下降。
- 正确性分数不能明显下降。
- 高优先级案例不能发生退步。
- 严重失败案例必须全部通过。

这里最重要的一点是：系统不能只看平均分。

例如，大量普通案例都得到了提升，但一个关键的天气工具调用案例发生了退步，整体平均分仍然可能上涨。如果只检查平均分，这个严重问题就可能被隐藏。

因此，质量门禁还需要单独检查高优先级案例和严重失败案例。

当前演示中，`Candidate（候选版本）` 会故意让天气工具调用发生退步，并模拟一个长文本超时。因此，`Quality Gate（质量门禁）` 会显示未通过。

这是为了证明门禁能够发现问题并阻止候选版本通过，不代表批量评估程序自身运行失败。

### 8. 接入 Observability（可观测性）系统

完整批量评估过程会写入：

- `Workspace（工作空间）`：保存评估结论和待修复问题。
- `Timeline（时间线）`：保存批量案例的执行顺序。
- `Trace（追踪记录）`：定位具体案例、评分阶段和失败原因。

这样，系统不仅可以告诉开发者“质量门禁失败”，还可以继续追查：

```text
哪个版本
  ↓
哪个案例
  ↓
哪个执行阶段
  ↓
得了多少分
  ↓
为什么失败
```

### 9. 增加 Regression API（回归评估接口）与 Regression Dashboard（回归评估看板）

项目新增 `/api/regression` 接口：

- `GET（读取请求）`：读取最近一次回归评估结果。
- `POST（提交请求）`：强制重新运行回归评估。

前端新增 `Regression Dashboard（回归评估看板）`，包含三个标签页：

- 回归概览。
- 失败案例。
- 运行记录。

看板可以展示：

- 数据集名称、版本和案例数量。
- 基线版本与候选版本信息。
- 平均分、通过率和耗时。
- 四个评分维度的变化。
- 改进案例和退步案例。
- 失败案例及其修复状态。
- 质量门禁最终结果。
- `Workspace（工作空间）`、`Timeline（时间线）` 和 `Trace（追踪记录）` 信息。

## 与 Day 45（第45天）相比有什么改进

| 对比项 | Day 45（第45天） | Day 46（第46天） |
| --- | --- | --- |
| 核心问题 | 这一次回答好不好 | 这次改动有没有让原有能力变差 |
| 测试对象 | 当前一次输出 | 固定测试集上的多个版本 |
| 数据基础 | 单次运行记录 | 可版本化的 Evaluation Dataset（评估数据集） |
| 对比方式 | Prompt A/B Test（提示词 A/B 测试） | 完整的 Baseline（基线版本）与 Candidate（候选版本）回归对比 |
| 失败处理 | 显示低分任务 | 把失败沉淀为长期 Bad Case（失败案例） |
| 运行方式 | 单个输出评估 | 带并发限制的 Batch Evaluation（批量评估） |
| 异常处理 | 当前任务失败 | 单案例失败不影响整个批任务 |
| 版本决策 | 提供评分数据 | Quality Gate（质量门禁）自动决定是否阻断 |
| 可观测性 | 记录一次评估 | 记录整批案例、版本比较和门禁结果 |
| 前端展示 | Evaluation Explorer（评估浏览器） | Regression Dashboard（回归评估看板） |

第45天更像一个“质量检查员”，负责检查当前答案。

第46天则开始具备“自动化质量保障系统”的形态，负责维护测试集、重复比较版本并阻止质量回退。

## 项目运用了哪些知识

### Next.js（基于 React 的全栈框架）

用于构建页面、客户端组件和后端 `API（应用程序接口）`。

### React Hooks（React 状态与副作用机制）

用于加载回归结果、切换标签页、显示加载状态和重新运行评估。

### TypeScript（带类型系统的 JavaScript）

用于定义评估案例、数据集、基线、批量运行结果、回归报告和质量门禁结构。

### Regression Testing（回归测试）

用于验证新版本没有破坏原来已经具备的能力。

### Dataset Versioning（数据集版本管理）

用于保证基线版本和候选版本使用同一批案例进行比较。

### Weighted Scoring（加权评分）

用于把完整性、正确性、相关性和覆盖度组合成综合分数。

### Concurrency Control（并发控制）

用于限制同一时间执行的案例数量，避免批量任务一次占用过多模型和系统资源。

### Fault Isolation（故障隔离）

用于确保单个案例执行失败时，整个批量评估仍然能够继续完成。

### Dependency Injection（依赖注入）

批量运行器通过参数接收案例执行函数。当前可以使用固定测试输出，将来可以替换为真正的 Ollama 模型调用，而不需要重写批量调度逻辑。

### Repository Pattern（仓储模式）

项目通过 `BaselineStore（基线仓储）` 和 `BadCaseStore（失败案例仓储）` 隔离业务逻辑与存储实现。

当前使用内存实现，将来可以替换为 `MySQL（关系型数据库）` 或其他持久化方案。

### Observability（可观测性）

通过 `Workspace（工作空间）`、`Timeline（时间线）` 和 `Trace（追踪记录）` 保存批量评估现场。

### Quality Gate（质量门禁）

用于把质量指标转换成明确、可自动执行的版本验收规则。

### Caching（缓存）

普通读取可以复用最近一次评估结果，只有强制重新运行时才重新执行完整流程。

### Automated Testing（自动化测试）

用于验证数据集结构、异常隔离、基线读取、回归分类、质量门禁和可观测性写入是否正确。

## 为什么要从 Day 45（第45天）升级到 Day 46（第46天）

第45天已经可以回答：

```text
这次 Agent（智能体）的输出质量怎么样？
```

但它还不能稳定回答：

```text
修改 Prompt（提示词）、Workflow（工作流）或者模型参数以后，系统整体真的变好了吗？
有没有某些原本会做的事情反而变差了？
```

单次评估存在几个问题：

- 每次输入可能不同，结果不能直接比较。
- 一个高分答案不能证明整个系统都得到提升。
- 平均分可能掩盖关键案例退步。
- 历史错误没有变成长期测试资产。
- 系统只能发现问题，不能自动阻止问题版本通过。

第46天通过固定数据集、版本化基线、失败案例管理和质量门禁，把单次评估升级为可重复执行的工程闭环。

## 当前实现的边界

当前版本已经展示了完整的持续评估流程，但仍然属于教学型实现。

### 1. 输出暂时来自 Test Fixture（测试夹具）

基线版本和候选版本的输出目前是代码中预先定义的稳定示例，还没有真正调用 Ollama 分别运行两个系统版本。

这样做的优点是离线测试稳定、结果可重复；后续可以把执行函数替换为真实模型调用。

### 2. 存储暂时是 Memory Store（内存仓储）

`BaselineStore（基线仓储）` 和 `BadCaseStore（失败案例仓储）` 当前保存在内存中，服务重启后数据会消失。

生产环境通常需要接入数据库或者对象存储。

### 3. 评分暂时以关键词覆盖为主

当前评分规则容易解释，但不能充分理解同义表达、推理过程和事实真假。

后续可以结合：

- `LLM-as-a-Judge（使用大语言模型担任评审）`。
- 人工审核。
- 工具调用结果校验。
- 结构化输出校验。
- 多轮一致性测试。

### 4. 尚未接入 CI/CD（持续集成与持续交付）

现在的质量门禁会生成通过或阻断结果，但还没有接入真正的发布流水线。

生产环境可以让门禁失败时自动阻止合并代码或发布版本。

### 5. 数据集规模较小

当前只有 7 个案例，适合展示持续评估流程，但不足以代表生产系统的全部能力。

后续应该持续把线上失败、用户反馈和历史回归问题补充到数据集中。

## 推荐阅读代码的顺序

1. `lib/evaluation/regression-types.ts`：先理解所有数据结构。
2. `lib/evaluation/evaluation-dataset.ts`：查看固定测试案例和评分规则。
3. `lib/evaluation/batch-evaluation-runner.ts`：理解批量执行、评分和异常隔离。
4. `lib/evaluation/baseline-store.ts`：理解基线为什么要保存完整明细。
5. `lib/evaluation/regression-comparison.ts`：理解版本变化如何分类。
6. `lib/evaluation/quality-gate.ts`：理解什么情况下阻止候选版本通过。
7. `lib/evaluation/bad-case-store.ts`：理解失败案例如何沉淀和更新状态。
8. `lib/evaluation/regression-runtime.ts`：理解整个持续评估闭环如何编排。
9. `app/api/regression/route.ts`：理解前端如何读取和重新运行评估。
10. `app/components/RegressionDashboard.tsx`：理解回归评估看板如何展示结果。
11. `scripts/test-day46-regression.ts`：查看自动化测试如何验证核心能力。
12. `day46_test_cases.md`：按照测试文档进行完整验收。

## 第46天核心认知

```text
Evaluation（评估）回答：“这次输出好不好？”

Regression Evaluation（回归评估）回答：“这次改动有没有让原来会做的事情变差？”
```

第45天建立了评估能力，第46天则把评估能力升级成可以长期积累失败案例、重复验证不同版本并阻止质量回退的 `Continuous Evaluation System（持续评估系统）`。

---

## 第46天学习总结

`ollama-chat-day46` 最重要的变化不是简单增加一个评分页面，而是建立了一套可重复执行的质量回归机制。

这套机制通过 `Evaluation Dataset（评估数据集）` 固定测试范围，通过 `Baseline（基线版本）` 保存稳定参照，通过 `Candidate（候选版本）` 表示系统改动，通过 `Regression Comparison（回归对比）` 找出进步和退步，再通过 `Quality Gate（质量门禁）` 决定是否接受改动。

与此同时，系统会把失败结果沉淀为 `Bad Case（失败案例）`，并把评估过程写入 `Workspace（工作空间）`、`Timeline（时间线）` 和 `Trace（追踪记录）`，从而让质量问题可以被查看、解释、定位、修复和重复验证。

这使项目从“能够评价答案质量”，继续升级为“能够使用数据判断系统改动是否可靠”。

---

## 第47天任务：Production Runtime V3（生产运行时第3版）——Cost Tracking & Token Accounting（成本追踪与词元核算）

### 第47天学习计划

第47天的学习主题是 `Production Runtime V3（生产运行时第3版）`，重点实现 `Cost Tracking（成本追踪）` 与 `Token Accounting（词元核算）`。

### 今天的核心目标

让系统具备以下能力：

- 知道一次任务花费了多少钱。
- 知道哪个 `Agent（智能体）` 的成本最高。
- 知道哪个 `Tool（工具）` 消耗的 `Token（词元）` 最多。
- 知道系统的哪些部分最值得优化。

### 为什么必须学习成本追踪

当前系统已经具备：

- `Trace（追踪记录）`。
- `Metrics（指标）`。
- `Evaluation（评估）`。
- `Reflection（反思）`。

但是，系统还不能回答下面这些问题：

- `Research Agent（研究智能体）` 一次任务使用了多少 `Token（词元）`？
- `Reflection（反思）` 重试花费了多少钱？
- 哪个 `Prompt（提示词）` 最浪费资源？
- 哪个 `Tool（工具）` 的 `ROI（投资回报率，表示投入成本与产出价值之间的关系）` 最低？

真实的生产系统通常都会提供 `Cost Observability（成本可观测性）`，例如：

- `LangSmith（LangChain 提供的大语言模型应用观测与评估平台）`。
- `Helicone（大语言模型调用监控与成本分析平台）`。
- `OpenAI Usage Dashboard（OpenAI 用量与费用控制台）`。
- `LiteLLM（统一管理多种大语言模型调用的代理与网关）`。
- `OpenRouter（统一路由和调用多种大语言模型的平台）`。

这些平台不仅记录系统做了什么，还会记录每次调用消耗了多少 `Token（词元）`、产生了多少费用，以及成本主要集中在哪里。

### 最终效果

当系统执行下面的任务时：

```text
研究 LangGraph（用于构建有状态大语言模型工作流的图式框架）
```

任务结束后，可以查看单个智能体的用量：

```text
Research Agent（研究智能体）

Input Tokens（输入词元数）:
2100

Output Tokens（输出词元数）:
980

Cost（费用）:
$0.0032

Duration（耗时）:
8.1s
```

还可以查看整个任务的汇总指标：

```text
Total Cost（总费用）
$0.012

Total Tokens（总词元数）
9380

Most Expensive Agent（成本最高的智能体）
Research Agent（研究智能体）

Most Expensive Tool（成本最高的工具）
Retrieval Tool（检索工具）
```

## 任务 1：定义 UsageRecord（用量记录）

新增统一的 `UsageRecord（用量记录）` 类型：

```ts
type UsageRecord = {
  traceId: string

  spanId: string

  componentType:
    | "agent"
    | "tool"
    | "reflection"
    | "evaluation"

  componentId: string

  inputTokens: number

  outputTokens: number

  totalTokens: number

  estimatedCost: number

  durationMs: number

  createdAt: number
}
```

各字段的含义如下：

- `traceId（追踪记录标识）`：关联本次完整任务的 `Trace（追踪记录）`。
- `spanId（追踪跨度标识）`：关联任务中的某个具体执行阶段。
- `componentType（组件类型）`：区分智能体、工具、反思和评估阶段。
- `componentId（组件标识）`：记录具体是哪个智能体或工具。
- `inputTokens（输入词元数）`：发送给模型的词元数量。
- `outputTokens（输出词元数）`：模型生成的词元数量。
- `totalTokens（总词元数）`：输入词元数与输出词元数之和。
- `estimatedCost（预估费用）`：根据模型价格计算的调用成本。
- `durationMs（耗时毫秒数）`：本次组件执行耗时。
- `createdAt（创建时间）`：用量记录生成时间。

## 任务 2：实现 UsageManager（用量管理器）

新增 `UsageManager（用量管理器）`：

```ts
class UsageManager {
  addRecord()

  listRecords()

  getTraceUsage()

  getAgentUsage()

  getToolUsage()
}
```

各方法的职责如下：

- `addRecord（添加记录）`：写入一次组件调用的词元和费用记录。
- `listRecords（列出记录）`：读取全部用量记录。
- `getTraceUsage（获取追踪用量）`：汇总某个完整任务的用量。
- `getAgentUsage（获取智能体用量）`：按智能体统计词元、费用和耗时。
- `getToolUsage（获取工具用量）`：按工具统计词元、费用和耗时。

## 任务 3：Agent Runtime（智能体运行时）接入 Usage（用量记录）

执行 `Research Agent（研究智能体）` 等智能体时，需要记录：

- `Input Tokens（输入词元数）`。
- `Output Tokens（输出词元数）`。
- `Total Tokens（总词元数）`。
- `Cost（费用）`。
- `Duration（耗时）`。

通过这一步，系统可以比较不同智能体的资源消耗，并定位成本最高的智能体。

## 任务 4：Tool Runtime（工具运行时）接入 Usage（用量记录）

为工具调用记录用量，至少包括：

- `Retrieval Tool（检索工具）`。
- `Summary Tool（摘要工具）`。
- `Weather Tool（天气工具）`。

工具本身不一定直接调用大语言模型，但仍可能消耗模型、数据库、向量检索和外部接口资源，因此也应该纳入统一成本统计。

## 任务 5：Reflection（反思）与 Evaluation（评估）接入 Usage（用量记录）

记录以下组件的词元和费用：

- `Reflection Agent（反思智能体）`。
- `Evaluation Agent（评估智能体）`。

反思重试和评估调用都可能显著增加总成本。如果只记录最终回答，就会低估真实任务费用。

## 任务 6：Trace（追踪记录）与 Usage（用量记录）联动

一条完整的 `Trace（追踪记录）` 示例：

```text
Trace #123（追踪记录 #123）
  ↓
Span（追踪跨度）
  ↓
Usage（用量记录）
```

最终形成：

```text
Trace + Cost（追踪记录 + 成本）
```

这样不仅能看到任务执行了哪些步骤，还能看到每个步骤消耗了多少词元和费用。

## 任务 7：实现 Usage Explorer（用量浏览器）

前端新增 `Usage Explorer（用量浏览器）`，至少展示：

- `Agent（智能体）`。
- `Input Tokens（输入词元数）`。
- `Output Tokens（输出词元数）`。
- `Cost（费用）`。
- `Duration（耗时）`。

用户可以通过该面板查看每次调用的具体用量，并定位异常昂贵的执行步骤。

## 任务 8：增加 Usage Metrics（用量指标）

新增 `UsageMetrics（用量指标）` 类型：

```ts
type UsageMetrics = {
  totalCost

  totalTokens

  avgCostPerTrace

  avgCostPerAgent

  avgTokensPerTask

  mostExpensiveAgent

  mostExpensiveTool
}
```

各项指标的含义如下：

- `totalCost（总费用）`：系统累计产生的预估费用。
- `totalTokens（总词元数）`：系统累计使用的输入和输出词元。
- `avgCostPerTrace（每条追踪记录的平均费用）`：一次完整任务平均花费多少钱。
- `avgCostPerAgent（每个智能体的平均费用）`：一次智能体执行平均花费多少钱。
- `avgTokensPerTask（每个任务的平均词元数）`：单个任务平均消耗多少词元。
- `mostExpensiveAgent（成本最高的智能体）`：累计费用最高的智能体。
- `mostExpensiveTool（成本最高的工具）`：累计费用最高的工具。

## 任务 9：实现 Cost Breakdown（成本构成分析）

前端展示不同组件的成本占比，例如：

```text
Research Agent（研究智能体）
38%

Planner Agent（规划智能体）
12%

Writer Agent（写作智能体）
15%

Reflection（反思）
20%

Evaluation（评估）
15%
```

`Cost Breakdown（成本构成分析）` 要帮助系统回答：

```text
钱主要花在了哪里？
```

只有知道成本分布，开发者才能判断应该优化模型、提示词、工具调用、反思次数还是评估策略。

## 任务 10：实现 Prompt ROI Test（提示词投资回报率测试）

继续比较：

- `Prompt A（A 版提示词）`。
- `Prompt B（B 版提示词）`。

除质量分数外，还要比较：

- `Score（质量分数）`。
- `Cost（费用）`。
- `Cost/Score Ratio（单位质量分数成本，表示获得一分质量需要付出的费用）`。

目标是找到同时满足下面两个条件的提示词：

- 效果最好。
- 成本最低。

一个提示词即使分数更高，如果费用增加过多，也不一定是更好的生产方案。

## 第47天验收标准

1. 是否定义 `UsageRecord（用量记录）`。
2. 是否实现 `UsageManager（用量管理器）`。
3. `Agent Runtime（智能体运行时）` 是否接入 `Usage（用量记录）`。
4. `Tool Runtime（工具运行时）` 是否接入 `Usage（用量记录）`。
5. `Reflection（反思）` 与 `Evaluation（评估）` 是否接入 `Usage（用量记录）`。
6. `Trace（追踪记录）` 是否关联 `Usage（用量记录）`。
7. 是否实现 `Usage Explorer（用量浏览器）`。
8. 是否增加 `Usage Metrics（用量指标）`。
9. 是否实现 `Cost Breakdown（成本构成分析）`。
10. 是否完成 `Prompt ROI Test（提示词投资回报率测试）`。

## 第47天打卡模板

```text
【第47天打卡】

1. 是否定义 UsageRecord（用量记录）：是 / 否
2. 是否实现 UsageManager（用量管理器）：是 / 否

3. Agent Runtime（智能体运行时）是否接入 Usage（用量记录）：是 / 否
4. Tool Runtime（工具运行时）是否接入 Usage（用量记录）：是 / 否

5. Reflection（反思）与 Evaluation（评估）是否接入 Usage（用量记录）：是 / 否

6. Trace（追踪记录）是否关联 Usage（用量记录）：是 / 否

7. 是否实现 Usage Explorer（用量浏览器）：是 / 否

8. 是否增加 Usage Metrics（用量指标）：是 / 否

9. 是否实现 Cost Breakdown（成本构成分析）：是 / 否

10. 是否完成 Prompt ROI Test（提示词投资回报率测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：
```

## 第47天核心认知

记住下面这句话：

```text
Metrics（指标）告诉你系统表现如何，
Cost Tracking（成本追踪）告诉你取得这些表现付出了什么代价。
```

完成第47天以后，系统将升级为：

```text
Production Runtime V3（生产运行时第3版）：Usage & Cost Observability（用量与成本可观测性）
```

完成这一步后，学习将开始进入真正的生产级 `Agent Platform Optimization（智能体平台优化）` 阶段。

## Day 48～Day 55（第48天至第55天）后续学习方向

后续阶段将继续学习：

- `Cache Runtime（缓存运行时）`。
- `Long-term Memory V2（长期记忆第2版）`。
- `Model Router（模型路由器）`。
- `Fallback Model（备用模型或降级模型）`。
- `Multi-Model System（多模型系统）`。
- `Deployment（部署）`。
- `Redis（内存数据存储与缓存系统）`。
- `Docker（容器化平台）`。
- `CI/CD（持续集成与持续交付）`。

这一阶段属于整个学习路线最后约 7% 的内容，也是难度最高、但最接近工业级系统实践的部分。
