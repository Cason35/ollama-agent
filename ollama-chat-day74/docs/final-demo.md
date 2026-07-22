# Day74 Final Demo Scenario

## 演示目标

演示问题：

```text
帮我分析高海拔鸡肉品质研究。
```

## 业务执行链

```text
Tenant Authentication
  → Planner
  → Research Agent
  → Knowledge Retrieval
  → Memory Recall
  → Writer Agent
  → Evaluation
  → Governance Audit
  → Final Answer
```

## 演示顺序

1. 打开 `/production`，确认 Release 为 `1.0.0-rc.1`。
2. 打开 Health 标签页，确认 MySQL、Redis、Storage、Queue、Registry 全部健康。
3. 打开 Feature Flags，把 `enable_new_rag` 设置为 gradual。
4. 返回 `/`，提交演示问题并开启 Workflow。
5. 展示最终答案、Workflow DAG、Memory、Knowledge 命中和使用成本。
6. 打开 `/observability`，展示 Trace、Span、Metrics、Logs 与 Evaluation Score。
7. 打开 `/governance`，展示 Tenant、Permission、Quota 和 Audit Log。
8. 最后打开 Production Dashboard 验收标签页说明代码完成与环境验证结果。

## 故障扩展示范

运行 `npm run failure:test`，展示 Redis 停止后健康状态变为 `503`，Redis 恢复后重新变为 `healthy`。
