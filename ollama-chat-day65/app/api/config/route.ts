import { NextRequest } from "next/server"; // 第62天：引入 Next.js 请求类型，便于解析 JSON 请求体。
import { API_CODE, apiJsonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第62天：引入统一 API Envelope 工具。
import { configManager } from "@/lib/config/config-runtime"; // 第62天：引入配置中心运行时单例。
export const dynamic = "force-dynamic"; // 第62天：声明配置中心 API 始终动态执行，避免缓存旧配置。
type ConfigActionBody = { action?: "set" | "reload" | "reset" | "reset-all"; key?: string; value?: unknown }; // 第62天：定义配置中心 POST 请求体结构。
export async function GET() { // 第62天：定义 GET /api/config，用于读取配置中心快照。
  return apiJsonSuccess(configManager.snapshot()); // 第62天：返回配置项、指标、校验错误和版本号。
} // 第62天：结束 GET 接口。
export async function POST(req: NextRequest) { // 第62天：定义 POST /api/config，用于编辑、重载和重置配置。
  let body: ConfigActionBody; // 第62天：声明请求体变量。
  try { // 第62天：开始解析 JSON 请求体。
    body = (await req.json()) as ConfigActionBody; // 第62天：读取请求体并转换为配置动作结构。
  } catch { // 第62天：捕获非法 JSON。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "请求体必须是 JSON。"); // 第62天：返回 400 错误。
  } // 第62天：结束 JSON 解析。
  try { // 第62天：开始执行业务动作。
    if (body.action === "reload") return apiJsonSuccess(await configManager.reload(), "config reloaded"); // 第62天：重新加载所有 Provider。
    if (body.action === "reset-all") return await handleResetAll(); // 第62天：清空所有数据库覆盖配置。
    if (body.action === "reset") return await handleReset(body.key); // 第62天：重置单个配置项。
    return await handleSet(body.key, body.value); // 第62天：默认执行 set，便于前端少传 action。
  } catch (error) { // 第62天：捕获配置写入或校验错误。
    const message = error instanceof Error ? error.message : "配置中心操作失败。"; // 第62天：规整错误消息。
    return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, message); // 第62天：返回业务错误。
  } // 第62天：结束业务动作 try/catch。
} // 第62天：结束 POST 接口。
async function handleSet(key: string | undefined, value: unknown) { // 第62天：定义设置配置项的处理函数。
  if (!key) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "缺少配置 key。"); // 第62天：校验 key 必填。
  const item = await configManager.set(key, value); // 第62天：写入数据库配置覆盖值并触发热更新。
  return apiJsonSuccess({ item, snapshot: configManager.snapshot() }, "config updated"); // 第62天：返回变更项和最新快照。
} // 第62天：结束 handleSet 函数。
async function handleReset(key: string | undefined) { // 第62天：定义重置单个配置项的处理函数。
  if (!key) return apiJsonError(API_CODE.BAD_REQUEST, API_CODE.BAD_REQUEST, "缺少配置 key。"); // 第62天：校验 key 必填。
  const deleted = await configManager.reset(key); // 第62天：删除数据库覆盖值。
  return apiJsonSuccess({ deleted, snapshot: configManager.snapshot() }, "config reset"); // 第62天：返回删除结果和最新快照。
} // 第62天：结束 handleReset 函数。
async function handleResetAll() { // 第62天：定义清空所有数据库覆盖配置的处理函数。
  await configManager.resetDatabaseOverrides(); // 第62天：清空数据库模拟 Provider。
  return apiJsonSuccess(configManager.snapshot(), "config overrides reset"); // 第62天：返回最新配置快照。
} // 第62天：结束 handleResetAll 函数。

