# Day 40 测试用例：Supervisor Multi-Agent Runtime

本文档用于验证第40天任务是否完成，重点覆盖 Supervisor Agent 动态规划、AgentPlan 校验、计划执行、上下文传递和前端展示。

## 用例 1：学习类任务动态选择研究、规划、写作

- 输入目标：`帮我学习 LangGraph 并制定三天学习计划`
- 期望 selectedAgents：`research, planner, writer`
- 期望 steps：先研究资料，再制定计划，最后整理输出
- 期望时间线：包含 `supervisor planned`、`research started`、`planner started`、`writer started`
- 验收点：不应固定强制调用 `critic`

## 用例 2：总结类任务只选择写作智能体

- 输入目标：`帮我总结这段内容`
- 期望 selectedAgents：`writer`
- 期望 steps：只有一个 `writer` 步骤
- 期望原因：说明只需要总结和表达输出
- 验收点：不应调用 `research`、`planner`、`critic`

## 用例 3：审查类任务选择审查和写作

- 输入目标：`帮我检查这个方案有什么漏洞`
- 期望 selectedAgents：`critic, writer`
- 期望 steps：先审查风险，再整理输出
- 期望 callGraph：包含 `supervisor -> critic` 和 `critic -> writer`
- 验收点：最终结果中包含前置结果上下文说明

## 用例 4：计划类任务选择规划和写作

- 输入目标：`帮我制定一个三天学习计划`
- 期望 selectedAgents：`planner, writer`
- 期望 steps：规划步骤依赖为空，写作步骤依赖规划步骤
- 期望 validation：`ok: true`
- 验收点：计划依赖 ID 与步骤 ID 一致

## 用例 5：研究报告类任务选择研究、审查、写作

- 输入目标：`帮我研究并输出最终报告`
- 期望 selectedAgents：`research, critic, writer`
- 期望 steps：研究、审查、写作串行执行
- 期望 metrics：`executedTasks` 等于执行步骤数，`successRate` 为 `1`
- 验收点：时间线包含 Supervisor 规划阶段

## 用例 6：AgentPlan Validator 识别非法智能体

- 构造计划：`selectedAgents` 包含 `unknown-agent`
- 期望 validation：`ok: false`
- 期望错误：提示 `selectedAgents 包含不存在的 Agent`
- 期望执行：降级为 `writer` 兜底计划
- 验收点：系统不会因为非法计划崩溃

## 用例 7：AgentPlan Validator 识别空任务

- 构造计划：某个 step 的 `task` 为空字符串
- 期望 validation：`ok: false`
- 期望错误：提示任务不能为空
- 期望执行：降级为 `writer` 兜底计划
- 验收点：最终仍返回可读输出

## 用例 8：AgentPlan Validator 识别循环依赖

- 构造计划：`step-a` dependsOn `step-b`，`step-b` dependsOn `step-a`
- 期望 validation：`ok: false`
- 期望错误：提示出现循环依赖
- 期望执行：降级为 `writer` 兜底计划
- 验收点：不会进入无限循环

## 用例 9：前端展示 Supervisor Decision

- 操作：打开首页并观察右侧 `Supervisor Runtime Dashboard`
- 期望显示：`Goal`、`Selected Agents`、`Reason`
- 期望显示：`Agent Plan Steps`
- 期望显示：`Agent Plan Timeline`
- 验收点：顶部徽标显示 `Day 40`

## 用例 10：标签页和标题更新为第40天

- 操作：打开浏览器标签页
- 期望标签页标题：包含 `Day 40`
- 操作：观察页面顶部标题
- 期望页面标题：`Supervisor Multi-Agent Runtime · Dynamic Agent Planning`
- 验收点：页面不再显示 Day39 主标题
