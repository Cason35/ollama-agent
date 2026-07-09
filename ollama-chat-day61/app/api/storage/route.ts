/** 第61天：Storage API，提供对象存储快照、删除、工作区导出和 Trace 附件演示能力。 */
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第61天：引入统一 API Envelope。
import { deleteStorageObject, exportWorkspaceToStorage, getStorageSnapshot, uploadTraceAttachment } from "@/lib/storage/storage-runtime"; // 第61天：引入对象存储运行时能力。
import { objectStorageClient } from "@/lib/storage/object-storage-client"; // 第61天：引入对象存储客户端，用于演示上传。
import type { Trace, Workspace } from "@/lib/agents/agent-types"; // 第61天：引入工作区和追踪类型。

type StorageActionBody = { // 第61天：定义 Storage API POST 请求体。
  action?: "upload-demo" | "delete" | "workspace-export" | "trace-attachment"; // 第61天：声明支持的动作类型。
  bucket?: string; // 第61天：保存可选 Bucket。
  objectKey?: string; // 第61天：保存可选 Object Key。
  title?: string; // 第61天：保存演示上传标题。
  content?: string; // 第61天：保存演示上传内容。
  workspace?: Workspace; // 第61天：保存可选工作区快照。
  trace?: Trace; // 第61天：保存可选 Trace 快照。
}; // 第61天：结束 StorageActionBody 类型定义。

export async function GET() { // 第61天：定义 GET /api/storage 快照接口。
  const snapshot = await getStorageSnapshot(); // 第61天：读取对象存储快照。
  return apiJsonSuccess(snapshot); // 第61天：返回统一成功响应。
} // 第61天：结束 GET 接口。

export async function POST(req: Request) { // 第61天：定义 POST /api/storage 操作接口。
  try { // 第61天：捕获业务异常。
    const body = (await req.json()) as StorageActionBody; // 第61天：解析请求体。
    if (body.action === "delete") return handleDelete(body); // 第61天：处理删除对象动作。
    if (body.action === "workspace-export") return handleWorkspaceExport(body); // 第61天：处理工作区导出动作。
    if (body.action === "trace-attachment") return handleTraceAttachment(body); // 第61天：处理 Trace 附件动作。
    return handleUploadDemo(body); // 第61天：默认处理演示上传动作。
  } catch (err) { // 第61天：捕获异常。
    const msg = err instanceof Error ? err.message : "对象存储操作失败"; // 第61天：生成错误消息。
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 第61天：返回 500 Envelope。
  } // 第61天：结束异常处理。
} // 第61天：结束 POST 接口。

async function handleUploadDemo(body: StorageActionBody) { // 第61天：处理演示文件上传。
  const content = body.content?.trim() || "Day61 Object Storage demo content."; // 第61天：读取演示内容或使用兜底文本。
  const title = body.title?.trim() || "day61-storage-demo"; // 第61天：读取演示标题或使用兜底标题。
  const object = await objectStorageClient.uploadText("generic", `${title}.md`, content, "text/markdown; charset=utf-8"); // 第61天：上传演示 Markdown 文件。
  const snapshot = await getStorageSnapshot(); // 第61天：上传后刷新快照。
  return apiJsonSuccess({ object, snapshot }); // 第61天：返回上传对象和最新快照。
} // 第61天：结束 handleUploadDemo 函数。

async function handleDelete(body: StorageActionBody) { // 第61天：处理删除对象。
  if (!body.bucket || !body.objectKey) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "bucket 和 objectKey 不能为空"); // 第61天：校验必要参数。
  const snapshot = await deleteStorageObject(body.bucket, body.objectKey); // 第61天：删除对象并刷新快照。
  return apiJsonSuccess(snapshot); // 第61天：返回最新快照。
} // 第61天：结束 handleDelete 函数。

async function handleWorkspaceExport(body: StorageActionBody) { // 第61天：处理工作区导出。
  const workspace = body.workspace ?? createDemoWorkspace(); // 第61天：读取请求工作区或创建演示工作区。
  const result = await exportWorkspaceToStorage(workspace); // 第61天：把工作区导出到对象存储。
  const snapshot = await getStorageSnapshot(); // 第61天：导出后刷新快照。
  return apiJsonSuccess({ result, snapshot }); // 第61天：返回导出结果和最新快照。
} // 第61天：结束 handleWorkspaceExport 函数。

async function handleTraceAttachment(body: StorageActionBody) { // 第61天：处理 Trace 附件上传。
  const trace = body.trace ?? createDemoTrace(); // 第61天：读取请求 Trace 或创建演示 Trace。
  const result = await uploadTraceAttachment(trace, "prompt-snapshot", { prompt: "Day61 Trace Attachment demo", output: "stored in Object Storage" }); // 第61天：上传 Prompt Snapshot 附件。
  const snapshot = await getStorageSnapshot(); // 第61天：上传后刷新快照。
  return apiJsonSuccess({ result, snapshot }); // 第61天：返回附件结果和最新快照。
} // 第61天：结束 handleTraceAttachment 函数。

function createDemoWorkspace(): Workspace { // 第61天：创建演示工作区快照。
  const now = Date.now(); // 第61天：记录当前时间。
  return { id: `workspace-day61-${now}`, goal: "演示 Workspace Export（工作区导出）进入 Object Storage（对象存储）", createdAt: now, updatedAt: now, entries: [{ id: `entry-${now}`, type: "final", agentId: "writer", content: "这是一份由 Day61 Storage Runtime 导出的工作区 Markdown 内容。", tags: ["day61", "storage"], createdAt: now }] }; // 第61天：返回包含一个最终条目的工作区。
} // 第61天：结束 createDemoWorkspace 函数。

function createDemoTrace(): Trace { // 第61天：创建演示 Trace 快照。
  const now = Date.now(); // 第61天：记录当前时间。
  return { traceId: `trace-day61-${now}`, rootOperation: "Day61 Trace Attachment Demo", startedAt: now, endedAt: now + 8, spans: [{ spanId: `span-${now}`, name: "prompt-snapshot", type: "tool", startedAt: now, endedAt: now + 8, status: "success", metadata: { storage: "object-storage" } }] }; // 第61天：返回包含一个成功跨度的 Trace。
} // 第61天：结束 createDemoTrace 函数。
