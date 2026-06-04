import { NextRequest } from "next/server"; // 引入 Next 请求类型
import { apiJsonError, apiJsonSuccess, API_CODE } from "@/lib/api/api-envelope"; // 引入统一 API 响应工具
import { getQueueRuntime } from "@/lib/queue/queue-runtime"; // 引入第31天队列运行时单例
import type { CreateJobInput, JobType } from "@/lib/queue/queue-types"; // 引入创建任务输入类型

export const dynamic = "force-dynamic"; // 声明该路由总是动态执行

const JOB_TYPES: JobType[] = ["workflow", "retrieval", "embedding", "reindex"]; // 定义允许创建的任务类型

function isJobType(value: unknown): value is JobType { // 定义任务类型校验函数
  return typeof value === "string" && JOB_TYPES.includes(value as JobType); // 判断是否命中白名单
} // isJobType 函数结束

export async function GET() { // 定义读取队列看板数据的接口
  const snapshot = await getQueueRuntime().snapshot(); // 获取任务列表与队列指标
  return apiJsonSuccess(snapshot); // 返回统一成功响应
} // GET 函数结束

export async function POST(req: NextRequest) { // 定义创建任务接口
  let body: Partial<CreateJobInput>; // 声明请求体变量
  try { // 开始解析 JSON
    body = (await req.json()) as Partial<CreateJobInput>; // 读取请求体
  } catch { // 捕获非法 JSON
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON"); // 返回格式错误
  } // try/catch 结束
  if (!isJobType(body.type)) { // 校验任务类型
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "无效的 Job Type"); // 返回类型错误
  } // 类型校验结束
  const snapshot = await getQueueRuntime().enqueue({ // 创建并入队任务
    type: body.type, // 写入任务类型
    payload: body.payload ?? {}, // 写入任务载荷
  }); // enqueue 调用结束
  return apiJsonSuccess(snapshot, "job created"); // 返回任务创建结果
} // POST 函数结束
