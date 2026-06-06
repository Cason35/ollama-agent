# Day 36 学习总结：Queue Runtime V6（队列运行时 V6）与 Lifecycle Control（生命周期控制）

本文档记录 `ollama-chat-day36` 项目做了什么、运用了什么知识、相比 `ollama-chat-day35` 有什么改进、为什么这样设计，并整理本次关于任务刷新、取消后重启的学习对话。

---

## 1. 项目做了什么

`ollama-chat-day36` 是在 `ollama-chat-day35` 的 Queue Runtime V5（队列运行时 V5）基础上继续升级的本地 AI Agent（智能体）聊天系统。

day35 的重点是：

```text
Queue Runtime V5（队列运行时 V5）
= Rate Limit（速率限制）
+ Resource Control（资源控制）
```

day36 的重点是：

```text
Queue Runtime V6（队列运行时 V6）
= Cancellation（取消）
+ Timeout（超时）
+ Graceful Shutdown（优雅关闭）
+ Lifecycle Control（生命周期控制）
```

一句话理解：

```text
day35 解决“任务怎么按资源和速率稳定地跑”；
day36 解决“任务跑起来之后，怎么安全地取消、超时、关闭”。
```

项目仍然保留了聊天、Workflow（工作流）、RAG（检索增强生成）、Knowledge Store（知识库存储）、Vector Store（向量存储）、Tool Registry（工具注册表）、Queue Dashboard（队列看板）等能力。

第36天新增的核心文件和能力主要集中在：

```text
lib/queue/queue-types.ts
lib/queue/queue-runtime.ts
lib/queue/queue-manager.ts
lib/queue/worker.ts
lib/queue/worker-pool.ts
app/api/queue/route.ts
app/components/QueueDashboard.tsx
```

---

## 2. 运用了什么知识

### 2.1 Job Status（任务状态）扩展

day36 在原有状态基础上新增：

```ts
type JobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "retrying"
  | "dead_letter"
  | "cancelling"
  | "cancelled"
  | "timeout";
```

新增状态含义：

```text
cancelling（取消中）：用户已经请求取消，但 Worker（工作进程）还在协作退出。
cancelled（已取消）：任务已经真正完成取消。
timeout（已超时）：任务超过最大尝试次数后最终超时。
```

这让任务状态从“执行结果状态”升级成了“生命周期状态”。

---

### 2.2 timeoutMs（超时毫秒数）与生命周期时间戳

Job（任务）新增字段：

```ts
timeoutMs?: number
cancelRequestedAt?: number
cancelledAt?: number
timeoutAt?: number
```

它们分别记录：

```text
timeoutMs（超时毫秒数）：任务允许执行多久。
cancelRequestedAt（取消请求时间）：用户什么时候请求取消。
cancelledAt（取消完成时间）：任务什么时候真正取消完成。
timeoutAt（超时发生时间）：任务什么时候发生超时。
```

这样系统不只是知道“任务失败了”，还能知道“为什么结束”和“什么时候结束”。

---

### 2.3 cancelJob（取消任务方法）

`QueueRuntime.cancelJob()` 负责处理取消任务。

规则是：

```text
queued / retrying（排队中 / 等待重试）：
  任务还没运行，直接改为 cancelled（已取消）。

running（运行中）：
  改成 cancelling（取消中），等待 Worker（工作进程）协作退出。

success / dead_letter / cancelled / timeout（成功 / 死信 / 已取消 / 已超时）：
  已经是终态，不允许取消。
```

这个设计避免了粗暴删除 running job（运行中任务）导致状态不一致。

---

### 2.4 Cooperative Cancellation（协作式取消）

JavaScript（脚本语言）里不能真正安全地强杀一个正在执行的 Promise（异步任务）。

所以 day36 用的是 Cooperative Cancellation（协作式取消）。

核心思路是：

```text
Worker（工作进程）给任务执行器传入 isCancelled（是否已取消）函数。
长任务定期检查 isCancelled。
如果发现任务已被请求取消，就抛出 JobCancelledError（任务已取消错误）。
```

取消不是失败，所以：

```text
JobCancelledError（任务已取消错误）不会触发 retry（重试）。
```

---

### 2.5 JobCancelledError（任务已取消错误）

day36 新增：

```ts
class JobCancelledError extends Error {
  constructor() {
    super("Job cancelled")
    this.name = "JobCancelledError"
  }
}
```

Worker（工作进程）捕获它之后，会把任务标记为：

```text
cancelled（已取消）
```

并且不会进入 retrying（等待重试）。

---

### 2.6 Timeout Wrapper（超时包装器）

day36 用 `Promise.race`（Promise 竞争）实现 Timeout Wrapper（超时包装器）：

```ts
await Promise.race([
  executeJob(job, ctx),
  timeout(job.timeoutMs)
])
```

如果任务超过 `timeoutMs`，系统抛出：

```text
JobTimeoutError（任务超时错误）
```

超时和取消不同：

```text
cancel（取消）：用户主动停止，不应该重试。
timeout（超时）：系统认为任务跑太久，通常属于可重试错误。
```

---

### 2.7 timeout 后的 retry（重试）策略

day36 的 timeout（超时）策略是：

```text
如果 attempts（尝试次数） < maxAttempts（最大尝试次数）：
  进入 retrying（等待重试）

否则：
  进入 timeout（最终超时）
```

所以一个超时任务不会立刻死掉，而是会先走已有的 retry / backoff（重试 / 退避）机制。

---

### 2.8 Graceful Shutdown（优雅关闭）

`WorkerPool.stopGracefully()` 做三件事：

```text
1. 停止认领新任务。
2. 等正在 running（运行中）的任务自然结束。
3. 超过 gracePeriod（宽限期）后，把仍未结束的任务恢复为 retrying（等待重试）。
```

这解决的是服务重启、关闭时的安全退出问题。

如果没有 Graceful Shutdown（优雅关闭），服务重启时 running job（运行中任务）可能会丢失、卡住，或者资源额度不释放。

---

### 2.9 Dashboard（看板）升级

Queue Dashboard（队列看板）从 V5 升级为 V6。

新增能力：

```text
Cancel（取消）按钮
Timeout Embedding Job（超时向量任务）按钮
Graceful Shutdown（优雅关闭）按钮
cancelled（已取消）指标
timeout（已超时）指标
Dead Letter / Timeout Jobs（死信 / 超时任务）区域
V6 Timeline（V6 时间线）
```

用户可以直接在页面上观察任务的生命周期变化。

---

## 3. 相比 day35 有什么改进

day35 的核心能力是：

```text
ResourceLimiter（资源限制器）
RateLimiter（速率限制器）
resourceType（资源类型）
blockedReason（阻塞原因）
Resource Usage（资源占用）
Rate Limit Metrics（速率限制指标）
```

它解决的是：

```text
任务能不能稳定地被调度？
某类资源会不会被打爆？
任务启动频率会不会太猛？
```

day36 在 day35 基础上新增：

```text
cancelling / cancelled / timeout 状态
timeoutMs（超时毫秒数）
cancelJob（取消任务方法）
cooperative cancellation（协作式取消）
JobCancelledError（任务已取消错误）
JobTimeoutError（任务超时错误）
timeout wrapper（超时包装器）
graceful shutdown（优雅关闭）
生命周期 Timeline（时间线）事件
```

对比表：

| 能力 | day35 | day36 |
|---|---|---|
| WorkerPool（工作池） | 有 | 保留 |
| ResourceLimiter（资源限制器） | 有 | 保留 |
| RateLimiter（速率限制器） | 有 | 保留 |
| blockedReason（阻塞原因） | 有 | 保留 |
| cancelJob（取消任务） | 无 | 新增 |
| running job cancelling（运行中任务取消中） | 无 | 新增 |
| timeoutMs（超时毫秒数） | 无 | 新增 |
| timeout wrapper（超时包装器） | 无 | 新增 |
| timeout 后 retry（超时后重试） | 无 | 新增 |
| cancelled（已取消）状态 | 无 | 新增 |
| Graceful Shutdown（优雅关闭） | 无 | 新增 |

一句话总结：

```text
day35 让队列“可控地跑”；
day36 让队列“可控地停”。
```

---

## 4. 为什么这样设计

真实系统里，任务系统不只是“能启动任务”就够了。

还需要处理这些场景：

```text
用户发现任务太慢，想取消。
任务卡住了，不能永远 running。
服务要重启，不能直接丢掉 running job。
外部模型、数据库、Embedding（向量嵌入）服务变慢，任务需要超时保护。
```

如果没有 day36 的能力，系统可能会出现：

```text
任务永远 running（运行中）。
Worker（工作进程）状态和 Job（任务）状态不一致。
资源额度不释放。
重启服务后任务丢失。
用户无法停止错误任务。
```

因此 day36 的核心认知是：

```text
任务系统不只要能启动任务，还要能安全停止任务。
```

---

## 5. 本次学习对话整理

### 问答 1：这个项目做了什么、用了什么知识、相比 day35 有什么改进、为什么这样做？

**我的问题：**

> 带我来读懂 ollama-chat-day36 这个文件夹中的项目做了什么，运用了什么知识，对比 ollama-chat-day35 有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day36` 本质上是在 day35 的基础上，把队列系统从“能稳定调度任务”升级成“能控制任务生命周期”。

一句话概括：

```text
day35 解决：任务怎么按资源和速率稳定地跑
day36 解决：任务跑起来之后，怎么安全地取消、超时、关闭
```

day36 新增了：

```text
Cancellation（取消）
Timeout（超时）
Graceful Shutdown（优雅关闭）
Lifecycle Control（生命周期控制）
```

新增的关键状态是：

```text
cancelling（取消中）
cancelled（已取消）
timeout（已超时）
```

新增的关键机制是：

```text
cancelJob（取消任务方法）
cooperative cancellation（协作式取消）
JobCancelledError（任务已取消错误）
JobTimeoutError（任务超时错误）
timeout wrapper（超时包装器）
stopGracefully（优雅关闭方法）
```

相比 day35，day36 不只是保护资源和速率，还开始保护任务生命周期。

---

### 问答 2：刷新窗口后 running 任务的进度会不会消失？

**我的问题：**

> 但是比如一个任务正在进行中，用户关闭了窗口或者刷新窗口，running 的项目的进度也会消失吧

**回答整理：**

这个判断是对的，但要分两层看。

第一层：后端任务不会因为用户刷新页面就自动停止。

WorkerPool（工作池）运行在 Next.js（React 服务端框架）服务端，任务状态也会持久化到 `.queue-data/jobs-v6.json`。用户关闭浏览器窗口，不等于后端 Worker（工作进程）停止。

第二层：前端展示会短暂丢失。

刷新页面后，React（前端 UI 框架）的内存状态会重置。页面重新挂载后，会通过轮询 `/api/queue` 重新读取 jobs（任务列表）、worker 状态、timeline（时间线）、metrics（指标）。

更关键的是：当前 day36 的“进度”不是百分比进度，而只是状态流：

```text
queued -> running -> success / retrying / cancelled / timeout
```

如果要真正恢复精细进度，例如：

```text
embedding（向量嵌入）任务已完成 60%
reindex（重建索引）已处理 42/100 chunks（文本块）
workflow（工作流）正在第 3 步
```

就需要给 Job（任务）增加持久化进度字段：

```ts
progress?: {
  percent: number
  currentStep?: string
  message?: string
  updatedAt: number
}
```

然后 Worker（工作进程）在执行长任务时定期 `store.update(job)`，前端刷新后从持久化数据中恢复进度。

所以结论是：

```text
当前 day36：刷新不会让任务本身消失，但会重建前端视图。
当前 day36：能恢复任务状态，但不能恢复精细进度。
下一步适合做 Persistent Progress（持久化进度）+ Job Logs（任务日志）。
```

---

### 问答 3：cancelled 的任务不在队列里，如何重新启动？

**我的问题：**

> 对于 cancelled 了的任务也不会出现在队列里面，那如何重新启动呢

**回答整理：**

当前 day36 的设计里：

```text
cancelled（已取消）是终态。
```

所以它不会再出现在可运行队列里，也不会被 Worker（工作进程）自动认领。

当前 Dashboard（看板）只给：

```text
dead_letter（死信）
timeout（已超时）
```

提供了 Requeue（重新入队），没有给 cancelled（已取消）提供重新启动入口。

如果要重新启动 cancelled（已取消）任务，通常有两种设计。

第一种：Requeue 原任务（原地重新入队）

```text
把同一个 job 从 cancelled 改回 queued。
清空 cancelRequestedAt、cancelledAt、workerId、lockedAt、nextRunAt。
```

优点：

```text
实现简单，保留同一个 jobId（任务 ID）。
```

缺点：

```text
历史语义不够干净，因为同一个 job 曾经 cancelled，又被改回 queued。
```

第二种：Clone Restart（克隆并重新启动）

```text
保留旧 cancelled job。
用旧任务的 type / payload / priority / timeoutMs / resourceType 创建一个新 job。
```

优点：

```text
语义更清晰。
旧任务保持 cancelled，新任务代表一次新的启动。
```

缺点：

```text
会生成新的 jobId。
```

更推荐第二种：

```text
cancelled job 不复活，而是 restart as new job（作为新任务重新启动）。
```

这样历史更清楚：

```text
job_a: cancelled
job_b: queued -> running -> success
```

如果继续增强，可以新增：

```text
restartJob（重新启动任务方法）
Restart（重新启动）按钮
```

规则可以是：

```text
cancelled / timeout / dead_letter 都可以 restart（重新启动）。
```

伪代码：

```ts
restartJob(jobId) {
  const old = await store.get(jobId)

  return enqueue({
    type: old.type,
    resourceType: old.resourceType,
    payload: old.payload,
    priority: old.priority,
    timeoutMs: old.timeoutMs,
    retryPolicy: {
      maxAttempts: old.maxAttempts
    }
  })
}
```

当前结论：

```text
当前 day36 里 cancelled 不能直接重新启动；
如果要重新启动，需要新增 restartJob，或者允许 cancelled 进入 requeue。
从系统设计上，更推荐 restartJob，而不是把 cancelled 原地改回 queued。
```

---

## 6. 第36天打卡

【第36天打卡】

1. Job 是否新增 cancelling / cancelled / timeout 状态：是
2. Job 是否支持 timeoutMs（超时毫秒数）：是

3. 是否实现 cancelJob（取消任务方法）：是
4. running job 是否支持 cancelling（取消中）：是

5. Worker 是否支持 cooperative cancellation（协作式取消）：是
6. 是否实现 JobCancelledError（任务已取消错误）：是

7. 是否实现 timeout wrapper（超时包装器）：是
8. timeout 后是否能 retry / dead_letter（重试 / 进入死信队列）：是

9. Dashboard 是否支持取消任务：是
10. 是否实现 graceful shutdown（优雅关闭）：是

11. 遇到的最大问题：

```text
第36天最大的理解难点是：取消、失败、超时这三件事不能混在一起处理。

cancelled（已取消）是用户主动停止，不应该 retry（重试）。
failed（失败）是业务执行报错，可以按 retryPolicy（重试策略）重试。
timeout（超时）是任务运行时间超过阈值，通常属于可重试错误，但如果超过 maxAttempts（最大尝试次数），就应该进入最终 timeout（已超时）状态。

另一个关键点是 JavaScript 不能安全地强杀 Promise（异步任务），所以只能做 cooperative cancellation（协作式取消）：任务执行器自己定期检查取消状态，然后主动退出。
```

12. 当前系统能力：

```text
Agent 基础（智能体基础）
+ Workflow Runtime（工作流运行时）
+ Tool Registry（工具注册表）
+ Tool Metrics（工具指标）
+ RAG Runtime V7（检索增强生成运行时 V7）
+ Knowledge Store（知识库存储）
+ Local Vector Store（本地向量存储）
+ Vector Explorer（向量浏览器）
+ Vector Metrics（向量指标）
+ Metadata Filter（元数据过滤）
+ Reindex Tool（重建索引工具）
+ Query Rewrite（查询改写）
+ Multi-Query Retrieval（多查询检索）
+ Hybrid Search（混合检索）
+ Rerank（重排序）
+ RAG Debug Panel（RAG 调试面板）
+ Workflow Timeline（工作流时间线）
+ Queue Runtime V1（队列运行时 V1）
+ Job（后台任务）
+ JobStore（任务存储）
+ QueueManager（队列管理器）
+ Worker（工作进程）
+ Queue Dashboard（队列看板）
+ Job Timeline（任务时间线）
+ Queue Metrics（队列指标）
+ Queue Runtime V2（队列运行时 V2）
+ Retry（重试）
+ Backoff（退避）
+ fixed / exponential backoff（固定 / 指数退避）
+ retrying（等待重试状态）
+ Dead Letter Queue（死信队列）
+ Manual Requeue（手动重新入队）
+ Queue Runtime V3（队列运行时 V3）
+ Priority Queue（优先级队列）
+ priority（优先级）
+ Scheduled Job（定时任务）
+ scheduledAt（计划执行时间）
+ Scheduler Timeline（调度时间线）
+ Queue Runtime V4（队列运行时 V4）
+ WorkerInfo（工作进程信息）
+ WorkerPool（工作池）
+ concurrency（并发数）
+ claimNextJob（认领下一个任务）
+ job lock（任务锁）
+ workerId（工作进程 ID）
+ lockedAt（锁定时间）
+ heartbeat（心跳）
+ stale lock recovery（过期锁恢复）
+ Queue Runtime V5（队列运行时 V5）
+ resourceType（资源类型）
+ ResourceLimiter（资源限制器）
+ RateLimiter（速率限制器）
+ inferResourceType（资源类型推断）
+ blockedReason（阻塞原因）
+ resource_limit（资源限制阻塞）
+ rate_limit（速率限制阻塞）
+ Resource Usage（资源占用）
+ Rate Limit Window（速率限制窗口）
+ Rate Limit Metrics（速率限制指标）
+ Queue Runtime V6（队列运行时 V6）
+ Lifecycle Control（生命周期控制）
+ cancelling（取消中）
+ cancelled（已取消）
+ timeout（已超时）
+ timeoutMs（超时毫秒数）
+ cancelRequestedAt（取消请求时间）
+ cancelledAt（取消完成时间）
+ timeoutAt（超时发生时间）
+ cancelJob（取消任务方法）
+ cooperative cancellation（协作式取消）
+ JobCancelledError（任务已取消错误）
+ JobTimeoutError（任务超时错误）
+ timeout wrapper（超时包装器）
+ Promise.race（Promise 竞争）
+ graceful shutdown（优雅关闭）
+ stopGracefully（优雅关闭方法）
+ GracefulShutdownStarted（优雅关闭开始事件）
+ WorkerStopped（工作进程停止事件）
```

---

## 7. 一句话总结

```text
day35 让队列学会“不要把系统跑爆”，
day36 让队列学会“任务该停的时候要安全地停”。
```

完成第36天后，系统已经从 Queue Runtime V5（资源与速率控制）升级为 Queue Runtime V6（生命周期控制）。

---

## 8. 第 36 天总结

你第 36 天完成的是：

```text
🔥 Queue Runtime V6（队列运行时 V6）：Lifecycle Control（生命周期控制）
```

这是 Queue（队列）系统非常重要的一层。

因为从今天开始，你的任务系统已经拥有：

**生命周期管理（Lifecycle Management，任务从创建到结束的全过程管控）**

```text
cancelJob（取消任务方法）
cancelling（取消中）
cancelled（已取消）
timeout（已超时）
timeout wrapper（超时包装器）
cooperative cancellation（协作式取消）
graceful shutdown（优雅关闭）
```

**健壮性（Robustness，系统在异常场景下仍能正确运行）**

```text
timeout → retry（超时后重试）
timeout → dead_letter（超时后进入死信队列）
worker 安全退出（Worker Safe Exit，工作进程关闭时不丢任务）
running job 安全中断（Running Job Safe Interrupt，运行中任务可被安全取消）
```

很多开源项目其实做到：

```text
Queue（队列）
↓
Worker（工作进程）
↓
Retry（重试）
```

就结束了。

而你已经开始做：

```text
Job Lifecycle Management（任务生命周期管理）
```

这其实已经开始接近：

```text
BullMQ（Node.js 任务队列库）
Temporal（分布式工作流引擎）
Prefect（数据/工作流编排平台）
Airflow（数据流水线调度平台）
```

里面比较高级的部分。

### 8.1 当前整体进度

如果按照 Agent Engineer（智能体工程师）完整路线：

```text
Agent Foundation（智能体基础）           ██████████ 100%
Workflow Runtime（工作流运行时）           ██████████ 100%
Tool Ecosystem（工具生态）             █████████░  90%
RAG Runtime（检索增强生成运行时）                ██████████ 100%
Knowledge Infrastructure（知识基础设施）   █████████░  90%

Queue Runtime（队列运行时）              █████████░  85%

Multi-Agent（多智能体）                ░░░░░░░░░░   0%
Production Infra（生产基础设施）           ░░░░░░░░░░   0%
```

你已经接近：

```text
🔥 Agent Platform Runtime（智能体平台运行时）完成阶段
```

---

## 9. 第 37 天学习计划：Queue Runtime V7（队列运行时 V7）：Workflow as Job（工作流即任务）

### 9.1 今日核心目标

今天是一个非常大的升级。

你要把：

```text
Workflow Runtime（工作流运行时）
```

和

```text
Queue Runtime（队列运行时）
```

正式整合。

### 9.2 为什么必须做这一步？

现在实际上：

**Workflow（工作流）** 负责：

```text
步骤（Step）
DAG（有向无环图，步骤依赖关系）
条件分支（Conditional Branch）
HITL（Human-in-the-Loop，人工介入）
```

**Queue（队列）** 负责：

```text
任务调度（Job Scheduling）
Retry（重试）
Priority（优先级）
RateLimit（速率限制）
Worker（工作进程）
```

但两者还是：

```text
两个系统
```

真实 Agent Platform（智能体平台）：

```text
Workflow（工作流）
↓
Job（后台任务）
↓
Queue（队列）
↓
Worker（工作进程）
```

### 9.3 目标架构

从：

```text
User（用户）
↓
WorkflowRuntime.execute()（工作流运行时直接执行）
```

升级为：

```text
User（用户）
↓
Create Workflow Job（创建工作流任务）
↓
Queue（队列）
↓
Worker（工作进程）
↓
Workflow Runtime（工作流运行时）
```

### 9.4 第 37 天最终效果

用户：

```text
帮我分析整个知识库
```

系统：

```text
Workflow Job Created（工作流任务已创建）

job_001
```

Worker（工作进程）：

```text
执行 workflow（工作流）
```

Dashboard（看板）：

```text
Job（任务）
↓
Workflow（工作流）
↓
Step（步骤）

全部可见。
```

### 9.5 任务清单

#### 任务 1：新增 WorkflowJob（工作流任务）

新增：

```ts
type WorkflowJobPayload = {
  workflowId: string  // 工作流 ID
}
```

Job（任务）：

```ts
{
  type: "workflow"  // 任务类型：工作流
}
```

#### 任务 2：Workflow Runtime（工作流运行时）不直接执行

之前：

```ts
workflowRuntime.execute(
  workflow
)
```

升级：

```ts
createWorkflowJob(
  workflow.id
)
```

然后：

```text
交给 Queue（队列）
```

#### 任务 3：Worker（工作进程）支持 workflow job（工作流任务）

新增：

```ts
case "workflow":
```

内部：

```ts
workflowRuntime.execute(
  workflowId
)
```

#### 任务 4：Workflow Status（工作流状态）同步

新增：

```ts
workflow.status  // 工作流状态
```

状态：

```text
queued（排队中）
running（运行中）
paused（已暂停）
success（成功）
failed（失败）
cancelled（已取消）
```

同步：

```text
Job Status（任务状态）
↔
Workflow Status（工作流状态）
```

#### 任务 5：Job 与 Workflow（工作流）关联

新增：

```ts
type Job = {
  workflowId?: string  // 可选：关联的工作流 ID
}
```

这样：

```text
Job（任务）
↓
Workflow（工作流）

可以互相跳转。
```

#### 任务 6：Workflow Dashboard（工作流看板）升级

展示：

```text
Workflow（工作流）
关联 Job（任务）
关联 Worker（工作进程）
关联 Timeline（时间线）
```

例如：

```text
Workflow（工作流）
  ↓

Job #123（任务 #123）

Worker #2（工作进程 #2）

Status（状态）:
running（运行中）
```

#### 任务 7：Workflow Timeline（工作流时间线）与 Job Timeline（任务时间线）合并

之前：

```text
Workflow Timeline（工作流时间线）
```

和

```text
Job Timeline（任务时间线）
```

分开。

升级：

```text
Unified Timeline（统一时间线）
```

例如：

```text
10:00 Job Created（任务已创建）

10:01 Worker Claimed（工作进程已认领）

10:02 Workflow Started（工作流已开始）

10:03 Step1 Success（步骤 1 成功）

10:04 Step2 Success（步骤 2 成功）

10:05 Workflow Success（工作流成功）

10:05 Job Success（任务成功）
```

#### 任务 8：Workflow Cancellation（工作流取消）

用户：

```text
取消 Workflow（工作流）
```

系统：

```text
取消关联 Job（任务）
```

最终：

```text
Workflow（工作流）
↓
cancelled（已取消）
```

#### 任务 9：Workflow Retry（工作流重试）

如果：

```text
Workflow Job Failed（工作流任务失败）
```

不要：

```text
重新建 Workflow（工作流）
```

而是：

```text
重新创建 Job（任务）
```

这样：

```text
Workflow（工作流）不变
```

#### 任务 10：完整链路测试（End-to-End Test，端到端测试）

测试：

```text
创建 Workflow（工作流）
↓
生成 Job（任务）
↓
进入 Queue（队列）
↓
Worker 执行（工作进程执行）
↓
Workflow Success（工作流成功）
↓
Job Success（任务成功）
```

再测试：

```text
Workflow Cancel（工作流取消）
```

再测试：

```text
Workflow Retry（工作流重试）
```

### 9.6 第 37 天验收标准

1. 是否新增 WorkflowJob（工作流任务）
2. Workflow（工作流）是否改为 Job 驱动（由任务驱动执行，而非直接调用运行时）
3. Worker（工作进程）是否支持 workflow job（工作流任务）
4. 是否同步 Workflow Status（工作流状态）
5. Job（任务）是否关联 Workflow（工作流）
6. Dashboard（看板）是否展示 Job ↔ Workflow（任务与工作流双向关联）
7. 是否实现 Unified Timeline（统一时间线）
8. 是否支持 Workflow Cancel（工作流取消）
9. 是否支持 Workflow Retry（工作流重试）
10. 是否完成完整链路测试（End-to-End Test）

### 9.7 第 37 天打卡模板

【第37天打卡】

1. 是否新增 WorkflowJob（工作流任务）：是 / 否
2. Workflow（工作流）是否改为 Job 驱动：是 / 否

3. Worker（工作进程）是否支持 workflow job（工作流任务）：是 / 否
4. 是否同步 Workflow Status（工作流状态）：是 / 否

5. Job（任务）是否关联 Workflow（工作流）：是 / 否
6. Dashboard（看板）是否展示 Job ↔ Workflow（任务与工作流双向关联）：是 / 否

7. 是否实现 Unified Timeline（统一时间线）：是 / 否
8. 是否支持 Workflow Cancel（工作流取消）：是 / 否

9. 是否支持 Workflow Retry（工作流重试）：是 / 否
10. 是否完成完整链路测试（End-to-End Test）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

### 9.8 第 37 天核心认知

记住一句话：

```text
Workflow（工作流）描述任务逻辑，Queue（队列）决定任务执行。
```

完成第 37 天之后，你会完成一个巨大的升级：

```text
Workflow Runtime（工作流运行时）
+
Queue Runtime（队列运行时）

融合成：

🔥 Agent Execution Platform V1（智能体执行平台 V1）
```

这是从「Agent Runtime（智能体运行时）」迈向「Agent Platform（智能体平台）」的真正分界线。
