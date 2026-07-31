import { createHash } from "node:crypto"; // 第74天：引入哈希函数生成稳定灰度分桶。
import type { FeatureFlag, FeatureFlagDecision, FeatureFlagMode } from "@/lib/production/types"; // 第74天：引入功能开关与决策类型。

const DAY74_CREATED_AT = Date.UTC(2026, 6, 21, 0, 0, 0); // 第74天：定义默认功能开关的稳定创建时间。

const DEFAULT_FEATURE_FLAGS: FeatureFlag[] = [ // 第74天：定义任务清单要求的三项默认功能开关。
  { key: "enable_new_rag", name: "New RAG（新版检索增强生成）", description: "按稳定百分比分桶灰度启用新版 RAG 管线。", mode: "gradual", rolloutPercentage: 25, updatedAt: DAY74_CREATED_AT }, // 第74天：默认向百分之二十五主体开放新版 RAG。
  { key: "enable_model_router_v2", name: "Model Router V2（模型路由第二版）", description: "控制第二版模型路由是否进入生产流量。", mode: "disabled", rolloutPercentage: 0, updatedAt: DAY74_CREATED_AT }, // 第74天：默认关闭第二版模型路由。
  { key: "enable_memory_merge", name: "Memory Merge（记忆合并）", description: "控制长期记忆合并能力是否全量启用。", mode: "enabled", rolloutPercentage: 100, updatedAt: DAY74_CREATED_AT }, // 第74天：默认全量启用记忆合并。
]; // 第74天：结束默认功能开关列表。

function cloneFlag(flag: FeatureFlag): FeatureFlag { // 第74天：定义功能开关防御性复制函数。
  return { ...flag }; // 第74天：返回新的功能开关对象。
} // 第74天：结束功能开关复制函数。

export class FeatureFlagManager { // 第74天：定义支持关闭、开启和灰度发布的内存功能开关管理器。
  private readonly flags = new Map<string, FeatureFlag>(); // 第74天：按唯一键保存功能开关。
  constructor(flags: FeatureFlag[] = DEFAULT_FEATURE_FLAGS) { // 第74天：允许测试注入自定义功能开关集合。
    for (const flag of flags) this.flags.set(flag.key, cloneFlag(flag)); // 第74天：逐项保存功能开关防御性副本。
  } // 第74天：结束功能开关管理器构造函数。
  list(): FeatureFlag[] { // 第74天：定义按键排序列出全部功能开关的方法。
    return Array.from(this.flags.values()).map(cloneFlag).sort((left, right) => left.key.localeCompare(right.key)); // 第74天：返回稳定排序的功能开关副本。
  } // 第74天：结束功能开关列表方法。
  get(key: string): FeatureFlag | undefined { // 第74天：定义按键读取单个功能开关的方法。
    const flag = this.flags.get(key); // 第74天：查找目标功能开关。
    return flag ? cloneFlag(flag) : undefined; // 第74天：命中时返回副本，否则返回空值。
  } // 第74天：结束单个功能开关读取方法。
  update(key: string, input: { mode: FeatureFlagMode; rolloutPercentage?: number }): FeatureFlag { // 第74天：定义更新功能开关模式与灰度比例的方法。
    const current = this.flags.get(key); // 第74天：读取目标功能开关。
    if (!current) throw new Error(`Feature Flag 不存在：${key}`); // 第74天：目标不存在时拒绝静默创建。
    const rolloutPercentage = input.mode === "enabled" ? 100 : input.mode === "disabled" ? 0 : Math.max(0, Math.min(100, Math.round(input.rolloutPercentage ?? current.rolloutPercentage))); // 第74天：根据模式归一化灰度比例。
    const next = { ...current, mode: input.mode, rolloutPercentage, updatedAt: Date.now() }; // 第74天：生成更新后的功能开关。
    this.flags.set(key, next); // 第74天：保存功能开关更新结果。
    return cloneFlag(next); // 第74天：返回更新后的防御性副本。
  } // 第74天：结束功能开关更新方法。
  decide(key: string, subjectId: string): FeatureFlagDecision { // 第74天：定义对用户或租户执行稳定灰度决策的方法。
    const flag = this.flags.get(key); // 第74天：读取目标功能开关。
    if (!flag) return { key, enabled: false, mode: "disabled", subjectId, bucket: 100, reason: "功能开关不存在，默认关闭。" }; // 第74天：未知功能默认关闭以保证安全。
    const bucket = this.bucket(`${key}:${subjectId}`); // 第74天：根据功能键和主体标识计算零到九十九稳定分桶。
    const enabled = flag.mode === "enabled" || (flag.mode === "gradual" && bucket < flag.rolloutPercentage); // 第74天：全量模式直接开启，灰度模式按比例判断。
    const reason = flag.mode === "enabled" ? "功能已全量开启。" : flag.mode === "disabled" ? "功能已关闭。" : `灰度分桶 ${bucket}，发布比例 ${flag.rolloutPercentage}%。`; // 第74天：生成可解释决策原因。
    return { key, enabled, mode: flag.mode, subjectId, bucket, reason }; // 第74天：返回稳定功能开关决策。
  } // 第74天：结束功能开关决策方法。
  private bucket(value: string): number { // 第74天：定义稳定哈希分桶函数。
    const digest = createHash("sha256").update(value).digest("hex").slice(0, 8); // 第74天：截取 SHA-256 前八位十六进制文本。
    return Number.parseInt(digest, 16) % 100; // 第74天：把哈希映射为零到九十九的灰度桶。
  } // 第74天：结束稳定哈希分桶函数。
} // 第74天：结束功能开关管理器类。

const globalForFeatureFlags = globalThis as typeof globalThis & { __day74FeatureFlagManager?: FeatureFlagManager }; // 第74天：扩展全局对象避免 Next.js 热重载重复创建功能开关状态。
export function getFeatureFlagManager(): FeatureFlagManager { // 第74天：定义读取共享功能开关管理器的方法。
  globalForFeatureFlags.__day74FeatureFlagManager ??= new FeatureFlagManager(); // 第74天：首次访问时创建功能开关管理器。
  return globalForFeatureFlags.__day74FeatureFlagManager; // 第74天：返回进程级共享功能开关管理器。
} // 第74天：结束共享功能开关管理器读取函数。
