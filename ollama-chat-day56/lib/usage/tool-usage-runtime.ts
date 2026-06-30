import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第47天：引入工具输入输出词元估算函数。 */
import { usageManager, type UsageManager } from "@/lib/usage/usage-manager"; /* 第47天：引入共享用量管理器及可注入类型。 */
import { ModelRouter, modelRouter } from "@/lib/model/model-router"; /* 第50天：引入模型路由器，让工具调用也按任务选择模型。 */
import type { ModelRoutingInput } from "@/lib/model/model-profile-types"; /* 第50天：引入模型路由输入类型。 */

export type ToolUsageContext = { /* 第47天：定义工具运行时接收的追踪上下文。 */
  traceId: string; /* 第47天：保存工具所属完整任务的 Trace 标识。 */
  spanId: string; /* 第47天：保存工具调用对应的 Span 标识。 */
  toolId: string; /* 第47天：保存工具稳定标识。 */
  input: string; /* 第47天：保存可用于词元核算的工具输入摘要。 */
  routing?: ModelRoutingInput; /* 第50天：可选指定工具的模型路由输入，缺省按工具名自动推导。 */
}; /* 第47天：结束工具用量上下文类型定义。 */

export class ToolUsageRuntime { /* 第47天：定义把任意工具调用接入统一 Usage 的包装运行时。 */
  constructor(private readonly manager: UsageManager = usageManager, private readonly router: ModelRouter = modelRouter) {} /* 第50天：在第47天基础上注入模型路由器，默认复用共享路由器。 */

  async execute<T>(context: ToolUsageContext, operation: () => Promise<T> | T): Promise<T> { /* 第47天：定义执行工具并自动记录用量的方法。 */
    const startedAt = Date.now(); /* 第47天：记录工具调用开始时间。 */
    const output = await operation(); /* 第47天：执行实际工具逻辑并等待结果。 */
    const outputText = typeof output === "string" ? output : JSON.stringify(output); /* 第47天：把结构化结果转换为可估算词元的文本。 */
    const model = this.router.route(context.routing ?? this.inferRouting(context.toolId)); /* 第50天：为当前工具路由出最合适的模型。 */
    this.manager.addRecord({ traceId: context.traceId, spanId: context.spanId, componentType: "tool", componentId: context.toolId, inputTokens: estimateTokenCount(context.input), outputTokens: estimateTokenCount(outputText), durationMs: Math.max(1, Date.now() - startedAt), modelId: model.id, provider: model.provider, modelName: model.model }); /* 第50天：把工具词元、费用、耗时与路由出的模型信息一并写入用量记录。 */
    return output; /* 第47天：保持工具原始返回值，不改变业务语义。 */
  } /* 第47天：结束工具执行与用量记录方法。 */

  private inferRouting(toolId: string): ModelRoutingInput { /* 第50天：定义在未显式指定时按工具名推导模型路由输入的方法。 */
    if (/retrieval|rag|embed/i.test(toolId)) return { taskType: "embedding" }; /* 第50天：检索与嵌入类工具路由到嵌入模型。 */
    if (/rewrite|json|structur/i.test(toolId)) return { taskType: "json", requiresJson: true }; /* 第50天：查询改写与结构化工具路由到 JSON 模型。 */
    if (/summary|summar/i.test(toolId)) return { taskType: "summary", complexity: "low" }; /* 第50天：总结类工具路由到小型对话模型。 */
    return { taskType: "chat", complexity: "medium" }; /* 第50天：其余工具默认按对话任务路由。 */
  } /* 第50天：结束工具路由输入推导方法。 */
} /* 第47天：结束 ToolUsageRuntime（工具用量运行时）类定义。 */
