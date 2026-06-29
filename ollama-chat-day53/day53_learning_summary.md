# Day 53 学习总结：Prompt Experiment Platform（提示词实验平台）

## 本文记录范围

本文记录第 53 天围绕 Prompt Experiment Platform（提示词实验平台）的学习型对话，包括我提出的问题、你给出的解释、以及最终形成的理解。  
本文不记录具体改了哪些代码、跑了哪些命令、修了哪些样式细节等项目施工过程，只保留概念、业务逻辑和系统设计理解。

## 一、关于 `/prompts` 页面：数据是不是写死的

### 我的问题

`/prompts` 页面的数据是写死的吗？我点击“新建提示词”和“复制草稿”后，没有新增提示词，也没有地方保存，然后看不到新提示词或修改后的提示词的分数、花费更新。

### 你的回答

`/prompts` 页面不应该只是静态展示页，它的定位是 Prompt Console（提示词控制台）或 Prompt Registry（提示词注册表）管理页。  
真实应该支持新增、复制、编辑、保存、激活、归档和回滚 Prompt Version（提示词版本）。

后来明确了当前 Day 53 项目中，`/prompts` 已经是半真实的：  
它读写同一个 PromptRegistry（提示词注册表），新增、编辑、激活会保存到本地 `.data/prompts.json`。  
因此 `/prompts` 不是纯展示，至少提示词版本管理已经具备持久化能力。

## 二、关于新提示词的评分和成本

### 我的问题

新建提示词的评估分和成本估算是没值的，这个是手填还是系统自己算出来的？怎么且何时算出来？

### 你的回答

Score（质量分）不应该在普通保存时凭空自动生成，因为它代表提示词真实效果，需要来自实验或人工评审。  
它可以来自 Prompt Experiment（提示词实验）回填，也可以由人工手动录入。

Cost（成本）可以自动估算，也可以人工覆盖。  
在当前教学项目里，Cost Estimate（成本估算）可以根据 Prompt Template（提示词模板）的长度估算；如果保存时为空，系统会自动给出一个成本估算值。  
真实系统里，Cost（成本）最好来自模型调用后的 token usage（词元用量），例如：

```text
Cost = inputTokens * 输入单价 + outputTokens * 输出单价
```

也就是说：

- Score（质量分）：来自实验评估或人工评审，不应该普通保存时自动生成。
- Cost（成本）：可以保存时自动估算，真实环境中应按模型实际 token usage（词元用量）计算。

## 三、关于 `/experiments` 页面：是否体现同一批 Evaluation Cases

### 我的问题

系统好像没有体现它们跑同一批 Evaluation Cases（评估用例），然后比较 Score（质量分）、Pass Rate（通过率）、Cost（成本）、Latency（延迟）、Regression（回归退步）、High Priority Regression（高优先级案例退步）的场景。

### 你的回答

后端逻辑中确实已经按同一个 Dataset（数据集）循环跑多个 Prompt Version（提示词版本），但页面一开始更像实验结果汇总，没有把“同一批 Evaluation Cases（评估用例）被多个版本共同运行”的证据展示出来。

更合理的展示方式是：

- 先展示本次实验使用的 Dataset（数据集）和 caseCount（评估用例数量）。
- 再展示每个版本的 Batch Run（批量评估运行）都绑定同一个 datasetId（数据集标识）和 caseCount（案例数量）。
- 最后用矩阵展示：每一行是一个 Evaluation Case（评估用例），每一列是一个 Prompt Version（提示词版本），每个格子展示 Score（质量分）、Pass/Fail（通过/失败）、Cost（成本）、Latency（延迟）和 Regression（回归退步）。

这样用户才能直观看到：同一批 case，被 `writer.v1 / writer.v2 / writer.v3` 都跑过，然后横向比较。

## 四、关于 `/experiments` 和 `/prompts` 是否互通

### 我的问题

`/experiments` 页面和 `/prompts` 页面里的数据是不是不是互通的？是不是写死在各自页面里，主要是展示？

### 你的回答

准确地说，现在不是完整互通的真实实验系统，而是 Day 53 的教学版 demo（演示原型）。

`/prompts` 是半真实的。  
它读写 PromptRegistry（提示词注册表），新增、编辑、激活会持久化到 `.data/prompts.json`，所以不是纯展示。

`/experiments` 是固定实验配置。  
它默认只跑一个写死的实验：`writer.v1 / writer.v2 / writer.v3`。  
Evaluation Dataset（评估数据集）也是固定从 Day 46 的案例集继承来的。  
它会从 PromptRegistry（提示词注册表）读取这三个 writer 版本，但不会自动把我在 `/prompts` 新建的 `research.v4`、`research.v5` 加进实验。

当前两者的关系是：

```text
/prompts 管提示词版本
/experiments 固定拿 writer.v1 / writer.v2 / writer.v3 做演示实验
两者只通过 PromptRegistry（提示词注册表）有部分连接
```

目前不完整互通的地方包括：

- `/experiments` 不能选择 `/prompts` 中新建的提示词版本来跑实验。
- `/experiments` 不能选择 Agent（智能体）或 Component（组件），例如从 writer 改成 research。
- `/experiments` 的 Evaluation Cases（评估用例）是固定的。
- 实验结果没有完整保存成历史记录。
- Promote（提升为线上版本）主要用于演示上线流程，还不是完整的生产发布系统。

如果要做成真正互通，下一步应该支持：

- 在 `/experiments` 页面选择 Component（组件）或 Agent（智能体）。
- 选择多个 Prompt Version（提示词版本）。
- 选择或新增 Evaluation Cases（评估用例）。
- 点击 Run Experiment（运行实验）。
- 将结果回写到对应 Prompt（提示词）的 Score（质量分）和 Cost（成本）。

## 五、真实的 Prompt Experiment 应该是什么样

### 我的问题

真实情况是不是：有一些案例对应 AgentA（智能体 A），它的提示词由我修改了几个版本，在 `/experiments` 页面跑这些案例在不同提示词下的效果，然后拿到 Score（质量分）、Pass Rate（通过率）、Cost（成本）、Latency（延迟）、Regression（回归退步）、High Priority Regression（高优先级案例退步），再对比选取最好的提示词？

### 你的回答

是的，这就是更真实的 Prompt Experiment（提示词实验）流程。

真实流程应该是：

```text
1. 为某个 Agent（智能体）维护一批 Evaluation Cases（评估用例）。
2. 这个 Agent 的 Prompt（提示词）有 v1 / v2 / v3 等多个版本。
3. 每个 Prompt Version（提示词版本）都跑同一批 Evaluation Cases（评估用例）。
4. 每次运行记录 output（输出）、score（质量分）、cost（成本）、latency（延迟）。
5. 将候选版本与 baseline（基线版本，通常是当前 active 版本）比较 regression（回归退步）。
6. 根据 Winner Selection（获胜版本选择）和 Quality Gate（质量门禁）决定是否上线。
```

## 六、各项指标是怎么评分或计算的

### 1. Score（质量分）

当前项目中，每个 Evaluation Case（评估用例）都有 Rubric（评分规则）。  
Rubric（评分规则）分成四个维度：

- Completeness（完整性）：权重 25%
- Correctness（正确性）：权重 35%
- Relevance（相关性）：权重 20%
- Coverage（覆盖度）：权重 20%

每个维度都有 requiredTerms（必须命中的关键词）。  
输出命中的关键词越多，该维度分越高。  
最终 Score（质量分）按权重加权得到 0 到 100 分。

当前教学项目的计算方式是确定性规则评分，方便复现。  
真实生产系统中，Score（质量分）可以来自：

- LLM Judge（大模型裁判）
- Human Review（人工评审）
- Unit Test（单元测试）
- JSON Schema Validation（JSON 结构校验）
- Tool Call Assertion（工具调用断言）
- Semantic Similarity（语义相似度）
- Rule-based Rubric（规则化评分表）

### 2. Pass Rate（通过率）

每个 Evaluation Case（评估用例）都有 passThreshold（通过阈值）。  
如果某版本在这个 case 上的 Score（质量分）大于或等于 passThreshold（通过阈值），这个 case 就算 Pass（通过）。

```text
Pass Rate = 通过的 case 数 / 总 case 数
```

### 3. Cost（成本）

当前项目里 Cost（成本）是模拟值，主要读取 Prompt（提示词）上的 costEstimate（成本估算）。  
如果没有，就用默认值。

真实系统里，Cost（成本）应该来自模型实际调用返回的 token usage（词元用量）：

```text
Cost = inputTokens * 输入单价 + outputTokens * 输出单价
```

### 4. Latency（延迟）

当前项目里 Latency（延迟）是模拟值，用 Prompt Template（提示词模板）长度和案例序号估算。  
真实系统里应该记录真实开始时间和结束时间：

```text
Latency = finishedAt - startedAt
```

### 5. Regression（回归退步）

Regression（回归退步）是候选版本和 baseline（基线版本）在同一个 case 上比较得出的。

```text
如果 candidateScore < baselineScore，则该 case 发生 Regression（回归退步）
```

baseline（基线版本）通常是当前 active（启用中）的 Prompt Version（提示词版本）。

### 6. High Priority Regression（高优先级案例退步）

每个 Evaluation Case（评估用例）都有 priority（优先级），例如 low（低）、medium（中）、high（高）、critical（关键）。  
当前项目中，high（高）和 critical（关键）被视为高优先级。

如果一个 high（高）或 critical（关键）的 case 发生 Regression（回归退步），就计入 High Priority Regression（高优先级案例退步）。  
这通常是上线阻断项。

## 七、我对 Day 53 的最终理解

Day 53 的核心不是“单个提示词写得更好”，而是建立一套 Prompt Experiment Platform（提示词实验平台）。  
它的目标是让提示词迭代变成可实验、可对比、可回归、可上线的工程流程。

核心链路是：

```text
Prompt Version（提示词版本）
  -> Evaluation Cases（评估用例）
  -> Batch Evaluation（批量评估）
  -> Score / Pass Rate / Cost / Latency / Regression
  -> Winner Selection（获胜版本选择）
  -> Quality Gate（质量门禁）
  -> Promote（提升为线上版本）
```

当前项目已经搭出这个流程的教学版本，但还不是完整生产系统。  
真正的下一步是让 `/prompts` 和 `/experiments` 完整互通：我在提示词控制台创建的版本，能直接被实验平台选择、运行、比较和回写结果。

## 八、第 53 天打卡

【第53天打卡】

1. 是否定义 PromptExperiment（提示词实验）：是
2. 是否定义 PromptExperimentResult（提示词实验结果）：是

3. 是否实现 PromptExperimentRunner（提示词实验运行器）：是
4. 是否支持多版本 Prompt（提示词）对比：是

5. 是否实现 Winner Selection（获胜版本选择）：是
6. 是否接入 Quality Gate（质量门禁）：是

7. 是否实现 Prompt Experiment Dashboard（提示词实验仪表盘）：是
8. 是否实现 Prompt Experiment Timeline（提示词实验时间线）：是

9. 是否支持一键 Promote（提升为线上版本）：是
10. 是否完成 Prompt Experiment（提示词实验）测试：是

11. 遇到的最大问题：

当前最大问题是区分“教学版演示系统”和“真实互通的生产实验系统”。  
现在 `/prompts` 已经能持久化管理 Prompt Version（提示词版本），但 `/experiments` 仍然主要使用固定的 writer 组件、固定的 `writer.v1 / writer.v2 / writer.v3` 和固定的 Evaluation Dataset（评估数据集）。  
因此它能展示 Prompt Experiment（提示词实验）的完整流程，但还没有做到让用户自由选择 Agent（智能体）、Prompt Version（提示词版本）和 Evaluation Cases（评估用例）来运行真实实验。

12. 当前系统能力：

当前系统已经具备 Day 53 Prompt Experiment Platform（提示词实验平台）的核心教学能力：  
可以定义 PromptExperiment（提示词实验）、读取多个 Prompt Version（提示词版本）、对同一批 Evaluation Cases（评估用例）执行 Batch Evaluation（批量评估），并对比 Score（质量分）、Pass Rate（通过率）、Cost（成本）、Latency（延迟）、Regression（回归退步）和 High Priority Regression（高优先级案例退步）。  
系统还能根据 Winner Selection（获胜版本选择）选出候选版本，通过 Quality Gate（质量门禁）判断是否可上线，并通过 Promote（提升为线上版本）演示将获胜版本切换为 active（启用中）版本。  
同时，系统提供 Prompt Experiment Dashboard（提示词实验仪表盘）、Prompt Experiment Timeline（提示词实验时间线）和测试用例文档，方便学习和复盘。

## 九、Day 53 后的路线判断：先不全面升级生产版

### 新问题

前面的学习现在还是 Teaching Version（教学版），是否应该马上升级为真实互通的 Production Version（生产版本），还是等后面学习 Redis（内存数据库/缓存与队列基础设施）之后再统一升级？

### 建议结论

建议非常明确：不要现在全面升级，等学完 Redis（内存数据库/缓存与队列基础设施，预计 Day58 到 Day63）之后，再统一升级。

原因是：如果现在就把所有模块改成真实生产版，后面学习 Redis（内存数据库/缓存与队列基础设施）、Distributed Queue（分布式队列）、Distributed Lock（分布式锁）、Config Center（配置中心）、Secrets（密钥管理）、Object Storage（对象存储）之后，还会再次推倒重来。

当前很多模块本质上还是 Teaching Version（教学版）：

```text
Prompt Experiment（提示词实验）
  -> 固定 writer（写作智能体）
  -> 固定 Dataset（数据集）
  -> 固定 Prompt（提示词）
  -> Demo（演示版本）
```

它的目的不是立刻做成完整生产系统，而是先把能力学明白。  
如果现在升级为完整互通系统，后续 Redis（内存数据库/缓存与队列基础设施）相关课程会影响很多模块：

- Prompt Registry（提示词注册表）
- Experiment（实验）
- Workspace（工作空间）
- Queue（队列）
- Trace（链路追踪）
- Evaluation（评估）
- Memory（记忆）

所以现在全面重构一次，后面基础设施升级后还要再重构一次，学习效率反而会降低。

## 十、真正生产版本应该是什么样

### Prompt Experiment（提示词实验）

真正的 Prompt Experiment（提示词实验）不应该只是固定 `writer.v1 / writer.v2 / writer.v3`。  
它应该是动态组合：

```text
Agent（智能体）
  -> Research Agent（研究智能体）
  -> Writer Agent（写作智能体）
  -> Critic Agent（审查智能体）
  -> Prompt Version（提示词版本）
  -> Dataset（数据集）
  -> Model（模型）
  -> Experiment（实验）
```

也就是说，未来应该支持任意 Agent（智能体）、任意 Prompt Version（提示词版本）、任意 Dataset（数据集）、任意 Model（模型）自由组合实验。

### Evaluation（评估）

现在 Evaluation（评估）使用固定 Dataset（数据集）。  
以后应该升级为 Dataset Registry（数据集注册表），让评估用例也可以新增、编辑、版本化和复用。

### Memory（记忆）

现在是 Memory Store（内存式记忆存储）。  
以后应该变成：

```text
Redis（内存数据库/缓存）
+ MySQL（关系型数据库）
+ VectorDB（向量数据库）
```

### Queue（队列）

现在是 Memory Queue（内存队列）。  
以后应该升级为 Redis Queue（基于 Redis 的队列）。

### Trace（链路追踪）

现在是 Local Trace（本地链路记录）。  
以后应该升级到 OpenTelemetry（开放遥测标准，用于链路追踪、指标和日志）。

### 总体判断

真正的生产版不应该在 Day53 就开始全面升级，而应该放到 Redis（内存数据库/缓存与队列基础设施）学习完成之后。  
更合理的路线是：

```text
Day1~57
  -> Teaching Platform（教学平台，学习所有能力）

Day58~63
  -> Infrastructure（基础设施）

Day64~80
  -> Production Upgrade（生产版统一升级）
```

这样每个模块只需要重构一次，不会在学习过程中反复返工。

## 十一、Day 54 学习计划：Prompt Lifecycle V2 与 Prompt Composition

Day54 不会开始“全部重构”。  
Day54 继续完善 Prompt Platform（提示词平台），主题是 Prompt Lifecycle V2（提示词生命周期第二版）和 Prompt Composition（提示词组合）。

Day54 开始学习真正的 Prompt Engineering（提示词工程）。  
重点不再只是 Prompt Version（提示词版本），而是 Prompt Component（提示词组件）和 Prompt Block（提示词块）。

以前 Prompt（提示词）通常只是一个大字符串，例如：

```text
Research Prompt（研究提示词）
```

以后 Prompt（提示词）应该拆成多个 Block（块）：

```text
System Prompt（系统提示词）
+ Memory Prompt（记忆提示词）
+ Workspace Prompt（工作空间提示词）
+ Tool Prompt（工具提示词）
+ Task Prompt（任务提示词）
+ Output Format Prompt（输出格式提示词）
```

真实 Agent（智能体）的 Prompt（提示词）通常不是一个单独字符串，而是很多上下文块的组合。  
例如 Claude（Anthropic 的大模型产品）、Cursor（AI 编程工具）、OpenAI（大模型平台）等系统，都会把 Prompt（提示词）拆成：

```text
System（系统规则）
  -> Memory（记忆）
  -> Context（上下文）
  -> Workspace（工作空间）
  -> Tool（工具）
  -> Task（任务）
  -> Output Schema（输出结构）
```

## 十二、Day 54 最终效果

以前：

```text
systemPrompt（系统提示词字符串）
```

以后：

```text
PromptBuilder（提示词构建器）
  -> System Block（系统块）
  -> Memory Block（记忆块）
  -> Workspace Block（工作空间块）
  -> Task Block（任务块）
  -> Output Block（输出块）
  -> Render（渲染为最终提示词）
```

Day54 的目标是把 Prompt（提示词）从“一个字符串”升级成“可组合、可排序、可启用/禁用、可条件跳过的块系统”。

## 十三、Day 54 今日任务

### 任务 1：定义 PromptBlock（提示词块）

定义 PromptBlock（提示词块）类型，例如：

```ts
type PromptBlock = {
  id: string;
  name: string;
  type:
    | "system"
    | "memory"
    | "workspace"
    | "tool"
    | "task"
    | "output";
  template: string;
  enabled: boolean;
  order: number;
};
```

### 任务 2：实现 PromptBlockRegistry（提示词块注册表）

PromptBlockRegistry（提示词块注册表）需要支持：

- register（注册）
- get（读取）
- list（列表）
- enable（启用）
- disable（禁用）

### 任务 3：实现 PromptBuilder（提示词构建器）

PromptBuilder（提示词构建器）需要支持：

```ts
buildPrompt(blocks, variables)
```

它负责把多个 PromptBlock（提示词块）组合成最终 Prompt（提示词）。

### 任务 4：支持 Block 排序

PromptBlock（提示词块）需要按 order（顺序）排序，例如：

```text
system（系统）
  -> memory（记忆）
  -> workspace（工作空间）
  -> task（任务）
  -> output（输出）
```

### 任务 5：支持条件 Block

条件 Block（条件提示词块）表示某些上下文不存在时自动跳过。  
例如：如果没有 Memory（记忆），就自动跳过 Memory Block（记忆块）。

### 任务 6：Agent Runtime 接入 PromptBuilder

Agent Runtime（智能体运行时）不再直接拼接单个 systemPrompt（系统提示词字符串），而是通过 PromptBuilder（提示词构建器）组合最终提示词。

### 任务 7：Prompt Explorer 新增 Prompt Block

Prompt Explorer（提示词浏览器）需要新增 Prompt Block（提示词块）视图，用来查看当前系统有哪些块、哪些启用、顺序是什么。

### 任务 8：实现 Block Diff

Block Diff（提示词块差异对比）用于比较两个 PromptBlock（提示词块）的变化，例如模板正文变化、启用状态变化或顺序变化。

### 任务 9：实现 Block Metrics

Block Metrics（提示词块指标）用于统计：

- Length（长度）
- Token（词元）估算
- Enabled Rate（启用率）
- Hit Rate（命中率/使用率）

### 任务 10：完成 Prompt Composition Test

Prompt Composition Test（提示词组合测试）需要验证组合场景，例如：

```text
System（系统）
+ Memory（记忆）
+ Task（任务）
```

以及：

```text
System（系统）
+ Workspace（工作空间）
+ Task（任务）
+ Output（输出）
```

测试目标是验证 PromptBuilder（提示词构建器）能够按顺序组合、按条件跳过，并正确渲染变量。

## 十四、Day 54 打卡模板

【第54天打卡】

1. 是否定义 PromptBlock（提示词块）：是 / 否
2. 是否实现 PromptBlockRegistry（提示词块注册表）：是 / 否

3. 是否实现 PromptBuilder（提示词构建器）：是 / 否
4. 是否支持 PromptBlock（提示词块）排序：是 / 否

5. 是否支持条件 Block（条件块）：是 / 否
6. Agent Runtime（智能体运行时）是否接入 PromptBuilder（提示词构建器）：是 / 否

7. 是否实现 Prompt Block Explorer（提示词块浏览器）：是 / 否
8. 是否实现 Prompt Block Diff（提示词块差异对比）：是 / 否

9. 是否增加 Prompt Block Metrics（提示词块指标）：是 / 否

10. 是否完成 Prompt Composition Test（提示词组合测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 十五、后续学习路线调整

经过前 53 天，后续路线建议采用两阶段策略。

### 第一阶段：Day54～Day63，继续完善能力

目标是把所有能力都学会，但允许部分模块继续保留 Teaching Version（教学版）实现。

这一阶段包括：

- Prompt Composition（提示词组合）
- Dynamic Prompt（动态提示词）
- Multi-Model Collaboration（多模型协作）
- Adaptive Router（自适应路由器）
- Redis（内存数据库/缓存与队列基础设施）
- Distributed Queue（分布式队列）
- Distributed Lock（分布式锁）
- Config Center（配置中心）
- Object Storage（对象存储）
- Secrets（密钥管理）

### 第二阶段：Day64～Day80，生产版统一升级

这一阶段不再新增太多概念，而是把前面所有 Teaching Version（教学版）模块统一升级为真正可互通的 Production System（生产系统）。

例如：

- Prompt Registry（提示词注册表）真正驱动所有 Agent（智能体）、Tool（工具）、Evaluation（评估）和 Reflection（反思）。
- Experiment（实验）支持任意 Agent（智能体）、任意 Prompt（提示词）、任意 Dataset（数据集）的自由组合。
- Memory（记忆）、Queue（队列）、Workspace（工作空间）、Cache（缓存）全部接入 Redis（内存数据库/缓存与队列基础设施）。
- Trace（链路追踪）全部升级到标准化链路。
- Docker（容器化）、CI/CD（持续集成/持续交付）、MCP（模型上下文协议）、Deployment（部署）、Monitoring（监控）全部完成。

这样做最大的好处是：每个模块只重构一次。  
系统会从 Learning Project（学习项目）逐步蜕变成 Production-grade Agent Platform（生产级智能体平台），而不是在学习过程中不断返工。
