# 第12天学习总结（基于 `route.ts` + `page.tsx`）

> **第13天补充**：文末「第13天学习：Workflow Agent 入门」为独立学习单元（Planner / Executor / 前端过程展示）。

## 今日目标回顾

第12天的核心是让 Memory **从「拼进 system 的背景材料」升级为「参与路由与工具执行的决策链组件」**，同时用 **结构化条目 + 权重 + 二次压缩** 控制长期记忆的体积与质量。  
你在后端完成了记忆模型升级、延续话术修正与工具侧的 memory 注入；在前端完成了 **items 可视化（按重要性区分样式）** 与 **`{ messages, memory }` 闭环**。

## 你今天完成了什么

### 1) 记忆存储从单一 `longTerm` 字符串升级为 `shortTerm + items[]`

- 在 `app/api/chat/route.ts`（及对齐的 `page.tsx`）中定义：
  - `MemoryItem = { content, importance: "high" | "low" }`
  - `Memory = { shortTerm: ChatMessage[]; items: MemoryItem[] }`
- **兼容 Day11**：`IncomingMemoryPayload` 仍可读旧字段 `longTerm`，经 `normalizeIncomingMemoryPayload()` 拆行并按 `HIGH_IMPORTANCE_PATTERN` / `LOW_CHITCHAT_PATTERN` 推断 `importance`。

### 2) Memory 显式参与 **action 路由**（而不只参与最终闲聊）

- 使用 `buildRoutingSystemPrompt(memory)` 构造路由专用 system：注入 **「高优先级记忆」** 与 **「其他记忆」** 两块文本，明确要求模型结合 **最新用户输入 + 长期记忆** 输出单行 JSON。
- **路由调用与闲聊上下文分层**：`POST` 里路由阶段只用 `routing system + memory.shortTerm`，避免 `buildMemory` 里那根「全长记忆 system」与路由提示重复堆砌、干扰 JSON 格式。

### 3) 「继续刚才 / 按上次计划」类延续话术：启发式修正路由结果

- `CONTINUATION_PATTERN` + `isContinuationQuery()` 识别省略语语境。
- `resolveContinuationAction(latestUser, parsed, memory)`：当模型仍给出 `chat` 时，依据 **用户话术** 与 **记忆全文 / 高优块** 将 action **抬升为 `summary` 或 `todo`**，降低误当成闲聊的概率。

### 4) Memory 参与 **工具执行**（todo / summary）

- **Todo**：`generateTodosWithModel({ userInput, memory })` 的 prompt 中注入高/低记忆块，要求 JSON 待办 **体现身份与目标**，并在失败路径使用带记忆导向的占位项（减少「万能空话模板」比例）。
- **Summary**：`summarizeWithModel(..., memory)` 通过 `formatMemoryBlock(memory.items, "high")` 注入 **长期目标参考**，使要点与「结论 / 下一步」更贴用户诉求。

### 5) 二次压缩 + 按权重裁剪，缓解 append-only 膨胀

- **阈值**：`SECONDARY_COMPRESS_THRESHOLD_CHARS`（如 500 字符）或条目数偏多时，`maybeEvolveMemoryItems()` 触发 `secondaryCompressItems()`。
- **策略**：单独一轮模型将多条事实压成最多 `MAX_COMPRESSED_ITEMS` 条，每项仍带 `importance`；失败则降级为 **去重 + `trimMemoryItems`**。
- **`trimMemoryItems`**：先尽量保留全部 `high`，再按顺序塞入 `low`，仍超限则截取尾部，配合 `MAX_LONG_TERM_CHARS` 控制序列化体量。
- **`dedupeMemoryItems`**：按内容（忽略大小写）去重，**同内容 high 覆盖 low**。

### 6) 前后端闭环与 Debug 可视化升级（`page.tsx`）

- 请求体仍为 `JSON.stringify({ messages: withUser, memory })`，响应后 `setMemory(data.memory)`，长期部分从「一段字符串」变为 **条目列表**。
- 右侧 **Memory Debug** 展示 `shortTerm` 条数、`items` 条数；列表中用 **左边框颜色**（如高优琥珀色 vs 普通 zinc）区分 `importance`，并显示 `HIGH` / `LOW` 标签。
- 保留 Day11 以来的体验：`requestAnimationFrame` 合并气泡更新、多业务气泡联合类型、错误与网络异常回填等。

## 工程能力上的收获

### Agent 设计认知

- **路由也是推理**：要让「省略主语的任务延续」稳定，必须让 **记忆进入 routing prompt**，而不能只在最终 answer 里出现。
- **Memory 要可演化**：仅有 append 会胀；需要 **二次压缩、去重、按权重保留** 三层手段配合。
- **同一套记忆，两种用法**：路由用「分块 + 短期」；最终 chat 用 `buildMemory` 产出的 **system 记忆块 + shortTerm**——避免重复与冲突是系统设计点。

### 稳定性与可观测性

- 延续规则是 **模型之后的规则层补丁**，与 `parseModelOutput` 的多级 JSON 容错叠加，提高线上可用性。
- `logAgent("route" | "result" | "error")` 中增加 `memoryItems`、`memoryChars` 等字段，便于对照 Debug 面板做「体感 vs 日志」联调。

### 类型与兼容

- 前端 `ChatApiResult` / 后端 `ChatResponseBody` 与 `Memory` 形状对齐；旧客户端若只传 `longTerm`，服务端仍能 **归一化为 `items`**，降低迁移成本。

## 第12天打卡（结合你当前实现）

1. memory 是否参与 action 路由：是  
2. 是否能处理「继续刚刚任务」类话术：是（`resolveContinuationAction` + 路由 prompt）  
3. memory 是否参与工具执行：是（todo / summary 注入记忆块）  
4. todo 是否变得更个性化：是（prompt 要求结合高/低记忆）  
5. 是否实现 memory 二次压缩：是（`secondaryCompressItems` + 阈值触发）  
6. memory 是否变得更可控：是（去重、按 high 优先裁剪、条目数上限）  
7. 是否实现记忆权重：是（`MemoryItem.importance`，路由与压缩均用到）  
8. 遇到的最大问题：省略语路由与模型 JSON 漂移并存时，需在 **提示词约束** 与 **规则后处理** 之间找平衡  
9. 当前系统能力：多工具路由 + **加权的长期条目** + **延续话术修正** + **二次压缩** + **可观测 Debug** + 前后端闭环  
10. 下一关（见本文「第13天」）：把工作流从单次工具调用升级为 Planner + Executor 的多步骤 Workflow（过程可观测）

## 一句话结论

第12天你已经把 Memory 从「静态旁白」推进到 **「参与路由决策 + 塑造工具产出 + 可压缩演化」** 的决策链一环，并拥有可对照代码排查的 **条目级可视化**。

---

## 第13天学习：Workflow Agent 入门

### 今日核心目标

把 Agent 从 **「单次路由 + 单工具执行」** 升级为 **「多步骤任务执行」**。

之前你的流程是：

用户输入 → 判断 action → 执行一个工具 → 返回结果

第 13 天要升级成：

用户输入 → 判断是否需要 workflow → 拆成多个步骤 → 逐步执行 → 汇总最终结果

### 第 13 天最终要做出的效果

**用户输入：**

> 帮我规划一下明天的 Agent 学习任务，并生成待办

**系统应该能自动执行：**

- Step 1：理解用户目标  
- Step 2：生成学习计划  
- Step 3：生成 todo  
- Step 4：汇总输出  

这就是最小 Workflow Agent。

---

### 任务 1：先设计 Workflow 数据结构

先不要急着写复杂代码，今天第一步是把结构想清楚。

**新增类型：**

```ts
type WorkflowStep = {
  id: string
  name: string
  action: "chat" | "summary" | "todo" | "weather"
  input: string
  status: "pending" | "running" | "success" | "failed"
  output?: unknown
  error?: string
}

type Workflow = {
  id: string
  goal: string
  steps: WorkflowStep[]
  status: "pending" | "running" | "success" | "failed"
}
```

**要先理解：**

- Workflow 是一次完整任务  
- `steps` 是任务拆解后的步骤  
- 每个 step 都可以调用你已有的工具  
- 每个 step 有自己的状态  

---

### 任务 2：实现最小 Workflow Planner

**Planner 是什么？**

把用户的复杂需求拆成步骤。

比如用户说：

> 帮我总结今天学习内容，并生成明天计划

Planner 应该输出：

```json
[
  {
    "name": "总结今天学习内容",
    "action": "summary",
    "input": "总结今天学习内容"
  },
  {
    "name": "生成明天学习计划",
    "action": "todo",
    "input": "根据总结生成明天学习计划"
  }
]
```

**Planner Prompt 示例：**

```ts
const plannerPrompt = `
你是一个 Workflow Planner。

请把用户需求拆解成 2-4 个可执行步骤。

可用 action：
- chat：普通回答
- summary：总结内容
- todo：生成待办
- weather：查询天气

要求：
1. 只返回 JSON 数组
2. 每个步骤包含 name、action、input
3. 不要输出解释
4. 如果用户需求很简单，只返回 1 个步骤

用户需求：
${userInput}

长期记忆：
${memory.longTerm}
`
```

---

### 任务 3：实现 Workflow Executor

**Executor 是什么？**

按顺序执行 planner 生成的步骤。

**伪代码：**

```ts
async function executeWorkflow(workflow: Workflow) {
  for (const step of workflow.steps) {
    step.status = "running"

    try {
      if (step.action === "summary") {
        step.output = await runSummary(step.input)
      }

      if (step.action === "todo") {
        step.output = await runTodo(step.input)
      }

      if (step.action === "weather") {
        step.output = await runWeather(step.input)
      }

      if (step.action === "chat") {
        step.output = await runChat(step.input)
      }

      step.status = "success"
    } catch (err) {
      step.status = "failed"
      step.error = String(err)
      break
    }
  }

  return workflow
}
```

---

### 任务 4：让前端展示 Workflow 执行过程

今天不要只显示最终答案，要显示过程。

前端建议展示成这样：

> 正在执行 Workflow：生成学习计划  
> ✅ Step 1：总结当前学习状态  
> ✅ Step 2：生成第 14 天任务  
> ✅ Step 3：生成待办列表  
> **最终结果：** ……  

你可以先用最简单的列表渲染：

```tsx
{workflow.steps.map((step) => (
  <div key={step.id}>
    {step.status === "success" ? "✅" : "⏳"} {step.name}
  </div>
))}
```

---

### 任务 5：增加 Workflow Debug 日志

每一步都要能看到：

```ts
console.log("[Workflow] start:", workflow.goal)
console.log("[Workflow] step:", step.name)
console.log("[Workflow] action:", step.action)
console.log("[Workflow] status:", step.status)
console.log("[Workflow] output:", step.output)
```

**验收标准：**

- 能看到 workflow goal  
- 能看到每一步 action  
- 能看到每一步耗时  
- 某一步失败时能定位  

---

### 第13天验收标准（总表）

今天做完后，你的系统应该满足：

| # | 项 | 是 / 否 |
|---|----|--------|
| 1 | 是否实现 Workflow 数据结构 | |
| 2 | 是否实现 Planner | |
| 3 | Planner 是否能输出步骤 JSON | |
| 4 | 是否实现 Executor | |
| 5 | 是否能按顺序执行多个 step | |
| 6 | 是否能复用已有工具 | |
| 7 | 前端是否能展示 step 状态 | |
| 8 | 是否有 Workflow 日志 | |

---

### 今天你要重点理解的概念

1. **Tool Calling 是「单步能力」**  
   例如：查天气、生成 todo、总结文本。

2. **Workflow 是「多步任务」**  
   例如：总结今天学习内容 → 生成明天计划 → 拆成 todo → 汇总给用户。

3. **Planner + Executor 是 Agent 的核心骨架**  
   真正的 Agent 系统一般都逃不过这个结构：

   - Planner：想清楚要做什么  
   - Executor：一步一步执行  
   - Memory：提供上下文  
   - Tools：提供能力  
   - UI：展示过程  

---

### 第13天打卡模板

【第13天打卡】

1. 是否实现 Workflow 数据结构：是 / 否  
2. 是否实现 Planner：是 / 否  
3. Planner 是否能稳定输出步骤 JSON：是 / 否  
4. 是否实现 Executor：是 / 否  
5. 是否能按顺序执行多个 step：是 / 否  
6. 是否复用已有 summary / todo / weather 工具：是 / 否  
7. 前端是否能展示 Workflow 步骤状态：是 / 否  
8. 是否增加 Workflow 日志与耗时统计：是 / 否  
9. 遇到的最大问题：  
10. 当前系统能力：
