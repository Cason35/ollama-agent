import { estimateTokenCount } from "@/lib/usage/token-accounting"; /* 第47天：引入工具输入输出词元估算函数。 */
import { usageManager, type UsageManager } from "@/lib/usage/usage-manager"; /* 第47天：引入共享用量管理器及可注入类型。 */

export type ToolUsageContext = { /* 第47天：定义工具运行时接收的追踪上下文。 */
  traceId: string; /* 第47天：保存工具所属完整任务的 Trace 标识。 */
  spanId: string; /* 第47天：保存工具调用对应的 Span 标识。 */
  toolId: string; /* 第47天：保存工具稳定标识。 */
  input: string; /* 第47天：保存可用于词元核算的工具输入摘要。 */
}; /* 第47天：结束工具用量上下文类型定义。 */

export class ToolUsageRuntime { /* 第47天：定义把任意工具调用接入统一 Usage 的包装运行时。 */
  constructor(private readonly manager: UsageManager = usageManager) {} /* 第47天：默认使用共享管理器并支持测试依赖注入。 */

  async execute<T>(context: ToolUsageContext, operation: () => Promise<T> | T): Promise<T> { /* 第47天：定义执行工具并自动记录用量的方法。 */
    const startedAt = Date.now(); /* 第47天：记录工具调用开始时间。 */
    const output = await operation(); /* 第47天：执行实际工具逻辑并等待结果。 */
    const outputText = typeof output === "string" ? output : JSON.stringify(output); /* 第47天：把结构化结果转换为可估算词元的文本。 */
    this.manager.addRecord({ traceId: context.traceId, spanId: context.spanId, componentType: "tool", componentId: context.toolId, inputTokens: estimateTokenCount(context.input), outputTokens: estimateTokenCount(outputText), durationMs: Math.max(1, Date.now() - startedAt) }); /* 第47天：把工具词元、费用、耗时与 Trace/Span 关联写入。 */
    return output; /* 第47天：保持工具原始返回值，不改变业务语义。 */
  } /* 第47天：结束工具执行与用量记录方法。 */
} /* 第47天：结束 ToolUsageRuntime（工具用量运行时）类定义。 */
