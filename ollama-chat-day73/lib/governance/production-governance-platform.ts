import { seedDay73GovernanceScenarios } from "@/lib/governance/governance-fixtures"; // 第73天：引入六个生产安全演示场景初始化平台数据。
import { GovernanceRuntime } from "@/lib/governance/governance-runtime"; // 第73天：引入智能体平台治理核心运行时。
import type { GatewayRequest, GatewayResult, GovernanceSnapshot } from "@/lib/governance/types"; // 第73天：引入网关请求、响应和治理快照类型。
export class ProductionGovernancePlatform { // 第73天：提供API和治理仪表盘复用的进程级平台外观。
  readonly runtime = new GovernanceRuntime(); // 第73天：创建身份、权限、配额、审计、注册和可观测一体化运行时。
  private seeded?: Promise<void>; // 第73天：保存幂等初始化任务避免并发请求重复创建演示数据。
  async ensureSeeded(): Promise<void> { if (!this.seeded) this.seeded = seedDay73GovernanceScenarios(this.runtime).then(() => undefined); await this.seeded; } // 第73天：首次访问时执行六个演示场景并在后续请求复用结果。
  async getSnapshot(): Promise<GovernanceSnapshot> { await this.ensureSeeded(); return this.runtime.getSnapshot(); } // 第73天：返回已经包含生产安全证据的完整治理快照。
  async execute(request: GatewayRequest): Promise<GatewayResult> { await this.ensureSeeded(); return this.runtime.execute(request); } // 第73天：通过统一生产接口网关执行外部治理动作。
} // 第73天：结束生产治理平台外观实现。
export const productionGovernancePlatform = new ProductionGovernancePlatform(); // 第73天：导出进程级平台单例供/api/v1治理接口复用。
