# Ollama Agent 学习项目

这是一个从前端开发转向 Agent 工程师的学习仓库，核心目标是在 **3 个月** 内完成从“会调模型”到“能做 Agent 应用”的能力升级。

## 背景

- 职业方向：前端开发 -> Agent 工程师
- 学习周期：3 个月
- 技术路线：基于本地 `Ollama`，优先走低成本、可复现、可持续迭代的工程实践
- 学习方式：按 Day 拆分，每天有目标、实操、复盘

## 当前阶段关键目标

你现在最重要的不是学很多框架，而是把这几个点打牢：

1. 本地模型调用
2. 前后端通信
3. 聊天 UI
4. 上下文消息管理 ✅（已完成）
5. Streaming ✅（已完成）
6. JSON 输出 ✅（已完成）
7. 最小工具调用 ✅（已完成）
8. 真实工具调用 ✅（已完成）
9. 上下文裁剪 ✅（已完成）
10. Streaming UI 更新优化 ✅（已完成）
11. 多工具路由（`weather/summary/todo`） ✅（已完成）
12. 占位工具真实化与可观测性建设 ✅（已完成）
13. Summary Memory 长期记忆体系升级（下一步）

## 学习记录（更新到第 11 天任务）

### Day1
- 跑通本地模型：`ollama run qwen2.5:14b`
- 跑通原生接口：`/api/chat`
- 跑通 OpenAI 兼容调用：`responses.create()`

### Day2
- Next.js 最小聊天页面
- 用户消息与助手消息展示
- 页面保留聊天记录 + Enter 发送

### Day3
- `messages` 状态管理
- 前端发送完整历史消息，后端透传给模型
- 完成多轮对话闭环

### Day4
- 完成 Streaming 流式输出（逐字/逐块渲染）
- 建立前端读流与 UI 增量更新链路
- 识别上下文膨胀问题

### Day5
- 完成 JSON 结构化输出
- 后端 JSON 解析与 fallback
- 实现 `chat/search` action 分流

### Day6
- 完成最小工具调用闭环（fake search）
- 前端可展示工具执行结果

### Day7
- 接入真实天气工具（Open-Meteo）
- 优化关键词提取与 JSON 容错

### Day8
- 实现上下文裁剪（最近 10 条）
- 优化 Streaming UI 更新策略

### Day9
- 升级为多工具路由（`chat/weather/summary/todo`）
- 完成结构化解析 + action 分发 + fallback
- 前端支持多形态结果渲染

### Day10（已完成）
- `summary` 工具改为真实模型调用（基于最近 6 条上下文）
- `todo` 工具改为真实模型调用并强约束 JSON 输出
- 增加 `todo` JSON 解析容错与 fallback
- 增加统一日志：`[Agent] route/result/error`
- 增加关键测试用例文档（正常/边界/异常）

### Day11（学习任务）
- 实现 Summary Memory：超长对话自动压缩旧消息并累积 long-term memory
- 重构记忆结构：`shortTerm + longTerm`，替代纯 `messages.slice(-10)` 伪记忆
- 增加 memory debug 面板，可视化 `longTerm` 变化
- 优化 summary prompt，防止无效闲聊污染长期记忆
- 采用规则区分长期/短期记忆（先规则，后续再上 embedding）

## 仓库结构（当前）

- `OLLAMA-DAY1/`：Day1 学习记录与批改笔记
- `ollama-chat-day2/` ~ `ollama-chat-day10/`：按天迭代的项目实践目录
- `ollama_agent_3month_plan.md`：主学习路线与阶段目标（最新版）

## 当前项目状态

当前已具备：上下文多轮对话 + 流式输出 + JSON 结构化路由 + 多工具调用（`weather/summary/todo`）+ 日志可观测 + 关键测试覆盖。  
下一阶段重点：从“工具可用”升级到“长期记忆可用”（Summary Memory 体系）。

---

这个仓库会持续按 Day 更新，记录从前端开发者向 Agent 工程师转型的完整过程。
