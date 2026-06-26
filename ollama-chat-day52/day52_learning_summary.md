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
