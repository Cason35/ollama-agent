# Day 8 学习总结：上下文裁剪（Context 管理）

## 一、本日实现概览

第八天在本地 Ollama 聊天（`qwen2.5:14b`）的基础上，重点补全了**对话历史的管理方式**：不把所有历史都塞进模型，而是按固定策略**裁剪**后再请求，并保证**前端发什么、后端就用什么**一致。此外延续了「结构化 JSON 路由」：模型按 `systemPrompt` 输出 `action: chat | search`，搜索分支用 Open-Meteo 拉真实天气。

| 模块 | 文件 | 作用 |
|------|------|------|
| API | `app/api/chat/route.ts` | `trimMessages` 裁剪 → Ollama → 解析 JSON → 闲聊或查天气 |
| 页面 | `app/page.tsx` | 全量 `messages` 在界面展示，但请求体用 `buildRequestMessages` 与后端对齐 |

---

## 二、功能要点（与代码对应）

1. **意图分流**：`systemPrompt` 要求模型**只输出 JSON**（`action`、`content`、`keyword`）。`action === "search"` 时走天气；否则返回闲聊 `content`。
2. **真实天气**：`cityMap` 绑定北京/上海经纬度，调用 [Open-Meteo](https://api.open-meteo.com) `current_weather`；`extractWeatherCity` 从 keyword/内容/最近用户话里抽城市名。
3. **上下文条数上限**：`MAX_CONTEXT_MESSAGES = 10`，与前后端**同名同值**，避免「前端以为发了 3 条、后端实际用 20 条」的错位。
4. **关键记忆（名字）**：用正则 `NAME_PATTERN` 识别「我叫 / 我的名字是 / 叫我 + 名字」；若该条**已滑出**最近 10 条，则**单独拼回**到裁剪结果前面，减轻「长聊后忘你是谁」的问题。

---

## 三、上下文裁剪的核心原理（重点）

### 3.1 为什么要裁剪？

- **模型上下文有上限**：再长的对话也不能无限追加，否则超 token、报错或截断方式不可控。
- **成本与延迟**：条数越多，每次请求的 prompt 越大，占显存/时间越多。
- **信噪比**：过旧轮次对当前句贡献往往很小；保留**最近若干轮**通常足够延续话题。

因此做法本质上是：**用「有限窗口」近似「无限长对话」**，在界面上仍保留完整 `messages` 做展示，**仅在对模型请求**时使用裁剪后的子集。

### 3.2 本项目的裁剪算法（滑动窗口 + 例外注入）

逻辑在服务端是 `trimMessages`，在前端是与之镜像的 `buildRequestMessages`，步骤一致：

1. **基线：最近 N 条**  
   `recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES)`  
   即只取数组末尾 10 条（用户/助手成对或交错都算一条「消息」）。

2. **扫描：是否有一条「关键用户记忆」**  
   在全量 `messages` 里 `find` 第一条满足：`role === "user"` 且 `isKeyUserMemory(content)`（命中自我介绍类句式）。

3. **合并规则**  
   - 若**找不到**关键句，或关键句**已经在** `recentMessages` 里 → 直接返回 `recentMessages`（总长度仍 ≤ 10，不会膨胀）。  
   - 若关键句在**更早**的位置（已被滑出窗口）→ 返回  
     `[keyUserMessage, ...recentMessages]`  
     即把这一条**预置**在窗口最前，使模型始终「看见」名字，同时仍以最近 10 条为主体。

4. **结果形态**  
   多数情况下请求体是 **10 条**；仅当存在「被滑出窗口的自我介绍」时，会变为 **11 条**（1 条记忆 + 10 条最近）。这是用**极小的长度代价**换**身份一致性**的显式设计。

### 3.3 为什么前后端要重复同一套逻辑？

- **请求体是客户端组装的**：`fetch("/api/chat", { body: JSON.stringify({ messages: requestMessages }) })`。若只有后端裁剪、前端发全量，则要么后端再裁一次（易重复/不一致），要么必须约定「只发裁剪后的」——那就必须与后端规则一致。
- **一致性的含义**：用户看到的「当前会发给模型的历史」与服务器日志、`trimmedMessages` 一一对应，**调试、复现、排查意图错误**时不会因为双端规则不同而误判。

**注意**：`MAX_CONTEXT_MESSAGES` 与 `NAME_PATTERN` 改动时需**两边同步**；更稳妥的做法是抽到共享包（如 `lib/chat-context.ts`）单源维护，本日练习为直观看懂写在两处。

### 3.4 与「RAG / 系统提示」的边界

- 本日裁剪是 **token 级预算管理**：控制列表长度。  
- **未**做向量库检索、摘要压缩等；名字保留是**规则化**的「硬编码高优先级条」，不是 embedding。  
- `systemPrompt` 仍单独放在 Ollama 的 `messages` 最前，与历史用户消息分离，符合「系统指令 + 多轮 user/assistant」的常见结构。

### 3.5 本方案的局限与可扩展方向

- **只认第一条** `find` 到的自我介绍：若用户多次改名，只有第一次匹配的句子被当作「关键记忆」。  
- **固定 N=10**：未按字符数/ token 数动态算窗口；与真实生产中的 tokenizer 限长仍有差距。  
- **关键记忆仅覆盖「名字」**：其它长期设定（职业、偏好）若要保留，可扩展为多类 pattern 或引入摘要。  

这些不影响理解「**滑动窗口 + 例外注入**」这一核心，而是产品化时的自然演进点。

---

## 四、前端与交互细节（辅助理解）

- **全量 `messages` vs 请求子集**：界面始终展示完整聊天；仅 POST 体使用 `buildRequestMessages(withUser)`，与标题「Context 管理」一致。
- **搜索类回复展示**：`type === "search"` 时拼成 `🔍 keyword` + `📌 result` 作为助手气泡。
- **`requestAnimationFrame` 合并 setState**：同一帧内多次更新 `messages` 时合并提交，减少列表渲染抖动（与裁剪策略正交，属 UI 体验优化）。

---

## 五、自测建议

1. 先说一句「我叫某某」，再连续聊超过 10 轮，问「我叫什么」——应仍能答对（靠 prepend 的自我介绍条）。  
2. 只问普通闲聊、不问天气，确认 `action: chat` 路径。  
3. 问「北京/上海 天气」——应走 `search` 与 Open-Meteo 真数据。  

---

## 六、相关文件

- `app/api/chat/route.ts`：`trimMessages`、`MAX_CONTEXT_MESSAGES`、Ollama + JSON 解析 + 天气。  
- `app/page.tsx`：`buildRequestMessages`、发请求、展示。  

本日核心收获：**在有限上下文下做可预期的历史截断，并用「高价值单条回注」避免关键长期信息被窗口滑出**，同时保持前后端对同一段历史的理解一致，便于联调与扩展。
