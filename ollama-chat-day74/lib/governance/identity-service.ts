import { randomUUID } from "node:crypto"; // 第73天：引入UUID生成器创建用户、租户和成员关系标识。
import type { AuthenticatedIdentity, Tenant, TenantMembership, TenantPlan, UserIdentity } from "@/lib/governance/types"; // 第73天：引入身份系统使用的用户、租户和成员关系类型。
export class AuthenticationError extends Error { // 第73天：定义可由生产网关识别的身份认证异常。
  constructor(message: string) { super(message); this.name = "AuthenticationError"; } // 第73天：保存安全认证错误消息并设置稳定异常名称。
} // 第73天：结束身份认证异常定义。
export class IdentityService { // 第73天：实现统一用户身份、租户、成员关系和令牌认证服务。
  private readonly users = new Map<string, UserIdentity>(); // 第73天：按用户标识保存统一用户身份。
  private readonly tenants = new Map<string, Tenant>(); // 第73天：按租户标识保存组织和套餐信息。
  private readonly memberships = new Map<string, TenantMembership>(); // 第73天：按成员关系标识保存用户租户角色映射。
  private readonly tokens = new Map<string, { userId: string; tenantId: string }>(); // 第73天：保存教学演示使用的不透明访问令牌映射。
  createUser(input: Omit<UserIdentity, "id" | "createdAt"> & { id?: string; createdAt?: number }): UserIdentity { // 第73天：创建启用或禁用状态的统一用户身份。
    const user: UserIdentity = { id: input.id?.trim() || `user_${randomUUID()}`, email: input.email?.trim(), name: input.name?.trim(), status: input.status, createdAt: input.createdAt ?? Date.now() }; // 第73天：标准化用户字段并补齐唯一标识和创建时间。
    if (this.users.has(user.id)) throw new Error(`用户已存在：${user.id}`); // 第73天：拒绝重复用户标识避免身份覆盖。
    this.users.set(user.id, structuredClone(user)); // 第73天：保存用户身份防御性副本。
    return structuredClone(user); // 第73天：返回创建完成的用户身份副本。
  } // 第73天：结束统一用户创建方法。
  createTenant(input: { id?: string; name: string; plan: TenantPlan; status: Tenant["status"]; createdAt?: number }): Tenant { // 第73天：创建免费版、专业版或企业版租户。
    const tenant: Tenant = { id: input.id?.trim() || `tenant_${randomUUID()}`, name: input.name.trim(), plan: input.plan, status: input.status, createdAt: input.createdAt ?? Date.now() }; // 第73天：标准化租户字段并补齐唯一标识和创建时间。
    if (this.tenants.has(tenant.id)) throw new Error(`租户已存在：${tenant.id}`); // 第73天：拒绝重复租户标识避免跨组织覆盖。
    this.tenants.set(tenant.id, structuredClone(tenant)); // 第73天：保存租户防御性副本。
    return structuredClone(tenant); // 第73天：返回创建完成的租户副本。
  } // 第73天：结束租户创建方法。
  addMembership(input: { id?: string; userId: string; tenantId: string; roleIds: string[]; createdAt?: number }): TenantMembership { // 第73天：把用户加入指定租户并绑定一个或多个角色。
    if (!this.users.has(input.userId)) throw new Error(`用户不存在：${input.userId}`); // 第73天：阻止未知用户加入租户。
    if (!this.tenants.has(input.tenantId)) throw new Error(`租户不存在：${input.tenantId}`); // 第73天：阻止用户加入未知租户。
    const membership: TenantMembership = { id: input.id?.trim() || `membership_${randomUUID()}`, userId: input.userId, tenantId: input.tenantId, roleIds: [...new Set(input.roleIds)], createdAt: input.createdAt ?? Date.now() }; // 第73天：创建角色去重后的成员关系。
    this.memberships.set(membership.id, structuredClone(membership)); // 第73天：保存成员关系防御性副本。
    return structuredClone(membership); // 第73天：返回创建完成的成员关系副本。
  } // 第73天：结束租户成员关系创建方法。
  registerToken(token: string, userId: string, tenantId: string): void { // 第73天：为已存在的用户租户成员关系注册不透明访问令牌。
    if (!token.trim()) throw new Error("访问令牌不能为空"); // 第73天：拒绝空令牌进入身份认证表。
    if (!this.findMembership(userId, tenantId)) throw new Error(`用户 ${userId} 不属于租户 ${tenantId}`); // 第73天：确保令牌只能关联真实成员关系。
    this.tokens.set(token.trim(), { userId, tenantId }); // 第73天：保存令牌到用户租户的最小安全映射。
  } // 第73天：结束访问令牌注册方法。
  authenticate(token: string): AuthenticatedIdentity { // 第73天：验证访问令牌并解析活动用户、活动租户和成员关系。
    const binding = this.tokens.get(token.trim()); // 第73天：读取不透明令牌关联的用户和租户标识。
    if (!binding) throw new AuthenticationError("身份令牌无效或已过期"); // 第73天：拒绝未知令牌且不泄露内部身份数据。
    const user = this.users.get(binding.userId); // 第73天：读取令牌对应的用户身份。
    const tenant = this.tenants.get(binding.tenantId); // 第73天：读取令牌对应的租户身份。
    const membership = this.findMembership(binding.userId, binding.tenantId); // 第73天：读取令牌对应的租户成员关系。
    if (!user || user.status !== "active") throw new AuthenticationError("用户不存在或已被禁用"); // 第73天：拒绝不存在或已禁用用户继续访问平台。
    if (!tenant || tenant.status !== "active") throw new AuthenticationError("租户不存在或已被暂停"); // 第73天：拒绝不存在或已暂停租户继续访问平台。
    if (!membership) throw new AuthenticationError("用户不属于当前租户"); // 第73天：拒绝缺少成员关系的跨租户令牌。
    return { user: structuredClone(user), tenant: structuredClone(tenant), membership: structuredClone(membership) }; // 第73天：返回完成防御性复制的认证身份。
  } // 第73天：结束令牌身份认证方法。
  getUser(id: string): UserIdentity | undefined { const value = this.users.get(id); return value ? structuredClone(value) : undefined; } // 第73天：按用户标识安全读取身份副本。
  getTenant(id: string): Tenant | undefined { const value = this.tenants.get(id); return value ? structuredClone(value) : undefined; } // 第73天：按租户标识安全读取租户副本。
  listUsers(): UserIdentity[] { return Array.from(this.users.values()).map((item) => structuredClone(item)); } // 第73天：列出全部统一用户身份副本供治理看板展示。
  listTenants(): Tenant[] { return Array.from(this.tenants.values()).map((item) => structuredClone(item)); } // 第73天：列出全部租户副本供治理看板展示。
  listMemberships(): TenantMembership[] { return Array.from(this.memberships.values()).map((item) => structuredClone(item)); } // 第73天：列出全部用户与角色映射副本供权限浏览器展示。
  private findMembership(userId: string, tenantId: string): TenantMembership | undefined { return Array.from(this.memberships.values()).find((item) => item.userId === userId && item.tenantId === tenantId); } // 第73天：按用户与租户组合定位唯一成员关系。
} // 第73天：结束统一身份服务实现。
