# Ollama Chat Day 69

Day 69 在 Day 68 Production Memory Platform（生产级记忆平台）基础上进入 Production Upgrade V6（生产化升级第 6 版），核心主题是 Production Knowledge & RAG Platform V1（生产知识与检索增强生成平台第 1 版）。

项目完整保留 Day 68 的 Chat（对话）、Workflow（工作流）、Agent（智能体）、Tool（工具）、Model（模型）、Prompt（提示词）、Memory（记忆）、RAG（检索增强生成）、Evaluation（评估）、RuntimeContext（运行时上下文）、EventBus（事件总线）、UnifiedRegistry（统一注册中心）、Redis、Queue（队列）、Lock（锁）、Storage（存储）、Config（配置）和 Secrets（密钥）能力，并新增：

- ProductionKnowledgeBase（生产知识库）与 User / Workspace / Team / Global Scope（用户 / 工作空间 / 团队 / 全局作用域）。
- ProductionKnowledgeDocument（生产知识文档）真实生命周期。
- IndexManifest / IndexVersion（索引清单 / 索引版本）和 Active Index Version（活动索引版本）。
- Redis Queue Asynchronous Job（Redis 队列异步任务）与 Indexer Worker（索引工作进程）。
- Distributed Lock（分布式锁）与 Idempotency（幂等性）。
- Safe Update（安全更新）与 Two-Phase Delete（两阶段删除）。
- Knowledge Permission Filter（知识权限过滤）。
- Production Retrieval Pipeline V2（生产检索管线第 2 版）。
- KnowledgeCitation（知识引用）。
- Knowledge Governance Explorer V2（知识治理浏览器第 2 版）。
- ProductionKnowledgeMetrics（生产知识指标）。
- Knowledge Consistency Checker（知识一致性检查器）。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 69 主应用；打开 `http://localhost:3000/knowledge` 可进入 Knowledge Governance Explorer V2；`/memories` 和 `/prompts` 分别保留 Day 68 生产记忆治理与 Day 67 生产提示词治理能力。

## 验证

```bash
npm run test:day69
npm run lint
npm run build
```

端到端测试覆盖：新建知识库与状态流转、重复索引幂等、文档安全更新、权限隔离、标准引用、两阶段删除、索引失败重试、RuntimeContext / EventBus / UnifiedRegistry 集成以及一致性扫描。
