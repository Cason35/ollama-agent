# Day 52 Test Cases：Prompt Versioning & Prompt Registry

## 自动化测试

### TC-52-01：PromptRegistry 默认版本

- 步骤：运行 `npm run test:day52`。
- 预期：`research` 默认 active 版本为 `v3`，`supervisor`、`reflection`、`evaluation`、`queryRewrite`、`ragAnswer` 均存在 active 版本。

### TC-52-02：Activate / Archive / Rollback

- 步骤：在测试脚本中先激活 `research.v2`，再回滚到 `research.v3`，最后归档 `research.v2`。
- 预期：active 版本能正确切换；归档后 `research.v2.status` 为 `archived`。

### TC-52-03：Prompt Renderer 变量渲染

- 步骤：使用 `research.v3` 渲染 `{{task}}`、`{{memory}}`、`{{workspace}}`、`{{tools}}`。
- 预期：输出正文包含传入任务；缺少 `workspace` 时抛出 `PromptRenderError`。

### TC-52-04：Prompt Diff

- 步骤：对比 `research.v2` 与 `research.v3`。
- 预期：diff 中能看到新增的“证据来源”“风险”“下一步”等要求。

### TC-52-05：Usage / Trace 记录 promptVersion

- 步骤：无真实模型运行一次 `AgentRuntime.runSupervisorCollaboration`。
- 预期：`UsageRecord` 中至少一条记录包含 `promptId` 和 `promptVersion`；`TraceSpan.metadata` 中至少一条记录包含 `promptVersion`。

### TC-52-06：EvaluationResult 记录 promptVersion

- 步骤：调用 `runtime.evaluateOutput`。
- 预期：返回的 `EvaluationResult.promptVersion` 为 `v2`。

### TC-52-07：Prompt Explorer 快照

- 步骤：调用 `getPromptDashboardSnapshot()`。
- 预期：快照包含 `prompts`、`activePrompts`、`metrics`、`comparison`、`contracts`、`validationResults`、`regressionLinks` 和 `renderedPreview`。

### TC-52-07A：Prompt Validator 防止变量拼错

- 步骤：构造模板 `任务：{{task1}}`，并声明变量 `task1`。
- 预期：`validatePromptTemplate` 返回 `valid=false`，问题包含 `unknown-variable: task1` 和 `missing-required-variable: task`。

### TC-52-07B：新增草稿与激活门禁

- 步骤：构造合法 `research.v4` 草稿，调用 `registry.upsert()` 保存，再调用 `registry.activate("research", "v4")`。
- 预期：合法草稿可以保存并激活；错误变量草稿会被注册表拒绝。

## API 测试

### TC-52-08：读取 Prompt 快照

- 请求：`GET /api/prompts`
- 预期：返回 `ok=true`，`data.metrics.totalPrompts >= 10`，`data.comparison.componentId = research`。

### TC-52-09：激活旧版本

- 请求：`PATCH /api/prompts`
- Body：

```json
{
  "action": "activate",
  "componentId": "research",
  "version": "v2"
}
```

- 预期：返回快照中 `research.v2.status = active`，原 active 版本被归档。

### TC-52-10：回滚到 v3

- 请求：`PATCH /api/prompts`
- Body：

```json
{
  "action": "rollback",
  "componentId": "research",
  "version": "v3"
}
```

- 预期：返回快照中 `research.v3.status = active`。

### TC-52-10A：创建新 Prompt 版本

- 请求：`POST /api/prompts`
- Body：

```json
{
  "name": "Research v4 草稿",
  "componentType": "agent",
  "componentId": "research",
  "version": "v4",
  "status": "draft",
  "variables": ["task", "tools"],
  "template": "任务：{{task}}\n工具：{{tools}}",
  "source": "prompt-console"
}
```

- 预期：返回快照中出现 `research.v4`，状态为 `draft`。

### TC-52-10B：拒绝错误变量

- 请求：`POST /api/prompts`
- Body 中模板包含 `{{task1}}`。
- 预期：返回 `ok=false`，错误文案说明未知变量 `{{task1}}` 且缺少必需变量 `{{task}}`。

### TC-52-10C：编辑已有 Prompt 版本

- 请求：`PUT /api/prompts`
- 步骤：编辑已存在版本的 `template`、`variables`、`score` 或 `costEstimate`。
- 预期：返回快照中该版本内容更新，`updatedAt` 变化。

## 前端人工测试

### TC-52-11：浏览器标签页标题

- 步骤：启动项目并打开首页。
- 预期：浏览器标签页标题包含 `Day 52 - Prompt Versioning & Registry`。

### TC-52-12：顶部标题

- 步骤：查看页面顶部 Header。
- 预期：显示 `Day 52`、`Advanced Optimization V5`、`Prompt Lifecycle Management（提示词生命周期管理）`。

### TC-52-13：右侧默认标签页

- 步骤：打开首页后观察右侧控制台。
- 预期：默认进入“提示”标签页，并展示 Prompt Explorer。

### TC-52-14：Prompt 版本操作

- 步骤：在 Prompt Explorer 中点击 `research.v2` 的 `Activate`，再点击 `research.v3` 的 `Rollback`。
- 预期：状态徽标及时切换；active 版本始终只有一个。

### TC-52-15：Prompt Diff 展示

- 步骤：查看 Prompt Explorer 的 `Prompt Diff` 区域。
- 预期：新增行以 `+` 展示，删除行以 `-` 展示。

### TC-52-16：Regression Link 展示

- 步骤：查看 Prompt Explorer 与 Regression Dashboard。
- 预期：能看到 `research.v2 → research.v3`，以及 score delta 和 cost delta。

### TC-52-17：Usage 明细展示 Prompt

- 步骤：进入“用量”标签页，重新运行用量演示后切换到“调用明细”。
- 预期：表格中出现 `Prompt` 列，已接入运行时的记录显示 `promptId / promptVersion`。

### TC-52-18：Prompt Console 新建与复制草稿

- 步骤：打开 `http://localhost:3000/prompts`，点击“新建提示词”或在版本列表点击“复制草稿”。
- 预期：中间编辑区出现可保存的草稿，版本号自动变为下一版本，例如 `v3 -> v4`。

### TC-52-19：Prompt Console 变量标签插入

- 步骤：在 Prompt Console 点击 `{{task}}`、`{{memory}}` 等变量标签。
- 预期：模板正文插入对应占位符，变量声明自动同步，不需要手打变量名。

### TC-52-20：Prompt Console 实时 Diff 与渲染预览

- 步骤：修改模板正文。
- 预期：右侧 Prompt Diff 立即展示新增 / 删除行；校验通过后 Rendered Preview 使用样例变量渲染完整提示词。

### TC-52-21：Prompt Console 激活门禁

- 步骤：把模板里的 `{{task}}` 改成 `{{task1}}`。
- 预期：右侧校验显示未知变量和缺少必需变量，保存按钮不可用或保存请求被 API 拒绝。

## 打卡检查

```text
【第52天打卡】
1. 是否定义 PromptTemplate（提示词模板）：是
2. 是否实现 PromptRegistry（提示词注册表）：是
3. 是否实现 renderPrompt（渲染提示词）：是
4. Agent Runtime（智能体运行时）是否接入 PromptRegistry：是
5. Tool / Reflection / Evaluation 是否接入 PromptRegistry：是
6. Trace / Usage / Evaluation 是否记录 promptVersion：是
7. 是否实现 Prompt Explorer（提示词浏览器）：是
8. 是否实现 Prompt Diff（提示词差异对比）：是
9. Regression Evaluation（回归评估）是否关联 Prompt Version：是
10. 是否支持 Prompt Rollback（提示词回滚）：是
11. 是否支持新增 Prompt 版本：是
12. 是否支持编辑 Prompt 版本：是
13. 是否实现 Prompt Contract（提示词变量契约）：是
14. 是否实现保存 / 激活前变量校验：是
15. 是否新增 `/prompts` Prompt Console（提示词管理控制台）：是
```
