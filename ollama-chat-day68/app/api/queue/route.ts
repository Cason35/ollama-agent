import { NextRequest } from "next/server"; // 引入 Next 请求类型。
import { apiJsonError, apiJsonSuccess, API_CODE } from "@/lib/api/api-envelope"; // 引入统一 API 响应工具。
import { RESOURCE_TYPES } from "@/lib/queue/resource-limiters"; // 引入允许的资源类型列表。
import { getQueueRuntime } from "@/lib/queue/queue-runtime"; // 引入第35天队列运行时单例。
import type { CreateJobInput, JobType, ResourceType } from "@/lib/queue/queue-types"; // 引入创建任务输入、任务类型和资源类型。

export const dynamic = "force-dynamic"; // 声明该路由总是动态执行。

const JOB_TYPES: JobType[] = ["workflow", "retrieval", "embedding", "reindex", "unstable", "alwaysFail", "reminder", "chat"]; // 定义允许创建的任务类型。

function isJobType(value: unknown): value is JobType { // 定义任务类型校验函数。
  return typeof value === "string" && JOB_TYPES.includes(value as JobType); // 判断是否命中白名单。
} // 结束 isJobType。

function isResourceType(value: unknown): value is ResourceType { // 定义资源类型校验函数。
  return typeof value === "string" && RESOURCE_TYPES.includes(value as ResourceType); // 判断是否命中资源白名单。
} // 结束 isResourceType。

function normalizeCreateInput(body: Partial<CreateJobInput>): CreateJobInput | null { // 定义创建任务请求归一化函数。
  if (!isJobType(body.type)) return null; // 任务类型无效时返回空。
  if (body.resourceType !== undefined && !isResourceType(body.resourceType)) return null; // 显式资源类型无效时返回空。
  return { // 返回安全的创建输入。
    type: body.type, // 写入任务类型。
    resourceType: body.resourceType, // 第35天：写入可选资源类型。
    payload: body.payload ?? {}, // 写入任务载荷。
    priority: body.priority, // 写入可选优先级。
    scheduledAt: body.scheduledAt, // 写入可选计划执行时间。
    scheduledDelayMs: body.scheduledDelayMs, // 写入可选延迟毫秒数。
    retryPolicy: body.retryPolicy, // 写入可选重试策略。
    timeoutMs: body.timeoutMs, // 第36天：写入可选任务超时时间。
  }; // 结束创建输入。
} // 结束 normalizeCreateInput。

export async function GET() { // 定义读取队列看板数据的接口。
  const snapshot = await getQueueRuntime().snapshot(); // 获取任务列表、队列指标、资源占用和速率指标。
  return apiJsonSuccess(snapshot); // 返回统一成功响应。
} // 结束 GET。

export async function POST(req: NextRequest) { // 定义创建任务接口。
  let body: Partial<CreateJobInput>; // 声明请求体变量。
  try { // 开始解析 JSON。
    body = (await req.json()) as Partial<CreateJobInput>; // 读取请求体。
  } catch { // 捕获非法 JSON。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON"); // 返回格式错误。
  } // 结束 try/catch。
  const input = normalizeCreateInput(body); // 归一化创建输入。
  if (!input) { // 判断输入是否有效。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "无效的 Job Type 或 Resource Type"); // 返回类型错误。
  } // 结束类型校验。
  const snapshot = await getQueueRuntime().enqueue(input); // 创建并入队任务。
  return apiJsonSuccess(snapshot, "job created"); // 返回任务创建结果。
} // 结束 POST。

export async function PATCH(req: NextRequest) { // 定义第60天队列生命周期与锁动作接口。
  let body: { action?: string; jobId?: string; lockKey?: string; gracePeriodMs?: number }; // 第60天：声明请求体变量，新增 lockKey 支持强制解锁。
  try { // 开始解析 JSON。
    body = (await req.json()) as { action?: string; jobId?: string; lockKey?: string; gracePeriodMs?: number }; // 第60天：读取请求体并兼容 lockKey。
  } catch { // 捕获非法 JSON。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON"); // 返回格式错误。
  } // 结束 try/catch。
  try { // 开始重新入队。
    if (body.action === "requeue" && body.jobId) { // 第36天：处理重新入队动作。
    const snapshot = await getQueueRuntime().requeue(body.jobId); // 调用运行时重新入队。
    return apiJsonSuccess(snapshot, "job requeued"); // 返回重新入队结果。
    } // 结束重新入队动作。
    if (body.action === "restart" && body.jobId) { // 第37天：处理克隆为新 Job 的重启动作。
      const snapshot = await getQueueRuntime().restartJob(body.jobId); // 调用运行时创建新 Job，而不是篡改旧 Job 历史。
      return apiJsonSuccess(snapshot, "job restarted as new job"); // 返回重启结果。
    } // 结束重启动作。
    if (body.action === "cancel" && body.jobId) { // 第36天：处理取消任务动作。
      const snapshot = await getQueueRuntime().cancelJob(body.jobId); // 调用运行时取消任务。
      return apiJsonSuccess(snapshot, "job cancel requested"); // 返回取消结果。
    } // 结束取消任务动作。
    if (body.action === "delete" && body.jobId) { // 第60天：处理 Queue Explorer 删除任务动作。
      const snapshot = await getQueueRuntime().deleteJob(body.jobId); // 第60天：调用运行时同时清理 Redis Queue 与 JobStore。
      return apiJsonSuccess(snapshot, "job deleted"); // 第60天：返回删除结果。
    } // 第60天：结束删除任务动作。
    if (body.action === "forceUnlock" && body.lockKey) { // 第60天：处理 Lock Explorer 强制解锁动作。
      const snapshot = await getQueueRuntime().forceUnlock(body.lockKey); // 第60天：调用运行时强制删除指定锁。
      return apiJsonSuccess(snapshot, "lock force unlocked"); // 第60天：返回强制解锁结果。
    } // 第60天：结束强制解锁动作。
    if (body.action === "shutdown") { // 第36天：处理优雅关闭动作。
      const snapshot = await getQueueRuntime().stopGracefully(body.gracePeriodMs); // 调用运行时优雅关闭。
      return apiJsonSuccess(snapshot, "worker pool stopped gracefully"); // 返回优雅关闭结果。
    } // 结束优雅关闭动作。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请提供 requeue/restart/cancel/delete/forceUnlock/shutdown 动作以及必要参数"); // 第60天：返回动作参数错误。
  } catch (error) { // 捕获业务错误。
    const message = error instanceof Error ? error.message : "重新入队失败"; // 规范化错误消息。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, message); // 返回业务错误。
  } // 结束 try/catch。
} // 结束 PATCH。

