import type { QuotaDecision, RequestedUsage, TenantPlan, TenantQuota, TenantUsage } from "@/lib/governance/types"; // 第73天：引入租户计划、配额、用量和判定类型。
export const PLAN_QUOTAS: Record<TenantPlan, TenantQuota> = { free: { dailyTokens: 10000, monthlyCost: 10, maxWorkflow: 5, maxKnowledgeSize: 1000 }, pro: { dailyTokens: 100000, monthlyCost: 200, maxWorkflow: 50, maxKnowledgeSize: 100000 }, enterprise: { dailyTokens: 1000000, monthlyCost: 5000, maxWorkflow: 500, maxKnowledgeSize: 10000000 } }; // 第73天：定义免费版、专业版和企业版默认租户配额。
const EMPTY_USAGE: TenantUsage = { dailyTokens: 0, monthlyCost: 0, workflowCount: 0, knowledgeSize: 0 }; // 第73天：定义新租户四项用量的零值模板。
export class QuotaManager { // 第73天：实现租户级令牌、成本、工作流和知识容量配额管理器。
  private readonly quotas = new Map<string, TenantQuota>(); // 第73天：按租户标识保存当前生效配额。
  private readonly usage = new Map<string, TenantUsage>(); // 第73天：按租户标识保存当前累计用量。
  initializeTenant(tenantId: string, plan: TenantPlan): void { this.quotas.set(tenantId, structuredClone(PLAN_QUOTAS[plan])); this.usage.set(tenantId, structuredClone(EMPTY_USAGE)); } // 第73天：按照租户套餐初始化配额和零用量。
  setQuota(tenantId: string, quota: TenantQuota): void { this.quotas.set(tenantId, structuredClone(quota)); if (!this.usage.has(tenantId)) this.usage.set(tenantId, structuredClone(EMPTY_USAGE)); } // 第73天：允许企业策略或安全测试覆盖指定租户配额。
  setUsage(tenantId: string, usage: TenantUsage): void { this.usage.set(tenantId, structuredClone(usage)); } // 第73天：设置租户累计用量用于账单同步和确定性测试。
  getQuota(tenantId: string): TenantQuota { const quota = this.quotas.get(tenantId); if (!quota) throw new Error(`租户配额不存在：${tenantId}`); return structuredClone(quota); } // 第73天：读取指定租户当前生效配额副本。
  getUsage(tenantId: string): TenantUsage { return structuredClone(this.usage.get(tenantId) ?? EMPTY_USAGE); } // 第73天：读取指定租户当前累计用量副本。
  check(tenantId: string, requested: RequestedUsage = {}): QuotaDecision[] { // 第73天：在高成本操作执行前检查四项租户配额。
    const quota = this.getQuota(tenantId); // 第73天：读取当前租户限制值。
    const usage = this.getUsage(tenantId); // 第73天：读取当前租户累计值。
    const specs = [{ dimension: "dailyTokens" as const, current: usage.dailyTokens, requested: requested.dailyTokens ?? 0, limit: quota.dailyTokens }, { dimension: "monthlyCost" as const, current: usage.monthlyCost, requested: requested.monthlyCost ?? 0, limit: quota.monthlyCost }, { dimension: "maxWorkflow" as const, current: usage.workflowCount, requested: requested.workflowCount ?? 0, limit: quota.maxWorkflow }, { dimension: "maxKnowledgeSize" as const, current: usage.knowledgeSize, requested: requested.knowledgeSize ?? 0, limit: quota.maxKnowledgeSize }]; // 第73天：建立用量字段到配额字段的统一检查映射。
    return specs.map((item) => ({ allowed: item.current + item.requested <= item.limit, dimension: item.dimension, current: item.current, requested: item.requested, limit: item.limit, remaining: Math.max(0, item.limit - item.current), reason: item.current + item.requested <= item.limit ? `${item.dimension} 配额充足` : `${item.dimension} 将从 ${item.current} 增加 ${item.requested} 并超过上限 ${item.limit}` })); // 第73天：返回每个维度的允许状态、剩余额度和中文原因。
  } // 第73天：结束租户配额预检查方法。
  consume(tenantId: string, requested: RequestedUsage = {}): QuotaDecision[] { // 第73天：在业务动作成功后原子累加本次租户用量。
    const decisions = this.check(tenantId, requested); // 第73天：写入前再次检查全部配额限制。
    if (decisions.some((item) => !item.allowed)) return decisions; // 第73天：任一维度超限时拒绝写入全部用量。
    const current = this.getUsage(tenantId); // 第73天：读取当前累计用量准备合并增量。
    this.usage.set(tenantId, { dailyTokens: current.dailyTokens + (requested.dailyTokens ?? 0), monthlyCost: Number((current.monthlyCost + (requested.monthlyCost ?? 0)).toFixed(6)), workflowCount: current.workflowCount + (requested.workflowCount ?? 0), knowledgeSize: current.knowledgeSize + (requested.knowledgeSize ?? 0) }); // 第73天：累加令牌、成本、工作流和知识容量用量。
    return decisions; // 第73天：返回成功写入前的配额判定证据。
  } // 第73天：结束租户用量消费方法。
} // 第73天：结束租户配额管理器实现。
