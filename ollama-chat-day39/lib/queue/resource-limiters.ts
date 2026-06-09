import type { BlockedReason, Job, RateLimitMetrics, RateLimitUsageItem, ResourceType, ResourceUsageItem } from "@/lib/queue/queue-types"; // 引入第35天资源控制所需类型。

export const RESOURCE_TYPES: ResourceType[] = ["llm", "embedding", "database", "workflow", "tool"]; // 定义所有资源类型，方便看板稳定展示。
const DEFAULT_RESOURCE_LIMITS: Record<ResourceType, number> = { llm: 3, embedding: 2, database: 5, workflow: 3, tool: 4 }; // 定义每类资源最大并发数。
const DEFAULT_RATE_LIMITS: Record<ResourceType, number> = { llm: 2, embedding: 2, database: 5, workflow: 3, tool: 5 }; // 定义每类资源每秒最大放行次数。
const DEFAULT_RATE_WINDOW_MS = 1000; // 定义速率限制窗口为 1 秒。

export function inferResourceType(job: Pick<Job, "type" | "resourceType">): ResourceType { // 根据任务类型推断资源类型。
  if (job.resourceType) return job.resourceType; // 如果任务显式指定资源类型，则优先使用显式值。
  if (job.type === "embedding") return "embedding"; // embedding 任务使用 embedding 资源。
  if (job.type === "reindex") return "embedding"; // reindex 主要消耗 embedding 资源。
  if (job.type === "workflow") return "workflow"; // workflow 任务使用 workflow 资源。
  if (job.type === "chat") return "llm"; // chat 任务使用大语言模型资源。
  if (job.type === "retrieval") return "database"; // retrieval 任务模拟数据库和检索资源。
  return "tool"; // 其他教学任务归入 tool 资源。
} // 结束 inferResourceType。

export class ResourceLimiter { // 定义资源并发限制器。
  private readonly limits = new Map<ResourceType, number>(); // 保存每类资源的最大并发数。
  private readonly active = new Map<ResourceType, number>(); // 保存每类资源当前占用数。
  constructor(limits: Partial<Record<ResourceType, number>> = DEFAULT_RESOURCE_LIMITS) { // 接收可选限制配置。
    RESOURCE_TYPES.forEach((resourceType) => this.limits.set(resourceType, limits[resourceType] ?? Infinity)); // 初始化所有资源并发上限。
  } // 结束构造函数。
  canRun(resourceType: ResourceType): boolean { // 判断某类资源是否还能运行新任务。
    const limit = this.limits.get(resourceType) ?? Infinity; // 读取资源上限，未配置视为无限。
    const current = this.active.get(resourceType) ?? 0; // 读取当前资源占用数。
    return current < limit; // 当前占用小于上限时允许运行。
  } // 结束 canRun。
  acquire(resourceType: ResourceType): void { // 占用一个资源额度。
    const current = this.active.get(resourceType) ?? 0; // 读取当前资源占用数。
    this.active.set(resourceType, current + 1); // 将该资源占用数加一。
  } // 结束 acquire。
  release(resourceType: ResourceType): void { // 释放一个资源额度。
    const current = this.active.get(resourceType) ?? 0; // 读取当前资源占用数。
    this.active.set(resourceType, Math.max(0, current - 1)); // 将该资源占用数减一且不低于零。
  } // 结束 release。
  snapshot(): ResourceUsageItem[] { // 读取资源占用快照。
    return RESOURCE_TYPES.map((resourceType) => { // 遍历所有资源类型生成稳定顺序。
      const limit = this.limits.get(resourceType) ?? Infinity; // 读取资源上限。
      return { resourceType, active: this.active.get(resourceType) ?? 0, limit: Number.isFinite(limit) ? limit : "Infinity" }; // 返回单项资源占用。
    }); // 结束 map。
  } // 结束 snapshot。
} // 结束 ResourceLimiter。

export class RateLimiter { // 定义滑动窗口速率限制器。
  private readonly events = new Map<ResourceType, number[]>(); // 保存每类资源最近放行时间戳。
  constructor(private readonly limits: Partial<Record<ResourceType, number>> = DEFAULT_RATE_LIMITS, private readonly windowMs = DEFAULT_RATE_WINDOW_MS) {} // 保存限制配置和窗口大小。
  allow(resourceType: ResourceType, now = Date.now()): boolean { // 判断某类资源当前是否通过速率限制。
    const limit = this.limits[resourceType] ?? Infinity; // 读取资源速率上限，未配置视为无限。
    const recent = (this.events.get(resourceType) ?? []).filter((at) => now - at < this.windowMs); // 清理窗口外的旧事件。
    if (recent.length >= limit) { // 如果窗口内次数已经达到上限。
      this.events.set(resourceType, recent); // 保存清理后的事件列表。
      return false; // 拒绝本次认领。
    } // 结束达到上限判断。
    recent.push(now); // 记录本次通过时间。
    this.events.set(resourceType, recent); // 保存更新后的事件列表。
    return true; // 允许本次认领。
  } // 结束 allow。
  snapshot(now = Date.now()): RateLimitUsageItem[] { // 读取速率窗口占用快照。
    return RESOURCE_TYPES.map((resourceType) => { // 遍历所有资源类型生成稳定顺序。
      const limit = this.limits[resourceType] ?? Infinity; // 读取该资源速率上限。
      const recent = (this.events.get(resourceType) ?? []).filter((at) => now - at < this.windowMs); // 只保留当前窗口内事件。
      this.events.set(resourceType, recent); // 回写清理后的窗口事件。
      return { resourceType, used: recent.length, limit: Number.isFinite(limit) ? limit : "Infinity", windowMs: this.windowMs }; // 返回单项速率占用。
    }); // 结束 map。
  } // 结束 snapshot。
} // 结束 RateLimiter。

export class LimitMetricsRecorder { // 定义限制器指标记录器。
  private readonly metrics: RateLimitMetrics = { allowedCount: 0, blockedCount: 0, blockedByResource: {}, blockedByRate: {} }; // 保存允许和阻塞计数。
  recordAllowed(): void { // 记录一次成功认领。
    this.metrics.allowedCount += 1; // 增加允许计数。
  } // 结束 recordAllowed。
  recordBlocked(resourceType: ResourceType, reason: BlockedReason): void { // 记录一次阻塞。
    this.metrics.blockedCount += 1; // 增加阻塞总数。
    const target = reason === "resource_limit" ? this.metrics.blockedByResource : this.metrics.blockedByRate; // 选择对应维度的统计对象。
    target[resourceType] = (target[resourceType] ?? 0) + 1; // 增加该资源类型的阻塞次数。
  } // 结束 recordBlocked。
  snapshot(): RateLimitMetrics { // 返回指标快照。
    return { allowedCount: this.metrics.allowedCount, blockedCount: this.metrics.blockedCount, blockedByResource: { ...this.metrics.blockedByResource }, blockedByRate: { ...this.metrics.blockedByRate } }; // 返回防突变副本。
  } // 结束 snapshot。
} // 结束 LimitMetricsRecorder。
