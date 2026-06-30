# Day 56 学习总结：Multi-Model Collaboration Runtime（多模型协作运行时）

## 本文记录范围

本文记录围绕 `ollama-chat-day56` 项目的学习型对话，重点保留这些内容：

- Day56（第 56 天）项目做了什么。
- Day56（第 56 天）运用了哪些核心知识。
- Day56（第 56 天）相比 Day55（第 55 天）有什么改进。
- Tool Calling（工具调用）、Model Router（模型路由）、Multi-Agent（多智能体）和 Multi-Model Collaboration（多模型协作）之间的层级关系。
- Agent（智能体）、Model（模型）、Role Prompt（角色提示词）、Tool（工具）、Memory（记忆）之间的关系。

本文不记录项目代码创建、复制、修改、命令执行等施工过程，只记录用于理解系统设计的学习对话。

## 一、Day56 项目到底做了什么

### 我的问题

带我来读懂 `ollama-chat-day56` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day55` 有什么改进，为什么这样子做；且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述。

### 回答

Day56（第 56 天）的一句话核心是：它把 Day55（第 55 天）的 Dynamic Prompt Optimization（动态提示词优化）再往上一层升级，从“怎么拼 Prompt（提示词）”变成“怎么组织多个 Model（模型）一起完成任务”。

Day56（第 56 天）新增的是 Multi-Model Collaboration Runtime（多模型协作运行时）。

它的核心链路是：

```text
用户任务
  -> CollaborationTask（协作任务）
  -> ModelCollaborationPlanner（模型协作规划器）
  -> CollaborationPlan（协作计划）
  -> ModelCollaborationExecutor（模型协作执行器）
  -> 多个 Stage（阶段）串行或并行执行
  -> mergeResults（结果合并）
  -> 最终答案 + Trace（追踪记录）+ Usage（用量记录）
```

Day56（第 56 天）不是简单地换一个模型，而是在已有 Model Executor（模型执行器）之上，加了一层 Model Orchestration（模型编排）。

### 核心文件

- `lib/model/model-collaboration-types.ts`：定义 CollaborationTask（协作任务）、CollaborationPlan（协作计划）、CollaborationStage（协作阶段）、CollaborationExecutionResult（协作执行结果）等类型。
- `lib/model/model-collaboration-planner.ts`：实现 ModelCollaborationPlanner（模型协作规划器），负责把任务拆成多个模型阶段。
- `lib/model/model-collaboration-executor.ts`：实现 ModelCollaborationExecutor（模型协作执行器），负责串行、并行、上下文传递和调用模型。
- `lib/model/model-collaboration-merge.ts`：实现 mergeResults（结果合并），把多个阶段输出合成最终答案。
- `app/components/ModelCollaborationExplorer.tsx`：实现 Model Collaboration Explorer（模型协作浏览器），用于前端展示模型团队、计划、结果、耗时和成本。
- `app/api/model/collaboration/route.ts`：提供模型协作 API（应用程序接口）。
- `scripts/test-day56-model-collaboration.ts`：提供 Day56（第 56 天）自动化测试。
- `day56_test_cases.md`：记录 Day56（第 56 天）测试用例说明。

## 二、Day56 的核心概念

Day56（第 56 天）先给模型增加了 ModelRole（模型角色）。

```text
reasoning（推理）
writing（写作）
evaluation（评估）
json（结构化输出）
embedding（向量化）
summary（摘要）
```

然后在 ModelProfile（模型档案）里新增 `roles`（角色列表）字段。

这意味着一个模型不只是有 Capability（能力），还知道自己在团队里适合扮演什么 Role（角色）。

例如：

```text
large-reasoning（大型推理模型）
  -> 适合 reasoning（推理）

json-structured（结构化 JSON 模型）
  -> 适合 json（结构化输出）、summary（摘要）、writing（写作）

evaluation（评估模型）
  -> 适合 evaluation（评估）、json（结构化输出）、reasoning（推理）
```

## 三、Planner（规划器）如何决策

ModelCollaborationPlanner（模型协作规划器）使用 Rule-based Planning（基于规则的规划）。

它不是让 LLM（Large Language Model，大语言模型）自由幻想协作方式，而是用代码规则生成 CollaborationPlan（协作计划）。

典型规则如下：

```text
embedding（向量化）任务
  -> embedding（向量化）单阶段

evaluation（评估）或 reflection（反思）任务
  -> evaluation（评估）单阶段

json（结构化输出）或 requiresJson（要求 JSON）
  -> reasoning（推理） -> json（结构化输出）

summary（摘要）任务
  -> summary（摘要）单阶段

research（研究）或 planning（规划）任务
  -> reasoning（推理） -> writing（写作）
  -> 高复杂度时追加 evaluation（评估）

高复杂度 research（研究）且 allowParallel=true（允许并行）
  -> reasoning（推理） + summary（摘要）并行
  -> writing（写作）汇总
  -> evaluation（评估）检查
```

所以 Day56（第 56 天）回答的问题不是“选哪一个模型”，而是：

```text
这个任务需要哪些模型角色？
这些角色按什么顺序执行？
哪些阶段可以并行？
哪个阶段依赖哪个阶段的输出？
```

## 四、Executor（执行器）如何执行

ModelCollaborationExecutor（模型协作执行器）负责真正执行 CollaborationPlan（协作计划）。

它做了几件关键事情：

1. Dependency Scheduling（依赖调度）：只有上游 Stage（阶段）完成后，下游 Stage（阶段）才会执行。
2. Parallel Execution（并行执行）：同一个 parallelGroup（并行分组）里的阶段会通过 `Promise.all` 同时执行。
3. Context Passing（上下文传递）：下游 Stage（阶段）会收到上游 Stage（阶段）的输出。
4. Fallback（降级）复用：底层仍然调用已有 ModelExecutor（模型执行器），继续复用 fallback（备用模型）、timeout（超时）和 Circuit Breaker（熔断器）等能力。
5. Observability（可观测性）：每个阶段都会记录 Trace（追踪记录）和 Usage（用量记录）。

例如 Research（研究）任务可以这样执行：

```text
reasoning（推理） + summary（摘要）并行执行
  -> writing（写作）接收两个上游输出并整理成答案
  -> evaluation（评估）检查完整性、遗漏和一致性
  -> mergeResults（结果合并）生成最终答案
```

## 五、mergeResults（结果合并）如何工作

mergeResults（结果合并）负责把多个阶段的输出整理成最终答案。

当前策略比较简单，适合教学项目：

```text
优先采用 evaluation（评估）阶段输出
否则采用 writing（写作）或 json（结构化输出）阶段输出
否则采用最后一个有内容的阶段输出
```

它还会补充：

- sourceStageIds（来源阶段 ID 列表）
- consensus（一致性说明 / 合并说明）
- 协作合并说明
- 每个阶段的摘要

这样用户可以看到最终答案不是凭空来的，而是由哪些模型阶段共同生成的。

## 六、Day56 对比 Day55 的改进

Day55（第 55 天）解决的是 Prompt Layer（提示词层）的问题。

它回答的是：

```text
这个任务应该启用哪些 PromptBlock（提示词块）？
这些 PromptBlock（提示词块）按什么顺序拼？
应该使用 Fast（快速）、Balanced（平衡）还是 Quality（质量优先）策略？
```

Day56（第 56 天）解决的是 Model Orchestration Layer（模型编排层）的问题。

它回答的是：

```text
这个任务应该由哪些模型角色一起做？
这些角色是串行 Pipeline（流水线）还是 Parallel（并行）？
哪个模型负责推理？
哪个模型负责写作？
哪个模型负责评估？
多个模型结果怎么 Merge（合并）？
```

可以这样记：

```text
Day55（第 55 天）：优化“给模型看的输入”
Day56（第 56 天）：优化“哪些模型一起工作，以及怎么工作”
```

更简洁地说：

```text
PromptOptimizer（提示词优化器）决定“这次怎么拼 Prompt（提示词）”
ModelCollaborationPlanner（模型协作规划器）决定“这次怎么组织模型团队”
```

## 七、为什么要这样设计

因为真实复杂任务通常不是一个模型单独完成效果最好。

比如用户要求：

```text
帮我写一份 LangGraph 教程，要有概念解释、适用场景、风险、示例代码，最后再检查是否遗漏。
```

如果只让一个模型做，它要同时负责分析、写作、结构化、检查，压力会比较大。

Day56（第 56 天）可以拆成：

```text
Reasoning Model（推理模型）
  -> 负责拆问题、搭结构、判断重点

Summary Model（摘要模型）
  -> 负责提炼背景和目标

Writing Model（写作模型）
  -> 负责组织成用户可读答案

Evaluation Model（评估模型）
  -> 负责检查遗漏、风险和一致性
```

这样设计的好处是：

- Decomposition（任务拆解）：复杂问题拆成多个阶段，每个阶段更清晰。
- Specialization（专业化分工）：不同模型做自己更擅长的事情。
- Parallel Execution（并行执行）：可以减少总等待时间。
- Context Passing（上下文传递）：后续阶段基于上游结果继续加工。
- Observability（可观测性）：Trace（追踪记录）和 Usage（用量记录）让过程可解释、可调试、可算成本。

## 八、Tool Calling、Model Router、Multi-Agent 和 Multi-Model Collaboration 的关系

### 我的问题

有点迷茫了，对于 Day56（第 56 天）是多个模型去完成用户的任务，Day50（第 50 天）的 Model Router（模型路由）完成的是对用户的任务选择一个模型，而前面还有一个模型多 Agent（智能体）来实现用户任务，更前面还有单模型决定多个工具来实现用户工具；可以举些生活中的例子来说明这些一层层之间的关系吗？我觉得用户一般的问题不至于拆分这么多层吧。

### 回答

这个迷茫很正常，因为这些层看起来都在“帮用户完成任务”，但它们解决的是不同维度的问题。

最关键的一句话是：

```text
Tool Calling（工具调用）解决“要不要用工具”
Model Router（模型路由）解决“用哪个模型”
Multi-Agent（多智能体）解决“分成哪些角色做”
Multi-Model Collaboration（多模型协作）解决“多个模型怎么分工配合”
```

### 生活例子：修家里的水管

#### 1. Tool Calling（工具调用）

Tool Calling（工具调用）像一个维修师傅自己带工具箱。

```text
用户：水管漏了，帮我处理一下。
维修师傅：我需要扳手、胶带、测压器。
```

这里重点不是换人，而是“一个人决定用哪些工具”。

对应到系统里就是：

```text
一个模型
  -> 判断要不要调用 Search（搜索）、Calculator（计算器）、Weather API（天气接口）、File Tool（文件工具）
  -> 拿工具结果回答用户
```

#### 2. Model Router（模型路由）

Model Router（模型路由）像前台根据任务难度选择派谁去。

```text
简单漏水 -> 派普通维修师傅
复杂管道改造 -> 派资深师傅
只需要报价 -> 派客服或估价员
```

这里重点是“选一个最合适的人”。

对应 Day50（第 50 天）就是：

```text
用户任务
  -> Model Router（模型路由）
  -> 选择一个模型
  -> 这个模型完成任务
```

它解决的是：不要所有问题都用最贵、最慢、最强的模型。

#### 3. Multi-Agent（多智能体）

Multi-Agent（多智能体）像一个装修项目不是一个人干，而是分角色。

```text
项目经理：拆任务、排期
水电师傅：处理水管
采购员：买材料
质检员：检查是否合格
```

这里重点是“任务流程和角色职责”。

对应到系统里就是：

```text
Planner Agent（规划智能体）
  -> Research Agent（研究智能体）
  -> Executor Agent（执行智能体）
  -> Reviewer Agent（审查智能体）
```

Multi-Agent（多智能体）关心的是“谁负责哪类工作流步骤”，它更像组织结构。

#### 4. Multi-Model Collaboration（多模型协作）

Multi-Model Collaboration（多模型协作）像同一个任务里，不同专家各自发挥特长。

```text
资深师傅：判断漏水原因
手快的师傅：整理维修方案
质检师傅：检查方案有没有风险
报价员：生成结构化报价单
```

这里重点是“多个不同能力的人一起产出一个答案”。

对应 Day56（第 56 天）就是：

```text
Reasoning Model（推理模型）
  -> 先分析问题

Summary Model（摘要模型）
  -> 并行提炼背景

Writing Model（写作模型）
  -> 整理成最终答案

Evaluation Model（评估模型）
  -> 检查遗漏和风险
```

### 它们不是每次都全用

用户一般的问题确实不应该拆这么多层。

例如：

```text
用户：帮我润色一句话。
```

合理路径可能只是：

```text
Model Router（模型路由）选一个便宜快模型
  -> 模型直接回答
```

再比如：

```text
用户：北京今天下雨吗？
```

合理路径是：

```text
一个模型
  -> Weather Tool（天气工具）
  -> 回答
```

不需要 Multi-Agent（多智能体），也不需要 Multi-Model Collaboration（多模型协作）。

但是复杂任务就不一样。

例如：

```text
用户：帮我写一份 LangGraph 教程，要有概念解释、适用场景、风险、示例代码，最后再检查是否遗漏。
```

这时 Day56（第 56 天）才有意义：

```text
reasoning（推理）负责搭框架
summary（摘要）负责提炼信息
writing（写作）负责成文
evaluation（评估）负责检查质量
```

## 九、超级复杂任务会不会变成多模型、多 Agent、多工具组合

### 我的问题

如果是个超级复杂的任务，就是选了多个模型，每个模型选多个 Agent（智能体），每个 Agent（智能体）又选择多个工具来实现这样子吗？

### 回答

超级复杂任务里可以组合成多层协作，但更准确的结构不是“每个模型再选多个 Agent（智能体）”，而是：

```text
用户任务
  -> Orchestrator / Planner（编排器 / 规划器）拆任务
  -> 多个 Agent（智能体 / 岗位角色）分别负责子任务
  -> 每个 Agent（智能体）根据需要选择 Model（模型）和 Tool（工具）
  -> 必要时某个子任务内部再触发 Multi-Model Collaboration（多模型协作）
  -> Reviewer / Evaluator（审查器 / 评估器）汇总检查
```

所以关系更像：

```text
Agent（智能体）是“岗位”
Model（模型）是“脑子”
Tool（工具）是“手和设备”
Router（路由器）是“派哪个脑子”
Collaboration（协作）是“多个脑子一起想”
```

不是模型在上面管理 Agent（智能体），而是 Agent（智能体）或 Orchestrator（编排器）决定该用哪个模型、哪些工具。

### 生活例子：装修一套房

```text
用户：帮我完成整套装修。
```

系统不会让一个人从设计、采购、施工、验收全干完。它可能这样拆：

```text
项目经理 Agent（规划智能体）
  -> 拆任务、排期、控制预算

设计师 Agent（设计智能体）
  -> 用推理模型分析需求
  -> 用图片或户型工具看图纸

采购 Agent（采购智能体）
  -> 用搜索工具查材料价格
  -> 用表格工具整理预算

施工 Agent（执行智能体）
  -> 按步骤推进任务

质检 Agent（评估智能体）
  -> 用评估模型检查风险、遗漏、预算超支
```

其中某个 Agent（智能体）里面还可以再用多个模型。

比如设计师 Agent（设计智能体）遇到复杂设计时：

```text
Reasoning Model（推理模型）分析空间限制
Writing Model（写作模型）整理设计说明
Evaluation Model（评估模型）检查是否违反预算和需求
```

这就是 Day56（第 56 天）的 Multi-Model Collaboration（多模型协作）。

### 软件系统里的超级复杂任务

例如：

```text
用户：帮我做一个 AI 产品竞品分析，包含调研、数据表、结论、PPT 大纲和风险评估。
```

可能拆成：

```text
Planner Agent（规划智能体）
  -> 拆成调研、分析、写作、评估

Research Agent（研究智能体）
  -> Search Tool（搜索工具）
  -> Browser Tool（浏览器工具）
  -> Summary Model（摘要模型）

Data Agent（数据分析智能体）
  -> Python Tool（Python 工具）
  -> Spreadsheet Tool（表格工具）
  -> Reasoning Model（推理模型）

Writer Agent（写作智能体）
  -> Writing Model（写作模型）

Reviewer Agent（审查智能体）
  -> Evaluation Model（评估模型）
  -> 检查事实、结构、遗漏、风险
```

但这不是所有任务都这么跑。真实系统应该有 Gating（门控判断），也就是先判断任务复杂度。

```text
简单问题：直接单模型回答
需要外部信息：单模型 + Tool Calling（工具调用）
需要选模型：Model Router（模型路由）
需要多步骤：Multi-Agent（多智能体）
需要多个模型互补：Multi-Model Collaboration（多模型协作）
超级复杂任务：Multi-Agent（多智能体） + Multi-Model（多模型） + Tools（工具）全部组合
```

### 医院分诊类比

好的系统不是每次都把所有层打开，而是像医院分诊：

```text
小感冒
  -> 普通门诊

需要拍片
  -> 医生 + 检查设备

疑难杂症
  -> 多科会诊

重大手术
  -> 主刀医生 + 麻醉师 + 护士 + 检查设备 + 术后评估
```

对应关系是：

```text
Model Router（模型路由）
  -> 分诊台，决定找普通医生还是专家

Multi-Agent（多智能体）
  -> 多科室协作，内科、影像科、药剂科、护士各做一部分

Tool Calling（工具调用）
  -> 检查设备，抽血、拍片、心电图

Multi-Model Collaboration（多模型协作）
  -> 专家会诊，几个专家从不同角度一起判断
```

最终理解可以压缩成一句：

```text
普通任务不要复杂化；
复杂任务才逐层升级；
超级复杂任务才会出现 Agent（岗位）+ Model（脑子）+ Tool（工具）+ Collaboration（协作）的组合。
```

## 十、Agent 和 Day56 Stage 的关系

### 我的问题

Agent（智能体）是：

```text
一个 Agent（智能体）
= 同一个 LLM（大语言模型）
+ 不同 Role Prompt（角色提示词）
+ 不同 Tool（工具权限）
+ 不同 Memory（记忆）
+ 不同 Output Format（输出格式）
+ 不同任务职责
```

而此时 Day56（第 56 天）先通过不同的任务给予 Agent（智能体）不同的 LLM（大语言模型）吗，然后来实现 Multi-Model Collaboration（多模型协作）吗？

### 回答

这个对 Agent（智能体）的理解基本是对的。

```text
Agent（智能体）
= LLM（大语言模型）
+ Role Prompt（角色提示词）
+ Tool Permissions（工具权限）
+ Memory（记忆）
+ Output Format（输出格式）
+ Task Responsibility（任务职责）
```

但是 Day56（第 56 天）这里要稍微区分一下：它还没有做到完整 Multi-Agent（多智能体）系统，而是做了一个更轻量的 Multi-Model Collaboration（多模型协作）层。

更准确地说，Day56（第 56 天）不是：

```text
先创建多个完整 Agent（智能体）
再给每个 Agent（智能体）分配不同 LLM（大语言模型）
```

而是：

```text
用户任务
  -> Planner（规划器）判断需要哪些 Stage（阶段）
  -> 每个 Stage（阶段）有一个 Role（角色）
  -> 每个 Role（角色）选择一个合适的 Model（模型）
  -> Executor（执行器）按顺序或并行调用这些模型
  -> Merge（合并）结果
```

也就是说，Day56（第 56 天）的核心单位不是完整 Agent（智能体），而是 CollaborationStage（协作阶段）。

```text
CollaborationStage（协作阶段）
= role（角色）
+ modelId（模型 ID）
+ inputFrom（依赖哪些上游阶段）
+ parallelGroup（并行分组）
+ reason（规划原因）
```

所以可以把 Day56（第 56 天）的每个 Stage（阶段）理解成一个 Thin Agent（轻量智能体）：

```text
reasoning stage（推理阶段）
= reasoning role prompt（推理角色提示词）
+ large-reasoning model（大型推理模型）

writing stage（写作阶段）
= writing role prompt（写作角色提示词）
+ small-chat 或 json-structured model（写作 / 整理模型）

evaluation stage（评估阶段）
= evaluation role prompt（评估角色提示词）
+ evaluation model（评估模型）
```

但是它和完整 Agent（智能体）的区别是：Day56（第 56 天）的 Stage（阶段）目前主要有 Role Prompt（角色提示词）和 Model（模型），还没有独立的 Memory（记忆）、Tool（工具权限）、长期状态和完整任务生命周期。

可以这样分层理解：

```text
完整 Agent（智能体）
= 有脑子、有身份、有工具、有记忆、有职责的人

Day56 CollaborationStage（Day56 协作阶段）
= 有角色、有模型、有输入输出依赖的轻量执行单元
```

### Day56 是不是“给不同 Agent 分配不同 LLM”

概念上接近，但代码上更准确是：

```text
给不同 Stage（阶段）分配不同 LLM（大语言模型）
```

例如 Research（研究）任务：

```text
用户：帮我写一份 LangGraph 教程。

Planner（规划器）生成计划：

reasoning（推理）
  -> 选择 large-reasoning model（大型推理模型）

summary（摘要）
  -> 选择 small-chat 或 json-structured model（摘要模型）

writing（写作）
  -> 选择 writing model（写作模型）

evaluation（评估）
  -> 选择 evaluation model（评估模型）
```

然后 Executor（执行器）让这些阶段协作：

```text
reasoning（推理） + summary（摘要）并行
  -> writing（写作）汇总
  -> evaluation（评估）检查
  -> mergeResults（结果合并）
```

### 和真正 Multi-Agent（多智能体）的关系

以后如果系统继续升级，可以把 Day56（第 56 天）的 Stage（阶段）升级成真正 Agent（智能体）：

```text
Research Agent（研究智能体）
= reasoning model（推理模型）
+ search tool（搜索工具）
+ citation memory（引用记忆）
+ research output format（研究输出格式）

Writer Agent（写作智能体）
= writing model（写作模型）
+ document tool（文档工具）
+ style memory（风格记忆）
+ markdown output format（Markdown 输出格式）

Reviewer Agent（审查智能体）
= evaluation model（评估模型）
+ checklist prompt（检查清单提示词）
+ risk rubric（风险评分标准）
```

到了这个阶段，才是完整意义上的：

```text
不同 Agent（智能体）
  -> 使用不同 LLM（大语言模型）
  -> 拥有不同 Tool（工具）
  -> 拥有不同 Memory（记忆）
  -> 承担不同 Task Responsibility（任务职责）
```

一句话总结：

```text
Day56（第 56 天）不是完整 Multi-Agent（多智能体），
而是 Multi-Model + Role Stage（多模型 + 角色阶段）。
```

它先解决：

```text
一个复杂任务里，哪些模型分别负责推理、写作、评估、JSON、摘要？
它们按什么顺序协作？
结果怎么合并？
```

等这一层稳定后，再往上接完整 Agent（智能体）的 Tool（工具）、Memory（记忆）和长期任务职责，就会变成真正的 Multi-Agent Collaboration System（多智能体协作系统）。

## 十一、当前阶段的核心认知

Day56（第 56 天）最重要的一句话是：

```text
Model Router（模型路由）决定“谁来做”；
Multi-Model Collaboration（多模型协作）决定“大家怎么一起做”。
```

再加上前面的系统层，可以这样理解：

```text
Tool Calling（工具调用）
  -> 一个模型决定要不要用工具

Model Router（模型路由）
  -> 系统决定这次用哪个模型

Multi-Agent（多智能体）
  -> 系统把任务拆给不同岗位角色

Multi-Model Collaboration（多模型协作）
  -> 多个模型按角色和阶段一起完成一个任务
```

真正成熟的系统不应该所有任务都复杂化，而应该按需启用：

```text
简单任务
  -> 单模型直接回答

需要外部信息
  -> 单模型 + Tool Calling（工具调用）

需要控制成本或质量
  -> Model Router（模型路由）

需要多步骤流程
  -> Multi-Agent（多智能体）

需要多个模型互补
  -> Multi-Model Collaboration（多模型协作）

超级复杂任务
  -> Multi-Agent（多智能体） + Multi-Model Collaboration（多模型协作） + Tool Calling（工具调用）组合使用
```

## 十二、第 56 天打卡

【第56天打卡】

1. 是否定义 ModelRole（模型角色）：是

2. 是否升级 ModelProfile（模型档案）支持 roles（角色列表）：是

3. 是否定义 CollaborationPlan（模型协作计划）：是

4. 是否实现 ModelCollaborationPlanner（模型协作规划器）：是

5. 是否实现 ModelCollaborationExecutor（模型协作执行器）：是

6. 是否支持 Parallel Model Execution（模型并行执行）：是

7. 是否实现 Model Result Merge（模型结果合并）：是

8. Trace / Usage（调用链追踪 / 用量统计）是否接入 Collaboration（模型协作）：是

9. 是否实现 Model Collaboration Explorer（模型协作浏览器）：是

10. 是否完成 Multi-Model Test（多模型协作测试）：是

11. 遇到的最大问题：

    最大的问题不是代码怎么写，而是概念边界容易混淆：Tool Calling（工具调用）、Model Router（模型路由）、Multi-Agent（多智能体）和 Multi-Model Collaboration（多模型协作）都像是在“完成用户任务”，但它们关注的维度不同。最终理解是：Tool Calling（工具调用）解决“用什么工具”，Model Router（模型路由）解决“用哪个模型”，Multi-Agent（多智能体）解决“分成哪些岗位角色”，Multi-Model Collaboration（多模型协作）解决“多个模型如何按阶段协作”。Day56（第 56 天）当前实现的是 Multi-Model + Role Stage（多模型 + 角色阶段），还不是完整的 Multi-Agent（多智能体）系统。

12. 当前系统能力：

    当前系统已经具备 Multi-Model Collaboration Runtime（多模型协作运行时）的核心教学能力。它可以为不同 Task Type（任务类型）生成 CollaborationPlan（协作计划），根据 ModelRole（模型角色）选择合适的 Model（模型），支持 Pipeline（流水线）和 Parallel Execution（并行执行），通过 Context Passing（上下文传递）把上游 Stage（阶段）输出传给下游 Stage（阶段），通过 mergeResults（结果合并）生成最终答案，并把每个协作阶段接入 Trace（追踪记录）和 Usage（用量记录）。前端也已经具备 Model Collaboration Explorer（模型协作浏览器），可以展示 Model Team（模型团队）、协作计划、阶段结果、成本、耗时和合并结果。

## 十三、第 56 天补充总结

Day56（第 56 天）完成的是：

```text
Advanced Optimization V6（高级优化第六版）
  -> Multi-Model Collaboration Runtime（多模型协作运行时）
```

现在系统已经不仅仅会：

```text
选择一个模型
```

而是可以做到：

```text
多个模型
  -> 协作
  -> 合并
  -> 输出
```

也就是说，模型不再只是被动调用的 Tool（工具），而开始变成 Model Team Member（模型团队成员）。

完整调用链可以理解为：

```text
User（用户）
  -> Supervisor（监督者 / 总控）
  -> Agent DAG（智能体有向无环图）
  -> Model Collaboration Planner（模型协作规划器）
  -> Reasoning Model（推理模型）
  -> Writing Model（写作模型）
  -> Evaluation Model（评估模型）
  -> Merge（合并）
  -> Final Output（最终输出）
```

相比 Day50（第 50 天）的 Model Router（模型路由），Day56（第 56 天）最大的升级是：

```text
Day50（第 50 天）：模型是可被选择的执行工具。
Day56（第 56 天）：模型是可以分工协作的团队成员。
```

这也是 OpenAI Deep Research（OpenAI 深度研究能力）、Claude Code（Claude 编程工具）、Cursor（AI 编程工具）等产品正在发展的方向：不是让一个模型硬扛全部任务，而是让多个模型或多个角色按阶段协作。

### 当前整体进度

```text
Agent Foundation（智能体基础）              ██████████ 100%

Workflow Runtime（工作流运行时）            ██████████ 100%
Tool Runtime（工具运行时）                  ██████████ 100%
RAG Runtime（检索增强生成运行时）           ██████████ 100%

Queue Runtime（队列运行时）                 ██████████ 100%
Execution Platform（执行平台）              ██████████ 100%

Multi-Agent Runtime（多智能体运行时）       ██████████ 100%

Continuous Evaluation（持续评估）           ██████████ 100%
Production Runtime（生产运行时）            ██████████ 100%

Prompt Lifecycle（提示词生命周期）          ██████████ 100%

Advanced Optimization（高级优化）           ██████████ 100%

Infrastructure（基础设施）                  ░░░░░░░░░░ 0%
```

到 Day56（第 56 天）为止，Runtime Layer（运行时能力层）已经全部完成。

从 Day57（第 57 天）开始，学习重点会进入 Production Infrastructure（生产基础设施）。

## 十四、第 57 天学习计划

Day57（第 57 天）的主题是：

```text
Intelligent Routing V2（智能路由第二版）
  -> Adaptive Runtime Decision Engine（自适应运行时决策引擎）
```

Day57（第 57 天）不是再增加一个新的 Runtime（运行时），而是让整个 Runtime（运行时）开始自己做决策。

### 为什么还需要 Day57

Day50（第 50 天）完成了 Model Router（模型路由）。

它主要根据：

```text
TaskType（任务类型）
  -> Model（模型）
```

做路由。

例如：

```text
Research（研究任务）
  -> DeepSeek（深度求索模型）
```

Day56（第 56 天）完成了 Multi-Model Collaboration（多模型协作）。

它让模型可以：

```text
一起工作
```

但是还有一个问题：系统仍然不会自己判断应该启用哪一种整体 Runtime Strategy（运行时策略）。

例如用户说：

```text
帮我总结一下。
```

系统应该自动判断：

```text
Fast Strategy（快速策略）？
Balanced Strategy（平衡策略）？
Quality Strategy（质量优先策略）？
```

真正的生产系统，比如 Claude Code（Claude 编程工具）、Cursor（AI 编程工具）、OpenAI（人工智能模型平台），通常都会先做 Decision（决策），然后让整个 Runtime（运行时）自动变化。

### Day57 的最终效果

以前是：

```text
Task（任务）
  -> 固定 Runtime（运行时）
```

以后变成：

```text
Task Analyzer（任务分析器）
  -> Decision Engine（决策引擎）
  -> 选择 Prompt Strategy（提示词策略）
  -> 选择 Model Strategy（模型策略）
  -> 选择 Agent Strategy（智能体策略）
  -> 选择 Cache Strategy（缓存策略）
  -> 选择 Memory Strategy（记忆策略）
  -> Runtime（运行时）
```

整个系统真正变成 Adaptive（自适应）的系统。

Day57（第 57 天）的核心认知是：

```text
以前是你在配置 Runtime（运行时），
Day57（第 57 天）开始，是 Runtime（运行时）自己配置自己。
```

## 十五、第 57 天任务

### 任务 1：定义 RuntimeContext（运行时上下文）

新增 RuntimeContext（运行时上下文）类型：

```ts
type RuntimeContext = {
  taskType:
    | "chat"
    | "research"
    | "planning"
    | "evaluation";

  complexity:
    | "low"
    | "medium"
    | "high";

  latencyPreference:
    | "fast"
    | "balanced"
    | "quality";

  budgetLevel:
    | "low"
    | "medium"
    | "high";

  hasKnowledge: boolean;
  hasWorkspace: boolean;
  hasMemory: boolean;
  requiresJson: boolean;
};
```

RuntimeContext（运行时上下文）的作用是描述整个 Runtime（运行时）当前面对的任务环境。

它回答的是：

```text
当前任务是什么类型？
复杂度高不高？
更在意速度、平衡还是质量？
预算高不高？
有没有知识库？
有没有工作区上下文？
有没有记忆？
是否要求 JSON（结构化输出）？
```

### 任务 2：定义 RuntimeDecision（运行时决策）

新增 RuntimeDecision（运行时决策）类型：

```ts
type RuntimeDecision = {
  promptStrategy: string;
  modelStrategy: string;
  collaborationStrategy: string;
  cacheStrategy: string;
  retrievalStrategy: string;
  memoryStrategy: string;
};
```

RuntimeDecision（运行时决策）描述系统最终选择的 Runtime Configuration（运行时配置）。

例如：

```text
Prompt Strategy（提示词策略）
  -> Quality（质量优先）

Model Strategy（模型策略）
  -> Multi（多模型）

Cache Strategy（缓存策略）
  -> Semantic（语义缓存）

Memory Strategy（记忆策略）
  -> LongTerm（长期记忆）
```

### 任务 3：实现 RuntimeDecisionEngine（运行时决策引擎）

新增 RuntimeDecisionEngine（运行时决策引擎）：

```ts
class RuntimeDecisionEngine {
  decide(context): RuntimeDecision;
}
```

它的职责是：

```text
输入 RuntimeContext（运行时上下文）
  -> 输出 RuntimeDecision（运行时决策）
```

也就是说，它是 Runtime（运行时）自动配置自己的核心模块。

### 任务 4：实现 Decision Rules（决策规则）

新增 Decision Rules（决策规则）。

例如：

```text
complexity=high（高复杂度）
  -> Quality Prompt（质量优先提示词）
  -> Reasoning Model（推理模型）
  -> Multi Model（多模型）
  -> Long Memory（长期记忆）
```

再例如：

```text
budget=low（低预算）
  -> Fast Prompt（快速提示词）
  -> Small Model（小模型）
  -> Cache First（缓存优先）
```

Decision Rules（决策规则）的作用是让系统用稳定、可解释的方式做选择，而不是让 LLM（Large Language Model，大语言模型）随意决定。

### 任务 5：Agent Runtime 接入 RuntimeDecision（智能体运行时接入运行时决策）

之前的链路大致是：

```text
Prompt Builder（提示词构建器）
  -> Model Router（模型路由）
```

Day57（第 57 天）要升级为：

```text
Decision Engine（决策引擎）
  -> Prompt Optimizer（提示词优化器）
  -> Model Router（模型路由）
  -> Collaboration（模型协作）
```

这样 Agent Runtime（智能体运行时）就不再固定调用某一套能力，而是先读取 RuntimeDecision（运行时决策），再决定启用哪些策略。

### 任务 6：Trace 接入 RuntimeDecision（追踪记录接入运行时决策）

Trace（追踪记录）需要新增 Decision（决策）维度。

需要记录：

```text
Decision（决策）
  -> Prompt（提示词）
  -> Model（模型）
  -> Cache（缓存）
  -> Memory（记忆）
```

这样后续排查问题时，可以知道系统为什么选择了某个 Prompt Strategy（提示词策略）、Model Strategy（模型策略）或 Cache Strategy（缓存策略）。

### 任务 7：实现 Runtime Explorer（运行时浏览器）

前端新增 Runtime Explorer（运行时浏览器），用于展示：

```text
Runtime Decision（运行时决策）
Prompt Strategy（提示词策略）
Model Strategy（模型策略）
Cache（缓存）
Memory（记忆）
Estimated Cost（预估成本）
```

它的作用是让用户或开发者看懂系统这一次为什么这样配置 Runtime（运行时）。

### 任务 8：增加 Runtime Metrics（运行时指标）

新增 RuntimeMetrics（运行时指标）：

```ts
type RuntimeMetrics = {
  fastStrategyUsage: number;
  balancedUsage: number;
  qualityUsage: number;
  avgDecisionTime: number;
  avgEstimatedCost: number;
  avgEstimatedLatency: number;
};
```

Runtime Metrics（运行时指标）用于统计不同策略的使用情况、平均决策耗时、平均预估成本和平均预估延迟。

### 任务 9：支持 Decision Replay（决策回放）

Decision Replay（决策回放）用于查看历史 Decision（决策）。

例如：

```text
Trace（追踪记录）
  -> Decision（决策）
  -> 为什么用了 Quality Prompt（质量优先提示词）？
```

这对于 Debug（调试）非常重要，因为它可以解释系统为什么在某次任务中选择了某个策略。

### 任务 10：完成 Adaptive Runtime Test（自适应运行时测试）

准备五类 Task（任务）做测试。

例如：

```text
普通聊天
  -> 应该选择 Fast（快速）策略

复杂 Research（研究）
  -> 应该选择 Quality（质量优先）策略

JSON（结构化输出）
  -> 应该选择 JSON Prompt（JSON 提示词）
  -> 应该选择 JSON Model（JSON 模型）
```

测试目标是验证 Decision Engine（决策引擎）是否能根据 RuntimeContext（运行时上下文）稳定生成正确的 RuntimeDecision（运行时决策）。

## 十六、第 57 天验收标准

1. 是否定义 RuntimeContext（运行时上下文）。
2. 是否定义 RuntimeDecision（运行时决策）。
3. 是否实现 RuntimeDecisionEngine（运行时决策引擎）。
4. 是否实现 Decision Rules（决策规则）。
5. Agent Runtime（智能体运行时）是否接入 RuntimeDecision（运行时决策）。
6. Trace（追踪记录）是否记录 RuntimeDecision（运行时决策）。
7. 是否实现 Runtime Explorer（运行时浏览器）。
8. 是否增加 Runtime Metrics（运行时指标）。
9. 是否支持 Decision Replay（决策回放）。
10. 是否完成 Adaptive Runtime Test（自适应运行时测试）。

## 十七、第 57 天打卡模板

【第57天打卡】

1. 是否定义 RuntimeContext（运行时上下文）：是 / 否

2. 是否定义 RuntimeDecision（运行时决策）：是 / 否

3. 是否实现 RuntimeDecisionEngine（运行时决策引擎）：是 / 否

4. 是否实现 Decision Rules（决策规则）：是 / 否

5. Agent Runtime（智能体运行时）是否接入 RuntimeDecision（运行时决策）：是 / 否

6. Trace（追踪记录）是否记录 RuntimeDecision（运行时决策）：是 / 否

7. 是否实现 Runtime Explorer（运行时浏览器）：是 / 否

8. 是否增加 Runtime Metrics（运行时指标）：是 / 否

9. 是否支持 Decision Replay（决策回放）：是 / 否

10. 是否完成 Adaptive Runtime Test（自适应运行时测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 十八、后续课程调整

到 Day57（第 57 天）为止，整个 Runtime Capability Layer（运行时能力层）已经完整。

接下来的课程进入新阶段：

```text
Day58 ~ Day63（第 58 天到第 63 天）
  -> Production Infrastructure（生产基础设施）
  -> Redis（内存数据库 / 缓存系统）
  -> Distributed Queue（分布式队列）
  -> Config Center（配置中心）
  -> Object Storage（对象存储）

Day64 ~ Day73（第 64 天到第 73 天）
  -> Production Upgrade（生产化升级）
  -> 把前 57 天所有教学版模块统一升级为真正互通的生产版本

Day74 ~ Day80（第 74 天到第 80 天）
  -> MCP（Model Context Protocol，模型上下文协议）
  -> Docker（容器化工具）
  -> CI/CD（持续集成 / 持续交付）
  -> Deployment（部署）
  -> Enterprise Capability（企业级能力）
```

这样学习的好处是：

```text
能力先学全；
基础设施再补齐；
最后统一生产化升级。
```

整个项目只需要进行一次系统性的重构，而不是边学边推翻之前的实现。这也是工业项目中更常见、效率更高的演进方式。
