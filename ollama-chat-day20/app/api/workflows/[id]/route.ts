/**
 * 第20天：单条 Workflow API — GET / DELETE（任务 5）。
 * 每行带中文行尾注释。
 */

import { NextResponse } from "next/server"; // Next 响应
import { dbDeleteWorkflow, dbGetWorkflow } from "@/lib/workflow-db"; // 内存 Map

type RouteContext = { params: Promise<{ id: string }> }; // Next 16 动态路由 params 为 Promise

/** GET /api/workflows/:id — 读取单条。 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params; // 解析 workflowId
  const state = dbGetWorkflow(id); // Map 查找
  if (!state) {
    return NextResponse.json({ error: "workflow 不存在" }, { status: 404 }); // 404
  } // 无记录
  return NextResponse.json(state); // 返回快照
} // GET 结束

/** DELETE /api/workflows/:id — 删除单条。 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params; // 解析 id
  const existed = dbDeleteWorkflow(id); // 删除
  if (!existed) {
    return NextResponse.json({ error: "workflow 不存在" }, { status: 404 }); // 404
  } // 无记录
  return NextResponse.json({ ok: true, workflowId: id }); // 成功
} // DELETE 结束
