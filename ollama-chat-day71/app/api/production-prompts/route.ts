import { API_REASON, apiJsonReasonError, apiJsonSuccess } from "@/lib/api/api-envelope"; // 第67天：引入项目统一 API 成功和错误响应工具。
import { productionPromptPlatform, type ProductionPromptAction } from "@/lib/prompts/production-prompt-platform"; // 第67天：引入进程级生产提示词平台和生命周期动作类型。

type ActionBody = { action?: ProductionPromptAction; agentId?: string; version?: string }; // 第67天：定义 Prompt Explorer V2 生命周期动作请求体。
type CompareBody = { leftId?: string; rightId?: string }; // 第67天：定义生产提示词版本比较请求体。

function isAction(value: unknown): value is ProductionPromptAction { // 第67天：定义生产提示词生命周期动作类型守卫。
  return value === "approve" || value === "promote" || value === "rollback" || value === "archive"; // 第67天：只允许控制台声明的四种生产操作。
} // 第67天：结束生产提示词生命周期动作类型守卫。

export async function GET() { // 第67天：定义读取生产提示词平台完整快照的 Route Handler。
  try { // 第67天：捕获注册、运行、实验和快照生成异常。
    return apiJsonSuccess(productionPromptPlatform.getSnapshot()); // 第67天：返回版本、块、策略、评分、用量、状态、实验和审计信息。
  } catch (error) { // 第67天：处理生产提示词平台快照生成失败。
    return apiJsonReasonError(API_REASON.INTERNAL, error instanceof Error ? error.message : "Production Prompt Platform snapshot failed"); // 第67天：返回不暴露堆栈的统一内部错误响应。
  } // 第67天：结束生产提示词平台快照异常处理。
} // 第67天：结束生产提示词平台 GET 接口。

export async function PATCH(request: Request) { // 第67天：定义批准、晋级、回滚和归档生产提示词的 Route Handler。
  try { // 第67天：捕获请求解析、生命周期校验和质量门禁异常。
    const body = await request.json() as ActionBody; // 第67天：读取生产提示词生命周期动作 JSON 请求体。
    if (!isAction(body.action) || !body.agentId || !body.version) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要 action、agentId 与 version"); // 第67天：校验生命周期动作必要参数。
    return apiJsonSuccess(productionPromptPlatform.performAction(body.action, body.agentId, body.version), `production prompt ${body.action} completed`); // 第67天：执行动作并返回最新 Prompt Explorer V2 快照。
  } catch (error) { // 第67天：处理质量门禁失败或非法生命周期跳转。
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Prompt action failed"); // 第67天：把可解释阻断原因返回给运营控制台。
  } // 第67天：结束生产提示词生命周期动作异常处理。
} // 第67天：结束生产提示词生命周期 PATCH 接口。

export async function POST(request: Request) { // 第67天：定义生产提示词版本比较 Route Handler。
  try { // 第67天：捕获比较请求解析和版本查找异常。
    const body = await request.json() as CompareBody; // 第67天：读取左右提示词版本标识。
    if (!body.leftId || !body.rightId) return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, "需要 leftId 与 rightId"); // 第67天：校验版本比较必要参数。
    return apiJsonSuccess(productionPromptPlatform.compare(body.leftId, body.rightId)); // 第67天：返回新增块、移除块和策略变化比较结果。
  } catch (error) { // 第67天：处理目标版本不存在等比较异常。
    return apiJsonReasonError(API_REASON.WORKFLOW_JSON_INVALID, error instanceof Error ? error.message : "Production Prompt compare failed"); // 第67天：返回统一且可读的版本比较错误响应。
  } // 第67天：结束生产提示词版本比较异常处理。
} // 第67天：结束生产提示词版本比较 POST 接口。
