import { runtimeContextBuilder, type RuntimeContextRequest, type RuntimeContextV2 } from "@/lib/runtime/unified-runtime-context"; // 第64天：引入统一上下文构建能力。

export type ContextMiddleware = (context: RuntimeContextV2) => Promise<RuntimeContextV2> | RuntimeContextV2; // 第64天：定义上下文中间件函数签名。

export async function runContextMiddleware(request: RuntimeContextRequest, middleware: ContextMiddleware[] = []): Promise<RuntimeContextV2> { // 第64天：按顺序执行认证、追踪、记忆等上下文中间件。
  let context = runtimeContextBuilder.build(request); // 第64天：先构建具备基础标识的统一上下文。
  for (const enhance of middleware) context = await enhance(context); // 第64天：顺序合并每个中间件补充的信息。
  return context; // 第64天：返回业务运行时使用的最终上下文。
} // 第64天：结束中间件执行函数。

export const authContextMiddleware: ContextMiddleware = (context) => ({ ...context, userId: context.userId ?? "anonymous", metadata: { ...context.metadata, authenticated: Boolean(context.userId) } }); // 第64天：补齐用户身份并记录认证状态。
export const traceContextMiddleware: ContextMiddleware = (context) => ({ ...context, metadata: { ...context.metadata, traceReady: true } }); // 第64天：标记追踪链路已经准备完成。
export const memoryContextMiddleware: ContextMiddleware = (context) => ({ ...context, memoryContext: { source: "unified-runtime", ...context.memoryContext } }); // 第64天：为记忆模块补充统一来源信息。
