import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第68天：引入项目统一 API 成功与错误响应包装器。
import { productionMemoryPlatform } from "@/lib/memory/production-memory-platform"; // 第68天：引入进程级生产记忆平台单例。
import { PRODUCTION_MEMORY_SCOPES, PRODUCTION_MEMORY_TYPES, type MemoryConflictResolution, type MemorySearchInput, type ProductionMemoryDraft, type ProductionMemoryScope, type ProductionMemoryType } from "@/lib/memory/production-memory-types"; // 第68天：引入作用域、类型、检索、写入和冲突处理类型。
type PostBody = { action?: "write" | "retrieve" | "archive_workspace"; memory?: Partial<ProductionMemoryDraft>; search?: MemorySearchInput; workspaceId?: string; targetUserId?: string }; // 第68天：定义新增记忆、统一检索和工作空间归档请求体。
type PatchBody = { action?: "archive" | "forget" | "pin" | "merge" | "resolve_conflict" | "consolidate"; id?: string; pinned?: boolean; primaryId?: string; secondaryId?: string; conflictId?: string; resolution?: Exclude<MemoryConflictResolution, "manual_review"> }; // 第68天：定义治理台归档、遗忘、固定、合并、冲突和整合动作请求体。
function isScope(value: unknown): value is ProductionMemoryScope { return typeof value === "string" && PRODUCTION_MEMORY_SCOPES.includes(value as ProductionMemoryScope); } // 第68天：定义生产记忆作用域请求值类型守卫。
function isType(value: unknown): value is ProductionMemoryType { return typeof value === "string" && PRODUCTION_MEMORY_TYPES.includes(value as ProductionMemoryType); } // 第68天：定义生产记忆业务类型请求值类型守卫。
function isResolution(value: unknown): value is Exclude<MemoryConflictResolution, "manual_review"> { return value === "keep_existing" || value === "replace" || value === "merge"; } // 第68天：定义人工冲突最终结论类型守卫。
function toDraft(input: Partial<ProductionMemoryDraft> | undefined): ProductionMemoryDraft { // 第68天：把治理台部分请求转换为完整生产记忆草稿。
  if (!input || !isScope(input.scope) || !isType(input.type) || typeof input.scopeId !== "string" || typeof input.content !== "string") throw new Error("写入记忆需要合法的 scope、scopeId、type 与 content"); // 第68天：校验写入生产记忆所需的核心字段。
  return { scope: input.scope, scopeId: input.scopeId, type: input.type, content: input.content, importance: typeof input.importance === "number" ? input.importance : 0.7, confidence: typeof input.confidence === "number" ? input.confidence : 0.8, source: input.source && typeof input.source === "object" ? { ...input.source } : {}, tags: Array.isArray(input.tags) ? input.tags.map(String) : [], status: input.status ?? "active", expiresAt: typeof input.expiresAt === "number" ? input.expiresAt : input.scope === "session" ? Date.now() + 7 * 24 * 60 * 60 * 1000 : undefined, pinned: input.pinned ?? false }; // 第68天：补齐分数、来源、标签、状态、会话 TTL 与固定状态默认值。
} // 第68天：结束生产记忆草稿请求转换函数。
export async function GET() { // 第68天：定义读取 Memory Governance Explorer 完整快照的 Route Handler。
  try { return apiJsonSuccess(await productionMemoryPlatform.getSnapshot()); } catch (error) { return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Production Memory Platform snapshot failed"); } // 第68天：返回条目、冲突、指标、Provider、注册项、事件和最近检索或统一错误。
} // 第68天：结束生产记忆平台 GET 接口。
export async function POST(request: Request) { // 第68天：定义写入、检索和工作空间归档生产记忆的 Route Handler。
  try { // 第68天：捕获请求解析、数据校验、Provider 和治理流程异常。
    const body = await request.json() as PostBody; // 第68天：读取生产记忆 POST JSON 请求体。
    if (body.action === "write") return apiJsonSuccess(await productionMemoryPlatform.write(toDraft(body.memory)), "production memory written"); // 第68天：写入生产记忆并返回最新治理快照。
    if (body.action === "retrieve") { if (!body.search?.query) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "统一检索需要 search.query"); return apiJsonSuccess(await productionMemoryPlatform.retrieve(body.search), "production memory retrieved"); } // 第68天：执行三路统一检索并返回评分结果。
    if (body.action === "archive_workspace") { if (!body.workspaceId) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "工作空间归档需要 workspaceId"); return apiJsonSuccess(await productionMemoryPlatform.archiveWorkspace(body.workspaceId, body.targetUserId), "workspace memory archived"); } // 第68天：筛选高价值工作空间条目并沉淀到长期记忆。
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "action 必须是 write、retrieve 或 archive_workspace"); // 第68天：拒绝任务范围之外的未知 POST 动作。
  } catch (error) { return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Memory POST failed"); } // 第68天：返回不暴露堆栈的统一可读错误。
} // 第68天：结束生产记忆平台 POST 接口。
export async function PATCH(request: Request) { // 第68天：定义 Memory Governance Explorer 生命周期治理动作 Route Handler。
  try { // 第68天：捕获请求解析、目标查找、冲突处理和乐观更新异常。
    const body = await request.json() as PatchBody; // 第68天：读取生产记忆 PATCH JSON 请求体。
    if (body.action === "archive" && body.id) return apiJsonSuccess(await productionMemoryPlatform.archive(body.id), "production memory archived"); // 第68天：软归档指定生产记忆。
    if (body.action === "forget" && body.id) return apiJsonSuccess(await productionMemoryPlatform.forget(body.id), "production memory forgotten"); // 第68天：软删除指定生产记忆并移除长期向量。
    if (body.action === "pin" && body.id && typeof body.pinned === "boolean") return apiJsonSuccess(await productionMemoryPlatform.pin(body.id, body.pinned), "production memory pin updated"); // 第68天：固定或取消固定指定生产记忆。
    if (body.action === "merge" && body.primaryId && body.secondaryId) return apiJsonSuccess(await productionMemoryPlatform.merge(body.primaryId, body.secondaryId), "production memories merged"); // 第68天：合并两条同作用域生产记忆。
    if (body.action === "resolve_conflict" && body.conflictId && isResolution(body.resolution)) return apiJsonSuccess(await productionMemoryPlatform.resolveConflict(body.conflictId, body.resolution), "production memory conflict resolved"); // 第68天：保存人工选择的冲突处理结果。
    if (body.action === "consolidate") return apiJsonSuccess(await productionMemoryPlatform.consolidate(), "production memories consolidated"); // 第68天：执行全平台记忆去重和冲突扫描。
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "治理动作参数不完整或 action 非法"); // 第68天：拒绝缺少必要标识或未知的治理动作。
  } catch (error) { return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Memory PATCH failed"); } // 第68天：返回不暴露堆栈的统一可读错误。
} // 第68天：结束生产记忆平台 PATCH 接口。
