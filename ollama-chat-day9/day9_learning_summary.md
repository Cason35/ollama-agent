# Day9 学习总结（多工具 Agent）

## 今天做了什么

第九天的核心目标是把单一聊天能力升级为“意图识别 + 工具分发”的多工具 Agent。整体实现为：

- 前端：支持多种消息气泡（普通聊天、天气、总结、待办）
- 后端：先让模型输出结构化 JSON，再根据 `action` 调用对应工具
- 上下文：前后端采用一致的裁剪策略，并保留关键记忆（如用户姓名）

---

## 1. 从普通聊天升级为多工具路由

后端 `route.ts` 里定义了统一动作类型：

- `chat`：普通对话
- `weather`：天气查询
- `summary`：文本总结
- `todo`：待办计划

通过 `systemPrompt` 强约束模型只输出 JSON（`action/content/keyword`），完成“意图路由”：

1. 第一步：模型判断用户意图并返回结构化结果  
2. 第二步：后端按 `action` 分发到业务函数

这让 Agent 从“只会回答”变成“会选择工具并执行”。

---

## 2. 学到的关键后端能力（`app/api/chat/route.ts`）

### 2.1 结构化输出的健壮解析

实现了完整的容错链路：

- `parseModelOutput`：优先直接 `JSON.parse`
- 若失败：尝试从文本中提取 JSON 片段再解析
- 仍失败：降级为 `chat`，把原文本作为回复内容

配合 `normalizeAction`、`normalizeParsedOutput`，避免模型输出异常导致接口崩溃。

### 2.2 上下文窗口与关键记忆保留

使用 `MAX_CONTEXT_MESSAGES = 10` 控制 token 开销，同时用 `NAME_PATTERN` + `isKeyUserMemory` 保留姓名类消息。  
`trimMessages` 会在裁剪窗口外补回关键用户记忆，减少“聊着聊着忘记你是谁”的问题。

### 2.3 工具分发与结果封装

- `weather`：通过 `extractWeatherCity` 提取城市，再调用 `realWeather` 请求 Open-Meteo
- `summary`：调用 `summarize`（当前是占位实现）
- `todo`：调用 `generateTodos`（当前是占位实现）
- `chat`：若内容为空，走 `generateFallbackChat` 二次请求兜底

返回统一为前端可识别的多态结构（`type: chat/weather/summary/todo`）。

### 2.4 外部服务与容错实践

- 天气 API 使用 `cache: "no-store"` 获取实时信息
- 城市映射先支持北京/上海，未知城市给出清晰提示
- Ollama 或网络异常时，返回可读错误信息，避免静默失败

---

## 3. 学到的关键前端能力（`app/page.tsx`）

### 3.1 多态消息模型与渲染解耦

前端定义 `ChatApiResult`（接口返回）和 `AssistantBubble`（UI气泡）两套类型，通过 `apiToAssistant` 做转换。  
这样渲染层只关心 `variant`，不依赖后端细节，扩展新工具时成本更低。

### 3.2 一致的上下文回写策略

发送前会把不同样式的助手气泡回写为统一 `ChatMessage` 文本，再拼接当前用户输入，最后调用 `buildRequestMessages` 裁剪。  
这保证了多类型消息也能持续参与后续上下文。

### 3.3 交互体验优化

- 用户消息先乐观更新（立即显示）
- `requestAnimationFrame` 合并高频状态更新，减少卡顿
- 自动滚动到底部，保证最新消息可见
- 输入锁定、错误提示、网络异常回写消息，提升可感知性

### 3.4 差异化视觉表达

针对 `chat/weather/summary/todo` 使用不同样式：

- 天气：信息型蓝色卡片
- 总结：强调阅读的卡片结构
- 待办：列表化展示并去除重复编号前缀

这体现了“同一聊天窗口内多工具结果可视化”的产品思路。

---

## 4. 今天最重要的工程收获

1. **Agent 不只是模型回答**：关键在“意图识别 + 工具调用 + 结果编排”  
2. **结构化输出必须做容错**：模型不稳定时要有解析降级与业务兜底  
3. **上下文策略要前后端一致**：否则会出现记忆错位和行为不一致  
4. **体验细节很关键**：乐观更新、滚动、错误回写能显著提升可用性  
5. **先占位再迭代是有效路径**：summary/todo 先跑通流程，再替换真实能力

---

## 5. 下一步可继续优化

- 把 `summarize`、`generateTodos` 从占位实现升级为真实 LLM 调用
- 扩展天气城市词典或接入地理编码服务，减少手工映射
- 增加工具调用日志与耗时统计，便于评估稳定性
- 补充单元测试：解析容错、城市提取、上下文裁剪、路由分发
- 支持流式返回（stream）提升长回答响应体验

---

## 一句话结论

第九天完成了从“聊天页面”到“多工具 Agent 雏形”的关键跃迁：已经具备结构化路由、工具分发、记忆裁剪和多形态 UI 展示能力，后续重点是把占位工具替换为真实能力并补齐可观测性与测试。

---

## 第10天学习任务（重点：把 Demo 变成可用系统）

### 第10天核心目标（一句话）

让 `summary` / `todo` 从“摆设功能”变成“真正可用的 Agent 能力”，并让系统具备“可观测、可调试、可稳定”的工程基础。

---

### 今日任务拆解（按顺序）

#### 任务 1：把 `summary` 工具做成真实能力

**当前问题**

- 只是占位实现（写死或简单返回）
- 没有真正调用 LLM
- 不稳定、不可复用

**目标效果**

用户输入“帮我总结一下我们刚刚的对话”时，系统返回结构清晰的总结（要点 / 结论 / 下一步）。

**实现步骤**

1. 定义工具 schema（关键）

```ts
type SummaryAction = {
  action: "summary";
  content: string; // 要总结的内容
};
```

2. 从 `messages` 提取上下文，不取全量（避免 token 爆炸）

```ts
const recentMessages = messages.slice(-6);
```

3. 构造 summary prompt

```ts
const prompt = `
请总结以下对话，要求：
1. 提取关键信息
2. 用 3-5 条要点表达
3. 语言简洁

对话：
${recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n")}
`;
```

4. 调用模型（使用当前 Ollama `/api/chat`）
5. 返回结构化结果

```ts
return {
  type: "summary",
  data: result,
};
```

**验收标准**

- 输入“帮我总结一下刚刚内容”可正常返回总结
- 内容与上下文相关，不胡编
- 控制在 3-5 条要点
- 响应不卡顿

#### 任务 2：把 `todo` 工具做成真实能力

**当前问题**

- 只是占位实现
- 缺少结构化输出保障

**目标效果**

用户输入“帮我把今天的学习拆成待办”时，返回可直接渲染的 JSON 列表。

```json
[
  { "task": "实现 summary 工具", "done": false },
  { "task": "实现 todo 工具", "done": false }
]
```

**实现步骤**

1. 设计 JSON 输出格式

```ts
type TodoItem = {
  task: string;
  done: boolean;
};
```

2. 使用强约束 prompt（关键）

```ts
const prompt = `
请根据用户输入生成待办事项：

要求：
1. 返回 JSON 数组
2. 每项包含 task 和 done
3. done 默认为 false
4. 不要输出任何解释

用户输入：
${userInput}
`;
```

3. 解析 JSON 并添加 fallback

```ts
try {
  const todos = JSON.parse(output);
} catch {
  // fallback：返回普通文本
}
```

**验收标准**

- 返回值是 JSON（不是普通文本）
- 前端能渲染成待办列表
- 至少 3 条合理任务
- JSON 解析失败有兜底

#### 任务 3：增加可观测性（非常关键）

**目标**

每次工具调用都可追踪：`action`、输入、耗时、成功/失败。

**实现方式**

1. 加日志

```ts
console.log("[Agent] action:", action);
console.log("[Agent] input:", input);
```

2. 统计耗时

```ts
const start = Date.now();
// 调用工具
const duration = Date.now() - start;
console.log("[Agent] duration:", duration, "ms");
```

3. 错误日志

```ts
try {
  // tool
} catch (err) {
  console.error("[Agent ERROR]", err);
}
```

**验收标准**

- 每次请求都能看到日志
- 日志中能看到 action 类型
- 能看到耗时
- 出错时可定位

#### 任务 4：补关键测试用例

**至少覆盖 3 类场景**

- 正常 case：`帮我总结一下刚刚内容`
- 边界 case：空输入、很短输入
- 异常 case：JSON 解析失败

**验收标准**

- 接口不崩
- fallback 生效
- 行为符合预期

---

### 第10天核心认知

1. Agent 不等于功能多，而是每个能力都要“可靠 + 可控 + 可调试”
2. Prompt 不是提示词，而是模型行为的接口定义
3. 可观测性是必需品；没有日志的 Agent 基本无法 debug 和生产化

---

### 第10天打卡模板（可直接复制）

```md
【第10天打卡】

1. summary 工具是否真实调用模型：是 / 否
2. summary 是否能提取关键要点：是 / 否

3. todo 工具是否返回 JSON：是 / 否
4. todo 是否能正常渲染：是 / 否

5. 是否增加日志系统：是 / 否
6. 是否能看到工具耗时：是 / 否

7. 是否做了测试用例：是 / 否

8. 遇到的最大问题：
9. 当前系统能力：
10. 明天准备优化：
```
