import { apiJsonReasonError, apiJsonSuccess, API_REASON } from "@/lib/api/api-envelope"; /* 第49天：引入统一 API 成功与错误响应包装器。 */
import { clearMemory, deleteMemoryItem, getMemoryDashboardSnapshot, updateMemoryItem } from "@/lib/memory/memory-dashboard-runtime"; /* 第49天：引入长期记忆看板快照、删除、更新与清空能力。 */
import type { MemoryItemType, MemoryUpdateInput } from "@/lib/memory/long-term-memory-types"; /* 第49天：引入记忆类型与更新入参类型。 */

const VALID_TYPES: MemoryItemType[] = ["fact", "preference", "experience", "decision", "lesson"]; /* 第49天：定义合法的记忆类型集合用于校验。 */

export async function GET() { /* 第49天：定义 GET /api/memory 读取最近长期记忆快照接口。 */
  try { /* 第49天：捕获演示运行与摘要生成阶段可能出现的异常。 */
    return apiJsonSuccess(await getMemoryDashboardSnapshot(false)); /* 第49天：返回记忆条目、指标、检索预览与整合结果快照。 */
  } catch (error) { /* 第49天：处理记忆快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Memory snapshot failed"); /* 第49天：返回统一内部错误响应。 */
  } /* 第49天：结束 GET 异常处理。 */
} /* 第49天：结束 GET /api/memory 接口。 */

export async function POST() { /* 第49天：定义 POST /api/memory 强制重新运行长期记忆演示接口。 */
  try { /* 第49天：捕获重新运行期间可能出现的异常。 */
    return apiJsonSuccess(await getMemoryDashboardSnapshot(true), "long-term memory demo rerun completed"); /* 第49天：清空旧记忆、重新执行并返回最新快照。 */
  } catch (error) { /* 第49天：处理重新运行失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Memory rerun failed"); /* 第49天：返回统一内部错误响应。 */
  } /* 第49天：结束 POST 异常处理。 */
} /* 第49天：结束 POST /api/memory 接口。 */

export async function PATCH(request: Request) { /* 第49天：定义 PATCH /api/memory 编辑或置顶单条记忆接口。 */
  try { /* 第49天：捕获请求体解析与更新阶段可能出现的异常。 */
    const body = (await request.json()) as { id?: string; content?: string; type?: string; importance?: number; confidence?: number; pinned?: boolean }; /* 第49天：读取更新请求体。 */
    if (!body.id) return apiJsonReasonError(API_REASON.WORKFLOW_ID_MISSING, "缺少要更新的记忆 id"); /* 第49天：缺少记忆 id 时返回参数错误。 */
    const patch: MemoryUpdateInput = {}; /* 第49天：初始化记忆更新补丁。 */
    if (typeof body.content === "string") patch.content = body.content; /* 第49天：按需更新正文。 */
    if (typeof body.type === "string" && VALID_TYPES.includes(body.type as MemoryItemType)) patch.type = body.type as MemoryItemType; /* 第49天：按需更新合法类型。 */
    if (typeof body.importance === "number") patch.importance = body.importance; /* 第49天：按需更新重要性。 */
    if (typeof body.confidence === "number") patch.confidence = body.confidence; /* 第49天：按需更新置信度。 */
    if (typeof body.pinned === "boolean") patch.pinned = body.pinned; /* 第49天：按需更新置顶状态。 */
    updateMemoryItem(body.id, patch); /* 第49天：执行记忆更新。 */
    return apiJsonSuccess(await getMemoryDashboardSnapshot(false), "memory item updated"); /* 第49天：返回更新后的最新快照。 */
  } catch (error) { /* 第49天：处理更新失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Memory update failed"); /* 第49天：返回统一内部错误响应。 */
  } /* 第49天：结束 PATCH 异常处理。 */
} /* 第49天：结束 PATCH /api/memory 接口。 */

export async function DELETE(request: Request) { /* 第49天：定义 DELETE /api/memory 删除或清空记忆接口。 */
  try { /* 第49天：捕获删除与清空阶段可能出现的异常。 */
    const id = new URL(request.url).searchParams.get("id"); /* 第49天：读取要删除的记忆条目 id，缺省表示清空全部。 */
    if (id) deleteMemoryItem(id); /* 第49天：传入 id 时删除对应单条记忆。 */
    else clearMemory(); /* 第49天：未传 id 时清空全部记忆。 */
    return apiJsonSuccess(await getMemoryDashboardSnapshot(false), id ? "memory item deleted" : "memory cleared"); /* 第49天：返回删除或清空后的最新快照。 */
  } catch (error) { /* 第49天：处理删除或清空失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Memory delete failed"); /* 第49天：返回统一内部错误响应。 */
  } /* 第49天：结束 DELETE 异常处理。 */
} /* 第49天：结束 DELETE /api/memory 接口。 */

