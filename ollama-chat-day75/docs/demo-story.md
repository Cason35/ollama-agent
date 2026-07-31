# Demo Story：高海拔鸡肉品质研究智能体

## 演示目标

用一条端到端业务故事同时证明 Agent、Workflow、RAG、Memory、Evaluation、Observability 与 Governance 能力，而不是逐页点击功能。

## 前置条件

- Tenant：`research-lab-a`，User：`researcher-01`，Role：`analyst`。
- 知识库已导入公开研究资料，索引版本为 `chicken-altitude-v1`。
- 用户长期偏好：中文、结构化结论、必须给出来源、不确定性单列。

## 演示脚本

1. 用户输入：“分析高海拔环境对鸡肉品质的影响，并生成带引用的研究报告。”
2. API Gateway 校验身份、租户、权限与配额，创建带 Trace ID 的 Runtime Context。
3. Supervisor 将任务拆成资料检索、证据筛选、因素分析、结论合并与报告写作五个 DAG 节点。
4. Research Agent 读取用户长期偏好，并对“高海拔、低氧、肌肉品质、氧化应激”等查询执行 Rewrite。
5. RAG 先 Hybrid Search，再 Rerank；每条证据绑定文档 ID、片段与索引版本。
6. Workflow 并行执行生理机制与品质指标分析，每个节点完成后写入 Checkpoint 与 Event。
7. Writer Agent 合并结果，冲突证据被明确标注，不把推断伪装成事实。
8. Evaluation 对完整性、事实一致性、引用准确率与格式打分；未过 Quality Gate 时触发一次定向修订。
9. Observability 页面按 Trace ID 展示规划、检索、模型、工具、延迟、Token、成本与错误。
10. 系统返回包含摘要、证据表、影响机制、限制、结论和引用的报告。

## 故障演示

在第三个节点后模拟 Worker 中断。重启后从最近 Checkpoint Resume，已完成检索不重复调用，Trace 中出现恢复事件。随后尝试以 Tenant B 读取报告，系统返回权限拒绝并写入 Audit Log。

## 成功标准

- 最终报告每个关键事实均有引用，Citation Accuracy 达到基准阈值。
- 恢复后只重跑未完成节点。
- Tenant B 无法读取 Tenant A 的工作流、记忆、知识和报告。
- Trace 能关联请求、节点、模型、工具、评估和成本。
