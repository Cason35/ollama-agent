# Ollama Chat Day40 接口文档导入说明

本项目已经生成 `OpenAPI`（开放接口规范）格式接口文档：

```text
openapi.json
```

该文件可以直接导入：

- `Apifox`（接口管理与调试工具）
- `Postman`（接口调试工具）
- 其他支持 `OpenAPI 3.0`（开放接口规范 3.0）的工具

## 导入 Apifox

1. 打开 Apifox。
2. 选择项目。
3. 点击“导入”。
4. 选择 `OpenAPI / Swagger`（开放接口规范 / Swagger）。
5. 选择本目录下的 `openapi.json`。

## 导入 Postman

1. 打开 Postman。
2. 点击 `Import`（导入）。
3. 选择文件导入。
4. 选择本目录下的 `openapi.json`。

## 默认服务地址

文档里配置了两个 `server`（服务地址）：

```text
http://localhost:3040
http://localhost:3000
```

如果你的本地 Next.js（React 全栈框架）服务端口不同，可以在 Apifox 或 Postman 中修改环境变量或请求 Base URL（基础地址）。

## 已覆盖接口

- `POST /api/chat`：聊天接口，普通请求走 Supervisor Agent（监督智能体）多智能体链路。
- `GET /api/agents`：Agent Registry（智能体注册表）与 Supervisor Runtime Dashboard（监督运行时看板）数据。
- `GET /api/tools`：Tool Registry（工具注册表）数据。
- `GET /api/knowledge`：Knowledge Store（知识库）概览。
- `POST /api/knowledge`：导入知识或重建索引。
- `POST /api/knowledge/retrieve`：RAG（检索增强生成）检索调试。
- `GET /api/queue`：Queue Runtime（队列运行时）快照。
- `POST /api/queue`：创建 Queue Job（队列任务）。
- `PATCH /api/queue`：队列任务生命周期动作。
- `GET /api/workflows`：获取 WorkflowState（工作流状态快照）列表。
- `POST /api/workflows`：保存 WorkflowState（工作流状态快照）。
- `GET /api/workflows/{id}`：获取单条 WorkflowState（工作流状态快照）。
- `DELETE /api/workflows/{id}`：删除单条 WorkflowState（工作流状态快照）。
- `POST /api/workflows/purge`：清理过期 WorkflowState（工作流状态快照）。
- `POST /api/workflow/confirm`：HITL（人类参与确认）确认或取消工作流步骤。
