# Day 37 学习总结：Queue Runtime V7（队列运行时 V7）与 Workflow as Job（把工作流作为任务）

本文档记录 `ollama-chat-day37` 项目做了什么、运用了什么知识、相比 `ollama-chat-day36` 有什么改进、为什么这样设计，并整理本次关于并行执行层级的学习对话。

---

## 1. 项目做了什么

`ollama-chat-day37` 是在 `ollama-chat-day36` 的 Queue Runtime V6（队列运行时 V6）基础上继续升级的本地 AI Agent（智能体）聊天系统。

day36 的重点是：

```text
Queue Runtime V6（队列运行时 V6）
= Cancellation（取消）
+ Timeout（超时）
+ Graceful Shutdown（优雅关闭）
+ Lifecycle Control（生命周期控制）
```

day37 的重点是：

```text
Queue Runtime V7（队列运行时 V7）
= Workflow as Job（把工作流作为任务）
+ Worker executes Workflow（工作进程执行工作流）
+ Job ↔ Workflow linkage（任务与工作流双向关联）
+ Unified Timeline（统一时间线）
+ Restart as New Job（克隆为新任务重启）
```

一句话理解：

```text
day36 解决“任务跑起来之后，怎么安全地取消、超时、关闭”；
day37 解决“复杂 Workflow（工作流）怎么交给 Queue（队列）和 Worker（工作进程）异步执行”。
```

项目仍然保留聊天、Workflow（工作流）、RAG（Retrieval-Augmented Generation，检索增强生成）、Knowledge Store（知识库存储）、Vector Store（向量存储）、Tool Registry（工具注册表）、Queue Dashboard（队列看板）等能力。

day37 的核心变化是：聊天接口不再直接同步执行 Workflow（工作流），而是创建一个 `type: "workflow"` 的 Job（任务），交给 Queue Runtime（队列运行时）调度，再由 Worker（工作进程）异步执行。

---

## 2. 核心执行链路

用户输入问题后，day37 的主流程是：

```text
用户输入 x
  ↓
POST /api/chat
  ↓
planWorkflowSteps 调用模型，把 x 规划成多个 Workflow steps（工作流步骤）
  ↓
validateWorkflow / topologicalSort 校验 DAG（有向无环图）
  ↓
创建 WorkflowJob（工作流任务）
  ↓
Queue Runtime（队列运行时）入队
  ↓
Worker（工作进程）认领 Job（任务）
  ↓
Worker 调用 executeWorkflow 执行步骤
  ↓
Job result（任务结果）写入 workflow 与 finalSummary
  ↓
前端轮询 /api/queue
  ↓
发现任务跑完后，把聊天气泡从 queued（已入队）状态替换为最终结果
```

需要注意：`/api/chat` 是 `POST` 请求，不是 `GET` 请求。因为它要提交用户消息、memory（记忆）、模型配置、Workflow 开关等请求体。

---

## 3. 关键文件

- `app/api/chat/route.ts`：聊天请求入口。负责规划 Workflow（工作流）、校验 DAG（有向无环图）、创建 WorkflowJob（工作流任务），然后立即返回 jobId。
- `lib/queue/queue-types.ts`：定义 Job（任务）、WorkflowJobPayload（工作流任务载荷）、JobTimelineItem（任务时间线条目）等类型。
- `lib/queue/queue-runtime.ts`：Queue Runtime（队列运行时）。负责任务入队、重新入队、克隆重启、取消、读取快照。
- `lib/queue/worker.ts`：Worker（工作进程）。真正认领 Job（任务），并在 workflow job（工作流任务）场景下调用 `executeWorkflow`。
- `app/page.tsx`：前端主页面。轮询 Queue（队列）结果，并把完成后的 Workflow（工作流）结果同步回聊天气泡。
- `app/components/QueueDashboard.tsx`：Queue Dashboard（队列看板）。展示 Job（任务）、Workflow（工作流）、WorkerPool（工作进程池）、Timeline（时间线）等状态。

---

## 4. 运用了什么知识

### 4.1 Queue（队列）

Queue（队列）负责把任务排起来，避免所有任务同时执行。

它解决的是：

```text
任务很多时，谁先执行？
哪些任务要等待？
哪些任务被资源或速率限制挡住？
```

### 4.2 WorkerPool（工作进程池）

WorkerPool（工作进程池）里有多个 Worker（工作进程）。每个 Worker 会轮询 Queue（队列），空闲时认领一个 Job（任务）执行。

它解决的是：

```text
多个用户同时提交任务时，系统如何并发处理？
```

### 4.3 WorkflowJob（工作流任务）

day37 新增了 WorkflowJob（工作流任务）的概念。

`type: "workflow"` 的 Job（任务）不再只是模拟任务，而是携带完整的 WorkflowJobPayload（工作流任务载荷）：

```text
workflowId（工作流 ID）
workflow（完整工作流快照）
memory（记忆快照）
provider（模型提供方）
mimoModel（MiMo 模型 ID）
```

这样 Worker（工作进程）即使脱离原始 HTTP 请求，也能恢复执行所需上下文。

### 4.4 DAG（Directed Acyclic Graph，有向无环图）

Workflow（工作流）的步骤之间可能有依赖关系。

例如：

```text
step-1：查询天气
step-2：检索知识库
step-3：汇总答案，依赖 step-1 和 step-2
```

DAG（有向无环图）用来表达“哪些步骤可以先跑，哪些步骤必须等待前置步骤完成”。

### 4.5 topologicalSort（拓扑排序）

topologicalSort（拓扑排序）用于根据依赖关系排出一个合法执行顺序。

它可以检查：

```text
有没有循环依赖？
某个步骤是否依赖不存在的步骤？
哪些步骤可以放到同一个并行批次里？
```

### 4.6 Retry Policy（重试策略）

任务失败后不一定马上放弃。Retry Policy（重试策略）会根据 `maxAttempts`（最大尝试次数）和 backoff（退避策略）决定是否重试。

day37 继承了 day36 的 exponential backoff（指数退避），即失败次数越多，下一次重试等待越久。

### 4.7 Timeout（超时）

Timeout（超时）用于避免某个 Job（任务）一直卡住。

Worker（工作进程）会用超时包装器执行任务，如果超过 `timeoutMs`，任务就进入 retrying（等待重试）或 timeout（已超时）状态。

### 4.8 Cooperative Cancellation（协作式取消）

JavaScript 不能安全强杀一个正在执行的 Promise（异步任务），所以 day37 继承 day36 的 Cooperative Cancellation（协作式取消）。

核心思路是：

```text
用户点击 Cancel（取消）
  ↓
Job 状态变成 cancelling（取消中）
  ↓
Worker 定期检查任务是否被取消
  ↓
如果检测到取消请求，就主动退出
  ↓
Job 状态变成 cancelled（已取消）
```

### 4.9 Unified Timeline（统一时间线）

day37 在 Job Timeline（任务时间线）中新增了和 Workflow（工作流）相关的节点：

```text
WorkflowQueued（工作流已入队）
WorkflowStarted（工作流开始执行）
WorkflowPaused（工作流暂停）
WorkflowSuccess（工作流成功）
WorkflowFailed（工作流失败）
WorkflowCancelled（工作流取消）
```

这样可以从一个 Job（任务）看到完整的 Job -> Workflow -> Step（任务 -> 工作流 -> 步骤）执行链路。

---

## 5. 相比 day36 的改进

### 5.1 从同步执行 Workflow 到异步执行 WorkflowJob

day36 中，聊天接口会在请求里直接调用 `executeWorkflow`，直到工作流执行完成、失败或暂停。

day37 改为：

```text
聊天接口只负责规划、校验和入队；
真正执行交给 Worker（工作进程）。
```

这样设计的原因：

```text
复杂 AI Workflow（工作流）可能运行很久；
同步 HTTP 请求容易超时；
用户体验也不好；
异步 Job（任务）更适合真实生产系统。
```

### 5.2 Job（任务）和 Workflow（工作流）双向关联

day37 中：

```text
Job 增加 workflowId；
Workflow 增加 jobId。
```

这样设计的原因：

```text
聊天气泡能知道自己对应哪个 Job；
Queue Dashboard（队列看板）能知道 Job 对应哪个 Workflow；
调试和观察更清楚。
```

### 5.3 Workflow Status（工作流状态）更完整

day37 的 Workflow（工作流）状态新增：

```text
queued（已入队）
paused（已暂停）
```

这样设计的原因：

```text
queued 表示 Workflow 已经交给 Queue，但还没被 Worker 执行；
paused 表示 Workflow 进入 HITL（Human-in-the-loop，人在回路/人工确认）等待用户确认。
```

### 5.4 Worker（工作进程）真正支持 workflow job（工作流任务）

day36 中，workflow 类型的 Job 更像一个模拟任务。

day37 中，Worker 会识别 `job.type === "workflow"`，并调用 `executeWorkflow` 真正执行 Workflow（工作流）。

这样设计的原因：

```text
Queue Runtime（队列运行时）不再只是演示后台任务；
它开始真正接管 AI Workflow（智能体工作流）的运行。
```

### 5.5 Restart as New Job（克隆为新任务重启）

day36 支持 Requeue（重新入队），即同一个 Job ID 回到队列。

day37 新增 Restart as New Job（克隆为新任务重启），即从旧任务克隆一个新任务，并生成新的 Job ID。

这样设计的原因：

```text
旧 Job 的失败历史保持不变；
新 Job 重新开始；
调试时不会丢失旧任务证据。
```

---

## 6. 学习对话记录

### 6.1 关于项目主线的理解

我的提问：

```text
带我来读懂ollama-chat-day37这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day36有什么改进，为什么这样子做（对于一些英文专业术语后面补充一个括号补充一个中文描述）
```

回答整理：

```text
ollama-chat-day37 的核心是把 Workflow（工作流）从“请求内同步执行”升级成“Queue（队列）里的 Job（任务）异步执行”。

它仍然是一个本地 AI Agent（智能体）聊天系统，包含聊天、Workflow（工作流）、RAG（检索增强生成）、Knowledge Store（知识库存储）、Vector Store（向量存储）、Tool Registry（工具注册表）和 Queue Dashboard（队列看板）。

相比 day36，day37 最大的变化是：

1. Workflow（工作流）不再直接在 /api/chat 请求中执行。
2. Workflow（工作流）会被打包为 WorkflowJob（工作流任务）。
3. Worker（工作进程）认领 workflow job（工作流任务）后调用 executeWorkflow 执行 DAG（有向无环图）步骤。
4. 前端通过轮询 Queue（队列）同步最终结果。
5. Job（任务）和 Workflow（工作流）之间有 workflowId 与 jobId 双向关联。
6. Queue Dashboard（队列看板）展示 Unified Timeline（统一时间线）。
```

### 6.2 关于 WorkflowJob 流程的理解

我的理解：

```text
day37里面用户输入问题x，调用接口get:/api/chat，接口先把用户的问题x通过函数planWorkflowSteps调用模型，将x解析为几个步骤，然后将其列为一个job，接口返回job对应的id，前端再不断轮询 Queue，若该任务跑完则在这显示结果，前端再把结果替换掉；
有个问题，用户A,用户B同时问问题，通过两个woker，并行处理他们的问题，而他们各自的问题通过DAG，也出现可以并行调用工具的情况，这两个并行的原理是一样的吗？
```

回答整理：

```text
整体理解是对的，但有两个细节需要修正：

1. /api/chat 是 POST 请求，不是 GET 请求。
   因为它要提交用户消息、memory（记忆）、模型配置、Workflow 开关等请求体。

2. planWorkflowSteps 规划完成后，不是把用户问题直接列为一个 Job，而是把完整 Workflow（工作流）快照、memory（记忆）快照、provider（模型提供方）等打包成 WorkflowJobPayload（工作流任务载荷），再创建一个 type: "workflow" 的 Job（任务）。
```

更准确的流程是：

```text
用户输入 x
  ↓
POST /api/chat
  ↓
planWorkflowSteps 调模型，把 x 规划成多个 Workflow steps（工作流步骤）
  ↓
validateWorkflow / topologicalSort 校验 DAG（有向无环图）
  ↓
创建 workflow job（工作流任务），返回 jobId
  ↓
Worker（工作进程）从 Queue（队列）里认领 job
  ↓
Worker 调 executeWorkflow
  ↓
executeWorkflow 内部按 DAG（有向无环图）依赖执行 steps（步骤）
  ↓
前端轮询 /api/queue
  ↓
发现 job.result 里有 workflow 和 finalSummary
  ↓
把原来的聊天气泡从 queued（已入队）状态替换成最终结果
```

### 6.3 关于两种并行的区别

问题：

```text
用户A、用户B同时问问题，通过两个 Worker（工作进程）并行处理他们的问题；而他们各自的问题通过 DAG（有向无环图），也出现可以并行调用工具的情况。这两个并行的原理是一样的吗？
```

回答整理：

```text
不是完全一样。它们都是“并行”，但属于两个不同层级。
```

第一层是 Job-level parallelism（任务级并行）：

```text
用户 A 的 WorkflowJob（工作流任务）
用户 B 的 WorkflowJob（工作流任务）
```

这两个 Job（任务）被 Queue（队列）管理，由 WorkerPool（工作进程池）里的不同 Worker（工作进程）认领。

例如：

```text
Worker-1 处理用户 A 的任务
Worker-2 处理用户 B 的任务
```

这一层关注的是：

```text
多个任务之间怎么调度？
哪个任务先执行？
有多少 Worker 可以同时工作？
资源和速率是否允许执行？
```

它受这些机制控制：

```text
Worker 数量
Job priority（任务优先级）
Resource Limiter（资源限制器）
Rate Limit（速率限制）
Timeout（超时）
Cancel（取消）
```

第二层是 Step-level parallelism（步骤级并行）：

同一个 Workflow（工作流）内部，如果多个 Step（步骤）之间没有依赖关系，就可以并行执行。

例如用户问：

```text
帮我查北京天气，再总结知识库里的 Vue 新特性
```

模型可能规划为：

```text
step-1：查询北京天气
step-2：检索并总结 Vue 新特性
```

如果 step-1 和 step-2 没有依赖关系，`executeWorkflow` 可以把它们放在同一个 DAG batch（有向无环图批次）里并行执行。

这一层关注的是：

```text
同一个工作流内部，哪些步骤可以同时跑？
哪些步骤必须等前置步骤成功？
```

它受 DAG dependency（有向无环图依赖关系）控制：

```text
无依赖：可以并行
有依赖：必须等待前置步骤完成
```

两者区别可以概括为：

```text
WorkerPool（工作进程池）并行的是 Job（任务）。
DAG（有向无环图）并行的是 Step（步骤）。
```

更形象地说：

```text
WorkerPool 像有多个员工：
  员工 1 处理用户 A 的任务
  员工 2 处理用户 B 的任务
  员工 3 处理用户 C 的任务

DAG 并行像某个员工接到一个复杂任务后：
  同时查天气
  同时检索知识库
  同时生成待办
  最后再汇总
```

最终可能出现这种结构：

```text
Worker-1
  └─ 用户 A 的 WorkflowJob（工作流任务）
       ├─ step A1 并行
       ├─ step A2 并行
       └─ step A3 等 A1/A2 完成后执行

Worker-2
  └─ 用户 B 的 WorkflowJob（工作流任务）
       ├─ step B1 并行
       └─ step B2 并行
```

这里的关键结论是：

```text
外层并行：多个 Worker（工作进程）并行处理多个 Job（任务）。
内层并行：一个 Worker（工作进程）执行某个 WorkflowJob（工作流任务）时，Workflow（工作流）内部用 DAG（有向无环图）并行执行多个无依赖 Step（步骤）。
```

---

## 7. 第37天打卡

【第37天打卡】

1. 是否新增 WorkflowJob（工作流任务）：是

2. Workflow（工作流）是否改为 Job 驱动：是

3. Worker（工作进程）是否支持 workflow job（工作流任务）：是

4. 是否同步 Workflow Status（工作流状态）：是

5. Job（任务）是否关联 Workflow（工作流）：是

6. Dashboard（看板）是否展示 Job ↔ Workflow（任务与工作流双向关联）：是

7. 是否实现 Unified Timeline（统一时间线）：是

8. 是否支持 Workflow Cancel（工作流取消）：是

9. 是否支持 Workflow Retry（工作流重试）：是

10. 是否完成完整链路测试（End-to-End Test，端到端测试）：是

11. 遇到的最大问题：

```text
最大的问题是要区分两层“并行”：

第一层是 Job-level parallelism（任务级并行），由 Queue（队列）、WorkerPool（工作进程池）和 Worker（工作进程）控制，用来同时处理多个用户或多个任务。

第二层是 Step-level parallelism（步骤级并行），由 DAG（有向无环图）和 executeWorkflow 控制，用来并行执行同一个 Workflow（工作流）内部没有依赖关系的步骤。

另一个容易混淆的问题是：/api/chat 不再等待 Workflow（工作流）执行完成，而是只负责创建 WorkflowJob（工作流任务）并返回 jobId，最终结果由前端轮询 Queue（队列）后同步回来。
```

12. 当前系统能力：

```text
当前系统已经可以把用户输入规划为 Workflow（工作流），校验 DAG（有向无环图），再把 Workflow（工作流）打包成 WorkflowJob（工作流任务）交给 Queue Runtime V7（队列运行时 V7）。

WorkerPool（工作进程池）可以并行认领多个 Job（任务），Worker（工作进程）可以真正执行 workflow job（工作流任务），并在执行过程中继承 day36 的 Retry（重试）、Timeout（超时）、Cancel（取消）、Resource Limit（资源限制）和 Rate Limit（速率限制）能力。

前端 Queue Dashboard（队列看板）可以展示 Job（任务）与 Workflow（工作流）的双向关联，以及 Unified Timeline（统一时间线）。聊天气泡也能通过轮询 Queue（队列）同步 Worker（工作进程）产出的 Workflow（工作流）最终结果。

整体上，系统已经从“请求内同步执行工作流”升级为“可排队、可取消、可重试、可观察、可恢复的后台工作流执行系统”。
```

---

## 8. 今日结论

day37 最重要的工程思想是：

```text
让 AI Workflow（智能体工作流）从同步请求逻辑，升级为 Queue（队列）驱动的异步后台任务。
```

这样系统就不只是“能回答问题”，而是开始具备真实工程系统需要的能力：

```text
可调度
可并发
可取消
可超时
可重试
可观察
可恢复
```

理解 day37 时，最关键的是分清两层并行：

```text
WorkerPool（工作进程池）负责 Job（任务）级并行；
DAG（有向无环图）负责 Workflow Step（工作流步骤）级并行。
```

---

## 9. 第37天里程碑总结

第 37 天完成的是：

```text
Agent Execution Platform V1（智能体执行平台第 1 版）
```

这是整个学习路线里的一个重要里程碑。

从 Day 1 到 Day 36，系统一直在逐步构建几个相对独立的子系统：

- Chat Runtime（聊天运行时）
- Memory Runtime（记忆运行时）
- Workflow Runtime（工作流运行时）
- Tool Runtime（工具运行时）
- RAG Runtime（Retrieval-Augmented Generation Runtime，检索增强生成运行时）
- Knowledge Runtime（知识库运行时）
- Queue Runtime（队列运行时）

而 Day 37 的质变是把这些能力正式贯通：

```text
Workflow（工作流）
↓
Job（任务）
↓
Queue（队列）
↓
Worker（工作进程）
↓
Execution（执行）
```

也就是说，系统不再只是拥有多个零散模块，而是开始形成完整的 Agent Execution Platform（智能体执行平台）。

现在系统已经具备三层能力。

第一层是 Agent Runtime（智能体运行时）：

- Chat（聊天）
- Memory（记忆）
- Tools（工具）
- Workflow（工作流）
- RAG（Retrieval-Augmented Generation，检索增强生成）

第二层是 Agent Infrastructure（智能体基础设施）：

- Queue（队列）
- WorkerPool（工作进程池）
- Retry（重试）
- Priority（优先级）
- RateLimit（速率限制）
- Lifecycle（生命周期）

第三层是 Agent Platform（智能体平台）：

- WorkflowJob（工作流任务）
- Unified Timeline（统一时间线）
- Workflow Retry（工作流重试）
- Workflow Cancel（工作流取消）
- Job ↔ Workflow Mapping（任务与工作流映射）

这一步完成以后，项目的性质已经发生变化：

```text
以前是在写 Agent Demo（智能体演示项目）；
现在是在写 Agent Platform（智能体平台）。
```

---

## 10. 当前进度

如果按照完整 Agent Engineer（智能体工程师）路线来看，当前进度可以理解为：

```text
Agent Foundation（智能体基础）           ██████████ 100%
Workflow Runtime（工作流运行时）         ██████████ 100%
Tool Ecosystem（工具生态）              █████████░  95%
RAG Runtime（检索增强生成运行时）        ██████████ 100%
Knowledge Infrastructure（知识基础设施） █████████░  90%

Queue Runtime（队列运行时）              ██████████ 100%

Agent Execution Platform（智能体执行平台） ████████░░  80%

Multi-Agent（多智能体）                  ░░░░░░░░░░   0%
Production Infra（生产基础设施）          ░░░░░░░░░░   0%
```

整体进度大约来到：

```text
75% 左右
```

这意味着基础能力已经很扎实，接下来会从“一个 Agent（智能体）做所有事”进入“多个 Agent（智能体）分工协作”的阶段。

---

## 11. 第38天学习计划：Multi-Agent Runtime V1（多智能体运行时第 1 版）

第 38 天的主题是：

```text
Multi-Agent Runtime V1（多智能体运行时第 1 版）：Agent Registry（智能体注册表）
```

### 11.1 为什么现在开始 Multi-Agent（多智能体）

因为系统已经拥有：

- Workflow（工作流）
- Queue（队列）
- Worker（工作进程）
- Tool（工具）
- RAG（Retrieval-Augmented Generation，检索增强生成）

这些都是 Agent（智能体）的基础设施。

所以现在终于可以开始做：

```text
Agent 管 Agent（智能体管理智能体）
```

也就是从：

```text
一个 Agent（智能体）什么都干
```

升级为：

```text
多个 Agent（智能体）各司其职
```

### 11.2 最终效果

用户输入：

```text
帮我研究 LangGraph
```

系统可以拆给不同 Agent（智能体）：

```text
Research Agent（研究智能体）
↓
收集资料

Planner Agent（规划智能体）
↓
制定学习计划

Critic Agent（审查智能体）
↓
检查计划

Writer Agent（写作智能体）
↓
输出结果
```

第 38 天先不做复杂协作，只做 Agent Registry（智能体注册表）和单 Agent（单智能体）执行。

---

## 12. 第38天任务拆解

### 12.1 任务 1：定义 Agent（智能体）

新增类型：

```ts
type Agent = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  systemPrompt: string;
  tools: string[];
};
```

示例：

```ts
const researchAgent: Agent = {
  id: "research",
  name: "Research Agent",
  description: "负责检索、RAG 和资料整理",
  capabilities: ["research", "search", "rag"],
  systemPrompt: "你是一个研究型 Agent，负责收集、检索和整理资料。",
  tools: ["retrieval", "ragAnswer", "summary"],
};
```

### 12.2 任务 2：实现 AgentRegistry（智能体注册表）

新增类：

```ts
class AgentRegistry {
  register(agent: Agent): void;
  get(id: string): Agent | undefined;
  list(): Agent[];
  findByCapability(capability: string): Agent[];
}
```

支持：

```ts
registry.register(agent);
```

AgentRegistry（智能体注册表）的作用是集中管理所有 Agent（智能体），让系统可以根据 id（唯一标识）或 capability（能力）找到合适的 Agent（智能体）。

### 12.3 任务 3：创建 4 个 Agent（智能体）

先固定写死四个 Agent（智能体）。

Research Agent（研究智能体）：

```text
负责检索
负责 RAG（检索增强生成）
负责资料整理
```

Planner Agent（规划智能体）：

```text
负责计划
负责 Workflow（工作流）设计
```

Critic Agent（审查智能体）：

```text
负责审查
负责发现问题
```

Writer Agent（写作智能体）：

```text
负责输出
负责总结
```

### 12.4 任务 4：Agent Explorer（智能体浏览器）

新增页面或界面模块：

```text
Agent Explorer（智能体浏览器）
```

展示内容：

```text
Agent（智能体）
Capabilities（能力列表）
Tools（工具列表）
Prompt（提示词）
```

### 12.5 任务 5：Capability Search（能力搜索）

实现按能力搜索 Agent（智能体）：

```ts
findByCapability("research");
```

返回：

```text
Research Agent（研究智能体）
```

### 12.6 任务 6：Agent Metrics（智能体指标）

新增类型：

```ts
type AgentMetrics = {
  totalAgents: number;
  capabilityCount: number;
  toolCoverage: number;
};
```

Agent Metrics（智能体指标）用于观察系统里有多少 Agent（智能体）、覆盖了多少 capability（能力），以及 tools（工具）覆盖情况。

### 12.7 任务 7：Agent Context（智能体上下文）

定义：

```ts
type AgentContext = {
  memory: unknown;
  workflow: unknown;
  tools: unknown;
};
```

Agent Context（智能体上下文）用于保存 Agent（智能体）执行任务时需要的上下文。

后面所有 Agent（智能体）都会用到它。第 38 天先定义结构。

### 12.8 任务 8：Agent Executor（智能体执行器）

新增：

```ts
executeAgent(agentId, task);
```

第 38 天先不做 Agent collaboration（智能体协作）。

只做：

```text
单 Agent（单智能体）执行
```

### 12.9 任务 9：测试 Capability Routing（能力路由）

测试：

```text
research（研究）
```

是否路由到：

```text
Research Agent（研究智能体）
```

测试：

```text
plan（规划）
```

是否路由到：

```text
Planner Agent（规划智能体）
```

Capability Routing（能力路由）的意思是：系统根据任务需要的能力，自动找到最适合的 Agent（智能体）。

### 12.10 任务 10：为 Day39 做准备

新增：

```ts
type AgentTask = {
  id: string;
  goal: string;
};

type AgentResult = {
  output: string;
};
```

AgentTask（智能体任务）表示要交给 Agent（智能体）处理的目标。

AgentResult（智能体结果）表示 Agent（智能体）处理后的输出。

---

## 13. 第38天验收标准

1. 是否定义 Agent（智能体）
2. 是否实现 AgentRegistry（智能体注册表）
3. 是否创建 Research Agent（研究智能体）
4. 是否创建 Planner Agent（规划智能体）
5. 是否创建 Critic Agent（审查智能体）
6. 是否创建 Writer Agent（写作智能体）
7. 是否实现 Capability Search（能力搜索）
8. 是否实现 Agent Explorer（智能体浏览器）
9. 是否实现 executeAgent（执行智能体）
10. 是否完成 Capability Routing（能力路由）测试

---

## 14. 第38天打卡模板

【第38天打卡】

1. 是否定义 Agent（智能体）：是 / 否

2. 是否实现 AgentRegistry（智能体注册表）：是 / 否

3. 是否创建 Research Agent（研究智能体）：是 / 否

4. 是否创建 Planner Agent（规划智能体）：是 / 否

5. 是否创建 Critic Agent（审查智能体）：是 / 否

6. 是否创建 Writer Agent（写作智能体）：是 / 否

7. 是否实现 Capability Search（能力搜索）：是 / 否

8. 是否实现 Agent Explorer（智能体浏览器）：是 / 否

9. 是否实现 executeAgent（执行智能体）：是 / 否

10. 是否完成 Capability Routing（能力路由）测试：是 / 否

11. 遇到的最大问题：

```text
待填写。
```

12. 当前系统能力：

```text
待填写。
```

---

## 15. 第38天核心认知

记住一句话：

```text
Tool（工具）是能力，Agent（智能体）是能力的组织者。
```

以前是：

```text
User（用户）
↓
Tool（工具）
```

未来会变成：

```text
User（用户）
↓
Agent（智能体）
↓
Tool（工具）
```

完成第 38 天后，系统将正式进入：

```text
Multi-Agent Runtime（多智能体运行时）阶段
```

这是整个 Agent Engineer（智能体工程师）路线后半程真正有价值的部分：系统开始从“单智能体工具调用”走向“多智能体分工协作”。
