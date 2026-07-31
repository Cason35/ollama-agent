import { NextRequest } from "next/server"; // 第63天：引入 Next.js 请求类型，便于解析 JSON 请求体。
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第63天：引入统一 API Envelope 工具。
import { secretsManager } from "@/lib/secrets/secrets-runtime"; // 第63天：引入密钥管理器运行时单例。
import type { SecretCategory } from "@/lib/secrets/secret-types"; // 第63天：引入密钥分类类型。

export const dynamic = "force-dynamic"; // 第63天：声明密钥管理 API 始终动态执行，避免缓存旧密钥元数据。

type SecretsActionBody = { action?: "set" | "rotate" | "delete"; key?: string; value?: unknown; category?: SecretCategory; expiresAt?: number }; // 第63天：定义密钥管理 POST 请求体结构。

export async function GET() { // 第63天：定义 GET /api/secrets，用于读取脱敏密钥快照。
  return apiJsonSuccess(await secretsManager.snapshot()); // 第63天：返回密钥元数据、指标和轮换历史，不返回真实 value。
} // 第63天：结束 GET 接口。

export async function POST(req: NextRequest) { // 第63天：定义 POST /api/secrets，用于写入、轮换和删除密钥。
  let body: SecretsActionBody; // 第63天：声明请求体变量。
  try { // 第63天：开始解析 JSON 请求体。
    body = (await req.json()) as SecretsActionBody; // 第63天：读取请求体并转换为密钥动作结构。
  } catch { // 第63天：捕获非法 JSON。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON。"); // 第63天：返回 400 错误。
  } // 第63天：结束 JSON 解析。
  try { // 第63天：开始执行业务动作。
    if (body.action === "delete") return await handleDelete(body.key); // 第63天：删除运行时可写密钥。
    if (body.action === "rotate") return await handleRotate(body.key, body.value, body.category); // 第63天：轮换密钥值并记录历史。
    return await handleSet(body.key, body.value, body.category, body.expiresAt); // 第63天：默认执行 set，便于前端少传 action。
  } catch (error) { // 第63天：捕获密钥写入、轮换或删除错误。
    const message = error instanceof Error ? error.message : "密钥管理操作失败。"; // 第63天：规整错误消息。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, message); // 第63天：返回业务错误。
  } // 第63天：结束业务动作 try/catch。
} // 第63天：结束 POST 接口。

async function handleSet(key: string | undefined, value: unknown, category: SecretCategory | undefined, expiresAt: number | undefined) { // 第63天：定义设置密钥的处理函数。
  if (!key) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "缺少密钥 key。"); // 第63天：校验 key 必填。
  if (typeof value !== "string") return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "密钥 value 必须是字符串。"); // 第63天：校验 value 类型。
  const item = await secretsManager.set({ key, value, category: category ?? "model", expiresAt }); // 第63天：写入可写 Provider 并加密保存。
  return apiJsonSuccess({ item, snapshot: await secretsManager.snapshot() }, "secret updated"); // 第63天：返回脱敏元数据和最新快照。
} // 第63天：结束 handleSet 函数。

async function handleRotate(key: string | undefined, value: unknown, category: SecretCategory | undefined) { // 第63天：定义轮换密钥的处理函数。
  if (!key) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "缺少密钥 key。"); // 第63天：校验 key 必填。
  if (typeof value !== "string") return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "新密钥 value 必须是字符串。"); // 第63天：校验 value 类型。
  const rotation = await secretsManager.rotateSecret(key, value, category); // 第63天：执行密钥轮换并记录版本历史。
  return apiJsonSuccess({ rotation, snapshot: await secretsManager.snapshot() }, "secret rotated"); // 第63天：返回轮换记录和最新快照。
} // 第63天：结束 handleRotate 函数。

async function handleDelete(key: string | undefined) { // 第63天：定义删除密钥的处理函数。
  if (!key) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "缺少密钥 key。"); // 第63天：校验 key 必填。
  const deleted = await secretsManager.delete(key); // 第63天：删除运行时可写 Provider 中的密钥。
  return apiJsonSuccess({ deleted, snapshot: await secretsManager.snapshot() }, "secret deleted"); // 第63天：返回删除结果和最新快照。
} // 第63天：结束 handleDelete 函数。
