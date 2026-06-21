# Day 47 测试用例：Usage & Cost Observability

## 测试目标

验证 Production Runtime V3（生产运行时第3版）是否完整实现 `UsageRecord`、`UsageManager`、运行时用量接入、Trace + Cost 关联、Usage Metrics、Cost Breakdown、Usage Explorer 与 Prompt ROI Test，同时确认 Day 46 原有能力未回退。

## 自动化测试

运行：

```bash
npm run test:day47
```

| 编号 | 测试点 | 操作或输入 | 预期结果 |
| --- | --- | --- | --- |
| UT-01 | UsageRecord 写入 | 写入 Agent、Tool 两类记录 | 自动补齐 `totalTokens`、`estimatedCost`、`createdAt` |
| UT-02 | listRecords | 连续写入三条记录 | 按写入顺序返回三条副本 |
| UT-03 | Trace 用量聚合 | 同一 `traceId` 写入 Agent 与 Tool | `getTraceUsage` 汇总词元、费用和耗时 |
| UT-04 | Agent 用量聚合 | 写入 Research 与 Writer 记录 | `getAgentUsage` 按 Agent 分组并按成本降序 |
| UT-05 | Tool 用量聚合 | 写入 Retrieval 记录 | `getToolUsage` 返回正确总词元和费用 |
| UT-06 | Usage Metrics | 两条 Trace、多条 Agent/Tool 记录 | 正确计算总费用、总词元、平均值及最高成本组件 |
| UT-07 | Cost Breakdown | 多组件产生不同费用 | 费用占比之和约等于 100%，并按费用降序 |
| UT-08 | Tool Runtime 接入 | 运行 Retrieval、Summary、Weather | 三个工具均产生带 Trace/Span 的 UsageRecord |
| UT-09 | Agent Runtime 接入 | 执行 Research Agent | 产生 `agent` 类型用量记录 |
| UT-10 | Reflection 接入 | Research 初稿触发反思 | 产生 `reflection` 类型用量记录，记录词元和费用 |
| UT-11 | Evaluation 接入 | Agent 得到最终输出 | 产生 `evaluation` 类型用量记录 |
| UT-12 | Trace + Cost | 检查完整运行生成的全部记录 | 每条记录同时具有非空 `traceId` 与 `spanId` |
| UT-13 | Token Accounting | 检查所有记录 | `totalTokens = inputTokens + outputTokens` |
| UT-14 | Prompt ROI | A 低成本、B 高分 | 同时给出质量胜出、成本胜出、Cost/Score 与推荐版本 |

## API 测试

开发服务器启动后执行以下用例。

| 编号 | 请求 | 预期 HTTP/响应 | 关键断言 |
| --- | --- | --- | --- |
| API-01 | `GET /api/usage` | `200`，`ok=true` | `records`、`metrics`、`costBreakdown`、`promptROI` 均存在 |
| API-02 | 首次 `GET /api/usage` | 自动生成演示数据 | 组件类型包含 Agent、Tool、Reflection、Evaluation |
| API-03 | `POST /api/usage` | `200`，返回重跑后的快照 | 旧账本被清空，新快照 `generatedAt` 更新 |
| API-04 | 检查 `metrics` | 数据结构完整 | `totalCost > 0`、`totalTokens > 0` |
| API-05 | 检查工具汇总 | `toolUsage` 非空 | 至少包含 `retrieval`、`summary`、`weather` |
| API-06 | 检查 Prompt ROI | `promptROI.variants` 长度为 2 | A/B 均包含 `score`、`estimatedCost`、`costPerScore` |

PowerShell 示例：

```powershell
Invoke-RestMethod http://localhost:3000/api/usage
Invoke-RestMethod -Method Post http://localhost:3000/api/usage
```

## 页面与交互测试

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| UI-01 | 打开首页 | 浏览器标签页显示 `Day 47 - Usage & Cost Observability` |
| UI-02 | 查看页面主标题 | 显示 `Production Runtime V3 · Usage & Cost Observability` 相关中英文标题 |
| UI-03 | 查看右侧控制台 | Day 徽标为 `Day 47`，默认选中“用量”标签页 |
| UI-04 | 打开“用量概览” | 显示 Total Cost、Total Tokens、平均指标、最贵 Agent 与 Tool |
| UI-05 | 打开“调用明细” | 每行显示组件、Input、Output、Cost、Duration、Trace/Span |
| UI-06 | 打开“成本构成” | 显示各组件费用、百分比和可视化进度 |
| UI-07 | 打开“Prompt ROI” | 显示 Prompt A/B 的 Score、Cost、Cost/Score 与推荐版本 |
| UI-08 | 点击“重新运行” | 按钮显示“核算中...”，完成后刷新全部指标 |
| UI-09 | 切换“运行/知识/记录” | Day 46 继承的队列、回归、知识库和历史功能仍可使用 |
| UI-10 | 窄屏与深色模式 | 标签、表格可滚动，卡片无溢出，文字对比度清晰 |

## 回归测试

运行：

```bash
npm run test:day46
npm run lint
npm run build
```

验收要求：Day 46 回归评估测试继续通过；ESLint 无错误；Next.js 生产构建成功。

## 第 47 天验收勾选

- [ ] 已定义 `UsageRecord`。
- [ ] 已实现 `UsageManager`。
- [ ] Agent Runtime 已接入 Usage。
- [ ] Tool Runtime 已接入 Usage。
- [ ] Reflection 与 Evaluation 已接入 Usage。
- [ ] Trace 已通过 `traceId + spanId` 关联 Usage。
- [ ] 已实现 Usage Explorer。
- [ ] 已增加 Usage Metrics。
- [ ] 已实现 Cost Breakdown。
- [ ] 已完成 Prompt ROI Test。
