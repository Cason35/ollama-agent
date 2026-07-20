# Day71 学习总结：Production Evaluation Platform V2（生产评估平台第 2 版）

## 一、文档说明

本文档整理第 71 天项目完成后的学习交流内容，包含：

- `ollama-chat-day71` 项目做了什么。
- Day71 运用了哪些技术与架构知识。
- Day71 相比 Day70 有什么改进。
- 为什么需要 Evaluation Platform（评估平台）。
- 使用生活中的例子理解 Day71。
- 如何结合 V1 / V2 版本对比、用户偏好和内部质量评分持续优化 Agent（智能体）。
- 已完成状态的第 71 天打卡内容。

本文档不记录创建文件、修改代码、执行命令等项目代码修改过程，只保留与 Day71 知识理解有关的提问和回答。

---

## 二、对话一：Day71 项目做了什么

### 用户提问

> 带我来读懂 `ollama-chat-day71` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day70` 有什么改进，为什么这样子做？且一些英文专业术语后面补充一个括号，补充其中文名称或者中文描述。

### 回答

一句话概括：

> Day70 让 Agent Workflow（智能体工作流）可靠地执行；Day71 在此基础上判断它执行得好不好，并把线上问题变成后续必须通过的 Regression Test（回归测试）。

### 1. Day71 的整体架构

Day71 没有替换 Day70，而是在 Day70 上方增加了一层 Evaluation Platform（评估平台）。

```text
Evaluation Explorer V2（评估浏览器第 2 版）
        ↓
Evaluation API（评估接口）
        ↓
ProductionEvaluationPlatform（生产评估平台）
        ↓
EvaluationPlatformRuntime（评估平台运行时）
        ├─ DatasetProvider V2（数据集提供者第 2 版）
        ├─ Business Runtime（业务运行时）
        ├─ Evaluation Strategy Registry（评估策略注册中心）
        ├─ Trace（链路追踪）
        ├─ RuntimeContext（运行时上下文）
        ├─ EventBus（事件总线）
        └─ EvaluationRun / Result / Metrics（评估运行 / 结果 / 指标）
```

它形成的完整质量闭环是：

```text
生产请求
  → 运行 Agent / Workflow / Prompt / RAG / Memory
  → 收集输出、延迟、成本、引用
  → 多个 Evaluator（评估器）评分
  → 生成 EvaluationRun（评估运行实例）
  → 与历史 Baseline（基线版本）比较
  → Quality Gate（质量门禁）
  → 收集用户反馈
  → 生成 Bad Case（坏案例）
  → 加入 Dataset（数据集）
  → 下次 Regression Test（回归测试）
```

Day71 最终希望形成：

```text
Observe（观察）
  → Evaluate（评估）
  → Diagnose（诊断）
  → Improve（改进）
  → Validate（验证）
```

### 2. Domain Model（领域模型）

Day71 定义了生产评估平台的核心数据结构。

#### EvaluationScore（多维评估分数）

```text
correctness（正确性）
relevance（相关性）
completeness（完整性）
safety（安全性）
latency（延迟表现）
cost（成本表现）
overall（综合评分）
```

为什么不能只返回一个总分？

假设两个回答都是 8 分：

- 回答 A 的正确性很高，但是成本很高。
- 回答 B 的正确性略低，但是延迟和成本都更好。

如果只有总分，就无法知道应该优化 Prompt（提示词）、Model（模型）、RAG（检索增强生成）、上下文长度还是调用成本。

多维度评分能够帮助开发和运维人员定位问题：

- 正确性低：可能是模型知识能力、提示词或引用有问题。
- 完整性低：可能是输出约束或提示词要求不完整。
- 相关性低：可能是模型答非所问或检索上下文不相关。
- 安全性低：可能包含敏感信息、违规内容或危险建议。
- 延迟得分低：可能是模型过大、调用链过长或检索步骤过多。
- 成本得分低：可能是上下文太长、重复调用模型或使用了昂贵模型。

#### EvaluationDatasetV2（评估数据集第 2 版）

Day71 将评估数据集升级为平台级数据集，统一支持：

- Agent Dataset（智能体评估数据集）。
- Workflow Dataset（工作流评估数据集）。
- Prompt Dataset（提示词评估数据集）。
- RAG Dataset（检索增强生成评估数据集）。
- Memory Dataset（记忆评估数据集）。

每个 EvaluationCase（评估案例）可以保存：

- Input（输入）。
- Expected Output（期望输出）。
- Expected Keywords（期望关键词）。
- Priority（优先级）。
- Pass Threshold（通过阈值）。
- Source（案例来源）。
- Latency Budget（延迟预算）。
- Cost Budget（成本预算）。
- Knowledge Base（知识库）、Index Version（索引版本）或工作流诊断信息。

#### EvaluationRun（评估运行实例）

EvaluationRun（评估运行实例）不只是一个分数，而是一场完整的评估运行。

状态生命周期为：

```text
created（已创建）
  → running（运行中）
  → completed（已完成）或 failed（失败）
```

一次评估运行会记录：

- 使用哪个 Dataset（数据集）。
- 属于 Online（在线）、Offline（离线）、Regression（回归）还是 Experiment（实验）评估。
- 关联哪个 RuntimeContext（运行时上下文）。
- 关联哪些 Trace（链路追踪）。
- 产生了哪些案例结果。
- 最终的多维评分。
- Token Usage（令牌用量）、延迟和成本。
- 开始时间和完成时间。

这样 Prompt V1（提示词第 1 版）和 Prompt V2（提示词第 2 版）就可以作为两个独立运行保存、追踪和比较。

### 3. Dataset Provider（数据集提供者）

Day71 使用 EvaluationDatasetProviderV2（评估数据集提供者第 2 版）管理数据集版本。

它提供：

- `register()`：注册数据集版本。
- `get()`：读取指定版本或最新活动版本。
- `appendCase()`：把线上问题追加成新的回归案例。

这里使用了 Provider Pattern（提供者模式）。

Evaluation Runner（评估执行器）不需要知道数据来自：

- Memory（内存）。
- MySQL / PostgreSQL（关系型数据库）。
- File（文件）。
- Object Storage（对象存储）。
- Remote Dataset Service（远程数据集服务）。

目前项目使用 In-memory Provider（内存数据提供者）。未来切换到数据库实现时，Runner（执行器）的核心流程不需要改变。

### 4. Evaluation Strategy Registry（评估策略注册中心）

Day71 运用了 Strategy Pattern（策略模式）和 Registry Pattern（注册表模式）。

所有评估器都实现统一的 EvaluationStrategy（评估策略）协议：

```text
id（评估器标识）
name（评估器名称）
version（评估器版本）
supportedTypes（支持的数据集类型）
evaluate（执行评估）
```

项目实现了六个 Evaluator（评估器）：

1. CorrectnessEvaluator（正确性评估器）：评估正确性、相关性和完整性。
2. CitationEvaluator（引用质量评估器）：评估引用数量、正确性和完整性。
3. RAGEvaluator（检索增强生成评估器）：评估知识库和活动索引版本是否正确。
4. WorkflowEvaluator（工作流评估器）：评估检查点、恢复、重复执行和事件时间线。
5. MemoryEvaluator（记忆评估器）：评估记忆命中率和冲突状态。
6. SafetyEvaluator（安全评估器）：评估安全规则和禁用词。

这样以后新增 StyleEvaluator（文风评估器）时，只需要：

1. 实现统一接口。
2. 注册到 Strategy Registry（策略注册中心）。

不需要修改 Evaluation Runner（评估执行器）的核心流程。

这符合 Open/Closed Principle（开闭原则）：

> 对扩展开放，对修改关闭。

评估器和平台能力还会同步注册到 UnifiedRegistry（统一注册中心），使其他模块可以统一发现：

- Evaluation Runner V2（评估执行器第 2 版）。
- Quality Gate V2（质量门禁第 2 版）。
- Dataset Provider V2（数据集提供者第 2 版）。
- 六类 Evaluator（评估器）。

### 5. Evaluation Runner V2（评估执行器第 2 版）

Evaluation Runner V2（评估执行器第 2 版）负责执行完整流程：

```text
Input（输入）
  → Runtime（业务运行时）
  → Trace（链路追踪）
  → Evaluator（评估器）
  → Evaluation Result（评估结果）
```

一次 `runEvaluation()` 的主要步骤如下。

#### 第一步：读取 Dataset（数据集）

Runner（执行器）通过 Dataset Provider（数据集提供者）读取并冻结本次评估使用的数据集版本。

#### 第二步：发现 Evaluator（评估器）

Runner 会根据数据集类型寻找适用的评估器：

- RAG 数据集会匹配正确性、引用、RAG 和安全评估器。
- Workflow 数据集会匹配正确性、工作流和安全评估器。
- Memory 数据集会匹配正确性、记忆和安全评估器。

#### 第三步：创建 Trace 和 RuntimeContext

系统会创建：

- Trace（链路追踪）。
- RuntimeContext（运行时上下文）。
- EvaluationRun（评估运行实例）。

然后发布 `evaluation.started`（评估已开始）事件。

#### 第四步：执行业务案例

Runner 不直接写死调用 Ollama，而是接收一个 `executeCase`（执行案例函数）。

这里使用了 Dependency Injection（依赖注入）的思想。

同一个 Runner 可以评估：

- 真实 Agent（智能体）。
- 真实 Workflow（工作流）。
- 真实 RAG（检索增强生成）。
- Fixture（测试夹具）。
- 未来的远程模型服务。

#### 第五步：执行多个 Evaluator

多个评估器可以并行执行，各自负责不同评分维度。

#### 第六步：合并评分

项目当前的综合评分权重为：

```text
correctness（正确性）       24%
relevance（相关性）         16%
completeness（完整性）      18%
safety（安全性）            18%
latency（延迟表现）         12%
cost（成本表现）            12%
```

正确性权重最高，是因为回答再快、再便宜，如果内容错误，仍然没有生产价值。

安全性权重也较高，是因为生产系统中的安全问题可能比普通回答错误造成更严重的后果。

当前权重属于 Hard-coded Configuration（硬编码配置）。更成熟的版本可以将它放入 Config Center（配置中心）或 Evaluation Policy（评估策略配置）。

#### 第七步：保存结果并发布事件

每个案例会产生：

- EvaluationCaseResultV2（评估案例结果第 2 版）。
- Trace Span（链路跨度）。
- `evaluation.case_completed`（评估案例已完成）事件。

整个运行完成后会产生：

- 聚合后的多维评分。
- 用量、延迟和成本。
- `evaluation.completed`（评估已完成）事件。
- Trace Evaluation Link（追踪评估关联）。
- RuntimeContext 中的 `evaluationContext`（评估上下文）。

### 6. RuntimeContext / Trace / EventBus 集成

#### RuntimeContext（运行时上下文）

Day71 新增：

```text
evaluationContext = {
  runId,
  datasetId,
  evaluatorVersions,
  scores
}
```

它回答的是：

> 当前请求正在被哪个评估运行检查？使用了哪些评估器？最终得分是多少？

#### Trace（链路追踪）

Day71 为 Trace 新增：

```text
trace.evaluation = {
  evaluationRunId,
  score,
  evaluatorVersions
}
```

当某个回答的正确性只有 3 分时，可以继续追踪：

- 使用了哪个 Prompt Version（提示词版本）。
- 使用了哪个 Model（模型）。
- 调用了哪些 Tool（工具）。
- 使用了哪些 Memory（记忆）。
- 检索了哪个 Knowledge Base（知识库）。
- 使用了哪个 Index Version（索引版本）。
- 最终由哪些 Evaluator（评估器）打分。

这就形成了完整的 Quality Lineage（质量血缘链路）。

#### EventBus（事件总线）

Day71 新增事件：

- `evaluation.started`：评估开始。
- `evaluation.case_completed`：单个案例完成。
- `evaluation.completed`：评估运行完成。
- `quality_gate.passed`：质量门禁通过。
- `quality_gate.failed`：质量门禁失败。
- `bad_case.created`：坏案例创建。

这里使用了 Event-driven Architecture（事件驱动架构）。

未来评估完成后，可以由不同订阅者分别：

- 更新 Dashboard（仪表盘）。
- 发送 Alert（告警）。
- 写入 Audit Log（审计日志）。
- 创建 Bad Case（坏案例）。
- 阻止 Prompt（提示词）晋级。
- 启动 Regression Test（回归测试）。

发布者不需要知道订阅者是谁，从而减少模块之间的耦合。

### 7. Online Evaluation（在线评估）

Online Evaluation（在线评估）支持两种触发方式。

#### Sampling（采样）

系统根据 `requestId`（请求标识）进行 Stable Hash Sampling（稳定哈希采样）。

这样同一个请求 ID 每次都会得到相同采样结果，方便：

- Test（测试）。
- Debug（调试）。
- Replay（回放）。
- 多次验证。

#### Risk Trigger（风险触发）

即使某个请求没有被普通采样选中，只要满足以下任一条件，也会自动进入评估：

```text
latency > latencyThreshold
或者
userFeedback < 3
```

触发原因优先级为：

```text
feedback-risk（反馈风险）
  → latency-risk（延迟风险）
  → sampled（采样命中）
  → skipped（跳过评估）
```

低用户评分比普通随机采样更值得优先检查。

### 8. Regression Comparison（回归比较）

Baseline（基线版本）和 Candidate（候选版本）必须使用同一个固定 Dataset（数据集）。

系统比较：

- Improved Cases（改进案例）。
- Regressed Cases（退化案例）。
- Failed Cases（失败案例）。
- 七个评分维度的变化。

为什么必须使用同一个数据集？

因为如果 Prompt V1 使用简单题，Prompt V2 使用困难题，两者的分数没有可比性。

### 9. Quality Gate V2（质量门禁第 2 版）

候选版本必须同时满足：

1. `overall >= baseline overall`：综合分不能低于基线。
2. `correctness >= baseline correctness`：正确性不能下降。
3. High Priority Case Pass Rate（高优先级案例通过率）必须为 100%。
4. Cost Growth（成本增长）不能超过 20%。

这样可以避免：

> 平均分提高了，但是一个关键生产案例退化了。

单看平均分可能掩盖严重失败，所以高优先级案例必须全部通过。

### 10. Feedback Loop（反馈闭环）

当用户提交以下反馈时：

- 👎。
- `rating < 3`。
- 负向评论。

系统会：

1. 保存 UserFeedbackV2（用户反馈第 2 版）。
2. 找到对应的 Evaluation Result（评估结果）。
3. 找到原始 Evaluation Case（评估案例）。
4. 创建高优先级或关键级回归案例。
5. 将案例追加到 Evaluation Dataset V2（评估数据集第 2 版）。
6. 创建 Bad Case（坏案例）。
7. 发布 `bad_case.created`（坏案例已创建）事件。

最终形成：

```text
用户点踩
  → Bad Case（坏案例）
  → Dataset（数据集）
  → Regression Test（回归测试）
  → 修复后必须重新通过
```

Day71 最重要的能力之一，就是让已经出现过的问题不会只停留在日志里。

### 11. Evaluation Explorer V2（评估浏览器第 2 版）

页面包含五个 Tab（标签页）：

- Evaluation Runs（评估运行）。
- Case Analysis（案例分析）。
- Regression（回归比较）。
- Quality Gate（质量门禁）。
- Feedback Loop（反馈闭环）。

页面运用了：

- Next.js App Router（Next.js 应用路由）。
- Route Handler（路由处理器）。
- Client Component（客户端组件）。
- React Hooks（React 状态与副作用钩子）。
- Fetch API（浏览器请求接口）。
- Backend for Frontend（面向前端的后端）。

### 12. ProductionEvaluationPlatform（生产评估平台外观层）

ProductionEvaluationPlatform（生产评估平台）属于 Facade Pattern（外观模式）的应用。

它把底层多个模块组合成页面和 API 容易使用的统一入口。

演示场景覆盖：

- Research Agent Evaluation（研究智能体评估）。
- Prompt V1 Baseline（提示词第 1 版基线评估）。
- Prompt V2 Experiment（提示词第 2 版实验评估）。
- Prompt V2 Regression（提示词第 2 版回归评估）。
- RAG 10 Knowledge Questions（十个检索增强生成知识问题）。
- Workflow Reliability Evaluation（工作流可靠性评估）。
- Memory Recall Evaluation（记忆召回评估）。
- Online Evaluation（在线评估）。
- Bad Case Loop（坏案例闭环）。

它还使用 `seedPromise` 保证 Idempotency（幂等性），避免多个并发请求重复创建演示数据。

### 13. Day70 和 Day71 的核心对比

| 对比维度 | Day70 | Day71 |
| --- | --- | --- |
| 核心问题 | 工作流能否可靠执行 | 输出质量是否可靠并持续提高 |
| 核心平台 | Durable Workflow Platform（持久化工作流平台） | Production Evaluation Platform（生产评估平台） |
| 主要对象 | Workflow Definition / Execution / Checkpoint（工作流定义 / 执行 / 检查点） | Dataset / EvaluationRun / EvaluationResult（数据集 / 评估运行 / 评估结果） |
| 生命周期 | 创建、执行、暂停、恢复、完成 | 创建、评估、比较、门禁、反馈、回归 |
| 可靠性 | 执行可靠性 | 质量可靠性 |
| 核心能力 | Checkpoint / Resume / Replay（检查点 / 恢复 / 回放） | Multi-Dimension Score / Regression / Quality Gate（多维评分 / 回归 / 质量门禁） |
| 事件 | `workflow.*` | `evaluation.*`、`quality_gate.*`、`bad_case.*` |
| 页面 | Workflow Catalog / Execution Explorer / Replay Debug（工作流目录 / 执行浏览器 / 回放调试） | Runs / Cases / Regression / Gate / Feedback（运行 / 案例 / 回归 / 门禁 / 反馈） |
| 指标 | 成功率、失败率、恢复次数、检查点数 | 平均质量、延迟、成本、回归数、坏案例数 |
| 失败处理 | 从检查点恢复并继续执行 | 转换为坏案例并加入回归数据集 |
| 最终目标 | 不因中断而丢失执行状态 | 不让已经发现的问题再次进入生产 |

Day70 和 Day71 并不是两个割裂的模块。

Day71 会把 Day70 的 DurableWorkflowRuntime（持久化工作流运行时）当作被评估对象，检查：

- 已完成步骤有没有被重复执行。
- Checkpoint（检查点）是否正确保存。
- Resume（恢复执行）是否从可靠位置继续。
- Event Timeline（事件时间线）是否完整。
- 最终 Reliability Score（可靠性评分）是多少。

因此：

> Day70 提供被评估的可靠工作流能力，Day71 负责证明这个能力是否真的可靠。

### 14. Day71 运用的主要知识

1. TypeScript Type Modeling（TypeScript 类型建模）。
2. Strategy Pattern（策略模式）。
3. Registry Pattern（注册表模式）。
4. Provider Pattern（提供者模式）。
5. Dependency Injection（依赖注入）。
6. Event-driven Architecture（事件驱动架构）。
7. Distributed Tracing Concept（分布式链路追踪思想）。
8. Regression Testing（回归测试）。
9. Quality Engineering（质量工程）。
10. Feedback Loop（反馈闭环）。
11. Deterministic Testing（确定性测试）。
12. Next.js App Router（Next.js 应用路由）。
13. Facade Pattern（外观模式）。
14. Idempotency（幂等性）。
15. Open/Closed Principle（开闭原则）。

### 15. 当前实现的边界

Day71 已经完整展示生产评估平台的架构，但目前仍然属于教学版本。

#### 数据主要保存在内存

EvaluationRun（评估运行实例）、Feedback（反馈）、Bad Case（坏案例）和动态追加的数据集案例都保存在进程内存中。

服务重启后这些数据会丢失。真实生产环境需要接入：

- MySQL / PostgreSQL（关系型数据库）。
- Redis（内存数据库）。
- Object Storage（对象存储）。

#### 当前评估器以确定性规则为主

当前 CorrectnessEvaluator（正确性评估器）主要依赖关键词覆盖和 Fixture（测试夹具）提供的诊断分数。

真实生产版本还可以加入：

- LLM-as-a-Judge（使用大模型担任裁判）。
- Human Evaluation（人工评估）。
- Semantic Similarity（语义相似度）。
- Groundedness Evaluation（事实依据一致性评估）。

#### 页面演示使用 Fixture

页面首屏的部分评估使用 Deterministic Fixture（确定性测试夹具），以保证测试结果稳定。

自动化测试中的 Workflow Evaluation（工作流评估）则真实调用了 Day70 的 DurableWorkflowRuntime（持久化工作流运行时），完成了中断、恢复和回放验证。

#### 评分权重目前固定

不同场景可能需要不同评分权重：

- 医疗场景更重视正确性和安全性。
- 实时客服更重视延迟。
- 大规模批处理更重视成本。

未来可以把权重升级为 Evaluation Policy（评估策略配置）。

---

## 三、对话二：使用生活中的例子理解 Day71

### 用户提问

> 能举一些生活上的例子来说明 Day71 主要弄什么吗？

### 回答

Day71 本质上做的是：

> 不仅让事情做完，还要持续判断做得好不好、哪里不好、改完以后有没有变好。

最简单的区别是：

- Day70：像保证外卖员即使电动车坏了，也能从中断地点继续配送。
- Day71：像评价这次外卖是否送对、是否准时、餐品是否完整、费用是否合理，并把差评变成以后必须避免的问题。

### 例子一：餐厅推出一道新菜

餐厅准备把“番茄牛腩 V2”正式加入菜单。

#### Evaluation Dataset（评估数据集）

餐厅提前准备一批测试情况：

- 喜欢清淡的顾客。
- 喜欢重口味的顾客。
- 不能吃辣的顾客。
- 对牛肉软烂程度要求高的顾客。
- 外卖配送 30 分钟后的口感测试。

这些固定测试情况就像 Evaluation Dataset（评估数据集）。

#### EvaluationRun（评估运行实例）

厨师按照 V1 配方做一轮测试：

```text
番茄牛腩 V1 EvaluationRun（第 1 版评估运行）
```

改进配方后再做一轮：

```text
番茄牛腩 V2 EvaluationRun（第 2 版评估运行）
```

每次测试都有独立记录，方便比较。

#### Multi-Dimension Evaluation（多维度评估）

不能只说“这道菜 8 分”，而要分别评价：

- 味道是否正确。
- 是否符合顾客需求。
- 分量是否完整。
- 食材是否安全。
- 出餐是否够快。
- 成本是否合理。

这对应：

```text
correctness（正确性）
relevance（相关性）
completeness（完整性）
safety（安全性）
latency（延迟表现）
cost（成本表现）
overall（综合评分）
```

#### Regression（回归比较）

```text
V1：味道 8，成本 9，出餐速度 8
V2：味道 9，成本 7，出餐速度 6
```

V2 虽然更好吃，但变得更贵、更慢。

这就是 Regression Evaluation（回归评估）：不仅看哪里变好，也看哪里退化。

#### Quality Gate（质量门禁）

餐厅可以规定：

- 综合分不能下降。
- 食品安全不能下降。
- 严重过敏案例必须全部通过。
- 成本增长不能超过 20%。

只有全部满足，V2 才能正式进入菜单。

### 例子二：学校考试和错题本

把 Agent（智能体）想象成一个学生。

#### Evaluation Dataset（评估数据集）

老师准备一套固定题库：

- 基础题。
- 应用题。
- 易错题。
- 历史错题。
- 高优先级必会题。

这就是评估数据集。

#### Evaluator（评估器）

不同老师负责不同维度：

- 数学老师检查答案是否正确。
- 语文老师检查表达是否完整。
- 审题老师检查是否答非所问。
- 纪律老师检查是否使用违规方式。
- 监考老师记录答题时间。

这就像 Day71 的多个 Evaluator（评估器）。

#### Feedback Loop（反馈闭环）

学生做错一道题后：

```text
考试做错
  → 记录到错题本
  → 加入下次练习题库
  → 下次考试重新测试
```

对应 Day71：

```text
低分输出
  → Bad Case（坏案例）
  → Evaluation Dataset（评估数据集）
  → Regression Test（回归测试）
```

Day71 的重要思想是：

> 已经发生过的问题不能只记录下来，而要变成以后必须通过的测试。

### 例子三：工厂产品抽检

一家工厂每天生产十万个充电器，不可能对每个产品都执行完整检测。

#### Online Evaluation（在线评估）

工厂随机抽取 5% 的产品检查：

```text
十万个产品
  → 抽取 5%
  → 自动质量检测
```

这就是 Sampling（采样）。

#### Risk Trigger（风险触发）

除了随机抽检，下面的产品必须强制检查：

- 温度异常。
- 电压超过阈值。
- 客户投诉。
- 某条生产线最近故障频繁。

对应 Day71：

```text
latency > threshold
或者
userFeedback < 3
```

即使请求没有被普通采样选中，只要延迟过高或用户评分过低，也必须进入评估。

#### Trace（链路追踪）

如果某个充电器不合格，需要知道：

- 来自哪条生产线。
- 使用哪批原材料。
- 由哪台机器生产。
- 使用哪个工艺版本。
- 哪个检测器判定不合格。

这就是 Trace（链路追踪）。

在 Agent 系统中，它可以告诉我们低分结果使用了：

- 哪个 Prompt Version（提示词版本）。
- 哪个 Model（模型）。
- 哪些 Tool（工具）。
- 哪个 Knowledge Base（知识库）。
- 哪个 Index Version（索引版本）。
- 哪些 Evaluator（评估器）。

### 例子四：外卖平台处理差评

用户收到外卖后给出：

```text
👎
评分：2 分
评论：送错地址，而且饭已经凉了
```

普通系统可能只把它保存为一条评论。

Day71 会进一步处理：

```text
用户差评
  → 创建 Bad Case（坏案例）
  → 记录错误地址和超时场景
  → 加入配送测试数据集
  → 修改配送策略
  → 重新执行 Regression Test（回归测试）
```

下次发布新的配送算法前，必须确认：

- 不再送错地址。
- 配送时间没有变差。
- 高优先级投诉案例全部通过。
- 配送成本增长没有超过限制。

这就是 Feedback Loop（反馈闭环）和 Quality Gate（质量门禁）共同工作的效果。

### 例子五：驾校学员持续改进

一个学员已经能把车开到终点。

这相当于 Day70：

> 能完成整个驾驶流程，中途熄火后还能重新启动并继续驾驶。

但是能开到终点不代表开得好。

Day71 会继续评价：

- 有没有压线。
- 有没有闯红灯。
- 是否正确观察后视镜。
- 是否平稳换挡。
- 是否超速。
- 油耗是否合理。
- 花了多长时间。

如果学员在倒车入库时失败：

```text
倒车入库失败
  → 记录为 Bad Case（坏案例）
  → 加入重点训练项目
  → 下次考试必须重新验证
```

如果换了一套新的驾驶方法，还需要和旧方法比较：

```text
旧方法：慢，但是稳定
新方法：快，但是容易压线
```

只有新方法不引入严重退化，才能正式采用。

### 最简单的生活化理解

可以把 Day71 看成一个“持续质量教练”：

```text
先给任务
  → 看任务如何完成
  → 从多个角度评分
  → 找出具体问题
  → 记录错题
  → 修改方法
  → 使用同一套题重新测试
  → 确认没有退步后再发布
```

因此：

- Day70 关注事情能不能可靠完成。
- Day71 关注事情完成得好不好。
- Feedback Loop（反馈闭环）保证问题会被记住。
- Regression Test（回归测试）保证问题修复后不会再次出现。
- Quality Gate（质量门禁）保证质量不合格的版本不能发布。

---

## 四、对话三：V1 / V2 用户偏好和内部质量评估

### 用户理解

> 那就是 Day71 完成的是对任务完成各方面的评分。当我们推出 V2 版本的时候，可以同时把 V1 和 V2 的回答给到用户，让用户选择更喜欢哪个；也可以内部运维人员看各项评分如何，优化该版本的 Agent（智能体）。

### 回答

这个理解基本正确，但需要补充两个关键点。

第一，Day71 不只评价任务是否完成，还评价完成质量：

- Correctness（正确性）：答案是否正确。
- Relevance（相关性）：是否真正回答用户的问题。
- Completeness（完整性）：是否遗漏关键内容。
- Safety（安全性）：是否包含风险内容。
- Latency（响应延迟）：速度是否合理。
- Cost（调用成本）：消耗是否可以接受。
- Overall（综合评分）：整体表现。

第二，V1 / V2 的比较可以分成两条路线。

### 路线一：用户选择更喜欢的回答

同一个问题可以同时经过：

```text
用户问题
  ├─ Agent V1（智能体第 1 版）→ 回答 A
  └─ Agent V2（智能体第 2 版）→ 回答 B
```

然后匿名展示：

```text
回答 A
回答 B

你更喜欢哪个？
○ A
○ B
○ 都差不多
○ 都不好
```

这叫 Pairwise Comparison（成对比较）或 A/B Test（A/B 对照测试）。

最好不要告诉用户哪个是 V1、哪个是 V2，避免产生 Version Bias（版本偏见）。

系统可以记录：

```text
experimentId（实验标识）
userId（用户标识）
question（问题）
answerA（回答 A）
answerB（回答 B）
selectedAnswer（用户选择）
rating（评分）
comment（评论）
```

大量用户选择后，可以计算：

```text
V2 Preference Rate（V2 偏好率）
= 用户选择 V2 的次数 / 有效比较次数
```

例如：

```text
有效比较：1000 次
用户选择 V1：310 次
用户选择 V2：590 次
差不多：100 次

V2 Preference Rate（V2 偏好率）= 59%
```

这能够证明用户主观上是否更加喜欢 V2。

### 路线二：内部运维和研发进行质量评估

内部人员可以通过 Evaluation Explorer（评估浏览器）查看：

```text
V1：
正确性 8.2
完整性 7.8
延迟 510ms
成本 $0.0100

V2：
正确性 9.5
完整性 9.6
延迟 420ms
成本 $0.0115
```

然后分析：

- V2 是否更加正确。
- 是否遗漏关键内容。
- 是否产生新的安全风险。
- 响应速度是否下降。
- 成本增长是否可以接受。
- 哪些案例改进了。
- 哪些案例退化了。

内部人员可以据此优化：

- Prompt（提示词）。
- Model（模型）。
- Workflow（工作流）。
- RAG（检索增强生成）。
- Memory（记忆系统）。
- Tool Calling（工具调用）。
- Agent Strategy（智能体策略）。

### 两条路线应该结合

最理想的流程是：

```text
内部自动评分
    +
用户偏好选择
    +
用户评分和评论
    ↓
综合判断 V2 是否优于 V1
    ↓
Quality Gate（质量门禁）
    ↓
通过后发布 V2
```

因为自动评分和用户偏好可能不一致。

例如：

```text
V2 正确性更高
但是回答太长
用户反而更喜欢简洁的 V1
```

或者：

```text
用户觉得 V2 表达更自然
但是内部评估发现 V2 的引用不正确
```

所以不能只依赖一种信号。

### 当前 Day71 项目已经做到什么

当前项目已经支持：

- V1 Baseline（第 1 版基线）与 V2 Candidate（第 2 版候选）的内部多维比较。
- Improved Cases（改进案例）。
- Regressed Cases（退化案例）。
- Failed Cases（失败案例）。
- Quality Gate V2（质量门禁第 2 版）。
- 用户点赞、点踩、评分和评论。
- 低分反馈自动生成 Bad Case（坏案例）。
- Bad Case 自动进入后续 Evaluation Dataset（评估数据集）。

但当前项目还没有完整实现：

> 同一个问题同时展示 V1 和 V2 两个匿名回答，让用户直接进行二选一。

当前用户反馈主要针对单个 Evaluation Result（评估结果）。

未来可以新增：

```ts
type PairwisePreference = {
  experimentId: string;
  question: string;
  versionA: string;
  versionB: string;
  answerA: string;
  answerB: string;
  selected: "A" | "B" | "tie" | "neither";
  comment?: string;
};
```

这属于 Pairwise Preference Evaluation（成对偏好评估）。

Day71 的完整意义可以概括为：

> 使用自动评估判断技术上是否更好，使用用户偏好判断用户是否更喜欢，再通过 Regression Test（回归测试）和 Quality Gate（质量门禁）决定 V2 是否能够正式替代 V1。

---

## 五、Day71 核心认知总结

### 1. Day70 与 Day71 的关系

```text
Day70：确保任务可以长期、可靠、可恢复地执行。
Day71：确保任务结果可以被评估、比较、诊断和持续改进。
```

### 2. Day71 不是单纯的打分系统

Day71 不只是给回答一个分数，而是建立：

```text
评估运行
  + 多维评分
  + 版本比较
  + 用户反馈
  + 坏案例沉淀
  + 回归测试
  + 质量门禁
  + 运行时链路追踪
```

### 3. 最重要的闭环

```text
Observe（观察生产行为）
  → Evaluate（评估质量）
  → Diagnose（诊断问题）
  → Improve（改进提示词、模型、工作流、记忆或知识）
  → Validate（使用回归测试和质量门禁验证）
  → 重新进入生产环境并继续观察
```

### 4. 最值得记住的一句话

> 优秀的 Agent（智能体）不是依靠一次调试产生的，而是依靠持续 Evaluation（评估）、Regression（回归验证）、Feedback（反馈）和 Improvement（改进）迭代产生的。

---

## 六、第 71 天打卡

【第71天打卡】

1. 是否定义 EvaluationRun（评估运行实例）：是

2. 是否升级 EvaluationDataset V2（评估数据集第 2 版）：是

3. 是否实现 EvaluationRunner V2（评估执行器第 2 版）：是

4. 是否支持 Multi-Dimension Evaluation（多维度评估）：是

5. 是否实现 Evaluation Strategy Registry（评估策略注册中心）：是

6. Trace（链路追踪）是否关联 Evaluation（评估）：是

7. 是否实现 Online Evaluation（在线评估）：是

8. 是否实现 Feedback Loop（反馈闭环）：是

9. 是否升级 Quality Gate V2（质量门禁第 2 版）：是

10. 是否实现 Evaluation Explorer V2（评估浏览器第 2 版）：是

11. 是否增加 Evaluation Metrics V2（评估指标第 2 版）：是

12. Evaluation（评估）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是

13. 是否完成 Production Evaluation Test（生产评估测试）：是

14. 遇到的最大问题：

如何在不破坏 Day70 Durable Workflow Platform（持久化工作流平台）和历史业务代码的前提下，把此前分散的 Evaluation（评估）、Regression（回归）、Prompt Experiment（提示词实验）、Trace（链路追踪）、RuntimeContext（运行时上下文）、EventBus（事件总线）和 UnifiedRegistry（统一注册中心）统一为一个可扩展的 Production Evaluation Platform V2（生产评估平台第 2 版）。同时还需要让 Agent、Workflow、Prompt、RAG 和 Memory 五类对象能够复用同一个 Evaluation Runner（评估执行器），并保证评分、反馈、坏案例、回归比较和质量门禁可以形成完整闭环。

解决方式是通过 Evaluation Dataset Provider（评估数据集提供者）、Evaluation Strategy Registry（评估策略注册中心）、Dependency Injection（依赖注入）、Event-driven Architecture（事件驱动架构）和统一领域模型进行解耦；再使用 Deterministic Fixture（确定性测试夹具）和真实 Day70 Workflow Runtime（第 70 天工作流运行时）共同完成稳定、可重复的生产评估测试。

15. 当前系统能力：

当前系统已经形成以下完整平台能力：

```text
Prompt Platform（提示词平台）
  + Memory Platform（记忆平台）
  + Knowledge / RAG Platform（知识与检索增强生成平台）
  + Durable Workflow Platform（持久化工作流平台）
  + Production Evaluation Platform V2（生产评估平台第 2 版）
```

当前系统能够：

- 运行 Agent（智能体）、Workflow（工作流）、Prompt（提示词）、RAG（检索增强生成）和 Memory（记忆）评估。
- 创建独立 EvaluationRun（评估运行实例）。
- 管理五类 Evaluation Dataset V2（评估数据集第 2 版）。
- 执行 Online / Offline / Regression / Experiment Evaluation（在线 / 离线 / 回归 / 实验评估）。
- 从正确性、相关性、完整性、安全性、延迟和成本等多个维度评分。
- 使用可插拔 Evaluator（评估器）扩展新的评估策略。
- 把评估结果关联到 Trace（链路追踪）和 RuntimeContext（运行时上下文）。
- 通过 EventBus（事件总线）发布评估、门禁和坏案例事件。
- 比较 Baseline（基线版本）和 Candidate（候选版本）。
- 识别 Improved Cases（改进案例）、Regressed Cases（退化案例）和 Failed Cases（失败案例）。
- 使用 Quality Gate V2（质量门禁第 2 版）阻止质量退化版本发布。
- 通过 Sampling（采样）、延迟风险和低用户评分触发 Online Evaluation（在线评估）。
- 保存点赞、点踩、评分和文字评论。
- 将低分和负向反馈自动沉淀为 Bad Case（坏案例）。
- 将 Bad Case 自动追加到 Evaluation Dataset（评估数据集），用于后续 Regression Test（回归测试）。
- 通过 Evaluation Explorer V2（评估浏览器第 2 版）查看运行、案例、回归、门禁、反馈、事件、上下文和指标。
- 使用 Production Evaluation Test（生产评估测试）验证 Agent、Prompt、RAG、Workflow 和 Feedback Loop（反馈闭环）。

当前系统已经从“能够执行任务”升级为“能够观察质量、评估质量、诊断问题、推动改进并通过回归测试验证改进”的 Agent Continuous Improvement Platform（智能体持续改进平台）。

---

## 七、Day71 补充总结：从能够运行升级为能够持续衡量与改进

首先，恭喜完成 Day71。

Day71 完成了整个 Agent Platform（智能体平台）最后几个核心闭环之一：

```text
Production Upgrade V8（生产化升级第 8 版）
Production Evaluation Platform V2（生产评估平台第 2 版）
```

这一天非常关键，因为系统已经从：

```text
Agent（智能体）能够运行
```

升级为：

```text
Agent（智能体）能够被持续衡量、发现问题和推动改进
```

### 1. Day71 解决的核心问题

在 Day71 之前，系统已经拥有：

- Agent Runtime（智能体运行时）。
- Workflow Runtime（工作流运行时）。
- Memory（记忆系统）。
- Knowledge（知识系统）。
- Prompt（提示词系统）。
- Model（模型系统）。
- Tool（工具系统）。

但是，一个生产级 Agent Platform（智能体平台）仍然缺少一个关键能力：

> 我怎么知道 Agent（智能体）变好了，还是变差了？

Day71 使用 Production Evaluation Platform V2（生产评估平台第 2 版）解决了这个问题。

### 2. 当前 Evaluation Architecture（评估架构）

```text
User Request（用户请求）
      ↓
RuntimeContext（运行时上下文）
      ↓
Agent / Workflow / RAG / Prompt
（智能体 / 工作流 / 检索增强生成 / 提示词）
      ↓
Trace（链路追踪）
      ↓
EvaluationRunner（评估执行器）
      ↓
Evaluation Dataset（评估数据集）
      ↓
Evaluation Strategy（评估策略）
      ↓
Score（评分）
      ↓
Quality Gate（质量门禁）
      ↓
Improve / Rollback（改进 / 回滚）
```

### 3. Day71 的最大升级点

#### 升级点一：Evaluation（评估）从结果评分升级为平台能力

以前的评估流程可能只是：

```text
回答
  ↓
评分
```

现在，一次完整的 Evaluation Run（评估运行）包含：

- Dataset（数据集）。
- Runtime（运行时）。
- Trace（链路追踪）。
- Prompt Version（提示词版本）。
- Model（模型）。
- Usage（用量与成本）。
- Evaluator（评估器）。
- Score（评分）。
- Quality Gate（质量门禁）。

这使每一次评估都可以被保存、追踪、比较、诊断和审计。

#### 升级点二：支持 Continuous Improvement Loop（持续改进闭环）

线上发现问题后，系统可以形成：

```text
线上问题
  ↓
Bad Case（坏案例）
  ↓
Dataset（评估数据集）
  ↓
Regression Evaluation（回归评估）
  ↓
修改 Prompt / Workflow / Model
（修改提示词 / 工作流 / 模型）
  ↓
Quality Gate（质量门禁）
  ↓
发布新版本
```

这就是 Continuous Improvement Loop（持续改进闭环）。

#### 升级点三：形成 Agent Engineering Loop（智能体工程闭环）

当前系统已经具备：

```text
Observe（观察）
  ↓
Evaluate（评估）
  ↓
Diagnose（诊断）
  ↓
Improve（改进）
  ↓
Validate（验证）
```

这也是许多企业级 Agent Platform（智能体平台）的核心架构。

### 4. 当前整体学习进度

#### Phase 1：Agent Runtime（阶段 1：智能体运行时）

```text
Agent Runtime（智能体运行时）  ██████████████████████████ 100%
```

#### Phase 2：Infrastructure（阶段 2：基础设施）

```text
Redis（内存数据库）                 ██████████
Queue（任务队列）                   ██████████
Lock（分布式锁）                    ██████████
Storage（存储系统）                 ██████████
Config（配置系统）                  ██████████
Secrets（密钥管理）                 ██████████
```

#### Phase 3：Production Platform（阶段 3：生产平台）

```text
Runtime Context（运行时上下文）     ██████████
Event System（事件系统）             ██████████
Registry（注册中心）                 ██████████
Prompt Platform（提示词平台）        ██████████
Memory Platform（记忆平台）          ██████████
Knowledge Platform（知识平台）       ██████████
Workflow Platform（工作流平台）      ██████████
Evaluation Platform（评估平台）      ██████████
Observability Platform（可观测平台） ░░░░░░░░░░
```

Day71 完成后，下一阶段就是构建统一的 Observability Platform（可观测平台）。

---

## 八、Day72 学习计划：Production Observability Platform（生产可观测平台）

### 1. Day72 主题

```text
Production Upgrade V9（生产化升级第 9 版）
Production Observability Platform（生产可观测平台）
```

### 2. Day72 核心目标

将以下能力统一成生产级 Agent Observability Platform（智能体可观测平台）：

- Trace（链路追踪）。
- Metrics（指标）。
- Logs（日志）。
- Alert（告警）。
- Dashboard（仪表盘）。

### 3. 为什么需要 Day72

当前系统已经拥有 Trace（链路追踪）。

Day44 已经实现：

- Trace（链路追踪）。
- TraceSpan（链路跨度）。
- Trace Explorer（链路浏览器）。

各个模块也已经拥有独立 Metrics（指标）：

- Usage Metrics（用量指标）。
- Memory Metrics（记忆指标）。
- Knowledge Metrics（知识指标）。
- Workflow Metrics（工作流指标）。
- Evaluation Metrics（评估指标）。

Day65 已经实现 EventBus（事件总线）。

但是目前存在一个问题：

> Trace（链路追踪）、Metrics（指标）、Logs（日志）和 Event（事件）仍然比较分散。

例如，一次用户请求可能依次经过：

```text
Request（请求）
  ↓
Agent（智能体）
  ↓
Prompt（提示词）
  ↓
Model（模型）
  ↓
Tool（工具）
  ↓
RAG（检索增强生成）
  ↓
Memory（记忆）
  ↓
Evaluation（评估）
```

生产运维人员需要一个统一入口回答：

- 为什么这个请求很慢？
- 为什么这个回答的质量下降？
- 哪个模块消耗最多？
- 哪个模型的失败率最高？
- 哪类错误在最近二十四小时大量出现？
- 哪条请求链路触发了告警？

### 4. Day72 最终架构

```text
                  Observability Platform（可观测平台）
                               │
             ┌─────────────────┼─────────────────┐
             ↓                 ↓                 ↓
        Logs（日志）      Metrics（指标）      Trace（链路追踪）
             ↓                 ↓                 ↓
             └─────────────────┼─────────────────┘
                               ↓
                 Observability Engine（可观测引擎）
                               ↓
        Dashboard / Alert / Diagnosis（仪表盘 / 告警 / 诊断）
```

---

## 九、Day72 任务清单

### 任务 1：定义统一 ObservationEvent（观测事件）

新增文件：

```text
lib/observability/types.ts
```

定义统一 ObservationEvent（观测事件）：

```ts
type ObservationEvent = {
  id: string;
  type:
    | "trace"
    | "metric"
    | "log";
  source:
    | "agent"
    | "workflow"
    | "tool"
    | "model"
    | "memory"
    | "knowledge"
    | "evaluation";
  level:
    | "debug"
    | "info"
    | "warn"
    | "error";
  requestId?: string;
  traceId?: string;
  timestamp: number;
  data: Record<string, any>;
};
```

字段含义：

- `type`：区分 Trace（链路追踪）、Metric（指标）和 Log（日志）。
- `source`：记录事件来自智能体、工作流、工具、模型、记忆、知识或评估模块。
- `level`：记录 Debug（调试）、Info（信息）、Warn（警告）或 Error（错误）级别。
- `requestId`：关联统一请求标识。
- `traceId`：关联完整调用链。
- `data`：保存结构化观测数据。

目的：统一所有模块的可观测输出协议。

### 任务 2：实现 LogManager（日志管理器）

新增 LogManager（日志管理器），支持：

- `debug()`：记录调试日志。
- `info()`：记录普通信息日志。
- `warn()`：记录警告日志。
- `error()`：记录错误日志。

日志结构：

```ts
type LogRecord = {
  id: string;
  level: string;
  message: string;
  source: string;
  traceId?: string;
  metadata: any;
  createdAt: number;
};
```

LogManager（日志管理器）需要负责：

- 统一日志结构。
- 关联 Trace（链路追踪）。
- 按日志级别查询。
- 按来源模块查询。
- 为 Error Tracking（错误追踪）和 Alert Engine（告警引擎）提供输入。

### 任务 3：实现 Structured Logging（结构化日志）

不要只写：

```ts
console.log("model failed");
```

需要升级为结构化日志：

```json
{
  "level": "error",
  "source": "model-runtime",
  "traceId": "xxx",
  "model": "qwen2.5",
  "error": "timeout"
}
```

为什么需要 Structured Logging（结构化日志）？

因为生产环境需要：

- 按 `traceId` 查询日志。
- 按 `model` 统计错误。
- 按 `source` 过滤模块。
- 按 `level` 筛选错误和警告。
- 自动生成 Error Metrics（错误指标）。
- 触发 Alert Rule（告警规则）。

普通文本日志适合人阅读，结构化日志既适合人阅读，也适合程序查询、过滤和聚合。

### 任务 4：实现 MetricsAggregator（指标聚合器）

目前各个模块主要自己维护指标。

Day72 新增统一 MetricsAggregator（指标聚合器），提供：

- `recordMetric()`：记录指标。
- `queryMetric()`：查询指标。
- `aggregate()`：聚合指标。

需要支持三类基础指标：

#### Counter（计数器）

Counter（计数器）只会持续增加，例如：

```text
request_count（请求总数）
model_call_count（模型调用总数）
error_count（错误总数）
```

#### Gauge（仪表值 / 瞬时值）

Gauge（仪表值）表示当前时刻的状态，可以增加或减少，例如：

```text
active_workers（活动工作线程数量）
queue_depth（队列深度）
active_requests（当前活动请求数）
```

#### Histogram（直方图 / 分布统计）

Histogram（直方图）用于记录数值分布，例如：

```text
latency_ms（延迟毫秒数）
request_duration（请求持续时间）
model_tokens（模型令牌数量）
```

通过 Histogram（直方图）可以计算：

- Average（平均值）。
- p50（第 50 百分位 / 中位数）。
- p95（第 95 百分位）。
- p99（第 99 百分位）。

### 任务 5：定义 Agent Platform Metrics（智能体平台统一指标）

需要为各个平台模块定义统一指标名称。

#### Agent Metrics（智能体指标）

```text
agent.execution.count（智能体执行次数）
agent.failure.rate（智能体失败率）
agent.latency（智能体执行延迟）
```

#### Model Metrics（模型指标）

```text
model.call.count（模型调用次数）
model.error.rate（模型错误率）
model.token.usage（模型令牌用量）
model.cost（模型调用成本）
```

#### Workflow Metrics（工作流指标）

```text
workflow.success.rate（工作流成功率）
workflow.duration（工作流持续时间）
workflow.retry.count（工作流重试次数）
```

#### RAG Metrics（检索增强生成指标）

```text
retrieval.hit.rate（检索命中率）
retrieval.latency（检索延迟）
citation.coverage（引用覆盖率）
```

#### Memory Metrics（记忆指标）

```text
memory.hit.rate（记忆命中率）
memory.used.count（记忆使用次数）
```

统一指标命名后，Dashboard（仪表盘）、Alert Rule（告警规则）和 Query（查询）就不需要理解每个模块的内部实现。

### 任务 6：将 Trace 升级为 Distributed Trace V2（分布式链路追踪第 2 版）

当前系统已经存在 Trace（链路追踪）。

Day72 需要升级为跨模块的 Distributed Trace V2（分布式链路追踪第 2 版）。

一次请求应该生成：

```text
Trace（完整链路）
  ├─ Agent Span（智能体跨度）
  ├─ Workflow Span（工作流跨度）
  ├─ Model Span（模型跨度）
  ├─ Tool Span（工具跨度）
  ├─ Retrieval Span（检索跨度）
  ├─ Memory Span（记忆跨度）
  └─ Evaluation Span（评估跨度）
```

Span（链路跨度）需要新增或统一：

- `parentSpanId`：父跨度标识，用于建立树形调用关系。
- `durationMs`：跨度持续时间。
- `status`：运行、成功或失败状态。
- `attributes`：模型、工具、数据集、版本等结构化属性。

目标是通过一个 Trace Tree（链路树）看到一次请求经过的所有模块。

### 任务 7：实现 Trace-Metrics Correlation（链路与指标关联）

Trace-Metrics Correlation（链路与指标关联）是生产系统中的关键能力。

例如，Dashboard（仪表盘）发现：

```text
Latency（延迟）上升
```

用户点击该指标后跳转到 Trace（链路追踪），发现：

```text
Model Call（模型调用）耗时 8 秒
```

继续展开 Trace Tree（链路树），发现：

```text
RAG Retrieval（检索增强生成检索）耗时过长
```

最终形成：

```text
Metric（指标）
  ↓
Trace（链路追踪）
  ↓
Root Cause（根本原因）
```

因此，Metric（指标）不仅应该告诉运维人员“系统变慢了”，还应该帮助定位“哪条请求、哪个模块、哪个跨度导致系统变慢”。

### 任务 8：实现 Error Tracking（错误追踪）

新增 ErrorEvent（错误事件），记录：

```ts
type ErrorEvent = {
  errorType: string;
  message: string;
  stack?: string;
  source: string;
  traceId?: string;
  count: number;
};
```

Error Tracking（错误追踪）需要支持自动聚合。

例如：

```text
过去 24 小时：
ModelTimeoutError（模型超时错误）出现 253 次
```

它需要回答：

- 哪类错误出现最多？
- 错误来自哪个模块？
- 哪个模型最容易超时？
- 哪条 Trace（链路追踪）产生了错误？
- 错误是偶发问题还是持续增长？

### 任务 9：实现 Alert Engine（告警引擎）

新增 AlertRule（告警规则）。

#### 错误率告警

```text
model.error.rate > 5%
```

#### 延迟告警

```text
p95 latency > 10s
（第 95 百分位延迟超过 10 秒）
```

#### 成本告警

```text
daily cost > limit
（每日成本超过预算限制）
```

#### RAG 质量告警

```text
citation coverage < 80%
（引用覆盖率低于 80%）
```

Alert Engine（告警引擎）需要：

1. 读取 Metrics（指标）、Logs（日志）或 ErrorEvent（错误事件）。
2. 计算 AlertRule（告警规则）。
3. 创建 Alert（告警）。
4. 发布 `alert.triggered`（告警已触发）事件。
5. 在 Alert Center（告警中心）展示活动告警和历史告警。

### 任务 10：实现 Observability Dashboard（可观测仪表盘）

前端需要增加以下主要区域。

#### Overview（总览）

展示：

- Requests（请求数量）。
- Success Rate（成功率）。
- Latency（延迟）。
- Cost（成本）。
- Errors（错误数量）。

#### Trace Explorer（链路浏览器）

展示：

- Trace Tree（链路树）。
- Span Timeline（跨度时间线）。
- Duration（持续时间）。
- Error（错误信息）。

#### Metrics Explorer（指标浏览器）

支持按以下模块筛选：

- Agent（智能体）。
- Model（模型）。
- Workflow（工作流）。
- RAG（检索增强生成）。
- Memory（记忆）。

#### Alert Center（告警中心）

展示：

- Active Alerts（活动告警）。
- Alert History（告警历史）。
- Severity（严重程度）。

### 任务 11：接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）

#### RuntimeContext（运行时上下文）

新增：

```ts
observabilityContext = {
  traceId,
  metricsEnabled,
  samplingRate
};
```

字段含义：

- `traceId`：关联本次请求的完整链路。
- `metricsEnabled`：标记是否开启指标采集。
- `samplingRate`：记录本次链路使用的采样比例。

#### EventBus（事件总线）

新增事件：

```text
metric.recorded（指标已记录）
log.created（日志已创建）
alert.triggered（告警已触发）
trace.completed（链路已完成）
```

#### UnifiedRegistry（统一注册中心）

注册：

- LogManager（日志管理器）。
- MetricsAggregator（指标聚合器）。
- TraceProvider（链路追踪提供者）。
- AlertEngine（告警引擎）。

### 任务 12：实现 Sampling Strategy（采样策略）

生产环境中的 Trace（链路追踪）数量可能非常大，不能无限制保存全部链路。

新增 SamplingPolicy（采样策略），支持：

#### 全量采样

开发环境保存全部 Trace（链路追踪），方便调试。

#### 比例采样

例如只保存 10% 的普通请求：

```text
samplingRate = 0.1
```

#### 错误强制采样

当请求发生错误时，无论普通采样是否命中，都必须保存 Trace（链路追踪）：

```text
error = true → force sample（强制采样）
```

#### 高价值请求采样

例如：

- VIP User（高价值用户）。
- 高成本请求。
- 关键业务工作流。
- 低质量评估结果。

这些请求可以设置更高采样率或强制采样。

### 任务 13：完成 Observability End-to-End Test（可观测平台端到端测试）

#### Case 1：请求全链路

执行 Research Agent（研究智能体），验证产生：

- Trace（链路追踪）。
- Metrics（指标）。
- Logs（日志）。

#### Case 2：模型失败

模拟 Model Timeout（模型超时），验证产生：

- Error Event（错误事件）。
- Alert（告警）。
- Trace Error Span（链路错误跨度）。

#### Case 3：慢查询

模拟 RAG Latency（检索增强生成延迟），验证：

- Dashboard（仪表盘）显示延迟上升。
- Metrics（指标）可以跳转到对应 Trace（链路追踪）。
- Trace（链路追踪）能够定位慢 Retrieval Span（检索跨度）。

#### Case 4：成本超限

模拟 Token Usage（令牌用量）超过预算，验证触发：

- Cost Metric（成本指标）。
- Cost Alert（成本告警）。

#### Case 5：Trace 查询

输入 `traceId`（链路追踪标识），验证可以查看：

- 完整调用链。
- Span Tree（跨度树）。
- 各跨度耗时。
- 错误信息。
- 关联日志和指标。

---

## 十、Day72 验收标准

1. 是否定义 ObservationEvent（统一观测事件）。
2. 是否实现 LogManager（日志管理器）。
3. 是否实现 Structured Logging（结构化日志）。
4. 是否实现 MetricsAggregator（指标聚合器）。
5. 是否统一 Agent Platform Metrics（智能体平台指标）。
6. 是否升级 Distributed Trace V2（分布式链路追踪第 2 版）。
7. 是否实现 Trace-Metrics Correlation（链路与指标关联）。
8. 是否实现 Error Tracking（错误追踪）。
9. 是否实现 Alert Engine（告警引擎）。
10. 是否实现 Observability Dashboard（可观测仪表盘）。
11. Observability（可观测能力）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
12. 是否实现 Sampling Strategy（采样策略）。
13. 是否完成 Observability End-to-End Test（可观测平台端到端测试）。

---

## 十一、Day72 打卡模板

【第72天打卡】

1. 是否定义 ObservationEvent（统一观测事件）：是 / 否

2. 是否实现 LogManager（日志管理器）：是 / 否

3. 是否实现 Structured Logging（结构化日志）：是 / 否

4. 是否实现 MetricsAggregator（指标聚合器）：是 / 否

5. 是否统一 Agent Platform Metrics（智能体平台指标）：是 / 否

6. 是否升级 Distributed Trace V2（分布式链路追踪第 2 版）：是 / 否

7. 是否实现 Trace-Metrics Correlation（链路与指标关联）：是 / 否

8. 是否实现 Error Tracking（错误追踪）：是 / 否

9. 是否实现 Alert Engine（告警引擎）：是 / 否

10. 是否实现 Observability Dashboard（可观测仪表盘）：是 / 否

11. Observability（可观测能力）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是 / 否

12. 是否实现 Sampling Strategy（采样策略）：是 / 否

13. 是否完成 Observability End-to-End Test（可观测平台端到端测试）：是 / 否

14. 遇到的最大问题：


15. 当前系统能力：


---

## 十二、Day72 核心认知

Day72 最重要的一句话是：

> 生产 Agent（智能体）最大的问题不是能不能运行，而是出现问题时能不能快速知道哪里出了问题。

完成 Day72 后，系统将拥有：

```text
Agent Runtime（智能体运行时）
  + Workflow Runtime（工作流运行时）
  + Memory Platform（记忆平台）
  + Knowledge Platform（知识平台）
  + Prompt Platform（提示词平台）
  + Evaluation Platform（评估平台）
  + Observability Platform（可观测平台）
```

这些能力已经接近一个完整的：

```text
Agent Platform V1.0（智能体平台第 1.0 版）
```

---

## 十三、Day73 预告：Platform Governance & Production Readiness（平台治理与生产就绪）

Day73 将进入最后阶段，主要补齐：

- RBAC，Role-Based Access Control（基于角色的访问控制）。
- Tenant / Multi-Tenancy（租户 / 多租户体系）。
- API Gateway（API 网关）。
- Rate Limit（请求限流）。
- Audit Log（审计日志）。
- Deployment Strategy（部署策略）。
- Production Checklist（生产检查清单）。

目标是把当前学习项目从：

```text
Engineering Demo（工程演示项目）
```

升级为：

```text
Deployable Agent Platform Architecture（可部署的智能体平台架构）
```
