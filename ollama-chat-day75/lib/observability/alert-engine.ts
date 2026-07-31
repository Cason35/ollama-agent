import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建活动告警唯一标识。
import type { Alert, AlertOperator, AlertRule, ErrorEvent, LogRecord, MetricAggregate } from "@/lib/observability/types"; // 第72天：引入告警、规则以及三类输入信号类型。

function compare(actual: number, operator: AlertOperator, threshold: number): boolean { // 第72天：定义告警规则数值比较函数。
  if (operator === ">") return actual > threshold; // 第72天：执行严格大于阈值判断。
  if (operator === ">=") return actual >= threshold; // 第72天：执行大于或等于阈值判断。
  if (operator === "<") return actual < threshold; // 第72天：执行严格小于阈值判断。
  if (operator === "<=") return actual <= threshold; // 第72天：执行小于或等于阈值判断。
  return actual === threshold; // 第72天：执行等于阈值判断。
} // 第72天：结束告警规则数值比较函数。

export class AlertEngine { // 第72天：实现读取指标、日志和错误事件的生产告警引擎。
  private readonly rules = new Map<string, AlertRule>(); // 第72天：按规则标识保存可动态扩展的告警规则。
  private readonly alerts: Alert[] = []; // 第72天：保存活动告警和已经恢复的告警历史。

  registerRule(rule: AlertRule): void { // 第72天：注册或更新一条告警规则。
    if (!rule.id.trim() || !rule.name.trim() || !rule.target.trim()) throw new Error("AlertRule 的 id、name 和 target 不能为空"); // 第72天：阻止缺少身份和目标的规则进入引擎。
    this.rules.set(rule.id, structuredClone(rule)); // 第72天：保存规则防御性副本并支持幂等更新。
  } // 第72天：结束告警规则注册方法。

  evaluateMetric(metric: MetricAggregate, timestamp = Date.now()): Alert[] { // 第72天：使用最新指标聚合结果计算所有匹配规则。
    return this.evaluate(this.listRules().filter((rule) => rule.signal === "metric" && rule.target === metric.name), (rule) => metric[rule.aggregation], metric.traceIds, timestamp); // 第72天：读取规则指定的最新值、平均值、百分位或总和并触发告警。
  } // 第72天：结束指标信号告警计算方法。

  evaluateError(error: ErrorEvent, timestamp = Date.now()): Alert[] { // 第72天：使用自动聚合错误次数计算所有匹配规则。
    return this.evaluate(this.listRules().filter((rule) => rule.signal === "error" && (rule.target === "*" || rule.target === error.errorType)), () => error.count, error.traceIds, timestamp); // 第72天：按错误类型或通配规则比较累计出现次数。
  } // 第72天：结束错误信号告警计算方法。

  evaluateLog(log: LogRecord, matchingCount: number, timestamp = Date.now()): Alert[] { // 第72天：使用指定来源或全部日志数量计算匹配规则。
    return this.evaluate(this.listRules().filter((rule) => rule.signal === "log" && (rule.target === "*" || rule.target === log.source)), () => matchingCount, log.traceId ? [log.traceId] : [], timestamp); // 第72天：按结构化日志来源和数量触发日志规则。
  } // 第72天：结束结构化日志信号告警计算方法。

  resolve(alertId: string, resolvedAt = Date.now()): Alert | undefined { // 第72天：手动恢复一条活动告警并保留历史。
    const alert = this.alerts.find((item) => item.id === alertId); // 第72天：查找需要恢复的告警记录。
    if (!alert || alert.status === "resolved") return alert ? structuredClone(alert) : undefined; // 第72天：不存在或已经恢复时保持幂等返回。
    alert.status = "resolved"; // 第72天：把告警状态切换为已恢复。
    alert.resolvedAt = resolvedAt; // 第72天：记录告警恢复时间。
    return structuredClone(alert); // 第72天：返回恢复后的告警防御性副本。
  } // 第72天：结束告警恢复方法。

  listRules(): AlertRule[] { return Array.from(this.rules.values()).map((rule) => structuredClone(rule)); } // 第72天：返回全部告警规则防御性快照。
  listAlerts(): Alert[] { return this.alerts.map((alert) => structuredClone(alert)).sort((left, right) => right.triggeredAt - left.triggeredAt); } // 第72天：返回按触发时间倒序排列的活动和历史告警。

  private evaluate(rules: AlertRule[], actualValue: (rule: AlertRule) => number, traceIds: string[], timestamp: number): Alert[] { // 第72天：定义三类信号共享的规则评估与去重逻辑。
    const created: Alert[] = []; // 第72天：收集本轮新触发的告警用于发布 EventBus 事件。
    for (const rule of rules.filter((item) => item.enabled)) { // 第72天：逐个计算当前启用且目标匹配的告警规则。
      const actual = actualValue(rule); // 第72天：读取当前规则指定的真实观测值。
      const active = this.alerts.find((alert) => alert.ruleId === rule.id && alert.status === "active"); // 第72天：检查同一规则是否已有活动告警避免重复轰炸。
      if (!compare(actual, rule.operator, rule.threshold)) { if (active) this.resolve(active.id, timestamp); continue; } // 第72天：信号恢复正常时自动恢复已有活动告警。
      if (active) { active.actualValue = actual; active.traceIds = Array.from(new Set([...active.traceIds, ...traceIds])); continue; } // 第72天：已有活动告警时只更新观测值和关联链路。
      const alert: Alert = { id: `alert_${randomUUID()}`, ruleId: rule.id, title: rule.name, severity: rule.severity, status: "active", actualValue: actual, threshold: rule.threshold, traceIds: Array.from(new Set(traceIds)), message: `${rule.description}，当前值 ${actual} ${rule.operator} 阈值 ${rule.threshold}`, triggeredAt: timestamp }; // 第72天：创建包含真实值、阈值和链路入口的新告警。
      this.alerts.push(alert); // 第72天：保存新告警供活动告警和历史告警中心展示。
      created.push(structuredClone(alert)); // 第72天：收集防御性副本供运行时发布告警事件。
    } // 第72天：结束全部匹配告警规则计算。
    return created; // 第72天：返回本轮新触发的告警列表。
  } // 第72天：结束共享告警规则评估逻辑。
} // 第72天：结束生产告警引擎实现。
