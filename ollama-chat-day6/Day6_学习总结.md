# Day6 学习总结：最小 Tool Calling（让 search 真正执行）

## 今日任务做了什么

今天在 `ollama-chat-day6` 项目里，完成了从“只判断 search 意图”到“真正执行搜索工具”的升级，核心是：模型做决策，程序执行工具。

### 1. 新建 Day6 项目并迁移业务逻辑

- 在 `ollama-chat-day6` 下重新搭建了一个 Next.js 项目（不是整包复制 day5）
- 迁移了 day5 的核心业务代码（前端聊天页 + 后端 `/api/chat` 路由）
- 保留了 JSON 解析与分流框架，作为 Day6 的 Tool Calling 基础

### 2. 后端新增第一个工具 `fakeSearch`

在 `app/api/chat/route.ts` 中新增：

```ts
function fakeSearch(keyword: string) {
  const mockData: Record<string, string> = {
    "北京天气": "北京今天晴，18~26℃",
    "上海天气": "上海今天多云，20~28℃",
    "Agent 是什么": "Agent 是能够感知、决策并执行动作的系统。",
    "前端学习路线": "建议从 HTML/CSS → JS → React → 工程化。",
  };

  return mockData[keyword] || `没有找到关于「${keyword}」的结果`;
}
```

这一步实现了“最小可执行工具”。

### 3. `search` 分支从“返回关键词”升级为“执行工具并返回结果”

在后端分支逻辑中，从：

- 仅返回 `{ type: "search", keyword }`

升级为：

- 调用 `fakeSearch(keyword)`
- 返回 `{ type: "search", keyword, result }`

即：

```ts
if (parsed.action === "search") {
  const keyword = parsed.keyword || parsed.content;
  const result = fakeSearch(keyword);

  return Response.json({
    type: "search",
    keyword,
    result,
  });
}
```

### 4. 前端展示工具执行结果

在 `app/page.tsx` 中将 `search` 展示升级为：

```ts
if (data.type === "search") {
  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: `🔍 搜索关键词：${data.keyword}\n📌 结果：${data.result}`,
    },
  ]);
}
```

用户现在可以直接看到“搜索关键词 + 搜索结果”。

### 5. 强化 prompt，提升 search 命中率

将 system prompt 升级为规则化版本：

- 查询信息（天气、知识、搜索等）必须输出 `action: "search"`
- 普通聊天输出 `action: "chat"`
- 必须只输出 JSON，不允许解释文本

这一步用于减少“明明要搜却被判成 chat”的情况。

---

## 今天学到了什么

## 1) Tool Calling 的真实分工

很多人会误以为“模型会自己调用工具”，实际上是：

- 模型输出 action（决策）
- 后端代码执行函数（工具）
- 前端负责展示结果

一句话：**模型负责“说做什么”，程序负责“真的去做”**。

## 2) Agent 最小闭环已经成立

现在已经具备完整链路：

1. 用户输入
2. 模型输出结构化 JSON（意图）
3. 后端解析并分流
4. 后端执行工具（`fakeSearch`）
5. 前端展示执行结果

这就是“决策 + 执行”的最小 Agent 形态。

## 3) 工程重点仍然是稳定性

即使 prompt 约束很强，模型输出仍可能不稳定，所以保留并继续依赖：

- JSON 解析容错（提取 JSON 块）
- fallback 回退（解析失败走 chat）
- 统一响应结构（前端易处理）

---

## 今日验收结论

Day6 核心目标已完成：

- 查询类输入可触发 `search`
- 后端会真实执行 `fakeSearch`
- 前端能显示“关键词 + 结果”
- 普通聊天仍走 `chat`，未破坏原有流程

当前系统已从“会分流”升级为“会执行工具”。

---

## 下一步建议（Day7 方向）

- 将 `fakeSearch` 替换为真实搜索接口（如天气 API 或知识库）
- 给工具执行增加耗时与错误状态展示（loading / error）
- 支持多个工具（search / calculator / weather）并扩展 action schema
- 考虑引入工具调用日志，便于排查模型决策与执行差异
