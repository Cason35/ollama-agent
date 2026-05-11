# 第15天 Workflow 功能 — 手动测试用例

本文档用于在 **`ollama-chat-day15`** 中回归验证：**Validator、Auto Repair、DAG 拓扑执行、步骤 Retry、Execution Timeline**。默认通过 **Web UI** 操作；部分场景需看 **服务端终端日志** 或 **浏览器开发者工具 Network**。

---

## 1. 测试环境与前置条件

| 项 | 说明 |
|----|------|
| 项目目录 | `ollama-chat-day15` |
| 启动 | `npm run dev`（或你当前使用的启动命令） |
| 模型 | **本地 Ollama** 或 **小米 MiMo** 均可；Planner/执行依赖模型质量，失败时可换模型重试 |
| Workflow 开关 | 页面勾选 **「多步 Workflow」** |
| 记录方式 | 建议边测边在下方「测试记录表」打勾；Timeline 可截图留存 |

---

## 2. 通用操作

1. 打开 Day 15 页面（标题含 **Workflow Validator · Repair · Retry · Timeline**）。
2. 勾选 **多步 Workflow**。
3. 在输入框发送用例中的 **用户话术**。
4. 在对话区找到 **Workflow** 卡片，展开查看：**步骤列表**、**依赖关系**、**Execution Timeline**、**最终结果**。
5. （可选）打开浏览器 **Network**，选中 `POST .../api/chat`，在 Response 中查看 `workflow.executionTimeline`、`workflow.steps[].status` 等 JSON。

---

## 3. 功能用例列表

### 3.1 Timeline 与校验管道（Happy Path）

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-01** | 首轮校验通过时 Timeline 完整 | 勾选 Workflow，发送：`帮我想一个三步计划：先简单聊天介绍一下你自己，然后总结一下「人工智能」是什么，最后给我列两个待办事项。` | 卡片底部出现 **Execution Timeline**。时间线中应包含类似：**「前置静态校验 validateWorkflow 开始」**、**「首轮校验通过（跳过 repairWorkflow）」**、**「校验通过：topologicalSort 预览序 …」**（含 `→` 连接的 step id）、**「执行器 executeWorkflow 启动」**；随后各步有 **started**，成功步有 **success** 语义（具体文案以后端为准）。 |
| **TC-02** | 各步执行顺序可读 | 同 TC-01 或任意多步成功用例 | Timeline 中 **topologicalSort 预览序** 与步骤 **依赖关系**一致：被依赖的步骤 id 出现在依赖方之前（无环 DAG）。 |

---

### 3.2 Auto Repair（启发式补依赖 · summary → todo）

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-03** | 触发「todo 漏写 dependsOn」时的修复路径 | 先随便聊 1～2 轮（让短期记忆有内容），再勾选 Workflow，发送：`请先总结我们刚才的对话要点，再根据总结生成 3 条待办。` | 若 Planner **未**给 todo 写 `dependsOn`，Repair 会尝试把 todo **挂到最近一次 summary**。预期：**仍能跑通**；步骤详情里 todo 步可出现 **「依赖」** 指向 summary 步骤；或 Timeline 出现 **「校验失败，进入 repairWorkflow」**（若首轮因悬空依赖等失败）后再执行成功。 |
| **TC-04** | 纯 todo（无前置 summary）不强行乱连 | 新会话或清空记忆后，勾选 Workflow，发送：`只帮我生成 2 条待办：喝水、散步。不要总结。` | 工作流应 **合法执行**；todo **不应**被错误地依赖一个不存在的 summary（启发式仅在「前面出现过 summary 且 todo 无依赖」时补边）。 |

---

### 3.3 天气与隐式依赖 / Retry 观察

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-05** | weather 步骤纳入 Workflow | 勾选 Workflow，发送：`第一步查北京天气，第二步根据天气给一句穿衣建议（普通聊天即可）。` | 至少一步为天气相关执行；整体 **Workflow 成功或部分失败**时，Timeline 中仍有阶段打点；最终 **最终结果** 可读。 |
| **TC-06** | Retry（偶发失败时） | 在网络较差环境重复 TC-05；或暂时拔网线再快速恢复（慎用） | 若某步失败后会自动重试，Timeline 出现 **`步骤 xxx retry #1`**（或 #2）；服务端控制台出现 **`[Workflow] step retry`** 日志。若环境稳定可能 **看不到** retry，记为 **N/A** 即可。 |

---

### 3.4 DAG 顺序（非数组顺序）

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-07** | 依赖决定执行序 | 勾选 Workflow，发送：`请规划三个步骤：步骤 A 聊天说一句你好；步骤 B 总结「机器学习」一句话；步骤 C 必须基于步骤 B 的总结生成待办。请严格让待办步骤依赖总结步骤。` | 在 **Execution Timeline** 的拓扑预览中：**总结对应的 step id 应在待办 step id 左侧（先执行）**；实际步骤状态中 summary 应先于 todo 完成（允许模型 Planner 命名不同，以 id 与依赖为准）。 |

---

### 3.5 Repair 路径在 Timeline 中的可见性

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-08** | 校验失败 → Repair → 二次校验 | 使用容易让 Planner 产出「小问题」的复杂指令（例如 TC-03），多试几次不同模型 | **若**首轮 `validateWorkflow` 失败：Timeline 含 **`校验失败，进入 repairWorkflow`**，且含 **`repairWorkflow 已运行，正在进行二次校验`**，之后 **不应**再出现 **「校验仍失败，拒绝执行」**（否则用例失败）。**若**首轮即通过：应看到 **「首轮校验通过（跳过 repairWorkflow）」**（TC-01 已覆盖）。 |

---

### 3.6 校验失败短路（进阶）

Planner 多数情况下会产出可修复结构，**纯 UI 很难稳定触发「修复后仍非法」**。需要验证「拒绝执行 + 分条错误」时可用下列方式之一：

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-09** | `validateWorkflow` 最终失败时的响应 | **方式 A**：临时在 `route.ts` 中于 `repairWorkflow` 之后注入非法步骤（例如某步 `action: "invalid"`）再跑 Workflow；**方式 B**：写 Vitest/Node 单测直接调用 `validateWorkflow`（若你已抽出模块）。测完 **务必还原代码**。 | API 返回 `type: "workflow"` 且 `workflow.status === "failed"`；**无任何步骤进入 success**；`finalSummary` 含 **分条校验错误**；`executionTimeline` 含 **「校验仍失败，拒绝执行」** 类描述。 |

---

### 3.7 前端与类型字段

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-10** | `retry` 展示（若 Planner 返回） | 若后端/Planner 某步带 `retry: 0` 或 `retry: 2`，观察步骤详情 | UI 中步骤信息展示 **retry** 数值（与 `page.tsx` 一致）。若模型从不返回该字段，本项记 **N/A**。 |

---

## 4. 负面与边界（可选）

| 编号 | 目的 | 操作步骤 | 预期结果 |
|------|------|----------|----------|
| **TC-11** | 关闭 Workflow 仍走单步路由 | **取消勾选** 多步 Workflow，发送天气/总结类请求 | 返回类型为 **weather / summary / todo / chat**，**不出现** Workflow 大卡片与 Execution Timeline。 |
| **TC-12** | 极短请求 | 勾选 Workflow，发送：`好` | 可能退化为单步或简单计划；**不应**导致服务端 500；若有 Workflow，Timeline 仍应合理收尾。 |

---

## 5. 测试记录表（可复制勾选）

| 编号 | 结果（通过 / 失败 / N/A） | 备注 |
|------|---------------------------|------|
| TC-01 | | |
| TC-02 | | |
| TC-03 | | |
| TC-04 | | |
| TC-05 | | |
| TC-06 | | |
| TC-07 | | |
| TC-08 | | |
| TC-09 | | |
| TC-10 | | |
| TC-11 | | |
| TC-12 | | |

---

## 6. 失败时建议排查顺序

1. **Timeline 是否为空**：检查响应 JSON 是否含 `executionTimeline`；Network 是否 200。  
2. **Planner 乱套**：换模型、缩短用户话术、明确写出「第一步…第二步…」。  
3. **Retry 看不到**：属正常（环境稳定）；以 TC-06 说明为准。  
4. **校验一直失败**：看 `finalSummary` 分条错误与 Timeline 最后几条，对照 `day15_learning_summary.md` 中校验项。

---

*与实现细节对照：`app/api/chat/route.ts`（`validateWorkflow`、`repairWorkflow`、`topologicalSort`、`executeWorkflow`）、`app/page.tsx`（Execution Timeline 渲染）。*
