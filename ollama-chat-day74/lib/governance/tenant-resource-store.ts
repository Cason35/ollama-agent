import { randomUUID } from "node:crypto"; // 第73天：引入UUID生成器创建租户资源标识。
import type { GovernedResource, GovernedResourceType, OwnerContext } from "@/lib/governance/types"; // 第73天：引入治理资源类型和所有者上下文类型。
export class TenantResourceStore { // 第73天：实现所有查询自动附加租户过滤条件的资源存储。
  private readonly resources = new Map<string, GovernedResource>(); // 第73天：按全局资源标识保存带租户归属的核心资源。
  create(input: { id?: string; type: GovernedResourceType; name: string; ownerContext: OwnerContext; size?: number; metadata?: Record<string, unknown>; createdAt?: number }): GovernedResource { // 第73天：创建必须携带tenantId和createdBy的资源。
    const createdAt = input.createdAt ?? Date.now(); // 第73天：读取调用方时间或使用当前时间。
    const resource: GovernedResource = { id: input.id?.trim() || `${input.type}_${randomUUID()}`, type: input.type, name: input.name.trim(), ownerContext: structuredClone(input.ownerContext), size: Math.max(0, input.size ?? 0), metadata: structuredClone(input.metadata ?? {}), createdAt, updatedAt: createdAt }; // 第73天：组装包含归属、容量和元数据的资源记录。
    if (this.resources.has(resource.id)) throw new Error(`资源已存在：${resource.id}`); // 第73天：拒绝重复资源标识覆盖其他租户数据。
    this.resources.set(resource.id, structuredClone(resource)); // 第73天：保存资源防御性副本。
    return structuredClone(resource); // 第73天：返回创建完成的资源副本。
  } // 第73天：结束租户资源创建方法。
  get(tenantId: string, resourceId: string): GovernedResource | undefined { const resource = this.resources.get(resourceId); return resource?.ownerContext.tenantId === tenantId ? structuredClone(resource) : undefined; } // 第73天：按当前租户过滤读取并隐藏其他租户资源是否存在。
  list(tenantId: string, type?: GovernedResourceType): GovernedResource[] { return Array.from(this.resources.values()).filter((item) => item.ownerContext.tenantId === tenantId && (!type || item.type === type)).map((item) => structuredClone(item)); } // 第73天：自动添加tenantId过滤并按需筛选资源类型。
  listAll(): GovernedResource[] { return Array.from(this.resources.values()).map((item) => structuredClone(item)); } // 第73天：仅为平台治理总览提供跨租户资源副本。
  delete(tenantId: string, resourceId: string): GovernedResource | undefined { const resource = this.get(tenantId, resourceId); if (!resource) return undefined; this.resources.delete(resourceId); return resource; } // 第73天：只允许删除当前租户可见资源并返回删除前副本。
  searchKnowledge(tenantId: string, query: string): GovernedResource[] { const normalized = query.trim().toLowerCase(); return this.list(tenantId).filter((item) => ["knowledge", "knowledge_base"].includes(item.type) && (!normalized || `${item.name} ${JSON.stringify(item.metadata)}`.toLowerCase().includes(normalized))); } // 第73天：只在当前租户知识资源内执行名称和元数据搜索。
} // 第73天：结束租户隔离资源存储实现。
