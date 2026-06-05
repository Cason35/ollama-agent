# Day 34 学习总结：Queue Runtime V4（队列运行时 V4）与 Worker Pool（工作池）

本文档记录 `ollama-chat-day34` 项目做了什么、运用了什么知识、相比 `ollama-chat-day33` 有什么改进、为什么这样设计，以及本次围绕 Worker（工作进程）、heartbeat（心跳）、stale lock（过期锁）和 WorkerPool autoscaling（工作池自动扩缩容）的学习对话整理。

---

## 1. 项目做了什么

`ollama-chat-day34` 是在 `ollama-chat-day33` 的 Priority Scheduler（优先级调度器）基础上继续升级的本地 AI Agent（智能体）聊天系统。

day33 解决的是：

```text
多个任务都还没开始时，谁先执行？
```

day34 解决的是：

```text
任务很多，或者一个低优先级长任务正在跑时，系统能不能多个 Worker 同时处理？
```

所以 day34 的核心主题是：

```text
Queue Runtime V4（队列运行时 V4）：
Concurrency（并发）+
Worker Pool（工作池）
```

也就是说，系统不再只是“会排队、会按优先级和时间调度”，而是开始具备“多个 Worker（工作进程）并发处理任务”的能力。

---

## 2. 运用了什么知识

### 2.1 WorkerInfo（工作进程信息）

day34 新增 `WorkerInfo`（工作进程信息），用于记录每个 Worker（工作进程）的状态：

```text
id：Worker 的唯一 ID
status：idle / running / stopped
currentJobId：当前正在处理的任务 ID
startedAt：启动时间
lastHeartbeatAt：最近一次心跳时间
processedJobs：成功处理的任务数量
failedJobs：失败任务数量
```

它解决的问题是：

```text
现在有几个 Worker？
哪个 Worker 正在忙？
哪个 Worker 空闲？
Worker 最近是否还活着？
```

### 2.2 WorkerPool（工作池）

day34 新增 `WorkerPool`（工作池），默认创建 3 个 Worker：

```text
worker_1
worker_2
worker_3
```

day33 是：

```text
一个 Worker
一次只处理一个 Job
```

day34 升级为：

```text
WorkerPool
默认 3 个 Worker
最多 3 个 Job 同时 running
```

这让 5 个 5 秒长任务的总耗时从大约 25 秒，降低到大约 10 秒。

### 2.3 claimNextJob（原子认领下一个任务）

day34 把原来的简单出队逻辑升级成：

```text
claimNextJob(workerId)
```

认领时会做这些事：

```text
1. 找到 queued / retrying 的可运行任务
2. 判断 scheduledAt / nextRunAt 是否到期
3. 按 priority 从高到低排序
4. 从内存队列中移除选中的任务
5. 把任务改成 running
6. 写入 workerId
7. 写入 lockedAt
8. 增加 Claimed 时间线节点
```

关键点是：

```text
任务一旦被某个 Worker 认领，就会从队列里移除。
其他 Worker 再来认领时，就拿不到同一个 Job。
```

这就是 day34 避免同一任务被重复执行的核心。

### 2.4 job lock（任务锁）

day34 给 Job（任务）新增了两个字段：

```text
workerId：哪个 Worker 认领了这个任务
lockedAt：任务什么时候被认领
```

它们组成一个简化版 job lock（任务锁）。

含义是：

```text
这个任务已经被某个 Worker 拿走了，其他 Worker 不能再拿。
```

### 2.5 heartbeat（心跳）

Worker（工作进程）会定期更新：

```text
lastHeartbeatAt = Date.now()
```

这叫 heartbeat（心跳）。

它表达的是：

```text
我还活着，我还能继续工作。
```

系统判断 Worker 是否可疑，并不是看 heartbeat 函数有没有返回，而是看：

```text
当前时间 - lastHeartbeatAt 是否超过阈值
```

如果 Worker 很久没有更新心跳，就说明它可能已经挂了、卡死了或失联了。

### 2.6 stale lock（过期锁）

day34 新增 `detectStaleJobs()`（检测过期任务锁）。

当前教学版逻辑是：

```text
如果任务 status = running
并且 lockedAt 距离当前时间超过 30 秒
就认为这个任务锁可能过期
然后把任务恢复成 retrying
```

也就是：

```text
now - lockedAt > 30_000
```

这解决的是：

```text
Worker 认领任务后如果挂了，任务不能永远卡在 running。
```

不过这个判断是教学版简化逻辑。真实系统里还需要结合 Worker heartbeat（工作进程心跳）或 lock renewal（锁续租）来判断，否则长任务可能会被误判。

### 2.7 Concurrency Metrics（并发指标）

day34 的 Dashboard（看板）新增并发指标：

```text
concurrency：配置的并发数
activeWorkers：正在工作的 Worker 数量
idleWorkers：空闲 Worker 数量
runningJobs：正在执行的任务数量
throughputPerMinute：每分钟吞吐量
avgJobDuration：平均任务耗时
```

这些指标让你能观察：

```text
WorkerPool 是否真的在并发跑任务？
当前有几个 Worker 忙？
系统吞吐量有没有提升？
```

---

## 3. 对比 day33 有什么改进

| 对比项 | day33 | day34 |
|---|---|---|
| 队列主题 | Queue Runtime V3（队列运行时 V3） | Queue Runtime V4（队列运行时 V4） |
| 核心问题 | 任务很多时，谁先执行、什么时候执行 | 多个任务能不能并发执行 |
| priority（优先级） | 支持 | 保留 |
| scheduledAt（计划执行时间） | 支持 | 保留 |
| retry / backoff（重试 / 退避） | 支持 | 保留 |
| dead letter（死信队列） | 支持 | 保留 |
| Worker 数量 | 1 个 | 默认 3 个 |
| WorkerPool（工作池） | 不支持 | 新增 |
| concurrency（并发数） | 不支持 | 新增 |
| claimNextJob（原子认领） | 不支持 | 新增 |
| job lock（任务锁） | 不支持 | 新增 |
| heartbeat（心跳） | 不支持 | 新增 |
| stale lock（过期锁） | 不支持 | 新增 |
| Concurrency Metrics（并发指标） | 不支持 | 新增 |

一句话概括：

```text
day33：让队列知道下一个任务该谁先跑。
day34：让多个 Worker 可以同时跑任务，并避免同一个任务被重复跑。
```

---

## 4. 为什么这样设计

真实后台任务系统里，单 Worker 很容易被长任务堵住。

例如：

```text
embedding 任务要跑 5 秒
reindex 任务要跑 10 秒
chat 任务只要 2 秒
```

如果只有一个 Worker：

```text
embedding 正在跑
chat 只能等
用户会感觉卡顿
```

如果有多个 Worker：

```text
worker_1 跑 embedding
worker_2 跑 chat
worker_3 跑 retrieval
```

用户等待时间就会明显下降。

但并发会带来新问题：

```text
多个 Worker 会不会拿到同一个任务？
Worker 挂了任务怎么办？
怎么知道 Worker 还活着？
怎么观察并发收益？
```

所以 day34 不是简单地“多开几个 Worker”，而是同时补了：

```text
claimNextJob（原子认领）
job lock（任务锁）
heartbeat（心跳）
stale lock（过期锁）
WorkerPool metrics（工作池指标）
Dashboard（看板）
```

这才像一个更完整的队列运行时。

---

## 5. 本次学习对话整理

### 问答 1：Worker 什么情况会挂？挂了后会不会补充新的 Worker？

**我问：**

> Worker 是什么情况会挂呢，挂了后会不会补充新的 Worker 呢？

**回答整理：**

Worker（工作进程）挂掉，通常有几类情况：

```text
代码异常导致进程崩溃
任务执行时卡死
机器重启
Node.js 进程被杀
内存爆了
外部依赖一直不返回
Worker 所在容器被平台回收
```

在 `ollama-chat-day34` 里，Worker 不是独立操作系统进程，而是 Next.js 服务进程里的内存对象：

```text
Next.js 进程
  └─ QueueRuntime
      └─ WorkerPool
          ├─ worker_1
          ├─ worker_2
          └─ worker_3
```

所以当前 day34 里的 Worker 挂掉更多是一个模拟概念。

如果整个 Next.js 进程挂了：

```text
所有 Worker 都没了。
```

当前 day34 不会自动补新的 Worker。只有服务重新启动时，`QueueRuntime` 构造函数会重新创建默认 3 个 Worker。

真实系统里，一般会由这些东西补 Worker：

```text
Supervisor（进程监督器）
PM2（Node.js 进程管理器）
systemd（Linux 服务管理器）
Kubernetes（容器编排平台）
```

所以结论是：

```text
day34：模拟 WorkerPool，不自动补 Worker。
真实生产：通常由进程管理器或容器平台补 Worker。
```

---

### 问答 2：lockedAt 超过 30 秒是哪个时间超过 30 秒？这种判断 Worker 挂掉的原理是什么？如果任务很复杂跑很久呢？

**我问：**

> lockedAt 超过 30 秒是哪个时间超过 30 秒来判断呢，这种方法判断 Worker 挂断的原理是什么，如果就是这个任务很复杂，跑很久呢？

**回答整理：**

判断逻辑是：

```text
当前时间 - 任务被 Worker 认领的时间 > 30 秒
```

也就是：

```ts
now - job.lockedAt > 30_000
```

`lockedAt` 是 Worker 调用 `claimNextJob(workerId)` 成功时写入的时间。

这个判断的原理是：

```text
Worker 拿到任务时写锁。
如果这个锁长期没有被释放，
系统就怀疑 Worker 可能挂了，
于是把任务恢复成 retrying，
让它以后能重新被认领。
```

但是，如果任务本来就很复杂，正常就要跑 60 秒，而 stale lock 设置为 30 秒，就可能误判：

```text
第 0 秒：worker_1 认领任务
第 30 秒后：系统发现 lockedAt 超过 30 秒
系统误以为 worker_1 挂了
任务被恢复成 retrying
worker_2 可能又拿到同一个任务
```

所以真实系统不能只靠 `lockedAt` 判断。

更合理的方式是结合：

```text
Worker heartbeat（工作进程心跳）
job heartbeat（任务心跳）
lock renewal（锁续租）
lease（租约）
```

真实判断更像：

```text
如果任务 running
并且负责它的 Worker 的 heartbeat 很久没有更新
才认为 Worker 可能挂了。
```

或者：

```text
如果任务 running
并且 job lock lease 已过期
并且 Worker 没有续租
才恢复任务。
```

所以 day34 的 `lockedAt > 30 秒` 是教学版简化模型，主要用于说明 stale lock（过期锁）恢复的概念。

---

### 问答 3：能不能默认 3 个 Worker，没空闲就新增，空闲一段时间再清理，只永久保留 3 个？

**我问：**

> 并发这么强，能不能默认 3 个 Worker，然后来任务判断有无 Worker 空闲，没有就新增个 Worker 来跑任务，然后过一段时间没事情的 Worker 就清理掉，只永久保留三个？

**回答整理：**

可以，而且这就是更高级的设计：

```text
Auto Scaling Worker Pool（自动扩缩容工作池）
```

你的设想可以抽象为：

```text
minWorkers = 3
maxWorkers = N
如果队列积压且没有空闲 Worker，就新增 Worker
如果 Worker 空闲一段时间，就回收
永久保留 3 个基础 Worker
```

策略大概是：

```text
默认启动 3 个 Worker
当 queuedJobs > 0 且 idleWorkers = 0 时，扩容
最多扩到 maxWorkers
当某些 Worker idle 超过 60 秒时，缩容
但不能低于 minWorkers = 3
```

伪代码：

```ts
if (queuedJobs > 0 && idleWorkers === 0 && workers.length < maxWorkers) {
  addWorker()
}

if (idleWorker.idleForMs > 60_000 && workers.length > minWorkers) {
  removeWorker(idleWorker)
}
```

但真实系统里要注意：

```text
不能无限新增 Worker，否则会打爆 CPU / 内存 / 数据库 / 模型服务。
必须设置 maxWorkers（最大 Worker 数）。
缩容时不能杀掉正在 running 的 Worker。
最好等 Worker idle 后再 stop。
扩容 / 缩容不要太频繁，需要 cooldown（冷却时间）。
不同任务类型可能需要不同 WorkerPool。
```

例如：

```text
chatWorkerPool：min 2，max 10
embeddingWorkerPool：min 1，max 3
reindexWorkerPool：min 0，max 1
```

这样可以避免低优先级大任务把高优先级聊天资源吃光。

所以后续可以升级成：

```text
Queue Runtime V5（队列运行时 V5）：
Auto Scaling Worker Pool（自动扩缩容工作池）
```

---

### 问答 4：Worker heartbeat 是看 heartbeat 函数没返回，还是看时间早很久？

**我问：**

> Worker heartbeat（工作进程心跳）来判断，是因为 Worker 挂时，是调用 heartbeat 函数没有返回，还是返回了个比当前时间早很久的情况来判断呢？

**回答整理：**

答案是后者：

```text
不是看 heartbeat 函数有没有返回，
而是看 Worker 最近一次成功更新的心跳时间，
距离当前时间是不是太久了。
```

判断类似：

```ts
const workerIsStale = Date.now() - worker.lastHeartbeatAt > 30_000
```

正常情况下，Worker 会定期执行：

```ts
lastHeartbeatAt = Date.now()
```

如果 Worker 挂了或卡死了：

```text
heartbeat 不再被定时调用
lastHeartbeatAt 停留在很久以前
```

系统检查时发现：

```text
当前时间 - 最后心跳时间 > 超时阈值
```

就判断 Worker 可能已经失联。

心跳判断的本质是：

```text
不是收到一个“我挂了”的信号，
而是长时间收不到“我还活着”的信号。
```

如果 Worker 没挂，但事件循环被同步重任务堵住，也会导致心跳无法更新。这时系统也会认为它不可用。

从队列系统角度看，这个判断也合理，因为它虽然没死，但已经不能及时响应。

---

### 问答 5：如果 Worker 挂了，为什么还能通过 info 拿到最后心跳时间？不是整个 Worker 信息都没了吗？

**我问：**

> Worker 如果是挂了，为什么还能通过 info 拿到它最后心跳时间呢，不应该整个 Worker 的信息都没了吗？

**回答整理：**

这个问题的关键是：

```text
能不能拿到最后心跳，取决于 Worker 和“记录心跳的地方”是不是同一个东西。
```

在 `ollama-chat-day34` 里，Worker 信息保存在内存里：

```text
Next.js 进程
  └─ QueueRuntime
      └─ WorkerPool
          ├─ worker_1.info
          ├─ worker_2.info
          └─ worker_3.info
```

如果只是某个 Worker 逻辑上卡住：

```text
worker_1 不再更新 heartbeat
但 WorkerPool 对象还在
worker_1.info 也还在
```

所以系统还能读到：

```text
worker_1.info.lastHeartbeatAt
```

但如果整个 Next.js 进程挂了：

```text
QueueRuntime 没了
WorkerPool 没了
worker_1 / worker_2 / worker_3 都没了
内存里的 info 也没了
```

这时候确实拿不到内存里的 `info`。

真实系统不会只把 heartbeat（心跳）放在 Worker 自己的内存里，而是会写到外部共享存储，比如：

```text
Redis（内存数据库）
Database（数据库）
etcd（分布式键值存储）
ZooKeeper（分布式协调服务）
Message Queue metadata（消息队列元数据）
Kubernetes API（容器编排平台接口）
```

真实结构更像：

```text
Worker 进程
  每秒写 heartbeat 到 Redis

Monitor / Scheduler 进程
  从 Redis 读 worker:lastHeartbeatAt
```

这样即使 Worker 进程挂了：

```text
Worker 自己没了
但 Redis 里还保留着它最后一次写入的 heartbeat
```

监控方还能看到：

```text
worker_1 最后一次心跳是 45 秒前
判定 worker_1 stale
释放它锁住的任务
```

所以心跳不是 Worker 挂了以后还在汇报，而是：

```text
Worker 挂之前最后一次汇报的时间，被外部系统保存了下来。
```

这也是生产系统里常见这些组件的原因：

```text
Worker Registry（工作进程注册表）
Worker Heartbeat Table（工作进程心跳表）
Worker Lease（工作进程租约）
Job Lock Table（任务锁表）
```

---

## 6. 第34天打卡

【第34天打卡】

1. 是否定义 WorkerInfo（工作进程信息）：是
2. 是否实现 WorkerPool（工作池）：是

3. 是否支持 concurrency（并发数）：是
4. 是否实现 claimNextJob（原子认领下一个任务）：是

5. 是否实现 job lock（任务锁）：是
6. 是否避免同一 job 被重复执行：是

7. Dashboard（看板）是否展示 Worker 状态：是
8. 是否增加 Concurrency Metrics（并发指标）：是

9. 是否完成 concurrency=1 vs 3 测试：是
10. 是否实现 heartbeat（心跳）/ stale lock（过期锁）检测：是

11. 遇到的最大问题：

当前 day34 使用的是教学版 stale lock（过期锁）判断：`now - lockedAt > 30 秒`。它可以说明“Worker 异常后任务不能永远卡在 running”的核心概念，但如果任务本身正常执行时间超过 30 秒，就可能被误判为过期锁。后续需要通过 Worker heartbeat（工作进程心跳）、job heartbeat（任务心跳）或 lock renewal（锁续租）来避免长任务被错误恢复。

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
+ claimNextJob（原子认领下一个任务）
+ job lock（任务锁）
+ workerId（认领任务的工作进程 ID）
+ lockedAt（任务锁定时间）
+ heartbeat（心跳）
+ lastHeartbeatAt（最近心跳时间）
+ stale lock detection（过期锁检测）
+ StaleRecovered（过期锁恢复时间线节点）
+ Concurrency Metrics（并发指标）
+ WorkerPool Dashboard（工作池看板）
```

---

## 7. 一句话总结

```text
Priority（优先级）解决“下一个谁先跑”；
Concurrency（并发）解决“能同时跑多少个”；
job lock（任务锁）解决“同一个任务不能被重复跑”；
heartbeat（心跳）和 stale lock（过期锁）解决“Worker 异常后任务如何恢复”。
```

---

## 8. 第 34 天总结

你第 34 天完成的是：

```text
🔥 Queue Runtime V4（队列运行时 V4）：Worker Pool（工作池）+ Concurrency（并发）
```

现在你的 Queue（队列）已经不是“一个 Worker（工作进程）慢慢跑”，而是支持：

```text
WorkerPool（工作池）
concurrency（并发数）
job lock（任务锁）
atomic claim（原子认领）
heartbeat（心跳）
stale lock recovery（过期锁恢复）
worker dashboard（工作进程看板）
concurrency metrics（并发指标）
```

这一步非常关键，因为你已经开始解决真实系统里的：

```text
throughput（吞吐量）
并发安全
任务锁
Worker 健康状态
```

---

## 9. 第 35 天学习计划：Queue Runtime V5（队列运行时 V5）：Rate Limit（速率限制）+ Resource Control（资源控制）

### 9.1 今日核心目标

让你的 WorkerPool（工作池）不只是“并发跑”，而是能控制资源消耗。

### 9.2 为什么第 35 天必须做这个？

现在你已经支持并发：

```text
Worker 1（工作进程 1）
Worker 2（工作进程 2）
Worker 3（工作进程 3）
```

但如果并发太高，会出现：

```text
Ollama（本地大模型服务）被打爆
MySQL（关系型数据库）连接过多
Embedding（嵌入向量）请求堆积
CPU（中央处理器）飙升
接口 timeout（超时）
```

所以真实系统必须有：

```text
Rate Limit（速率限制）
Resource Control（资源控制）
```

### 9.3 第 35 天最终效果

系统可以做到：

```text
embedding job（嵌入向量任务）：最多同时 2 个
workflow job（工作流任务）：最多同时 3 个
chat job（聊天任务）：最高 priority（优先级），但每秒最多 5 个
reindex job（重建索引任务）：最多同时 1 个
```

### 9.4 任务清单

#### 任务 1：给 Job（任务）增加 resourceType（资源类型）

新增：

```ts
type ResourceType =
  | "llm"           // 大语言模型
  | "embedding"     // 嵌入向量
  | "database"      // 数据库
  | "workflow"      // 工作流
  | "tool"          // 工具
```

Job 增加：

```ts
resourceType?: ResourceType
```

示例：

```json
{
  "type": "embedding",
  "resourceType": "embedding"
}
```

#### 任务 2：实现 ResourceLimiter（资源限制器）

新增：

```ts
class ResourceLimiter {
  private limits = new Map<ResourceType, number>()
  private active = new Map<ResourceType, number>()

  canRun(resourceType: ResourceType) {
    const limit = this.limits.get(resourceType) ?? Infinity
    const current = this.active.get(resourceType) ?? 0
    return current < limit
  }

  acquire(resourceType: ResourceType) {
    const current = this.active.get(resourceType) ?? 0
    this.active.set(resourceType, current + 1)
  }

  release(resourceType: ResourceType) {
    const current = this.active.get(resourceType) ?? 0
    this.active.set(resourceType, Math.max(0, current - 1))
  }
}
```

#### 任务 3：QueueManager（队列管理器）claim（认领）时检查资源

在 `claimNextJob`（原子认领下一个任务）中：

```ts
if (!resourceLimiter.canRun(job.resourceType)) {
  continue
}
```

claim 成功后：

```ts
resourceLimiter.acquire(job.resourceType)
```

执行结束后：

```ts
resourceLimiter.release(job.resourceType)
```

#### 任务 4：为不同 job 设置默认 resource（资源）

```ts
function inferResourceType(job: Job): ResourceType {
  if (job.type === "embedding") return "embedding"
  if (job.type === "workflow") return "workflow"
  if (job.type === "reindex") return "embedding"
  if (job.type === "chat") return "llm"

  return "tool"
}
```

#### 任务 5：实现 RateLimiter（速率限制器）

Rate Limit（速率限制）控制：

```text
单位时间内最多执行多少次
```

新增：

```ts
class RateLimiter {
  allow(key: string): boolean
}
```

最简单做法：

```text
Map<key, timestamp[]>（键值对：资源键 → 时间戳数组）
```

例如：

```text
llm（大语言模型）：每秒最多 5 次
embedding（嵌入向量）：每秒最多 2 次
```

#### 任务 6：claim 时检查 rate limit（速率限制）

```ts
if (!rateLimiter.allow(job.resourceType)) {
  continue
}
```

注意：

```text
资源并发限制 ≠ 频率限制
ResourceLimiter（资源限制器）：同时运行几个
RateLimiter（速率限制器）：每秒允许几个
```

#### 任务 7：Dashboard（看板）展示资源占用

展示：

```text
Resource Usage（资源占用）

llm（大语言模型）: 2 / 3
embedding（嵌入向量）: 1 / 2
workflow（工作流）: 3 / 3
database（数据库）: 0 / 5
```

#### 任务 8：Rate Limit Metrics（速率限制指标）

新增：

```ts
type RateLimitMetrics = {
  allowedCount: number                              // 允许通过次数
  blockedCount: number                              // 被阻塞次数
  blockedByResource: Record<string, number>         // 按资源类型被资源限制阻塞的次数
  blockedByRate: Record<string, number>             // 按资源类型被速率限制阻塞的次数
}
```

#### 任务 9：实现 blockedReason（阻塞原因）

如果 job 暂时不能运行，记录：

```ts
job.blockedReason = "resource_limit"   // 资源并发已满
```

或：

```ts
job.blockedReason = "rate_limit"       // 超过单位时间频率上限
```

Dashboard 显示：

```text
queued: waiting for embedding resource（排队中：等待 embedding 资源）
```

#### 任务 10：压测测试

创建：

```text
10 个 embedding jobs（嵌入向量任务）
```

设置：

```text
embedding concurrency limit（嵌入向量并发上限）= 2
```

观察：

```text
最多同时只有 2 个 embedding job running（运行中）
```

再测试：

```text
llm rate（大语言模型速率）= 2 / second（每秒 2 次）
```

观察：

```text
超过的 job 等待下一秒
```

### 9.5 第 35 天验收标准

1. 是否给 Job 增加 resourceType（资源类型）
2. 是否实现 ResourceLimiter（资源限制器）
3. claimNextJob 是否检查资源限制
4. 是否实现 inferResourceType（推断资源类型）
5. 是否实现 RateLimiter（速率限制器）
6. claimNextJob 是否检查 rate limit（速率限制）
7. Dashboard 是否展示 Resource Usage（资源占用）
8. 是否增加 Rate Limit Metrics（速率限制指标）
9. 是否记录 blockedReason（阻塞原因）
10. 是否完成资源限制压测

### 9.6 第 35 天打卡模板

【第35天打卡】

1. Job 是否支持 resourceType（资源类型）：是 / 否
2. 是否实现 ResourceLimiter（资源限制器）：是 / 否

3. claimNextJob 是否检查资源限制：是 / 否
4. 是否实现 inferResourceType（推断资源类型）：是 / 否

5. 是否实现 RateLimiter（速率限制器）：是 / 否
6. claimNextJob 是否检查 rate limit（速率限制）：是 / 否

7. Dashboard 是否展示 Resource Usage（资源占用）：是 / 否
8. 是否增加 Rate Limit Metrics（速率限制指标）：是 / 否

9. 是否记录 blockedReason（阻塞原因）：是 / 否
10. 是否完成资源限制压测：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

### 9.7 第 35 天核心认知

记住一句话：

```text
Worker Pool（工作池）提升吞吐（throughput），Rate Limit（速率限制）保证系统不会被自己打崩。
```

完成第 35 天后，你的系统会升级成：

```text
🔥 Queue Runtime V5（队列运行时 V5）：Rate Limit（速率限制）+ Resource Control（资源控制）
```
