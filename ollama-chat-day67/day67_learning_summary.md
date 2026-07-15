# Day67 学习总结：Production Prompt Platform（生产级提示词平台）

## 本文记录范围

本文整理 `ollama-chat-day67` 项目完成后的学习型对话，包含：

- 项目整体做了什么。
- 项目运用了哪些知识。
- Day67 对比 Day66 有什么改进。
- Day67 对比 Day52～Day55 旧版提示词管理有什么改进。
- 为什么要这样设计。
- 当前实现仍然存在哪些教学型限制。
- 第 67 天完成后的打卡结果。

本文不记录项目创建、业务代码复制、代码修改、依赖安装、命令执行和构建测试等过程性聊天。

---

## 一、读懂 `ollama-chat-day67` 项目

### 我的提问

> 带我来读懂ollama-chat-day67这个文件夹中的项目做了什么，运用了什么知识，对比ollama-chat-day66有什么改进，为什么这样子做(且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述)

### 回答整理

### 1. 一句话理解 Day67

`ollama-chat-day67` 在 Day66 `Unified Registry（统一注册中心）`的基础上，把 Prompt（提示词）从“可以被系统发现的一条注册信息”，升级成了“可以版本管理、运行、实验、评分、发布、回滚和审计的平台资产”。

核心变化可以概括为：

```text
Day66：系统现在拥有哪些能力？
Day67：提示词能力应该如何选择、运行、评估和上线？
```

### 2. 项目整体做了什么

Day67 完整保留了 Day66 已有的 Chat（对话）、Workflow（工作流）、Agent（智能体）、Tool（工具）、Model（模型）、Memory（记忆）、RAG（检索增强生成）、Evaluation（评估）、Runtime Context（运行时上下文）、Event System（事件系统）和 Unified Registry（统一注册中心）。

在此基础上新增了一条完整的提示词生产链路：

```text
User Task（用户任务）
    ↓
RuntimeContext（运行时上下文）
    ↓
UnifiedRegistry（统一注册中心发现提示词）
    ↓
PromptRegistry（提示词注册表加载资产）
    ↓
PromptRuntimeService（提示词运行服务）
    ↓
PromptBlock Optimization（提示词块优化）
    ↓
PromptBuilder（提示词构建器）
    ↓
Rendered Prompt（渲染后的提示词）
    ↓
Model（模型）
    ↓
Evaluation（评估）
    ↓
PromptQualityScore（提示词质量评分）
    ↓
Metrics / Trace（指标与链路追踪）
```

另一条链路负责提示词运营：

```text
Experiment（实验）
    ↓
Quality Gate（质量门禁）
    ↓
Approve（批准）
    ↓
Promote（晋级发布）
    ↓
Active（线上启用）
    ↓
Rollback / Archive（回滚或归档）
    ↓
Audit Log（审计日志）
```

### 3. ProductionPrompt（生产提示词）

Day67 新增了 `ProductionPrompt（生产提示词）`：

```ts
type ProductionPrompt = {
  id: string;
  name: string;
  version: string;
  agentId?: string;
  blocks: PromptBlock[];
  strategy: PromptStrategy;
  status:
    | "draft"
    | "testing"
    | "approved"
    | "active"
    | "deprecated";
  capabilities: string[];
  createdAt: number;
  updatedAt: number;
};
```

主要字段含义如下：

| 字段 | 作用 |
| --- | --- |
| `id` | 独立标识一个提示词版本，例如 `writer.v3` |
| `version` | 保存版本号，例如 `v1`、`v2` |
| `agentId` | 表示该提示词主要服务于哪个 Agent（智能体） |
| `blocks` | 保存组成最终提示词的 PromptBlock（提示词块） |
| `strategy` | 保存 fast（快速）、balanced（平衡）或 quality（质量优先）策略 |
| `status` | 管理草稿、测试、审批、启用和弃用状态 |
| `capabilities` | 供 UnifiedRegistry（统一注册中心）执行 Capability Discovery（能力发现） |
| `createdAt`、`updatedAt` | 用于版本审计和生命周期管理 |

简单系统可能直接在代码里保存提示词字符串：

```ts
const prompt = "你是一个写作助手……";
```

这种方式的问题包括：

- 不知道线上当前使用的是哪个版本。
- 无法安全回滚。
- 无法执行 A/B Testing（A/B 测试）。
- 无法记录最终提示词由哪些提示词块组成。
- 无法证明某一次模型回答使用了什么提示词。
- 很难建立发布审批和审计流程。

因此 `ProductionPrompt（生产提示词）`把 Prompt（提示词）从代码细节变成了独立业务资产。

### 4. 默认生产提示词版本

当前项目定义了 7 个生产提示词版本：

| Agent（智能体） | 版本 | 状态 | 策略 |
| --- | --- | --- | --- |
| Research Agent（研究智能体） | `research.v1` | active（已启用） | quality（质量优先） |
| Research Agent（研究智能体） | `research.v2` | testing（测试中） | quality（质量优先） |
| Writer Agent（写作智能体） | `writer.v1` | deprecated（已弃用） | fast（快速） |
| Writer Agent（写作智能体） | `writer.v2` | active（已启用） | balanced（平衡） |
| Writer Agent（写作智能体） | `writer.v3` | approved（已批准） | quality（质量优先） |
| Critic Agent（审查智能体） | `critic.v1` | active（已启用） | balanced（平衡） |
| Critic Agent（审查智能体） | `critic.v2` | testing（测试中） | fast（快速） |

这里特意准备了不同状态，用于演示完整生命周期：

- `research.v2` 可以执行 Approve（批准）。
- `writer.v3` 可以执行 Promote（晋级发布）。
- `writer.v1` 可以执行 Rollback（回滚）。
- `critic.v2` 用于验证 Quality Gate（质量门禁）失败。

### 5. PromptRegistry（提示词注册表）如何接入 UnifiedRegistry（统一注册中心）

Day66 已经让旧 `PromptRegistry（提示词注册表）`可以同步到 `UnifiedRegistry（统一注册中心）`。

Day67 继续增加了：

- `registerProduction()`：注册新的生产提示词版本。
- `upsertProduction()`：新增或更新生产提示词。
- `getProductionVersion()`：读取指定 Agent（智能体）和版本。
- `getProductionById()`：按提示词 ID 读取。
- `getActiveProduction()`：查找某个 Agent（智能体）当前线上版本。
- `listProduction()`：列出生产提示词版本。
- `setProductionStatus()`：修改生命周期状态。

生产提示词会通过 Adapter Pattern（适配器模式）转换成 `RegistryItem（注册项）`：

```ts
{
  id: "prompt:research@v1",
  type: "prompt",
  version: "v1",
  metadata: {
    promptId: "research.v1",
    agentId: "research",
    capabilities: ["research", "knowledge", "citation"],
    strategy: "quality",
    status: "active",
    blockIds: []
  },
  enabled: true
}
```

其中最重要的规则是：

```text
status === "active"
        ↓
enabled === true
```

testing（测试中）、approved（已批准）和 deprecated（已弃用）版本仍然可以被管理和实验，但不会被普通运行时自动发现。

这样做实现了 Management Plane（管理平面）和 Runtime Plane（运行平面）的分离：

- 管理页面需要看到所有历史版本。
- 正常运行时只能使用 active（已启用）版本。
- 实验运行时可以通过 `allowNonActive` 显式加载 testing（测试中）或 approved（已批准）版本。

### 6. PromptRuntimeService（提示词运行服务）

`PromptRuntimeService（提示词运行服务）`负责统一执行：

```text
选择提示词
    ↓
通过 UnifiedRegistry 加载注册项
    ↓
从 PromptRegistry 加载真实资产
    ↓
读取 RuntimeContext
    ↓
优化 PromptBlock
    ↓
渲染提示词
    ↓
记录 Trace 和 Metrics
    ↓
生成 PromptQualityScore
```

#### 6.1 选择提示词

正常 Agent（智能体）调用只会选择：

```ts
item.enabled === true
```

实验或复现时可以指定：

```ts
{
  version: "v2",
  allowNonActive: true
}
```

这样 testing（测试中）版本不会意外进入线上，但实验系统仍然能够加载它。

#### 6.2 从 RuntimeContext（运行时上下文）读取变量

运行服务统一读取：

- Memory（记忆）。
- Workspace（共享工作空间）。
- Knowledge（知识上下文）。
- Strategy（运行策略）。
- User Intent（用户意图）。
- Task（当前任务）。
- Citations（引用来源）。

这解决了 Context Drift（上下文漂移）问题。

如果 Agent（智能体）、Prompt（提示词）、Model（模型）和 Evaluation（评估）分别从不同地方收集数据，同一个请求可能出现上下文不一致。现在它们共享同一个 `RuntimeContext（运行时上下文）`。

#### 6.3 优化 PromptBlock（提示词块）

不同 Prompt Strategy（提示词策略）的行为不同：

- fast（快速）：关闭 Reflection（反思）、Evaluation（评估）、Citation（引用）等高成本块。
- balanced（平衡）：在质量和成本之间保持平衡。
- quality（质量优先）：提高反思、评估和引用块权重。

如果某个上下文块缺少必要变量，例如没有 Knowledge（知识上下文），对应块会被禁用或跳过。

#### 6.4 渲染提示词

优化后的提示词块交给 `PromptBuilder（提示词构建器）`：

```ts
builder.buildPromptWithReport(blocks, variables)
```

返回结果包括：

- `usedBlockIds`：实际使用的块。
- `skippedBlockIds`：被跳过的块。
- `records`：每个块的渲染记录。
- `text`：最终提示词正文。

这提升了 Explainability（可解释性）。

### 7. PromptVersion（提示词版本）如何进入 Trace（链路追踪）

每次提示词渲染后都会生成：

```ts
{
  traceId,
  promptId,
  version,
  blocks,
  strategy,
  renderedAt
}
```

这些信息随后写入：

```text
runtimeContext.promptContext
runtimeContext.metadata.promptTrace
```

因此一次回答可以被追溯为：

```text
使用了 writer.v2
版本是 v2
策略是 balanced（平衡）
实际使用了哪些 PromptBlock（提示词块）
关联的 Trace ID（链路追踪标识）是什么
```

这里运用了：

- Observability（可观测性）。
- Traceability（可追踪性）。
- Reproducibility（可复现性）。

### 8. PromptQualityScore（提示词质量评分）

质量评分结构为：

```ts
{
  correctness,
  relevance,
  cost,
  latency,
  overall
}
```

其中：

- Correctness（正确性）越高越好。
- Relevance（相关性）越高越好。
- 原始 Cost（成本）越低越好。
- 原始 Latency（延迟）越低越好。

所以成本和延迟需要先执行 Normalization（归一化）：

```text
efficiencyScore = budget / actual × 100
```

并限制在 0 到 100 之间。

综合分权重为：

```text
正确性 35%
相关性 35%
成本效率 15%
延迟表现 15%
```

这说明当前项目把质量放在第一位，同时兼顾成本和性能。

### 9. Quality Gate（质量门禁）

生产发布前会检查：

- 正确性不低于 85 分。
- 相关性不低于 82 分。
- 实际成本不能超过预算。
- 实际延迟不能超过预算。
- 高优先级案例不能退步。
- 实验样本不能少于 3 个。

门禁返回的不是单个布尔值，而是：

```ts
{
  passed,
  checks,
  failureReasons
}
```

这属于 Explainable Governance（可解释治理）：不仅告诉使用者不能发布，还会说明为什么不能发布。

### 10. PromptExperiment（提示词实验）生产化

当前项目包含三个实验：

```text
Research：v1 vs v2
Writer：v2 vs v3
Critic：v1 vs v2
```

每个 Agent（智能体）都有独立 Dataset（数据集），每个数据集包含 3 个案例，并区分：

- normal（普通优先级）。
- high（高优先级）。
- critical（关键优先级）。

实验流程如下：

```text
读取当前 active 版本作为 Baseline（基线）
        ↓
运行每个 Candidate Version（候选版本）
        ↓
对每个 Dataset Case（数据集案例）渲染提示词
        ↓
计算关键词覆盖、质量、成本和延迟
        ↓
与 Baseline（基线）比较高优先级回归
        ↓
执行 Quality Gate（质量门禁）
        ↓
从通过门禁的版本中选择最高分 Winner（优胜版本）
```

这比 Day53 固定的 Writer Prompt（写作提示词）实验更通用，因为 Agent（智能体）、候选版本和数据集都变成了实验参数。

### 11. PromptPromotion（提示词发布晋级）

完整生命周期为：

```text
draft（草稿）
    ↓ submitForTesting（提交测试）
testing（测试中）
    ↓ approve（批准）+ Quality Gate（质量门禁）
approved（已批准）
    ↓ promote（晋级发布）+ Quality Gate（质量门禁）
active（线上启用）
    ↓ archive（归档）
deprecated（已弃用）
```

同时支持：

```text
deprecated（已弃用）历史版本
        ↓ rollback（回滚）
active（线上启用）版本
```

当新版本变成 active（已启用）时，同一个 Agent（智能体）的旧 active 版本会自动变成 deprecated（已弃用），从而保证：

```text
一个 Agent 同一时间只有一个 active Prompt
```

每次操作都会记录 Audit Log（审计日志）：

```ts
{
  action,
  promptId,
  fromStatus,
  toStatus,
  operator,
  reason,
  createdAt
}
```

这里运用了 State Machine（状态机）思想和 Release Governance（发布治理）思想。

### 12. Prompt Explorer V2（提示词浏览器第2版）

访问地址为：

```text
/prompts
```

页面展示：

- Prompt（提示词）。
- Version（版本）。
- Agent（关联智能体）。
- Blocks（提示词块）。
- Strategy（策略）。
- Score（评分）。
- Usage（用量）。
- Status（状态）。

支持：

- Compare（比较）。
- Approve（批准）。
- Promote（晋级发布）。
- Rollback（回滚）。
- Archive（归档）。
- 查看 Experiment（实验）。
- 查看 Trace（链路追踪）。
- 查看 Audit Log（审计日志）。

它已经不只是 Explorer（浏览器），而是一个 Operations Console（运营控制台）。

### 13. API（应用程序接口）设计

#### GET（读取请求）

```text
GET /api/production-prompts
```

返回：

```ts
{
  prompts,
  registryItems,
  runtimeDemos,
  experiments,
  metrics,
  audits,
  generatedAt
}
```

#### PATCH（局部更新请求）

```text
PATCH /api/production-prompts
```

用于执行：

- approve（批准）。
- promote（晋级发布）。
- rollback（回滚）。
- archive（归档）。

#### POST（提交请求）

```text
POST /api/production-prompts
```

用于比较两个提示词版本，返回：

- 新增了哪些 PromptBlock（提示词块）。
- 删除了哪些提示词块。
- Prompt Strategy（提示词策略）是否变化。

这里使用了 Next.js Route Handler（Next.js 路由处理器）和 Client Component（客户端组件）的组合。

### 14. Day67 对比 Day66 的改进

| 对比维度 | Day66 | Day67 |
| --- | --- | --- |
| 核心主题 | Unified Registry（统一注册中心） | Production Prompt Platform（生产级提示词平台） |
| 核心问题 | 系统拥有哪些能力 | 提示词如何运行和治理 |
| 核心数据 | RegistryItem（注册项） | ProductionPrompt（生产提示词） |
| 核心服务 | UnifiedRegistry（统一注册中心） | PromptRuntimeService（提示词运行服务） |
| 提示词能力 | 注册、搜索、能力发现 | 选择、渲染、实验、评分、发布、回滚 |
| 状态管理 | enabled（启用状态）布尔值 | draft/testing/approved/active/deprecated 完整生命周期 |
| 上下文 | 注册项 Metadata（元数据） | RuntimeContext（运行时上下文）统一渲染 |
| 可观测性 | 注册数量、类型、版本 | Prompt Trace（提示词追踪）、Usage（用量）、Cost（成本）、Latency（延迟）、Quality（质量） |
| 安全机制 | ID 和版本冲突检测 | Quality Gate（质量门禁）和高优先级回归阻断 |
| 页面 | Registry Explorer（注册浏览器） | Prompt Explorer V2（提示词浏览器第2版） |
| 操作能力 | 主要是查看和发现 | 比较、批准、晋级、回滚、归档 |
| 测试重点 | 注册中心与能力发现 | Agent → Prompt → Model → Evaluation 完整链路 |

二者不是替代关系，而是依赖关系：

```text
Day66 UnifiedRegistry（统一注册中心）
        ↓
告诉 Day67 当前有哪些 Prompt Version（提示词版本）

Day67 PromptRuntimeService（提示词运行服务）
        ↓
决定本次应该使用哪个版本并如何运行
```

### 15. 项目运用的知识

项目主要运用了：

- Domain Modeling（领域建模）：把提示词建模为生产资产。
- Adapter Pattern（适配器模式）：把 ProductionPrompt（生产提示词）转换成 RegistryItem（注册项）。
- Dependency Injection（依赖注入）：运行服务依赖 PromptRegistry、UnifiedRegistry 和 PromptBuilder。
- Separation of Concerns（职责分离）：选择、渲染、评估和发布分别由不同服务负责。
- Backward Compatibility（向后兼容）：旧 PromptRegistry API（提示词注册表接口）继续保留。
- State Machine（状态机）：管理提示词完整生命周期。
- Defensive Copying（防御性复制）：读取和写入时复制数组、提示词块和元数据。
- Context Consistency（上下文一致性）：所有模块共享 RuntimeContext（运行时上下文）。
- Prompt Composition（提示词组合）：通过 PromptBlock（提示词块）组合最终提示词。
- A/B Testing（A/B 测试）：比较不同提示词版本。
- Regression Testing（回归测试）：与 active（已启用）基线比较。
- Normalization（归一化）：统一正确性、成本和延迟指标方向。
- Weighted Scoring（加权评分）：生成综合质量分。
- Quality Gate（质量门禁）：阻止不合格版本发布。
- Audit Trail（审计轨迹）：记录生命周期变化。
- Observability（可观测性）：记录 Trace、Usage、Cost 和 Latency。

### 16. 当前限制

虽然名称是 Production Prompt Platform（生产级提示词平台），但当前仍然是教学型架构原型：

1. 数据保存在进程内 `Map`，服务重启后状态会丢失。
2. Day67 新链路中的 Model Call（模型调用）由 `simulateModelCall()` 模拟，并没有真正调用 Ollama 或 MiMo。
3. 质量评分采用启发式规则，不是人工标注或真实模型评估。
4. 发布操作暂时使用固定演示证据，尚未自动读取最近一次实验结果。
5. Audit Log（审计日志）没有写入数据库。
6. API（应用程序接口）暂时没有 Authentication（身份认证）、Authorization（权限控制）和 Role Control（角色控制）。
7. GET（读取请求）平台快照时会重新运行演示和实验，真实生产环境应使用 Cache（缓存）、Async Job（异步任务）或持久化结果。
8. 服务支持 `draft → testing`，但当前 Prompt Explorer V2（提示词浏览器第2版）页面没有提供“提交测试”按钮。

所以它真正完成的是：

```text
生产级架构概念与完整治理链路
```

而不是已经达到真实企业生产环境的全部可靠性要求。

### 17. Day67 核心认知

Day67 最重要的一句话是：

> Prompt（提示词）不再只是 Agent（智能体）代码中的一段字符串，而是拥有版本、运行时、实验、评估、发布、回滚、指标和审计能力的平台资产。

---

## 二、Day67 对比旧版提示词管理

### 我的提问

> 这个之前好像也作过相关的提示词管理，这版对比上一版本有什么改进呢

### 回答整理

之前确实已经连续完成过几版提示词管理。Day67 并不是从零重新实现，而是把 Day52～Day55 的能力重新组合成一条“生产运行与发布治理”链路。

可以这样理解：

```text
Day52～Day55：把提示词管理工具做出来
Day67：让这些工具真正进入 Agent 的运行和发布流程
```

### 1. 前几版分别做了什么

#### Day52：PromptRegistry（提示词注册表）

主要解决：

- 提示词版本注册。
- draft（草稿）、active（已启用）、archived（已归档）状态管理。
- 激活、归档和回滚。
- 模板变量校验。
- 不同版本 Diff（差异比较）。
- 提示词 JSON（JavaScript 对象表示法数据）持久化。

核心对象是 `PromptTemplate（提示词模板）`：

```ts
{
  componentId,
  version,
  template,
  variables,
  status
}
```

它更接近“提示词版本管理器”。

#### Day53：Prompt Experiment（提示词实验）

增加了：

- 多版本对比。
- Evaluation Dataset（评估数据集）。
- Winner Selection（优胜版本选择）。
- Regression Check（回归检查）。
- Promote（提升获胜版本）。

但实验主要围绕预设的 Writer Prompt（写作提示词）展开，教学案例比较固定。

#### Day54：PromptBlock（提示词块）

把一个大提示词拆分成：

- System Block（系统块）。
- Memory Block（记忆块）。
- Workspace Block（工作区块）。
- Task Block（任务块）。
- Output Block（输出格式块）。

然后通过 `PromptBuilder（提示词构建器）`组合和渲染。

#### Day55：PromptOptimizer（提示词优化器）

增加了：

- fast（快速）、balanced（平衡）、quality（质量优先）策略。
- 根据任务和上下文动态开关提示词块。
- Recommendation（推荐优化）。
- Token（词元）和成本估算。
- Evaluation Signal（评估反馈信号）。

所以在 Day67 之前，提示词版本、实验、提示词块组合和优化能力其实都已经存在。

### 2. Day67 真正改进的地方

Day67 最大的改进不是又增加一套版本管理，而是增加 Runtime Integration（运行时集成）和 Release Governance（发布治理）。

#### 2.1 从 PromptTemplate（提示词模板）升级为 ProductionPrompt（生产提示词）

旧版 PromptTemplate 关注：

```text
这个模板写了什么？
有哪些变量？
当前是不是 active？
```

新版 ProductionPrompt 关注：

```text
这个提示词属于哪个 Agent？
由哪些 PromptBlock 组成？
采用什么 Strategy？
能否参与实验？
是否已经批准？
能否进入生产？
运行了多少次？
质量和成本如何？
```

也就是说，它从 Template Management（模板管理）升级成 Asset Governance（资产治理）。

#### 2.2 真正进入 Agent Runtime（智能体运行时）

旧版虽然能注册、编辑和比较提示词，但 Agent（智能体）执行时不一定必须经过提示词管理系统。

Day67 新增了 `PromptRuntimeService（提示词运行服务）`，形成：

```text
Agent（智能体）
  ↓
UnifiedRegistry（统一注册中心）查找 active Prompt
  ↓
PromptRegistry（提示词注册表）加载真实版本
  ↓
读取 RuntimeContext（运行时上下文）
  ↓
优化 PromptBlock（提示词块）
  ↓
PromptBuilder（提示词构建器）渲染
  ↓
Model（模型）
  ↓
Evaluation（评估）
```

以前更像：

```text
系统有一个提示词管理页面
```

现在更像：

```text
Agent 每次运行都通过提示词平台选择和渲染提示词
```

#### 2.3 与 UnifiedRegistry（统一注册中心）集成更深

Day66 主要是把旧 PromptTemplate（提示词模板）转成 RegistryItem（注册项），供统一查看和搜索。

Day67 进一步让统一注册中心参与真实版本选择。

正常运行只能选择：

```ts
enabled === true
```

实验系统可以显式加载：

```ts
{
  version: "v2",
  allowNonActive: true
}
```

这解决了一个重要问题：

```text
testing 版本可以被实验使用，
但不能意外进入普通线上请求。
```

#### 2.4 RuntimeContext（运行时上下文）成为统一上下文来源

旧版渲染主要依赖调用方手动传入变量：

```ts
builder.buildPrompt(blocks, variables)
```

Day67 把变量来源统一成 RuntimeContext：

- Memory（记忆）。
- Workspace（共享工作空间）。
- Knowledge（知识上下文）。
- Strategy（运行策略）。
- User Intent（用户意图）。

这样 Prompt（提示词）、Agent（智能体）、Model（模型）和 Evaluation（评估）使用同一份上下文，减少 Context Drift（上下文漂移）。

#### 2.5 Prompt Version（提示词版本）自动进入 Trace（链路追踪）

旧版可以看到提示词版本，但它和某一次实际模型调用之间的关联不够强。

Day67 每次运行都会记录：

```ts
{
  traceId,
  promptId,
  version,
  blocks,
  strategy,
  renderedAt
}
```

因此系统能够回答：

- 这次回答使用了哪个提示词？
- 使用的是哪个版本？
- 哪些提示词块真正参与了渲染？
- 哪些块因为缺少上下文被跳过？
- 使用了 fast（快速）、balanced（平衡）还是 quality（质量优先）策略？

这是从 Version Management（版本管理）升级到 Runtime Observability（运行时可观测性）。

#### 2.6 增加 approved（已批准）状态

旧版状态主要是：

```text
draft → active → archived
```

Day67 调整为：

```text
draft → testing → approved → active → deprecated
```

这样能够明确区分：

- 已经完成测试。
- 已经通过审批。
- 已经真正上线。

这更接近代码、配置和模型的正式发布流程。

#### 2.7 Quality Gate（质量门禁）更加完整

旧版实验已经有一定的质量门禁，但 Day67 把它正式放到发布服务前面。

现在发布必须检查：

- Correctness（正确性）。
- Relevance（相关性）。
- Cost Budget（成本预算）。
- Latency Budget（延迟预算）。
- High-priority Regression（高优先级案例回归）。
- Sample Size（实验样本量）。

而且门禁不仅返回成功或失败，还会返回全部失败原因。

#### 2.8 PromptExperiment（提示词实验）更加通用

旧版实验比较固定，主要围绕 Writer（写作智能体）的几个版本。

Day67 将实验抽象为：

```ts
{
  agentId,
  candidateVersions,
  datasetId
}
```

因此可以运行：

```text
Research v1 vs v2
Writer v2 vs v3
Critic v1 vs v2
```

相同的实验服务可以处理不同 Agent（智能体）、Dataset（数据集）和 Prompt Version（提示词版本）。

这是从 Fixed Experiment（固定实验）升级成 Generic Experiment Management（通用实验管理）。

#### 2.9 发布、回滚和归档拥有 Audit Log（审计日志）

旧版支持 Activate（激活）、Archive（归档）和 Rollback（回滚），但更接近注册表状态修改。

Day67 将这些动作放进独立的 `PromptPromotionService（提示词发布服务）`，并记录：

```ts
{
  action,
  promptId,
  fromStatus,
  toStatus,
  operator,
  reason,
  createdAt
}
```

一次状态变化不再只是修改一个字段，而是能够说明：

```text
谁在什么时间，
基于什么原因，
把哪个版本从 approved 改成 active。
```

这属于 Audit Trail（审计轨迹）。

#### 2.10 Prompt Explorer V2（提示词浏览器第2版）变成运营控制台

旧版 Prompt Explorer（提示词浏览器）偏向：

- 查看模板。
- 查看变量。
- 查看 Diff（差异比较）。
- 激活、归档和回滚。
- 查看优化策略。

新版 Prompt Explorer V2 同时展示：

- Prompt（提示词）。
- Version（版本）。
- Agent（关联智能体）。
- Blocks（提示词块）。
- Strategy（策略）。
- Score（评分）。
- Usage（用量）。
- Status（状态）。
- Trace（链路追踪）。
- Experiment（实验）。
- Quality Gate（质量门禁）。
- Audit Log（审计日志）。

所以它从 Management Page（管理页面）升级成 Operations Console（运营控制台）。

### 3. 旧版与 Day67 对比总结

| 能力 | Day52～Day55 旧版 | Day67 新版 |
| --- | --- | --- |
| 提示词结构 | PromptTemplate（提示词模板） | ProductionPrompt（生产提示词） |
| 版本管理 | 已实现 | 与 Agent 和 UnifiedRegistry 深度绑定 |
| 模板变量校验 | 已实现 | 继续继承旧能力 |
| JSON 持久化 | 已实现 | 新 ProductionPrompt 暂未持久化 |
| PromptBlock | 已实现 | 正式进入 PromptRuntimeService 运行链路 |
| PromptOptimizer | 规则较丰富 | 运行时优化较简化，但完成链路集成 |
| 实验 | 主要为固定 Writer 实验 | 支持任意 Agent、版本和数据集 |
| RuntimeContext | 调用方手动传变量为主 | 统一读取完整运行时上下文 |
| Trace | 与模型调用关联较弱 | 自动记录版本、块和策略 |
| 状态 | draft/active/archived | draft/testing/approved/active/deprecated |
| 质量门禁 | 实验内部存在 | 正式阻断审批和发布 |
| 发布治理 | Activate（激活）为主 | Approve、Promote、Rollback、Archive |
| 审计日志 | 较弱 | 独立 Audit Log（审计日志） |
| UI | 版本管理和优化页面 | 提示词运营控制台 |
| 运行关系 | 管理系统与 Agent 相对独立 | Agent 通过 PromptRuntimeService 选择和渲染提示词 |

### 4. 并不是所有方面都比旧版强

Day67 是架构整合升级，不是所有细节都超过旧版。

#### 4.1 旧版有持久化，新生产提示词暂时没有

旧 PromptRegistry（提示词注册表）可以通过 `prompt-persistence.ts` 写入本地 JSON（JavaScript 对象表示法数据）文件。

Day67 的 `productionPrompts`、Metrics（指标）和 Audit Log（审计日志）目前保存在进程内 Map（映射表）或数组中，服务重启后会丢失。

#### 4.2 旧 PromptOptimizer（提示词优化器）的规则更丰富

Day55 的 PromptOptimizer 支持：

- 多条动态规则。
- Recommendation（推荐）。
- Evaluation Signal（评估反馈信号）。
- Strategy Metrics（策略指标统计）。

Day67 的运行时优化目前相对简单：

- fast（快速）关闭高成本块。
- quality（质量优先）提高高质量块权重。
- 缺少上下文时关闭对应块。

因此 Day67 的优势是接入真实运行链路，而不是优化算法本身更复杂。

#### 4.3 发布证据还没有自动与实验结果连接

当前平台中的通过证据和阻断证据是固定教学数据。

实验服务虽然能够生成候选评分和 Quality Gate（质量门禁）结果，但发布动作还没有自动读取最近一次实验结果作为晋级证据。

真实生产版本应该形成：

```text
最近一次 ExperimentRun（实验运行结果）
        ↓
生成 PromotionEvidence（晋级证据）
        ↓
Approval（审批）
        ↓
Promote（晋级发布）
```

#### 4.4 模型调用仍然是模拟

Day67 新提示词平台使用 `simulateModelCall()` 生成稳定的成本、延迟和输出，用于验证架构。

因此当前更准确的描述是：

```text
Day67 完成了生产提示词平台的架构闭环，
但底层存储、真实模型评估和发布证据连接仍是教学实现。
```

### 5. 最核心的区别

旧版解决的是：

> 如何创建、编辑、组合、比较和优化提示词？

Day67 解决的是：

> Agent（智能体）在运行时如何安全地选择提示词，如何证明它使用了哪个版本，如何通过实验和质量门禁把新版本发布到线上，又如何在出现问题时回滚？

因此 Day67 最大的进步不是多了几个管理按钮，而是把以前分散的提示词能力串成了：

```text
注册 → 发现 → 运行 → 追踪 → 评估 → 实验 → 审批 → 发布 → 回滚 → 审计
```

这条完整治理链路。

---

## 三、第 67 天打卡

【第67天打卡】

1. PromptRegistry（提示词注册表）是否迁移到 UnifiedRegistry（统一注册中心）：**是**

2. 是否定义 ProductionPrompt（生产提示词）：**是**

3. 是否实现 PromptRuntimeService（提示词运行服务）：**是**

4. Prompt（提示词）是否接入 RuntimeContext（运行时上下文）：**是**

5. PromptVersion（提示词版本）是否进入 Trace（链路追踪）：**是**

6. PromptExperiment（提示词实验）是否完成生产化升级：**是**

7. 是否实现 PromptQualityScore（提示词质量评分）：**是**

8. 是否实现 PromptPromotion（提示词发布晋级）：**是**

9. 是否实现 PromptExplorer V2（提示词浏览器第2版）：**是**

10. 是否完成 ProductionPromptTest（生产提示词测试）：**是**

11. 遇到的最大问题：

    最大问题是如何在保留 Day52～Day55 旧 PromptTemplate（提示词模板）、PromptRegistry（提示词注册表）、PromptBlock（提示词块）和 PromptOptimizer（提示词优化器）能力的同时，引入新的 ProductionPrompt（生产提示词）生命周期，并保证以下状态始终一致：

    - Prompt Status（提示词状态）与 UnifiedRegistry.enabled（统一注册项启用状态）保持一致。
    - 同一个 Agent（智能体）同一时间只能有一个 active（已启用）版本。
    - 正常运行时只能发现 active 版本。
    - Experiment（实验）可以显式加载 testing（测试中）、approved（已批准）或 deprecated（已弃用）版本。
    - Prompt Version（提示词版本）、PromptBlock（提示词块）和 Prompt Strategy（提示词策略）必须进入 Trace（链路追踪）。
    - Quality Gate（质量门禁）失败时不能错误修改版本生命周期状态。

12. 当前系统能力：

    - 支持 Chat（对话）与本地 Ollama、MiMo 模型调用基础能力。
    - 支持 Workflow（工作流）规划、执行、暂停、恢复、持久化和后台队列。
    - 支持 Agent Registry（智能体注册表）、Tool Registry（工具注册表）、Model Registry（模型注册表）和 Prompt Registry（提示词注册表）。
    - 支持 Unified Registry（统一注册中心）、RegistryItem（注册项）、Capability Discovery（能力发现）和 Registry Metrics（注册指标）。
    - 支持 RuntimeContext（运行时上下文），统一共享 Memory（记忆）、Workspace（工作空间）、Knowledge（知识上下文）、Prompt（提示词）、Model（模型）、Trace（链路追踪）、Usage（用量）和 Evaluation（评估）信息。
    - 支持 Unified Event System（统一事件系统），能够记录 Runtime、Agent、Tool、Prompt、Model、Memory、Retrieval 和 Evaluation 事件。
    - 支持 ProductionPrompt（生产提示词）独立版本注册。
    - 支持 PromptRuntimeService（提示词运行服务）选择、加载、优化、渲染和指标记录。
    - 支持 PromptBlock（提示词块）的条件启用、跳过、组合和渲染报告。
    - 支持 fast（快速）、balanced（平衡）和 quality（质量优先）三种 Prompt Strategy（提示词策略）。
    - 支持 Prompt Version（提示词版本）、PromptBlock 和 Strategy 自动绑定 Trace（链路追踪）。
    - 支持 Prompt Metrics（提示词指标），记录 Usage Count（使用次数）、Token（词元）、Cost（成本）、Latency（延迟）和 Model（模型）。
    - 支持 PromptQualityScore（提示词质量评分），综合 Correctness（正确性）、Relevance（相关性）、Cost Efficiency（成本效率）和 Latency Performance（延迟表现）。
    - 支持不同 Agent（智能体）、Dataset（数据集）和 Prompt Version（提示词版本）的通用 A/B Testing（A/B 测试）。
    - 支持 Baseline（基线）、Candidate Version（候选版本）、High-priority Regression（高优先级回归）和 Winner Selection（优胜版本选择）。
    - 支持 Quality Gate（质量门禁），检查正确性、相关性、成本、延迟、回归风险和最小样本量。
    - 支持 draft（草稿）、testing（测试中）、approved（已批准）、active（已启用）和 deprecated（已弃用）生命周期。
    - 支持 Approve（批准）、Promote（晋级发布）、Rollback（回滚）和 Archive（归档）。
    - 支持 Audit Log（审计日志），记录操作前后状态、操作者、原因和时间。
    - 支持 Prompt Explorer V2（提示词浏览器第2版），展示 Prompt、Version、Agent、Blocks、Strategy、Score、Usage 和 Status。
    - 支持 Compare（比较）、Promote（晋级发布）、Rollback（回滚）和 Archive（归档）等运营操作。
    - 已完成 Research Agent（研究智能体）、Writer Agent（写作智能体）和 Critic Agent（审查智能体）的 ProductionPromptTest（生产提示词测试）。

---

## 四、第 67 天最终总结

Day67 并不是重复实现一次提示词版本管理，而是把 Day52～Day55 已有的 Prompt Registry（提示词注册）、Prompt Experiment（提示词实验）、PromptBlock（提示词块）和 PromptOptimizer（提示词优化器）能力，接入 Day64～Day66 建立的 RuntimeContext（运行时上下文）、Event System（事件系统）和 UnifiedRegistry（统一注册中心）。

最终形成了：

```text
注册
  ↓
能力发现
  ↓
运行时选择
  ↓
上下文渲染
  ↓
模型调用
  ↓
链路追踪
  ↓
质量评估
  ↓
版本实验
  ↓
审批与质量门禁
  ↓
晋级发布
  ↓
回滚、归档与审计
```

Day67 最重要的学习结论是：

> Prompt（提示词）不应该只是 Agent（智能体）代码中的字符串，而应该成为可发现、可运行、可观测、可实验、可评估、可发布、可回滚和可审计的平台资产。

---

## 五、第 67 天补充总结

第 67 天完成的主题是：

```text
Production Upgrade V4（生产化升级第4版）
Production Prompt Platform（生产级提示词平台）
```

这一步的价值非常高，因为 Prompt（提示词）已经从代码中的普通字符串升级成具备以下能力的生产资产：

- 可注册。
- 可版本化。
- 可实验。
- 可评估。
- 可晋级发布。
- 可回滚。
- 可追踪。

现在一条完整链路已经可以做到：

```text
Agent（智能体）
        ↓
UnifiedRegistry（统一注册中心）查找 Prompt（提示词）
        ↓
PromptRuntimeService（提示词运行服务）选择版本
        ↓
RuntimeContext（运行时上下文）注入 Memory（记忆）/ Workspace（工作空间）/ Knowledge（知识）
        ↓
PromptBuilder（提示词构建器）组合提示词块
        ↓
Model Execution（模型执行）
        ↓
Trace（链路追踪）记录 promptId（提示词标识）/ promptVersion（提示词版本）
        ↓
Evaluation（评估）生成评分
        ↓
Quality Gate（质量门禁）
        ↓
Promote / Rollback（晋级发布 / 回滚）
```

这说明 Day52～Day55 学习和实现的 Prompt（提示词）能力，已经真正完成了生产化融合。

---

## 六、Day68 学习计划：Production Memory Platform（生产级记忆平台）

Day68 的主题是：

```text
Production Upgrade V5（生产化升级第5版）
Production Memory Platform（生产级记忆平台）
```

### 1. 今日核心目标

把现有的 Conversation Memory（对话记忆）、Long-Term Memory V2（长期记忆第2版）、Workspace（工作空间）和 Redis State（Redis 状态）整合成一个真正可持久化、可检索、可治理的生产级记忆平台。

### 2. 为什么 Day68 要升级 Memory（记忆）

当前系统已经拥有多种记忆相关能力：

- Conversation Memory（对话记忆）。
- Summary Memory（摘要记忆）。
- Long-Term Memory V2（长期记忆第2版）。
- Experience Memory（经验记忆）。
- Workspace（工作空间）。
- Semantic Cache（语义缓存）。

但是这些模块的职责容易发生重叠，例如：

- 用户偏好应该保存在哪里？
- 某次任务的研究结果应该保存在哪里？
- Reflection（反思）产生的经验是否应该进入长期记忆？
- Workspace（工作空间）结束后是否应该一直保留？
- Redis（内存键值数据库）中的会话记忆和 MySQL（关系型数据库）中的长期记忆如何同步？
- 多个 Agent（智能体）是否会重复写入同一条经验？

生产版本必须先明确：

```text
什么该记
记在哪里
保留多久
谁可以读取
什么时候合并
什么时候删除
```

### 3. Day68 最终架构

完成后，记忆层建议形成以下架构：

```text
                    ProductionMemoryService（生产记忆服务）
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
 Session Memory         Long-Term Memory      Workspace Memory
 （会话记忆）             （长期记忆）           （工作空间记忆）
    Redis              MySQL + VectorStore       Redis / MySQL
（内存数据库）       （关系数据库 + 向量存储） （内存库 / 关系库）
          │                   │                   │
 当前会话上下文       用户事实、偏好、经验      单次任务协作现场
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                Memory Retrieval（记忆检索）
                              │
                 RuntimeContext.memory（运行时记忆上下文）
```

Semantic Cache（语义缓存）不并入 Memory（记忆）平台。

Semantic Cache 继续负责：

```text
避免对相同或高度相似的请求执行重复计算
```

Memory 负责：

```text
保留与当前用户、任务和历史经验有关的信息
```

### 4. Day68 核心原则

首先明确三类记忆：

| 类型 | 用途 | 推荐存储 |
| --- | --- | --- |
| Session Memory（会话记忆） | 当前会话、最近消息和临时摘要 | Redis（内存键值数据库） |
| Long-Term Memory（长期记忆） | 用户事实、偏好、经验、决策和教训 | MySQL + VectorStore（关系型数据库 + 向量存储） |
| Workspace Memory（工作空间记忆） | 当前多 Agent（多智能体）任务的草稿、发现、问题和结果 | Redis，重要内容归档到 MySQL |

Day68 不是删除原有模块，而是在它们外面增加一个统一生产服务。

---

## 七、Day68 任务清单

### 任务 1：定义 ProductionMemoryItem（生产记忆条目）

不要直接继续扩充旧的 `MemoryItemV2（记忆条目第2版）`，建议新增生产层结构：

```ts
type ProductionMemoryScope =
  | "session"
  | "user"
  | "workspace"
  | "agent"
  | "global";

type ProductionMemoryType =
  | "fact"
  | "preference"
  | "experience"
  | "decision"
  | "lesson"
  | "summary"
  | "task_state";

type MemoryLifecycleStatus =
  | "active"
  | "consolidated"
  | "archived"
  | "deleted";

type ProductionMemoryItem = {
  id: string;

  scope: ProductionMemoryScope;
  scopeId: string;

  type: ProductionMemoryType;
  content: string;

  importance: number;
  confidence: number;

  source: {
    requestId?: string;
    traceId?: string;
    sessionId?: string;
    workspaceId?: string;
    agentId?: string;
  };

  tags: string[];

  status: MemoryLifecycleStatus;

  createdAt: number;
  updatedAt: number;
  expiresAt?: number;

  lastAccessedAt?: number;
  accessCount: number;

  version: number;
};
```

这一结构主要解决以下问题。

`scope（作用域）`用来区分：

- 当前会话的记忆。
- 某个用户的长期记忆。
- 某个 Workspace（工作空间）的任务记忆。
- 某个 Agent（智能体）的专属记忆。
- 全局共享记忆。

`status（状态）`用于支持：

- Consolidation（记忆合并与沉淀）。
- Archive（归档）。
- Soft Delete（软删除）。
- Lifecycle Governance（生命周期治理）。

`version（版本号）`用于 Optimistic Concurrency Control（乐观并发控制），防止并发更新互相覆盖。

### 任务 2：定义 MemoryProvider（记忆提供者）

新增统一接口：

```ts
interface MemoryProvider {
  add(item: ProductionMemoryItem): Promise<void>;

  get(id: string): Promise<ProductionMemoryItem | null>;

  update(
    id: string,
    patch: Partial<ProductionMemoryItem>,
    expectedVersion?: number
  ): Promise<ProductionMemoryItem>;

  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;

  archive(id: string): Promise<void>;

  delete(id: string): Promise<void>;

  listByScope(
    scope: ProductionMemoryScope,
    scopeId: string
  ): Promise<ProductionMemoryItem[]>;
}
```

实现两个 Provider（提供者）：

- `RedisSessionMemoryProvider（Redis 会话记忆提供者）`。
- `PersistentLongTermMemoryProvider（持久化长期记忆提供者）`。

两类存储的职责为：

| Provider（提供者） | 适用数据 | 特征 |
| --- | --- | --- |
| RedisSessionMemoryProvider | 短期、高频会话记忆 | 支持 TTL（生存时间）和快速访问 |
| PersistentLongTermMemoryProvider | 长期记忆 | 使用 MySQL + VectorStore，支持持久化、语义检索和审计 |

### 任务 3：实现 ProductionMemoryService（生产记忆服务）

新增：

```ts
class ProductionMemoryService {
  write(...)
  retrieve(...)
  consolidate(...)
  archiveWorkspace(...)
  forget(...)
  getContextForRuntime(...)
}
```

它本身不直接保存数据，而是根据 `scope（作用域）`选择对应的 MemoryProvider（记忆提供者）。

例如：

```ts
async write(item: ProductionMemoryItem) {
  if (item.scope === "session") {
    return this.sessionProvider.add(item);
  }

  return this.longTermProvider.add(item);
}
```

以后 Agent Runtime（智能体运行时）不应该直接调用：

- MemoryStore（记忆存储）。
- LongTermMemoryStore（长期记忆存储）。
- WorkspaceStore（工作空间存储）。

而应该统一通过：

```text
ProductionMemoryService（生产记忆服务）
```

这运用了 Facade Pattern（外观模式）、Dependency Inversion（依赖倒置）和 Separation of Concerns（职责分离）。

### 任务 4：Session Memory（会话记忆）迁移到 Redis

为 Session Memory 设计以下 Redis Key（Redis 键）：

```text
memory:session:{sessionId}:items
memory:session:{sessionId}:summary
memory:session:{sessionId}:meta
```

建议实现：

- 最近消息保留数量上限。
- Session Summary（会话摘要）单独保存。
- 设置 TTL（生存时间），例如 7 天。
- 每次访问时可选择刷新 TTL。

示例：

```ts
await redis.expire(
  `memory:session:${sessionId}:items`,
  sessionTtlSeconds
);
```

需要注意：不要把完整长期记忆复制进 Session Redis（会话 Redis）。

Session Redis 中只保存：

```text
当前任务真正使用到的记忆快照
```

否则会导致数据重复、污染和同步困难。

### 任务 5：长期记忆接入持久化与向量检索

现有 Long-Term Memory V2（长期记忆第2版）已经具备语义检索逻辑。

Day68 要进一步生产化为：

```text
MySQL（关系型数据库）：保存 Memory Metadata（记忆元数据）和正文
VectorStore（向量存储）：保存 Embedding（向量表示）和检索索引
```

数据库建议至少保存：

```text
id
scope
scope_id
type
content
importance
confidence
status
source_json
tags_json
version
created_at
updated_at
expires_at
last_accessed_at
access_count
```

向量记录建议保存：

```ts
{
  id: memory.id,
  embedding,
  metadata: {
    memoryId: memory.id,
    scope: memory.scope,
    scopeId: memory.scopeId,
    type: memory.type,
    status: memory.status
  }
}
```

MySQL 负责可靠保存原始记录和生命周期状态，VectorStore（向量存储）负责 Semantic Retrieval（语义检索）。

### 任务 6：实现统一 Memory Retrieval Pipeline（记忆检索管线）

新增输入结构：

```ts
type MemorySearchInput = {
  query: string;

  userId?: string;
  sessionId?: string;
  workspaceId?: string;
  agentId?: string;

  types?: ProductionMemoryType[];

  topK?: number;
  minScore?: number;

  includeSession?: boolean;
  includeLongTerm?: boolean;
  includeWorkspace?: boolean;
};
```

检索分为三路：

```text
Session Memory（会话记忆）
        +
Long-Term Semantic Memory（长期语义记忆）
        +
Workspace Entries（工作空间条目）
        ↓
Unified Scoring（统一评分）
        ↓
Deduplication（去重）
        ↓
Sorting（排序）
        ↓
RuntimeContext Injection（运行时上下文注入）
```

推荐综合评分公式：

```text
finalScore =
  semanticScore * 0.45 +
  importanceScore * 0.20 +
  recencyScore * 0.15 +
  confidenceScore * 0.10 +
  accessScore * 0.10
```

各评分含义：

- `semanticScore（语义相关度分）`：记忆与当前查询的语义相似度。
- `importanceScore（重要性分）`：记忆本身的重要程度。
- `recencyScore（时效性分）`：记忆距离当前时间的远近。
- `confidenceScore（置信度分）`：系统对记忆真实性和稳定性的信心。
- `accessScore（访问价值分）`：记忆历史上被访问和使用的程度。

这里不要求权重绝对正确，重点是实现统一、可配置和可观察的检索评分体系。

### 任务 7：实现 Memory Deduplication / Conflict Resolution（记忆去重 / 冲突处理）

生产环境中很容易同时出现：

```text
用户喜欢简洁回答
用户喜欢详细回答
```

也可能出现同一条经验被多个 Agent（智能体）重复写入的问题。

新增：

```ts
type MemoryConflict = {
  existingMemoryId: string;
  candidateMemoryId: string;

  type:
    | "duplicate"
    | "contradiction"
    | "superseded";

  resolution:
    | "keep_existing"
    | "replace"
    | "merge"
    | "manual_review";

  reason: string;
};
```

基础处理策略如下。

#### 重复记忆

当内容高度相似时：

- 合并 `accessCount（访问次数）`。
- 提高 `confidence（置信度）`。
- 更新时间。
- 合并来源信息。

#### 新版本覆盖旧版本

例如：

```text
旧记忆：用户以前使用 SQLite
新记忆：用户现在改用 MySQL
```

处理方式：

```text
旧记忆 status = archived（已归档）
新记忆 status = active（已启用）
```

#### 无法自动判断的冲突

写入：

```text
manual_review（人工审核）
```

不要让模型擅自删除不确定记忆。

### 任务 8：Workspace Memory Archive（工作空间记忆归档）

任务结束时，不要把 Workspace（工作空间）的所有条目都写入长期记忆。

新增：

```ts
archiveWorkspaceMemory(workspaceId)
```

推荐流程：

```text
读取 Workspace Entries（工作空间条目）
        ↓
筛选高价值条目
        ↓
Reflection / Evaluation（反思 / 评估）判断
        ↓
提取 fact / decision / lesson / experience（事实 / 决策 / 教训 / 经验）
        ↓
去重与冲突检测
        ↓
写入 Long-Term Memory（长期记忆）
        ↓
Workspace 标记 archived（已归档）
```

建议只归档：

- 最终决策。
- 重要研究发现。
- 可复用经验。
- 用户明确偏好。
- Reflection（反思）得出的稳定教训。

不要归档：

- 临时草稿。
- 中间失败输出。
- 重复内容。
- 无意义日志。
- 模型猜测。

### 任务 9：接入 RuntimeContext / EventBus / UnifiedRegistry

#### RuntimeContext（运行时上下文）

统一写入：

```ts
runtimeContext.memoryContext = {
  sessionMemories,
  longTermMemories,
  workspaceMemories,
  retrievedMemoryIds,
  retrievalStrategy
};
```

#### EventBus（事件总线）

发布以下事件：

```text
memory.read（读取记忆）
memory.write（写入记忆）
memory.consolidated（记忆合并完成）
memory.conflict_detected（检测到记忆冲突）
memory.archived（记忆已归档）
memory.deleted（记忆已删除）
```

#### UnifiedRegistry（统一注册中心）

注册：

- RedisSessionMemoryProvider（Redis 会话记忆提供者）。
- PersistentLongTermMemoryProvider（持久化长期记忆提供者）。
- ProductionMemoryService（生产记忆服务）。
- MemoryConsolidationStrategy（记忆合并策略）。

这样后续可以动态替换 MemoryProvider（记忆提供者）。

### 任务 10：实现 Memory Governance Explorer（记忆治理浏览器）

不要只做简单的记忆列表，而要做治理页面。

前端至少展示：

- Scope（作用域）。
- Scope ID（作用域标识）。
- Type（记忆类型）。
- Content（内容）。
- Importance（重要性）。
- Confidence（置信度）。
- Status（状态）。
- Version（版本）。
- Source Trace（来源链路追踪）。
- Last Accessed（最后访问时间）。
- Expires At（过期时间）。

支持：

- 按 scope（作用域）筛选。
- 按 type（类型）筛选。
- 查看来源 Trace（链路追踪）。
- Archive（归档）。
- Forget（遗忘或删除）。
- Pin（固定重要记忆）。
- Merge（合并）。
- 查看冲突。
- 手动确认冲突处理结果。

### 任务 11：增加 Production Memory Metrics（生产记忆指标）

新增：

```ts
type ProductionMemoryMetrics = {
  totalMemories: number;

  sessionMemoryCount: number;
  longTermMemoryCount: number;
  workspaceMemoryCount: number;

  retrievalCount: number;
  retrievalHitRate: number;
  avgRetrievalDurationMs: number;

  deduplicationCount: number;
  conflictCount: number;
  consolidationCount: number;
  archiveCount: number;
  deleteCount: number;

  expiredCount: number;
  providerErrors: number;
};
```

还建议记录：

```text
多少条检索到的记忆真正被用于最终回答
```

否则只能知道“检索到了”，无法知道这些记忆是否真正有价值。

### 任务 12：完成 Production Memory End-to-End Test（生产记忆端到端测试）

#### Case 1：Session Memory（会话记忆）

第一轮输入：

```text
我当前项目使用 MySQL。
```

同一个 Session（会话）的后续输入：

```text
我现在数据库用的是什么？
```

预期结果：

- Redis Session Memory（Redis 会话记忆）命中。
- 不需要优先查询长期向量记忆。

#### Case 2：跨会话长期记忆

Session A（会话 A）：

```text
以后代码优先使用 TypeScript。
```

结束后归档为用户 preference（偏好）。

Session B（会话 B）：

```text
帮我写一个工具类。
```

预期结果：

- 从 Long-Term Memory（长期记忆）检索到 TypeScript（类型化 JavaScript 语言）偏好。
- 新 Session 不依赖旧 Session Redis（旧会话 Redis 数据）。

#### Case 3：Workspace Archive（工作空间归档）

完成 Research Workspace（研究工作空间）后：

- finding（重要发现）中的关键结论被归档。
- 临时 draft（草稿）不归档。
- lesson（稳定教训）进入长期记忆。

#### Case 4：重复记忆

连续写入两次：

```text
用户偏好中文回答。
```

预期结果：

- 不产生两条 active（已启用）记忆。
- 更新 confidence（置信度）、accessCount（访问次数）或合并来源。

#### Case 5：冲突记忆

旧记忆：

```text
用户偏好简洁回答。
```

新记忆：

```text
用户希望提供非常详细的教学步骤。
```

预期结果：

- 检测 Memory Conflict（记忆冲突）。
- 根据时间与表达明确程度决定覆盖，或者进入 Manual Review（人工审核）。
- Trace（链路追踪）中可以看到冲突处理过程。

#### Case 6：TTL（生存时间）

Session Memory（会话记忆）到期后：

- Redis 中的会话数据被清理。
- Long-Term Memory（长期记忆）不受影响。

---

## 八、Day68 验收标准

1. 是否定义 ProductionMemoryItem（生产记忆条目）和 Memory Scope（记忆作用域）。
2. 是否定义并实现 MemoryProvider（记忆提供者）。
3. 是否实现 ProductionMemoryService（生产记忆服务）。
4. Session Memory（会话记忆）是否迁移到 Redis（内存键值数据库）。
5. Long-Term Memory（长期记忆）是否接入 MySQL + VectorStore（关系型数据库 + 向量存储）。
6. 是否实现统一 Memory Retrieval Pipeline（记忆检索管线）。
7. 是否实现 Memory Deduplication / Conflict Resolution（记忆去重 / 冲突处理）。
8. 是否实现 Workspace Memory Archive（工作空间记忆归档）。
9. Memory（记忆）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）。
10. 是否实现 Memory Governance Explorer（记忆治理浏览器）。
11. 是否增加 Production Memory Metrics（生产记忆指标）。
12. 是否完成 Production Memory End-to-End Test（生产记忆端到端测试）。

---

## 九、Day68 打卡模板

【第68天打卡】

1. 是否定义 ProductionMemoryItem（生产记忆条目）和 Memory Scope（记忆作用域）：是 / 否

2. 是否定义并实现 MemoryProvider（记忆提供者）：是 / 否

3. 是否实现 ProductionMemoryService（生产记忆服务）：是 / 否

4. Session Memory（会话记忆）是否迁移到 Redis（内存键值数据库）：是 / 否

5. Long-Term Memory（长期记忆）是否接入 MySQL + VectorStore（关系型数据库 + 向量存储）：是 / 否

6. 是否实现统一 Memory Retrieval Pipeline（记忆检索管线）：是 / 否

7. 是否实现 Memory Deduplication / Conflict Resolution（记忆去重 / 冲突处理）：是 / 否

8. 是否实现 Workspace Memory Archive（工作空间记忆归档）：是 / 否

9. Memory（记忆）是否接入 RuntimeContext / EventBus / UnifiedRegistry（运行时上下文 / 事件总线 / 统一注册中心）：是 / 否

10. 是否实现 Memory Governance Explorer（记忆治理浏览器）：是 / 否

11. 是否增加 Production Memory Metrics（生产记忆指标）：是 / 否

12. 是否完成 Production Memory End-to-End Test（生产记忆端到端测试）：是 / 否

13. 遇到的最大问题：


14. 当前系统能力：


---

## 十、Day68 核心认知

Day68 最重要的一句话是：

> 生产级 Memory（记忆）的核心不是“记得越多越好”，而是“在正确的作用域中，保存正确的信息，并在正确的时候取出来”。

Day68 要解决的不是简单存储，而是以下四个问题：

| 核心问题 | 中文含义 | 需要回答的问题 |
| --- | --- | --- |
| Scope（作用域） | 记忆归属范围 | 这是谁的记忆？ |
| Lifecycle（生命周期） | 记忆从创建到删除的过程 | 应该保存多久？ |
| Retrieval（检索） | 从记忆库中查找相关信息 | 什么时候应该取？ |
| Governance（治理） | 管理错误、重复和冲突记忆 | 冲突、重复和错误记忆怎么办？ |

完成 Day68 后，系统将升级为：

```text
Production Memory Platform V1（生产级记忆平台第1版）
```

---

## 十一、Day69 预告：Production Knowledge Platform（生产级知识平台）

Day69 将把同样的生产化思路应用到 RAG（检索增强生成）：

- Dynamic Knowledge Base（动态知识库）。
- Document Permission and Scope（文档权限与作用域）。
- Async Indexing Job（异步索引任务）。
- Index Version（索引版本）。
- Retrieval Strategy Configuration（检索策略配置）。
- Citation and Source Traceability（引用与来源追踪）。
- Data Update and Delete Consistency（数据更新与删除一致性）。
- Redis / MySQL / VectorStore / Object Storage Coordination（Redis、MySQL、向量存储和对象存储联动）。

也就是把现有 RAG（检索增强生成）从“能够检索”升级成真正的：

```text
Production Knowledge Platform（生产级知识平台）
```
