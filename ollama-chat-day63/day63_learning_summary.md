# Day63 学习总结：Secrets Management（密钥管理）

## 本文记录范围

本文整理 `ollama-chat-day63` 项目的学习型对话，主要包括：

- `ollama-chat-day63` 项目做了什么。
- 项目运用了哪些关键知识。
- 对比 `ollama-chat-day62` 有什么改进。
- 为什么要把 Config（配置）和 Secret（密钥）拆开。
- Secret Encryption（密钥加密）的具体作用是什么。
- 用户自己配置小米模型 API Key 时，为什么要加密。
- 第 63 天打卡内容。

本文不记录项目代码修改过程、命令执行过程、构建调试过程，只保留用于理解系统设计和运行方式的问答内容。

---

## 一、读懂 `ollama-chat-day63` 项目

### 我的提问

带我来读懂 `ollama-chat-day63` 这个文件夹中的项目做了什么，运用了什么知识，对比 `ollama-chat-day62` 有什么改进，为什么这样子做（且一些英文专业术语后面补充一个括号补充其中文名称或者中文描述）。

### 回答整理

#### 一句话理解

`ollama-chat-day63` 是在 Day62 的 Configuration Center（配置中心）基础上，新增 Secrets Management（密钥管理）能力：

- Day62 解决“系统参数怎么统一配置”
- Day63 解决“API Key、密码、Token 这类敏感凭证怎么安全读取、加密、轮换、脱敏”

核心边界是：

```text
Config（配置）= 可查看、可编辑、可同步的非敏感运行参数
Secret（密钥）= 需要加密、脱敏、隔离、轮换的敏感凭证
```

#### 项目做了什么

Day63 新增了一套密钥管理链路，主要在 `lib/secrets` 下面。

1. **SecretItem（密钥项）**

   定义密钥结构，包括 `key`、`category`、`encrypted`、`createdAt`、`updatedAt`，但前端永远不拿真实 `value`。

2. **SecretProvider（密钥提供者）**

   是抽象接口，只允许 `get()` 和 `listKeys()`，没有 `listValues()`。

   这是很关键的安全设计：系统可以按需读取某个密钥，但不能批量把所有密钥值倒出来。

3. **SecretsManager（密钥管理器）**

   是统一入口，负责：

   - `get`（读取）
   - `set`（写入）
   - `rotateSecret`（轮换）
   - `delete`（删除）
   - `snapshot`（安全快照）
   - `metrics`（指标）

   见 `lib/secrets/secrets-manager.ts`。

4. **Secret Encryption（密钥加密）**

   使用 AES-256-GCM（256 位 AES GCM 认证加密），写入运行时密钥时保存的是 `day63:v1...` 格式的密文，不保存明文。

   见 `lib/secrets/secret-crypto.ts`。

5. **Secret Rotation（密钥轮换）**

   会生成新版本 ID，记录旧版本和新版本，让新密钥立即生效，同时保留轮换历史。

6. **Secret Masking（密钥脱敏）**

   会把 `apiKey`、`password`、`token`、`secret` 等字段统一替换成 `************`，避免 Trace（追踪记录）里泄露敏感值。

   见 `lib/secrets/secret-masking.ts` 和 `lib/agents/trace-manager.ts`。

#### 前端怎么体现

- 首页标题已经变成 Secrets Management（密钥管理），浏览器标题也改成 Day63。
- 右侧控制台默认打开“密钥”标签页，新增 Secrets Explorer（密钥管理浏览器）。
- Secrets Explorer 只展示：
  - Key（密钥名）
  - Category（分类）
  - Source（来源）
  - Encrypted（是否加密）
  - Version ID（版本 ID）
  - Masked Value（脱敏值）
  - Rotation History（轮换历史）
  - Metrics（指标）
- 它不展示真实密钥值。

对应代码：

- `app/layout.tsx`
- `app/components/Header.tsx`
- `app/components/KnowledgeSidebar.tsx`
- `app/components/SecretsExplorer.tsx`

#### 对比 Day62 的改进

Day62 的重点是 Configuration Center（配置中心）。它会管理模型地址、Redis 前缀、MinIO 参数、功能开关等配置。但 Day62 里还保留了一些敏感配置占位，比如：

- `model.mimoApiKey`
- `storage.minioAccessKey`
- `storage.minioSecretKey`

Day63 把这些敏感项从配置中心移走了。现在配置中心只保留非敏感参数，比如：

- `model.mimoBaseUrl`
- `storage.minioEndpoint`
- `storage.minioPort`
- `storage.minioUseSsl`

密钥则统一走 SecretsManager（密钥管理器）。

具体改进：

1. MiMo API Key 不再从 `model.mimoApiKey` 读，而是从 `SecretsManager.get("XIAOMI_MIMO_API_KEY")` 读。
2. MinIO 的 `accessKey` 和 `secretKey` 不再来自配置中心，而是来自：
   - `SecretsManager.getSync("MINIO_ACCESS_KEY")`
   - `SecretsManager.getSync("MINIO_SECRET_KEY")`
3. MySQL 密码不再直接读 `process.env.MYSQL_PASSWORD`，而是走 `SecretsManager.getSync("MYSQL_PASSWORD")`。
4. Trace（追踪记录）写入 metadata（元数据）时会自动脱敏，避免日志系统变成泄密点。
5. Redis Key Prefix（Redis 键名前缀）从 `ollama:day62:` 改成 `ollama:day63:`，避免两天的数据互相污染。

#### 为什么要这样做

因为 Configuration（配置）和 Secret（密钥）不是一类东西。

- 配置可以被查看、导出、同步、热更新，比如模型地址、超时时间、Redis 前缀。
- 密钥不能随便查看，更不能进入前端、日志、Trace、配置导出或调试面板。

Day63 这样拆分有几个好处：

1. **Least Privilege（最小权限）**  
   前端只能拿密钥元数据，不能拿真实值。

2. **Defense in Depth（纵深防御）**  
   即使 UI、Trace、配置中心被查看，也不会直接泄露密钥。

3. **Rotation Ready（支持轮换）**  
   密钥可以替换新版本，而不需要改业务代码。

4. **Provider Pattern（提供者模式）**  
   现在有 EnvSecretProvider（环境变量密钥提供者）和 MemorySecretProvider（内存密钥提供者），以后可以替换成 Vault（专业密钥库）、KMS（密钥管理服务）或数据库加密存储。

5. **Separation of Concerns（职责分离）**  
   配置中心管“怎么运行”，密钥管理管“凭什么访问外部资源”。

#### 用到的知识

这个项目综合用了这些知识点：

- Next.js App Router（Next.js 应用路由）：`app/api/secrets/route.ts` 提供密钥管理 API。
- TypeScript Type System（TypeScript 类型系统）：用类型明确区分 `SecretItem` 和 `SecretMetadata`，避免真实 value 进入前端。
- AES-256-GCM（认证加密算法）：同时保证保密性和防篡改。
- Provider Pattern（提供者模式）：把环境变量、内存密钥库、未来 Vault 接入统一接口。
- Singleton（单例模式）：`secrets-runtime.ts` 用全局单例避免热重载重复创建 Manager。
- Masking（脱敏）：按字段名和疑似密钥格式递归替换敏感内容。
- Runtime Integration（运行时集成）：模型、MinIO、MySQL 都通过密钥管理器读取凭证。
- Security Boundary（安全边界）：API 返回 snapshot（快照）时只返回元数据，不返回真实密钥。

#### 测试怎么看

- 测试脚本：`scripts/test-day63-secrets-management.ts`
- 测试文档：`day63_test_cases.md`

可以把 Day63 理解成：

```text
Day62 让系统“可配置”；
Day63 让系统“敢接真实外部服务凭证”。
```

---

## 六、第 63 天阶段总结：基础设施阶段完成

完成 Day63 之后，整个 Agent Platform（智能体平台）的基础设施建设已经闭环。

从 Day1 的 Next.js（React 全栈应用框架）+ Ollama Chat（本地大模型聊天）开始，项目已经逐步升级为 Production Agent Platform（生产级智能体平台）。

目前系统已经拥有：

- Agent Runtime（智能体运行时）
- Workflow DAG（工作流有向无环图）
- RAG Pipeline（检索增强生成流水线）
- Multi-Agent（多智能体协作）
- Evaluation（评估系统）
- Prompt Platform（提示词平台）
- Model Routing（模型路由）
- Redis（内存型共享状态存储）
- Distributed Queue（分布式队列）
- Distributed Lock（分布式锁）
- Object Storage（对象存储）
- Config Center（配置中心）
- Secrets Management（密钥管理）

这说明项目已经不再只是 Demo（演示项目），而是一套具备完整基础设施分层的平台架构。

### Day63 完成的核心能力

Day63 完成的是：

```text
Production Infrastructure V6（生产基础设施第 6 版）
  -> Secrets Management（密钥管理）
```

系统安全模型从“直接读取环境变量或配置项”升级为：

```text
Config Center（配置中心）
  -> Runtime Configuration（运行时配置）
  -> SecretsManager（密钥管理器）
  -> API Key / Password / Token（接口密钥 / 密码 / 令牌）
  -> External Service（外部服务）
```

### 最大升级点

以前常见写法是：

```text
process.env.OPENAI_API_KEY
```

或者：

```text
config.get("api.key")
```

这种方式的问题是：

- 容易泄露。
- 容易污染 Trace（追踪记录）。
- 可能被前端暴露。
- 可能进入日志。
- 配置中心可能把密钥当普通配置展示或导出。

Day63 之后，链路变成：

```text
Runtime（运行时）
  -> SecretsManager（密钥管理器）
  -> Encrypted Secret（加密后的密钥）
  -> Provider（密钥提供者）
```

并且具备：

- AES-256-GCM（256 位 AES GCM 认证加密）
- Rotation（密钥轮换）
- Masking（脱敏）
- Metadata Only（只返回元数据）
- Access Metrics（访问指标）

这已经接近企业级 Secret Management（密钥管理）方式。

### 当前整体进度

```text
Phase 1：Agent Runtime（智能体运行时）
  完成度：100%

Phase 2：Production Infrastructure（生产基础设施）
  Redis（内存型共享状态存储）       100%
  Queue（队列）                    100%
  Distributed Lock（分布式锁）     100%
  Object Storage（对象存储）       100%
  Config Center（配置中心）        100%
  Secrets（密钥管理）              100%
```

当前阶段完成度：

```text
基础设施阶段：100%
```

接下来进入：

```text
Phase 3：Production Upgrade（生产化升级）
```

### 为什么 Phase 3 很关键

前 63 天主要是在学习“如何实现能力”。

例如：

- Prompt（提示词）会管理。
- Queue（队列）会运行。
- Memory（记忆）会存储。
- RAG（检索增强生成）会检索。
- Model Routing（模型路由）会选择模型。
- Secrets Management（密钥管理）会保护凭证。

但是很多模块仍然偏 Teaching Version（教学版），例如 Prompt Experiment（提示词实验）可能还固定在 `writer.v1 / writer.v2 / writer.v3` 这类演示路线里。

从 Day64 开始，目标不再是继续堆新模块，而是把多个孤立模块升级成统一的 Agent Operating System（智能体操作系统）。

也就是说：

```text
多个独立能力
  -> 统一上下文
  -> 统一事件
  -> 统一注册表
  -> 统一观测
  -> 统一生产链路
```

---

## 七、Day64 学习计划：Unified Runtime Context（统一运行时上下文）

Day64 的主题是：

```text
Production Upgrade V1（生产化升级第 1 版）
Unified Runtime Context（统一运行时上下文）
```

### 今日核心目标

让所有 Runtime（运行时）模块共享同一个 Context（上下文），而不是各自维护自己的上下文结构。

目前系统里已经有很多模块：

- Agent Runtime（智能体运行时）
- Workflow Runtime（工作流运行时）
- Tool Runtime（工具运行时）
- RAG Runtime（检索增强生成运行时）
- Prompt Runtime（提示词运行时）
- Evaluation Runtime（评估运行时）
- Memory Runtime（记忆运行时）
- Model Runtime（模型运行时）

当前问题是：每个模块可能都有自己的 Context（上下文）。

例如：

- AgentContext（智能体上下文）
- WorkflowContext（工作流上下文）
- ToolContext（工具上下文）
- ModelContext（模型上下文）

真实生产系统不应该让每个模块各自维护一套上下文。更合理的方式是统一为：

```text
RuntimeContext（统一运行时上下文）
```

### Day64 最终效果

以前：

```text
AgentContext（智能体上下文）
WorkflowContext（工作流上下文）
ToolContext（工具上下文）
ModelContext（模型上下文）
```

以后：

```text
RuntimeContext（统一运行时上下文）
  -> Agent（智能体）
  -> Tool（工具）
  -> Model（模型）
  -> RAG（检索增强生成）
  -> Memory（记忆）
  -> Evaluation（评估）
```

所有模块共享同一个执行环境。

### 任务 1：设计 RuntimeContext V2（统一运行时上下文第 2 版）

新增类型：

```ts
type RuntimeContext = {
  requestId: string;
  userId?: string;
  sessionId?: string;

  workflowId?: string;
  agentId?: string;
  taskId?: string;

  memoryContext?: object;
  retrievalContext?: object;
  workspace?: object;
  promptContext?: object;
  modelContext?: object;

  traceId: string;
  usageContext?: object;
};
```

字段含义：

- `requestId`：请求 ID，用于标识一次完整请求。
- `userId`：用户 ID，用于区分用户。
- `sessionId`：会话 ID，用于串联多轮对话。
- `workflowId`：工作流 ID。
- `agentId`：智能体 ID。
- `taskId`：任务 ID。
- `memoryContext`：Memory Context（记忆上下文）。
- `retrievalContext`：Retrieval Context（检索上下文）。
- `workspace`：Workspace（工作区上下文）。
- `promptContext`：Prompt Context（提示词上下文）。
- `modelContext`：Model Context（模型上下文）。
- `traceId`：Trace ID（追踪 ID）。
- `usageContext`：Usage Context（用量统计上下文）。

### 任务 2：创建 RuntimeContextBuilder（运行时上下文构建器）

新增：

```ts
class RuntimeContextBuilder {
  build(request) {
    // 创建 RuntimeContext
  }
}
```

职责：

- 统一创建 Context（上下文）。
- 为每次请求生成 `requestId`。
- 为链路追踪生成 `traceId`。
- 读取或生成 `sessionId`。
- 组装 Memory（记忆）、Prompt（提示词）、Model（模型）、Trace（追踪）等上下文信息。

### 任务 3：Agent Runtime（智能体运行时）接入

以前：

```ts
executeAgent(agentContext);
```

升级后：

```ts
executeAgent(runtimeContext);
```

目标：Agent（智能体）不再依赖自己独立的上下文，而是从 RuntimeContext（统一运行时上下文）读取执行环境。

### 任务 4：Tool Runtime（工具运行时）接入

以前：

```ts
executeTool(toolContext);
```

升级后：

```ts
executeTool(runtimeContext);
```

目标：Tool（工具）执行时可以共享同一次请求里的用户、会话、Trace（追踪）、Usage（用量）和 Memory（记忆）信息。

### 任务 5：Model Runtime（模型运行时）接入

Model（模型）调用需要统一从 RuntimeContext（统一运行时上下文）获取：

- model（模型选择信息）
- usage（用量统计信息）
- trace（追踪信息）
- secret（密钥引用信息）

注意：Secret（密钥）本身仍然不应该直接塞进 RuntimeContext（统一运行时上下文）。更合理的是 RuntimeContext 保存“要使用哪个密钥”的引用，真实值仍由 SecretsManager（密钥管理器）按需读取。

### 任务 6：Prompt Runtime（提示词运行时）接入

以前 PromptBuilder（提示词构建器）可能自己查 Memory（记忆）、Workspace（工作区）、Knowledge（知识库）或 Strategy（策略）。

升级后：

```ts
buildPrompt(runtimeContext);
```

PromptBuilder（提示词构建器）从 RuntimeContext（统一运行时上下文）读取：

- Memory（记忆）
- Workspace（工作区）
- Knowledge（知识库）
- Strategy（策略）

这样 Prompt（提示词）生成过程和 Agent（智能体）、Tool（工具）、Model（模型）调用可以共享同一份执行背景。

### 任务 7：Evaluation（评估）接入

Evaluation（评估）读取 RuntimeContext（统一运行时上下文）后，可以串起：

```text
RuntimeContext（统一运行时上下文）
  -> Trace（追踪记录）
  -> PromptVersion（提示词版本）
  -> Model（模型）
  -> Usage（用量）
  -> Evaluation（评估）
```

目标是形成完整评估链路，而不是只对某个孤立输出打分。

### 任务 8：Context Middleware（上下文中间件）

新增类似 Web Framework（Web 应用框架）里的 Middleware（中间件）。

示例链路：

```text
Request（请求）
  -> Auth Middleware（认证中间件）
  -> Trace Middleware（追踪中间件）
  -> Memory Middleware（记忆中间件）
  -> RuntimeContext（统一运行时上下文）
  -> Agent（智能体）
```

Context Middleware（上下文中间件）的作用是：在真正执行业务前，把认证、追踪、记忆、工作区等上下文统一补齐。

### 任务 9：Runtime Context Explorer（运行时上下文浏览器）

新增前端面板，展示一次请求的完整 Context（上下文）：

- Request（请求）
- Agent（智能体）
- Model（模型）
- Prompt（提示词）
- Memory（记忆）
- RAG（检索增强生成）
- Tool（工具）
- Evaluation（评估）

这个面板的价值是观测和调试：当一次请求表现异常时，可以看到各模块是否拿到了同一个 RuntimeContext（统一运行时上下文）。

### 任务 10：完整链路测试

测试一个 Research Task（研究型任务）。

验证所有模块拿到同一个 RuntimeContext（统一运行时上下文）。

目标链路：

```text
User（用户）
  -> RuntimeContext（统一运行时上下文）
  -> Agent（智能体）
  -> Tool（工具）
  -> RAG（检索增强生成）
  -> Model（模型）
  -> Evaluation（评估）
  -> Trace（追踪记录）
```

### Day64 验收标准

1. 是否定义 RuntimeContext V2（统一运行时上下文第 2 版）。
2. 是否实现 RuntimeContextBuilder（上下文构建器）。
3. Agent Runtime（智能体运行时）是否接入 RuntimeContext（统一运行时上下文）。
4. Tool Runtime（工具运行时）是否接入 RuntimeContext（统一运行时上下文）。
5. Model Runtime（模型运行时）是否接入 RuntimeContext（统一运行时上下文）。
6. Prompt Runtime（提示词运行时）是否接入 RuntimeContext（统一运行时上下文）。
7. Evaluation（评估）是否接入 RuntimeContext（统一运行时上下文）。
8. 是否实现 Context Middleware（上下文中间件）。
9. 是否实现 Runtime Context Explorer（运行时上下文浏览器）。
10. 是否完成 Unified Runtime Context Test（统一运行时上下文测试）。

### Day64 打卡模板

【第64天打卡】

1. 是否定义 RuntimeContext V2（统一运行时上下文）：是 / 否

2. 是否实现 RuntimeContextBuilder（上下文构建器）：是 / 否

3. Agent Runtime（智能体运行时）是否接入 RuntimeContext（统一运行时上下文）：是 / 否

4. Tool Runtime（工具运行时）是否接入 RuntimeContext（统一运行时上下文）：是 / 否

5. Model Runtime（模型运行时）是否接入 RuntimeContext（统一运行时上下文）：是 / 否

6. Prompt Runtime（提示词运行时）是否接入 RuntimeContext（统一运行时上下文）：是 / 否

7. Evaluation（评估）是否接入 RuntimeContext（统一运行时上下文）：是 / 否

8. 是否实现 Context Middleware（上下文中间件）：是 / 否

9. 是否实现 Runtime Context Explorer（运行时上下文浏览器）：是 / 否

10. 是否完成 Unified Runtime Context Test（统一运行时上下文测试）：是 / 否

11. 遇到的最大问题：

12. 当前系统能力：

### Day64 核心认知

Day64 最重要的一句话是：

```text
生产级 Agent Platform（智能体平台）的核心不是拥有多少模块，
而是所有模块是否运行在同一个 RuntimeContext（统一运行时上下文）里。
```

之前系统像这样：

```text
Agent（智能体）
Tool（工具）
RAG（检索增强生成）
Memory（记忆）
Model（模型）
Evaluation（评估）

各自优秀，但上下文分散。
```

现在开始要变成：

```text
RuntimeContext（统一运行时上下文）
  -> 所有能力协同工作
```

---

## 八、后续路线预告：Day64 到 Day73

完成 Day63 后，项目进入最后的 Production Upgrade（生产化升级）阶段。

后续路线：

| Day | 内容 |
| --- | --- |
| Day64 | Unified Runtime Context（统一运行时上下文） |
| Day65 | Unified Event System（统一事件系统 / 事件总线） |
| Day66 | Registry 全面统一升级（注册表统一升级） |
| Day67 | Production Prompt Platform（生产级提示词平台） |
| Day68 | Production Memory Upgrade（生产级记忆升级） |
| Day69 | Production RAG Upgrade（生产级检索增强生成升级） |
| Day70 | Production Agent Workflow Upgrade（生产级智能体工作流升级） |
| Day71 | Production Evaluation Platform（生产级评估平台） |
| Day72 | Observability + Monitoring（可观测性与监控） |
| Day73 | Production Integration Test（生产集成测试） |

完成 Day73 后，项目目标是从：

```text
Learning Agent Framework（学习型智能体框架）
```

升级为：

```text
Production-ready Agent Platform（可生产部署的智能体平台）
```

这也意味着：前 63 天搭好的 Agent（智能体）、Tool（工具）、RAG（检索增强生成）、Memory（记忆）、Model（模型）、Evaluation（评估）、Queue（队列）、Config（配置）和 Secrets（密钥）不再只是“各自可用”，而是要进入真正融合阶段。

这一步是从学习项目走向 Production Infrastructure（生产基础设施）的关键分水岭。

---

## 二、Secret Encryption（密钥加密）的具体作用是什么

### 我的提问

这个加密具体作用是什么呢？

### 回答整理

这个加密的具体作用是：让密钥在保存时不是明文。

以 Day63 项目为例，用户在 Secrets Explorer（密钥管理浏览器）里输入：

```text
XIAOMI_MIMO_API_KEY = abc123-real-secret
```

后端不会直接保存：

```text
abc123-real-secret
```

而是保存成类似：

```text
day63:v1.iv.authTag.cipherText
```

也就是密文。

#### 具体流程

写入：

```text
前端输入真实密钥
  -> POST /api/secrets
  -> SecretsManager.set（密钥管理器写入）
  -> encryptSecretValue（加密密钥值）
  -> MemorySecretProvider 只保存密文
```

读取：

```text
业务代码需要密钥
  -> secretsManager.get("XIAOMI_MIMO_API_KEY")
  -> decryptSecretValue（解密密钥值）
  -> 返回真实 API Key 给模型调用代码
```

#### 它解决的问题主要有 4 个

1. **避免存储层明文泄露**  
   如果以后把 MemorySecretProvider（内存密钥提供者）换成数据库、Redis、文件或对象存储，里面保存的是密文。别人只看到存储内容，不能直接拿到真实密钥。

2. **降低调试和快照泄露风险**  
   SecretsSnapshot（密钥快照）只返回 `maskedValue`（脱敏值），比如 `************`，不会返回真实 value。  
   加密负责“存储不明文”，脱敏负责“展示不明文”。

3. **支持密钥轮换**  
   Secret Rotation（密钥轮换）时，新密钥会重新加密并生成新版本 ID。旧版本失效，新版本生效，业务代码仍然只通过同一个 key 读取。

4. **防止密文被篡改后悄悄使用**  
   项目用的是 AES-256-GCM（256 位 AES GCM 认证加密）。  
   GCM 不只是加密，还带 Auth Tag（认证标签），如果密文被改过，解密会失败，而不是返回错误的假数据。

#### 要注意的边界

这个加密不是万能的。

它保护的是 at rest（静态存储时）的密钥。

如果攻击者已经拿到应用进程权限，或者拿到 `SECRETS_MASTER_KEY`（密钥加密主密钥），那仍然可以解密。

所以 Day63 的设计重点是：

- 密钥不要进入配置中心
- 密钥不要明文存储
- 密钥不要返回前端
- 密钥不要进入 Trace / 日志
- 业务只能通过 SecretsManager 按需读取

一句话：

```text
加密的作用不是让系统永远无法读取密钥，
而是让密钥只在真正需要调用外部服务时短暂变成明文，
其余时间都以密文或脱敏形式存在。
```

---

## 三、用户自己配小米模型 Key 时，为什么要加密

### 我的提问

就是现在允许用户自己配小米模型的 key，这个时候用户传进来的 key 就要做层加密信息？

### 回答整理

对，理解正确。

现在 Day63 允许用户在页面里自己配置小米模型的 `XIAOMI_MIMO_API_KEY`。这个 key 是敏感信息，所以流程应该是：

```text
用户在前端输入小米 API Key
  -> 通过 /api/secrets 发给后端
  -> 后端用 AES-256-GCM 加密
  -> 保存密文
  -> 前端列表只显示 ************
  -> 模型调用时再由 SecretsManager 解密读取
```

也就是说，用户传进来的 key 不能像普通配置一样直接存成明文，要先加密。

在当前 Day63 项目里，对应代码链路是：

- 前端输入：`app/components/SecretsExplorer.tsx`
- API 接口：`app/api/secrets/route.ts`
- 密钥统一入口：`lib/secrets/secrets-manager.ts`
- 加密实现：`lib/secrets/secret-crypto.ts`
- 小米模型读取：`lib/model/model-runtime.ts`

关键点是这里：

```ts
await secretsManager.set({
  key: "XIAOMI_MIMO_API_KEY",
  value: 用户输入的真实 key,
  category: "model",
});
```

进入 `MemorySecretProvider.set()` 后会调用：

```ts
encryptSecretValue(input.value)
```

所以保存下来的不是用户输入的真实 key，而是：

```text
day63:v1.xxx.xxx.xxx
```

模型真正发请求时再读取：

```ts
const mimoApiKey =
  (await secretsManager.get("XIAOMI_MIMO_API_KEY"))?.trim() ?? "";
```

然后用于请求头：

```text
Authorization: Bearer <真实 key>
```

所以这里有两个安全边界：

1. **保存时加密**  
   用户提交的 key 不明文落库、不明文保存在 Provider 里。

2. **展示时脱敏**  
   前端只能看到：

   ```text
   value: ************
   ```

   不能看到真实 key。

#### 额外注意

当前 Day63 用的是 MemorySecretProvider（内存密钥提供者），也就是运行时内存保存。它适合教学和演示；服务重启后，用户通过页面配置的 key 会丢失。

真正生产环境一般会把这个 Provider 换成：

- 数据库
- Redis
- Vault（密钥保险库）
- KMS（密钥管理服务）-backed Provider

并且仍然保存加密后的值。

---

## 四、第 63 天打卡

【第 63 天打卡】

1. 是否定义 SecretItem（密钥项）：是

   说明：已在 `lib/secrets/secret-types.ts` 中定义 `SecretItem`，并额外定义 `SecretMetadata`，明确剔除真实 `value`，避免前端拿到明文。

2. 是否定义 SecretProvider（密钥提供者）：是

   说明：已定义 `SecretProvider` 接口，只允许 `get()` / `listKeys()`，并实现 EnvSecretProvider（环境变量密钥提供者）和 MemorySecretProvider（内存密钥提供者）。

3. 是否实现 SecretsManager（密钥管理器）：是

   说明：已在 `lib/secrets/secrets-manager.ts` 中实现统一入口，支持 get、set、rotate、delete、snapshot 和 metrics。

4. 是否实现 Secret Encryption（密钥加密）：是

   说明：已在 `lib/secrets/secret-crypto.ts` 中使用 AES-256-GCM（256 位 AES GCM 认证加密），写入时保存 `day63:v1...` 密文，不保存明文。

5. 是否支持 Secret Rotation（密钥轮换）：是

   说明：已实现 `rotateSecret()`，会生成新版本 ID，让新密钥立即生效，并保留轮换历史。

6. Runtime（运行时）是否接入 SecretsManager（密钥管理器）：是

   说明：MiMo API Key、MinIO Access/Secret Key、MySQL Password 等敏感凭证已改为通过 SecretsManager 读取，不再走配置中心或直接读敏感环境变量。

7. Trace（追踪记录）是否实现 Secret Masking（密钥脱敏）：是

   说明：`trace-manager.ts` 写入 metadata 时会调用 `maskSecretObject()`，把 apiKey、password、token、secret 等字段替换为 `************`。

8. 是否实现 Secrets Explorer（密钥浏览器）：是

   说明：已在 `app/components/SecretsExplorer.tsx` 中实现密钥查看、新增、轮换、删除和指标展示，且只展示脱敏元数据。

9. 是否增加 Secrets Metrics（密钥指标）：是

   说明：已定义 `SecretsMetrics`，可统计密钥总数、轮换次数、访问次数、加密数量和过期数量等。

10. 是否完成 Secrets Management Test（密钥管理测试）：是

    说明：已提供 `scripts/test-day63-secrets-management.ts` 和 `day63_test_cases.md`，覆盖写入加密、读取解密、轮换、过期、MiMo 运行时接入、Trace 脱敏和删除。

11. 遇到的最大问题：

    最大的问题是理解 Config（配置）和 Secret（密钥）的边界，以及“加密”和“脱敏”分别保护什么。一开始容易把 API Key 当成普通配置项，直接放进配置中心或前端展示；后来才明确：配置可以查看和同步，密钥必须加密存储、脱敏展示、按需解密。另外也要理解当前 MemorySecretProvider（内存密钥提供者）适合教学演示，服务重启后页面写入的密钥会丢失，生产环境需要换成 Vault / KMS / 数据库等持久化 Provider，但仍然应保存密文。

12. 当前系统能力：

    当前系统已经在 Day62 的 Configuration Center（配置中心）基础上，新增 Day63 的 Secrets Management（密钥管理）。平台现在具备 Redis Shared State（Redis 共享状态）、Redis Cache（Redis 缓存）、Distributed Queue（分布式队列）、Distributed Lock（分布式锁）、Object Storage（对象存储）、Configuration Center（配置中心）和 Secrets Management（密钥管理）能力。业务运行时可以统一从 `configManager` 读取非敏感策略参数，从 `secretsManager` 按需读取敏感凭证；密钥写入时加密、展示时脱敏、调用时解密，系统更接近真实 Production Infrastructure（生产基础设施）分层。

---

## 五、Day63 核心总结

Day63 最重要的一句话是：

```text
配置（Configuration）描述系统如何运行；
密钥（Secrets）赋予系统访问外部资源的权限。
```

所以：

```text
Config（配置）
  -> 可以查看
  -> 可以导出
  -> 可以同步

Secret（密钥）
  -> 必须加密
  -> 必须脱敏
  -> 必须轮换
  -> 必须隔离
```

两者职责完全不同，不应该混用。

完成 Day63 后，Production Infrastructure Layer（生产基础设施层）基本完成：

```text
Redis（内存型共享状态存储）       已完成
Queue（队列）                     已完成
Distributed Lock（分布式锁）      已完成
Object Storage（对象存储）        已完成
Config Center（配置中心）         已完成
Secrets（密钥管理）               已完成
```

一句话收束：

```text
Day62 让系统“可配置”；
Day63 让系统“敢接真实外部服务凭证”。
```
