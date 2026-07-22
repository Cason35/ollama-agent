import { seedDay72ObservabilityScenarios } from "@/lib/observability/observability-fixtures"; // 第72天：引入五个生产可观测验收演示场景。
import { ObservabilityRuntime } from "@/lib/observability/observability-runtime"; // 第72天：引入生产可观测核心运行时。
import type { Alert, ObservabilitySnapshot, TraceQueryResult } from "@/lib/observability/types"; // 第72天：引入告警、平台快照和链路查询结果类型。

export class ProductionObservabilityPlatform { // 第72天：组合统一日志、指标、链路、错误、告警、采样和仪表盘演示数据。
  readonly runtime = new ObservabilityRuntime(); // 第72天：创建继承RuntimeContext、EventBus和UnifiedRegistry的可观测运行时。
  private seedPromise?: Promise<void>; // 第72天：保存幂等演示初始化任务避免并发接口重复创建场景。

  async ensureDemoData(): Promise<void> { // 第72天：幂等执行任务清单要求的五个可观测演示场景。
    this.seedPromise ??= seedDay72ObservabilityScenarios(this.runtime).then(() => undefined); // 第72天：首次调用创建演示数据后续调用复用同一任务。
    await this.seedPromise; // 第72天：等待链路、指标、日志、错误和告警全部准备完成。
  } // 第72天：结束可观测演示数据幂等初始化方法。

  async getSnapshot(): Promise<ObservabilitySnapshot> { await this.ensureDemoData(); return this.runtime.getSnapshot(); } // 第72天：返回Observability Dashboard所需完整平台快照。
  async queryTrace(traceId: string): Promise<TraceQueryResult> { await this.ensureDemoData(); return this.runtime.queryTrace(traceId); } // 第72天：按链路标识返回跨度树、日志和指标根因诊断结果。
  async resolveAlert(alertId: string): Promise<{ alert?: Alert; snapshot: ObservabilitySnapshot }> { await this.ensureDemoData(); const alert = this.runtime.resolveAlert(alertId); return { alert, snapshot: this.runtime.getSnapshot() }; } // 第72天：恢复活动告警并返回更新后的告警中心快照。
} // 第72天：结束生产可观测平台组合实现。

export const productionObservabilityPlatform = new ProductionObservabilityPlatform(); // 第72天：导出进程级生产可观测平台单例供API Route Handler复用。
