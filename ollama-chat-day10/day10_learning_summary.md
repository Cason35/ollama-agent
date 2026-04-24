# Day10 学习总结（可用化 Agent）

## 已完成

1. `summary` 工具改为真实模型调用（基于最近 6 条上下文）
2. `todo` 工具改为真实模型调用并强约束 JSON 输出
3. 增加 todo 解析容错与 fallback，避免 JSON 异常导致崩溃
4. 增加统一日志：`[Agent] route/result/error`
5. 增加关键测试用例文档，覆盖正常/边界/异常

## 第10天打卡

1. summary 工具是否真实调用模型：是
2. summary 是否能提取关键要点：是
3. todo 工具是否返回 JSON：是（异常时 fallback）
4. todo 是否能正常渲染：是
5. 是否增加日志系统：是
6. 是否能看到工具耗时：是
7. 是否做了测试用例：是

8. 遇到的最大问题：
模型偶发不按 JSON 输出，需要双层解析与兜底策略。

9. 当前系统能力：
具备意图路由、真实 summary/todo、天气查询、日志可观测。

10. 明天准备优化：
增加自动化单测与 API 级集成测试，继续扩展城市与工具能力。

---

## ✅ 第 11 天学习任务

### 🎯 核心目标（一句话）

让你的 Agent 从“短对话工具”升级为“能长期对话的系统”（Memory 体系升级）

### ⚠️ 先说一个现实问题（必须认清）

你现在的系统其实仍然是：

❌ “伪记忆”  
本质 = `messages.slice(-10)`

这会导致：

- 对话一长 -> 忘记早期重要信息
- 用户重复提供信息（体验差）
- summary 工具虽然存在，但没有参与记忆体系

### 🧠 第 11 天核心：Memory 架构升级

你要做的是 👇

### 🧩 任务 1：实现「Summary Memory（摘要记忆）」

#### 🎯 目标

当对话变长时：

👉 不再丢弃旧消息  
👉 而是把它们压缩成一段“长期记忆”

#### 🧠 记忆结构设计（重点！！！）

```ts
type Memory = {
  shortTerm: Message[]   // 最近对话（如 6 条）
  longTerm: string       // 历史摘要（核心！）
}
```

#### 🛠 实现步骤（一步一步）

Step 1：设置触发条件

```ts
if (messages.length > 10) {
  // 触发 summary memory
}
```

Step 2：抽取“被裁剪部分”

```ts
const oldMessages = messages.slice(0, -6)
```

Step 3：调用 summary 工具（复用你第 10 天成果！）

```ts
const summary = await summarize(oldMessages)
```

Step 4：更新 longTerm memory

```ts
memory.longTerm += "\n" + summary
```

👉 注意：不是覆盖，是累积（但要控制长度）

Step 5：重构 messages

```ts
messages = [
  {
    role: "system",
    content: `以下是历史对话摘要：\n${memory.longTerm}`
  },
  ...messages.slice(-6)
]
```

#### ✅ 验收标准

- 对话超过 10 轮后不会丢失关键信息
- 模型还能记住早期内容（如姓名/目标）
- token 明显下降
- 对话依然流畅

### 🧩 任务 2：做“记忆可视化”（非常关键）

#### 🎯 为什么要做？

否则你根本不知道：

- memory 有没有生效
- summary 有没有污染上下文
- 模型到底看到什么

#### 🛠 实现方式（简单版）

前端加一个 debug 面板：

```tsx
<div>
  <h3>🧠 Memory</h3>
  <pre>{memory.longTerm}</pre>
</div>
```

#### ✅ 验收标准

- 能看到 longTerm 内容
- 每次 summary 后会更新
- 内容可读、不是乱码

### 🧩 任务 3：防止“记忆污染”（重点 ⚠️）

#### ❌ 常见坑

模型总结成：

“用户很开心，今天聊了很多”

👉 这种是无效记忆

#### ✅ 你要做的：加约束 prompt

```ts
const prompt = `
请总结对话，用于长期记忆：

要求：
1. 只保留关键信息（身份 / 目标 / 偏好）
2. 删除闲聊内容
3. 输出简洁事实
4. 不要出现“用户说”“助手说”

输出示例：
- 用户是前端工程师
- 正在学习 Agent 开发
`
```

#### ✅ 验收标准

- summary 更“像数据库”，而不是作文
- 没有废话
- 能长期复用

### 🧩 任务 4：记忆分层（进阶）

#### 🎯 目标

区分：

| 类型 | 示例 | 是否长期保存 |
| --- | --- | --- |
| 用户身份 | 前端工程师 | ✅ |
| 用户目标 | 转型 Agent | ✅ |
| 临时问题 | 今天天气 | ❌ |

#### 🛠 简单实现（规则版）

```ts
if (text.includes("我是") || text.includes("我想")) {
  // 存入长期记忆
}
```

👉 先用规则，不用上 embedding（第 2 月再做）

#### ✅ 验收标准

- 长期记忆更稳定
- 无关内容不会污染 memory

### 🧠 第 11 天核心认知（非常重要）

1️⃣ Memory ≠ messages  
`messages`：通信数据  
`memory`：认知数据

2️⃣ Summary 是“压缩算法”

不是总结，而是：

把 1000 token -> 100 token，同时保留语义

3️⃣ 没有 Memory 的 Agent ≈ ChatGPT demo

有 Memory 的 Agent：

才接近真实产品（Notion AI / ChatGPT / Copilot）

### 📋 第 11 天打卡模板

【第11天打卡】

1. 是否实现 Summary Memory：是 / 否
2. 是否在对话过长时自动触发：是 / 否
3. longTerm memory 是否生效：是 / 否
4. 模型是否能记住早期信息：是 / 否
5. 是否实现 memory 可视化：是 / 否
6. 是否优化 summary prompt：是 / 否
7. 是否区分长期/短期记忆：是 / 否
8. 遇到的最大问题：
9. 当前系统能力：
10. 明天准备优化：
