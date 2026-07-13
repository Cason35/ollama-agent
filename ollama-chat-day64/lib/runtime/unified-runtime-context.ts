import { randomUUID } from "node:crypto"; // 第64天：引入 UUID 生成器，为请求、会话和追踪生成唯一标识。

export type RuntimeContextV2 = { // 第64天：定义统一运行时上下文第二版，供所有运行模块共享。
  requestId: string; // 第64天：标识一次完整请求。
  userId?: string; // 第64天：标识发起请求的用户。
  sessionId: string; // 第64天：串联同一用户的多轮会话。
  workflowId?: string; // 第64天：关联当前工作流。
  agentId?: string; // 第64天：关联当前智能体。
  taskId?: string; // 第64天：关联当前任务。
  memoryContext?: Record<string, unknown>; // 第64天：保存记忆模块共享信息。
  retrievalContext?: Record<string, unknown>; // 第64天：保存 RAG 检索共享信息。
  workspace?: Record<string, unknown>; // 第64天：保存共享工作区信息。
  promptContext?: Record<string, unknown>; // 第64天：保存提示词策略与版本信息。
  modelContext?: Record<string, unknown>; // 第64天：保存模型选择与密钥引用，禁止保存密钥明文。
  traceId: string; // 第64天：串联整条调用链的追踪标识。
  usageContext?: Record<string, unknown>; // 第64天：保存令牌、耗时和成本统计信息。
  evaluationContext?: Record<string, unknown>; // 第64天：保存评估结果与链路关联信息。
  metadata: Record<string, unknown>; // 第64天：保存可安全展示的扩展元数据。
  createdAt: number; // 第64天：记录上下文创建时间。
}; // 第64天：结束统一运行时上下文类型定义。

export type RuntimeContextRequest = Partial<Omit<RuntimeContextV2, "requestId" | "traceId" | "sessionId" | "metadata" | "createdAt">> & { // 第64天：定义构建器可接收的请求信息。
  requestId?: string; // 第64天：允许上游网关透传请求标识。
  traceId?: string; // 第64天：允许上游链路透传追踪标识。
  sessionId?: string; // 第64天：允许客户端复用已有会话标识。
  metadata?: Record<string, unknown>; // 第64天：允许业务补充非敏感元数据。
}; // 第64天：结束构建请求类型定义。

export class RuntimeContextBuilder { // 第64天：实现统一运行时上下文构建器。
  build(request: RuntimeContextRequest = {}): RuntimeContextV2 { // 第64天：统一补齐请求、追踪、会话和各模块上下文。
    return { // 第64天：返回一份可沿全链路共享的上下文对象。
      requestId: request.requestId?.trim() || `req_${randomUUID()}`, // 第64天：优先复用请求标识，否则生成新标识。
      userId: request.userId, // 第64天：透传可选用户标识。
      sessionId: request.sessionId?.trim() || `session_${randomUUID()}`, // 第64天：优先复用会话标识，否则生成新会话。
      workflowId: request.workflowId, // 第64天：透传可选工作流标识。
      agentId: request.agentId, // 第64天：透传可选智能体标识。
      taskId: request.taskId, // 第64天：透传可选任务标识。
      memoryContext: request.memoryContext ?? {}, // 第64天：确保记忆上下文始终可被模块安全读取。
      retrievalContext: request.retrievalContext ?? {}, // 第64天：确保检索上下文始终可被模块安全读取。
      workspace: request.workspace ?? {}, // 第64天：确保工作区上下文始终可被模块安全读取。
      promptContext: request.promptContext ?? {}, // 第64天：确保提示词上下文始终可被模块安全读取。
      modelContext: request.modelContext ?? { secretRef: "XIAOMI_MIMO_API_KEY" }, // 第64天：只保存密钥引用，不保存真实密钥。
      traceId: request.traceId?.trim() || `trace_${randomUUID()}`, // 第64天：优先复用追踪标识，否则生成新标识。
      usageContext: request.usageContext ?? { promptTokens: 0, completionTokens: 0, cost: 0 }, // 第64天：初始化统一用量统计。
      evaluationContext: request.evaluationContext ?? {}, // 第64天：初始化评估链路上下文。
      metadata: request.metadata ?? {}, // 第64天：透传可安全展示的元数据。
      createdAt: Date.now(), // 第64天：记录构建时间。
    }; // 第64天：结束上下文对象组装。
  } // 第64天：结束构建方法。
} // 第64天：结束构建器定义。

export const runtimeContextBuilder = new RuntimeContextBuilder(); // 第64天：导出共享构建器实例。
