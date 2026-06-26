# Ollama Chat Day 52

Day 52 在 Day 51 Resilient Multi-Model Runtime（具备容错能力的多模型运行时）基础上，升级为 Advanced Optimization V5（高级优化第 5 版）：Prompt Versioning & Prompt Registry（提示词版本管理与提示词注册表）。

> 核心认知：Model（模型）决定能力上限，Prompt（提示词）决定能力释放方式。

## 本日重点

- 定义 `PromptTemplate`（提示词模板）：id、name、componentType、componentId、version、template、variables、status、createdAt、updatedAt。
- 实现 `PromptRegistry`（提示词注册表）：`register`、`getActive`、`getVersion`、`list`、`activate`、`archive`、`rollback`。
- 实现 `renderPrompt`（提示词渲染器）：支持 `{{task}}`、`{{memory}}`、`{{workspace}}`、`{{tools}}` 等变量，缺失变量会明确报错。
- 新增 `Prompt Contract`（提示词变量契约）与 `Prompt Validator`（提示词校验器）：保存和激活前检查未知变量、缺失必需变量、声明变量与模板正文不一致等问题。
- 扩展 `PromptRegistry`（提示词注册表）：支持 `upsert` 新增 / 编辑有效版本，归档遗留版本可保留，但 active（启用中）版本必须通过变量契约校验。
- 扩展 `/api/prompts`：`GET` 读取快照，`POST` 创建新版本，`PUT` 编辑已有版本，`PATCH` 执行 Activate / Archive / Rollback。
- Agent Runtime（智能体运行时）接入 PromptRegistry：Agent、Supervisor、Reflection、Evaluation 与声明式 Tool Span 都会读取 active Prompt。
- Usage / Trace / Evaluation 记录 `promptId` 和 `promptVersion`，支持提示词版本级成本归因。
- Tool Prompt（工具提示词）接入 Query Rewrite（查询改写）与 RAG Answer（知识库问答）。
- 新增 Prompt Explorer（提示词浏览器）：展示组件、版本、状态、变量、更新时间、Activate、Archive、Rollback、Prompt Diff 与 Regression Link。
- 新增 `/prompts` Prompt Console（提示词管理控制台）：支持新建、复制草稿、编辑模板、点击变量标签插入占位符、实时校验、实时 Prompt Diff 和 Rendered Preview（渲染预览）。
- Regression Dashboard（回归评估看板）关联 `research.v2` 与 `research.v3`，展示候选提示词的分数和成本变化。

## 默认提示词版本

| Component | Active Version | 说明 |
| --- | --- | --- |
| `supervisor` | `v2` | 多 Agent DAG 调度提示词 |
| `research` | `v3` | 带证据来源、风险和下一步的研究提示词 |
| `planner` | `v2` | 工作流拆解提示词 |
| `writer` | `v2` | 最终回答汇总提示词 |
| `critic` | `v2` | 风险审查提示词 |
| `reflection` | `v2` | 结构化反思自检提示词 |
| `evaluation` | `v2` | 四维评分提示词 |
| `queryRewrite` | `v2` | RAG 查询改写提示词 |
| `ragAnswer` | `v2` | 严谨引用知识库问答提示词 |

## 运行方式

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 后，右侧控制台默认进入“提示”标签页，可查看 Prompt Registry、Prompt Diff、Rollback 和 Regression Link。

打开 `http://localhost:3000/prompts` 可进入完整 Prompt Console（提示词管理控制台），新增、编辑和激活提示词版本。

## 验证方式

```bash
npm run test:day52
npm run test:day51
npm run lint
npm run build
```

Day 52 的自动化与人工测试用例见 `day52_test_cases.md`。
