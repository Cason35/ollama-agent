# Ollama Chat Day 66

Day 66 在 Day 65 Unified Event System（统一事件系统）基础上进入 Production Upgrade V3（生产化升级第3版），核心主题是 Unified Registry（统一注册中心）。

项目完整保留 Day65 的 Chat、Workflow、RAG、Memory、Model、Prompt、Evaluation、Redis、Queue、Lock、Storage、Config、Secrets、Runtime Context 与 Event System 业务能力，并新增：

- `RegistryItem`：统一描述智能体、工具、模型、提示词、记忆、工作流和评估能力。
- `RegistryProvider`：定义注册、注销、读取、列表和搜索协议。
- `UnifiedRegistry`：提供严格注册、兼容更新、冲突检测、防御性复制、状态切换和指标统计。
- Adapter（适配器）：让旧 `AgentRegistry`、`ToolRegistry`、`ModelRegistry`、`PromptRegistry` 可选接入统一注册中心，同时保留原有 API。
- `discoverCapability`：综合名称、类型、标签、描述、版本和元数据能力声明执行跨类型能力发现，并过滤禁用项。
- `Registry Explorer`：展示类型、名称、版本、状态、元数据、能力发现结果和 Registry Metrics（注册指标）。
- `GET /api/registry`：支持 `type`、`query` 和 `includeDisabled` 查询参数。

## 运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000` 可进入 Day 66 Unified Registry，右侧控制台默认展示“注册”标签页。

## 测试

```bash
npm run test:day66
npm run lint
npm run build
```

完整测试用例见 `day66_test_cases.md`。
