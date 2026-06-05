# Day 33 学习总结：Queue Runtime V3（队列运行时 V3）与 Priority Scheduler（优先级调度器）

本文档记录 `ollama-chat-day33` 项目做了什么、运用了什么知识、相比 `ollama-chat-day32` 有什么改进、为什么这样设计，以及本次关于 Queue Runtime V3（队列运行时 V3）的学习对话整理、第33天打卡结果和当前系统能力。

---

## 1. 项目做了什么

`ollama-chat-day33` 是在 `ollama-chat-day32` 的 Queue Runtime V2（队列运行时 V2）基础上继续升级的本地 AI Agent（智能体）聊天系统。

day32 已经解决的是：

```text
任务失败了怎么办？
-> retry（重试）
-> backoff（退避延迟）
-> dead_letter（死信）
-> requeue（重新入队）
```

day33 继续解决的是：

```text
任务很多时，谁先执行？
任务是否可以等到未来某个时间再执行？
```

所以 day33 的核心主题是：

```text
Queue Runtime V3（队列运行时 V3）：
Priority Queue（优先级队列）
+
Scheduled Job（定时任务）
```

也就是说，系统不再只是“能跑任务、失败后能恢复”，而是开始具备“按重要性和时间调度任务”的能力。

---

## 2. 运用了什么知识

### 2.1 Priority（优先级）

day33 给 Job（后台任务）新增了 `priority`（优先级）字段。

当前约定是：

```text
10 = high（高优先级）
5  = normal（普通优先级）
1  = low（低优先级）
```

例如：

```text
High Chat P10（高优先级聊天任务）
Normal Retrieval P5（普通优先级检索任务）
Low Embedding P1（低优先级向量化任务）
```

这解决的是：

```text
多个任务都可以执行时，哪个任务应该先被 Worker（工作进程）取走？
```

### 2.2 Priority Queue（优先级队列）

day32 更接近 FIFO（First In First Out，先进先出）。

day33 的 QueueManager（队列管理器）升级为：

```text
先筛选已经可以运行的任务
再按 priority（优先级）从高到低排序
如果优先级相同，再按到期时间和创建时间排序
```

所以执行顺序可以从：

```text
Job A -> Job B -> Job C
```

升级为：

```text
priority=10 的 Job B
-> priority=5 的 Job C
-> priority=1 的 Job A
```

### 2.3 Scheduled Job（定时任务）

day33 给 Job（后台任务）新增了 `scheduledAt`（计划执行时间）字段。

它表示：

```text
这个任务不是马上执行，而是到指定时间后才允许执行。
```

例如 Reminder Job（提醒任务）会创建一个 30 秒后执行的任务：

```text
type = reminder
priority = 10
scheduledDelayMs = 30000
```

系统会把它换算成：

```text
scheduledAt = Date.now() + 30000
```

### 2.4 Runnable（可运行）判断

day33 的关键不是“优先级高就永远立刻执行”，而是：

```text
先判断任务是否到期
再从到期任务里选优先级最高的
```

所以一个 `priority=10`（高优先级）但 30 秒后才执行的 Reminder Job（提醒任务），不会立刻抢跑。

这点非常重要，因为它避免了“未来任务被提前执行”的问题。

### 2.5 Scheduler Timeline（调度时间线）

day33 的 timeline（时间线）新增了 `Scheduled`（已调度）节点。

典型时间线变成：

```text
Created（已创建）
Scheduled（已调度）
Started（已开始）
Completed（已完成）
```

这样就能看到任务不是凭空晚执行，而是明确被安排到了未来某个时间。

### 2.6 Priority Metrics（优先级指标）

day33 的 Queue Metrics（队列指标）新增了：

```text
highPriorityJobs（高优先级任务数量）
normalPriorityJobs（普通优先级任务数量）
lowPriorityJobs（低优先级任务数量）
scheduledJobs（未来定时任务数量）
```

这些指标让 Queue Dashboard（队列看板）能展示当前任务压力来自哪类优先级，以及是否有未来任务正在等待。

---

## 3. 对比 day32 有什么改进

| 对比项 | day32 | day33 |
|---|---|---|
| 队列主题 | Queue Runtime V2（队列运行时 V2） | Queue Runtime V3（队列运行时 V3） |
| 核心问题 | 任务失败后怎么办 | 任务很多时谁先执行、什么时候执行 |
| retry（重试） | 支持 | 保留 |
| backoff（退避延迟） | 支持 | 保留 |
| dead letter queue（死信队列） | 支持 | 保留 |
| requeue（重新入队） | 支持 | 保留 |
| priority（优先级） | 不支持 | 新增 |
| scheduledAt（计划执行时间） | 不支持 | 新增 |
| Priority Queue（优先级队列） | 不支持 | 新增 |
| Reminder Job（提醒任务） | 不支持 | 新增 |
| Priority Metrics（优先级指标） | 不支持 | 新增 |
| Scheduler Timeline（调度时间线） | 基础 timeline（时间线） | 新增 Scheduled（已调度）节点 |

一句话概括：

```text
day32：让任务失败后还能恢复。
day33：让任务按重要性和时间被合理调度。
```

---

## 4. 为什么这样做

真实后台任务系统里，任务不是都一样重要。

比如：

```text
用户正在等待的 Chat Job（聊天任务）：应该优先执行
批量 Embedding Job（向量化任务）：可以慢一点
Knowledge Reindex（知识库重建索引）：可以排后面
Reminder Job（提醒任务）：必须到指定时间后执行
失败任务：需要按 backoff（退避延迟）时间重试
```

如果只有 FIFO（先进先出），会出现几个问题：

```text
一个很长的低优先级 embedding（向量化）任务，可能挡住用户正在等的聊天任务。
一个未来才该执行的 reminder（提醒）任务，可能被提前执行。
失败任务如果不看 nextRunAt（下一次运行时间），可能无视 backoff（退避延迟）立刻重跑。
```

day33 的设计就是为了把这些问题分层处理：

```text
priority（优先级）解决“谁更重要”
scheduledAt（计划执行时间）解决“什么时候能跑”
nextRunAt（下一次运行时间）解决“失败后什么时候能重试”
dead_letter（死信）解决“多次失败后怎么隔离”
```

所以 day33 已经开始接近真实生产队列系统的核心思想，例如 BullMQ（基于 Redis 的 Node.js 任务队列库）、Redis Queue（Redis 队列方案）、Temporal（分布式工作流编排引擎）、Airflow（数据流水线调度平台）里都会有类似概念。

---

## 5. 核心运行流程

以混合调度为例：

```text
Job A：priority=1，立即执行
Job B：priority=10，立即执行
Job C：priority=5，立即执行
Job D：priority=10，scheduledAt=30 秒后
```

QueueManager（队列管理器）的执行逻辑是：

```text
1. 先找出 status=queued 或 status=retrying 的任务
2. 再判断 scheduledAt / nextRunAt 是否已经到期
3. 只从已经到期的任务中挑选
4. 优先选择 priority 最大的任务
5. 如果 priority 相同，选择更早到期的任务
6. 如果仍然相同，按 createdAt 保持 FIFO（先进先出）顺序
```

所以执行顺序应该是：

```text
Job B（P10）
-> Job C（P5）
-> Job A（P1）
-> 等 30 秒后 Job D（P10 Reminder）
```

---

## 6. 本次学习对话整理

### 问答 1：day33 项目做了什么、用到了什么知识、相比 day32 有什么改进、为什么这样做

**我问：**

> 带我来读懂ollama-chat-day33这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day32有什么改进，为什么这样子做

**回答整理：**

`ollama-chat-day33` 是在 `ollama-chat-day32` 的“失败可恢复队列”基础上，继续升级成 `Queue Runtime V3`（队列运行时 V3）。

它让后台任务不只是能失败重试，还能按优先级执行、按未来时间定时执行。

更直观地说：

```text
day32：任务失败了怎么办？
答案：retry（重试）/ backoff（退避延迟）/ dead letter（死信）/ requeue（重新入队）

day33：任务很多时，谁先执行？什么时候执行？
答案：priority queue（优先级队列）/ scheduled job（定时任务）
```

day33 新增了 `priority`（优先级）、`scheduledAt`（计划执行时间）、`Reminder Job`（提醒任务）、`Scheduler Timeline`（调度时间线）和 `Priority Metrics`（优先级指标）。

它的核心认知是：

```text
priority（优先级）解决“谁更重要”
scheduledAt（计划执行时间）解决“什么时候能跑”
```

所以 day33 不是替代 day32，而是在 day32 的 retry / backoff / DLQ（Dead Letter Queue，死信队列）基础上叠加了一层调度策略。

### 问答 2：低优先级长任务正在执行时，高优先级聊天任务是否仍然会卡住

**我问：**

> 有个问题，当正在执行一个很长的低优先级 embedding 任务，这个时候进来了用户正在等的聊天任务，那也是得等很长的低优先级 embedding 任务完成后才会执行用户正在等的聊天任务，也对用户来说一样有个卡顿的情况吧，能不能是多线程之类的来解决呢

**回答整理：**

这个观察是准确的。

当前 day33 的 Worker（工作进程）是单 Worker 串行执行：

```text
Worker 一次只处理 1 个任务
```

所以即使 `High Chat P10`（高优先级聊天任务）优先级更高，只要它进来时低优先级 `Embedding P1`（向量化任务）已经开始 `running`（执行中），它也不能把正在执行的任务抢下来。

它只能等 embedding（向量化）结束后，再靠 priority（优先级）排到下一个。

也就是说，day33 的 priority（优先级）解决的是：

```text
还没开始执行的任务，谁先被拿走
```

但它还没解决：

```text
低优先级长任务已经 running（执行中）了，高优先级任务怎么办
```

常见解决办法有：

```text
1. 多 Worker 并发执行
2. 按队列分池
3. 任务抢占或取消
4. 长任务切片
```

最适合后续学习路线的是：

```text
Queue Runtime V4（队列运行时 V4）：
Concurrent Workers（并发 Worker）
+
Worker Pool（工作池）
```

一句话记住：

```text
Priority（优先级）只能决定“下一个谁先跑”；
Concurrency（并发）才解决“一个长任务正在跑时，别人不用等”。
```

---

## 7. 第33天打卡

【第33天打卡】

1. Job（后台任务）是否支持 priority（优先级）：是
2. Job（后台任务）是否支持 scheduledAt（计划执行时间）：是

3. 是否实现 Priority Queue（优先级队列）：是
4. 是否支持 scheduleJob()（定时入队方法）：是

5. QueueManager（队列管理器）是否支持定时任务：是
6. Queue Dashboard（队列看板）是否展示 priority（优先级）：是

7. 是否增加 Priority Metrics（优先级指标）：是
8. 是否增加 Scheduler Timeline（调度时间线）：是

9. 是否实现 Reminder Job（提醒任务）：是
10. 是否完成 Priority + Schedule（优先级 + 定时）混合测试：是

11. 遇到的最大问题：

day33 解决了“还没开始执行的任务，谁先执行”的问题，但还没有解决“低优先级长任务已经开始执行，高优先级任务又进来了怎么办”的问题。

当前系统是单 Worker（单工作进程）串行执行，所以一个很长的低优先级 Embedding Job（向量化任务）一旦进入 `running`（执行中），新来的 High Chat Job（高优先级聊天任务）仍然要等待它完成。

这说明 Priority Queue（优先级队列）只能优化排队阶段，不能自动中断已经运行中的任务。后续需要通过 Concurrent Workers（并发 Worker）、Worker Pool（工作池）、队列分池、任务切片或可取消任务来进一步优化用户等待体验。

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
+ Backoff（退避延迟）
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
+ scheduleJob()（定时入队方法）
+ Reminder Job（提醒任务）
+ Scheduler Timeline（调度时间线）
+ Priority Metrics（优先级指标）
```

---

## 8. 一句话总结

```text
day33 让 Queue Runtime（队列运行时）从“失败可恢复”升级为“可按优先级和计划时间调度”，
但它也暴露出下一个关键问题：单 Worker 串行执行会被长任务阻塞，后续需要 Concurrent Workers（并发 Worker）和 Worker Pool（工作池）来继续升级。
```

---

## 9. 第 33 天总结

你第 33 天完成了：

**Queue Runtime V3（队列运行时 V3）：Priority Scheduler（优先级调度器）**

现在你的任务系统已经从：

```text
普通后台任务队列
```

升级成：

```text
可调度、可排序、可延迟执行的任务系统
```

你已经具备：

| 能力 | 说明 |
|---|---|
| `priority`（优先级） | 决定任务重要程度，数值越大越优先 |
| `scheduledAt`（计划执行时间） | 任务到指定时间后才允许执行 |
| Priority Queue（优先级队列） | 按优先级从高到低取任务，而非单纯先进先出 |
| `scheduleJob()`（定时入队方法） | 创建未来某个时间点才执行的任务 |
| 定时任务（Scheduled Job） | 延迟到指定时间再运行的后台任务 |
| Reminder Job（提醒任务） | 一种定时任务示例，如 30 秒后触发的提醒 |
| Priority Metrics（优先级指标） | 统计高/中/低优先级及定时任务数量 |
| Scheduler Timeline（调度时间线） | 展示 Created → Scheduled → Started → Completed 等节点 |
| Priority + Schedule（优先级 + 定时）混合测试 | 验证优先级排序与定时执行同时生效 |

这说明你的 Queue（队列）已经不只是“异步执行”，而是开始具备 **调度系统（Scheduler System，按时间与优先级安排任务何时、由谁执行）** 的能力。

---

## 10. 第 34 天学习计划：Queue Runtime V4（队列运行时 V4）：Concurrency（并发）+ Worker Pool（工作池）

### 10.1 今日核心目标

让系统不再只有一个 Worker（工作进程），而是支持多个 Worker 并发处理 Job（后台任务）。

之前你的 Queue（队列）是：

```text
Worker（工作进程）
↓
一次处理一个 job（后台任务）
```

第 34 天要升级为：

```text
Worker Pool（工作池）
├─ Worker 1（工作进程 1）
├─ Worker 2（工作进程 2）
├─ Worker 3（工作进程 3）
└─ Worker 4（工作进程 4）
```

### 10.2 为什么第 34 天要做这个？

现在如果有 10 个 job（后台任务）：

```text
Job1 → Job2 → Job3 → ... → Job10
```

会很慢。

真实系统需要：

```text
多个 Worker（工作进程）并发执行
```

但并发会带来新问题：

| 问题 | 说明 |
|---|---|
| 同一个 job 不能被两个 worker 同时拿到 | 需要原子 claim（认领）机制 |
| Worker 数量需要限制 | 通过 concurrency（并发数）控制 |
| 高优先级任务仍要先执行 | claim 时仍按 priority / scheduledAt 排序 |
| 任务状态不能乱 | running / queued 等状态转换要一致 |
| Dashboard（看板）要能看到哪个 worker 在跑什么 | 需要 WorkerInfo（工作进程信息）展示 |

### 10.3 第 34 天最终效果

你创建 5 个模拟长任务，每个 5 秒。

| 场景 | 总耗时 |
|---|---|
| concurrency（并发数）= 1 | 约 25 秒 |
| concurrency（并发数）= 3 | 约 10 秒 |

### 10.4 任务清单

#### 任务 1：定义 WorkerInfo（工作进程信息）

新增：

```typescript
type WorkerInfo = {
  id: string
  status: "idle" | "running" | "stopped"  // idle=空闲, running=执行中, stopped=已停止
  currentJobId?: string
  startedAt: number
  lastHeartbeatAt: number
  processedJobs: number
  failedJobs: number
}
```

**作用：** 记录每个 Worker（工作进程）当前状态。

#### 任务 2：实现 WorkerPool（工作池）

新增：

```typescript
class WorkerPool {
  workers: Worker[]

  constructor(private concurrency: number) {}

  start() {}

  stop() {}

  getStats() {}
}
```

示例：

```typescript
const pool = new WorkerPool(3)
pool.start()
```

#### 任务 3：QueueManager（队列管理器）支持原子 claim（认领）

这是今天最重要的一步。**不要让多个 worker 同时取到同一个 job（后台任务）。**

新增：

```typescript
claimNextJob(workerId: string)
```

**逻辑：**

```text
1. 找到可运行 job（后台任务）
2. 按 priority（优先级）/ scheduledAt（计划执行时间）排序
3. 把 job 状态改成 running（执行中）
4. 写入 workerId（工作进程 ID）
5. 返回 job
```

Job（后台任务）增加：

```typescript
workerId?: string
lockedAt?: number
```

#### 任务 4：实现 job lock（任务锁）

当 Worker（工作进程）claim（认领）job 时：

```typescript
job.status = "running"
job.workerId = workerId
job.lockedAt = Date.now()
```

这样就不会被其他 worker 拿走。

#### 任务 5：Worker（工作进程）使用 claimNextJob

之前：

```typescript
const job = queue.dequeue()
```

升级：

```typescript
const job = queue.claimNextJob(worker.id)
```

#### 任务 6：WorkerPool Dashboard（工作池看板）

展示：

```text
Worker Pool（工作池）
- Worker 1：running job_001
- Worker 2：idle
- Worker 3：running job_003
```

#### 任务 7：Concurrency Metrics（并发指标）

新增：

```typescript
type WorkerPoolMetrics = {
  concurrency: number           // 配置的并发数
  activeWorkers: number         // 正在工作的 worker 数量
  idleWorkers: number           // 空闲 worker 数量
  runningJobs: number           // 正在执行的任务数
  throughputPerMinute: number   // 每分钟完成任务数（吞吐量）
  avgJobDuration: number        // 平均任务耗时
}
```

#### 任务 8：并发测试

创建：

```text
5 个 sleep job（休眠模拟任务）
每个 5 秒
```

分别测试：

```text
concurrency（并发数）= 1
concurrency（并发数）= 3
```

记录：

```text
总耗时
平均耗时
并发收益
```

#### 任务 9：Worker heartbeat（工作进程心跳）

每个 Worker（工作进程）定期更新：

```typescript
worker.lastHeartbeatAt = Date.now()
```

Dashboard（看板）可以展示：

```text
最后心跳时间
```

#### 任务 10：Stale lock（过期锁）检测

如果 Worker（工作进程）崩了，job 可能一直 running（执行中）。

新增：

```typescript
detectStaleJobs()
```

如果：

```text
status = running
lockedAt 超过 30 秒
```

则：

```text
重新变成 queued（已入队）
或 retrying（等待重试）
```

### 10.5 第 34 天验收标准

1. 是否定义 WorkerInfo（工作进程信息）
2. 是否实现 WorkerPool（工作池）
3. 是否支持 concurrency（并发数）
4. 是否实现 claimNextJob（原子认领下一个任务）
5. 是否实现 job lock（任务锁）
6. 是否避免同一 job 被重复执行
7. Dashboard（看板）是否展示 Worker 状态
8. 是否增加 Concurrency Metrics（并发指标）
9. 是否完成 concurrency=1 vs 3 测试
10. 是否实现 heartbeat（心跳）/ stale lock（过期锁）检测

### 10.6 第 34 天打卡模板

【第34天打卡】

1. 是否定义 WorkerInfo（工作进程信息）：是 / 否
2. 是否实现 WorkerPool（工作池）：是 / 否

3. 是否支持 concurrency（并发数）：是 / 否
4. 是否实现 claimNextJob（原子认领下一个任务）：是 / 否

5. 是否实现 job lock（任务锁）：是 / 否
6. 是否避免同一 job 被重复执行：是 / 否

7. Dashboard（看板）是否展示 Worker 状态：是 / 否
8. 是否增加 Concurrency Metrics（并发指标）：是 / 否

9. 是否完成 concurrency=1 vs 3 测试：是 / 否
10. 是否实现 heartbeat（心跳）/ stale lock（过期锁）检测：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

### 10.7 第 34 天核心认知

记住一句话：

```text
Queue（队列）解决“任务排队”，Worker Pool（工作池）解决“任务吞吐（Throughput，单位时间内完成的任务量）”。
```

完成第 34 天后，你的系统会升级成：

**Queue Runtime V4（队列运行时 V4）：Worker Pool（工作池）+ Concurrency（并发）。**

