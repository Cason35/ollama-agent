# Ollama Agent 学习项目

这是一个从前端开发转向 Agent 工程师的学习仓库，核心目标是在 **3 个月** 内完成从“会调模型”到“能做 Agent 应用”的能力升级。

## 背景

- 职业方向：前端开发 -> Agent 工程师
- 学习周期：3 个月
- 技术路线：基于本地 `Ollama`，优先走低成本、可复现、可持续迭代的工程实践
- 学习方式：按 Day 拆分，每天有目标、实操、复盘

## 学习记录

### Day1：本地模型调用打通

已完成的关键事项：

- 跑通本地模型：`ollama run qwen2.5:14b`
- 跑通原生接口：`/api/chat`
- 跑通 OpenAI 兼容调用：`responses.create()`
- 学会从返回 JSON 中读取关键信息（如 `message.content`、`output_text`）

阶段结果：

- 第一天评分 `92/100`，已通过
- 完成了从“会在命令行聊天”到“会工程化调用模型”的第一步

Day1 详细记录见：`OLLAMA-DAY1/day1_ollama_learning_notes.md`

### Day2：最小网页聊天应用（Next.js）

当前方向：

- 搭建一个最小可用的网页聊天应用
- 让前端页面可以连接本地 Ollama，完成基础对话闭环

当前状态：

- 已创建 `ollama-chat-day2` 项目目录（Next.js 初始化版本）
- 后续将补充接口联通、消息渲染、错误处理等实战内容

### Day3：在 Day2 基础上继续迭代

当前方向：

- 在 Day2 的基础上继续完善聊天应用能力
- 逐步引入更接近 Agent 场景的能力（如上下文管理、结构化输出、工具调用等）

当前状态：

- 已创建 `ollama-chat-day3` 项目目录（Next.js 初始化版本）
- 具体迭代内容将按学习进度持续补充

## 仓库结构（当前）

- `OLLAMA-DAY1/`：Day1 学习记录与批改笔记
- `ollama-chat-day2/`：Day2 聊天应用实践目录
- `ollama-chat-day3/`：Day3 迭代实践目录

## 后续计划（滚动更新）

- Day4+：逐步增加 Agent 工程能力模块
  - Prompt 工程与评测
  - Tool Calling
  - Workflow 编排
  - RAG 基础集成
  - 部署与稳定性优化

---

这个仓库会持续按 Day 更新，记录从前端开发者向 Agent 工程师转型的完整过程。
