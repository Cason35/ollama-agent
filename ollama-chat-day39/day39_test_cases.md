# Day 39 测试用例：Multi-Agent Runtime V2

## 用例 1：浏览器标签页与页面标题

1. 启动项目并打开首页。
2. 检查浏览器标签页标题是否包含 `Day 39` 和 `Multi-Agent Runtime V2`。
3. 检查页面顶部标题是否显示 `Multi-Agent Runtime V2 · Agent Collaboration`。

预期结果：页面不再出现 Day 38 的主标题或标签页标题。

## 用例 2：固定协作链执行

1. 请求 `GET /api/agents`。
2. 查看返回的 `collaboration.callGraph`。
3. 验证调用边依次为 `research -> planner`、`planner -> critic`、`critic -> writer`。

预期结果：固定协作链完整执行，且调用图包含 3 条委派边。

## 用例 3：Agent Timeline 记录

1. 请求 `GET /api/agents`。
2. 查看返回的 `collaboration.timeline`。
3. 验证时间线包含 started、delegated 和 finished 事件。

预期结果：每个智能体的执行顺序可以通过时间线观察。

## 用例 4：Agent Metrics 升级

1. 请求 `GET /api/agents`。
2. 查看返回的 `metrics.executedTasks`、`metrics.delegatedTasks`、`metrics.avgTaskDuration` 和 `metrics.successRate`。

预期结果：`executedTasks` 为 4，`delegatedTasks` 为 3，`successRate` 为 1。

## 用例 5：AgentResult 嵌套结果

1. 请求 `GET /api/agents`。
2. 查看返回的 `collaboration.result.childResults`。
3. 验证其中包含 Planner、Critic 和 Writer 三个下游结果。

预期结果：根结果可以聚合下游智能体输出。

## 用例 6：右侧协作看板展示

1. 打开首页。
2. 查看右侧 `Agent Collaboration Dashboard`。
3. 检查指标卡、Agent Call Graph、Agent Timeline 和最终 Writer 输出是否展示。

预期结果：右侧看板可以直接观察第39天协作运行时。

## 用例 7：能力搜索仍然可用

1. 在右侧能力搜索框输入 `plan`。
2. 查看匹配结果。

预期结果：匹配到 `Planner Agent`，说明 Day 38 的 Capability Search 能力被保留。
