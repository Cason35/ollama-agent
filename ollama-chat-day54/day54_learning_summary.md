# Day 54 学习总结：Prompt Composition（提示词组合）

## 本文记录范围

本文记录第 54 天围绕 Prompt Lifecycle V2（提示词生命周期第二版）与 Prompt Composition（提示词组合）的学习型对话。

本文主要保留三个层面的内容：

- Day54（第 54 天）的项目到底解决什么问题。
- 为什么要把 Prompt（提示词）拆成 PromptBlock（提示词块）。
- Day54（第 54 天）和 Day53（第 53 天）的 Prompt Experiment Platform（提示词实验平台）之间是什么关系。

本文不记录项目代码修改过程、命令执行过程、文件创建过程等施工细节，只记录概念、业务逻辑和系统设计理解。

## 一、Day54（第 54 天）项目到底做了什么

### 我的问题

我想读懂 `ollama-chat-day54` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day53` 有什么改进，为什么这样做。

### 你的回答

`ollama-chat-day54` 是在 Day53（第 53 天）的 Prompt Experiment Platform（提示词实验平台）基础上，把 Prompt（提示词）从“单个大字符串”升级成 Prompt Composition（提示词组合）系统。

Day53（第 53 天）主要解决的是：多个 Prompt Version（提示词版本）之间怎么实验、比较、评分、选择赢家。

Day54（第 54 天）进一步解决的是：一个 Prompt（提示词）内部怎么拆分、组合、观测和维护。

Day54（第 54 天）的核心变化包括：

- 新增 PromptBlock（提示词块）：每个块负责一个明确职责，例如 system（系统身份）、memory（记忆上下文）、workspace（工作空间上下文）、tool（工具上下文）、task（当前任务）、output（输出格式）。
- 新增 PromptBlockRegistry（提示词块注册表）：负责注册、读取、启用、禁用提示词块。
- 新增 PromptBuilder（提示词构建器）：把多个提示词块按 order（顺序字段）排序，渲染变量，并拼成最终 Prompt（提示词）。
- 支持 Conditional Block（条件块）：例如没有 memory（记忆）时，`memory.context` 会自动跳过，不会把空上下文硬塞进提示词。
- 新增 Block Diff（提示词块差异对比）：比较两个 PromptBlock（提示词块）的字段和模板变化。
- 新增 Block Metrics（提示词块指标）：统计提示词块数量、启用率、长度、估算 token（词元）、命中率。
- Agent Runtime（智能体运行时）接入 PromptBuilder（提示词构建器），不再只拿一个 `systemPrompt` 字符串直接调用模型。

运行时的大致链路是：

```text
PromptRegistry（提示词版本注册表）
  -> 读取当前 active Prompt Version（启用中的提示词版本）
  -> buildRuntimePromptBlocks（构建运行时提示词块）
  -> PromptBuilder（提示词构建器）
  -> 最终 system prompt（系统提示词）
  -> Agent Runtime（智能体运行时）调用模型或模拟输出
```

Day54（第 54 天）用到的知识点包括：

- Prompt Lifecycle（提示词生命周期）：draft（草稿）、active（启用中）、archived（已归档）、rollback（回滚）。
- Prompt Registry（提示词注册表）：统一管理多个提示词版本。
- Prompt Composition（提示词组合）：把大 Prompt（提示词）拆成多个职责单一的小块。
- Template Rendering（模板渲染）：把 `{{task}}`、`{{memory}}` 替换成运行时变量。
- Conditional Rendering（条件渲染）：上下文不存在时跳过对应块。
- Diff（差异对比）：比较两个版本或两个块到底改了什么。
- Metrics（指标）：用数据看块是否启用、是否命中、占用多少 token（词元）。
- Observability（可观测性）：不仅得到最终 Prompt（提示词），还知道它由哪些块组成、哪些块被跳过、为什么跳过。

Day53（第 53 天）更像是在问：

```text
这几个 Prompt Version（提示词版本），哪个效果更好？
```

Day54（第 54 天）更像是在问：

```text
一个 Prompt（提示词）内部，能不能拆成多个可复用、可排序、可跳过、可观测的部分？
```

## 二、为什么 Day54（第 54 天）的前端看起来不明显

### 我的问题

我还是没懂 Day54（第 54 天）的作用是什么，前端页面也没看出体现什么。能不能用生活里的一些简单例子来说明为什么 Day54（第 54 天）要这样做？

### 你的回答

Day54（第 54 天）的作用不是让前端多一个很炫的新功能，而是把“喂给 AI（人工智能）的说明书”从一整张纸，拆成一盒彩色积木。

Day53（第 53 天）关心的是：哪一版提示词效果更好。

Day54（第 54 天）关心的是：一版提示词内部到底由哪些部分组成，运行时该不该带上这些部分。

### 生活例子一：点外卖

假设你要给外卖店写备注。

Day53（第 53 天）像是在比较三版备注：

```text
v1：不要辣。
v2：不要辣，少油。
v3：不要辣，少油，米饭分开放。
```

然后看哪版最符合需求，这就是 Prompt Experiment（提示词实验）。

但 Day54（第 54 天）问的是另一件事：这条备注能不能拆成模块？

```text
饮食禁忌：不要辣
口味偏好：少油
包装要求：米饭分开放
当前订单：宫保鸡丁套餐
```

如果今天点的是奶茶，就不需要“米饭分开放”。如果今天朋友一起吃，又可以加一块“过敏信息”。这就是 Prompt Composition（提示词组合）。

### 生活例子二：老师给学生布置作业

以前一个 Prompt（提示词）可能长这样：

```text
你是语文老师。学生之前作文经常跑题。今天要写一篇关于春天的作文。
要求结构清晰，先写总述，再写细节，最后总结。不要超过 600 字。
```

这是一整段。问题是以后很难维护。

Day54（第 54 天）会把它拆成：

```text
身份块：你是语文老师
记忆块：学生之前作文经常跑题
任务块：今天要写一篇关于春天的作文
输出格式块：先总述，再细节，最后总结
限制块：不要超过 600 字
```

如果系统没有学生历史记录，memory block（记忆块）就自动跳过。

如果今天不是写作文，而是改作文，task block（任务块）换掉就行。

如果所有作业都要求“先结论再依据”，output block（输出格式块）可以复用。

这就是 Day54（第 54 天）的核心价值：把提示词变得可拆、可换、可复用、可观察。

### 为什么不能继续用一个大 Prompt（提示词）

因为项目越复杂，一个大 Prompt（提示词）会变成“巨型说明书”。

例如原来可能是这样：

```text
你是研究型 Agent。你要参考长期记忆。你要参考工作空间。你可以使用检索工具。
当前任务是 xxx。输出时先给结论，再给依据和风险。
```

看起来还能接受，但后面会越来越麻烦：

- 没有长期记忆时，提示词里还可能出现空的“长期记忆：”。
- 想改输出格式，要去大段文字里找。
- 多个 Agent（智能体）想共用工具说明，很难复用。
- AI（人工智能）回答变差时，不知道是身份、记忆、工具还是任务描述影响了它。
- 前端只能看到最终大字符串，看不出组成过程。

Day54（第 54 天）就是在解决这些后期维护会痛的问题。

### 前端为什么不明显

Day54（第 54 天）不是“聊天页面新增一个明显按钮”，而是“AI（人工智能）后台组装提示词的方式变了”。

前端主要体现在这些位置：

- Prompt Block Explorer（提示词块浏览器）：看现在有哪些提示词块，例如 memory（记忆）、workspace（工作空间）、tool（工具）、task（任务）、output（输出格式）。
- Prompt Composition Preview（提示词组合预览）：看最终喂给 AI（人工智能）的 Prompt（提示词）是怎么由多个块拼出来的。
- used（已使用）：这次组合实际用了哪些块。
- skipped（已跳过）：哪些块因为没有条件或没有上下文被跳过。
- Block Diff（提示词块差异对比）：比较两个块哪里变了。
- Block Metrics（提示词块指标）：看块的启用率、token（词元）估算、命中率。

所以它的前端体现比较偏工程后台，不是普通用户一眼能感知的视觉功能。

### Day53（第 53 天）和 Day54（第 54 天）最简单的区别

Day53（第 53 天）像是在问：

```text
这三份菜谱，哪份做出来最好吃？
```

Day54（第 54 天）像是在问：

```text
菜谱能不能拆成：主料、调料、火候、摆盘、忌口？
以后我要改辣度，只改调料块。
我要换菜，只改主料块。
有人过敏，就加忌口块。
```

所以 Day54（第 54 天）的意义是：让 Prompt（提示词）从“手写作文”升级成“可组装系统”。

## 三、Day54（第 54 天）是否就是拼接块组成 v1/v2/v3，再通过 Day53（第 53 天）打分

### 我的问题

在 Day54（第 54 天）的实现下，其实就是拼接的提示词块顺序和数量来组成提示词 v1、v2、v3，再通过 Day53（第 53 天）来打分选取最好的吗？

可组装一般是为了给不同的人不同的服务，但是我们组装完该提示词后，所有用户都是该提示词，好像没什么区别。

至于为了维护人员来修改提示词，好像帮助也不是特别大的样子。

### 你的回答

这个理解一半是对的，但 Day54（第 54 天）现在还没有完全做到“自动拼出 v1/v2/v3，再交给 Day53（第 53 天）打分”。

更准确地说：

```text
Day53（第 53 天）：比较多个 Prompt Version（提示词版本）哪个好
Day54（第 54 天）：提供一种更细粒度的方式来生产、维护、运行 Prompt Version（提示词版本）
```

也就是：

```text
PromptBlock（提示词块）
  -> 组合成最终 Prompt（提示词）
  -> 未来可以作为 v1 / v2 / v3 候选
  -> 再交给 Day53（第 53 天）的 Prompt Experiment（提示词实验）评分
```

### 关于“是不是拼接块组成 v1/v2/v3 再让 Day53（第 53 天）打分”

可以这样做，而且这是很自然的下一步。

例如：

```text
v1 = system + task + output
v2 = system + memory + task + output
v3 = system + memory + tool + task + output
```

然后用 Day53（第 53 天）的实验平台去测：

```text
哪个分数高？
哪个成本低？
哪个延迟低？
哪个没有 regression（回归退步）？
```

但是当前 Day54（第 54 天）教学实现里，主要完成的是“可组合基础设施”，还没有做“自动枚举不同组合并跑实验”。

当前项目里，`v1 / v2 / v3` 仍然主要是 Day53（第 53 天）或 Day52（第 52 天）的 Prompt Version（提示词版本）。

Day54（第 54 天）是把当前 active（启用中）的 Prompt Version（提示词版本）包装成一个 system block（系统块），再加上 memory（记忆）、workspace（工作空间）、tool（工具）、task（任务）、output（输出格式）这些块。

所以现在不是“自动生成多个组合版本”，而是“运行时已经可以用块来组合最终提示词”。

### 关于“如果所有用户都用同一个组合，那有什么意义”

这个问题很关键。

如果系统里没有 user context（用户上下文）、memory（记忆）、workspace（工作空间）、tools（工具）差异，那么 Day54（第 54 天）的价值确实不明显。

但 Day54（第 54 天）的意义不是“所有用户永远用同一个拼好的 Prompt（提示词）”，而是让最终 Prompt（提示词）可以根据场景变化。

例如同一个 AI Assistant（人工智能助手），用户 A 问：

```text
帮我总结这篇论文
```

用户 A 有长期记忆：

```text
用户喜欢中文、要短结论、关注工程实现
```

那么最终 Prompt（提示词）可能是：

```text
system：你是研究型 Agent（智能体）
memory：用户喜欢中文、要短结论、关注工程实现
task：帮我总结这篇论文
output：先结论，再依据
```

用户 B 也问同样的问题，但没有长期记忆，最终 Prompt（提示词）就变成：

```text
system：你是研究型 Agent（智能体）
task：帮我总结这篇论文
output：先结论，再依据
```

这里 memory block（记忆块）就被跳过了。

再比如某次任务可以用工具，某次任务不能用工具：

```text
有检索工具：加入 tool block（工具块）
没有检索工具：跳过 tool block（工具块）
```

所以“可组装”不只是为了不同用户，也为了不同任务、不同上下文、不同工具、不同 Agent（智能体）、不同输出要求。

### 生活例子：套餐可选配

可以把 Day54（第 54 天）想成“套餐可选配”。

如果一家餐厅只有一个固定套餐：

```text
米饭 + 鸡腿 + 青菜 + 汤
```

那可组装没什么意义。

但如果真实情况是：

```text
有人不吃辣
有人不要米饭
有人要加蛋
有人过敏
有人点外带
有人堂食
```

菜单就应该拆成模块：

```text
主食块
蛋白质块
忌口块
包装块
口味块
```

Day54（第 54 天）做的就是这个拆分能力。

现在项目还像一个小餐厅，顾客不多，场景不复杂，所以会觉得“拆这么细有必要吗？”

等后面有 Memory（记忆）、Tool（工具）、Workspace（工作空间）、Model Routing（模型路由）、Evaluation（评估）之后，这个拆分就会变得有用。

### 关于“维护人员修改提示词是否帮助不大”

小项目里帮助不大，这个判断是对的。

如果只有一两个 Prompt（提示词），直接改大字符串最快。

但当系统变成这样：

```text
research agent（研究智能体）
writer agent（写作智能体）
critic agent（审查智能体）
supervisor agent（调度智能体）
reflection agent（反思智能体）
evaluation agent（评估智能体）
tool prompt（工具提示词）
memory prompt（记忆提示词）
output format prompt（输出格式提示词）
```

这时候一个大 Prompt（提示词）会很难改。

比如只想统一修改输出格式：

```text
所有 Agent（智能体）都要先给结论，再给依据，再给风险
```

如果没有 Day54（第 54 天），就要去很多大段 Prompt（提示词）里面一个个找、一个个改。

有 Day54（第 54 天）之后，只改：

```text
output.format block（输出格式块）
```

这就是它对维护的价值。

### 更真实的结论

Day54（第 54 天）当前前端看起来不强，是因为它还是 Infrastructure Layer（基础设施层）。

它不是一个完整的业务闭环。

完整闭环应该是：

```text
1. 定义多个 PromptBlock（提示词块）
2. 组合出多个 Prompt Variant（提示词变体）
3. 用 Day53（第 53 天）的 Prompt Experiment（提示词实验）跑分
4. 选出最佳组合
5. 把最佳组合设为 active（启用中）
6. 不同用户或不同任务运行时，再按上下文动态跳过或注入块
```

当前 Day54（第 54 天）主要完成了第 1、2、6 的基础，第三步和第四步还没有完全打通。

所以可以这样理解：

```text
Day53（第 53 天）是考试系统。
Day54（第 54 天）是出卷系统。
```

现在 Day54（第 54 天）已经能把题目按模块拼出来，但还没有自动批量出很多套卷子并送去 Day53（第 53 天）考试。

## 四、我对 Day54（第 54 天）的最终理解

Day54（第 54 天）的核心不是“立刻让普通用户看到一个明显的新功能”，而是提前搭建 Prompt Composition（提示词组合）的底层能力。

如果系统还很小，Prompt（提示词）数量少、用户差异少、上下文少，那么一个大 Prompt（提示词）也能工作。

但当系统继续扩展，出现不同 Agent（智能体）、不同用户记忆、不同工具、不同任务、不同输出格式要求时，PromptBlock（提示词块）的价值才会明显。

Day54（第 54 天）真正解决的是：

- Prompt（提示词）不再只能整段复制和修改。
- Prompt（提示词）可以拆成 system（系统身份）、memory（记忆）、workspace（工作空间）、tool（工具）、task（任务）、output（输出格式）等模块。
- 不同场景可以动态选择哪些块参与最终提示词。
- 系统可以记录 used blocks（已使用块）和 skipped blocks（已跳过块）。
- 以后可以把不同组合变成 Prompt Variant（提示词变体），再交给 Day53（第 53 天）的 Prompt Experiment（提示词实验）评分。

因此，Day54（第 54 天）不是终点，而是为后续更真实的 Agent（智能体）系统做铺垫。

## 五、第 54 天打卡

【第54天打卡】

1. 是否定义 PromptBlock（提示词块）：是

2. 是否实现 PromptBlockRegistry（提示词块注册表）：是

3. 是否实现 PromptBuilder（提示词构建器）：是

4. 是否支持 PromptBlock（提示词块）排序：是

5. 是否支持条件 Block（条件块）：是

6. Agent Runtime（智能体运行时）是否接入 PromptBuilder（提示词构建器）：是

7. 是否实现 Prompt Block Explorer（提示词块浏览器）：是

8. 是否实现 Prompt Block Diff（提示词块差异对比）：是

9. 是否增加 Prompt Block Metrics（提示词块指标）：是

10. 是否完成 Prompt Composition Test（提示词组合测试）：是

11. 遇到的最大问题：

当前最大的理解问题是：Day54（第 54 天）的前端变化不如 Day53（第 53 天）的实验仪表盘直观，因为它主要是 Infrastructure Layer（基础设施层）能力，而不是面向普通用户的显性业务功能。它的价值要放到更复杂的场景中才明显，例如不同用户有不同 Memory（记忆）、不同任务有不同 Tool（工具）、不同 Agent（智能体）有不同输出格式要求。当前教学项目还没有完全打通“自动组合多个 Prompt Variant（提示词变体）并交给 Day53（第 53 天）实验评分”的完整闭环，所以一开始会觉得它只是把提示词拆开再拼回去。

12. 当前系统能力：

当前系统已经具备 Day54（第 54 天）Prompt Composition（提示词组合）的核心教学能力。系统可以定义 PromptBlock（提示词块），通过 PromptBlockRegistry（提示词块注册表）管理块，通过 PromptBuilder（提示词构建器）按 order（顺序字段）组合块，并在 memory（记忆）、workspace（工作空间）、tool（工具）等上下文缺失时自动跳过条件块。Agent Runtime（智能体运行时）已经接入 PromptBuilder（提示词构建器），可以在运行时把当前 active Prompt Version（启用中的提示词版本）包装成 system block（系统块），再追加上下文块、任务块和输出格式块，形成最终 Prompt（提示词）。前端 Prompt Explorer（提示词浏览器）可以展示 Prompt Block Explorer（提示词块浏览器）、Block Diff（提示词块差异对比）、Block Metrics（提示词块指标）和 Prompt Composition Preview（提示词组合预览）。同时项目已经提供 Prompt Composition Test（提示词组合测试），用于验证注册、启用/禁用、排序、变量渲染、条件跳过、差异对比、指标统计和运行时接入。

## 六、补充：第 54 天总结与第 55 天学习计划

## 第 54 天总结

第 54 天完成的是 Prompt Lifecycle V2（提示词生命周期第二版）中的 Prompt Composition（提示词组合）。

目前 Prompt（提示词）已经从一段固定字符串，变成了由多个 PromptBlock（提示词块）组合而成的结构：

```text
System Block（系统块）
        ↓
Memory Block（记忆块）
        ↓
Workspace Block（工作空间块）
        ↓
Task Block（任务块）
        ↓
Output Block（输出格式块）
        ↓
Prompt Builder（提示词构建器）
        ↓
Final Prompt（最终提示词）
```

相比 Day52（第 52 天）的 Prompt Registry（提示词注册表），Day54（第 54 天）最大的升级是：

```text
Prompt（提示词）已经成为一种可编排资源，而不是固定字符串。
```

Day52（第 52 天）的重点是管理 Prompt Version（提示词版本），也就是让提示词可以新增、编辑、激活、归档和回滚。

Day54（第 54 天）的重点是管理 Prompt（提示词）内部结构，也就是让提示词可以由多个 Block（块）按规则组合出来。

## 当前整体进度

```text
Agent Foundation（智能体基础）              ██████████ 100%

Workflow Runtime（工作流运行时）            ██████████ 100%
Tool Runtime（工具运行时）                  ██████████ 100%
RAG Runtime（检索增强生成运行时）            ██████████ 100%

Queue Runtime（队列运行时）                 ██████████ 100%
Execution Platform（执行平台）              ██████████ 100%

Multi-Agent Runtime（多智能体运行时）        ██████████ 100%

Continuous Evaluation（持续评估）           ██████████ 100%
Production Runtime（生产级运行时）           ██████████ 100%

Prompt Lifecycle（提示词生命周期）           ██████████ 100%

Advanced Optimization（高级优化）            ████████░░ 80%

Deployment & Infra（部署与基础设施）         ░░░░░░░░░░ 0%
```

整体进度已经达到 97%+。

## Day55 学习计划：Dynamic Prompt Optimization（动态提示词优化）

Day55（第 55 天）开始学习 Dynamic Prompt Optimization（动态提示词优化）。

Day54（第 54 天）已经让 Prompt（提示词）可以组合，Day55（第 55 天）要让 Prompt（提示词）可以根据 Context（上下文）自动调整。

目前 PromptBuilder（提示词构建器）已经支持：

```text
Block A（块 A）
+
Block B（块 B）
+
Block C（块 C）
```

但是当前组合更多还是固定组合。

真实 Production System（生产系统）通常不是这样。

例如用户请求：

```text
介绍 LangGraph
```

此时 Prompt（提示词）可能只需要：

```text
System Block（系统块）
Task Block（任务块）
Output Block（输出格式块）
```

如果用户继续问：

```text
继续刚刚的问题
```

Prompt（提示词）就应该自动增加：

```text
Memory Block（记忆块）
```

如果用户请求：

```text
分析这份研究报告
```

Prompt（提示词）就应该自动增加：

```text
Workspace Block（工作空间块）
Knowledge Block（知识块）
Citation Block（引用块）
```

所以 Prompt（提示词）不应该只是可组合，还应该是动态的。

## Day55 最终效果

以前的链路是：

```text
Research Agent（研究智能体）
        ↓
Fixed Prompt（固定提示词）
```

Day55（第 55 天）之后的目标链路是：

```text
Task Analyzer（任务分析器）
        ↓
Prompt Optimizer（提示词优化器）
        ↓
Prompt Builder（提示词构建器）
        ↓
Dynamic Prompt（动态提示词）
```

也就是说，Prompt Builder（提示词构建器）负责“如何拼 Prompt（提示词）”，Prompt Optimizer（提示词优化器）负责“为什么这样拼 Prompt（提示词）”。

## Day55 今日任务

### 任务 1：定义 PromptOptimizationContext（提示词优化上下文）

新增类型：

```ts
type PromptOptimizationContext = {
  taskType:
    | "chat"
    | "research"
    | "planning"
    | "reflection"
    | "evaluation";

  hasMemory: boolean;

  hasWorkspace: boolean;

  hasKnowledge: boolean;

  requiresJson: boolean;

  requiresCitation: boolean;

  complexity:
    | "low"
    | "medium"
    | "high";

  userIntent?: string;
};
```

作用是描述当前 Prompt（提示词）需要什么。

它回答的问题不是“怎么拼”，而是“当前任务有没有 Memory（记忆）、Workspace（工作空间）、Knowledge（知识）、Citation（引用）、JSON（结构化输出）等需求”。

### 任务 2：实现 PromptOptimizer（提示词优化器）

新增类：

```ts
class PromptOptimizer {
  optimize(context): PromptBlock[] {
    // 根据 context（上下文）自动选择 PromptBlock（提示词块）。
  }
}
```

PromptOptimizer（提示词优化器）的职责是根据 Context（上下文）自动选择 Block（块）。

### 任务 3：PromptBlock Rules（提示词块规则）

新增规则类型：

```ts
type PromptRule = {
  when(context): boolean;
  enableBlocks: string[];
  disableBlocks: string[];
};
```

PromptRule（提示词规则）描述的是：

```text
当某个条件成立时，应该开启哪些 Block（块），关闭哪些 Block（块）。
```

例如：

```text
requiresJson = true
        ↓
OutputSchemaBlock（输出结构块）开启
```

再例如：

```text
没有 Workspace（工作空间）
        ↓
WorkspaceBlock（工作空间块）关闭
```

### 任务 4：支持 Block Weight（提示词块权重）

新增字段：

```ts
weight: number;
```

PromptBuilder（提示词构建器）可以根据 weight（权重）排序。

例如：

```text
System Block（系统块）       100
Memory Block（记忆块）        80
Workspace Block（工作空间块） 70
```

这样可以让更重要的 Block（块）在组合时更靠前。

### 任务 5：支持 Prompt Recommendation（提示词推荐）

系统需要记录 Evaluation（评估）结果，并从结果中产生 Prompt Recommendation（提示词推荐）。

例如：

```text
Research（研究任务）
        ↓
开启 Memory Block（记忆块）
        ↓
Score（分数）上升
        ↓
Prompt Recommendation（提示词推荐）：
Research（研究任务）建议开启 Memory Block（记忆块）
```

这一步让系统不只是“人工配置提示词块”，而是可以根据历史效果推荐更好的组合。

### 任务 6：Evaluation（评估）接入 PromptOptimizer（提示词优化器）

Evaluation（评估）输出 Weakness（弱点）后，可以反向给 PromptOptimizer（提示词优化器）提供建议。

例如：

```text
Weakness（弱点）：没有引用
        ↓
建议开启 Citation Block（引用块）
```

这意味着评估系统不只是打分，还能推动 Prompt（提示词）改进。

### 任务 7：Prompt Strategy（提示词策略）

新增三种 Prompt Strategy（提示词策略）：

```text
Fast（快速）
Balanced（平衡）
Quality（质量优先）
```

示例：

```text
Fast（快速）：
关闭 Reflection（反思）等高成本块。

Balanced（平衡）：
使用默认组合。

Quality（质量优先）：
开启更多 Memory（记忆）、Knowledge（知识）、Citation（引用）、Reflection（反思）相关块。
```

Prompt Strategy（提示词策略）让系统可以根据速度、成本和质量目标选择不同组合。

### 任务 8：Prompt Strategy Explorer（提示词策略浏览器）

前端新增 Prompt Strategy Explorer（提示词策略浏览器），展示：

- Strategy（策略）
- Blocks（块列表）
- Estimated Tokens（估算词元）
- Estimated Cost（估算成本）

它的作用是让用户看见不同 Prompt Strategy（提示词策略）会启用哪些块，以及会带来多少 token（词元）和 cost（成本）。

### 任务 9：Prompt Metrics（提示词指标）升级

新增 PromptOptimizationMetrics（提示词优化指标）：

```ts
type PromptOptimizationMetrics = {
  avgPromptLength: number;
  avgBlocks: number;
  avgOptimizationTime: number;
  recommendationHitRate: number;
  strategyUsage: Record<string, number>;
};
```

这些指标用于观察 PromptOptimizer（提示词优化器）本身的运行效果。

含义包括：

- avgPromptLength（平均提示词长度）
- avgBlocks（平均块数量）
- avgOptimizationTime（平均优化耗时）
- recommendationHitRate（推荐命中率）
- strategyUsage（策略使用分布）

### 任务 10：测试

准备五类 Task（任务）：

```text
普通聊天
Research（研究任务）
JSON（结构化输出）
Reflection（反思任务）
Evaluation（评估任务）
```

验证 Prompt（提示词）是否会根据不同任务自动变化。

## 第55天验收标准

1. 是否定义 PromptOptimizationContext（提示词优化上下文）

2. 是否实现 PromptOptimizer（提示词优化器）

3. 是否实现 PromptRule（提示词规则）

4. 是否支持 Block Weight（提示词块权重）

5. 是否实现 Prompt Recommendation（提示词推荐）

6. Evaluation（评估）是否接入 PromptOptimizer（提示词优化器）

7. 是否支持 Prompt Strategy（提示词策略）

8. 是否实现 Prompt Strategy Explorer（提示词策略浏览器）

9. 是否增加 Prompt Optimization Metrics（提示词优化指标）

10. 是否完成 Dynamic Prompt Test（动态提示词测试）

## 第55天打卡模板

【第55天打卡】

1. 是否定义 PromptOptimizationContext（提示词优化上下文）：是 / 否

2. 是否实现 PromptOptimizer（提示词优化器）：是 / 否

3. 是否实现 PromptRule（提示词规则）：是 / 否

4. 是否支持 Block Weight（提示词块权重）：是 / 否

5. 是否实现 Prompt Recommendation（提示词推荐）：是 / 否

6. Evaluation（评估）是否接入 PromptOptimizer（提示词优化器）：是 / 否

7. 是否支持 Prompt Strategy（提示词策略）：是 / 否

8. 是否实现 Prompt Strategy Explorer（提示词策略浏览器）：是 / 否

9. 是否增加 Prompt Optimization Metrics（提示词优化指标）：是 / 否

10. 是否完成 Dynamic Prompt Test（动态提示词测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 第55天核心认知

请记住 Day55（第 55 天）最重要的一句话：

```text
Prompt Builder（提示词构建器）负责“如何拼 Prompt（提示词）”，
Prompt Optimizer（提示词优化器）负责“为什么这样拼 Prompt（提示词）”。
```

Day54（第 54 天）解决的是 Prompt（提示词）的结构化。

Day55（第 55 天）解决的是 Prompt（提示词）的智能决策。

完成 Day55（第 55 天）后，系统会从：

```text
Prompt Composition（提示词组合）
```

升级为：

```text
Intelligent Prompt Optimization Engine（智能提示词优化引擎）
```

这也是后面 Day56（第 56 天）Multi-Model Collaboration（多模型协作）和 Day57（第 57 天）Adaptive Model Routing（自适应模型路由）的基础。
