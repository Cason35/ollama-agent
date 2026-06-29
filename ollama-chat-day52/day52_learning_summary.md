# Day 52 学习总结：Prompt Versioning & Prompt Registry（提示词版本管理与提示词注册表）

> 核心认知：Model（模型）决定能力上限，Prompt（提示词）决定能力释放方式。Day 51 解决“模型坏了怎么办”，Day 52 解决“提示词改了怎么管”。

## 1. Day 52 项目做了什么

`ollama-chat-day52` 在 Day 51 的 Resilient Multi-Model Runtime（具备容错能力的多模型运行时）基础上，把 Prompt（提示词）从代码里的零散字符串抽离出来，变成可管理、可版本化、可追踪、可回滚的工程资产。

它的重点不是单纯“把文字搬到另一个文件”，而是建立一套 Prompt Lifecycle Management（提示词生命周期管理）机制：

1. 定义 `PromptTemplate`（提示词模板）。
2. 实现 `PromptRegistry`（提示词注册表）。
3. 实现 `renderPrompt`（渲染提示词）。
4. 让 Agent Runtime（智能体运行时）读取 active（启用中）提示词版本。
5. 让 Tool / Reflection / Evaluation（工具 / 反思 / 评估）都接入 PromptRegistry（提示词注册表）。
6. 在 Trace / Usage / Evaluation（追踪 / 用量统计 / 评估）中记录 `promptId` 和 `promptVersion`（提示词版本）。
7. 实现 Prompt Explorer（提示词浏览器）查看版本、状态、差异和回滚关系。
8. 将 Regression Evaluation（回归评估）和 Prompt Version（提示词版本）关联起来。

一句话理解：

```text
Day 51：模型调用更稳定。
Day 52：提示词迭代更可控。
```

## 2. 关键模块

### 2.1 PromptTemplate（提示词模板）

PromptTemplate（提示词模板）不是最终发给模型的完整文本，而是带变量占位符的模板。

它包含：

- `id`：提示词唯一标识，例如 `research.v3`。
- `componentType`：组件类型，例如 agent（智能体）、tool（工具）、reflection（反思）、evaluation（评估）。
- `componentId`：组件 ID，例如 `research`、`writer`、`ragAnswer`。
- `version`：版本，例如 `v1`、`v2`、`v3`。
- `template`：模板正文。
- `variables`：变量声明。
- `status`：生命周期状态，例如 draft（草稿）、active（启用中）、archived（已归档）。
- `score`：评估分。
- `costEstimate`：成本估算。

### 2.2 PromptRegistry（提示词注册表）

PromptRegistry（提示词注册表）负责集中管理所有 PromptTemplate（提示词模板）。

它的能力包括：

- `register`：注册提示词版本。
- `getActive`：读取某个组件当前 active（启用中）的版本。
- `getVersion`：读取指定版本。
- `list`：列出版本。
- `activate`：激活某个版本。
- `archive`：归档某个版本。
- `rollback`：回滚到旧版本。
- `upsert`：新增或编辑提示词版本。

它解决的问题是：系统不再依赖代码里散落的提示词，而是统一知道“哪个组件现在正在用哪个提示词版本”。

### 2.3 Prompt Renderer（提示词渲染器）

Prompt Renderer（提示词渲染器）负责把模板里的变量占位符替换成运行时真实信息。

例如模板：

```text
你是研究型 Agent，负责收集、检索和整理资料。
任务：{{task}}
可用工具：{{tools}}
长期记忆：{{memory}}
共享工作空间：{{workspace}}
请先列出关键发现，再标注证据来源，最后给出风险和下一步。
```

运行时会把：

- `{{task}}` 替换成当前用户任务。
- `{{tools}}` 替换成当前可用工具。
- `{{memory}}` 替换成长期记忆。
- `{{workspace}}` 替换成共享工作空间或上游步骤输出。

所以，Day 52 抽出来的不是“死文本”，而是 Prompt Template（提示词模板）。真正发给模型的是：

```text
Prompt Template（提示词模板）
+ Runtime Variables（运行时变量）
= Final Prompt（最终提示词）
```

## 3. 学习对话整理

### 3.1 这个项目做了什么？

**问：**  
带我读懂 `ollama-chat-day52` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day51` 有什么改进，为什么这样做。

**答：**  
Day 52 是在 Day 51 的 Resilient Multi-Model Runtime（具备容错能力的多模型运行时）基础上，新增 Prompt Versioning（提示词版本管理）和 Prompt Registry（提示词注册表）。

Day 51 的重点是模型稳定性：

- Fallback（备用模型切换）。
- Circuit Breaker（熔断器）。
- Timeout（超时）。
- Retry（重试）。

Day 52 的重点是提示词治理：

- 哪个组件用了哪个 Prompt（提示词）。
- 当前 active（启用中）版本是谁。
- 新旧版本有什么差异。
- 质量和成本是否变化。
- 出问题能不能 rollback（回滚）。

所以 Day 51 解决“模型坏了怎么办”，Day 52 解决“提示词改了怎么管”。

### 3.2 提示词抽出来以后，动态信息怎么融进去？

**问：**  
Day 52 的任务主要是把提示词从代码层面抽出来，但是提示词会包含实时信息，比如上个 step（步骤）总结的信息要拿到这里用，一些 memory（记忆）也要拿到这里用。提示词抽出来了，怎么把这些可变信息融进去？

**答：**  
关键点是：抽出来的是 Prompt Template（提示词模板），不是最终完整 Prompt（提示词）。

提示词被拆成两层：

```text
固定部分：Prompt Template（提示词模板）
可变部分：Runtime Variables（运行时变量）
最终结果：renderPrompt(template, variables)
```

例如：

```text
任务：{{task}}
长期记忆：{{memory}}
共享工作空间：{{workspace}}
可用工具：{{tools}}
```

这里的 `{{task}}`、`{{memory}}`、`{{workspace}}`、`{{tools}}` 就是变量插槽。运行时由 Agent Runtime（智能体运行时）负责组装这些变量：

- 当前用户目标进入 `task`。
- 长期记忆进入 `memory`。
- 上一个 step（步骤）的结果、共享上下文、工作空间摘要进入 `workspace`。
- 当前可用工具进入 `tools`。

所以提示词抽离以后，动态信息不是消失了，而是通过 Template Rendering（模板渲染）注入进去。

### 3.3 如果把 `{{task}}` 写错成 `{{task1}}` 怎么办？

**问：**  
模板里如果有 `{{task}}`，我们编辑文字时万一把它不小心改成 `{{task1}}`，最后忘记原本的变量占位符是什么，这个提示词就出现大问题，系统也无法正常运行了。

**答：**  
这个担心非常关键。Prompt Template（提示词模板）工程化以后，最大风险之一就是变量占位符被改坏。

原本运行时传入的是：

```ts
{
  task: "用户的问题",
  memory: "...",
  workspace: "...",
  tools: "..."
}
```

如果模板写成：

```text
任务：{{task1}}
```

系统没有 `task1`，模型就可能拿不到任务，最终输出质量会明显下降。

正确做法是加入 Prompt Contract（提示词变量契约）和 Prompt Validator（提示词校验器）：

1. 每个组件提前声明允许使用哪些变量。
2. 保存或激活前，从模板正文提取所有 `{{变量}}`。
3. 检查是否出现未知变量，例如 `{{task1}}`。
4. 检查是否缺少必需变量，例如 `{{task}}`。
5. 检查 `variables` 声明和模板正文是否一致。
6. 校验不通过就禁止保存或禁止激活。

更合理的编辑体验是：

- 用 Variable Chips（变量标签）展示 `{{task}}`、`{{memory}}`、`{{workspace}}`。
- 用户点击标签插入变量，而不是手动输入。
- 错误变量高亮或显示校验错误。
- 保存前和激活前都跑 Validator（校验器）。

这样就能避免“提示词从代码里抽出来以后，反而被误编辑改坏”的问题。

### 3.4 Prompt Diff（提示词差异对比）为什么看起来没体现？

**问：**  
系统好像还没体现“实现 Prompt Diff（提示词差异对比）”，是不是因为现在还没修改、新增等功能？

**答：**  
是的。Prompt Diff（提示词差异对比）底层已经有能力，但如果没有新增和编辑提示词的流程，它就只能展示固定的 `research.v2 -> research.v3` 对比。

真正有价值的 Prompt Diff（提示词差异对比）应该出现在这些场景：

- 新增提示词版本时：active（启用中）版本 vs draft（草稿）版本。
- 修改提示词时：修改前 vs 修改后。
- 激活新版本前：当前线上版本 vs 准备上线版本。
- 回归评估失败时：通过版本 vs 失败版本。

所以 Prompt Diff（提示词差异对比）要和 Create Prompt（新增提示词）、Edit Prompt（编辑提示词）、Draft Version（草稿版本）、Activate Gate（激活门禁）结合起来，才算真正进入工作流。

## 4. 后续补齐后的 Day 52 能力

基于上述问题，Day 52 的提示词相关能力已经补齐为更完整的 Prompt Management（提示词管理）流程：

- 新增 `/prompts` Prompt Console（提示词管理控制台）。
- 支持新建 Prompt Version（提示词版本）。
- 支持复制已有版本为 Draft（草稿）。
- 支持编辑 Prompt Template（提示词模板）。
- 支持点击 Variable Chips（变量标签）插入 `{{task}}`、`{{memory}}` 等变量。
- 支持 Prompt Contract（提示词变量契约）。
- 支持 Prompt Validator（提示词校验器）。
- 支持保存前校验和激活前校验。
- 支持 Prompt Diff（提示词差异对比）实时预览。
- 支持 Rendered Preview（渲染预览）。
- 支持保存为草稿、按当前状态保存、保存并激活。

这样 Day 52 就从“能展示提示词版本”升级成“能管理提示词生命周期”。

## 5. Day 51 vs Day 52 对比

| 维度 | Day 51 | Day 52 |
| --- | --- | --- |
| 核心问题 | 模型坏了怎么办 | 提示词改了怎么管 |
| 主要对象 | Model（模型） | Prompt（提示词） |
| 核心能力 | Fallback（备用模型切换）、Circuit Breaker（熔断器）、Timeout（超时）、Retry（重试） | Prompt Versioning（提示词版本管理）、Prompt Registry（提示词注册表）、Prompt Diff（提示词差异对比）、Prompt Rollback（提示词回滚） |
| 可观测字段 | `fallbackUsed`、`fallbackChain`、`circuitState` | `promptId`、`promptVersion` |
| 看板 | Model Health Dashboard（模型健康看板） | Prompt Explorer（提示词浏览器）、Prompt Console（提示词管理控制台） |
| 风险控制 | 避开不稳定模型 | 防止错误提示词上线 |

## 6. 为什么这样设计

如果 Prompt（提示词）散落在代码里，会有这些问题：

1. 不知道线上到底用了哪个版本。
2. 改坏了很难快速 rollback（回滚）。
3. 不能清楚比较新旧提示词差异。
4. 质量变化和成本变化很难归因到某个 Prompt Version（提示词版本）。
5. 测试时很难替换提示词。
6. 后续如果要让非开发人员编辑提示词，风险会更高。

因此 Day 52 的设计思路是：

```text
PromptRegistry（提示词注册表）
  管版本和状态

PromptTemplate（提示词模板）
  管固定提示词结构

Runtime Variables（运行时变量）
  管实时任务、记忆、工作空间和工具

PromptRenderer（提示词渲染器）
  把模板和变量合成最终提示词

PromptValidator（提示词校验器）
  防止错误变量和坏模板上线

PromptDiff（提示词差异对比）
  帮助上线前看清楚改了什么

Regression Evaluation（回归评估）
  判断新版本是否真的比旧版本好
```

这是一种从“能跑”走向“可维护、可观察、可回滚”的工程化升级。

## 7. 【第52天打卡】

1. 是否定义 PromptTemplate（提示词模板）：是
2. 是否实现 PromptRegistry（提示词注册表）：是

3. 是否实现 renderPrompt（渲染提示词）：是
4. Agent Runtime（智能体运行时）是否接入 PromptRegistry（提示词注册表）：是

5. Tool / Reflection / Evaluation（工具 / 反思 / 评估）是否接入 PromptRegistry（提示词注册表）：是
6. Trace / Usage / Evaluation（追踪 / 用量统计 / 评估）是否记录 promptVersion（提示词版本）：是

7. 是否实现 Prompt Explorer（提示词浏览器）：是
8. 是否实现 Prompt Diff（提示词差异对比）：是

9. Regression Evaluation（回归评估）是否关联 Prompt Version（提示词版本）：是
10. 是否支持 Prompt Rollback（提示词回滚）：是

11. 遇到的最大问题：

提示词从代码里抽出来以后，动态上下文和变量安全成为最大问题。模板里既要能注入实时信息，例如 task（任务）、memory（记忆）、workspace（共享工作空间）、tools（工具），又要防止用户把 `{{task}}` 错写成 `{{task1}}` 这类未知变量。解决方式是引入 Prompt Contract（提示词变量契约）和 Prompt Validator（提示词校验器），在保存和激活前检查未知变量、缺失必需变量、声明变量与模板正文不一致等问题。

12. 当前系统能力：

当前系统已经具备完整的 Prompt Lifecycle Management（提示词生命周期管理）能力：可以定义 PromptTemplate（提示词模板），通过 PromptRegistry（提示词注册表）管理版本，通过 renderPrompt（渲染提示词）注入运行时变量，在 Agent / Tool / Reflection / Evaluation（智能体 / 工具 / 反思 / 评估）链路中记录 `promptId` 和 `promptVersion`，通过 Prompt Explorer（提示词浏览器）查看版本和回滚状态，通过 Prompt Diff（提示词差异对比）比较新旧版本，通过 Regression Evaluation（回归评估）观察质量和成本变化，并通过 Prompt Console（提示词管理控制台）完成新增、编辑、草稿、变量校验、渲染预览和保存激活。

## 8. 最终总结

Day 52 的核心不是“多写几个提示词”，而是把 Prompt（提示词）当成一等工程资产管理。

过去提示词只是代码里的字符串；现在提示词拥有：

- Version（版本）。
- Status（状态）。
- Contract（变量契约）。
- Diff（差异对比）。
- Validation（校验）。
- Rollback（回滚）。
- Trace（追踪）。
- Usage（用量统计）。
- Regression Link（回归关联）。

这让 Agent System（智能体系统）的迭代从“凭感觉改提示词”变成“有版本、有证据、有门禁、有回滚”的工程流程。

## 9. 补充版第52天总结

第52天完成的是 Advanced Optimization V5（高级优化第 5 版）：Prompt Lifecycle Management（提示词生命周期管理）。

现在系统已经支持：

1. Prompt Template（提示词模板化）：把提示词从代码里的硬编码字符串抽离为可管理模板。
2. Prompt Registry（提示词注册表）：集中保存不同组件的提示词版本。
3. Prompt Versioning（提示词版本管理）：支持 `v1`、`v2`、`v3` 等版本并记录 active（启用中）、draft（草稿）、archived（已归档）状态。
4. Prompt Diff（提示词差异对比）：比较两个版本新增、删除和保持不变的内容。
5. Prompt Rollback（提示词回滚）：当新版本效果不好时，可以回退到旧版本。
6. Trace / Usage / Evaluation（追踪 / 用量统计 / 评估）记录 `promptVersion`（提示词版本）：让每次调用都能知道用了哪个提示词版本。
7. Regression Evaluation（回归评估）关联 Prompt Version（提示词版本）：把提示词变化和评估结果绑定起来。
8. Prompt Contract（提示词变量契约）与 Prompt Validator（提示词校验器）：防止 `{{task}}` 被误写成 `{{task1}}` 这类错误变量。
9. Prompt Console（提示词管理控制台）：支持新增、编辑、变量校验、渲染预览、保存和激活。

这意味着 Agent Platform（智能体平台）已经具备真正的 Prompt Engineering Lifecycle（提示词工程生命周期）管理能力。提示词不再只是“写在代码里的字符串”，而是可以被版本化、测试、比较、追踪和回滚的工程资产。

## 10. Day 53 学习计划：Prompt Experiment Platform（提示词实验平台）

Day 53 的核心目标是：把 Prompt Registry（提示词注册表）从“版本管理”升级成“实验平台”。

也就是从：

```text
多个 Prompt Version（提示词版本）
↓
同一批 Evaluation Cases（评估用例）
↓
自动实验
↓
比较效果、成本、稳定性
↓
选出最佳 Prompt（提示词）
```

Day 52 解决的是“Prompt（提示词）怎么管理”，Day 53 要进一步解决“哪个 Prompt（提示词）更好”。

### 10.1 任务 1：定义 PromptExperiment（提示词实验）

PromptExperiment（提示词实验）表示一次针对某个组件的提示词实验。它会指定要测试哪些候选版本、使用哪一批 Evaluation Dataset（评估数据集），以及当前实验状态。

```ts
type PromptExperiment = {
  id: string; // 实验唯一 ID。
  name: string; // 实验名称。
  componentId: string; // 被实验的组件 ID，例如 research 或 writer。
  candidateVersions: string[]; // 候选 Prompt Version（提示词版本）列表。
  datasetId: string; // Evaluation Dataset（评估数据集）ID。
  status: "draft" | "running" | "completed" | "failed"; // 实验状态：草稿、运行中、已完成、失败。
  createdAt: number; // 创建时间。
  updatedAt: number; // 最近更新时间。
};
```

### 10.2 任务 2：定义 PromptExperimentResult（提示词实验结果）

PromptExperimentResult（提示词实验结果）表示某个提示词版本在实验中的表现。

```ts
type PromptExperimentResult = {
  experimentId: string; // 所属实验 ID。
  promptVersion: string; // 当前结果对应的 Prompt Version（提示词版本）。
  averageScore: number; // 平均质量分。
  passRate: number; // 通过率。
  averageCost: number; // 平均成本。
  averageLatencyMs: number; // 平均延迟，单位毫秒。
  regressionCount: number; // Regression（回归退步）案例数量。
  bestCases: string[]; // 表现最好的 Evaluation Cases（评估用例）。
  worstCases: string[]; // 表现最差的 Evaluation Cases（评估用例）。
};
```

### 10.3 任务 3：实现 PromptExperimentRunner（提示词实验运行器）

PromptExperimentRunner（提示词实验运行器）负责执行实验。

需要支持：

```ts
runExperiment(experimentId)
```

核心流程：

```text
读取 candidate prompt versions（候选提示词版本）
↓
读取 Evaluation Dataset（评估数据集）
↓
逐个版本运行 Batch Evaluation（批量评估）
↓
收集 Evaluation / Usage / Trace（评估 / 用量统计 / 追踪）
↓
生成对比结果
```

### 10.4 任务 4：支持多版本 Prompt（提示词）对比

例如同时比较：

```text
research.v1
research.v2
research.v3
```

输出示例：

```text
v1: score（分数）82 / cost（成本）0.008
v2: score（分数）86 / cost（成本）0.011
v3: score（分数）84 / cost（成本）0.006
```

这里不是只看分数，也要看 cost（成本）和 latency（延迟）。因为一个 Prompt（提示词）如果分数高一点，但成本翻倍、延迟很高，也不一定适合上线。

### 10.5 任务 5：增加 Winner Selection（获胜版本选择）

Winner Selection（获胜版本选择）用于定义“哪个提示词版本最好”。

```ts
type WinnerRule = {
  minScore?: number; // 最低可接受质量分。
  maxCostIncrease?: number; // 最大允许成本增长比例。
  requireNoHighPriorityRegression?: boolean; // 是否要求没有高优先级回归退步。
  optimizeFor: "score" | "cost" | "balanced"; // 优化目标：分数、成本或平衡。
};
```

不同业务场景可以使用不同策略：

- `score`（分数优先）：适合高质量要求场景。
- `cost`（成本优先）：适合大量低风险任务。
- `balanced`（平衡模式）：同时考虑质量、成本和稳定性。

### 10.6 任务 6：接入 Quality Gate（质量门禁）

Quality Gate（质量门禁）的作用是防止“平均分看起来不错，但关键案例退步”的版本自动获胜。

例如某个 Prompt（提示词）虽然平均分更高，但导致 high priority case（高优先级案例）退步，那么它不能自动成为 winner（获胜版本）。

这一步非常重要，因为平均分会掩盖局部严重问题。真正上线时，不仅要看整体指标，还要看关键用例有没有 regression（回归退步）。

### 10.7 任务 7：Prompt Experiment Dashboard（提示词实验仪表盘）

前端需要展示：

- Experiment Name（实验名称）。
- Component（组件）。
- Versions（版本列表）。
- Dataset（评估数据集）。
- Score（分数）。
- Cost（成本）。
- Latency（延迟）。
- Winner（获胜版本）。
- Quality Gate（质量门禁）。

Prompt Experiment Dashboard（提示词实验仪表盘）要让用户一眼看出：哪个版本质量最好、哪个版本成本最低、哪个版本能安全上线。

### 10.8 任务 8：Prompt Experiment Timeline（提示词实验时间线）

Timeline（时间线）用于记录实验过程，方便排查和复盘。

需要记录：

```text
Experiment Created（实验已创建）
Version v1 Started（v1 版本开始测试）
Version v1 Completed（v1 版本测试完成）
Version v2 Started（v2 版本开始测试）
Version v2 Completed（v2 版本测试完成）
Winner Selected（已选出获胜版本）
```

这个 Timeline（时间线）不仅是展示用，也是一种 Observability（可观测性）能力：后续如果实验失败，可以知道失败发生在哪个阶段。

### 10.9 任务 9：支持一键 Promote（提升为线上版本）

Promote（提升为线上版本）表示把实验获胜的 Prompt Version（提示词版本）切换为 active（启用中）版本。

如果实验通过：

```text
Promote v3 to active（将 v3 提升为启用版本）
```

底层可以调用：

```ts
promptRegistry.activate(componentId, "v3");
```

这一步会把 Prompt Experiment Platform（提示词实验平台）和 Day 52 的 Prompt Registry（提示词注册表）连接起来：实验选出的 winner（获胜版本）可以直接上线。

### 10.10 任务 10：实验测试

准备：

```text
writer.v1
writer.v2
writer.v3
```

用同一批 Evaluation Cases（评估用例）运行实验。

需要验证：

1. 能比较 score（分数）。
2. 能比较 cost（成本）。
3. 能比较 latency（延迟）。
4. 能识别 regression cases（回归退步案例）。
5. 能根据 Winner Rule（获胜规则）选出 winner（获胜版本）。
6. 能通过 Promote（一键提升）激活 active version（启用版本）。

## 11. Day 53 打卡模板

【第53天打卡】

1. 是否定义 PromptExperiment（提示词实验）：是 / 否
2. 是否定义 PromptExperimentResult（提示词实验结果）：是 / 否

3. 是否实现 PromptExperimentRunner（提示词实验运行器）：是 / 否
4. 是否支持多版本 Prompt（提示词）对比：是 / 否

5. 是否实现 Winner Selection（获胜版本选择）：是 / 否
6. 是否接入 Quality Gate（质量门禁）：是 / 否

7. 是否实现 Prompt Experiment Dashboard（提示词实验仪表盘）：是 / 否
8. 是否实现 Prompt Experiment Timeline（提示词实验时间线）：是 / 否

9. 是否支持一键 Promote（提升为线上版本）：是 / 否
10. 是否完成 Prompt Experiment（提示词实验）测试：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 12. Day 53 核心认知

Prompt Versioning（提示词版本管理）解决“Prompt（提示词）怎么管理”，Prompt Experiment（提示词实验）解决“哪个 Prompt（提示词）更好”。

完成 Day 53 后，系统会升级为 Prompt Experiment Platform V1（提示词实验平台第 1 版）。
