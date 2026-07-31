import { getBackupManager } from "@/lib/production/backup-manager"; // 第74天：引入备份管理器读取最近备份任务。
import { loadEnvironmentConfig, validateEnvironmentConfig } from "@/lib/production/environment-config"; // 第74天：引入生产配置加载与校验函数。
import { getFeatureFlagManager } from "@/lib/production/feature-flag-manager"; // 第74天：引入共享功能开关管理器。
import { productionHealthChecker } from "@/lib/production/health-checker"; // 第74天：引入共享生产健康检查器。
import { createPlatformRelease } from "@/lib/production/release-manager"; // 第74天：引入统一发布版本生成函数。
import { getStartupValidationSnapshot } from "@/lib/production/startup-validator"; // 第74天：引入启动校验状态读取函数。
import { productionEvaluationPlatform } from "@/lib/evaluation/production-evaluation-platform"; // 第74天：引入 Day71 生产评估平台聚合 AI 质量指标。
import { productionGovernancePlatform } from "@/lib/governance/production-governance-platform"; // 第74天：引入 Day73 治理平台聚合用户、租户和安全指标。
import { productionObservabilityPlatform } from "@/lib/observability/production-observability-platform"; // 第74天：引入 Day72 可观测平台聚合请求、成本和延迟指标。
import type { FeatureFlagMode, ProductionSnapshot } from "@/lib/production/types"; // 第74天：引入生产快照与功能开关模式类型。

export class ProductionRuntime { // 第74天：定义整合配置、部署、健康、版本、功能开关和历史平台指标的生产运行时。
  async snapshot(): Promise<ProductionSnapshot> { // 第74天：生成 Production Dashboard 完整快照。
    const environment = loadEnvironmentConfig(); // 第74天：读取不含真实密钥的生产环境配置。
    const validation = validateEnvironmentConfig(environment); // 第74天：校验配置、生产地址和密钥引用。
    const [health, governance, observability, evaluation] = await Promise.all([productionHealthChecker.checkAll(), productionGovernancePlatform.getSnapshot(), productionObservabilityPlatform.getSnapshot(), productionEvaluationPlatform.getSnapshot()]); // 第74天：并发聚合基础设施、治理、可观测和评估平台快照。
    const release = createPlatformRelease(environment); // 第74天：生成统一发布版本快照。
    return { // 第74天：返回完整生产平台快照。
      environment, // 第74天：写入脱敏环境配置。
      validation, // 第74天：写入配置校验结果。
      health, // 第74天：写入基础设施健康状态。
      startup: getStartupValidationSnapshot(), // 第74天：写入启动校验状态。
      release, // 第74天：写入平台发布版本。
      featureFlags: getFeatureFlagManager().list(), // 第74天：写入全部功能开关。
      backupJobs: getBackupManager().listJobs(), // 第74天：写入最近备份任务。
      overview: { users: governance.overview.activeUsers, tenants: governance.overview.tenants, requests: observability.overview.requests, cost: observability.overview.cost, errors: observability.overview.errors, averageLatency: observability.overview.averageLatency, p95Latency: observability.overview.p95Latency }, // 第74天：聚合生产平台核心总览指标。
      aiQuality: { evaluationScore: evaluation.metrics.avgScore, badCases: evaluation.metrics.badCaseCount, regressions: evaluation.metrics.regressionCount, qualityGateFailures: evaluation.metrics.qualityGateFailCount, promptVersion: "production-prompt-v2" }, // 第74天：聚合 AI 质量与提示词版本指标。
      security: { auditEvents: governance.overview.auditLogs, permissionDenied: governance.overview.permissionDenials, quotaExceeded: governance.overview.quotaExceeded, productionReady: governance.overview.productionReady && health.status === "healthy" }, // 第74天：聚合生产安全治理指标。
      generatedAt: Date.now(), // 第74天：写入快照生成时间。
    }; // 第74天：结束生产平台快照返回对象。
  } // 第74天：结束生产平台快照生成方法。
  updateFeatureFlag(key: string, mode: FeatureFlagMode, rolloutPercentage?: number) { // 第74天：定义生产仪表盘更新功能开关的方法。
    return getFeatureFlagManager().update(key, { mode, rolloutPercentage }); // 第74天：委托共享功能开关管理器执行更新。
  } // 第74天：结束生产功能开关更新方法。
} // 第74天：结束生产运行时类。

const globalForProduction = globalThis as typeof globalThis & { __day74ProductionRuntime?: ProductionRuntime }; // 第74天：扩展全局对象避免 Next.js 热重载重复创建生产运行时。
export function getProductionRuntime(): ProductionRuntime { // 第74天：定义读取共享生产运行时的方法。
  globalForProduction.__day74ProductionRuntime ??= new ProductionRuntime(); // 第74天：首次访问时创建生产运行时。
  return globalForProduction.__day74ProductionRuntime; // 第74天：返回进程级共享生产运行时。
} // 第74天：结束共享生产运行时读取函数。
