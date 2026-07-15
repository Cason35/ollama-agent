# Day66 学习总结：Unified Registry（统一注册中心）

## 本文记录范围

本文整理 `ollama-chat-day66` 项目完成后的学习型对话，包含：

- 项目整体做了什么。
- 项目运用了哪些知识。
- 对比 `ollama-chat-day65` 有哪些改进。
- 为什么要使用 Unified Registry（统一注册中心）。
- RegistryItem（注册项）中的 `type` 和 `metadata` 分别负责什么。
- 当前注册流程是否发生在系统启动阶段。
- 是否可以向用户开放 Agent（智能体）、Tool（工具）、Model（模型）和 Prompt（提示词）的手动注册能力。
- 第66天打卡结果。

本文不记录项目创建、代码复制、代码修改、依赖安装、命令执行和测试过程等过程性聊天。

---

## 一、读懂 `ollama-chat-day66` 项目

### 我的提问

带我来读懂 `ollama-chat-day66` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day65` 有什么改进，为什么这样子做，并且在一些英文专业术语后面补充括号，说明其中文名称或者中文含义。

### 回答整理

### 1. 一句话理解 Day66

`ollama-chat-day66` 在 Day65 的 Unified Event System（统一事件系统）基础上，新增了 Unified Registry（统一注册中心）。

```text
Day65 解决：系统运行过程中发生了什么？
Day66 解决：系统当前拥有哪些能力？这些能力能否被发现和使用？
```

Day66 没有删除 Day65 的功能，而是继续保留 Chat（对话）、Workflow（工作流）、Agent（智能体）、Tool（工具）、Model（模型）、Prompt（提示词）、Memory（记忆）、RAG（检索增强生成）、Evaluation（评估）、Runtime Context（运行时上下文）和 Event System（事件系统），再把这些分散能力统一登记起来。

### 2. 项目整体做了什么

Day66 的完整数据流可以理解为：

```text
AgentRegistry / ToolRegistry / ModelRegistry / PromptRegistry
                         ↓
                 Adapter（适配器）
                         ↓
                RegistryItem（注册项）
                         ↓
          UnifiedRegistry（统一注册中心）
             ├─ 注册、注销、读取
             ├─ 类型过滤
             ├─ 全文搜索
             ├─ Capability Discovery（能力发现）
             ├─ 启用与禁用管理
             └─ Registry Metrics（注册指标）
                         ↓
                 GET /api/registry
                         ↓
           Registry Explorer（注册浏览器）
```

系统以前虽然已经有智能体、工具、模型和提示词，但它们分别保存在不同的 Registry（注册表）中。Day66 把它们转换成统一结构，让前端和未来的 Runtime（运行时）可以面对一个统一能力入口。

### 3. RegistryItem（注册项）

统一注册项结构为：

```ts
type RegistryItem = {
  id: string;
  name: string;
  type:
    | "agent"
    | "tool"
    | "model"
    | "prompt"
    | "memory"
    | "workflow"
    | "evaluation";
  version: string;
  metadata: Record<string, unknown>;
  enabled: boolean;
  createdAt: number;
};
```

各字段的职责如下：

| 字段 | 作用 |
| --- | --- |
| `id` | 跨类型唯一标识，用于定位一项能力 |
| `name` | 展示名称，也是搜索字段 |
| `type` | 区分 Agent（智能体）、Tool（工具）、Model（模型）等类型 |
| `version` | 支持版本管理和版本冲突检测 |
| `metadata` | 保存不同能力特有的描述、标签和运行特征 |
| `enabled` | 控制该能力当前是否可以被能力发现流程返回 |
| `createdAt` | 用于审计、排序和观察 |

这里运用了 Unified Data Model（统一数据模型）。

不同业务对象的内部结构差异很大：

- Agent（智能体）有 `capabilities` 和 `tools`。
- Tool（工具）有 Input Schema（输入结构）和 Output Schema（输出结构）。
- Model（模型）有成本、上下文窗口和延迟信息。
- Prompt（提示词）有状态、变量、评分和版本。

统一注册项没有把所有差异都做成固定字段，而是把所有类型都需要的字段放在外层，把类型特有的数据放在 `metadata` 中。这属于 Metadata-Driven Architecture（元数据驱动架构）。

### 4. RegistryProvider（注册提供者）

项目定义了统一注册协议：

```ts
interface RegistryProvider {
  register(item: RegistryItem): void | Promise<void>;
  unregister(id: string): void | Promise<void>;
  get(id: string): RegistryItem | undefined | Promise<RegistryItem | undefined>;
  list(type?: RegistryItem["type"]): RegistryItem[] | Promise<RegistryItem[]>;
  search(query: string): RegistryItem[] | Promise<RegistryItem[]>;
}
```

这个接口只描述注册中心应该具备什么能力，不规定数据必须存在哪里。

当前实现使用进程内 `Map`。以后可以替换成 Redis（内存数据库与共享状态服务）、MySQL（关系型数据库）、PostgreSQL（关系型数据库）、Consul（服务发现与配置系统）、Etcd（分布式键值存储）或者独立 Registry Service（注册中心服务）。

这里运用了 Interface-Based Design（基于接口的设计）和 Dependency Inversion Principle（依赖倒置原则）：

```text
业务代码依赖 RegistryProvider 协议，
而不是依赖某一种具体存储方式。
```

### 5. UnifiedRegistry（统一注册中心）

当前 UnifiedRegistry（统一注册中心）内部使用：

```ts
Map<string, RegistryItem>
```

它提供：

- `register`：严格注册新能力。
- `upsert`：新增或更新能力，主要供旧注册表同步状态。
- `unregister`：注销能力。
- `get`：按标识读取能力。
- `list`：列出全部或指定类型能力。
- `search`：跨基础字段和元数据搜索。
- `setEnabled`：切换能力启用状态。
- `discoverCapability`：执行统一能力发现。
- `getMetrics`：生成注册指标。

`register()` 会进行 Conflict Detection（冲突检测）：

- 相同 ID 和相同版本再次注册，产生 `duplicate_id`。
- 相同 ID 和不同版本再次注册，产生 `version_conflict`。

项目同时保留 `register()` 和 `upsert()`，是因为两者的职责不同：

```text
register：创建真正的新能力，需要严格检测冲突。
upsert：同步旧注册表中的状态变化，允许覆盖已有描述。
```

例如 Prompt（提示词）从 `active` 切换为 `archived` 时，统一注册项应该同步状态，而不是把它识别为错误的重复注册。

### 6. Defensive Copy（防御性复制）

注册中心写入和读取数据时会复制 `metadata`，避免调用方修改读取结果后污染注册中心内部状态。

这运用了 Encapsulation（封装）和 Defensive Copying（防御性复制）。

### 7. Capability Discovery（能力发现）

能力发现函数是：

```ts
discoverCapability(query, type?)
```

它和普通 `search()` 的区别是：

```text
search：判断某个注册项是否包含搜索文本。

discoverCapability：判断某个已启用注册项是否适合提供目标能力，
并计算相关度和返回可解释的命中原因。
```

能力发现会综合检查：

- `capabilities`：能力声明。
- `tags`：标签。
- `name`：名称。
- `description`：描述。
- `type`：类型。
- `version`：版本。
- 其他 Metadata（元数据）。

返回结果包含：

```ts
{
  item,
  score,
  reasons
}
```

`reasons` 用于 Explainability（可解释性），例如：

```text
能力声明命中：research
标签命中：research
名称包含：research
```

实际查询：

```text
research capability
```

可以发现：

1. Research Prompt（研究提示词）。
2. Research Tool（研究工具）。
3. Research Agent（研究智能体）。

这说明能力发现已经可以跨类型工作，而不只是到某一个独立注册表中查找。

### 8. 为什么禁用项不参与能力发现

能力发现只处理：

```ts
enabled === true
```

PromptRegistry（提示词注册表）中存在：

- `active`：正在使用。
- `draft`：草稿。
- `archived`：已归档。

只有 `active` 提示词会被转换为 `enabled: true`。

草稿和归档版本仍然可以在 Registry Explorer（注册浏览器）中显示，但不会被 Runtime Discovery（运行时发现）返回。

这样可以同时满足：

```text
管理视角：需要查看全部历史版本。
运行视角：只能选择当前允许使用的版本。
```

### 9. 四类旧注册表的迁移

#### AgentRegistry（智能体注册表）

Agent（智能体）会被转换为：

```text
id: agent:research
type: agent
metadata:
  description
  capabilities
  tools
  tags
```

旧代码仍然可以使用：

```ts
new AgentRegistry()
```

需要接入统一注册中心时可以使用：

```ts
new AgentRegistry(unifiedRegistry)
```

这属于 Optional Dependency Injection（可选依赖注入）。

#### ToolRegistry（工具注册表）

工具会登记：

- Description（描述）。
- Capabilities（能力）。
- Dependencies（依赖）。
- Input Schema（输入结构）。
- Output Schema（输出结构）。
- Timeout（超时时间）。
- Retry Policy（重试策略）。

#### ModelRegistry（模型注册表）

模型 Metadata（元数据）包括：

- Provider（模型提供方）。
- Model（底层模型名称）。
- Capabilities（能力标签）。
- Roles（协作角色）。
- Context Window（上下文窗口）。
- Max Output Tokens（最大输出词元数量）。
- Cost（成本）。
- Latency（延迟级别）。
- Health Status（健康状态）。
- Fallback Chain（降级模型链）。

这些信息为后续 Dynamic Model Routing（动态模型路由）提供统一数据基础。

#### PromptRegistry（提示词注册表）

Prompt Version（提示词版本）的统一 ID 类似：

```text
prompt:research@v1
prompt:research@v2
prompt:research@v3
```

不同版本需要同时存在，所以提示词 ID 同时包含组件标识和版本标识。

当提示词被激活、归档或回滚时，旧 PromptRegistry 会同步修改 UnifiedRegistry 中的 `enabled` 和 `status`。

### 10. 为什么使用 Adapter Pattern（适配器模式）

如果直接删除所有旧注册表，就需要一次性修改 Agent Runtime（智能体运行时）、Workflow Planner（工作流规划器）、Model Router（模型路由器）、Prompt Runtime（提示词运行时）、Tool Executor（工具执行器）、API 和各种 Dashboard（仪表盘）。

这种方式属于 Big Bang Migration（一次性大规模迁移），风险较高。

Day66 采用：

```text
旧 Registry API（旧注册表接口）
        ↓
Adapter（适配器）
        ↓
UnifiedRegistry（统一注册中心）
```

主要好处是：

- 保持 Backward Compatibility（向后兼容）。
- 历史业务代码可以继续运行。
- 新代码可以使用统一注册中心。
- 可以逐步迁移调用方。
- 出现问题时更容易回滚。

### 11. 当前统一能力目录

当前项目注册的能力数量为：

| 类型 | 数量 |
| --- | ---: |
| Agent | 7 |
| Tool | 14 |
| Model | 5 |
| Prompt | 15 |
| Memory | 1 |
| Workflow | 1 |
| Evaluation | 1 |
| 总计 | 44 |

其中：

- 启用能力：39。
- 禁用能力：5。
- 不同版本：4。

### 12. API 和 Registry Explorer（注册浏览器）

注册中心接口支持：

```text
GET /api/registry
GET /api/registry?type=model
GET /api/registry?query=research
GET /api/registry?includeDisabled=false
```

接口返回：

```ts
{
  items,
  discoveries,
  metrics,
  filters,
  generatedAt
}
```

这里使用了 Next.js Route Handler（Next.js 路由处理器）。

Registry Explorer（注册浏览器）支持：

- 查看注册项总数。
- 查看启用和禁用数量。
- 查看版本数量。
- 查看 Agent、Tool、Model 和 Prompt 数量。
- 按七种类型过滤。
- 查询 `research`、`summary` 和 `evaluation` 等能力。
- 展示能力发现分数和命中原因。
- 控制是否显示禁用版本。
- 展示注册项 Metadata（元数据）。

Registry Explorer 是 Client Component（客户端组件），因为它需要状态、生命周期、交互事件和浏览器端请求。

### 13. Day66 对比 Day65 的改进

| 对比维度 | Day65 | Day66 |
| --- | --- | --- |
| 核心主题 | Unified Event System（统一事件系统） | Unified Registry（统一注册中心） |
| 主要问题 | 系统刚才发生了什么 | 系统现在拥有什么能力 |
| 核心数据 | `RuntimeEvent`（运行时事件） | `RegistryItem`（注册项） |
| 核心接口 | `EventBus`（事件总线） | `RegistryProvider`（注册提供者） |
| 核心实现 | `MemoryEventBus`（内存事件总线） | `UnifiedRegistry`（统一注册中心） |
| 主要操作 | 发布、订阅和取消订阅 | 注册、注销、读取、列表和搜索 |
| 数据特征 | 动态、按时间发生 | 相对稳定、描述能力库存 |
| 解耦对象 | 事件发布者和事件订阅者 | 业务运行时和不同注册表 |
| 可观测页面 | Event Explorer（事件浏览器） | Registry Explorer（注册浏览器） |
| 新增能力 | 事件通信、Trace（链路追踪）、Usage（用量）和 Evaluation（评估）联动 | 能力目录、版本状态、能力发现和注册指标 |

Day65 和 Day66 不是替代关系，而是互补关系：

```text
UnifiedRegistry：告诉系统“有哪些能力可以调用”。

RuntimeContext：告诉能力“当前请求是谁、状态是什么”。

RuntimeEvent：告诉其他模块“能力调用过程中发生了什么”。
```

完整组合关系为：

```text
Capability Discovery（能力发现）
        ↓
Runtime Context（运行时上下文）
        ↓
执行 Agent / Tool / Model
        ↓
Runtime Event（运行时事件）
        ↓
Trace / Usage / Evaluation 自动响应
```

### 14. 当前实现边界

当前项目完成了教学目标，但还不是完整的 Production Registry（生产级注册中心）：

1. UnifiedRegistry 使用进程内 `Map`，服务重启后数据会消失。
2. `/api/registry` 每次请求都会重新创建确定性的注册中心快照，没有持久化。
3. 现有 Workflow Planner 和 Model Router 仍主要调用旧注册表，UnifiedRegistry 目前主要承担统一登记、查看和能力发现职责。
4. 模型的 `healthStatus: "healthy"` 是静态描述，不是实时健康探测结果。
5. Tool 的超时和重试策略当前主要用于描述，还没有完全由统一注册中心动态下发。
6. Registry Metrics（注册指标）是当前快照，还没有 Registry Growth Trend（注册中心增长趋势）等时间序列数据。

因此，Day66 的核心价值是建立统一抽象、统一能力目录和逐步迁移路径，为后续动态路由、持久化注册中心和运行时能力选择打基础。

---

## 二、关于“通用对象类型”的理解

### 我的提问

就是弄了个通用的对象类型，可以注册系统里面的 `agent`、`tool`、`model`、`prompt`、`memory`、`workflow`、`evaluation` 各个类型的对象，通过 `type` 和 `metadata` 来决定注册的类型和其能力吗？

### 回答整理

这个理解基本正确，但需要补充一个关键点：UnifiedRegistry（统一注册中心）注册的主要是“能力描述对象”，不一定是可以直接执行的完整业务对象。

其中：

- `type`：回答“它是什么类型”。
- `metadata`：回答“它具有什么能力和特征”。
- `enabled`：回答“它当前能不能被发现和使用”。
- `version`：回答“它是哪一个版本”。

例如一个 Tool（工具）可能被转换成：

```ts
{
  id: "tool:research",
  name: "research",
  type: "tool",
  version: "1.0.0",
  enabled: true,
  metadata: {
    description: "研究工具",
    capabilities: ["research"],
    dependencies: ["summary", "todo"],
    inputSchema: {},
    outputSchema: {},
    timeoutMs: 30000
  }
}
```

能力发现的判断过程大致为：

```text
type
  → 它属于 Tool（工具）

metadata.capabilities
  → 它提供 research（研究）能力

metadata.tags / description
  → 它还有哪些可搜索特征

enabled
  → 它目前是否可以参与能力发现
```

需要注意，`metadata` 不决定 `type`，两者职责不同：

```text
type：分类。
metadata：描述。
```

另外，当前统一注册中心没有直接保存工具的 `execute()` 函数，也没有保存 Agent（智能体）的完整执行逻辑。

真实结构是：

```text
ToolRegistry（工具注册表）
  ├─ 保存真正可以执行的 Tool 对象
  └─ 提供 execute() 执行入口

UnifiedRegistry（统一注册中心）
  └─ 保存 Tool 的统一能力描述
```

两者通过 Adapter（适配器）同步：

```text
真实 Tool 对象
    ↓ 转换
RegistryItem 描述对象
    ↓
UnifiedRegistry
```

因此，Day66 当前更准确的定位是：建立一份统一的 System Capability Catalog（系统能力目录），让系统知道有哪些 Agent、Tool、Model 和 Prompt 等能力，以及它们的类型、版本、状态和能力特征。

它目前偏向 Capability Catalog（能力目录）和 Capability Discovery（能力发现），还不是完全取代所有旧注册表的统一执行容器。

---

## 三、关于系统启动注册和用户手动注册

### 我的提问

这种注册是系统内部已经写好的 Agent、Tool、Model、Prompt 在系统启动的时候注册吗？能不能提供一些接口给用户，让用户自己手动注册 Agent、Tool、Model、Prompt？

### 回答整理

### 1. 当前项目是如何注册的

当前 Day66 项目主要注册系统内置能力，但还不是严格意义上的“服务器启动时只注册一次”。

当前流程更准确地说是：

```text
请求 GET /api/registry
        ↓
创建新的 UnifiedRegistry
        ↓
注册系统内置 Agent、Tool、Model 和 Prompt
        ↓
补充 Memory、Workflow 和 Evaluation
        ↓
返回注册中心快照
```

`createDay66UnifiedRegistry()` 会在生成注册中心快照时创建一份新的内存注册表。

当前 `/api/registry` 只有 `GET` 接口，没有：

```text
POST    注册能力
PUT     整体更新能力
PATCH   修改状态或元数据
DELETE  注销能力
```

所以用户目前只能查看、过滤和搜索，不能通过页面或者接口注册自己的能力。

### 2. 可以向用户开放注册接口

可以设计：

```http
POST /api/registry
Content-Type: application/json
```

请求示例：

```json
{
  "id": "model:my-qwen",
  "name": "我的 Qwen 模型",
  "type": "model",
  "version": "1.0.0",
  "enabled": true,
  "metadata": {
    "provider": "ollama",
    "model": "qwen2.5:7b",
    "capabilities": ["chat", "summary"],
    "contextWindow": 16384
  }
}
```

还可以继续增加：

```text
GET /api/registry/:id
    查看单个能力

PATCH /api/registry/:id
    修改 metadata、version 或 enabled

DELETE /api/registry/:id
    注销能力
```

Registry Explorer（注册浏览器）也可以增加新建、编辑、启用、禁用和注销表单。

### 3. 必须区分“注册描述”和“注册执行逻辑”

这是用户注册功能中最重要的区别。

当前 RegistryItem 保存的是能力描述：

```ts
{
  type: "tool",
  metadata: {
    capabilities: ["search"]
  }
}
```

它没有保存真正的工具执行函数：

```ts
async execute() {
  // 工具执行逻辑
}
```

因此用户通过接口注册 Tool 后，系统只能知道：

```text
这里有一个叫 search 的工具，
它声明自己具有 search 能力。
```

但系统还不知道应该执行哪个函数。

### 4. Model 和 Prompt 更容易动态注册

Model（模型）可以通过配置连接已有模型：

```json
{
  "provider": "ollama",
  "model": "qwen2.5:7b"
}
```

Prompt（提示词）本身主要是数据：

```json
{
  "template": "你是一个研究助手……",
  "variables": ["task"]
}
```

因此 Model 和 Prompt 比较适合让用户通过接口直接创建和修改。

### 5. Agent 适合声明式注册

Agent（智能体）可以使用 Declarative Configuration（声明式配置）：

```json
{
  "id": "agent:custom-research",
  "type": "agent",
  "metadata": {
    "systemPromptId": "prompt:research@v3",
    "modelId": "model:my-qwen",
    "tools": ["search", "summary"],
    "capabilities": ["research"]
  }
}
```

系统根据这些配置，使用已有 Agent Runtime（智能体运行时）组装出一个 Agent，而不是让用户直接上传任意代码。

### 6. Tool 动态注册需要严格安全限制

如果允许用户通过接口提交任意 JavaScript（脚本语言）或者 TypeScript（带类型的 JavaScript）代码，可能出现：

- 读取服务器文件。
- 读取环境变量和 API Key（接口密钥）。
- 发起恶意网络请求。
- 执行系统命令。
- 无限循环或者占满 CPU（中央处理器）。
- 删除或篡改数据。

所以 Tool（工具）动态注册通常有以下方案：

#### 方案一：绑定内置 Handler（处理器）

```json
{
  "handler": "builtin.weather"
}
```

用户只能选择系统已经实现并审核过的执行函数。

#### 方案二：Plugin Package（插件包）

代码通过受控的插件安装流程部署，注册接口只负责启用插件和选择 Handler。

```json
{
  "pluginId": "company-weather-plugin",
  "handler": "weather.query"
}
```

#### 方案三：Sandbox（沙箱）

用户代码运行在独立容器、受限 Worker（工作线程）或者隔离进程中，限制文件、网络、CPU、内存和执行时间。

### 7. 用户注册需要持久化存储

如果继续使用当前的内存 `Map`，用户注册的数据会在服务重启后消失。

更完整的流程应该是：

```text
用户提交注册请求
        ↓
认证、权限、Schema（结构）、版本和安全校验
        ↓
写入 MySQL / PostgreSQL / Redis
        ↓
更新 Registry Cache（注册中心缓存）
        ↓
发布 registry.item.registered 事件
        ↓
其他运行时刷新能力目录
```

还可以实现新的 RegistryProvider：

```ts
class MySQLRegistryProvider implements RegistryProvider {
  register(item) {}
  unregister(id) {}
  get(id) {}
  list(type) {}
  search(query) {}
}
```

因为上层业务依赖的是 RegistryProvider 协议，所以底层从内存更换成数据库时，不需要重写全部调用方。

### 8. 推荐的用户注册边界

| 类型 | 是否适合用户直接注册 | 推荐方式 |
| --- | --- | --- |
| Prompt | 非常适合 | 直接保存模板、变量和版本 |
| Model | 适合 | 保存 Provider、模型名、成本和能力配置 |
| Agent | 适合声明式注册 | 组合 Model、Prompt 和已批准 Tool |
| Workflow | 适合声明式注册 | 保存节点、依赖和执行条件 |
| Evaluation | 适合配置注册 | 保存数据集、评分器和阈值 |
| Memory | 适合注册已有 Provider | 选择 Redis、Vector Store（向量存储）等实现 |
| Tool | 需要严格限制 | 绑定内置 Handler、受控插件或者沙箱代码 |

因此，Day66 的 RegistryProvider 已经为用户注册预留了接口抽象，但当前版本只完成了：

```text
系统内置能力的统一登记、查看和发现。
```

后续可以升级为：

```text
用户通过 API 或管理页面创建 Model、Prompt、声明式 Agent 和 Workflow；
Tool 则通过受控 Handler、Plugin（插件）或 Sandbox（沙箱）机制接入。
```

---

## 四、Day66 核心认知

Day66 最重要的一句话是：

```text
Registry（注册中心）解决“系统拥有什么能力”；
Event（事件）解决“系统发生了什么事情”。
```

Day64、Day65 和 Day66 的升级关系是：

```text
Day64：Unified Runtime Context（统一运行时上下文）
  → 统一当前请求状态和身份

Day65：Unified Event System（统一事件系统）
  → 统一运行过程中的事件通信

Day66：Unified Registry（统一注册中心）
  → 统一系统能力目录和能力发现
```

三者组合后，系统开始具备：

```text
State Unification（状态统一）
        +
Event Unification（事件统一）
        +
Capability Unification（能力统一）
```

---

## 五、第66天打卡

【第66天打卡】

1. 是否定义 RegistryItem（注册项）：是

2. 是否定义 RegistryProvider（注册提供者）：是

3. 是否实现 UnifiedRegistry（统一注册中心）：是

4. AgentRegistry（智能体注册表）是否迁移：是

5. ToolRegistry（工具注册表）是否迁移：是

6. ModelRegistry（模型注册表）是否迁移：是

7. PromptRegistry（提示词注册表）是否迁移：是

8. 是否实现 Capability Discovery（能力发现）：是

9. 是否实现 Registry Explorer（注册浏览器）：是

10. 是否增加 Registry Metrics（注册指标）：是

11. 遇到的最大问题：

如何在建立 Unified Registry（统一注册中心）的同时保留旧 AgentRegistry、ToolRegistry、ModelRegistry 和 PromptRegistry 的历史调用方式，并正确区分“能力描述对象”和“真正可执行的业务对象”。最终通过 Adapter Pattern（适配器模式）、Optional Dependency Injection（可选依赖注入）、严格 `register` 与兼容 `upsert` 分离的方式完成迁移，避免一次性重写全部历史业务代码。

12. 当前系统能力：

当前系统已经具备 Chat（对话）、Workflow（工作流）、Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Memory（记忆）、Prompt（提示词）、Model（模型）、Evaluation（评估）、Redis（共享状态与缓存）、Queue（任务队列）、Distributed Lock（分布式锁）、Object Storage（对象存储）、Config Center（配置中心）、Secrets Management（密钥管理）、Unified Runtime Context（统一运行时上下文）、Unified Event System（统一事件系统）和 Unified Registry（统一注册中心）能力。

在 Day66 中，系统可以统一登记 Agent、Tool、Model、Prompt、Memory、Workflow 和 Evaluation，按类型、名称、标签、描述、版本和 Metadata（元数据）搜索能力，过滤禁用能力，执行 Capability Discovery（能力发现），展示可解释的匹配分数，并通过 Registry Explorer（注册浏览器）和 Registry Metrics（注册指标）观察完整能力目录。

当前注册中心仍然使用进程内存储，主要注册系统内置能力，还没有实现用户注册接口、持久化注册存储、实时健康检查、分布式注册同步和所有运行时模块直接通过 UnifiedRegistry 动态选取能力。这些可以作为后续 Production Registry（生产级注册中心）的升级方向。

---

## 六、Day66 阶段总结：完成能力统一层

首先，恭喜完成 Day66。

这一天非常关键，因为系统完成了 Agent Platform（智能体平台）的 Capability Unification Layer（能力统一层）。

前三天的平台化升级关系为：

```text
Day64：Unified Runtime Context（统一运行时上下文）
  → 统一请求身份、状态和运行信息

Day65：Unified Event System（统一事件系统）
  → 统一模块之间的事件通信

Day66：Unified Registry（统一注册中心）
  → 统一系统能力的登记、描述、发现和观察
```

到这里，系统已经具备平台化 Agent Framework（智能体框架）的三个重要底层组件：

```text
RuntimeContext（运行时上下文）
        ↓
EventBus（事件总线）
        ↓
UnifiedRegistry（统一注册中心）
```

三者分别回答：

```text
RuntimeContext：当前请求是谁，携带了什么状态？

EventBus：运行过程中刚刚发生了什么事情？

UnifiedRegistry：系统当前拥有哪些可以被发现和调用的能力？
```

这三个组件组合后，已经形成许多现代 Agent Platform（智能体平台）的基础架构骨架。

### 1. Day66 的最大变化

以前，系统中存在多个相互独立的 Registry（注册表）：

```text
AgentRegistry（智能体注册表）
ToolRegistry（工具注册表）
ModelRegistry（模型注册表）
PromptRegistry（提示词注册表）
```

每个注册表只管理自己的领域对象，其他模块需要分别了解和访问它们，容易形成 Registry Silo（注册信息孤岛）。

Day66 将它们升级为统一能力目录：

```text
                    UnifiedRegistry（统一注册中心）
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        │          │           │           │          │
      Agent       Tool       Model       Prompt     Memory
   （智能体）   （工具）    （模型）    （提示词）  （记忆）
        │          │           │           │          │
        └──────────┴──── Workflow（工作流） ──────────┘
                               │
                    Evaluation（评估能力）
```

### 2. 系统现在具备的三项关键能力

#### 能力注册

例如新增 Research Agent（研究智能体）时，通过 `register()` 将其能力描述写入 UnifiedRegistry（统一注册中心），系统便知道这项能力存在、属于什么类型、具有什么版本以及当前是否启用。

#### 能力发现

例如 Supervisor（监督智能体）需要 research capability（研究能力）时，可以通过 Capability Discovery（能力发现）获得：

- Research Agent（研究智能体）。
- Search Tool（搜索工具）。
- Research Prompt（研究提示词）。
- 后续可以接入的 Knowledge Retriever（知识检索器）。

#### 动态扩展基础

以后新增 MCP Tool（基于 Model Context Protocol，即模型上下文协议接入的工具）时，理想情况下不需要修改核心 Runtime（运行时），而是通过受控安装、能力注册和安全校验将其接入系统。

这体现了 Pluggable Architecture（可插拔架构）和 Open-Closed Principle（开闭原则）：核心运行时尽量对扩展开放，对已有稳定逻辑的修改保持谨慎。

---

## 七、当前整体学习进度

按照当前学习计划的阶段划分：

### Phase 1：Agent Runtime（第一阶段：智能体运行时）

```text
Agent Runtime    ██████████████████████████ 100%
```

### Phase 2：Infrastructure（第二阶段：基础设施）

```text
Redis（共享状态与缓存）             ██████████
Queue（任务队列）                   ██████████
Lock（分布式锁）                    ██████████
Storage（对象存储）                 ██████████
Config（配置中心）                  ██████████
Secrets（密钥管理）                 ██████████
```

### Phase 3：Production Upgrade（第三阶段：生产化升级）

```text
Runtime Context（运行时上下文）     ██████████
Event System（事件系统）            ██████████
Registry（注册中心）                ██████████
Prompt Platform（提示词平台）       ░░░░░░░░░░
Memory Upgrade（记忆系统升级）      ░░░░░░░░░░
RAG Upgrade（检索增强生成升级）     ░░░░░░░░░░
```

按照学习计划的完成度口径，当前整体进度约为：

```text
99.3%
```

这个百分比表示学习路线已经进入最后的平台融合阶段，不代表系统已经满足真实生产环境的全部安全、可靠性、扩缩容和运维要求。

---

## 八、Day67 学习计划：Production Prompt Platform（生产级提示词平台）

Day67 的主题是：

```text
Production Upgrade V4（生产化升级第4版）
Production Prompt Platform（生产级提示词平台）
```

### 今日核心目标

把 Day52 到 Day55 学习和实现的 Prompt System（提示词系统）真正接入生产化架构，让 Prompt（提示词）从独立模块升级为 Agent Platform（智能体平台）的核心可运营能力。

此前已经实现：

- PromptTemplate（提示词模板）。
- PromptRegistry（提示词注册表）。
- PromptVersion（提示词版本）。
- PromptBlock（提示词块）。
- PromptBuilder（提示词构建器）。
- PromptOptimizer（提示词优化器）。
- Prompt Experiment（提示词实验）。

但是这些能力目前仍然偏向独立模块和教学演示。Day67 要进一步把它们接入 UnifiedRegistry（统一注册中心）、RuntimeContext（运行时上下文）、Trace（链路追踪）、Evaluation（评估）和 Experiment Platform（实验平台）。

### 为什么需要 Production Prompt Platform（生产级提示词平台）

简单系统中的调用关系可能是：

```text
Agent（智能体）
    ↓
PromptBuilder（提示词构建器）
    ↓
Prompt（提示词）
```

生产化系统应该形成更完整的治理链路：

```text
UnifiedRegistry（统一注册中心）
        ↓
PromptRegistry（提示词注册表）
        ↓
PromptOptimizer（提示词优化器）
        ↓
RuntimeContext（运行时上下文）
        ↓
Agent（智能体）
        ↓
Evaluation（评估）
        ↓
Prompt Experiment（提示词实验）
```

这意味着 Prompt 不再只是 Agent 代码中的一个字符串，而是拥有版本、状态、实验、评估、发布、回滚和指标的独立平台资产。

### Day67 最终调用链路

完成 Day67 后，一次 Agent 调用希望形成以下完整链路：

```text
User Task（用户任务）
        ↓
RuntimeDecision（运行时决策）
        ↓
Prompt Strategy（提示词策略）
        ↓
PromptRegistry（提示词注册表）
        ↓
PromptVersion（提示词版本）
        ↓
PromptBlockBuilder（提示词块构建器）
        ↓
Rendered Prompt（渲染后的提示词）
        ↓
Model（模型）
        ↓
Evaluation（评估）
        ↓
Prompt Metrics（提示词指标）
```

---

## 九、Day67 任务清单

### 任务 1：深化 PromptRegistry 与 UnifiedRegistry 的集成

Day66 已经通过 Adapter（适配器）把 PromptRegistry（提示词注册表）的版本和启用状态同步到 UnifiedRegistry（统一注册中心）。

Day67 需要在此基础上继续深化生产化集成，让提示词不仅可以被统一查看，还可以被 Prompt Runtime（提示词运行时）、Agent Runtime（智能体运行时）、Experiment（实验）和 Promotion（发布晋级）流程统一使用。

统一注册项示例：

```ts
{
  id: "prompt:writer@v3",
  name: "Writer Prompt（写作提示词）",
  type: "prompt",
  version: "3.0",
  metadata: {
    agentId: "writer",
    capabilities: ["writing"],
    status: "active"
  },
  enabled: true
}
```

重点验证：

- Prompt Version（提示词版本）是否独立注册。
- Prompt Status（提示词状态）是否与 `enabled` 保持一致。
- Agent（智能体）和 Workflow（工作流）是否能够发现自己依赖的提示词。
- Prompt Runtime 是否能够通过统一注册协议加载目标版本。

### 任务 2：定义 ProductionPrompt（生产提示词）

新增生产提示词结构：

```ts
type ProductionPrompt = {
  id: string;
  name: string;
  version: string;
  agentId?: string;
  blocks: PromptBlock[];
  strategy: string;
  status:
    | "draft"
    | "testing"
    | "active"
    | "deprecated";
  createdAt: number;
};
```

字段含义：

| 字段 | 作用 |
| --- | --- |
| `id` | 提示词唯一标识 |
| `name` | 提示词展示名称 |
| `version` | 提示词版本 |
| `agentId` | 可选关联 Agent（智能体） |
| `blocks` | 组成提示词的 PromptBlock（提示词块）列表 |
| `strategy` | Prompt Strategy（提示词策略） |
| `status` | 生命周期状态 |
| `createdAt` | 创建时间戳 |

状态含义：

```text
draft（草稿）
testing（测试中）
active（已启用）
deprecated（已弃用）
```

如果后续 Promotion Workflow（发布晋级流程）需要明确区分人工批准阶段，可以增加 `approved`（已批准）状态，或者把批准信息保存到 Approval Metadata（审批元数据）中。

### 任务 3：实现 PromptRuntimeService（提示词运行服务）

新增：

```ts
class PromptRuntimeService
```

它负责统一执行：

```text
Select Prompt（选择提示词）
        ↓
Load Version（加载版本）
        ↓
Optimize Blocks（优化提示词块）
        ↓
Render（渲染）
        ↓
Record Metrics（记录指标）
```

PromptRuntimeService 的价值是把提示词选择、版本加载、块组合、渲染、追踪和指标记录从 Agent 的业务逻辑中抽离出来，实现 Separation of Concerns（职责分离）。

### 任务 4：让 Prompt 接入 RuntimeContext

以前 Prompt 可能由不同模块自行收集数据。Day67 要统一为：

```ts
renderPrompt(runtimeContext)
```

从 RuntimeContext（运行时上下文）读取：

- Memory（记忆）。
- Workspace（共享工作空间）。
- Knowledge（知识上下文）。
- Strategy（运行策略）。
- User Intent（用户意图）。

这样可以保证同一次请求中的 Prompt、Agent、Model 和 Evaluation 使用一致的上下文来源，避免 Context Drift（上下文漂移）。

### 任务 5：PromptVersion 自动绑定 Trace

每次提示词渲染和模型调用都需要在 Trace（链路追踪）中记录：

```ts
{
  promptId,
  version,
  blocks,
  strategy
}
```

这样以后可以回答：

```text
本次回答使用了哪个 Prompt？
使用的是哪个版本？
包含哪些 PromptBlock？
采用了什么策略？
为什么模型会生成当前结果？
```

这属于 Prompt Observability（提示词可观测性）和 Reproducibility（可复现性）。

### 任务 6：PromptExperiment 生产化

Day53 的 Prompt Experiment（提示词实验）偏向教学和固定版本对比。Day67 要升级为通用实验链路：

```text
Agent（智能体）
        ↓
Prompt Version A（提示词版本A）
Prompt Version B（提示词版本B）
        ↓
Dataset（数据集）
        ↓
Evaluation（评估）
        ↓
Winner Selection（优胜版本选择）
```

实验不再固定为某个 `writer.v1` 或 `writer.v2`，而是可以为不同 Agent、不同数据集和不同 Prompt Version 动态创建实验。

这属于 A/B Testing（A/B测试）和 Experiment Management（实验管理）。

### 任务 7：实现 PromptQualityScore（提示词质量评分）

新增：

```ts
type PromptQualityScore = {
  correctness: number;
  relevance: number;
  cost: number;
  latency: number;
  overall: number;
};
```

各字段含义：

- `correctness`：Correctness（正确性）。
- `relevance`：Relevance（相关性）。
- `cost`：Cost Efficiency（成本效率）。
- `latency`：Latency Performance（延迟表现）。
- `overall`：Overall Score（综合评分）。

需要注意，不同指标的方向可能不同：正确性和相关性通常越高越好，而原始成本和延迟通常越低越好。因此在计算 `overall` 前，需要先进行 Normalization（归一化）或转换成成本效率分和延迟表现分。

### 任务 8：实现 PromptPromotion（提示词发布晋级）

提示词发布流程应类似代码发布：

```text
draft（草稿）
        ↓
testing（测试中）
        ↓
approved（已批准）
        ↓
active（已启用）
```

上线前必须通过 Quality Gate（质量门禁），例如：

- 正确性不低于阈值。
- 相关性不低于阈值。
- 高优先级 Bad Case（失败案例）不能退步。
- 成本和延迟不能超过预算。
- 实验样本量满足最低要求。

还需要支持：

- Rollback（回滚）。
- Archive（归档）。
- Audit Log（审计日志）。
- Approval（审批）。

### 任务 9：升级 PromptExplorer V2（提示词浏览器第2版）

Prompt Explorer V2 需要展示：

- Prompt（提示词）。
- Version（版本）。
- Agent（关联智能体）。
- Blocks（提示词块）。
- Strategy（策略）。
- Score（评分）。
- Usage（用量）。
- Status（状态）。

需要支持以下操作：

- Compare（比较）。
- Promote（晋级发布）。
- Rollback（回滚）。
- Archive（归档）。

Prompt Explorer V2 不只是查看页面，还将成为 Prompt Operations Console（提示词运营控制台）。

### 任务 10：完成 ProductionPromptTest（生产提示词测试）

至少测试三个 Agent（智能体）及其提示词：

```text
Research Agent（研究智能体）
  → research.v1

Writer Agent（写作智能体）
  → writer.v2

Critic Agent（审查智能体）
  → critic.v1
```

验证完整链路：

```text
Agent（智能体）
        ↓
Prompt（提示词）
        ↓
Model（模型）
        ↓
Evaluation（评估）
```

测试至少应覆盖：

- Prompt 是否根据 Agent 和 RuntimeContext 正确选择。
- Prompt Version 是否进入 Trace。
- PromptBlock 是否按预期组合和渲染。
- Model 调用结果是否关联 Prompt Metrics。
- Evaluation 是否生成 PromptQualityScore。
- 未通过 Quality Gate 的版本是否被禁止晋级。
- Promote、Rollback 和 Archive 是否正确修改生命周期状态。

---

## 十、Day67 验收标准

1. PromptRegistry（提示词注册表）是否完成与 UnifiedRegistry（统一注册中心）的生产化集成。

2. 是否定义 ProductionPrompt（生产提示词）。

3. 是否实现 PromptRuntimeService（提示词运行服务）。

4. Prompt（提示词）是否接入 RuntimeContext（运行时上下文）。

5. PromptVersion（提示词版本）是否进入 Trace（链路追踪）。

6. PromptExperiment（提示词实验）是否完成生产化升级。

7. 是否实现 PromptQualityScore（提示词质量评分）。

8. 是否实现 PromptPromotion（提示词发布晋级）。

9. 是否实现 PromptExplorer V2（提示词浏览器第2版）。

10. 是否完成 ProductionPromptTest（生产提示词测试）。

---

## 十一、Day67 打卡模板

【第67天打卡】

1. PromptRegistry（提示词注册表）是否迁移到 UnifiedRegistry（统一注册中心）：是 / 否

2. 是否定义 ProductionPrompt（生产提示词）：是 / 否

3. 是否实现 PromptRuntimeService（提示词运行服务）：是 / 否

4. Prompt（提示词）是否接入 RuntimeContext（运行时上下文）：是 / 否

5. PromptVersion（提示词版本）是否进入 Trace（链路追踪）：是 / 否

6. PromptExperiment（提示词实验）是否完成生产化升级：是 / 否

7. 是否实现 PromptQualityScore（提示词质量评分）：是 / 否

8. 是否实现 PromptPromotion（提示词发布晋级）：是 / 否

9. 是否实现 PromptExplorer V2（提示词浏览器第2版）：是 / 否

10. 是否完成 ProductionPromptTest（生产提示词测试）：是 / 否

11. 遇到的最大问题：


12. 当前系统能力：


---

## 十二、Day67 核心认知

Day67 最重要的一句话是：

```text
Prompt（提示词）不应该只是 Agent（智能体）的代码细节，
而应该成为 Agent Platform（智能体平台）的可运营资产。
```

简单系统中的 Prompt 可能隐藏在代码里：

```ts
const prompt = "你是一个研究助手……";
```

生产系统中的 Prompt 应该像以下资产一样被管理：

- Code Version（代码版本）。
- Model Version（模型版本）。
- Database Schema（数据库结构）。
- Configuration File（配置文件）。

生产级 Prompt 应该具备：

```text
Version（版本管理）
Experiment（实验）
Evaluation（评估）
Promotion（发布晋级）
Rollback（回滚）
Observability（可观测性）
Audit（审计）
```

这意味着 Prompt 的目标不再只是“能够生成文本”，而是要能够回答：

```text
当前线上使用的是哪个版本？
这个版本为什么上线？
它在哪些数据集上表现更好？
它的成本和延迟是多少？
出现质量回退时如何快速回滚？
某一次模型回答究竟使用了哪些提示词块？
```

---

## 十三、Day67 之后的学习路线

| Day（天数） | 内容 |
| --- | --- |
| Day64 | Unified Runtime Context（统一运行时上下文）✅ |
| Day65 | Unified Event System（统一事件系统）✅ |
| Day66 | Unified Registry（统一注册中心）✅ |
| Day67 | Production Prompt Platform（生产级提示词平台） |
| Day68 | Production Memory Upgrade（生产级记忆系统升级） |
| Day69 | Production RAG Upgrade（生产级检索增强生成升级） |
| Day70 | Production Workflow Upgrade（生产级工作流升级） |
| Day71 | Production Evaluation Platform（生产级评估平台） |
| Day72 | Observability Platform（可观测性平台） |
| Day73 | Production Integration Test（生产级集成测试） |

完成 Day66 后，学习路线进入最后七天的平台融合阶段。

从 Day67 开始，之前分别学习的 Prompt、Memory、RAG、Workflow、Evaluation、Trace、Usage 和 Registry 等模块将逐步重新组合，项目会越来越接近真正的 Enterprise Agent Platform（企业级智能体平台）。
