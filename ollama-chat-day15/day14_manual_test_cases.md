# Day 14 手动测试用例（对照学习计划）

本文档首要验收 **`day13_learning_from_route_and_page.md` 第14天学习任务**（Step 依赖、上下文注入、Planner、调试面板、`synthesizeWorkflowResult`），而非全面回归所有单步路由功能。  
实现对照：`ollama-chat-day14/app/api/chat/route.ts`（`executeWorkflow`、`planWorkflowSteps`、`synthesizeWorkflowResult`、`injectedContextPreview`）、`app/page.tsx`（Workflow 卡片 UI）。

---

## 学习目标 ↔ 验收映射

| 学习计划要点 | 本仓库中的体现 | 用例锚点 |
|--------------|----------------|----------|
| 任务1：`dependsOn` + `output` | `WorkflowStep.dependsOn` / `output`；拓扑序 `topologicalSortWorkflowSteps` | **§2.1** |
| 任务2：依赖结果注入 Executor | `formatDependencyOutputsForStep`、`dependencyContext`/`chainPrefix`、`【依赖步骤结果】` chat 分支 | **§2.2** |
| 任务3：Planner 会写依赖 | `planWorkflowSteps` 提示词要求 `dependsOn` | **§2.3** |
| 任务4：链式调试面板 | 前端：`dependsOn` 行、`注入上下文预览`、`输出摘录`、`↓ 被后继步骤用作依赖` | **§2.4** |
| 任务5：最终合成 | `synthesizeWorkflowResult`，`finalSummary` 非简单「Step1…Step2…」罗列 | **§2.5** |

---

## 一、环境与最小前置（Workflow 验收前）

| 步骤 | 操作 | 预期 |
|------|------|------|
| E1 | Ollama 已启动，模型与 `OLLAMA_MODEL` 或默认 **`qwen2.5:14b`** 一致 | 能完成多轮 Workflow（Planner + 多工具） |
| E2 | `ollama-chat-day14` 下 `npm install` → `npm run dev` | 可打开首页 |
| E3 | 浏览器打开应用，**勾选「多步 Workflow」** | 后续 **§2** 全部在此模式下执行 |

> 单步路由、天气、MiMo、HTTP 错误码等 **非第14天主线**，见 **§4 附录**。

---

## 二、第14天核心验收（必测）

> Planner/模型存在随机性：同一句话可多试 1～2 次；**以返回 JSON 里 `workflow.steps` 的结构 + UI 面板 + 终端 `[Workflow]` 日志为准**，不要求逐字相同。

### 2.1 任务1：Step 输出与 `dependsOn`（因果链 ≠ 各跑各的）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D14-1a** | 勾选 Workflow，输入（学习文档同款意图）：**「帮我总结今天学习内容，然后生成明天待办」**（可先人工发 2～3 条消息制造「今天学了什么」的短期语境，再发此句） | 返回 `type: "workflow"`；步骤中至少 **2** 步；存在 **`summary` 后接 `todo`** 或语义等价的「先归纳再列待办」组合 |
| **D14-1b** | 检查 **第二步（或依赖 summary 的那一步）** 的 JSON 或 UI | **`dependsOn` 非空**，且引用的 `id` 对应 **summary 所在步骤**（与学习文档示例 `step2.dependsOn: ["step1"]` 同构） |
| **D14-1c** | 若 Planner 未写出 `dependsOn`（偶发） | 执行器仍可用 **线性前置** 串联上下文（`injectedContextPreview` 可能来自 `linearPriorOutputs`）；记录为 **弱通过**，并对比 **D14-2** 是否仍能观察到前序输出进入后步 |

**反例（不通过）**：多步始终无 `dependsOn`、且后步「注入上下文预览」长期为空、待办与前面总结明显无关——说明依赖链未建立或未注入，需查 Planner/Executor。

---

### 2.2 任务2：Context Injection（后步读取前步结果）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D14-2a** | 在完成 **D14-1** 的同一张 Workflow 卡片上，展开依赖 **`todo`（或后序 chat）** 步骤的 **「注入上下文预览」** | 预览文本中应能识别 **前序步骤的实质内容**（例如总结中的关键词、要点），而非仅重复用户原句 |
| **D14-2b** | 对照 **「输出摘录」** | 前序 **`summary` 步** 的摘录与后序注入内容 **语义相关**（证明 `output` 被纳入依赖格式化） |
| **D14-2c** | （可选）终端搜索 `logWorkflow("step"` 的负载 | 含 `dependsOn`、`injectedContextPreview`（或日志字段与实现一致），与 UI 对齐 |

**对应学习文档**：从「`runTodo(step.input)`」升级为带 **`dependencyOutputs` / `dependencyContext`** 的调用链；`todo` 分支在 `route.ts` 中通过 `generateTodosWithModel` 的 `dependencyContext` 传入。

---

### 2.3 任务3：Planner 生成依赖关系

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D14-3a** | 使用强提示句：**「第一步用总结概括我们上面聊的内容，第二步根据该总结生成待办，第二步必须依赖第一步」** | `todo` 步骤上出现 **`dependsOn`**，指向总结步骤 `id` |
| **D14-3b** | 再试：**「先查北京天气，再根据天气写注意事项，最后根据注意事项列待办」** | 至少一步 **weather**；**后序**步骤中最好出现指向「天气/注意事项」相关步骤的 **`dependsOn`**（模型可能拆成 chat/summary/todo，以 **显式 dependsOn** 为优） |

若多次无 `dependsOn`：在缺陷里注明 Planner 输出，并对比 `planWorkflowSteps` 的 system 提示是否被模型遵守。

---

### 2.4 任务4：Workflow Chain Debug 面板（前端）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D14-4a** | 任意成功多步 Workflow | 每步可见 **状态符**（✓/✕/…/○）、**`action`**、可选 **`· Nms`** |
| **D14-4b** | 存在 `dependsOn` 的步骤 | 显示 **`dependsOn：`** 与 **`id (步骤名称)`** |
| **D14-4c** | 某步被其它步骤引用 | 该步底部 **「↓ 被后继步骤用作依赖：」** 列出后继 **name** |
| **D14-4d** | 有注入时 | **「注入上下文预览」** `<details>` 可展开，内容为依赖/线性上下文字符串 |

---

### 2.5 任务5：Workflow Final Synthesizer（最终自然答复）

| ID | 操作 | 通过标准 |
|----|------|----------|
| **D14-5a** | 阅读卡片底部 **「最终结果」**（`finalSummary`） | 为 **一段连贯回答**（可含小标题/列表），**不是**机械拼接「Step1:… Step2:…」且与各步输出毫无整合 |
| **D14-5b** | 语义检查 | **最终结果**应 **覆盖关键步骤的结论**（如总结要点、待办主题、天气结论中的至少其主要信息） |

失败特征：最终结果仅重复用户问题、或与各步「输出摘录」明显脱节——怀疑 `synthesizeWorkflowResult` 未吃到足够步骤摘要或模型未遵守提示。

---

### 2.6 与学习文档「打卡模板」逐项对照

| 打卡项 | 推荐验证方式 |
|--------|----------------|
| 1. `dependsOn` 已实现 | **D14-1b**、`workflow.steps[].dependsOn` |
| 2. dependency output 已注入 | **D14-2a～2c**、`injectedContextPreview` / `dependencyContext` |
| 3. `todo` 能用 `summary` 输出 | **D14-1** + **D14-2** 综合读待办卡与注入文本 |
| 4. 真正链式执行 | 步骤按拓扑顺序成功；**D14-4c** 后继依赖展示 |
| 5. Planner 能生成 `dependsOn` | **D14-3a** |
| 6. workflow synthesize | **D14-5** |
| 7. 前端 dependency chain | **D14-4** |

（打卡 8、9 为个人记录，不在此表自动化。）

---

## 三、失败与中断（链式验收补充）

| ID | 操作 | 预期 |
|----|------|------|
| **D14-F1** | Workflow 执行中某步失败（如关 Ollama、或工具抛错） | `workflow.status` 为 `failed`；失败步 **✕** + `error`；**「最终结果」** 以 **「工作流中断：」** 开头 |
| **D14-F2** | 对比成功路径 | 成功路径 **不得** 出现无意义的「中断」文案；`finalSummary` 来自 **合成** 分支 |

---

## 四、附录（非第14天主线，按需 smoke）

### A. 页面与单步路由（极简）

- 空输入不发送；加载态「正在思考…」；`2000` 字限制；Enter 发送 / Shift+Enter 换行。  
- **不勾选** Workflow：闲聊、北京/上海天气、总结、待办能各出对应卡片即可（细节见历史版本或 day13 用例）。

### B. 后端 MiMo

- 选「小米 MiMo」需 `XIAOMI_MIMO_API_KEY`；未配置 → **503** 与 `.env.local` 引导。  
- 非法 `mimoModel` → **400**。

### C. API 探针

```bash
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d "{\"messages\":[]}"
```

预期 **400**，`messages is required`。

### D. 多轮历史扁化（可选）

Workflow 完成后继续聊天：请求历史中助手侧应带 **`【Workflow】`** 前缀的扁化摘要（`page.tsx`），便于下一轮模型理解。

---

## 五、缺陷记录模板

| 用例 ID | 学习计划对应 | 复现步骤 | 实际结果 | `workflow.steps` / 日志摘要 |
|---------|----------------|----------|----------|-----------------------------|
| | | | | |

---

## 六、说明

- **第14天主验收** = **§2**；附录仅为工程完整性。  
- LLM 输出有波动：**结构字段**（`dependsOn`、`injectedContextPreview`、`type: "workflow"`、`finalSummary` 存在且连贯）优先于措辞。  
- 实现细节以 `route.ts` 中 `executeWorkflow`（显式依赖 vs 线性兜底）、`synthesizeWorkflowResult` 为准。
