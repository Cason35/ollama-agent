import { NextRequest } from "next/server"; // 引入 Next 请求类型。
import { apiJsonError, apiJsonSuccess, API_CODE } from "@/lib/api/api-envelope"; // 引入统一 API 响应工具。
import { getQueueRuntime } from "@/lib/queue/queue-runtime"; // 引入第34天队列运行时单例。
import type { CreateJobInput, JobType } from "@/lib/queue/queue-types"; // 引入创建任务输入和任务类型。

export const dynamic = "force-dynamic"; // 声明该路由总是动态执行。

const JOB_TYPES: JobType[] = ["workflow", "retrieval", "embedding", "reindex", "unstable", "alwaysFail", "reminder"]; // 定义允许创建的任务类型。

function isJobType(value: unknown): value is JobType { // 定义任务类型校验函数。
  return typeof value === "string" && JOB_TYPES.includes(value as JobType); // 判断是否命中白名单。
} // 结束 isJobType。

function normalizeCreateInput(body: Partial<CreateJobInput>): CreateJobInput | null { // 定义创建任务请求归一化函数。
  if (!isJobType(body.type)) return null; // 任务类型无效时返回空。
  return { // 返回安全的创建输入。
    type: body.type, // 写入任务类型。
    payload: body.payload ?? {}, // 写入任务载荷。
    priority: body.priority, // 写入可选优先级。
    scheduledAt: body.scheduledAt, // 写入可选计划执行时间。
    scheduledDelayMs: body.scheduledDelayMs, // 写入可选延迟毫秒数。
    retryPolicy: body.retryPolicy, // 写入可选重试策略。
  }; // 结束创建输入。
} // 结束 normalizeCreateInput。

export async function GET() { // 定义读取队列看板数据的接口。
  const snapshot = await getQueueRuntime().snapshot(); // 获取任务列表与队列指标。
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
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "无效的 Job Type"); // 返回类型错误。
  } // 结束类型校验。
  const snapshot = await getQueueRuntime().enqueue(input); // 创建并入队任务。
  return apiJsonSuccess(snapshot, "job created"); // 返回任务创建结果。
} // 结束 POST。

export async function PATCH(req: NextRequest) { // 定义手动重新入队接口。
  let body: { action?: string; jobId?: string }; // 声明请求体变量。
  try { // 开始解析 JSON。
    body = (await req.json()) as { action?: string; jobId?: string }; // 读取请求体。
  } catch { // 捕获非法 JSON。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON"); // 返回格式错误。
  } // 结束 try/catch。
  if (body.action !== "requeue" || !body.jobId) { // 校验动作与任务 ID。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请提供 requeue 动作与 jobId"); // 返回参数错误。
  } // 结束动作校验。
  try { // 开始重新入队。
    const snapshot = await getQueueRuntime().requeue(body.jobId); // 调用运行时重新入队。
    return apiJsonSuccess(snapshot, "job requeued"); // 返回重新入队结果。
  } catch (error) { // 捕获业务错误。
    const message = error instanceof Error ? error.message : "重新入队失败"; // 规范化错误消息。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, message); // 返回业务错误。
  } // 结束 try/catch。
} // 结束 PATCH。
