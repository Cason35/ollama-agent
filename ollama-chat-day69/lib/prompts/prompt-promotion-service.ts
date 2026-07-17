import { PromptRegistry } from "@/lib/prompts/prompt-registry"; // 第67天：引入深化后的生产提示词注册表。
import { evaluatePromptQualityGate } from "@/lib/prompts/production-prompt-quality"; // 第67天：引入发布前质量门禁评估函数。
import type { PromptAuditAction, PromptAuditLog, PromptPromotionEvidence, PromptQualityGate, ProductionPrompt, ProductionPromptStatus } from "@/lib/prompts/production-prompt-types"; // 第67天：引入晋级、审计和生产提示词类型。

export class PromptPromotionService { // 第67天：实现生产提示词测试、审批、晋级、回滚、归档和审计服务。
  private readonly audits: PromptAuditLog[] = []; // 第67天：保存进程内提示词生命周期审计日志。
  private sequence = 0; // 第67天：保存审计日志递增序号以保证标识唯一。

  constructor(private readonly registry: PromptRegistry) {} // 第67天：注入生产提示词注册表作为生命周期状态来源。

  submitForTesting(agentId: string, version: string, operator = "day67-operator"): ProductionPrompt { // 第67天：实现草稿提交测试动作。
    const target = this.requirePrompt(agentId, version); // 第67天：读取并校验目标生产提示词版本。
    if (target.status !== "draft") throw new Error(`只有 draft 版本可以提交测试，当前状态：${target.status}`); // 第67天：阻止非法生命周期跳转。
    const updated = this.registry.setProductionStatus(agentId, version, "testing"); // 第67天：把目标版本切换为测试中状态。
    this.record("submit-testing", target, updated.status, operator, "提交生产提示词实验与质量评估"); // 第67天：记录提交测试审计日志。
    return updated; // 第67天：返回测试中生产提示词版本。
  } // 第67天：结束草稿提交测试动作。

  approve(agentId: string, version: string, evidence: PromptPromotionEvidence, operator = "day67-approver"): { prompt: ProductionPrompt; gate: PromptQualityGate } { // 第67天：实现测试版本质量审批动作。
    const target = this.requirePrompt(agentId, version); // 第67天：读取待审批生产提示词版本。
    if (target.status !== "testing") throw new Error(`只有 testing 版本可以审批，当前状态：${target.status}`); // 第67天：要求先完成测试阶段再进入审批。
    const gate = evaluatePromptQualityGate(evidence); // 第67天：执行正确性、相关性、成本、延迟、回归和样本量门禁。
    if (!gate.passed) throw new Error(`Quality Gate 未通过：${gate.failureReasons.join("；")}`); // 第67天：门禁失败时禁止进入批准状态。
    const updated = this.registry.setProductionStatus(agentId, version, "approved"); // 第67天：把通过质量门禁的版本切换为已批准。
    this.record("approve", target, updated.status, operator, "全部 Quality Gate 检查通过"); // 第67天：记录质量审批审计日志。
    return { prompt: updated, gate }; // 第67天：返回已批准版本和质量门禁证据。
  } // 第67天：结束生产提示词审批动作。

  promote(agentId: string, version: string, evidence: PromptPromotionEvidence, operator = "day67-release-manager"): { prompt: ProductionPrompt; gate: PromptQualityGate } { // 第67天：实现生产提示词发布晋级动作。
    const target = this.requirePrompt(agentId, version); // 第67天：读取待晋级生产提示词版本。
    if (target.status !== "approved") throw new Error(`只有 approved 版本可以晋级，当前状态：${target.status}`); // 第67天：强制执行 draft 到 testing、approved 再到 active 的发布流程。
    const gate = evaluatePromptQualityGate(evidence); // 第67天：上线前再次执行发布质量门禁。
    if (!gate.passed) throw new Error(`Quality Gate 未通过：${gate.failureReasons.join("；")}`); // 第67天：门禁失败时禁止生产发布。
    const updated = this.registry.setProductionStatus(agentId, version, "active"); // 第67天：启用候选版本并自动弃用旧 active 版本。
    this.record("promote", target, updated.status, operator, "版本已通过质量门禁并发布为 active"); // 第67天：记录生产发布审计日志。
    return { prompt: updated, gate }; // 第67天：返回已启用版本和发布门禁结果。
  } // 第67天：结束生产提示词发布晋级动作。

  rollback(agentId: string, version: string, operator = "day67-release-manager"): ProductionPrompt { // 第67天：实现生产提示词快速回滚动作。
    const target = this.requirePrompt(agentId, version); // 第67天：读取希望重新启用的历史版本。
    if (target.status === "active") throw new Error("目标版本已经是 active，无需回滚"); // 第67天：避免对当前启用版本执行无意义回滚。
    const updated = this.registry.setProductionStatus(agentId, version, "active"); // 第67天：重新启用历史版本并自动弃用当前线上版本。
    this.record("rollback", target, updated.status, operator, "发生质量回退，重新启用已验证历史版本"); // 第67天：记录回滚审计日志和原因。
    return updated; // 第67天：返回回滚后启用的生产提示词。
  } // 第67天：结束生产提示词快速回滚动作。

  archive(agentId: string, version: string, operator = "day67-operator"): ProductionPrompt { // 第67天：实现生产提示词归档动作。
    const target = this.requirePrompt(agentId, version); // 第67天：读取待归档生产提示词版本。
    const updated = this.registry.setProductionStatus(agentId, version, "deprecated"); // 第67天：使用 deprecated 状态保留历史版本并禁止运行时发现。
    this.record("archive", target, updated.status, operator, "版本退出实验和发布流程并保留审计记录"); // 第67天：记录生产提示词归档审计日志。
    return updated; // 第67天：返回已弃用生产提示词版本。
  } // 第67天：结束生产提示词归档动作。

  listAudits(): PromptAuditLog[] { // 第67天：定义读取生产提示词审计日志的方法。
    return this.audits.map((audit) => ({ ...audit })); // 第67天：返回防御性复制后的审计记录列表。
  } // 第67天：结束生产提示词审计日志读取方法。

  private requirePrompt(agentId: string, version: string): ProductionPrompt { // 第67天：定义生命周期动作目标版本校验函数。
    const prompt = this.registry.getProductionVersion(agentId, version); // 第67天：按智能体和版本读取生产提示词。
    if (!prompt) throw new Error(`ProductionPrompt 不存在：${agentId}.${version}`); // 第67天：目标版本不存在时抛出明确错误。
    return prompt; // 第67天：返回已验证存在的生产提示词。
  } // 第67天：结束生命周期动作目标版本校验函数。

  private record(action: PromptAuditAction, prompt: ProductionPrompt, toStatus: ProductionPromptStatus, operator: string, reason: string): void { // 第67天：定义写入生命周期审计日志的方法。
    this.sequence += 1; // 第67天：递增审计序号保证同毫秒内标识唯一。
    this.audits.unshift({ id: `prompt-audit-${Date.now()}-${this.sequence}`, action, promptId: prompt.id, fromStatus: prompt.status, toStatus, operator, reason, createdAt: Date.now() }); // 第67天：把最新审计记录放在列表开头供运营控制台展示。
  } // 第67天：结束生命周期审计日志写入方法。
} // 第67天：结束 PromptPromotionService 实现。
