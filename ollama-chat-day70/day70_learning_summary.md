# Day70 学习总结：Durable Agent Workflow Platform V1（持久化智能体工作流平台第 1 版）

## 本文记录范围

本文整理 `ollama-chat-day70` 项目完成后的学习型对话，记录：

- 我对 Day70 项目做了什么、运用了什么知识的提问。
- Day70 相比 Day69 的改进以及采用这些设计的原因。
- 使用装修、医院、网购、员工入职、市场研究和游戏存档等生活场景理解 Day70。
- 已完成状态的第 70 天打卡记录。

本文不记录创建目录、复制 Day69 业务代码、修改源代码、安装依赖、修复构建错误等工程操作过程。

---

## 一、对话一：读懂 `ollama-chat-day70` 项目

### 我的提问

> 带我来读懂 `ollama-chat-day70` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day69` 有什么改进，为什么这样子做，并且一些英文专业术语后面补充一个括号说明其中文名称或者中文描述。

### 回答整理

### 1. 一句话理解 Day70

`ollama-chat-day70` 在完整保留 Day69 Production Knowledge & RAG Platform（生产知识与检索增强生成平台）的基础上，新增了一套 Durable Workflow Runtime（持久化工作流运行时），让 Agent（智能体）执行复杂任务时能够记录版本、保存检查点、失败恢复、人工确认、取消和历史回放。

Day69 解决的是：

> Agent（智能体）如何安全地上传、索引、检索和引用知识？

Day70 解决的是：

> Agent（智能体）执行一个长时间、多步骤任务时，如何保证中断后不丢状态、不重复执行已经完成的步骤，并且可以审计整个过程？

因此 Day70 把系统升级为：

```text
Durable Agent Workflow Platform V1
（持久化智能体工作流平台第 1 版）
```

### 2. Day70 的整体架构

```text
Workflow Definition V2（工作流定义第 2 版）
        ↓
Workflow Execution（工作流执行实例）
        ↓
Durable Workflow Runtime（持久化工作流运行时）
        ↓
┌──────────────────────┬────────────────────┬──────────────────┐
State Store V2          Checkpoint Store      Event Store
（状态存储第 2 版）      （检查点存储）          （事件存储）
        ↓                       ↓                    ↓
Resume（恢复执行）      Recovery（故障恢复）   Replay（回放）
```

Day70 没有把工作流继续当成一个临时函数调用，而是把 Workflow Definition（工作流定义）、Workflow Execution（工作流执行实例）、Workflow State（工作流状态）、Checkpoint（检查点）和 Workflow Event（工作流事件）拆成了不同的正式资源。

### 3. Workflow Definition V2（工作流定义第 2 版）

Workflow Definition（工作流定义）表示：

> 这个工作流应该怎样执行？

它保存：

- `id`：跨版本稳定的工作流标识。
- `name`：工作流名称。
- `version`：不可覆盖的工作流版本。
- `steps`：当前版本冻结的步骤定义。
- `status`：`draft/testing/active/deprecated`，即草稿、测试中、活动和已弃用。
- `owner`：负责人。
- `createdAt/updatedAt`：创建和更新时间。

项目中同时定义了：

```text
research-flow V1：
research → draft → publish

research-flow V2：
research → draft → critic → approval → publish
```

V2 新增了 Critic Agent（批评审查智能体）和 HITL，Human-in-the-Loop（人工参与闭环）。

这里运用了 Versioned Resource（版本化资源）和 Immutable Definition（不可变定义）的思想：发布 V2 时不能直接覆盖 V1，否则使用 V1 启动的旧任务在恢复时可能突然多出步骤，导致执行语义和审计结果发生变化。

### 4. Workflow Execution V2（工作流执行实例第 2 版）

Workflow Execution（工作流执行实例）表示：

> 某一次具体执行现在进行到了哪里？

同一个 `research-flow V2` 可以被执行很多次，每一次都有独立的执行实例标识、输入、状态、当前步骤和历史指标。

执行实例保存：

- 使用的 `workflowVersion`，即冻结的工作流版本。
- 当前生命周期状态。
- `runtimeContextId` 和 `traceId`，用于运行时上下文和链路追踪。
- 本次执行输入。
- 当前执行或等待的步骤。
- 已经人工确认的步骤。
- Retry（重试）、Resume（恢复执行）和 Replay（回放）次数。
- 开始、更新和完成时间。
- 最近一次安全错误摘要。

Workflow Definition（工作流定义）类似一份菜谱；Workflow Execution（工作流执行实例）类似某一天实际按照这份菜谱做的一锅菜。

### 5. Workflow State Store V2（工作流状态存储第 2 版）

每个执行实例都会保存一份完整状态：

```ts
{
  executionId,
  currentSteps,
  completedSteps,
  failedSteps,
  outputs,
  checkpoints,
  version,
  updatedAt
}
```

它能够回答：

- 当前正在执行哪些步骤？
- 哪些步骤已经成功？
- 哪些步骤失败？
- 每个步骤产生了什么输出？
- 最近的可靠恢复位置在哪里？

这里运用了 State Machine（状态机）思想。执行实例可以处于：

```text
created（已创建）
running（运行中）
paused（已暂停）
waiting（等待人工确认）
completed（已完成）
failed（已失败）
cancelled（已取消）
```

`waiting` 和 `failed` 被明确区分：`waiting` 表示系统没有出错，只是在等待人工决策；`failed` 表示步骤实际执行失败，需要重试或者人工处理。

### 6. Checkpoint System（检查点系统）

Checkpoint（检查点）是 Day70 最核心的能力。

每当步骤成功、失败或者进入人工等待时，系统都会保存一条检查点：

```ts
{
  executionId,
  workflowVersion,
  stepId,
  status,
  output,
  error,
  timestamp,
  stateVersion
}
```

假设执行过程是：

```text
Research（研究）：完成
Draft（生成草稿）：完成
Critic（批评审查）：完成
服务中断
Approval（人工确认）：尚未执行
Publish（发布）：尚未执行
```

恢复时，系统通过 `completedSteps` 和 Checkpoint（检查点）知道前三个步骤已经完成，因此不会重新执行它们，而是从 `Approval` 继续。

这样可以避免：

- 重复调用模型。
- 重复发送消息。
- 重复创建订单。
- 重复写入数据库。
- 重复产生 Token Cost（令牌成本）。
- Non-determinism（非确定性）导致同一个模型步骤产生不同输出。

### 7. Durable Executor（持久化执行器）

Day70 的持久化执行流程是：

```text
读取指定 Workflow Version（工作流版本）
        ↓
创建 Workflow Execution（工作流执行实例）
        ↓
创建 RuntimeContext（运行时上下文）
        ↓
创建 Workflow State V2（工作流状态第 2 版）
        ↓
发布 workflow.created（工作流执行已创建）
        ↓
寻找尚未完成且 Dependency（依赖关系）已经满足的步骤
        ↓
执行 Step Handler（步骤处理器）
        ↓
保存 Step Output（步骤输出）
        ↓
保存 Checkpoint（检查点）
        ↓
发布 workflow.step_completed（工作流步骤已完成）
        ↓
继续下一步骤
```

选择下一步骤时使用了 DAG，Directed Acyclic Graph（有向无环图）的依赖调度思想：只执行尚未完成并且全部依赖步骤已经完成的步骤。

当前新的 Durable Runtime（持久化运行时）一次选择一个步骤执行，重点是保证可靠恢复。Day69 原有工作流执行器中的 Parallel Execution（并行执行）仍然保留，但还没有完全合并到新的持久化执行器中。

### 8. Resume（恢复执行）

恢复时系统会：

1. 读取 Workflow Execution（工作流执行实例）。
2. 读取 Workflow State V2（工作流状态第 2 版）。
3. 检查当前状态是否为 `paused/waiting/failed`。
4. 找到最近成功的 Checkpoint（检查点）。
5. 保留 `completedSteps` 和已经保存的输出。
6. 如果是失败恢复，只清除失败标记。
7. 发布 `workflow.resumed`，即工作流已经恢复。
8. 重新进入调度器。
9. 跳过已经成功的步骤，只运行剩余步骤。

因此 Resume（恢复执行）不等于 Restart（重新开始）：

```text
Restart（重新开始）：从 Step 1（步骤 1）重新运行。
Resume（恢复执行）：从最后一个可靠位置继续。
```

### 9. HITL，Human-in-the-Loop（人工参与闭环）

V2 中的 `approval` 步骤设置了：

```ts
requiresConfirmation: true
```

执行到这里时，系统不会直接继续，而是：

- 创建 `waiting` Checkpoint（等待检查点）。
- 将执行实例改为 `waiting`。
- 保存 `currentStepId = approval`。
- 发布 `workflow.paused`，即工作流已经暂停。
- 返回页面等待用户操作。

用户执行 Confirm & Resume（确认并恢复）以后：

- `approval` 被加入 `approvedStepIds`。
- 系统发布 `workflow.resumed`。
- 运行人工确认步骤。
- 继续运行 `publish`。

人工确认结果因此也成为了可审计、可恢复的正式执行状态。

### 10. Event Sourcing（事件溯源）

系统保存完整工作流生命周期事件：

```text
workflow.created
workflow.started
workflow.step_started
workflow.step_completed
workflow.step_failed
workflow.paused
workflow.resumed
workflow.completed
workflow.cancelled
```

每条事件都有递增的 `sequence`，即执行实例内的事件顺序号。

这意味着系统不只是保存：

```text
最终状态 = completed（已完成）
```

还保存：

```text
执行是怎样一步一步变成 completed（已完成）的？
```

Workflow Event Store（工作流事件存储）负责保存执行历史；EventBus（事件总线）负责把事件通知给 Trace（链路追踪）、Metrics（指标）、日志或者其他订阅者。

### 11. Replay（回放）、Resume（恢复执行）和 Retry（重试）的区别

| 能力 | 主要目的 | 是否继续执行 | 是否调用步骤处理器 |
| --- | --- | --- | --- |
| Resume（恢复执行） | 把未完成任务继续做完 | 是 | 是，只调用未完成步骤 |
| Replay（回放） | 调试和审计历史执行 | 否 | 否 |
| Retry（重试） | 再次执行失败步骤 | 是 | 是，只重试失败步骤 |

Replay（回放）直接读取：

- Event Timeline（事件时间线）。
- Checkpoint（检查点）。
- Step Output（步骤输出）。
- Recovery Point（恢复点）。

Replay（回放）不会重新调用模型，因此可以避免额外费用和 Non-determinism（非确定性）。

### 12. RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）

#### RuntimeContext（运行时上下文）

Day70 在统一运行时上下文中增加：

```ts
workflowContext = {
  workflowId,
  executionId,
  version,
  checkpointId
}
```

这样日志、事件、模型、工具和工作流状态可以通过同一条 Trace（追踪链路）关联起来。

#### EventBus（事件总线）

Day70 在已有统一事件系统中加入完整的工作流生命周期事件，使 Trace Subscriber（链路追踪订阅者）、Metrics Subscriber（指标订阅者）和其他模块能够观察工作流运行过程。

#### UnifiedRegistry（统一注册中心）

系统注册了：

- DurableWorkflowExecutor（持久化工作流执行器）。
- CheckpointStore（检查点存储）。
- WorkflowReplayEngine（工作流回放引擎）。
- WorkflowStateStoreV2（工作流状态存储第 2 版）。
- 不同版本的 Workflow Definition（工作流定义）。

这样工作流不再只是写死在一个执行函数里的内部逻辑，而成为可以被统一发现和替换的平台能力。

### 13. Workflow Explorer V2（工作流浏览器第 2 版）

Day70 新增 `/workflows` 页面，包含三个主要标签页：

- Workflow Catalog（工作流目录）：查看 V1/V2、状态、负责人和冻结步骤。
- Execution Explorer（执行浏览器）：查看执行状态、当前步骤、检查点，并执行恢复、确认、取消和回放。
- Replay Debug（回放调试）：查看事件时间线、输出、检查点和恢复位置。

页面还提供：

- 启动指定版本的持久化执行。
- 在可靠检查点后模拟服务中断。
- Resume（恢复执行）。
- Confirm & Resume（确认并恢复）。
- Replay（回放）。
- Cancel（取消）。

### 14. Workflow Metrics V2（工作流指标第 2 版）

系统增加了以下治理指标：

- `totalExecutions`：执行实例总数。
- `successRate`：成功率。
- `failureRate`：失败率。
- `averageDuration`：终态执行平均持续时间。
- `retryCount`：失败重试总次数。
- `resumeCount`：恢复执行总次数。
- `replayCount`：历史回放总次数。
- `checkpointCount`：检查点总数。
- `activeExecutions`：当前活动执行实例数量。

这些指标让系统不只知道“能不能执行”，还可以观察执行可靠性、恢复频率和检查点规模。

### 15. 相比 Day69 的主要改进

| 对比维度 | Day69 | Day70 |
| --- | --- | --- |
| 核心主题 | Production Knowledge & RAG Platform（生产知识与检索增强生成平台） | Durable Agent Workflow Platform（持久化智能体工作流平台） |
| 主要资源 | 知识库、文档、Chunk（文本片段）、向量、索引版本、引用 | 工作流定义、执行实例、状态、检查点、事件 |
| 版本能力 | Document Version（文档版本）和 Index Version（索引版本） | Workflow Definition Version（工作流定义版本） |
| 工作流状态 | 一个 Workflow（工作流）对象中混合步骤和状态 | Definition / Execution / State / Checkpoint（定义 / 执行实例 / 状态 / 检查点）分离 |
| 恢复能力 | 可以从保存的工作流快照继续 HITL（人工参与闭环） | 正式的 Resume（恢复执行）、失败重试和检查点恢复 |
| 审计能力 | Timeline（时间线）主要用于页面展示 | Event Sourcing（事件溯源）可以重建执行状态 |
| 回放能力 | 没有正式回放引擎 | 提供无副作用 Replay（回放） |
| 运行上下文 | 主要保存 `workflowId` | 增加 `executionId/version/checkpointId` |
| 治理页面 | Knowledge Governance Explorer（知识治理浏览器） | Workflow Explorer V2（工作流浏览器第 2 版） |
| 测试重点 | 索引、权限、引用、删除和一致性 | 版本、中断恢复、重试、HITL、回放和取消 |

Day70 没有删除 Day69 的知识平台，而是继续保留全部 Day69 能力。

能力演进可以概括为：

```text
Day68：让 Agent（智能体）会记忆。
Day69：让 Agent（智能体）会查知识。
Day70：让 Agent（智能体）能够长期可靠地执行复杂任务。
```

### 16. 为什么采用这些设计

#### Definition（定义）和 Execution（执行实例）分离

这样可以防止工作流升级破坏历史执行。如果直接修改 V1，旧任务恢复时可能突然多出一个 Critic Agent（批评审查智能体）步骤，导致执行语义变化。因此执行实例必须冻结 `workflowVersion`。

#### State Store（状态存储）和 Event Store（事件存储）同时存在

State Store（状态存储）适合快速回答“现在进行到哪里”；Event Store（事件存储）适合回答“为什么会变成现在这样”。只保存状态无法完整审计，只保存事件则每次查询都需要重放全部事件，因此二者一起使用更实用。

#### 每个步骤完成后立即保存 Checkpoint（检查点）

模型调用、外部 API（应用程序接口）、支付或者消息发送都可能产生 Side Effect（副作用）。如果服务重启后从头执行，可能造成重复扣款、重复发送和重复写入。因此步骤成功和检查点保存必须尽量靠近。

#### Replay（回放）不重新执行步骤

模型输出存在 Non-determinism（非确定性）。同一个 Prompt（提示词）再次调用模型，结果可能不同，而且会再次产生费用。因此审计回放优先使用历史输出，而不是重新调用模型。

### 17. 当前实现需要注意的限制

虽然项目名称中包含 Durable（持久化），但当前四个核心 Store（存储）实际使用的是内存 `Map`：

- WorkflowDefinitionStoreV2（工作流定义存储第 2 版）。
- WorkflowStateStoreV2（工作流状态存储第 2 版）。
- CheckpointStore（检查点存储）。
- WorkflowEventStore（工作流事件存储）。

因此当前实现更准确地说是：

> 已经完整实现 Durable Workflow（持久化工作流）的领域模型和恢复算法，但存储后端仍然是教学用内存实现。

`stopAfterStepId` 也是故障模拟，并不是真正杀死进程后再启动。

要升级为真正的生产版本，还需要：

- 使用 MySQL/PostgreSQL（关系型数据库）持久化状态、检查点和事件。
- 使用 Redis Lease（Redis 租约）或者 Distributed Lock（分布式锁）防止多个 Worker（工作进程）同时执行同一实例。
- 使用 Transaction（事务）保证输出、检查点和状态原子写入。
- 使用 Outbox Pattern（事务消息表模式）可靠发布生命周期事件。
- 增加 Worker Heartbeat（工作进程心跳）和超时重新领取。
- 将 Parallel DAG Execution（并行有向无环图执行）完整合并到新的持久化运行时。
- 真正执行 `retryLimit`；当前主要通过手动 `resumeWorkflow` 完成失败重试。

---

## 二、对话二：使用生活场景理解 Day70

### 我的提问

> 能举一些生活上的例子来说明 Day70 主要弄什么吗？

### 回答整理

可以把 Day70 理解为：

> 给一个需要很长时间才能完成的任务，准备一本不会因为停电、换人或者升级流程而丢失进度的工作记录册。

### 1. 装修房子的例子

装修流程可能是：

```text
设计方案
  ↓
拆除旧装修
  ↓
水电改造
  ↓
业主验收
  ↓
铺砖刷墙
  ↓
最终交付
```

#### Workflow Definition（工作流定义）

上面的装修步骤就是工作流定义，表示装修应该按照什么流程进行。

可能存在两个版本：

```text
装修流程 V1：
设计 → 拆除 → 水电 → 铺砖 → 交付

装修流程 V2：
设计 → 拆除 → 水电 → 业主验收 → 铺砖 → 交付
```

V2 新增了“业主验收”。已经按照 V1 开工的老房子不能施工到一半突然强行加入 V2 的新步骤；新房子可以采用 V2。这对应 Workflow Version（工作流版本）。

#### Workflow Execution（工作流执行实例）

装修流程 V2 只是模板。张三家的装修和李四家的装修是两个不同的 Workflow Execution（工作流执行实例）：

```text
张三家：水电已经完成，正在等待业主验收。
李四家：刚刚完成设计，准备开始拆除。
```

它们使用同一份流程，但进度、输出和状态不同。

#### Checkpoint（检查点）

每完成一个阶段就记录一次检查点：

```text
设计完成：设计图已经保存。
拆除完成：垃圾已经清运。
水电完成：电路图、管线照片和验收数据已经保存。
```

如果施工队换人，新施工队可以查看最近的 Checkpoint（检查点），从水电之后继续，不需要重新拆房和重新铺电线。

#### HITL，Human-in-the-Loop（人工参与闭环）

进行到业主验收时，系统不能自动继续：

```text
水电完成
  ↓
等待业主确认
  ↓
业主确认通过
  ↓
继续铺砖
```

这对应 Day70 中的：

```text
waiting（等待人工确认）
  ↓
Confirm & Resume（确认并恢复）
  ↓
running（运行中）
```

#### Replay（回放）

如果最终发现插座位置不对，可以回放整个装修过程：

- 谁提交了设计图？
- 什么时候完成拆除？
- 水电步骤使用了哪个流程版本？
- 业主什么时候确认？
- 确认前保存了哪些照片？

Replay（回放）只查看历史记录，不会真的再拆一次房子。

### 2. 医院做手术的例子

一次治疗流程可能是：

```text
挂号
  ↓
检查
  ↓
医生诊断
  ↓
患者签字确认
  ↓
手术
  ↓
术后观察
```

对应关系如下：

| 医院场景 | Day70 能力 |
| --- | --- |
| 标准治疗流程 | Workflow Definition（工作流定义） |
| 某位患者的治疗过程 | Workflow Execution（工作流执行实例） |
| 检查报告和诊断结果 | Step Output（步骤输出） |
| 检查完成记录 | Checkpoint（检查点） |
| 等待患者签字 | HITL（人工参与闭环） |
| 医院系统重启后继续 | Resume（恢复执行） |
| 调查治疗过程 | Replay（回放） |
| 患者终止治疗 | Cancel（取消） |

如果患者已经完成检查，医院系统突然重启：

```text
没有 Day70：
系统不知道进行到了哪里，可能要求患者重新检查。

有 Day70：
读取检查完成的 Checkpoint（检查点），
发现挂号和检查已经完成，
直接从医生诊断继续。
```

### 3. 网购订单的例子

订单流程是：

```text
创建订单
  ↓
付款
  ↓
仓库拣货
  ↓
打包
  ↓
发货
  ↓
确认收货
```

假设订单付款成功后服务器崩溃。

如果没有 Checkpoint（检查点），恢复后可能再次执行付款：

```text
第一次扣款成功
服务器重启
重新从付款开始
发生第二次扣款
```

Day70 会保存付款步骤的成功状态、交易标识和金额。恢复后执行器发现 `completedSteps` 已经包含付款步骤，所以不会再次扣款，而是从仓库拣货继续。

这就是 Durable Execution（持久化执行）的实际价值：

> 不是简单地重新运行，而是保证已经成功的事情不再重复做。

### 4. 公司员工入职的例子

入职流程可能是：

```text
提交个人资料
  ↓
HR（人力资源部门）审核
  ↓
创建公司账号
  ↓
主管确认岗位权限
  ↓
开通系统权限
  ↓
领取电脑
```

如果主管一直没有确认，流程应该进入 `waiting`，即等待状态，而不是 `failed`，即失败状态。因为系统没有出错，只是在等待人作出决定。

主管确认后：

```text
workflow.resumed（工作流已经恢复）
  ↓
开通系统权限
  ↓
领取电脑
```

如果员工取消入职，执行实例进入 `cancelled`，即已取消状态，但之前的审核记录仍然保留，不能直接删除，否则以后无法审计发生过什么。

### 5. 市场研究报告的例子

这个例子与项目中的 `research-flow` 最接近：

```text
Research（资料研究）
  ↓
Draft（生成草稿）
  ↓
Critic Agent（批评审查智能体）
  ↓
HITL Approval（人工确认）
  ↓
Publish（发布）
```

执行到 Critic Agent（批评审查智能体）以后，服务突然重启。系统已经保存：

```text
Research：completed（已完成）
Draft：completed（已完成）
Critic：completed（已完成）
Approval：pending（等待执行）
Publish：pending（等待执行）
```

重新启动后：

- 不会重新搜索资料。
- 不会重新生成草稿。
- 不会重新调用 Critic Agent（批评审查智能体）。
- 直接进入 Approval（人工确认）。

这样可以节省模型调用费用、执行时间、搜索 API（应用程序接口）次数、Token Cost（令牌成本）和人工重复审核成本。

如果最终报告存在问题，可以执行 Replay（回放）：

- Research（资料研究）找到了什么资料？
- Draft（生成草稿）使用了哪些研究输出？
- Critic Agent（批评审查智能体）给出了什么结论？
- 谁批准了发布？
- 最终使用的是工作流 V1 还是 V2？

### 6. 游戏存档的例子

Day70 也可以理解成大型游戏的自动存档系统：

```text
Workflow Definition（工作流定义）
= 游戏关卡设计

Workflow Execution（工作流执行实例）
= 当前正在玩的这一局

Step（步骤）
= 一个游戏关卡

Step Output（步骤输出）
= 获得的装备和任务物品

Checkpoint（检查点）
= 自动存档点

Resume（恢复执行）
= 从最近存档继续

Replay（回放）
= 查看历史录像

Workflow Version（工作流版本）
= 游戏 V1/V2 版本

HITL（人工参与闭环）
= 等待玩家选择是否进入下一关

Cancel（取消）
= 放弃当前任务
```

没有 Day70，就像游戏从来不保存：

```text
玩了三个小时
游戏崩溃
重新从第一关开始
```

有 Day70：

```text
读取最近存档
已完成关卡不再重复
从崩溃前的可靠位置继续
```

因此 Day70 最生活化的理解是：

> 它为 Agent（智能体）的复杂任务增加了流程版本、任务档案、自动存档、断点续跑、人工确认和历史录像。

---

## 三、Day70 核心知识点总结

Day70 主要运用了以下知识：

- Durable Execution（持久化执行）：中断以后从可靠位置继续，而不是从头运行。
- Workflow Versioning（工作流版本管理）：新版本不覆盖旧版本执行语义。
- State Machine（状态机）：管理创建、运行、等待、暂停、完成、失败和取消状态。
- DAG，Directed Acyclic Graph（有向无环图）：通过依赖关系决定步骤执行顺序。
- Checkpoint（检查点）：保存步骤结果和可靠恢复位置。
- Event Sourcing（事件溯源）：保存导致状态变化的全部事件。
- Replay（回放）：使用历史事件和输出重建执行过程。
- HITL，Human-in-the-Loop（人工参与闭环）：在关键步骤等待人工确认。
- RuntimeContext（运行时上下文）：串联工作流、执行实例、版本、检查点和追踪链路。
- EventBus（事件总线）：向日志、指标和订阅者发布生命周期事件。
- UnifiedRegistry（统一注册中心）：统一注册工作流定义、执行器、检查点存储和回放引擎。
- Defensive Copy（防御性复制）：通过结构化复制避免外部对象意外修改存储内部状态。
- Fault Injection（故障注入）：模拟步骤失败和服务中断，验证恢复逻辑。
- Observability（可观测性）：通过 Metrics（指标）、Trace（链路追踪）和 Event Timeline（事件时间线）观察执行过程。

Day70 最重要的一句话是：

> 普通 Workflow（工作流）关注任务怎样执行；生产 Workflow（生产工作流）关注执行过程中的任何时刻都不能丢失状态。

---

## 四、第 70 天打卡

【第70天打卡】

1. 是否定义 Workflow Definition V2（工作流定义第 2 版）：是

2. 是否实现 Workflow Version（工作流版本）：是

3. 是否接入 UnifiedRegistry（统一注册中心）：是

4. 是否定义 Workflow Execution Instance（工作流执行实例）：是

5. 是否实现 Workflow State Store V2（工作流状态存储第 2 版）：是

6. 是否实现 Checkpoint System（检查点系统）：是

7. 是否实现 Durable Executor（持久化执行器）：是

8. 是否支持 Workflow Resume（工作流恢复执行）：是

9. 是否支持 Workflow Replay（工作流回放）：是

10. 是否实现 Workflow Event Sourcing（工作流事件溯源）：是

11. 是否实现 Workflow Explorer V2（工作流浏览器第 2 版）：是

12. 是否增加 Workflow Metrics V2（工作流指标第 2 版）：是

13. Workflow（工作流）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是

14. 是否完成 Durable Workflow Test（持久化工作流测试）：是

15. 遇到的最大问题：

如何在不重复执行已完成步骤的前提下，统一处理 Workflow Version Upgrade（工作流版本升级）、服务中断、步骤失败、HITL Waiting（人工确认等待）、恢复执行和历史审计。最终通过把 Workflow Definition（工作流定义）、Workflow Execution（工作流执行实例）、Workflow State（工作流状态）、Checkpoint（检查点）和 Workflow Event（工作流事件）分层建模，并在每个步骤完成后保存输出、状态和检查点来解决。当前仍需要注意，核心 Store（存储）是内存实现，真正生产化还需要接入数据库、事务、分布式锁和可靠事件发布机制。

16. 当前系统能力：

系统已经具备 Durable Agent Workflow Platform V1（持久化智能体工作流平台第 1 版）的完整教学型能力：支持不可覆盖的 Workflow Definition Version（工作流定义版本）、独立 Workflow Execution Instance（工作流执行实例）、Workflow State Store V2（工作流状态存储第 2 版）、成功/失败/等待 Checkpoint（检查点）、Durable Executor（持久化执行器）、服务中断恢复、失败重试、HITL Confirm & Resume（人工确认并恢复）、Cancel（取消）、无副作用 Replay（回放）、Workflow Event Sourcing（工作流事件溯源）、Workflow Metrics V2（工作流指标第 2 版）和 Workflow Explorer V2（工作流浏览器第 2 版）。工作流生命周期已经接入 RuntimeContext（运行时上下文）、EventBus（事件总线）和 UnifiedRegistry（统一注册中心），同时完整继承 Day68 Production Memory Platform（生产记忆平台）与 Day69 Production Knowledge & RAG Platform（生产知识与检索增强生成平台）的业务能力，并完成版本升级、中断恢复、检查点恢复、人工确认、历史回放和取消等 Durable Workflow Test（持久化工作流测试）。

---

## 五、Day70 最终认知

```text
Day68：Agent（智能体）能够记住长期经验。
Day69：Agent（智能体）能够查询和引用生产知识。
Day70：Agent（智能体）能够长期、可靠、可恢复、可审计地执行复杂任务。
```

完成 Day70 后，当前系统已经从“能够运行工作流”进一步升级为“能够记录工作流为什么运行到这里，并且从最近可靠位置继续运行”。

---

## 六、Day70 阶段性总结：Agent（智能体）执行层升级完成

首先，恭喜完成 Day70。

这一天完成了整个 Agent Platform（智能体平台）最核心的执行层升级：

```text
Production Upgrade V7（生产化升级第 7 版）
Durable Workflow Platform V1（持久化工作流平台第 1 版）
```

如果说：

```text
Day68：让 Agent（智能体）记得住。
Day69：让 Agent（智能体）找得到知识。
Day70：让 Agent（智能体）可靠执行复杂任务。
```

那么当前 Agent（智能体）已经同时具备：

```text
Memory（记忆能力）
   +
Knowledge（知识能力）
   +
Durable Execution（持久化执行能力）
```

这三种能力是 Production-Grade Agent System（生产级智能体系统）区别于普通 Chatbot（聊天机器人）的关键。

### 1. Day70 之前的 Workflow（工作流）

原有工作流更接近：

```text
User Request（用户请求）
        ↓
Planner（规划器）
        ↓
DAG，Directed Acyclic Graph（有向无环图）
        ↓
Executor（执行器）
        ↓
Result（结果）
```

它已经能够支持：

- Step Decomposition（步骤拆分）。
- Parallel Execution（并行执行）。
- Conditional Branch（条件分支）。
- HITL，Human-in-the-Loop（人工参与闭环）。
- Retry（重试）。

但是当发生以下情况时，还需要进一步回答状态是否会丢失：

- Service Restart（服务重启）。
- Worker Crash（工作进程崩溃）。
- Network Interruption（网络中断）。
- Long-Running Task（长时间运行任务）执行数小时甚至数天。

### 2. Day70 之后的 Workflow（工作流）

Day70 将执行体系升级为：

```text
Workflow Definition（工作流定义）
        ↓
Workflow Version（工作流版本）
        ↓
Execution Instance（执行实例）
        ↓
State Store（状态存储）
        ↓
Checkpoint（检查点）
        ↓
Event Log（事件日志）
        ↓
Resume / Replay（恢复执行 / 历史回放）
```

### 3. 最大升级点一：Workflow（工作流）与 Execution（执行实例）分离

以前的 Workflow（工作流）既代表流程定义，也承载运行状态。

Day70 将二者拆开：

```text
Workflow Definition（工作流定义）
= 应该怎样执行

Workflow Execution（工作流执行实例）
= 某一次实际运行
```

这类似于数据库中的：

```text
Table Schema（数据表结构）
     +
Row Data（行数据）
```

Table Schema（数据表结构）描述数据应该具有什么字段；Row Data（行数据）表示某一条具体记录。工作流定义与执行实例分离以后，流程升级不会破坏旧任务的运行和审计。

### 4. 最大升级点二：Durable Execution（持久化执行）

每完成一个 Step（步骤），系统立即保存 Checkpoint（检查点）。

例如 Research Report Workflow（研究报告工作流）：

```text
Step 1：搜索资料完成
Checkpoint（检查点）已保存

Step 2：分析论文完成
Checkpoint（检查点）已保存

Step 3：撰写报告时服务器重启
```

服务恢复后不会从 Step 1（步骤 1）重新开始，而是读取已经保存的状态和检查点，从 Step 3（步骤 3）继续。

### 5. 最大升级点三：Event Sourcing（事件溯源）

工作流不再只保存当前状态，还保存完整历史：

```text
workflow.started（工作流已开始）
workflow.step_started（步骤已开始）
workflow.step_completed（步骤已完成）
workflow.step_failed（步骤已失败）
workflow.paused（工作流已暂停）
workflow.resumed（工作流已恢复）
workflow.completed（工作流已完成）
```

因此系统未来可以回答：

> 为什么这个 Agent（智能体）最后得到这个结果？

回答这个问题时，可以沿着 Event Timeline（事件时间线）、Checkpoint（检查点）、Step Output（步骤输出）和 Trace（链路追踪）还原整个执行过程。

---

## 七、当前 Agent Platform（智能体平台）整体进度

### Phase 1：Agent Runtime（智能体运行时）

```text
Agent Runtime（智能体运行时） ██████████████████████████ 100%
```

### Phase 2：Infrastructure（基础设施）

```text
Redis（内存数据存储）          ██████████
Queue（任务队列）              ██████████
Lock（分布式锁）               ██████████
Storage（存储系统）            ██████████
Config（配置中心）             ██████████
Secrets（密钥管理）            ██████████
```

### Phase 3：Production Upgrade（生产化升级）

```text
Runtime Context（运行时上下文）       ██████████
Event System（事件系统）               ██████████
Registry（统一注册中心）               ██████████
Prompt Platform（提示词平台）          ██████████
Memory Platform（记忆平台）            ██████████
Knowledge Platform（知识平台）         ██████████
Workflow Platform（工作流平台）        ██████████
Evaluation Platform（评估平台）        ░░░░░░░░░░
```

按照当前学习路线估算，Agent Platform（智能体平台）的整体进度约为：

```text
99.7%
```

Day71 将补齐 Evaluation Platform（评估平台），让系统从“具备各项生产能力”进一步升级为“能够持续评估和改进这些能力”。

---

## 八、Day71 学习计划：Production Evaluation Platform V2（生产评估平台第 2 版）

### 1. Day71 主题

```text
Production Upgrade V8（生产化升级第 8 版）
Production Evaluation Platform V2（生产评估平台第 2 版）
```

Day71 的核心目标是：

> 把 Evaluation（评估）从单次评分工具升级为贯穿整个 Agent（智能体）生命周期的质量控制平台。

### 2. 为什么需要 Day71

此前系统已经实现了多组评估相关能力。

#### Day45：Evaluation Framework（评估框架）

- EvaluationAgent（评估智能体）。
- `evaluateOutput`（评估输出函数）。
- Evaluation Timeline（评估时间线）。
- Metrics（指标）。

#### Day46：Regression Evaluation（回归评估）

- Evaluation Dataset（评估数据集）。
- Bad Case（坏案例）。
- Baseline（基线版本）。
- Candidate（候选版本）。
- Quality Gate（质量门禁）。

#### Day53：Prompt Experiment（提示词实验）

- Prompt A/B Test（提示词 A/B 对照测试）。
- Winner Selection（优胜版本选择）。

但是这些能力目前仍然比较分散。生产系统需要把以下模块全部纳入统一 Evaluation Loop（评估闭环）：

```text
Agent（智能体）
Workflow（工作流）
Prompt（提示词）
Model（模型）
Tool（工具）
RAG，Retrieval-Augmented Generation（检索增强生成）
Memory（记忆）
```

### 3. Day71 最终架构

```text
                    Evaluation Platform（评估平台）
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
Online Evaluation      Offline Evaluation    Regression Evaluation
（在线评估）              （离线评估）             （回归评估）
          ↓                   ↓                   ↓
Trace（链路追踪）      Dataset（数据集）      Quality Gate（质量门禁）
          └───────────────────┼───────────────────┘
                              ↓
                 Improvement Loop（改进闭环）
                              ↓
           Prompt / Model / Workflow（提示词 / 模型 / 工作流）
```

Day71 最终希望形成：

```text
Observe（观察）
   ↓
Evaluate（评估）
   ↓
Diagnose（诊断）
   ↓
Improve（改进）
   ↓
Validate（验证）
```

---

## 九、Day71 任务清单

### 任务 1：定义 Evaluation Platform Core（评估平台核心）

新增 EvaluationRun（评估运行实例）：

```ts
type EvaluationRun = {
  id: string;
  type:
    | "online"
    | "offline"
    | "regression"
    | "experiment";
  datasetId?: string;
  status:
    | "created"
    | "running"
    | "completed"
    | "failed";
  runtimeContextId?: string;
  traceIds: string[];
  score: number;
  startedAt: number;
  completedAt?: number;
};
```

状态与类型含义：

- `online`：Online Evaluation（在线评估），对生产请求进行采样评估。
- `offline`：Offline Evaluation（离线评估），在固定数据集上运行评估。
- `regression`：Regression Evaluation（回归评估），比较新旧版本质量变化。
- `experiment`：Experiment Evaluation（实验评估），用于提示词、模型或策略实验。

为什么需要 EvaluationRun（评估运行实例）？

以前一次 Evaluation（评估）可能只是一个结果；现在一次评估需要成为一场完整运行。例如 Prompt V1 Evaluation Run（提示词第 1 版评估运行）和 Prompt V2 Evaluation Run（提示词第 2 版评估运行）可以被独立保存、追踪和比较。

### 任务 2：统一 Evaluation Dataset V2（评估数据集第 2 版）

以前 Evaluation Dataset（评估数据集）主要服务于 Prompt Experiment（提示词实验）。Day71 将其升级为平台级数据集：

```ts
type EvaluationDatasetV2 = {
  id: string;
  name: string;
  type:
    | "agent"
    | "workflow"
    | "prompt"
    | "rag"
    | "memory";
  cases: EvaluationCase[];
  version: number;
  status:
    | "draft"
    | "active"
    | "archived";
};
```

数据集需要支持：

- Agent Dataset（智能体评估数据集）。
- Workflow Dataset（工作流评估数据集）。
- Prompt Dataset（提示词评估数据集）。
- RAG Dataset（检索增强生成评估数据集）。
- Memory Dataset（记忆评估数据集）。

### 任务 3：实现 Evaluation Runner V2（评估执行器第 2 版）

新增统一 EvaluationRunner（评估执行器），负责执行：

```text
Input（输入）
   ↓
Runtime（运行时）
   ↓
Trace（链路追踪）
   ↓
Evaluator（评估器）
   ↓
Evaluation Result（评估结果）
```

例如测试 Research Agent（研究智能体）时，Evaluation Runner（评估执行器）需要自动创建或关联：

- RuntimeContext（运行时上下文）。
- Trace（链路追踪）。
- Usage（用量与成本）。
- EvaluationResult（评估结果）。

### 任务 4：实现 Multi-Dimension Evaluation（多维度评估）

评估结果不能只返回一个总分：

```ts
{
  score: 8
}
```

需要升级为：

```ts
type EvaluationScore = {
  correctness: number;
  relevance: number;
  completeness: number;
  safety: number;
  latency: number;
  cost: number;
  overall: number;
};
```

各维度含义：

- `correctness`：Correctness（正确性）。
- `relevance`：Relevance（相关性）。
- `completeness`：Completeness（完整性）。
- `safety`：Safety（安全性）。
- `latency`：Latency（响应延迟）。
- `cost`：Cost（调用成本）。
- `overall`：Overall Score（综合评分）。

例如正确性为 9、完整性为 5、成本得分为 3，说明问题可能不是模型知识能力不足，而是 Prompt（提示词）太长、检索上下文过多或者输出约束不完整。

### 任务 5：实现 Evaluation Strategy Registry（评估策略注册中心）

评估策略需要接入 UnifiedRegistry（统一注册中心），注册：

- CorrectnessEvaluator（正确性评估器）。
- CitationEvaluator（引用质量评估器）。
- RAGEvaluator（检索增强生成评估器）。
- WorkflowEvaluator（工作流评估器）。
- MemoryEvaluator（记忆评估器）。
- SafetyEvaluator（安全评估器）。

未来新增 Evaluator（评估器）时，不需要修改 Runtime（运行时）核心逻辑，只需要实现统一协议并注册新策略。

### 任务 6：Trace（链路追踪）自动关联 Evaluation（评估）

当前 Trace（链路追踪）已经可以关联：

- Prompt Version（提示词版本）。
- Model（模型）。
- Tool（工具）。
- Memory（记忆）。
- Knowledge（知识）。

Day71 新增：

```ts
trace.evaluation = {
  evaluationRunId,
  score,
  evaluatorVersions
};
```

这样一次生产请求就能形成完整的质量链路：执行使用了什么提示词、模型、工具、记忆和知识，以及最终获得了什么评估结果。

### 任务 7：实现 Online Evaluation（在线评估）

生产请求数量很大，不能全部交给人工评估。因此需要 Sampling（采样）：

```text
1000 次生产请求
        ↓
抽取 5%
        ↓
自动执行 Evaluation（评估）
```

还可以通过风险条件触发评估：

```ts
if (
  latency > threshold
  || userFeedback < 3
) {
  evaluate();
}
```

即当 Latency（延迟）超过阈值，或者 User Feedback（用户反馈）低于 3 分时，自动进入评估流程。

### 任务 8：实现 Feedback Loop（反馈闭环）

新增用户反馈：

- 👍：正向反馈。
- 👎：负向反馈。
- `rating`：评分。
- `comment`：文字评论。

反馈需要进入 Evaluation Dataset（评估数据集），形成：

```text
线上失败
   ↓
Bad Case（坏案例）
   ↓
Dataset（评估数据集）
   ↓
Regression Test（回归测试）
   ↓
修复与改进
```

这样线上问题不会只停留在日志中，而会自动沉淀成未来必须通过的测试案例。

### 任务 9：升级 Quality Gate V2（质量门禁第 2 版）

Quality Gate V2（质量门禁第 2 版）需要支持多个维度。

例如发布新的 Prompt（提示词）版本时，要求：

```text
overall（综合评分） >= baseline（基线评分）

AND（并且）

correctness（正确性）不能下降

AND（并且）

high priority case pass rate（高优先级案例通过率） = 100%

AND（并且）

cost（成本）增长不超过 20%
```

只有全部条件通过，候选版本才能晋级或发布。

### 任务 10：实现 Evaluation Explorer V2（评估浏览器第 2 版）

前端需要增加以下主要区域。

#### Evaluation Runs（评估运行列表）

展示：

- Run ID（评估运行标识）。
- Type（评估类型）。
- Dataset（评估数据集）。
- Score（评分）。
- Duration（持续时间）。

#### Case Analysis（案例分析）

展示：

- Input（输入）。
- Output（实际输出）。
- Expected（期望输出）。
- Score（评分）。
- Trace（链路追踪）。

#### Regression（回归比较）

展示：

- Baseline（基线版本）。
- Candidate（候选版本）。
- Improved Cases（改进案例）。
- Regressed Cases（退化案例）。
- Failed Cases（失败案例）。

#### Quality Gate（质量门禁）

展示：

- PASS / FAIL（通过 / 失败）。
- Reasons（判断原因）。

### 任务 11：增加 Evaluation Metrics V2（评估指标第 2 版）

```ts
type EvaluationMetrics = {
  totalRuns: number;
  successRate: number;
  avgScore: number;
  avgLatency: number;
  avgCost: number;
  regressionCount: number;
  badCaseCount: number;
  qualityGateFailCount: number;
  evaluatorUsage: number;
};
```

指标含义：

- `totalRuns`：评估运行总数。
- `successRate`：评估成功率。
- `avgScore`：平均综合评分。
- `avgLatency`：平均响应延迟。
- `avgCost`：平均调用成本。
- `regressionCount`：回归评估次数。
- `badCaseCount`：坏案例数量。
- `qualityGateFailCount`：质量门禁失败次数。
- `evaluatorUsage`：评估器调用次数。

### 任务 12：接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）

#### RuntimeContext（运行时上下文）

新增：

```ts
evaluationContext = {
  runId,
  datasetId,
  evaluatorVersions,
  scores
};
```

#### EventBus（事件总线）

新增事件：

```text
evaluation.started（评估已开始）
evaluation.case_completed（单个评估案例已完成）
evaluation.completed（评估运行已完成）
quality_gate.failed（质量门禁未通过）
quality_gate.passed（质量门禁已通过）
bad_case.created（坏案例已创建）
```

#### UnifiedRegistry（统一注册中心）

注册：

- EvaluationRunner（评估执行器）。
- Evaluator（评估器）。
- QualityGate（质量门禁）。
- DatasetProvider（数据集提供者）。

### 任务 13：完成 Production Evaluation Test（生产评估测试）

#### Case 1：Agent Evaluation（智能体评估）

运行 Research Agent（研究智能体），验证系统生成独立 EvaluationRun（评估运行实例），并关联 RuntimeContext（运行时上下文）和 Trace（链路追踪）。

#### Case 2：Prompt Regression（提示词回归评估）

```text
Prompt V1（提示词第 1 版）作为 Baseline（基线版本）
Prompt V2（提示词第 2 版）作为 Candidate（候选版本）
```

比较两个版本在正确性、完整性、延迟和成本等维度的变化。

#### Case 3：RAG Evaluation（检索增强生成评估）

使用 10 个知识问题进行测试，验证：

- Citation（引用）是否正确和完整。
- Correctness（正确性）是否达到要求。
- 检索结果是否来自正确的知识库和活动索引版本。

#### Case 4：Workflow Evaluation（工作流评估）

测试 Day70 的失败恢复流程，重点评估：

- 已完成步骤是否被重复执行。
- Checkpoint（检查点）是否正确保存。
- Resume（恢复执行）是否从可靠位置继续。
- Event Timeline（事件时间线）是否完整。

最终给出 Reliability Score（可靠性评分）。

#### Case 5：Bad Case Loop（坏案例闭环）

模拟低分输出，验证：

```text
低分结果
   ↓
Bad Case（坏案例）
   ↓
Evaluation Dataset（评估数据集）
   ↓
后续 Regression Test（回归测试）
```

---

## 十、Day71 验收标准

1. 是否定义 EvaluationRun（评估运行实例）。
2. 是否升级 EvaluationDataset V2（评估数据集第 2 版）。
3. 是否实现 EvaluationRunner V2（评估执行器第 2 版）。
4. 是否支持 Multi-Dimension Evaluation（多维度评估）。
5. 是否实现 Evaluation Strategy Registry（评估策略注册中心）。
6. Trace（链路追踪）是否关联 Evaluation（评估）。
7. 是否实现 Online Evaluation（在线评估）。
8. 是否实现 Feedback Loop（反馈闭环）。
9. 是否升级 Quality Gate V2（质量门禁第 2 版）。
10. 是否实现 Evaluation Explorer V2（评估浏览器第 2 版）。
11. 是否增加 Evaluation Metrics V2（评估指标第 2 版）。
12. Evaluation（评估）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
13. 是否完成 Production Evaluation Test（生产评估测试）。

---

## 十一、Day71 打卡模板

【第71天打卡】

1. 是否定义 EvaluationRun（评估运行实例）：是 / 否

2. 是否升级 EvaluationDataset V2（评估数据集第 2 版）：是 / 否

3. 是否实现 EvaluationRunner V2（评估执行器第 2 版）：是 / 否

4. 是否支持 Multi-Dimension Evaluation（多维度评估）：是 / 否

5. 是否实现 Evaluation Strategy Registry（评估策略注册中心）：是 / 否

6. Trace（链路追踪）是否关联 Evaluation（评估）：是 / 否

7. 是否实现 Online Evaluation（在线评估）：是 / 否

8. 是否实现 Feedback Loop（反馈闭环）：是 / 否

9. 是否升级 Quality Gate V2（质量门禁第 2 版）：是 / 否

10. 是否实现 Evaluation Explorer V2（评估浏览器第 2 版）：是 / 否

11. 是否增加 Evaluation Metrics V2（评估指标第 2 版）：是 / 否

12. Evaluation（评估）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是 / 否

13. 是否完成 Production Evaluation Test（生产评估测试）：是 / 否

14. 遇到的最大问题：


15. 当前系统能力：


---

## 十二、Day71 核心认知

Day71 最重要的一句话是：

> 优秀的 Agent（智能体）不是靠一次调试出来的，而是靠持续 Evaluation（评估）、Regression（回归验证）和 Improvement（改进）迭代出来的。

完成 Day71 后，系统将形成：

```text
Prompt Platform（提示词平台）
       +
Memory Platform（记忆平台）
       +
Knowledge Platform（知识平台）
       +
Workflow Platform（工作流平台）
       +
Evaluation Platform（评估平台）
```

这些平台共同形成：

```text
Agent Continuous Improvement Loop
（智能体持续改进闭环）
```

完整闭环是：

```text
Observe（观察生产行为）
   ↓
Evaluate（评估质量）
   ↓
Diagnose（诊断问题）
   ↓
Improve（改进提示词、模型、工作流或知识）
   ↓
Validate（使用回归测试和质量门禁验证）
   ↓
重新进入生产环境并继续观察
```

---

## 十三、Day72 预告：Observability Platform（可观测平台）

Day72 将进入最后一个主要模块：

```text
Observability Platform（可观测平台）
```

目标是把以下能力统一起来：

- Trace（链路追踪）。
- Metrics（指标）。
- Logs（日志）。
- Alerts（告警）。
- Dashboard（仪表盘）。

完成后，系统将不仅能够运行、记忆、查询知识、可靠执行和持续评估，还将具备真正面向生产运维的监控、诊断与告警能力。

按照当前学习路线，距离 Agent Platform V1.0（智能体平台第 1.0 版）只剩最后两个学习日。
