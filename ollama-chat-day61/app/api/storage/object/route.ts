/** 第61天：对象下载 API，为 Storage Explorer 的 Preview（预览）和本地签名 URL 提供统一入口。 */
import { API_CODE, apiJsonError } from "@/lib/api/api-envelope"; // 第61天：引入统一错误响应。
import { objectStorageClient } from "@/lib/storage/object-storage-client"; // 第61天：引入对象存储客户端。

export async function GET(req: Request) { // 第61天：定义 GET /api/storage/object 下载接口。
  try { // 第61天：捕获下载异常。
    const url = new URL(req.url); // 第61天：解析请求 URL。
    const bucket = url.searchParams.get("bucket") ?? ""; // 第61天：读取 Bucket 参数。
    const objectKey = url.searchParams.get("objectKey") ?? ""; // 第61天：读取 Object Key 参数。
    if (!bucket || !objectKey) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "bucket 和 objectKey 不能为空"); // 第61天：校验必要参数。
    const result = await objectStorageClient.download(bucket, objectKey); // 第61天：下载对象内容。
    const payload = new Uint8Array(result.body); // 第61天：把 Node Buffer 转成 Web Response 可接受的 Uint8Array。
    return new Response(payload, { headers: { "Content-Type": result.metadata.contentType, "Content-Length": String(result.metadata.size), "Content-Disposition": `inline; filename="${encodeURIComponent(objectKey.split("/").pop() ?? "object")}"` } }); // 第61天：返回可预览或下载的对象响应。
  } catch (err) { // 第61天：捕获异常。
    const msg = err instanceof Error ? err.message : "对象下载失败"; // 第61天：生成错误消息。
    return apiJsonError(API_CODE.INTERNAL, API_CODE.INTERNAL, msg); // 第61天：返回 500 Envelope。
  } // 第61天：结束异常处理。
} // 第61天：结束 GET 接口。
