# Day 56 测试用例：Multi-Model Collaboration Runtime（多模型协作运行时）

## 自动化测试

运行命令：

```bash
npm run test:day56
```

## 用例 1：ModelRole 与 ModelProfile.roles

- 目标：确认所有默认模型都声明了 `roles`。
- 步骤：读取默认模型注册表，检查每个 `ModelProfile.roles` 都是非空数组。
- 预期结果：所有模型都至少具备一个协作角色，例如 `reasoning`、`writing`、`evaluation`、`json`、`embedding` 或 `summary`。

## 用例 2：Research 任务并行协作计划

- 目标：验证高复杂度 Research 任务不再只选单个模型，而是生成模型团队协作计划。
- 输入：`taskType=research`、`complexity=high`、`allowParallel=true`。
- 预期结果：计划策略为 `parallel`，至少包含 `reasoning`、`summary`、`writing`、`evaluation` 阶段，其中并行探索阶段带有同一个 `parallelGroup`。

## 用例 3：Context Passing（上下文传递）

- 目标：验证下游模型阶段可以读取上游模型输出。
- 步骤：执行 Research 协作计划，检查 `writing` 阶段输入。
- 预期结果：`writing` 阶段输入包含 `reasoning` 阶段输出，说明 `inputFrom` 生效。

## 用例 4：JSON 结构化协作

- 目标：验证 JSON 任务会拆成推理和结构化输出两个角色。
- 输入：`taskType=json`、`requiresJson=true`。
- 预期结果：计划阶段顺序为 `reasoning -> json`，且 `json` 阶段输入包含推理阶段输出。

## 用例 5：Evaluation 单角色协作

- 目标：验证评估任务可以直接路由到评估模型角色。
- 输入：`taskType=evaluation`。
- 预期结果：计划策略为 `single`，阶段列表只包含 `evaluation`。

## 用例 6：Parallel Model Execution（并行模型执行）

- 目标：验证同一并行组内多个阶段会一起执行。
- 步骤：执行高复杂度 Research 计划。
- 预期结果：`reasoning` 与 `summary` 阶段共享 `parallel-research` 分组，执行结果数量等于计划阶段数量。

## 用例 7：Model Result Merge（模型结果合并）

- 目标：验证多个阶段输出会合并成最终答案。
- 步骤：调用 `mergeResults(stageResults)`。
- 预期结果：返回 `finalOutput`、`sourceStageIds` 和 `consensus`，最终输出包含“协作合并说明”。

## 用例 8：Trace / Usage 接入

- 目标：验证协作执行会记录调用链和成本。
- 步骤：执行任意协作计划后读取 `execution.trace` 和 `execution.usageRecords`。
- 预期结果：Trace 中存在 `type=collaboration` 的 Span；Usage 记录中 `componentType=collaboration`，并带有 `collaborationId`、`collaborationStageId`、`collaborationRole`。

## 用例 9：Model Collaboration Explorer 数据源

- 目标：验证前端协作浏览器可以拿到完整快照。
- 步骤：调用 `getModelCollaborationDashboardSnapshot()` 或访问 `GET /api/model/collaboration`。
- 预期结果：返回 `team`、`previews`、`metrics`，并且至少包含 Research、JSON、Evaluation 三类预览。

## 用例 10：页面标题与标签页

- 目标：验证 Day56 项目标题和侧边栏标签已经切换到多模型协作主题。
- 步骤：打开首页。
- 预期结果：浏览器标题为 Day56 多模型协作平台；顶部标题显示 `Multi-Model Collaboration Platform`；右侧控制台默认打开“协作”标签页。
