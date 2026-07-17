import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; /* 第52天：引入统一 API 响应工具。 */
import { buildPromptTemplateFromInput, validatePromptTemplate } from "@/lib/prompts/prompt-contracts"; /* 第52天增强：引入提示词输入转换与模板校验能力。 */
import { getPromptDashboardSnapshot } from "@/lib/prompts/prompt-dashboard-runtime"; /* 第52天：引入 Prompt Explorer（提示词浏览器）快照运行时。 */
import { promptRegistry } from "@/lib/prompts/default-prompts"; /* 第52天：引入共享 PromptRegistry（提示词注册表）。 */
import { hydratePromptRegistry, persistPromptRegistry } from "@/lib/prompts/prompt-persistence"; /* 第53天增强：引入本地 JSON 持久化能力，避免提示词只停留在内存。 */
import type { PromptMutationInput } from "@/lib/prompts/prompt-types"; /* 第52天增强：引入新增和编辑提示词的请求类型。 */

type PromptAction = "activate" | "archive" | "rollback"; /* 第52天：定义前端允许触发的提示词生命周期动作。 */

type PromptActionBody = { /* 第52天：定义提示词生命周期接口请求体。 */
  action?: PromptAction; /* 第52天：保存本次要执行的动作。 */
  componentId?: string; /* 第52天：保存目标组件 ID。 */
  version?: string; /* 第52天：保存目标提示词版本。 */
}; /* 第52天：结束请求体类型定义。 */

function isPromptMutationInput(value: unknown): value is PromptMutationInput { /* 第52天增强：定义提示词新增或编辑请求体类型守卫。 */
  const input = value as Partial<PromptMutationInput>; /* 第52天增强：把未知请求体临时视为部分输入。 */
  return typeof input.name === "string" && typeof input.componentType === "string" && typeof input.componentId === "string" && typeof input.version === "string" && typeof input.template === "string" && Array.isArray(input.variables) && typeof input.status === "string"; /* 第52天增强：校验保存提示词所需的基础字段。 */
} /* 第52天增强：结束提示词新增或编辑请求体类型守卫。 */

function invalidPromptMessage(input: PromptMutationInput): string | null { /* 第52天增强：定义保存前模板校验消息生成函数。 */
  const prompt = buildPromptTemplateFromInput(input); /* 第52天增强：把请求体转换为提示词模板。 */
  const validation = validatePromptTemplate(prompt); /* 第52天增强：执行变量契约校验。 */
  return validation.valid ? null : validation.issues.map((issue) => issue.message).join("；"); /* 第52天增强：通过时返回空，失败时返回全部问题。 */
} /* 第52天增强：结束保存前模板校验消息生成函数。 */

function isPromptAction(value: unknown): value is PromptAction { /* 第52天：定义生命周期动作类型守卫。 */
  return value === "activate" || value === "archive" || value === "rollback"; /* 第52天：只允许三种明确动作。 */
} /* 第52天：结束动作类型守卫。 */

export async function GET() { /* 第52天：定义 GET /api/prompts 读取提示词注册表快照接口。 */
  try { /* 第52天：捕获快照生成异常。 */
    await hydratePromptRegistry(promptRegistry); /* 第53天增强：读取快照前先从本地 JSON 恢复已保存的提示词。 */
    return apiJsonSuccess(await getPromptDashboardSnapshot()); /* 第52天：返回提示词列表、指标、diff 和回归关联。 */
  } catch (error) { /* 第52天：处理快照生成失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt snapshot failed"); /* 第52天：返回统一内部错误响应。 */
  } /* 第52天：结束 GET 异常处理。 */
} /* 第52天：结束 GET /api/prompts 接口。 */

export async function PATCH(request: Request) { /* 第52天：定义 PATCH /api/prompts 执行提示词生命周期动作接口。 */
  try { /* 第52天：捕获请求解析、动作校验和注册表操作异常。 */
    await hydratePromptRegistry(promptRegistry); /* 第53天增强：执行生命周期动作前恢复本地已保存版本。 */
    const body = await request.json() as PromptActionBody; /* 第52天：读取 JSON 请求体。 */
    if (!isPromptAction(body.action) || !body.componentId || !body.version) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要 action、componentId 与 version"); /* 第52天：校验必要参数。 */
    if (body.action === "activate") promptRegistry.activate(body.componentId, body.version); /* 第52天：激活指定提示词版本。 */
    if (body.action === "archive") promptRegistry.archive(body.componentId, body.version); /* 第52天：归档指定提示词版本。 */
    if (body.action === "rollback") promptRegistry.rollback(body.componentId, body.version); /* 第52天：回滚到指定提示词版本。 */
    await persistPromptRegistry(promptRegistry); /* 第53天增强：生命周期变更成功后写入本地 JSON 文件。 */
    return apiJsonSuccess(await getPromptDashboardSnapshot(), `prompt ${body.action} completed`); /* 第52天：动作完成后返回最新快照。 */
  } catch (error) { /* 第52天：处理生命周期动作失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt action failed"); /* 第52天：返回统一内部错误响应。 */
  } /* 第52天：结束 PATCH 异常处理。 */
} /* 第52天：结束 PATCH /api/prompts 接口。 */

export async function POST(request: Request) { /* 第52天增强：定义 POST /api/prompts 创建新提示词版本接口。 */
  try { /* 第52天增强：捕获请求解析、校验和注册表写入异常。 */
    await hydratePromptRegistry(promptRegistry); /* 第53天增强：创建前恢复本地版本，避免重复版本判断漏掉已保存数据。 */
    const body = await request.json(); /* 第52天增强：读取 JSON 请求体。 */
    if (!isPromptMutationInput(body)) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要完整 PromptMutationInput 请求体"); /* 第52天增强：缺少必要字段时返回 400。 */
    const validationMessage = invalidPromptMessage(body); /* 第52天增强：执行模板变量契约校验。 */
    if (validationMessage) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, validationMessage); /* 第52天增强：校验失败时禁止创建。 */
    if (promptRegistry.getVersion(body.componentId.trim(), body.version.trim())) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, `Prompt 已存在：${body.componentId}.${body.version}`); /* 第52天增强：创建接口禁止覆盖已有版本。 */
    promptRegistry.register(buildPromptTemplateFromInput(body)); /* 第52天增强：注册新的提示词版本。 */
    await persistPromptRegistry(promptRegistry); /* 第53天增强：创建成功后写入本地 JSON 文件。 */
    return apiJsonSuccess(await getPromptDashboardSnapshot(), "prompt created"); /* 第52天增强：创建成功后返回最新快照。 */
  } catch (error) { /* 第52天增强：处理创建失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt create failed"); /* 第52天增强：返回统一内部错误响应。 */
  } /* 第52天增强：结束创建异常处理。 */
} /* 第52天增强：结束 POST /api/prompts 接口。 */

export async function PUT(request: Request) { /* 第52天增强：定义 PUT /api/prompts 编辑已有提示词版本接口。 */
  try { /* 第52天增强：捕获请求解析、校验和注册表覆盖异常。 */
    await hydratePromptRegistry(promptRegistry); /* 第53天增强：编辑前恢复本地版本，确保能找到用户之前保存的 Prompt。 */
    const body = await request.json(); /* 第52天增强：读取 JSON 请求体。 */
    if (!isPromptMutationInput(body)) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要完整 PromptMutationInput 请求体"); /* 第52天增强：缺少必要字段时返回 400。 */
    const existing = promptRegistry.getVersion(body.componentId.trim(), body.version.trim()); /* 第52天增强：读取待编辑的已有版本。 */
    if (!existing) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, `无法编辑不存在的 Prompt：${body.componentId}.${body.version}`); /* 第52天增强：编辑接口禁止误创建。 */
    const validationMessage = invalidPromptMessage(body); /* 第52天增强：执行模板变量契约校验。 */
    if (validationMessage) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, validationMessage); /* 第52天增强：校验失败时禁止保存。 */
    promptRegistry.upsert(buildPromptTemplateFromInput(body, existing)); /* 第52天增强：覆盖保存已有提示词版本。 */
    await persistPromptRegistry(promptRegistry); /* 第53天增强：编辑成功后写入本地 JSON 文件。 */
    return apiJsonSuccess(await getPromptDashboardSnapshot(), "prompt updated"); /* 第52天增强：编辑成功后返回最新快照。 */
  } catch (error) { /* 第52天增强：处理编辑失败。 */
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Prompt update failed"); /* 第52天增强：返回统一内部错误响应。 */
  } /* 第52天增强：结束编辑异常处理。 */
} /* 第52天增强：结束 PUT /api/prompts 接口。 */

