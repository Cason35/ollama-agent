import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第73天：引入内存事件总线保存治理事件历史。
import { createRuntimeEvent } from "@/lib/events/event-factory"; // 第73天：引入统一事件工厂发布用户和租户创建事件。
import { AuditLogger } from "@/lib/governance/audit-logger"; // 第73天：引入防篡改审计日志记录器。
import { ApiGateway } from "@/lib/governance/api-gateway"; // 第73天：引入生产接口网关统一执行治理动作。
import { IdentityService } from "@/lib/governance/identity-service"; // 第73天：引入用户身份、租户和令牌认证服务。
import { PermissionService } from "@/lib/governance/permission-service"; // 第73天：引入RBAC权限检查服务。
import { QuotaManager } from "@/lib/governance/quota-manager"; // 第73天：引入租户级用量配额管理器。
import { TenantResourceStore } from "@/lib/governance/tenant-resource-store"; // 第73天：引入自动执行租户隔离的资源存储。
import type { GatewayRequest, GatewayResult, GovernanceSnapshot, SecurityTestEvidence, Tenant, TenantMembership, TenantQuota, TenantUsage, UserIdentity } from "@/lib/governance/types"; // 第73天：引入运行时公开方法和治理快照领域类型。
import { AGENT_PLATFORM_METRICS } from "@/lib/observability/types"; // 第73天：引入Day72统一指标名称复用生产可观测能力。
import { ObservabilityRuntime } from "@/lib/observability/observability-runtime"; // 第73天：引入生产可观测运行时构建完整请求Trace和Usage关联。
import { createDay66UnifiedRegistry } from "@/lib/registry/registry-runtime"; // 第73天：引入历史统一注册中心继承全部平台能力。
import { runtimeContextBuilder } from "@/lib/runtime/unified-runtime-context"; // 第73天：引入统一上下文构建器创建平台级治理事件上下文。
export class GovernanceRuntime { // 第73天：编排身份、租户、权限、隔离、配额、网关、审计和可观测闭环。
  readonly identityService = new IdentityService(); // 第73天：创建统一用户身份和租户认证服务。
  readonly permissionService = new PermissionService(); // 第73天：创建RBAC角色权限检查服务。
  readonly quotaManager = new QuotaManager(); // 第73天：创建租户用量配额管理器。
  readonly resourceStore = new TenantResourceStore(); // 第73天：创建自动添加租户过滤条件的资源存储。
  readonly auditLogger = new AuditLogger(); // 第73天：创建防篡改审计日志记录器。
  readonly eventBus = new MemoryEventBus(500); // 第73天：创建保存五百条治理事件的统一事件总线。
  readonly registry = createDay66UnifiedRegistry(); // 第73天：创建继承历史能力的统一注册中心。
  readonly observabilityRuntime = new ObservabilityRuntime(this.registry); // 第73天：复用同一注册中心创建生产可观测运行时。
  readonly gateway = new ApiGateway(this.identityService, this.permissionService, this.quotaManager, this.auditLogger, this.resourceStore, this.eventBus); // 第73天：创建注入全部安全治理依赖的生产接口网关。
  private securityTests: SecurityTestEvidence[] = []; // 第73天：保存六类生产安全测试的最新证据。
  constructor() { this.registerCapabilities(); } // 第73天：运行时创建时把四类治理核心能力注册到统一注册中心。
  async createTenant(input: { id?: string; name: string; plan: Tenant["plan"]; status: Tenant["status"]; createdAt?: number }): Promise<Tenant> { const tenant = this.identityService.createTenant(input); this.quotaManager.initializeTenant(tenant.id, tenant.plan); const context = runtimeContextBuilder.build({ metadata: { tenantId: tenant.id, operation: "tenant.create" } }); await this.eventBus.publish(createRuntimeEvent(context, "tenant.created", "governance", tenant, "success")); return tenant; } // 第73天：创建租户、初始化套餐配额并发布tenant.created事件。
  async createUser(input: Omit<UserIdentity, "id" | "createdAt"> & { id?: string; createdAt?: number }): Promise<UserIdentity> { const user = this.identityService.createUser(input); const context = runtimeContextBuilder.build({ userId: user.id, metadata: { operation: "user.create" } }); await this.eventBus.publish(createRuntimeEvent(context, "user.created", "governance", user, "success")); return user; } // 第73天：创建统一用户身份并发布user.created事件。
  addMembership(input: { id?: string; userId: string; tenantId: string; roleIds: string[]; createdAt?: number }): TenantMembership { return this.identityService.addMembership(input); } // 第73天：把用户加入租户并绑定RBAC角色。
  registerToken(token: string, userId: string, tenantId: string): void { this.identityService.registerToken(token, userId, tenantId); } // 第73天：为测试或接口请求注册不透明访问令牌。
  setQuota(tenantId: string, quota: TenantQuota): void { this.quotaManager.setQuota(tenantId, quota); } // 第73天：为指定租户覆盖计划默认配额。
  setUsage(tenantId: string, usage: TenantUsage): void { this.quotaManager.setUsage(tenantId, usage); } // 第73天：同步指定租户当前令牌、成本、工作流和知识用量。
  setSecurityTests(tests: SecurityTestEvidence[]): void { this.securityTests = tests.map((item) => structuredClone(item)); } // 第73天：保存生产安全测试证据供治理仪表盘展示。
  execute(request: GatewayRequest): Promise<GatewayResult> { return this.gateway.execute(request, async (context, identity) => this.dispatch(request, context, identity.user.id, identity.tenant.id)); } // 第73天：通过统一生产网关执行标准治理动作。
  getSnapshot(): GovernanceSnapshot { // 第73天：生成租户、权限、配额、审计和平台接入的完整治理快照。
    const tenants = this.identityService.listTenants(); // 第73天：读取全部租户供Tenant Explorer展示。
    const users = this.identityService.listUsers(); // 第73天：读取全部用户供身份系统展示。
    const resources = this.resourceStore.listAll(); // 第73天：读取带所有者上下文的全部治理资源。
    const auditLogs = this.auditLogger.list(); // 第73天：读取完整审计哈希链供Audit Explorer展示。
    const quotas = tenants.map((tenant) => { const quota = this.quotaManager.getQuota(tenant.id); const usage = this.quotaManager.getUsage(tenant.id); const exceeded = usage.dailyTokens >= quota.dailyTokens || usage.monthlyCost >= quota.monthlyCost || usage.workflowCount >= quota.maxWorkflow || usage.knowledgeSize >= quota.maxKnowledgeSize; return { tenant, quota, usage, exceeded }; }); // 第73天：聚合每个租户的限制、用量和临界超限状态。
    const overview = { tenants: tenants.length, activeUsers: users.filter((user) => user.status === "active").length, resources: resources.length, permissionDenials: auditLogs.filter((log) => log.result === "permission_denied").length, quotaExceeded: this.eventBus.getHistory().filter((event) => event.type === "quota.exceeded").length, auditLogs: auditLogs.length, productionReady: this.securityTests.length === 6 && this.securityTests.every((item) => item.passed) }; // 第73天：计算治理首页租户、用户、资源、拒绝、审计和生产就绪指标。
    return { overview, tenants, users, memberships: this.identityService.listMemberships(), roles: this.permissionService.listRoles(), resources, quotas, auditLogs, events: this.eventBus.getHistory(), runtimeContexts: this.gateway.listContexts(), registryItems: this.registry.list("governance"), traces: this.observabilityRuntime.getSnapshot().traces, securityTests: this.securityTests.map((item) => structuredClone(item)), generatedAt: Date.now() }; // 第73天：返回治理仪表盘和自动化测试共享的完整快照。
  } // 第73天：结束治理平台快照生成方法。
  private async dispatch(request: GatewayRequest, context: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2, userId: string, tenantId: string): Promise<unknown> { // 第73天：在网关通过安全检查后路由到真实平台动作。
    if (request.action === "agent.execute") return this.executeAgent(context, userId, tenantId, request); // 第73天：执行智能体并形成Trace、Usage和Audit完整链路。
    if (request.action === "knowledge.create") return this.resourceStore.create({ id: typeof request.payload?.id === "string" ? request.payload.id : undefined, type: "knowledge", name: typeof request.payload?.name === "string" ? request.payload.name : "未命名知识", ownerContext: { tenantId, createdBy: userId }, size: Number(request.payload?.size ?? request.estimatedUsage?.knowledgeSize ?? 0), metadata: request.payload ?? {} }); // 第73天：创建带tenantId和createdBy归属的知识资源。
    if (request.action === "knowledge.read") return this.resourceStore.searchKnowledge(tenantId, typeof request.payload?.query === "string" ? request.payload.query : ""); // 第73天：只在当前租户范围内检索知识资源。
    if (request.action === "knowledge.delete") return request.resourceId ? this.resourceStore.delete(tenantId, request.resourceId) : undefined; // 第73天：只删除当前租户拥有的知识资源。
    if (request.action === "workflow.create") return this.resourceStore.create({ id: typeof request.payload?.id === "string" ? request.payload.id : undefined, type: "workflow", name: typeof request.payload?.name === "string" ? request.payload.name : "未命名工作流", ownerContext: { tenantId, createdBy: userId }, metadata: request.payload ?? {} }); // 第73天：创建携带资源归属的租户工作流。
    if (request.action === "workflow.delete") return request.resourceId ? this.resourceStore.delete(tenantId, request.resourceId) : undefined; // 第73天：只删除当前租户拥有的工作流资源。
    if (request.action === "workflow.run") return { workflowId: request.resourceId ?? "workflow-demo", status: "completed", tenantId, userId }; // 第73天：返回经过权限和租户检查的工作流执行结果。
    if (request.action === "prompt.publish") return { promptId: request.resourceId ?? "prompt-demo", version: "v3", status: "published", tenantId, userId }; // 第73天：返回经过prompt.publish权限检查的发布结果。
    if (request.action === "prompt.read") return this.resourceStore.list(tenantId, "prompt"); // 第73天：只读取当前租户拥有的提示词资源。
    if (request.action === "evaluation.run") return { evaluationId: `evaluation-${context.requestId}`, status: "completed", tenantId, userId }; // 第73天：返回经过evaluation.run权限检查的评估结果。
    if (request.action === "evaluation.read") return this.resourceStore.list(tenantId, "evaluation"); // 第73天：只读取当前租户拥有的评估资源。
    if (request.action === "governance.read") return { tenantId, users: this.identityService.listMemberships().filter((item) => item.tenantId === tenantId).length, resources: this.resourceStore.list(tenantId).length }; // 第73天：返回当前租户可见的治理摘要且不暴露其他租户详情。
    throw new Error(`尚未实现治理动作：${request.action}`); // 第73天：对未路由动作返回明确业务异常并进入失败审计。
  } // 第73天：结束标准治理动作分发方法。
  private async executeAgent(context: import("@/lib/runtime/unified-runtime-context").RuntimeContextV2, userId: string, tenantId: string, request: GatewayRequest): Promise<unknown> { // 第73天：执行包含User、Tenant、Permission、Trace、Usage和Audit的智能体请求。
    const startedAt = Date.now() - 120; // 第73天：使用稳定短延迟起始时间构建演示链路。
    await this.observabilityRuntime.startRequest({ requestId: context.requestId, traceId: context.traceId, sessionId: context.sessionId, rootOperation: "Day73 Governed Agent Execution", agentId: "agent-day73-governed", taskId: `task-${context.requestId}`, metricsEnabled: true, criticalWorkflow: true, estimatedCost: request.estimatedUsage?.monthlyCost ?? 0, startedAt }); // 第73天：以网关RequestId和TraceId开始生产可观测请求。
    const agentSpan = this.observabilityRuntime.startSpan(context.traceId, { name: "Governed Agent Runtime", source: "agent", attributes: { userId, tenantId, permission: request.action }, startedAt: startedAt + 10 }); // 第73天：创建携带用户租户和权限的智能体跨度。
    const modelSpan = this.observabilityRuntime.startSpan(context.traceId, { parentSpanId: agentSpan, name: "Quota Approved Model Call", source: "model", attributes: { tenantId, quotaChecked: true }, startedAt: startedAt + 25 }); // 第73天：创建已完成配额检查的模型调用子跨度。
    this.observabilityRuntime.endSpan(context.traceId, modelSpan, "success", { endedAt: startedAt + 90 }); // 第73天：完成模型调用跨度并记录确定性耗时。
    this.observabilityRuntime.endSpan(context.traceId, agentSpan, "success", { endedAt: startedAt + 110 }); // 第73天：完成智能体跨度并保留用户租户属性。
    await this.observabilityRuntime.writeLog({ level: "info", message: "Day73多租户智能体请求已通过身份、权限与配额检查", source: "governance-agent-runtime", observationSource: "agent", traceId: context.traceId, requestId: context.requestId, metadata: { userId, tenantId, action: request.action }, createdAt: startedAt + 100 }); // 第73天：写入关联同一链路的结构化治理执行日志。
    await this.observabilityRuntime.recordMetric({ name: AGENT_PLATFORM_METRICS.agentExecutionCount, kind: "counter", value: 1, source: "agent", traceId: context.traceId, requestId: context.requestId, labels: { tenantId }, timestamp: startedAt + 105 }); // 第73天：记录按租户关联的智能体执行次数指标。
    await this.observabilityRuntime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelTokenUsage, kind: "histogram", value: request.estimatedUsage?.dailyTokens ?? 0, source: "model", traceId: context.traceId, requestId: context.requestId, labels: { tenantId }, timestamp: startedAt + 106 }); // 第73天：记录本次经过配额批准的模型令牌用量。
    await this.observabilityRuntime.recordMetric({ name: AGENT_PLATFORM_METRICS.modelCost, kind: "gauge", value: request.estimatedUsage?.monthlyCost ?? 0, source: "model", traceId: context.traceId, requestId: context.requestId, labels: { tenantId }, timestamp: startedAt + 107 }); // 第73天：记录本次经过配额批准的模型成本。
    const trace = await this.observabilityRuntime.completeTrace(context.traceId, "success", startedAt + 120); // 第73天：完成并保存可从治理审计跳转的生产分布式链路。
    return { output: "Day73 governed agent response", requestId: context.requestId, traceId: context.traceId, userId, tenantId, usage: request.estimatedUsage ?? {}, traceStatus: trace?.status ?? "success" }; // 第73天：返回包含身份、租户、链路和用量证据的智能体结果。
  } // 第73天：结束生产治理智能体执行方法。
  private registerCapabilities(): void { // 第73天：把身份、权限、配额和审计四类核心治理能力注册到统一注册中心。
    const createdAt = Date.UTC(2026, 6, 21, 0, 0, 0); // 第73天：使用稳定教学时间戳注册治理能力。
    const items = [{ id: "governance:auth-provider", name: "AuthProvider（身份认证提供者）", capabilities: ["authentication", "user-identity", "tenant-identity"] }, { id: "governance:permission-service", name: "PermissionService（权限服务）", capabilities: ["rbac", "permission-check", "resource-ownership"] }, { id: "governance:quota-manager", name: "QuotaManager（配额管理器）", capabilities: ["token-quota", "cost-quota", "workflow-quota", "knowledge-quota"] }, { id: "governance:audit-logger", name: "AuditLogger（审计日志记录器）", capabilities: ["audit-log", "tamper-evidence", "tenant-filter"] }]; // 第73天：定义统一注册中心要求的四个治理能力注册项。
    for (const item of items) if (!this.registry.get(item.id)) this.registry.register({ ...item, type: "governance", version: "1.0.0", metadata: { description: `${item.name} 是 Day73 Agent Platform Governance 核心能力。`, capabilities: item.capabilities, tags: ["governance", "multi-tenant", "production", "day73"] }, enabled: true, createdAt }); // 第73天：幂等注册全部治理能力并声明版本、能力和标签。
  } // 第73天：结束生产治理能力统一注册方法。
} // 第73天：结束智能体平台治理运行时实现。
