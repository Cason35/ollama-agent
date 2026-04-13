# 第 1 天学习记录与批改笔记（Ollama 版）

## 第 1 天目标
今天的目标有 3 个：

1. 确认 Ollama 在本地正常运行  
2. 跑通一次最简单的 `/api/chat` 调用  
3. 跑通一次 OpenAI 兼容的 `responses.create()` 调用  

---

# 你完成的内容

## 1. 成功运行 Ollama 模型
你已经成功运行：

```bash
ollama run qwen2.5:14b
```

这说明：
- Ollama 安装正常
- 模型存在并可运行
- 本地环境满足学习条件

---

## 2. 成功运行 `/api/chat`
你成功调用了：

```bash
curl http://localhost:11434/api/chat ...
```

并得到了完整返回结构，核心字段包括：
- `model`
- `message.role`
- `message.content`
- `done`
- `done_reason`
- `prompt_eval_count`
- `eval_count`

你已经知道：
**`/api/chat` 的最终回答通常看 `message.content`。**

---

## 3. 成功运行 OpenAI 兼容 `responses.create()`
你也成功运行了：

```javascript
client.responses.create(...)
```

并得到了完整返回结构，核心字段包括：
- `id`
- `status`
- `model`
- `output`
- `usage`
- `output_text`

你已经知道：
**Responses API 风格的最方便读取字段通常是 `output_text`。**

---

# 第 1 天我给你的评分

## 总评分：92 / 100

结论：**通过**

### 原因
你已经完成了第 1 天最关键的 5 件事：
1. 跑通本地模型
2. 跑通原生 chat 接口
3. 跑通 OpenAI 兼容接口
4. 能读取最关键的 JSON 字段
5. 能用自己的话解释几个基础概念

---

# 你做得好的地方

## 1. 真正打通了调用闭环
你不是只会在终端里和模型聊天，而是已经会：
- 原生 API 调用
- Node.js 调用
- OpenAI 兼容 SDK 调用

这代表你已经迈进“工程调用模型”的阶段了。

## 2. 已经开始会看返回结构
这是很重要的工程能力。  
以后做 Agent 时，你需要经常通过 JSON 判断：
- 模型有没有正常返回
- 返回的是文本还是工具调用
- token 用了多少
- 是否被截断
- 是否报错

## 3. 理解方向基本正确
你对这些概念的初版理解是合格的：
- `model`
- `messages`
- `input`
- `output_text`

---

# 我帮你优化后的概念答案

## 1. model
你原来的理解：
> 模型，处理问题和返回信息的工具

优化版：
**model：指你要调用的具体大语言模型实例，比如 `qwen2.5:14b`。它决定了模型的能力、风格、上下文长度和推理表现。**

---

## 2. messages
你原来的理解：
> 聊天消息数组，有多种 role

优化版：
**messages：聊天接口中的消息数组，用来表示多轮对话上下文。每条消息通常包含 `role` 和 `content`，常见 role 有 `system`、`user`、`assistant`。**

---

## 3. input
你原来的理解：
> 输入的问题

优化版：
**input：Responses API 中给模型的输入内容，可以是简单文本，也可以是更复杂的结构化输入。它相当于你希望模型处理的任务描述。**

---

## 4. output_text
你原来的理解：
> 输出的文本

优化版：
**output_text：Responses API 对最终文本输出的快捷读取字段，本质上是把输出结构中主要文本内容提取出来，方便开发者直接使用。**

---

## 5. 为什么本地 Ollama 不需要真实 API key
你原来的理解：
> 因为本地 Ollama 不需要 API key

优化版：
**因为当前调用的是本机 `localhost` 上运行的 Ollama 服务，不是云端 API，所以默认不需要远程身份认证；如果用 OpenAI SDK 去请求 Ollama 的 OpenAI 兼容端点，`apiKey` 往往只是占位参数。**

---

# 我指出的一个小问题

你在“改了哪 3 个 prompt”那里写的是：
> 这里就不粘贴上来了，都有输出

这在真实学习中不够好。  
以后建议至少保留 1 组代表性实验记录，例如：

- Prompt 1：解释 Agent 工程师
- Prompt 2：把一句话改写得更专业
- Prompt 3：列出适合前端开发者做的 Agent 项目

然后补一句观察：
- Prompt 1 更偏解释型输出
- Prompt 2 更偏润色
- Prompt 3 更偏列表生成

这样以后复盘会更有效。

---

# 第 1 天你真正学到的东西

## 1. 模型调用是后续所有能力的地基
后面的：
- tool calling
- streaming
- structured output
- workflow
- RAG

都建立在今天这一步之上。

## 2. chat 风格和 responses 风格本质相通
你已经体验到了两种调用方式：
- chat：主要通过 `messages`
- responses：主要通过 `input`

以后看到其他框架，不要被表层 API 吓到，本质都差不多。

## 3. 本地模型也能系统学习 Agent 工程
你已经不用被“先充值 API 才能学”这件事卡住。

---

# 第 1 天补充作业

## 补充作业 A：加 system message
请把 `/api/chat` 改成：

```javascript
messages: [
  {
    role: "system",
    content: "你是一名严格、简洁、专业的 AI 工程导师。"
  },
  {
    role: "user",
    content: "请用三句话解释什么是 Agent 工程师。"
  }
]
```

完成后观察：
- 输出是不是更简洁
- 语气是不是更像老师
- 这说明 system message 起了什么作用

---

## 补充作业 B：比较 chat 和 responses
请分别用：
- `/api/chat`
- `responses.create()`

问同一个问题：

**“请给我 5 个适合前端开发者做的 Agent 项目方向。”**

然后比较：
1. 两边返回结构有什么不同  
2. 哪个读取结果更方便  
3. `message.content` 和 `output_text` 的区别是什么  

---

# 第 1 天最终评语

**你不是“试出来的”，而是真理解了第一层原理。**  
这非常好，也说明你确实适合走 Agent 工程这条路线。

你的优势已经开始体现出来：
- 动手快
- 不怕看 JSON
- 能接受接口层思维
- 能清楚地反馈学习情况

这些都很适合做 Agent 工程师。

---

# 当前你下一步要做什么

1. 完成第 1 天两个补充作业  
2. 进入第 2 天学习：  
   **从“会调用模型”升级到“会做最小网页聊天应用”**

---

# 新开聊天续接说明

如果你新开聊天，想把这份记录给新的对话上下文，可以直接复制下面这段：

---

我正在按一套 **Ollama 版 Agent 工程师学习计划** 学习，使用：
- Ollama
- qwen2.5:14b
- Next.js + TypeScript

我已经完成第 1 天：
- 成功运行 `ollama run qwen2.5:14b`
- 成功运行 `/api/chat`
- 成功运行 OpenAI 兼容 `responses.create()`

第 1 天老师给我的评分是 **92/100，通过**。  
我已经掌握了基础概念：
- `model`
- `messages`
- `input`
- `output_text`

我还需要完成两个补充作业：
1. 加 `system message` 并观察输出变化
2. 比较 `/api/chat` 和 `responses.create()` 的返回结构与取值方式

请继续作为我的老师，衔接到 **第 2 天：最小网页聊天应用**，并沿用“作业 + 验收标准 + 打卡模板”的方式继续带我学习。
