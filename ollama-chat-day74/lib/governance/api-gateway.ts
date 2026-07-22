import { MemoryEventBus } from "@/lib/events/memory-event-bus"; // 第73天：引入统一内存事件总线发布权限、配额和审计事件。
import { createRuntimeEvent } from "@/lib/events/event-factory"; // 第73天：引入统一事件工厂确保治理事件关联请求与链路。
import { AuditLogger } from "@/lib/governance/audit-logger"; // 第73天：引入审计日志记录器保存每次网关决策。
import { AuthenticationError, IdentityService } from "@/lib/governance/identity-service"; // 第73天：引入身份服务和可识别认证异常。
import { PermissionService } from "@/lib/governance/permission-service"; // 第73天：引入RBAC权限检查器。
import { QuotaManager } from "@/lib/governance/quota-manager"; // 第73天：引入租户用量配额管理器。
import { TenantResourceStore } from "@/lib/governance/tenant-resource-store"; // 第73天：引入自动执行租户过滤的资源存储。
import type { AuditLog, AuthenticatedIdentity, GatewayRequest, GatewayResult, IdentityContext, PermissionDecision, SecurityContext } from "@/lib/governance/types"; // 第73天：引入网关、身份、安全和审计领域类型。
import { runtimeContextBuilder, type RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第73天：引入统一运行时上下文构建器注入身份和安全上下文。
class RateLimiter { // 第73天：实现按用户和租户组合隔离的固定窗口请求频率限制器。
  private readonly windows = new Map<string, number[]>(); // 第73天：按租户用户键保存当前窗口请求时间戳。
  constructor(private readonly maxRequests = 20, private readonly windowMs = 60000) {} // 第73天：默认限制每个租户用户每分钟二十次治理请求。
  allow(key: string, now = Date.now()): boolean { const recent = (this.windows.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs); if (recent.length >= this.maxRequests) { this.windows.set(key, recent); return false; } recent.push(now); this.windows.set(key, recent); return true; } // 第73天：清理过期时间戳并决定当前请求是否进入固定窗口。
} // 第73天：结束请求频率限制器实现。
export type GatewayHandler<T> = (context: RuntimeContextV2, identity: AuthenticatedIdentity) => Promise<T> | T; // 第73天：定义通过全部安全边界后执行真实业务动作的处理器。
export class ApiGateway { // 第73天：实现认证、授权、频率限制、请求上下文、配额和审计统一入口。
  private readonly rateLimiter = new RateLimiter(); // 第73天：创建生产网关共享的用户租户频率限制器。
  private readonly contexts = new Map<string, RuntimeContextV2>(); // 第73天：按请求标识保存经过身份安全注入的运行时上下文。
  constructor(private readonly identityService: IdentityService, private readonly permissionService: PermissionService, private readonly quotaManager: QuotaManager, private readonly auditLogger: AuditLogger, private readonly resourceStore: TenantResourceStore, readonly eventBus: MemoryEventBus) {} // 第73天：注入身份、权限、配额、审计、隔离存储和事件总线依赖。
  async execute<T>(request: GatewayRequest, handler: GatewayHandler<T>): Promise<GatewayResult<T>> { // 第73天：通过统一安全边界执行一次生产平台请求。
    let identity: AuthenticatedIdentity; // 第73天：声明认证成功后可复用的用户租户身份。
    try { identity = this.identityService.authenticate(request.token); } catch (error) { const message = error instanceof AuthenticationError ? error.message : "身份认证失败"; return { ok: false, status: 401, code: "AUTHENTICATION_FAILED", message }; } // 第73天：首先验证令牌并以统一401响应拒绝无效身份。
    const permission = this.permissionService.check(identity, request.action); // 第73天：解析角色和权限供安全上下文及授权判定使用。
    const context = this.buildContext(request, identity, permission); // 第73天：为每个请求生成或透传RequestId、TraceId、TenantId和UserId。
    this.contexts.set(context.requestId, structuredClone(context)); // 第73天：保存安全运行时上下文供治理看板和测试回放。
    if (request.tenantId && request.tenantId !== identity.tenant.id) { const reason = "请求租户与身份令牌租户不一致"; const audit = await this.audit(context, request, identity, "failed", reason); return { ok: false, status: 403, code: "TENANT_MISMATCH", message: reason, context, audit }; } // 第73天：阻止客户端伪造TenantId跨租户访问数据。
    if (!this.rateLimiter.allow(`${identity.tenant.id}:${identity.user.id}`)) { const reason = "当前用户或租户请求频率超过限制"; const audit = await this.audit(context, request, identity, "failed", reason); return { ok: false, status: 429, code: "RATE_LIMITED", message: reason, context, audit }; } // 第73天：在权限和业务处理前限制单用户租户的请求频率。
    if (!permission.allowed) { await this.eventBus.publish(createRuntimeEvent(context, "permission.denied", "governance", { action: request.action, reason: permission.reason, userId: identity.user.id, tenantId: identity.tenant.id }, "denied")); const audit = await this.audit(context, request, identity, "permission_denied", permission.reason); return { ok: false, status: 403, code: "PERMISSION_DENIED", message: permission.reason, context, audit }; } // 第73天：权限不足时发布permission.denied事件并创建审计记录。
    if (request.resourceId && request.resourceType && request.resourceType !== "platform" && !this.resourceStore.get(identity.tenant.id, request.resourceId)) { const reason = "资源不存在或不属于当前租户"; const audit = await this.audit(context, request, identity, "failed", reason); return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND", message: reason, context, audit }; } // 第73天：资源操作前按当前租户检查所有者上下文且不泄露跨租户存在性。
    const quotaDecisions = this.quotaManager.check(identity.tenant.id, request.estimatedUsage); // 第73天：高成本业务执行前检查令牌、成本、工作流和知识容量额度。
    const quotaFailure = quotaDecisions.find((item) => !item.allowed); // 第73天：定位首个超限维度生成稳定拒绝原因。
    if (quotaFailure) { await this.eventBus.publish(createRuntimeEvent(context, "quota.exceeded", "governance", { action: request.action, decision: quotaFailure, userId: identity.user.id, tenantId: identity.tenant.id }, "denied")); const audit = await this.audit(context, request, identity, "failed", quotaFailure.reason); return { ok: false, status: 429, code: "QUOTA_EXCEEDED", message: quotaFailure.reason, context, audit, quotaDecisions }; } // 第73天：超过租户配额时拒绝业务、发布事件并创建审计记录。
    try { const data = await handler(context, identity); this.quotaManager.consume(identity.tenant.id, request.estimatedUsage); const audit = await this.audit(context, request, identity, "success"); return { ok: true, status: 200, code: "OK", message: "success", context, data, audit, quotaDecisions }; } // 第73天：业务成功后累计租户用量并记录成功审计日志。
    catch (error) { const reason = error instanceof Error ? error.message : "未知业务执行错误"; const audit = await this.audit(context, request, identity, "failed", reason); return { ok: false, status: 500, code: "ACTION_FAILED", message: reason, context, audit, quotaDecisions }; } // 第73天：业务异常时生成统一500响应和失败审计记录。
  } // 第73天：结束生产接口网关统一执行方法。
  listContexts(): RuntimeContextV2[] { return Array.from(this.contexts.values()).map((context) => structuredClone(context)); } // 第73天：列出全部安全上下文副本供治理看板验证身份注入。
  private buildContext(request: GatewayRequest, identity: AuthenticatedIdentity, decision: PermissionDecision): RuntimeContextV2 { // 第73天：把认证身份和RBAC判定结果转换为统一运行时上下文。
    const roles = decision.roles.map((role) => role.name); // 第73天：提取角色名称形成可展示角色集合。
    const permissions = [...decision.permissions]; // 第73天：复制解析后的权限集合避免共享可变数据。
    const identityContext: IdentityContext = { userId: identity.user.id, tenantId: identity.tenant.id, membershipId: identity.membership.id, roles, permissions }; // 第73天：组装用户、租户、成员、角色和权限身份上下文。
    const securityContext: SecurityContext = { ...identityContext, authenticatedAt: Date.now(), authProvider: "Day73OpaqueTokenAuthProvider" }; // 第73天：组装包含认证时间和提供者的安全上下文。
    return runtimeContextBuilder.build({ requestId: request.requestId, traceId: request.traceId, userId: identity.user.id, identityContext, securityContext, metadata: { action: request.action, tenantId: identity.tenant.id, resourceType: request.resourceType ?? "platform", resourceId: request.resourceId ?? "platform" } }); // 第73天：构建可沿Agent、Workflow、Knowledge和Observability传播的运行时上下文。
  } // 第73天：结束身份安全上下文构建方法。
  private async audit(context: RuntimeContextV2, request: GatewayRequest, identity: AuthenticatedIdentity, result: AuditLog["result"], reason?: string): Promise<AuditLog> { // 第73天：为每个网关允许或拒绝决策创建审计记录并发布事件。
    const log = this.auditLogger.write({ userId: identity.user.id, tenantId: identity.tenant.id, action: request.action, resourceType: request.resourceType ?? "platform", resourceId: request.resourceId ?? "platform", result, reason, requestId: context.requestId, traceId: context.traceId, metadata: { plan: identity.tenant.plan, roles: context.securityContext?.roles ?? [], permissionCount: context.securityContext?.permissions.length ?? 0 } }); // 第73天：写入用户、租户、资源、动作、结果和链路字段。
    await this.eventBus.publish(createRuntimeEvent(context, "audit.created", "governance", log, result)); // 第73天：发布audit.created事件供外部审计存储和合规订阅者消费。
    return log; // 第73天：返回新创建的审计记录供网关响应关联。
  } // 第73天：结束统一网关审计辅助方法。
} // 第73天：结束生产接口网关实现。
