/**
 * 统一 API 响应包：HTTP 状态 + { ok, code, data, msg }。
 * code / msg 集中定义，便于查表对照错误原因。
 */

import { NextResponse } from "next/server";

/** body.code 与 HTTP 状态对齐的数值（查表主键）。 */
export const API_CODE = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const;

export type ApiCode = (typeof API_CODE)[keyof typeof API_CODE];

/** 各 code 的默认 msg（可被调用方覆盖）。 */
export const API_MSG: Record<ApiCode, string> = {
  [API_CODE.OK]: "success",
  [API_CODE.BAD_REQUEST]: "bad request",
  [API_CODE.NOT_FOUND]: "not found",
  [API_CODE.BAD_GATEWAY]: "bad gateway",
  [API_CODE.SERVICE_UNAVAILABLE]: "service unavailable",
  [API_CODE.INTERNAL]: "internal server error",
};

/**
 * 业务场景 → 推荐 code + msg（路由里直接展开使用）。
 * 注释说明 HTTP 与 data 约定。
 */
export const API_REASON = {
  /** GET 单条命中 */
  GET_HIT: { http: API_CODE.OK, code: API_CODE.OK, msg: API_MSG[API_CODE.OK] },
  /** GET 单条无记录：HTTP 200，ok true，data null */
  GET_MISS: { http: API_CODE.OK, code: API_CODE.OK, msg: API_MSG[API_CODE.NOT_FOUND] },
  /** GET 列表 / POST 保存 / purge 等成功 */
  SUCCESS: { http: API_CODE.OK, code: API_CODE.OK, msg: API_MSG[API_CODE.OK] },
  /** DELETE 目标不存在（幂等，仍 200） */
  DELETE_MISS: { http: API_CODE.OK, code: API_CODE.OK, msg: API_MSG[API_CODE.NOT_FOUND] },

  MESSAGES_REQUIRED: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "messages is required",
  },
  CONFIRM_PARAMS_INVALID: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "需要 workflowId、stepId 与 decision（confirm|cancel）",
  },
  STEP_NOT_FOUND: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "步骤不存在",
  },
  WORKFLOW_JSON_INVALID: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "请求体必须是 JSON",
  },
  WORKFLOW_ID_MISSING: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "缺少 workflowId",
  },
  WORKFLOW_VERSION_UNSUPPORTED: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "不支持的 version",
  },
  MIMO_MODEL_INVALID: {
    http: API_CODE.BAD_REQUEST,
    code: API_CODE.BAD_REQUEST,
    msg: "无效的 mimo 模型",
  },
  MIMO_KEY_MISSING: {
    http: API_CODE.SERVICE_UNAVAILABLE,
    code: API_CODE.SERVICE_UNAVAILABLE,
    msg: "未配置环境变量 XIAOMI_MIMO_API_KEY",
  },
  PAUSE_CONTEXT_NOT_FOUND: {
    http: API_CODE.OK,
    code: API_CODE.NOT_FOUND,
    msg: "未找到暂停的工作流；若刚刷新页面，请确认已勾选 Workflow 且本地快照存在",
  },
  MODEL_UPSTREAM_FAILED: {
    http: API_CODE.BAD_GATEWAY,
    code: API_CODE.BAD_GATEWAY,
    msg: "模型请求失败",
  },
  DB_QUERY_FAILED: {
    http: API_CODE.INTERNAL,
    code: API_CODE.INTERNAL,
    msg: "数据库查询失败",
  },
  DB_SAVE_FAILED: {
    http: API_CODE.INTERNAL,
    code: API_CODE.INTERNAL,
    msg: "数据库保存失败",
  },
  DB_DELETE_FAILED: {
    http: API_CODE.INTERNAL,
    code: API_CODE.INTERNAL,
    msg: "数据库删除失败",
  },
  DB_PURGE_FAILED: {
    http: API_CODE.INTERNAL,
    code: API_CODE.INTERNAL,
    msg: "数据库清理失败",
  },
  INTERNAL: {
    http: API_CODE.INTERNAL,
    code: API_CODE.INTERNAL,
    msg: API_MSG[API_CODE.INTERNAL],
  },
} as const;

/** 统一响应体形状。 */
export type ApiEnvelope<T> = {
  ok: boolean;
  code: number;
  data: T | null;
  msg: string;
};

function envelope<T>(
  ok: boolean,
  code: number,
  data: T | null,
  msg: string
): ApiEnvelope<T> {
  return { ok, code, data, msg };
}

/** 成功：HTTP 200，ok true，带 data。 */
export function apiJsonSuccess<T>(
  data: T,
  msg: string = API_MSG[API_CODE.OK]
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    envelope(true, API_CODE.OK, data, msg),
    { status: API_CODE.OK }
  );
}

/** GET 单条未命中：HTTP 200，ok true，data null，msg not found。 */
export function apiJsonGetMiss(): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(
    envelope(true, API_CODE.OK, null, API_MSG[API_CODE.NOT_FOUND]),
    { status: API_CODE.OK }
  );
}

/** 失败：HTTP 与 body.code 一致，ok false，data null。 */
export function apiJsonError(
  httpStatus: number,
  code: number,
  msg: string
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(envelope(false, code, null, msg), { status: httpStatus });
}

/** 业务失败但 HTTP 仍为 200（如 confirm 找不到暂停上下文）。 */
export function apiJsonFailOk(
  code: number,
  msg: string
): NextResponse<ApiEnvelope<null>> {
  return NextResponse.json(envelope(false, code, null, msg), { status: API_CODE.OK });
}

/** 按 API_REASON 返回错误包。 */
export function apiJsonReasonError(
  reason: { http: number; code: number; msg: string },
  msgOverride?: string
): NextResponse<ApiEnvelope<null>> {
  return apiJsonError(reason.http, reason.code, msgOverride ?? reason.msg);
}

/** 客户端：解析 envelope，失败抛错。 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly httpStatus: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** 读取 JSON 包；要求 HTTP 成功且 ok true 且 data 非 null。 */
export async function readApiData<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.ok || body.data === null) {
    throw new ApiClientError(
      body.msg || API_MSG[API_CODE.INTERNAL],
      body.code,
      res.status
    );
  }
  return body.data;
}

/** GET 单条：data 为 null 时返回 null，不抛错。 */
export async function readApiDataOrNull<T>(res: Response): Promise<T | null> {
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok) {
    throw new ApiClientError(
      body.msg || API_MSG[API_CODE.INTERNAL],
      body.code,
      res.status
    );
  }
  if (!body.ok) {
    throw new ApiClientError(body.msg, body.code, res.status);
  }
  return body.data;
}

/** 仅判断成功与否（如 DELETE / purge），不取 data。 */
export async function assertApiOk(res: Response): Promise<void> {
  const body = (await res.json()) as ApiEnvelope<unknown>;
  if (!res.ok || !body.ok) {
    throw new ApiClientError(
      body.msg || API_MSG[API_CODE.INTERNAL],
      body.code,
      res.status
    );
  }
}
