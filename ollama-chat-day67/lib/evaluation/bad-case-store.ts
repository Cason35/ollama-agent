import type { BadCaseRecord } from "./regression-types"; /* 第46天：引入失败案例记录类型。 */

export interface BadCaseStore { /* 第46天：定义可替换持久层的失败案例仓储接口。 */
  upsert(record: BadCaseRecord): Promise<void>; /* 第46天：新增或更新失败案例。 */
  list(): Promise<BadCaseRecord[]>; /* 第46天：列出全部失败案例。 */
  markRegression(evaluationCaseId: string, fixed: boolean, regressionPassed: boolean): Promise<void>; /* 第46天：更新修复与回归验证状态。 */
} /* 第46天：结束失败案例仓储接口。 */

export class MemoryBadCaseStore implements BadCaseStore { /* 第46天：实现教学项目使用的内存失败案例仓储。 */
  private readonly records = new Map<string, BadCaseRecord>(); /* 第46天：按记录 ID 保存失败案例。 */

  async upsert(record: BadCaseRecord): Promise<void> { /* 第46天：实现失败案例新增或更新。 */
    this.records.set(record.id, { ...record }); /* 第46天：写入记录副本，避免外部直接修改内部状态。 */
  } /* 第46天：结束失败案例新增或更新。 */

  async list(): Promise<BadCaseRecord[]> { /* 第46天：实现失败案例列表读取。 */
    return Array.from(this.records.values()).map((record) => ({ ...record })); /* 第46天：返回记录副本列表。 */
  } /* 第46天：结束失败案例列表读取。 */

  async markRegression(evaluationCaseId: string, fixed: boolean, regressionPassed: boolean): Promise<void> { /* 第46天：实现修复与回归状态更新。 */
    const target = Array.from(this.records.values()).find((record) => record.evaluationCaseId === evaluationCaseId); /* 第46天：按评估案例 ID 查找失败记录。 */
    if (!target) return; /* 第46天：不存在历史记录时保持幂等。 */
    this.records.set(target.id, { ...target, fixed, regressionPassed }); /* 第46天：写入最新修复与回归状态。 */
  } /* 第46天：结束修复与回归状态更新。 */
} /* 第46天：结束内存失败案例仓储。 */

export function createSeedBadCases(): BadCaseRecord[] { /* 第46天：创建数据集中两个历史失败案例的初始记录。 */
  const createdAt = Date.now() - 86_400_000; /* 第46天：使用前一天时间模拟历史失败。 */
  return [ /* 第46天：返回历史失败案例数组。 */
    { id: "bad-record-factual", evaluationCaseId: "bad-factual-arithmetic", failureType: "factual_error", severity: "critical", impactScope: "基础事实问答与计算任务", agentId: "writer", promptVersion: "prompt-v45", traceId: "trace-day45-factual", fixed: false, regressionPassed: false, description: "曾错误返回 2 + 2 = 5。", createdAt }, /* 第46天：定义事实错误历史记录。 */
    { id: "bad-record-rollback", evaluationCaseId: "bad-deploy-rollback", failureType: "omission", severity: "major", impactScope: "生产发布计划", agentId: "planner", promptVersion: "prompt-v45", traceId: "trace-day45-rollback", fixed: false, regressionPassed: false, description: "发布检查清单遗漏回滚预案。", createdAt }, /* 第46天：定义遗漏问题历史记录。 */
  ]; /* 第46天：结束历史失败案例数组。 */
} /* 第46天：结束历史失败案例创建函数。 */
