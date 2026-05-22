/**
 * GET /api/tools — 列出 Tool Registry 中已注册工具（供 Tool Explorer）。
 */
import { apiJsonSuccess } from "@/lib/api-envelope";
import { toolToDescriptor } from "@/lib/tool-registry";
import { workflowToolRegistry } from "@/lib/workflow-tools";

export async function GET() {
  const tools = workflowToolRegistry.list().map(toolToDescriptor);
  return apiJsonSuccess(tools);
}
