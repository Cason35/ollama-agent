/** Workflow 结构化日志。 */
export function logWorkflow(
  event: "start" | "step" | "done" | "error",
  payload: Record<string, unknown>
) {
  console.log(`[Workflow] ${event}`, payload);
}
