import type { AuthenticatedIdentity, GovernancePermission, PermissionDecision, Role } from "@/lib/governance/types"; // 第73天：引入认证身份、标准权限、判定结果和角色类型。
const DEFAULT_ROLES: Role[] = [ // 第73天：定义管理员、开发者、普通用户和只读查看者四个默认角色。
  { id: "role-admin", name: "Admin", permissions: ["*"], description: "拥有全部平台治理和业务权限" }, // 第73天：管理员通过通配符拥有全部平台权限。
  { id: "role-developer", name: "Developer", permissions: ["agent.execute", "workflow.run", "workflow.create", "workflow.delete", "knowledge.read", "knowledge.create", "prompt.read", "prompt.publish", "evaluation.read", "evaluation.run", "governance.read"], description: "可以开发、发布和评估智能体资源" }, // 第73天：开发者拥有创建、执行、发布和评估权限。
  { id: "role-user", name: "User", permissions: ["agent.execute", "workflow.run", "knowledge.read", "prompt.read", "evaluation.read"], description: "可以调用智能体并查看自己的执行结果" }, // 第73天：普通用户只拥有执行和读取类权限。
  { id: "role-viewer", name: "Viewer", permissions: ["knowledge.read", "prompt.read", "evaluation.read", "governance.read"], description: "只允许查看资源、评估结果和治理状态" }, // 第73天：只读查看者不能执行任何修改操作。
]; // 第73天：结束四个默认角色定义。
export class PermissionService { // 第73天：实现基于租户成员角色的统一权限检查器。
  private readonly roles = new Map(DEFAULT_ROLES.map((role) => [role.id, structuredClone(role)])); // 第73天：按角色标识保存默认RBAC策略。
  check(identity: AuthenticatedIdentity, permission: GovernancePermission): PermissionDecision { // 第73天：检查认证用户是否拥有目标标准权限。
    const roles = identity.membership.roleIds.map((id) => this.roles.get(id)).filter((role): role is Role => Boolean(role)); // 第73天：解析当前成员关系绑定的全部有效角色。
    const permissions = [...new Set(roles.flatMap((role) => role.permissions))]; // 第73天：合并角色权限并去重形成安全上下文权限集合。
    const allowed = permissions.includes("*") || permissions.includes(permission); // 第73天：管理员通配符或明确权限任一命中即允许访问。
    return { allowed, permission, roles: roles.map((role) => structuredClone(role)), permissions, reason: allowed ? `角色 ${roles.map((role) => role.name).join("、")} 允许 ${permission}` : `角色 ${roles.map((role) => role.name).join("、") || "未绑定"} 不允许 ${permission}` }; // 第73天：返回包含角色、权限和中文解释的判定结果。
  } // 第73天：结束标准权限检查方法。
  listRoles(): Role[] { return Array.from(this.roles.values()).map((role) => structuredClone(role)); } // 第73天：列出全部角色和权限副本供权限浏览器展示。
} // 第73天：结束RBAC权限服务实现。
