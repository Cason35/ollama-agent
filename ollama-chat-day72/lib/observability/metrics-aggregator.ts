import { randomUUID } from "node:crypto"; // 第72天：引入 UUID 生成器创建指标记录唯一标识。
import type { MetricAggregate, MetricQuery, MetricRecord } from "@/lib/observability/types"; // 第72天：引入指标明细、查询和聚合结果类型。

type MetricInput = Omit<MetricRecord, "id" | "timestamp" | "labels"> & { labels?: MetricRecord["labels"]; timestamp?: number }; // 第72天：定义记录指标时由聚合器自动补齐的字段。

function round(value: number): number { return Number(value.toFixed(4)); } // 第72天：统一限制指标浮点误差并保留四位小数。

function percentile(values: number[], ratio: number): number { // 第72天：定义直方图百分位计算函数。
  if (values.length === 0) return 0; // 第72天：空样本安全返回零。
  const sorted = [...values].sort((left, right) => left - right); // 第72天：复制并按数值升序排列样本。
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1); // 第72天：使用最近秩算法计算百分位索引。
  return round(sorted[index] ?? 0); // 第72天：返回目标百分位样本并限制浮点误差。
} // 第72天：结束直方图百分位计算函数。

export class MetricsAggregator { // 第72天：实现 Counter、Gauge 和 Histogram 的统一指标聚合器。
  private readonly records: MetricRecord[] = []; // 第72天：保存全部结构化指标采样明细。

  recordMetric(input: MetricInput): MetricRecord { // 第72天：记录一次计数器、瞬时值或直方图样本。
    if (!input.name.trim()) throw new Error("指标 name 不能为空"); // 第72天：阻止没有统一名称的指标写入。
    if (!Number.isFinite(input.value)) throw new Error(`指标 ${input.name} 的 value 必须是有限数字`); // 第72天：阻止无穷大和非数字污染聚合结果。
    if (input.kind === "counter" && input.value < 0) throw new Error(`Counter ${input.name} 不能记录负数`); // 第72天：保证计数器只累计非负增量。
    const record: MetricRecord = { ...input, id: `metric_${randomUUID()}`, name: input.name.trim(), labels: { ...(input.labels ?? {}) }, timestamp: input.timestamp ?? Date.now() }; // 第72天：创建包含来源、标签、链路和时间的统一指标记录。
    this.records.push(record); // 第72天：把指标样本追加到聚合器历史。
    return structuredClone(record); // 第72天：返回防御性副本供观测事件和接口使用。
  } // 第72天：结束统一指标记录方法。

  queryMetric(query: MetricQuery = {}): MetricRecord[] { // 第72天：实现按名称、类型、来源、时间、标签和链路的指标查询。
    return this.records.filter((record) => !query.name || record.name === query.name).filter((record) => !query.kind || record.kind === query.kind).filter((record) => !query.source || record.source === query.source).filter((record) => !query.traceId || record.traceId === query.traceId).filter((record) => query.from === undefined || record.timestamp >= query.from).filter((record) => query.to === undefined || record.timestamp <= query.to).filter((record) => !query.labels || Object.entries(query.labels).every(([key, value]) => record.labels[key] === value)).map((record) => structuredClone(record)); // 第72天：应用全部指标过滤条件并返回防御性副本。
  } // 第72天：结束统一指标明细查询方法。

  aggregate(name: string, query: Omit<MetricQuery, "name"> = {}): MetricAggregate | undefined { // 第72天：聚合指定统一指标并计算平均值和百分位。
    const records = this.queryMetric({ ...query, name }); // 第72天：读取符合额外过滤条件的目标指标样本。
    if (records.length === 0) return undefined; // 第72天：没有任何样本时返回空值。
    const kinds = new Set(records.map((record) => record.kind)); // 第72天：收集样本类型用于检测命名冲突。
    if (kinds.size !== 1) throw new Error(`指标 ${name} 同时使用了多个 MetricKind`); // 第72天：阻止同名指标混用 Counter、Gauge 和 Histogram。
    const values = records.map((record) => record.value); // 第72天：提取全部数值样本用于聚合计算。
    const sum = values.reduce((total, value) => total + value, 0); // 第72天：计算样本总和并支持计数器累计值。
    return { name, kind: records[0].kind, count: records.length, sum: round(sum), latest: round(values.at(-1) ?? 0), average: round(sum / values.length), min: round(Math.min(...values)), max: round(Math.max(...values)), p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), traceIds: Array.from(new Set(records.flatMap((record) => record.traceId ? [record.traceId] : []))), lastUpdatedAt: records.at(-1)?.timestamp ?? 0 }; // 第72天：返回计数、总和、最新值、分布统计和链路关联信息。
  } // 第72天：结束指定指标聚合方法。

  aggregateAll(): MetricAggregate[] { // 第72天：聚合当前平台中的全部统一指标。
    const names = Array.from(new Set(this.records.map((record) => record.name))).sort(); // 第72天：收集并稳定排序全部指标名称。
    return names.flatMap((name) => { const aggregate = this.aggregate(name); return aggregate ? [aggregate] : []; }); // 第72天：逐个生成非空聚合结果。
  } // 第72天：结束全部统一指标聚合方法。
} // 第72天：结束统一指标聚合器实现。
