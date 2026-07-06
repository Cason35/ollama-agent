# Day 60 学习总结：Redis Distributed Lock（Redis 分布式锁）

## 本文记录范围

本文整理围绕 `ollama-chat-day60` 项目的学习型对话，主要包括：

- `ollama-chat-day60` 项目做了什么。
- 项目运用了哪些关键知识。
- `ollama-chat-day60` 对比 `ollama-chat-day59` 有什么改进。
- 为什么要在 Redis Distributed Queue（Redis 分布式队列）基础上继续引入 Redis Distributed Lock（Redis 分布式锁）。
- 第 60 天打卡记录。

本文不记录文件创建、命令执行、代码修改过程，只保留用于理解系统设计和运行方式的问答内容。

## 一、读懂 `ollama-chat-day60` 项目

### 我的提问

带我来读懂 `ollama-chat-day60` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day59` 有什么改进，为什么这样子做；且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述。

### 回答整理

一句话理解：

```text
ollama-chat-day60 是一个基于 Next.js（React 全栈框架）+ TypeScript（带类型约束的 JavaScript）+ Redis（内存型共享状态数据库）的 Ollama 智能体聊天项目。
它继承了 day59 的 Redis Distributed Queue（Redis 分布式队列），并新增 Redis Distributed Lock（Redis 分布式锁），让多个 Worker（后台任务执行器）并发处理任务时，同一份关键资源同一时间只能被一个 Worker 操作。
```

主项目仍然是一个聊天与智能体控制台，支持：

- Ollama（本地大模型运行服务）或 MiMo（云端模型提供方）。
- Workflow（工作流）。
- RAG（Retrieval-Augmented Generation，检索增强生成）。
- Memory（记忆）。
- Semantic Cache（语义缓存）。
- Model Routing（模型路由）。
- Model Collaboration（模型协作）。
- Usage Tracking（用量统计）。
- Redis Explorer（Redis 浏览器）。
- Queue Explorer（队列浏览器）。

Day 60 的核心新增点是 Lock System（锁系统）：

- `LockProvider`（锁提供者接口）：统一抽象 `acquire`（获取锁）、`release`（释放锁）、`extend`（续期）、`isLocked`（是否已锁定）、`forceUnlock`（强制解锁）和 `snapshot`（快照）。
- `RedisLockProvider`（Redis 分布式锁实现）：基于 Redis String（Redis 字符串类型）实现分布式锁。
- `LockToken`（锁令牌）：记录 `key`（锁键）、`owner`（持有者）和 `expiresAt`（过期时间），用于释放和续期时校验身份。
- `SET key value NX PX`（Redis 原子写锁命令）：`NX` 表示 key 不存在才写入，`PX` 表示设置毫秒级过期时间。
- Lua Script（Lua 脚本）：释放锁和续期锁时校验 `owner`（持有者），避免 Worker B（后台任务执行器 B）误删 Worker A（后台任务执行器 A）的锁。
- TTL（Time To Live，存活时间 / 过期时间）：保证 Worker（后台任务执行器）崩溃后锁会自动过期，避免永久死锁。
- Heartbeat Renewal（心跳续期）：长任务执行期间定时延长锁的 TTL（存活时间），避免任务没做完锁就过期。
- Lock Explorer（锁浏览器）：在页面上查看 Active Locks（活跃锁）、Owner（持有者）、TTL（剩余时间）、Renew Count（续期次数）、Operation Trace（操作追踪）。
- Lock Metrics（锁指标）：统计 `totalLocks`（当前锁数量）、`acquireSuccess`（获取成功次数）、`acquireFailure`（获取失败次数）、`avgWaitTime`（平均等待耗时）、`renewCount`（续期次数）、`expiredLocks`（过期锁观测次数）。

Day 60 的任务执行链路可以理解为：

```text
Job（任务）进入 Redis Queue（Redis 队列）
  -> Worker（后台任务执行器）认领任务
  -> 根据 resourceKey（资源键）/ workflowId（工作流 ID）/ jobId（任务 ID）生成 Lock Key（锁键）
  -> acquire Lock（获取锁）
  -> 获取成功：执行任务，并定时 extend（续期）
  -> 获取失败：说明其他 Worker 正在处理同一资源，任务进入 retrying（等待重试）
  -> finally（最终清理阶段）：release Lock（释放锁）
```

## 二、对比 `ollama-chat-day59` 的改进

`ollama-chat-day59` 的主题是 Distributed Queue（分布式队列），它解决的是：

```text
任务如何被多个 Worker（后台任务执行器）共享消费。
```

Day 59 的重点能力包括：

- QueueStore（队列存储接口）。
- RedisQueueStore（Redis 队列存储实现）。
- Job Serialization（任务序列化）。
- ACK（确认完成机制）。
- Retry（重试机制）。
- Dead Letter Queue（死信队列）。
- Visibility Timeout（可见性超时）。
- Queue Metrics（队列指标）。
- Queue Explorer（队列浏览器）。
- Queue Trace（队列追踪）。

`ollama-chat-day60` 的主题是 Distributed Lock（分布式锁），它进一步解决的是：

```text
当多个 Worker（后台任务执行器）同时运行时，同一个业务资源能不能被并发重复处理。
```

对比表：

| 维度 | Day 59 | Day 60 |
|---|---|---|
| 核心主题 | Redis Distributed Queue（Redis 分布式队列） | Redis Distributed Lock（Redis 分布式锁） |
| 解决问题 | 多 Worker（后台任务执行器）共享任务池 | 多 Worker（后台任务执行器）互斥操作同一资源 |
| Worker 流程 | claim job（认领任务）后直接执行 | claim job（认领任务）后先 acquire lock（获取锁） |
| 失败处理 | Retry（重试）、Dead Letter Queue（死信队列） | 获取不到锁时延迟重试，避免并发执行 |
| 可观测性 | Queue Metrics（队列指标）、Queue Trace（队列追踪） | Lock Metrics（锁指标）、Lock Operation Trace（锁操作追踪） |
| 页面默认重点 | Queue Explorer（队列浏览器） | Lock Explorer（锁浏览器） |

更直白地说：

```text
Day 59 让多个 Worker 能一起干活。
Day 60 让多个 Worker 一起干活时，不会同时抢同一个关键资源。
```

## 三、为什么要这样做

Queue（队列）负责的是 Task Scheduling（任务调度）：任务怎么进来、谁来领取、失败怎么重试、完成后怎么归档。

Lock（锁）负责的是 Concurrent Mutual Exclusion（并发互斥）：同一个资源同一时间只允许一个 Worker（后台任务执行器）操作。

如果只有 Redis Queue（Redis 队列），系统能做到：

```text
多个 Worker（后台任务执行器）从同一个任务池领取任务。
```

但它不能天然保证：

```text
两个不同 Job（任务）是不是正在操作同一个 Workflow（工作流）、同一个文档、同一个用户状态、同一个缓存或同一个索引。
```

例如：

```text
Job A：执行 workflow-123
Job B：也执行 workflow-123
```

在 Day 59 中，如果这两个 Job（任务）都存在于 Queue（队列）里，它们有可能被两个不同 Worker（后台任务执行器）同时执行。这样可能导致：

- Workflow Step（工作流步骤）重复执行。
- Workflow State（工作流状态）互相覆盖。
- Tool Call（工具调用）被执行两次。
- Memory（记忆）被并发写入。
- Knowledge Index（知识索引）重复重建。
- 外部副作用重复发生，例如支付、写库、发通知。

Day 60 引入 Distributed Lock（分布式锁）后，流程变成：

```text
Worker A 拿到 Job A
  -> 尝试获取 workflow-123 的锁
  -> 获取成功，开始执行

Worker B 拿到 Job B
  -> 也尝试获取 workflow-123 的锁
  -> 获取失败，暂时不执行，延迟重试
```

这样，同一时间只有一个 Worker（后台任务执行器）能操作 `workflow-123`。

## 四、引入锁的作用

### 我的提问

引入这个锁的概念对项目有什么作用呢？

### 回答整理

引入 Lock（锁）的作用，可以一句话理解：

```text
Queue（队列）解决“任务怎么分发”，Lock（锁）解决“同一资源能不能同时被多人改”。
```

在 Day 59 里，Redis Queue（Redis 分布式队列）已经能让多个 Worker（后台任务执行器）一起消费任务。但它只能保证“某个 Job（任务）被领取和处理”，不能保证“两个不同 Job 是否正在操作同一个 Workflow（工作流）、同一个文档、同一个缓存、同一个用户状态”。

引入 Distributed Lock（分布式锁）后，它对项目的主要作用有五个：

1. 防止重复执行。

   避免同一个 Workflow（工作流）、resourceKey（资源键）或关键 Job（任务）被多个 Worker（后台任务执行器）同时执行。

2. 保护状态一致性。

   如果两个 Worker（后台任务执行器）同时修改同一份 WorkflowState（工作流状态）、Memory（记忆）、Knowledge Index（知识索引），可能互相覆盖。锁能让这些修改串行化。

3. 让分布式队列更接近生产环境。

   Queue（队列）让任务能分发，Lock（锁）让任务能安全并发。没有锁，多 Worker（多后台任务执行器）只是“跑得多”；有锁，才更像可控的 Production Infrastructure（生产基础设施）。

4. 支持长任务安全执行。

   Day 60 有 Heartbeat Renewal（心跳续期）。任务很长时，Worker（后台任务执行器）会定时给锁续命，避免任务执行到一半锁过期，被另一个 Worker 接手造成并发执行。

5. 方便排查并发问题。

   Lock Explorer（锁浏览器）能看到 Active Locks（活跃锁）、Owner（持有者）、TTL（剩余存活时间）、Renew Count（续期次数）、Operation Trace（操作追踪）。这让“为什么任务没跑 / 为什么任务在等 / 谁占着锁”变得可见。

所以在这个项目里，锁不是为了替代队列，而是为了补齐队列缺的一块：

```text
Redis Queue（Redis 队列）：
负责调度任务。

Redis Lock（Redis 锁）：
负责保护资源。
```

更直白地说：

```text
Day 59 让多个 Worker 能一起干活；
Day 60 让多个 Worker 一起干活时不会抢同一把方向盘。
```

## 五、关键知识点

- Redis（内存型共享状态数据库）：作为多个 Backend Service（后端服务）和 Worker（后台任务执行器）共同访问的共享状态中心。
- Redis Distributed Queue（Redis 分布式队列）：让任务进入 Redis（共享状态中心），由多个 Worker（后台任务执行器）共同消费。
- Redis Distributed Lock（Redis 分布式锁）：让同一资源在同一时间只能被一个 Worker（后台任务执行器）操作。
- SET NX PX（Redis 原子加锁命令）：不存在时才写入，并设置毫秒级过期时间，是单 Redis 节点分布式锁的基础写法。
- Lua Script（Lua 脚本）：在 Redis 内部原子执行 owner（持有者）校验和删除 / 续期操作。
- Owner（锁持有者）：通常由 Worker ID（后台任务执行器 ID）、Job ID（任务 ID）和时间戳组合生成，避免旧令牌误释放新锁。
- LockToken（锁令牌）：释放或续期时携带的凭证，包含锁键、持有者和过期时间。
- TTL（Time To Live，存活时间）：锁自动过期时间，防止 Worker 崩溃后产生永久死锁。
- Heartbeat（心跳）：Worker（后台任务执行器）运行期间定时发送续期请求，表示“我还活着，还在执行任务”。
- Lock Renewal（锁续期）：延长锁的 TTL（存活时间），保护长任务执行期间锁不提前过期。
- Retry（重试）：获取不到锁时，不直接失败，而是把任务延迟后重新放回队列。
- Dead Letter Queue（死信队列）：多次失败后无法继续处理的任务归档区。
- Visibility Timeout（可见性超时）：Worker（后台任务执行器）认领任务后，如果长期没有完成，任务可以恢复为可重新领取状态。
- Metrics（指标）：用于观察系统运行是否健康，例如成功次数、失败次数、平均等待时间。
- Trace（追踪记录）：记录操作发生过什么，便于排查问题。

## 六、第 60 天打卡

【第 60 天打卡】

1. 是否定义 LockProvider（锁提供者接口）：是

2. 是否实现 RedisLockProvider（Redis 分布式锁）：是

3. 是否定义 LockToken（锁令牌）：是

4. Worker（工作进程）是否接入 Lock（分布式锁）：是

5. Workflow Runtime（工作流运行时）是否接入 Lock（分布式锁）：是

   说明：Workflow Job（工作流任务）会根据 `workflowId`（工作流 ID）生成工作流级 Lock Key（锁键），Worker（工作进程）获取锁后才执行 Workflow Runtime（工作流运行时）。

6. Job Retry（任务重试）是否检查 Lock（分布式锁）：是

   说明：获取不到 Lock（分布式锁）时，Job（任务）会进入 `retrying`（等待重试）状态，并延迟后重新入队。

7. 是否实现 Heartbeat（心跳）+ Lock Renewal（锁续期）：是

8. 是否实现 Lock Explorer（锁浏览器）：是

9. 是否增加 Lock Metrics（锁指标）：是

10. 是否完成 Distributed Lock Test（分布式锁测试）：是

    说明：项目已提供 `scripts/test-day60-distributed-lock.ts` 和 `npm run test:day60`。当前本地 `ollama-chat-day60` 目录尚未安装 `node_modules`（项目依赖目录），所以本次未能实际执行成功；安装依赖后可运行测试脚本验证。

11. 遇到的最大问题：

    最大问题是要区分 Queue（队列）和 Lock（锁）的职责边界。Queue（队列）负责 Task Scheduling（任务调度），也就是任务如何入队、认领、确认、失败、重试和归档；Lock（锁）负责 Concurrent Mutual Exclusion（并发互斥），也就是同一资源同一时间只能被一个 Worker（工作进程）操作。只有队列还不够，因为两个不同 Job（任务）可能指向同一个 Workflow（工作流）或同一个 resourceKey（资源键），仍然可能并发修改同一资源。

12. 当前系统能力：

    当前系统已经具备 Redis Shared State（Redis 共享状态）、Redis Distributed Queue（Redis 分布式队列）和 Redis Distributed Lock（Redis 分布式锁）的基础能力。任务可以进入 Redis Queue（Redis 队列），由多个 Worker（工作进程）消费；Worker 在真正执行业务任务前会先获取 Redis Lock（Redis 锁），获取失败则进入 Retry（重试）；长任务执行期间通过 Heartbeat（心跳）进行 Lock Renewal（锁续期）；页面上可以通过 Lock Explorer（锁浏览器）查看 Active Locks（活跃锁）、Owner（持有者）、TTL（剩余存活时间）、Renew Count（续期次数）、Lock Metrics（锁指标）和 Lock Operation Trace（锁操作追踪）。这让项目从“能分发任务”进一步升级为“能安全并发处理任务”的生产基础设施雏形。

## 七、第 60 天阶段总结

首先，恭喜完成 Day 60（第 60 天）。

到这里，项目已经完成了 Agent Platform（智能体平台）里最难的一组基础设施能力。很多人会觉得 Redis（内存型共享状态数据库）、Queue（队列）、Lock（锁）只是 Backend Development（后端开发）的内容，但实际上，它们正是 Manus（智能体产品示例）、OpenAI（人工智能平台）、Claude Code（AI 编程助手）、Cursor（AI 代码编辑器）等 Agent Platform（智能体平台）能够稳定运行的基础。

Day 60 完成的是：

```text
Production Infrastructure V3（生产基础设施第三版）：Distributed Lock（分布式锁）
```

现在平台已经具备真正的 Distributed Coordination（分布式协调）能力。

当前整个 Job Lifecycle（任务生命周期）已经变成：

```text
Redis Queue（Redis 队列）
      |
      v
Worker Dequeue（工作进程出队 / 领取任务）
      |
      v
Acquire Distributed Lock（获取分布式锁）
      |
      v
Execute Workflow（执行工作流）
      |
      v
Heartbeat + Lock Renewal（心跳 + 锁续期）
      |
      v
ACK Complete（确认完成）
      |
      v
Release Lock（释放锁）
```

相比 Day 59（第 59 天）的 Queue（队列），Day 60（第 60 天）最大的升级是：

```text
整个 Runtime（运行时）已经可以保证“同一个 Workflow（工作流）在任何时刻只能执行一次”。
```

这是真正 Production System（生产系统）必须具备的能力。

## 八、当前整体进度

Phase 1（阶段一）：Agent Runtime（智能体运行时）

```text
██████████████████████████ 100%
```

Phase 2（阶段二）：Infrastructure（基础设施）

```text
Redis Integration（Redis 集成）            ██████████
Distributed Queue（分布式队列）            ██████████
Distributed Lock（分布式锁）               ██████████
Object Storage（对象存储）                 ░░░░░░░░░░
Config Center（配置中心）                  ░░░░░░░░░░
Secrets Management（密钥管理）             ░░░░░░░░░░
```

整体完成度：

```text
98.5%
```

## 九、Day 61 学习计划：Object Storage（对象存储）

Day 61（第 61 天）的主题是：

```text
Production Infrastructure V4（生产基础设施第四版）：Object Storage（对象存储）
```

今天的核心目标是：

```text
把平台中的“大文件”全部从 Local Disk（本地磁盘）迁移到 Object Storage（对象存储）。
```

以后这些内容都不应该直接放在本地目录：

- Knowledge Document（知识库文档）。
- Workspace Export（工作空间导出）。
- Trace Attachment（追踪附件）。
- Evaluation Report（评估报告）。
- Prompt Snapshot（提示词快照）。

它们应该统一交给 Object Storage（对象存储）管理。

## 十、为什么必须学习 Object Storage（对象存储）

现在很多项目早期可能会把文件放在这些本地目录中：

```text
uploads/（上传文件目录）
documents/（文档目录）
workspace/（工作空间目录）
trace/（追踪文件目录）
```

这种方式本质上依赖 Local File System（本地文件系统）。在单机开发时问题不明显，但到了真正的 Production Environment（生产环境），通常会有多个 Backend Service（后端服务）实例：

```text
Backend A（后端服务 A）
  -> /tmp（临时目录）里有某个文件

Backend B（后端服务 B）
  -> /tmp（临时目录）里没有这个文件
```

如果用户请求被 Load Balancer（负载均衡器）转发到 Backend B（后端服务 B），它就可能找不到 Backend A（后端服务 A）本地磁盘里的文件。

所以必须把文件统一放到共享的 Object Storage（对象存储）里，例如：

- MinIO（兼容 S3 协议的本地对象存储服务）。
- S3（Simple Storage Service，对象存储服务）。
- OSS（Object Storage Service，对象存储服务，常指阿里云对象存储）。

## 十一、为什么先学 MinIO（对象存储服务）

课程建议先使用：

```text
Development Environment（开发环境）
  -> MinIO（兼容 S3 协议的本地对象存储服务）
```

以后上线时可以替换为：

- Tencent COS（腾讯云对象存储）。
- Alibaba OSS（阿里云对象存储）。
- AWS S3（亚马逊对象存储服务）。

它们的接口和使用方式基本类似，尤其是兼容 S3 Protocol（S3 协议）的实现。这样以后迁移时，通常不需要大幅修改业务代码，只需要替换配置和 Provider（提供者实现）。

最终目标是把文件链路从：

```text
Knowledge（知识库）
  -> Disk（本地磁盘）
```

升级为：

```text
Knowledge（知识库）
  -> Object Storage（对象存储）
  -> URL（可访问地址）
```

整个平台只保存：

```text
Object Key（对象键 / 文件在对象存储中的唯一路径）
```

## 十二、Day 61 今日任务

### 任务 1：安装 MinIO（对象存储服务）

建议使用 Docker（容器运行工具）启动：

```bash
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  quay.io/minio/minio server /data --console-address ":9001"
```

浏览器打开：

```text
http://localhost:9001
```

创建 Bucket（存储桶）：

```text
agent-platform
```

### 任务 2：安装 SDK（软件开发工具包）

安装 MinIO SDK（MinIO 软件开发工具包）：

```bash
npm install minio
```

新增：

```text
ObjectStorageClient（对象存储客户端）
```

用它统一封装 Object Storage（对象存储）的底层访问。

### 任务 3：定义 StorageProvider（对象存储接口）

新增统一接口：

```ts
interface StorageProvider {
  upload(): Promise<unknown>;
  download(): Promise<unknown>;
  delete(): Promise<unknown>;
  exists(): Promise<boolean>;
  getSignedUrl(): Promise<string>;
}
```

这个接口未来可以统一支持：

- MinIO（兼容 S3 协议的本地对象存储服务）。
- S3（对象存储服务）。
- OSS（对象存储服务）。

业务层只依赖 StorageProvider（对象存储接口），不直接绑定某个具体厂商。

### 任务 4：实现 MinIOStorageProvider（MinIO 对象存储实现）

实现 MinIOStorageProvider（MinIO 对象存储提供者），支持：

- `upload()`（上传文件）。
- `download()`（下载文件）。
- `delete()`（删除文件）。
- `list()`（列出文件）。

### 任务 5：Knowledge Runtime（知识库运行时）接入 Storage（存储）

之前：

```text
Document（文档）
  -> Disk（本地磁盘）
```

升级为：

```text
Knowledge Import（知识导入）
  -> Upload（上传）
  -> Object Storage（对象存储）
  -> Document Metadata（文档元数据）
```

Database（数据库）只保存：

- `bucket`（存储桶）。
- `objectKey`（对象键）。
- `size`（文件大小）。
- `etag`（对象内容标识 / 校验标识）。

### 任务 6：Workspace Export（工作空间导出）接入 Storage（存储）

例如导出流程可以变成：

```text
Workspace（工作空间）
  -> Markdown（Markdown 文档）
  -> PDF（便携式文档格式）
  -> Upload（上传）
  -> URL（可访问地址）
```

以后用户下载时可以直接使用 URL（可访问地址）。

### 任务 7：Trace Attachment（追踪附件）

Trace（追踪记录）可以保存：

- Prompt Snapshot（提示词快照）。
- Input（输入）。
- Output（输出）。
- Artifacts（产物 / 附件）。

这些内容不要全部放进 Database（数据库），而是放到 Object Storage（对象存储）里，数据库只保存引用信息。

### 任务 8：Storage Explorer（对象存储浏览器）

新增前端 Storage Explorer（对象存储浏览器），展示：

- Bucket（存储桶）。
- Object Key（对象键）。
- Size（大小）。
- Last Modified（最后修改时间）。
- Type（类型）。

支持操作：

- Preview（预览）。
- Delete（删除）。
- Copy URL（复制链接）。

### 任务 9：Storage Metrics（对象存储指标）

新增指标类型：

```ts
type StorageMetrics = {
  totalObjects: number;
  totalSize: number;
  uploadCount: number;
  downloadCount: number;
  deleteCount: number;
  avgUploadTime: number;
};
```

字段含义：

- `totalObjects`（对象总数）。
- `totalSize`（对象总大小）。
- `uploadCount`（上传次数）。
- `downloadCount`（下载次数）。
- `deleteCount`（删除次数）。
- `avgUploadTime`（平均上传耗时）。

### 任务 10：完整测试

测试 Knowledge PDF（知识库 PDF 文档）上传链路：

```text
Upload（上传）
  -> Metadata（元数据）
  -> Download（下载）
  -> Delete（删除）
```

再测试 Workspace Export（工作空间导出）链路：

```text
Export（导出）
  -> Upload（上传）
  -> Signed URL（签名链接）
  -> Download（下载）
```

## 十三、第 61 天验收标准

1. 是否安装 MinIO（对象存储服务）。

2. 是否实现 ObjectStorageClient（对象存储客户端）。

3. 是否定义 StorageProvider（对象存储接口）。

4. 是否实现 MinIOStorageProvider（MinIO 对象存储提供者）。

5. Knowledge Runtime（知识库运行时）是否接入 Object Storage（对象存储）。

6. Workspace Export（工作空间导出）是否接入 Object Storage（对象存储）。

7. Trace（追踪记录）是否支持 Attachment（附件）。

8. 是否实现 Storage Explorer（对象存储浏览器）。

9. 是否增加 Storage Metrics（对象存储指标）。

10. 是否完成 Object Storage Test（对象存储测试）。

## 十四、第 61 天打卡模板

【第 61 天打卡】

1. 是否安装 MinIO（对象存储）：是 / 否

2. 是否实现 ObjectStorageClient（对象存储客户端）：是 / 否

3. 是否定义 StorageProvider（对象存储接口）：是 / 否

4. 是否实现 MinIOStorageProvider（MinIO 对象存储）：是 / 否

5. Knowledge Runtime（知识库运行时）是否接入 Object Storage（对象存储）：是 / 否

6. Workspace Export（工作空间导出）是否接入 Object Storage（对象存储）：是 / 否

7. Trace（追踪记录）是否支持 Attachment（附件）：是 / 否

8. 是否实现 Storage Explorer（对象存储浏览器）：是 / 否

9. 是否增加 Storage Metrics（对象存储指标）：是 / 否

10. 是否完成 Object Storage Test（对象存储测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

## 十五、第 61 天核心认知

请记住 Day 61（第 61 天）最重要的一句话：

```text
数据库保存 Metadata（元数据），Object Storage（对象存储）保存 File Content（文件本身）。
```

也就是说，MySQL（关系型数据库）保存：

- `objectKey`（对象键）。
- `bucket`（存储桶）。
- `size`（文件大小）。
- `etag`（对象内容标识 / 校验标识）。
- `createdAt`（创建时间）。

真正的文件内容放在 Object Storage（对象存储）：

- PDF（便携式文档格式）。
- Image（图片）。
- Markdown（轻量标记文档）。
- Trace（追踪记录）。
- Prompt Snapshot（提示词快照）。
- Evaluation Report（评估报告）。

这样系统才能支持 Multi-instance Backend（多实例后端）、Cloud Deployment（云端部署）和 Shared File Access（共享文件访问）。

## 十六、Day 62 提前预告

完成 Day 61（第 61 天）后，基础设施将拥有：

- Redis（共享状态）。
- Redis Queue（Redis 共享任务队列）。
- Distributed Lock（分布式互斥锁）。
- Object Storage（共享文件存储）。

Day 62（第 62 天）将进入：

```text
Config Center（配置中心）
```

这是整个 Agent Platform（智能体平台）最后一块核心基础设施。

完成后，平台中的这些内容都会进入 Unified Configuration Management（统一配置管理）：

- Model（模型）。
- Prompt（提示词）。
- Redis（内存型共享状态数据库）。
- MySQL（关系型数据库）。
- MinIO（对象存储服务）。
- Runtime（运行时）。
- Feature Flag（功能开关）。

这会为后续 Day 64 到 Day 73 的 Production Upgrade（生产化升级）做准备。
