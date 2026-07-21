# Day73 测试用例文档：Agent Platform Governance & Production Readiness

## 一、测试目标

验证第 73 天从单用户智能体系统升级到 Multi-Tenant Agent Platform（多租户智能体平台）后，身份、租户、RBAC、资源归属、租户隔离、配额、接口网关、审计和生产可观测链路能够形成完整闭环。

自动化入口：

```bash
npm run test:day73
```

## 二、环境与演示身份

| 对象 | 标识 | 角色 / 套餐 | 用途 |
| --- | --- | --- | --- |
| Alpha Research | `tenant-alpha` | Pro | 正常业务、权限和完整请求链 |
| Beta Logistics | `tenant-beta` | Enterprise | 跨租户隔离验证 |
| Quota Limited Lab | `tenant-quota` | Free | 配额超限验证 |
| Alpha Admin | `user-alpha-admin` | Admin | 创建知识、工作流和删除资源 |
| Alpha User | `user-alpha-member` | User | 权限拒绝和 Agent 执行 |
| Beta Admin | `user-beta-admin` | Admin | 尝试搜索 Alpha 私有知识 |
| Quota Admin | `user-quota-admin` | Admin | 在令牌额度耗尽后调用 Agent |

## 三、核心生产安全测试

### TC-D73-001：用户认证与安全上下文

- 前置条件：用户、租户、成员关系和访问令牌均存在且处于启用状态。
- 操作：使用 Alpha Admin 令牌调用 `governance.read`。
- 预期结果：HTTP 语义为成功；`RuntimeContext.identityContext` 包含 `userId`、`tenantId`、`membershipId`、`roles` 和 `permissions`；`securityContext` 包含认证时间和认证提供者。
- 自动化断言：查找 `trace-day73-auth` 对应上下文并验证租户、角色与权限不为空。

### TC-D73-002：RBAC 权限拒绝

- 前置条件：Alpha User 仅绑定 User 角色。
- 操作：Alpha User 执行 `prompt.publish`。
- 预期结果：返回 `403 PERMISSION_DENIED`；发布 `permission.denied`；创建 `permission_denied` 审计记录；提示词不会发布。
- 自动化断言：同时检查网关状态、EventBus 事件和 Audit Log。

### TC-D73-003：Tenant Isolation（租户隔离）

- 前置条件：Alpha Admin 创建 `knowledge-alpha-private`，其 `ownerContext.tenantId` 为 `tenant-alpha`。
- 操作：Beta Admin 使用关键字 `Alpha` 执行 `knowledge.read`。
- 预期结果：Beta 返回零条知识；按 `tenant-beta` 直接读取 Alpha 资源返回 `undefined`；接口不泄露资源是否存在。
- 自动化断言：验证知识所有者上下文、跨租户 `get()` 和 `searchKnowledge()` 结果。

### TC-D73-004：Daily Token Quota（每日令牌配额）

- 前置条件：Quota 租户额度为 100 Tokens，当前用量已经达到 100。
- 操作：继续执行预计消耗 1 Token 的 `agent.execute`。
- 预期结果：返回 `429 QUOTA_EXCEEDED`；发布 `quota.exceeded`；创建失败审计；令牌用量仍为 100，不继续增加。
- 自动化断言：检查事件、审计和用量值。

### TC-D73-005：Audit Log（审计日志）

- 前置条件：Alpha 租户存在 `workflow-alpha-delete`。
- 操作：Alpha Admin 执行 `workflow.delete`。
- 预期结果：资源删除成功；审计记录包含用户、租户、动作、资源类型、资源标识、结果、请求标识和链路标识；SHA-256 前序哈希链校验通过。
- 自动化断言：查找删除审计并调用 `verifyIntegrity()`。

### TC-D73-006：完整生产请求链

- 前置条件：Alpha User 具有 `agent.execute` 权限，Alpha 租户令牌和成本配额充足，目标 Agent 属于 Alpha。
- 操作：执行受治理 Agent，请求预计使用 1200 Tokens 和 0.02 成本。
- 预期结果：完整链路包含 User → Tenant → Permission → Trace → Usage → Audit；Trace 可查询 Span Tree；用量累计；成功审计与同一 `traceId` 关联。
- 自动化断言：验证 `trace-day73-governed-agent`、租户用量和 `agent.execute` 审计。

## 四、补充功能测试

| 用例编号 | 测试内容 | 操作 | 预期结果 |
| --- | --- | --- | --- |
| TC-D73-007 | 用户状态 | 把用户状态设置为 `disabled` 后认证 | 返回 `401 AUTHENTICATION_FAILED` |
| TC-D73-008 | 租户状态 | 使用 `suspended` 租户令牌访问 | 返回 `401 AUTHENTICATION_FAILED` |
| TC-D73-009 | 租户伪造 | Alpha Token 携带 `tenant-beta` | 返回 `403 TENANT_MISMATCH` 并记录失败审计 |
| TC-D73-010 | 工作流数量配额 | `workflowCount + requested > maxWorkflow` | 返回 `429 QUOTA_EXCEEDED`，不创建工作流 |
| TC-D73-011 | 知识容量配额 | `knowledgeSize + uploadSize > maxKnowledgeSize` | 返回 `429 QUOTA_EXCEEDED`，不写入知识 |
| TC-D73-012 | 成本配额 | `monthlyCost + requestCost > monthlyCostLimit` | 模型调用前拒绝并记录超限维度 |
| TC-D73-013 | 资源不存在 | 删除当前租户不存在的资源 | 返回 `404 RESOURCE_NOT_FOUND` |
| TC-D73-014 | 跨租户删除 | Beta 删除 Alpha Workflow | 返回 `404 RESOURCE_NOT_FOUND` 且不泄露归属信息 |
| TC-D73-015 | 频率限制 | 同一用户在窗口内超过请求上限 | 返回 `429 RATE_LIMITED` 并写入失败审计 |
| TC-D73-016 | Viewer 只读 | Viewer 执行 `knowledge.read` | 允许读取当前租户资源 |
| TC-D73-017 | Viewer 修改 | Viewer 执行 `knowledge.delete` | 返回 `403 PERMISSION_DENIED` |
| TC-D73-018 | Admin 通配符 | Admin 执行任一标准动作 | `*` 权限允许动作继续执行 |
| TC-D73-019 | 审计租户过滤 | 按 `tenant-alpha` 查询审计 | 只返回 Alpha 租户记录 |
| TC-D73-020 | 审计防篡改 | 修改历史记录后重新校验 | `verifyIntegrity()` 返回 `false` |

## 五、治理仪表盘验收

1. 根标签页标题显示 `Day 73 - Agent Platform Governance & Production Readiness`。
2. 主页面 Day 徽标显示 `73`，升级版本显示 `Production Upgrade V10`。
3. Governance 页面独立标签页标题显示 `Day 73 - Agent Platform Governance Dashboard`。
4. Tenant Explorer 展示租户、用户、套餐、资源和 Owner Context（所有者上下文）。
5. Permission Explorer 展示 Admin、Developer、User、Viewer 和各自权限。
6. Audit Explorer 展示 Who、When、Action、Resource、Result、Trace 和 Integrity Hash。
7. Quota Dashboard 展示 Token、Cost、Workflow、Knowledge Size 的当前值、上限和进度。
8. Security Tests 展示六类生产安全测试通过状态。
9. API Gateway 区域展示 Authentication、Authorization、Rate Limit 和 Request Context 四道边界。
10. EventBus 区域展示 `user.created`、`tenant.created`、`permission.denied`、`quota.exceeded` 和 `audit.created`。
11. UnifiedRegistry 区域展示 AuthProvider、PermissionService、QuotaManager 和 AuditLogger。
12. Trace 区域展示受治理 Agent 请求的完整分布式链路。

## 六、验收命令

```bash
npm run test:day73
npm run lint
npm run build
```

全部通过后，第 73 天目标状态为：

```text
Agent Platform v1.0 Production Ready
智能体平台第 1.0 版达到生产就绪状态
```
