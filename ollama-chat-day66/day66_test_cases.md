# Day66 Unified Registry 测试用例

## 一、测试目标

验证第66天任务清单中的十项能力已经完成：`RegistryItem`、`RegistryProvider`、`UnifiedRegistry`、四类旧注册表迁移、Capability Discovery（能力发现）、Registry Explorer（注册浏览器）和 Registry Metrics（注册指标）。

## 二、自动化测试命令

```bash
npm run test:day66
npm run lint
npm run build
```

## 三、核心功能测试用例

| 编号 | 测试主题 | 前置条件 | 操作步骤 | 预期结果 |
| --- | --- | --- | --- | --- |
| TC-66-01 | 注册新能力 | 创建空 `UnifiedRegistry` | 注册合法 `RegistryItem`，随后调用 `get` | 可以按唯一标识读取，字段和元数据保持完整 |
| TC-66-02 | 按类型列出能力 | 已注册 Agent、Tool、Model | 分别调用 `list("agent")`、`list("tool")`、`list("model")` | 每次只返回目标类型，结果稳定排序 |
| TC-66-03 | 元数据搜索 | 工具元数据包含 `retrieval` 标签 | 调用 `search("retrieval")` | 命中该工具，证明搜索覆盖嵌套 Metadata |
| TC-66-04 | 防御性复制 | 已注册带能力数组的注册项 | 修改 `get` 返回对象中的能力数组，再次读取 | 注册中心内部数据未被外部修改 |
| TC-66-05 | 重复标识冲突 | 已存在 `tool:test@1.0.0` | 再注册相同标识和版本 | 抛出 `RegistryConflictError`，原因是 `duplicate_id` |
| TC-66-06 | 版本冲突 | 已存在 `tool:test@1.0.0` | 使用相同标识注册 `2.0.0` | 抛出 `RegistryConflictError`，原因是 `version_conflict` |
| TC-66-07 | 注销能力 | 已注册测试工具 | 调用 `unregister` 后再调用 `get` | 返回 `undefined`，重复注销保持幂等 |
| TC-66-08 | 能力发现精确命中 | 工具声明 `research` 能力 | 调用 `discoverCapability("research capability")` | 工具被发现，分数不低于 100，并返回“能力声明命中”原因 |
| TC-66-09 | 禁用能力过滤 | Agent 声明 `research` 但 `enabled=false` | 查询 `research` | 结果不包含该 Agent |
| TC-66-10 | 跨类型能力发现 | Agent、Tool、Model、Prompt 均已迁移 | 查询 `research`、`summary`、`evaluation` | 可以从不同类型中返回匹配能力并按分数排序 |

## 四、旧注册表兼容测试用例

| 编号 | 测试主题 | 操作步骤 | 预期结果 |
| --- | --- | --- | --- |
| TC-66-11 | AgentRegistry 适配 | 用 `new AgentRegistry(unifiedRegistry)` 注册智能体 | 旧 `get/list/findByCapability` 可用，统一中心出现 `agent:` 注册项 |
| TC-66-12 | AgentRegistry 注销同步 | 调用旧注册表 `unregister` | 本地智能体和统一注册项同时删除 |
| TC-66-13 | ToolRegistry 适配 | 用 `new ToolRegistry(unifiedRegistry)` 注册工具 | 统一中心保存描述、Schema、能力、依赖、超时和重试策略 |
| TC-66-14 | ModelRegistry 适配 | 调用 `createDefaultModelRegistry(unifiedRegistry)` | 默认模型全部迁移，包含 Provider、Context Window、Cost、Latency、Health Status |
| TC-66-15 | PromptRegistry 多版本迁移 | 调用 `createDefaultPromptRegistry(unifiedRegistry)` | 每个提示词版本独立注册，active 为启用，draft/archived 为禁用 |
| TC-66-16 | 旧 API 无参兼容 | 继续使用 `new AgentRegistry()`、`new ToolRegistry()` 等原有写法 | 不要求统一中心即可正常工作，不破坏历史业务代码 |

## 五、Registry Metrics 测试用例

| 编号 | 指标 | 验证方式 | 预期结果 |
| --- | --- | --- | --- |
| TC-66-17 | `totalItems` | 对比 `registry.list().length` | 两者完全相等 |
| TC-66-18 | 类型数量 | 分别对比 Agent、Tool、Model、Prompt 列表长度 | `agentCount`、`toolCount`、`modelCount`、`promptCount` 准确 |
| TC-66-19 | 启用与禁用 | 计算 `enabledCount + disabledCount` | 等于 `totalItems` |
| TC-66-20 | 版本复杂度 | 对全部 `version` 去重 | 等于 `versionCount`，且默认数据至少包含三个版本 |
| TC-66-21 | 七类覆盖 | 查看 `typeDistribution` | Agent、Tool、Model、Prompt、Memory、Workflow、Evaluation 均大于 0 |

## 六、API 测试用例

| 编号 | 请求 | 预期结果 |
| --- | --- | --- |
| TC-66-22 | `GET /api/registry` | 返回全部注册项、空发现结果、全局指标和过滤条件 |
| TC-66-23 | `GET /api/registry?type=model` | `items` 全部为 `model` 类型 |
| TC-66-24 | `GET /api/registry?query=research` | `discoveries` 至少包含 Agent 和 Tool，且全部 `enabled=true` |
| TC-66-25 | `GET /api/registry?includeDisabled=false` | `items` 不包含任何禁用注册项 |
| TC-66-26 | `GET /api/registry?type=unknown` | 非法类型被安全忽略，不导致服务端异常 |

## 七、页面手工测试用例

| 编号 | 操作步骤 | 预期结果 |
| --- | --- | --- |
| TC-66-27 | 打开首页 | 浏览器标签页显示 `Day 66 - Unified Registry | 统一注册中心` |
| TC-66-28 | 查看页面顶部 | 日期徽标为 `66`，标题为 `Unified Registry 统一注册中心`，版本为 `Production Upgrade V3` |
| TC-66-29 | 查看右侧控制台 | 徽标为 `Day 66`，默认选中“注册”标签页 |
| TC-66-30 | 点击 Agent、Tool、Model、Prompt 过滤按钮 | 注册项列表只显示对应类型 |
| TC-66-31 | 输入 `research` 并点击“发现” | 展示命中名称、相关度分数和可解释原因 |
| TC-66-32 | 取消“显示禁用版本” | archived/draft 提示词从注册项列表中消失 |
| TC-66-33 | 查看注册项卡片 | 每项均展示 Type、Name、Version、Status 和格式化 Metadata |
| TC-66-34 | 点击“刷新” | 重新请求 `/api/registry`，按钮显示加载状态且页面无报错 |

## 八、逐行中文注释测试

自动化脚本会读取以下第66天新增代码文件，检查每一个非空代码行都包含中文任务注释：

- `lib/registry/registry-types.ts`
- `lib/registry/unified-registry.ts`
- `lib/registry/registry-adapters.ts`
- `lib/registry/registry-runtime.ts`
- `app/api/registry/route.ts`
- `app/components/RegistryExplorer.tsx`

## 九、第66天验收结果模板

1. RegistryItem（注册项）：是。
2. RegistryProvider（注册提供者）：是。
3. UnifiedRegistry（统一注册中心）：是。
4. AgentRegistry（智能体注册表）迁移：是，使用可选 Adapter 保持兼容。
5. ToolRegistry（工具注册表）迁移：是，包含 Schema、超时和重试元数据。
6. ModelRegistry（模型注册表）迁移：是，包含 Provider、Context、Cost、Latency 和 Health。
7. PromptRegistry（提示词注册表）迁移：是，支持多版本和启用状态同步。
8. Capability Discovery（能力发现）：是，支持跨字段评分、解释和禁用过滤。
9. Registry Explorer（注册浏览器）：是，支持七类过滤和元数据展示。
10. Registry Metrics（注册指标）：是，覆盖总量、类型、状态和版本复杂度。
