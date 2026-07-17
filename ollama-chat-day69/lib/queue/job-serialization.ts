import type { Job } from "@/lib/queue/queue-types"; // 第59天：引入 Job 类型，用于 Redis Queue 的 JSON 序列化边界。
export function serializeJob(job: Job): string { // 第59天：定义 Job Serialization（任务序列化）函数。
  return JSON.stringify(job); // 第59天：把内存中的 Job 对象转换成 Redis List 可保存的 JSON 字符串。
} // 第59天：结束 Job Serialization 函数。
export function deserializeJob(raw: string): Job | null { // 第59天：定义 Job Deserialization（任务反序列化）函数。
  try { // 第59天：捕获 Redis 中脏数据或旧版本 JSON 解析失败。
    const parsed = JSON.parse(raw) as Partial<Job>; // 第59天：先把 JSON 字符串解析为不完全可信的 Job 形状。
    if (typeof parsed.id !== "string") return null; // 第59天：缺少任务 ID 时视为无效数据。
    if (typeof parsed.type !== "string") return null; // 第59天：缺少任务类型时视为无效数据。
    if (typeof parsed.status !== "string") return null; // 第59天：缺少任务状态时视为无效数据。
    return parsed as Job; // 第59天：基础字段满足后交还给队列运行时继续处理。
  } catch { // 第59天：处理非法 JSON。
    return null; // 第59天：反序列化失败时返回 null，避免 Worker 因单条坏数据崩溃。
  } // 第59天：结束异常处理。
} // 第59天：结束 Job Deserialization 函数。
