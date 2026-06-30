# Day 55 学习总结：Dynamic Prompt Optimization（动态提示词优化）

## 本文记录范围

本文记录围绕 `ollama-chat-day55` 项目的学习型对话，不记录项目代码修改过程、命令执行过程、文件创建过程等施工细节。

本文主要保留四类内容：

- Day55（第 55 天）项目做了什么。
- Day55（第 55 天）用到了哪些知识。
- Day55（第 55 天）相比 Day54（第 54 天）有什么改进。
- 围绕 Prompt（提示词）、PromptBlock（提示词块）、PromptOptimizer（提示词优化器）和 Multi-Agent（多智能体）的理解问题。

## 一、Day55 项目到底做了什么

### 我的问题

带我来读懂 `ollama-chat-day55` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day54` 有什么改进，为什么这样子做。

### 你的回答

`ollama-chat-day55` 做的是：在 Day54（第 54 天）的 Prompt Composition（提示词组合）基础上，继续升级成 Dynamic Prompt Optimization（动态提示词优化）。

Day54（第 54 天）解决的是：

```text
Prompt（提示词）能不能拆成多个 PromptBlock（提示词块）再组合？
```

Day55（第 55 天）解决的是：

```text
系统能不能根据当前任务自动决定该用哪些 PromptBlock（提示词块）、按什么顺序用、用哪种策略、为什么这样用？
```

也就是说，Day54（第 54 天）让 Prompt（提示词）“可组装”，Day55（第 55 天）让 Prompt（提示词）“会自己选组合”。

## 二、Day55 的核心新增概念

Day55（第 55 天）新增的核心类型在 `prompt-optimization-types.ts` 中。

### PromptOptimizationContext（提示词优化上下文）

`PromptOptimizationContext`（提示词优化上下文）用来描述当前任务需要什么。

它会记录：

```ts
taskType: "chat" | "research" | "planning" | "reflection" | "evaluation";
hasMemory: boolean;
hasWorkspace: boolean;
hasKnowledge: boolean;
requiresJson: boolean;
requiresCitation: boolean;
complexity: "low" | "medium" | "high";
userIntent?: string;
```

这相当于系统先问：

```text
当前任务是普通聊天、研究、规划、反思还是评估？
有没有 Memory（记忆）？
有没有 Workspace（工作空间）？
有没有 Knowledge（知识库证据）？
要不要 JSON（结构化输出）？
要不要 Citation（引用来源）？
任务复杂度高不高？
```

然后再决定怎么拼 Prompt（提示词）。

### PromptRule（提示词规则）

`PromptRule`（提示词规则）描述某个条件成立时，应该启用哪些 PromptBlock（提示词块），关闭哪些 PromptBlock（提示词块）。

例如：

```text
hasMemory = true
  -> 启用 memory.context

requiresJson = true
  -> 启用 output.schema-json

taskType = evaluation
  -> 启用 evaluation.rubric

strategy = fast
  -> 关闭 reflection.checklist
```

### PromptOptimizer（提示词优化器）

`PromptOptimizer`（提示词优化器）是真正做动态决策的模块。

它接收：

```text
PromptBlock[]（候选提示词块）
PromptOptimizationContext（提示词优化上下文）
PromptStrategy（提示词策略）
PromptEvaluationSignal（评估反馈信号）
```

然后输出：

```text
哪些块启用
哪些块关闭
命中了哪些规则
估算 Token（词元）
估算 Cost（成本）
Prompt Recommendation（提示词推荐）
Prompt Optimization Metrics（提示词优化指标）
```

### PromptStrategy（提示词策略）

Day55（第 55 天）新增三种 Prompt Strategy（提示词策略）：

```text
Fast（快速）
Balanced（平衡）
Quality（质量优先）
```

它们的区别是：

```text
Fast（快速）：尽量关闭 Reflection（反思）等高成本块，优先速度和低成本。
Balanced（平衡）：使用默认合理组合，兼顾速度、成本和质量。
Quality（质量优先）：尽量开启 Memory（记忆）、Knowledge（知识）、Citation（引用）、Reflection（反思）等质量块。
```

### Block Weight（提示词块权重）

Day55（第 55 天）给 PromptBlock（提示词块）新增了 `weight`（权重）。

例如：

```text
system.runtime-role     weight 100
active-system           weight 96
memory.context          weight 82
workspace.context       weight 74
knowledge.context       weight 68
task.goal               weight 54
output.format           weight 34
```

这样做的目的是让更重要的块排在更前面。

因为 LLM（Large Language Model，大语言模型）通常更容易重视靠前的上下文，所以 System Block（系统块）、Active Prompt（当前启用提示词）这类高优先级内容应该靠前。

排序规则变成：

```text
先按 weight（权重）降序
再按 order（顺序）升序
最后按 id 稳定排序
```

## 三、Day55 的运行链路

Day54（第 54 天）的链路是：

```text
读取 active Prompt（启用中的提示词）
  -> buildRuntimePromptBlocks（构建运行时提示词块）
  -> PromptBuilder（提示词构建器）
  -> Final Prompt（最终提示词）
```

Day55（第 55 天）的链路升级为：

```text
读取 active Prompt（启用中的提示词）
  -> buildRuntimePromptBlocks（构建候选提示词块）
  -> inferPromptOptimizationContext（推导提示词优化上下文）
  -> PromptOptimizer（提示词优化器）
  -> PromptBuilder（提示词构建器）
  -> Dynamic Prompt（动态提示词）
```

最重要的分工是：

```text
PromptBuilder（提示词构建器）负责“怎么拼 Prompt（提示词）”。
PromptOptimizer（提示词优化器）负责“为什么这样拼 Prompt（提示词）”。
```

## 四、Day55 相比 Day54 的改进

Day54（第 54 天）是结构化。

它把一个大 Prompt（提示词）拆成多个块：

```text
system（系统身份）
memory（记忆）
workspace（工作空间）
tool（工具）
task（任务）
output（输出格式）
```

Day55（第 55 天）是智能决策。

它进一步回答：

```text
这个任务真的需要 Memory Block（记忆块）吗？
这个任务真的需要 Citation Block（引用块）吗？
这个任务是不是必须 JSON（结构化输出）？
这个任务为了快，可以关掉 Reflection Block（反思块）吗？
这个任务为了质量，应该打开 Knowledge Block（知识块）和 Citation Block（引用块）吗？
```

所以 Day55（第 55 天）的改进是：

- 从 Fixed Prompt Composition（固定提示词组合）升级到 Dynamic Prompt Optimization（动态提示词优化）。
- 从“人工每次决定用哪些块”升级到“系统根据 Context（上下文）自动决定”。
- 从“只看组合结果”升级到“能看到 Strategy（策略）、Recommendation（推荐）、Metrics（指标）”。
- 从“所有任务大致一套 Prompt（提示词）”升级到“不同任务不同 Prompt（提示词）”。

## 五、为什么要这样做

因为真实的 Agent（智能体）系统里，不同任务不应该用同一套 Prompt（提示词）。

普通聊天可能不需要：

```text
Knowledge Block（知识块）
Citation Block（引用块）
Reflection Block（反思块）
JSON Schema Block（JSON 结构块）
```

研究报告分析可能需要：

```text
Memory Block（记忆块）
Workspace Block（工作空间块）
Knowledge Block（知识块）
Citation Block（引用块）
Reflection Block（反思块）
```

评估任务可能需要：

```text
Evaluation Rubric Block（评估标准块）
JSON Schema Block（JSON 结构块）
Output Format Block（输出格式块）
```

如果所有任务都开满块，会有三个问题：

- Prompt（提示词）变长，Token（词元）成本变高。
- 简单任务被复杂上下文干扰，回答反而变慢变重。
- 复杂任务又可能因为缺少引用、知识或反思而质量不够。

所以 Day55（第 55 天）引入 PromptOptimizer（提示词优化器），本质是在做三件事：

```text
该省的时候省。
该补的时候补。
该解释的时候给推荐理由。
```

## 六、问题一：Day55 自动决定模块后，前面的提示词新增和修改是不是意义不大了

### 我的问题

Day55 给提示词弄得那么智能，前面做的提示词新增和修改好像就意义不大了呀，都是靠系统来决定提示词要什么模块，怎么将各个模块拼接。

这个系统决定提示词要什么模块信息是靠模型来分析决定的吗？如果是，万一模型出现幻觉什么的，就可能不准确呀，这种情况怎么处理呢？

### 你的回答

Day55（第 55 天）不是要取代前面的 Prompt（提示词）新增和修改，而是把它们的角色重新分层。

它们不是替代关系，而是上下游关系：

```text
Prompt 新增/修改：管理“积木本身长什么样”
PromptOptimizer（提示词优化器）：决定“这次拿哪些积木来搭”
PromptBuilder（提示词构建器）：负责“按规则把积木搭起来”
```

例如，运维人员新增了一个更好的 `citation.requirements`（引用要求块）：

```text
回答必须给出来源、出处和不确定性说明。
```

PromptOptimizer（提示词优化器）只会决定：

```text
这次要不要启用 citation.requirements（引用要求块）
```

但它不会自动知道这个块里面应该怎么写得更专业。

所以前面做的 Prompt Registry（提示词注册表）、Prompt Version（提示词版本）、Prompt Edit（提示词编辑）、Prompt Lifecycle（提示词生命周期）仍然负责：

```text
这个模块里面到底写什么？
哪个版本是 active（启用中）？
旧版本要不要 archive（归档）？
新版本效果好不好？
模板变量有没有写对？
```

Day55（第 55 天）负责的是：

```text
这次任务要不要带 Memory Block（记忆块）？
要不要带 Citation Block（引用块）？
要不要带 JSON Schema Block（JSON 结构块）？
是用 Fast（快速）还是 Quality（质量优先）？
```

所以前面做的东西不是没意义，而是 Day55（第 55 天）让它们从“人工每次拼 Prompt（提示词）”升级为“维护一套高质量 PromptBlock（提示词块）素材库”。

## 七、问题二：系统决定模块是靠模型吗？模型幻觉怎么办？

### 你的回答

在当前 `ollama-chat-day55` 这个教学项目里，主要不是靠模型决定，而是靠规则。

核心是 Rule-based Decision（基于规则的决策）。

例如：

```text
hasMemory = true
  -> 启用 memory.context

requiresJson = true
  -> 启用 output.schema-json

taskType = evaluation
  -> 启用 evaluation.rubric

strategy = fast
  -> 关闭 reflection.checklist
```

这些判断不是 LLM（Large Language Model，大语言模型）自己幻想出来的，而是代码规则写出来的。

Agent Runtime（智能体运行时）里也有一个 `inferPromptOptimizationContext`（推导提示词优化上下文）方法，它会根据任务文本和已有变量做一些 Heuristic（启发式规则）判断。

例如：

```text
任务里包含“引用 / 来源 / 证据”
  -> requiresCitation = true

任务里包含“JSON / 结构化”
  -> requiresJson = true

任务类型是 research（研究）
  -> complexity = high
```

所以当前 Day55（第 55 天）的风险比较可控，因为它不是让模型直接决定：

```text
我要创造一个新 Prompt（提示词）。
我要随便打开一堆模块。
```

而是让代码在 Allowlist（白名单）里选择：

```text
只能从已注册的 PromptBlock（提示词块）中启用或关闭。
```

如果未来真的用模型做 Task Analyzer（任务分析器），也不应该让模型自由生成 Prompt（提示词），而应该让模型只做受限分类。

例如只允许模型输出这种 JSON（结构化结果）：

```json
{
  "taskType": "research",
  "requiresJson": false,
  "requiresCitation": true,
  "complexity": "high"
}
```

然后系统再做 Schema Validation（结构校验）：

```text
taskType 必须是 chat / research / planning / reflection / evaluation 之一。
complexity 必须是 low / medium / high 之一。
requiresJson 必须是 boolean（布尔值）。
```

如果模型输出不合法，就丢弃，回退到默认策略。

常见处理方式包括：

- Rule Fallback（规则兜底）：模型判断失败时，回到规则判断。
- Schema Validation（结构校验）：模型只能输出固定结构，字段不合法就拒绝。
- Allowlist（白名单）：模型不能发明新模块，只能选择系统已有的 block id（块标识）。
- Confidence Threshold（置信度阈值）：如果模型不确定，就用 Balanced（平衡）策略。
- Human Override（人工覆盖）：管理员可以手动启用或禁用某些 PromptBlock（提示词块）。
- Evaluation Feedback（评估反馈）：如果评估发现“缺少引用”，下一轮建议开启 Citation Block（引用块）。
- Observability（可观测性）：记录本次用了哪些块、跳过哪些块、为什么跳过。
- Regression Test（回归测试）：用固定测试集验证优化器有没有把 Prompt（提示词）越改越差。

比较稳的架构是：

```text
用户任务
  -> Task Analyzer（任务分析器，可规则也可模型）
  -> PromptOptimizationContext（提示词优化上下文）
  -> Schema Validation（结构校验）
  -> PromptOptimizer（提示词优化器，规则决策）
  -> PromptBuilder（提示词构建器）
  -> Final Prompt（最终提示词）
```

总结一句：

```text
PromptOptimizer（提示词优化器）不应该成为“会幻想的提示词作者”，
而应该成为“受规则约束的提示词调度器”。
```

## 八、问题三：拿掉一些模块会不会影响语序，或者导致它不再是最好的提示词

### 我的问题

按你的意思就是运维人员总结出最好的提示词，而 Day55 决定这最好的提示词用什么模块；但是提示词是一段话，没了一些模块会不会影响其语序通顺，或者没了一些模块，它是不是可能就已经不是最好的提示词了？

### 你的回答

这个担心很真实，而且是 Day55（第 55 天）这种设计最容易踩坑的地方。

更准确地说，不应该理解成：

```text
运维人员写出一段“最好的完整提示词”
Day55 把它拆开，想删哪个模块就删哪个模块
```

这样确实会有问题。因为一段完整 Prompt（提示词）如果本来是连续作文，抽掉中间几段，很可能语序不通顺、指代断掉、上下文残缺。

更合理的理解应该是：

```text
运维人员维护一组“可独立成立的高质量提示词模块”
Day55 决定这次任务选哪些模块参与组合
```

也就是说，PromptBlock（提示词块）不能是从一篇作文里硬切出来的段落，而应该像积木一样，每块自己能独立表达一个职责。

不好的拆法：

```text
前文说过这些资料后，你还需要注意以下要求……
```

这个块如果脱离前文，就不通顺。

好的拆法：

```text
引用要求：当回答涉及外部资料时，请列出关键依据、来源和不确定性。
```

它自己就完整，不依赖前后文。

所以 Day55（第 55 天）对 PromptBlock（提示词块）有一个隐含要求：

```text
每个模块必须语义自洽、职责单一、可插拔。
```

至于“没了一些模块，它是不是就不是最好的提示词”，答案是：对某个任务来说，可能不是“全局最好”，但可能是“当前最合适”。

例如：

```text
质量最好 ≠ 所有模块都打开
```

普通聊天如果打开 Citation Block（引用块）、Knowledge Block（知识块）、Reflection Block（反思块），反而可能啰嗦、慢、成本高。

研究任务如果关闭 Citation Block（引用块），质量可能下降。

所以 Day55（第 55 天）不是追求一条永远最好的 Prompt（提示词），而是追求：

```text
当前任务下的最佳组合
```

更准确的目标是：

```text
Best Prompt（最佳提示词）
  -> Best Prompt Assembly for Context（当前上下文下的最佳提示词组合）
```

为了解决“不通顺”的问题，实际系统里通常会加几层设计：

- 每个 PromptBlock（提示词块）写成独立指令，不写强依赖前后文的句子。
- 每个块有固定标题，比如 `## 角色`、`## 当前任务`、`## 可用上下文`、`## 输出要求`。
- PromptBuilder（提示词构建器）负责统一串联，而不是简单把自然段拼一起。
- 对某些块设置依赖关系，例如 Citation Block（引用块）依赖 Knowledge Block（知识块）。
- 做组合测试，验证不同组合下 Prompt（提示词）仍然能读通。

所以应该修正为：

```text
不是“最好的一整段提示词被动态删减”，
而是“最好的一批可插拔模块被动态选装”。
```

如果模块本身设计不好，Day55（第 55 天）反而会把问题放大；如果模块设计得好，Day55（第 55 天）才能发挥价值。

## 九、问题四：Day55 的搭积木提示词能不能实现 Multi-Agent

### 我的问题

那前面做的 Multi-Agent（多智能体）系统，实际上就是同一个模型不同提示词，是不是就可以通过 Day55 这种搭积木形式组建提示词来实现 Multi-Agent（多智能体）呢？

### 你的回答

可以这么理解，而且这已经摸到 Multi-Agent（多智能体）系统的一个核心本质了：

```text
很多时候，一个 Agent（智能体）
= 同一个 LLM（大语言模型）
+ 不同 Role Prompt（角色提示词）
+ 不同 Tool（工具权限）
+ 不同 Memory（记忆）
+ 不同 Output Format（输出格式）
+ 不同任务职责
```

所以，前面做的 Multi-Agent（多智能体）系统，早期确实可以理解为：

```text
同一个模型
  -> 换不同提示词
  -> 扮演不同 Agent（智能体）
```

例如：

```text
Research Agent（研究智能体）
= 同一个模型 + 研究型提示词 + 检索工具 + 引用要求

Planner Agent（规划智能体）
= 同一个模型 + 拆解任务提示词 + 步骤输出格式

Critic Agent（审查智能体）
= 同一个模型 + 评估标准提示词 + 风险检查要求

Writer Agent（写作智能体）
= 同一个模型 + 写作提示词 + 最终答案格式
```

Day55（第 55 天）的 PromptBlock（提示词块）搭积木方式，正好可以用来生成不同 Agent（智能体）的提示词。

例如 Research Agent（研究智能体）可以这样组：

```text
System Block（系统块）
+ Research Role Block（研究角色块）
+ Knowledge Block（知识块）
+ Citation Block（引用块）
+ Task Block（任务块）
+ Output Block（输出格式块）
```

Planner Agent（规划智能体）可以这样组：

```text
System Block（系统块）
+ Planner Role Block（规划角色块）
+ Workspace Block（工作空间块）
+ Task Block（任务块）
+ JSON Schema Block（JSON 结构块）
```

Critic Agent（审查智能体）可以这样组：

```text
System Block（系统块）
+ Critic Role Block（审查角色块）
+ Evaluation Rubric Block（评估标准块）
+ Reflection Block（反思块）
+ Output Block（输出格式块）
```

这就是 Day55（第 55 天）对 Multi-Agent（多智能体）的价值：

```text
不用为每个 Agent（智能体）手写一整段完整提示词，
而是为每个 Agent（智能体）动态组装适合它职责的 Prompt（提示词）。
```

但这里有一个关键点：

```text
Prompt（提示词）可以塑造 Agent（智能体），但 Agent（智能体）不只是 Prompt（提示词）。
```

一个完整 Agent（智能体）通常还包括：

```text
Prompt（提示词）
Tool Permission（工具权限）
Memory Scope（记忆范围）
Workspace Access（工作空间访问）
State（状态）
Execution Policy（执行策略）
Input / Output Contract（输入输出契约）
Trace（追踪）
Evaluation（评估）
```

所以 Day55（第 55 天）可以解决的是：

```text
这个 Agent（智能体）这次该用什么 PromptBlock（提示词块）？
```

但 Multi-Agent Runtime（多智能体运行时）还要解决：

```text
谁先执行？
谁把结果交给谁？
失败怎么办？
要不要重试？
多个 Agent（智能体）的结果怎么合并？
哪个 Agent（智能体）能用哪些工具？
中间状态存在哪里？
```

更准确地说：

```text
Day55 可以实现 Multi-Agent（多智能体）里的 Prompt Assembly Layer（提示词组装层）。
但它不能单独替代 Multi-Agent Orchestration（多智能体编排）。
```

系统分层可以理解为：

```text
Multi-Agent Runtime（多智能体运行时）
  -> 决定有哪些 Agent（智能体）、谁调用谁、流程怎么走

PromptOptimizer（提示词优化器）
  -> 决定某个 Agent（智能体）本次用哪些提示词块

PromptBuilder（提示词构建器）
  -> 把这些提示词块拼成最终 Prompt（提示词）
```

一句话：

```text
Multi-Agent（多智能体）负责“谁来干活”。
Day55 PromptOptimizer（提示词优化器）负责“这个干活的人该带什么说明书”。
```

## 十、Day55 打卡

【第55天打卡】

1. 是否定义 PromptOptimizationContext（提示词优化上下文）：是

2. 是否实现 PromptOptimizer（提示词优化器）：是

3. 是否实现 PromptRule（提示词规则）：是

4. 是否支持 Block Weight（提示词块权重）：是

5. 是否实现 Prompt Recommendation（提示词推荐）：是

6. Evaluation（评估）是否接入 PromptOptimizer（提示词优化器）：是

7. 是否支持 Prompt Strategy（提示词策略）：是

8. 是否实现 Prompt Strategy Explorer（提示词策略浏览器）：是

9. 是否增加 Prompt Optimization Metrics（提示词优化指标）：是

10. 是否完成 Dynamic Prompt Test（动态提示词测试）：是

11. 遇到的最大问题：

Day55（第 55 天）最大的理解问题是：当系统可以动态选择 PromptBlock（提示词块）后，前面做的 Prompt Version（提示词版本）、Prompt Edit（提示词编辑）和人工维护提示词是不是就不重要了。最终理解是：前面的能力仍然重要，因为它们负责维护“高质量、可插拔、语义自洽”的 PromptBlock（提示词块）素材库；Day55（第 55 天）只是负责根据 Context（上下文）、Strategy（策略）和 Evaluation（评估反馈）选择本次要使用哪些模块。另一个关键问题是：如果模块来自一整段完整提示词，动态删除模块可能导致语序不通顺。因此 Day55（第 55 天）要求每个 PromptBlock（提示词块）必须职责单一、能独立成立，并由 PromptBuilder（提示词构建器）统一串联。

12. 当前系统能力：

当前系统已经具备 Day55（第 55 天）Dynamic Prompt Optimization（动态提示词优化）的核心教学能力。系统可以定义 PromptOptimizationContext（提示词优化上下文），用 PromptRule（提示词规则）根据 Memory（记忆）、Workspace（工作空间）、Knowledge（知识库证据）、JSON（结构化输出）、Citation（引用来源）、Complexity（复杂度）等条件动态启用或关闭 PromptBlock（提示词块）。系统已经实现 PromptOptimizer（提示词优化器），支持 Fast（快速）、Balanced（平衡）、Quality（质量优先）三种 Prompt Strategy（提示词策略），并支持 Block Weight（提示词块权重）排序、Prompt Recommendation（提示词推荐）、Evaluation Feedback（评估反馈）反向建议、Prompt Optimization Metrics（提示词优化指标）和 Prompt Strategy Explorer（提示词策略浏览器）。Agent Runtime（智能体运行时）已经在 PromptBuilder（提示词构建器）之前接入 PromptOptimizer（提示词优化器），可以先推导 PromptOptimizationContext（提示词优化上下文），再动态生成最终 Prompt（提示词）。测试层已经提供 Dynamic Prompt Test（动态提示词测试），覆盖普通聊天、Research（研究）、JSON（结构化输出）、Reflection（反思）、Evaluation（评估）等任务类型。

## 十一、Day55 核心认知

Day55（第 55 天）最重要的一句话是：

```text
PromptBuilder（提示词构建器）负责“怎么拼 Prompt（提示词）”，
PromptOptimizer（提示词优化器）负责“为什么这样拼 Prompt（提示词）”。
```

Day54（第 54 天）解决的是 Prompt（提示词）的结构化。

Day55（第 55 天）解决的是 Prompt（提示词）的智能决策。

完成 Day55（第 55 天）后，系统从：

```text
Prompt Composition（提示词组合）
```

升级为：

```text
Dynamic Prompt Optimization（动态提示词优化）
```

它不是让模型随意幻想提示词，而是让系统在规则、白名单、结构校验、策略和评估反馈的约束下，动态选择当前任务最合适的 PromptBlock（提示词块）组合。

## 十二、第55天补充总结

第55天完成的是 Intelligent Prompt Optimization Engine（智能提示词优化引擎）。

到 Day55（第 55 天）为止，Prompt（提示词）系统已经形成了一个相对完整的生命周期：

```text
Prompt Registry（提示词注册表）
  -> Prompt Template（提示词模板）
  -> Prompt Block（提示词块）
  -> Prompt Builder（提示词构建器）
  -> Prompt Optimizer（提示词优化器）
  -> Prompt Strategy（提示词策略）
  -> Dynamic Prompt（动态提示词）
  -> Evaluation（评估）
  -> Prompt Recommendation（提示词推荐）
```

相比 Day52（第 52 天）主要是在管理 Prompt（提示词），Day55（第 55 天）已经升级为自动优化 Prompt（提示词）。

这已经接近 OpenAI（人工智能模型平台）、Anthropic（人工智能公司）、Cursor（AI 编程工具）等产品内部 Prompt Framework（提示词框架）的设计思路：不是只保存提示词，而是让提示词拥有 Registry（注册表）、Template（模板）、Block（模块）、Strategy（策略）、Optimization（优化）、Evaluation（评估）和 Recommendation（推荐）等完整链路。

## 十三、当前整体进度

当前整体进度可以理解为：

```text
Agent Foundation（智能体基础）              100%
Workflow Runtime（工作流运行时）            100%
Tool Runtime（工具运行时）                  100%
RAG Runtime（检索增强生成运行时）            100%
Queue Runtime（队列运行时）                 100%
Execution Platform（执行平台）              100%
Multi-Agent Runtime（多智能体运行时）        100%
Continuous Evaluation（持续评估）           100%
Production Runtime（生产运行时）            100%
Prompt Lifecycle（提示词生命周期）           100%
Advanced Optimization（高级优化）            90%
Infrastructure（基础设施）                    0%
```

整体已经达到约 98%。

从 Day56（第 56 天）开始，系统会进入最后一个 Runtime（运行时）能力模块：Multi-Model Collaboration（多模型协作）。

## 十四、第56天学习计划

Day56（第 56 天）的主题是 Advanced Optimization V6（高级优化第六版）：Multi-Model Collaboration Runtime（多模型协作运行时）。

很多人会认为 Model Router（模型路由）已经足够了，但 Day50（第 50 天）的 Model Router（模型路由）解决的是：

```text
一个任务
  -> 选择一个模型
```

Day56（第 56 天）要解决的是：

```text
一个任务
  -> 多个模型
  -> 共同完成
```

这就是 Multi-Model Collaboration（多模型协作）。它也是 Manus（AI 智能体产品）、Claude Code（Claude 编程工具）、Cursor（AI 编程工具）、OpenAI Deep Research（OpenAI 深度研究能力）等产品正在大量采用的能力。

## 十五、为什么必须学习 Multi-Model Collaboration（多模型协作）

例如用户提出：

```text
请帮我写一篇 LangGraph（图式智能体编排框架）教程。
```

如果只使用 Qwen（通义千问模型）完成，效果可能只是一般。

如果采用多个模型协作，可以让：

```text
DeepSeek（深度求索模型）
  -> 负责 Reasoning（推理）

Qwen（通义千问模型）
  -> 负责 Writing（写作）

Evaluation Model（评估模型）
  -> 负责 Checking（检查）
```

这样最终效果通常会更好。

所以 Day56（第 56 天）的关键不是 Model Router（模型路由），而是 Model Team（模型团队）。

以前的链路可能是：

```text
Research Agent（研究智能体）
  -> Qwen（通义千问模型）
```

之后的链路会升级为：

```text
Research Agent（研究智能体）
  -> Reasoning Model（推理模型）
  -> Writing Model（写作模型）
  -> Evaluation Model（评估模型）
```

## 十六、第56天任务

### 任务1：定义 ModelRole（模型角色）

新增 ModelRole（模型角色）类型：

```ts
type ModelRole =
  | "reasoning"
  | "writing"
  | "evaluation"
  | "json"
  | "embedding"
  | "summary";
```

它的作用是描述一个模型可以承担哪些 Role（角色）。同一个模型可以承担多个 Role（角色）。

### 任务2：升级 ModelProfile（模型档案）

在 ModelProfile（模型档案）中新增：

```ts
roles: ModelRole[];
```

例如 DeepSeek（深度求索模型）可以适合 reasoning（推理），Qwen（通义千问模型）可以适合 writing（写作）和 summary（摘要）。

### 任务3：定义 CollaborationPlan（模型协作计划）

新增 CollaborationPlan（模型协作计划）类型：

```ts
type CollaborationPlan = {
  taskId: string;
  stages: {
    role: ModelRole;
    modelId: string;
    inputFrom?: string[];
  }[];
};
```

它用于描述多个模型按照什么 Stage（阶段）顺序协作。例如 Reasoning（推理）先执行，Writing（写作）接收推理结果，Evaluation（评估）最后检查输出。

### 任务4：实现 ModelCollaborationPlanner（模型协作规划器）

新增：

```ts
planModels(task)
```

它根据 Task（任务）自动规划模型协作方式。

例如 Research（研究）任务可以被规划为：

```text
reasoning（推理）
  -> writing（写作）
  -> evaluation（评估）
```

### 任务5：实现 ModelCollaborationExecutor（模型协作执行器）

新增：

```ts
executePlan(collaborationPlan)
```

它的职责是按照 CollaborationPlan（模型协作计划）顺序执行多个模型，并支持 Context Passing（上下文传递）。

### 任务6：支持 Parallel Model Execution（模型并行执行）

例如可以让 Qwen（通义千问模型）和 Claude（Claude 模型）同时进行 Research（研究），最后再 Merge（合并）结果。

Parallel Model Execution（模型并行执行）的价值是：当多个模型可以同时从不同角度分析问题时，不必让它们串行等待，从而降低总耗时，并提升答案覆盖面。

### 任务7：实现 Model Result Merge（模型结果合并）

新增：

```ts
mergeResults(results)
```

它用于把多个模型的结果合并成最终答案。

例如：

```text
Research（研究）
  + Writing（写作）
  -> Final Answer（最终答案）
```

或者：

```text
Claude（Claude 模型）
  + Qwen（通义千问模型）
  -> Consensus（一致性结论）
```

### 任务8：Trace / Usage 接入 Collaboration（模型协作）

Trace（调用链追踪）需要新增 Model Collaboration（模型协作）维度，例如：

```text
Model Collaboration（模型协作）
  -> Stage1（第一阶段）
  -> Stage2（第二阶段）
  -> Stage3（第三阶段）
```

Usage（用量统计）也需要分别记录每个模型的调用情况，例如 Token（词元）消耗、Duration（耗时）和 Cost（成本）。

### 任务9：实现 Model Collaboration Explorer（模型协作浏览器）

前端需要新增 Model Collaboration Explorer（模型协作浏览器），用于展示：

- Model Team（模型团队）
- Reasoning（推理）
- Writing（写作）
- Evaluation（评估）
- Duration（耗时）
- Cost（成本）
- 每个 Stage（阶段）的输入和输出

它的作用是让用户能够看懂一次任务到底调用了哪些模型、每个模型负责什么、协作链路是否合理。

### 任务10：完成 Multi-Model Test（多模型协作测试）

测试至少覆盖三类 Task（任务）：

```text
Research（研究）
  -> Reasoning（推理） + Writing（写作）

JSON（结构化输出）
  -> Reasoning（推理） + JSON（结构化输出）

Evaluation（评估）
  -> Evaluation Model（评估模型）
```

测试目标是验证多个 Model（模型）是否真的发生了协作，而不是仍然只有一个模型在单独完成任务。

## 十七、第56天验收标准

1. 是否定义 ModelRole（模型角色）
2. 是否升级 ModelProfile（模型档案）支持 roles（角色列表）
3. 是否定义 CollaborationPlan（模型协作计划）
4. 是否实现 ModelCollaborationPlanner（模型协作规划器）
5. 是否实现 ModelCollaborationExecutor（模型协作执行器）
6. 是否支持 Parallel Model Execution（模型并行执行）
7. 是否实现 Model Result Merge（模型结果合并）
8. Trace / Usage（调用链追踪 / 用量统计）是否接入 Collaboration（模型协作）
9. 是否实现 Model Collaboration Explorer（模型协作浏览器）
10. 是否完成 Multi-Model Test（多模型协作测试）

## 十八、第56天打卡模板

【第56天打卡】

1. 是否定义 ModelRole（模型角色）：是 / 否

2. 是否升级 ModelProfile（模型档案）支持 roles（角色列表）：是 / 否

3. 是否定义 CollaborationPlan（模型协作计划）：是 / 否

4. 是否实现 ModelCollaborationPlanner（模型协作规划器）：是 / 否

5. 是否实现 ModelCollaborationExecutor（模型协作执行器）：是 / 否

6. 是否支持 Parallel Model Execution（模型并行执行）：是 / 否

7. 是否实现 Model Result Merge（模型结果合并）：是 / 否

8. Trace / Usage（调用链追踪 / 用量统计）是否接入 Collaboration（模型协作）：是 / 否

9. 是否实现 Model Collaboration Explorer（模型协作浏览器）：是 / 否

10. 是否完成 Multi-Model Test（多模型协作测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 十九、Day56 核心认知

Day56（第 56 天）最重要的一句话是：

```text
Model Router（模型路由）决定“谁来做”，
Multi-Model Collaboration（多模型协作）决定“大家怎么一起做”。
```

Model Router（模型路由）像是任务分配器，它会从多个模型里选择一个更合适的模型。

Multi-Model Collaboration（多模型协作）像是模型团队协作机制，它会让不同模型分别承担 Reasoning（推理）、Writing（写作）、Evaluation（评估）、JSON（结构化输出）、Embedding（向量化）或 Summary（摘要）等不同职责。

## 二十、后续路线优化建议

根据当前进度，后续路线可以这样安排：

```text
Day56~57（第 56 天到第 57 天）
  -> 完成最后两个 Runtime（运行时）：Multi-Model Collaboration（多模型协作）和 Adaptive Routing（自适应路由）

Day58~63（第 58 天到第 63 天）
  -> 学习 Redis（内存数据库 / 缓存与队列基础设施）、Distributed Queue（分布式队列）、Config Center（配置中心）等基础设施

Day64~73（第 64 天到第 73 天）
  -> 把前面所有“教学版”模块统一升级为真正互通的 Production Version（生产版），包括 Redis（内存数据库 / 缓存与队列基础设施）、Dynamic Registry（动态注册表）、Unified Runtime（统一运行时）、Real Experiment（真实实验系统）等

Day74~80（第 74 天到第 80 天）
  -> 学习 MCP（Model Context Protocol，模型上下文协议）、Docker（容器化工具）、CI/CD（持续集成 / 持续交付）、Deployment（部署）和 Enterprise Capability（企业级能力）
```

这样做的好处是：不会陷入“边学边重构”的循环，而是在 Infrastructure（基础设施）到位后，再进行一次完整的 Production Upgrade（生产化升级）。这也是工业项目中更常见、也更高效的演进方式。
