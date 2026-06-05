# Day 35 学习总结：Queue Runtime V5（队列运行时 V5）与 Rate Limit（速率限制）+ Resource Control（资源控制）

本文档记录 `ollama-chat-day35` 项目做了什么、运用了什么知识、相比 `ollama-chat-day34` 有什么改进、为什么这样设计，以及本次关于 RateLimiter（速率限制器）的学习对话整理。

---

## 1. 项目做了什么

`ollama-chat-day35` 是在 `ollama-chat-day34` 的 Queue Runtime V4（队列运行时 V4）基础上继续升级的本地 AI Agent（智能体）聊天系统。

day34 的核心是：

```text
Queue Runtime V4（队列运行时 V4）
= WorkerPool（工作池）
+ Concurrency（并发）
+ job lock（任务锁）
+ heartbeat（心跳）
+ stale lock recovery（过期锁恢复）
```

day35 的核心是：

```text
Queue Runtime V5（队列运行时 V5）
= Rate Limit（速率限制）
+ Resource Control（资源控制）
```

一句话理解：

```text
day34 解决“能不能多个 Worker（工作进程）同时跑任务”；
day35 解决“多个 Worker 同时跑任务时，别把某类资源打爆”。
```

day35 仍然保留聊天、RAG（Retrieval-Augmented Generation，检索增强生成）、Workflow（工作流）、Tool（工具）、Queue Dashboard（队列看板）等能力，但本日新增重点集中在 Queue（队列）系统。

核心文件包括：

```text
lib/queue/queue-types.ts
lib/queue/resource-limiters.ts
lib/queue/queue-manager.ts
lib/queue/queue-runtime.ts
lib/queue/worker.ts
app/components/QueueDashboard.tsx
```

---

## 2. 运用了什么知识

### 2.1 resourceType（资源类型）

day35 给 Job（任务）新增了 `resourceType`（资源类型）。

资源类型包括：

```ts
type ResourceType =
  | "llm"        // 大语言模型资源
  | "embedding"  // 向量嵌入资源
  | "database"   // 数据库或检索资源
  | "workflow"   // 工作流资源
  | "tool";      // 工具资源
```

不同任务会消耗不同资源：

| Job Type（任务类型） | resourceType（资源类型） |
|---|---|
| chat（聊天任务） | llm（大语言模型） |
| embedding（向量化任务） | embedding（向量嵌入） |
| reindex（重建索引任务） | embedding（向量嵌入） |
| retrieval（检索任务） | database（数据库/检索） |
| workflow（工作流任务） | workflow（工作流） |
| unstable / alwaysFail / reminder（测试任务） | tool（工具） |

这一步的意义是：

```text
队列不再只知道“任务优先级高不高”，
还知道“这个任务会消耗哪类资源”。
```

---

### 2.2 inferResourceType（推断资源类型）

如果创建任务时没有手动传 `resourceType`，系统会自动根据 `job.type` 推断资源类型。

核心思想类似：

```ts
if (job.type === "embedding") return "embedding";
if (job.type === "reindex") return "embedding";
if (job.type === "chat") return "llm";
if (job.type === "retrieval") return "database";
if (job.type === "workflow") return "workflow";
return "tool";
```

这样调用方不用每次都手动写资源类型，也减少写错的风险。

---

### 2.3 ResourceLimiter（资源限制器）

ResourceLimiter（资源限制器）控制的是：

```text
同一类资源，最多同时运行几个任务。
```

比如默认可以设置为：

```text
llm（大语言模型）：最多同时 3 个
embedding（向量嵌入）：最多同时 2 个
database（数据库/检索）：最多同时 5 个
workflow（工作流）：最多同时 3 个
tool（工具）：最多同时 4 个
```

举例：

```text
如果 embedding concurrency limit（向量嵌入并发上限）= 2，
并且现在已经有 2 个 Worker（工作进程）正在跑 embedding 任务，
那么第 3 个 embedding 任务即使遇到空闲 Worker，也不会立刻运行。
它会继续等待。
```

ResourceLimiter（资源限制器）解决的是：

```text
同一时间占用某类资源的任务不能太多。
```

---

### 2.4 RateLimiter（速率限制器）

RateLimiter（速率限制器）控制的是：

```text
单位时间内最多允许启动几个任务。
```

它和 ResourceLimiter（资源限制器）的区别是：

```text
ResourceLimiter（资源限制器）管“同时有几个在跑”。
RateLimiter（速率限制器）管“单位时间内允许启动几个”。
```

也可以这样记：

```text
ResourceLimiter：我现在忙不忙？
RateLimiter：你来得是不是太频繁？
```

例如配置：

```text
llm ResourceLimiter（大语言模型资源并发限制）= 3
llm RateLimiter（大语言模型速率限制）= 每秒 2 个
```

含义是：

```text
最多同时有 3 个 llm 任务 running（运行中），
但每 1 秒最多只能新启动 2 个 llm 任务。
```

如果一瞬间来了 5 个 chat（聊天）任务，且 3 个 Worker 都空闲：

只有 ResourceLimiter（资源限制器）时，可能是：

```text
第 0.0 秒：启动 chat_1
第 0.0 秒：启动 chat_2
第 0.0 秒：启动 chat_3
```

这叫“瞬间打出去 3 个请求”。

如果再加上 RateLimiter（速率限制器）：

```text
第 0.0 秒：启动 chat_1
第 0.0 秒：启动 chat_2
第 0.0 秒：chat_3 被 rate_limit（速率限制）挡住
第 1.0 秒后：启动 chat_3
第 1.0 秒后：启动 chat_4
第 2.0 秒后：启动 chat_5
```

所以 RateLimiter（速率限制器）的作用是：

```text
不要让任务启动得太猛。
```

生活化比喻：

```text
ResourceLimiter（资源限制器）像餐厅座位数：
最多同时坐 3 桌客人。

RateLimiter（速率限制器）像门口放行速度：
每分钟最多放 10 桌客人进门。
```

哪怕里面还有空桌，也不能一秒钟冲进来 100 桌，因为厨房、服务员、收银系统都会被瞬间打爆。

在 AI 系统里也一样：

```text
ResourceLimiter 控制：最多同时 3 个 LLM（大语言模型）请求在跑。
RateLimiter 控制：每秒最多新发起 2 个 LLM 请求。
```

RateLimiter（速率限制器）保护的是入口流量。

它适合保护：

```text
模型服务的请求入口
数据库连接分配
Embedding（向量嵌入）服务入口
外部 API（应用程序接口）的 QPS（每秒请求数）限制
日志、队列、文件写入等高频入口
```

day35 的 RateLimiter（速率限制器）使用了一个简单模型：

```text
Map<resourceType, timestamp[]>
```

意思是：

```text
每一种资源类型，都记录最近被放行的时间戳。
```

例如：

```text
llm: [10:00:00.100, 10:00:00.300]
```

如果配置是：

```text
llm 每 1000ms 最多 2 次
```

那么在 `10:00:00.500` 又来一个 llm 任务时，系统会发现：

```text
最近 1000ms 内已经有 2 次 llm 被放行。
```

所以第三个会被挡住：

```ts
blockedReason = "rate_limit";
```

等到 `10:00:01.101`，第一条时间戳过期了，窗口里只剩 1 条或 0 条，就可以继续放行。

---

### 2.5 blockedReason（阻塞原因）

day35 给 Job（任务）新增了 `blockedReason`（阻塞原因）。

它有两种值：

```ts
blockedReason = "resource_limit"; // 资源并发已满
blockedReason = "rate_limit";     // 超过单位时间速率上限
```

Dashboard（看板）会显示：

```text
waiting embedding
rate limited llm
```

这样就能知道：

```text
任务不是“卡住了”，
而是因为资源或速率限制正在等待。
```

---

### 2.6 claimNextJob（认领下一个任务）的升级

day34 的 `claimNextJob(workerId)` 主要负责：

```text
按 priority（优先级）和 scheduledAt（计划时间）挑选任务，
然后写入 workerId（工作进程 ID）和 lockedAt（锁定时间）。
```

day35 的 `claimNextJob(workerId)` 多做了两层检查：

```text
1. ResourceLimiter（资源限制器）检查
2. RateLimiter（速率限制器）检查
```

伪代码大致是：

```ts
for (const job of runnableJobs) {
  const resourceType = inferResourceType(job);

  if (!resourceLimiter.canRun(resourceType)) {
    job.blockedReason = "resource_limit";
    continue;
  }

  if (!rateLimiter.allow(resourceType)) {
    job.blockedReason = "rate_limit";
    continue;
  }

  resourceLimiter.acquire(resourceType);
  return claimedJob;
}
```

这里一个很重要的设计是：

```text
如果一个任务被资源或速率限制挡住，
系统不会让整个队列停住，
而是继续尝试后面的任务。
```

例如：

```text
embedding 资源满了，
不代表 chat / workflow / database 任务也不能跑。
```

这比简单 FIFO（先进先出）队列更接近真实生产系统。

---

### 2.7 Resource Usage（资源占用）与 Rate Limit Metrics（速率限制指标）

day35 的 Dashboard（看板）新增了：

```text
Resource Usage（资源占用）
Rate Limit Window（速率限制窗口）
allowed（允许次数）
blocked（阻塞次数）
blockedByResource（按资源统计的资源限制阻塞）
blockedByRate（按资源统计的速率限制阻塞）
```

看板可以观察：

```text
llm: 1 / 3
embedding: 2 / 2
database: 0 / 5
workflow: 1 / 3
tool: 0 / 4
```

也可以观察：

```text
llm: 2 / 2s
embedding: 1 / 2s
```

这让队列调度从“黑盒”变成“可观察”。

---

## 3. 对比 day34 有什么改进

day34 的核心能力：

```text
WorkerPool（工作池）
Concurrency（并发）
job lock（任务锁）
workerId（工作进程 ID）
lockedAt（任务锁定时间）
heartbeat（心跳）
stale lock recovery（过期锁恢复）
priority（优先级）
scheduledAt（计划执行时间）
retry / backoff（重试 / 退避）
Dead Letter Queue（死信队列）
```

day35 保留这些能力，并新增：

```text
resourceType（资源类型）
inferResourceType（推断资源类型）
ResourceLimiter（资源限制器）
RateLimiter（速率限制器）
blockedReason（阻塞原因）
Resource Usage（资源占用）
Rate Limit Metrics（速率限制指标）
Rate Limit Window（速率限制窗口）
```

对比表：

| 能力 | day34 | day35 |
|---|---|---|
| WorkerPool（工作池） | 有 | 保留 |
| Concurrency（并发） | 有 | 保留 |
| job lock（任务锁） | 有 | 保留 |
| heartbeat（心跳） | 有 | 保留 |
| stale lock recovery（过期锁恢复） | 有 | 保留 |
| priority（优先级） | 有 | 保留 |
| retry / backoff（重试 / 退避） | 有 | 保留 |
| Dead Letter Queue（死信队列） | 有 | 保留 |
| resourceType（资源类型） | 无 | 新增 |
| ResourceLimiter（资源限制器） | 无 | 新增 |
| RateLimiter（速率限制器） | 无 | 新增 |
| blockedReason（阻塞原因） | 无 | 新增 |
| Resource Usage（资源占用） | 无 | 新增 |
| Rate Limit Metrics（速率限制指标） | 无 | 新增 |

一句话总结：

```text
day34 让系统跑得更快；
day35 让系统跑得更稳。
```

---

## 4. 为什么这样设计

因为并发不是越高越好。

如果有 3 个 Worker（工作进程），它们同时拿到 3 个 embedding（向量嵌入）任务，可能会导致：

```text
Ollama embedding 服务变慢
CPU（中央处理器）飙高
内存占用升高
请求 timeout（超时）
后面的 chat（聊天）任务被拖慢
```

如果 LLM（大语言模型）任务瞬间启动太多，也可能导致：

```text
本地模型响应变慢
请求堆积
用户感觉卡顿
服务不稳定
```

所以真实系统通常会同时做两层控制：

```text
1. ResourceLimiter（资源限制器）：同时最多几个任务占用某类资源
2. RateLimiter（速率限制器）：单位时间内最多启动多少个任务
```

这不是为了让任务“更快开始”，而是为了：

```text
保护系统资源
避免模型服务被打爆
避免低优先级大任务挤占关键资源
让队列状态更可解释
让系统更接近生产级 Scheduler（调度器）
```

---

## 5. 本次学习对话整理

### 问答 1：这个项目做了什么、用了什么知识、相比 day34 有什么改进、为什么这样做？

**我的问题：**

> 带我来读懂 ollama-chat-day35 这个文件夹中的项目做了什么，运用了什么知识，对比 ollama-chat-day34 有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day35` 做的是：在 day34 的“多 Worker（工作进程）并发队列”基础上，继续升级成 Queue Runtime V5（队列运行时 V5）：Resource Control（资源控制）+ Rate Limit（速率限制）。

day34 解决的是：

```text
多个 Worker 能不能同时处理多个 Job？
同一个 Job 会不会被重复认领？
Worker 挂了，任务能不能恢复？
```

day35 继续解决的是：

```text
并发跑任务时，某类资源会不会被打爆？
embedding 能不能最多同时跑 2 个？
llm 能不能每秒最多启动 2 个？
任务为什么还在 queued（排队中）？
```

day35 的新增能力有：

```text
resourceType（资源类型）
ResourceLimiter（资源限制器）
RateLimiter（速率限制器）
blockedReason（阻塞原因）
Resource Usage（资源占用）
Rate Limit Metrics（速率限制指标）
```

这一步很重要，因为真实 AI Agent（智能体）系统中，不同任务消耗的资源完全不同。

例如：

```text
chat（聊天）消耗 llm（大语言模型）资源
embedding（向量化）消耗 embedding（向量嵌入）资源
reindex（重建索引）也会消耗 embedding 资源
retrieval（检索）消耗 database（数据库/检索）资源
workflow（工作流）消耗 workflow 资源
```

如果这些任务只靠一个简单优先级队列调度，很容易互相抢资源。

day35 就是在给系统加一层“资源秩序”。

---

### 问答 2：RateLimiter（速率限制器）到底怎么理解？

**我的问题：**

> 我能理解同一时间能跑的任务类型是有限制的 ResourceLimiter（比如最多只能有两个 Worker 跑 embedding，已经有两个 Worker 的在跑 embedding 的话，来第三个 embedding 的任务即使 Worker 有空也不会跑，先进行等待），但是对于 RateLimiter 不太能理解，能更详细解释下吗

**回答整理：**

ResourceLimiter（资源限制器）和 RateLimiter（速率限制器）最大的区别是：

```text
ResourceLimiter 管“同时有几个在跑”。
RateLimiter 管“单位时间内允许启动几个”。
```

举例：

```text
llm ResourceLimiter = 3
llm RateLimiter = 每秒 2 个
```

这表示：

```text
最多同时有 3 个 llm 任务 running（运行中），
但每 1 秒最多只能新启动 2 个 llm 任务。
```

如果一瞬间来了 5 个 chat（聊天）任务，而且 3 个 Worker（工作进程）都空闲：

只有 ResourceLimiter（资源限制器）时，系统可能马上启动 3 个：

```text
第 0.0 秒：启动 chat_1
第 0.0 秒：启动 chat_2
第 0.0 秒：启动 chat_3
```

但如果还有 RateLimiter（速率限制器）：

```text
第 0.0 秒：启动 chat_1
第 0.0 秒：启动 chat_2
第 0.0 秒：chat_3 被 rate_limit（速率限制）挡住
第 1.0 秒后：启动 chat_3
第 1.0 秒后：启动 chat_4
第 2.0 秒后：启动 chat_5
```

所以 RateLimiter（速率限制器）的作用是：

```text
不要让任务启动得太猛。
```

在 day35 代码里，RateLimiter（速率限制器）会记录每类资源最近被放行的时间戳：

```text
Map<resourceType, timestamp[]>
```

如果配置是：

```text
llm 每 1000ms 最多 2 次
```

那么第三个 llm 任务在 1000ms 窗口内到来时，就会被挡住：

```ts
blockedReason = "rate_limit";
```

等窗口里的旧时间戳过期后，任务就可以继续启动。

最终可以这样记：

```text
ResourceLimiter（资源限制器）：我现在忙不忙？
RateLimiter（速率限制器）：你来得是不是太频繁？
```

第三个 embedding（向量嵌入）任务可能有两种不同等待原因：

```text
resource_limit（资源限制）：前面两个 embedding 还在跑，资源坑位满了。
rate_limit（速率限制）：资源坑位可能有空，但刚才启动得太快，需要缓一缓。
```

这就是 day35 两个限制器都要做的原因：

```text
一个防“同时太多”，
一个防“瞬间太猛”。
```

---

## 6. 第35天打卡

【第35天打卡】

1. Job 是否支持 resourceType（资源类型）：是
2. 是否实现 ResourceLimiter（资源限制器）：是

3. claimNextJob 是否检查资源限制：是
4. 是否实现 inferResourceType（推断资源类型）：是

5. 是否实现 RateLimiter（速率限制器）：是
6. claimNextJob 是否检查 rate limit（速率限制）：是

7. Dashboard 是否展示 Resource Usage（资源占用）：是
8. 是否增加 Rate Limit Metrics（速率限制指标）：是

9. 是否记录 blockedReason（阻塞原因）：是
10. 是否完成资源限制压测：是

11. 遇到的最大问题：

```text
RateLimiter（速率限制器）和 ResourceLimiter（资源限制器）的边界一开始不容易区分。
ResourceLimiter 控制“同时有几个任务在跑”，RateLimiter 控制“单位时间内最多启动几个任务”。
也就是说，资源坑位有空并不代表一定能立刻启动；如果刚才启动得太频繁，RateLimiter 仍然会让任务等待下一个时间窗口。
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
+ Queue Metrics V2（队列指标 V2）
+ unstable / alwaysFail（不稳定 / 必定失败测试任务）
+ Queue Runtime V3（队列运行时 V3）
+ Priority Queue（优先级队列）
+ priority（优先级）
+ Scheduled Job（定时任务）
+ scheduledAt（计划执行时间）
+ scheduleJob（定时入队方法）
+ Reminder Job（提醒任务）
+ Scheduler Timeline（调度时间线）
+ Priority Metrics（优先级指标）
+ Queue Runtime V4（队列运行时 V4）
+ WorkerInfo（工作进程信息）
+ WorkerPool（工作池）
+ concurrency（并发数）
+ claimNextJob（认领下一个任务）
+ job lock（任务锁）
+ workerId（认领任务的工作进程 ID）
+ lockedAt（任务锁定时间）
+ heartbeat（心跳）
+ lastHeartbeatAt（最近心跳时间）
+ stale lock detection（过期锁检测）
+ StaleRecovered（过期锁恢复时间线节点）
+ Concurrency Metrics（并发指标）
+ WorkerPool Dashboard（工作池看板）
+ Queue Runtime V5（队列运行时 V5）
+ resourceType（资源类型）
+ ResourceLimiter（资源限制器）
+ RateLimiter（速率限制器）
+ inferResourceType（推断资源类型）
+ blockedReason（阻塞原因）
+ resource_limit（资源限制阻塞）
+ rate_limit（速率限制阻塞）
+ Resource Usage（资源占用）
+ Rate Limit Window（速率限制窗口）
+ Rate Limit Metrics（速率限制指标）
+ allowedCount（允许通过次数）
+ blockedCount（阻塞次数）
+ blockedByResource（按资源统计的资源限制阻塞）
+ blockedByRate（按资源统计的速率限制阻塞）
```

---

## 7. 一句话总结

```text
WorkerPool（工作池）解决“能同时跑多少任务”，
ResourceLimiter（资源限制器）解决“同一类资源能同时被多少任务占用”，
RateLimiter（速率限制器）解决“同一类资源在单位时间内能启动多少任务”，
blockedReason（阻塞原因）解决“任务为什么暂时还不能跑”。
```

完成 day35 后，队列系统已经从“能并发执行任务”，进一步升级为“能按资源类型稳定调度任务”。
