# Day 50 Learning Summary（第 50 天学习总结）

## 文档范围

本文档整理围绕 `ollama-chat-day50` 项目学习与理解的对话，包含学习问题与对应回答。

按照要求，本文档不记录创建文件夹、复制项目、修改代码、安装依赖、运行测试和检查页面等项目实施过程，只保留用于理解项目设计、技术知识、版本改进和设计原因的内容。

---

## 问题 1：Day 50 项目做了什么、运用了什么知识、相比 Day 49 有什么改进、为什么这样做？

### 我问

> 带我来读懂 `ollama-chat-day50` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day49` 有什么改进，为什么这样子做（且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述）。

### 回答

#### 一句话理解 Day 50

Day 50 的主题是 **Advanced Optimization V3（高级优化第 3 版）：Model Router（模型路由器）**，要让系统学会一件事：

> 不同任务，选择不同模型（Per-task Model Selection，按任务选择模型）。

它和前一天的关系，可以用项目里反复强调的那句核心认知概括：

> Tool Router（工具路由器）选择能力（Capability，能做什么），Model Router（模型路由器）选择算力（Compute，用多大的脑子去做）。

Day 49 之前，系统大概率是“所有任务都用同一个模型”（比如 `qwen2.5:14b`）——简单的总结也用 14B 大模型，既慢又贵。Day 50 引入一个调度层：总结走小模型、复杂规划走大模型、要 JSON 走擅长格式的模型、做向量嵌入走 embedding 模型、做评估走稳定的评估模型。

#### 落地的 10 件事

| # | 能力 | 实现位置 |
| --- | --- | --- |
| 1 | 定义 `ModelProfile`（模型档案）等类型 | `lib/model/model-profile-types.ts` |
| 2 | 实现 `ModelRegistry`（模型注册表） | `lib/model/model-registry.ts` |
| 3 | 注册 5 个逻辑模型（Logical Models，逻辑模型） | `lib/model/default-models.ts` |
| 4 | 定义 `ModelRoutingInput`（模型路由输入） | `model-profile-types.ts` |
| 5 | 实现 `ModelRouter`（模型路由器） | `lib/model/model-router.ts` |
| 6 | Agent Runtime（智能体运行时）接入路由 | `lib/agents/agent-runtime.ts` |
| 7 | Tool Runtime（工具运行时）接入路由 | `lib/usage/tool-usage-runtime.ts` |
| 8 | Usage（用量统计）记录模型信息 + 成本归因 | `lib/usage/usage-manager.ts`、`usage-types.ts` |
| 9 | Model Explorer（模型浏览器）前端 + `/api/model` 接口 | `model-dashboard-runtime.ts`、`ModelExplorer.tsx` |
| 10 | 自动化测试 | `scripts/test-day50-model-router.ts` |

同时完整保留了之前所有能力：Day 49 长期记忆、Day 48 语义缓存，以及更早的用量成本、回归评估、队列、工作流、RAG。

#### 核心机制（运用了什么知识）

**1. `ModelProfile`（模型档案）：把“模型”抽象成可路由的数据**

每个逻辑模型不再是写死的字符串，而是一份“档案”，描述 id、name、provider、model、capabilities（能力）、cost（成本）、limits（限制）、speed（速度）、quality（质量）。

关键设计是逻辑模型（id 如 `small-chat`）与物理模型（`model` 如 `qwen2.5:3b`）解耦——路由代码只认逻辑名 `small-chat`，将来换底层模型只改档案、不改路由逻辑。这是一种间接层（Indirection Layer，间接层）思想。

注册的 5 个逻辑模型：

| id | 底层模型 | capabilities | speed | quality | 输入单价/1K |
| --- | --- | --- | --- | --- | --- |
| `small-chat`（小模型） | qwen2.5:3b | chat, summary | fast | basic | 0.0002 |
| `large-reasoning`（大推理） | qwen2.5:14b | chat, reasoning, planning | slow | reasoning | 0.0015 |
| `json-structured`（JSON） | qwen2.5:7b | json, summary, chat | medium | strong | 0.0006 |
| `embedding`（嵌入） | nomic-embed-text | embedding | fast | basic | 0.00002 |
| `evaluation`（评估） | qwen2.5:14b-instruct | evaluation, reflection, json | medium | strong | 0.0012 |

**2. `ModelRegistry`（模型注册表）：登记 + 查询 + 统计**

用 `Map<id, ModelProfile>` 保存模型，提供 `register / get / list / findByCapability` 等方法。两个细节：

- 防御性拷贝（Defensive Copy）：读写都返回副本，避免外部代码改坏注册表数据。
- `stats()` 计算注册表指标：提供方分布、能力覆盖数、速度/质量分布、最便宜模型等，供 Model Explorer 展示。

**3. `ModelRouter`（模型路由器）：按优先级匹配规则——本日核心**

它不是用打分，而是用有序的规则链（Rule Chain，规则链），第一个命中的规则就决定结果，优先级从硬约束到软偏好：

1. embedding → 嵌入模型（硬性技术约束）
2. requiresJson → JSON 模型（输出格式是硬要求）
3. evaluation / reflection → 评估模型（保证评估稳定一致）
4. complexity=high / planning → 大推理模型（难任务要算力）
5. latencyPreference=fast → 小模型（偏好快）
6. latencyPreference=quality → 大推理模型（偏好好）
7. summary → 小模型（简单总结默认省钱省时）
8. 兜底：`routeByCapabilityFallback` 按任务所需能力用 `findByCapability` 找模型，还能用 `maxCost`（成本上限）过滤掉太贵的。

两个亮点：

- 可解释性（Explainability，可解释性）：`routeWithReason` 不只返回模型，还返回 `matchedRule`（命中的规则）、`reason`（中文理由）、`candidates`（候选列表）。
- 安全兜底：`resolve()` 在 id 找不到时回退到第一个模型，注册表为空才抛错，保证路由永远能给出结果。

**4. Agent Runtime（智能体运行时）接入：按智能体职责选模型**

通过依赖注入（Dependency Injection，依赖注入）把 `ModelRouter` 加到构造函数，再按“谁在干活、干什么活”推导路由输入：planner/supervisor → 大推理模型；critic → 评估模型；writer → 小模型；其余 → 中等复杂度对话。同一次协作里不同阶段用不同模型，这是“按任务选算力”的具体落地。

**5. Tool Runtime（工具运行时）接入：按工具名推导模型**

工具运行时同样注入路由器，用正则从工具名推导任务类型：检索/嵌入类→嵌入模型、改写/JSON 类→JSON 模型、总结类→小模型。

**6. Usage（用量统计）：记录模型信息 + Cost Attribution（成本归因）**

`UsageRecord` 新增 `modelId / provider / modelName`，每条用量记录写入时都带上路由出的模型。`getModelUsage()` 按模型聚合出调用次数、总词元、累计成本、总耗时并按成本降序，能直接回答“哪个模型最花钱”“哪个模型性价比最高（Cost-Effectiveness，性价比）”。

**7. Model Explorer（模型浏览器）与 `/api/model` 接口**

- `getModelDashboardSnapshot()` 把 5 个典型场景喂给 `routeWithReason()` 生成路由预览（Routing Preview，路由预览），再加上模型档案摘要与注册表指标，打包成 `ModelSnapshot`（模型快照）。这些预览场景和测试文件的五个验收用例一一对应——页面展示的效果就是测试断言过的效果。
- `GET /api/model` 返回整份快照（只读）；`POST /api/model` 是在线试路由（Interactive Routing，在线试路由）：传 `taskType` 等参数，实时返回完整路由决策，不用真跑任务就能问“这个任务会用哪个模型、为什么”。
- 两个接口都走统一的 API Envelope（统一响应信封）封装，错误有明确的 `API_REASON` 归类。

#### 对比 Day 49 有什么改进

| 维度 | Day 49（Long-Term Memory，长期记忆） | Day 50（Model Router，模型路由器） |
| --- | --- | --- |
| 主题定位 | Advanced Optimization V2（经验记忆系统） | Advanced Optimization V3（多模型路由运行时） |
| 解决的问题 | 让系统积累经验（同类任务复用过去教训） | 让系统用对算力（不同任务用不同模型） |
| 新增核心抽象 | `MemoryItemV2`（记忆条目） | `ModelProfile`（模型档案） |
| 核心算法 | 三因子综合打分检索（语义+重要性+新近度） | 有序规则链路由（按优先级匹配） |
| 对模型的态度 | 仍是“单一模型”思维 | 首次把模型本身当成可调度资源 |
| 对生成的影响 | 把经验注入提示词增强生成 | 为每个阶段挑选最合适的模型 |
| 用量统计 | 记录组件/智能体/工具维度 | 新增按模型维度 + 成本归因 |
| 可观测 | Trace 新增 memory span（记忆跨度） | 路由决策可解释（matchedRule + reason） |
| 新前端 | Memory Explorer V2 | Model Explorer |

一句话概括差异：Day 49 让 Agent“更聪明地思考”（带着经验），Day 50 让 Agent“更经济地思考”（用对脑子）。两者方向不同但都属于“高级优化”，互不冲突、层层叠加。

代码复用也很优雅：Day 50 沿用 Day 49/48 的依赖注入风格（构造函数最后追加 `ModelRouter` 参数，默认值是共享单例），既不破坏旧逻辑，又能在测试里注入独立实例做隔离。

#### 为什么这样设计

1. 为什么需要 Model Router？真实生产里，简单的“总结一句话”用 14B 大模型是巨大浪费；用 3B 小模型做复杂多步规划又会质量崩塌。“一个模型打天下”既贵又不可靠，分而治之才是生产做法。
2. 为什么用规则链而不是打分？模型选择里有硬约束（嵌入只能用嵌入模型、要 JSON 就得用擅长格式的模型）和软偏好（想快还是想好）。规则链按“硬约束在前、软偏好在后”排序，天然表达优先级，也比打分更可解释。
3. 为什么逻辑模型与物理模型解耦？底层模型会换，但“小模型/大模型/JSON 模型”这套角色是稳定的。路由只认角色，换模型只改档案、不动业务代码。
4. 为什么路由要可解释？线上出现“为什么这个任务用了贵模型”时，`matchedRule + reason` 能立刻定位是哪条规则命中，避免黑盒。
5. 为什么 Usage 要做成本归因？有了多模型，成本要拆到每个模型上，才能回答“钱花在哪”“谁性价比最高”，进而反过来优化路由规则，形成“路由→计量→优化”的闭环。
6. 为什么全部用依赖注入 + 共享单例默认值？生产用同一个进程级路由器（状态一致、零额外开销）；测试时注入独立实例做隔离，兼顾一致性与可测性。

---

## 问题 2：现在只有一个 ollama 的 qwen2.5:14b，多模型是怎么实现的（是不是写死演示）？我有外接小米 MiMo（很多模型），怎么确定什么时候用哪个？

### 我问

> 问个问题，像现在只有一个 ollama 的 qwen2.5:14b 模型，现在怎么实现的多模型呢（是只是写死演示的吗）；还有我有外接小米模型，那有很多的模型，那这个时候怎么确定什么时候用哪个模型呢。

### 回答

#### 1. 现在的“多模型”是真在调多个模型吗？——目前是“决策真、调用假”

这是最关键的认知。Day 50 的 `ModelRouter`（模型路由器）确实会**算出**“这个任务该用哪个模型”，但这个结果**并没有真正被拿去调用**。证据在代码里很清楚：

**（1）真正调用模型的地方，用的始终是同一个写死的模型。**
Agent 真实生成走的是 `invokeAgentModel`，它把 `rt`（ModelRuntime，模型运行时）直接交给 `invokeChatModel`，而 `invokeChatModel` 用的是 `rt.ollamaModel`——这个值来自环境变量，默认就是唯一的 `qwen2.5:14b`（`model-runtime.ts` 的 `DEFAULT_OLLAMA_MODEL`）。

**（2）路由出来的模型，只被用来“记账”，没被用来“干活”。**
`ModelRouter` 的结果只在 `recordComponentUsage`（记录用量）里被消费，写进 `UsageRecord`（用量记录）的 `modelId / provider / modelName` 字段，用于成本归因（Cost Attribution）和 Model Explorer（模型浏览器）展示，**从没有被回传给 `invokeChatModel` 去真正切换模型**。

**（3）那 5 个模型档案本身也是写死的演示数据。**
`default-models.ts` 里的 `qwen2.5:3b / 7b / 14b / nomic-embed-text / 14b-instruct`，以及它们的 `cost`（成本）、`speed`（速度）、`quality`（质量）全是手写常量。本地很可能根本没 pull 过 `qwen2.5:3b`，但因为路由结果不会真去调它们，所以也不会报错。

**结论**：现在 Day 50 实现的是一个路由决策层（Routing Decision Layer，决策层）+ 计量层，是“多模型调度”的脚手架 / 演示。决策逻辑（规则链、按能力 / 成本 / 延迟选模型）真实可用；但“把决策接回真实调用”这一步**故意没接**——因为教学项目本地只有一个模型，接了反而会因为模型不存在而调用失败。

#### 2. 要变成“真·多模型”，缺的是哪一步？

只缺一根线：让路由出的 `ModelProfile`（模型档案）反过来决定 `invokeChatModel` 用哪个模型。思路是：先用 `routeComponentModel` 路由出 `profile`，再用 `profile.provider` 和 `profile.model` 构造本次调用的 `ModelRuntime`（local 走 `ollamaModel`、mimo 走 `mimoModel`），最后用这个新的 `rt` 去调用。接上这根线后，“总结走小模型、规划走大模型”才会真正发生在物理调用层面（前提是这些模型都已存在 / 已 pull）。

#### 3. 外接 MiMo 很多模型，怎么决定什么时候用哪个？

先说现状：**当前注册表里根本没有 MiMo 模型**。`default-models.ts` 只注册了 5 个 `provider: "ollama"` 的逻辑模型；MiMo 的那一堆（`mimo-v2.5-pro / v2.5 / flash / omni / tts...`）只存在于 `mimo-models.ts` 的下拉列表里，和 `ModelRouter` 是两套互不相通的东西。所以路由器“看不见”MiMo，自然不会选它。

要让系统“知道什么时候用哪个 MiMo 模型”，本质就是把 MiMo 模型也翻译成 `ModelProfile`（模型档案）注册进去，剩下的事 `ModelRouter` 已经会做。决定“用哪个”的依据，就是模型档案上的几个标签 + 路由规则链：

| 决策维度 | 在档案里的字段 | 决定什么 |
| --- | --- | --- |
| 能不能做（硬约束） | `capabilities`（能力） | 要 embedding（嵌入）就只能选有该能力的；要 TTS（语音合成）就选 TTS 模型 |
| 多难（复杂度） | `quality`（质量） + 路由输入的 `complexity`（复杂度） | 复杂规划 → reasoning 质量的大模型；简单总结 → basic 小模型 |
| 多快（延迟） | `speed`（速度） + 路由输入的 `latencyPreference`（延迟偏好） | 要快 → flash；要好 → pro |
| 多贵（成本） | `cost`（成本） + 路由输入的 `maxCost`（成本上限） | 预算有限时过滤掉太贵的 |

注册后，“什么时候用哪个”由两层共同决定：

1. 规则链（Rule Chain，硬优先级）：`model-router.ts` 里那串 `if`——嵌入任务 → 嵌入模型、要 JSON → JSON 模型、高复杂度 → 推理模型……第一个命中的赢。
2. 能力兜底 + 成本过滤（capability-fallback，能力兜底）：规则没命中时，按任务所需 `capability`（能力）找出所有合格模型，再用 `maxCost`（成本上限）砍掉太贵的，取第一个。

也就是说，“决定用哪个模型”的本质，是给每个模型打好 `capabilities / speed / quality / cost` 标签，再给每个任务描述好 `taskType / complexity / latencyPreference / maxCost`，让规则链去匹配。

> 注意：MiMo 里的 `tts`（语音合成）、`omni`（多模态）这些能力，当前 `ModelCapability`（模型能力）类型里还没有（只有 chat / summary / reasoning / planning / json / embedding / evaluation / reflection）。要支持它们，得先在 `model-profile-types.ts` 给 `ModelCapability` 加上 `"tts" | "vision"` 之类，并在 `TASK_CAPABILITY` 映射和路由规则里补上对应分支。

#### 4. 一句话总结

- 现在：路由“决策”是真的、可解释、可测试；但“按决策真正切换物理模型调用”这步没接，5 个 Ollama 档案是写死的演示数据——所以严格说还不是“真在跑多模型”。
- 要做成真的：(1) 把路由出的 `ModelProfile` 接回 `invokeChatModel`；(2) 把 MiMo 模型登记成 `ModelProfile`（打好能力 / 速度 / 质量 / 成本标签）；(3) 按需扩展 `ModelCapability`（如 tts / vision）。
- “何时用哪个”的判断依据：模型侧的 `capabilities / speed / quality / cost` 标签 × 任务侧的 `taskType / complexity / latencyPreference / maxCost`，由规则链 + 能力兜底匹配得出。

---

## 第 50 天打卡（已完成）

```text
【第50天打卡】

1. 是否定义 ModelProfile（模型档案）：是
2. 是否实现 ModelRegistry（模型注册表）：是

3. 是否注册多个模型 profile（模型档案）：是
4. 是否定义 ModelRoutingInput（模型路由输入）：是

5. 是否实现 ModelRouter（模型路由器）：是
6. Agent Runtime（智能体运行时）是否接入 ModelRouter：是

7. Tool Runtime（工具运行时）是否接入 ModelRouter：是
8. Usage（用量统计）是否记录 model 信息：是

9. 是否实现 Model Explorer（模型浏览器）：是
10. 是否完成模型路由测试：是

11. 遇到的最大问题：
理解 Tool Router（工具路由器）与 Model Router（模型路由器）的本质区别——
工具路由选择“能力（Capability，能做什么）”，模型路由选择“算力（Compute，用多大的脑子做）”。
另一个关键点是模型路由用的是“有序规则链”而非 Day 49 记忆检索的“多因子打分”：
因为模型选择里既有硬约束（嵌入只能用嵌入模型、要 JSON 必须用擅长格式的模型），
也有软偏好（想快还是想好），规则链按“硬约束在前、软偏好在后”排序，
天然表达优先级且可解释（matchedRule + reason）；
而记忆检索是“在一堆都合格的记忆里挑最相关的”，场景不同，方法就不同。
还注意到逻辑模型（small-chat）与物理模型（qwen2.5:3b）解耦，换模型只改档案、不动业务代码。

12. 当前系统能力：
系统升级为 Advanced Optimization V3（高级优化第 3 版）：Multi-Model Routing Runtime（多模型路由运行时）。
具备“按任务选择模型”的能力：一次多智能体协作中，规划/调度走大推理模型、评估/反思走评估模型、
写作总结走小模型、向量嵌入走嵌入模型、结构化输出走 JSON 模型；
工具调用也按工具名路由到合适模型；每条用量记录都标注路由出的模型 id/provider/modelName，
并能按模型聚合做 Cost Attribution（成本归因）；
通过 Model Explorer（模型浏览器）与 /api/model 接口可查看模型档案、注册表指标与路由预览，
还能在线试路由（POST /api/model）。
至此系统补全“高级优化”这条线，形成 Cache（缓存）+ Memory（记忆）+ Model Router（模型路由）
+ Workspace（协作）+ Evaluation（评估）+ Regression（回归）+ Usage（成本）+ Trace（追踪）的完整闭环。
```

---

## 第 50 天核心认知

记住一句话：

> Tool Router（工具路由器）选择能力（Capability），Model Router（模型路由器）选择算力（Compute）。

完成第 50 天后，系统升级为：

> Advanced Optimization V3（高级优化第 3 版）：Multi-Model Routing Runtime（多模型路由运行时）
