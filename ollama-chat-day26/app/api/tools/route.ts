/**
 * GET /api/tools — 列出 Tool Registry（含 capabilities / dependencies / metrics，供 Tool Explorer）。
 */
import { apiJsonSuccess } from "@/lib/api-envelope"; // 统一 Envelope
import { toolToDescriptor } from "@/lib/tool-registry"; // 描述符转换
import { workflowToolRegistry } from "@/lib/workflow-tools"; // 全局注册表

export async function GET() {
  const tools = workflowToolRegistry
    .list()
    .map((t) => toolToDescriptor(t, workflowToolRegistry)); // 第23天：附带 metrics
  return apiJsonSuccess({ tools, metrics: workflowToolRegistry.getAllMetrics() }); // 工具 + 全量指标
}
